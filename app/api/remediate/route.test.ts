// POST /api/remediate — proves the new path is the SAME handler as
// /api/sentinel/remediate (a re-export, not a copy), so the two can never
// drift. Behavior itself is covered once, in
// app/api/sentinel/remediate/route.test.ts.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { reset } from '@/lib/events/store';
import { POST as sentinelPOST } from '../sentinel/remediate/route';
import { POST } from './route';

describe('POST /api/remediate', () => {
  beforeEach(() => {
    process.env.DEMO_ANCHOR_DATE = '2026-08-05';
    reset();
  });
  afterEach(() => {
    delete process.env.DEMO_ANCHOR_DATE;
    reset();
  });

  it('is the identical handler function the Sentinel path exports', () => {
    expect(POST).toBe(sentinelPOST);
  });

  it('executes the batch removal at the new path', async () => {
    const response = await POST(
      new Request('http://localhost/api/remediate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ runId: 'run-ops-g2', agentId: 'sentinel-ops' }),
      }),
    );
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.status).toBe('executed');
    expect(json.removed).toBe(87);
    expect(json.accountsTouched).toBe(74);
  });
});
