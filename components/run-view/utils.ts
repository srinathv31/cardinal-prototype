// Presentation-only helpers shared across the two chat surfaces (brief §5b:
// "zero business logic in components"). Every function here does mechanical
// string formatting or wire-part classification against data that already
// arrived preformatted/validated from the server — never arithmetic, never
// data derivation. See docs/wire-contract.md §2 for the part/state shapes
// these read.
//
// live-llm cleanup (LIVE_LLM_PLAN.md Phase A): this file used to back the
// deleted v1 run view (narration-pane.tsx, evidence-pane.tsx,
// approval-rail.tsx, run-view.tsx, run-switcher.tsx). Only the two helpers
// components/ops and components/servicing still import survive —
// `readStringField` and `humanizeComponentName` — pruned from what was a
// much larger shared module.

/** "TrendChart" -> "Trend Chart" — cosmetic label spacing, never touches a
 * figure or a business value. */
export function humanizeComponentName(name: string): string {
  return name.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
}

/** Defensive structural read of an arbitrary string field off a tool part's
 * `input` or `output` — generalized to any key so action-tool copy
 * (subject/body/rationale/confirmationId/etc.) can be read without per-tool
 * types. Never throws on partial/malformed data (brief §8). */
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
