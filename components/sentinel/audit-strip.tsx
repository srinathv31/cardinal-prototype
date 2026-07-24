// Audit Strip — thin bottom strip (brief §4). Idle placeholder only: the
// live tail of Event Log entries lands here in a later work item (Act III,
// brief §3). The "Open Event Log" link is the one post-demo click-through
// the brief calls out — /events already renders Sentinel's own audit writes
// once they exist (docs/v2-reuse-map.md §1), unchanged.

import Link from "next/link";

export function AuditStrip() {
  return (
    <footer className="flex h-16 shrink-0 items-center justify-between gap-4 rounded-xl border border-border bg-card px-4 ring-1 ring-foreground/5">
      <div className="flex min-w-0 items-center gap-3">
        <h2 className="shrink-0 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Audit trail
        </h2>
        <p className="truncate text-sm text-muted-foreground">
          No audit entries yet
        </p>
      </div>
      <Link
        href="/events"
        className="shrink-0 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        Open Event Log →
      </Link>
    </footer>
  );
}
