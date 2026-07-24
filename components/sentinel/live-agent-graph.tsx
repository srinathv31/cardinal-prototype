"use client";

// Live Agent Graph — center panel (brief §4, W2.1). A read-only React Flow
// renderer of the `graphStep` messages the ScenarioPlayer already folded
// into `nodes`/`animatedEdges` (player.ts's handleGraphStep: the animated
// set is REPLACED wholesale, never diffed) — this component only tests
// membership and renders. Layout, labels, and the static edge catalog are
// module constants that never change at runtime (brief §4: "fixed layout ...
// the graph holds no logic"); the Approval Gate's pending glow is the one
// presentational exception, computed here from `approvalPending` rather than
// scripted by every scenario that wants the gate to look busy while a human
// decides.
//
// nodes/edges are derived with `useMemo` straight from props — controlled,
// read-only, no `useNodesState`/`useEdgesState`, no change handlers, no
// drag/pan/zoom (brief §9: "no workflow builder features on the Sentinel
// stage" — this is theater, not the Workflow Canvas).

import { useMemo } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Handle,
  Position,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Database,
  FileSearch,
  Network,
  ShieldCheck,
  SquareFunction,
  UserCheck,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  SENTINEL_NODE_IDS,
  type SentinelGraphEdge,
  type SentinelNodeId,
  type SentinelNodeState,
} from "@/lib/sentinel/scenario/types";

/** Top-to-bottom DAG positions. The center panel is portrait-shaped (3:6:4
 * columns leave it ~340-900px wide but full-height), so a horizontal chain
 * would fitView down to an illegibly tiny strip — vertical flow keeps the
 * ~w-44 node cards near full size at every stage width. Rule Engineer and
 * Data Collector share the middle rank, side by side. */
const NODE_POSITIONS: Record<SentinelNodeId, { x: number; y: number }> = {
  orchestrator: { x: 110, y: 0 },
  "policy-analyst": { x: 110, y: 130 },
  "rule-engineer": { x: 0, y: 260 },
  "data-collector": { x: 220, y: 260 },
  critic: { x: 110, y: 390 },
  "approval-gate": { x: 110, y: 520 },
};

const NODE_LABELS: Record<SentinelNodeId, string> = {
  orchestrator: "Orchestrator",
  "policy-analyst": "Policy Analyst",
  "rule-engineer": "Rule Engineer",
  "data-collector": "Data Collector",
  critic: "Critic",
  "approval-gate": "Approval Gate",
};

const NODE_ICONS: Record<SentinelNodeId, LucideIcon> = {
  orchestrator: Network,
  "policy-analyst": FileSearch,
  "rule-engineer": SquareFunction,
  "data-collector": Database,
  critic: ShieldCheck,
  "approval-gate": UserCheck,
};

const STATE_CAPTION: Record<SentinelNodeState, string> = {
  idle: "idle",
  working: "working",
  done: "done",
  armed: "armed",
};

/** Always-rendered edge catalog (brief §4) — dim by default, lit when its
 * (from, to) pair is in the `animatedEdges` prop. `edgeKey` doubles as both
 * the catalog lookup key and the React Flow edge id. */
const STATIC_EDGES: SentinelGraphEdge[] = [
  { from: "orchestrator", to: "policy-analyst" },
  { from: "policy-analyst", to: "rule-engineer" },
  { from: "policy-analyst", to: "data-collector" },
  { from: "rule-engineer", to: "critic" },
  { from: "data-collector", to: "critic" },
  { from: "critic", to: "approval-gate" },
];

function edgeKey(edge: SentinelGraphEdge): string {
  return `${edge.from}->${edge.to}`;
}

const ANIMATED_EDGE_STYLE = { stroke: "var(--color-primary)", strokeWidth: 2 };
const DIM_EDGE_STYLE = { stroke: "var(--color-border)", strokeWidth: 1.5 };

type SentinelAgentNodeData = { nodeId: SentinelNodeId; state: SentinelNodeState };
type SentinelAgentNodeType = Node<SentinelAgentNodeData, "sentinelAgent">;

/** State visuals (brief §4: idle dim, working glow + pulse, done steady
 * lit) — a presentational lookup, not logic, mirroring cardinal-node.tsx's
 * CATEGORY_CHIP_STYLES. The state caption is real text (not just a glow) so
 * it reads at projector distance (brief §1). */
function SentinelAgentNode({ data }: NodeProps<SentinelAgentNodeType>) {
  const Icon = NODE_ICONS[data.nodeId];
  const label = NODE_LABELS[data.nodeId];
  const state = data.state;

  return (
    <div className="relative w-44">
      {state === "working" ? (
        <div
          className="absolute -inset-1 -z-10 animate-pulse rounded-xl bg-primary/25 blur-md"
          aria-hidden="true"
        />
      ) : null}
      {state === "armed" ? (
        // Act II's post-activation "idle-armed" state (brief §3 beat 4):
        // clearly alive, clearly not busy — the same glow treatment as
        // `working` but dimmer and on a slower cadence, so it reads as a
        // resting pulse rather than active processing.
        <div
          className="absolute -inset-1 -z-10 animate-pulse rounded-xl bg-primary/10 blur-md [animation-duration:3s]"
          aria-hidden="true"
        />
      ) : null}
      <div
        className={cn(
          "flex items-center gap-3 rounded-xl border px-3.5 py-3 transition-all duration-300",
          state === "idle" && "border-border bg-card text-muted-foreground opacity-55",
          state === "working" && "border-primary bg-card text-foreground opacity-100",
          state === "done" && "border-primary/60 bg-primary/10 text-foreground opacity-100",
          state === "armed" && "border-primary/40 bg-card text-foreground opacity-80",
        )}
      >
        <Handle type="target" position={Position.Top} className="opacity-0 pointer-events-none" />
        <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
          <Icon className="size-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{label}</p>
          <p className={cn("text-xs", state === "working" ? "text-primary" : "text-muted-foreground")}>
            {STATE_CAPTION[state]}
          </p>
        </div>
        <Handle type="source" position={Position.Bottom} className="opacity-0 pointer-events-none" />
      </div>
    </div>
  );
}

const nodeTypes: NodeTypes = { sentinelAgent: SentinelAgentNode };

export function LiveAgentGraph({
  nodes,
  animatedEdges,
  headline,
  approvalPending,
}: {
  nodes: Record<SentinelNodeId, SentinelNodeState>;
  animatedEdges: SentinelGraphEdge[];
  headline: string;
  approvalPending: boolean;
}) {
  // Approval Gate lights up whenever a gate is pending (brief §4) — a
  // presentational override, not a second source of truth: scenarios may
  // still script the node explicitly (e.g. back to `done` once resolved),
  // and that scripted value wins the instant `approvalPending` goes false.
  const effectiveNodes = useMemo(
    () => (approvalPending ? { ...nodes, "approval-gate": "working" as const } : nodes),
    [nodes, approvalPending],
  );

  const flowNodes = useMemo<SentinelAgentNodeType[]>(
    () =>
      SENTINEL_NODE_IDS.map((nodeId) => ({
        id: nodeId,
        type: "sentinelAgent",
        position: NODE_POSITIONS[nodeId],
        data: { nodeId, state: effectiveNodes[nodeId] },
      })),
    [effectiveNodes],
  );

  const flowEdges = useMemo<Edge[]>(() => {
    const animatedKeys = new Set(animatedEdges.map(edgeKey));
    const catalogEdges = STATIC_EDGES.map((edge) => {
      const id = edgeKey(edge);
      const animated = animatedKeys.has(id);
      return {
        id,
        source: edge.from,
        target: edge.to,
        type: "smoothstep",
        animated,
        style: animated ? ANIMATED_EDGE_STYLE : DIM_EDGE_STYLE,
      };
    });

    // A scripted animated pair that isn't in the static catalog is never
    // dropped — appended instead, so the renderer can't silently swallow a
    // signal the scenario meant the audience to see.
    const catalogKeys = new Set(STATIC_EDGES.map(edgeKey));
    const extraEdges = animatedEdges
      .filter((edge) => !catalogKeys.has(edgeKey(edge)))
      .map((edge) => ({
        id: edgeKey(edge),
        source: edge.from,
        target: edge.to,
        type: "smoothstep",
        animated: true,
        style: ANIMATED_EDGE_STYLE,
      }));

    return [...catalogEdges, ...extraEdges];
  }, [animatedEdges]);

  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card ring-1 ring-foreground/5">
      <header className="shrink-0 border-b border-border px-4 py-3.5">
        <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Live agent graph
        </h2>
      </header>
      <div className="relative min-h-0 flex-1">
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          nodeTypes={nodeTypes}
          colorMode="dark"
          fitView
          fitViewOptions={{ padding: 0.15 }}
          // Panning/zooming are all disabled below, so fitView's computed
          // zoom is the ONLY thing standing between an undersized panel and
          // permanently clipping nodes off-screen. The default minZoom (0.5)
          // clamps that computation; a lower floor lets fitView shrink as
          // far as it needs to keep all six nodes visible however small the
          // window gets.
          minZoom={0.1}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          nodesFocusable={false}
          edgesFocusable={false}
          panOnDrag={false}
          panOnScroll={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          zoomOnDoubleClick={false}
        >
          <Background variant={BackgroundVariant.Dots} />
        </ReactFlow>
      </div>
      <p className="shrink-0 truncate border-t border-border px-4 py-2.5 font-mono text-sm text-muted-foreground">
        {headline || "—"}
      </p>
    </section>
  );
}
