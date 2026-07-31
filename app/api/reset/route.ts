// POST /api/reset — demo reset control (brief §8.5): clears the server state
// stores that can drift from their opening snapshot — the Event Log
// (lib/events/store.ts); as of v3's servicing chatbot (W4.1,
// CARDINAL_V3_AU_BRIEF.md §7c), the cached SOE db, so a prior
// `updatePartyContact` mutation doesn't survive a reset; and, as of the
// demo-aug4 policy build, the rule store (lib/rules/store.ts), so a replay
// opens back at "no rules configured" and the upload → approve → query beat
// plays the same way the second time — so the next full page load of `/`
// opens clean. Client run state (useChat sessions, open tabs) lives only in
// React state, so it's cleared by the full navigation the caller does after
// this resolves, not by anything here. No GET — this mutates state and must
// not be triggerable by prefetch/link-crawling.

import { NextResponse } from 'next/server';
import { reset } from '@/lib/events/store';
import { resetRules } from '@/lib/rules/store';
import { resetSoeState } from '@/lib/soe/adapter';

export async function POST(): Promise<Response> {
  resetSoeState();
  resetRules();
  reset();
  return NextResponse.json({ ok: true });
}
