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
import { formatCurrency } from '@/lib/agents/format';
import { buildMarcus } from '@/lib/soe/seed/marcus';
import { buildSentinelMarcusBt, buildSentinelReplayLog } from '@/lib/soe/seed/sentinel';
import type { Payment } from '@/lib/soe/types';
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

/** Adapter's `getPayments` sort (lib/soe/adapter.ts), reproduced here on the
 * direct seed-builder import so the test fixture matches what the real
 * page.tsx call site hands `buildDemoScenario` (most-recent-first) — not
 * `buildMarcus(ANCHOR).payments`'s own ledger-ascending order. */
function sortPaymentsDescending(payments: Payment[]): Payment[] {
  return [...payments].sort((a, b) => b.dueDate.localeCompare(a.dueDate));
}

/** Act III fixture, built from the same seed builders sentinel.test.ts uses
 * (spec: direct seed-builder imports in tests, matching that file's
 * convention) rather than the adapter, which this scenario module never
 * imports (header comment: zero data-access surface of its own). */
const ACT_III_FIXTURE = {
  btEvent: buildSentinelMarcusBt(ANCHOR),
  payments: sortPaymentsDescending(buildMarcus(ANCHOR).payments),
  partyName: 'Marcus Webb',
};

function buildScenario(): SentinelScenario {
  return buildDemoScenario({
    replayEvents: buildSentinelReplayLog(ANCHOR),
    policy: POLICY,
    actIII: ACT_III_FIXTURE,
  });
}

describe('buildDemoScenario — structure', () => {
  const replayEvents = buildSentinelReplayLog(ANCHOR);
  const scenario = buildDemoScenario({ replayEvents, policy: POLICY, actIII: ACT_III_FIXTURE });
  const act2MarkerIndex = scenario.steps.findIndex((s) => s.type === 'actMarker' && s.act === 2);
  const act3MarkerIndex = scenario.steps.findIndex((s) => s.type === 'actMarker' && s.act === 3);

  it('opens on the Act I marker, holds the Act II and Act III markers mid-scenario (Act III no longer closes the file), and closes on Act III\'s closing narration', () => {
    const markers = scenario.steps.filter((s) => s.type === 'actMarker');
    expect(markers).toHaveLength(3);
    expect(scenario.steps[0]).toMatchObject({ type: 'actMarker', act: 1, title: 'Act I — The gap' });
    expect(act2MarkerIndex).toBeGreaterThan(0);
    expect(scenario.steps[act2MarkerIndex]).toMatchObject({
      type: 'actMarker',
      act: 2,
      title: 'Act II — Policy to production',
    });
    expect(act3MarkerIndex).toBeGreaterThan(act2MarkerIndex);
    expect(scenario.steps[act3MarkerIndex]).toMatchObject({
      type: 'actMarker',
      act: 3,
      title: 'Act III — The catch',
    });
    // The act-3 marker is mid-scenario now, not the last step — Act III's
    // content (W4.3) follows it.
    expect(act3MarkerIndex).toBeLessThan(scenario.steps.length - 1);
    expect(scenario.steps.at(-1)).toMatchObject({ type: 'narration', id: 'n3-close' });
  });

  it('emits exactly the 14 replay events in Act I, in order, none highlighted or badged (Act III replays them again separately, see below)', () => {
    const actOneSteps = scenario.steps.slice(0, act2MarkerIndex);
    const emitSteps = actOneSteps.filter((s): s is EmitEventStep => s.type === 'emitEvent');
    expect(emitSteps).toHaveLength(14);
    expect(emitSteps.map((s) => s.event.eventId)).toEqual(replayEvents.map((e) => e.eventId));
    for (const step of emitSteps) {
      expect(step.highlight).toBeUndefined();
      expect(step.complianceBadge).toBeUndefined();
    }
  });

  it('emits 28 events total across the file — Act I\'s 14 plus Act III\'s replay of the same 14', () => {
    const allEmitSteps = scenario.steps.filter((s) => s.type === 'emitEvent');
    expect(allEmitSteps).toHaveLength(28);
  });

  it('counter ascends 1..14 with violations/flagged at 0 on every pre-finale update in Act I, then the finale reveals 1 violation', () => {
    const actOneSteps = scenario.steps.slice(0, act2MarkerIndex);
    const counterSteps = actOneSteps.filter((s): s is CounterUpdateStep => s.type === 'counterUpdate');
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
  const scenario = buildDemoScenario({
    replayEvents: buildSentinelReplayLog(ANCHOR),
    policy: POLICY,
    actIII: ACT_III_FIXTURE,
  });
  const act2MarkerIndex = scenario.steps.findIndex((s) => s.type === 'actMarker' && s.act === 2);
  const act3MarkerIndex = scenario.steps.findIndex((s) => s.type === 'actMarker' && s.act === 3);
  // Bounded to end BEFORE the act-3 marker — Act III (W4.3) now appends its
  // own content after that marker, and several assertions below (exactly
  // one awaitApproval, exactly six armed graphSteps) would double-count
  // Act III's if this slice ran unbounded to the end of the file.
  const actTwoSteps = scenario.steps.slice(act2MarkerIndex + 1, act3MarkerIndex);

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

// W4.3 — Act III scenario ("the catch"). Structure tests scope to the
// content AFTER the act-3 marker (mirrors Act II's `actTwoSteps` bounding
// above); player-integration tests exercise the whole three-act pass.

describe('Act III — structure', () => {
  const replayEvents = buildSentinelReplayLog(ANCHOR);
  const scenario = buildDemoScenario({ replayEvents, policy: POLICY, actIII: ACT_III_FIXTURE });
  const act3MarkerIndex = scenario.steps.findIndex((s) => s.type === 'actMarker' && s.act === 3);
  const actThreeSteps = scenario.steps.slice(act3MarkerIndex + 1);

  const catchIndex = replayEvents.findIndex((e) => e.kind === 'balance_transfer.initiated');
  const elenaIndex = replayEvents.findIndex((e) => e.kind === 'bt.promo_expiring');
  const violations = replayEvents.filter((e) => e.kind === 'balance_transfer.initiated').length;

  it('opens with railReset, and a zeroing counterUpdate precedes any emitEvent', () => {
    expect(actThreeSteps[0]).toMatchObject({ type: 'railReset' });

    const firstCounterIndex = actThreeSteps.findIndex((s) => s.type === 'counterUpdate');
    const firstEmitIndex = actThreeSteps.findIndex((s) => s.type === 'emitEvent');
    expect(firstCounterIndex).toBeGreaterThan(-1);
    expect(firstCounterIndex).toBeLessThan(firstEmitIndex);

    const zeroingCounter = actThreeSteps[firstCounterIndex] as CounterUpdateStep;
    expect(zeroingCounter.counter).toEqual({ events: 0, violations: 0, flagged: 0 });
  });

  it('emits exactly 14 events matching the replay log in order, exactly one highlighted and one badged, on different events', () => {
    const emitSteps = actThreeSteps.filter((s): s is EmitEventStep => s.type === 'emitEvent');
    expect(emitSteps).toHaveLength(14);
    expect(emitSteps.map((s) => s.event.eventId)).toEqual(replayEvents.map((e) => e.eventId));

    const highlighted = emitSteps.filter((s) => s.highlight === true);
    expect(highlighted).toHaveLength(1);
    expect(highlighted[0].event.eventId).toBe(replayEvents[catchIndex].eventId);

    const badged = emitSteps.filter((s) => s.complianceBadge !== undefined);
    expect(badged).toHaveLength(1);
    expect(badged[0].event.eventId).toBe(replayEvents[elenaIndex].eventId);
    expect(badged[0].complianceBadge).toBe('R3 satisfied — 45-day notice on record');

    expect(highlighted[0].event.eventId).not.toBe(badged[0].event.eventId);
  });

  it('reconciles the counter after every replay emit against the replay log itself, not a hardcoded table', () => {
    const emitSteps = actThreeSteps.filter((s): s is EmitEventStep => s.type === 'emitEvent');

    emitSteps.forEach((emitStep, i) => {
      const emitIndex = actThreeSteps.indexOf(emitStep);
      const counterStep = actThreeSteps[emitIndex + 1];
      if (counterStep.type !== 'counterUpdate') {
        throw new Error(`expected a counterUpdate immediately after replay emit ${i}`);
      }
      const expectedViolations = replayEvents
        .slice(0, i + 1)
        .filter((e) => e.kind === 'balance_transfer.initiated').length;
      expect(counterStep.counter).toEqual({ events: i + 1, violations: expectedViolations, flagged: expectedViolations });
    });
  });

  it('fires the Data Collector exactly twice, each call carrying a distinct detail, with a done graphStep between them', () => {
    const dataCollectorSteps = actThreeSteps.filter(
      (s): s is GraphStep => s.type === 'graphStep' && s.nodeId === 'data-collector',
    );
    const workingSteps = dataCollectorSteps.filter((s) => s.nodeState === 'working');
    expect(workingSteps).toHaveLength(2);
    expect(workingSteps[0].detail).toBeDefined();
    expect(workingSteps[1].detail).toBeDefined();
    expect(workingSteps[0].detail).not.toBe(workingSteps[1].detail);

    const firstWorkingPos = dataCollectorSteps.indexOf(workingSteps[0]);
    const secondWorkingPos = dataCollectorSteps.indexOf(workingSteps[1]);
    const between = dataCollectorSteps.slice(firstWorkingPos + 1, secondWorkingPos);
    expect(between.some((s) => s.nodeState === 'done')).toBe(true);
  });

  it('renders BTEventDetail, PaymentHistoryTable, and both rule citations with hand-reconcilable figures', () => {
    const btDetail = actThreeSteps.find((s) => s.type === 'render' && s.id === 'act3-bt-detail') as
      | RenderStep
      | undefined;
    if (!btDetail || btDetail.instruction.component !== 'BTEventDetail') {
      throw new Error('expected a BTEventDetail render step');
    }
    expect(btDetail.instruction.props.amount).toBe(formatCurrency(ACT_III_FIXTURE.btEvent.transferAmount));

    const paymentsRender = actThreeSteps.find((s) => s.type === 'render' && s.id === 'act3-payments') as
      | RenderStep
      | undefined;
    if (!paymentsRender || paymentsRender.instruction.component !== 'PaymentHistoryTable') {
      throw new Error('expected a PaymentHistoryTable render step');
    }
    const missedRows = paymentsRender.instruction.props.rows.filter((r) => r.flag === 'missed');
    expect(missedRows).toHaveLength(1);

    const r1 = actThreeSteps.find((s) => s.type === 'render' && s.id === 'act3-r1') as RenderStep | undefined;
    if (!r1 || r1.instruction.component !== 'RuleCitation') {
      throw new Error('expected a RuleCitation render step for R1');
    }
    expect(r1.instruction.props.verdict).toBe('violation');
    expect(r1.instruction.props.checks).toHaveLength(2);
    expect(r1.instruction.props.checks.every((c) => c.met)).toBe(true);
    expect(r1.instruction.props.ruleText).toBe(policyRules.find((r) => r.ruleId === 'R1')!.plainEnglish);

    const r2 = actThreeSteps.find((s) => s.type === 'render' && s.id === 'act3-r2') as RenderStep | undefined;
    if (!r2 || r2.instruction.component !== 'RuleCitation') {
      throw new Error('expected a RuleCitation render step for R2');
    }
    expect(r2.instruction.props.verdict).toBe('pass');
    expect(r2.instruction.props.ruleText).toBe(policyRules.find((r) => r.ruleId === 'R2')!.plainEnglish);
  });

  it('gates on exactly one Act III approval scoped to sentinel-demo-act3, with the full audit trail present', () => {
    const approvalSteps = actThreeSteps.filter((s): s is AwaitApprovalStep => s.type === 'awaitApproval');
    expect(approvalSteps).toHaveLength(1);
    expect(approvalSteps[0].id).toBe('act3-hold');
    expect(approvalSteps[0].audit.runId).toBe('sentinel-demo-act3');

    const auditSteps = actThreeSteps.filter((s): s is AuditWriteStep => s.type === 'auditWrite');
    for (const step of auditSteps) {
      expect(step.entry.runId).toBe('sentinel-demo-act3');
    }

    const kinds = auditSteps.map((s) => s.entry.kind);
    expect(kinds).toContain('run.started');
    expect(kinds).toContain('run.finished');
    expect(kinds).toContain('action.executed');
    expect(kinds.filter((k) => k === 'step.completed')).toHaveLength(2);

    const dataCollectorToolExecuted = auditSteps.filter(
      (s) => s.entry.kind === 'tool.executed' && s.entry.agentId === 'sentinel-data-collector',
    );
    expect(dataCollectorToolExecuted).toHaveLength(2);
  });

  it('closes on {14, 1, 1} with the closing caption, the violation count derived from the replay log', () => {
    const counterSteps = actThreeSteps.filter((s): s is CounterUpdateStep => s.type === 'counterUpdate');
    const finale = counterSteps.at(-1)!;
    expect(finale.counter).toEqual({ events: replayEvents.length, violations, flagged: violations });
    expect(finale.caption).toBe('Caught in seconds · human-approved response · full audit trail.');
  });
});

describe('Act III — player integration', () => {
  it('stops the rail at the catch awaiting approval, then completes with all nodes armed and Elena badged', () => {
    const player = new ScenarioPlayer(buildScenario());
    player.jumpToAct(3);
    player.play();
    vi.runAllTimers(); // halts on the awaitApproval hard-block — no timer survives it

    let snapshot = player.getSnapshot();
    expect(snapshot.status).toBe('awaiting-approval');
    expect(snapshot.railEvents).toHaveLength(9); // the night stopped mid-rail at the catch (railReset then 9 emits)
    expect(snapshot.railEvents.at(-1)?.highlight).toBe(true);
    expect(snapshot.counter).toEqual({ events: 9, violations: 1, flagged: 1 });

    const dataCollectorWorkingMessages = snapshot.messages.filter(
      (m) => m.type === 'graphStep' && m.nodeId === 'data-collector' && m.nodeState === 'working',
    );
    expect(dataCollectorWorkingMessages).toHaveLength(2);

    player.resolveApproval('act3-hold', true);
    vi.runAllTimers();

    snapshot = player.getSnapshot();
    expect(snapshot.status).toBe('done');
    expect(snapshot.railEvents).toHaveLength(14);
    expect(snapshot.counter).toEqual({ events: 14, violations: 1, flagged: 1 });

    for (const nodeId of SENTINEL_NODE_IDS) {
      expect(snapshot.graph.nodes[nodeId]).toBe('armed');
    }

    const elenaRailEvent = snapshot.railEvents.find((r) => r.event.kind === 'bt.promo_expiring');
    expect(elenaRailEvent?.complianceBadge).toBe('R3 satisfied — 45-day notice on record');

    expect(snapshot.headline).toBe('Same night. Same events. This time the 2:47 AM transfer never slipped past.');

    const act3AuditKinds = snapshot.auditEntries
      .filter((e) => e.runId === 'sentinel-demo-act3')
      .map((e) => e.kind);
    expect(act3AuditKinds).toContain('run.finished');
  });
});

/** Plays a fresh (or freshly reset) player through all three acts,
 * asserting each act-boundary halt along the way — the full presenter
 * sequence: play, resolve the file-drop, resolve the activation approval,
 * play again into Act III, resolve the hold, done. Shared by both passes in
 * the back-to-back test below (spec: "works back-to-back after one
 * reset"). */
function playThroughAllThreeActs(player: ScenarioPlayer): void {
  player.play(); // consumes the Act I marker
  vi.runAllTimers();
  expect(player.getSnapshot().status).toBe('paused');
  expect(player.getSnapshot().act).toBe(1);

  player.play(); // consumes the Act II marker
  vi.runAllTimers();
  expect(player.getSnapshot().status).toBe('awaiting-stage-action');

  player.resolveStageAction('policy-drop');
  vi.runAllTimers();
  expect(player.getSnapshot().status).toBe('awaiting-approval');

  player.resolveApproval('act2-activate', true);
  vi.runAllTimers();
  expect(player.getSnapshot().status).toBe('paused'); // parked, unconsumed, at the Act III marker
  expect(player.getSnapshot().act).toBe(2);

  player.play(); // consumes the Act III marker
  vi.runAllTimers();
  expect(player.getSnapshot().status).toBe('awaiting-approval');

  player.resolveApproval('act3-hold', true);
  vi.runAllTimers();
  expect(player.getSnapshot().status).toBe('done');
}

describe('Act III — full three-act replay', () => {
  it('plays all three acts back to back, resets fully clean, and plays through identically a second time', () => {
    const player = new ScenarioPlayer(buildScenario());
    const freshSnapshot = player.getSnapshot();

    playThroughAllThreeActs(player);

    player.reset();
    const resetSnapshot = player.getSnapshot();
    expect(resetSnapshot).toEqual(freshSnapshot);
    expect(resetSnapshot.status).toBe('idle');
    expect(resetSnapshot.railEvents).toEqual([]);
    expect(resetSnapshot.contextItems).toEqual([]);
    expect(resetSnapshot.auditEntries).toEqual([]);
    expect(resetSnapshot.counter).toEqual({ events: 0, violations: 0, flagged: 0 });
    expect(resetSnapshot.graph.nodeDetails).toEqual({});
    for (const nodeId of SENTINEL_NODE_IDS) {
      expect(resetSnapshot.graph.nodes[nodeId]).toBe('idle');
    }

    // Repeat the identical pass — proves the reset left nothing behind that
    // would make a second run diverge.
    playThroughAllThreeActs(player);
    expect(player.getSnapshot().status).toBe('done');
  });
});
