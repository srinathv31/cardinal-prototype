"use client";

// Registry renderer — pure presentation only (brief §5b). Every label, role,
// detail line, and the `highlight` flag arrive preformatted and validated
// server-side (lib/agents/au-growth/resolvers.ts); this component only maps
// them to a hub-and-spoke visual, never business arithmetic. Plain CSS/SVG
// only — no React Flow (that's reserved for the workflow canvas screen).
//
// Hub-and-spoke technique: the party row is a CSS grid with exactly
// `parties.length` equal-width columns, and the connector SVG uses a
// percentage viewBox (0–100) with each stem's x at the same fractional
// column-center `(i + 0.5) / N`. Because both the grid and the SVG position
// things fractionally, the lines stay aligned to their cards at any render
// width without measuring DOM layout. `@container` (not a viewport media
// query) drives the stacked-vs-row switch, since this card's rendered width
// is set by its evidence-pane column, not the browser viewport.

import { cn } from "@/lib/utils";
import type { PartyGraphProps } from "@/lib/registry/schemas";

type PartyNode = PartyGraphProps["parties"][number];

const ROLE_LABEL: Record<PartyNode["role"], string> = {
  PRIMARY: "Primary",
  AUTHORIZED_USER: "Authorized user",
};

// Static, fully-literal per-count classes — Tailwind's build-time content
// scanner reads raw source text, so a class name assembled at runtime via
// string interpolation (e.g. `@lg:grid-cols-${n}`) would never be generated.
// Schema caps parties at 6 (lib/registry/schemas.ts), so this table is exhaustive.
const ROW_GRID_COLS: Record<number, string> = {
  1: "@lg:grid-cols-1",
  2: "@lg:grid-cols-2",
  3: "@lg:grid-cols-3",
  4: "@lg:grid-cols-4",
  5: "@lg:grid-cols-5",
  6: "@lg:grid-cols-6",
};

function PartyCard({ party }: { party: PartyNode }) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-1.5 rounded-lg border border-border bg-background/60 px-4 py-3 ring-1 ring-foreground/5",
        party.highlight && "border-primary ring-2 ring-primary/40",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="min-w-0 truncate text-sm font-semibold text-foreground">
          {party.name}
        </span>
        <span
          className={cn(
            "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs font-medium",
            party.role === "PRIMARY"
              ? "bg-accent text-accent-foreground"
              : "bg-muted text-muted-foreground",
          )}
        >
          {ROLE_LABEL[party.role]}
        </span>
        {party.highlight ? (
          <span className="inline-flex shrink-0 items-center rounded-full bg-primary/15 px-2 py-0.5 text-xs font-semibold text-primary">
            Graduation candidate
          </span>
        ) : null}
      </div>
      {party.detail ? (
        <p className="text-sm text-muted-foreground">{party.detail}</p>
      ) : null}
    </div>
  );
}

/** Connector layer: a trunk from the hub down to a bus line, then a stem to
 * each party card's column center (single party: one straight trunk, no
 * bus). `vectorEffect="non-scaling-stroke"` keeps line thickness constant
 * even though `preserveAspectRatio="none"` stretches the viewBox
 * non-uniformly to fill the row's actual rendered width. */
function ConnectorLines({ count }: { count: number }) {
  const busY = 20;
  const centerOf = (i: number) => ((i + 0.5) / count) * 100;

  return (
    <svg
      aria-hidden
      viewBox="0 0 100 40"
      preserveAspectRatio="none"
      className="hidden h-10 w-full @lg:block"
    >
      <line
        x1={50}
        y1={0}
        x2={50}
        y2={count === 1 ? 40 : busY}
        stroke="var(--border)"
        strokeWidth={1.5}
        vectorEffect="non-scaling-stroke"
      />
      {count > 1 ? (
        <>
          <line
            x1={centerOf(0)}
            y1={busY}
            x2={centerOf(count - 1)}
            y2={busY}
            stroke="var(--border)"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
          />
          {Array.from({ length: count }, (_, i) => (
            <line
              key={i}
              x1={centerOf(i)}
              y1={busY}
              x2={centerOf(i)}
              y2={40}
              stroke="var(--border)"
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
            />
          ))}
        </>
      ) : null}
    </svg>
  );
}

export function PartyGraph({ title, account, parties }: PartyGraphProps) {
  const count = Math.min(Math.max(parties.length, 1), 6);
  const gridColsClass = ROW_GRID_COLS[count];

  return (
    <div className="@container rounded-xl border border-border bg-card p-4 ring-1 ring-foreground/5">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-base font-semibold">{title}</h3>
      </div>

      <div className="flex flex-col items-center">
        {/* Hub */}
        <div className="w-full max-w-xs rounded-lg border border-border bg-background/60 px-4 py-3 text-center ring-1 ring-foreground/5">
          <p className="text-sm font-semibold text-foreground">{account.label}</p>
          {account.detail ? (
            <p className="mt-0.5 text-sm text-muted-foreground">{account.detail}</p>
          ) : null}
        </div>

        {/* Row connector at @lg+; a plain vertical stub while stacked */}
        <ConnectorLines count={parties.length} />
        <div aria-hidden className="h-6 w-px bg-border @lg:hidden" />

        {/* Spokes */}
        <div className={cn("grid w-full grid-cols-1 gap-3 @lg:gap-4", gridColsClass)}>
          {parties.map((party) => (
            <PartyCard key={party.id} party={party} />
          ))}
        </div>
      </div>
    </div>
  );
}
