// Presentation-only helpers shared across the run view panes (brief §5b:
// "zero business logic in components"). Every function here does mechanical
// string formatting or wire-part classification against data that already
// arrived preformatted/validated from the server — never arithmetic, never
// data derivation. See docs/wire-contract.md §2 for the part/state shapes
// these read.

import type { PaymentHealthUIMessage } from "@/lib/agents/payment-health/agent";

export type AssistantPart = PaymentHealthUIMessage["parts"][number];

export type ActionToolPart = Extract<
  AssistantPart,
  { type: "tool-proposeDueDateChange" | "tool-sendOutreachDraft" }
>;

/** "TrendChart" -> "Trend Chart" — cosmetic label spacing, never touches a
 * figure or a business value. */
export function humanizeComponentName(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
}

/** Best-effort, defensive read of a tool part's `input.component` across
 * every possible input shape a renderEvidence part can carry — a full
 * `EvidenceSpec` once available, or a `DeepPartial` mid-stream where
 * `component` may not have arrived yet. Never throws on partial/malformed
 * input (brief §8: renders must never crash). */
export function readComponentName(input: unknown): string | undefined {
  if (
    input &&
    typeof input === "object" &&
    "component" in input &&
    typeof (input as { component?: unknown }).component === "string"
  ) {
    return (input as { component: string }).component;
  }
  return undefined;
}

export function isActionToolPart(part: AssistantPart): part is ActionToolPart {
  return part.type === "tool-proposeDueDateChange" || part.type === "tool-sendOutreachDraft";
}

/** True if any action-tool part across the run is currently paused awaiting
 * a human decision (docs/wire-contract.md §2 state machine). */
export function hasPendingApproval(messages: PaymentHealthUIMessage[]): boolean {
  return messages.some(
    (message) =>
      message.role === "assistant" &&
      message.parts.some((part) => isActionToolPart(part) && part.state === "approval-requested"),
  );
}

/** Mechanical list of evidence component labels rendered so far this run —
 * exactly the wire-contract §4 rule for ApprovalCard's `evidence` prop. */
export function evidenceLabelsSoFar(messages: PaymentHealthUIMessage[]): string[] {
  const labels: string[] = [];
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const part of message.parts) {
      if (part.type === "tool-renderEvidence" && part.state === "output-available") {
        labels.push(part.output.component);
      }
    }
  }
  return labels;
}

export function formatClockTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleTimeString("en-US", { hour12: false });
}

export function formatDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Coarse-grained state grouping shared by narration step chips and the
 * approval rail — collapses the wire contract's six tool-part states into
 * the five visual tones the run view actually distinguishes. */
export type StepTone = "pending" | "waiting" | "done" | "declined" | "error";

export function toneFromToolState(state: string): StepTone {
  switch (state) {
    case "input-streaming":
    case "input-available":
      return "pending";
    case "approval-requested":
    case "approval-responded":
      return "waiting";
    case "output-available":
      return "done";
    case "output-denied":
      return "declined";
    case "output-error":
      return "error";
    default:
      return "pending";
  }
}
