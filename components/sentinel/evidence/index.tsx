"use client";

// Sentinel's one routing layer over the v1 EvidenceRenderer — v1 components
// delegate unchanged (unknown names still fall through to its
// console-error-never-throw path, demo-safety brief §9); Sentinel-only
// components (wire-contract §9.6) route here: `RuleDiff`, `RuleCitation`,
// `DecisionCard`, and P3's `PolicyExceptionTable` / `RemediationReport`. v3
// removed `BTEventDetail` (docs/v3-migration-map.md
// §2b) — there is no single-event hero card when the investigation is an
// aggregate sweep over the whole book, so its import and routing branch are
// gone along with it.
//
// `OutreachDraftCard` is the one v1 registry member routed HERE instead of
// delegated: v1's EvidenceRenderer refuses it by design (in v1 it renders
// from action-tool state, never from renderEvidence output — see its
// console-error guard), but on the Sentinel stream the scripted scenario is
// the draft's source and a `render` step is its only path to the screen
// (wire-contract §9.6). Routing it here keeps v1's guard — and v1's
// semantics — untouched.

import { EvidenceRenderer, OutreachDraftCard } from "@/components/registry";
import type { SentinelRenderInstruction } from "@/lib/sentinel/registry";
import { DecisionCard } from "./decision-card";
import { PolicyExceptionTable } from "./policy-exception-table";
import { RemediationReport } from "./remediation-report";
import { RuleCitation } from "./rule-citation";
import { RuleDiff } from "./rule-diff";

export function SentinelEvidenceRenderer({
  instruction,
}: {
  instruction: SentinelRenderInstruction;
}) {
  if (instruction.component === "RuleDiff") return <RuleDiff {...instruction.props} />;
  if (instruction.component === "RuleCitation")
    return <RuleCitation {...instruction.props} />;
  if (instruction.component === "DecisionCard")
    return <DecisionCard {...instruction.props} />;
  if (instruction.component === "PolicyExceptionTable")
    return <PolicyExceptionTable {...instruction.props} />;
  if (instruction.component === "RemediationReport")
    return <RemediationReport {...instruction.props} />;
  if (instruction.component === "OutreachDraftCard")
    return <OutreachDraftCard {...instruction.props} />;
  return <EvidenceRenderer instruction={instruction} />;
}
