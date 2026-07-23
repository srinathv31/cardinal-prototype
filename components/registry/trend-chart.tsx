"use client";

// Registry renderer — pure presentation only (brief §5b). All point values
// and labels are preformatted/validated server-side (lib/registry/schemas.ts);
// the only computation here is display formatting and chart-geometry reshape
// for recharts, never business arithmetic.

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  type ChartConfig,
} from "@/components/ui/chart";
import type { TrendChartProps } from "@/lib/registry/schemas";

const CHART_COLORS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)"];

function formatValue(value: number, unit: TrendChartProps["unit"]): string {
  switch (unit) {
    case "percent":
      return `${Math.round(value)}%`;
    case "currency":
      return `$${Math.round(value).toLocaleString()}`;
    case "count":
    default:
      return `${Math.round(value)}`;
  }
}

type TooltipPayloadItem = {
  dataKey?: string | number;
  name?: string | number;
  value?: number | string;
  color?: string;
};

function TrendTooltip({
  active,
  payload,
  label,
  unit,
  config,
}: {
  // Recharts clones this element at runtime and injects active/payload/label
  // (see recharts' TooltipContentProps) — all optional here so the JSX below
  // type-checks without supplying them up front.
  active?: boolean;
  payload?: TooltipPayloadItem[];
  label?: string | number;
  unit: TrendChartProps["unit"];
  config: ChartConfig;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="grid min-w-40 gap-1.5 rounded-lg border border-border/50 bg-popover px-3 py-2 text-sm shadow-xl">
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
                {config[item.dataKey as string]?.label ?? item.name}
              </span>
              <span className="font-mono font-medium tabular-nums text-foreground">
                {formatValue(Number(item.value), unit)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function TrendChart({ title, unit, series }: TrendChartProps) {
  const pointCount = Math.max(...series.map((s) => s.points.length));
  const data = Array.from({ length: pointCount }, (_, i) => {
    const row: Record<string, string | number> = {
      label: series[0]?.points[i]?.label ?? "",
    };
    for (const s of series) {
      const point = s.points[i];
      if (point) row[s.id] = point.value;
    }
    return row;
  });

  const config: ChartConfig = Object.fromEntries(
    series.map((s, i) => [
      s.id,
      { label: s.label, color: CHART_COLORS[i % CHART_COLORS.length] },
    ]),
  );

  const primary = series[0];
  const firstPoint = primary?.points[0];
  const lastPoint = primary?.points[primary.points.length - 1];

  return (
    <div className="rounded-xl border border-border bg-card p-4 ring-1 ring-foreground/5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-base font-semibold">{title}</h3>
        {firstPoint && lastPoint ? (
          <span className="font-mono text-sm text-muted-foreground">
            {firstPoint.label} {formatValue(firstPoint.value, unit)}
            <span className="mx-1.5 text-muted-foreground/60">to</span>
            {lastPoint.label} {formatValue(lastPoint.value, unit)}
          </span>
        ) : null}
      </div>
      <ChartContainer config={config} className="aspect-auto h-64 w-full">
        <LineChart data={data} margin={{ left: 4, right: 16, top: 8, bottom: 4 }}>
          {/* Projector pass: chart.tsx's shared CSS only recolors recharts'
              default `stroke="#ccc"` grid lines, then dims them further
              (stroke-border/50); stacked with the old strokeOpacity={0.4}
              prop here that came out under 1.5:1 against the card — nearly
              invisible. An explicit stroke bypasses that CSS match entirely
              (the attribute is no longer "#ccc"), landing at --border's own
              ~3:1 against the card, matching every other border in the app. */}
          <CartesianGrid vertical={false} stroke="var(--border)" />
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
            width={unit === "currency" ? 60 : 44}
            tick={{ fontSize: 13, fill: "var(--muted-foreground)" }}
            tickFormatter={(value: number) => formatValue(value, unit)}
          />
          <ChartTooltip
            content={<TrendTooltip unit={unit} config={config} />}
            cursor={{ stroke: "var(--border)" }}
          />
          {series.map((s, i) => (
            <Line
              key={s.id}
              type="monotone"
              dataKey={s.id}
              stroke={CHART_COLORS[i % CHART_COLORS.length]}
              strokeWidth={2.5}
              dot={{ r: 3.5, strokeWidth: 0, fill: CHART_COLORS[i % CHART_COLORS.length] }}
              activeDot={{ r: 5 }}
            />
          ))}
        </LineChart>
      </ChartContainer>
    </div>
  );
}
