// Palette node catalog (brief §3 Beat 1 — exactly the 5 node types the demo
// script drags onto the canvas: Event Monitor -> Analyze Account -> Propose
// Action -> Approval Gate -> Event Log). This is the only place the palette
// entries are defined; palette.tsx and cardinal-node.tsx both read from it.
//
// Icons live here as a separate lookup keyed by catalog id, NOT as a field on
// each entry — a React Flow node's `data` only ever carries the catalog id
// (see cardinal-node.tsx), because icon components aren't serializable
// through node data. Components look up label/blurb/category/icon by id
// rather than duplicating them.

import {
  Radio,
  SearchCheck,
  FileEdit,
  ShieldCheck,
  ScrollText,
  type LucideIcon,
} from "lucide-react";

export type NodeCatalogId =
  | "event-monitor"
  | "analyze-account"
  | "propose-action"
  | "approval-gate"
  | "event-log";

export type NodeCategory =
  | "Trigger"
  | "Analysis"
  | "Action"
  | "Governance"
  | "Audit";

export interface NodeCatalogEntry {
  id: NodeCatalogId;
  label: string;
  category: NodeCategory;
  /** One-line capability blurb (brief §7 palette-card vibe). */
  blurb: string;
}

export const NODE_CATALOG: NodeCatalogEntry[] = [
  {
    id: "event-monitor",
    label: "Event Monitor",
    category: "Trigger",
    blurb: "Watches the live account event stream for a triggering condition.",
  },
  {
    id: "analyze-account",
    label: "Analyze Account",
    category: "Analysis",
    blurb: "Pulls payments, transactions, and balances to build the evidence trail.",
  },
  {
    id: "propose-action",
    label: "Propose Action",
    category: "Action",
    blurb: "Drafts the recommended servicing outreach or offer for human review.",
  },
  {
    id: "approval-gate",
    label: "Approval Gate",
    category: "Governance",
    blurb: "Pauses the run until a human explicitly approves or declines.",
  },
  {
    id: "event-log",
    label: "Event Log",
    category: "Audit",
    blurb: "Writes every step of the run to the audit trail.",
  },
];

export const NODE_CATALOG_BY_ID: Record<NodeCatalogId, NodeCatalogEntry> = Object.fromEntries(
  NODE_CATALOG.map((entry) => [entry.id, entry]),
) as Record<NodeCatalogId, NodeCatalogEntry>;

export const NODE_CATALOG_ICONS: Record<NodeCatalogId, LucideIcon> = {
  "event-monitor": Radio,
  "analyze-account": SearchCheck,
  "propose-action": FileEdit,
  "approval-gate": ShieldCheck,
  "event-log": ScrollText,
};

export function isNodeCatalogId(value: string): value is NodeCatalogId {
  return Object.prototype.hasOwnProperty.call(NODE_CATALOG_BY_ID, value);
}
