'use client';

// Event Log screen (brief §4 screen 5, Beat 6 — the governance close: "every
// agent run, every tool call, every approval, timestamped and attributable").
// Pure renderer of GET /api/events (docs/wire-contract.md §1) — polls the
// unfiltered endpoint, then applies client-side filter/search as a
// mechanical predicate over the already-shaped EventLogEntry[] (brief §5b:
// presentational filtering is fine, no derivation of business values).

import { useEffect, useState } from 'react';
import { RadioTower } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { EventLogEntry } from '@/lib/events/types';
import { ActorBadge, KindBadge } from './badges';
import { EventLogFilterBar } from './filter-bar';
import { AGENT_LABELS } from './constants';
import {
  applyEventLogFilters,
  buildSummary,
  DEFAULT_FILTER_STATE,
  formatClockTime,
  formatStep,
  hasActiveFilters,
  sortNewestFirst,
  truncate,
  type EventLogFilterState,
} from './utils';

const POLL_INTERVAL_MS = 2000;

export function EventLogTable() {
  const [entries, setEntries] = useState<EventLogEntry[]>([]);
  // True only while the most recent poll failed — the last good `entries`
  // are left untouched (brief §8: "a failed poll keeps the last good data
  // and shows a quiet reconnecting… chip").
  const [reconnecting, setReconnecting] = useState(false);
  const [filters, setFilters] = useState<EventLogFilterState>(DEFAULT_FILTER_STATE);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const response = await fetch('/api/events', { cache: 'no-store' });
        if (!response.ok) throw new Error(`status ${response.status}`);
        const data = (await response.json()) as { entries: EventLogEntry[] };
        if (cancelled) return;
        setEntries(data.entries);
        setReconnecting(false);
      } catch {
        if (cancelled) return;
        setReconnecting(true);
      }
    }

    poll(); // fetch immediately on mount, then settle into the interval
    const intervalId = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(intervalId);
    };
  }, []);

  const filtered = sortNewestFirst(applyEventLogFilters(entries, filters));
  const filterActive = hasActiveFilters(filters);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <EventLogFilterBar
          filters={filters}
          onChange={setFilters}
          onClear={() => setFilters(DEFAULT_FILTER_STATE)}
          isFilterActive={filterActive}
          shown={filtered.length}
          total={entries.length}
        />
        {reconnecting ? (
          <span className="flex shrink-0 items-center gap-1.5 self-start rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs font-medium text-muted-foreground">
            <RadioTower className="size-3 animate-pulse" />
            Reconnecting…
          </span>
        ) : null}
      </div>

      {entries.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="rounded-xl border border-border bg-card/60 ring-1 ring-foreground/5">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Time</TableHead>
                <TableHead>Agent</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Step</TableHead>
                <TableHead>Tool</TableHead>
                <TableHead>Summary</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Run</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="whitespace-normal py-6 text-center text-sm text-muted-foreground">
                    No entries match the current filters.
                  </TableCell>
                </TableRow>
              ) : (
                filtered.map((entry) => <EventLogRow key={entry.id} entry={entry} />)
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function EventLogRow({ entry }: { entry: EventLogEntry }) {
  const summary = buildSummary(entry);
  const agentLabel = AGENT_LABELS[entry.agentId] ?? (entry.agentId || '—');
  return (
    <TableRow>
      <TableCell className="font-mono text-sm">{formatClockTime(entry.timestamp)}</TableCell>
      <TableCell className="text-sm">{agentLabel}</TableCell>
      <TableCell>
        <KindBadge kind={entry.kind} />
      </TableCell>
      <TableCell className="text-sm">{formatStep(entry.step)}</TableCell>
      <TableCell className="font-mono text-sm">{entry.toolName || '—'}</TableCell>
      <TableCell
        className="max-w-xs text-sm whitespace-normal"
        title={summary === '—' ? undefined : summary}
      >
        {truncate(summary, 140)}
      </TableCell>
      <TableCell>
        <ActorBadge actor={entry.actor} />
      </TableCell>
      <TableCell className="font-mono text-sm text-muted-foreground" title={entry.runId || undefined}>
        {entry.runId ? truncate(entry.runId, 16) : '—'}
      </TableCell>
    </TableRow>
  );
}

function EmptyState() {
  return (
    <div className="grid h-64 place-items-center rounded-xl border border-dashed border-border text-center text-sm text-muted-foreground">
      No entries yet — run an agent from the Workflow Canvas or Agent Runs to
      populate the audit trail.
    </div>
  );
}
