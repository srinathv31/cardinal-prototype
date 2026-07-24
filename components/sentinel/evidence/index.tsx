"use client";

// Sentinel's one routing layer over the v1 EvidenceRenderer — v1 components
// delegate unchanged (unknown names still fall through to its
// console-error-never-throw path, demo-safety brief §8); Sentinel-only
// components (wire-contract §9.6) route here. P4 (W4.2) fulfills the
// evidence-cards note: `BTEventDetail` and `RuleCitation` join `RuleDiff`
// below. Addendum v2.1 (post-P4) adds `DecisionCard` — Act III's
// response-routes card — the same way.
//
// `OutreachDraftCard` is the one v1 registry member routed HERE instead of
// delegated: v1's EvidenceRenderer refuses it by design (in v1 it renders
// from action-tool state, never from renderEvidence output — see its
// console-error guard), but on the Sentinel stream the scripted scenario is
// the draft's source and a `render` step is its only path to the screen
// (brief §3 Act III's ops-notification beat, wire-contract §9.6). Routing
// it here keeps v1's guard — and v1's semantics — untouched.

import { EvidenceRenderer, OutreachDraftCard } from "@/components/registry";
import type { SentinelRenderInstruction } from "@/lib/sentinel/registry";
import { BTEventDetail } from "./bt-event-detail";
import { DecisionCard } from "./decision-card";
import { RuleCitation } from "./rule-citation";
import { RuleDiff } from "./rule-diff";

export function SentinelEvidenceRenderer({
  instruction,
}: {
  instruction: SentinelRenderInstruction;
}) {
  if (instruction.component === "RuleDiff") return <RuleDiff {...instruction.props} />;
  if (instruction.component === "BTEventDetail")
    return <BTEventDetail {...instruction.props} />;
  if (instruction.component === "RuleCitation")
    return <RuleCitation {...instruction.props} />;
  if (instruction.component === "DecisionCard")
    return <DecisionCard {...instruction.props} />;
  if (instruction.component === "OutreachDraftCard")
    return <OutreachDraftCard {...instruction.props} />;
  return <EvidenceRenderer instruction={instruction} />;
}
