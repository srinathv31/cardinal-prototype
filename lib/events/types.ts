// Event Log entry shape — exactly docs/wire-contract.md §5 / brief §5e. Every
// agent step and every human approval decision becomes one of these. Kept
// deliberately flat and JSON-serializable: it is the wire shape a future
// Angular port consumes unchanged (brief §5b).

export type EventLogEntryKind =
  | 'run.started'
  | 'step.completed'
  | 'tool.executed'
  | 'approval.requested'
  | 'approval.granted' // actor: 'human'
  | 'approval.denied' // actor: 'human'
  | 'action.executed'
  | 'run.finished'
  | 'run.failed';

export type EventLogActor = 'agent' | 'human';

export interface EventLogEntry {
  /** Unique, monotonic per store (lib/events/store.ts). */
  id: string;
  runId: string;
  agentId: string;
  /** Loop step index, 0-based; -1 for run-level entries. */
  step: number;
  toolName?: string;
  /** One-line, human-readable; never a full payload dump. */
  inputSummary?: string;
  outputSummary?: string;
  actor: EventLogActor;
  /** ISO 8601. */
  timestamp: string;
  kind: EventLogEntryKind;
}
