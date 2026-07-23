"use client";

// Left-rail node palette (brief §7: "the agent-palette-card design — name,
// category chip, capability blurb"). Cards are draggable via the plain HTML5
// drag API: onDragStart stows the catalog id in dataTransfer; the canvas
// reads it back out on drop (workflow-canvas.tsx) to place a 'cardinal' node.
// No canvas state lives here — this is a static, uncontrolled list.

import { NODE_CATALOG, NODE_CATALOG_ICONS } from "./node-catalog";

/** dataTransfer key shared with workflow-canvas.tsx's onDrop handler. */
export const WORKFLOW_DRAG_MIME = "application/x-cardinal-node-catalog-id";

const CATEGORY_LABEL_STYLES: Record<string, string> = {
  Trigger: "text-chart-1",
  Analysis: "text-chart-2",
  Action: "text-chart-3",
  Governance: "text-warning",
  Audit: "text-chart-4",
};

export function Palette() {
  return (
    <aside className="flex w-72 shrink-0 flex-col gap-3 overflow-y-auto rounded-xl border border-border bg-card/60 p-4 ring-1 ring-foreground/5">
      <div>
        <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Node palette
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">Drag a node onto the canvas.</p>
      </div>

      <div className="flex flex-col gap-2">
        {NODE_CATALOG.map((entry) => {
          const Icon = NODE_CATALOG_ICONS[entry.id];
          return (
            <div
              key={entry.id}
              draggable
              onDragStart={(event) => {
                event.dataTransfer.setData(WORKFLOW_DRAG_MIME, entry.id);
                event.dataTransfer.effectAllowed = "move";
              }}
              className="cursor-grab rounded-lg border border-border bg-card p-3 ring-1 ring-foreground/5 transition-colors hover:border-ring active:cursor-grabbing"
            >
              <div className="flex items-center gap-2.5">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-muted text-foreground">
                  <Icon className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">{entry.label}</p>
                  <span
                    className={`text-sm font-medium ${CATEGORY_LABEL_STYLES[entry.category]}`}
                  >
                    {entry.category}
                  </span>
                </div>
              </div>
              <p className="mt-2 text-sm leading-snug text-muted-foreground">{entry.blurb}</p>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
