// POST /api/sentinel/remediate — Act III's mock bulk execution (brief §6c,
// W3.2). Mirrors app/api/sentinel/audit/route.ts's seam: the ScenarioPlayer
// itself never fetches (lib/sentinel/scenario/player.ts is network-free by
// design); the stage subscribes to the player's messages and calls this
// route itself once the presenter approves.
//
// This is a MOCK execution — it never mutates lib/soe's seed data (CLAUDE.md
// "Sentinel seed additions are additive"; there is no seed-mutation path for
// the AU portfolio at all). What it does do for real: derive the outcome
// counters from lib/sentinel/exception-fixture.ts (never from a literal in
// this file — brief §6c: "removed: 87, accountsTouched: 74,
// notificationsQueued: 74 come from the fixture, not from literals in the
// route") and write one real `action.executed` entry to the shared Event
// Log (lib/events/store.ts), exactly as the audit route does.
//
// Determinism (brief §9 — "confirmation ids ... byte-identical across
// replays"): `confirmationId` and `reportId` are pure functions of the
// fixture's own `reportId`, never of `runId`, wall-clock time, or
// `Math.random()`. Two POSTs at the same demo anchor — regardless of which
// run they're attributed to in the audit log — return byte-identical
// `{ status, confirmationId, removed, accountsTouched, notificationsQueued,
// reportId }` bodies. Only the audit trail (this route's side effect, not
// its response) varies with `runId`/`agentId`, the same way `tools.ts`'s
// `chg-${accountId}-${proposedDueDayOfMonth}` idiom keeps a tool's
// confirmation id independent of when or how many times it's called.
//
// A failed or offline write must never affect playback (brief §6c) — that
// guarantee lives in the STAGE's fetch call (`.catch(() => {})`, as
// stage.tsx already does for audit writes), not here: this route always
// either succeeds or returns a clean error status, and never throws past
// its own boundary.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAuExceptionFixture } from '@/lib/sentinel/exception-fixture';
import { append } from '@/lib/events/store';

const remediateRequestSchema = z.object({
  runId: z.string().min(1),
  agentId: z.string().startsWith('sentinel'),
});

/** `rem-${fixture.reportId}` — a pure function of the fixture's own
 * (already-deterministic) reportId, so it never depends on request
 * plumbing like `runId` (see module header). */
function buildConfirmationId(reportId: string): string {
  return `rem-${reportId}`;
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be JSON.' }, { status: 400 });
  }

  const parsed = remediateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const { runId, agentId } = parsed.data;

  const fixture = await getAuExceptionFixture();
  const removed = fixture.totalExceptions;
  const accountsTouched = fixture.accountsAffected;
  // One notification per affected account's primary cardholder (brief §3
  // beat 7: "notify 74 primary cardholders") — same denominator as
  // accountsTouched, derived from the fixture rather than restated.
  const notificationsQueued = fixture.accountsAffected;
  const confirmationId = buildConfirmationId(fixture.reportId);

  append({
    runId,
    agentId,
    step: -1,
    kind: 'action.executed',
    toolName: 'au-policy.remediate',
    inputSummary: `Remove ${removed} authorized users from ${accountsTouched} accounts and notify ${accountsTouched} primary cardholders`,
    outputSummary: `confirmationId ${confirmationId} · reportId ${fixture.reportId} · ${notificationsQueued} notifications queued`,
    actor: 'agent',
  });

  return NextResponse.json({
    status: 'executed' as const,
    confirmationId,
    removed,
    accountsTouched,
    notificationsQueued,
    reportId: fixture.reportId,
  });
}
