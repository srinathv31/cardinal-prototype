// Tests for lib/agents/servicing/script.ts's createServicingScript — the
// DEMO_MODE=scripted state machine that stands in for a live model. Two
// concerns:
//  (a) first-pass keyword matching produces the right tool call for each
//      rehearsed beat (brief §7b/§7c, DEMO_THESIS.md Use cases 2 and 3),
//      including the two Wave 2 Agent E additions: "next statement" and
//      card activation.
//  (b) second-pass narration is grounded in the tool's own recorded result
//      — read back from the prompt's tool-result content exactly as the SDK
//      would replay it (docs/ai-sdk7-notes.md's "denied tools" note), never
//      re-derived via a second side-effecting call (which would double the
//      Event Log write for activateCard).
//
// Prompts are hand-built LanguageModelV4Prompt fixtures — the same shape
// lib/ai/scripted/scripted-model.test.ts's stubScript/EMPTY_CALL_OPTIONS
// pattern uses one level up (that file exercises the model wrapper; this
// one exercises the script directly, which is new coverage — no
// script.test.ts existed anywhere in this codebase before Wave 2 Agent E).

import { beforeEach, describe, expect, it } from 'vitest';
import type { LanguageModelV4Message, LanguageModelV4Prompt, LanguageModelV4ToolResultOutput } from '@ai-sdk/provider';
import { resetSoeState } from '@/lib/soe';
import { identityForPersona } from './identity';
import { createServicingResolvers } from './resolvers';
import { createServicingScript } from './script';

function userMessage(text: string): LanguageModelV4Message {
  return { role: 'user', content: [{ type: 'text', text }] };
}

function toolResultMessage(toolName: string, output: LanguageModelV4ToolResultOutput): LanguageModelV4Message {
  return { role: 'tool', content: [{ type: 'tool-result', toolCallId: 'call-1', toolName, output }] };
}

function happyScript() {
  const identity = identityForPersona('happy');
  return createServicingScript({ identity, persona: 'happy', resolvers: createServicingResolvers(identity) });
}

function blockedScript() {
  const identity = identityForPersona('blocked');
  return createServicingScript({ identity, persona: 'blocked', resolvers: createServicingResolvers(identity) });
}

beforeEach(() => {
  resetSoeState();
});

describe('createServicingScript — first-pass keyword matching', () => {
  it('"What is my next statement?" calls renderEvidence with servicing-next-statement', async () => {
    const step = await happyScript().nextStep([userMessage('What is my next statement?')]);
    expect(step.done).toBe(false);
    expect(step.toolCalls).toEqual([
      { toolName: 'renderEvidence', input: { component: 'MetricRow', source: { kind: 'servicing-next-statement' } } },
    ]);
  });

  it('"When is my next payment due?" still calls renderEvidence with servicing-next-payment (no regression)', async () => {
    const step = await happyScript().nextStep([userMessage('When is my next payment due?')]);
    expect(step.toolCalls).toEqual([
      { toolName: 'renderEvidence', input: { component: 'MetricRow', source: { kind: 'servicing-next-payment' } } },
    ]);
  });

  it('"I just got my card, I\'m here to activate it." calls activateCard', async () => {
    const step = await happyScript().nextStep([
      userMessage("I just got my card, I'm here to activate it."),
    ]);
    expect(step.done).toBe(false);
    expect(step.toolCalls).toHaveLength(1);
    expect(step.toolCalls[0].toolName).toBe('activateCard');
    expect(step.toolCalls[0].input).toMatchObject({ rationale: expect.any(String) });
  });

  it('an unrecognized question closes immediately with the "can\'t help" narration', async () => {
    const step = await happyScript().nextStep([userMessage('What is the meaning of life?')]);
    expect(step.done).toBe(true);
    expect(step.toolCalls).toEqual([]);
    expect(step.narration).toContain('next statement');
  });
});

describe('createServicingScript — next-statement second pass', () => {
  it('happy persona: narrates the real statement balance and due date', async () => {
    const script = happyScript();
    const prompt: LanguageModelV4Prompt = [
      userMessage('What is my next statement?'),
      toolResultMessage('renderEvidence', { type: 'json', value: { component: 'MetricRow', props: {} } }),
    ];
    const step = await script.nextStep(prompt);
    expect(step.done).toBe(true);
    expect(step.toolCalls).toEqual([]);
    expect(step.narration).toMatch(/Your next statement is \$[\d,.]+, due /);
  });

  it('blocked persona: degrades honestly — Marcus has no SCHEDULED statement', async () => {
    const script = blockedScript();
    const prompt: LanguageModelV4Prompt = [
      userMessage('What is my next statement?'),
      toolResultMessage('renderEvidence', { type: 'json', value: { component: 'MetricRow', props: {} } }),
    ];
    const step = await script.nextStep(prompt);
    expect(step.done).toBe(true);
    expect(step.narration).toBe('That covers your next statement.');
  });
});

describe('createServicingScript — card activation second pass (DEMO_THESIS.md Use case 3)', () => {
  it('happy persona, approved+activated: narrates the confirmationId from the tool\'s own result', async () => {
    const script = happyScript();
    const prompt: LanguageModelV4Prompt = [
      userMessage("I just got my card, I'm here to activate it."),
      toolResultMessage('activateCard', { type: 'json', value: { status: 'activated', confirmationId: 'act-card-happy-20260805' } }),
    ];
    const step = await script.nextStep(prompt);
    expect(step.done).toBe(true);
    expect(step.toolCalls).toEqual([]);
    expect(step.narration).toContain('activated');
    expect(step.narration).toContain('act-card-happy-20260805');
  });

  it('blocked persona, approved+blocked: narrates the account is failing a policy, with the real finding', async () => {
    const script = blockedScript();
    const finding = 'Payment missed Jul 24, 2026 · account past-due at activation Aug 5, 2026';
    const prompt: LanguageModelV4Prompt = [
      userMessage("I just got my card, I'm here to activate it."),
      toolResultMessage('activateCard', { type: 'json', value: { status: 'blocked', ruleId: 'CA-R1', finding } }),
    ];
    const step = await script.nextStep(prompt);
    expect(step.done).toBe(true);
    expect(step.narration).toContain('failing a policy');
    expect(step.narration).toContain(finding);
    // Never a hand-typed rewrite of the finding — the exact string comes
    // through verbatim from the tool's own output.
    expect(step.narration).toContain('past-due');
  });

  it('declined: executes nothing further and narrates the decline, regardless of persona', async () => {
    const script = happyScript();
    const prompt: LanguageModelV4Prompt = [
      userMessage("I just got my card, I'm here to activate it."),
      toolResultMessage('activateCard', { type: 'execution-denied' }),
    ];
    const step = await script.nextStep(prompt);
    expect(step.done).toBe(true);
    expect(step.toolCalls).toEqual([]);
    expect(step.narration).toBe('No problem — I did not activate the card.');
  });
});

describe('createServicingScript — contact-change second pass (regression)', () => {
  it('approved: narrates the phone number extracted from the customer\'s own message', async () => {
    const script = happyScript();
    const prompt: LanguageModelV4Prompt = [
      userMessage('Please update my phone number to 512-555-0199.'),
      toolResultMessage('updateContactInfo', { type: 'json', value: { status: 'updated', confirmationId: 'ctc-party-anand-phone' } }),
    ];
    const step = await script.nextStep(prompt);
    expect(step.done).toBe(true);
    expect(step.narration).toContain('512-555-0199');
  });

  it('denied: narrates no change was made', async () => {
    const script = happyScript();
    const prompt: LanguageModelV4Prompt = [
      userMessage('Please update my phone number to 512-555-0199.'),
      toolResultMessage('updateContactInfo', { type: 'execution-denied' }),
    ];
    const step = await script.nextStep(prompt);
    expect(step.done).toBe(true);
    expect(step.narration).toContain('did not make that change');
  });
});
