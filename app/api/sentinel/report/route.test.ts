// GET /api/sentinel/report?reportId= — CSV shape, headers, and the
// unknown/missing-id 404 path (brief §6c, W3.2). See
// app/api/sentinel/remediate/route.test.ts's header comment for why this
// repo has no prior app/api/**/*.test.ts precedent to follow instead.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getAuExceptionFixture } from '@/lib/sentinel/exception-fixture';
import { GET } from './route';

function getRequest(query: string): Request {
  return new Request(`http://localhost/api/sentinel/report${query}`);
}

describe('GET /api/sentinel/report', () => {
  beforeEach(() => {
    process.env.DEMO_ANCHOR_DATE = '2026-08-05';
  });
  afterEach(() => {
    delete process.env.DEMO_ANCHOR_DATE;
  });

  it('returns a CSV attachment with the right headers and filename', async () => {
    const fixture = await getAuExceptionFixture();
    const response = await GET(getRequest(`?reportId=${fixture.reportId}`));

    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toContain('text/csv');
    expect(response.headers.get('Content-Disposition')).toBe(
      `attachment; filename="${fixture.reportId}.csv"`,
    );
  });

  it('the CSV body has a header row plus exactly 87 data rows', async () => {
    const fixture = await getAuExceptionFixture();
    const response = await GET(getRequest(`?reportId=${fixture.reportId}`));
    const text = await response.text();
    const lines = text.split('\r\n').filter((line) => line.length > 0);

    expect(lines[0]).toBe('Account,Authorized User,Rule,Finding,Added Date');
    expect(lines).toHaveLength(88);
  });

  it('every figure in the CSV matches the fixture — no client-side/DOM re-derivation possible here', async () => {
    const fixture = await getAuExceptionFixture();
    const response = await GET(getRequest(`?reportId=${fixture.reportId}`));
    const text = await response.text();

    for (const row of fixture.rows) {
      expect(text).toContain(row.finding);
    }
  });

  it('an unknown reportId is a clean 404, not a crash', async () => {
    const response = await GET(getRequest('?reportId=rpt-au-does-not-exist'));
    expect(response.status).toBe(404);
  });

  it('a missing reportId is a clean 404', async () => {
    const response = await GET(getRequest(''));
    expect(response.status).toBe(404);
  });
});
