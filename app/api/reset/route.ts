// POST /api/reset — demo reset control (brief §8.5): clears the one server
// state store (lib/events/store.ts) so the next full page load of `/` opens
// on a clean Event Log. Client run state (useChat sessions, open tabs) lives
// only in React state, so it's cleared by the full navigation the caller
// does after this resolves, not by anything here. No GET — this mutates
// state and must not be triggerable by prefetch/link-crawling.

import { NextResponse } from 'next/server';
import { reset } from '@/lib/events/store';

export async function POST(): Promise<Response> {
  reset();
  return NextResponse.json({ ok: true });
}
