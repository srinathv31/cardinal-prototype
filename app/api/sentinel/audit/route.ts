// POST /api/sentinel/audit — Sentinel's ingestion point onto the shared
// Event Log (docs/wire-contract.md §9, brief §5e/§10). Body is
// `Omit<EventLogEntry, 'id' | 'timestamp'>`; `append()` (lib/events/store)
// fills both on success, so a Sentinel entry is byte-compatible with every
// v1 entry the existing Event Log screen already renders.
//
// `agentId` must start with "sentinel" — this keeps the ingestion point
// scoped to the Sentinel stage; the three monitor agents and Ask log
// through their own stream route (app/api/agents/[agentId]/stream/route.ts)
// and have no reason to ever hit this one.
//
// The ScenarioPlayer itself never fetches (lib/sentinel/scenario/player.ts
// is network-free by design) — in P1 the stage subscribes to the player's
// `auditWrite` messages and POSTs each one here itself. This route is the
// other half of that wiring, built now so P1 has somewhere to point.
//
// Modeled on app/api/reset/route.ts and app/api/events/route.ts's
// conventions: NextResponse.json, no framework-level validation beyond zod.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { append } from '@/lib/events/store';
import type { EventLogEntryKind } from '@/lib/events/types';

const EVENT_LOG_ENTRY_KINDS = [
  'run.started',
  'step.completed',
  'tool.executed',
  'approval.requested',
  'approval.granted',
  'approval.denied',
  'action.executed',
  'run.finished',
  'run.failed',
] as const satisfies readonly EventLogEntryKind[];

const auditEntrySchema = z.object({
  runId: z.string().min(1),
  agentId: z.string().startsWith('sentinel'),
  step: z.number().int().min(-1),
  toolName: z.string().optional(),
  inputSummary: z.string().optional(),
  outputSummary: z.string().optional(),
  actor: z.enum(['agent', 'human']),
  kind: z.enum(EVENT_LOG_ENTRY_KINDS),
});

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be JSON.' }, { status: 400 });
  }

  const parsed = auditEntrySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const entry = append(parsed.data);
  return NextResponse.json({ entry });
}
