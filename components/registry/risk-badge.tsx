// Registry renderer — pure presentation only (brief §5b). `level` is derived
// server-side from payment/utilization data; `rationale` is model-authored
// editorial text (the one exception in §5a) and is rendered verbatim. This is
// a hero element in the demo run view — sized and colored for confidence, not
// a small pill.

import { ShieldAlert, ShieldCheck, ShieldX } from "lucide-react";
import { cn } from "@/lib/utils";
import type { RiskBadgeProps } from "@/lib/registry/schemas";

const levelPresentation: Record<
  RiskBadgeProps["level"],
  {
    label: string;
    icon: typeof ShieldCheck;
    chipClassName: string;
    cardClassName: string;
    iconClassName: string;
  }
> = {
  low: {
    label: "Low",
    icon: ShieldCheck,
    chipClassName: "bg-success/15 text-success",
    cardClassName: "border-success/30",
    iconClassName: "text-success",
  },
  elevated: {
    label: "Elevated",
    icon: ShieldAlert,
    chipClassName: "bg-warning/15 text-warning",
    cardClassName: "border-warning/30",
    iconClassName: "text-warning",
  },
  high: {
    label: "High",
    icon: ShieldX,
    chipClassName: "bg-destructive/15 text-destructive",
    cardClassName: "border-destructive/30",
    iconClassName: "text-destructive",
  },
};

export function RiskBadge({ level, headline, rationale }: RiskBadgeProps) {
  const presentation = levelPresentation[level];
  const Icon = presentation.icon;

  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-5 ring-1 ring-foreground/5",
        presentation.cardClassName,
      )}
    >
      <div className="flex items-start gap-4">
        <div
          className={cn(
            "flex size-12 shrink-0 items-center justify-center rounded-full bg-background/60",
            presentation.iconClassName,
          )}
        >
          <Icon className="size-6" />
        </div>
        <div className="flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <span
              className={cn(
                "inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold tracking-wide uppercase",
                presentation.chipClassName,
              )}
            >
              {presentation.label} risk
            </span>
          </div>
          <p className="text-lg font-semibold text-foreground">{headline}</p>
          <p className="text-base leading-relaxed text-muted-foreground">
            {rationale}
          </p>
        </div>
      </div>
    </div>
  );
}
