// Coarse, DECORATIVE mapping from the ops chat's stream state to the Sentinel
// agent graph's node/edge state (DEMO_THESIS.md ground rule 4: "The AI-agent
// workflow UI may appear on the side as spectacle only — nothing functional
// depends on it"). The graph beside `/ops` is a read-only
// `components/sentinel/live-agent-graph.tsx`; this module is the only thing
// between it and the chat.
//
// It is presentation-only classification of wire parts — the same latitude
// `components/run-view/utils.ts` takes, and for the same reason: it reads a
// part's `type`/`state`, never its payload, and it computes nothing about the
// business. Deleting this file would remove a picture, not a capability.
//
// Each ops tool lights one node, in the order the graph already draws them:
//
//   orchestrator    the turn itself — working while the stream is open
//   policy-analyst  parsePolicyDocument   (reads the document)
//   rule-engineer   saveRules             (drafts them into the store)
//   data-collector  queryViolations       (sweeps the book)
//   critic          generateReport        (writes up what happened)
//   approval-gate   executeBatchRemoval / queueActivationOutreach — whichever
//                   action the swept policy calls for; also lit by any pending
//                   approval via `approvalPending`, which the graph component
//                   already overrides on its own
//
// A node is `working` from the moment its tool call starts streaming until its
// output lands, then `done` for the rest of the conversation. Nothing here
// resets: the graph is a record of what this conversation has touched.

import type {
  SentinelGraphEdge,
  SentinelNodeId,
  SentinelNodeState,
} from "@/lib/sentinel/scenario/types";

/** Which graph node each ops tool lights up. */
const NODE_BY_TOOL: Record<string, SentinelNodeId> = {
  "tool-parsePolicyDocument": "policy-analyst",
  "tool-saveRules": "rule-engineer",
  "tool-queryViolations": "data-collector",
  "tool-executeBatchRemoval": "approval-gate",
  "tool-queueActivationOutreach": "approval-gate",
  "tool-generateReport": "critic",
};

/** The edge that feeds each node — animated while that node is working. */
const INBOUND_EDGE: Partial<Record<SentinelNodeId, SentinelGraphEdge>> = {
  "policy-analyst": { from: "orchestrator", to: "policy-analyst" },
  "rule-engineer": { from: "policy-analyst", to: "rule-engineer" },
  "data-collector": { from: "policy-analyst", to: "data-collector" },
  critic: { from: "data-collector", to: "critic" },
  "approval-gate": { from: "critic", to: "approval-gate" },
};

const IDLE_NODES: Record<SentinelNodeId, SentinelNodeState> = {
  orchestrator: "idle",
  "policy-analyst": "idle",
  "rule-engineer": "idle",
  "data-collector": "idle",
  critic: "idle",
  "approval-gate": "idle",
};

/** The subset of a UI message this module reads — deliberately structural, so
 * it stays valid as tool sets change and never needs the message union. */
export interface GraphInputMessage {
  role: string;
  parts: ReadonlyArray<{ type: string; state?: string }>;
}

export interface OpsGraphState {
  nodes: Record<SentinelNodeId, SentinelNodeState>;
  animatedEdges: SentinelGraphEdge[];
  headline: string;
  approvalPending: boolean;
  nodeDetails: Partial<Record<SentinelNodeId, string>>;
}

/** Tool-part states that mean "the call has resolved, one way or another". */
const SETTLED_STATES = new Set(["output-available", "output-denied", "output-error"]);
/** …and the one that means a human is being asked. */
const AWAITING_STATE = "approval-requested";

export function deriveOpsGraphState(
  messages: readonly GraphInputMessage[],
  isBusy: boolean,
): OpsGraphState {
  const nodes: Record<SentinelNodeId, SentinelNodeState> = { ...IDLE_NODES };
  const animated: SentinelGraphEdge[] = [];
  const nodeDetails: Partial<Record<SentinelNodeId, string>> = {};
  let approvalPending = false;
  let workingLabel: string | undefined;

  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const part of message.parts) {
      const nodeId = NODE_BY_TOOL[part.type];
      if (!nodeId) continue;

      const toolName = part.type.slice("tool-".length);
      if (part.state === AWAITING_STATE) approvalPending = true;

      if (part.state && SETTLED_STATES.has(part.state)) {
        nodes[nodeId] = "done";
        // A settled node keeps its tool's name as its caption, so the graph
        // reads as a trail of what ran rather than six words that all say
        // "done".
        nodeDetails[nodeId] = toolName;
        continue;
      }

      nodes[nodeId] = "working";
      nodeDetails[nodeId] = toolName;
      workingLabel = toolName;
    }
  }

  for (const [nodeId, state] of Object.entries(nodes) as Array<
    [SentinelNodeId, SentinelNodeState]
  >) {
    if (state !== "working") continue;
    const edge = INBOUND_EDGE[nodeId];
    if (edge) animated.push(edge);
  }

  const touched = Object.values(nodes).some((state) => state !== "idle");
  if (isBusy) {
    nodes.orchestrator = "working";
    if (animated.length === 0) {
      animated.push({ from: "orchestrator", to: "policy-analyst" });
    }
  } else if (touched) {
    nodes.orchestrator = "done";
  }

  const headline = isBusy
    ? workingLabel
      ? `running ${workingLabel}`
      : "routing"
    : approvalPending
      ? "awaiting approval"
      : touched
        ? "idle · awaiting next request"
        : "idle";

  return { nodes, animatedEdges: animated, headline, approvalPending, nodeDetails };
}
