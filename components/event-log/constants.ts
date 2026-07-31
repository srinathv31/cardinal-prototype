// Locally hardcoded filter vocabularies for the Event Log screen (W3.2).
//
// Agent list is intentionally NOT imported from lib/agents/registry: that
// module's AGENT_IDS/AGENT_NAMES are value exports reserved for server-side
// agent dispatch (see that file's own header comment — "must never be
// value-imported from a client component"), and this screen is a client
// component (brief §5b).
//
// live-llm cleanup (LIVE_LLM_PLAN.md Phase A): payment-health, bt-lifecycle,
// au-growth, and ask are deleted agents — only the two demo-phase surfaces
// remain.
export const AGENT_FILTER_OPTIONS: readonly { id: string; label: string }[] = [
  { id: 'ops', label: 'Ops' },
  { id: 'servicing', label: 'Servicing' },
];

export const AGENT_LABELS: Record<string, string> = Object.fromEntries(
  AGENT_FILTER_OPTIONS.map((option) => [option.id, option.label]),
);

// Exactly the nine EventLogEntryKind members (lib/events/types.ts) — kept as
// a literal list (rather than derived) since a union type has no runtime
// representation to iterate.
export const KIND_FILTER_OPTIONS: readonly string[] = [
  'run.started',
  'step.completed',
  'tool.executed',
  'approval.requested',
  'approval.granted',
  'approval.denied',
  'action.executed',
  'run.finished',
  'run.failed',
];

export const ACTOR_FILTER_OPTIONS: readonly string[] = ['agent', 'human'];

// Sentinel used by the Select primitives — Radix Select rejects an empty-
// string item value, so "All" needs a non-empty placeholder mapped back to
// "no filter" at the query-building boundary.
export const ALL_FILTER_VALUE = 'all';
