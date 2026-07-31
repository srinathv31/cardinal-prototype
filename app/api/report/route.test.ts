// GET /api/report — headers, filename, 400/501 paths, determinism, and the
// store-empty fallback (DEMO_THESIS.md UC1 beat 8, DEMO_BUILD_PLAN.md
// §Endpoints). Mirrors app/api/violations/route.test.ts's convention: pin
// DEMO_ANCHOR_DATE so the cached SeedDb the assertions read is the one the
// route reads too, and reset the rule store around every test so beats don't
// leak across cases.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getAuExceptionFixture } from '@/lib/sentinel/exception-fixture';
import { resetRules, saveRules, type RuleInput } from '@/lib/rules/store';
import { GET } from './route';

const AU_RULES: RuleInput[] = [
  {
    id: 'R1',
    title: 'R1 — Product Eligibility (approved copy)',
    requirement:
      'An authorized user may not be added to, or maintained on, a secured card account.',
    citation: 'Authorized User Eligibility Policy · §Product Eligibility',
    machine: 'R1 · accounts, account-party-roles · nightly sweep · current state',
    addedAt: '2026-07-31T09:00:00.000Z',
  },
  {
    id: 'R2',
    title: 'R2 — Account Standing (approved copy)',
    requirement:
      'An authorized user may not be added to an account that is not in good standing at the time of addition.',
    citation: 'Authorized User Eligibility Policy · §Account Standing',
    machine: 'R2 · accounts, payments, account-party-roles · nightly sweep · at date of addition',
    addedAt: '2026-07-31T09:00:00.000Z',
  },
  {
    id: 'R3',
    title: 'R3 — Authorized User Qualification (approved copy)',
    requirement: 'An authorized user must be at least 16 years of age at the time of addition.',
    citation: 'Authorized User Eligibility Policy · §Authorized User Qualification',
    machine: 'R3 · parties, account-party-roles · nightly sweep · at date of addition',
    addedAt: '2026-07-31T09:00:00.000Z',
  },
];

function reportRequest(search: string): Request {
  return new Request(`http://localhost/api/report${search}`);
}

describe('GET /api/report', () => {
  beforeEach(() => {
    process.env.DEMO_ANCHOR_DATE = '2026-08-05';
    resetRules();
  });
  afterEach(() => {
    delete process.env.DEMO_ANCHOR_DATE;
    resetRules();
  });

  it('rejects a missing policy with 400', async () => {
    const response = await GET(reportRequest(''));
    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toMatch(/policy/i);
  });

  it('rejects an unknown policy with 400', async () => {
    const response = await GET(reportRequest('?policy=balance-transfer'));
    expect(response.status).toBe(400);
  });

  it('answers 501 with a clear message for card-activation (not built yet)', async () => {
    const response = await GET(reportRequest('?policy=card-activation'));
    expect(response.status).toBe(501);
    const json = await response.json();
    expect(json.error.length).toBeGreaterThan(0);
  });

  it('returns 200 HTML with the right Content-Type and attachment filename', async () => {
    const response = await GET(reportRequest('?policy=authorized-user'));
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/html; charset=utf-8');
    expect(response.headers.get('Content-Disposition')).toBe(
      'attachment; filename="authorized-user-policy-audit-2026-08-05.html"',
    );
  });

  it('builds the report even with an empty rule store (fallback to the policy fixture)', async () => {
    const response = await GET(reportRequest('?policy=authorized-user'));
    const html = await response.text();
    expect(response.status).toBe(200);
    // Fixture wording, not the "(approved copy)" store wording used below.
    expect(html).toContain('R1 — Product Eligibility');
    expect(html).not.toContain('(approved copy)');
  });

  it('prefers stored rule text over the fixture fallback once rules are approved', async () => {
    saveRules('authorized-user', AU_RULES);
    const response = await GET(reportRequest('?policy=authorized-user'));
    const html = await response.text();
    expect(html).toContain('R1 — Product Eligibility (approved copy)');
    expect(html).toContain('R2 — Account Standing (approved copy)');
    expect(html).toContain('R3 — Authorized User Qualification (approved copy)');
  });

  it('carries the golden headline figures — 962 scanned, 87 exceptions, 74 accounts, 61/19/7 by rule', async () => {
    const response = await GET(reportRequest('?policy=authorized-user'));
    const html = await response.text();
    expect(html).toContain('962');
    expect(html).toContain('87');
    expect(html).toContain('74');
    expect(html).toContain('>61<');
    expect(html).toContain('>19<');
    expect(html).toContain('>7<');
  });

  it('enumerates all 87 exception rows — one header <tr> plus 87 data rows', async () => {
    const response = await GET(reportRequest('?policy=authorized-user'));
    const html = await response.text();
    const trCount = (html.match(/<tr/g) ?? []).length;
    expect(trCount).toBe(88);
  });

  it('every finding sentence from the fixture appears verbatim in the report', async () => {
    const fixture = await getAuExceptionFixture();
    const response = await GET(reportRequest('?policy=authorized-user'));
    const html = await response.text();
    for (const row of fixture.rows) {
      expect(html).toContain(row.finding);
    }
  });

  it('omits the remediation section when confirmationId is absent', async () => {
    const response = await GET(reportRequest('?policy=authorized-user'));
    const html = await response.text();
    expect(html).not.toContain('Remediation Executed');
  });

  it('includes the remediation section with figures and the verbatim confirmationId when present', async () => {
    const fixture = await getAuExceptionFixture();
    const response = await GET(
      reportRequest('?policy=authorized-user&confirmationId=rem-rpt-au-test-token'),
    );
    const html = await response.text();
    expect(html).toContain('Remediation Executed');
    expect(html).toContain('rem-rpt-au-test-token');
    expect(html).toContain('Approved by a human operator');
    expect(html).toContain(`>${fixture.totalExceptions}<`);
    expect(html).toContain(`>${fixture.accountsAffected}<`);
  });

  it('is deterministic — two identical calls return byte-identical bodies', async () => {
    const first = await GET(reportRequest('?policy=authorized-user'));
    const second = await GET(reportRequest('?policy=authorized-user'));
    expect(await second.text()).toBe(await first.text());
  });
});

describe('GET /api/report @ the second demo anchor', () => {
  beforeEach(() => {
    process.env.DEMO_ANCHOR_DATE = '2026-08-19';
    resetRules();
  });
  afterEach(() => {
    delete process.env.DEMO_ANCHOR_DATE;
    resetRules();
  });

  it('uses the second anchor date in the filename and holds the golden figures', async () => {
    const response = await GET(reportRequest('?policy=authorized-user'));
    expect(response.headers.get('Content-Disposition')).toBe(
      'attachment; filename="authorized-user-policy-audit-2026-08-19.html"',
    );
    const html = await response.text();
    expect(html).toContain('962');
    expect(html).toContain('87');
    expect(html).toContain('74');
    const trCount = (html.match(/<tr/g) ?? []).length;
    expect(trCount).toBe(88);
  });
});
