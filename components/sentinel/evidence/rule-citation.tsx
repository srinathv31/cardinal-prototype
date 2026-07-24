"use client";

// Sentinel evidence card — the rule citation card (brief §3 Act III beat 2:
// "R1 text with both conditions checked ✓✓", and the R2 pass-check),
// wire-contract §9.6, lib/sentinel/registry.ts's `RuleCitationProps`. Pure
// renderer, zero derivation: `ruleText` and every check's `label`/`detail`
// arrive preformatted from the scenario step (v1 invariant 5a/5b).
//
// `verdict` is scripted, never derived from `checks` here — a card with
// every check `met: true` reads as a violation for R1 (all violation
// conditions confirmed) and as a pass for R2 (the compliance condition
// confirmed); only the scenario step knows which, so the check icons take
// their color from `verdict`, not from any judgment made in this component.

import { CheckCircle2, Circle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { RuleCitationProps } from "@/lib/sentinel/registry";

const VERDICT_PRESENTATION: Record<
  RuleCitationProps["verdict"],
  { label: string; chipClassName: string; checkClassName: string }
> = {
  violation: {
    label: "Violation",
    chipClassName: "bg-destructive/15 text-destructive",
    checkClassName: "text-destructive",
  },
  pass: {
    label: "Compliant",
    chipClassName: "bg-success/15 text-success",
    checkClassName: "text-success",
  },
};

export function RuleCitation({
  ruleId,
  title,
  ruleText,
  verdict,
  checks,
}: RuleCitationProps) {
  const presentation = VERDICT_PRESENTATION[verdict];

  return (
    <div className="rounded-xl border border-border bg-card p-5 ring-1 ring-foreground/5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="h-6 font-mono text-sm">
          {ruleId}
        </Badge>
        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        <span
          className={cn(
            "ml-auto inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold tracking-wide uppercase",
            presentation.chipClassName,
          )}
        >
          {presentation.label}
        </span>
      </div>

      <blockquote className="mt-3 border-l-2 border-primary/40 pl-3 text-base leading-relaxed text-foreground/80 italic">
        {ruleText}
      </blockquote>

      <ul className="mt-4 flex flex-col gap-3 border-t border-border pt-4">
        {checks.map((check, index) => (
          <li key={`${check.label}-${index}`} className="flex items-start gap-2.5">
            {check.met ? (
              <CheckCircle2
                className={cn("mt-0.5 size-5 shrink-0", presentation.checkClassName)}
              />
            ) : (
              <Circle className="mt-0.5 size-5 shrink-0 text-muted-foreground/50" />
            )}
            <div>
              <p
                className={cn(
                  "text-base font-medium",
                  check.met ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {check.label}
              </p>
              {check.detail ? (
                <p className="mt-0.5 text-sm text-muted-foreground">{check.detail}</p>
              ) : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
