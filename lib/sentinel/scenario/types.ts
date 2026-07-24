// ScenarioPlayer wire types (W0.2, brief §6). Two unions live here:
//
//   - `ScenarioStep` — the checked-in scenario file format. An ordered list
//     of timed instructions; every variant but `actMarker`/`awaitApproval`/
//     `awaitStageAction` carries `delayMs`, a pause (divided by playback
//     speed) before the step executes.
//   - `SentinelStreamMessage` — what the player actually publishes, one
//     message per step except `narration` (chunked into `narrationDelta`
//     messages, typing-effect style), `awaitApproval` (split into an
//     `approvalRequest` message followed, once resolved, by an
//     `approvalResolved` message), and `awaitStageAction` (split into a
//     `stageActionRequest` message followed, once resolved, by a
//     `stageActionResolved` message).
//
// Payload shapes are REUSED wire-contract types, imported, never redeclared
// (docs/v2-reuse-map.md §2): `ApprovalCardProps` from lib/registry/schemas.ts,
// `EventLogEntry` from lib/events/types.ts, `StreamEvent` from
// lib/soe/types.ts. `RenderInstruction` is widened to `SentinelRenderInstruction`
// (lib/sentinel/registry.ts, wire-contract §9.6) — the Sentinel-only additive
// component namespace (RuleDiff et al.) layered on top of v1's registry,
// which stays untouched. This file only adds the additive envelope types the
// brief calls out — `graphStep`, `counterUpdate`, `actMarker`, `policyPanel`,
// `awaitStageAction`, `railReset` (W4.1, brief §3 Act III/§7) — documented as
// a versioned, additive contract in docs/wire-contract.md §9.
//
// `SentinelStageState` is the derived, renderer-friendly snapshot the player
// exposes via `getSnapshot()` — stage components stay pure renderers of this
// shape (v1 invariant 5b), never of the raw message log.

import type { ApprovalCardProps } from '@/lib/registry/schemas';
import type { SentinelRenderInstruction } from '@/lib/sentinel/registry';
import type { EventLogEntry } from '@/lib/events/types';
import type { StreamEvent } from '@/lib/soe/types';

/** The six fixed nodes of the read-only live agent graph (brief §4). Layout
 * is fixed — the graph renderer holds no logic and never adds/removes a
 * node. */
export type SentinelNodeId =
  | 'orchestrator'
  | 'policy-analyst'
  | 'rule-engineer'
  | 'data-collector'
  | 'critic'
  | 'approval-gate';

/** `armed` is Act II's post-activation "idle-armed" graph state (brief §3
 * Act II beat 4): rules are live but nothing is currently in flight — a
 * subtle pulse instead of fully dark, distinct from both `idle` (never
 * activated) and `working` (actively processing). */
export type SentinelNodeState = 'idle' | 'working' | 'done' | 'armed';

export interface SentinelGraphEdge {
  from: SentinelNodeId;
  to: SentinelNodeId;
}

// ---------------------------------------------------------------------------
// Scenario steps — the checked-in scenario file format.
// ---------------------------------------------------------------------------

/** Marks an act boundary. Playback PAUSES on reaching one — act transitions
 * are presenter-triggered, never automatic (brief §4). No `delayMs`: a
 * marker isn't waited for, it's a stop sign. */
export interface ActMarkerStep {
  type: 'actMarker';
  act: 1 | 2 | 3;
  title: string;
}

/** Feeds the replay rail. `highlight` is Act III's catch (the 2:47 AM event
 * stops mid-rail); `complianceBadge` is the Elena R3 "quiet green check"
 * beat (brief §3). Both optional — most events are neither. */
export interface EmitEventStep {
  type: 'emitEvent';
  delayMs: number;
  event: StreamEvent;
  highlight?: boolean;
  complianceBadge?: string;
}

/** One node's state transition on the live agent graph, optionally
 * replacing the animated-edge set. `animatedEdges`, when present, REPLACES
 * the currently-animated edges wholesale — declarative, not a diff, because
 * the graph renderer holds no logic (brief §4). Omit it to leave the
 * existing edges alone.
 *
 * `detail`, when present, is a short per-node activity caption rendered
 * under the node in place of its state word (e.g. "call 1 · BT event
 * detail") — brief §3 Act III: "Data Collector fires twice ... visibly two
 * calls," and a glow pulse alone doesn't read at projector distance. Like
 * `animatedEdges`, this REPLACES the node's caption wholesale, not a diff:
 * a `graphStep` WITH `detail` sets it, one WITHOUT `detail` clears it back
 * to the plain state word (player.ts's `handleGraphStep`). */
export interface GraphStep {
  type: 'graphStep';
  delayMs: number;
  nodeId: SentinelNodeId;
  nodeState: SentinelNodeState;
  animatedEdges?: SentinelGraphEdge[];
  detail?: string;
}

/** Narration text, played back with a typing effect (fixed 3-character
 * chunks on a fixed 16ms cadence, scaled by speed — brief §8: no randomness
 * anywhere in the scenario path). `id` lets the stage track/replace the
 * in-progress line as deltas arrive. */
export interface NarrationStep {
  type: 'narration';
  delayMs: number;
  id: string;
  text: string;
}

/** The same `{ component, props }` shape the run view's evidence pane
 * consumes (docs/wire-contract.md §3), widened to `SentinelRenderInstruction`
 * (lib/sentinel/registry.ts, §9.6) — v1 registry components or the
 * Sentinel-only additive ones (RuleDiff). A `render` step whose `id`
 * matches an earlier one REPLACES that context-rail item in place (position
 * preserved) instead of appending a second one — how Act II's rule cards
 * flip proposed→active and grow progressively (mirrors narration's
 * same-id semantics; see player.ts's `handleRender`). */
export interface RenderStep {
  type: 'render';
  delayMs: number;
  id: string;
  instruction: SentinelRenderInstruction;
}

/** HARD-BLOCKS playback until `ScenarioPlayer#resolveApproval` is called —
 * no auto-approve, no timeout (v1 brief §5d carries over). No `delayMs`:
 * the block itself is the wait. `audit` is the human-decision Event Log
 * entry to write on resolution, minus the fields the resolution derives
 * (`kind` from the approve/deny outcome, `actor: 'human'` always). */
export interface AwaitApprovalStep {
  type: 'awaitApproval';
  id: string;
  payload: ApprovalCardProps;
  audit: Omit<EventLogEntry, 'id' | 'timestamp' | 'kind' | 'actor'>;
}

/** The Act II policy drawer's three states (brief §3 beat 1: closed → the
 * presenter opens it and mock-drops the policy file → the document preview
 * shows). The drawer is a pure renderer of this snapshot field — no
 * component-local open/closed state. */
export type PolicyPanelState = 'closed' | 'drop' | 'preview';

/** Drives the Act II policy drawer declaratively. An instant step (no
 * blocking) — the drawer transitions the instant the message publishes. */
export interface PolicyPanelStep {
  type: 'policyPanel';
  delayMs: number;
  panel: PolicyPanelState;
}

/** HARD-BLOCKS playback until `ScenarioPlayer#resolveStageAction` is called
 * — mirrors `AwaitApprovalStep`'s blocking semantics (no `delayMs`, the
 * block itself is the wait) but models a presenter-driven staging beat that
 * isn't an approval decision, e.g. Act II's mock file-drop into the policy
 * panel: a real human gate, not a business decision. */
export interface AwaitStageActionStep {
  type: 'awaitStageAction';
  id: string;
  action: 'policy-drop';
}

/** Clears the replay rail — Act III's fresh observation window. Act III
 * replays the SAME 14 night events Act I already emitted (brief §3: "the
 * same night replays. Same events, same order, same timestamps"), and
 * `handleEmitEvent` appends to `railEvents` unconditionally; without an
 * explicit reset between acts, the rail would carry Act I's 14 cards PLUS
 * Act III's 14 more — 28 rows, and duplicate `event.eventId` React keys
 * since it's the same checked-in event list both times. This step clears
 * ONLY `railEvents`. Zeroing the counter is deliberately NOT this step's
 * job — that stays `counterUpdate`'s (brief §6's existing declarative
 * step), an orthogonal concern the Act III scenario pairs alongside this
 * one rather than folding together. */
export interface RailResetStep {
  type: 'railReset';
  delayMs: number;
}

export interface SentinelCounter {
  events: number;
  violations: number;
  flagged: number;
}

/** The replay-rail counter (brief §3's "14 events · 1 violation · 0
 * flagged" beats). */
export interface CounterUpdateStep {
  type: 'counterUpdate';
  delayMs: number;
  counter: SentinelCounter;
  caption?: string;
}

/** Appends straight to the shared Event Log (via the P1 stage wiring to
 * `POST /api/sentinel/audit` — the player itself never fetches, see
 * player.ts's header comment). `entry` omits `id`/`timestamp`, which the
 * store assigns on append, exactly like every other Event Log write. */
export interface AuditWriteStep {
  type: 'auditWrite';
  delayMs: number;
  entry: Omit<EventLogEntry, 'id' | 'timestamp'>;
}

export type ScenarioStep =
  | ActMarkerStep
  | EmitEventStep
  | GraphStep
  | NarrationStep
  | RenderStep
  | AwaitApprovalStep
  | CounterUpdateStep
  | AuditWriteStep
  | PolicyPanelStep
  | AwaitStageActionStep
  | RailResetStep;

/** Steps that carry `delayMs` — every variant except the three that block
 * instead of waiting (`actMarker`, `awaitApproval`, `awaitStageAction`). */
export type ScenarioTimedStep = Exclude<
  ScenarioStep,
  ActMarkerStep | AwaitApprovalStep | AwaitStageActionStep
>;

export interface SentinelScenario {
  id: string;
  steps: ScenarioStep[];
}

// ---------------------------------------------------------------------------
// Published message union — what ScenarioPlayer#subscribe/onMessage sees.
// ---------------------------------------------------------------------------

/** The message union minus `seq`, kept separate so `SentinelStreamMessage`
 * can attach it via intersection (`&`), which — unlike `Omit` on a union —
 * distributes over each member correctly and keeps the discriminant intact. */
export type SentinelStreamMessageBase =
  | { type: 'actMarker'; act: 1 | 2 | 3; title: string }
  | { type: 'emitEvent'; event: StreamEvent; highlight?: boolean; complianceBadge?: string }
  | {
      type: 'graphStep';
      nodeId: SentinelNodeId;
      nodeState: SentinelNodeState;
      animatedEdges?: SentinelGraphEdge[];
      detail?: string;
    }
  /** Chunked narration delta — the typing effect. `done` marks the final
   * chunk of this narration id. */
  | { type: 'narrationDelta'; id: string; delta: string; done: boolean }
  | { type: 'render'; id: string; instruction: SentinelRenderInstruction }
  | { type: 'approvalRequest'; id: string; payload: ApprovalCardProps }
  | { type: 'approvalResolved'; id: string; approved: boolean }
  | { type: 'counterUpdate'; counter: SentinelCounter; caption?: string }
  | { type: 'auditWrite'; entry: Omit<EventLogEntry, 'id' | 'timestamp'> }
  | { type: 'policyPanel'; panel: PolicyPanelState }
  | { type: 'stageActionRequest'; id: string; action: 'policy-drop' }
  | { type: 'stageActionResolved'; id: string }
  | { type: 'railReset' };

/** Every message carries a monotonically increasing `seq` — the ordering
 * guarantee downstream consumers (and player.test.ts) rely on. */
export type SentinelStreamMessage = SentinelStreamMessageBase & { seq: number };

// ---------------------------------------------------------------------------
// Derived stage state — `ScenarioPlayer#getSnapshot()`.
// ---------------------------------------------------------------------------

export type SentinelContextItem =
  | { kind: 'narration'; id: string; text: string; done: boolean }
  | { kind: 'render'; id: string; instruction: SentinelRenderInstruction }
  | { kind: 'approval'; id: string; payload: ApprovalCardProps; decision?: 'approved' | 'denied' };

/** The renderer-friendly snapshot (v1 invariant 5b: "zero business logic in
 * components"). Immutable — `getSnapshot()` returns a new object identity
 * only when state actually changed, so `useSyncExternalStore` consumers
 * re-render exactly when they should and never mutate this in place. */
export interface SentinelStageState {
  status: 'idle' | 'playing' | 'paused' | 'awaiting-approval' | 'awaiting-stage-action' | 'done';
  act: 0 | 1 | 2 | 3;
  speed: 1 | 2;
  railEvents: Array<{ event: StreamEvent; highlight: boolean; complianceBadge?: string }>;
  counter: SentinelCounter;
  counterCaption?: string;
  graph: {
    nodes: Record<SentinelNodeId, SentinelNodeState>;
    animatedEdges: SentinelGraphEdge[];
    /** Per-node activity caption (GraphStep's `detail` doc comment above) —
     * a node present here has its caption overridden; a node absent falls
     * back to its plain state word. Partial, not the full six-node record:
     * most nodes have no scripted detail most of the time. */
    nodeDetails: Partial<Record<SentinelNodeId, string>>;
  };
  /** Latest narration text so far — the status ticker mirrors it (brief
   * §4). Grows as `narrationDelta` messages arrive for the in-progress
   * line; holds the completed text of the most recent line once done. */
  headline: string;
  contextItems: SentinelContextItem[];
  auditEntries: Array<Omit<EventLogEntry, 'id' | 'timestamp'> & { seq: number }>;
  messages: SentinelStreamMessage[];
  /** Act II's policy drawer state (brief §3 beat 1) — a pure snapshot field,
   * driven only by `policyPanel` steps. */
  policyPanel: PolicyPanelState;
  /** Set while `status === 'awaiting-stage-action'`; mirrors
   * `pendingApproval`'s role for `awaiting-approval`. */
  pendingStageAction: { id: string; action: 'policy-drop' } | null;
}

/** All six graph nodes start idle — the fixed layout brief §4 describes. */
export const SENTINEL_NODE_IDS: readonly SentinelNodeId[] = [
  'orchestrator',
  'policy-analyst',
  'rule-engineer',
  'data-collector',
  'critic',
  'approval-gate',
];
