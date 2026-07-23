// Registry renderer — pure presentation only (brief §5b). Props arrive
// preformatted and validated server-side (lib/registry/schemas.ts); this
// component renders them verbatim and performs no arithmetic.

import { cn } from "@/lib/utils";
import type { MetricRowProps } from "@/lib/registry/schemas";

const toneClasses: Record<string, string> = {
  neutral: "text-foreground",
  positive: "text-success",
  warning: "text-warning",
  critical: "text-destructive",
};

export function MetricRow({ metrics }: MetricRowProps) {
  return (
    <div
      className="grid gap-3"
      style={{ gridTemplateColumns: "repeat(auto-fit, minmax(11rem, 1fr))" }}
    >
      {metrics.map((metric, index) => (
        <div
          key={`${metric.label}-${index}`}
          className="flex flex-col gap-1.5 rounded-xl border border-border bg-card px-4 py-3.5 ring-1 ring-foreground/5"
        >
          <span className="text-sm font-medium text-muted-foreground">
            {metric.label}
          </span>
          <span
            className={cn(
              "font-mono text-2xl font-semibold tabular-nums tracking-tight",
              toneClasses[metric.tone],
            )}
          >
            {metric.value}
          </span>
          {metric.delta ? (
            <span className="text-sm text-muted-foreground">
              {metric.delta}
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}
