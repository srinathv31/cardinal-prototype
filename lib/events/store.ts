// In-memory Event Log store (brief §5e). Cached on globalThis so dev-mode
// HMR module reloads don't wipe accumulated entries — every agent step (via
// lib/events/telemetry.ts) and every human approval decision (via the stream
// route) funnels through append() here; GET /api/events and the Event Log
// screen read it back through query(). Swapping to a real sink in production
// only touches this module (brief §5e: "the log store itself is
// in-memory/seeded").

import type { EventLogEntry } from './types';

const STORE_CAP = 2000;

declare global {
  // HMR-safe singletons — see module comment above for why these live on
  // globalThis instead of module-scope consts. `var` is required by
  // `declare global` ambient syntax.
  var __cardinalEventLog: EventLogEntry[] | undefined;
  var __cardinalEventLogSeq: number | undefined;
  var __cardinalHumanDecisions: Set<string> | undefined;
}

function getEntries(): EventLogEntry[] {
  return (globalThis.__cardinalEventLog ??= []);
}

function getHumanDecisions(): Set<string> {
  return (globalThis.__cardinalHumanDecisions ??= new Set());
}

function nextId(): string {
  const seq = (globalThis.__cardinalEventLogSeq ?? 0) + 1;
  globalThis.__cardinalEventLogSeq = seq;
  return `evt-${seq}`;
}

export interface AppendOptions {
  /**
   * Idempotency key for human approval decisions (see hasHumanDecision).
   * Intentionally not part of EventLogEntry itself — approvalId is plumbing
   * for the stream route's resume handling, not part of the wire-contract
   * shape (docs/wire-contract.md §5).
   */
  approvalId?: string;
}

/** Appends one entry, filling `id` and `timestamp`. Oldest-first storage;
 * trims from the front once STORE_CAP is exceeded. */
export function append(
  entry: Omit<EventLogEntry, 'id' | 'timestamp'>,
  options?: AppendOptions,
): EventLogEntry {
  const full: EventLogEntry = {
    ...entry,
    id: nextId(),
    timestamp: new Date().toISOString(),
  };
  const entries = getEntries();
  entries.push(full);
  if (entries.length > STORE_CAP) {
    entries.splice(0, entries.length - STORE_CAP);
  }
  if (options?.approvalId && entry.actor === 'human') {
    getHumanDecisions().add(options.approvalId);
  }
  return full;
}

export interface QueryFilter {
  runId?: string;
  agentId?: string;
  /** ISO timestamp, exclusive lower bound. */
  since?: string;
}

/** Oldest-first, filtered. All params optional and ANDed
 * (docs/wire-contract.md §1). */
export function query(filter: QueryFilter = {}): EventLogEntry[] {
  return getEntries().filter(
    (e) =>
      (!filter.runId || e.runId === filter.runId) &&
      (!filter.agentId || e.agentId === filter.agentId) &&
      (!filter.since || e.timestamp > filter.since),
  );
}

/** Clears all entries and idempotency state (demo reset control, brief §8.5). */
export function reset(): void {
  getEntries().length = 0;
  getHumanDecisions().clear();
  globalThis.__cardinalEventLogSeq = 0;
}

/** True if a human decision for this approvalId has already been logged —
 * lets the stream route re-scan full message history on every resume POST
 * without double-logging the same approve/deny click. */
export function hasHumanDecision(approvalId: string): boolean {
  return getHumanDecisions().has(approvalId);
}
