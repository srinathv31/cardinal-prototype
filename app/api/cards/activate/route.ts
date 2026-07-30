// POST /api/cards/activate — the card-activation gate (DEMO_THESIS.md Use
// case 3, customer side; DEMO_BUILD_PLAN.md "Endpoints"). Body is
// `{ persona: 'happy' | 'blocked' }`; the server, never the caller or the
// model, maps that persona to a pinned account (D6, DEMO_BUILD_PLAN.md:
// "Identity stays server-pinned per request — the model never picks
// accounts"). Runs CA-R1/CA-R2 (lib/sentinel/ca-exceptions.ts) against that
// account's own seeded card RIGHT NOW (attemptDate = today), so the
// happy/blocked outcome falls out of real seed data rather than being
// hardcoded per persona.
//
// This route does NOT import lib/rules (Agent A's stored-rules gate) — the
// stored-rules approval flow (G1: "approve rules" before they take effect)
// is stitched in here in Wave 2. For Wave 1, CA-R1/CA-R2 are evaluated
// directly, unconditionally, exactly as card-activation-policy.ts defines
// them.
//
// happy = Anand Patel's account ('acct-patel', lib/soe/seed/patel.ts —
// verified by reading the seed, not guessed: `ANAND_PARTY_ID` is the
// PRIMARY on `PATEL_ACCOUNT_ID`). blocked = Marcus Webb's account
// ('acct-marcus', lib/soe/seed/marcus.ts) — his one v1 missed payment,
// still unresolved, makes him past-due today. Both literals are hardcoded
// here rather than imported: this route sits outside lib/soe, and "nothing
// imports seed data directly" (CLAUDE.md) — the adapter
// (getCardActivations/getPayments) is the only data seam this file uses.
//
// confirmationId is a pure function of the card's own id and the demo
// anchor — never Math.random()/Date.now() (mirrors
// app/api/sentinel/remediate/route.ts's `buildConfirmationId`: "confirmation
// ids ... byte-identical across replays"). One `action.executed` Event Log
// entry is written per call, same pattern as that route.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAnchor, getCardActivations, getPayments } from '@/lib/soe';
import { checkActivationAttempt } from '@/lib/sentinel/ca-exceptions';
import { append } from '@/lib/events/store';

/** Server-side persona → account map (D6, DEMO_BUILD_PLAN.md). Verified
 * against lib/soe/seed/patel.ts / lib/soe/seed/marcus.ts, not guessed. */
const PERSONA_ACCOUNT_ID: Record<'happy' | 'blocked', string> = {
  happy: 'acct-patel',
  blocked: 'acct-marcus',
};

const activateRequestSchema = z.object({
  persona: z.enum(['happy', 'blocked']),
  runId: z.string().min(1).optional(),
  agentId: z.string().min(1).optional(),
});

/** `act-${cardId}-${anchorCompact}` — a pure function of the card's own
 * (already-deterministic) id and the demo anchor, so repeated calls for the
 * same persona at the same demo anchor return a byte-identical
 * confirmationId, and two different demo anchors never collide. */
function buildConfirmationId(cardId: string, anchorIso: string): string {
  const anchorCompact = anchorIso.slice(0, 10).replace(/-/g, '');
  return `act-${cardId}-${anchorCompact}`;
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be JSON.' }, { status: 400 });
  }

  const parsed = activateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const { persona } = parsed.data;
  const runId = parsed.data.runId ?? `run-card-activation-${persona}`;
  const agentId = parsed.data.agentId ?? 'servicing-card-activation';

  const accountId = PERSONA_ACCOUNT_ID[persona];

  const [cards, payments] = await Promise.all([getCardActivations(), getPayments(accountId)]);
  const card = cards.find((c) => c.accountId === accountId);
  if (!card) {
    return NextResponse.json(
      { error: `No card-activation record on file for persona "${persona}".` },
      { status: 500 },
    );
  }

  const anchorIso = getAnchor().toISOString();
  const attemptDate = anchorIso.slice(0, 10);

  const violation = checkActivationAttempt({
    accountId,
    cardId: card.cardId,
    issuedDate: card.issuedDate,
    attemptDate,
    payments,
  });

  if (violation) {
    append({
      runId,
      agentId,
      step: -1,
      kind: 'action.executed',
      toolName: 'card-activation.activate',
      inputSummary: `Activate card ${card.cardId} for account ${accountId} (persona ${persona})`,
      outputSummary: `blocked · ${violation.ruleId} · ${violation.finding}`,
      actor: 'agent',
    });
    return NextResponse.json({
      status: 'blocked' as const,
      ruleId: violation.ruleId,
      finding: violation.finding,
    });
  }

  const confirmationId = buildConfirmationId(card.cardId, anchorIso);
  append({
    runId,
    agentId,
    step: -1,
    kind: 'action.executed',
    toolName: 'card-activation.activate',
    inputSummary: `Activate card ${card.cardId} for account ${accountId} (persona ${persona})`,
    outputSummary: `confirmationId ${confirmationId}`,
    actor: 'agent',
  });
  return NextResponse.json({
    status: 'activated' as const,
    confirmationId,
  });
}
