// Arithmetic enforcement for the Sentinel seed additions (brief v2 §5: "keep
// all arithmetic hand-reconcilable"), mirroring seed.test.ts's structure and
// voice. Runs at both demo-date anchors. Does NOT modify seed.test.ts — this
// is a separate suite over the same buildSeedDb(anchor).

import { describe, expect, it } from 'vitest';
import { buildSeedDb } from './index';
import { MARCUS_ACCOUNT_ID } from './marcus';
import { ELENA_ACCOUNT_ID } from './elena';
import { policyDocument, policyRules } from '../../sentinel/policy';

const DAY_MS = 86_400_000;
const cents = (dollars: number) => Math.round(dollars * 100);

const ANCHORS = ['2026-08-05', '2026-08-19'] as const;

describe.each(ANCHORS)('sentinel additions @ anchor %s', (anchorIso) => {
  const anchor = new Date(`${anchorIso}T00:00:00.000Z`);
  const db = buildSeedDb(anchor);

  /** Whole-day offset of an ISO date/timestamp from the anchor. */
  const offset = (iso: string) =>
    Math.round(
      (Date.parse(`${iso.slice(0, 10)}T00:00:00.000Z`) - anchor.getTime()) /
        DAY_MS,
    );

  describe('replay log ("the night")', () => {
    const events = db.sentinelReplayEvents;

    it('exactly 14 events, strictly ascending, all on day 0 between 00:00 and 06:00 UTC', () => {
      expect(events).toHaveLength(14);
      for (let i = 1; i < events.length; i++) {
        expect(Date.parse(events[i].timestamp)).toBeGreaterThan(
          Date.parse(events[i - 1].timestamp),
        );
      }
      for (const e of events) {
        expect(offset(e.timestamp)).toBe(0);
        const hhmm = e.timestamp.slice(11, 16);
        expect(hhmm >= '00:00' && hhmm <= '06:00').toBe(true);
      }
    });

    it('exactly one balance_transfer.initiated — Marcus, at 02:47', () => {
      const btInitiated = events.filter(
        (e) => e.kind === 'balance_transfer.initiated',
      );
      expect(btInitiated).toHaveLength(1);
      expect(btInitiated[0].accountId).toBe(MARCUS_ACCOUNT_ID);
      expect(btInitiated[0].timestamp.slice(11, 16)).toBe('02:47');
      expect(btInitiated[0].summary).toBe(
        'Balance transfer of $3,200.00 initiated on acct-marcus',
      );
    });

    it('every eventId starts with evt-night-', () => {
      for (const e of events) {
        expect(e.eventId.startsWith('evt-night-')).toBe(true);
      }
    });
  });

  it('all ids are unique across the entire SeedDb, including sentinel collections', () => {
    const ids = [
      ...db.parties.map((p) => p.partyId),
      ...db.accounts.map((a) => a.accountId),
      ...db.transactions.map((t) => t.transactionId),
      ...db.payments.map((p) => p.paymentId),
      ...db.balanceTransferEvents.map((e) => e.eventId),
      ...db.streamEvents.map((e) => e.eventId),
      ...db.sentinelReplayEvents.map((e) => e.eventId),
      ...db.promoNotices.map((n) => n.noticeId),
    ];
    expect(new Set(ids).size).toBe(ids.length);
  });

  describe("R1 — Marcus's violating BT (cross-dataset)", () => {
    const btEvent = db.balanceTransferEvents.find(
      (e) => e.eventId === 'bt-marcus-1',
    )!;
    const missedPayment = db.payments.find(
      (p) => p.accountId === MARCUS_ACCOUNT_ID && p.status === 'MISSED',
    )!;

    it("initiated exactly 12 days after Marcus's missed payment due date; 12 ≤ 60", () => {
      const daysAfter = Math.round(
        (Date.parse(btEvent.timestamp) -
          Date.parse(`${missedPayment.dueDate}T00:00:00.000Z`)) /
          DAY_MS,
      );
      expect(daysAfter).toBe(12);
      expect(daysAfter).toBeLessThanOrEqual(60);
    });
  });

  describe('R2 — transfer sizing against the BT credit line', () => {
    const btEvent = db.balanceTransferEvents.find(
      (e) => e.eventId === 'bt-marcus-1',
    )!;
    const account = db.accounts.find((a) => a.accountId === MARCUS_ACCOUNT_ID)!;

    it('$3,200 ≤ 90% of the $4,000 balance-transfer credit line — passes', () => {
      expect(btEvent.transferAmount).toBe(3_200);
      expect(btEvent.btCreditLineAtInitiation).toBe(4_000);
      expect(btEvent.transferAmount).toBeLessThanOrEqual(
        0.9 * btEvent.btCreditLineAtInitiation!,
      );
    });

    it('$3,200 > 90% of purchase open-to-buy ($2,200) — the deliberate distinction (v2-reuse-map.md §6): R2 must be evaluated against the BT credit line, not Account.availableCredit', () => {
      const openToBuy = account.creditLimit - account.currentBalance;
      expect(cents(openToBuy)).toBe(220_000); // Marcus's frozen $2,200 (marcus.ts)
      expect(btEvent.transferAmount).toBeGreaterThan(0.9 * openToBuy);
    });
  });

  describe("R3 — Elena's promo notice", () => {
    const notice = db.promoNotices.find((n) => n.noticeId === 'notice-elena-1')!;
    const elenaBtEvents = db.balanceTransferEvents.filter(
      (e) => e.accountId === ELENA_ACCOUNT_ID,
    );

    it("60 days' notice ≥ the 45-day requirement, and matches Elena's BT fixtures' promoEndDate", () => {
      const noticeDays = Math.round(
        (Date.parse(notice.promoEndDate) - Date.parse(notice.sentDate)) /
          DAY_MS,
      );
      expect(noticeDays).toBe(60);
      expect(noticeDays).toBeGreaterThanOrEqual(45);
      expect(elenaBtEvents.length).toBeGreaterThan(0);
      for (const e of elenaBtEvents) {
        expect(e.promoEndDate).toBe(notice.promoEndDate);
      }
    });
  });

  describe('v1 guardrails hold with the additions', () => {
    it("streamEvents kinds are still exactly the 7 v1 kinds — Marcus's night event never leaks in", () => {
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
      expect(
        db.streamEvents.some((e) => e.eventId.startsWith('evt-night-')),
      ).toBe(false);
    });

    it('BTs expiring within 90 days are still exactly Elena, bg-002, bg-005', () => {
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

    it('db.accounts is still exactly 9', () => {
      expect(db.accounts).toHaveLength(9);
    });
  });

  it('buildSeedDb is deterministic for a fixed anchor, sentinel collections included', () => {
    const again = buildSeedDb(anchor);
    expect(again).toEqual(db);
  });
});

describe('sentinel anchor invariance', () => {
  it('sentinel amounts/ids are identical at both demo anchors; every sentinel date shifts by exactly 14 days', () => {
    const aug05 = buildSeedDb(new Date('2026-08-05T00:00:00.000Z'));
    const aug19 = buildSeedDb(new Date('2026-08-19T00:00:00.000Z'));

    const bt05 = aug05.balanceTransferEvents.find((e) => e.eventId === 'bt-marcus-1')!;
    const bt19 = aug19.balanceTransferEvents.find((e) => e.eventId === 'bt-marcus-1')!;
    expect(bt19.transferAmount).toBe(bt05.transferAmount);
    expect(bt19.btCreditLineAtInitiation).toBe(bt05.btCreditLineAtInitiation);
    expect(bt19.goToApr).toBe(bt05.goToApr);
    expect(Date.parse(bt19.timestamp) - Date.parse(bt05.timestamp)).toBe(
      14 * DAY_MS,
    );
    expect(
      Date.parse(`${bt19.promoEndDate}T00:00:00.000Z`) -
        Date.parse(`${bt05.promoEndDate}T00:00:00.000Z`),
    ).toBe(14 * DAY_MS);

    expect(aug19.promoNotices.map((n) => n.noticeId)).toEqual(
      aug05.promoNotices.map((n) => n.noticeId),
    );
    aug05.promoNotices.forEach((n, i) => {
      const n19 = aug19.promoNotices[i];
      expect(
        Date.parse(`${n19.sentDate}T00:00:00.000Z`) -
          Date.parse(`${n.sentDate}T00:00:00.000Z`),
      ).toBe(14 * DAY_MS);
      expect(
        Date.parse(`${n19.promoEndDate}T00:00:00.000Z`) -
          Date.parse(`${n.promoEndDate}T00:00:00.000Z`),
      ).toBe(14 * DAY_MS);
    });

    expect(
      aug19.sentinelReplayEvents.map((e) => [e.eventId, e.kind, e.accountId, e.summary]),
    ).toEqual(
      aug05.sentinelReplayEvents.map((e) => [e.eventId, e.kind, e.accountId, e.summary]),
    );
    aug05.sentinelReplayEvents.forEach((e, i) => {
      expect(
        Date.parse(aug19.sentinelReplayEvents[i].timestamp) - Date.parse(e.timestamp),
      ).toBe(14 * DAY_MS);
    });
  });
});

describe('policy fixtures', () => {
  it("every rule's excerpt.quote is a verbatim substring of the cited section's body", () => {
    for (const rule of policyRules) {
      const section = policyDocument.sections.find(
        (s) => s.id === rule.excerpt.sectionId,
      );
      expect(section).toBeDefined();
      expect(section!.body.includes(rule.excerpt.quote)).toBe(true);
    }
  });

  it('ruleIds are exactly R1, R2, R3 in order; R1 carries the criticNote', () => {
    expect(policyRules.map((r) => r.ruleId)).toEqual(['R1', 'R2', 'R3']);
    const r1 = policyRules.find((r) => r.ruleId === 'R1')!;
    expect(r1.criticNote).toBeTruthy();
    expect(policyRules.find((r) => r.ruleId === 'R2')!.criticNote).toBeUndefined();
    expect(policyRules.find((r) => r.ruleId === 'R3')!.criticNote).toBeUndefined();
  });
});
