"use client";

// Context Rail — right panel (brief §4). Pure renderer of `Stage`'s
// `ScenarioPlayer` snapshot (v1 invariant 5b): props in, JSX out, no lib/soe
// or lib/sentinel imports, no derived facts. Callbacks are forwarded
// upstream only — this component never talks to the player directly.
//
// `items` renders in order, one branch per `SentinelContextItem` kind
// (lib/sentinel/scenario/types.ts). v3 drops the `narration` kind
// (docs/v3-migration-map.md §4): narration now lives in the conversation
// rail, not here (brief §4) — this rail is evidence and gates only:
//   - `render` — routed through `SentinelEvidenceRenderer`
//     (components/sentinel/evidence), which handles both Sentinel-only
//     components (RuleDiff, RuleCitation, DecisionCard) and the full v1
//     registry.
//   - `approval` — `ApprovalCard`, wired to `onResolveApproval`. Disabled
//     once a decision is recorded or when no handler was supplied (the
//     hard-block gate, v1 brief §5d — no auto-approve, no timeout).
// `onResolveApproval` is optional so a bare `<ContextRail items={...} />`
// call site keeps compiling before it's wired to the player.
//
// P5 W5.3 (brief §9: "a component failure degrades to a static card, never
// a white screen") — every item is wrapped in `EvidenceErrorBoundary`
// (components/ask/evidence-error-boundary.tsx, already reused verbatim by
// components/servicing/servicing-assistant-parts.tsx for the same reason:
// React error boundaries must be classes and this codebase has no shared
// home for one yet, so the existing class is imported rather than
// re-forked). This is the seam the work item calls out by name: a single
// malformed `RenderInstruction` — a bad scenario step, a future component a
// renderer doesn't know how to draw — must degrade to that ONE card, not
// take the whole stage down mid-demo. Per-item, not once around the whole
// list: a `key`ed boundary per item means a throw in item 4 of 6 still
// leaves items 1-3 and 5-6 on screen exactly as before.
//
// The scroll container auto-follows: newest content is always in view for
// the presenter demo (brief §1) — an instant `scrollTop` jump on every
// `items` change, no smooth-scroll easing, no scroll-position preservation.

import { useEffect, useRef } from "react";
import { ApprovalCard } from "@/components/registry";
import { EvidenceErrorBoundary } from "@/components/ask/evidence-error-boundary";
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
          <ManualAuditCard />
        ) : (
          <ContextStream items={items} onResolveApproval={onResolveApproval} />
        )}
      </div>
    </section>
  );
}

/** The status quo the demo indicts (brief §3 Act I beat 1): before any
 * policy automation, this is what "coverage" looks like — the context
 * rail's empty state, since Act I emits no `render`/`approval` context
 * items of its own (demo-scenario.ts's `actOneSteps`). All copy is static —
 * there is no real review schedule to derive it from, exactly as the v2
 * card this replaces said of its own (now-removed) balance-transfer
 * figures.
 *
 * "24 months" is the visual anchor, not "962 accounts" or "40/month": it is
 * the one figure Act III's `stage-for-review` rejection cites back at this
 * exact card ("the manual queue clears 40 accounts a month... this is Act
 * I's own card killing the option," brief §3 Act III step 6), so it has to
 * survive in the audience's memory across the whole demo, not just read
 * clearly in the room for the next five minutes. */
function ManualAuditCard() {
  return (
    <div className="flex h-full flex-col justify-center gap-5 rounded-xl border border-border bg-muted/40 px-5 py-6">
      <span className="w-fit rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Manual audit
      </span>
      <p className="text-sm text-muted-foreground">Authorized-user eligibility review</p>
      <dl className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-base text-muted-foreground">Sampling</dt>
          <dd className="text-lg font-semibold text-foreground">40 accounts/month</dd>
        </div>
        <div className="flex items-baseline justify-between gap-4">
          <dt className="text-base text-muted-foreground">Portfolio</dt>
          <dd className="text-lg font-semibold text-foreground">962 accounts with authorized users</dd>
        </div>
      </dl>
      <div className="flex flex-col items-center gap-1 rounded-lg bg-background/60 py-4 ring-1 ring-foreground/5">
        <span className="font-mono text-4xl font-bold tabular-nums tracking-tight text-foreground">
          24 months
        </span>
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Time to full coverage
        </span>
      </div>
      <p className="text-sm text-muted-foreground">Last completed full review: none on record.</p>
    </div>
  );
}

/** The evidence stream (brief §3): progressive evidence cards and approval
 * gates, in the order the scenario emitted them. Narration plays in the
 * conversation rail instead (brief §4) — this rail no longer has a text
 * branch of its own. */
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
          case "render":
            return (
              <EvidenceErrorBoundary key={item.id} label={item.instruction.component}>
                <SentinelEvidenceRenderer instruction={item.instruction} />
              </EvidenceErrorBoundary>
            );
          case "approval":
            return (
              <EvidenceErrorBoundary key={item.id} label="ApprovalCard">
                <ApprovalCard
                  {...item.payload}
                  decision={item.decision}
                  disabled={item.decision !== undefined || !onResolveApproval}
                  onApprove={() => onResolveApproval?.(item.id, true)}
                  onDecline={() => onResolveApproval?.(item.id, false)}
                />
              </EvidenceErrorBoundary>
            );
        }
      })}
    </div>
  );
}
