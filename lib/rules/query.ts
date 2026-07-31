// The stored-rule gate + narrowing, extracted from `GET /api/violations`
// (DEMO_BUILD_PLAN.md D3 — "Tool call = endpoint, implemented once. Agent
// tools call `lib/` functions directly; the HTTP routes are thin wrappers
// over the *same* functions"). The route now calls `queryViolations` and maps
// its result to a status code; the ops agent's `queryViolations` tool
// (lib/agents/ops/tools.ts) calls the same function in-process. One
// implementation, two seams — an external partner integrating against the
// HTTP endpoint and the in-process agent tool can never see different figures.
//
// The two things this function owns, verbatim from the route it was lifted
// out of:
//
//   1. **The stored-rules gate.** An evaluator knows how to evaluate its
//      whole policy; only rules a human approved may actually be enforced.
//      No stored rules → `{ status: 'no-rules' }`, which is the literal truth
//      at demo open (the store starts empty) and the reason the
//      upload/approve beat has to run before the query beat.
//   2. **The narrowing.** Rows and per-rule counts are filtered to the stored
//      rule ids, and `accountsAffected`/`exceptions` are recomputed from the
//      surviving rows — approving R1 alone must not report R2's and R3's
//      exceptions in the totals. `scanned` is the denominator (every account
//      the sweep looked at) and is left alone.
//
// `byRule` is rebuilt in STORED-rule order with stored titles, so the
// dashboard's breakdown matches the approval card the human just signed —
// including a rule with zero hits, which reads as "checked, clean" instead of
// vanishing from the list. Titles are the only field the store overrides;
// every number comes from the evaluator.
//
// Read-only: nothing here writes to the Event Log or mutates the store. The
// agent's tool call is what gets logged (CLAUDE.md 5e), and the route stays
// prefetchable.

import { getEvaluator, type ViolationsPayload } from './evaluators';
import { getRules, type PolicyId } from './store';

/** Discriminated result rather than a thrown error or a `null`: both callers
 *  (the route and the ops tool) need to tell "no human has approved any rules
 *  yet" apart from "this policy has no evaluator wired" — the first is a
 *  normal demo state with its own on-screen copy, the second is a wiring bug.
 *  Each variant carries the exact `error` string the route already returned,
 *  so the route's own tests keep passing unchanged. */
export type QueryViolationsResult =
  | { status: 'ok'; payload: ViolationsPayload }
  | { status: 'no-rules'; error: string }
  | { status: 'no-evaluator'; error: string };

export const NO_RULES_ERROR = 'no rules configured';

export async function queryViolations(
  policyId: PolicyId,
): Promise<QueryViolationsResult> {
  const rules = getRules(policyId);
  if (rules.length === 0) {
    return { status: 'no-rules', error: NO_RULES_ERROR };
  }

  const evaluator = getEvaluator(policyId);
  if (!evaluator) {
    return {
      status: 'no-evaluator',
      error: `No evaluator registered for policy "${policyId}".`,
    };
  }

  const payload = await evaluator(rules);

  const titleById = new Map(rules.map((r) => [r.id, r.title]));
  const countById = new Map(payload.byRule.map((r) => [r.ruleId, r.count]));

  const rows = payload.rows
    .filter((row) => titleById.has(row.ruleId))
    .map((row) => ({ ...row, ruleTitle: titleById.get(row.ruleId) ?? row.ruleTitle }));

  const filtered: ViolationsPayload = {
    policyId,
    summary: {
      scanned: payload.summary.scanned,
      accountsAffected: new Set(rows.map((row) => row.accountId)).size,
      exceptions: rows.length,
    },
    byRule: rules.map((rule) => ({
      ruleId: rule.id,
      title: rule.title,
      count: countById.get(rule.id) ?? 0,
    })),
    rows,
  };

  return { status: 'ok', payload: filtered };
}
