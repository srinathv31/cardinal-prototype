// Filter bar for the Event Log table (W3.2). Purely presentational —
// filtering the already-fetched EventLogEntry[] happens in
// event-log-table.tsx; this component only renders controls and reports
// changes upward.

import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { AGENT_FILTER_OPTIONS, ACTOR_FILTER_OPTIONS, KIND_FILTER_OPTIONS } from './constants';
import type { EventLogFilterState } from './utils';

export function EventLogFilterBar({
  filters,
  onChange,
  onClear,
  isFilterActive,
  shown,
  total,
}: {
  filters: EventLogFilterState;
  onChange: (next: EventLogFilterState) => void;
  onClear: () => void;
  isFilterActive: boolean;
  shown: number;
  total: number;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={filters.agent}
          onValueChange={(value) => onChange({ ...filters, agent: value })}
        >
          <SelectTrigger aria-label="Filter by agent" className="min-w-36">
            <SelectValue placeholder="All agents" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All agents</SelectItem>
            {AGENT_FILTER_OPTIONS.map((option) => (
              <SelectItem key={option.id} value={option.id}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={filters.kind} onValueChange={(value) => onChange({ ...filters, kind: value })}>
          <SelectTrigger aria-label="Filter by kind" className="min-w-40">
            <SelectValue placeholder="All kinds" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All kinds</SelectItem>
            {KIND_FILTER_OPTIONS.map((kind) => (
              <SelectItem key={kind} value={kind}>
                {kind}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={filters.actor}
          onValueChange={(value) => onChange({ ...filters, actor: value })}
        >
          <SelectTrigger aria-label="Filter by actor" className="min-w-32">
            <SelectValue placeholder="All actors" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All actors</SelectItem>
            {ACTOR_FILTER_OPTIONS.map((actor) => (
              <SelectItem key={actor} value={actor} className="capitalize">
                {actor}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Input
          value={filters.search}
          onChange={(event) => onChange({ ...filters, search: event.target.value })}
          placeholder="Search run, tool, or summary…"
          aria-label="Search event log"
          className="w-64"
        />

        {isFilterActive ? (
          <Button size="sm" variant="ghost" onClick={onClear}>
            <X />
            Clear filters
          </Button>
        ) : null}
      </div>

      <p className="text-sm text-muted-foreground">
        Showing {shown} of {total} entries
      </p>
    </div>
  );
}
