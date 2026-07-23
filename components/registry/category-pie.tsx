"use client";

// Registry renderer — pure presentation only (brief §5b). Slice magnitudes,
// display values, and shares are preformatted/computed server-side
// (lib/agents/ask/resolvers.ts); the only computation here is chart-geometry
// reshape for recharts, never business arithmetic. Follows trend-chart.tsx's
// Recharts v3 tooltip prop-typing pattern (docs/ai-sdk7-notes.md misc).

import { Pie, PieChart } from "recharts";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import type { CategoryPieProps } from "@/lib/registry/schemas";

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

type TooltipPayloadItem = {
  name?: string | number;
  value?: number | string;
  payload?: { display?: string; share?: string };
  color?: string;
};

function SliceTooltip({
  active,
  payload,
}: {
  // Recharts clones this element at runtime and injects active/payload
  // (see recharts' TooltipContentProps) — optional here so the JSX below
  // type-checks without supplying them up front (trend-chart.tsx pattern).
  active?: boolean;
  payload?: TooltipPayloadItem[];
}) {
  if (!active || !payload?.length) return null;
  const item = payload[0];
  return (
    <div className="grid min-w-40 gap-1 rounded-lg border border-border/50 bg-popover px-3 py-2 text-sm shadow-xl">
      <div className="flex items-center gap-2">
        <div
          className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
          style={{ backgroundColor: item.color }}
        />
        <span className="font-medium text-foreground">{item.name}</span>
      </div>
      <div className="flex items-center justify-between gap-4 font-mono text-sm">
        <span className="text-muted-foreground">{item.payload?.share}</span>
        <span className="font-medium tabular-nums text-foreground">
          {item.payload?.display}
        </span>
      </div>
    </div>
  );
}

export function CategoryPie({ title, slices, total }: CategoryPieProps) {
  const data = slices.map((slice, i) => ({
    ...slice,
    fill: CHART_COLORS[i % CHART_COLORS.length],
  }));

  const config: ChartConfig = Object.fromEntries(
    slices.map((slice, i) => [
      slice.label,
      { label: slice.label, color: CHART_COLORS[i % CHART_COLORS.length] },
    ]),
  );

  return (
    <div className="@container rounded-xl border border-border bg-card p-4 ring-1 ring-foreground/5">
      <h3 className="mb-3 text-base font-semibold">{title}</h3>
      <div className="flex flex-col items-center gap-6 @lg:flex-row @lg:items-center">
        <div className="relative w-full max-w-64 shrink-0">
          <ChartContainer config={config} className="mx-auto aspect-square h-56 w-full">
            <PieChart>
              <ChartTooltip content={<SliceTooltip />} />
              <Pie
                data={data}
                dataKey="value"
                nameKey="label"
                innerRadius="62%"
                outerRadius="100%"
                strokeWidth={2}
                stroke="var(--card)"
              />
              {/* Slice colors come from each data entry's `fill` — recharts 3
                  reads it per sector, replacing the deprecated <Cell>. */}
            </PieChart>
          </ChartContainer>
          {total ? (
            <div className="pointer-events-none absolute inset-0 grid place-items-center">
              <div className="flex flex-col items-center gap-0.5 text-center">
                <span className="max-w-32 text-sm text-muted-foreground">{total.label}</span>
                <span className="font-mono text-lg font-semibold tabular-nums text-foreground">
                  {total.value}
                </span>
              </div>
            </div>
          ) : null}
        </div>

        <div className="flex w-full flex-col gap-2">
          {data.map((slice, index) => (
            <div
              key={`${slice.label}-${index}`}
              className="flex items-center justify-between gap-3 rounded-lg border border-border/60 bg-background/40 px-3 py-2"
            >
              <div className="flex min-w-0 items-center gap-2">
                <div
                  className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                  style={{ backgroundColor: slice.fill }}
                />
                <span className="truncate text-sm font-medium text-foreground">
                  {slice.label}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-3 font-mono text-sm">
                <span className="text-muted-foreground">{slice.share}</span>
                <span className="font-semibold tabular-nums text-foreground">
                  {slice.display}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
