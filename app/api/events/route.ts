// GET /api/events?runId=&agentId=&since= (docs/wire-contract.md §1). A
// read-only window onto the in-memory Event Log — every agent step (via
// lib/events/telemetry.ts) and every human approval decision (via the agent
// stream route) writes to the same store this reads from. The run view
// polls this with a runId while a run is live; the Event Log screen (P3)
// consumes it unfiltered.

import { NextResponse } from 'next/server';
import { query } from '@/lib/events/store';

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const entries = query({
    runId: searchParams.get('runId') ?? undefined,
    agentId: searchParams.get('agentId') ?? undefined,
    since: searchParams.get('since') ?? undefined,
  });
  return NextResponse.json({ entries });
}
