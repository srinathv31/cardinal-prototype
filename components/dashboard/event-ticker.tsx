"use client";

// Live event stream rail (brief §4 screen 1, Beat 0: "the room absorbs:
// agents are watching the portfolio"). The server hands over the full,
// already-formatted seed event list (docs on StreamEvent, brief §6) — this
// component's only job is to reveal it a bit at a time so the room reads a
// static seed as a live feed. No fetch, no polling, no arithmetic: `kind` is
// a fixed enum straight off StreamEvent, and the label/tone lookup below is
// cosmetic classification, the same pattern run-view.tsx uses for its own
// status chips.
//
// Reveal order is oldest-first internally (so newer entries keep landing
// "above" older ones, matching a real feed), but the visible slice is always
// re-sorted newest-first before paint, so the on-screen order is always
// correct even mid-reveal.

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export interface TickerEvent {
  eventId: string;
  /** StreamEvent['kind'] — passed as a plain string so a future kind needs
   * no change here (falls back to the raw value, brief §8). */
  kind: string;
  summary: string;
  /** Preformatted clock time, e.g. "08:30" (components/dashboard/format.ts). */
  timeLabel: string;
}

const REVEAL_INTERVAL_MS = 2700;

const KIND_LABEL: Record<string, string> = {
  "payment.posted": "Payment posted",
  "payment.missed": "Payment missed",
  "autopay.failed": "Autopay failed",
  "statement.generated": "Statement generated",
  "balance_transfer.completed": "BT completed",
  "bt.promo_expiring": "Promo expiring",
  "transaction.posted": "Transaction posted",
};

const KIND_TONE: Record<string, string> = {
  "payment.posted": "bg-success/15 text-success",
  "payment.missed": "bg-destructive/15 text-destructive",
  "autopay.failed": "bg-destructive/15 text-destructive",
  "statement.generated": "bg-muted text-muted-foreground",
  "balance_transfer.completed": "bg-primary/15 text-primary",
  "bt.promo_expiring": "bg-warning/15 text-warning",
  "transaction.posted": "bg-muted text-muted-foreground",
};

export function EventTicker({ events }: { events: TickerEvent[] }) {
  // events arrives newest-first (getEventStream(), brief §6); reveal in the
  // reverse (oldest-first) order so each tick's newly revealed entry is the
  // most recent one shown so far and lands at the top.
  const [revealCount, setRevealCount] = useState(Math.min(1, events.length));

  useEffect(() => {
    if (revealCount >= events.length) return;
    const timer = setTimeout(() => setRevealCount((count) => count + 1), REVEAL_INTERVAL_MS);
    return () => clearTimeout(timer);
  }, [revealCount, events.length]);

  if (events.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No event-stream activity yet this session.
      </p>
    );
  }

  const oldestFirst = [...events].reverse();
  const visible = oldestFirst.slice(0, revealCount).reverse();

  return (
    <ul className="flex flex-col gap-2">
      {visible.map((event) => (
        <li
          key={event.eventId}
          className="animate-in fade-in slide-in-from-top-2 flex flex-col gap-1.5 rounded-xl border border-border bg-card/60 px-4 py-3 ring-1 ring-foreground/5 duration-500"
        >
          <div className="flex items-center justify-between gap-2">
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
                KIND_TONE[event.kind] ?? "bg-muted text-muted-foreground",
              )}
            >
              {KIND_LABEL[event.kind] ?? event.kind}
            </span>
            <span className="font-mono text-xs text-muted-foreground">{event.timeLabel}</span>
          </div>
          <p className="text-base text-foreground">{event.summary}</p>
        </li>
      ))}
    </ul>
  );
}
