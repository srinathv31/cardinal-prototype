// ScenarioPlayer tests (P0 W0.5, v3). Uses `vi.useFakeTimers()` throughout —
// the player's timer discipline (lib/sentinel/scenario/player.ts's header
// comment: one pending setTimeout at a time, armed for the full remaining
// delay, with Date-based pause bookkeeping that fake timers mock in
// lockstep) means `vi.runAllTimers()`/`vi.advanceTimersByTime()` drive it
// deterministically with no real waiting.
//
// Two fixture families:
//   - `smokeScenario` (lib/sentinel/scenario/smoke-scenario.ts) for the
//     tests that exercise real act-marker/graph/chatTurn/approval/
//     stage-action content end to end;
//   - small inline scenarios with clean, easily-halved delay numbers for
//     the mechanic-level tests — keeps the arithmetic legible instead of
//     fighting the smoke scenario's full Act I/II/III sum.
//
// v3 replaces v2's `emitEvent`/`railReset`/`narration` coverage with
// `chatTurn`/`conversation` equivalents (docs/v3-migration-map.md §4) and
// adds dedicated coverage for the verbatim-echo rule
// (`resolveStageAction`'s widened `text` parameter, wire-contract §9.2).

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

function graphStepMessages(messages: SentinelStreamMessage[]) {
  return messages.filter(
    (m): m is Extract<SentinelStreamMessage, { type: 'graphStep' }> => m.type === 'graphStep',
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

    // Act II: second play() consumes the act 2 marker, opens the policy
    // drawer, and halts on the mock file-drop gate — a presenter-driven
    // staging beat, not a business decision (brief §6a).
    player.play();
    vi.runAllTimers();
    expect(player.getSnapshot().status).toBe('awaiting-stage-action');
    expect(player.getSnapshot().pendingStageAction).toMatchObject({
      id: 'stage-action-policy-drop',
      action: 'policy-drop',
    });

    player.resolveStageAction('stage-action-policy-drop');
    vi.runAllTimers();
    expect(player.getSnapshot().status).toBe('awaiting-approval');

    player.resolveApproval('approval-activate-rules', true);
    vi.runAllTimers();
    expect(player.getSnapshot().status).toBe('paused');
    expect(player.getSnapshot().act).toBe(2);

    // Act III: third play() consumes the act 3 marker and halts on the
    // conversation rail's prompt gate.
    player.play();
    vi.runAllTimers();
    expect(player.getSnapshot().status).toBe('awaiting-stage-action');
    expect(player.getSnapshot().pendingStageAction).toMatchObject({
      id: 'stage-action-prompt',
      action: 'prompt',
      suggested: 'Find me all the authorized user policy exceptions.',
    });

    player.resolveStageAction('stage-action-prompt', 'Find me all the authorized user policy exceptions.');
    vi.runAllTimers();
    expect(player.getSnapshot().status).toBe('done');

    // seq is strictly increasing from 0, no gaps.
    messages.forEach((m, i) => expect(m.seq).toBe(i));

    // Structural counts.
    const countOf = (type: SentinelStreamMessage['type']) => messages.filter((m) => m.type === type).length;
    expect(countOf('actMarker')).toBe(3);
    expect(countOf('policyPanel')).toBe(2);
    expect(countOf('stageActionRequest')).toBe(2);
    expect(countOf('stageActionResolved')).toBe(2);
    expect(countOf('chatTurn')).toBe(2); // the scripted follow-up user turn + the echoed prompt-gate turn
    expect(countOf('graphStep')).toBe(14); // 8 in Act II's parse pass + 6 in Act III's triple-fire
    expect(countOf('render')).toBe(2); // render-rule-r1, then its same-id replace
    expect(countOf('approvalRequest')).toBe(1);
    expect(countOf('approvalResolved')).toBe(1);
    expect(countOf('auditWrite')).toBe(2); // the explicit step + the one derived from the approval
    expect(countOf('counterUpdate')).toBe(5);

    // Each agent chatTurn's concatenated deltas equal its source text
    // exactly, chunked at 3 characters, only the last chunk marked done.
    for (const step of smokeScenario.steps) {
      if (step.type !== 'chatTurn' || step.role !== 'agent') continue;
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
      counter: { scanned: 1247, exceptions: 87, remediated: 87 },
    });
  });
});

describe('ScenarioPlayer — speed', () => {
  const speedScenario: SentinelScenario = {
    id: 'speed-test',
    steps: [
      { type: 'actMarker', act: 1, title: 'A' },
      { type: 'counterUpdate', delayMs: 40, counter: { scanned: 1, exceptions: 0, remediated: 0 } },
      { type: 'counterUpdate', delayMs: 20, counter: { scanned: 2, exceptions: 0, remediated: 0 } },
    ],
  };

  it('setSpeed(2) halves every subsequent wait', () => {
    const at1x = new ScenarioPlayer(speedScenario);
    at1x.play();
    vi.advanceTimersByTime(60); // 40 + 20
    expect(at1x.getSnapshot().status).toBe('done');
    expect(at1x.getSnapshot().counter).toEqual({ scanned: 2, exceptions: 0, remediated: 0 });

    const at2x = new ScenarioPlayer(speedScenario);
    at2x.setSpeed(2);
    at2x.play();
    vi.advanceTimersByTime(30); // half of 60
    expect(at2x.getSnapshot().status).toBe('done');
    expect(at2x.getSnapshot().counter).toEqual({ scanned: 2, exceptions: 0, remediated: 0 });

    // Same content in half the (fake) time — the same prefix completes.
    expect(at2x.getSnapshot().messages.map((m) => m.type)).toEqual(at1x.getSnapshot().messages.map((m) => m.type));
  });
});

describe('ScenarioPlayer — approval gate', () => {
  const approvalScenario: SentinelScenario = {
    id: 'tiny-approval',
    steps: [
      { type: 'actMarker', act: 1, title: 'A' },
      { type: 'counterUpdate', delayMs: 10, counter: { scanned: 1, exceptions: 0, remediated: 0 } },
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
      { type: 'counterUpdate', delayMs: 10, counter: { scanned: 2, exceptions: 0, remediated: 0 } },
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
    expect(player.getSnapshot().counter).toEqual({ scanned: 1, exceptions: 0, remediated: 0 });

    player.resolveApproval('approval-1', true);
    const afterResolve = player.getSnapshot().messages;
    expect(afterResolve.at(-2)).toMatchObject({ type: 'approvalResolved', id: 'approval-1', approved: true });
    expect(afterResolve.at(-1)).toMatchObject({
      type: 'auditWrite',
      entry: expect.objectContaining({ kind: 'approval.granted', actor: 'human', runId: 'run-1' }),
    });

    vi.runAllTimers();
    expect(player.getSnapshot().status).toBe('done');
    expect(player.getSnapshot().counter).toEqual({ scanned: 2, exceptions: 0, remediated: 0 });
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
      { type: 'counterUpdate', delayMs: 40, counter: { scanned: 1, exceptions: 0, remediated: 0 } },
      { type: 'counterUpdate', delayMs: 40, counter: { scanned: 2, exceptions: 0, remediated: 0 } },
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
  it('returns to the initial snapshot and cancels a pending stage action', () => {
    const fresh = new ScenarioPlayer(smokeScenario);
    const freshSnapshot = fresh.getSnapshot();

    const player = new ScenarioPlayer(smokeScenario);
    player.play();
    vi.runAllTimers();
    player.play();
    vi.runAllTimers();
    expect(player.getSnapshot().status).toBe('awaiting-stage-action'); // a pending stage action exists

    player.reset();
    expect(player.getSnapshot()).toEqual(freshSnapshot);

    // The pending stage action was cancelled — resolving it now is a no-op.
    player.resolveStageAction('stage-action-policy-drop');
    expect(player.getSnapshot()).toEqual(freshSnapshot);

    // No timer survived reset either — advancing time changes nothing.
    vi.advanceTimersByTime(10_000);
    expect(player.getSnapshot()).toEqual(freshSnapshot);
  });

  it('cancels a pending approval too', () => {
    const fresh = new ScenarioPlayer(smokeScenario);
    const freshSnapshot = fresh.getSnapshot();

    const player = new ScenarioPlayer(smokeScenario);
    player.play();
    vi.runAllTimers();
    player.play();
    vi.runAllTimers();
    player.resolveStageAction('stage-action-policy-drop');
    vi.runAllTimers();
    expect(player.getSnapshot().status).toBe('awaiting-approval');

    player.reset();
    expect(player.getSnapshot()).toEqual(freshSnapshot);

    player.resolveApproval('approval-activate-rules', true);
    expect(player.getSnapshot()).toEqual(freshSnapshot);
  });
});

describe('ScenarioPlayer — jumpToAct', () => {
  it('lands paused at the target act marker with prior gates auto-resolved and prior messages present', () => {
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
    expect(types).toContain('stageActionRequest');
    expect(types).toContain('stageActionResolved');
    expect(types).toContain('approvalRequest');
    expect(types).toContain('approvalResolved');

    const resolvedApproval = snapshot.messages.find((m) => m.type === 'approvalResolved');
    expect(resolvedApproval).toMatchObject({ approved: true });

    const auditFromApproval = snapshot.auditEntries.find((e) => e.kind === 'approval.granted');
    expect(auditFromApproval).toMatchObject({ actor: 'human' });

    // The policy-drop gate carries no `suggested`, so jumpToAct's
    // auto-resolve for it publishes no echoed chatTurn (only a `'prompt'`
    // gate with `suggested` does — see the dedicated test below).
    const policyDropResolved = snapshot.messages.find(
      (m) => m.type === 'stageActionResolved' && m.id === 'stage-action-policy-drop',
    );
    if (policyDropResolved?.type !== 'stageActionResolved') throw new Error('expected stageActionResolved');
    expect(policyDropResolved.text).toBeUndefined();

    // Agent narration was emitted whole, in one final delta, not chunked.
    const chatStep = smokeScenario.steps.find(
      (s) => s.type === 'chatTurn' && s.role === 'agent' && s.id === 'chat-act2-open',
    );
    if (chatStep?.type !== 'chatTurn') throw new Error('fixture missing chat-act2-open');
    const deltas = narrationDeltas(snapshot.messages, 'chat-act2-open');
    expect(deltas).toHaveLength(1);
    expect(deltas[0]).toMatchObject({ delta: chatStep.text, done: true });
    expect(snapshot.conversation.find((t) => t.id === 'chat-act2-open')).toMatchObject({
      text: chatStep.text,
      done: true,
      role: 'agent',
    });

    // All Act I + Act II content landed, including the render step and the
    // full graph pass.
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

describe('ScenarioPlayer — jumpToAct auto-resolves awaitStageAction', () => {
  const jumpStageActionScenario: SentinelScenario = {
    id: 'jump-stage-action-test',
    steps: [
      { type: 'actMarker', act: 1, title: 'Act I' },
      { type: 'awaitStageAction', id: 'stage-action-jump', action: 'policy-drop' },
      { type: 'counterUpdate', delayMs: 10, counter: { scanned: 1, exceptions: 0, remediated: 0 } },
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
    expect(snapshot.counter).toEqual({ scanned: 1, exceptions: 0, remediated: 0 });

    // No `suggested` on a policy-drop gate, so nothing was echoed.
    expect(types).not.toContain('chatTurn');
  });
});

describe('ScenarioPlayer — jumpToAct auto-resolves a pending prompt gate using `suggested`', () => {
  const jumpPromptScenario: SentinelScenario = {
    id: 'jump-prompt-test',
    steps: [
      { type: 'actMarker', act: 2, title: 'Act II' },
      {
        type: 'awaitStageAction',
        id: 'stage-action-jump-prompt',
        action: 'prompt',
        suggested: 'Find me all the authorized user policy exceptions.',
      },
      { type: 'counterUpdate', delayMs: 10, counter: { scanned: 1247, exceptions: 87, remediated: 0 } },
      { type: 'actMarker', act: 3, title: 'Act III' },
    ],
  };

  it('echoes `suggested` as the verbatim user turn, then resolves', () => {
    const player = new ScenarioPlayer(jumpPromptScenario);
    player.jumpToAct(3);

    const snapshot = player.getSnapshot();
    expect(snapshot.status).toBe('paused');
    expect(snapshot.act).toBe(2);
    expect(vi.getTimerCount()).toBe(0);

    const echoed = snapshot.messages.find((m) => m.type === 'chatTurn');
    if (echoed?.type !== 'chatTurn') throw new Error('expected an echoed chatTurn message');
    expect(echoed.role).toBe('user');
    expect(echoed.text).toBe('Find me all the authorized user policy exceptions.');

    expect(snapshot.conversation).toContainEqual({
      id: 'stage-action-jump-prompt-prompt',
      role: 'user',
      text: 'Find me all the authorized user policy exceptions.',
      done: true,
    });

    const resolved = snapshot.messages.find((m) => m.type === 'stageActionResolved');
    expect(resolved).toMatchObject({ text: 'Find me all the authorized user policy exceptions.' });

    expect(snapshot.counter).toEqual({ scanned: 1247, exceptions: 87, remediated: 0 });
  });
});

describe('ScenarioPlayer — act boundaries', () => {
  it('halts at every actMarker and every gate until resolved', () => {
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
    expect(player.getSnapshot().status).toBe('awaiting-stage-action');

    player.resolveStageAction('stage-action-policy-drop');
    vi.runAllTimers();
    expect(player.getSnapshot().status).toBe('awaiting-approval');

    player.resolveApproval('approval-activate-rules', true);
    vi.runAllTimers();
    expect(player.getSnapshot().status).toBe('paused');
    expect(player.getSnapshot().act).toBe(2); // act 3 marker not yet consumed

    player.play();
    expect(player.getSnapshot().act).toBe(3);
    vi.runAllTimers();
    expect(player.getSnapshot().status).toBe('awaiting-stage-action');

    player.resolveStageAction('stage-action-prompt', 'Find me all the authorized user policy exceptions.');
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
      player.resolveStageAction('stage-action-policy-drop');
      vi.runAllTimers();
      player.resolveApproval('approval-activate-rules', true);
      vi.runAllTimers();
      player.play();
      vi.runAllTimers();
      player.resolveStageAction('stage-action-prompt', 'Find me all the authorized user policy exceptions.');
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
      { type: 'counterUpdate', delayMs: 10, counter: { scanned: 1, exceptions: 0, remediated: 0 } },
      { type: 'awaitStageAction', id: 'stage-action-1', action: 'policy-drop' },
      { type: 'counterUpdate', delayMs: 10, counter: { scanned: 2, exceptions: 0, remediated: 0 } },
    ],
  };

  it('hard-blocks with pendingStageAction set; timed steps after it do not run until resolved', () => {
    const player = new ScenarioPlayer(stageActionScenario);
    player.play();
    vi.runAllTimers();

    expect(player.getSnapshot().status).toBe('awaiting-stage-action');
    expect(player.getSnapshot().pendingStageAction).toEqual({ id: 'stage-action-1', action: 'policy-drop' });
    expect(player.getSnapshot().counter).toEqual({ scanned: 1, exceptions: 0, remediated: 0 });

    const messagesAtGate = player.getSnapshot().messages;
    expect(messagesAtGate.map((m) => m.type)).toEqual(['actMarker', 'counterUpdate', 'stageActionRequest']);

    // Nothing past the gate emitted yet, even after a long wait.
    vi.advanceTimersByTime(10_000);
    expect(player.getSnapshot().status).toBe('awaiting-stage-action');
    expect(player.getSnapshot().counter).toEqual({ scanned: 1, exceptions: 0, remediated: 0 });
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
    expect(player.getSnapshot().counter).toEqual({ scanned: 2, exceptions: 0, remediated: 0 });
  });

  it('resolveStageAction(id) with no text resolves the gate and appends no user turn', () => {
    const player = new ScenarioPlayer(stageActionScenario);
    player.play();
    vi.runAllTimers();

    const conversationBefore = player.getSnapshot().conversation.length;
    player.resolveStageAction('stage-action-1');
    expect(player.getSnapshot().conversation.length).toBe(conversationBefore); // nothing appended

    const resolved = player.getSnapshot().messages.at(-1);
    expect(resolved).toMatchObject({ type: 'stageActionResolved', id: 'stage-action-1' });
    if (resolved?.type !== 'stageActionResolved') throw new Error('expected stageActionResolved');
    expect(resolved.text).toBeUndefined();
  });

  it('a policy-drop gate ignores submitted text for the echo but still reports it on stageActionResolved', () => {
    const player = new ScenarioPlayer(stageActionScenario);
    player.play();
    vi.runAllTimers();

    const conversationBefore = player.getSnapshot().conversation.length;
    player.resolveStageAction('stage-action-1', 'ignored text');
    expect(player.getSnapshot().conversation.length).toBe(conversationBefore); // no echoed turn — not a 'prompt' gate

    const resolved = player.getSnapshot().messages.at(-1);
    expect(resolved).toMatchObject({ type: 'stageActionResolved', id: 'stage-action-1', text: 'ignored text' });
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

describe('ScenarioPlayer — awaitStageAction: prompt gate', () => {
  const promptScenario: SentinelScenario = {
    id: 'prompt-gate-test',
    steps: [
      { type: 'actMarker', act: 3, title: 'Act III' },
      { type: 'counterUpdate', delayMs: 10, counter: { scanned: 0, exceptions: 0, remediated: 0 } },
      {
        type: 'awaitStageAction',
        id: 'stage-action-prompt-1',
        action: 'prompt',
        suggested: 'Find me all the authorized user policy exceptions.',
      },
      { type: 'counterUpdate', delayMs: 10, counter: { scanned: 1247, exceptions: 87, remediated: 0 } },
    ],
  };

  it('hard-blocks, exposes `suggested` on pendingStageAction, and only the matching id resolves it', () => {
    const player = new ScenarioPlayer(promptScenario);
    player.play();
    vi.runAllTimers();

    expect(player.getSnapshot().status).toBe('awaiting-stage-action');
    expect(player.getSnapshot().pendingStageAction).toEqual({
      id: 'stage-action-prompt-1',
      action: 'prompt',
      suggested: 'Find me all the authorized user policy exceptions.',
    });

    // No timer moves it, even after a long wait.
    vi.advanceTimersByTime(10_000);
    expect(player.getSnapshot().status).toBe('awaiting-stage-action');
    expect(player.getSnapshot().counter).toEqual({ scanned: 0, exceptions: 0, remediated: 0 });

    player.resolveStageAction('not-the-pending-one', 'irrelevant');
    expect(player.getSnapshot().status).toBe('awaiting-stage-action'); // no-op

    player.resolveStageAction('stage-action-prompt-1', 'Find me all the authorized user policy exceptions.');
    vi.runAllTimers();
    expect(player.getSnapshot().status).toBe('done');
    expect(player.getSnapshot().counter).toEqual({ scanned: 1247, exceptions: 87, remediated: 0 });
  });
});

describe('ScenarioPlayer — verbatim-echo rule', () => {
  const echoScenario: SentinelScenario = {
    id: 'echo-test',
    steps: [
      { type: 'actMarker', act: 3, title: 'Act III' },
      {
        type: 'awaitStageAction',
        id: 'stage-action-echo',
        action: 'prompt',
        suggested: 'Find me all the authorized user policy exceptions.',
      },
      { type: 'counterUpdate', delayMs: 10, counter: { scanned: 1247, exceptions: 87, remediated: 0 } },
    ],
  };

  it('echoes whatever was submitted, unmodified, regardless of its relation to `suggested`', () => {
    function runWith(text: string): SentinelStreamMessage[] {
      const player = new ScenarioPlayer(echoScenario);
      player.play();
      vi.runAllTimers();
      player.resolveStageAction('stage-action-echo', text);
      vi.runAllTimers();
      expect(player.getSnapshot().status).toBe('done');
      return player.getSnapshot().messages;
    }

    const suggestedRun = runWith('Find me all the authorized user policy exceptions.');
    // Deliberately nothing like `suggested` — proves the player never
    // string-matches the submission (wire-contract §9.2, §9.5 guarantee 5).
    const arbitraryRun = runWith('asdfgh');

    expect(arbitraryRun).toHaveLength(suggestedRun.length);

    const echoedArbitrary = arbitraryRun.find((m) => m.type === 'chatTurn');
    if (echoedArbitrary?.type !== 'chatTurn') throw new Error('expected an echoed chatTurn message');
    expect(echoedArbitrary.text).toBe('asdfgh');

    const echoedSuggested = suggestedRun.find((m) => m.type === 'chatTurn');
    if (echoedSuggested?.type !== 'chatTurn') throw new Error('expected an echoed chatTurn message');
    expect(echoedSuggested.text).toBe('Find me all the authorized user policy exceptions.');

    // The two logs are identical except for the echoed text (the chatTurn's
    // `text` and the stageActionResolved's `text` field) — everything else
    // about the script, including every seq, is untouched by what was typed.
    for (let i = 0; i < suggestedRun.length; i++) {
      const a = suggestedRun[i];
      const b = arbitraryRun[i];
      expect(a.type).toBe(b.type);
      if (a.type === 'chatTurn' && b.type === 'chatTurn') {
        expect(a.id).toBe(b.id);
        expect(a.role).toBe(b.role);
        continue; // text differs by design
      }
      if (a.type === 'stageActionResolved' && b.type === 'stageActionResolved') {
        expect(a.id).toBe(b.id);
        continue; // text differs by design
      }
      expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    }
  });
});

describe('ScenarioPlayer — chatTurn: user turn', () => {
  const userTurnScenario: SentinelScenario = {
    id: 'user-turn-test',
    steps: [
      { type: 'actMarker', act: 1, title: 'A' },
      {
        type: 'chatTurn',
        delayMs: 10,
        id: 'turn-user-1',
        role: 'user',
        text: 'Find me all the authorized user policy exceptions.',
      },
    ],
  };

  it('appends instantly, verbatim, done:true, and leaves headline untouched', () => {
    const player = new ScenarioPlayer(userTurnScenario);
    const headlineBefore = player.getSnapshot().headline;

    player.play();
    vi.runAllTimers();

    const snapshot = player.getSnapshot();
    expect(snapshot.conversation).toEqual([
      { id: 'turn-user-1', role: 'user', text: 'Find me all the authorized user policy exceptions.', done: true },
    ]);
    expect(snapshot.headline).toBe(headlineBefore); // unchanged — the ticker reports the system, not the presenter

    const chatMessages = snapshot.messages.filter((m) => m.type === 'chatTurn');
    expect(chatMessages).toHaveLength(1);
    expect(chatMessages[0]).toMatchObject({
      role: 'user',
      text: 'Find me all the authorized user policy exceptions.',
    });
  });
});

describe('ScenarioPlayer — chatTurn: agent turn chunking', () => {
  const agentTurnScenario: SentinelScenario = {
    id: 'agent-turn-test',
    steps: [
      { type: 'actMarker', act: 1, title: 'A' },
      {
        type: 'chatTurn',
        delayMs: 10,
        id: 'turn-agent-1',
        role: 'agent',
        text: 'Scanning the portfolio for authorized-user exceptions.',
      },
    ],
  };

  it('chunks into narrationDeltas that reconstruct the text exactly, replaces the same-id turn in place, and drives headline', () => {
    const player = new ScenarioPlayer(agentTurnScenario);
    player.play();
    vi.runAllTimers();

    const snapshot = player.getSnapshot();
    const deltas = narrationDeltas(snapshot.messages, 'turn-agent-1');
    expect(deltas.map((d) => d.delta).join('')).toBe('Scanning the portfolio for authorized-user exceptions.');
    expect(deltas.at(-1)?.done).toBe(true);
    expect(deltas.slice(0, -1).every((d) => !d.done)).toBe(true);

    expect(snapshot.conversation).toHaveLength(1); // in-place replace, not one turn per chunk
    expect(snapshot.conversation[0]).toEqual({
      id: 'turn-agent-1',
      role: 'agent',
      text: 'Scanning the portfolio for authorized-user exceptions.',
      done: true,
    });
    expect(snapshot.headline).toBe('Scanning the portfolio for authorized-user exceptions.');
  });
});

describe('ScenarioPlayer — counterUpdate', () => {
  const counterScenario: SentinelScenario = {
    id: 'counter-test',
    steps: [
      { type: 'actMarker', act: 1, title: 'A' },
      { type: 'counterUpdate', delayMs: 10, counter: { scanned: 962, exceptions: 0, remediated: 0 } },
      {
        type: 'counterUpdate',
        delayMs: 10,
        counter: { scanned: 1247, exceptions: 87, remediated: 74 },
        caption: '1,247 scanned · 87 exceptions · 74 accounts · 1 human approval · full audit trail.',
      },
    ],
  };

  it('drives the reshaped { scanned, exceptions, remediated } counter and its caption', () => {
    const player = new ScenarioPlayer(counterScenario);
    player.play();

    vi.advanceTimersByTime(10);
    expect(player.getSnapshot().counter).toEqual({ scanned: 962, exceptions: 0, remediated: 0 });
    expect(player.getSnapshot().counterCaption).toBeUndefined();

    vi.advanceTimersByTime(10);
    expect(player.getSnapshot().counter).toEqual({ scanned: 1247, exceptions: 87, remediated: 74 });
    expect(player.getSnapshot().counterCaption).toBe(
      '1,247 scanned · 87 exceptions · 74 accounts · 1 human approval · full audit trail.',
    );
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
            title: 'AU-Eligibility-Policy-2026 → extracted rules',
            status: 'proposed',
            rules: [
              {
                ruleId: 'R1',
                title: 'R1 — Product Eligibility',
                excerpt: {
                  sectionHeading: 'Product Eligibility',
                  quote: 'An authorized user may not be added to, or maintained on, a secured card account.',
                },
                plainEnglish:
                  'An authorized user may not be added to, or maintained on, a secured card account.',
                machine: {
                  ruleId: 'R1',
                  datasetsTouched: ['accounts', 'account-party-roles'],
                  evaluationTrigger: 'nightly sweep · current state',
                },
                validated: false,
                // `evaluability` has no runtime default outside an actual
                // zod `.parse()` call, so a hand-built fixture object must
                // set it explicitly — this is a normal drafted rule, not a
                // data-gap row.
                evaluability: 'evaluable',
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
            title: 'AU-Eligibility-Policy-2026 → extracted rules',
            status: 'active',
            rules: [
              {
                ruleId: 'R1',
                title: 'R1 — Product Eligibility',
                excerpt: {
                  sectionHeading: 'Product Eligibility',
                  quote: 'An authorized user may not be added to, or maintained on, a secured card account.',
                },
                plainEnglish:
                  'An authorized user may not be added to, or maintained on, a secured card account.',
                machine: {
                  ruleId: 'R1',
                  datasetsTouched: ['accounts', 'account-party-roles'],
                  evaluationTrigger: 'nightly sweep · current state',
                },
                validated: true,
                evaluability: 'evaluable',
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

describe('ScenarioPlayer — graphStep detail', () => {
  const graphDetailScenario: SentinelScenario = {
    id: 'graph-detail-test',
    steps: [
      { type: 'actMarker', act: 3, title: 'Act III' },
      {
        type: 'graphStep',
        delayMs: 10,
        nodeId: 'data-collector',
        nodeState: 'working',
        detail: 'call 1 of 3 · accounts',
      },
      { type: 'graphStep', delayMs: 10, nodeId: 'orchestrator', nodeState: 'working', detail: 'routing' },
      // No `detail` — clears data-collector's caption per types.ts's
      // GraphStep doc comment, leaving orchestrator's untouched.
      { type: 'graphStep', delayMs: 10, nodeId: 'data-collector', nodeState: 'done' },
    ],
  };

  it('sets nodeDetails[node] on a graphStep with detail, clears it on one without, and leaves other nodes untouched', () => {
    const player = new ScenarioPlayer(graphDetailScenario);
    player.play();

    vi.advanceTimersByTime(10);
    expect(player.getSnapshot().graph.nodeDetails).toEqual({
      'data-collector': 'call 1 of 3 · accounts',
    });

    vi.advanceTimersByTime(10);
    expect(player.getSnapshot().graph.nodeDetails).toEqual({
      'data-collector': 'call 1 of 3 · accounts',
      orchestrator: 'routing',
    });

    vi.advanceTimersByTime(10);
    expect(player.getSnapshot().graph.nodeDetails).toEqual({ orchestrator: 'routing' });
  });

  it('reset() clears the nodeDetails map', () => {
    const player = new ScenarioPlayer(graphDetailScenario);
    player.play();
    vi.advanceTimersByTime(10);
    expect(player.getSnapshot().graph.nodeDetails).toEqual({
      'data-collector': 'call 1 of 3 · accounts',
    });

    player.reset();
    expect(player.getSnapshot().graph.nodeDetails).toEqual({});
  });

  it('publishes detail on the graphStep message when present, and omits it when absent', () => {
    const player = new ScenarioPlayer(graphDetailScenario);
    player.play();
    vi.runAllTimers();

    const messages = graphStepMessages(player.getSnapshot().messages);
    expect(messages).toHaveLength(3);
    expect(messages[0]).toMatchObject({ nodeId: 'data-collector', detail: 'call 1 of 3 · accounts' });
    expect(messages[1]).toMatchObject({ nodeId: 'orchestrator', detail: 'routing' });
    expect(messages[2].detail).toBeUndefined();
  });
});
