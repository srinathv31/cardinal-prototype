// Sentinel seed additions (CARDINAL_V2_SENTINEL_BRIEF.md §5) — the "night"
// the demo replays, plus the two rule-relevant fixtures layered onto the
// existing cast. This module only adds events *about* Marcus and Elena; it
// never touches either persona's frozen ledger (v2-reuse-map.md §5
// guardrail — Marcus's $10,000/$7,800/$2,200 figures and Elena's BT
// remainder are untouched here).
//
// Marcus's violating BT (bt-marcus-1, 02:47, day 0):
//   R1 — initiated 12 days after his existing missed payment (due
//   dateOnly(anchor, -12), see marcus.ts), well inside the 60-day look-back
//   → VIOLATION.
//   R2 — $3,200 against a $4,000 balance-transfer credit line, a figure the
//   BT platform tracks separately from purchase open-to-buy (reuse-map §6):
//   $3,200 ≤ 90% × $4,000 = $3,600 → PASSES cleanly. (His frozen purchase
//   open-to-buy is only $2,200 — deliberately too small to clear the same
//   90% bar, which is why R2 must be defined against the dedicated BT line,
//   not `Account.availableCredit`.) This keeps the Act III catch legibly
//   R1-only: one rule fails, one rule visibly passes.
//   promoEndDate is +348 days (02:47 initiation + a 360-day promo term) —
//   deliberately outside every ≤90-day expiring window so Marcus never
//   shows up in the "BTs expiring ≤ 90 days" KPI (seed.test.ts pins that set
//   to exactly Elena + bg-002 + bg-005; reuse-map §5).
//
// Elena's promo notice (notice-elena-1): sent day −15, 60 days ahead of her
// existing promo end date (day +45, elena.ts) — 15 days of margin over R3's
// 45-day floor.
//
// The replay log (sentinelReplayEvents): exactly 14 StreamEvents for "the
// night" (day 0, 00:00–06:00 UTC), driving both Act I (nothing reacts) and
// Act III (the 02:47 entry trips R1 once the rule is live). The Marcus
// entry is styled identically to every other entry in this list — no
// violation flag lives on the event itself; that judgment belongs entirely
// to the rule engine built in Act II. Fixed literals only, no PRNG draws
// (background.ts's golden checksum stays untouched — brief §8, no
// Math.random anywhere in the scenario path).

import { d, dateOnly } from './anchor';
import { ELENA_ACCOUNT_ID } from './elena';
import { MARCUS_ACCOUNT_ID } from './marcus';
import { PATEL_ACCOUNT_ID } from './patel';
import type { BalanceTransferEvent, PromoNoticeRecord, StreamEvent } from '../types';

/** Marcus's violating BT — see header for the R1/R2 arithmetic. */
export function buildSentinelMarcusBt(anchor: Date): BalanceTransferEvent {
  return {
    eventId: 'bt-marcus-1',
    accountId: MARCUS_ACCOUNT_ID,
    type: 'BT_INITIATED',
    transferAmount: 3_200,
    promoApr: 0,
    promoEndDate: dateOnly(anchor, 348),
    goToApr: 24.99,
    remainingBalance: 3_200,
    timestamp: d(anchor, 0, '02:47'),
    btCreditLineAtInitiation: 4_000,
  };
}

/** Elena's promo notice — 60 days' notice against R3's 45-day requirement. */
export function buildSentinelElenaNotice(anchor: Date): PromoNoticeRecord {
  return {
    noticeId: 'notice-elena-1',
    accountId: ELENA_ACCOUNT_ID,
    sentDate: dateOnly(anchor, -15),
    promoEndDate: dateOnly(anchor, 45),
    channel: 'EMAIL',
  };
}

/**
 * The 14-event replay log for "the night" (day 0, 00:00–06:00 UTC). Mixes
 * existing personas and background accounts; exactly one
 * `balance_transfer.initiated` (Marcus, 02:47) and one `bt.promo_expiring`
 * (Elena, ~03:10, same underlying fact as her existing
 * `evt-elena-promo-expiring` stream entry). Strictly ascending timestamps.
 */
export function buildSentinelReplayLog(anchor: Date): StreamEvent[] {
  return [
    {
      eventId: 'evt-night-1',
      accountId: 'bg-001',
      kind: 'payment.posted',
      summary: 'Payment posted on bg-001',
      timestamp: d(anchor, 0, '00:05'),
    },
    {
      eventId: 'evt-night-2',
      accountId: 'bg-004',
      kind: 'transaction.posted',
      summary: 'Purchase posted on bg-004',
      timestamp: d(anchor, 0, '00:31'),
    },
    {
      eventId: 'evt-night-3',
      accountId: 'bg-005',
      kind: 'payment.posted',
      summary: 'Payment posted on bg-005',
      timestamp: d(anchor, 0, '00:58'),
    },
    {
      eventId: 'evt-night-4',
      accountId: 'bg-003',
      kind: 'statement.generated',
      summary: 'Statement generated for bg-003',
      timestamp: d(anchor, 0, '01:16'),
    },
    {
      eventId: 'evt-night-5',
      accountId: PATEL_ACCOUNT_ID,
      kind: 'transaction.posted',
      summary: 'Purchase posted on acct-patel',
      timestamp: d(anchor, 0, '01:39'),
    },
    {
      eventId: 'evt-night-6',
      accountId: 'bg-002',
      kind: 'payment.posted',
      summary: 'Payment posted on bg-002',
      timestamp: d(anchor, 0, '01:58'),
    },
    {
      eventId: 'evt-night-7',
      accountId: 'bg-006',
      kind: 'transaction.posted',
      summary: 'Purchase posted on bg-006',
      timestamp: d(anchor, 0, '02:14'),
    },
    {
      eventId: 'evt-night-8',
      accountId: PATEL_ACCOUNT_ID,
      kind: 'payment.posted',
      summary: 'Payment posted on acct-patel',
      timestamp: d(anchor, 0, '02:29'),
    },
    {
      eventId: 'evt-night-9',
      accountId: MARCUS_ACCOUNT_ID,
      kind: 'balance_transfer.initiated',
      summary: 'Balance transfer of $3,200.00 initiated on acct-marcus',
      timestamp: d(anchor, 0, '02:47'),
    },
    {
      eventId: 'evt-night-10',
      accountId: ELENA_ACCOUNT_ID,
      kind: 'bt.promo_expiring',
      summary: 'Balance transfer promo for Elena Ruiz ends in 45 days — $5,100.00 remaining at 0%',
      timestamp: d(anchor, 0, '03:10'),
    },
    {
      eventId: 'evt-night-11',
      accountId: 'bg-001',
      kind: 'transaction.posted',
      summary: 'Purchase posted on bg-001',
      timestamp: d(anchor, 0, '03:36'),
    },
    {
      eventId: 'evt-night-12',
      accountId: 'bg-004',
      kind: 'payment.posted',
      summary: 'Payment posted on bg-004',
      timestamp: d(anchor, 0, '04:02'),
    },
    {
      eventId: 'evt-night-13',
      accountId: 'bg-006',
      kind: 'statement.generated',
      summary: 'Statement generated for bg-006',
      timestamp: d(anchor, 0, '04:35'),
    },
    {
      eventId: 'evt-night-14',
      accountId: 'bg-003',
      kind: 'transaction.posted',
      summary: 'Purchase posted on bg-003',
      timestamp: d(anchor, 0, '05:07'),
    },
  ];
}

/** Composition root for this module — mirrors buildMarcus/buildElena's shape. */
export function buildSentinel(anchor: Date): {
  btEvent: BalanceTransferEvent;
  promoNotices: PromoNoticeRecord[];
  replayEvents: StreamEvent[];
} {
  return {
    btEvent: buildSentinelMarcusBt(anchor),
    promoNotices: [buildSentinelElenaNotice(anchor)],
    replayEvents: buildSentinelReplayLog(anchor),
  };
}
