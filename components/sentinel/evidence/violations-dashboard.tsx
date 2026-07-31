"use client";

// The ops-chat centerpiece — a batch policy evaluation rendered as chat
// evidence (DEMO_THESIS.md use case 1 beats 4–5 and use case 3's ops side;
// DEMO_BUILD_PLAN.md "UI components"; props schema in
// lib/sentinel/registry.ts's `ViolationsDashboardProps`). Three bands, top to
// bottom: the headline figures, the per-rule split, and the flagged accounts —
// scale, then shape, then names. That is the order an executive reads a
// finding in, and it is why the exceptions tile is the largest thing on the
// card: the one number the room has to leave with is "87".
//
// PURE RENDERER (CLAUDE.md invariant 5b — "zero business logic in
// components"). Every string arrives preformatted from the evaluator; this
// file contains no `toLocaleString`, no currency or date formatting, no sums,
// no percentages. The single arithmetic expression in it computes bar widths
// as a ratio against the largest count — layout geometry, the same latitude
// `components/registry/bar-breakdown.tsx` already takes and documents.
//
// The drill-down is PURE CLIENT STATE. `rows[].detail` already carries
// everything the expanded panel shows, so clicking a row triggers no fetch and
// no model turn (invariant 5a) — it cannot fail on stage, and it cannot
// contradict the row it expands from. One row is open at a time: an accordion,
// not a set of independent toggles, so the presenter can click down the table
// without the card growing under the audience.
//
// Layout note, inherited from the P5 projector fix that rewrote
// `policy-exception-table.tsx` (read that file's header for the full history):
// a rigid multi-column HTML `<table>` is the wrong shape for evidence rendered
// in a chat column. This is a CSS grid instead, with an explicit placement per
// field, so the same markup reads as an aligned four-column table at chat width
// and as a stacked card below `sm` — no horizontal overflow at any width, and
// no field ever hidden behind a hover or a tooltip.
//
// Motion is deliberately minimal: the panel's open/close is a
// `grid-template-rows` 0fr→1fr transition (a real height animation with
// nothing measured in JS) and the chevron rotates 90°. Both are suppressed
// under `motion-reduce`. Nothing bounces, nothing slides in.

import { Fragment, useId, useState } from "react";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type {
  ViolationsDashboardProps,
  ViolationsPolicyId,
} from "@/lib/sentinel/registry";

/** Presentation-only label for the policy slug — the same pattern
 * `transaction-table.tsx`'s `CATEGORY_LABEL` establishes for rendering an enum
 * as human text. Not business logic: no branch of this component behaves
 * differently per policy, only the heading reads differently. */
const POLICY_LABEL: Record<ViolationsPolicyId, string> = {
  "authorized-user": "Authorized-user policy",
  "card-activation": "Card-activation policy",
};

/** Shared micro-label style — the app's established uppercase/tracked
 * section-label idiom (see `context-rail.tsx`, `rule-diff.tsx`). */
const LABEL = "text-xs font-semibold tracking-widest uppercase";

/** The row's five fields, placed explicitly at both breakpoints. Auto-placement
 * cannot express "stacked below `sm`, one line above it" from a single DOM
 * order, so each field names its own cell. */
const CELL = {
  chevron: "col-start-1 row-start-1",
  holder: "col-start-2 row-start-1",
  account: "col-start-2 row-start-2 sm:col-start-3 sm:row-start-1",
  rule: "col-start-3 row-start-1 justify-self-end sm:col-start-4 sm:justify-self-start",
  finding:
    "col-span-2 col-start-2 row-start-3 sm:col-span-1 sm:col-start-5 sm:row-start-1",
} as const;

const ROW_GRID =
  "grid-cols-[1.25rem_minmax(0,1fr)_auto] sm:grid-cols-[1.25rem_minmax(0,9rem)_minmax(0,7rem)_auto_minmax(0,1fr)]";

function StatTile({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: number;
  emphasis?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col justify-between gap-1.5 rounded-lg border px-4 py-3.5",
        emphasis
          ? "border-destructive/45 bg-destructive/10 ring-1 ring-destructive/15"
          : "border-border bg-muted/30",
      )}
    >
      <span
        className={cn(LABEL, emphasis ? "text-destructive" : "text-muted-foreground")}
      >
        {label}
      </span>
      {/* Rendered verbatim — the payload types these as numbers and this
       * component does not format them (registry.ts's field-group comment). */}
      <span
        className={cn(
          "font-mono font-semibold tabular-nums tracking-tight",
          emphasis
            ? "text-4xl text-destructive sm:text-5xl"
            : "text-3xl text-foreground",
        )}
      >
        {value}
      </span>
    </div>
  );
}

export function ViolationsDashboard({
  policyId,
  summary,
  byRule,
  rows,
}: ViolationsDashboardProps) {
  const baseId = useId();
  const [openRowKey, setOpenRowKey] = useState<string | null>(null);

  // Layout geometry only — the longest bar is full width and the rest are
  // proportional to it. `|| 1` guards a division by zero when every rule
  // reports zero; the `max(…, 2)` floor keeps a nonzero count from rendering
  // as an invisible sliver.
  const maxRuleCount = Math.max(...byRule.map((rule) => rule.count), 1);

  return (
    <section className="rounded-xl border border-border bg-card p-5 ring-1 ring-foreground/5">
      <header>
        <p className={cn(LABEL, "text-muted-foreground")}>Policy exception scan</p>
        <h3 className="mt-1 text-lg font-semibold text-foreground">
          {POLICY_LABEL[policyId]}
        </h3>
      </header>

      {/* ——— Band 1: the headline figures. The exceptions tile is deliberately
          the widest track AND the largest type — it is the number the room
          leaves with. */}
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.35fr)]">
        <StatTile label="Scanned" value={summary.scanned} />
        <StatTile label="Accounts affected" value={summary.accountsAffected} />
        <StatTile label="Exceptions" value={summary.exceptions} emphasis />
      </div>

      {/* ——— Band 2: the per-rule split. */}
      <div className="mt-6">
        <p className={cn(LABEL, "text-muted-foreground")}>Exceptions by rule</p>
        <div className="mt-3 flex flex-col gap-3.5">
          {byRule.map((rule) => (
            <div key={rule.ruleId} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-x-4">
                <span className="min-w-0 text-sm text-foreground">
                  <span className="font-mono font-semibold text-muted-foreground">
                    {rule.ruleId}
                  </span>
                  <span className="ml-2">{rule.title}</span>
                </span>
                <span className="shrink-0 font-mono text-base font-semibold tabular-nums text-foreground">
                  {rule.count}
                </span>
              </div>
              <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-destructive/70"
                  style={{
                    width: `${Math.max((rule.count / maxRuleCount) * 100, 2)}%`,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ——— Band 3: the flagged accounts, each expanding in place. */}
      <div className="mt-6">
        <p className={cn(LABEL, "text-muted-foreground")}>Flagged accounts</p>
        <div className="mt-3 overflow-hidden rounded-lg border border-border">
          <div
            className={cn(
              "hidden bg-muted/40 px-3 py-2 sm:grid sm:items-center sm:gap-x-3",
              ROW_GRID,
            )}
          >
            <span aria-hidden="true" />
            <span className={cn(LABEL, "text-muted-foreground")}>Holder</span>
            <span className={cn(LABEL, "text-muted-foreground")}>Account</span>
            <span className={cn(LABEL, "text-muted-foreground")}>Rule</span>
            <span className={cn(LABEL, "text-muted-foreground")}>Finding</span>
          </div>

          <div className="divide-y divide-border">
            {rows.map((row, index) => {
              // The payload allows the same account to appear under two rules,
              // so identity is (account, rule, position) — never the account
              // id alone.
              const rowKey = `${row.accountId}·${row.ruleId}·${index}`;
              const isOpen = openRowKey === rowKey;
              const panelId = `${baseId}-detail-${index}`;

              return (
                <div
                  key={rowKey}
                  className={cn(
                    "transition-colors duration-200 motion-reduce:transition-none",
                    isOpen && "bg-muted/25",
                  )}
                >
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => setOpenRowKey(isOpen ? null : rowKey)}
                    className={cn(
                      "grid w-full items-start gap-x-3 gap-y-1 px-3 py-3 text-left",
                      "hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset focus-visible:outline-none",
                      "sm:items-center",
                      ROW_GRID,
                    )}
                  >
                    <ChevronRight
                      aria-hidden="true"
                      className={cn(
                        CELL.chevron,
                        "mt-1 size-4 shrink-0 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none sm:mt-0",
                        isOpen && "rotate-90",
                      )}
                    />
                    <span
                      className={cn(
                        CELL.holder,
                        "truncate text-base font-medium text-foreground",
                      )}
                    >
                      {row.holder}
                    </span>
                    <span
                      className={cn(
                        CELL.account,
                        "truncate font-mono text-sm tabular-nums text-muted-foreground",
                      )}
                    >
                      {row.accountId}
                    </span>
                    <Badge
                      variant="outline"
                      className={cn(CELL.rule, "h-6 font-mono text-sm")}
                    >
                      {row.ruleId}
                    </Badge>
                    <span
                      className={cn(CELL.finding, "truncate text-sm text-muted-foreground")}
                    >
                      {row.finding}
                    </span>
                  </button>

                  {/* 0fr → 1fr is a real height transition with nothing
                   * measured in JS. The panel stays mounted so `aria-controls`
                   * always resolves; it holds no focusable content, so a
                   * collapsed row cannot trap a tab stop. */}
                  <div
                    id={panelId}
                    aria-hidden={!isOpen}
                    className={cn(
                      "grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none",
                      isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                    )}
                  >
                    <div className="overflow-hidden">
                      <div className="border-t border-border bg-background/40 px-3 py-4 sm:px-4">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant="outline" className="h-6 font-mono text-sm">
                            {row.ruleId}
                          </Badge>
                          <span className="text-base font-semibold text-foreground">
                            {row.ruleTitle}
                          </span>
                        </div>
                        <p className="mt-2.5 border-l-2 border-destructive/50 pl-3 text-base leading-relaxed text-foreground/90">
                          {row.finding}
                        </p>
                        <dl className="mt-4 grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] items-baseline gap-x-6 gap-y-2.5 sm:grid-cols-[minmax(0,auto)_minmax(0,1fr)_minmax(0,auto)_minmax(0,1fr)]">
                          {row.detail.map((pair, pairIndex) => (
                            <Fragment key={`${pair.label}-${pairIndex}`}>
                              <dt className={cn(LABEL, "text-muted-foreground")}>
                                {pair.label}
                              </dt>
                              <dd className="text-sm tabular-nums text-foreground">
                                {pair.value}
                              </dd>
                            </Fragment>
                          ))}
                        </dl>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {/* `rows.length` is the length of the array already being mapped, not a
         * derived figure — without it a ten-row table on screen next to an
         * "87" tile reads as a contradiction. */}
        <p className="mt-3 text-sm text-muted-foreground">
          Showing {rows.length} of {summary.exceptions}. Select a row for the full
          finding and account detail.
        </p>
      </div>
    </section>
  );
}
