// demo-scenario tests (P1) — validates buildDemoScenario's structural
// contract against the real 14-event replay log (lib/soe/seed/sentinel.ts),
// then an end-to-end ScenarioPlayer pass proving Act I actually plays and
// parks at the Act II marker. Fake timers throughout, mirroring
// player.test.ts's convention: the player's one-pending-timer discipline
// means vi.advanceTimersByTime() drives it deterministically with no real
// waiting.
//
// Anchor: 2026-08-05, one of the two demo anchors sentinel.test.ts pins its
// suite to (CLAUDE.md: "seed arithmetic invariants, pinned at both demo
// anchors"). A single anchor is enough here — buildDemoScenario does no
// date arithmetic of its own, it only shapes whatever replay log it's given.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildSentinelReplayLog } from '@/lib/soe/seed/sentinel';
import { buildDemoScenario } from './demo-scenario';
import { ScenarioPlayer } from './player';
import type { CounterUpdateStep, EmitEventStep, SentinelScenario } from './types';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const ANCHOR = new Date('2026-08-05T00:00:00.000Z');
const FINALE_CAPTION = 'Detected day 4 by manual sampling — if at all.';

function buildScenario(): SentinelScenario {
  return buildDemoScenario({ replayEvents: buildSentinelReplayLog(ANCHOR) });
}

describe('buildDemoScenario — structure', () => {
  const replayEvents = buildSentinelReplayLog(ANCHOR);
  const scenario = buildDemoScenario({ replayEvents });

  it('opens on the Act I marker, closes on the Act II marker, and has no other markers', () => {
    const markers = scenario.steps.filter((s) => s.type === 'actMarker');
    expect(markers).toHaveLength(2);
    expect(scenario.steps[0]).toMatchObject({ type: 'actMarker', act: 1, title: 'Act I — The gap' });
    expect(scenario.steps.at(-1)).toMatchObject({
      type: 'actMarker',
      act: 2,
      title: 'Act II — Policy to production',
    });
  });

  it('emits exactly the 14 replay events, in order, none highlighted or badged', () => {
    const emitSteps = scenario.steps.filter((s): s is EmitEventStep => s.type === 'emitEvent');
    expect(emitSteps).toHaveLength(14);
    expect(emitSteps.map((s) => s.event.eventId)).toEqual(replayEvents.map((e) => e.eventId));
    for (const step of emitSteps) {
      expect(step.highlight).toBeUndefined();
      expect(step.complianceBadge).toBeUndefined();
    }
  });

  it('counter ascends 1..14 with violations/flagged at 0 on every pre-finale update, then the finale reveals 1 violation', () => {
    const counterSteps = scenario.steps.filter((s): s is CounterUpdateStep => s.type === 'counterUpdate');
    expect(counterSteps).toHaveLength(15); // 14 per-event ticks + 1 finale

    counterSteps.slice(0, -1).forEach((step, i) => {
      expect(step.counter).toEqual({ events: i + 1, violations: 0, flagged: 0 });
      expect(step.delayMs).toBe(0);
      expect(step.caption).toBeUndefined();
    });

    const finale = counterSteps.at(-1)!;
    expect(finale.counter).toEqual({ events: 14, violations: 1, flagged: 0 });
    expect(finale.caption).toBe(FINALE_CAPTION);
  });

  it('sums to within the ~40s Act I budget (brief §3)', () => {
    const totalDelayMs = scenario.steps.reduce((sum, step) => sum + ('delayMs' in step ? step.delayMs : 0), 0);
    expect(totalDelayMs).toBeGreaterThanOrEqual(35_000);
    expect(totalDelayMs).toBeLessThanOrEqual(45_000);
  });
});

describe('buildDemoScenario — ScenarioPlayer integration', () => {
  it('plays Act I to completion and parks at the Act II marker', () => {
    const player = new ScenarioPlayer(buildScenario());
    player.play();
    vi.advanceTimersByTime(60_000); // comfortably past the ~40.8s Act I total

    const snapshot = player.getSnapshot();
    expect(snapshot.status).toBe('paused');
    expect(snapshot.act).toBe(1);
    expect(snapshot.railEvents).toHaveLength(14);
    expect(snapshot.counter).toEqual({ events: 14, violations: 1, flagged: 0 });
    expect(snapshot.counterCaption).toBe(FINALE_CAPTION);
  });

  it('reset() returns to pristine idle', () => {
    const player = new ScenarioPlayer(buildScenario());
    player.play();
    vi.advanceTimersByTime(60_000);
    expect(player.getSnapshot().status).toBe('paused'); // sanity: not still idle

    player.reset();
    const snapshot = player.getSnapshot();
    expect(snapshot.status).toBe('idle');
    expect(snapshot.act).toBe(0);
    expect(snapshot.railEvents).toEqual([]);
    expect(snapshot.counter).toEqual({ events: 0, violations: 0, flagged: 0 });
    expect(snapshot.counterCaption).toBeUndefined();
  });
});
