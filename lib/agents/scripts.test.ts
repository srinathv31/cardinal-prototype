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

import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { ZodType } from 'zod';
import type { LanguageModelV4Message, LanguageModelV4Prompt, LanguageModelV4ToolResultOutput } from '@ai-sdk/provider';
import type { AgentScript, ScriptStep } from '@/lib/ai/scripted/types';
import { evidenceSpecSchema } from '@/lib/registry/evidence';
import { paymentHealthScript } from './payment-health/script';
import { proposeDueDateChange, sendOutreachDraft } from './payment-health/tools';
import { btLifecycleScript } from './bt-lifecycle/script';
import { sendRetentionOutreach } from './bt-lifecycle/tools';
import { auGrowthScript } from './au-growth/script';
import { sendGraduationInvite } from './au-growth/tools';
import { askScript } from './ask/script';
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

// ---------------------------------------------------------------------------
// Grounding (requirement d): every digit-bearing figure quoted in narration
// or a drafted tool input must trace back, verbatim, to this account's own
// resolver output — fetched independently here (not by re-reading the
// script's own computation) so a future script change that hardcodes a
// figure instead of fetching it would actually be caught. Spot-checks the
// headline grounded figures per agent, per the work item's Verification §1d,
// rather than a blanket digit scan — several registry props (chart points,
// projection values) carry raw numbers for geometry, not preformatted
// strings, which a naive text scan can't reconcile against formatted output
// (e.g. "$80.00" vs raw `80`) without reimplementing each formatter.
// ---------------------------------------------------------------------------

/** All text a driven run emitted — narration plus every string field of
 * every tool-call input (subjects, bodies, rationales) — as one haystack. */
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

// ---------------------------------------------------------------------------

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

  describe('payment-health — Marcus Webb', () => {
    const accountId = 'acct-marcus';
    const trigger = JSON.stringify({
      eventId: 'evt-marcus-autopay-failed',
      accountId,
      kind: 'autopay.failed',
      summary: 'Autopay declined for Marcus Webb',
      timestamp: new Date().toISOString(),
    });

    it('matches the INSTRUCTIONS-enumerated sequence and inputs validate', async () => {
      const result = await driveScript(paymentHealthScript, trigger);

      expect(result.calls.map((c) => c.toolName)).toEqual([
        'renderEvidence',
        'renderEvidence',
        'renderEvidence',
        'renderEvidence',
        'proposeDueDateChange',
        'sendOutreachDraft',
      ]);

      const evidenceKinds = result.calls
        .filter((c) => c.toolName === 'renderEvidence')
        .map((c) => (c.input as { source: { kind: string } }).source.kind);
      expect(evidenceKinds).toEqual([
        'account-overview',
        'utilization-trend',
        'payment-history',
        'payment-risk',
      ]);

      for (const call of result.calls) {
        if (call.toolName === 'renderEvidence') {
          expect(() => evidenceSpecSchema.parse(call.input)).not.toThrow();
        } else if (call.toolName === 'proposeDueDateChange') {
          expect(() => parseWithToolSchema(proposeDueDateChange.inputSchema, call.input)).not.toThrow();
        } else if (call.toolName === 'sendOutreachDraft') {
          expect(() => parseWithToolSchema(sendOutreachDraft.inputSchema, call.input)).not.toThrow();
        } else {
          throw new Error(`unexpected tool call: ${call.toolName}`);
        }
      }

      // (c) closing fires exactly once, only after both action tools have
      // results, and every step has non-empty narration.
      const closingSteps = result.steps.filter((s) => s.done);
      expect(closingSteps).toHaveLength(1);
      expect(closingSteps[0]?.toolCalls).toHaveLength(0);
      expect(result.steps.at(-1)?.done).toBe(true);
      for (const step of result.steps) expect(step.narration.length).toBeGreaterThan(0);
    });

    it('grounds the risk headline and missed-payment date in resolver/adapter output', async () => {
      const result = await driveScript(paymentHealthScript, trigger);
      const text = emittedText(result);

      const { resolveEvidence } = await import('./payment-health/resolvers');
      const overview = await resolveEvidence({ component: 'MetricRow', source: { kind: 'account-overview', accountId } });
      const risk = await resolveEvidence({
        component: 'RiskBadge',
        source: { kind: 'payment-risk', accountId },
        rationale: '',
      });
      if (overview.component !== 'MetricRow' || risk.component !== 'RiskBadge') throw new Error('unreachable');
      const utilization = overview.props.metrics.find((m) => m.label === 'Utilization')?.value;

      const { getPayments } = await import('@/lib/soe');
      const { formatDate } = await import('@/lib/agents/format');
      const missed = (await getPayments(accountId)).find((p) => p.status === 'MISSED');

      expect(text).toContain(risk.props.headline);
      expect(utilization).toBeTruthy();
      expect(text).toContain(utilization);
      expect(missed).toBeTruthy();
      if (missed) expect(text).toContain(formatDate(missed.dueDate));
    });

    it('closes with a truthful, disposition-aware sentence when one action is declined', async () => {
      const result = await driveScript(paymentHealthScript, trigger, (toolName) =>
        toolName === 'sendOutreachDraft' ? 'denied' : 'approved',
      );
      const closing = result.steps.at(-1);
      expect(closing?.done).toBe(true);
      expect(closing?.narration.toLowerCase()).toContain('applied');
      expect(closing?.narration.toLowerCase()).toContain('not');
    });

    it('resumes at the right step when a real model already completed earlier steps', async () => {
      // Simulate a fallback mid-run: steps 1–2 (MetricRow, TrendChart) are
      // already resolved in the prompt, as if a real model produced them
      // before erroring out.
      const prompt: LanguageModelV4Message[] = [
        userMessage(trigger),
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'c0',
              toolName: 'renderEvidence',
              input: { component: 'MetricRow', source: { kind: 'account-overview', accountId } },
            },
          ],
        },
        {
          role: 'tool',
          content: [
            { type: 'tool-result', toolCallId: 'c0', toolName: 'renderEvidence', output: { type: 'json', value: {} } },
          ],
        },
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'c1',
              toolName: 'renderEvidence',
              input: { component: 'TrendChart', source: { kind: 'utilization-trend', accountId, months: 6 } },
            },
          ],
        },
        {
          role: 'tool',
          content: [
            { type: 'tool-result', toolCallId: 'c1', toolName: 'renderEvidence', output: { type: 'json', value: {} } },
          ],
        },
      ];

      const step = await paymentHealthScript.nextStep(prompt as LanguageModelV4Prompt);
      expect(step.toolCalls).toHaveLength(1);
      expect(step.toolCalls[0]?.toolName).toBe('renderEvidence');
      expect((step.toolCalls[0]?.input as { source: { kind: string } }).source.kind).toBe('payment-history');
    });
  });

  describe('bt-lifecycle — Elena Ruiz', () => {
    const accountId = 'acct-elena';
    const trigger = JSON.stringify({
      eventId: 'evt-elena-promo-expiring',
      accountId,
      kind: 'bt.promo_expiring',
      summary: "Elena Ruiz's 0% promo APR is expiring soon",
      timestamp: new Date().toISOString(),
    });

    it('matches the INSTRUCTIONS-enumerated sequence and inputs validate', async () => {
      const result = await driveScript(btLifecycleScript, trigger);

      expect(result.calls.map((c) => c.toolName)).toEqual([
        'renderEvidence',
        'renderEvidence',
        'renderEvidence',
        'sendRetentionOutreach',
      ]);

      const evidenceKinds = result.calls
        .filter((c) => c.toolName === 'renderEvidence')
        .map((c) => (c.input as { source: { kind: string } }).source.kind);
      expect(evidenceKinds).toEqual(['bt-overview', 'bt-lifecycle', 'interest-projection']);

      for (const call of result.calls) {
        if (call.toolName === 'renderEvidence') {
          expect(() => evidenceSpecSchema.parse(call.input)).not.toThrow();
        } else {
          expect(() => parseWithToolSchema(sendRetentionOutreach.inputSchema, call.input)).not.toThrow();
        }
      }

      const closingSteps = result.steps.filter((s) => s.done);
      expect(closingSteps).toHaveLength(1);
      expect(closingSteps[0]?.toolCalls).toHaveLength(0);
      for (const step of result.steps) expect(step.narration.length).toBeGreaterThan(0);
    });

    it('grounds the promo end date, remaining balance, and first-month interest in resolver output', async () => {
      const result = await driveScript(btLifecycleScript, trigger);
      const text = emittedText(result);

      const { resolveEvidence } = await import('./bt-lifecycle/resolvers');
      const overview = await resolveEvidence({ component: 'MetricRow', source: { kind: 'bt-overview', accountId } });
      const timeline = await resolveEvidence({ component: 'BTTimeline', source: { kind: 'bt-lifecycle', accountId } });
      const projection = await resolveEvidence({
        component: 'InterestProjectionChart',
        source: { kind: 'interest-projection', accountId, months: 12 },
      });
      if (overview.component !== 'MetricRow' || timeline.component !== 'BTTimeline' || projection.component !== 'InterestProjectionChart') {
        throw new Error('unreachable');
      }
      const remainingBalance = overview.props.metrics.find((m) => m.label === 'Remaining Balance')?.value;
      const promoEndDate = timeline.props.milestones.find((m) => m.id === 'promo-end')?.date;
      const firstMonthInterest = projection.props.callouts.find((c) => c.label === 'First month interest')?.value;

      expect(remainingBalance).toBeTruthy();
      expect(promoEndDate).toBeTruthy();
      expect(firstMonthInterest).toBeTruthy();
      expect(text).toContain(remainingBalance);
      expect(text).toContain(promoEndDate);
      expect(text).toContain(firstMonthInterest);
    });

    it('closes with a truthful sentence when the outreach is declined', async () => {
      const result = await driveScript(btLifecycleScript, trigger, () => 'denied');
      const closing = result.steps.at(-1);
      expect(closing?.done).toBe(true);
      expect(closing?.narration.toLowerCase()).toContain('declined');
    });
  });

  describe('au-growth — Patel household', () => {
    const accountId = 'acct-patel';
    const trigger = JSON.stringify({
      eventId: 'evt-patel-statement',
      accountId,
      kind: 'statement.generated',
      summary: 'Statement generated for the Patel household card',
      timestamp: new Date().toISOString(),
    });

    it('matches the INSTRUCTIONS-enumerated sequence and inputs validate', async () => {
      const result = await driveScript(auGrowthScript, trigger);

      expect(result.calls.map((c) => c.toolName)).toEqual([
        'renderEvidence',
        'renderEvidence',
        'renderEvidence',
        'sendGraduationInvite',
      ]);

      const evidenceKinds = result.calls
        .filter((c) => c.toolName === 'renderEvidence')
        .map((c) => (c.input as { source: { kind: string } }).source.kind);
      expect(evidenceKinds).toEqual(['household-overview', 'au-spend-trend', 'au-recurring-spend']);

      for (const call of result.calls) {
        if (call.toolName === 'renderEvidence') {
          expect(() => evidenceSpecSchema.parse(call.input)).not.toThrow();
        } else {
          expect(() => parseWithToolSchema(sendGraduationInvite.inputSchema, call.input)).not.toThrow();
          expect((call.input as { recipientPartyId: string }).recipientPartyId).toBe('party-dev');
        }
      }

      const closingSteps = result.steps.filter((s) => s.done);
      expect(closingSteps).toHaveLength(1);
      expect(closingSteps[0]?.toolCalls).toHaveLength(0);
      for (const step of result.steps) expect(step.narration.length).toBeGreaterThan(0);
    });

    it('grounds the spend-growth figures in the resolver-reported trend, formatted the same way', async () => {
      const result = await driveScript(auGrowthScript, trigger);
      const text = emittedText(result);

      const { resolveEvidence } = await import('./au-growth/resolvers');
      const { formatCurrency } = await import('@/lib/agents/format');
      const partyId = 'party-dev';
      const trend = await resolveEvidence({
        component: 'TrendChart',
        source: { kind: 'au-spend-trend', accountId, partyId, months: 12 },
      });
      if (trend.component !== 'TrendChart') throw new Error('unreachable');
      const points = trend.props.series[0]?.points ?? [];
      expect(points.length).toBeGreaterThan(0);

      const earliestSpend = formatCurrency(points[0]!.value);
      const latestSpend = formatCurrency(points.at(-1)!.value);
      expect(text).toContain(earliestSpend);
      expect(text).toContain(latestSpend);
      expect(text).toContain('Dev');
    });

    it('stops after one narrated sentence when no party is highlighted (Marcus has no authorized users)', async () => {
      const marcusTrigger = JSON.stringify({
        eventId: 'evt-marcus-statement',
        accountId: 'acct-marcus',
        kind: 'statement.generated',
        summary: 'Statement generated',
        timestamp: new Date().toISOString(),
      });
      const result = await driveScript(auGrowthScript, marcusTrigger);

      expect(result.calls.map((c) => c.toolName)).toEqual(['renderEvidence']);
      expect(result.steps).toHaveLength(2);
      expect(result.steps[1]?.toolCalls).toHaveLength(0);
      expect(result.steps[1]?.done).toBe(true);
    });
  });

  describe('ask', () => {
    it('routes the category-spend question to CategoryPie with a grounded takeaway', async () => {
      const result = await driveScript(askScript, 'Show me spend by category across the portfolio this quarter');

      expect(result.calls.map((c) => c.toolName)).toEqual(['renderEvidence']);
      expect(result.calls[0]?.input).toMatchObject({
        component: 'CategoryPie',
        source: { kind: 'portfolio-category-spend', months: 3 },
      });
      expect(() => evidenceSpecSchema.parse(result.calls[0]?.input)).not.toThrow();

      const closing = result.steps.at(-1);
      expect(closing?.done).toBe(true);
      expect(closing?.narration.length).toBeGreaterThan(0);

      const { resolveEvidence } = await import('./ask/resolvers');
      const instruction = await resolveEvidence({
        component: 'CategoryPie',
        source: { kind: 'portfolio-category-spend', months: 3 },
      });
      if (instruction.component !== 'CategoryPie') throw new Error('unreachable');
      const top = instruction.props.slices[0];
      expect(top).toBeTruthy();
      if (top) {
        expect(closing?.narration).toContain(top.label);
        expect(closing?.narration).toContain(top.share);
      }
    });

    it('routes the BT-expiring question to BarBreakdown with a grounded takeaway', async () => {
      const result = await driveScript(askScript, 'Which accounts have balance transfers expiring in the next 90 days?');

      expect(result.calls.map((c) => c.toolName)).toEqual(['renderEvidence']);
      expect(result.calls[0]?.input).toMatchObject({
        component: 'BarBreakdown',
        source: { kind: 'bt-expiring-accounts', windowDays: 90 },
      });

      const { resolveEvidence } = await import('./ask/resolvers');
      const instruction = await resolveEvidence({
        component: 'BarBreakdown',
        source: { kind: 'bt-expiring-accounts', windowDays: 90 },
      });
      if (instruction.component !== 'BarBreakdown') throw new Error('unreachable');
      const closing = result.steps.at(-1);
      expect(instruction.props.footnote).toBeTruthy();
      expect(closing?.narration).toBe(instruction.props.footnote);
    });

    it('names what it can show, with no tool calls, for an unmatched question', async () => {
      const result = await driveScript(askScript, "What's the weather like today?");

      expect(result.calls).toHaveLength(0);
      expect(result.steps).toHaveLength(1);
      expect(result.steps[0]?.done).toBe(true);
      const narration = result.steps[0]?.narration.toLowerCase() ?? '';
      expect(narration).toContain('categor');
      expect(narration).toContain('balance transfer');
    });

    it('answers a second question in the same run independently of the first', async () => {
      // First turn's renderEvidence call + result (as the SDK would replay
      // it on the next call), then a second, differently-matching question.
      const promptSoFar: LanguageModelV4Message[] = [
        userMessage('Show me spend by category across the portfolio this quarter'),
        {
          role: 'assistant',
          content: [
            {
              type: 'tool-call',
              toolCallId: 'f0',
              toolName: 'renderEvidence',
              input: { component: 'CategoryPie', source: { kind: 'portfolio-category-spend', months: 3 } },
            },
          ],
        },
        {
          role: 'tool',
          content: [{ type: 'tool-result', toolCallId: 'f0', toolName: 'renderEvidence', output: { type: 'json', value: {} } }],
        },
        userMessage('Which accounts have balance transfers expiring in the next 90 days?'),
      ];

      const secondStep = await askScript.nextStep(promptSoFar as LanguageModelV4Prompt);
      expect(secondStep.toolCalls).toHaveLength(1);
      expect(secondStep.toolCalls[0]?.toolName).toBe('renderEvidence');
      expect((secondStep.toolCalls[0]?.input as { component: string }).component).toBe('BarBreakdown');
    });
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
