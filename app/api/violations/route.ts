// GET /api/violations?policy= — batch policy evaluation (DEMO_THESIS.md UC1
// beat 4 / UC3 ops side). Endpoint checklist rows 3 and 4 are one route: the
// policy id selects an evaluator from lib/rules/evaluators.ts, and the
// response shape (ViolationsPayload) is identical for both, so
// `ViolationsDashboard` renders either without branching.
//
// Two things happen here and nowhere else:
//
//   1. **The stored-rules gate.** An evaluator knows how to evaluate its
//      whole policy; only rules a human approved may actually be enforced.
//      No stored rules → 409 `{ error: 'no rules configured' }`, which is the
//      literal truth at demo open (the store starts empty) and the reason the
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
// Read-only, so it writes no Event Log entry — the agent's tool call is what
// gets logged (CLAUDE.md 5e), and this URL is prefetchable.

import { NextResponse } from 'next/server';
import { getEvaluator, type ViolationsPayload } from '@/lib/rules/evaluators';
import { getRules, isPolicyId, POLICY_IDS } from '@/lib/rules/store';

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const policy = searchParams.get('policy');

  if (!policy || !isPolicyId(policy)) {
    return NextResponse.json(
      {
        error: `Query parameter "policy" is required and must be one of: ${POLICY_IDS.join(', ')}.`,
      },
      { status: 400 },
    );
  }

  const rules = getRules(policy);
  if (rules.length === 0) {
    return NextResponse.json({ error: 'no rules configured' }, { status: 409 });
  }

  const evaluator = getEvaluator(policy);
  if (!evaluator) {
    return NextResponse.json(
      { error: `No evaluator registered for policy "${policy}".` },
      { status: 501 },
    );
  }

  const payload = await evaluator(rules);

  const titleById = new Map(rules.map((r) => [r.id, r.title]));
  const countById = new Map(payload.byRule.map((r) => [r.ruleId, r.count]));

  const rows = payload.rows
    .filter((row) => titleById.has(row.ruleId))
    .map((row) => ({ ...row, ruleTitle: titleById.get(row.ruleId) ?? row.ruleTitle }));

  const filtered: ViolationsPayload = {
    policyId: policy,
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

  return NextResponse.json(filtered);
}
