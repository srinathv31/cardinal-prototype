// The AU exception fixture (brief §6c, W3.2) — the single, checked-in,
// server-only derivation that feeds THREE surfaces: `PolicyExceptionTable`
// (Act III's on-screen sweep table), `RemediationReport` (the post-approval
// receipt card), and `GET /api/sentinel/report`'s downloadable CSV. Brief
// §6c requires the table and the CSV to be fed by "the same fixture," and
// §5c requires the report card's contents to come from that same fixture
// too — so all three read from `getAuExceptionFixture()` and nothing else.
//
// This IS the checked-in fixture the brief means, in exactly the sense it
// means it: `getAuScanPortfolio()` (lib/soe/adapter.ts) and
// `evaluateAuPolicy()` (lib/sentinel/au-exceptions.ts) are both deterministic
// and both checked in, so calling this function twice at the same demo
// anchor produces byte-identical rows every time (asserted in
// exception-fixture.test.ts). No figure here originates anywhere but that
// data — every display string is computed once, here, and every consumer
// renders it verbatim (CLAUDE.md 5a/5b).
//
// The alternative — hand-typing 87 rows as a literal array — was rejected.
// A hand-typed fixture is a SECOND source of truth alongside the generator
// and the evaluator: nothing would stop it from drifting out of sync with
// `au-portfolio.ts`'s PRNG output (a seed tweak, a rule-evaluator fix) the
// next time either changes, and the table would then show one set of 87
// rows while the CSV — or a differently-drifted hand-typed copy of it —
// showed another. That is exactly the failure §6c is guarding against
// ("it must not be assembled client-side from rendered DOM, and no figure
// in it may originate anywhere but the fixture"). A derived fixture cannot
// drift from the data it derives from; a hand-typed one always can.
//
// Server-only by convention (not by the `server-only` package — it is not
// among this project's frozen dependencies, CLAUDE.md "Dependencies are
// frozen"): this module is never imported from a `"use client"` component.
// It is consumed only by the two Sentinel API routes
// (app/api/sentinel/remediate, app/api/sentinel/report) and, indirectly, by
// whatever scenario step builds Act III's `render` payloads server-side.

import { getAnchor, getAuScanPortfolio } from '@/lib/soe';
import { formatDate } from '@/lib/agents/format';
import { evaluateAuPolicy, type AuRuleId } from './au-exceptions';

export interface AuExceptionRow {
  /** Stable, unique id — `${accountId}·${partyId}·${ruleId}`. The evaluator
   * guarantees at most one exception per (account, party, rule) triple
   * (au-exceptions.test.ts / au-portfolio.test.ts's "no relationship
   * appears under two rule ids" assertion), so this is unique across all 87
   * rows without a synthetic counter — and it is the same id on every call,
   * which is what makes it usable as a React key and a CSV row identity
   * both. */
  id: string;
  accountId: string;
  partyId: string;
  /** e.g. "Nguyen household · ••4821" — the account's PRIMARY party's last
   * name plus a masked account identifier, both derived from real seed data
   * (never invented; see `maskedAccountTail` below). */
  accountLabel: string;
  /** The flagged authorized user's name. */
  authorizedUser: string;
  ruleId: AuRuleId;
  /** e.g. "R1 · Product Eligibility". */
  ruleShortName: string;
  /** Preformatted finding line, straight from the evaluator
   * (`AuException.finding`) — already server-formatted currency/dates. */
  finding: string;
  /** Preformatted display date, e.g. "Mar 14, 2024" (the evaluator's
   * `addedDate` is a raw ISO string; this module is where it gets
   * formatted, once). */
  addedDate: string;
}

export interface AuExceptionFixture {
  /** Deterministic report id — see `buildReportId` below. Never random,
   * never `Date.now()` (brief §9). */
  reportId: string;
  accountsScanned: number;
  relationshipsScanned: number;
  accountsAffected: number;
  totalExceptions: number;
  byRule: Record<AuRuleId, { relationships: number; accounts: number }>;
  /** All 87, in the evaluator's own (accountId, partyId, ruleId) order —
   * callers slice for "first N" / "showing 12 of 87" themselves; this
   * module does not paginate. */
  rows: AuExceptionRow[];
}

const RULE_SHORT_NAME: Record<AuRuleId, string> = {
  R1: 'R1 · Product Eligibility',
  R2: 'R2 · Account Standing',
  R3: 'R3 · Authorized User Qualification',
};

/** A small, dependency-free, non-cryptographic string hash (djb2 XOR
 * variant) — used twice below, both times as a STABLE derivation of
 * already-real data, never as a source of new randomness. Pure function of
 * its input: same string in, same number out, forever. */
function hashString(input: string): number {
  let hash = 5381;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 33) ^ input.charCodeAt(i);
  }
  return hash >>> 0;
}

/** These are synthetic seed accounts with no real card number to redact —
 * there is nothing to "mask" in the security sense. What the table needs is
 * a short, stable, card-like tail so `accountLabel` reads the way a reviewer
 * expects ("•• 4821"), without printing the full `au-acct-0001`-style id.
 * Deriving it from the account id itself (rather than the row's position, a
 * counter, or anything random) keeps it a pure function of real data: the
 * same account always renders the same tail, on every call, on both demo
 * anchors. */
function maskedAccountTail(accountId: string): string {
  const digits = hashString(accountId) % 10_000;
  return String(digits).padStart(4, '0');
}

/** "Priya Patel" → "Patel" — the household surname `accountLabel` is built
 * around. Every name in both the AU-portfolio generator and v1's cast is a
 * "First Last" pair (lib/soe/seed/au-portfolio.ts's FIRST_NAMES/LAST_NAMES,
 * lib/soe/seed/patel.ts), so the last whitespace-delimited token is always
 * the surname — no name-parsing library needed for names this shape. */
function surname(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts[parts.length - 1] ?? fullName;
}

/** Deterministic report id: a stable hash of the anchor date plus every row
 * id, so it changes if (and only if) the underlying scan changes, and never
 * from wall-clock time or `Math.random()` (brief §9's "byte-identical
 * across replays"). Formatted to read as a plausible report reference on
 * screen and in a downloaded filename. */
function buildReportId(anchorIso: string, rows: AuExceptionRow[]): string {
  const anchorCompact = anchorIso.slice(0, 10).replace(/-/g, '');
  const contentHash = hashString(rows.map((r) => r.id).join('|'))
    .toString(16)
    .padStart(8, '0');
  return `rpt-au-${anchorCompact}-${contentHash}`;
}

/** The single derivation behind `PolicyExceptionTable`, `RemediationReport`,
 * and the CSV route (module header). Calls only `getAuScanPortfolio()` and
 * `evaluateAuPolicy()` — both pure/deterministic for a fixed demo anchor —
 * so this function is itself pure-for-a-fixed-anchor: same anchor in, same
 * `AuExceptionFixture` out, every time. */
export async function getAuExceptionFixture(): Promise<AuExceptionFixture> {
  const scan = await getAuScanPortfolio();
  const result = evaluateAuPolicy(scan);

  const primarySurnameByAccount = new Map<string, string>();
  for (const role of scan.roles) {
    if (role.role !== 'PRIMARY') continue;
    const party = scan.parties.find((p) => p.partyId === role.partyId);
    if (party) primarySurnameByAccount.set(role.accountId, surname(party.fullName));
  }

  const rows: AuExceptionRow[] = result.exceptions.map((exception) => {
    const primary = primarySurnameByAccount.get(exception.accountId);
    if (!primary) {
      throw new Error(
        `AU exception fixture: no PRIMARY party on file for account ${exception.accountId}`,
      );
    }
    return {
      id: `${exception.accountId}·${exception.partyId}·${exception.ruleId}`,
      accountId: exception.accountId,
      partyId: exception.partyId,
      accountLabel: `${primary} household · ••${maskedAccountTail(exception.accountId)}`,
      authorizedUser: exception.partyName,
      ruleId: exception.ruleId,
      ruleShortName: RULE_SHORT_NAME[exception.ruleId],
      finding: exception.finding,
      addedDate: formatDate(exception.addedDate),
    };
  });

  const anchorIso = getAnchor().toISOString();

  return {
    reportId: buildReportId(anchorIso, rows),
    accountsScanned: result.accountsScanned,
    relationshipsScanned: result.relationshipsScanned,
    accountsAffected: result.accountsAffected,
    totalExceptions: result.exceptions.length,
    byRule: result.byRule,
    rows,
  };
}

/** One CSV field, RFC4180-style: quoted (and internal quotes doubled)
 * whenever the value contains a comma, a double quote, or a newline —
 * otherwise left bare. Every fixture field is currently comma-free
 * (formatted dates/currency/names never contain one), but `finding` and
 * `authorizedUser` are free text derived from name pools that COULD grow a
 * comma later, so this is not a defensive no-op — exception-fixture.test.ts
 * exercises it directly with a synthetic comma/quote/newline field. */
function escapeCsvField(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function csvRow(fields: string[]): string {
  return fields.map(escapeCsvField).join(',');
}

/** Hand-rolled CSV (brief §10: no new dependencies) built server-side from
 * this SAME fixture — `GET /api/sentinel/report` calls this and nothing
 * else, so the download can never show a number the table didn't (brief
 * §6c: "it must not be assembled client-side from rendered DOM, and no
 * figure in it may originate anywhere but the fixture"). One row per
 * exception, in the fixture's own order; the header names match
 * `PolicyExceptionTable`'s columns. */
export function buildAuExceptionCsv(fixture: AuExceptionFixture): string {
  const header = csvRow([
    'Account',
    'Authorized User',
    'Rule',
    'Finding',
    'Added Date',
  ]);
  const lines = fixture.rows.map((row) =>
    csvRow([row.accountLabel, row.authorizedUser, row.ruleShortName, row.finding, row.addedDate]),
  );
  // CRLF line endings — the RFC4180 convention every spreadsheet importer
  // (Excel included) expects from a downloaded .csv.
  return [header, ...lines].join('\r\n') + '\r\n';
}
