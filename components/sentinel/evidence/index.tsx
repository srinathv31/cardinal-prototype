"use client";

// Sentinel's one routing layer over the v1 EvidenceRenderer — v1 components
// delegate unchanged (unknown names still fall through to its
// console-error-never-throw path, demo-safety brief §9); Sentinel-only
// components (wire-contract §9.6) route here: `RuleDiff` and branch
// `demo-aug4`'s ops-chat pair `ViolationsDashboard` / `ReportCard`
// (DEMO_BUILD_PLAN.md "UI components"). Every member of
// `SentinelRenderInstruction` must have a branch here — the fall-through hands
// `instruction` to v1's `EvidenceRenderer`, which only accepts the v1
// `RenderInstruction`, so an unrouted Sentinel component is a type error rather
// than a silent blank.
//
// live-llm cleanup (LIVE_LLM_PLAN.md Phase A): `DecisionCard`,
// `PolicyExceptionTable`, `RemediationReport`, `RuleCitation`, and
// `OutreachDraftCard` served the deleted Sentinel scenario player and are
// gone along with it, including their component-registry counterpart.

import { EvidenceRenderer } from "@/components/registry";
import type { RenderInstruction } from "@/lib/registry/schemas";
import type { SentinelRenderInstruction } from "@/lib/sentinel/registry";
import { ReportCard } from "./report-card";
import { RuleDiff } from "./rule-diff";
import { ViolationsDashboard } from "./violations-dashboard";

export function SentinelEvidenceRenderer({
  instruction,
}: {
  instruction: SentinelRenderInstruction;
}) {
  if (instruction.component === "RuleDiff") return <RuleDiff {...instruction.props} />;
  if (instruction.component === "ViolationsDashboard")
    return <ViolationsDashboard {...instruction.props} />;
  if (instruction.component === "ReportCard")
    return <ReportCard {...instruction.props} />;
  // Renderer-less by design (CLAUDE.md / LIVE_LLM_PLAN.md Phase A):
  // lib/sentinel/registry.ts stays whole, so DecisionCard/
  // PolicyExceptionTable/RemediationReport/RuleCitation/OutreachDraftCard are
  // still valid SentinelRenderInstruction members even though their
  // renderers are gone. `RenderInstruction` (the v1 registry's own type,
  // untouched) never declared those names, so this cast is the seam — at
  // runtime EvidenceRenderer's own `default` branch catches them exactly
  // like any other unknown component name: console.error, render nothing,
  // never throw (brief §8).
  return <EvidenceRenderer instruction={instruction as RenderInstruction} />;
}
