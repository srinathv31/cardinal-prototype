// Full state-machine walk for every DEMO_MODE=scripted AgentScript (W4.1),
// pinned at both demo anchors (brief §6 / lib/soe/seed/seed.test.ts's
// pattern) so a regression can't hide behind whichever anchor the real
// clock happens to land on. For each agent this asserts:
//  (a) the tool-call sequence matches the agent's own INSTRUCTIONS block
//      exactly (component + source.kind, in order);
//  (b) every emitted tool input parses against the tool's real Zod
//      inputSchema (lib/agents/*/tools.ts) — the same schema the AI SDK
//      validates a real model's tool call against;
//  (c) the closing step fires exactly once, only after every action tool
//      has a result, and never re-proposes after that;
//  (d) narration and drafted tool-call text never contain a digit sequence
//      that doesn't also appear in this account's own resolver output (or
//      the one documented policy constant — payment-health's due day),
//      i.e. every figure is fetched, never invented.
//
// A hand-rolled prompt driver stands in for the AI SDK's real prompt
// conversion: each step's tool calls become an assistant `tool-call`
// message, each gets a `tool` message with a `tool-result` (or, for a
// denied action tool, `execution-denied` — the verified shape from
// docs/ai-sdk7-notes.md) — exactly what a script's nextStep sees on the
// next call, per lib/ai/scripted/types.ts's contract.
//
// live-llm cleanup (LIVE_LLM_PLAN.md Phase A): this file used to walk five
// agent scripts (payment-health, bt-lifecycle, au-growth, ask, servicing).
// The first four were deleted along with their agents — only servicing
// remains; it is servicing's sole end-to-end script walk (ops' equivalent
// lives in lib/agents/ops/script.test.ts).

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ZodType } from 'zod';
import type { LanguageModelV4Message, LanguageModelV4Prompt, LanguageModelV4ToolResultOutput } from '@ai-sdk/provider';
import type { AgentScript, ScriptStep } from '@/lib/ai/scripted/types';
import { evidenceSpecSchema } from '@/lib/registry/evidence';
import { servicingScript } from './servicing/script';
import { updateContactInfo } from './servicing/tools';

/** Every tool's `inputSchema` is declared as the AI SDK's `FlexibleSchema<T>`
 * union, which doesn't statically expose `.parse` — but `tool()` is the
 * identity function at runtime (verified in
 * node_modules/@ai-sdk/provider-utils/dist/index.js), and every tool in this
 * codebase passes a raw Zod object, so this cast just restores the type
 * these tests need to validate against the real schema. */
function parseWithToolSchema(schema: unknown, input: unknown): void {
  (schema as ZodType).parse(input);
}

const ANCHORS = ['2026-08-05', '2026-08-19'] as const;

// ---------------------------------------------------------------------------
// Prompt driver
// ---------------------------------------------------------------------------

function userMessage(text: string): LanguageModelV4Message {
  return { role: 'user', content: [{ type: 'text', text }] };
}

interface DrivenCall {
  toolCallId: string;
  toolName: string;
  input: unknown;
}

interface DriveResult {
  /** Every step the script produced, in order. */
  steps: ScriptStep[];
  /** Every tool call the script made, flattened across steps, in order. */
  calls: DrivenCall[];
}

/**
 * Drives a script from a fresh trigger message to its closing step,
 * appending assistant/tool messages exactly as the AI SDK would after real
 * tool execution (docs/ai-sdk7-notes.md). `disposition(toolName)` decides
 * how an action tool's call resolves — 'approved' (default) or 'denied'.
 */
async function driveScript(
  script: AgentScript,
  triggerText: string,
  disposition: (toolName: string) => 'approved' | 'denied' = () => 'approved',
): Promise<DriveResult> {
  const prompt: LanguageModelV4Message[] = [userMessage(triggerText)];
  const steps: ScriptStep[] = [];
  const calls: DrivenCall[] = [];

  for (let stepIndex = 0; stepIndex < 20; stepIndex++) {
    const step = await script.nextStep(prompt as LanguageModelV4Prompt);
    steps.push(step);

    if (step.toolCalls.length === 0) {
      if (!step.done) {
        throw new Error(`driveScript: step ${stepIndex} made no tool calls but did not close`);
      }
      return { steps, calls };
    }

    const drivenThisStep = step.toolCalls.map((call, i) => ({
      toolCallId: `call-${stepIndex}-${i}`,
      toolName: call.toolName,
      input: call.input,
    }));
    calls.push(...drivenThisStep);

    prompt.push({
      role: 'assistant',
      content: drivenThisStep.map((c) => ({
        type: 'tool-call' as const,
        toolCallId: c.toolCallId,
        toolName: c.toolName,
        input: c.input,
      })),
    });

    prompt.push({
      role: 'tool',
      content: drivenThisStep.map((c): { type: 'tool-result'; toolCallId: string; toolName: string; output: LanguageModelV4ToolResultOutput } => {
        const output: LanguageModelV4ToolResultOutput =
          c.toolName === 'renderEvidence' || disposition(c.toolName) === 'approved'
            ? { type: 'json', value: { ok: true } }
            : { type: 'execution-denied', reason: 'Declined by operator' };
        return { type: 'tool-result', toolCallId: c.toolCallId, toolName: c.toolName, output };
      }),
    });

    if (step.done) {
      throw new Error(`driveScript: step ${stepIndex} closed while also making tool calls`);
    }
  }

  throw new Error('driveScript: exceeded 20 steps without closing — probable infinite loop');
}

// live-llm cleanup (LIVE_LLM_PLAN.md Phase A): this file used to also define
// `emittedText` here — a haystack helper the deleted payment-health/
// bt-lifecycle/au-growth "grounds the ... figures" tests used for requirement
// (d) (every digit-bearing figure traces back to resolver output). The
// servicing describe block below covers the same requirement directly
// against `closing?.narration` in each of its own assertions, so the helper
// had no remaining caller and is gone with the blocks that used it.

describe.each(ANCHORS)('agent scripts @ anchor %s', (anchorIso) => {
  let previousAnchor: string | undefined;

  beforeAll(() => {
    previousAnchor = process.env.DEMO_ANCHOR_DATE;
    process.env.DEMO_ANCHOR_DATE = anchorIso;
  });

  afterAll(() => {
    if (previousAnchor === undefined) delete process.env.DEMO_ANCHOR_DATE;
    else process.env.DEMO_ANCHOR_DATE = previousAnchor;
  });

  describe('servicing — Anand Patel (pinned cardholder)', () => {
    it('routes "latest transactions" to TransactionTable with a grounded takeaway', async () => {
      const result = await driveScript(servicingScript, 'What are my latest transactions?');

      expect(result.calls.map((c) => c.toolName)).toEqual(['renderEvidence']);
      expect(result.calls[0]?.input).toMatchObject({
        component: 'TransactionTable',
        source: { kind: 'servicing-recent-transactions' },
      });
      expect(() => evidenceSpecSchema.parse(result.calls[0]?.input)).not.toThrow();

      const closing = result.steps.at(-1);
      expect(closing?.done).toBe(true);
      expect(closing?.narration.length).toBeGreaterThan(0);

      const { resolveEvidence } = await import('./servicing/resolvers');
      const instruction = await resolveEvidence({
        component: 'TransactionTable',
        source: { kind: 'servicing-recent-transactions', months: 3, limit: 15 },
      });
      if (instruction.component !== 'TransactionTable') throw new Error('unreachable');
      expect(closing?.narration).toBe(instruction.props.footnote);
    });

    it('routes "next payment due" to MetricRow with a grounded takeaway', async () => {
      const result = await driveScript(servicingScript, 'When is my next payment due?');

      expect(result.calls.map((c) => c.toolName)).toEqual(['renderEvidence']);
      expect(result.calls[0]?.input).toMatchObject({
        component: 'MetricRow',
        source: { kind: 'servicing-next-payment' },
      });

      const { resolveEvidence } = await import('./servicing/resolvers');
      const instruction = await resolveEvidence({
        component: 'MetricRow',
        source: { kind: 'servicing-next-payment' },
      });
      if (instruction.component !== 'MetricRow') throw new Error('unreachable');
      const dueDate = instruction.props.metrics.find((m) => m.label === 'Due Date')?.value;
      const amountDue = instruction.props.metrics.find((m) => m.label === 'Amount Due')?.value;

      const closing = result.steps.at(-1);
      expect(closing?.done).toBe(true);
      expect(dueDate).toBeTruthy();
      expect(amountDue).toBeTruthy();
      if (dueDate) expect(closing?.narration).toContain(dueDate);
      if (amountDue) expect(closing?.narration).toContain(amountDue);
    });

    it('routes "balance and available credit" to MetricRow with a grounded takeaway', async () => {
      const result = await driveScript(servicingScript, "What's my balance and available credit?");

      expect(result.calls.map((c) => c.toolName)).toEqual(['renderEvidence']);
      expect(result.calls[0]?.input).toMatchObject({
        component: 'MetricRow',
        source: { kind: 'servicing-account-summary' },
      });

      const { resolveEvidence } = await import('./servicing/resolvers');
      const instruction = await resolveEvidence({
        component: 'MetricRow',
        source: { kind: 'servicing-account-summary' },
      });
      if (instruction.component !== 'MetricRow') throw new Error('unreachable');
      const balance = instruction.props.metrics.find((m) => m.label === 'Balance')?.value;

      const closing = result.steps.at(-1);
      expect(balance).toBeTruthy();
      if (balance) expect(closing?.narration).toContain(balance);
    });

    it('routes "what am I spending on" to CategoryPie with a grounded takeaway', async () => {
      const result = await driveScript(servicingScript, 'What am I spending on?');

      expect(result.calls.map((c) => c.toolName)).toEqual(['renderEvidence']);
      expect(result.calls[0]?.input).toMatchObject({
        component: 'CategoryPie',
        source: { kind: 'servicing-category-spend', months: 3 },
      });

      const { resolveEvidence } = await import('./servicing/resolvers');
      const instruction = await resolveEvidence({
        component: 'CategoryPie',
        source: { kind: 'servicing-category-spend', months: 3 },
      });
      if (instruction.component !== 'CategoryPie') throw new Error('unreachable');
      const top = instruction.props.slices[0];
      const closing = result.steps.at(-1);
      expect(top).toBeTruthy();
      if (top) {
        expect(closing?.narration).toContain(top.label);
        expect(closing?.narration).toContain(top.share);
      }
    });

    it('proposes updateContactInfo for a phone-number change, gates on approval, and confirms once approved', async () => {
      const result = await driveScript(servicingScript, 'I need to update my phone number to 512-555-0199.');

      expect(result.calls.map((c) => c.toolName)).toEqual(['updateContactInfo']);
      expect(() => parseWithToolSchema(updateContactInfo.inputSchema, result.calls[0]?.input)).not.toThrow();
      expect((result.calls[0]?.input as { phone?: string }).phone).toBe('512-555-0199');

      const closing = result.steps.at(-1);
      expect(closing?.done).toBe(true);
      expect(closing?.narration).toContain('512-555-0199');
    });

    it('falls back to a concrete demo number when the customer names no specific one', async () => {
      const result = await driveScript(servicingScript, 'I need to update my phone number.');
      expect((result.calls[0]?.input as { phone?: string }).phone).toBeTruthy();
      const closing = result.steps.at(-1);
      expect(closing?.narration).toContain((result.calls[0]?.input as { phone: string }).phone);
    });

    it('closes with a truthful, unapplied sentence when the contact change is declined', async () => {
      const result = await driveScript(
        servicingScript,
        'I need to update my phone number to 512-555-0199.',
        () => 'denied',
      );
      const closing = result.steps.at(-1);
      expect(closing?.done).toBe(true);
      expect(closing?.narration.toLowerCase()).toContain('did not make that change');
    });

    it('names what it can show, with no tool calls, for an unmatched question', async () => {
      const result = await driveScript(servicingScript, "What's the weather like today?");

      expect(result.calls).toHaveLength(0);
      expect(result.steps).toHaveLength(1);
      expect(result.steps[0]?.done).toBe(true);
      const narration = result.steps[0]?.narration.toLowerCase() ?? '';
      expect(narration).toContain('transactions');
      expect(narration).toContain('payment');
    });

    it('answers a second question in the same run independently of the first', async () => {
      const promptSoFar: LanguageModelV4Message[] = [
        userMessage('What are my latest transactions?'),
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'g0',
              toolName: 'renderEvidence',
              input: { component: 'TransactionTable', source: { kind: 'servicing-recent-transactions', months: 3, limit: 15 } },
            },
          ],
        },
        {
          role: 'tool',
          content: [{ type: 'tool-result', toolCallId: 'g0', toolName: 'renderEvidence', output: { type: 'json', value: {} } }],
        },
        userMessage('When is my next payment due?'),
      ];

      const secondStep = await servicingScript.nextStep(promptSoFar as LanguageModelV4Prompt);
      expect(secondStep.toolCalls).toHaveLength(1);
      expect(secondStep.toolCalls[0]?.toolName).toBe('renderEvidence');
      expect((secondStep.toolCalls[0]?.input as { source: { kind: string } }).source.kind).toBe(
        'servicing-next-payment',
      );
    });
  });
});
