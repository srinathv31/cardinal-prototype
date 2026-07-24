"use client";

// Sentinel evidence card — the Rule Diff view (brief §3 Act II beat 3,
// wire-contract §9.6, lib/sentinel/registry.ts's `RuleDiffProps`). Pure
// renderer, zero derivation: every string — the excerpt, the plain-English
// restatement, the machine footer, the critic note — arrives preformatted
// from the scenario step (v1 invariant 5b, brief §5a: "the model never
// generates a number, date, name, or balance"). `validated` and `status`
// are likewise scenario-set, never inferred here.
//
// The proposed→active status chip is the visible "arming" moment: the
// presenter approves activation (brief §3 Act II beat 4) and the same
// render `id` re-renders with `status: 'active'` (wire-contract §9.2's
// render-step replace-in-place semantics) — kept prominent, not a small
// pill, so the flip reads from the back of the room.

import { ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { RuleDiffProps } from "@/lib/sentinel/registry";

const STATUS_PRESENTATION: Record<
  RuleDiffProps["status"],
  { label: string; className: string }
> = {
  proposed: {
    label: "Proposed",
    className: "bg-warning/15 text-warning",
  },
  active: {
    label: "Active",
    className: "bg-success/15 text-success",
  },
};

export function RuleDiff({ title, status, rules }: RuleDiffProps) {
  const statusPresentation = STATUS_PRESENTATION[status];

  return (
    <div className="rounded-xl border border-border bg-card p-5 ring-1 ring-foreground/5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        <span
          className={cn(
            "inline-flex items-center rounded-full px-3.5 py-1.5 text-sm font-semibold tracking-wide uppercase",
            statusPresentation.className,
          )}
        >
          {statusPresentation.label}
        </span>
      </div>

      <div className="mt-4 flex flex-col divide-y divide-border">
        {rules.map((rule) => (
          <div
            key={rule.ruleId}
            className="grid grid-cols-[minmax(0,5fr)_minmax(0,6fr)] gap-6 py-5 first:pt-0 last:pb-0"
          >
            {/* LEFT — the citation. */}
            <div>
              <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
                § {rule.excerpt.sectionHeading}
              </p>
              <blockquote className="mt-2 border-l-2 border-primary/40 pl-3 text-sm leading-relaxed text-foreground/80 italic">
                {rule.excerpt.quote}
              </blockquote>
            </div>

            {/* RIGHT — the extracted rule. */}
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className="h-6 font-mono text-sm">
                  {rule.ruleId}
                </Badge>
                <h4 className="text-base font-semibold text-foreground">
                  {rule.title}
                </h4>
                {rule.validated ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-xs font-semibold text-success">
                    ✓ Validated
                  </span>
                ) : null}
              </div>
              <p className="mt-2 text-base leading-relaxed text-foreground/90">
                {rule.plainEnglish}
              </p>
              <p className="mt-3 border-t border-border pt-2 font-mono text-xs text-muted-foreground">
                {rule.machine.ruleId} · {rule.machine.datasetsTouched.join(" + ")} · on{" "}
                {rule.machine.evaluationTrigger}
              </p>
              {rule.criticNote ? (
                <div className="mt-3 flex items-start gap-2 rounded-lg bg-muted/50 px-3 py-2.5 text-sm leading-relaxed text-foreground/90">
                  <ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <span>{rule.criticNote}</span>
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
