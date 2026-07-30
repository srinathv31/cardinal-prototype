// Sentinel evidence card — the aggregate flagged-relationship table (brief
// §3 Act III beat 3, §5c/W3.1, wire-contract §9.6,
// lib/sentinel/registry.ts's `PolicyExceptionTableProps`). Pure renderer,
// zero derivation: every string is a preformatted value straight from
// `lib/sentinel/exception-fixture.ts` — no `toLocaleString`, no date math,
// no currency formatting happens here (v1 invariant 5a/5b).
//
// Projector legibility (brief §1/§9): this is 12 of 87 rows read from the
// back of a room, so type stays large and nothing in the row depends on
// hover — the rule badge and the finding text are both always visible,
// never a tooltip.
//
// P5 W5.2 projector fix: this WAS a `<Table>` (components/ui/table.tsx,
// v1-shared) with five columns — Account, Authorized user, Rule, Finding,
// Added. At a realistic 1280×800 projector viewport (brief §1) the context
// rail column is only ~250px wide; an HTML table with that many columns has
// no width left to give any of them, and every attempt to force it to fit
// (dropping the redundant "Added" column — `lib/sentinel/au-exceptions.ts`'s
// own `finding` strings already end in "AU added {date}" for every rule, so
// it repeated a date already visible — then overriding the shared
// `whitespace-nowrap`/`h-6` defaults to let cells wrap, then `table-fixed`
// with explicit column percentages) still produced either real horizontal
// overflow (invisible scrollbar at rest on macOS) or, once forced to fit,
// four columns so narrow each field wrapped to one word per line and read
// as a jumbled mess — worse than the overflow it replaced. A rigid
// multi-column table is the wrong shape for a panel this narrow; the fix is
// to stop using one. Each exception is now a single stacked card instead:
// account + rule badge on one line, the authorized user's name below it,
// the finding text below that — nothing here needs to line up in a column
// with the row above or below it, so nothing needs to be forced into one.
// Same information, same "always visible, never a tooltip" guarantee,
// legible at any panel width instead of only above some breakpoint this
// stage never reaches.

import { Badge } from "@/components/ui/badge";
import type { PolicyExceptionTableProps } from "@/lib/sentinel/registry";

export function PolicyExceptionTable({
  title,
  rows,
  footnote,
}: PolicyExceptionTableProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 ring-1 ring-foreground/5">
      <h3 className="mb-3 text-base font-semibold">{title}</h3>
      <div className="flex flex-col divide-y divide-border">
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
    </div>
  );
}
