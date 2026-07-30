// The Patel household — Beat 4, the AU Growth story. One card, three parties:
// Anand (primary), Priya (AU), Dev (AU, age 22). Dev's attributed spend ramps
// $80/mo → $650/mo across 12 statement months, with recurring subscriptions
// and utilities marking growing financial independence. The account is a
// transactor: every statement is paid in full, so no interest ever accrues.
//
// Monthly per-party totals are literals; individual transactions are derived
// from them by fixed percentage splits (pure arithmetic, no randomness), so
// per-month sums reconcile exactly. seed.test.ts asserts every one.

import { d, dateOnly } from './anchor';
import { minimumDueCents } from './finance';
import type {
  Account,
  AccountPartyRole,
  Party,
  Payment,
  StreamEvent,
  Transaction,
} from '../types';

export const PATEL_ACCOUNT_ID = 'acct-patel';
export const ANAND_PARTY_ID = 'party-anand';
export const PRIYA_PARTY_ID = 'party-priya';
export const DEV_PARTY_ID = 'party-dev';

// Statement months M−11 (oldest) … M0 (most recent), closing at
// offset −2 − 30 × k. The M0 statement closing 2 days ago is Beat 4's trigger.
export const PATEL_STATEMENT_CLOSES: number[] = Array.from(
  { length: 12 },
  (_, i) => -2 - 30 * (11 - i),
);

// Dev's ramp: $80 → $650 with acceleration around the apartment move (M−5).
export const DEV_MONTHLY_CENTS = [
  8_000, 9_500, 11_200, 14_100, 16_800, 21_400, 29_600, 34_200, 43_100, 49_700, 56_800, 65_000,
];

// Anand and Priya hold a stable band — the contrast that makes Dev's ramp read.
export const ANAND_MONTHLY_CENTS = [
  211_240, 218_715, 209_562, 224_018, 215_877, 213_109, 220_455, 211_986, 217_630, 214_263, 218_894, 215_051,
];
export const PRIYA_MONTHLY_CENTS = [
  86_122, 84_275, 91_840, 87_413, 90_266, 83_548, 89_027, 92_351, 85_819, 88_105, 84_692, 91_233,
];

// Dev's recurring merchants: fixed amount, active from a start month onward.
export const DEV_RECURRING = [
  { merchant: 'Spotify', category: 'SUBSCRIPTION', cents: 1_199, fromMonth: 0, lag: -27 },
  { merchant: 'Netflix', category: 'SUBSCRIPTION', cents: 1_549, fromMonth: 3, lag: -24 },
  { merchant: 'Planet Fitness', category: 'SUBSCRIPTION', cents: 2_499, fromMonth: 5, lag: -20 },
  { merchant: 'City of Austin Utilities', category: 'UTILITIES', cents: 8_500, fromMonth: 6, lag: -15 },
  { merchant: 'AT&T Wireless', category: 'UTILITIES', cents: 7_000, fromMonth: 8, lag: -10 },
] as const;

export function devRecurringCentsForMonth(month: number): number {
  return DEV_RECURRING.filter((r) => month >= r.fromMonth).reduce(
    (sum, r) => sum + r.cents,
    0,
  );
}

export function buildPatel(anchor: Date): {
  parties: Party[];
  account: Account;
  roles: AccountPartyRole[];
  transactions: Transaction[];
  payments: Payment[];
  streamEvents: StreamEvent[];
} {
  const openedDate = dateOnly(anchor, -2920);
  const parties: Party[] = [
    {
      partyId: ANAND_PARTY_ID,
      fullName: 'Anand Patel',
      dateOfBirth: '1974-02-27',
      email: 'anand.patel@example.com',
      // Anand is the servicing chatbot's pinned cardholder (brief §7a,
      // lib/agents/servicing/identity.ts) — the only party whose contact
      // fields the demo actually exercises through `updatePartyContact`.
      // Priya/Dev carry seed values too, for the same reason v1's other
      // named personas do below: the field reads as real data, not a
      // one-off hack for a single row.
      phone: '(512) 555-0142',
      mailingAddress: '4118 Barton Skyway, Austin, TX 78746',
    },
    {
      partyId: PRIYA_PARTY_ID,
      fullName: 'Priya Patel',
      dateOfBirth: '1976-09-08',
      email: 'priya.patel@example.com',
      phone: '(512) 555-0187',
      mailingAddress: '4118 Barton Skyway, Austin, TX 78746',
    },
    {
      partyId: DEV_PARTY_ID,
      // Anchor-relative so Dev is 22 on both demo dates (22 years + ~4.5 months).
      dateOfBirth: dateOnly(anchor, -8170),
      fullName: 'Dev Patel',
      email: 'dev.patel@example.com',
      phone: '(512) 555-0163',
      mailingAddress: '4118 Barton Skyway, Austin, TX 78746',
    },
  ];

  const roles: AccountPartyRole[] = [
    { accountId: PATEL_ACCOUNT_ID, partyId: ANAND_PARTY_ID, role: 'PRIMARY', addedDate: openedDate },
    { accountId: PATEL_ACCOUNT_ID, partyId: PRIYA_PARTY_ID, role: 'AUTHORIZED_USER', addedDate: dateOnly(anchor, -2600) },
    { accountId: PATEL_ACCOUNT_ID, partyId: DEV_PARTY_ID, role: 'AUTHORIZED_USER', addedDate: dateOnly(anchor, -1460) },
  ];

  const transactions: Transaction[] = [];
  let txnSeq = 1;
  const push = (
    partyId: string,
    offset: number,
    cents: number,
    merchantName: string,
    category: Transaction['category'],
  ) => {
    if (cents <= 0) return;
    transactions.push({
      transactionId: `txn-patel-${txnSeq++}`,
      accountId: PATEL_ACCOUNT_ID,
      partyId,
      postedDate: dateOnly(anchor, offset),
      amount: cents / 100,
      merchantName,
      category,
      type: 'PURCHASE',
    });
  };

  PATEL_STATEMENT_CLOSES.forEach((close, month) => {
    // — Dev: recurring first, then variable split grocery/dining/fuel.
    for (const r of DEV_RECURRING) {
      if (month >= r.fromMonth) {
        push(DEV_PARTY_ID, close + r.lag, r.cents, r.merchant, r.category);
      }
    }
    const devVariable = DEV_MONTHLY_CENTS[month] - devRecurringCentsForMonth(month);
    const devGrocery = Math.round(devVariable * 0.4);
    const devDining = Math.round(devVariable * 0.35);
    const devFuel = devVariable - devGrocery - devDining;
    const devGrocery1 = Math.round(devGrocery * 0.55);
    push(DEV_PARTY_ID, close - 22, devGrocery1, 'H-E-B', 'GROCERY');
    push(DEV_PARTY_ID, close - 9, devGrocery - devGrocery1, 'Central Market', 'GROCERY');
    const devDining1 = Math.round(devDining * 0.4);
    push(DEV_PARTY_ID, close - 17, devDining1, 'Chipotle', 'DINING');
    push(DEV_PARTY_ID, close - 6, devDining - devDining1, 'DoorDash', 'DINING');
    push(DEV_PARTY_ID, close - 12, devFuel, 'Shell', 'FUEL');

    // — Anand: fixed utilities + percentage splits of the remainder.
    const anandTotal = ANAND_MONTHLY_CENTS[month];
    const anandUtilities = 24_500;
    const anandRem = anandTotal - anandUtilities;
    const anandRetail = Math.round(anandRem * 0.35);
    const anandTravel = Math.round(anandRem * 0.25);
    const anandDining = Math.round(anandRem * 0.15);
    const anandGrocery = anandRem - anandRetail - anandTravel - anandDining;
    push(ANAND_PARTY_ID, close - 16, anandUtilities, 'Austin Energy', 'UTILITIES');
    push(ANAND_PARTY_ID, close - 19, anandRetail, 'Costco', 'RETAIL');
    push(ANAND_PARTY_ID, close - 13, anandTravel, 'United Airlines', 'TRAVEL');
    push(ANAND_PARTY_ID, close - 7, anandDining, 'Uchi', 'DINING');
    push(ANAND_PARTY_ID, close - 4, anandGrocery, 'H-E-B', 'GROCERY');

    // — Priya: percentage splits.
    const priyaTotal = PRIYA_MONTHLY_CENTS[month];
    const priyaGrocery = Math.round(priyaTotal * 0.45);
    const priyaDining = Math.round(priyaTotal * 0.3);
    const priyaFuel = Math.round(priyaTotal * 0.15);
    const priyaRetail = priyaTotal - priyaGrocery - priyaDining - priyaFuel;
    push(PRIYA_PARTY_ID, close - 21, priyaGrocery, 'Whole Foods', 'GROCERY');
    push(PRIYA_PARTY_ID, close - 14, priyaDining, 'Starbucks', 'DINING');
    push(PRIYA_PARTY_ID, close - 11, priyaFuel, 'Chevron', 'FUEL');
    push(PRIYA_PARTY_ID, close - 5, priyaRetail, 'Target', 'RETAIL');
  });

  // Post-statement spend — the current balance: $121.87 + $27.85 + $34.90 = $184.62.
  push(ANAND_PARTY_ID, -1, 12_187, 'H-E-B', 'GROCERY');
  push(PRIYA_PARTY_ID, -1, 2_785, 'Starbucks', 'DINING');
  push(DEV_PARTY_ID, 0, 3_490, 'DoorDash', 'DINING');
  const currentBalanceCents = 12_187 + 2_785 + 3_490;

  const account: Account = {
    accountId: PATEL_ACCOUNT_ID,
    productType: 'CREDIT_CARD',
    openedDate,
    creditLimit: 25_000,
    currentBalance: currentBalanceCents / 100,
    availableCredit: (2_500_000 - currentBalanceCents) / 100,
    purchaseApr: 21.99,
    status: 'ACTIVE',
  };

  // Transactor: each statement paid in full 21 days after close. The M0
  // statement (closed 2 days ago) is scheduled, not yet posted.
  const payments: Payment[] = PATEL_STATEMENT_CLOSES.map((close, month) => {
    const statementCents =
      ANAND_MONTHLY_CENTS[month] + PRIYA_MONTHLY_CENTS[month] + DEV_MONTHLY_CENTS[month];
    const dueOffset = close + 21;
    const scheduled = dueOffset > 0;
    return {
      paymentId: `pay-patel-${month + 1}`,
      accountId: PATEL_ACCOUNT_ID,
      dueDate: dateOnly(anchor, dueOffset),
      postedDate: scheduled ? undefined : dateOnly(anchor, dueOffset),
      amountDue: statementCents / 100,
      minimumDue: minimumDueCents(statementCents) / 100,
      amountPaid: scheduled ? 0 : statementCents / 100,
      status: scheduled ? 'SCHEDULED' : 'POSTED',
      channel: 'AUTOPAY',
    };
  });

  const streamEvents: StreamEvent[] = [
    {
      eventId: 'evt-patel-statement',
      accountId: PATEL_ACCOUNT_ID,
      kind: 'statement.generated',
      summary: 'Statement generated for the Patel account — $3,712.84 across 3 cardholders',
      timestamp: d(anchor, -2, '09:00'),
    },
    {
      eventId: 'evt-patel-txn',
      accountId: PATEL_ACCOUNT_ID,
      kind: 'transaction.posted',
      summary: 'DoorDash $34.90 posted — Dev Patel (authorized user)',
      timestamp: d(anchor, 0, '09:14'),
    },
  ];

  return { parties, account, roles, transactions, payments, streamEvents };
}
