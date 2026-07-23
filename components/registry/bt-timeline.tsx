"use client";

// Registry renderer — pure presentation only (brief §5b). Every label, date,
// and detail string arrives preformatted and validated server-side
// (lib/agents/bt-lifecycle/resolvers.ts); this component only maps each
// milestone's `kind` to a visual treatment, never business arithmetic.

import { cn } from "@/lib/utils";
import type { BTTimelineProps } from "@/lib/registry/schemas";

type Milestone = BTTimelineProps["milestones"][number];

const KIND_STYLES: Record<
  Milestone["kind"],
  { dot: string; label: string }
> = {
  past: {
    dot: "bg-muted-foreground/50",
    label: "text-muted-foreground",
  },
  today: {
    dot: "bg-primary ring-4 ring-primary/25",
    label: "font-semibold text-foreground",
  },
  cliff: {
    dot: "bg-destructive ring-4 ring-destructive/20",
    label: "font-semibold text-destructive",
  },
};

export function BTTimeline({ title, milestones, countdown }: BTTimelineProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 ring-1 ring-foreground/5">
      <div className="mb-6 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <h3 className="text-base font-semibold">{title}</h3>
        {countdown ? (
          <span className="rounded-full bg-warning/15 px-3 py-1 font-mono text-sm font-medium text-warning">
            {countdown}
          </span>
        ) : null}
      </div>

      <div className="relative flex flex-wrap items-start gap-x-4 gap-y-6">
        {/* Connecting line behind the dots. Only spans when milestones sit on
         * one row (sm+); it would misalign once items wrap to a new row. */}
        <div
          aria-hidden
          className="absolute top-[7px] right-0 left-0 hidden h-px bg-border sm:block"
        />
        {milestones.map((milestone) => {
          const style = KIND_STYLES[milestone.kind];
          return (
            <div
              key={milestone.id}
              className="relative flex min-w-36 flex-1 basis-40 flex-col gap-2"
            >
              <span
                aria-hidden
                className={cn("size-3.5 shrink-0 rounded-full", style.dot)}
              />
              <div className="flex flex-col gap-0.5 pr-2">
                <span className={cn("text-sm", style.label)}>{milestone.label}</span>
                <span className="font-mono text-sm text-muted-foreground">
                  {milestone.date}
                </span>
                {milestone.detail ? (
                  <span className="text-sm text-muted-foreground">{milestone.detail}</span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
