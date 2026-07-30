// The SOE adapter — the single seam between Cardinal and account data.
// Everything above this module (tools, agents, API routes) calls these seven
// functions and never touches seed data directly, so swapping mock → real SOE
// endpoints later means reimplementing this file only (brief §6).

import { buildSeedDb, getAnchor, type SeedDb } from './seed';
import type {
  Account,
  AccountPartyRole,
  BalanceTransferEvent,
  CardActivation,
  Party,
  Payment,
  StreamEvent,
  Transaction,
} from './types';

/** Inclusive ISO-date window; open-ended when a bound is omitted. */
export interface Range {
  from?: string;
  to?: string;
}

export interface AccountParty {
  party: Party;
  role: AccountPartyRole;
}

let db: SeedDb | null = null;
let dbAnchorIso: string | null = null;

function getDb(): SeedDb {
  const anchor = getAnchor();
  const anchorIso = anchor.toISOString();
  if (!db || dbAnchorIso !== anchorIso) {
    db = buildSeedDb(anchor);
    dbAnchorIso = anchorIso;
  }
  return db;
}

function inRange(dateIso: string, range?: Range): boolean {
  if (!range) return true;
  const date = dateIso.slice(0, 10);
  if (range.from && date < range.from.slice(0, 10)) return false;
  if (range.to && date > range.to.slice(0, 10)) return false;
  return true;
}

export async function getAccount(accountId: string): Promise<Account> {
  const account = getDb().accounts.find((a) => a.accountId === accountId);
  if (!account) throw new Error(`SOE: unknown account ${accountId}`);
  return account;
}

export async function getPartiesForAccount(
  accountId: string,
): Promise<AccountParty[]> {
  const { parties, accountPartyRoles } = getDb();
  return accountPartyRoles
    .filter((r) => r.accountId === accountId)
    .map((role) => {
      const party = parties.find((p) => p.partyId === role.partyId);
      if (!party) throw new Error(`SOE: unknown party ${role.partyId}`);
      return { party, role };
    });
}

export async function getTransactions(
  accountId: string,
  range?: Range,
): Promise<Transaction[]> {
  return getDb()
    .transactions.filter(
      (t) => t.accountId === accountId && inRange(t.postedDate, range),
    )
    .sort((a, b) => b.postedDate.localeCompare(a.postedDate));
}

export async function getPayments(
  accountId: string,
  range?: Range,
): Promise<Payment[]> {
  return getDb()
    .payments.filter(
      (p) => p.accountId === accountId && inRange(p.dueDate, range),
    )
    .sort((a, b) => b.dueDate.localeCompare(a.dueDate));
}

export async function getBalanceTransferEvents(
  accountId: string,
): Promise<BalanceTransferEvent[]> {
  return getDb()
    .balanceTransferEvents.filter((e) => e.accountId === accountId)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

export async function getPortfolioAccounts(): Promise<Account[]> {
  return [...getDb().accounts];
}

export async function getEventStream(): Promise<StreamEvent[]> {
  return [...getDb().streamEvents].sort((a, b) =>
    b.timestamp.localeCompare(a.timestamp),
  );
}

// v3 "AU policy" additions (brief §5d) — new exports only; nothing above
// changes. v2's `getPromoNotices` / `getSentinelReplayLog` were removed with
// the balance-transfer stage (docs/v3-migration-map.md §2).

export interface AuPortfolioSnapshot {
  accounts: Account[];
  parties: Party[];
  roles: AccountPartyRole[];
  payments: Payment[];
}

/** The raw additive AU collection — 1,100 accounts of book depth. */
export async function getAuPortfolio(): Promise<AuPortfolioSnapshot> {
  const { auPortfolio } = getDb();
  return {
    accounts: [...auPortfolio.accounts],
    parties: [...auPortfolio.parties],
    roles: [...auPortfolio.roles],
    payments: [...auPortfolio.payments],
  };
}

/** The AU-eligibility scan set: every account carrying at least one
 *  authorized user, from the additive collection AND from v1's cast. Returns
 *  exactly 962 accounts / 1,247 AU relationships: the 961 AU-carrying
 *  accounts from `auPortfolio` plus every v1 account that carries an
 *  AUTHORIZED_USER role — today that is the Patel household alone, with
 *  Priya and Dev. Derived from the roles table (not hardcoded to
 *  `acct-patel`), so this stays correct if v1's cast ever changes. The brief
 *  is explicit that Patel belongs in the scan DENOMINATOR, not excluded from
 *  it, and doing the merge here at the data seam keeps 962/1,247 from being
 *  re-derived anywhere else. */
export async function getAuScanPortfolio(): Promise<AuPortfolioSnapshot> {
  const db = getDb();
  const { auPortfolio } = db;

  const collectionAccountIds = new Set(
    auPortfolio.roles
      .filter((r) => r.role === 'AUTHORIZED_USER')
      .map((r) => r.accountId),
  );
  const collectionAccounts = auPortfolio.accounts.filter((a) =>
    collectionAccountIds.has(a.accountId),
  );
  const collectionRoles = auPortfolio.roles.filter((r) =>
    collectionAccountIds.has(r.accountId),
  );
  const collectionPartyIds = new Set(collectionRoles.map((r) => r.partyId));
  const collectionParties = auPortfolio.parties.filter((p) =>
    collectionPartyIds.has(p.partyId),
  );
  const collectionPayments = auPortfolio.payments.filter((p) =>
    collectionAccountIds.has(p.accountId),
  );

  const v1AuAccountIds = new Set(
    db.accountPartyRoles
      .filter((r) => r.role === 'AUTHORIZED_USER')
      .map((r) => r.accountId),
  );
  const v1Accounts = db.accounts.filter((a) => v1AuAccountIds.has(a.accountId));
  const v1Roles = db.accountPartyRoles.filter((r) =>
    v1AuAccountIds.has(r.accountId),
  );
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

// v3 "card-activation policy" additions (DEMO_THESIS.md Use case 3;
// DEMO_BUILD_PLAN.md "Card-activation domain") — new exports only; nothing
// above changes. Follows getAuPortfolio / getAuScanPortfolio's precedent
// immediately above: one raw getter, one pre-merged "scan" getter shaped
// exactly for its evaluator (lib/sentinel/ca-exceptions.ts).

/** The raw additive card-activation collection — 214 cards. */
export async function getCardActivations(): Promise<CardActivation[]> {
  return [...getDb().cardActivations];
}

export interface CardActivationScan {
  cardActivations: CardActivation[];
  /** Every payment for every account referenced by `cardActivations`,
   * merged from BOTH the AU portfolio (the 212 "regular" cards' accounts)
   * and v1's cast (Marcus/Patel, the two special cards' accounts) — the
   * same merge shape getAuScanPortfolio uses above, filtered down to only
   * the accounts this scan actually needs. lib/sentinel/ca-exceptions.ts
   * filters this by accountId itself, so passing the full merged set for
   * every account in `cardActivations` is exactly what it expects. */
  payments: Payment[];
  /** ISO date (YYYY-MM-DD) — "today," the same demo anchor every
   * `issuedDate`/`activatedDate` in `cardActivations` was generated from.
   * CA-R2's unactivated arm (ca-exceptions.ts) clocks elapsed days against
   * this, never against wall-clock time. */
  asOf: string;
}

/** The card-activation scan set: every card in the collection, plus the
 *  payment history needed to evaluate CA-R1 (past-due at activation) for
 *  whichever of them are activated. Unlike getAuScanPortfolio, there is no
 *  "denominator" filtering step here — cardActivations already IS the scan
 *  set (every card is issued, so every card is in scope), so this getter's
 *  only job is attaching the payment data the evaluator needs. */
export async function getCardActivationScan(): Promise<CardActivationScan> {
  const db = getDb();
  const accountIds = new Set(db.cardActivations.map((c) => c.accountId));
  const payments = [
    ...db.auPortfolio.payments.filter((p) => accountIds.has(p.accountId)),
    ...db.payments.filter((p) => accountIds.has(p.accountId)),
  ];
  return {
    cardActivations: [...db.cardActivations],
    payments,
    asOf: getAnchor().toISOString().slice(0, 10),
  };
}

// v3 "servicing chatbot" addition (CARDINAL_V3_AU_BRIEF.md §7c) — the
// adapter's one write path. Everything above this line is a getter; this is
// the eighth function on what was a seven-getter module, and it stays that
// shape: exactly one mutation, nothing else. It mutates the cached SeedDb's
// Party record in place (the same in-memory object every getter above already
// reads through `getDb()`), so the change is visible to every subsequent read
// without re-threading state anywhere else.

export interface PartyContactPatch {
  phone?: string;
  mailingAddress?: string;
}

/**
 * Applies a partial contact-info patch to one party, in place, and returns
 * the updated record. The servicing agent's only side-effecting tool
 * (lib/agents/servicing/tools.ts's `updateContactInfo`) is the sole caller,
 * and only after human approval (CARDINAL_V3_AU_BRIEF.md §7c — the same
 * AI SDK tool-approval pause every other action tool uses, pointed at the
 * customer instead of an ops user). Real account-takeover surface in
 * production; step-up authentication in front of this call is the
 * production control (see the comment on `updateContactInfo` — this
 * prototype's confirmation gate plus the audit-log entry are what stand in
 * for it here).
 */
export async function updatePartyContact(
  partyId: string,
  patch: PartyContactPatch,
): Promise<Party> {
  const party = getDb().parties.find((p) => p.partyId === partyId);
  if (!party) throw new Error(`SOE: unknown party ${partyId}`);
  if (patch.phone !== undefined) party.phone = patch.phone;
  if (patch.mailingAddress !== undefined) party.mailingAddress = patch.mailingAddress;
  return party;
}

/**
 * Demo-reset hook, NOT a second mutation on the party/account data model —
 * lifecycle plumbing, same spirit as lib/events/store.ts's own `reset()`
 * export sitting alongside its getters. `getDb()` above only rebuilds the
 * cached SeedDb when the demo anchor's ISO string changes (once a day in
 * practice), so a live server would otherwise carry an `updatePartyContact`
 * mutation across every subsequent "Reset demo" click. Dropping the cache
 * here forces the next read to rebuild fresh from the deterministic
 * generator, discarding that one in-memory mutation — exactly what "POST
 * /api/reset must restore it" (CARDINAL_V3_AU_BRIEF.md §7c) requires.
 * Called from app/api/reset/route.ts; proven by lib/soe/adapter.test.ts
 * rather than assumed.
 */
export function resetSoeState(): void {
  db = null;
  dbAnchorIso = null;
}
