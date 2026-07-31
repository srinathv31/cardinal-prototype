// Sentinel evidence card — the post-approval outcome card (brief §3 Act III
// beat 8, §5c/W3.2, wire-contract §9.6, lib/sentinel/registry.ts's
// `RemediationReportProps`). Every counter, the confirmation id, and every
// result row arrive preformatted from the SAME checked-in fixture that fed
// `PolicyExceptionTable` and `GET /api/sentinel/report`'s CSV
// (lib/sentinel/exception-fixture.ts) — this is a receipt, not a
// recomputation; it performs no arithmetic and no lookups (v1 invariant
// 5a/5b).
//
// `downloadUrl` is optional BY DESIGN (brief §6c: "the demo runs with the
// network cable pulled"). Its absence degrades the Download CSV control to
// disabled with a quiet reason — never a broken link, never a thrown error.
// The control is a plain anchor tag (`<a download>`), not a client fetch: a
// GET to a static, cacheable URL is the simplest thing that cannot itself
// crash the render.
//
// P5 W5.2 projector fix: same defect `policy-exception-table.tsx` had, same
// fix — see that file's header comment for the full history (a `<Table>`
// with this many fields has nowhere near enough width in a ~250px context
// rail column at a realistic 1280×800 projector viewport, brief §1, and
// forcing it to fit via wrapping/`table-fixed` only traded real overflow
// for an unreadable one-word-per-line jumble). This is a stacked card list
// now, not a table — the row shape both this file and the exception table
// render is identical (`auExceptionRowSchema`), so the row markup below is
// deliberately identical to that file's, not a second design for the same
// data.

import { Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { RemediationReportProps } from "@/lib/sentinel/registry";

export function RemediationReport({
  title,
  counters,
  confirmationId,
  rows,
  footnote,
  downloadUrl,
}: RemediationReportProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 ring-1 ring-foreground/5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-foreground">{title}</h3>
        <span className="font-mono text-sm text-muted-foreground">{confirmationId}</span>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {counters.map((counter, index) => (
          <div
            key={`${counter.label}-${index}`}
            className="rounded-lg bg-muted/40 px-3 py-2.5"
          >
            <p className="text-sm text-muted-foreground">{counter.label}</p>
            <p className="mt-0.5 text-xl font-semibold tabular-nums text-foreground">
              {counter.value}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-col divide-y divide-border">
        {rows.map((row, index) => (
          <div
            key={`${row.accountLabel}-${row.authorizedUser}-${row.ruleId}-${index}`}
            className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0"
          >
            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
              <span className="text-base font-medium text-foreground">{row.accountLabel}</span>
              <Badge variant="outline" className="h-6 text-sm whitespace-nowrap">
                {row.ruleShortName}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">{row.authorizedUser}</p>
            <p className="text-base text-foreground/90">{row.finding}</p>
          </div>
        ))}
      </div>
      {footnote ? (
        <p className="mt-3 text-sm text-muted-foreground">{footnote}</p>
      ) : null}

      <div className="mt-5 flex flex-wrap items-center gap-3">
        {downloadUrl ? (
          <Button asChild size="lg" variant="outline">
            <a href={downloadUrl} download>
              <Download className="size-4" />
              Download CSV
            </a>
          </Button>
        ) : (
          <>
            <Button size="lg" variant="outline" disabled>
              <Download className="size-4" />
              Download CSV
            </Button>
            <span className="text-sm text-muted-foreground">
              Download unavailable right now — the report is still on record in the audit log.
            </span>
          </>
        )}
      </div>
    </div>
  );
}
