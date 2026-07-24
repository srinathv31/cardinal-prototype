// ScenarioPlayer wire types (v3, CARDINAL_V3_AU_BRIEF.md §6). Two unions live
// here:
//
//   - `ScenarioStep` — the checked-in scenario file format. An ordered list
//     of timed instructions; every variant but `actMarker`/`awaitApproval`/
//     `awaitStageAction` carries `delayMs`, a pause (divided by playback
//     speed) before the step executes.
//   - `SentinelStreamMessage` — what the player actually publishes, one
//     message per step except `chatTurn` with `role: 'agent'` (chunked into
//     `narrationDelta` messages, typing-effect style), `awaitApproval` (split
//     into an `approvalRequest` message followed, once resolved, by an
//     `approvalResolved` message), and `awaitStageAction` (split into a
//     `stageActionRequest` message followed, once resolved, by an optional
//     echoed `chatTurn` and a `stageActionResolved` message).
//
// Payload shapes are REUSED wire-contract types, imported, never redeclared:
// `ApprovalCardProps` from lib/registry/schemas.ts, `EventLogEntry` from
// lib/events/types.ts. `RenderInstruction` is widened to
// `SentinelRenderInstruction` (lib/sentinel/registry.ts, wire-contract §9.6) —
// the Sentinel-only additive component namespace layered on top of v1's
// registry, which stays untouched. This file only adds the additive envelope
// types the brief calls out — `graphStep`, `chatTurn`, `counterUpdate`,
// `actMarker`, `policyPanel`, `awaitStageAction` — documented as a versioned
// contract in docs/wire-contract.md §9.
//
// v3 changes from v2 (docs/v3-migration-map.md §4): `emitEvent` and
// `railReset` are GONE (there is no replay rail in v3); `narration` has
// collapsed into `chatTurn` with `role: 'agent'` rather than coexisting with
// it; `awaitStageAction.action` widened to `'policy-drop' | 'prompt'`; and
// `counterUpdate.counter` is reshaped for an aggregate sweep. `StreamEvent`
// is no longer imported here at all.
//
// `SentinelStageState` is the derived, renderer-friendly snapshot the player
// exposes via `getSnapshot()` — stage components stay pure renderers of this
// shape (v1 invariant 5b), never of the raw message log.

import type { ApprovalCardProps } from '@/lib/registry/schemas';
import type { SentinelRenderInstruction } from '@/lib/sentinel/registry';
import type { EventLogEntry } from '@/lib/events/types';

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
 * are presenter-triggered, never automatic (brief §3). No `delayMs`: a
 * marker isn't waited for, it's a stop sign. */
export interface ActMarkerStep {
  type: 'actMarker';
  act: 1 | 2 | 3;
  title: string;
}

/** One node's state transition on the live agent graph, optionally
 * replacing the animated-edge set. `animatedEdges`, when present, REPLACES
 * the currently-animated edges wholesale — declarative, not a diff, because
 * the graph renderer holds no logic (brief §4). Omit it to leave the
 * existing edges alone.
 *
 * `detail`, when present, is a short per-node activity caption rendered
 * under the node in place of its state word (e.g. "call 2 of 3 · party
 * roles") — brief §3 Act III: "Data Collector fires three times, visibly,"
 * and a glow pulse alone doesn't read at projector distance. Like
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

/**
 * One turn in the conversation rail (brief §4) — v3's single narration step,
 * replacing v2's `narration`. The brief is explicit that the two "should
 * collapse into one step type rather than coexisting," so there is exactly
 * one way to put text on this stage:
 *
 *   - `role: 'agent'` — played back with a typing effect (fixed 3-character
 *     chunks on a fixed 16ms cadence, scaled by speed — brief §9: no
 *     randomness anywhere in the scenario path), published as one or more
 *     `narrationDelta` messages. `id` lets the stage track/replace the
 *     in-progress line as deltas arrive.
 *   - `role: 'user'` — the presenter's prompt, appended to the rail
 *     instantly and verbatim. No typing effect: a human typed it, the
 *     audience already watched that happen.
 *
 * A `user` turn is also what `awaitStageAction: 'prompt'` synthesizes on
 * resolution (see `AwaitStageActionStep`), so both the scripted and the
 * typed path produce the same message shape.
 */
export interface ChatTurnStep {
  type: 'chatTurn';
  delayMs: number;
  id: string;
  role: 'user' | 'agent';
  text: string;
}

/** The same `{ component, props }` shape the run view's evidence pane
 * consumes (docs/wire-contract.md §3), widened to `SentinelRenderInstruction`
 * (lib/sentinel/registry.ts, §9.6) — v1 registry components or the
 * Sentinel-only additive ones. A `render` step whose `id` matches an earlier
 * one REPLACES that context-rail item in place (position preserved) instead
 * of appending a second one — how Act II's rule cards flip proposed→active
 * and grow progressively, and how Act III's DecisionCard resolves its routes
 * one at a time (mirrors chat narration's same-id semantics; see player.ts's
 * `handleRender`). */
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

/** The Act II policy drawer's three states (brief §3 Act II beat 1: closed →
 * the presenter opens it and mock-drops the policy file → the document
 * preview shows). The drawer is a pure renderer of this snapshot field — no
 * component-local open/closed state. */
export type PolicyPanelState = 'closed' | 'drop' | 'preview';

/** Drives the Act II policy drawer declaratively. An instant step (no
 * blocking) — the drawer transitions the instant the message publishes. */
export interface PolicyPanelStep {
  type: 'policyPanel';
  delayMs: number;
  panel: PolicyPanelState;
}

/** The two presenter-driven staging beats v3 scripts (brief §6a). Both are
 * real human gates that are not business decisions — that is what separates
 * them from `awaitApproval`. */
export type SentinelStageActionKind = 'policy-drop' | 'prompt';

/**
 * HARD-BLOCKS playback until `ScenarioPlayer#resolveStageAction` is called —
 * mirrors `AwaitApprovalStep`'s blocking semantics (no `delayMs`, the block
 * itself is the wait, no timer, no auto-resolve outside `jumpToAct`'s
 * documented rehearsal fast-forward).
 *
 *   - `'policy-drop'` — Act II's mock file-drop into the policy panel.
 *   - `'prompt'` — Act III's conversation-rail prompt. The rail's input is
 *     enabled only while one of these is pending, and `suggested` carries the
 *     scripted prompt so the presenter can click a chip instead of typing.
 *
 * `resolveStageAction(id, text)` echoes whatever text it is given as a
 * verbatim `user` chat turn and then continues the script UNCHANGED. The
 * player never compares the text to `suggested` and never branches on it:
 * gating a live stage on exact string matching is how a demo dies (brief §9).
 * `suggested` is a UI affordance and a rehearsal fallback, never a key.
 */
export interface AwaitStageActionStep {
  type: 'awaitStageAction';
  id: string;
  action: SentinelStageActionKind;
  suggested?: string;
}

/** The aggregate-sweep counter (brief §6a). v2's `{ events, violations,
 * flagged }` counted a night of streamed events one at a time and has no
 * meaning here: v3 scans the whole book at once, so the three figures that
 * matter are how much was looked at, how much failed, and how much was
 * fixed. */
export interface SentinelCounter {
  scanned: number;
  exceptions: number;
  remediated: number;
}

/** The large-type counter beats (brief §3: Act I's "1,247 · 0 · 0", Act II's
 * policy-to-production line, Act III's closing "1,247 scanned · 87
 * exceptions"). `caption` present marks a full-size beat card rather than a
 * quiet counter tick. */
export interface CounterUpdateStep {
  type: 'counterUpdate';
  delayMs: number;
  counter: SentinelCounter;
  caption?: string;
}

/** Appends straight to the shared Event Log (via the stage's wiring to
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
  | GraphStep
  | ChatTurnStep
  | RenderStep
  | AwaitApprovalStep
  | CounterUpdateStep
  | AuditWriteStep
  | PolicyPanelStep
  | AwaitStageActionStep;

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
  | {
      type: 'graphStep';
      nodeId: SentinelNodeId;
      nodeState: SentinelNodeState;
      animatedEdges?: SentinelGraphEdge[];
      detail?: string;
    }
  /** A presenter turn — published whole and instantly, either from a scripted
   * `chatTurn` step with `role: 'user'` or from resolving an
   * `awaitStageAction: 'prompt'` with typed text. */
  | { type: 'chatTurn'; id: string; role: 'user'; text: string }
  /** Chunked agent turn — the typing effect. `done` marks the final chunk of
   * this turn's id. */
  | { type: 'narrationDelta'; id: string; delta: string; done: boolean }
  | { type: 'render'; id: string; instruction: SentinelRenderInstruction }
  | { type: 'approvalRequest'; id: string; payload: ApprovalCardProps }
  | { type: 'approvalResolved'; id: string; approved: boolean }
  | { type: 'counterUpdate'; counter: SentinelCounter; caption?: string }
  | { type: 'auditWrite'; entry: Omit<EventLogEntry, 'id' | 'timestamp'> }
  | { type: 'policyPanel'; panel: PolicyPanelState }
  | {
      type: 'stageActionRequest';
      id: string;
      action: SentinelStageActionKind;
      suggested?: string;
    }
  /** `text` carries whatever the presenter actually submitted, for the
   * record — the visible echo rides the `chatTurn` message published just
   * before this one, so a consumer that only renders `chatTurn` needs no
   * special case here. */
  | { type: 'stageActionResolved'; id: string; text?: string };

/** Every message carries a monotonically increasing `seq` — the ordering
 * guarantee downstream consumers (and player.test.ts) rely on. */
export type SentinelStreamMessage = SentinelStreamMessageBase & { seq: number };

// ---------------------------------------------------------------------------
// Derived stage state — `ScenarioPlayer#getSnapshot()`.
// ---------------------------------------------------------------------------

/** One line of the conversation rail (brief §4). `done` is false only while
 * an agent turn is still typing; user turns land `done: true`. */
export interface SentinelChatTurn {
  id: string;
  role: 'user' | 'agent';
  text: string;
  done: boolean;
}

/** v3 drops v2's `'narration'` kind: narration lives in the conversation
 * rail and evidence lives in the context rail (brief §4), so the context
 * rail's item list is evidence and gates only. */
export type SentinelContextItem =
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
  /** The conversation rail's transcript, oldest first (brief §4, §6b —
   * replaces v2's `railEvents`). */
  conversation: SentinelChatTurn[];
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
  /** Latest agent text so far — the graph's status ticker mirrors it (brief
   * §4). Grows as `narrationDelta` messages arrive for the in-progress turn;
   * holds the completed text of the most recent agent turn once done. User
   * turns never touch it: the ticker reports what the system is doing. */
  headline: string;
  contextItems: SentinelContextItem[];
  auditEntries: Array<Omit<EventLogEntry, 'id' | 'timestamp'> & { seq: number }>;
  messages: SentinelStreamMessage[];
  /** Act II's policy drawer state (brief §3 Act II beat 1) — a pure snapshot
   * field, driven only by `policyPanel` steps. */
  policyPanel: PolicyPanelState;
  /** Set while `status === 'awaiting-stage-action'`; mirrors
   * `pendingApproval`'s role for `awaiting-approval`. `suggested` is what the
   * conversation rail's suggestion chip offers for a `'prompt'` gate. */
  pendingStageAction: { id: string; action: SentinelStageActionKind; suggested?: string } | null;
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
