// Registry renderer — pure presentation only (brief §5b). All bar magnitudes,
// display values, and detail lines are preformatted/computed server-side
// (lib/agents/ask/resolvers.ts); the only computation here is bar-width
// geometry (a ratio against the max value), never business arithmetic.
// Plain CSS bars — no Recharts — so this renders identically on a projector
// with no chart-library layout quirks (brief §8).

import { cn } from "@/lib/utils";
import type { BarBreakdownProps } from "@/lib/registry/schemas";

const toneBarClasses: Record<string, string> = {
  neutral: "bg-primary/70",
  positive: "bg-success/70",
  warning: "bg-warning/70",
  critical: "bg-destructive/70",
};

const toneTextClasses: Record<string, string> = {
  neutral: "text-foreground",
  positive: "text-success",
  warning: "text-warning",
  critical: "text-destructive",
};

export function BarBreakdown({ title, bars, footnote }: BarBreakdownProps) {
  const max = Math.max(...bars.map((bar) => bar.value), 1);

  return (
    <div className="rounded-xl border border-border bg-card p-4 ring-1 ring-foreground/5">
      <h3 className="mb-4 text-base font-semibold">{title}</h3>
      <div className="flex flex-col gap-3.5">
        {bars.map((bar, index) => {
          const widthPct = Math.max((bar.value / max) * 100, 2);
          return (
            <div key={`${bar.label}-${index}`} className="flex flex-col gap-1">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
                <span className="text-sm font-medium text-foreground">{bar.label}</span>
                <span
                  className={cn(
                    "font-mono text-sm font-semibold tabular-nums",
                    toneTextClasses[bar.tone],
                  )}
                >
                  {bar.display}
                </span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className={cn("h-full rounded-full", toneBarClasses[bar.tone])}
                  style={{ width: `${widthPct}%` }}
                />
              </div>
              {bar.detail ? (
                <span className="text-sm text-muted-foreground">{bar.detail}</span>
              ) : null}
            </div>
          );
        })}
      </div>
      {footnote ? (
        <p className="mt-4 text-sm text-muted-foreground">{footnote}</p>
      ) : null}
    </div>
  );
}
