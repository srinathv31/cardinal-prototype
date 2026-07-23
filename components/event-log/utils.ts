// Presentation-only helpers for the Event Log screen (brief §5b — "zero
// business logic in components"). Every function here is mechanical string
// formatting, tone classification, or a predicate over already-shaped wire
// data (EventLogEntry) — never arithmetic or data derivation. Deliberately
// self-contained rather than importing components/run-view/utils.ts (that
// module is a different work item's read-only reference, not a shared
// dependency) — behavior here differs anyway: malformed dates render "—"
// per brief §8, where the run view falls back to the raw ISO string.

import type { EventLogEntry, EventLogEntryKind, EventLogActor } from '@/lib/events/types';

/** "HH:MM:SS", 24-hour, local time. Never throws on a malformed timestamp —
 * renders "—" instead (brief §8: malformed fields render as "—"). */
export function formatClockTime(iso: string | undefined): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleTimeString('en-US', { hour12: false });
}

/** Cosmetic truncation with an ellipsis — callers pair this with a `title`
 * attribute carrying the untruncated string so the full value stays
 * reachable (brief §8: "no critical info behind hover only"). */
export function truncate(value: string, maxLen: number): string {
  return value.length > maxLen ? `${value.slice(0, maxLen - 1)}…` : value;
}

/** Step -1 marks a run-level entry (lib/events/types.ts) — rendered as "—"
 * rather than a confusing negative number. */
export function formatStep(step: number | undefined): string {
  if (step === undefined || step === -1) return '—';
  return String(step);
}

/** Combines inputSummary/outputSummary into one display string. Both,
 * either, or neither may be present on a given entry (docs/wire-contract.md
 * §5); "—" when both are absent (brief §8). */
export function buildSummary(entry: EventLogEntry): string {
  const parts = [entry.inputSummary, entry.outputSummary].filter(
    (value): value is string => typeof value === 'string' && value.length > 0,
  );
  if (parts.length === 0) return '—';
  return parts.join(' → ');
}

/** Case-insensitive match against the four free-text fields the search box
 * is scoped to (runId, toolName, inputSummary, outputSummary). */
export function matchesSearch(entry: EventLogEntry, rawQuery: string): boolean {
  const query = rawQuery.trim().toLowerCase();
  if (!query) return true;
  const haystack = [entry.runId, entry.toolName, entry.inputSummary, entry.outputSummary]
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();
  return haystack.includes(query);
}

export type EntryTone = 'success' | 'destructive' | 'primary' | 'warning' | 'muted';

/** Kind → tone (spec table, W3.2): approval.granted → success;
 * approval.denied / run.failed → destructive; action.executed → primary;
 * approval.requested → warning; everything else → muted. Unknown/malformed
 * kind strings fall back to muted rather than throwing (brief §8). */
const KIND_TONE: Record<EventLogEntryKind, EntryTone> = {
  'run.started': 'muted',
  'step.completed': 'muted',
  'tool.executed': 'muted',
  'approval.requested': 'warning',
  'approval.granted': 'success',
  'approval.denied': 'destructive',
  'action.executed': 'primary',
  'run.finished': 'muted',
  'run.failed': 'destructive',
};

export function kindTone(kind: string): EntryTone {
  return KIND_TONE[kind as EventLogEntryKind] ?? 'muted';
}

/** Actor → tone: human decisions get the warning/amber tone so approval
 * gate outcomes pop against the mostly-agent audit trail; agent stays
 * muted. */
export function actorTone(actor: string): EntryTone {
  return actor === 'human' ? 'warning' : 'muted';
}

/** Border/bg/text triplet per tone — same visual family as
 * components/run-view/narration-pane.tsx's STEP_TONE_STYLES (read for
 * convention, not imported). */
export const TONE_CLASSES: Record<EntryTone, string> = {
  success: 'border-success/30 bg-success/10 text-success',
  destructive: 'border-destructive/30 bg-destructive/10 text-destructive',
  primary: 'border-primary/30 bg-primary/10 text-primary',
  warning: 'border-warning/30 bg-warning/10 text-warning',
  muted: 'border-border bg-muted/50 text-muted-foreground',
};

export interface EventLogFilterState {
  agent: string;
  kind: string;
  actor: string;
  search: string;
}

export const DEFAULT_FILTER_STATE: EventLogFilterState = {
  agent: 'all',
  kind: 'all',
  actor: 'all',
  search: '',
};

export function hasActiveFilters(filters: EventLogFilterState): boolean {
  return (
    filters.agent !== 'all' ||
    filters.kind !== 'all' ||
    filters.actor !== 'all' ||
    filters.search.trim() !== ''
  );
}

/** Mechanical predicate over already-shaped wire data — no derivation of
 * business values, no arithmetic beyond the caller's counts (W3.2 scope
 * note). */
export function applyEventLogFilters(
  entries: EventLogEntry[],
  filters: EventLogFilterState,
): EventLogEntry[] {
  return entries.filter(
    (entry) =>
      (filters.agent === 'all' || entry.agentId === filters.agent) &&
      (filters.kind === 'all' || entry.kind === filters.kind) &&
      (filters.actor === 'all' || (entry.actor as EventLogActor) === filters.actor) &&
      matchesSearch(entry, filters.search),
  );
}

/** Newest-first — the store and GET /api/events return oldest-first
 * (docs/wire-contract.md §1); this is presentational ordering only. */
export function sortNewestFirst(entries: EventLogEntry[]): EventLogEntry[] {
  return [...entries].sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}
