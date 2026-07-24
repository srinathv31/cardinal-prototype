// The SOE adapter — the single seam between Cardinal and account data.
// Everything above this module (tools, agents, API routes) calls these seven
// functions and never touches seed data directly, so swapping mock → real SOE
// endpoints later means reimplementing this file only (brief §6).

import { buildSeedDb, getAnchor, type SeedDb } from './seed';
import type {
  Account,
  AccountPartyRole,
  BalanceTransferEvent,
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
