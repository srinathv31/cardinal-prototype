// Portfolio KPI row (brief §4 screen 1, Beat 0). Thin wrapper around the
// registry's MetricRow — the same renderer the model routes evidence to
// (brief §5c) — so the dashboard's metric cards are visually identical to
// the ones agents produce mid-run. All four values arrive preformatted from
// app/page.tsx; this file performs no computation.

import { MetricRow } from "@/components/registry";
import type { MetricRowProps } from "@/lib/registry/schemas";

export function KpiRow({ metrics }: MetricRowProps) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
        Portfolio KPIs
      </h2>
      <MetricRow metrics={metrics} />
    </section>
  );
}
