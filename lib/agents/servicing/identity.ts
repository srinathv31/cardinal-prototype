// The servicing chatbot's pinned identity (brief §7a — "the governance point
// of the entire surface"), extended for persona pinning (DEMO_BUILD_PLAN.md
// D6 / plan.md Wave 2 Agent E work item 1). This is the ONLY place any
// pinned account/party id is written down as a literal; every other file in
// this directory imports one of the exports below rather than re-deriving
// or, worse, accepting an account id as a parameter from anywhere the model
// could reach.
//
// lib/soe/seed/patel.ts's PATEL_ACCOUNT_ID / ANAND_PARTY_ID and
// lib/soe/seed/marcus.ts's MARCUS_ACCOUNT_ID / MARCUS_PARTY_ID — not
// imported directly (seed modules are internal to lib/soe, CLAUDE.md:
// "nothing imports seed data directly"); these are routing ids, not data
// figures, exactly the convention lib/agents/payment-health/script.ts's
// FALLBACK_ACCOUNT_ID already sets, and the same two literals
// app/api/cards/activate/route.ts already pinned before the Wave 2 refactor
// moved that mapping into lib/sentinel/activate-card.ts.
//
// Why these two personas: 'happy' (Anand Patel) is v1's only cardholder with
// BOTH a currently-SCHEDULED payment (the "next payment"/"next statement"
// evidence kinds need one to source from) and a rich, multi-category
// PURCHASE history — see the by-persona rundown this file used to carry
// alone, now shared with 'blocked'. 'blocked' (Marcus Webb) is the
// card-activation CA-R1 case: his one v1 missed payment, still unresolved,
// makes his account past-due today, which is what fails a live
// activateCard attempt. He has PURCHASE transactions and a real account
// balance (lib/soe/seed/marcus.ts), so the four read-only evidence kinds
// all still answer for him — just never with a SCHEDULED payment, since his
// most recent payment is MISSED, not SCHEDULED (see resolvers.ts's honest
// empty-state fallback for both "next payment" and "next statement").
//
// --- Per-request persona wiring (the part that didn't exist before) ------
//
// createServicingAgent (./agent.ts) is constructed fresh per HTTP request by
// lib/agents/registry.ts — a file this build explicitly keeps off limits
// (Wave 2 ownership boundary), so this module cannot add a `persona`
// argument to registry.ts's one call site
// (`createServicingAgent({ runId })`, unchanged). Instead, the pinned
// persona rides inside the `runId` the client already generates per
// conversation (components/servicing/servicing-conversation.tsx) using the
// `servicingRunId`/`personaFromRunId` pair below — a convention private to
// this pair of functions, symmetric, and covered by identity.test.ts-style
// assertions in resolvers.test.ts. createServicingAgent still prefers an
// explicit `persona` argument when one is given directly (tests, or any
// future in-process caller); parsing `runId` is the fallback exactly one
// real caller (registry.ts, unmodified) actually exercises. See this
// package's report back to the orchestrator for the cleaner alternative
// (threading `persona` through registry.ts's `createAgentRunStreamResponse`
// explicitly) once that file is back in play.

export type ServicingPersona = 'happy' | 'blocked';

export interface ServicingIdentity {
  readonly accountId: string;
  readonly partyId: string;
}

const PERSONA_IDENTITY: Record<ServicingPersona, ServicingIdentity> = {
  happy: { accountId: 'acct-patel', partyId: 'party-anand' },
  blocked: { accountId: 'acct-marcus', partyId: 'party-marcus' },
};

export const DEFAULT_SERVICING_PERSONA: ServicingPersona = 'happy';

// Back-compat literals — every pre-existing import of these two names
// (tests especially) keeps resolving to exactly what it did before persona
// pinning existed: the 'happy' persona's account/party.
export const PINNED_ACCOUNT_ID: string = PERSONA_IDENTITY.happy.accountId;
export const PINNED_PARTY_ID: string = PERSONA_IDENTITY.happy.partyId;

export function isServicingPersona(value: string): value is ServicingPersona {
  return value === 'happy' || value === 'blocked';
}

/** `?persona=` query-param parsing (app/servicing/page.tsx) — unknown or
 * missing values default to 'happy' rather than throwing, so a stray query
 * string never breaks the page (brief §8 demo-safety). */
export function parseServicingPersona(value: string | string[] | undefined): ServicingPersona {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw !== undefined && isServicingPersona(raw) ? raw : DEFAULT_SERVICING_PERSONA;
}

export function identityForPersona(persona: ServicingPersona): ServicingIdentity {
  return PERSONA_IDENTITY[persona];
}

const RUN_ID_PERSONA_PATTERN = /^servicing-(happy|blocked)-/;

/** Builds a conversation/run id that carries its persona inline —
 * `servicing-<persona>-<suffix>` — read back by `personaFromRunId` below.
 * `suffix` is caller-supplied (components/servicing/servicing-conversation.tsx
 * passes `crypto.randomUUID()`) so this stays a pure string-template
 * function, trivially testable without touching the DOM/crypto global. */
export function servicingRunId(persona: ServicingPersona, suffix: string): string {
  return `servicing-${persona}-${suffix}`;
}

/** The other half of `servicingRunId` — parses the persona back out of a
 * runId built by it. Any runId that doesn't match the convention (a bare
 * `crypto.randomUUID()` from a pre-persona-pinning client, a hand-typed test
 * runId, …) defaults to 'happy', matching this file's pre-existing
 * single-persona behavior exactly. */
export function personaFromRunId(runId: string): ServicingPersona {
  const match = RUN_ID_PERSONA_PATTERN.exec(runId);
  const captured = match?.[1];
  return captured !== undefined && isServicingPersona(captured) ? captured : DEFAULT_SERVICING_PERSONA;
}
