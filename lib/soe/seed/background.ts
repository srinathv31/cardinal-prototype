// Background accounts — portfolio depth for Beat 5 queries. Six accounts with
// varied categories and balances. BT facts are constant literals engineered so
// "BTs expiring within 90 days" returns exactly Elena + bg-002 + bg-005
// (bg-003 at +160d and bg-006 at +353d are deliberate non-matches).
//
// Determinism: one mulberry32 instance, accounts generated in id order, draws
// in fixed field order (limit → balance → opened → apr → transactions). A
// golden-checksum test freezes the output. availableCredit is always computed
// as limit − balance, never drawn.

import { d, dateOnly } from './anchor';
import { createRng, PRNG_SEED } from './prng';
import type {
  Account,
  AccountPartyRole,
  BalanceTransferEvent,
  Party,
  StreamEvent,
  Transaction,
} from '../types';

interface BackgroundConfig {
  accountId: string;
  partyId: string;
  fullName: string;
  dateOfBirth: string;
  /** When absent, limit/balance/opened/apr are PRNG-drawn. */
  constants?: {
    limitCents: number;
    balanceCents: number;
    openedOffset: number;
    purchaseApr: number;
  };
  bt?: {
    transferCents: number;
    completedOffset: number;
    promoEndOffset: number;
    goToApr: number;
    remainingCents: number;
    /** Emit a PROMO_EXPIRING event at this offset (45-day threshold crossed). */
    expiringEventOffset?: number;
  };
}

const CONFIGS: BackgroundConfig[] = [
  {
    accountId: 'bg-001',
    partyId: 'party-bg-001',
    fullName: 'Jordan Kim',
    dateOfBirth: '1985-04-11',
  },
  {
    accountId: 'bg-002',
    partyId: 'party-bg-002',
    fullName: 'Alicia Thompson',
    dateOfBirth: '1979-12-03',
    constants: { limitCents: 800_000, balanceCents: 215_000, openedOffset: -520, purchaseApr: 24.99 },
    bt: {
      transferCents: 300_000,
      completedOffset: -330,
      promoEndOffset: 30,
      goToApr: 22.99,
      remainingCents: 175_000,
      expiringEventOffset: -15,
    },
  },
  {
    accountId: 'bg-003',
    partyId: 'party-bg-003',
    fullName: 'Robert Chen',
    dateOfBirth: '1968-07-30',
    constants: { limitCents: 1_000_000, balanceCents: 340_000, openedOffset: -710, purchaseApr: 23.24 },
    bt: {
      transferCents: 400_000,
      completedOffset: -200,
      promoEndOffset: 160,
      goToApr: 24.99,
      remainingCents: 290_000,
    },
  },
  {
    accountId: 'bg-004',
    partyId: 'party-bg-004',
    fullName: 'Luis Ortega',
    dateOfBirth: '1993-01-22',
  },
  {
    accountId: 'bg-005',
    partyId: 'party-bg-005',
    fullName: 'Fatima Al-Sayed',
    dateOfBirth: '1982-08-15',
    constants: { limitCents: 1_500_000, balanceCents: 490_000, openedOffset: -880, purchaseApr: 26.99 },
    bt: {
      transferCents: 600_000,
      completedOffset: -270,
      promoEndOffset: 75,
      goToApr: 26.99,
      remainingCents: 440_000,
    },
  },
  {
    accountId: 'bg-006',
    partyId: 'party-bg-006',
    fullName: 'Grace Nakamura',
    dateOfBirth: '1990-05-27',
    constants: { limitCents: 600_000, balanceCents: 265_000, openedOffset: -400, purchaseApr: 24.99 },
    bt: {
      transferCents: 250_000,
      completedOffset: 0, // completes on day 0 — feeds the ticker
      promoEndOffset: 353, // initiated at −7 + 360-day term
      goToApr: 24.99,
      remainingCents: 250_000,
    },
  },
];

const CATEGORY_POOL = [
  'GROCERY', 'GROCERY', 'GROCERY',
  'DINING', 'DINING', 'DINING',
  'RETAIL', 'RETAIL',
  'FUEL', 'FUEL',
  'SUBSCRIPTION', 'UTILITIES', 'TRAVEL', 'OTHER',
] as const;

const MERCHANTS: Record<Transaction['category'], string[]> = {
  GROCERY: ['Kroger', 'H-E-B', 'Safeway', 'Whole Foods'],
  DINING: ['Chipotle', 'DoorDash', 'Olive Garden', 'Starbucks'],
  RETAIL: ['Amazon', 'Target', 'Best Buy', 'Costco'],
  FUEL: ['Shell', 'Chevron', 'Exxon'],
  SUBSCRIPTION: ['Netflix', 'Spotify', 'Hulu'],
  UTILITIES: ['City Utilities', 'AT&T Wireless', 'Verizon'],
  TRAVEL: ['Delta Air Lines', 'Marriott', 'United Airlines'],
  OTHER: ['USPS', 'CVS Pharmacy'],
};

const AMOUNT_RANGES: Record<Transaction['category'], [number, number]> = {
  GROCERY: [25, 180],
  DINING: [9, 95],
  RETAIL: [15, 400],
  FUEL: [30, 90],
  SUBSCRIPTION: [8, 30],
  UTILITIES: [60, 220],
  TRAVEL: [120, 800],
  OTHER: [5, 150],
};

export function buildBackground(anchor: Date): {
  parties: Party[];
  accounts: Account[];
  roles: AccountPartyRole[];
  transactions: Transaction[];
  btEvents: BalanceTransferEvent[];
  streamEvents: StreamEvent[];
} {
  const rng = createRng(PRNG_SEED);
  const parties: Party[] = [];
  const accounts: Account[] = [];
  const roles: AccountPartyRole[] = [];
  const transactions: Transaction[] = [];
  const btEvents: BalanceTransferEvent[] = [];

  for (const cfg of CONFIGS) {
    let limitCents: number;
    let balanceCents: number;
    let openedOffset: number;
    let purchaseApr: number;
    if (cfg.constants) {
      ({ limitCents, balanceCents, openedOffset, purchaseApr } = cfg.constants);
    } else {
      limitCents = rng.pick([500_000, 750_000, 1_000_000, 1_500_000, 2_000_000]);
      balanceCents = Math.round(limitCents * (0.08 + rng.next() * 0.54));
      openedOffset = -rng.int(400, 2600);
      purchaseApr = rng.pick([21.99, 23.24, 24.99, 26.99, 29.99]);
    }

    const [first, last] = cfg.fullName.toLowerCase().split(' ');
    parties.push({
      partyId: cfg.partyId,
      fullName: cfg.fullName,
      dateOfBirth: cfg.dateOfBirth,
      email: `${first}.${last.replace(/[^a-z]/g, '')}@example.com`,
    });
    accounts.push({
      accountId: cfg.accountId,
      productType: 'CREDIT_CARD',
      openedDate: dateOnly(anchor, openedOffset),
      creditLimit: limitCents / 100,
      currentBalance: balanceCents / 100,
      availableCredit: (limitCents - balanceCents) / 100,
      purchaseApr,
      status: 'ACTIVE',
    });
    roles.push({
      accountId: cfg.accountId,
      partyId: cfg.partyId,
      role: 'PRIMARY',
      addedDate: dateOnly(anchor, openedOffset),
    });

    // 90 days of portfolio noise for Beat 5's category queries.
    const txnCount = rng.int(24, 45);
    for (let i = 0; i < txnCount; i++) {
      const category = rng.pick(CATEGORY_POOL);
      const [min, max] = AMOUNT_RANGES[category];
      transactions.push({
        transactionId: `txn-${cfg.accountId}-${i + 1}`,
        accountId: cfg.accountId,
        partyId: cfg.partyId,
        postedDate: dateOnly(anchor, -rng.int(0, 89)),
        amount: rng.cents(min, max) / 100,
        merchantName: rng.pick(MERCHANTS[category]),
        category,
        type: 'PURCHASE',
      });
    }

    if (cfg.bt) {
      const shared = {
        accountId: cfg.accountId,
        transferAmount: cfg.bt.transferCents / 100,
        promoApr: 0,
        promoEndDate: dateOnly(anchor, cfg.bt.promoEndOffset),
        goToApr: cfg.bt.goToApr,
      };
      btEvents.push({
        eventId: `bt-${cfg.accountId}-completed`,
        type: 'BT_COMPLETED',
        remainingBalance: cfg.bt.transferCents / 100,
        timestamp: d(anchor, cfg.bt.completedOffset, '07:45'),
        ...shared,
      });
      if (cfg.bt.expiringEventOffset !== undefined) {
        btEvents.push({
          eventId: `bt-${cfg.accountId}-expiring`,
          type: 'PROMO_EXPIRING',
          remainingBalance: cfg.bt.remainingCents / 100,
          timestamp: d(anchor, cfg.bt.expiringEventOffset, '08:30'),
          ...shared,
        });
      }
    }
  }

  const streamEvents: StreamEvent[] = [
    {
      eventId: 'evt-bg-001-payment',
      accountId: 'bg-001',
      kind: 'payment.posted',
      summary: 'Payment posted on bg-001',
      timestamp: d(anchor, 0, '09:03'),
    },
    {
      eventId: 'evt-bg-004-txn',
      accountId: 'bg-004',
      kind: 'transaction.posted',
      summary: 'Purchase posted on bg-004',
      timestamp: d(anchor, 0, '08:47'),
    },
    {
      eventId: 'evt-bg-002-payment',
      accountId: 'bg-002',
      kind: 'payment.posted',
      summary: 'Payment posted on bg-002',
      timestamp: d(anchor, 0, '08:12'),
    },
    {
      eventId: 'evt-bg-006-bt',
      accountId: 'bg-006',
      kind: 'balance_transfer.completed',
      summary: 'Balance transfer of $2,500.00 completed on bg-006',
      timestamp: d(anchor, 0, '07:45'),
    },
    {
      eventId: 'evt-bg-003-statement',
      accountId: 'bg-003',
      kind: 'statement.generated',
      summary: 'Statement generated for bg-003',
      timestamp: d(anchor, -1, '10:05'),
    },
    {
      eventId: 'evt-bg-002-expiring',
      accountId: 'bg-002',
      kind: 'bt.promo_expiring',
      summary: 'Balance transfer promo on bg-002 ends in 45 days',
      timestamp: d(anchor, -15, '08:30'),
    },
  ];

  return { parties, accounts, roles, transactions, btEvents, streamEvents };
}
