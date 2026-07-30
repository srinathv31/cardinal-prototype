// GET /api/violations?policy= — batch policy evaluation (DEMO_THESIS.md UC1
// beat 4 / UC3 ops side). Endpoint checklist rows 3 and 4 are one route: the
// policy id selects an evaluator from lib/rules/evaluators.ts, and the
// response shape (ViolationsPayload) is identical for both, so
// `ViolationsDashboard` renders either without branching.
//
// The stored-rules gate and the narrowing that used to live inline here now
// live in `lib/rules/query.ts` — the ops agent's `queryViolations` tool calls
// that same function in-process (DEMO_BUILD_PLAN.md D3: "the HTTP routes are
// thin wrappers over the *same* functions"), so the chat surface and the
// endpoint can never disagree about which rules are enforced or what the
// totals are. What is left in this file is exactly what an HTTP wrapper owes:
// query-parameter validation and the result → status-code mapping.
//
//   • unknown/missing `policy`                → 400
//   • no rules stored for that policy         → 409 `{ error: 'no rules configured' }`
//   • policy has no registered evaluator      → 501
//   • otherwise                               → 200 with the narrowed payload
//
// Read-only, so it writes no Event Log entry — the agent's tool call is what
// gets logged (CLAUDE.md 5e), and this URL is prefetchable.

import { NextResponse } from 'next/server';
import { queryViolations } from '@/lib/rules/query';
import { isPolicyId, POLICY_IDS } from '@/lib/rules/store';

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

  const result = await queryViolations(policy);

  if (result.status === 'no-rules') {
    return NextResponse.json({ error: result.error }, { status: 409 });
  }
  if (result.status === 'no-evaluator') {
    return NextResponse.json({ error: result.error }, { status: 501 });
  }

  return NextResponse.json(result.payload);
}
