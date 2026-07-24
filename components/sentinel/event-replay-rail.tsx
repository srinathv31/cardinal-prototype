// Event Replay Rail — left panel (brief §4). Idle placeholder only: the
// persistent counter header and the event-card stream itself are W1.1;
// event-ticker.tsx (components/dashboard/) is the styling reference for the
// eventual cards, but nothing is wired to a real stream yet, so this file
// renders fixed zeros and a static empty-state, no props, no state.

const COUNTERS = [
  { value: 0, label: "events" },
  { value: 0, label: "violations" },
  { value: 0, label: "flagged" },
] as const;

export function EventReplayRail() {
  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card ring-1 ring-foreground/5">
      <header className="flex shrink-0 flex-col gap-3 border-b border-border px-4 py-3.5">
        <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Event replay
        </h2>
        <div className="grid grid-cols-3 gap-2">
          {COUNTERS.map((counter) => (
            <div
              key={counter.label}
              className="flex flex-col items-center gap-0.5 rounded-lg bg-muted/40 py-2.5"
            >
              <span className="font-mono text-3xl font-semibold tabular-nums tracking-tight text-foreground">
                {counter.value}
              </span>
              <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {counter.label}
              </span>
            </div>
          ))}
        </div>
      </header>
      <div className="flex flex-1 items-center justify-center overflow-y-auto px-4 py-6 text-center">
        <p className="text-sm text-muted-foreground">
          Replay idle — the presenter starts Act I.
        </p>
      </div>
    </section>
  );
}
