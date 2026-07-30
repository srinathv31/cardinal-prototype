// Arithmetic enforcement for the card-activation collection (DEMO_THESIS.md
// Use case 3; DEMO_BUILD_PLAN.md "Card-activation domain"). Mirrors
// au-portfolio.test.ts's voice and structure: every figure the demo
// displays is recomputed here from the generated data, and the evaluator's
// own re-derivation (not the generator's plan) is what proves the
// aggregation is real. The whole suite runs at both demo-date anchors.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getCardActivationScan } from '@/lib/soe';
import { evaluateCardActivationPolicy, type CaScanInput } from '../../sentinel/ca-exceptions';
import { buildAuPortfolio } from './au-portfolio';
import {
  buildCardActivations,
  CARD_ACTIVATION_PRNG_SEED,
  MARCUS_CARD_ID,
  PATEL_CARD_ID,
} from './card-activation';
import { buildSeedDb, type SeedDb } from './index';
import { MARCUS_ACCOUNT_ID } from './marcus';
import { PATEL_ACCOUNT_ID } from './patel';

const DAY_MS = 86_400_000;

const ANCHORS = ['2026-08-05', '2026-08-19'] as const;

/** Mirrors lib/soe/adapter.ts's getCardActivationScan EXACTLY — kept as an
 * independent re-derivation (not a call into the adapter) for the figures
 * asserted directly against `buildCardActivations`'s output, so a bug
 * shared between the generator and the adapter wouldn't hide behind one
 * call site. The adapter itself is exercised separately below, through the
 * real `getCardActivationScan()` import. */
function deriveScanInput(
  cardActivations: ReturnType<typeof buildCardActivations>,
  db: SeedDb,
  asOf: string,
): CaScanInput {
  const accountIds = new Set(cardActivations.map((c) => c.accountId));
  const payments = [
    ...db.auPortfolio.payments.filter((p) => accountIds.has(p.accountId)),
    ...db.payments.filter((p) => accountIds.has(p.accountId)),
  ];
  return { cardActivations, payments, asOf };
}

describe.each(ANCHORS)('card-activation collection @ anchor %s', (anchorIso) => {
  const anchor = new Date(`${anchorIso}T00:00:00.000Z`);
  const auPortfolio = buildAuPortfolio(anchor);
  const cardActivations = buildCardActivations(anchor, auPortfolio);
  const db = buildSeedDb(anchor);
  const asOf = anchorIso;

  it('uses its own PRNG seed, distinct from au-portfolio.ts and background.ts', () => {
    expect(CARD_ACTIVATION_PRNG_SEED).toBe(20260730);
    expect(CARD_ACTIVATION_PRNG_SEED).not.toBe(20260724); // AU_PRNG_SEED
    expect(CARD_ACTIVATION_PRNG_SEED).not.toBe(20260805); // background.ts's PRNG_SEED
  });

  describe('golden shape', () => {
    it('214 cards scanned', () => {
      expect(cardActivations).toHaveLength(214);
    });

    it('every cardId is unique; every accountId is unique (one card per account)', () => {
      const cardIds = cardActivations.map((c) => c.cardId);
      const accountIds = cardActivations.map((c) => c.accountId);
      expect(new Set(cardIds).size).toBe(cardIds.length);
      expect(new Set(accountIds).size).toBe(accountIds.length);
    });

    it('issuedDate precedes or equals activatedDate whenever a card is activated', () => {
      for (const card of cardActivations) {
        if (!card.activatedDate) continue;
        expect(Date.parse(card.activatedDate)).toBeGreaterThanOrEqual(Date.parse(card.issuedDate));
      }
    });
  });

  describe('evaluator headline figures (re-derived from data, not the generator’s plan)', () => {
    const scanInput = deriveScanInput(cardActivations, db, asOf);
    const result = evaluateCardActivationPolicy(scanInput);

    it('214 cards scanned, 41 out of compliance', () => {
      expect(result.cardsScanned).toBe(214);
      expect(result.exceptions).toHaveLength(41);
    });

    it('29 CA-R2 (unactivated, more than 45 days since issuance)', () => {
      expect(result.byRule['CA-R2']).toEqual({ count: 29, accounts: 29 });
      for (const e of result.exceptions.filter((x) => x.ruleId === 'CA-R2')) {
        expect(e.activatedDate).toBeUndefined();
      }
    });

    it('12 CA-R1 (activated while the account was past-due)', () => {
      expect(result.byRule['CA-R1']).toEqual({ count: 12, accounts: 12 });
      for (const e of result.exceptions.filter((x) => x.ruleId === 'CA-R1')) {
        expect(e.activatedDate).toBeDefined();
      }
    });

    it('the 29 + 12 = 41 arithmetic is explicit, with zero overlap between the two rule sets', () => {
      expect(29 + 12).toBe(41);
      const r2Accounts = new Set(
        result.exceptions.filter((e) => e.ruleId === 'CA-R2').map((e) => e.accountId),
      );
      const r1Accounts = new Set(
        result.exceptions.filter((e) => e.ruleId === 'CA-R1').map((e) => e.accountId),
      );
      const overlap = [...r1Accounts].filter((id) => r2Accounts.has(id));
      expect(overlap).toHaveLength(0);
      expect(result.accountsAffected).toBe(41);
    });

    it('the 45/46-day boundary is exercised in the seed itself: one CA-R2 exception at exactly 46 days, one compliant card at exactly 45', () => {
      const r2Exceptions = result.exceptions.filter((e) => e.ruleId === 'CA-R2' && !e.activatedDate);
      const daysSinceIssue = (issuedDate: string) =>
        Math.round((Date.parse(`${asOf}T00:00:00.000Z`) - Date.parse(`${issuedDate}T00:00:00.000Z`)) / DAY_MS);
      expect(r2Exceptions.some((e) => daysSinceIssue(e.issuedDate) === 46)).toBe(true);

      const compliantUnactivated = cardActivations.filter(
        (c) => !c.activatedDate && !result.exceptions.some((e) => e.cardId === c.cardId),
      );
      expect(compliantUnactivated.some((c) => daysSinceIssue(c.issuedDate) === 45)).toBe(true);
    });

    it('Anand Patel’s card is in the scan set and compliant (happy path)', () => {
      const patelCard = cardActivations.find((c) => c.cardId === PATEL_CARD_ID);
      expect(patelCard).toBeDefined();
      expect(patelCard?.accountId).toBe(PATEL_ACCOUNT_ID);
      expect(patelCard?.activatedDate).toBeUndefined();
      const daysAgo = Math.round(
        (Date.parse(`${asOf}T00:00:00.000Z`) - Date.parse(`${patelCard!.issuedDate}T00:00:00.000Z`)) / DAY_MS,
      );
      expect(daysAgo).toBe(5);
      expect(result.exceptions.some((e) => e.cardId === PATEL_CARD_ID)).toBe(false);
    });

    it('Marcus Webb’s card is in the scan set and NOT a batch exception (his block is behavioral at live activation, not a seeded exception)', () => {
      const marcusCard = cardActivations.find((c) => c.cardId === MARCUS_CARD_ID);
      expect(marcusCard).toBeDefined();
      expect(marcusCard?.accountId).toBe(MARCUS_ACCOUNT_ID);
      expect(marcusCard?.activatedDate).toBeUndefined();
      const daysAgo = Math.round(
        (Date.parse(`${asOf}T00:00:00.000Z`) - Date.parse(`${marcusCard!.issuedDate}T00:00:00.000Z`)) / DAY_MS,
      );
      expect(daysAgo).toBe(7);
      expect(result.exceptions.some((e) => e.cardId === MARCUS_CARD_ID)).toBe(false);
    });

    it('Marcus is genuinely past-due today — his one v1 missed payment (read, never modified) resolves the live activation check', () => {
      const marcusPayments = db.payments.filter((p) => p.accountId === MARCUS_ACCOUNT_ID);
      const missed = marcusPayments.filter((p) => p.status === 'MISSED');
      expect(missed.length).toBeGreaterThan(0);
      // His most recent payment as of today is the missed one — no later
      // payment exists to "cure" it (lib/soe/seed/marcus.ts's ledger ends
      // at the missed cycle).
      const mostRecent = [...marcusPayments].sort((a, b) => b.dueDate.localeCompare(a.dueDate))[0];
      expect(mostRecent.status).toBe('MISSED');
    });
  });

  describe('via the adapter', () => {
    beforeEach(() => {
      process.env.DEMO_ANCHOR_DATE = anchorIso;
    });
    afterEach(() => {
      delete process.env.DEMO_ANCHOR_DATE;
    });

    it('getCardActivationScan() returns the same 214 cards and asOf matches the anchor', async () => {
      const scan = await getCardActivationScan();
      expect(scan.cardActivations).toHaveLength(214);
      expect(scan.asOf).toBe(anchorIso);
    });

    it('getCardActivationScan() reproduces the same 41 = 29 + 12 headline figures', async () => {
      const scan = await getCardActivationScan();
      const result = evaluateCardActivationPolicy(scan);
      expect(result.exceptions).toHaveLength(41);
      expect(result.byRule['CA-R2'].count).toBe(29);
      expect(result.byRule['CA-R1'].count).toBe(12);
    });
  });

  describe('v1 / v3 guardrails still hold', () => {
    it('db.accounts is still exactly 9 (v1 arithmetic untouched)', () => {
      expect(db.accounts).toHaveLength(9);
    });

    it('buildSeedDb carries cardActivations alongside auPortfolio, both additive', () => {
      expect(db.cardActivations).toHaveLength(214);
      expect(db.auPortfolio.accounts).toHaveLength(1_100);
    });

    it('every card-activation cardId is unique across the entire SeedDb\'s id space', () => {
      const ids = [
        ...db.parties.map((p) => p.partyId),
        ...db.accounts.map((a) => a.accountId),
        ...db.transactions.map((t) => t.transactionId),
        ...db.payments.map((p) => p.paymentId),
        ...db.balanceTransferEvents.map((e) => e.eventId),
        ...db.streamEvents.map((e) => e.eventId),
        ...db.auPortfolio.parties.map((p) => p.partyId),
        ...db.auPortfolio.accounts.map((a) => a.accountId),
        ...db.auPortfolio.payments.map((p) => p.paymentId),
        ...db.cardActivations.map((c) => c.cardId),
      ];
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  it('buildSeedDb is deterministic for a fixed anchor, cardActivations included', () => {
    expect(buildSeedDb(anchor)).toEqual(db);
  });

  it('buildCardActivations is deterministic for a fixed anchor', () => {
    expect(buildCardActivations(anchor, auPortfolio)).toEqual(cardActivations);
  });
});

describe('card-activation collection — anchor invariance', () => {
  it('ids and channels are identical at both demo anchors; every date shifts by exactly 14 days', () => {
    const aug05Anchor = new Date('2026-08-05T00:00:00.000Z');
    const aug19Anchor = new Date('2026-08-19T00:00:00.000Z');
    const aug05 = buildCardActivations(aug05Anchor, buildAuPortfolio(aug05Anchor));
    const aug19 = buildCardActivations(aug19Anchor, buildAuPortfolio(aug19Anchor));

    expect(aug19.map((c) => c.cardId)).toEqual(aug05.map((c) => c.cardId));
    expect(aug19.map((c) => c.accountId)).toEqual(aug05.map((c) => c.accountId));
    expect(aug19.map((c) => c.channel)).toEqual(aug05.map((c) => c.channel));

    aug05.forEach((card, i) => {
      const other = aug19[i];
      expect(Date.parse(other.issuedDate) - Date.parse(card.issuedDate)).toBe(14 * DAY_MS);
      if (card.activatedDate) {
        expect(other.activatedDate).toBeDefined();
        expect(Date.parse(other.activatedDate!) - Date.parse(card.activatedDate)).toBe(14 * DAY_MS);
      } else {
        expect(other.activatedDate).toBeUndefined();
      }
    });
  });
});
