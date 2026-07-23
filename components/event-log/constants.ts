// Locally hardcoded filter vocabularies for the Event Log screen (W3.2).
//
// Agent list is intentionally NOT imported from lib/agents/registry: that
// module's AGENT_IDS/AGENT_NAMES are value exports reserved for server-side
// agent dispatch (see that file's own header comment — "must never be
// value-imported from a client component"), and this screen is a client
// component (brief §5b). 'ask' is included ahead of its own parallel work
// item (W3.3) landing in the registry — its runs already write to the
// shared event store, so the filter needs the option now.
export const AGENT_FILTER_OPTIONS: readonly { id: string; label: string }[] = [
  { id: 'payment-health', label: 'Payment Health' },
  { id: 'bt-lifecycle', label: 'BT Lifecycle' },
  { id: 'au-growth', label: 'AU Growth' },
  { id: 'ask', label: 'Ask' },
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
