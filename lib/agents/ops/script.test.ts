// Full state-machine walk for lib/agents/ops/script.ts — the checked-in
// DEMO_MODE=scripted conversation for DEMO_THESIS.md use case 1
// (DEMO_BUILD_PLAN.md D2: "Every rehearsed beat gets a checked-in script —
// non-negotiable"). Same shape and the same hand-rolled prompt driver as
// lib/agents/scripts.test.ts, kept local to this file so the ops agent's
// coverage lands in its own directory alongside the script it exercises.
//
// For each rehearsed turn this asserts:
//  (a) the tool-call sequence matches the agent's own INSTRUCTIONS exactly;
//  (b) every emitted tool input parses against the tool's real Zod
//      inputSchema (lib/agents/ops/tools.ts) — the same schema the AI SDK
//      validates a real model's tool call against;
//  (c) the closing step fires exactly once, only after every gated tool has a
//      disposition, and never re-proposes after that;
//  (d) BOTH gates close truthfully and execute NOTHING when declined — G2's
//      decline in particular must not produce an audit report of a removal
//      that never happened;
//  (e) every digit-bearing figure in narration or a drafted tool input traces
//      back, verbatim, to this agent's own resolver output — fetched
//      independently here rather than re-read from the script's computation,
//      so a future script change that hardcodes a figure is caught.
//
// Pinned at both demo anchors (lib/soe/seed/seed.test.ts's convention).

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { ZodType } from 'zod';
import type {
  LanguageModelV4Message,
  LanguageModelV4Prompt,
  LanguageModelV4ToolResultOutput,
} from '@ai-sdk/provider';
import type { AgentScript, ScriptStep } from '@/lib/ai/scripted/types';
import { getRules, resetRules } from '@/lib/rules/store';
import { reset as resetEvents, query as queryEvents } from '@/lib/events/store';
import {
  buildAuditReport,
  parsePolicyDocument,
  planActivationOutreach,
  resolveViolations,
  saveApprovedRules,
} from './resolvers';
import { opsScript } from './script';
import { createOpsTools } from './tools';

const ANCHORS = ['2026-08-05', '2026-08-19'] as const;

const tools = createOpsTools({ runId: 'run-ops-script-test' });

/** `tool()` is the identity function at runtime (docs/ai-sdk7-notes.md), so
 * every tool's `.inputSchema` is the exact Zod object passed into it — this
 * cast just restores the type the declared `FlexibleSchema<T>` hides. */
function parseWithToolSchema(schema: unknown, input: unknown): void {
  (schema as ZodType).parse(input);
}

// ---------------------------------------------------------------------------
// Prompt driver — mirrors lib/agents/scripts.test.ts's
// ---------------------------------------------------------------------------

function userMessage(text: string): LanguageModelV4Message {
  return { role: 'user', content: [{ type: 'text', text }] };
}

interface DrivenCall {
  toolName: string;
  input: unknown;
}

interface DriveResult {
  steps: ScriptStep[];
  calls: DrivenCall[];
  /** The prompt as it stood when the run closed — lets a follow-up turn be
   *  appended to a real, completed conversation. */
  prompt: LanguageModelV4Message[];
}

async function driveScript(
  script: AgentScript,
  triggerText: string,
  disposition: (toolName: string) => 'approved' | 'denied' = () => 'approved',
  priorPrompt: LanguageModelV4Message[] = [],
): Promise<DriveResult> {
  const prompt: LanguageModelV4Message[] = [...priorPrompt, userMessage(triggerText)];
  const steps: ScriptStep[] = [];
  const calls: DrivenCall[] = [];

  for (let stepIndex = 0; stepIndex < 20; stepIndex++) {
    const step = await script.nextStep(prompt as LanguageModelV4Prompt);
    steps.push(step);

    if (step.toolCalls.length === 0) {
      if (!step.done) {
        throw new Error(`driveScript: step ${stepIndex} made no tool calls but did not close`);
      }
      return { steps, calls, prompt };
    }
    if (step.done) {
      throw new Error(`driveScript: step ${stepIndex} closed while also making tool calls`);
    }

    const driven = step.toolCalls.map((call, i) => ({
      toolCallId: `call-${stepIndex}-${i}`,
      toolName: call.toolName,
      input: call.input,
    }));
    calls.push(...driven.map(({ toolName, input }) => ({ toolName, input })));

    prompt.push({
      role: 'assistant',
      content: driven.map((c) => ({
        type: 'tool-call' as const,
        toolCallId: c.toolCallId,
        toolName: c.toolName,
        input: c.input,
      })),
    });
    prompt.push({
      role: 'tool',
      content: driven.map((c) => {
        const output: LanguageModelV4ToolResultOutput =
          disposition(c.toolName) === 'approved'
            ? { type: 'json', value: { ok: true } }
            : { type: 'execution-denied', reason: 'Declined by operator' };
        return {
          type: 'tool-result' as const,
          toolCallId: c.toolCallId,
          toolName: c.toolName,
          output,
        };
      }),
    });
  }

  throw new Error('driveScript: exceeded 20 steps without closing — probable infinite loop');
}

/** Narration plus every string field of every tool-call input, as one
 * haystack — the same idea as lib/agents/scripts.test.ts's `emittedText`. */
function emittedText(result: DriveResult): string {
  const strings: string[] = [...result.steps.map((s) => s.narration)];
  const walk = (value: unknown): void => {
    if (typeof value === 'string') strings.push(value);
    else if (Array.isArray(value)) value.forEach(walk);
    else if (value !== null && typeof value === 'object') Object.values(value).forEach(walk);
  };
  walk(result.calls.map((c) => c.input));
  return strings.join(' \n ');
}

const DIGIT_RUN = /\d+/g;

// ---------------------------------------------------------------------------

describe.each(ANCHORS)('ops script @ anchor %s', (anchorIso) => {
  let previousAnchor: string | undefined;

  beforeEach(() => {
    previousAnchor = process.env.DEMO_ANCHOR_DATE;
    process.env.DEMO_ANCHOR_DATE = anchorIso;
    resetRules();
    resetEvents();
  });

  afterEach(() => {
    if (previousAnchor === undefined) delete process.env.DEMO_ANCHOR_DATE;
    else process.env.DEMO_ANCHOR_DATE = previousAnchor;
    resetRules();
    resetEvents();
  });

  // -------------------------------------------------------------------------
  // Turn A — upload → parse → GATE 1
  // -------------------------------------------------------------------------

  describe('turn A — the upload', () => {
    const upload =
      'Uploaded AU-Eligibility-Policy-2026.docx — please parse this authorized-user policy document.';

    it('parses, then proposes the rules behind Gate 1, with schema-valid inputs', async () => {
      const result = await driveScript(opsScript, upload);

      expect(result.calls.map((c) => c.toolName)).toEqual(['parsePolicyDocument', 'saveRules']);
      parseWithToolSchema(tools.parsePolicyDocument.inputSchema, result.calls[0]?.input);
      parseWithToolSchema(tools.saveRules.inputSchema, result.calls[1]?.input);

      // The file name is the user's own, echoed for the audit trail.
      expect(result.calls[0]?.input).toEqual({ documentRef: 'AU-Eligibility-Policy-2026.docx' });
      // Only ids reach the store call — never rule text.
      expect(result.calls[1]?.input).toMatchObject({ ruleIds: ['R1', 'R2', 'R3'] });

      const closing = result.steps.at(-1);
      expect(result.steps.filter((s) => s.done)).toHaveLength(1);
      expect(closing?.done).toBe(true);
      expect(closing?.toolCalls).toHaveLength(0);
      for (const step of result.steps) expect(step.narration.length).toBeGreaterThan(0);
    });

    it('names every extracted rule and the obligation it could not draft, then asks', async () => {
      const result = await driveScript(opsScript, upload);
      const proposal = result.steps[1];
      const parsed = parsePolicyDocument();
      if (parsed.render.component !== 'RuleDiff') throw new Error('unreachable');

      for (const rule of parsed.render.props.rules) {
        if (rule.evaluability === 'data-gap') continue;
        expect(proposal?.narration).toContain(rule.title);
      }
      const gap = parsed.render.props.rules.find((r) => r.evaluability === 'data-gap');
      expect(gap).toBeTruthy();
      expect(proposal?.narration).toContain(gap!.title);
      expect(proposal?.narration).toContain(gap!.criticNote);
      expect(proposal?.narration).toContain(parsed.documentTitle);
      expect(proposal?.narration.toLowerCase()).toContain('can i add these');
    });

    it('closes truthfully and stores nothing when Gate 1 is declined', async () => {
      const result = await driveScript(opsScript, upload, () => 'denied');

      expect(result.calls.map((c) => c.toolName)).toEqual(['parsePolicyDocument', 'saveRules']);
      const closing = result.steps.at(-1);
      expect(closing?.done).toBe(true);
      expect(closing?.narration.toLowerCase()).toContain('no rules were added');
      expect(closing?.narration.toLowerCase()).toContain('unchanged');
      // The script proposes; it never writes. Nothing reached the store or the
      // Event Log by driving it.
      expect(getRules('authorized-user')).toHaveLength(0);
      expect(queryEvents()).toHaveLength(0);
    });

    it('confirms the stored rule ids once Gate 1 is approved', async () => {
      const result = await driveScript(opsScript, upload);
      const closing = result.steps.at(-1);
      for (const ruleId of parsePolicyDocument().ruleIds) {
        expect(closing?.narration).toContain(ruleId);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Turn B — sweep → the unprompted recommendation → GATE 2 → report
  // -------------------------------------------------------------------------

  describe('turn B — the sweep', () => {
    const sweep = 'Give me the accounts that fail on these authorized-user policies.';

    it('says so plainly — and calls nothing further — when no rules are configured', async () => {
      const result = await driveScript(opsScript, sweep);

      expect(result.calls.map((c) => c.toolName)).toEqual(['queryViolations']);
      const closing = result.steps.at(-1);
      expect(closing?.done).toBe(true);
      expect(closing?.narration.toLowerCase()).toContain('no authorized-user rules');
    });

    it('sweeps, volunteers the recommendation unprompted, gates it, then reports', async () => {
      saveApprovedRules(['R1', 'R2', 'R3']);
      const result = await driveScript(opsScript, sweep);

      expect(result.calls.map((c) => c.toolName)).toEqual([
        'queryViolations',
        'executeBatchRemoval',
        'generateReport',
      ]);
      parseWithToolSchema(tools.queryViolations.inputSchema, result.calls[0]?.input);
      parseWithToolSchema(tools.executeBatchRemoval.inputSchema, result.calls[1]?.input);
      parseWithToolSchema(tools.generateReport.inputSchema, result.calls[2]?.input);

      const closingSteps = result.steps.filter((s) => s.done);
      expect(closingSteps).toHaveLength(1);
      expect(result.steps.at(-1)?.done).toBe(true);
      for (const step of result.steps) expect(step.narration.length).toBeGreaterThan(0);
    });

    it('cites the largest rule group by its stored title, count, and requirement', async () => {
      saveApprovedRules(['R1', 'R2', 'R3']);
      const result = await driveScript(opsScript, sweep);

      // The recommendation is step 2 — the turn immediately after the sweep's
      // evidence lands, with no user message in between: the unprompted beat.
      const recommendation = result.steps[1];
      expect(recommendation?.toolCalls.map((c) => c.toolName)).toEqual(['executeBatchRemoval']);

      const violations = await resolveViolations();
      if (violations.status !== 'ok') throw new Error('unreachable');
      const lead = violations.byRule.reduce((max, r) => (r.count > max.count ? r : max));
      const storedLead = getRules('authorized-user').find((r) => r.id === lead.ruleId);

      expect(lead.ruleId).toBe('R1');
      expect(lead.count).toBe(61);
      expect(recommendation?.narration).toContain(lead.title);
      expect(recommendation?.narration).toContain(String(lead.count));
      expect(recommendation?.narration).toContain(storedLead!.requirement);
      expect(recommendation?.narration).toContain(String(violations.exceptions));
      expect(recommendation?.narration).toContain(String(violations.accountsAffected));
      expect(recommendation?.narration).toContain(String(violations.scanned));
    });

    it('executes nothing and generates no report when Gate 2 is declined', async () => {
      saveApprovedRules(['R1', 'R2', 'R3']);
      const result = await driveScript(opsScript, sweep, (toolName) =>
        toolName === 'executeBatchRemoval' ? 'denied' : 'approved',
      );

      expect(result.calls.map((c) => c.toolName)).toEqual([
        'queryViolations',
        'executeBatchRemoval',
      ]);
      expect(result.calls.some((c) => c.toolName === 'generateReport')).toBe(false);

      const closing = result.steps.at(-1);
      expect(closing?.done).toBe(true);
      expect(closing?.narration.toLowerCase()).toContain('nothing was removed');
      expect(closing?.narration).toContain('87');
      expect(queryEvents()).toHaveLength(0);
    });

    it('closes on the audit report file the ReportCard actually names', async () => {
      saveApprovedRules(['R1', 'R2', 'R3']);
      const result = await driveScript(opsScript, sweep);
      const report = await buildAuditReport();

      // The removal receipt quotes the endpoint's own confirmation id…
      expect(result.steps[2]?.narration).toContain(report.confirmationId);
      // …and the close names the file on the card.
      expect(result.steps.at(-1)?.narration).toContain(report.filename);
    });
  });

  // -------------------------------------------------------------------------
  // DEMO_THESIS.md use case 3, ops side — "same practice as use case 1"
  // -------------------------------------------------------------------------

  describe('the card-activation policy', () => {
    const upload =
      'Uploaded Card-Activation-Policy-2026.docx — please parse this card-activation policy document.';
    const sweep = 'Run the card-activation policy against the book.';

    it('parses the card-activation document and proposes its two rules behind Gate 1', async () => {
      const result = await driveScript(opsScript, upload);

      expect(result.calls.map((c) => c.toolName)).toEqual(['parsePolicyDocument', 'saveRules']);
      parseWithToolSchema(tools.parsePolicyDocument.inputSchema, result.calls[0]?.input);
      parseWithToolSchema(tools.saveRules.inputSchema, result.calls[1]?.input);

      expect(result.calls[0]?.input).toEqual({
        documentRef: 'Card-Activation-Policy-2026.docx',
      });
      expect(result.calls[1]?.input).toMatchObject({ ruleIds: ['CA-R1', 'CA-R2'] });

      const parsed = parsePolicyDocument('Card-Activation-Policy-2026.docx');
      const proposal = result.steps[1];
      for (const ruleId of parsed.ruleIds) {
        expect(proposal?.narration).toContain(ruleId);
      }
      expect(proposal?.narration).toContain(parsed.documentTitle);
      expect(proposal?.narration.toLowerCase()).toContain('can i add these');

      const closing = result.steps.at(-1);
      expect(result.steps.filter((s) => s.done)).toHaveLength(1);
      expect(closing?.narration).toContain('card-activation rule store');
    });

    it('names the card-activation store, not the authorized-user one, when declined', async () => {
      const result = await driveScript(opsScript, upload, () => 'denied');
      const closing = result.steps.at(-1);
      expect(closing?.narration.toLowerCase()).toContain('no rules were added');
      expect(closing?.narration).toContain('card-activation rule store');
      expect(getRules('card-activation')).toHaveLength(0);
      expect(queryEvents()).toHaveLength(0);
    });

    it('sweeps, volunteers the outreach recommendation unprompted, gates it, and closes — no report', async () => {
      saveApprovedRules(['CA-R1', 'CA-R2']);
      const result = await driveScript(opsScript, sweep);

      // Three beats, not four: the card-activation policy produces no audit
      // report (DEMO_THESIS.md's endpoint checklist puts row 9 on UC1 only),
      // and the close must not promise a file that no route serves.
      expect(result.calls.map((c) => c.toolName)).toEqual([
        'queryViolations',
        'queueActivationOutreach',
      ]);
      expect(result.calls.some((c) => c.toolName === 'generateReport')).toBe(false);
      parseWithToolSchema(tools.queryViolations.inputSchema, result.calls[0]?.input);
      parseWithToolSchema(tools.queueActivationOutreach.inputSchema, result.calls[1]?.input);
      // …and never the other policy's action.
      expect(result.calls.some((c) => c.toolName === 'executeBatchRemoval')).toBe(false);

      expect(result.steps.filter((s) => s.done)).toHaveLength(1);
      expect(result.steps.at(-1)?.done).toBe(true);
      for (const step of result.steps) expect(step.narration.length).toBeGreaterThan(0);
    });

    it('cites CA-R2 — the dominant rule — by its stored title, count, and requirement', async () => {
      saveApprovedRules(['CA-R1', 'CA-R2']);
      const result = await driveScript(opsScript, sweep);

      // Step 2 is the unprompted beat: no user message precedes it.
      const recommendation = result.steps[1];
      expect(recommendation?.toolCalls.map((c) => c.toolName)).toEqual([
        'queueActivationOutreach',
      ]);

      const violations = await resolveViolations();
      if (violations.status !== 'ok') throw new Error('unreachable');
      const lead = violations.byRule.reduce((max, r) => (r.count > max.count ? r : max));
      const storedLead = getRules('card-activation').find((r) => r.id === lead.ruleId);

      expect(lead.ruleId).toBe('CA-R2');
      expect(lead.count).toBe(29);
      expect(recommendation?.narration).toContain(lead.title);
      expect(recommendation?.narration).toContain(String(lead.count));
      expect(recommendation?.narration).toContain(storedLead!.requirement);
      // The sweep line counts CARDS, not authorized-user relationships.
      expect(recommendation?.narration).toContain('214 issued cards swept');
      expect(recommendation?.narration).toContain(String(violations.exceptions));
      expect(recommendation?.narration).toContain(String(violations.accountsAffected));
    });

    it('queues nothing and promises nothing when the outreach gate is declined', async () => {
      saveApprovedRules(['CA-R1', 'CA-R2']);
      const result = await driveScript(opsScript, sweep, (toolName) =>
        toolName === 'queueActivationOutreach' ? 'denied' : 'approved',
      );

      expect(result.calls.map((c) => c.toolName)).toEqual([
        'queryViolations',
        'queueActivationOutreach',
      ]);
      const closing = result.steps.at(-1);
      expect(closing?.done).toBe(true);
      expect(closing?.narration.toLowerCase()).toContain('no outreach was queued');
      expect(closing?.narration).toContain('41');
      expect(queryEvents()).toHaveLength(0);
    });

    it('closes on the confirmation id the outreach batch actually mints', async () => {
      saveApprovedRules(['CA-R1', 'CA-R2']);
      const result = await driveScript(opsScript, sweep);
      const outreach = await planActivationOutreach();

      const closing = result.steps.at(-1);
      expect(closing?.narration).toContain(outreach.confirmationId);
      expect(closing?.narration).toContain(String(outreach.queued));
      // No file is named, because none is produced.
      expect(closing?.narration).not.toMatch(/\.html\b/);
    });

    it('says so plainly when the sweep runs before any rules are stored', async () => {
      const result = await driveScript(opsScript, sweep);
      expect(result.calls.map((c) => c.toolName)).toEqual(['queryViolations']);
      expect(result.steps.at(-1)?.done).toBe(true);
    });

    it('runs the whole use case back to back in one conversation', async () => {
      const turnA = await driveScript(opsScript, upload);
      saveApprovedRules(['CA-R1', 'CA-R2']);
      const turnB = await driveScript(
        opsScript,
        'Which accounts fail card activation?',
        () => 'approved',
        turnA.prompt,
      );
      expect(turnB.calls.map((c) => c.toolName)).toEqual([
        'queryViolations',
        'queueActivationOutreach',
      ]);
    });

    it('quotes no figure it did not fetch (both turns, every step)', async () => {
      saveApprovedRules(['CA-R1', 'CA-R2']);
      const text = [
        emittedText(await driveScript(opsScript, upload)),
        emittedText(await driveScript(opsScript, sweep)),
      ].join(' \n ');

      const grounded = JSON.stringify([
        parsePolicyDocument('Card-Activation-Policy-2026.docx'),
        await resolveViolations(),
        await planActivationOutreach(),
        getRules('card-activation'),
      ]);
      const groundedRuns = new Set(grounded.match(DIGIT_RUN) ?? []);

      const emittedRuns = new Set(text.match(DIGIT_RUN) ?? []);
      expect(emittedRuns.size).toBeGreaterThan(0);
      for (const run of emittedRuns) {
        expect(groundedRuns.has(run), `figure "${run}" is not in any resolver output`).toBe(true);
      }
    });

    it('leaves the authorized-user flow alone — an AU upload still parses the AU document', async () => {
      const auUpload =
        'Uploaded AU-Eligibility-Policy-2026.docx — please parse this authorized-user policy document.';
      const result = await driveScript(opsScript, auUpload);
      expect(result.calls[1]?.input).toMatchObject({ ruleIds: ['R1', 'R2', 'R3'] });
      expect(result.steps.at(-1)?.narration).toContain('authorized-user rule store');
    });
  });

  // -------------------------------------------------------------------------

  it('names what it can do, with no tool calls, for an unmatched request', async () => {
    const result = await driveScript(opsScript, 'What is the weather like today?');
    expect(result.calls).toHaveLength(0);
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0]?.done).toBe(true);
    const narration = result.steps[0]?.narration.toLowerCase() ?? '';
    expect(narration).toContain('policy');
    expect(narration).toContain('upload');
  });

  it('runs the sweep turn in the same conversation as the upload turn', async () => {
    // Turn A's tool results are still in the prompt when turn B starts;
    // `toolResultsSinceLastUserMessage` must scope them out, or the sweep turn
    // would think its own tools had already run.
    const upload = 'Uploaded AU-Eligibility-Policy-2026.docx — parse this policy document.';
    const turnA = await driveScript(opsScript, upload);
    saveApprovedRules(['R1', 'R2', 'R3']);

    const turnB = await driveScript(
      opsScript,
      'Which accounts fail these rules?',
      () => 'approved',
      turnA.prompt,
    );
    expect(turnB.calls.map((c) => c.toolName)).toEqual([
      'queryViolations',
      'executeBatchRemoval',
      'generateReport',
    ]);
  });

  it('quotes no figure it did not fetch (both turns, every step)', async () => {
    saveApprovedRules(['R1', 'R2', 'R3']);
    const upload = 'Uploaded AU-Eligibility-Policy-2026.docx — parse this policy document.';
    const text = [
      emittedText(await driveScript(opsScript, upload)),
      emittedText(await driveScript(opsScript, 'Which accounts fail these rules?')),
    ].join(' \n ');

    // Independently fetched haystack: every figure the resolvers can legally
    // produce, from a fresh read — never from the script's own output.
    const grounded = JSON.stringify([
      parsePolicyDocument(),
      await resolveViolations(),
      await buildAuditReport(),
      getRules('authorized-user'),
    ]);
    const groundedRuns = new Set(grounded.match(DIGIT_RUN) ?? []);

    const emittedRuns = new Set(text.match(DIGIT_RUN) ?? []);
    expect(emittedRuns.size).toBeGreaterThan(0);
    for (const run of emittedRuns) {
      expect(groundedRuns.has(run), `figure "${run}" is not in any resolver output`).toBe(true);
    }
  });
});
