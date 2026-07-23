// One monitor-agent status card (brief §4 screen 1, Beat 0: "three named
// agents sit in a status column ... each idle, each showing last-run
// stats"). Pure renderer — name, blurb, and stats string all arrive
// preformatted from app/page.tsx. The pulsing dot is a CSS-only affordance
// (Tailwind's animate-ping), so this stays a server component like the rest
// of the dashboard; only the ticker and the refresh timer need "use client".

import Link from "next/link";

export function AgentStatusCard({
  name,
  blurb,
  stats,
}: {
  name: string;
  blurb: string;
  stats: string;
}) {
  return (
    <Link
      href="/runs"
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5 ring-1 ring-foreground/5 transition-colors hover:border-primary/40"
    >
      {/* flex-wrap: at the 3-across breakpoint the card is too narrow for
          name + chip on one line; the chip must drop below rather than
          overflow into the neighboring card (projector rule, brief §7). */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-lg font-semibold text-foreground">{name}</span>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-success/15 px-2.5 py-1 text-xs font-semibold text-success">
          <span className="relative flex size-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-success" />
          </span>
          Monitoring
        </span>
      </div>
      <p className="text-sm text-muted-foreground">{blurb}</p>
      <p className="mt-auto text-sm font-medium text-foreground/80">{stats}</p>
    </Link>
  );
}
