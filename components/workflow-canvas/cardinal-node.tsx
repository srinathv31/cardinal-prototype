// Custom React Flow node type ("cardinal") — brief §7 agent-palette-card
// vibe carried onto the canvas. Node data is just `{ catalogId }`; label,
// blurb, category, and icon are looked up from node-catalog.ts here rather
// than stored on the node (icons aren't serializable through node data).
// Pure presentation, zero business logic (brief §5b) — this only renders
// whatever catalog entry the canvas placed.

import { Handle, Position, type NodeProps, type Node } from "@xyflow/react";
import { cn } from "@/lib/utils";
import { NODE_CATALOG_BY_ID, NODE_CATALOG_ICONS, type NodeCatalogId } from "./node-catalog";

export type CardinalNodeData = { catalogId: NodeCatalogId };
export type CardinalNodeType = Node<CardinalNodeData, "cardinal">;

const CATEGORY_CHIP_STYLES: Record<string, string> = {
  Trigger: "bg-chart-1/15 text-chart-1",
  Analysis: "bg-chart-2/15 text-chart-2",
  Action: "bg-chart-3/15 text-chart-3",
  Governance: "bg-warning/15 text-warning",
  Audit: "bg-chart-4/15 text-chart-4",
};

export function CardinalNode({ data, selected }: NodeProps<CardinalNodeType>) {
  const entry = NODE_CATALOG_BY_ID[data.catalogId];
  const Icon = NODE_CATALOG_ICONS[data.catalogId];

  return (
    <div
      className={cn(
        "flex w-56 items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 ring-1 ring-foreground/5 transition-shadow",
        selected && "border-ring ring-2 ring-ring",
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        className="!size-3 !border-2 !border-background !bg-primary"
      />

      <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-foreground">
        <Icon className="size-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">{entry.label}</p>
        <span
          className={cn(
            "mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-sm font-medium",
            CATEGORY_CHIP_STYLES[entry.category],
          )}
        >
          {entry.category}
        </span>
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!size-3 !border-2 !border-background !bg-primary"
      />
    </div>
  );
}
