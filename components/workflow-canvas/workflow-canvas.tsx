"use client";

// Workflow Canvas (brief §3 Beat 1, §4 screen 2). Pure UI state — nodes,
// edges, and the typed workflow name live only in this component's React
// state. The single side effect is Run's navigation call; the canvas never
// executes a workflow itself (brief §5b: zero business logic in components).

import { useCallback, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  BackgroundVariant,
  Controls,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Connection,
  type Edge,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Play, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Palette, WORKFLOW_DRAG_MIME } from "./palette";
import { CardinalNode, type CardinalNodeType } from "./cardinal-node";
import { isNodeCatalogId } from "./node-catalog";

const nodeTypes: NodeTypes = { cardinal: CardinalNode };

// Monotonic per-mount counter for readable node ids (e.g. "analyze-account-2")
// — display-only, never persisted, never read by any tool.
let nodeSequence = 0;
function nextNodeId(catalogId: string) {
  nodeSequence += 1;
  return `${catalogId}-${nodeSequence}`;
}

export function WorkflowCanvas() {
  // useReactFlow (for screenToFlowPosition) only works inside a provider, so
  // the provider wraps the component that actually needs it.
  return (
    <ReactFlowProvider>
      <WorkflowCanvasInner />
    </ReactFlowProvider>
  );
}

function WorkflowCanvasInner() {
  const router = useRouter();
  const { screenToFlowPosition } = useReactFlow<CardinalNodeType, Edge>();
  const [nodes, setNodes, onNodesChange] = useNodesState<CardinalNodeType>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);

  const onConnect = useCallback(
    (connection: Connection) =>
      setEdges((eds) => addEdge({ ...connection, animated: true, type: "smoothstep" }, eds)),
    [setEdges],
  );

  const onDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }, []);

  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      const catalogId = event.dataTransfer.getData(WORKFLOW_DRAG_MIME);
      if (!isNodeCatalogId(catalogId)) return;

      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const newNode: CardinalNodeType = {
        id: nextNodeId(catalogId),
        type: "cardinal",
        position,
        data: { catalogId },
      };
      setNodes((nds) => nds.concat(newNode));
    },
    [screenToFlowPosition, setNodes],
  );

  const handleClear = useCallback(() => {
    setNodes([]);
    setEdges([]);
  }, [setNodes, setEdges]);

  const handleRun = useCallback(() => {
    // Beat 1 is scripted (brief §8): the canvas always hands off to the
    // Payment Health run regardless of the typed workflow name or the actual
    // composed nodes/edges — this is theater backed by a real handoff, not a
    // general workflow executor. Run navigates the presenter straight into
    // the Payment Health run, already started (brief §3 Beat 1 -> Beat 2).
    router.push("/runs?autostart=payment-health");
  }, [router]);

  const canRun = nodes.length > 0;
  const isEmpty = nodes.length === 0 && edges.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card/60 px-4 py-3 ring-1 ring-foreground/5">
        <Input
          defaultValue=""
          placeholder="Name this workflow…"
          aria-label="Workflow name"
          className="max-w-xs"
        />

        <span className="rounded-full bg-muted px-3 py-1 text-sm font-medium text-muted-foreground">
          {nodes.length} node{nodes.length === 1 ? "" : "s"} · {edges.length} connection
          {edges.length === 1 ? "" : "s"}
        </span>

        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" onClick={handleClear} disabled={isEmpty}>
            <Trash2 />
            Clear canvas
          </Button>
          <Button
            size="lg"
            onClick={handleRun}
            disabled={!canRun}
            title={canRun ? "Run this workflow" : "Add at least one node before running"}
          >
            <Play />
            Run
          </Button>
        </div>
      </div>

      <div className="flex gap-4">
        <Palette />

        <div className="relative h-[70vh] flex-1 overflow-hidden rounded-xl border border-border bg-card/40 ring-1 ring-foreground/5">
          {nodes.length === 0 ? (
            <div className="pointer-events-none absolute inset-0 z-10 grid place-items-center px-6 text-center">
              <p className="max-w-xs text-base text-muted-foreground">
                Drag nodes from the palette to compose a workflow.
              </p>
            </div>
          ) : null}

          <ReactFlow<CardinalNodeType, Edge>
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onDrop={onDrop}
            onDragOver={onDragOver}
            nodeTypes={nodeTypes}
            colorMode="dark"
            deleteKeyCode={["Backspace", "Delete"]}
            fitView
          >
            <Background variant={BackgroundVariant.Dots} />
            <Controls />
          </ReactFlow>
        </div>
      </div>
    </div>
  );
}
