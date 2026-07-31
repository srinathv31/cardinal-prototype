// The single AI SDK Telemetry integration that turns agent lifecycle events
// into Event Log entries (brief §5e, docs/wire-contract.md §5). Registered
// once at startup (instrumentation.ts) via `registerTelemetry` — every agent
// run in the process shares this one instance. Agent-actor entries all
// originate here; human-actor entries are written separately by the stream
// route when it ingests approval responses (brief §5e).
//
// --- runtimeContext verification (see CLAUDE.md build notes) -------------
// Checked against node_modules/ai/dist/index.js's `createRestrictedTelemetryDispatcher`
// (the wrapper every generateText/streamText call routes telemetry through):
//   - onStart / onStepStart / onStepEnd / onEnd DO carry a `runtimeContext`
//     field, but ONLY the keys the agent opts into via
//     `telemetry.includeRuntimeContext: { key: true }` survive
//     (`filterIncludedContext` — an allow-list, not a boolean switch, despite
//     what the older draft guide implied). The Payment Health agent sets
//     `includeRuntimeContext: { runId: true, agentId: true }`.
//   - onToolExecutionStart / onToolExecutionEnd do NOT carry runtimeContext
//     at all — `createRestrictedTelemetryDispatcher` only forwards
//     `toolContext` for those two. They do carry `callId`, shared with the
//     onStart/onStepEnd/onEnd events for the same generateText/streamText
//     call ("used to correlate events" per the d.ts).
// So this integration keeps a small per-callId cache — seeded in onStart,
// refreshed in onStepStart to track the current loop step — and reads it
// back in the tool-execution and onError handlers, which have no
// runtimeContext of their own. Cleaned up in onEnd/onError.

import type { Telemetry } from 'ai';
import { append } from './store';

/** Side-effecting tools whose completion is an executed ACTION, not a plain
 * evidence fetch (docs/wire-contract.md §5 — 'action.executed' vs
 * 'tool.executed'). Extend this whenever an agent gains an action tool.
 *
 * `updateContactInfo` (v3, lib/agents/servicing/tools.ts) is the servicing
 * chatbot's contact-information write — the first mutation in `lib/soe`
 * (CARDINAL_V3_AU_BRIEF.md §7c) and unambiguously an executed action, not a
 * read. Its human approval decision is logged independently by the stream
 * route (`approval.granted`/`approval.denied`, `actor: 'human'`), so the
 * omission would not have lost the gate — but it would have hidden the
 * WRITE from anyone scanning the Event Log for `action.executed`, which is
 * precisely the reviewer this distinction exists for.
 *
 * `saveRules` and `executeBatchRemoval` (branch `demo-aug4`,
 * lib/agents/ops/tools.ts) are the ops chat's two gated actions — DEMO_THESIS.md
 * use case 1's G1 (adopting rules into the rule store) and G2 (the batch
 * authorized-user removal). Both are genuine writes: G1 mutates
 * lib/rules/store.ts, and G2 executes the remediation endpoint's mock batch and
 * mints its confirmation id. Their human approval decisions are logged
 * independently by the stream route (`approval.granted`/`approval.denied`,
 * `actor: 'human'`); these entries are the agent-side record that the approved
 * action actually ran.
 *
 * `queueActivationOutreach` is the card-activation policy's Gate 2 — the ops
 * chat's other write, and DEMO_THESIS.md use case 3's "human-in-the-loop takes
 * some action on the result." Mocked downstream like the batch removal, and
 * logged here for the same reason: what a reviewer scanning for
 * `action.executed` must see is that an approved batch actually ran. */
const ACTION_TOOL_NAMES = new Set([
  'proposeDueDateChange',
  'sendOutreachDraft',
  'updateContactInfo',
  'saveRules',
  'executeBatchRemoval',
  'queueActivationOutreach',
  'activateCard',
]);

interface RunContext {
  runId: string;
  agentId: string;
  /** Current loop step for this callId, updated on every onStepStart. */
  step: number;
}

const contextByCallId = new Map<string, RunContext>();

function readRuntimeContext(raw: unknown): { runId: string; agentId: string } | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const { runId, agentId } = raw as Record<string, unknown>;
  if (typeof runId !== 'string' || typeof agentId !== 'string') return null;
  return { runId, agentId };
}

function truncate(value: string, maxLen: number): string {
  return value.length > maxLen ? `${value.slice(0, maxLen - 1)}…` : value;
}

/** Compact, human-readable one-liner for a tool's input/output — never a raw
 * JSON dump (brief §5e: "inputSummary/outputSummary ... never full
 * payloads"). Understands the `{ component, source: {...} }` shape shared by
 * this build's evidence tool; anything else falls back to flat `key=value`
 * pairs so future agents' tools still summarize reasonably. */
function summarize(value: unknown, maxLen = 110): string {
  if (value == null) return '';
  if (typeof value !== 'object') return truncate(String(value), maxLen);
  const obj = value as Record<string, unknown>;
  const segments: string[] = [];

  if (typeof obj.component === 'string') segments.push(obj.component);
  const source = obj.source;
  if (source && typeof source === 'object') {
    const s = source as Record<string, unknown>;
    if (typeof s.kind === 'string') segments.push(s.kind);
    if (typeof s.accountId === 'string') segments.push(s.accountId);
    if (typeof s.months === 'number') segments.push(`(${s.months} mo)`);
  }
  for (const [key, v] of Object.entries(obj)) {
    if (key === 'component' || key === 'source' || key === 'rationale' || key === 'body') continue;
    if (v == null || typeof v === 'object') continue;
    segments.push(`${key}=${v}`);
  }

  return truncate(segments.join(' ') || '(no summary)', maxLen);
}

export const eventLogTelemetry: Telemetry = {
  onStart(event) {
    // onStart is shared across generateText/generateObject/embed/rerank
    // (OperationStartEvent); only the generateText/streamText member carries
    // runtimeContext, so this also narrows away the other three at the type
    // level (ai/dist/index.d.ts: GenerateObjectStartEvent / EmbedStartEvent /
    // RerankStartEvent declare no `runtimeContext` field).
    if (!('runtimeContext' in event)) return;
    const ctx = readRuntimeContext(event.runtimeContext);
    if (!ctx) return; // runId/agentId not opted into telemetry — nothing to log against
    contextByCallId.set(event.callId, { ...ctx, step: -1 });
    append({
      runId: ctx.runId,
      agentId: ctx.agentId,
      step: -1,
      actor: 'agent',
      kind: 'run.started',
      inputSummary: `model=${event.modelId}`,
    });
  },

  onStepStart(event) {
    const ctx = readRuntimeContext(event.runtimeContext) ?? contextByCallId.get(event.callId);
    if (!ctx) return;
    contextByCallId.set(event.callId, {
      runId: ctx.runId,
      agentId: ctx.agentId,
      step: event.stepNumber,
    });
  },

  onStepEnd(event) {
    const ctx = contextByCallId.get(event.callId) ?? readRuntimeContext(event.runtimeContext);
    if (!ctx) return;
    const step = event.stepNumber;

    append({
      runId: ctx.runId,
      agentId: ctx.agentId,
      step,
      actor: 'agent',
      kind: 'step.completed',
      outputSummary: event.text
        ? truncate(event.text, 140)
        : `finishReason=${event.finishReason}`,
    });

    // Approval-gated tool calls surface as a 'tool-approval-request' content
    // part on the step that requested them (ai/dist/index.d.ts ContentPart).
    for (const part of event.content) {
      if (part.type !== 'tool-approval-request') continue;
      append({
        runId: ctx.runId,
        agentId: ctx.agentId,
        step,
        toolName: part.toolCall.toolName,
        actor: 'agent',
        kind: 'approval.requested',
        inputSummary: summarize(part.toolCall.input),
      });
    }
  },

  onToolExecutionEnd(event) {
    const ctx = contextByCallId.get(event.callId);
    if (!ctx) return;
    const toolName = event.toolCall.toolName;
    const kind = ACTION_TOOL_NAMES.has(toolName) ? 'action.executed' : 'tool.executed';
    const isError = event.toolOutput.type === 'tool-error';

    append({
      runId: ctx.runId,
      agentId: ctx.agentId,
      step: ctx.step,
      toolName,
      actor: 'agent',
      kind,
      inputSummary: summarize(event.toolCall.input),
      outputSummary: isError
        ? `error: ${truncate(String(event.toolOutput.error), 110)}`
        : summarize(event.toolOutput.output),
    });
  },

  onEnd(event) {
    const cached = contextByCallId.get(event.callId);
    contextByCallId.delete(event.callId);
    // Same reasoning as onStart: only the generateText/streamText member of
    // OperationEndEvent carries runtimeContext (and, downstream of that,
    // stepNumber/finishReason at this event's top level).
    if (!('runtimeContext' in event)) return;
    const ctx = cached ?? readRuntimeContext(event.runtimeContext);
    if (!ctx) return;
    append({
      runId: ctx.runId,
      agentId: ctx.agentId,
      step: -1,
      actor: 'agent',
      kind: 'run.finished',
      outputSummary: `steps=${event.stepNumber + 1} finishReason=${event.finishReason}`,
    });
  },

  onError(rawEvent) {
    // Typed `Callback<unknown>` in the SDK, but every call site in
    // ai/dist/index.js invokes it with `{ callId, error }` — verified by
    // grepping the compiled output (the .d.ts is stale here). Defensive
    // narrowing below in case a future SDK version changes this.
    if (typeof rawEvent !== 'object' || rawEvent === null) return;
    const { callId, error } = rawEvent as { callId?: unknown; error?: unknown };
    if (typeof callId !== 'string') return;
    const ctx = contextByCallId.get(callId);
    contextByCallId.delete(callId);
    if (!ctx) return;

    const message = error instanceof Error ? error.message : String(error);
    append({
      runId: ctx.runId,
      agentId: ctx.agentId,
      step: -1,
      actor: 'agent',
      kind: 'run.failed',
      outputSummary: truncate(message, 140),
    });
  },
};
