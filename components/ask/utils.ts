// Ask-surface helpers (brief §5b: "zero business logic in components").
// Presentation-only: extracting a message's plain text for the user bubble,
// and resolving a friendly string from useChat's thrown Error — mirrors
// components/run-view/narration-pane.tsx's local resolveErrorMessage,
// generalized for the identical /api/agents/{agentId}/stream error body
// shape (docs/wire-contract.md §1).

import type { CardinalUIMessage } from "@/lib/agents/registry";

export function messageText(message: CardinalUIMessage): string {
  return message.parts
    .filter((part) => part.type === "text")
    .map((part) => part.text)
    .join("");
}

export function resolveErrorMessage(error: Error): string {
  try {
    const parsed = JSON.parse(error.message) as { error?: unknown };
    if (typeof parsed.error === "string" && parsed.error.length > 0) return parsed.error;
  } catch {
    // Not JSON — fall through to the raw message.
  }
  return error.message || "The ask run failed to start.";
}
