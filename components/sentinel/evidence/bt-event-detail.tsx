"use client";

// Sentinel evidence card — the BT event detail card (brief §3 Act III beat
// 2, wire-contract §9.6, lib/sentinel/registry.ts's `BTEventDetailProps`).
// Pure renderer, zero derivation: `amount`, `timestamp`, `account`, and every
// `attributes` value arrive preformatted from the scenario step (v1
// invariant 5a/5b — "the model never generates a number, date, name, or
// balance"). `tone` is likewise scenario-set, never inferred here.
//
// This is the hero card of the investigation opener — the $3,200 figure is
// the largest type on the card, sized to read from the back of the room
// (brief §1: "big type, high contrast, nothing critical behind hover").

import { cn } from "@/lib/utils";
import type { BTEventDetailProps } from "@/lib/sentinel/registry";

const TONE_PRESENTATION: Record<
  BTEventDetailProps["tone"],
  { cardClassName: string; badge: { label: string; className: string } | null }
> = {
  neutral: {
    cardClassName: "border-border",
    badge: null,
  },
  critical: {
    cardClassName: "border-destructive/40 bg-destructive/5",
    badge: {
      label: "Under review",
      className: "bg-destructive/15 text-destructive",
    },
  },
};

export function BTEventDetail({
  title,
  account,
  amount,
  timestamp,
  tone,
  attributes,
}: BTEventDetailProps) {
  const presentation = TONE_PRESENTATION[tone];

  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-5 ring-1 ring-foreground/5",
        presentation.cardClassName,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
          {title}
        </p>
        {presentation.badge ? (
          <span
            className={cn(
              "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold tracking-wide uppercase",
              presentation.badge.className,
            )}
          >
            {presentation.badge.label}
          </span>
        ) : null}
      </div>

      <div className="mt-2 flex flex-wrap items-end justify-between gap-x-6 gap-y-1">
        <span className="font-mono text-3xl font-semibold tracking-tight text-foreground tabular-nums">
          {amount}
        </span>
        <span className="text-base text-muted-foreground">{timestamp}</span>
      </div>

      <p className="mt-1 text-base font-medium text-foreground">{account}</p>

      {attributes.length > 0 ? (
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 border-t border-border pt-4 sm:grid-cols-3">
          {attributes.map((attribute, index) => (
            <div key={`${attribute.label}-${index}`}>
              <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {attribute.label}
              </dt>
              <dd className="mt-0.5 text-base font-medium text-foreground">
                {attribute.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}
    </div>
  );
}
