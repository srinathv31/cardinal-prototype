// Context Rail — right panel (brief §4, W1.2). Pure renderer of
// `Stage`'s `ScenarioPlayer` snapshot (v1 invariant 5b): props in, JSX out,
// no lib/soe or lib/sentinel imports, no derived facts.
//
// P1 only builds two states: empty (the Manual Review card — the "before
// AI" framing that pre-Act-I and all of Act I sit in, since Act I's
// scenario never pushes a contextItems entry) and a minimal placeholder
// list for whatever narration/render/approval items do show up. The real
// streaming narration + progressive evidence + Policy panel drawer is Act
// II's job (W3.1/W3.2/W3.3) — deliberately not built here.

import type { SentinelContextItem } from "@/lib/sentinel/scenario/types";

export function ContextRail({ items }: { items: SentinelContextItem[] }) {
  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card ring-1 ring-foreground/5">
      <header className="shrink-0 border-b border-border px-4 py-3.5">
        <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Context
        </h2>
      </header>
      <div className="flex-1 overflow-y-auto px-4 py-6">
        {items.length === 0 ? <ManualReviewCard /> : <PlaceholderContextList items={items} />}
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

/** P3 seam (W3.3): Act II's real context stream — streamed narration typed
 * live, progressive evidence cards, approval cards — replaces this branch
 * entirely. For P1, render just enough to prove contextItems flows through:
 * narration as plain paragraphs, everything else skipped. */
function PlaceholderContextList({ items }: { items: SentinelContextItem[] }) {
  const narrationItems = items.filter((item) => item.kind === "narration");
  return (
    <div className="flex flex-col gap-3">
      {narrationItems.map((item) => (
        <p key={item.id} className="text-base text-foreground">
          {item.text}
        </p>
      ))}
    </div>
  );
}
