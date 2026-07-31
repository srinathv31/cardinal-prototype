// The card-activation policy rule evaluator (DEMO_THESIS.md Use case 3;
// DEMO_BUILD_PLAN.md "Card-activation domain"). Mirrors
// lib/sentinel/au-exceptions.ts's shape and its central discipline: this
// module independently RE-DERIVES exceptions from the card-activation and
// payment data handed to it — never from lib/soe/seed/card-activation.ts's
// generation plan (which pool built which card). The golden-figure test in
// lib/soe/seed/card-activation.test.ts calls this evaluator against the
// real generated collection, which is what makes "214 scanned / 41
// exceptions" a proof rather than a restatement of the generator's own
// accounting.
//
// Pure module: no lib/soe import (types only, from lib/soe/types — no
// adapter, no fetching), no Date.now(). "Today" (the evaluation date for
// CA-R2's unactivated arm, and for a LIVE activation attempt) is always
// threaded in by the caller, exactly the way au-exceptions.ts never calls
// getAnchor() itself.
//
// CA-R1 — Activation While Past-Due (card-activation-policy.ts): a card may
// not be activated while its account is past-due. Evaluated only against
// cards that HAVE an activation event — there is nothing to test on a card
// that hasn't been activated yet. "Past-due at date D" means the most
// recent payment due on or before D has status MISSED: the same
// most-recent-payment-resolves-the-state reading that Marcus Webb's own v1
// seed data exercises live (lib/soe/seed/marcus.ts — his one MISSED
// payment, still unresolved, is also his most recent payment as of today).
//
// CA-R2 — 45-Day Activation Window (card-activation-policy.ts): a card must
// be activated within 45 days of issuance. Two arms, both implemented
// (mirrors au-exceptions.ts's R2 honesty about "good standing"'s two arms
// even though the seed only exercises one): an ALREADY-ACTIVATED card whose
// activatedDate lands more than 45 days after issuedDate, or a still-
// UNACTIVATED card more than 45 days past issuedDate as of `asOf`. Boundary
// resolved explicitly and symmetrically for both arms: "within 45 days"
// reads as <= 45 elapsed days compliant, 46 the first violating day — that
// exact choice is what lib/soe/seed/card-activation.ts's two boundary cards
// (45 days compliant, 46 days violating) exist to pin, and what this
// module's own test exercises directly against both arms, at both integers
// — the off-by-one class of bug that cost a prior phase real time.
//
// A single card can only ever be reported under ONE rule. CA-R1 requires
// `activatedDate` present; CA-R2's unactivated arm requires it absent — so
// those two are disjoint by construction. The one case where a single card
// COULD satisfy both (activated late AND past-due at that same activation)
// is resolved by `checkActivationAttempt` checking CA-R1 first and
// returning on the first hit: a card is reported once, never twice, which
// is what keeps "29 + 12 = 41" arithmetic simple downstream — no
// de-duplication step is ever needed.

import type { Payment } from '@/lib/soe/types';
import { formatDate } from '@/lib/agents/format';

export type CaRuleId = 'CA-R1' | 'CA-R2';

/** "Cards must be activated within 45 days of issuance"
 * (card-activation-policy.ts, CA-R2). Exactly 45 elapsed days is still
 * compliant; 46 is the first violating day. */
export const CA_ACTIVATION_WINDOW_DAYS = 45;

/** The minimal shape this evaluator needs from a card-activation record —
 * structurally compatible with lib/soe/types.ts's `CardActivation`, but
 * declared locally so this module never imports from lib/soe/seed (only
 * lib/soe/types, per the header's purity note). */
export interface CardActivationRecord {
  accountId: string;
  cardId: string;
  issuedDate: string;
  activatedDate?: string;
}

export interface CaException {
  ruleId: CaRuleId;
  accountId: string;
  cardId: string;
  issuedDate: string;
  activatedDate?: string;
  /** Preformatted finding line — server-side formatted, never invented by
   * the model (CLAUDE.md 5a). */
  finding: string;
}

export interface CaScanInput {
  cardActivations: CardActivationRecord[];
  /** Every payment for every account referenced by `cardActivations` — this
   * module filters by accountId itself, so passing a larger, multi-account,
   * merged set (as lib/soe/adapter.ts's getCardActivationScan does) is
   * safe. */
  payments: Payment[];
  /** ISO date (YYYY-MM-DD), "today" — the CA-R2 unactivated arm's clock. */
  asOf: string;
}

export interface CaScanResult {
  cardsScanned: number;
  exceptions: CaException[];
  byRule: Record<CaRuleId, { count: number; accounts: number }>;
  accountsAffected: number;
}

const DAY_MS = 86_400_000;

function utcMidnight(iso: string): number {
  return Date.parse(`${iso.slice(0, 10)}T00:00:00.000Z`);
}

/** Whole days from `fromIso` to `toIso` (positive when `toIso` is later). */
function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((utcMidnight(toIso) - utcMidnight(fromIso)) / DAY_MS);
}

export interface PastDueCheck {
  pastDue: boolean;
  /** The payment that resolved the check — the most recent payment due on
   * or before `onIso`. Undefined when the account has no payment on file
   * that early (never treated as past-due by default — brief §5a: no
   * invented state). */
  asOfPayment?: Payment;
}

/** "Past-due at date D" (card-activation-policy.ts, CA-R1): the most
 * recent payment due on or before D has status MISSED. Filters `payments`
 * to `accountId` itself, so callers may pass a merged, multi-account
 * payment list without pre-filtering. */
export function isPastDueAsOf(payments: Payment[], accountId: string, onIso: string): PastDueCheck {
  const onMs = utcMidnight(onIso);
  let mostRecent: Payment | undefined;
  for (const payment of payments) {
    if (payment.accountId !== accountId) continue;
    const dueMs = utcMidnight(payment.dueDate);
    if (dueMs > onMs) continue;
    if (!mostRecent || dueMs > utcMidnight(mostRecent.dueDate)) {
      mostRecent = payment;
    }
  }
  if (!mostRecent) return { pastDue: false };
  return { pastDue: mostRecent.status === 'MISSED', asOfPayment: mostRecent };
}

function pastDueFinding(payment: Payment, attemptDate: string): string {
  return `Payment missed ${formatDate(payment.dueDate)} · account past-due at activation ${formatDate(attemptDate)}`;
}

function windowFinding(issuedDate: string, elapsed: number, activated: boolean, attemptDate?: string): string {
  return activated && attemptDate
    ? `Issued ${formatDate(issuedDate)} · activated ${formatDate(attemptDate)} · ${elapsed} days after issuance, exceeds the ${CA_ACTIVATION_WINDOW_DAYS}-day activation window`
    : `Issued ${formatDate(issuedDate)} · still unactivated ${elapsed} days later, exceeds the ${CA_ACTIVATION_WINDOW_DAYS}-day activation window`;
}

/**
 * Evaluates ONE activation attempt — real, from the batch collection
 * (attemptDate = the card's own activatedDate), or hypothetical, from a
 * live `POST /api/cards/activate` check (attemptDate = today) — against
 * both rules, CA-R1 first. Returns the first rule it fails, or null when it
 * passes both. This is the single source both `evaluateCardActivationPolicy`
 * (below, for every already-activated card in the batch) and the live
 * activation route call, so a card can never be evaluated two different
 * ways by two code paths drifting apart.
 */
export function checkActivationAttempt(params: {
  accountId: string;
  cardId: string;
  issuedDate: string;
  attemptDate: string;
  payments: Payment[];
}): CaException | null {
  const { accountId, cardId, issuedDate, attemptDate, payments } = params;

  const { pastDue, asOfPayment } = isPastDueAsOf(payments, accountId, attemptDate);
  if (pastDue && asOfPayment) {
    return {
      ruleId: 'CA-R1',
      accountId,
      cardId,
      issuedDate,
      activatedDate: attemptDate,
      finding: pastDueFinding(asOfPayment, attemptDate),
    };
  }

  const elapsed = daysBetween(issuedDate, attemptDate);
  if (elapsed > CA_ACTIVATION_WINDOW_DAYS) {
    return {
      ruleId: 'CA-R2',
      accountId,
      cardId,
      issuedDate,
      activatedDate: attemptDate,
      finding: windowFinding(issuedDate, elapsed, true, attemptDate),
    };
  }

  return null;
}

export function evaluateCardActivationPolicy(input: CaScanInput): CaScanResult {
  const { cardActivations, payments, asOf } = input;
  const exceptions: CaException[] = [];

  for (const card of cardActivations) {
    if (card.activatedDate) {
      const hit = checkActivationAttempt({
        accountId: card.accountId,
        cardId: card.cardId,
        issuedDate: card.issuedDate,
        attemptDate: card.activatedDate,
        payments,
      });
      if (hit) exceptions.push(hit);
      continue;
    }

    // Unactivated — CA-R1 never applies (no activation event to test); only
    // CA-R2's unactivated arm can fire, clocked against `asOf`.
    const elapsed = daysBetween(card.issuedDate, asOf);
    if (elapsed > CA_ACTIVATION_WINDOW_DAYS) {
      exceptions.push({
        ruleId: 'CA-R2',
        accountId: card.accountId,
        cardId: card.cardId,
        issuedDate: card.issuedDate,
        finding: windowFinding(card.issuedDate, elapsed, false),
      });
    }
  }

  exceptions.sort(
    (a, b) => a.accountId.localeCompare(b.accountId) || a.ruleId.localeCompare(b.ruleId),
  );

  const byRule: Record<CaRuleId, { count: number; accounts: number }> = {
    'CA-R1': { count: 0, accounts: 0 },
    'CA-R2': { count: 0, accounts: 0 },
  };
  for (const ruleId of ['CA-R1', 'CA-R2'] as const) {
    const hits = exceptions.filter((e) => e.ruleId === ruleId);
    byRule[ruleId] = { count: hits.length, accounts: new Set(hits.map((h) => h.accountId)).size };
  }

  return {
    cardsScanned: cardActivations.length,
    exceptions,
    byRule,
    accountsAffected: new Set(exceptions.map((e) => e.accountId)).size,
  };
}
