// GET /api/sentinel/report?reportId= — the downloadable audit artifact
// behind RemediationReport's "Download CSV" control (brief §6c, §5c, W3.2).
// Built server-side from lib/sentinel/exception-fixture.ts — the SAME
// fixture that feeds PolicyExceptionTable and RemediationReport — so this
// route can never show a figure the on-screen table didn't (brief §6c: "it
// must not be assembled client-side from rendered DOM, and no figure in it
// may originate anywhere but the fixture"). Hand-rolled CSV (CLAUDE.md: no
// new dependencies) — `buildAuExceptionCsv` lives in exception-fixture.ts,
// tested there directly against comma/quote/newline fields
// (exception-fixture.test.ts), so this route only has to wire the query
// param and the response headers.
//
// There is exactly one fixture today (the AU scan), so `reportId` here is a
// VALIDATION token, not a lookup key across many stored reports: a request
// for any id other than the current fixture's own `reportId` — including a
// missing one — gets a clean 404, never a crash or a silently-wrong file.

import { NextResponse } from 'next/server';
import { buildAuExceptionCsv, getAuExceptionFixture } from '@/lib/sentinel/exception-fixture';

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const reportId = searchParams.get('reportId');

  if (!reportId) {
    return NextResponse.json({ error: 'reportId query parameter is required.' }, { status: 404 });
  }

  const fixture = await getAuExceptionFixture();
  if (reportId !== fixture.reportId) {
    return NextResponse.json({ error: `No report found for reportId "${reportId}".` }, {
      status: 404,
    });
  }

  const csv = buildAuExceptionCsv(fixture);
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${fixture.reportId}.csv"`,
    },
  });
}
