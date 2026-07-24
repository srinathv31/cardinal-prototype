// ScenarioPlayer tests (W0.2). Uses `vi.useFakeTimers()` throughout — the
// player's timer discipline (lib/sentinel/scenario/player.ts's header
// comment: one pending setTimeout at a time, armed for the full remaining
// delay, with Date-based pause bookkeeping that fake timers mock in
// lockstep) means `vi.runAllTimers()`/`vi.advanceTimersByTime()` drive it
// deterministically with no real waiting.
//
// Two fixture families:
//   - `smokeScenario` (lib/sentinel/scenario/smoke-scenario.ts) for the
//     tests that exercise real act-marker/graph/narration/approval content
//     end to end (1, 6, 7, 8).
//   - small inline scenarios with clean, easily-halved delay numbers for
//     the mechanic-level tests (2, 3, 4) — keeps the arithmetic legible
//     instead of fighting the smoke scenario's ~65ms Act I sum.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ScenarioPlayer } from './player';
import { smokeScenario } from './smoke-scenario';
import type { SentinelScenario, SentinelStreamMessage } from './types';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function narrationDeltas(messages: SentinelStreamMessage[], id: string) {
  return messages.filter(
    (m): m is Extract<SentinelStreamMessage, { type: 'narrationDelta' }> => m.type === 'narrationDelta' && m.id === id,
  );
}

describe('ScenarioPlayer — smoke scenario end to end', () => {
  it('produces the exact expected message sequence, in seq order, playing to completion', () => {
    const messages: SentinelStreamMessage[] = [];
    const player = new ScenarioPlayer(smokeScenario, { onMessage: (m) => messages.push(m) });

    // Act I: first play() consumes the act 1 marker and runs the rest of
    // Act I's content, then halts at the act 2 marker (presenter-triggered
    // act transitions — brief §4).
    player.play();
    vi.runAllTimers();
    expect(player.getSnapshot().status).toBe('paused');
    expect(player.getSnapshot().act).toBe(1);

    // Act II: second play() consumes the act 2 marker, runs narration +
    // the full graph pass + the render step, and halts on the approval
    // gate (a *different* halt reason than a marker — no extra play()
    // needed to reach it).
    player.play();
    vi.runAllTimers();
    expect(player.getSnapshot().status).toBe('awaiting-approval');

    player.resolveApproval('approval-activate-rules', true);
    vi.runAllTimers();
    expect(player.getSnapshot().status).toBe('paused');
    expect(player.getSnapshot().act).toBe(2);

    // Act III.
    player.play();
    vi.runAllTimers();
    expect(player.getSnapshot().status).toBe('done');

    // seq is strictly increasing from 0, no gaps.
    messages.forEach((m, i) => expect(m.seq).toBe(i));

    // Structural counts.
    const countOf = (type: SentinelStreamMessage['type']) => messages.filter((m) => m.type === type).length;
    expect(countOf('actMarker')).toBe(3);
    expect(countOf('emitEvent')).toBe(3);
    expect(countOf('graphStep')).toBe(12); // 8 in Act II's full pass + 4 in Act III's double-fire
    expect(countOf('render')).toBe(1);
    expect(countOf('approvalRequest')).toBe(1);
    expect(countOf('approvalResolved')).toBe(1);
    expect(countOf('auditWrite')).toBe(2); // the explicit step + the one derived from the approval
    expect(countOf('counterUpdate')).toBe(3);

    // Each narration's concatenated deltas equal its source text exactly,
    // chunked at 3 characters, only the last chunk marked done.
    for (const step of smokeScenario.steps) {
      if (step.type !== 'narration') continue;
      const deltas = narrationDeltas(messages, step.id);
      expect(deltas.map((d) => d.delta).join('')).toBe(step.text);
      expect(deltas.slice(0, -1).every((d) => !d.done)).toBe(true);
      expect(deltas.at(-1)?.done).toBe(true);
      expect(deltas.length).toBe(Math.ceil(step.text.length / 3));
    }

    // First message is Act I's marker; last is Act III's closing counter.
    expect(messages[0]).toMatchObject({ type: 'actMarker', act: 1 });
    expect(messages.at(-1)).toMatchObject({
      type: 'counterUpdate',
      counter: { events: 3, violations: 1, flagged: 1 },
    });
  });
});

describe('ScenarioPlayer — speed', () => {
  const speedScenario: SentinelScenario = {
    id: 'speed-test',
    steps: [
      { type: 'actMarker', act: 1, title: 'A' },
      { type: 'counterUpdate', delayMs: 40, counter: { events: 1, violations: 0, flagged: 0 } },
      { type: 'counterUpdate', delayMs: 20, counter: { events: 2, violations: 0, flagged: 0 } },
    ],
  };

  it('setSpeed(2) halves every subsequent wait', () => {
    const at1x = new ScenarioPlayer(speedScenario);
    at1x.play();
    vi.advanceTimersByTime(60); // 40 + 20
    expect(at1x.getSnapshot().status).toBe('done');
    expect(at1x.getSnapshot().counter).toEqual({ events: 2, violations: 0, flagged: 0 });

    const at2x = new ScenarioPlayer(speedScenario);
    at2x.setSpeed(2);
    at2x.play();
    vi.advanceTimersByTime(30); // half of 60
    expect(at2x.getSnapshot().status).toBe('done');
    expect(at2x.getSnapshot().counter).toEqual({ events: 2, violations: 0, flagged: 0 });

    // Same content in half the (fake) time — the same prefix completes.
    expect(at2x.getSnapshot().messages.map((m) => m.type)).toEqual(at1x.getSnapshot().messages.map((m) => m.type));
  });
});

describe('ScenarioPlayer — approval gate', () => {
  const approvalScenario: SentinelScenario = {
    id: 'tiny-approval',
    steps: [
      { type: 'actMarker', act: 1, title: 'A' },
      { type: 'counterUpdate', delayMs: 10, counter: { events: 1, violations: 0, flagged: 0 } },
      {
        type: 'awaitApproval',
        id: 'approval-1',
        payload: {
          approvalId: 'approval-1',
          toolName: 'doThing',
          title: 'Do the thing',
          description: 'desc',
          evidence: [],
        },
        audit: {
          runId: 'run-1',
          agentId: 'sentinel-test',
          step: 0,
          toolName: 'doThing',
          inputSummary: 'in',
          outputSummary: 'out',
        },
      },
      { type: 'counterUpdate', delayMs: 10, counter: { events: 2, violations: 0, flagged: 0 } },
    ],
  };

  it('hard-blocks on awaitApproval, then approving continues playback', () => {
    const player = new ScenarioPlayer(approvalScenario);
    player.play();
    vi.runAllTimers();

    expect(player.getSnapshot().status).toBe('awaiting-approval');
    const messagesAtGate = player.getSnapshot().messages;
    expect(messagesAtGate.map((m) => m.type)).toEqual(['actMarker', 'counterUpdate', 'approvalRequest']);
    // nothing past the gate emitted yet
    expect(player.getSnapshot().counter).toEqual({ events: 1, violations: 0, flagged: 0 });

    player.resolveApproval('approval-1', true);
    const afterResolve = player.getSnapshot().messages;
    expect(afterResolve.at(-2)).toMatchObject({ type: 'approvalResolved', id: 'approval-1', approved: true });
    expect(afterResolve.at(-1)).toMatchObject({
      type: 'auditWrite',
      entry: expect.objectContaining({ kind: 'approval.granted', actor: 'human', runId: 'run-1' }),
    });

    vi.runAllTimers();
    expect(player.getSnapshot().status).toBe('done');
    expect(player.getSnapshot().counter).toEqual({ events: 2, violations: 0, flagged: 0 });
  });

  it('covers the denied path', () => {
    const player = new ScenarioPlayer(approvalScenario);
    player.play();
    vi.runAllTimers();

    player.resolveApproval('approval-1', false);
    const message = player.getSnapshot().messages.at(-1);
    expect(message).toMatchObject({
      type: 'auditWrite',
      entry: expect.objectContaining({ kind: 'approval.denied', actor: 'human' }),
    });

    const resolvedMessage = player.getSnapshot().messages.at(-2);
    expect(resolvedMessage).toMatchObject({ type: 'approvalResolved', approved: false });

    vi.runAllTimers();
    expect(player.getSnapshot().status).toBe('done');
  });

  it('resolveApproval is a no-op unless that approval is pending', () => {
    const player = new ScenarioPlayer(approvalScenario);
    player.play();
    vi.runAllTimers();

    const before = player.getSnapshot();
    player.resolveApproval('not-the-pending-one', true);
    expect(player.getSnapshot()).toBe(before); // same snapshot identity — nothing changed
  });
});

describe('ScenarioPlayer — pause/resume determinism', () => {
  const pauseScenario: SentinelScenario = {
    id: 'pause-test',
    steps: [
      { type: 'actMarker', act: 1, title: 'A' },
      { type: 'counterUpdate', delayMs: 40, counter: { events: 1, violations: 0, flagged: 0 } },
      { type: 'counterUpdate', delayMs: 40, counter: { events: 2, violations: 0, flagged: 0 } },
    ],
  };

  it('pausing mid-wait then resuming yields the same message log as an uninterrupted run', () => {
    const uninterrupted = new ScenarioPlayer(pauseScenario);
    uninterrupted.play();
    vi.advanceTimersByTime(80);
    expect(uninterrupted.getSnapshot().status).toBe('done');

    const interrupted = new ScenarioPlayer(pauseScenario);
    interrupted.play();
    vi.advanceTimersByTime(20); // mid-wait through the first counterUpdate's 40ms delay
    interrupted.pause();
    const messageCountWhilePaused = interrupted.getSnapshot().messages.length;

    vi.advanceTimersByTime(10_000); // nothing happens while paused
    expect(interrupted.getSnapshot().messages.length).toBe(messageCountWhilePaused);
    expect(interrupted.getSnapshot().status).toBe('paused');

    interrupted.play();
    vi.advanceTimersByTime(60); // remaining 20ms of step 1 + all 40ms of step 2
    expect(interrupted.getSnapshot().status).toBe('done');

    expect(JSON.stringify(interrupted.getSnapshot().messages)).toBe(
      JSON.stringify(uninterrupted.getSnapshot().messages),
    );
  });
});

describe('ScenarioPlayer — reset', () => {
  it('returns to the initial snapshot and cancels pending timers/approvals', () => {
    const fresh = new ScenarioPlayer(smokeScenario);
    const freshSnapshot = fresh.getSnapshot();

    const player = new ScenarioPlayer(smokeScenario);
    player.play();
    vi.runAllTimers();
    player.play();
    vi.runAllTimers();
    expect(player.getSnapshot().status).toBe('awaiting-approval'); // a pending approval exists

    player.reset();
    expect(player.getSnapshot()).toEqual(freshSnapshot);

    // The pending approval was cancelled — resolving it now is a no-op.
    player.resolveApproval('approval-activate-rules', true);
    expect(player.getSnapshot()).toEqual(freshSnapshot);

    // No timer survived reset either — advancing time changes nothing.
    vi.advanceTimersByTime(10_000);
    expect(player.getSnapshot()).toEqual(freshSnapshot);
  });
});

describe('ScenarioPlayer — jumpToAct', () => {
  it('lands paused at the target act marker with prior approvals auto-approved and prior messages present', () => {
    const player = new ScenarioPlayer(smokeScenario);
    player.jumpToAct(3);

    const snapshot = player.getSnapshot();
    expect(snapshot.status).toBe('paused');
    // Act 1 and Act 2's markers were consumed along the way; the Act 3
    // marker itself is left unconsumed ("ends paused at the marker").
    expect(snapshot.act).toBe(2);
    expect(vi.getTimerCount()).toBe(0); // instant — no timers involved

    const types = snapshot.messages.map((m) => m.type);
    expect(types.filter((t) => t === 'actMarker')).toEqual(['actMarker', 'actMarker']);
    expect(types).toContain('approvalRequest');
    expect(types).toContain('approvalResolved');

    const resolved = snapshot.messages.find((m) => m.type === 'approvalResolved');
    expect(resolved).toMatchObject({ approved: true });

    const auditFromApproval = snapshot.auditEntries.find((e) => e.kind === 'approval.granted');
    expect(auditFromApproval).toMatchObject({ actor: 'human' });

    // Narration was emitted whole, in one final delta, not chunked.
    const narrationStep = smokeScenario.steps.find(
      (s) => s.type === 'narration' && s.id === 'narration-act2-open',
    );
    if (narrationStep?.type !== 'narration') throw new Error('fixture missing narration-act2-open');
    const deltas = narrationDeltas(snapshot.messages, 'narration-act2-open');
    expect(deltas).toHaveLength(1);
    expect(deltas[0]).toMatchObject({ delta: narrationStep.text, done: true });

    // All Act I + Act II content landed, including the render step and the
    // full graph pass.
    expect(snapshot.railEvents).toHaveLength(3);
    expect(snapshot.contextItems.some((c) => c.kind === 'render')).toBe(true);
    expect(snapshot.graph.nodes.critic).toBe('done');
  });

  it('jumping to act 1 is a no-op fast-forward (nothing precedes the first marker)', () => {
    const player = new ScenarioPlayer(smokeScenario);
    player.jumpToAct(1);
    const snapshot = player.getSnapshot();
    expect(snapshot.status).toBe('paused');
    expect(snapshot.act).toBe(0);
    expect(snapshot.messages).toHaveLength(0);
  });
});

describe('ScenarioPlayer — act boundaries', () => {
  it('halts at every actMarker until play() is pressed again', () => {
    const player = new ScenarioPlayer(smokeScenario);

    player.play();
    vi.runAllTimers();
    expect(player.getSnapshot().status).toBe('paused');
    expect(player.getSnapshot().act).toBe(1);
    const messageCountAfterAct1 = player.getSnapshot().messages.length;

    vi.advanceTimersByTime(10_000);
    expect(player.getSnapshot().messages.length).toBe(messageCountAfterAct1); // still halted

    player.play();
    expect(player.getSnapshot().act).toBe(2); // marker consumed synchronously on play()
    vi.runAllTimers();
    expect(player.getSnapshot().status).toBe('awaiting-approval');

    player.resolveApproval('approval-activate-rules', true);
    vi.runAllTimers();
    expect(player.getSnapshot().status).toBe('paused');
    expect(player.getSnapshot().act).toBe(2); // act 3 marker not yet consumed

    player.play();
    expect(player.getSnapshot().act).toBe(3);
    vi.runAllTimers();
    expect(player.getSnapshot().status).toBe('done');
  });
});

describe('ScenarioPlayer — determinism', () => {
  it('two players over the same scenario produce byte-identical message logs', () => {
    function runToCompletion(): SentinelStreamMessage[] {
      const player = new ScenarioPlayer(smokeScenario);
      player.play();
      vi.runAllTimers();
      player.play();
      vi.runAllTimers();
      player.resolveApproval('approval-activate-rules', true);
      vi.runAllTimers();
      player.play();
      vi.runAllTimers();
      expect(player.getSnapshot().status).toBe('done');
      return player.getSnapshot().messages;
    }

    const a = runToCompletion();
    const b = runToCompletion();
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

function policyPanelMessages(messages: SentinelStreamMessage[]) {
  return messages.filter(
    (m): m is Extract<SentinelStreamMessage, { type: 'policyPanel' }> => m.type === 'policyPanel',
  );
}

describe('ScenarioPlayer — policyPanel', () => {
  const policyPanelScenario: SentinelScenario = {
    id: 'policy-panel-test',
    steps: [
      { type: 'actMarker', act: 2, title: 'Act II' },
      { type: 'policyPanel', delayMs: 10, panel: 'drop' },
      { type: 'policyPanel', delayMs: 10, panel: 'preview' },
    ],
  };

  it('transitions closed -> drop -> preview per script, publishing matching messages', () => {
    const player = new ScenarioPlayer(policyPanelScenario);
    expect(player.getSnapshot().policyPanel).toBe('closed');

    player.play();
    vi.advanceTimersByTime(10);
    expect(player.getSnapshot().policyPanel).toBe('drop');

    vi.advanceTimersByTime(10);
    expect(player.getSnapshot().policyPanel).toBe('preview');
    expect(player.getSnapshot().status).toBe('done');

    const panels = policyPanelMessages(player.getSnapshot().messages);
    expect(panels.map((m) => m.panel)).toEqual(['drop', 'preview']);
  });

  it('reset returns policyPanel to closed', () => {
    const player = new ScenarioPlayer(policyPanelScenario);
    player.play();
    vi.runAllTimers();
    expect(player.getSnapshot().policyPanel).toBe('preview');

    player.reset();
    expect(player.getSnapshot().policyPanel).toBe('closed');
  });
});

describe('ScenarioPlayer — awaitStageAction', () => {
  const stageActionScenario: SentinelScenario = {
    id: 'stage-action-test',
    steps: [
      { type: 'actMarker', act: 2, title: 'Act II' },
      { type: 'counterUpdate', delayMs: 10, counter: { events: 1, violations: 0, flagged: 0 } },
      { type: 'awaitStageAction', id: 'stage-action-1', action: 'policy-drop' },
      { type: 'counterUpdate', delayMs: 10, counter: { events: 2, violations: 0, flagged: 0 } },
    ],
  };

  it('hard-blocks with pendingStageAction set; timed steps after it do not run until resolved', () => {
    const player = new ScenarioPlayer(stageActionScenario);
    player.play();
    vi.runAllTimers();

    expect(player.getSnapshot().status).toBe('awaiting-stage-action');
    expect(player.getSnapshot().pendingStageAction).toEqual({ id: 'stage-action-1', action: 'policy-drop' });
    expect(player.getSnapshot().counter).toEqual({ events: 1, violations: 0, flagged: 0 });

    const messagesAtGate = player.getSnapshot().messages;
    expect(messagesAtGate.map((m) => m.type)).toEqual(['actMarker', 'counterUpdate', 'stageActionRequest']);

    // Nothing past the gate emitted yet, even after a long wait.
    vi.advanceTimersByTime(10_000);
    expect(player.getSnapshot().status).toBe('awaiting-stage-action');
    expect(player.getSnapshot().counter).toEqual({ events: 1, violations: 0, flagged: 0 });
  });

  it('resolveStageAction is a no-op unless that stage action is pending', () => {
    const player = new ScenarioPlayer(stageActionScenario);
    player.play();
    vi.runAllTimers();

    const before = player.getSnapshot();
    player.resolveStageAction('not-the-pending-one');
    expect(player.getSnapshot()).toBe(before); // same snapshot identity — nothing changed
  });

  it('resolveStageAction with the correct id publishes stageActionResolved, resumes, and continues', () => {
    const player = new ScenarioPlayer(stageActionScenario);
    player.play();
    vi.runAllTimers();

    player.resolveStageAction('stage-action-1');
    const afterResolve = player.getSnapshot().messages;
    expect(afterResolve.at(-1)).toMatchObject({ type: 'stageActionResolved', id: 'stage-action-1' });
    expect(player.getSnapshot().pendingStageAction).toBeNull();
    expect(player.getSnapshot().status).toBe('playing');

    vi.runAllTimers();
    expect(player.getSnapshot().status).toBe('done');
    expect(player.getSnapshot().counter).toEqual({ events: 2, violations: 0, flagged: 0 });
  });

  it('play() is a no-op while awaiting-stage-action', () => {
    const player = new ScenarioPlayer(stageActionScenario);
    player.play();
    vi.runAllTimers();

    const before = player.getSnapshot();
    player.play();
    expect(player.getSnapshot()).toBe(before); // same snapshot identity — nothing changed
  });
});

describe('ScenarioPlayer — jumpToAct auto-resolves awaitStageAction', () => {
  const jumpStageActionScenario: SentinelScenario = {
    id: 'jump-stage-action-test',
    steps: [
      { type: 'actMarker', act: 1, title: 'Act I' },
      { type: 'awaitStageAction', id: 'stage-action-jump', action: 'policy-drop' },
      { type: 'counterUpdate', delayMs: 10, counter: { events: 1, violations: 0, flagged: 0 } },
      { type: 'actMarker', act: 2, title: 'Act II' },
    ],
  };

  it('auto-resolves an awaitStageAction encountered mid-jump and lands correctly', () => {
    const player = new ScenarioPlayer(jumpStageActionScenario);
    player.jumpToAct(2);

    const snapshot = player.getSnapshot();
    expect(snapshot.status).toBe('paused');
    expect(snapshot.act).toBe(1); // Act I's marker was consumed; Act II's is left unconsumed
    expect(vi.getTimerCount()).toBe(0); // instant — no timers involved

    const types = snapshot.messages.map((m) => m.type);
    expect(types).toContain('stageActionRequest');
    expect(types).toContain('stageActionResolved');
    expect(snapshot.pendingStageAction).toBeNull();
    expect(snapshot.counter).toEqual({ events: 1, violations: 0, flagged: 0 });
  });
});

describe('ScenarioPlayer — same-id render replacement', () => {
  const renderReplaceScenario: SentinelScenario = {
    id: 'render-replace-test',
    steps: [
      { type: 'actMarker', act: 2, title: 'Act II' },
      {
        type: 'render',
        delayMs: 10,
        id: 'render-before',
        instruction: {
          component: 'MetricRow',
          props: { metrics: [{ label: 'Before', value: '1', tone: 'neutral' }] },
        },
      },
      {
        type: 'render',
        delayMs: 10,
        id: 'render-rule-1',
        instruction: {
          component: 'RuleDiff',
          props: {
            title: 'BT-Servicing-Policy-2026 → extracted rules',
            status: 'proposed',
            rules: [
              {
                ruleId: 'R1',
                title: 'No transfer within 60 days of a missed payment',
                excerpt: { sectionHeading: 'New Transfer Eligibility', quote: 'quote text' },
                plainEnglish: 'plain english',
                machine: {
                  ruleId: 'R1',
                  datasetsTouched: ['payments', 'balance_transfers'],
                  evaluationTrigger: 'balance_transfer.initiated',
                },
                validated: false,
              },
            ],
          },
        },
      },
      {
        type: 'render',
        delayMs: 10,
        id: 'render-after',
        instruction: {
          component: 'MetricRow',
          props: { metrics: [{ label: 'After', value: '1', tone: 'neutral' }] },
        },
      },
      {
        // Same id as the second step above — REPLACES it in place.
        type: 'render',
        delayMs: 10,
        id: 'render-rule-1',
        instruction: {
          component: 'RuleDiff',
          props: {
            title: 'BT-Servicing-Policy-2026 → extracted rules',
            status: 'active',
            rules: [
              {
                ruleId: 'R1',
                title: 'No transfer within 60 days of a missed payment',
                excerpt: { sectionHeading: 'New Transfer Eligibility', quote: 'quote text' },
                plainEnglish: 'plain english',
                machine: {
                  ruleId: 'R1',
                  datasetsTouched: ['payments', 'balance_transfers'],
                  evaluationTrigger: 'balance_transfer.initiated',
                },
                validated: true,
              },
            ],
          },
        },
      },
    ],
  };

  it('replaces the same-id item in place, sandwiched at its original position, not appended', () => {
    const player = new ScenarioPlayer(renderReplaceScenario);
    player.play();
    vi.runAllTimers();

    const renderItems = player.getSnapshot().contextItems.filter((item) => item.kind === 'render');
    expect(renderItems).toHaveLength(3); // render-before, render-rule-1 (replaced), render-after — not 4

    expect(renderItems.map((item) => item.id)).toEqual(['render-before', 'render-rule-1', 'render-after']);

    const ruleItem = renderItems[1];
    if (ruleItem.kind !== 'render') throw new Error('expected a render item');
    expect(ruleItem.instruction).toMatchObject({ component: 'RuleDiff', props: { status: 'active' } });
  });

  it('still publishes one render message per step, even though one replaces', () => {
    const player = new ScenarioPlayer(renderReplaceScenario);
    player.play();
    vi.runAllTimers();

    const renderMessages = player.getSnapshot().messages.filter((m) => m.type === 'render');
    expect(renderMessages).toHaveLength(4);
  });

  it('different ids still append', () => {
    const player = new ScenarioPlayer(renderReplaceScenario);
    player.play();
    vi.runAllTimers();

    const ids = player.getSnapshot().contextItems.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length); // no duplicate ids landed
  });
});

describe('ScenarioPlayer — armed node state', () => {
  const armedScenario: SentinelScenario = {
    id: 'armed-test',
    steps: [
      { type: 'actMarker', act: 2, title: 'Act II' },
      { type: 'graphStep', delayMs: 10, nodeId: 'orchestrator', nodeState: 'armed' },
    ],
  };

  it('an armed graphStep flows through to the snapshot', () => {
    const player = new ScenarioPlayer(armedScenario);
    player.play();
    vi.runAllTimers();

    expect(player.getSnapshot().graph.nodes.orchestrator).toBe('armed');
    const graphMessages = player.getSnapshot().messages.filter((m) => m.type === 'graphStep');
    expect(graphMessages.at(-1)).toMatchObject({ nodeState: 'armed' });
  });
});
