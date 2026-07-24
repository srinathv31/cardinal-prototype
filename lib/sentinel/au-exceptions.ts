// The AU policy rule evaluator (CARDINAL_V3_AU_BRIEF.md §Part 2). This is the
// proof, not the restatement: it independently RE-DERIVES exceptions from the
// generated data handed to it, never from au-portfolio.ts's generation plan
// (which tag list built which relationship). That is what makes the
// golden-checksum test in au-portfolio.test.ts proof rather than restatement
// — "someone will check whether the aggregation is real" (brief §5d).
//
// Pure module: no lib/soe DATA-ACCESS import (types only, from lib/soe/types
// — no adapter, no fetching), no Date.now(). Every rule reads straight off
// lib/sentinel/policy.ts's rule text, quoted in the comments below.
//
// R1 — Product Eligibility (current state): "An authorized user may not be
// added to, or maintained on, a secured card account." Evaluated against
// account.securedCard today — no addedDate involved.
//
// R2 — Account Standing (at addedDate): "An authorized user may not be added
// to an account that is not in good standing at the time of addition." Good
// standing (policy.ts §Definitions) is "no missed payment within the
// trailing 60 days and its status is open." Both arms are implemented: a
// MISSED payment whose dueDate falls in the 60 days preceding (and
// including) addedDate, OR account.status !== 'ACTIVE' at evaluation time.
// The seed only ever exercises the first arm (every AU-portfolio account is
// ACTIVE, brief §5d) — the second arm is implemented anyway so the evaluator
// is honest about what "good standing" means, not just what the fixture hits.
//
// R3 — Authorized User Qualification (at addedDate): "An authorized user must
// be at least 16 years of age at the time of addition." ageOnDate does an
// exact (year, month, day) comparison — it never divides by 365.25, so no
// leap-day or calendar-rounding edge can flip a verdict.

import type { Account, AccountPartyRole, Party, Payment } from '@/lib/soe/types';
import { formatCurrency, formatDate } from '@/lib/agents/format';

export type AuRuleId = 'R1' | 'R2' | 'R3';

export interface AuException {
  ruleId: AuRuleId;
  accountId: string;
  partyId: string;
  partyName: string;
  addedDate: string;
  /** Preformatted finding line — the PolicyExceptionTable's "specific
   *  finding" column (brief §5c). Server-side formatted; the renderer does
   *  no lookups or arithmetic. */
  finding: string;
}

export interface AuScanInput {
  accounts: Account[];
  parties: Party[];
  roles: AccountPartyRole[];
  payments: Payment[];
}

export interface AuScanResult {
  accountsScanned: number;
  relationshipsScanned: number;
  exceptions: AuException[];
  byRule: Record<AuRuleId, { relationships: number; accounts: number }>;
  accountsAffected: number;
}

const DAY_MS = 86_400_000;

function utcMidnight(iso: string): number {
  return Date.parse(`${iso.slice(0, 10)}T00:00:00.000Z`);
}

/** Whole days from `fromIso` to `toIso` (positive when `toIso` is later). */
function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((utcMidnight(toIso) - utcMidnight(fromIso)) / DAY_MS);
}

/** Calendar age at `onIso`, compared as (year, month, day) triples — never
 * `(now - dob) / 365.25`, which is exactly the kind of rounding that can
 * flip a verdict a few days from a birthday. */
export function ageOnDate(dobIso: string, onIso: string): number {
  const [dobYear, dobMonth, dobDay] = dobIso.slice(0, 10).split('-').map(Number);
  const [onYear, onMonth, onDay] = onIso.slice(0, 10).split('-').map(Number);
  let age = onYear - dobYear;
  if (onMonth < dobMonth || (onMonth === dobMonth && onDay < dobDay)) {
    age -= 1;
  }
  return age;
}

const EMPTY_RULE_COUNTS = { relationships: 0, accounts: 0 };

export function evaluateAuPolicy(input: AuScanInput): AuScanResult {
  const { accounts, parties, roles, payments } = input;

  const accountById = new Map(accounts.map((a) => [a.accountId, a]));
  const partyById = new Map(parties.map((p) => [p.partyId, p]));
  const paymentsByAccount = new Map<string, Payment[]>();
  for (const payment of payments) {
    const list = paymentsByAccount.get(payment.accountId);
    if (list) list.push(payment);
    else paymentsByAccount.set(payment.accountId, [payment]);
  }

  const auRoles = roles.filter((r) => r.role === 'AUTHORIZED_USER');
  const accountsScanned = new Set(auRoles.map((r) => r.accountId)).size;

  const exceptions: AuException[] = [];

  for (const role of auRoles) {
    const account = accountById.get(role.accountId);
    const party = partyById.get(role.partyId);
    if (!account) {
      throw new Error(`AU scan: unknown account ${role.accountId}`);
    }
    if (!party) {
      throw new Error(`AU scan: unknown party ${role.partyId}`);
    }

    // R1 — current state. A secured card is defined by its deposit
    // (policy.ts §Definitions), so a `securedCard` account without one is a
    // data-integrity fault, not a formatting edge: defaulting it to $0.00
    // would put an invented figure on the exception table, which is exactly
    // what brief §5a forbids. Throw instead, same as the two guards above.
    if (account.securedCard === true) {
      if (account.securityDepositAmount === undefined) {
        throw new Error(
          `AU scan: account ${account.accountId} is flagged securedCard with no securityDepositAmount`,
        );
      }
      exceptions.push({
        ruleId: 'R1',
        accountId: role.accountId,
        partyId: role.partyId,
        partyName: party.fullName,
        addedDate: role.addedDate,
        finding: `Secured card · deposit ${formatCurrency(account.securityDepositAmount)} · AU added ${formatDate(role.addedDate)}`,
      });
    }

    // R2 — at addedDate. Arm 1: a MISSED payment due in the 60 days
    // preceding (and including) addedDate. Arm 2: account not ACTIVE.
    const acctPayments = paymentsByAccount.get(role.accountId) ?? [];
    const missedInWindow = acctPayments
      .filter((p) => p.status === 'MISSED')
      .map((p) => ({ payment: p, daysBefore: daysBetween(p.dueDate, role.addedDate) }))
      .filter((x) => x.daysBefore >= 0 && x.daysBefore <= 60)
      .sort((a, b) => a.daysBefore - b.daysBefore);

    if (missedInWindow.length > 0) {
      const { payment, daysBefore } = missedInWindow[0];
      exceptions.push({
        ruleId: 'R2',
        accountId: role.accountId,
        partyId: role.partyId,
        partyName: party.fullName,
        addedDate: role.addedDate,
        finding: `Payment missed ${formatDate(payment.dueDate)} · ${daysBefore} days before AU added ${formatDate(role.addedDate)}`,
      });
    } else if (account.status !== 'ACTIVE') {
      exceptions.push({
        ruleId: 'R2',
        accountId: role.accountId,
        partyId: role.partyId,
        partyName: party.fullName,
        addedDate: role.addedDate,
        finding: `Account status ${account.status} · AU added ${formatDate(role.addedDate)}`,
      });
    }

    // R3 — at addedDate.
    const age = ageOnDate(party.dateOfBirth, role.addedDate);
    if (age < 16) {
      exceptions.push({
        ruleId: 'R3',
        accountId: role.accountId,
        partyId: role.partyId,
        partyName: party.fullName,
        addedDate: role.addedDate,
        finding: `Age ${age} at addition · born ${formatDate(party.dateOfBirth)} · AU added ${formatDate(role.addedDate)}`,
      });
    }
  }

  exceptions.sort(
    (a, b) =>
      a.accountId.localeCompare(b.accountId) ||
      a.partyId.localeCompare(b.partyId) ||
      a.ruleId.localeCompare(b.ruleId),
  );

  const byRule: Record<AuRuleId, { relationships: number; accounts: number }> = {
    R1: { ...EMPTY_RULE_COUNTS },
    R2: { ...EMPTY_RULE_COUNTS },
    R3: { ...EMPTY_RULE_COUNTS },
  };
  for (const ruleId of ['R1', 'R2', 'R3'] as const) {
    const hits = exceptions.filter((e) => e.ruleId === ruleId);
    byRule[ruleId] = {
      relationships: hits.length,
      accounts: new Set(hits.map((h) => h.accountId)).size,
    };
  }

  const accountsAffected = new Set(exceptions.map((e) => e.accountId)).size;

  return {
    accountsScanned,
    relationshipsScanned: auRoles.length,
    exceptions,
    byRule,
    accountsAffected,
  };
}
