// Arithmetic + determinism enforcement for the AU exception fixture (brief
// §6c, W3.2). Mirrors lib/soe/seed/au-portfolio.test.ts's "via the adapter"
// pattern: DEMO_ANCHOR_DATE pins the adapter's cached SeedDb, so
// getAuExceptionFixture() (which calls getAuScanPortfolio() under the hood)
// reads the same anchor the assertions below construct by hand. The whole
// suite runs at both demo-date anchors, per au-portfolio.test.ts's own
// convention.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  buildAuExceptionCsv,
  getAuExceptionFixture,
  type AuExceptionFixture,
} from './exception-fixture';

const ANCHORS = ['2026-08-05', '2026-08-19'] as const;

describe.each(ANCHORS)('AU exception fixture @ anchor %s', (anchorIso) => {
  beforeEach(() => {
    process.env.DEMO_ANCHOR_DATE = anchorIso;
  });
  afterEach(() => {
    delete process.env.DEMO_ANCHOR_DATE;
  });

  it('87 rows across 74 distinct accounts, by-rule split 61/19/7', async () => {
    const fixture = await getAuExceptionFixture();

    expect(fixture.rows).toHaveLength(87);
    expect(fixture.totalExceptions).toBe(87);
    expect(new Set(fixture.rows.map((r) => r.accountId)).size).toBe(74);
    expect(fixture.accountsAffected).toBe(74);

    expect(fixture.byRule.R1).toEqual({ relationships: 61, accounts: 52 });
    expect(fixture.byRule.R2).toEqual({ relationships: 19, accounts: 17 });
    expect(fixture.byRule.R3).toEqual({ relationships: 7, accounts: 7 });
    expect(
      fixture.rows.filter((r) => r.ruleId === 'R1'),
    ).toHaveLength(61);
    expect(
      fixture.rows.filter((r) => r.ruleId === 'R2'),
    ).toHaveLength(19);
    expect(
      fixture.rows.filter((r) => r.ruleId === 'R3'),
    ).toHaveLength(7);
  });

  it('every row id is unique, and stable — id is a pure function of (accountId, partyId, ruleId)', async () => {
    const fixture = await getAuExceptionFixture();
    const ids = fixture.rows.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const row of fixture.rows) {
      expect(row.id).toBe(`${row.accountId}·${row.partyId}·${row.ruleId}`);
    }
  });

  it('every row carries a preformatted, non-empty accountLabel, ruleShortName, finding, and addedDate', async () => {
    const fixture = await getAuExceptionFixture();
    for (const row of fixture.rows) {
      expect(row.accountLabel.length).toBeGreaterThan(0);
      expect(row.accountLabel).toMatch(/^.+ household · ••\d{4}$/);
      expect(row.ruleShortName).toMatch(/^R[123] · /);
      expect(row.finding.length).toBeGreaterThan(0);
      // Preformatted display date ("Mar 14, 2024"), never a raw ISO string.
      expect(row.addedDate).not.toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('calling getAuExceptionFixture() twice returns byte-identical output (JSON equality)', async () => {
    const first = await getAuExceptionFixture();
    const second = await getAuExceptionFixture();
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  it('reportId is deterministic across calls and never looks like a timestamp or random token', async () => {
    const first = await getAuExceptionFixture();
    const second = await getAuExceptionFixture();
    expect(second.reportId).toBe(first.reportId);
    expect(first.reportId).toMatch(/^rpt-au-\d{8}-[0-9a-f]{8}$/);
  });

  it('rows are read-only inputs to the CSV builder — buildAuExceptionCsv is itself deterministic', async () => {
    const fixture = await getAuExceptionFixture();
    const first = buildAuExceptionCsv(fixture);
    const second = buildAuExceptionCsv(fixture);
    expect(second).toBe(first);
  });

  it('CSV has a header plus exactly 87 data rows, CRLF-terminated', async () => {
    const fixture = await getAuExceptionFixture();
    const csv = buildAuExceptionCsv(fixture);
    const lines = csv.split('\r\n').filter((line) => line.length > 0);
    expect(lines).toHaveLength(88); // 1 header + 87 rows
    expect(lines[0]).toBe('Account,Authorized User,Rule,Finding,Added Date');
    expect(csv.endsWith('\r\n')).toBe(true);
  });
});

describe('CSV escaping — a field containing a comma must not break the file', () => {
  const syntheticFixture: AuExceptionFixture = {
    reportId: 'rpt-au-test-fixture',
    accountsScanned: 1,
    relationshipsScanned: 1,
    accountsAffected: 1,
    totalExceptions: 1,
    byRule: {
      R1: { relationships: 1, accounts: 1 },
      R2: { relationships: 0, accounts: 0 },
      R3: { relationships: 0, accounts: 0 },
    },
    rows: [
      {
        id: 'acct-test·party-test·R1',
        accountId: 'acct-test',
        partyId: 'party-test',
        // A comma, a double quote, and an embedded newline — the three
        // characters RFC4180 quoting must handle.
        accountLabel: 'Smith, Jr. household · ••1234',
        authorizedUser: 'Pat "Junior" Smith',
        ruleId: 'R1',
        ruleShortName: 'R1 · Product Eligibility',
        finding: 'Secured card · deposit $500.00 · AU added Jan 1, 2024\nsecond line',
        addedDate: 'Jan 1, 2024',
      },
    ],
  };

  it('quotes every field that needs it and leaves the rest bare, byte-for-byte', () => {
    const csv = buildAuExceptionCsv(syntheticFixture);
    const expectedHeader = 'Account,Authorized User,Rule,Finding,Added Date';
    const expectedRow = [
      '"Smith, Jr. household · ••1234"', // comma → quoted
      '"Pat ""Junior"" Smith"', // embedded quote → quoted, doubled
      'R1 · Product Eligibility', // no special chars → bare (proves the escaper is conditional)
      '"Secured card · deposit $500.00 · AU added Jan 1, 2024\nsecond line"', // comma + embedded newline → quoted
      '"Jan 1, 2024"', // comma → quoted
    ].join(',');
    expect(csv).toBe(`${expectedHeader}\r\n${expectedRow}\r\n`);
  });
});
