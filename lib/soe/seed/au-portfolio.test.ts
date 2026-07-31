// Arithmetic enforcement for the AU portfolio (CARDINAL_V3_AU_BRIEF.md §5d,
// Part 4; docs/v3-migration-map.md §6/§6a/§6b). Mirrors seed.test.ts's voice
// and structure: every figure the demo displays is recomputed here from the
// generated data, and the evaluator's own re-derivation (not the generator's
// plan) is what proves the aggregation is real. The whole suite runs at both
// demo-date anchors.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getAuScanPortfolio } from '@/lib/soe';
import { ageOnDate, evaluateAuPolicy, type AuScanInput } from '../../sentinel/au-exceptions';
import { AU_PRNG_SEED, buildAuPortfolio, type AuPortfolio } from './au-portfolio';
import { buildSeedDb, type SeedDb } from './index';
import { PATEL_ACCOUNT_ID } from './patel';

const DAY_MS = 86_400_000;
const cents = (dollars: number) => Math.round(dollars * 100);

const ANCHORS = ['2026-08-05', '2026-08-19'] as const;

/** Mirrors lib/soe/adapter.ts's getAuScanPortfolio EXACTLY — kept as an
 * independent re-derivation (not a call into the adapter) for the figures
 * asserted directly against `buildAuPortfolio`'s output, so a bug shared
 * between the generator and the adapter wouldn't hide behind one call site.
 * The adapter itself is exercised separately below, through the real
 * `getAuScanPortfolio()` import. */
function deriveScanSet(portfolio: AuPortfolio, db: SeedDb): AuScanInput {
  const collectionAccountIds = new Set(
    portfolio.roles
      .filter((r) => r.role === 'AUTHORIZED_USER')
      .map((r) => r.accountId),
  );
  const collectionAccounts = portfolio.accounts.filter((a) =>
    collectionAccountIds.has(a.accountId),
  );
  const collectionRoles = portfolio.roles.filter((r) =>
    collectionAccountIds.has(r.accountId),
  );
  const collectionPartyIds = new Set(collectionRoles.map((r) => r.partyId));
  const collectionParties = portfolio.parties.filter((p) =>
    collectionPartyIds.has(p.partyId),
  );
  const collectionPayments = portfolio.payments.filter((p) =>
    collectionAccountIds.has(p.accountId),
  );

  const v1AuAccountIds = new Set(
    db.accountPartyRoles
      .filter((r) => r.role === 'AUTHORIZED_USER')
      .map((r) => r.accountId),
  );
  const v1Accounts = db.accounts.filter((a) => v1AuAccountIds.has(a.accountId));
  const v1Roles = db.accountPartyRoles.filter((r) => v1AuAccountIds.has(r.accountId));
  const v1PartyIds = new Set(v1Roles.map((r) => r.partyId));
  const v1Parties = db.parties.filter((p) => v1PartyIds.has(p.partyId));
  const v1Payments = db.payments.filter((p) => v1AuAccountIds.has(p.accountId));

  return {
    accounts: [...collectionAccounts, ...v1Accounts],
    parties: [...collectionParties, ...v1Parties],
    roles: [...collectionRoles, ...v1Roles],
    payments: [...collectionPayments, ...v1Payments],
  };
}

describe.each(ANCHORS)('AU portfolio @ anchor %s', (anchorIso) => {
  const anchor = new Date(`${anchorIso}T00:00:00.000Z`);
  const portfolio = buildAuPortfolio(anchor);
  const db = buildSeedDb(anchor);

  it('uses its own PRNG seed, never background.ts’s', () => {
    expect(AU_PRNG_SEED).toBe(20260724);
  });

  describe('golden checksum', () => {
    it('freezes the generated collection', () => {
      const sumCreditLimitCents = portfolio.accounts.reduce(
        (acc, a) => acc + cents(a.creditLimit),
        0,
      );
      const sumAmountDueCents = portfolio.payments.reduce(
        (acc, p) => acc + cents(p.amountDue),
        0,
      );
      const missedCount = portfolio.payments.filter((p) => p.status === 'MISSED').length;

      const checksum = {
        accountCount: portfolio.accounts.length,
        sumCreditLimitCents,
        partyCount: portfolio.parties.length,
        roleCount: portfolio.roles.length,
        paymentCount: portfolio.payments.length,
        sumAmountDueCents,
        missedCount,
      };
      // Captured from the first implementation run; a change here means the
      // PRNG draw order changed — that must be intentional.
      expect(checksum).toEqual({
        accountCount: 1_100,
        sumCreditLimitCents: 817_135_000,
        partyCount: 2_345,
        roleCount: 2_345,
        paymentCount: 23_064,
        sumAmountDueCents: 1_666_288_894,
        missedCount: 145,
      });
    });
  });

  describe('collection shape', () => {
    it('1,100 accounts; 961 carrying at least one AU; 1,245 AU roles', () => {
      expect(portfolio.accounts).toHaveLength(1_100);
      const auRoles = portfolio.roles.filter((r) => r.role === 'AUTHORIZED_USER');
      expect(auRoles).toHaveLength(1_245);
      expect(new Set(auRoles.map((r) => r.accountId)).size).toBe(961);
    });

    it('148 accounts are securedCard === true; exactly 52 of them carry an AU', () => {
      const secured = portfolio.accounts.filter((a) => a.securedCard === true);
      expect(secured).toHaveLength(148);
      const auAccountIds = new Set(
        portfolio.roles
          .filter((r) => r.role === 'AUTHORIZED_USER')
          .map((r) => r.accountId),
      );
      const securedAndAuCarrying = secured.filter((a) => auAccountIds.has(a.accountId));
      expect(securedAndAuCarrying).toHaveLength(52);
    });
  });

  describe('scan set', () => {
    it('962 accounts and 1,247 AU relationships (local re-derivation)', () => {
      const scanSet = deriveScanSet(portfolio, db);
      expect(scanSet.accounts).toHaveLength(962);
      expect(
        scanSet.roles.filter((r) => r.role === 'AUTHORIZED_USER'),
      ).toHaveLength(1_247);
    });

    describe('via the adapter', () => {
      beforeEach(() => {
        process.env.DEMO_ANCHOR_DATE = anchorIso;
      });
      afterEach(() => {
        delete process.env.DEMO_ANCHOR_DATE;
      });

      it('getAuScanPortfolio() returns the same 962 accounts / 1,247 AU relationships', async () => {
        const scan = await getAuScanPortfolio();
        expect(scan.accounts).toHaveLength(962);
        expect(
          scan.roles.filter((r) => r.role === 'AUTHORIZED_USER'),
        ).toHaveLength(1_247);
      });
    });
  });

  describe('evaluator headline figures (re-derived from data, not the generator’s plan)', () => {
    const scanSet = deriveScanSet(portfolio, db);
    const result = evaluateAuPolicy(scanSet);

    it('R1 = 61 relationships / 52 accounts', () => {
      expect(result.byRule.R1).toEqual({ relationships: 61, accounts: 52 });
    });

    it('R2 = 19 relationships / 17 accounts', () => {
      expect(result.byRule.R2).toEqual({ relationships: 19, accounts: 17 });
    });

    it('R3 = 7 relationships / 7 accounts', () => {
      expect(result.byRule.R3).toEqual({ relationships: 7, accounts: 7 });
    });

    it('87 total exceptions across 74 distinct accounts', () => {
      expect(result.exceptions).toHaveLength(87);
      expect(result.accountsAffected).toBe(74);
    });

    it('the overlap arithmetic is explicit: 52+17+7=76, 76-74=2, exactly 2 accounts hit more than one rule', () => {
      expect(52 + 17 + 7).toBe(76);
      expect(76 - 74).toBe(2);

      const accountRuleSets = new Map<string, Set<string>>();
      for (const e of result.exceptions) {
        if (!accountRuleSets.has(e.accountId)) accountRuleSets.set(e.accountId, new Set());
        accountRuleSets.get(e.accountId)!.add(e.ruleId);
      }
      const multiRuleAccounts = [...accountRuleSets.entries()].filter(
        ([, rules]) => rules.size > 1,
      );
      expect(multiRuleAccounts).toHaveLength(2);
      for (const [, rules] of multiRuleAccounts) {
        expect([...rules].sort()).toEqual(['R2', 'R3']);
      }
    });

    it('no relationship appears under two rule ids — all 87 rule-hits are 87 distinct (accountId, partyId) pairs', () => {
      const pairs = result.exceptions.map((e) => `${e.accountId}|${e.partyId}`);
      expect(new Set(pairs).size).toBe(pairs.length);
      expect(pairs).toHaveLength(87);
    });

    it('the Patel household is a compliance pass: in the scan set, 2 AUs, zero exceptions', () => {
      expect(scanSet.accounts.some((a) => a.accountId === PATEL_ACCOUNT_ID)).toBe(true);
      const patelAuRoles = scanSet.roles.filter(
        (r) => r.accountId === PATEL_ACCOUNT_ID && r.role === 'AUTHORIZED_USER',
      );
      expect(patelAuRoles).toHaveLength(2);
      const patelExceptions = result.exceptions.filter(
        (e) => e.accountId === PATEL_ACCOUNT_ID,
      );
      expect(patelExceptions).toHaveLength(0);
    });

    it('every AU that is NOT an R3 exception was at least 16 at addition; every R3 exception was under 16 — proved via ageOnDate', () => {
      const r3PartyIds = new Set(
        result.exceptions.filter((e) => e.ruleId === 'R3').map((e) => e.partyId),
      );
      const auRoles = scanSet.roles.filter((r) => r.role === 'AUTHORIZED_USER');
      for (const role of auRoles) {
        const party = scanSet.parties.find((p) => p.partyId === role.partyId)!;
        const age = ageOnDate(party.dateOfBirth, role.addedDate);
        if (r3PartyIds.has(role.partyId)) {
          expect(age).toBeLessThan(16);
        } else {
          expect(age).toBeGreaterThanOrEqual(16);
        }
      }
    });
  });

  describe('data integrity', () => {
    it('every account is ACTIVE', () => {
      expect(portfolio.accounts.every((a) => a.status === 'ACTIVE')).toBe(true);
    });

    it('openedDate precedes every addedDate on that account', () => {
      const rolesByAccount = new Map<string, typeof portfolio.roles>();
      for (const role of portfolio.roles) {
        const list = rolesByAccount.get(role.accountId);
        if (list) list.push(role);
        else rolesByAccount.set(role.accountId, [role]);
      }
      for (const account of portfolio.accounts) {
        const openedTs = Date.parse(`${account.openedDate}T00:00:00.000Z`);
        const roles = rolesByAccount.get(account.accountId) ?? [];
        for (const role of roles) {
          const addedTs = Date.parse(`${role.addedDate}T00:00:00.000Z`);
          expect(addedTs).toBeGreaterThanOrEqual(openedTs);
        }
      }
    });

    it('availableCredit === creditLimit − currentBalance for all 1,100 accounts', () => {
      for (const a of portfolio.accounts) {
        expect(cents(a.availableCredit)).toBe(cents(a.creditLimit) - cents(a.currentBalance));
      }
    });

    it('all AU-carrying accounts (0001–0961) carry payment history; book-depth accounts (0962–1100) carry none', () => {
      const auAccountIds = new Set(
        portfolio.roles
          .filter((r) => r.role === 'AUTHORIZED_USER')
          .map((r) => r.accountId),
      );
      const paymentAccountIds = new Set(portfolio.payments.map((p) => p.accountId));
      expect(paymentAccountIds).toEqual(auAccountIds);
    });
  });

  describe('v1 guardrails still hold (docs/v3-migration-map.md §3)', () => {
    it('db.accounts is still exactly 9', () => {
      expect(db.accounts).toHaveLength(9);
    });

    it('BTs expiring within 90 days = exactly Elena, bg-002, bg-005', () => {
      const offset = (iso: string) =>
        Math.round(
          (Date.parse(`${iso.slice(0, 10)}T00:00:00.000Z`) - anchor.getTime()) / DAY_MS,
        );
      const expiring = new Set(
        db.balanceTransferEvents
          .filter((e) => {
            const o = offset(e.promoEndDate);
            return o > 0 && o <= 90;
          })
          .map((e) => e.accountId),
      );
      expect([...expiring].sort()).toEqual(['acct-elena', 'bg-002', 'bg-005']);
    });

    it('all ids are unique across the entire SeedDb, including auPortfolio', () => {
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
      ];
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  it('buildSeedDb is deterministic for a fixed anchor, auPortfolio included', () => {
    expect(buildSeedDb(anchor)).toEqual(db);
  });

  it('buildAuPortfolio is deterministic for a fixed anchor', () => {
    expect(buildAuPortfolio(anchor)).toEqual(portfolio);
  });
});

describe('AU portfolio — anchor invariance', () => {
  const strip = (portfolio: AuPortfolio) => ({
    accounts: portfolio.accounts.map((a) => [
      a.accountId, a.creditLimit, a.currentBalance, a.availableCredit,
      a.purchaseApr, a.status, a.securedCard, a.securityDepositAmount,
    ]),
    parties: portfolio.parties.map((p) => [p.partyId, p.fullName, p.email]),
    roles: portfolio.roles.map((r) => [r.accountId, r.partyId, r.role]),
    payments: portfolio.payments.map((p) => [
      p.paymentId, p.amountDue, p.minimumDue, p.amountPaid, p.status, p.channel,
    ]),
  });

  it('ids and amounts are identical at both demo anchors; every date shifts by exactly 14 days', () => {
    const aug05 = buildAuPortfolio(new Date('2026-08-05T00:00:00.000Z'));
    const aug19 = buildAuPortfolio(new Date('2026-08-19T00:00:00.000Z'));
    expect(strip(aug19)).toEqual(strip(aug05));

    aug05.accounts.forEach((a, i) => {
      expect(
        Date.parse(aug19.accounts[i].openedDate) - Date.parse(a.openedDate),
      ).toBe(14 * DAY_MS);
    });
    aug05.roles.forEach((r, i) => {
      expect(
        Date.parse(aug19.roles[i].addedDate) - Date.parse(r.addedDate),
      ).toBe(14 * DAY_MS);
    });
    aug05.parties.forEach((p, i) => {
      expect(
        Date.parse(aug19.parties[i].dateOfBirth) - Date.parse(p.dateOfBirth),
      ).toBe(14 * DAY_MS);
    });
    aug05.payments.forEach((p, i) => {
      expect(
        Date.parse(aug19.payments[i].dueDate) - Date.parse(p.dueDate),
      ).toBe(14 * DAY_MS);
    });
  });
});
