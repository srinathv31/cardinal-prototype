// graph-rehearsal tests. Two groups:
//
//   - "fixture invariants" — plain assertions on the steps array, pinning
//     the constraints graph-rehearsal.ts's header comment promises (no
//     approval/audit/render/stage-action steps, human-watchable pacing,
//     every node cycling through working and done, edges both animating and
//     clearing);
//   - "playback" — an end-to-end ScenarioPlayer pass, fake timers throughout
//     (player.test.ts's convention: the player's one-pending-timer
//     discipline means vi.runAllTimers() drives it deterministically with
//     no real waiting), proving the fixture actually plays clean to
//     completion.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { graphRehearsalScenario } from './graph-rehearsal';
import { ScenarioPlayer } from './player';
import { SENTINEL_NODE_IDS } from './types';
import type { ChatTurnStep, GraphStep } from './types';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const { steps } = graphRehearsalScenario;
const graphSteps = steps.filter((s): s is GraphStep => s.type === 'graphStep');
const narrationSteps = steps.filter(
  (s): s is ChatTurnStep => s.type === 'chatTurn' && s.role === 'agent',
);

describe('graphRehearsalScenario — fixture invariants', () => {
  it('carries no awaitApproval, awaitStageAction, render, or auditWrite steps', () => {
    const forbiddenTypes = new Set(['awaitApproval', 'awaitStageAction', 'render', 'auditWrite']);
    expect(steps.some((s) => forbiddenTypes.has(s.type))).toBe(false);
  });

  it('opens on exactly one actMarker, at index 0', () => {
    const markers = steps.filter((s) => s.type === 'actMarker');
    expect(markers).toHaveLength(1);
    expect(steps[0]).toMatchObject({ type: 'actMarker', act: 1 });
  });

  it('gives every timed step a human-watchable delay (600-1600ms)', () => {
    const timedSteps = steps.filter((s) => 'delayMs' in s);
    expect(timedSteps.length).toBeGreaterThan(0);
    for (const step of timedSteps) {
      const delayMs = (step as { delayMs: number }).delayMs;
      expect(delayMs).toBeGreaterThanOrEqual(600);
      expect(delayMs).toBeLessThanOrEqual(1600);
    }
  });

  it('runs every one of the six SentinelNodeIds through working and done', () => {
    for (const nodeId of SENTINEL_NODE_IDS) {
      const nodeSteps = graphSteps.filter((s) => s.nodeId === nodeId);
      expect(nodeSteps.some((s) => s.nodeState === 'working')).toBe(true);
      expect(nodeSteps.some((s) => s.nodeState === 'done')).toBe(true);
    }
  });

  it('animates edges at least once and clears them at least once', () => {
    const edgeSteps = graphSteps.filter((s) => s.animatedEdges !== undefined);
    expect(edgeSteps.some((s) => (s.animatedEdges?.length ?? 0) > 0)).toBe(true);
    expect(edgeSteps.some((s) => s.animatedEdges?.length === 0)).toBe(true);
  });

  it('only ever references valid SentinelNodeIds in animatedEdges pairs', () => {
    const validIds = new Set<string>(SENTINEL_NODE_IDS);
    for (const step of graphSteps) {
      for (const edge of step.animatedEdges ?? []) {
        expect(validIds.has(edge.from)).toBe(true);
        expect(validIds.has(edge.to)).toBe(true);
      }
    }
  });
});

describe('graphRehearsalScenario — playback', () => {
  it('plays to completion with every node idle, edges cleared, and the closing narration as the headline', () => {
    const player = new ScenarioPlayer(graphRehearsalScenario);

    player.play(); // consumes the sole actMarker synchronously, then runs to the end — nothing else halts playback
    vi.runAllTimers();

    const snapshot = player.getSnapshot();
    expect(snapshot.status).toBe('done');
    for (const nodeId of SENTINEL_NODE_IDS) {
      expect(snapshot.graph.nodes[nodeId]).toBe('idle');
    }
    expect(snapshot.graph.animatedEdges).toEqual([]);

    const finalNarration = narrationSteps.at(-1);
    if (!finalNarration) throw new Error('fixture missing a closing narration step');
    expect(snapshot.headline).toBe(finalNarration.text);
  });

  it('emits exactly one graphStep message per fixture graphStep — nothing dropped', () => {
    const player = new ScenarioPlayer(graphRehearsalScenario);
    player.play();
    vi.runAllTimers();

    const emittedGraphStepCount = player
      .getSnapshot()
      .messages.filter((m) => m.type === 'graphStep').length;
    expect(emittedGraphStepCount).toBe(graphSteps.length);
  });
});
