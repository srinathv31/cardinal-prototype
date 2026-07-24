// demo-scenario tests (P1/P3) — validates buildDemoScenario's structural
// contract against the real 14-event replay log (lib/soe/seed/sentinel.ts)
// and the checked-in policy fixtures (lib/sentinel/policy.ts), then
// end-to-end ScenarioPlayer passes proving Act I and Act II actually play
// and park where the brief says they should. Fake timers throughout,
// mirroring player.test.ts's convention: the player's one-pending-timer
// discipline means vi.advanceTimersByTime() drives it deterministically
// with no real waiting.
//
// Anchor: 2026-08-05, one of the two demo anchors sentinel.test.ts pins its
// suite to (CLAUDE.md: "seed arithmetic invariants, pinned at both demo
// anchors"). A single anchor is enough here — buildDemoScenario does no
// date arithmetic of its own, it only shapes whatever replay log and policy
// fixtures it's given.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildSentinelReplayLog } from '@/lib/soe/seed/sentinel';
import { policyDocument, policyRules } from '@/lib/sentinel/policy';
import { buildDemoScenario } from './demo-scenario';
import { ScenarioPlayer } from './player';
import { SENTINEL_NODE_IDS } from './types';
import type {
  AuditWriteStep,
  AwaitApprovalStep,
  AwaitStageActionStep,
  CounterUpdateStep,
  EmitEventStep,
  GraphStep,
  PolicyPanelStep,
  RenderStep,
  SentinelScenario,
} from './types';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const ANCHOR = new Date('2026-08-05T00:00:00.000Z');
const FINALE_CAPTION = 'Detected day 4 by manual sampling — if at all.';
const POLICY = { document: policyDocument, rules: policyRules };

function buildScenario(): SentinelScenario {
  return buildDemoScenario({ replayEvents: buildSentinelReplayLog(ANCHOR), policy: POLICY });
}

describe('buildDemoScenario — structure', () => {
  const replayEvents = buildSentinelReplayLog(ANCHOR);
  const scenario = buildDemoScenario({ replayEvents, policy: POLICY });
  const act2MarkerIndex = scenario.steps.findIndex((s) => s.type === 'actMarker' && s.act === 2);

  it('opens on the Act I marker, holds exactly one Act II marker mid-scenario, and closes on the Act III marker', () => {
    const markers = scenario.steps.filter((s) => s.type === 'actMarker');
    expect(markers).toHaveLength(3);
    expect(scenario.steps[0]).toMatchObject({ type: 'actMarker', act: 1, title: 'Act I — The gap' });
    expect(act2MarkerIndex).toBeGreaterThan(0);
    expect(scenario.steps[act2MarkerIndex]).toMatchObject({
      type: 'actMarker',
      act: 2,
      title: 'Act II — Policy to production',
    });
    expect(scenario.steps.at(-1)).toMatchObject({
      type: 'actMarker',
      act: 3,
      title: 'Act III — The catch',
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

  it('sums Act I alone to within the ~40s budget (brief §3) — Act II adds its own pacing on top', () => {
    const actOneSteps = scenario.steps.slice(0, act2MarkerIndex);
    const totalDelayMs = actOneSteps.reduce((sum, step) => sum + ('delayMs' in step ? step.delayMs : 0), 0);
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

describe('Act II — structure', () => {
  const scenario = buildDemoScenario({ replayEvents: buildSentinelReplayLog(ANCHOR), policy: POLICY });
  const act2MarkerIndex = scenario.steps.findIndex((s) => s.type === 'actMarker' && s.act === 2);
  const actTwoSteps = scenario.steps.slice(act2MarkerIndex + 1);

  it('opens Act II with the policy drawer dropping', () => {
    expect(actTwoSteps[0]).toMatchObject({ type: 'policyPanel', panel: 'drop' });
  });

  it('drives the policy drawer through drop → preview → closed, in that order, and nowhere else', () => {
    const panelSteps = actTwoSteps.filter((s): s is PolicyPanelStep => s.type === 'policyPanel');
    expect(panelSteps.map((s) => s.panel)).toEqual(['drop', 'preview', 'closed']);
  });

  it('gates the file-drop on exactly one awaitStageAction, before any Act II graphStep', () => {
    const stageActionSteps = actTwoSteps.filter((s): s is AwaitStageActionStep => s.type === 'awaitStageAction');
    expect(stageActionSteps).toHaveLength(1);
    expect(stageActionSteps[0].id).toBe('policy-drop');
    expect(stageActionSteps[0].action).toBe('policy-drop');

    const stageActionIndex = actTwoSteps.findIndex((s) => s.type === 'awaitStageAction');
    const firstGraphStepIndex = actTwoSteps.findIndex((s) => s.type === 'graphStep');
    expect(stageActionIndex).toBeLessThan(firstGraphStepIndex);
  });

  it('renders the rule-diff card five times, growing 1 → 2 → 3 rules, validating, then flipping active', () => {
    const renderSteps = actTwoSteps.filter((s): s is RenderStep => s.type === 'render' && s.id === 'rule-diff');
    expect(renderSteps).toHaveLength(5);

    const ruleDiffs = renderSteps.map((s) => {
      if (s.instruction.component !== 'RuleDiff') throw new Error('expected a RuleDiff render step');
      return s.instruction.props;
    });

    expect(ruleDiffs.map((d) => d.rules.length)).toEqual([1, 2, 3, 3, 3]);
    expect(ruleDiffs.map((d) => d.status)).toEqual(['proposed', 'proposed', 'proposed', 'proposed', 'active']);
    expect(ruleDiffs.map((d) => d.rules.every((r) => r.validated))).toEqual([false, false, false, true, true]);
  });

  it('keeps the critic note off every card until validation, and even then only on R1', () => {
    const renderSteps = actTwoSteps.filter((s): s is RenderStep => s.type === 'render' && s.id === 'rule-diff');
    const ruleDiffs = renderSteps.map((s) => {
      if (s.instruction.component !== 'RuleDiff') throw new Error('expected a RuleDiff render step');
      return s.instruction.props;
    });

    ruleDiffs.forEach((diff, i) => {
      const hasCriticNote = i >= 3; // the last two renders — post-validation
      const r1 = diff.rules.find((r) => r.ruleId === 'R1');
      const rest = diff.rules.filter((r) => r.ruleId !== 'R1');

      expect(r1?.criticNote).toBe(hasCriticNote ? policyRules[0].criticNote : undefined);
      for (const rule of rest) expect(rule.criticNote).toBeUndefined();
    });
  });

  it('cites every rule verbatim — the excerpt quote always matches the policyRules fixture exactly', () => {
    const renderSteps = actTwoSteps.filter((s): s is RenderStep => s.type === 'render' && s.id === 'rule-diff');
    for (const step of renderSteps) {
      if (step.instruction.component !== 'RuleDiff') throw new Error('expected a RuleDiff render step');
      for (const rule of step.instruction.props.rules) {
        const fixture = policyRules.find((r) => r.ruleId === rule.ruleId);
        expect(fixture).toBeDefined();
        expect(rule.excerpt.quote).toBe(fixture!.excerpt.quote);
      }
    }
  });

  it('gates activation on exactly one awaitApproval, titled for the audience', () => {
    const approvalSteps = actTwoSteps.filter((s): s is AwaitApprovalStep => s.type === 'awaitApproval');
    expect(approvalSteps).toHaveLength(1);
    expect(approvalSteps[0].id).toBe('act2-activate');
    expect(approvalSteps[0].payload.title).toBe('Activate 3 rules for live enforcement');
  });

  it('sweeps every one of the six graph nodes into the armed state after activation', () => {
    const armedSteps = actTwoSteps.filter(
      (s): s is GraphStep => s.type === 'graphStep' && s.nodeState === 'armed',
    );
    expect(armedSteps).toHaveLength(6);
    expect(new Set(armedSteps.map((s) => s.nodeId))).toEqual(new Set(SENTINEL_NODE_IDS));
  });

  it('renders the Act II counter beat (MetricRow, id act2-counter) after the approval gate', () => {
    const approvalIndex = actTwoSteps.findIndex((s) => s.type === 'awaitApproval');
    const counterIndex = actTwoSteps.findIndex((s) => s.type === 'render' && s.id === 'act2-counter');
    expect(counterIndex).toBeGreaterThan(approvalIndex);

    const counterStep = actTwoSteps[counterIndex] as RenderStep;
    expect(counterStep.instruction).toMatchObject({ component: 'MetricRow' });
  });

  it('writes the full policy-intake audit trail, every entry scoped to a sentinel agent', () => {
    const auditSteps = actTwoSteps.filter((s): s is AuditWriteStep => s.type === 'auditWrite');
    expect(auditSteps.map((s) => s.entry.kind)).toEqual([
      'run.started',
      'step.completed',
      'tool.executed',
      'step.completed',
      'action.executed',
      'run.finished',
    ]);
    for (const step of auditSteps) {
      expect(step.entry.agentId.startsWith('sentinel')).toBe(true);
    }
  });
});

describe('Act II — player integration', () => {
  it('jumpToAct(2) then play() parks at the policy-drop stage action, drawer open', () => {
    const player = new ScenarioPlayer(buildScenario());
    player.jumpToAct(2);
    player.play();
    vi.advanceTimersByTime(5_000); // comfortably past the 500ms to the awaitStageAction gate

    const snapshot = player.getSnapshot();
    expect(snapshot.status).toBe('awaiting-stage-action');
    expect(snapshot.policyPanel).toBe('drop');
    expect(snapshot.pendingStageAction).toEqual({ id: 'policy-drop', action: 'policy-drop' });
  });

  it('resolving the file-drop parks at the activation approval, drawer closed, three proposed rules staged', () => {
    const player = new ScenarioPlayer(buildScenario());
    player.jumpToAct(2);
    player.play();
    vi.advanceTimersByTime(5_000);

    player.resolveStageAction('policy-drop');
    vi.advanceTimersByTime(30_000); // comfortably past parse → draft → validate's ~13s

    const snapshot = player.getSnapshot();
    expect(snapshot.status).toBe('awaiting-approval');
    expect(snapshot.policyPanel).toBe('closed');

    const ruleDiffItem = snapshot.contextItems.find((item) => item.kind === 'render' && item.id === 'rule-diff');
    if (!ruleDiffItem || ruleDiffItem.kind !== 'render' || ruleDiffItem.instruction.component !== 'RuleDiff') {
      throw new Error('expected a RuleDiff render context item');
    }
    expect(ruleDiffItem.instruction.props.status).toBe('proposed');
    expect(ruleDiffItem.instruction.props.rules).toHaveLength(3);
  });

  it('approving activation ends Act II armed and active, fully audited, Act I counter untouched', () => {
    const player = new ScenarioPlayer(buildScenario());
    player.jumpToAct(2);
    player.play();
    vi.advanceTimersByTime(5_000);
    player.resolveStageAction('policy-drop');
    vi.advanceTimersByTime(30_000);

    player.resolveApproval('act2-activate', true);
    vi.advanceTimersByTime(15_000); // comfortably past render → audit → armed sweep → counter → run.finished

    const snapshot = player.getSnapshot();
    expect(snapshot.status).toBe('paused'); // parked, unconsumed, at the Act III marker
    expect(snapshot.act).toBe(2);

    for (const nodeId of SENTINEL_NODE_IDS) {
      expect(snapshot.graph.nodes[nodeId]).toBe('armed');
    }

    const ruleDiffItem = snapshot.contextItems.find((item) => item.kind === 'render' && item.id === 'rule-diff');
    if (!ruleDiffItem || ruleDiffItem.kind !== 'render' || ruleDiffItem.instruction.component !== 'RuleDiff') {
      throw new Error('expected a RuleDiff render context item');
    }
    expect(ruleDiffItem.instruction.props.status).toBe('active');

    const auditKinds = snapshot.auditEntries.map((e) => e.kind);
    expect(auditKinds).toContain('approval.granted');
    expect(auditKinds).toContain('action.executed');
    expect(auditKinds).toContain('run.finished');

    expect(snapshot.counter).toEqual({ events: 14, violations: 1, flagged: 0 });
  });
});
