"use client";

// Sentinel's one routing layer over the v1 EvidenceRenderer — v1 components
// delegate unchanged (unknown names still fall through to its
// console-error-never-throw path, demo-safety brief §8); Sentinel-only
// components (wire-contract §9.6) route here; P4's evidence cards will join
// this switch.

import { EvidenceRenderer } from "@/components/registry";
import type { SentinelRenderInstruction } from "@/lib/sentinel/registry";
import { RuleDiff } from "./rule-diff";

export function SentinelEvidenceRenderer({
  instruction,
}: {
  instruction: SentinelRenderInstruction;
}) {
  if (instruction.component === "RuleDiff") return <RuleDiff {...instruction.props} />;
  return <EvidenceRenderer instruction={instruction} />;
}
