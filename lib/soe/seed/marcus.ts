// Marcus Webb — Beat 2, the Payment Health story. Utilization climbs 42% → 78%
// over five months on a $10,000 limit; three consecutive minimum payments; an
// autopay failure causes his first miss 12 days before the anchor.
//
// Every cycle satisfies: closing = opening + purchases + interest + fees −
// payment, with interest = opening × 24.99%/12 rounded to cents. seed.test.ts
// recomputes all of it.

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

export const MARCUS_ACCOUNT_ID = 'acct-marcus';
export const MARCUS_PARTY_ID = 'party-marcus';
export const MARCUS_LIMIT_CENTS = 1_000_000; // $10,000
export const MARCUS_APR_BPS = 2499;

export interface LedgerRow {
  /** Day offset of the cycle close relative to the anchor. */
  closeOffset: number;
  openingCents: number;
  purchasesCents: number;
  interestCents: number;
  feesCents: number;
  paymentCents: number;
  closingCents: number;
}

// Month-end utilization: 42% → 48% → 56% → 63% → 71% → 78%.
export const MARCUS_LEDGER: LedgerRow[] = [
  { closeOffset: -150, openingCents: 390_000, purchasesCents: 66_878, interestCents: 8_122, feesCents: 0, paymentCents: 45_000, closingCents: 420_000 },
  { closeOffset: -120, openingCents: 420_000, purchasesCents: 81_253, interestCents: 8_747, feesCents: 0, paymentCents: 30_000, closingCents: 480_000 },
  { closeOffset: -90, openingCents: 480_000, purchasesCents: 79_604, interestCents: 9_996, feesCents: 0, paymentCents: 9_600, closingCents: 560_000 },
  { closeOffset: -60, openingCents: 560_000, purchasesCents: 69_538, interestCents: 11_662, feesCents: 0, paymentCents: 11_200, closingCents: 630_000 },
  { closeOffset: -30, openingCents: 630_000, purchasesCents: 79_480, interestCents: 13_120, feesCents: 0, paymentCents: 12_600, closingCents: 710_000 },
  { closeOffset: 0, openingCents: 710_000, purchasesCents: 51_214, interestCents: 14_786, feesCents: 4_000, paymentCents: 0, closingCents: 780_000 },
];

// Per-cycle purchases: fixed merchants/amounts summing exactly to the ledger's
// purchases column. Day offsets are relative to that cycle's close.
const PURCHASE_LAGS = [-25, -18, -12, -8, -3] as const;

const CYCLE_PURCHASES: Array<
  Array<{ merchant: string; category: Transaction['category']; cents: number }>
> = [
  [
    { merchant: 'Kroger', category: 'GROCERY', cents: 15_624 },
    { merchant: 'Shell', category: 'FUEL', cents: 4_890 },
    { merchant: 'Netflix', category: 'SUBSCRIPTION', cents: 1_549 },
    { merchant: 'Chipotle', category: 'DINING', cents: 4_215 },
    { merchant: 'Amazon', category: 'RETAIL', cents: 40_600 },
  ],
  [
    { merchant: 'Kroger', category: 'GROCERY', cents: 14_980 },
    { merchant: 'Shell', category: 'FUEL', cents: 5_122 },
    { merchant: 'Netflix', category: 'SUBSCRIPTION', cents: 1_549 },
    { merchant: 'DoorDash', category: 'DINING', cents: 6_340 },
    { merchant: 'Best Buy', category: 'RETAIL', cents: 53_262 },
  ],
  [
    { merchant: 'Kroger', category: 'GROCERY', cents: 16_135 },
    { merchant: 'Shell', category: 'FUEL', cents: 4_975 },
    { merchant: 'Netflix', category: 'SUBSCRIPTION', cents: 1_549 },
    { merchant: 'Chipotle', category: 'DINING', cents: 3_820 },
    { merchant: 'Home Depot', category: 'RETAIL', cents: 53_125 },
  ],
  [
    { merchant: 'Kroger', category: 'GROCERY', cents: 15_862 },
    { merchant: 'Shell', category: 'FUEL', cents: 5_330 },
    { merchant: 'Netflix', category: 'SUBSCRIPTION', cents: 1_549 },
    { merchant: 'DoorDash', category: 'DINING', cents: 7_197 },
    { merchant: 'Target', category: 'RETAIL', cents: 39_600 },
  ],
  [
    { merchant: 'Kroger', category: 'GROCERY', cents: 16_490 },
    { merchant: 'Shell', category: 'FUEL', cents: 5_085 },
    { merchant: 'Netflix', category: 'SUBSCRIPTION', cents: 1_549 },
    { merchant: 'Chipotle', category: 'DINING', cents: 4_566 },
    { merchant: 'Delta Air Lines', category: 'TRAVEL', cents: 51_790 },
  ],
  [
    { merchant: 'Kroger', category: 'GROCERY', cents: 13_852 },
    { merchant: 'Shell', category: 'FUEL', cents: 5_240 },
    { merchant: 'Netflix', category: 'SUBSCRIPTION', cents: 1_549 },
    { merchant: 'DoorDash', category: 'DINING', cents: 6_873 },
    { merchant: 'Amazon', category: 'RETAIL', cents: 23_700 },
  ],
];

export function buildMarcus(anchor: Date): {
  party: Party;
  account: Account;
  role: AccountPartyRole;
  transactions: Transaction[];
  payments: Payment[];
  streamEvents: StreamEvent[];
} {
  const party: Party = {
    partyId: MARCUS_PARTY_ID,
    fullName: 'Marcus Webb',
    dateOfBirth: '1987-06-02',
    email: 'marcus.webb@example.com',
  };

  const account: Account = {
    accountId: MARCUS_ACCOUNT_ID,
    productType: 'CREDIT_CARD',
    openedDate: dateOnly(anchor, -1460),
    creditLimit: MARCUS_LIMIT_CENTS / 100,
    currentBalance: 780_000 / 100,
    availableCredit: (MARCUS_LIMIT_CENTS - 780_000) / 100,
    purchaseApr: 24.99,
    status: 'ACTIVE',
  };

  const role: AccountPartyRole = {
    accountId: MARCUS_ACCOUNT_ID,
    partyId: MARCUS_PARTY_ID,
    role: 'PRIMARY',
    addedDate: account.openedDate,
  };

  const transactions: Transaction[] = [];
  let txnSeq = 1;
  MARCUS_LEDGER.forEach((row, cycleIndex) => {
    CYCLE_PURCHASES[cycleIndex].forEach((p, i) => {
      transactions.push({
        transactionId: `txn-marcus-${txnSeq++}`,
        accountId: MARCUS_ACCOUNT_ID,
        partyId: MARCUS_PARTY_ID,
        postedDate: dateOnly(anchor, row.closeOffset + PURCHASE_LAGS[i]),
        amount: p.cents / 100,
        merchantName: p.merchant,
        category: p.category,
        type: 'PURCHASE',
      });
    });
    transactions.push({
      transactionId: `txn-marcus-${txnSeq++}`,
      accountId: MARCUS_ACCOUNT_ID,
      partyId: MARCUS_PARTY_ID,
      postedDate: dateOnly(anchor, row.closeOffset),
      amount: row.interestCents / 100,
      merchantName: 'INTEREST CHARGE — PURCHASES',
      category: 'OTHER',
      type: 'INTEREST',
    });
  });
  // Late fee for the missed payment, posted 10 days before the anchor.
  transactions.push({
    transactionId: `txn-marcus-${txnSeq++}`,
    accountId: MARCUS_ACCOUNT_ID,
    partyId: MARCUS_PARTY_ID,
    postedDate: dateOnly(anchor, -10),
    amount: 40,
    merchantName: 'LATE FEE',
    category: 'OTHER',
    type: 'FEE',
  });

  // Each payment is due 18 days after the statement it pays (the prior cycle's
  // close) and posts within the following cycle's window. The last three
  // posted payments are exactly the minimum due; the payment due 12 days ago
  // was missed when autopay failed.
  const payments: Payment[] = MARCUS_LEDGER.map((row, i) => {
    const statementCents = row.openingCents;
    const dueOffset = row.closeOffset - 12; // prior close (closeOffset − 30) + 18
    const missed = row.closeOffset === 0;
    return {
      paymentId: `pay-marcus-${i + 1}`,
      accountId: MARCUS_ACCOUNT_ID,
      dueDate: dateOnly(anchor, dueOffset),
      postedDate: missed ? undefined : dateOnly(anchor, dueOffset),
      amountDue: statementCents / 100,
      minimumDue: minimumDueCents(statementCents) / 100,
      amountPaid: row.paymentCents / 100,
      status: missed ? 'MISSED' : 'POSTED',
      channel: 'AUTOPAY',
    };
  });

  const streamEvents: StreamEvent[] = [
    {
      eventId: 'evt-marcus-autopay-failed',
      accountId: MARCUS_ACCOUNT_ID,
      kind: 'autopay.failed',
      summary: 'Autopay declined for Marcus Webb — payment of $142.00 due today not covered',
      timestamp: d(anchor, -12, '06:00'),
    },
    {
      eventId: 'evt-marcus-payment-missed',
      accountId: MARCUS_ACCOUNT_ID,
      kind: 'payment.missed',
      summary: 'Payment missed on acct-marcus — minimum $142.00 was due',
      timestamp: d(anchor, -11, '00:05'),
    },
  ];

  return { party, account, role, transactions, payments, streamEvents };
}
