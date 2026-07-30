// The servicing chatbot's pinned identity (brief §7a — "the governance point
// of the entire surface"). This is the ONLY place the pinned account/party
// id is written down as a literal; every other file in this directory
// imports it from here rather than re-deriving or, worse, accepting it as a
// parameter from anywhere the model could reach.
//
// lib/soe/seed/patel.ts's PATEL_ACCOUNT_ID / ANAND_PARTY_ID — not imported
// directly (seed modules are internal to lib/soe, CLAUDE.md: "nothing
// imports seed data directly"); these are routing ids, not data figures,
// exactly the convention lib/agents/payment-health/script.ts's
// FALLBACK_ACCOUNT_ID already sets.
//
// Why Patel: of v1's three named personas, Patel is the only one with BOTH
// (a) a currently-SCHEDULED payment (the "next payment due" evidence kind,
// §7b, needs one to source from — Marcus's latest payment is MISSED and
// Elena's card is BT-only with no future-dated payment at all, so neither
// has a SCHEDULED row) and (b) a rich, multi-category PURCHASE history
// (Elena's card carries zero PURCHASE transactions — it's a parked
// BT-only balance — so it can't answer "what am I spending on?" or a
// meaningful transaction list). Anand is the primary cardholder on that
// account, so he is who "signed in" as (brief §3 Part B) refers to.
export const PINNED_ACCOUNT_ID = 'acct-patel';
export const PINNED_PARTY_ID = 'party-anand';
