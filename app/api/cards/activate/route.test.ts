// POST /api/cards/activate — request/response shape, determinism, and
// audit-write coverage (DEMO_THESIS.md Use case 3; DEMO_BUILD_PLAN.md
// "Endpoints"). Modeled on app/api/sentinel/remediate/route.test.ts's own
// conventions: call the exported route handler directly with a real
// (web-standard) `Request`, no test-only mocking layer.
//
// 'acct-patel' / 'acct-marcus' are hardcoded here rather than imported —
// same convention lib/soe/adapter.test.ts documents ("not imported directly
// ... same routing-id convention every agent's script.ts already follows").

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { query, reset } from '@/lib/events/store';
import { resetSoeState } from '@/lib/soe';
import { POST } from './route';

function postRequest(body: unknown): Request {
  return new Request('http://localhost/api/cards/activate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/cards/activate', () => {
  beforeEach(() => {
    process.env.DEMO_ANCHOR_DATE = '2026-08-05';
    resetSoeState();
    reset();
  });
  afterEach(() => {
    delete process.env.DEMO_ANCHOR_DATE;
    resetSoeState();
    reset();
  });

  describe('happy path — persona "happy" (Anand Patel, acct-patel)', () => {
    it('returns activated with a non-empty deterministic confirmationId', async () => {
      const response = await POST(postRequest({ persona: 'happy' }));
      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.status).toBe('activated');
      expect(typeof json.confirmationId).toBe('string');
      expect(json.confirmationId.length).toBeGreaterThan(0);
      expect(json.ruleId).toBeUndefined();
      expect(json.finding).toBeUndefined();
    });

    it('two calls (even under different runIds) return byte-identical response bodies', async () => {
      const first = await POST(postRequest({ persona: 'happy', runId: 'run-a' }));
      const second = await POST(postRequest({ persona: 'happy', runId: 'run-b' }));
      expect(JSON.stringify(await second.json())).toBe(JSON.stringify(await first.json()));
    });
  });

  describe('blocked path — persona "blocked" (Marcus Webb, acct-marcus)', () => {
    it('returns blocked with ruleId CA-R1 and a finding citing his past-due state', async () => {
      const response = await POST(postRequest({ persona: 'blocked' }));
      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.status).toBe('blocked');
      expect(json.ruleId).toBe('CA-R1');
      expect(typeof json.finding).toBe('string');
      expect(json.finding).toContain('past-due');
      expect(json.finding).toContain('missed');
      expect(json.confirmationId).toBeUndefined();
    });

    it('two calls return byte-identical response bodies', async () => {
      const first = await POST(postRequest({ persona: 'blocked' }));
      const second = await POST(postRequest({ persona: 'blocked' }));
      expect(JSON.stringify(await second.json())).toBe(JSON.stringify(await first.json()));
    });
  });

  it('writes exactly one action.executed audit entry per call, attributed to the request runId', async () => {
    await POST(postRequest({ persona: 'happy', runId: 'run-audit-check', agentId: 'servicing-test' }));
    const entries = query({ runId: 'run-audit-check' });
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe('action.executed');
    expect(entries[0].actor).toBe('agent');
    expect(entries[0].agentId).toBe('servicing-test');
  });

  it('defaults runId/agentId when omitted from the request body', async () => {
    await POST(postRequest({ persona: 'blocked' }));
    const entries = query({ agentId: 'servicing-card-activation' });
    expect(entries.length).toBeGreaterThan(0);
  });

  it('rejects a body missing persona with a clean 400, not a throw', async () => {
    const response = await POST(postRequest({}));
    expect(response.status).toBe(400);
  });

  it('rejects an invalid persona value', async () => {
    const response = await POST(postRequest({ persona: 'villain' }));
    expect(response.status).toBe(400);
  });

  it('rejects a non-JSON body with a clean 400', async () => {
    const response = await POST(
      new Request('http://localhost/api/cards/activate', { method: 'POST', body: 'not json' }),
    );
    expect(response.status).toBe(400);
  });
});
