// POST /api/rules — store the rules a human approved at Gate 1
// (DEMO_THESIS.md UC1 beat 3 / UC3 ops side); GET /api/rules?policyId= — read
// them back. A thin wrapper over lib/rules/store.ts, per DEMO_BUILD_PLAN.md
// D3: the ops agent's `saveRules` tool calls the same library function this
// route does, so an external partner integrating against the HTTP endpoint
// and the in-process agent tool exercise one implementation, not two.
//
// The POST writes one `action.executed` entry to the shared Event Log
// (CLAUDE.md 5e), following app/api/sentinel/remediate/route.ts's pattern:
// `append()` from lib/events/store, `step: -1` for a run-level action,
// `actor: 'agent'` (the human's decision is logged separately, by the
// approval gate that unlocked this call). `runId`/`agentId` are optional
// here — unlike the Sentinel audit route, which scopes itself to
// `sentinel*` agents — because this endpoint is called by the ops agent, by
// the servicing agent, and directly by partners; each supplies its own
// attribution, and a caller that supplies none still gets a logged entry
// under a stable default rather than a dropped one.
//
// GET is read-only and does not log (the Event Log records actions and
// decisions, and a prefetchable GET is neither).

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { append } from '@/lib/events/store';
import { getRules, isPolicyId, POLICY_IDS, saveRules } from '@/lib/rules/store';

const DEFAULT_RUN_ID = 'run-ops';
const DEFAULT_AGENT_ID = 'ops-policy';

const ruleSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  requirement: z.string().min(1),
  citation: z.string().min(1),
  machine: z.string().min(1),
  addedAt: z.string().min(1).optional(),
});

const saveRulesSchema = z.object({
  policyId: z.enum(POLICY_IDS),
  rules: z.array(ruleSchema).min(1),
  runId: z.string().min(1).optional(),
  agentId: z.string().min(1).optional(),
});

/** Event Log summaries are one-line by contract (lib/events/telemetry.ts
 *  bounds its own to ~110–140 chars); a 40-rule save must not paste 40 ids
 *  into the log. */
function summarizeIds(ids: string[]): string {
  const head = ids.slice(0, 6).join(', ');
  return ids.length > 6 ? `${head}, +${ids.length - 6} more` : head;
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be JSON.' }, { status: 400 });
  }

  const parsed = saveRulesSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const { policyId, rules, runId, agentId } = parsed.data;

  const { saved } = saveRules(policyId, rules);
  const stored = getRules(policyId);

  append({
    runId: runId ?? DEFAULT_RUN_ID,
    agentId: agentId ?? DEFAULT_AGENT_ID,
    step: -1,
    kind: 'action.executed',
    toolName: 'rules.save',
    inputSummary: `Store ${saved} ${policyId} rule(s): ${summarizeIds(rules.map((r) => r.id))}`,
    outputSummary: `${saved} saved · ${stored.length} rule(s) now active for ${policyId}`,
    actor: 'agent',
  });

  return NextResponse.json({ policyId, saved, rules: stored });
}

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const policyId = searchParams.get('policyId');

  if (policyId !== null && !isPolicyId(policyId)) {
    return NextResponse.json(
      { error: `Unknown policyId "${policyId}". Expected one of: ${POLICY_IDS.join(', ')}.` },
      { status: 400 },
    );
  }

  return NextResponse.json({ rules: getRules(policyId ?? undefined) });
}
