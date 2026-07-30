// POST /api/cards/activate — the card-activation gate (DEMO_THESIS.md Use
// case 3, customer side; DEMO_BUILD_PLAN.md "Endpoints"). Body is
// `{ persona: 'happy' | 'blocked' }`.
//
// Thin HTTP wrapper (Wave 2 Agent E refactor) over
// lib/sentinel/activate-card.ts's `activateCardForPersona` — the same
// function lib/agents/servicing/tools.ts's `activateCard` tool now calls
// for the customer chatbot's own activation gate (D3, DEMO_BUILD_PLAN.md:
// "tool call = endpoint, implemented once"). This file owns only request
// parsing/validation and HTTP status translation; everything about persona
// mapping, the policy check, the confirmationId, and the Event Log write
// lives in that shared function now. Behavior is unchanged from the
// pre-refactor version — same two response shapes, same defaults, same
// error statuses — so this route's 9 pre-existing tests
// (app/api/cards/activate/route.test.ts) pass untouched.

import { NextResponse } from 'next/server';
import { z } from 'zod';
import { activateCardForPersona } from '@/lib/sentinel/activate-card';

const activateRequestSchema = z.object({
  persona: z.enum(['happy', 'blocked']),
  runId: z.string().min(1).optional(),
  agentId: z.string().min(1).optional(),
});

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be JSON.' }, { status: 400 });
  }

  const parsed = activateRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }
  const { persona } = parsed.data;
  const runId = parsed.data.runId ?? `run-card-activation-${persona}`;
  const agentId = parsed.data.agentId ?? 'servicing-card-activation';

  try {
    const result = await activateCardForPersona(persona, { runId, agentId });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Card activation failed.' },
      { status: 500 },
    );
  }
}
