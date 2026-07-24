// Mock SOE contracts — verbatim from CARDINAL_BRIEF.md §6.
// Field names are plausible placeholders; reconcile with the SOE team's actual
// shapes by adjusting the adapter, not the tools that consume it.

export interface Party {
  partyId: string;
  fullName: string;
  dateOfBirth: string; // ISO date
  email: string;
}

export interface Account {
  accountId: string;
  productType: 'CREDIT_CARD';
  openedDate: string;
  creditLimit: number;
  currentBalance: number;
  availableCredit: number;
  purchaseApr: number; // e.g. 24.99
  status: 'ACTIVE' | 'CLOSED' | 'SUSPENDED';
}

export interface AccountPartyRole {
  accountId: string;
  partyId: string;
  role: 'PRIMARY' | 'AUTHORIZED_USER';
  addedDate: string;
}

export interface Transaction {
  transactionId: string;
  accountId: string;
  partyId?: string; // spender attribution — required for AU Growth
  postedDate: string;
  amount: number; // positive = charge, negative = credit
  merchantName: string;
  category: 'GROCERY' | 'DINING' | 'TRAVEL' | 'SUBSCRIPTION' | 'UTILITIES' | 'RETAIL' | 'FUEL' | 'OTHER';
  type: 'PURCHASE' | 'CREDIT' | 'FEE' | 'INTEREST';
}

export interface Payment {
  paymentId: string;
  accountId: string;
  dueDate: string;
  postedDate?: string;
  amountDue: number;
  minimumDue: number;
  amountPaid: number;
  status: 'SCHEDULED' | 'POSTED' | 'LATE' | 'MISSED';
  channel: 'AUTOPAY' | 'ONLINE' | 'PHONE' | 'MAIL';
}

export interface BalanceTransferEvent {
  eventId: string;
  accountId: string;
  type: 'BT_INITIATED' | 'BT_COMPLETED' | 'PROMO_EXPIRING' | 'PROMO_EXPIRED';
  transferAmount: number;
  promoApr: number;
  promoEndDate: string;
  goToApr: number;
  remainingBalance?: number;
  timestamp: string;
  /**
   * v2 "Sentinel" addition (brief §5, reuse-map §6): the BT platform's own
   * dedicated credit line at the moment this transfer was initiated —
   * distinct from the account's purchase open-to-buy (`Account.availableCredit`).
   * Optional because only Sentinel's BT_INITIATED fixtures carry it; v1
   * consumers that never read this field are unaffected.
   */
  btCreditLineAtInitiation?: number;
}

export interface StreamEvent {
  // the dashboard ticker
  eventId: string;
  accountId: string;
  kind: 'payment.posted' | 'payment.missed' | 'autopay.failed'
      | 'statement.generated' | 'balance_transfer.completed'
      | 'bt.promo_expiring' | 'transaction.posted'
      // v2 "Sentinel" addition (brief §5): a new balance transfer being
      // initiated — the kind Marcus's 02:47 violating event carries. Never
      // appears in v1's `SeedDb.streamEvents` (reuse-map §5 guardrail); only
      // in `sentinelReplayEvents`.
      | 'balance_transfer.initiated';
  summary: string;
  timestamp: string;
}

/**
 * v2 "Sentinel" addition (brief §5): a record that a customer was notified
 * their balance-transfer promotional APR is ending. Backs rule R3
 * ("Customers must be notified at least 45 days before a promotional APR
 * expires.") — a dataset distinct from `BalanceTransferEvent`, which records
 * what happened to the transfer, not what the customer was told.
 */
export interface PromoNoticeRecord {
  noticeId: string;
  accountId: string;
  sentDate: string; // ISO date
  promoEndDate: string; // ISO date
  channel: 'EMAIL';
}
