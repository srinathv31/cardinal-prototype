// POST/GET /api/rules — request/response shape and the Event Log write.
// Follows app/api/sentinel/remediate/route.test.ts's pattern: call the
// exported route handlers directly with a web-standard `Request`, exactly as
// Next.js invokes them, no test-only mocking layer.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { query, reset } from '@/lib/events/store';
import { getRules, resetRules } from '@/lib/rules/store';
import { GET, POST } from './route';

const AU_RULES = [
  {
    id: 'R1',
    title: 'R1 — Product Eligibility',
    requirement:
      'An authorized user may not be added to, or maintained on, a secured card account.',
    citation: 'Authorized User Eligibility Policy · §Product Eligibility',
    machine: 'R1 · accounts, account-party-roles · nightly sweep · current state',
  },
  {
    id: 'R2',
    title: 'R2 — Account Standing',
    requirement:
      'An authorized user may not be added to an account that is not in good standing at the time of addition.',
    citation: 'Authorized User Eligibility Policy · §Account Standing',
    machine: 'R2 · accounts, payments, account-party-roles · nightly sweep · at date of addition',
  },
];

function postRequest(body: unknown): Request {
  return new Request('http://localhost/api/rules', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function getRequest(search = ''): Request {
  return new Request(`http://localhost/api/rules${search}`);
}

describe('/api/rules', () => {
  beforeEach(() => {
    resetRules();
    reset();
  });
  afterEach(() => {
    resetRules();
    reset();
  });

  it('POST stores the rules and echoes them back stamped with the policy', async () => {
    const response = await POST(
      postRequest({ policyId: 'authorized-user', rules: AU_RULES }),
    );
    expect(response.status).toBe(200);
    const json = await response.json();

    expect(json.policyId).toBe('authorized-user');
    expect(json.saved).toBe(2);
    expect(json.rules).toHaveLength(2);
    expect(json.rules.map((r: { id: string }) => r.id)).toEqual(['R1', 'R2']);
    expect(json.rules.every((r: { policyId: string }) => r.policyId === 'authorized-user')).toBe(
      true,
    );
    expect(getRules('authorized-user')).toHaveLength(2);
  });

  it('POST writes exactly one action.executed Event Log entry, attributed to the caller', async () => {
    await POST(
      postRequest({
        policyId: 'authorized-user',
        rules: AU_RULES,
        runId: 'run-ops-1',
        agentId: 'ops-au-policy',
      }),
    );
    const entries = query({ runId: 'run-ops-1' });
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe('action.executed');
    expect(entries[0].actor).toBe('agent');
    expect(entries[0].agentId).toBe('ops-au-policy');
    expect(entries[0].toolName).toBe('rules.save');
    expect(entries[0].inputSummary).toContain('R1');
    expect(entries[0].outputSummary).toContain('2');
  });

  it('POST still logs when the caller supplies no runId/agentId', async () => {
    await POST(postRequest({ policyId: 'authorized-user', rules: AU_RULES }));
    const entries = query();
    expect(entries).toHaveLength(1);
    expect(entries[0].runId.length).toBeGreaterThan(0);
    expect(entries[0].agentId.length).toBeGreaterThan(0);
  });

  it('POST is idempotent on replay — saving twice leaves two rules, not four', async () => {
    await POST(postRequest({ policyId: 'authorized-user', rules: AU_RULES }));
    const second = await POST(postRequest({ policyId: 'authorized-user', rules: AU_RULES }));
    const json = await second.json();
    expect(json.rules).toHaveLength(2);
  });

  it('POST rejects an unknown policyId, an empty rule list, and a malformed rule with 400', async () => {
    expect(
      (await POST(postRequest({ policyId: 'balance-transfer', rules: AU_RULES }))).status,
    ).toBe(400);
    expect((await POST(postRequest({ policyId: 'authorized-user', rules: [] }))).status).toBe(400);
    expect(
      (await POST(postRequest({ policyId: 'authorized-user', rules: [{ id: 'R1' }] }))).status,
    ).toBe(400);
  });

  it('POST rejects a non-JSON body with a clean 400, not a throw', async () => {
    const response = await POST(
      new Request('http://localhost/api/rules', { method: 'POST', body: 'not json' }),
    );
    expect(response.status).toBe(400);
  });

  it('a rejected POST writes nothing to the Event Log', async () => {
    await POST(postRequest({ policyId: 'balance-transfer', rules: AU_RULES }));
    expect(query()).toHaveLength(0);
  });

  it('GET returns an empty list before anything is stored', async () => {
    const json = await (await GET(getRequest())).json();
    expect(json.rules).toEqual([]);
  });

  it('GET narrows to one policy with ?policyId=, and returns every policy without it', async () => {
    await POST(postRequest({ policyId: 'authorized-user', rules: AU_RULES }));
    await POST(
      postRequest({
        policyId: 'card-activation',
        rules: [{ ...AU_RULES[0], id: 'CA-R1', title: 'CA-R1 — Activation standing' }],
      }),
    );

    const scoped = await (await GET(getRequest('?policyId=authorized-user'))).json();
    expect(scoped.rules.map((r: { id: string }) => r.id)).toEqual(['R1', 'R2']);

    const all = await (await GET(getRequest())).json();
    expect(all.rules).toHaveLength(3);
  });

  it('GET rejects an unknown policyId with 400 rather than silently returning everything', async () => {
    const response = await GET(getRequest('?policyId=balance-transfer'));
    expect(response.status).toBe(400);
  });

  it('GET writes nothing to the Event Log', async () => {
    await GET(getRequest());
    expect(query()).toHaveLength(0);
  });
});
