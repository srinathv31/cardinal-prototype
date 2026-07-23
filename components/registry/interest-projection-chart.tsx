"use client";

// Registry renderer — pure presentation only (brief §5b). All point values,
// callouts, and the assumption caption are preformatted/computed server-side
// (lib/agents/bt-lifecycle/resolvers.ts); the only computation here is
// display formatting and chart-geometry reshape for recharts, never business
// arithmetic.

import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart";
import type { InterestProjectionChartProps } from "@/lib/registry/schemas";

const MONTHLY_KEY = "monthlyInterest";
const CUMULATIVE_KEY = "cumulativeInterest";

const CHART_CONFIG: ChartConfig = {
  [MONTHLY_KEY]: { label: "Monthly interest", color: "var(--chart-1)" },
  [CUMULATIVE_KEY]: { label: "Cumulative interest", color: "var(--chart-2)" },
};

function formatAxisCurrency(value: number): string {
  return `$${Math.round(value).toLocaleString()}`;
}

type TooltipPayloadItem = {
  dataKey?: string | number;
  name?: string | number;
  value?: number | string;
  color?: string;
};

function ProjectionTooltip({
  active,
  payload,
  label,
}: {
  // Recharts clones this element at runtime and injects active/payload/label
  // (see recharts' TooltipContentProps) — all optional here so the JSX below
  // type-checks without supplying them up front (trend-chart.tsx pattern).
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="grid min-w-44 gap-1.5 rounded-lg border border-border/50 bg-popover px-3 py-2 text-sm shadow-xl">
      <div className="font-medium text-foreground">{label}</div>
      <div className="grid gap-1">
        {payload.map((item) => (
          <div key={item.dataKey as string} className="flex items-center gap-2">
            <div
              className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
              style={{ backgroundColor: item.color }}
            />
            <div className="flex flex-1 items-center justify-between gap-4">
              <span className="text-muted-foreground">
                {CHART_CONFIG[item.dataKey as string]?.label ?? item.name}
              </span>
              <span className="font-mono font-medium tabular-nums text-foreground">
                {formatAxisCurrency(Number(item.value))}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function InterestProjectionChart({
  title,
  assumption,
  points,
  callouts,
}: InterestProjectionChartProps) {
  const data = points.map((p) => ({
    label: p.label,
    [MONTHLY_KEY]: p.monthlyInterest,
    [CUMULATIVE_KEY]: p.cumulativeInterest,
  }));

  return (
    <div className="rounded-xl border border-border bg-card p-4 ring-1 ring-foreground/5">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-base font-semibold">{title}</h3>
      </div>
      {assumption ? (
        <p className="mb-4 text-sm text-muted-foreground">{assumption}</p>
      ) : null}

      {callouts.length > 0 ? (
        <div className="mb-4 flex flex-wrap gap-3">
          {callouts.map((callout) => (
            <div
              key={callout.label}
              className="flex flex-col gap-0.5 rounded-lg border border-border bg-background/40 px-3 py-2"
            >
              <span className="text-sm text-muted-foreground">{callout.label}</span>
              <span className="font-mono text-sm font-semibold tabular-nums text-foreground">
                {callout.value}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      <ChartContainer config={CHART_CONFIG} className="aspect-auto h-64 w-full">
        <ComposedChart data={data} margin={{ left: 4, right: 16, top: 8, bottom: 4 }}>
          <CartesianGrid vertical={false} strokeOpacity={0.4} />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tickMargin={10}
            tick={{ fontSize: 13, fill: "var(--muted-foreground)" }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            width={64}
            tick={{ fontSize: 13, fill: "var(--muted-foreground)" }}
            tickFormatter={formatAxisCurrency}
          />
          <ChartTooltip content={<ProjectionTooltip />} cursor={{ fill: "var(--muted)" }} />
          <Bar
            dataKey={MONTHLY_KEY}
            fill="var(--chart-1)"
            radius={[3, 3, 0, 0]}
            maxBarSize={28}
          />
          <Line
            type="monotone"
            dataKey={CUMULATIVE_KEY}
            stroke="var(--chart-2)"
            strokeWidth={2.5}
            dot={{ r: 3.5, strokeWidth: 0, fill: "var(--chart-2)" }}
            activeDot={{ r: 5 }}
          />
        </ComposedChart>
      </ChartContainer>
    </div>
  );
}
