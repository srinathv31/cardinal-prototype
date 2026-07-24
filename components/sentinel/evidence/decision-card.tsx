"use client";

// Sentinel evidence card — the Decision Card (Act III, Addendum v2.1:
// CARDINAL_V2_SENTINEL_BRIEF.md's closing addendum, wire-contract §9.6,
// lib/sentinel/registry.ts's `DecisionCardProps`). This is the card that
// answers the "if-statement wearing a chat UI" critique the addendum names:
// R1's verdict (RuleCitation) is deterministic and stays that way, but the
// RESPONSE to that verdict is a judgment call among compliant alternatives,
// and this card is where that judgment becomes visible on stage.
//
// Pure renderer, zero derivation: every option's `label`/`summary`/
// `rationale` arrives preformatted from the scenario step, and `status` is
// scripted, NEVER inferred here from `rationale`'s presence or from the
// other options' statuses (v1 invariant 5a/5b — same rule RuleCitation's
// `verdict` field carries, registry.ts's doc comment). The demo re-renders
// this card three times under the same `render` id (wire-contract §9.2's
// same-id replace-in-place) — all `'considering'`, then one rejection, then
// the final selected/rejected/rejected resolution — so `options` is mapped
// by array order, not re-sorted or grouped by status: the card must read as
// the SAME three rows progressively resolving, never as a reshuffled list.

import { Check, Circle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DecisionCardProps } from "@/lib/sentinel/registry";

type OptionStatus = DecisionCardProps["options"][number]["status"];

const STATUS_PRESENTATION: Record<
  OptionStatus,
  { rowClassName: string; icon: "check" | "x" | "circle"; iconClassName: string; tag?: string }
> = {
  selected: {
    rowClassName: "border-success/50 bg-success/5",
    icon: "check",
    iconClassName: "bg-success/15 text-success",
  },
  rejected: {
    rowClassName: "border-border bg-muted/30 opacity-70",
    icon: "x",
    iconClassName: "bg-muted text-muted-foreground",
    tag: "Rejected",
  },
  considering: {
    rowClassName: "border-border bg-card",
    icon: "circle",
    iconClassName: "bg-muted/60 text-muted-foreground",
  },
};

export function DecisionCard({ title, subtitle, options, footnote }: DecisionCardProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 ring-1 ring-foreground/5">
      <div>
        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        {subtitle ? (
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        ) : null}
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {options.map((option) => {
          const presentation = STATUS_PRESENTATION[option.status];
          return (
            <div
              key={option.id}
              className={cn(
                "rounded-lg border px-4 py-3.5 transition-colors duration-300",
                presentation.rowClassName,
              )}
            >
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full",
                    presentation.iconClassName,
                  )}
                >
                  {presentation.icon === "check" ? (
                    <Check className="size-4" />
                  ) : presentation.icon === "x" ? (
                    <X className="size-4" />
                  ) : (
                    <Circle className="size-2.5 fill-current" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4
                      className={cn(
                        "text-base font-semibold",
                        option.status === "rejected" ? "text-muted-foreground" : "text-foreground",
                      )}
                    >
                      {option.label}
                    </h4>
                    {presentation.tag ? (
                      <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                        {presentation.tag}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {option.summary}
                  </p>
                  {option.rationale ? (
                    <p
                      className={cn(
                        "mt-2 text-sm leading-relaxed",
                        option.status === "selected" ? "text-success" : "text-foreground/80",
                      )}
                    >
                      {option.rationale}
                    </p>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {footnote ? (
        <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
          {footnote}
        </p>
      ) : null}
    </div>
  );
}
