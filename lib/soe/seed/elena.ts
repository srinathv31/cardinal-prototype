// Elena Ruiz — Beat 3, the BT Lifecycle story. $8,400 transferred at 0% promo
// ~10 months ago; 10 payments of $330 leave exactly $5,100 with the promo
// cliff 45 days out at a 24.99% go-to APR. The card is deliberately BT-only
// (a parked card), so the account balance is exactly the BT remainder.
//
// Note (flagged at planning): the brief's "~$94/month" projection does not
// reconcile — $5,100 × 24.99%/12 = $106.21. P2 renders projectInterest()
// (declining balance at her current $330/month): month 1 $106.21, 12-month
// cumulative $944.51.

import { d, dateOnly } from './anchor';
import { minimumDueCents } from './finance';
import type {
  Account,
  AccountPartyRole,
  BalanceTransferEvent,
  Party,
  Payment,
  StreamEvent,
} from '../types';

export const ELENA_ACCOUNT_ID = 'acct-elena';
export const ELENA_PARTY_ID = 'party-elena';

export const ELENA_BT_CENTS = 840_000; // $8,400
export const ELENA_PAYMENT_CENTS = 33_000; // $330 × 10 = $3,300 paid
export const ELENA_REMAINING_CENTS = 510_000; // 8,400 − 3,300 = $5,100
export const ELENA_GO_TO_APR = 24.99;

export function buildElena(anchor: Date): {
  party: Party;
  account: Account;
  role: AccountPartyRole;
  payments: Payment[];
  btEvents: BalanceTransferEvent[];
  streamEvents: StreamEvent[];
} {
  const party: Party = {
    partyId: ELENA_PARTY_ID,
    fullName: 'Elena Ruiz',
    dateOfBirth: '1991-11-19',
    email: 'elena.ruiz@example.com',
  };

  const account: Account = {
    accountId: ELENA_ACCOUNT_ID,
    productType: 'CREDIT_CARD',
    openedDate: dateOnly(anchor, -330),
    creditLimit: 12_000,
    currentBalance: ELENA_REMAINING_CENTS / 100,
    availableCredit: (1_200_000 - ELENA_REMAINING_CENTS) / 100,
    purchaseApr: ELENA_GO_TO_APR,
    status: 'ACTIVE',
  };

  const role: AccountPartyRole = {
    accountId: ELENA_ACCOUNT_ID,
    partyId: ELENA_PARTY_ID,
    role: 'PRIMARY',
    addedDate: account.openedDate,
  };

  // 10 on-time $330 payments on a 30-day cadence, most recent 10 days ago.
  // amountDue is the declining BT balance before each payment.
  const payments: Payment[] = Array.from({ length: 10 }, (_, i) => {
    const offset = -280 + i * 30; // −280, −250, … −10
    const balanceBeforeCents = ELENA_BT_CENTS - ELENA_PAYMENT_CENTS * i;
    return {
      paymentId: `pay-elena-${i + 1}`,
      accountId: ELENA_ACCOUNT_ID,
      dueDate: dateOnly(anchor, offset),
      postedDate: dateOnly(anchor, offset),
      amountDue: balanceBeforeCents / 100,
      minimumDue: minimumDueCents(balanceBeforeCents) / 100,
      amountPaid: ELENA_PAYMENT_CENTS / 100,
      status: 'POSTED',
      channel: 'ONLINE',
    };
  });

  // Promo term is 360 days from initiation: d(−315) + 360 = d(+45).
  const promoEndDate = dateOnly(anchor, 45);
  const btShared = {
    accountId: ELENA_ACCOUNT_ID,
    transferAmount: ELENA_BT_CENTS / 100,
    promoApr: 0,
    promoEndDate,
    goToApr: ELENA_GO_TO_APR,
  };
  const btEvents: BalanceTransferEvent[] = [
    {
      eventId: 'bt-elena-1',
      type: 'BT_INITIATED',
      remainingBalance: ELENA_BT_CENTS / 100,
      timestamp: d(anchor, -315, '10:15'),
      ...btShared,
    },
    {
      eventId: 'bt-elena-2',
      type: 'BT_COMPLETED',
      remainingBalance: ELENA_BT_CENTS / 100,
      timestamp: d(anchor, -308, '15:40'),
      ...btShared,
    },
    {
      eventId: 'bt-elena-3',
      type: 'PROMO_EXPIRING',
      remainingBalance: ELENA_REMAINING_CENTS / 100,
      timestamp: d(anchor, 0, '08:30'),
      ...btShared,
    },
  ];

  const streamEvents: StreamEvent[] = [
    {
      eventId: 'evt-elena-promo-expiring',
      accountId: ELENA_ACCOUNT_ID,
      kind: 'bt.promo_expiring',
      summary: 'Balance transfer promo for Elena Ruiz ends in 45 days — $5,100.00 remaining at 0%',
      timestamp: d(anchor, 0, '08:30'),
    },
    {
      eventId: 'evt-elena-payment-posted',
      accountId: ELENA_ACCOUNT_ID,
      kind: 'payment.posted',
      summary: 'Payment of $330.00 posted on acct-elena',
      timestamp: d(anchor, -10, '14:20'),
    },
  ];

  return { party, account, role, payments, btEvents, streamEvents };
}
