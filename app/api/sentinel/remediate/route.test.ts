// POST /api/sentinel/remediate — request/response shape, determinism, and
// audit-write coverage (brief §6c, W3.2). Modeled on
// app/api/sentinel/audit/route.ts's own conventions (Request in,
// NextResponse out) — there is no existing app/api/**/*.test.ts precedent in
// this repo to follow, so this file establishes the pattern: call the
// exported route handler directly with a real (web-standard) `Request`,
// exactly as Next.js itself invokes it, no test-only mocking layer needed.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getAuExceptionFixture } from '@/lib/sentinel/exception-fixture';
import { query, reset } from '@/lib/events/store';
import { POST } from './route';

function postRequest(body: unknown): Request {
  return new Request('http://localhost/api/sentinel/remediate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/sentinel/remediate', () => {
  beforeEach(() => {
    process.env.DEMO_ANCHOR_DATE = '2026-08-05';
    reset();
  });
  afterEach(() => {
    delete process.env.DEMO_ANCHOR_DATE;
    reset();
  });

  it('returns the counters straight from the fixture, never a literal in the route', async () => {
    const fixture = await getAuExceptionFixture();
    const response = await POST(
      postRequest({ runId: 'run-act3', agentId: 'sentinel-approval-gate' }),
    );
    expect(response.status).toBe(200);
    const json = await response.json();

    expect(json.status).toBe('executed');
    expect(json.removed).toBe(fixture.totalExceptions);
    expect(json.accountsTouched).toBe(fixture.accountsAffected);
    expect(json.notificationsQueued).toBe(fixture.accountsAffected);
    expect(json.reportId).toBe(fixture.reportId);
    expect(typeof json.confirmationId).toBe('string');
    expect(json.confirmationId.length).toBeGreaterThan(0);
  });

  it('two calls (even under different runIds) return byte-identical response bodies', async () => {
    const first = await POST(postRequest({ runId: 'run-a', agentId: 'sentinel-approval-gate' }));
    const second = await POST(postRequest({ runId: 'run-b', agentId: 'sentinel-approval-gate' }));

    const firstJson = await first.json();
    const secondJson = await second.json();
    expect(JSON.stringify(secondJson)).toBe(JSON.stringify(firstJson));
  });

  it('writes exactly one action.executed audit entry per call, attributed to the request runId', async () => {
    await POST(postRequest({ runId: 'run-audit-check', agentId: 'sentinel-approval-gate' }));
    const entries = query({ runId: 'run-audit-check' });
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe('action.executed');
    expect(entries[0].actor).toBe('agent');
    expect(entries[0].agentId).toBe('sentinel-approval-gate');
  });

  it('rejects a body missing runId/agentId with a clean 400, not a throw', async () => {
    const response = await POST(postRequest({}));
    expect(response.status).toBe(400);
  });

  it('rejects an agentId that does not start with "sentinel"', async () => {
    const response = await POST(postRequest({ runId: 'run-x', agentId: 'ops-console' }));
    expect(response.status).toBe(400);
  });

  it('rejects a non-JSON body with a clean 400', async () => {
    const response = await POST(
      new Request('http://localhost/api/sentinel/remediate', {
        method: 'POST',
        body: 'not json',
      }),
    );
    expect(response.status).toBe(400);
  });
});
