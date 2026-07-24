// Audit Strip — thin bottom strip (brief §4). Pure renderer of `Stage`'s
// `ScenarioPlayer` snapshot (v1 invariant 5b). Act I writes no audit
// entries (no `auditWrite`/`awaitApproval` step fires until Act II), so
// this stays visually unchanged for now — Acts II/III (P3/P4) are what
// actually light it up. The "Open Event Log" link is the one post-demo
// click-through the brief calls out — /events already renders Sentinel's
// own audit writes once they exist (docs/v2-reuse-map.md §1), unchanged.

import Link from "next/link";
import type { SentinelStageState } from "@/lib/sentinel/scenario/types";

export function AuditStrip({ entries }: { entries: SentinelStageState["auditEntries"] }) {
  const latest = entries.length > 0 ? entries[entries.length - 1] : undefined;

  return (
    <footer className="flex h-16 shrink-0 items-center justify-between gap-4 rounded-xl border border-border bg-card px-4 ring-1 ring-foreground/5">
      <div className="flex min-w-0 items-center gap-3">
        <h2 className="shrink-0 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Audit trail
        </h2>
        {latest ? (
          <>
            <p className="truncate text-sm text-foreground">
              {latest.toolName} — {latest.outputSummary}
            </p>
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {entries.length} {entries.length === 1 ? "entry" : "entries"}
            </span>
          </>
        ) : (
          <p className="truncate text-sm text-muted-foreground">No audit entries yet</p>
        )}
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
