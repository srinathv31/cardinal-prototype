"use client";

// Registry barrel + evidence router (brief §5c). `EvidenceRenderer` is the
// only place that maps a `renderEvidence` output's `component` name to a
// concrete renderer. Per docs/wire-contract.md §3, an unknown or non-evidence
// component name renders nothing and logs a console error — it must never
// throw (demo-safety rule, brief §8).
//
// "use client" belongs on this barrel: registry components are the wire
// contract's client renderer layer, their props are serializable by
// construction (Zod-validated JSON, §5b), and several members reach Radix
// Slot (via ui/badge, ui/button), which calls createContext at module scope
// and cannot evaluate inside the React Server graph. Server components (e.g.
// the dashboard KPI row) import from here and get client references.
//
// ApprovalCard is a registry member but is not driven by RenderInstruction
// (it renders from action-tool parts/approval state per wire-contract §4),
// so EvidenceRenderer does not handle it here.
//
// live-llm cleanup (LIVE_LLM_PLAN.md Phase A): TrendChart, PaymentHistoryTable,
// RiskBadge, BTTimeline, InterestProjectionChart, PartyGraph, BarBreakdown, and
// OutreachDraftCard served the deleted payment-health/bt-lifecycle/au-growth/ask
// agents and the deleted Sentinel scenario player — deleted along with them.
// `lib/registry/schemas.ts` still types their `RenderInstruction` union
// members (that file is out of scope this pass), so they fall through to the
// generic "unknown component" branch below rather than a dedicated case.

import type { RenderInstruction } from "@/lib/registry/schemas";
import { MetricRow } from "./metric-row";
import { ApprovalCard } from "./approval-card";
import { CategoryPie } from "./category-pie";
import { TransactionTable } from "./transaction-table";

export { MetricRow, ApprovalCard, CategoryPie, TransactionTable };

export function EvidenceRenderer({
  instruction,
}: {
  instruction: RenderInstruction;
}) {
  switch (instruction.component) {
    case "MetricRow":
      return <MetricRow {...instruction.props} />;
    case "CategoryPie":
      return <CategoryPie {...instruction.props} />;
    case "TransactionTable":
      return <TransactionTable {...instruction.props} />;
    case "ApprovalCard":
      // Registry member, but not evidence — it renders from action-tool
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
