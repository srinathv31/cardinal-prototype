// Arithmetic enforcement for the seed cast (brief §6: "assume someone in the
// room does the arithmetic"). Every formula the demo displays is recomputed
// here from the literals. The whole suite runs at both demo-date anchors.

import { describe, expect, it } from 'vitest';
import { buildSeedDb, type SeedDb } from './index';
import {
  MARCUS_ACCOUNT_ID,
  MARCUS_APR_BPS,
  MARCUS_LEDGER,
  MARCUS_LIMIT_CENTS,
} from './marcus';
import {
  ELENA_ACCOUNT_ID,
  ELENA_BT_CENTS,
  ELENA_PAYMENT_CENTS,
  ELENA_REMAINING_CENTS,
} from './elena';
import {
  ANAND_MONTHLY_CENTS,
  DEV_MONTHLY_CENTS,
  DEV_PARTY_ID,
  DEV_RECURRING,
  PATEL_ACCOUNT_ID,
  PATEL_STATEMENT_CLOSES,
  PRIYA_MONTHLY_CENTS,
  ANAND_PARTY_ID,
  PRIYA_PARTY_ID,
} from './patel';
import {
  minimumDueCents,
  monthlyInterestCents,
  projectInterest,
} from './finance';

const DAY_MS = 86_400_000;
const cents = (dollars: number) => Math.round(dollars * 100);

const ANCHORS = ['2026-08-05', '2026-08-19'] as const;

describe.each(ANCHORS)('seed cast @ anchor %s', (anchorIso) => {
  const anchor = new Date(`${anchorIso}T00:00:00.000Z`);
  const db = buildSeedDb(anchor);

  /** Whole-day offset of an ISO date/timestamp from the anchor. */
  const offset = (iso: string) =>
    Math.round(
      (Date.parse(`${iso.slice(0, 10)}T00:00:00.000Z`) - anchor.getTime()) /
        DAY_MS,
    );

  const txnsFor = (accountId: string) =>
    db.transactions.filter((t) => t.accountId === accountId);
  const inWindow = (iso: string, close: number) => {
    const o = offset(iso);
    return o > close - 30 && o <= close;
  };

  describe('Marcus Webb (Beat 2)', () => {
    const account = db.accounts.find((a) => a.accountId === MARCUS_ACCOUNT_ID)!;
    const txns = txnsFor(MARCUS_ACCOUNT_ID);
    const payments = db.payments
      .filter((p) => p.accountId === MARCUS_ACCOUNT_ID)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    it('ledger recursion holds for every cycle', () => {
      for (const row of MARCUS_LEDGER) {
        expect(
          row.openingCents +
            row.purchasesCents +
            row.interestCents +
            row.feesCents -
            row.paymentCents,
        ).toBe(row.closingCents);
      }
      // Cycles chain: each opening is the prior closing.
      for (let i = 1; i < MARCUS_LEDGER.length; i++) {
        expect(MARCUS_LEDGER[i].openingCents).toBe(
          MARCUS_LEDGER[i - 1].closingCents,
        );
      }
    });

    it('interest each cycle = opening × 24.99%/12, rounded to cents', () => {
      for (const row of MARCUS_LEDGER) {
        expect(row.interestCents).toBe(
          monthlyInterestCents(row.openingCents, MARCUS_APR_BPS),
        );
      }
    });

    it('utilization climbs 42 → 48 → 56 → 63 → 71 → 78 percent', () => {
      expect(
        MARCUS_LEDGER.map(
          (row) => (row.closingCents * 100) / MARCUS_LIMIT_CENTS,
        ),
      ).toEqual([42, 48, 56, 63, 71, 78]);
    });

    it('account balance is the final closing; availableCredit reconciles', () => {
      expect(cents(account.currentBalance)).toBe(780_000);
      expect(cents(account.availableCredit)).toBe(220_000);
      expect(cents(account.creditLimit)).toBe(MARCUS_LIMIT_CENTS);
    });

    it('purchase transactions per cycle sum to the ledger purchases column', () => {
      for (const row of MARCUS_LEDGER) {
        const sum = txns
          .filter(
            (t) => t.type === 'PURCHASE' && inWindow(t.postedDate, row.closeOffset),
          )
          .reduce((acc, t) => acc + cents(t.amount), 0);
        expect(sum).toBe(row.purchasesCents);
      }
    });

    it('exactly one INTEREST transaction per cycle, equal to ledger interest', () => {
      for (const row of MARCUS_LEDGER) {
        const interest = txns.filter(
          (t) => t.type === 'INTEREST' && inWindow(t.postedDate, row.closeOffset),
        );
        expect(interest).toHaveLength(1);
        expect(cents(interest[0].amount)).toBe(row.interestCents);
      }
    });

    it('one $40 late fee in the final cycle only', () => {
      const fees = txns.filter((t) => t.type === 'FEE');
      expect(fees).toHaveLength(1);
      expect(cents(fees[0].amount)).toBe(4_000);
      expect(offset(fees[0].postedDate)).toBe(-10);
    });

    it('every minimumDue follows max($35, 2% of statement)', () => {
      for (const p of payments) {
        expect(cents(p.minimumDue)).toBe(minimumDueCents(cents(p.amountDue)));
      }
    });

    it('three consecutive exact-minimum payments, then the autopay miss 12 days ago', () => {
      const lastFour = payments.slice(-4);
      for (const p of lastFour.slice(0, 3)) {
        expect(p.status).toBe('POSTED');
        expect(p.amountPaid).toBe(p.minimumDue);
      }
      const missed = lastFour[3];
      expect(missed.status).toBe('MISSED');
      expect(missed.amountPaid).toBe(0);
      expect(missed.channel).toBe('AUTOPAY');
      expect(offset(missed.dueDate)).toBe(-12);
      const autopayFailed = db.streamEvents.find(
        (e) => e.kind === 'autopay.failed',
      )!;
      expect(autopayFailed.accountId).toBe(MARCUS_ACCOUNT_ID);
      expect(offset(autopayFailed.timestamp)).toBe(-12);
    });
  });

  describe('Elena Ruiz (Beat 3)', () => {
    const account = db.accounts.find((a) => a.accountId === ELENA_ACCOUNT_ID)!;
    const payments = db.payments.filter(
      (p) => p.accountId === ELENA_ACCOUNT_ID,
    );
    const btEvents = db.balanceTransferEvents.filter(
      (e) => e.accountId === ELENA_ACCOUNT_ID,
    );

    it('10 × $330 payments leave exactly $5,100 of the $8,400 transfer', () => {
      expect(payments).toHaveLength(10);
      const paid = payments.reduce((acc, p) => acc + cents(p.amountPaid), 0);
      expect(paid).toBe(10 * ELENA_PAYMENT_CENTS);
      expect(ELENA_BT_CENTS - paid).toBe(ELENA_REMAINING_CENTS);
      expect(cents(account.currentBalance)).toBe(ELENA_REMAINING_CENTS);
      expect(cents(account.availableCredit)).toBe(
        cents(account.creditLimit) - ELENA_REMAINING_CENTS,
      );
    });

    it('BT events share the transfer facts; promo end = initiation + 360 days', () => {
      expect(btEvents.map((e) => e.type)).toEqual([
        'BT_INITIATED',
        'BT_COMPLETED',
        'PROMO_EXPIRING',
      ]);
      for (const e of btEvents) {
        expect(cents(e.transferAmount)).toBe(ELENA_BT_CENTS);
        expect(e.promoApr).toBe(0);
        expect(e.goToApr).toBe(24.99);
        expect(offset(e.promoEndDate)).toBe(45);
      }
      const [initiated, , expiring] = btEvents;
      expect(offset(expiring.promoEndDate) - offset(initiated.timestamp)).toBe(360);
      expect(offset(expiring.timestamp)).toBe(0);
      expect(cents(expiring.remainingBalance!)).toBe(ELENA_REMAINING_CENTS);
    });

    it('go-to interest projection: $106.21 in month 1, $944.51 over 12 months', () => {
      const rows = projectInterest(ELENA_REMAINING_CENTS, 2499, ELENA_PAYMENT_CENTS, 12);
      expect(rows).toHaveLength(12);
      expect(rows[0].interestCents).toBe(10_621);
      expect(rows[11].cumulativeInterestCents).toBe(94_451);
      let cumulative = 0;
      for (const row of rows) {
        expect(row.interestCents).toBe(monthlyInterestCents(row.openingCents, 2499));
        cumulative += row.interestCents;
        expect(row.cumulativeInterestCents).toBe(cumulative);
        expect(row.closingCents).toBe(
          row.openingCents + row.interestCents - ELENA_PAYMENT_CENTS,
        );
      }
    });
  });

  describe('Patel household (Beat 4)', () => {
    const account = db.accounts.find((a) => a.accountId === PATEL_ACCOUNT_ID)!;
    const txns = txnsFor(PATEL_ACCOUNT_ID);
    const roles = db.accountPartyRoles.filter(
      (r) => r.accountId === PATEL_ACCOUNT_ID,
    );
    const payments = db.payments
      .filter((p) => p.accountId === PATEL_ACCOUNT_ID)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));

    const partyMonthlySum = (partyId: string, close: number) =>
      txns
        .filter((t) => t.partyId === partyId && inWindow(t.postedDate, close))
        .reduce((acc, t) => acc + cents(t.amount), 0);

    it("Dev's attributed spend ramps $80 → $650 across 12 statement months", () => {
      const sums = PATEL_STATEMENT_CLOSES.map((close) =>
        partyMonthlySum(DEV_PARTY_ID, close),
      );
      expect(sums).toEqual(DEV_MONTHLY_CENTS);
      expect(sums[0]).toBe(8_000);
      expect(sums[11]).toBe(65_000);
    });

    it('recurring merchants appear exactly once per month at fixed amounts', () => {
      PATEL_STATEMENT_CLOSES.forEach((close, month) => {
        for (const r of DEV_RECURRING) {
          const matches = txns.filter(
            (t) =>
              t.partyId === DEV_PARTY_ID &&
              t.merchantName === r.merchant &&
              inWindow(t.postedDate, close),
          );
          if (month >= r.fromMonth) {
            expect(matches).toHaveLength(1);
            expect(cents(matches[0].amount)).toBe(r.cents);
          } else {
            expect(matches).toHaveLength(0);
          }
        }
      });
    });

    it('Anand and Priya hold their stable monthly literals', () => {
      PATEL_STATEMENT_CLOSES.forEach((close, month) => {
        expect(partyMonthlySum(ANAND_PARTY_ID, close)).toBe(
          ANAND_MONTHLY_CENTS[month],
        );
        expect(partyMonthlySum(PRIYA_PARTY_ID, close)).toBe(
          PRIYA_MONTHLY_CENTS[month],
        );
      });
    });

    it('transactor: every posted payment pays that statement in full; no interest ever', () => {
      expect(payments).toHaveLength(12);
      payments.forEach((p, month) => {
        const statementCents =
          ANAND_MONTHLY_CENTS[month] +
          PRIYA_MONTHLY_CENTS[month] +
          DEV_MONTHLY_CENTS[month];
        expect(cents(p.amountDue)).toBe(statementCents);
        expect(cents(p.minimumDue)).toBe(minimumDueCents(statementCents));
        if (p.status === 'POSTED') {
          expect(cents(p.amountPaid)).toBe(statementCents);
        }
      });
      expect(payments.slice(0, 11).every((p) => p.status === 'POSTED')).toBe(true);
      expect(payments[11].status).toBe('SCHEDULED');
      expect(txns.some((t) => t.type === 'INTEREST')).toBe(false);
    });

    it('current balance is the three post-statement purchases; utilization < 10%', () => {
      expect(cents(account.currentBalance)).toBe(12_187 + 2_785 + 3_490);
      expect(account.currentBalance / account.creditLimit).toBeLessThan(0.1);
    });

    it('one PRIMARY + two AUTHORIZED_USERs; every transaction is attributed; Dev is 22', () => {
      expect(roles.filter((r) => r.role === 'PRIMARY')).toHaveLength(1);
      expect(roles.filter((r) => r.role === 'AUTHORIZED_USER')).toHaveLength(2);
      expect(txns.every((t) => t.partyId)).toBe(true);
      const dev = db.parties.find((p) => p.partyId === DEV_PARTY_ID)!;
      const age = Math.floor(
        (anchor.getTime() - Date.parse(`${dev.dateOfBirth}T00:00:00.000Z`)) /
          (365.25 * DAY_MS),
      );
      expect(age).toBe(22);
    });
  });

  describe('portfolio', () => {
    it('availableCredit = creditLimit − currentBalance for all 9 accounts', () => {
      expect(db.accounts).toHaveLength(9);
      for (const a of db.accounts) {
        expect(cents(a.availableCredit)).toBe(
          cents(a.creditLimit) - cents(a.currentBalance),
        );
      }
    });

    it('BTs expiring within 90 days = exactly Elena, bg-002, bg-005', () => {
      const expiring = new Set(
        db.balanceTransferEvents
          .filter((e) => {
            const o = offset(e.promoEndDate);
            return o > 0 && o <= 90;
          })
          .map((e) => e.accountId),
      );
      expect([...expiring].sort()).toEqual([ELENA_ACCOUNT_ID, 'bg-002', 'bg-005']);
    });

    it('all ids are unique across the SeedDb', () => {
      const ids = [
        ...db.parties.map((p) => p.partyId),
        ...db.accounts.map((a) => a.accountId),
        ...db.transactions.map((t) => t.transactionId),
        ...db.payments.map((p) => p.paymentId),
        ...db.balanceTransferEvents.map((e) => e.eventId),
        ...db.streamEvents.map((e) => e.eventId),
      ];
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('stream ticker covers all 7 kinds and carries the three beat triggers', () => {
      const kinds = new Set(db.streamEvents.map((e) => e.kind));
      expect([...kinds].sort()).toEqual([
        'autopay.failed',
        'balance_transfer.completed',
        'bt.promo_expiring',
        'payment.missed',
        'payment.posted',
        'statement.generated',
        'transaction.posted',
      ]);
      const byId = (id: string) => db.streamEvents.find((e) => e.eventId === id)!;
      expect(offset(byId('evt-marcus-autopay-failed').timestamp)).toBe(-12);
      expect(offset(byId('evt-patel-statement').timestamp)).toBe(-2);
      expect(offset(byId('evt-elena-promo-expiring').timestamp)).toBe(0);
    });

    it('buildSeedDb is deterministic for a fixed anchor', () => {
      expect(buildSeedDb(anchor)).toEqual(db);
    });
  });
});

describe('anchor invariance', () => {
  const strip = (db: SeedDb) => ({
    accounts: db.accounts.map((a) => [
      a.accountId, a.creditLimit, a.currentBalance, a.availableCredit, a.purchaseApr, a.status,
    ]),
    transactions: db.transactions.map((t) => [
      t.transactionId, t.amount, t.merchantName, t.category, t.type, t.partyId,
    ]),
    payments: db.payments.map((p) => [
      p.paymentId, p.amountDue, p.minimumDue, p.amountPaid, p.status, p.channel,
    ]),
    btEvents: db.balanceTransferEvents.map((e) => [
      e.eventId, e.type, e.transferAmount, e.promoApr, e.goToApr, e.remainingBalance,
    ]),
  });

  it('amounts are identical at both demo anchors; dates shift by exactly 14 days', () => {
    const aug05 = buildSeedDb(new Date('2026-08-05T00:00:00.000Z'));
    const aug19 = buildSeedDb(new Date('2026-08-19T00:00:00.000Z'));
    expect(strip(aug19)).toEqual(strip(aug05));
    aug05.transactions.forEach((t, i) => {
      expect(
        Date.parse(aug19.transactions[i].postedDate) - Date.parse(t.postedDate),
      ).toBe(14 * DAY_MS);
    });
    aug05.streamEvents.forEach((e, i) => {
      expect(
        Date.parse(aug19.streamEvents[i].timestamp) - Date.parse(e.timestamp),
      ).toBe(14 * DAY_MS);
    });
  });

  it('background transactions match the golden checksum', () => {
    const db = buildSeedDb(new Date('2026-08-05T00:00:00.000Z'));
    const background = db.transactions.filter((t) =>
      t.accountId.startsWith('bg-'),
    );
    const checksum = {
      count: background.length,
      sumCents: background.reduce((acc, t) => acc + Math.round(t.amount * 100), 0),
    };
    // Captured from the first implementation run; a change here means the PRNG
    // draw order changed — that must be intentional.
    expect(checksum).toEqual({ count: 192, sumCents: 2_541_250 });
  });
});
