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
  PromoNoticeRecord,
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

// v2 "Sentinel" additions (brief §5) — new exports only; nothing above changes.

export async function getPromoNotices(
  accountId: string,
): Promise<PromoNoticeRecord[]> {
  return getDb()
    .promoNotices.filter((n) => n.accountId === accountId)
    .sort((a, b) => a.sentDate.localeCompare(b.sentDate));
}

/** The 14-event "night" replay log, ascending by timestamp (Sentinel Act I/III). */
export async function getSentinelReplayLog(): Promise<StreamEvent[]> {
  return [...getDb().sentinelReplayEvents].sort((a, b) =>
    a.timestamp.localeCompare(b.timestamp),
  );
}
