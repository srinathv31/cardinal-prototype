// The card-activation collection — an additive, deterministic generator for
// the card-activation policy domain (DEMO_THESIS.md Use case 3;
// DEMO_BUILD_PLAN.md "Card-activation domain"). This module is NEVER merged
// into SeedDb.accounts / .parties / .accountPartyRoles / .payments — it is a
// wholly separate, additive collection, following au-portfolio.ts's own
// precedent one layer up (this collection is additive to THAT collection).
// v1's nine-account arithmetic and the AU portfolio's own pinned tests stay
// untouched.
//
// Cards are issued against two pools of existing accounts — never new
// accounts of their own:
//   - 212 "regular" cards, one each on a distinct account drawn from the
//     additive AU portfolio (lib/soe/seed/au-portfolio.ts's 1,100 accounts,
//     passed in already-built rather than rebuilt here — see the header note
//     on `buildCardActivations` below).
//   - 2 "special" cards, hand-authored literals (no PRNG draw, same idiom
//     as marcus.ts/patel.ts's own hand-authored personas): one on Anand
//     Patel's account (acct-patel, the happy-path persona) and one on Marcus
//     Webb's account (acct-marcus, the blocked persona — his existing v1
//     missed payment is read, never modified, to make him past-due today).
//
// Golden shape (DEMO_BUILD_PLAN.md "Pinned figures"): 214 cards scanned · 41
// out of compliance = 29 CA-R2 (unactivated, issued more than 45 days ago)
// + 12 CA-R1 (activated while the account was past-due) · zero overlap.
// Both special cards are inside the 214 and never among the 41 — see the
// three-pool construction below for exactly why each rule can only ever
// touch its own disjoint slice of accounts.
//
//   Pool 1 — CA-R1 exceptions (12 cards): the FIRST 12 accounts (in AU
//     portfolio generation order) that carry a MISSED payment. Each card's
//     issuedDate/activatedDate straddle that missed payment's own due date
//     (a few days before / a few days after), so the account is genuinely
//     past-due at the moment of activation — re-derivable by the evaluator
//     from the SAME payment record the AU portfolio already generated, not
//     from a second, parallel "past-due" flag invented here.
//   Pool 2 — CA-R2 exceptions (29 cards): the FIRST 29 "book-depth" AU
//     accounts (indices 0962–1100 — carry no AU, no payment history,
//     brief-parallel reasoning to au-portfolio.ts's own book-depth set).
//     Unactivated, issued 46+ days ago — the boundary card (46 days,
//     exactly one day past the window) sits first in this pool.
//   Pool 3 — compliant (171 cards), itself three slices chosen so NEITHER
//     rule can accidentally fire on them:
//       - 1 boundary card: unactivated, issued EXACTLY 45 days ago (the
//         window's last compliant day, paired against Pool 2's 46-day
//         violation).
//       - 85 "unactivated, fresh" cards, drawn from the remaining
//         book-depth accounts (issued 1–44 days ago) — CA-R1 can never
//         apply to an unactivated card regardless of the account's payment
//         history, so these are safe by construction.
//       - 85 "activated, on time" cards, drawn ONLY from AU-carrying
//         accounts that have NEVER missed a payment (the full missed-
//         payment set minus, not just the 12 chosen for Pool 1) — CA-R1
//         cannot fire on an account with no missed payment on file, so
//         these are safe by construction too, regardless of which
//         activatedDate is drawn for them.
//     A card is either activated or not: CA-R1 only ever evaluates
//     activated cards, and this module's own CA-R2 exceptions are only ever
//     drawn unactivated. The two 41-card categories are therefore disjoint
//     by construction, not by a de-duplication step (lib/sentinel/
//     ca-exceptions.ts re-derives and re-proves this independently).

import { dateOnly } from './anchor';
import { createRng } from './prng';
import { MARCUS_ACCOUNT_ID } from './marcus';
import { PATEL_ACCOUNT_ID } from './patel';
import type { AuPortfolio } from './au-portfolio';
import type { CardActivation, CardActivationChannel } from '../types';

/** This module's own PRNG seed — never au-portfolio.ts's AU_PRNG_SEED,
 * never background.ts's PRNG_SEED, and never drawn from either of their rng
 * instances (see header). */
export const CARD_ACTIVATION_PRNG_SEED = 20260730;

const DAY_MS = 86_400_000;

const CA_R1_POOL_SIZE = 12;
const CA_R2_POOL_SIZE = 29;
const COMPLIANT_BOUNDARY_SIZE = 1;
const COMPLIANT_UNACTIVATED_FRESH_SIZE = 85;
const COMPLIANT_ACTIVATED_ON_TIME_SIZE = 85;
const COMPLIANT_POOL_SIZE =
  COMPLIANT_BOUNDARY_SIZE + COMPLIANT_UNACTIVATED_FRESH_SIZE + COMPLIANT_ACTIVATED_ON_TIME_SIZE; // 171

/** CA-R2's activation window (card-activation-policy.ts, CA-R2): "Cards
 * must be activated within 45 days of issuance." Exactly 45 elapsed days is
 * the last compliant day; 46 is the first violating one — mirrored here
 * (not imported from lib/sentinel/ca-exceptions.ts, a pure evaluator module
 * this seed layer never depends on) so the generator's own boundary cards
 * are self-documenting without a cross-layer import. */
const ACTIVATION_WINDOW_DAYS = 45;

const CHANNELS: readonly CardActivationChannel[] = ['ONLINE', 'PHONE', 'MOBILE_APP', 'BRANCH'];

export const PATEL_CARD_ID = 'card-ca-9001';
export const MARCUS_CARD_ID = 'card-ca-9002';

/** Zero-padded index string, e.g. pad(7, 4) === '0007'. */
function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

/** `iso` shifted by `days` (may be negative), UTC, date-only — the
 * arithmetic complement to `dateOnly(anchor, offset)` for dates derived
 * from an already-anchored ISO string (a payment's dueDate) rather than a
 * raw offset. */
function addDays(iso: string, days: number): string {
  const base = Date.parse(`${iso.slice(0, 10)}T00:00:00.000Z`);
  return new Date(base + days * DAY_MS).toISOString().slice(0, 10);
}

/**
 * Builds the additive card-activation collection. Takes the AU portfolio
 * ALREADY BUILT (`lib/soe/seed/index.ts` computes it once for its own
 * `auPortfolio` field) rather than calling `buildAuPortfolio(anchor)` again
 * here — `buildAuPortfolio` is a substantial, deterministic-but-not-free
 * computation (1,100 accounts, ~23k payment rows), and this module only
 * ever needs to READ that output (account ids, payment history), never
 * regenerate it. The type import a few lines up is `AuPortfolio` only, not
 * the builder function, so nothing in this file can accidentally call it a
 * second time.
 */
export function buildCardActivations(anchor: Date, auPortfolio: AuPortfolio): CardActivation[] {
  const rng = createRng(CARD_ACTIVATION_PRNG_SEED);

  // --- Account pools, in the AU portfolio's own generation order --------

  const missedPaymentByAccount = new Map<string, (typeof auPortfolio.payments)[number]>();
  for (const payment of auPortfolio.payments) {
    if (payment.status !== 'MISSED') continue;
    if (!missedPaymentByAccount.has(payment.accountId)) {
      missedPaymentByAccount.set(payment.accountId, payment);
    }
  }
  // Order follows au-portfolio.ts's own account-index generation order,
  // since `auPortfolio.payments` is built account-by-account in that order
  // (24 payments per AU-carrying account, in sequence) — first-seen MISSED
  // payment per account already yields this order for free.
  const missedAccountIds = [...missedPaymentByAccount.keys()];

  const paymentAccountIds = new Set(auPortfolio.payments.map((p) => p.accountId));
  const bookDepthAccountIds = auPortfolio.accounts
    .filter((a) => !paymentAccountIds.has(a.accountId))
    .map((a) => a.accountId);

  if (missedAccountIds.length < CA_R1_POOL_SIZE) {
    throw new Error(
      `Card activation: need ${CA_R1_POOL_SIZE} accounts with a missed payment for the ` +
        `CA-R1 pool, found only ${missedAccountIds.length}.`,
    );
  }
  if (bookDepthAccountIds.length < CA_R2_POOL_SIZE + COMPLIANT_UNACTIVATED_FRESH_SIZE + COMPLIANT_BOUNDARY_SIZE) {
    throw new Error(
      `Card activation: need ${CA_R2_POOL_SIZE + COMPLIANT_UNACTIVATED_FRESH_SIZE + COMPLIANT_BOUNDARY_SIZE} ` +
        `book-depth accounts, found only ${bookDepthAccountIds.length}.`,
    );
  }

  const caR1AccountIds = missedAccountIds.slice(0, CA_R1_POOL_SIZE);
  const caR2AccountIds = bookDepthAccountIds.slice(0, CA_R2_POOL_SIZE);
  const bookDepthRemaining = bookDepthAccountIds.slice(CA_R2_POOL_SIZE);
  const compliantBoundaryAccountIds = bookDepthRemaining.slice(0, COMPLIANT_BOUNDARY_SIZE);
  const compliantUnactivatedFreshAccountIds = bookDepthRemaining.slice(
    COMPLIANT_BOUNDARY_SIZE,
    COMPLIANT_BOUNDARY_SIZE + COMPLIANT_UNACTIVATED_FRESH_SIZE,
  );

  // "Never missed" — the FULL missed-payment set (not just the 12 chosen
  // for Pool 1), so the 85 "activated on time" compliant cards can never
  // accidentally land on an account that has a missed payment on file,
  // regardless of which activatedDate the rng below draws for them.
  const neverMissedAccountIds = auPortfolio.accounts
    .filter((a) => paymentAccountIds.has(a.accountId) && !missedPaymentByAccount.has(a.accountId))
    .map((a) => a.accountId);
  if (neverMissedAccountIds.length < COMPLIANT_ACTIVATED_ON_TIME_SIZE) {
    throw new Error(
      `Card activation: need ${COMPLIANT_ACTIVATED_ON_TIME_SIZE} never-missed AU-carrying accounts, ` +
        `found only ${neverMissedAccountIds.length}.`,
    );
  }
  const compliantActivatedOnTimeAccountIds = neverMissedAccountIds.slice(0, COMPLIANT_ACTIVATED_ON_TIME_SIZE);

  // --- Card assembly ------------------------------------------------------

  const cards: CardActivation[] = [];
  let seq = 0;
  const nextCardId = (): string => `card-ca-${pad(++seq, 4)}`;

  // Pool 1 — CA-R1 (12): issuedDate/activatedDate straddle the account's own
  // missed payment's dueDate. postGap is capped at 3 (never 4+) so
  // activatedDate never lands in the future even for the closest-to-anchor
  // missed cycle (dueOffset as near as -4 days) — the smallest margin any
  // AU-carrying account's most recent payment cycle can have.
  for (const accountId of caR1AccountIds) {
    const missedPayment = missedPaymentByAccount.get(accountId);
    if (!missedPayment) {
      throw new Error(`Card activation: expected a missed payment for ${accountId}.`);
    }
    const channel = rng.pick(CHANNELS);
    const preGapDays = rng.int(3, 10);
    const postGapDays = rng.int(1, 3);
    const issuedDate = addDays(missedPayment.dueDate, -preGapDays);
    const activatedDate = addDays(missedPayment.dueDate, postGapDays);
    cards.push({ accountId, cardId: nextCardId(), issuedDate, activatedDate, channel });
  }

  // Pool 2 — CA-R2 (29): unactivated, issued more than 45 days ago. First
  // account is the boundary case — issued EXACTLY 46 days ago (the first
  // violating day) — with no offset draw, so the boundary is a literal, not
  // an accident of rng.int's range.
  caR2AccountIds.forEach((accountId, i) => {
    const channel = rng.pick(CHANNELS);
    const daysAgo = i === 0 ? ACTIVATION_WINDOW_DAYS + 1 : rng.int(ACTIVATION_WINDOW_DAYS + 1, 300);
    cards.push({
      accountId,
      cardId: nextCardId(),
      issuedDate: dateOnly(anchor, -daysAgo),
      channel,
    });
  });

  // Pool 3a — compliant boundary (1): unactivated, issued EXACTLY 45 days
  // ago (the window's last compliant day) — paired against Pool 2's 46-day
  // violation above.
  for (const accountId of compliantBoundaryAccountIds) {
    const channel = rng.pick(CHANNELS);
    cards.push({
      accountId,
      cardId: nextCardId(),
      issuedDate: dateOnly(anchor, -ACTIVATION_WINDOW_DAYS),
      channel,
    });
  }

  // Pool 3b — compliant, unactivated & fresh (85): issued 1–44 days ago,
  // still inside the window and still pending — the same shape as the
  // Patel/Marcus special cards below, at portfolio scale.
  for (const accountId of compliantUnactivatedFreshAccountIds) {
    const channel = rng.pick(CHANNELS);
    const daysAgo = rng.int(1, ACTIVATION_WINDOW_DAYS - 1);
    cards.push({
      accountId,
      cardId: nextCardId(),
      issuedDate: dateOnly(anchor, -daysAgo),
      channel,
    });
  }

  // Pool 3c — compliant, activated on time (85): drawn only from accounts
  // with no missed payment on file (see neverMissedAccountIds above), so
  // CA-R1 can never fire here regardless of the activatedDate drawn.
  for (const accountId of compliantActivatedOnTimeAccountIds) {
    const channel = rng.pick(CHANNELS);
    const daysAgoIssued = rng.int(20, 300);
    const activationGapDays = rng.int(1, ACTIVATION_WINDOW_DAYS);
    const issuedDate = dateOnly(anchor, -daysAgoIssued);
    const activatedDate = addDays(issuedDate, activationGapDays);
    cards.push({ accountId, cardId: nextCardId(), issuedDate, activatedDate, channel });
  }

  if (cards.length !== CA_R1_POOL_SIZE + CA_R2_POOL_SIZE + COMPLIANT_POOL_SIZE) {
    throw new Error(
      `Card activation: expected ${CA_R1_POOL_SIZE + CA_R2_POOL_SIZE + COMPLIANT_POOL_SIZE} regular cards, ` +
        `built ${cards.length}.`,
    );
  }

  // --- Special cards (hand-authored literals, no PRNG draw) ---------------
  //
  // Both fresh, both unactivated, both inside the 45-day window today —
  // neither CA-R1 (no activation event yet) nor CA-R2 (well under 45 days
  // elapsed) can fire on either one in the batch scan. Marcus's block is
  // purely behavioral, at the moment `POST /api/cards/activate` is called:
  // his one v1 missed payment (lib/soe/seed/marcus.ts, dueDate `today − 12`,
  // still unresolved) is his most recent payment as of `today`, so
  // lib/sentinel/ca-exceptions.ts's past-due check reads him as past-due
  // right now — read, never modified, exactly as instructed.
  cards.push({
    accountId: PATEL_ACCOUNT_ID,
    cardId: PATEL_CARD_ID,
    issuedDate: dateOnly(anchor, -5),
    channel: 'ONLINE',
  });
  cards.push({
    accountId: MARCUS_ACCOUNT_ID,
    cardId: MARCUS_CARD_ID,
    issuedDate: dateOnly(anchor, -7),
    channel: 'MOBILE_APP',
  });

  return cards;
}
