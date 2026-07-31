// The rule store (DEMO_BUILD_PLAN.md §Contracts — "Rule store"). In-memory,
// reset-able, and deliberately EMPTY at process start: "no rules configured"
// is a true demo state until the upload beat runs, which is what makes
// `GET /api/violations`'s 409 an honest answer rather than a staged one
// (DEMO_THESIS.md UC1 beats 1–3).
//
// Cached on globalThis for the same reason lib/events/store.ts is: in dev,
// Turbopack's HMR re-evaluates modules, and a module-scope array would drop
// the presenter's approved rules mid-rehearsal. `resetRules()` is wired into
// POST /api/reset so the demo's reset control returns the store to its
// opening (empty) state along with the Event Log and the cached SOE db.
//
// This module is data plumbing only — no evaluation, no policy knowledge.
// What a rule MEANS lives in lib/rules/evaluators.ts; what a rule IS (an
// approved, cited, machine-footed row a human said yes to) lives here.

export const POLICY_IDS = ['authorized-user', 'card-activation'] as const;

export type PolicyId = (typeof POLICY_IDS)[number];

export function isPolicyId(value: string): value is PolicyId {
  return (POLICY_IDS as readonly string[]).includes(value);
}

export interface StoredRule {
  /** 'R1' | 'R2' | 'R3' | 'CA-R1' | 'CA-R2' — the id the evaluator emits and
   *  `GET /api/violations` filters on. Unique per policy. */
  id: string;
  policyId: PolicyId;
  title: string;
  /** Human sentence, cited from the policy document. */
  requirement: string;
  /** Document section reference the requirement was cited from. */
  citation: string;
  /** Machine-readable footer (the RuleDiff pattern —
   *  lib/sentinel/policy.ts's `machine` block, flattened to one line). */
  machine: string;
  /** ISO 8601 — when the rule was stored, i.e. when a human approved it. */
  addedAt: string;
}

/** What a caller hands `saveRules`: everything but the two fields the store
 *  itself stamps. `addedAt` is accepted (not just defaulted) so a scripted
 *  beat can pin it and stay byte-identical across replays. */
export type RuleInput = Omit<StoredRule, 'policyId' | 'addedAt'> & {
  addedAt?: string;
};

export interface SaveRulesResult {
  saved: number;
}

declare global {
  // HMR-safe singleton — see module comment. `var` is required by
  // `declare global` ambient syntax.
  var __cardinalRuleStore: StoredRule[] | undefined;
}

function getStore(): StoredRule[] {
  return (globalThis.__cardinalRuleStore ??= []);
}

/**
 * Stores (or replaces) rules for one policy. Upsert by `id` within the
 * policy: re-running the approval beat without a reset leaves three rules
 * stored, not six — a replayed demo must not double its own rule set.
 * Insertion order is preserved, so `getRules()` hands back R1, R2, R3 in the
 * order the agent proposed and the human approved them.
 */
export function saveRules(
  policyId: PolicyId,
  rules: readonly RuleInput[],
): SaveRulesResult {
  const store = getStore();
  for (const rule of rules) {
    const stored: StoredRule = {
      id: rule.id,
      policyId,
      title: rule.title,
      requirement: rule.requirement,
      citation: rule.citation,
      machine: rule.machine,
      addedAt: rule.addedAt ?? new Date().toISOString(),
    };
    const existing = store.findIndex(
      (r) => r.policyId === policyId && r.id === rule.id,
    );
    if (existing >= 0) store[existing] = stored;
    else store.push(stored);
  }
  return { saved: rules.length };
}

/** Stored rules in insertion order, optionally narrowed to one policy.
 *  Returns copies — a consumer that mutates a row can't corrupt the store. */
export function getRules(policyId?: PolicyId): StoredRule[] {
  return getStore()
    .filter((r) => !policyId || r.policyId === policyId)
    .map((r) => ({ ...r }));
}

/** Returns the store to its opening state (demo reset control, POST /api/reset). */
export function resetRules(): void {
  getStore().length = 0;
}
