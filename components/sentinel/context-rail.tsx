"use client";

// Context Rail — right panel (brief §4). Pure renderer of `Stage`'s
// `ScenarioPlayer` snapshot (v1 invariant 5b): props in, JSX out, no lib/soe
// or lib/sentinel imports, no derived facts. Callbacks are forwarded
// upstream only — this component never talks to the player directly.
//
// P3 (W3.2) replaced the P1 placeholder with Act II's real context stream:
// `items` renders in order, one branch per `SentinelContextItem` kind
// (lib/sentinel/scenario/types.ts):
//   - `narration` — a paragraph, with a typing caret appended while
//     `!done` (the scenario's chunked narrationDelta messages land here).
//   - `render` — routed through `SentinelEvidenceRenderer`
//     (components/sentinel/evidence), which handles both Sentinel-only
//     components (RuleDiff) and the full v1 registry.
//   - `approval` — `ApprovalCard`, wired to `onResolveApproval`. Disabled
//     once a decision is recorded or when no handler was supplied (the
//     hard-block gate, v1 brief §5d — no auto-approve, no timeout).
// `onResolveApproval` is optional so the pre-P3 `<ContextRail items={...} />`
// call site keeps compiling until it's wired to the player.
//
// The scroll container auto-follows: newest content is always in view for
// the presenter demo (brief §1) — an instant `scrollTop` jump on every
// `items` change, no smooth-scroll easing, no scroll-position preservation.

import { useEffect, useRef } from "react";
import { ApprovalCard } from "@/components/registry";
import type { SentinelContextItem } from "@/lib/sentinel/scenario/types";
import { SentinelEvidenceRenderer } from "./evidence";

export function ContextRail({
  items,
  onResolveApproval,
}: {
  items: SentinelContextItem[];
  onResolveApproval?: (id: string, approved: boolean) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [items]);

  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card ring-1 ring-foreground/5">
      <header className="shrink-0 border-b border-border px-4 py-3.5">
        <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Context
        </h2>
      </header>
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6">
        {items.length === 0 ? (
          <ManualReviewCard />
        ) : (
          <ContextStream items={items} onResolveApproval={onResolveApproval} />
        )}
      </div>
    </section>
  );
}

/** The status quo the demo indicts (brief §3 Act I beat 1): before any
 * policy automation, this is what "coverage" looks like. All copy is
 * static — there is no real review schedule to derive it from. */
function ManualReviewCard() {
  return (
    <div className="flex h-full flex-col justify-center gap-4 rounded-xl border border-border bg-muted/40 px-5 py-6">
      <span className="w-fit rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Manual review
      </span>
      <dl className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-base text-muted-foreground">Next scheduled sampling</dt>
          <dd className="text-lg font-semibold text-foreground">Monday 9:00 AM</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-base text-muted-foreground">Coverage</dt>
          <dd className="text-lg font-semibold text-foreground">Business hours only</dd>
        </div>
      </dl>
      <p className="text-sm text-muted-foreground">
        No automated policy checks run against this stream.
      </p>
    </div>
  );
}

/** Act II's real context stream (brief §3 beats 2–4): streamed narration
 * typed live, progressive evidence cards, and approval gates, in the order
 * the scenario emitted them. */
function ContextStream({
  items,
  onResolveApproval,
}: {
  items: SentinelContextItem[];
  onResolveApproval?: (id: string, approved: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      {items.map((item) => {
        switch (item.kind) {
          case "narration":
            return (
              <p key={item.id} className="text-base leading-relaxed text-foreground">
                {item.text}
                {!item.done ? (
                  <span
                    aria-hidden
                    className="ml-0.5 inline-block h-4 w-2 animate-pulse bg-primary/70 align-middle"
                  />
                ) : null}
              </p>
            );
          case "render":
            return <SentinelEvidenceRenderer key={item.id} instruction={item.instruction} />;
          case "approval":
            return (
              <ApprovalCard
                key={item.id}
                {...item.payload}
                decision={item.decision}
                disabled={item.decision !== undefined || !onResolveApproval}
                onApprove={() => onResolveApproval?.(item.id, true)}
                onDecline={() => onResolveApproval?.(item.id, false)}
              />
            );
        }
      })}
    </div>
  );
}
