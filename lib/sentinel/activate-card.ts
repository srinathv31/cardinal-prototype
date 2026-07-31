// The card-activation gate's shared core (DEMO_THESIS.md Use case 3,
// customer side; DEMO_BUILD_PLAN.md "Endpoints" — "tool call = endpoint,
// implemented once", D3). Two callers share this ONE function:
//  - POST /api/cards/activate (app/api/cards/activate/route.ts) — the real
//    HTTP endpoint external partners integrate against.
//  - lib/agents/servicing/tools.ts's `activateCard` tool — the customer
//    chatbot's approval-gated action (Wave 2 Agent E work item 3).
// Both run the EXACT same function, never two implementations of the same
// policy check drifting apart (D3's whole point).
//
// Extracted from app/api/cards/activate/route.ts's original Wave 1 body —
// same persona→account map, same card lookup, same checkActivationAttempt
// call, same deterministic `act-…` confirmationId, same two result shapes,
// same one Event Log write per call. The route now wraps this function
// (thin HTTP translation only); nothing about its externally observable
// behavior changed, which is why its 9 pre-existing tests stay green
// untouched.
//
// Body is `{ persona: 'happy' | 'blocked' }`; the server, never the caller
// or the model, maps that persona to a pinned account (D6, DEMO_BUILD_PLAN.md:
// "Identity stays server-pinned per request — the model never picks
// accounts"). Runs CA-R1/CA-R2 (lib/sentinel/ca-exceptions.ts) against that
// account's own seeded card RIGHT NOW (attemptDate = today), so the
// happy/blocked outcome falls out of real seed data rather than being
// hardcoded per persona.
//
// happy = Anand Patel's account ('acct-patel', lib/soe/seed/patel.ts —
// verified by reading the seed, not guessed: `ANAND_PARTY_ID` is the
// PRIMARY on `PATEL_ACCOUNT_ID`). blocked = Marcus Webb's account
// ('acct-marcus', lib/soe/seed/marcus.ts) — his one v1 missed payment,
// still unresolved, makes him past-due today. Both literals are hardcoded
// here rather than imported: this module sits outside lib/soe, and "nothing
// imports seed data directly" (CLAUDE.md) — the adapter
// (getCardActivations/getPayments) is the only data seam this file uses.
// The exact same two literals also back lib/agents/servicing/identity.ts's
// persona→identity map (PERSONA_IDENTITY) — that file's own header notes
// the duplication rather than importing across the lib/agents ↔ lib/sentinel
// boundary, the same self-containment convention every agent's resolvers.ts
// already follows for its own duplicated helpers.
//
// confirmationId is a pure function of the card's own id and the demo
// anchor — never Math.random()/Date.now() (mirrors
// app/api/sentinel/remediate/route.ts's `buildConfirmationId`: "confirmation
// ids ... byte-identical across replays"). One `action.executed` Event Log
// entry is written per call.

import { getAnchor, getCardActivations, getPayments } from '@/lib/soe';
import { checkActivationAttempt } from '@/lib/sentinel/ca-exceptions';
import { append } from '@/lib/events/store';

export type ActivationPersona = 'happy' | 'blocked';

/** Server-side persona → account map (D6, DEMO_BUILD_PLAN.md). Verified
 * against lib/soe/seed/patel.ts / lib/soe/seed/marcus.ts, not guessed. */
const PERSONA_ACCOUNT_ID: Record<ActivationPersona, string> = {
  happy: 'acct-patel',
  blocked: 'acct-marcus',
};

export type ActivateCardResult =
  | { status: 'activated'; confirmationId: string }
  | { status: 'blocked'; ruleId: string; finding: string };

/** `act-${cardId}-${anchorCompact}` — a pure function of the card's own
 * (already-deterministic) id and the demo anchor, so repeated calls for the
 * same persona at the same demo anchor return a byte-identical
 * confirmationId, and two different demo anchors never collide. */
function buildConfirmationId(cardId: string, anchorIso: string): string {
  const anchorCompact = anchorIso.slice(0, 10).replace(/-/g, '');
  return `act-${cardId}-${anchorCompact}`;
}

/**
 * Runs a live card-activation attempt for the persona's pinned account and
 * writes the one Event Log entry the attempt produces. Throws (never
 * returns an error shape) when the persona's seed carries no
 * card-activation record at all — defensive only, every v1 persona this
 * demo pins has one; callers translate that throw to their own transport's
 * error shape (app/api/cards/activate/route.ts → HTTP 500, matching its
 * pre-extraction behavior exactly).
 */
export async function activateCardForPersona(
  persona: ActivationPersona,
  options: { runId: string; agentId: string },
): Promise<ActivateCardResult> {
  const { runId, agentId } = options;
  const accountId = PERSONA_ACCOUNT_ID[persona];

  const [cards, payments] = await Promise.all([getCardActivations(), getPayments(accountId)]);
  const card = cards.find((c) => c.accountId === accountId);
  if (!card) {
    throw new Error(`No card-activation record on file for persona "${persona}".`);
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
    return {
      status: 'blocked' as const,
      ruleId: violation.ruleId,
      finding: violation.finding,
    };
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
  return {
    status: 'activated' as const,
    confirmationId,
  };
}
