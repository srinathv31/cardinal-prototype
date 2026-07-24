// Demo scenario (P1, brief §3 Act I / §6) — the REAL demo script, as
// opposed to smoke-scenario.ts's synthetic player-test fixture. For P1 this
// file covers Act I only: the night's 14-event replay, ending paused at the
// Act II marker (brief §4: "Act transitions are presenter-triggered, never
// automatic"). P3/P4 append Act II's policy-to-production sequence and Act
// III's catch to this same steps array — this file grows, it doesn't get
// replaced.
//
// Pure function, not a constant: `buildDemoScenario` takes the replay log as
// data rather than importing it, so this module has zero data-access
// surface of its own — the caller (app/sentinel/page.tsx) does the one
// lib/soe fetch (`getSentinelReplayLog()`) and hands the result in. That
// keeps this file trivially unit-testable (no seed/adapter machinery
// required, see demo-scenario.test.ts) and keeps scenario authoring
// consistent with v1 invariant 5a/5b's spirit: this module never reaches
// into data on its own, it only shapes what it's given.
//
// Act I pacing (brief §6: "surveillance footage, not a slideshow — brisk,
// ambient, slightly boring on purpose until 2:47"): each of the 14 replay
// events gets its own fixed delay from ACT_I_EVENT_DELAYS_MS, index-aligned
// with the replay log's ascending-timestamp order; the table sums to 38.6s.
// A zero-delay counterUpdate follows every emitEvent, ticking the header
// counter up by one — instantaneous, so it never adds its own pause on top
// of the event's.
//
// The punchline is what does NOT happen here: no event carries `highlight`
// or `complianceBadge`. Marcus's 02:47 balance_transfer.initiated — the one
// event that will trip a rule in Act III — is styled identically to the
// other 13 (brief §3 Act I beat 2). `violations` stays 0 through the whole
// replay for the same reason: nothing in Act I judges anything in real
// time. Only the finale counter reveals "1 violation," after the fact,
// because manual sampling caught it late — if at all — and that gap is the
// whole point of Act I. The violation count is computed from the data
// (`kind === 'balance_transfer.initiated'`), never hardcoded, so it stays
// hand-reconcilable against the replay log per brief v2 §5's arithmetic
// rule.

import type { ScenarioStep, SentinelScenario } from './types';
import type { StreamEvent } from '@/lib/soe/types';

/** Per-event pacing for Act I's replay, index-aligned with the 14-event
 * replay log's ascending-timestamp order. Fixed literals only (brief §8:
 * "no randomness anywhere in the scenario path"); sums to 38.6s. */
const ACT_I_EVENT_DELAYS_MS = [
  1600, 2600, 2900, 2700, 3100, 2800, 2600, 3000, 3200, 2900, 2700, 3100, 2800, 2600,
] as const;

/** Beat after the last event: a pause to let "14 events" register before the
 * counter flips to reveal the violation count. */
const ACT_I_FINALE_DELAY_MS = 2200;

const ACT_I_FINALE_CAPTION = 'Detected day 4 by manual sampling — if at all.';

/**
 * Builds the checked-in Sentinel demo scenario. Act I only for P1 — ends
 * paused at the Act II marker; P3/P4 extend `steps` with Act II and Act
 * III's content.
 */
export function buildDemoScenario(data: { replayEvents: StreamEvent[] }): SentinelScenario {
  const { replayEvents } = data;

  const steps: ScenarioStep[] = [{ type: 'actMarker', act: 1, title: 'Act I — The gap' }];

  replayEvents.forEach((event, i) => {
    steps.push({
      type: 'emitEvent',
      delayMs: ACT_I_EVENT_DELAYS_MS[i],
      event,
      // No `highlight`, no `complianceBadge` — see header. Marcus's
      // balance_transfer.initiated event scrolls past exactly like every
      // other event in this list.
    });
    steps.push({
      type: 'counterUpdate',
      delayMs: 0,
      counter: { events: i + 1, violations: 0, flagged: 0 },
    });
  });

  const violations = replayEvents.filter((event) => event.kind === 'balance_transfer.initiated').length;

  steps.push({
    type: 'counterUpdate',
    delayMs: ACT_I_FINALE_DELAY_MS,
    counter: { events: replayEvents.length, violations, flagged: 0 },
    caption: ACT_I_FINALE_CAPTION,
  });

  steps.push({ type: 'actMarker', act: 2, title: 'Act II — Policy to production' });

  return { id: 'sentinel-demo', steps };
}
