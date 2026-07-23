// Presentation-only helpers shared across the run view panes (brief §5b:
// "zero business logic in components"). Every function here does mechanical
// string formatting or wire-part classification against data that already
// arrived preformatted/validated from the server — never arithmetic, never
// data derivation. See docs/wire-contract.md §2 for the part/state shapes
// these read.

import type { CardinalUIMessage } from "@/lib/agents/registry";

export type AssistantPart = CardinalUIMessage["parts"][number];

/** Any `tool-*` part other than `tool-renderEvidence` is an action proposal
 * (docs/wire-contract.md §2 — "a frontend handles action-tool parts
 * generically"). New action tools across agents are additive and need no
 * change here. */
export type ActionToolPart = Exclude<
  Extract<AssistantPart, { type: `tool-${string}` }>,
  { type: "tool-renderEvidence" }
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

/** Defensive structural read of an arbitrary string field off a tool part's
 * `input` or `output` — same spirit as `readComponentName`, generalized to
 * any key so action-tool copy (subject/body/rationale/confirmationId/etc.)
 * can be read without per-tool types. Never throws on partial/malformed
 * data (brief §8). */
export function readStringField(value: unknown, key: string): string | undefined {
  if (
    value &&
    typeof value === "object" &&
    key in value &&
    typeof (value as Record<string, unknown>)[key] === "string"
  ) {
    return (value as Record<string, string>)[key];
  }
  return undefined;
}

export function isActionToolPart(part: AssistantPart): part is ActionToolPart {
  return part.type.startsWith("tool-") && part.type !== "tool-renderEvidence";
}

/** Strips the `tool-` prefix off a wire part type, e.g. "tool-sendOutreachDraft"
 * -> "sendOutreachDraft". */
export function toolNameFromPartType(type: string): string {
  return type.startsWith("tool-") ? type.slice("tool-".length) : type;
}

/** True if any action-tool part across the run is currently paused awaiting
 * a human decision (docs/wire-contract.md §2 state machine). */
export function hasPendingApproval(messages: CardinalUIMessage[]): boolean {
  return messages.some(
    (message) =>
      message.role === "assistant" &&
      message.parts.some((part) => isActionToolPart(part) && part.state === "approval-requested"),
  );
}

/** Mechanical list of evidence component labels rendered so far this run —
 * exactly the wire-contract §4 rule for ApprovalCard's `evidence` prop. */
export function evidenceLabelsSoFar(messages: CardinalUIMessage[]): string[] {
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

/** Static copy for an action-tool proposal, keyed by tool name (wire-contract
 * §4 — "static copy map keyed by tool name"). Unknown tool names (future
 * agents) fall back to humanized copy rather than crashing (brief §8). */
export interface ActionCopy {
  title: string;
  description: string;
  noun: string;
  pending: string;
}

export const ACTION_COPY: Record<string, ActionCopy> = {
  proposeDueDateChange: {
    title: "Align payment due date",
    description: "Move this account's payment due date so autopay lands after payday.",
    noun: "Due-date change",
    pending: "Proposing due-date change…",
  },
  sendOutreachDraft: {
    title: "Send payment support outreach",
    description: "Email the cardholder to offer help before the next statement.",
    noun: "Outreach draft",
    pending: "Drafting outreach email…",
  },
  sendRetentionOutreach: {
    title: "Send retention outreach",
    description: "Email the cardholder with payment-plan options before the promo rate ends.",
    noun: "Retention outreach",
    pending: "Drafting retention outreach…",
  },
  sendGraduationInvite: {
    title: "Send card invitation",
    description: "Invite this authorized user to apply for their own card — drafted for review.",
    noun: "Card invitation",
    pending: "Drafting card invitation…",
  },
};

/** Falls back to humanized copy for a tool name outside the static map — an
 * unrecognized action tool renders with generic-but-sensible copy, never a
 * crash (brief §8; wire-contract §2 "new action tools are additive"). */
export function getActionCopy(toolName: string): ActionCopy {
  const known = ACTION_COPY[toolName];
  if (known) return known;
  const humanized = humanizeComponentName(toolName);
  return {
    title: humanized,
    description: "",
    noun: humanized,
    pending: "Preparing proposal…",
  };
}
