// Registry barrel + evidence router (brief §5c). `EvidenceRenderer` is the
// only place that maps a `renderEvidence` output's `component` name to a
// concrete renderer. Per docs/wire-contract.md §3, an unknown or non-evidence
// component name renders nothing and logs a console error — it must never
// throw (demo-safety rule, brief §8).
//
// OutreachDraftCard and ApprovalCard are registry members but are not driven
// by RenderInstruction (they render from action-tool parts/approval state
// per wire-contract §4), so EvidenceRenderer does not handle them here.

import type { RenderInstruction } from "@/lib/registry/schemas";
import { MetricRow } from "./metric-row";
import { TrendChart } from "./trend-chart";
import { PaymentHistoryTable } from "./payment-history-table";
import { RiskBadge } from "./risk-badge";
import { BTTimeline } from "./bt-timeline";
import { InterestProjectionChart } from "./interest-projection-chart";
import { PartyGraph } from "./party-graph";
import { OutreachDraftCard } from "./outreach-draft-card";
import { ApprovalCard } from "./approval-card";

export {
  MetricRow,
  TrendChart,
  PaymentHistoryTable,
  RiskBadge,
  BTTimeline,
  InterestProjectionChart,
  PartyGraph,
  OutreachDraftCard,
  ApprovalCard,
};

export function EvidenceRenderer({
  instruction,
}: {
  instruction: RenderInstruction;
}) {
  switch (instruction.component) {
    case "MetricRow":
      return <MetricRow {...instruction.props} />;
    case "TrendChart":
      return <TrendChart {...instruction.props} />;
    case "PaymentHistoryTable":
      return <PaymentHistoryTable {...instruction.props} />;
    case "RiskBadge":
      return <RiskBadge {...instruction.props} />;
    case "BTTimeline":
      return <BTTimeline {...instruction.props} />;
    case "InterestProjectionChart":
      return <InterestProjectionChart {...instruction.props} />;
    case "PartyGraph":
      return <PartyGraph {...instruction.props} />;
    case "OutreachDraftCard":
    case "ApprovalCard":
      // Registry members, but not evidence — they render from action-tool
      // parts / approval state (wire-contract §3–4), never from
      // renderEvidence output. Nothing to paint here; not an error.
      console.error(
        `EvidenceRenderer: "${instruction.component}" is not evidence-routed — it renders from action-tool state, not renderEvidence output.`,
      );
      return null;
    default: {
      const unknown = instruction as { component?: string };
      console.error(
        `EvidenceRenderer: unknown component "${unknown.component}" — rendering nothing.`,
      );
      return null;
    }
  }
}
