// Graph types for the live ops rail (components/sentinel/live-agent-graph.tsx
// + components/ops/graph-state.ts — the "DECORATIVE" spectacle graph beside
// the /ops chat, brief §4).
//
// live-llm cleanup (LIVE_LLM_PLAN.md Phase A): this file used to be the
// ScenarioPlayer wire-type module (v3, CARDINAL_V3_AU_BRIEF.md §6) — the
// `ScenarioStep` union, `SentinelStreamMessage`, `SentinelChatTurn`,
// `SentinelContextItem`, `SentinelStageState`, `PolicyPanelState`,
// `SentinelCounter`, and everything else that only served the deleted
// `ScenarioPlayer`. Only the four members the live graph actually imports
// survive: `SentinelNodeId`, `SentinelNodeState`, `SentinelGraphEdge`, and
// `SENTINEL_NODE_IDS`.

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

/** All six graph nodes start idle — the fixed layout brief §4 describes. */
export const SENTINEL_NODE_IDS: readonly SentinelNodeId[] = [
  'orchestrator',
  'policy-analyst',
  'rule-engineer',
  'data-collector',
  'critic',
  'approval-gate',
];
