// Mock SOE contracts — verbatim from CARDINAL_BRIEF.md §6.
// Field names are plausible placeholders; reconcile with the SOE team's actual
// shapes by adjusting the adapter, not the tools that consume it.

export interface Party {
  partyId: string;
  fullName: string;
  dateOfBirth: string; // ISO date
  email: string;
  /**
   * v3 "servicing chatbot" additions (CARDINAL_V3_AU_BRIEF.md §7c) — contact
   * fields the servicing agent's one write path (`updatePartyContact`,
   * lib/soe/adapter.ts) can change. Both optional so v1's fixtures and its
   * pinned tests are unaffected: only the pinned cardholder (and, for
   * consistency, the rest of v1's named cast) carries seed values; every
   * other party — background accounts, the AU portfolio — reads `undefined`,
   * which no consumer treats as an error.
   */
  phone?: string;
  mailingAddress?: string;
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
  /**
   * v3 "AU policy" additions (brief §5d) — a secured card is one whose credit
   * line is collateralized by a customer security deposit
   * (`lib/sentinel/policy.ts` §Definitions). Rule R1 forbids an authorized
   * user on such an account, which makes `securedCard` the hero rule's only
   * account-level input. Both fields are optional because only the additive
   * AU portfolio (`lib/soe/seed/au-portfolio.ts`) carries them; v1's nine
   * accounts are all unsecured and read as `undefined`, which R1 treats as
   * "not a secured card" — the same answer, without touching v1's fixtures.
   */
  securedCard?: boolean;
  securityDepositAmount?: number;
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
}

export interface StreamEvent {
  // the dashboard ticker
  eventId: string;
  accountId: string;
  kind: 'payment.posted' | 'payment.missed' | 'autopay.failed'
      | 'statement.generated' | 'balance_transfer.completed'
      | 'bt.promo_expiring' | 'transaction.posted';
  summary: string;
  timestamp: string;
}
