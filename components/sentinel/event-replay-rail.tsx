// Event Replay Rail — left panel (brief §4, W1.1/W1.2). Pure renderer of
// `Stage`'s `ScenarioPlayer` snapshot (v1 invariant 5b): every figure below
// comes from props, nothing is fetched or derived from lib/soe here.
//
// event-ticker.tsx (components/dashboard/) is the styling reference for the
// card stream — kind badge + mono clock time, summary below, same
// animate-in treatment. KIND_LABEL/KIND_TONE are copied rather than
// imported: per the v1 pattern (event-ticker.tsx's own header comment),
// these lookups are deliberately local per-screen cosmetic classification,
// not shared business logic.

import type { SentinelCounter, SentinelStageState } from "@/lib/sentinel/scenario/types";
import { cn } from "@/lib/utils";

const KIND_LABEL: Record<string, string> = {
  "payment.posted": "Payment posted",
  "payment.missed": "Payment missed",
  "autopay.failed": "Autopay failed",
  "statement.generated": "Statement generated",
  "balance_transfer.completed": "BT completed",
  "bt.promo_expiring": "Promo expiring",
  "transaction.posted": "Transaction posted",
  // v2 addition (brief §5): Marcus's 02:47 event. Act I deliberately gives
  // it the SAME tone as balance_transfer.completed — no alarm styling, it
  // has to scroll past looking like every other event (brief §3 Act I beat
  // 2). Act III's `highlight` flag is what makes it stop and hold, not this
  // lookup.
  "balance_transfer.initiated": "BT initiated",
};

const KIND_TONE: Record<string, string> = {
  "payment.posted": "bg-success/15 text-success",
  "payment.missed": "bg-destructive/15 text-destructive",
  "autopay.failed": "bg-destructive/15 text-destructive",
  "statement.generated": "bg-muted text-muted-foreground",
  "balance_transfer.completed": "bg-primary/15 text-primary",
  "bt.promo_expiring": "bg-warning/15 text-warning",
  "transaction.posted": "bg-muted text-muted-foreground",
  "balance_transfer.initiated": "bg-primary/15 text-primary",
};

/** Local, not imported from components/dashboard/format.ts — the pin to
 * `timeZone: "UTC"` is STORY-CRITICAL and specific to this screen. The
 * night's replay log is seeded 00:00–06:00 UTC and the brief's beat is a
 * literal "2:47 AM" (brief §3); the dashboard's formatter uses the host
 * machine's local zone, which would print "22:47" on an Eastern demo
 * laptop and silently break the story. Pinning UTC here makes the clock
 * read correctly regardless of where this runs. */
function formatClockTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

interface EventReplayRailProps {
  events: SentinelStageState["railEvents"];
  counter: SentinelCounter;
  caption?: string;
}

export function EventReplayRail({ events, counter, caption }: EventReplayRailProps) {
  const counters = [
    { value: counter.events, label: "events" },
    { value: counter.violations, label: "violations" },
    { value: counter.flagged, label: "flagged" },
  ] as const;

  // railEvents is append-ordered oldest-first; the rail reads newest-at-top.
  const newestFirst = [...events].reverse();
  const isEmpty = events.length === 0 && !caption;

  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card ring-1 ring-foreground/5">
      <header className="flex shrink-0 flex-col gap-3 border-b border-border px-4 py-3.5">
        <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Event replay
        </h2>
        <div className="grid grid-cols-3 gap-2">
          {counters.map((c) => (
            <div
              key={c.label}
              className="flex flex-col items-center gap-0.5 rounded-lg bg-muted/40 py-2.5"
            >
              <span className="font-mono text-3xl font-semibold tabular-nums tracking-tight text-foreground">
                {c.value}
              </span>
              <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {c.label}
              </span>
            </div>
          ))}
        </div>
      </header>

      {isEmpty ? (
        <div className="flex flex-1 items-center justify-center overflow-y-auto px-4 py-6 text-center">
          <p className="text-sm text-muted-foreground">
            Replay idle — the presenter starts Act I.
          </p>
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-4 py-4">
          {/* W1.2's Act I counter finale — pinned above the newest card, not
           * inside the scroll's natural chronological order, so it reads as
           * the replay's closing title card rather than just another entry. */}
          {caption ? (
            <div className="animate-in fade-in zoom-in-95 flex flex-col gap-1 rounded-xl border border-border bg-muted/40 px-4 py-4 duration-700">
              <p className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
                {counter.events} events processed · {counter.violations}{" "}
                policy violation{counter.violations === 1 ? "" : "s"} ·{" "}
                {counter.flagged} flagged
              </p>
              <p className="text-sm text-muted-foreground">{caption}</p>
            </div>
          ) : null}

          {newestFirst.map(({ event, highlight, complianceBadge }) => (
            <div
              key={event.eventId}
              className={cn(
                "animate-in fade-in slide-in-from-top-2 flex flex-col gap-1.5 rounded-xl border border-border bg-card/60 px-4 py-3 ring-1 ring-foreground/5 duration-500",
                highlight && "ring-2 ring-destructive bg-destructive/10",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={cn(
                    "inline-flex items-center rounded-full px-2.5 py-0.5 text-sm font-semibold",
                    KIND_TONE[event.kind] ?? "bg-muted text-muted-foreground",
                  )}
                >
                  {KIND_LABEL[event.kind] ?? event.kind}
                </span>
                <span className="font-mono text-sm text-muted-foreground">
                  {formatClockTime(event.timestamp)}
                </span>
              </div>
              <p className="text-base text-foreground">{event.summary}</p>
              {complianceBadge ? (
                <p className="text-sm text-success">✓ {complianceBadge}</p>
              ) : null}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
