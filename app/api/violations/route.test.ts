// GET /api/violations — the stored-rules gate, the narrowing, and the golden
// AU figures. DEMO_ANCHOR_DATE is pinned so `getAuScanPortfolio()`'s cached
// SeedDb is the same one the assertions are written against
// (lib/sentinel/exception-fixture.test.ts's convention); the figures below
// are the ones on screen during the demo, and every one of them falls out of
// the seed data rather than out of a literal in the route.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { reset } from '@/lib/events/store';
import { resetRules, saveRules, type RuleInput } from '@/lib/rules/store';
import { GET } from './route';

const AU_RULES: RuleInput[] = [
  {
    id: 'R1',
    title: 'R1 — Product Eligibility',
    requirement:
      'An authorized user may not be added to, or maintained on, a secured card account.',
    citation: 'Authorized User Eligibility Policy · §Product Eligibility',
    machine: 'R1 · accounts, account-party-roles · nightly sweep · current state',
    addedAt: '2026-07-31T09:00:00.000Z',
  },
  {
    id: 'R2',
    title: 'R2 — Account Standing',
    requirement:
      'An authorized user may not be added to an account that is not in good standing at the time of addition.',
    citation: 'Authorized User Eligibility Policy · §Account Standing',
    machine: 'R2 · accounts, payments, account-party-roles · nightly sweep · at date of addition',
    addedAt: '2026-07-31T09:00:00.000Z',
  },
  {
    id: 'R3',
    title: 'R3 — Authorized User Qualification',
    requirement: 'An authorized user must be at least 16 years of age at the time of addition.',
    citation: 'Authorized User Eligibility Policy · §Authorized User Qualification',
    machine: 'R3 · parties, account-party-roles · nightly sweep · at date of addition',
    addedAt: '2026-07-31T09:00:00.000Z',
  },
];

/** The card-activation rules as a human's Gate-1 approval stores them
 *  (lib/sentinel/card-activation-policy.ts's CA-R1/CA-R2, flattened by
 *  lib/agents/ops/resolvers.ts). Written out here rather than imported for the
 *  same reason AU_RULES above is: this file tests the ENDPOINT, and an endpoint
 *  test that fetched its own inputs from the agent surface would stop being an
 *  independent check of what an external partner gets. */
const CA_RULES: RuleInput[] = [
  {
    id: 'CA-R1',
    title: 'CA-R1 — Activation While Past-Due',
    requirement: 'A card may not be activated while the account is past-due.',
    citation: 'Card Activation Servicing Policy · §Activation While Past-Due',
    machine:
      'CA-R1 · card-activations, payments · at activation attempt · payment-derived past-due state',
    addedAt: '2026-07-31T09:00:00.000Z',
  },
  {
    id: 'CA-R2',
    title: 'CA-R2 — 45-Day Activation Window',
    requirement: 'Cards must be activated within 45 days of issuance.',
    citation: 'Card Activation Servicing Policy · §Activation Window',
    machine: 'CA-R2 · card-activations · nightly sweep · issuedDate/activatedDate elapsed window',
    addedAt: '2026-07-31T09:00:00.000Z',
  },
];

function violationsRequest(search: string): Request {
  return new Request(`http://localhost/api/violations${search}`);
}

describe('GET /api/violations', () => {
  beforeEach(() => {
    process.env.DEMO_ANCHOR_DATE = '2026-08-05';
    resetRules();
    reset();
  });
  afterEach(() => {
    delete process.env.DEMO_ANCHOR_DATE;
    resetRules();
    reset();
  });

  it('answers 409 "no rules configured" before the approval beat runs', async () => {
    const response = await GET(violationsRequest('?policy=authorized-user'));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'no rules configured' });
  });

  it('answers 409 for card-activation until its rules are stored', async () => {
    const response = await GET(violationsRequest('?policy=card-activation'));
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'no rules configured' });
  });

  it('rejects a missing or unknown policy with 400', async () => {
    expect((await GET(violationsRequest(''))).status).toBe(400);
    expect((await GET(violationsRequest('?policy=balance-transfer'))).status).toBe(400);
  });

  it('with all three AU rules stored: 962 scanned · 87 exceptions · 74 accounts · 61/19/7 by rule', async () => {
    saveRules('authorized-user', AU_RULES);
    const response = await GET(violationsRequest('?policy=authorized-user'));
    expect(response.status).toBe(200);
    const payload = await response.json();

    expect(payload.policyId).toBe('authorized-user');
    expect(payload.summary).toEqual({ scanned: 962, accountsAffected: 74, exceptions: 87 });
    expect(payload.rows).toHaveLength(87);
    expect(payload.byRule).toEqual([
      { ruleId: 'R1', title: 'R1 — Product Eligibility', count: 61 },
      { ruleId: 'R2', title: 'R2 — Account Standing', count: 19 },
      { ruleId: 'R3', title: 'R3 — Authorized User Qualification', count: 7 },
    ]);
    expect(new Set(payload.rows.map((r: { accountId: string }) => r.accountId)).size).toBe(74);
  });

  it('narrows to the stored rules — R1 alone reports 61 exceptions across 52 accounts', async () => {
    saveRules('authorized-user', [AU_RULES[0]]);
    const payload = await (await GET(violationsRequest('?policy=authorized-user'))).json();

    expect(payload.summary).toEqual({ scanned: 962, accountsAffected: 52, exceptions: 61 });
    expect(payload.rows).toHaveLength(61);
    expect(payload.rows.every((r: { ruleId: string }) => r.ruleId === 'R1')).toBe(true);
    expect(payload.byRule).toEqual([
      { ruleId: 'R1', title: 'R1 — Product Eligibility', count: 61 },
    ]);
  });

  it('narrows to R2 + R3 — 26 exceptions, scanned unchanged at 962', async () => {
    saveRules('authorized-user', [AU_RULES[1], AU_RULES[2]]);
    const payload = await (await GET(violationsRequest('?policy=authorized-user'))).json();

    expect(payload.summary.scanned).toBe(962);
    expect(payload.summary.exceptions).toBe(19 + 7);
    expect(payload.byRule.map((r: { count: number }) => r.count)).toEqual([19, 7]);
  });

  it('keeps a stored rule with zero hits in the breakdown, as "checked, clean"', async () => {
    saveRules('authorized-user', [
      AU_RULES[0],
      { ...AU_RULES[0], id: 'R9', title: 'R9 — Consent on file' },
    ]);
    const payload = await (await GET(violationsRequest('?policy=authorized-user'))).json();

    expect(payload.byRule).toEqual([
      { ruleId: 'R1', title: 'R1 — Product Eligibility', count: 61 },
      { ruleId: 'R9', title: 'R9 — Consent on file', count: 0 },
    ]);
    expect(payload.rows).toHaveLength(61);
  });

  it('labels rows with the title the human approved, not the fixture default', async () => {
    saveRules('authorized-user', [{ ...AU_RULES[0], title: 'R1 — Secured-card prohibition' }]);
    const payload = await (await GET(violationsRequest('?policy=authorized-user'))).json();
    expect(
      payload.rows.every(
        (r: { ruleTitle: string }) => r.ruleTitle === 'R1 — Secured-card prohibition',
      ),
    ).toBe(true);
  });

  it('every row carries drill-down detail preformatted server-side (no raw numbers or ISO dates)', async () => {
    saveRules('authorized-user', AU_RULES);
    const payload = await (await GET(violationsRequest('?policy=authorized-user'))).json();

    for (const row of payload.rows) {
      expect(typeof row.accountId).toBe('string');
      expect(row.holder.length).toBeGreaterThan(0);
      expect(row.finding.length).toBeGreaterThan(0);
      expect(Array.isArray(row.detail)).toBe(true);
      expect(row.detail.length).toBeGreaterThan(0);
      for (const fact of row.detail) {
        expect(typeof fact.label).toBe('string');
        expect(typeof fact.value).toBe('string');
        expect(fact.value).not.toMatch(/^\d{4}-\d{2}-\d{2}(T|$)/);
      }
    }
  });

  it('is deterministic — two GETs return byte-identical payloads', async () => {
    saveRules('authorized-user', AU_RULES);
    const first = await (await GET(violationsRequest('?policy=authorized-user'))).json();
    const second = await (await GET(violationsRequest('?policy=authorized-user'))).json();
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });

  // ————— card-activation, through the SAME route, unchanged ——————————
  //
  // DEMO_THESIS.md's endpoint checklist rows 3 and 4 are one route: registering
  // an evaluator (lib/rules/evaluators.ts) is the whole of what wiring a second
  // policy takes, and nothing in route.ts knows either policy's name.

  it('with both CA rules stored: 214 scanned · 41 exceptions · 41 accounts · 12/29 by rule', async () => {
    saveRules('card-activation', CA_RULES);
    const response = await GET(violationsRequest('?policy=card-activation'));
    expect(response.status).toBe(200);
    const payload = await response.json();

    expect(payload.policyId).toBe('card-activation');
    expect(payload.summary).toEqual({ scanned: 214, accountsAffected: 41, exceptions: 41 });
    expect(payload.rows).toHaveLength(41);
    expect(payload.byRule).toEqual([
      { ruleId: 'CA-R1', title: 'CA-R1 — Activation While Past-Due', count: 12 },
      { ruleId: 'CA-R2', title: 'CA-R2 — 45-Day Activation Window', count: 29 },
    ]);
    expect(new Set(payload.rows.map((r: { accountId: string }) => r.accountId)).size).toBe(41);
  });

  it('narrows card-activation to the stored rules — CA-R2 alone reports 29', async () => {
    saveRules('card-activation', [CA_RULES[1]]);
    const payload = await (await GET(violationsRequest('?policy=card-activation'))).json();

    expect(payload.summary).toEqual({ scanned: 214, accountsAffected: 29, exceptions: 29 });
    expect(payload.rows.every((r: { ruleId: string }) => r.ruleId === 'CA-R2')).toBe(true);
    expect(payload.byRule).toEqual([
      { ruleId: 'CA-R2', title: 'CA-R2 — 45-Day Activation Window', count: 29 },
    ]);
  });

  it('keeps the two policies\' stores independent', async () => {
    saveRules('authorized-user', AU_RULES);
    saveRules('card-activation', CA_RULES);

    const au = await (await GET(violationsRequest('?policy=authorized-user'))).json();
    const ca = await (await GET(violationsRequest('?policy=card-activation'))).json();

    expect(au.summary).toEqual({ scanned: 962, accountsAffected: 74, exceptions: 87 });
    expect(ca.summary).toEqual({ scanned: 214, accountsAffected: 41, exceptions: 41 });
    expect(au.rows.every((r: { ruleId: string }) => r.ruleId.startsWith('R'))).toBe(true);
    expect(ca.rows.every((r: { ruleId: string }) => r.ruleId.startsWith('CA-R'))).toBe(true);
  });

  it('card-activation rows carry drill-down detail preformatted server-side', async () => {
    saveRules('card-activation', CA_RULES);
    const payload = await (await GET(violationsRequest('?policy=card-activation'))).json();

    for (const row of payload.rows) {
      expect(row.holder.length).toBeGreaterThan(0);
      expect(row.finding.length).toBeGreaterThan(0);
      expect(row.detail.length).toBeGreaterThan(0);
      for (const fact of row.detail) {
        expect(typeof fact.label).toBe('string');
        expect(typeof fact.value).toBe('string');
        expect(fact.value).not.toMatch(/^\d{4}-\d{2}-\d{2}(T|$)/);
      }
    }
  });
});

describe('GET /api/violations @ the second demo anchor', () => {
  beforeEach(() => {
    process.env.DEMO_ANCHOR_DATE = '2026-08-19';
    resetRules();
    reset();
  });
  afterEach(() => {
    delete process.env.DEMO_ANCHOR_DATE;
    resetRules();
    reset();
  });

  it('holds the same golden figures on the rehearsal anchor', async () => {
    saveRules('authorized-user', AU_RULES);
    const payload = await (await GET(violationsRequest('?policy=authorized-user'))).json();
    expect(payload.summary).toEqual({ scanned: 962, accountsAffected: 74, exceptions: 87 });
    expect(payload.byRule.map((r: { count: number }) => r.count)).toEqual([61, 19, 7]);
  });

  it('holds the same golden card-activation figures on the rehearsal anchor', async () => {
    saveRules('card-activation', CA_RULES);
    const payload = await (await GET(violationsRequest('?policy=card-activation'))).json();
    expect(payload.summary).toEqual({ scanned: 214, accountsAffected: 41, exceptions: 41 });
    expect(payload.byRule.map((r: { count: number }) => r.count)).toEqual([12, 29]);
  });
});
