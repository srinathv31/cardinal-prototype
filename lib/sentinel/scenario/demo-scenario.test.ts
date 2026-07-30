// demo-scenario tests (P1 W1.1-W1.3). Two groups, mirroring
// graph-rehearsal.test.ts's split:
//
//   - "actOneSteps — fixture invariants" — plain assertions on the steps
//     array itself: no forbidden/removed step types, no `graphStep` at all
//     (the graph stays fully dim through Act I, brief §3), exactly one
//     `auditWrite` with `actor: 'agent'`.
//   - "actOneSteps — playback" — an end-to-end `ScenarioPlayer` pass, fake
//     timers throughout (player.test.ts's convention: the player's
//     one-pending-timer discipline means `vi.runAllTimers()` drives it
//     deterministically with no real waiting), proving Act I actually plays
//     to completion and that `reset()` returns to the pre-Act-I snapshot.
//
// `actTwoSteps`/`actThreeSteps` are P2/P3's stubs — covered here only to
// the extent that they don't (yet) contribute anything to `buildDemoScenario`,
// so Act I's own assertions don't have to guess at their future content.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  actOneSteps,
  actThreeSteps,
  actTwoSteps,
  buildDemoScenario,
  REMEDIATION_APPROVAL_ID,
} from './demo-scenario';
import { ScenarioPlayer } from './player';
import { SENTINEL_NODE_IDS } from './types';
import type {
  AwaitApprovalStep,
  AwaitStageActionStep,
  ChatTurnStep,
  CounterUpdateStep,
  GraphStep,
  RenderStep,
  SentinelStageState,
} from './types';
import { policyDocument, policyRules } from '../policy';
import { getAuExceptionFixture } from '../exception-fixture';
import { getAuScanPortfolio } from '@/lib/soe';
import type {
  DecisionCardProps,
  PolicyExceptionTableProps,
  RemediationReportProps,
  RuleCitationProps,
} from '../registry';
import type { BarBreakdownProps, MetricRowProps } from '@/lib/registry/schemas';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

const actOne = actOneSteps();

describe('actOneSteps — fixture invariants', () => {
  it('opens on exactly one actMarker, at index 0, act 1', () => {
    const markers = actOne.filter((s) => s.type === 'actMarker');
    expect(markers).toHaveLength(1);
    expect(actOne[0]).toMatchObject({ type: 'actMarker', act: 1, title: 'The gap' });
  });

  it('carries no graphStep — the agent graph stays fully dim through Act I (brief §3)', () => {
    expect(actOne.some((s) => s.type === 'graphStep')).toBe(false);
  });

  it('carries no removed v2 step type and no unbuilt-yet Act II/III step type', () => {
    // Regression guard (docs/v3-migration-map.md §4): `emitEvent`,
    // `railReset`, and `narration` are gone from the v3 step union entirely
    // — asserting on the string literal here means this test still catches
    // a reintroduction even if `types.ts` ever widened back to allow one.
    const forbidden = new Set(['emitEvent', 'railReset', 'narration']);
    const types = new Set<string>(actOne.map((s) => s.type));
    for (const type of forbidden) expect(types.has(type)).toBe(false);

    // Act I never gates or renders — those are Act II/III beats.
    expect(types.has('awaitApproval')).toBe(false);
    expect(types.has('awaitStageAction')).toBe(false);
    expect(types.has('render')).toBe(false);
    expect(types.has('policyPanel')).toBe(false);
  });

  it('has exactly two to three agent chatTurn steps narrating the gap, no user turns', () => {
    const chatTurns = actOne.filter((s): s is ChatTurnStep => s.type === 'chatTurn');
    expect(chatTurns.length).toBeGreaterThanOrEqual(2);
    expect(chatTurns.length).toBeLessThanOrEqual(3);
    expect(chatTurns.every((t) => t.role === 'agent')).toBe(true);
  });

  it('lands exactly one counterUpdate with the exact zeros and caption the brief specifies', () => {
    const counters = actOne.filter((s) => s.type === 'counterUpdate');
    expect(counters).toHaveLength(1);
    expect(counters[0]).toMatchObject({
      counter: { scanned: 0, exceptions: 0, remediated: 0 },
      caption: '1,247 authorized-user relationships · 0 continuously monitored · 0 flagged',
    });
  });

  it('writes exactly one auditWrite, actor agent', () => {
    const writes = actOne.filter((s) => s.type === 'auditWrite');
    expect(writes).toHaveLength(1);
    if (writes[0].type !== 'auditWrite') throw new Error('expected auditWrite');
    expect(writes[0].entry.actor).toBe('agent');
  });
});

describe('actOneSteps — playback', () => {
  it('plays to completion: conversation ends with only done agent turns, counter and caption land, graph stays all-idle', () => {
    const player = new ScenarioPlayer({ id: 'act-one-only', steps: actOne });

    player.play(); // consumes the sole actMarker synchronously, then runs to the end — nothing halts playback in Act I alone
    vi.runAllTimers();

    const snapshot = player.getSnapshot();
    expect(snapshot.status).toBe('done');

    const chatTurnSteps = actOne.filter((s): s is ChatTurnStep => s.type === 'chatTurn');
    expect(snapshot.conversation).toHaveLength(chatTurnSteps.length);
    expect(snapshot.conversation.every((t) => t.role === 'agent' && t.done)).toBe(true);

    expect(snapshot.counter).toEqual({ scanned: 0, exceptions: 0, remediated: 0 });
    expect(snapshot.counterCaption).toBe(
      '1,247 authorized-user relationships · 0 continuously monitored · 0 flagged',
    );

    for (const nodeId of SENTINEL_NODE_IDS) {
      expect(snapshot.graph.nodes[nodeId]).toBe('idle');
    }
    expect(snapshot.graph.animatedEdges).toEqual([]);

    expect(snapshot.auditEntries).toHaveLength(1);
    expect(snapshot.auditEntries[0].actor).toBe('agent');
  });

  it('reset() returns to the idle pre-Act-I snapshot', () => {
    const fresh = new ScenarioPlayer({ id: 'act-one-only', steps: actOne });
    const freshSnapshot = fresh.getSnapshot();

    const player = new ScenarioPlayer({ id: 'act-one-only', steps: actOne });
    player.play();
    vi.runAllTimers();
    expect(player.getSnapshot().status).toBe('done'); // sanity: it actually ran first

    player.reset();
    expect(player.getSnapshot()).toEqual(freshSnapshot);
    expect(player.getSnapshot().conversation).toEqual([]);
    expect(player.getSnapshot().counter).toEqual({ scanned: 0, exceptions: 0, remediated: 0 });
    for (const nodeId of SENTINEL_NODE_IDS) {
      expect(player.getSnapshot().graph.nodes[nodeId]).toBe('idle');
    }
  });
});

describe('buildDemoScenario', () => {
  it('assembles Act I + Act II + Act III into one scenario', async () => {
    const scenario = await buildDemoScenario();
    expect(scenario.id).toBe('au-policy-demo');
    expect(scenario.steps).toEqual([...actOneSteps(), ...actTwoSteps(), ...(await actThreeSteps())]);
  });

  it('plays cleanly through Act I + Act II, pausing at Act III’s marker (never auto-consumed)', async () => {
    const scenario = await buildDemoScenario();
    const player = new ScenarioPlayer(scenario);

    player.play(); // runs Act I to completion, pauses at Act II's actMarker (never auto-consumed)
    vi.runAllTimers();
    expect(player.getSnapshot().status).toBe('paused');
    expect(player.getSnapshot().act).toBe(1);

    player.play(); // consumes Act II's marker, runs to the policy-drop gate
    vi.runAllTimers();
    expect(player.getSnapshot().status).toBe('awaiting-stage-action');

    player.resolveStageAction('act2-await-drop');
    vi.runAllTimers();
    expect(player.getSnapshot().status).toBe('awaiting-approval');

    player.resolveApproval('act2-approval-activate', true);
    vi.runAllTimers();
    // Act III now has real content (P3, W3.4) — playback pauses at its
    // marker instead of finishing.
    expect(player.getSnapshot().status).toBe('paused');
    expect(player.getSnapshot().act).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// actTwoSteps (P2 W2.3) — mirrors the actOneSteps split above: fixture
// invariants on the raw steps array, then end-to-end ScenarioPlayer passes
// for the two hard gates and the approval-driven arming.
// ---------------------------------------------------------------------------

const actTwo = actTwoSteps();
const renderSteps = actTwo.filter((s): s is RenderStep => s.type === 'render');

/** Narrows a render step's instruction down to its `RuleDiff` props, or
 * throws — every render assertion below wants the props, not the wrapper,
 * and a thrown error here is a real fixture bug (Act II renders nothing but
 * RuleDiff), not a case worth a soft skip. */
function ruleDiffProps(step: RenderStep | undefined) {
  if (!step || step.instruction.component !== 'RuleDiff') {
    throw new Error('expected a RuleDiff render step');
  }
  return step.instruction.props;
}

describe('actTwoSteps — fixture invariants', () => {
  it('opens on exactly one actMarker, act 2', () => {
    const markers = actTwo.filter((s) => s.type === 'actMarker');
    expect(markers).toHaveLength(1);
    expect(actTwo[0]).toMatchObject({ type: 'actMarker', act: 2, title: 'Policy to production' });
  });

  it('carries exactly one policy-drop stage action and no prompt stage action', () => {
    const stageActions = actTwo.filter((s) => s.type === 'awaitStageAction');
    expect(stageActions).toHaveLength(1);
    expect(stageActions[0]).toMatchObject({ type: 'awaitStageAction', id: 'act2-await-drop', action: 'policy-drop' });
  });

  it('opens the policy panel drop → preview, then closes it before the Rule Diff needs the context rail', () => {
    const panelStates = actTwo.filter((s) => s.type === 'policyPanel').map((s) => (s.type === 'policyPanel' ? s.panel : null));
    expect(panelStates).toEqual(['drop', 'preview', 'closed']);

    // The close must land strictly before the first Rule Diff render, or the
    // card grows behind a still-open drawer (policy-panel.tsx is `absolute
    // inset-0 z-10` over the context rail).
    const closeIndex = actTwo.findIndex((s) => s.type === 'policyPanel' && s.panel === 'closed');
    const firstRenderIndex = actTwo.findIndex((s) => s.type === 'render');
    expect(closeIndex).toBeGreaterThan(-1);
    expect(firstRenderIndex).toBeGreaterThan(-1);
    expect(closeIndex).toBeLessThan(firstRenderIndex);
  });

  it('renders the Rule Diff under a single stable id, growing progressively', () => {
    const ids = new Set(renderSteps.map((s) => s.id));
    expect(ids.size).toBe(1);
    expect([...ids]).toEqual(['act2-rule-diff']);
    // Drafted rows, then validated flips, then O4, then the active flip —
    // "re-rendered several times" per the brief, not just twice.
    expect(renderSteps.length).toBeGreaterThanOrEqual(4);
  });

  it('the final Rule Diff render carries exactly 4 rows: 3 evaluable with a machine footer, 1 data-gap with none', () => {
    const props = ruleDiffProps(renderSteps.at(-1));
    expect(props.rules).toHaveLength(4);

    const withMachine = props.rules.filter((r) => r.machine !== undefined);
    const dataGap = props.rules.filter((r) => r.evaluability === 'data-gap');
    expect(withMachine).toHaveLength(3);
    expect(dataGap).toHaveLength(1);
    expect(dataGap[0].machine).toBeUndefined();
    expect(dataGap[0].validated).toBe(false);
  });

  it("every rule row's excerpt.quote is a verbatim substring of the cited section's body, including O4's", () => {
    const props = ruleDiffProps(renderSteps.at(-1));
    expect(props.rules.length).toBeGreaterThan(0);
    for (const row of props.rules) {
      const section = policyDocument.sections.find((s) => s.heading === row.excerpt.sectionHeading);
      if (!section) throw new Error(`no policy section headed "${row.excerpt.sectionHeading}"`);
      expect(section.body).toContain(row.excerpt.quote);
    }
  });

  it('the last render flips status to active; every earlier render stayed proposed', () => {
    const statuses = renderSteps.map((s) => ruleDiffProps(s).status);
    expect(statuses.at(-1)).toBe('active');
    expect(statuses.slice(0, -1).every((status) => status === 'proposed')).toBe(true);
  });

  it('carries exactly one awaitApproval gate, requesting activation of 3 rules with 1 parked', () => {
    const approvals = actTwo.filter((s) => s.type === 'awaitApproval');
    expect(approvals).toHaveLength(1);
    if (approvals[0].type !== 'awaitApproval') throw new Error('expected awaitApproval');
    expect(approvals[0].payload.description).toBe(
      'Activate 3 rules for continuous enforcement. 1 obligation parked pending data onboarding.',
    );
  });

  it('lands exactly one counterUpdate with the exact zeros and caption the brief specifies', () => {
    const counters = actTwo.filter((s): s is CounterUpdateStep => s.type === 'counterUpdate');
    expect(counters).toHaveLength(1);
    expect(counters[0]).toMatchObject({
      counter: { scanned: 0, exceptions: 0, remediated: 0 },
      caption: 'Policy → production: 4 obligations extracted · 3 rules active · 1 data gap · 1 human approval',
    });
  });

  it('carries no removed v2 step type', () => {
    const forbidden = new Set(['emitEvent', 'railReset', 'narration']);
    const types = new Set<string>(actTwo.map((s) => s.type));
    for (const type of forbidden) expect(types.has(type)).toBe(false);
  });
});

describe('actTwoSteps — playback', () => {
  it('blocks at the policy-drop gate and does not advance until resolveStageAction is called', () => {
    const player = new ScenarioPlayer({ id: 'act-two-only', steps: actTwo });

    player.play(); // consumes the sole actMarker, runs the framing chatTurn + drop panel, then hard-blocks
    vi.runAllTimers();

    const snapshot = player.getSnapshot();
    expect(snapshot.status).toBe('awaiting-stage-action');
    expect(snapshot.pendingStageAction).toEqual({ id: 'act2-await-drop', action: 'policy-drop', suggested: undefined });
    expect(snapshot.policyPanel).toBe('drop');
    // Nothing past the gate has fired yet — no Rule Diff render, no graph activity.
    expect(snapshot.contextItems.some((item) => item.kind === 'render')).toBe(false);
    for (const nodeId of SENTINEL_NODE_IDS) {
      expect(snapshot.graph.nodes[nodeId]).toBe('idle');
    }

    // A no-op resolve for a DIFFERENT id must not unblock it.
    player.resolveStageAction('not-the-pending-id');
    expect(player.getSnapshot().status).toBe('awaiting-stage-action');

    player.resolveStageAction('act2-await-drop');
    vi.runAllTimers();
    // Nothing else hard-blocks between the drop gate and the approval gate,
    // so a full runAllTimers() carries playback all the way through the
    // preview → graph → Rule Diff beats to the next hard stop.
    expect(player.getSnapshot().status).toBe('awaiting-approval');
    expect(player.getSnapshot().policyPanel).toBe('closed');
  });

  it('hard-blocks at the approval gate; approving flips the Rule Diff to active and settles all six nodes to armed', () => {
    const player = new ScenarioPlayer({ id: 'act-two-only', steps: actTwo });
    player.play();
    vi.runAllTimers();
    player.resolveStageAction('act2-await-drop');
    vi.runAllTimers();

    const beforeApproval = player.getSnapshot();
    expect(beforeApproval.status).toBe('awaiting-approval');
    for (const nodeId of SENTINEL_NODE_IDS) {
      expect(beforeApproval.graph.nodes[nodeId]).not.toBe('armed');
    }
    const pendingRuleDiff = beforeApproval.contextItems.find(
      (item) => item.kind === 'render' && item.id === 'act2-rule-diff',
    );
    if (!pendingRuleDiff || pendingRuleDiff.kind !== 'render' || pendingRuleDiff.instruction.component !== 'RuleDiff') {
      throw new Error('expected the Rule Diff context item to exist before approval');
    }
    expect(pendingRuleDiff.instruction.props.status).toBe('proposed');

    // A no-op resolve for a DIFFERENT id must not unblock it.
    player.resolveApproval('not-the-pending-id', true);
    expect(player.getSnapshot().status).toBe('awaiting-approval');

    player.resolveApproval('act2-approval-activate', true);
    vi.runAllTimers();

    const after = player.getSnapshot();
    expect(after.status).toBe('done'); // nothing left in an Act-II-only run
    for (const nodeId of SENTINEL_NODE_IDS) {
      expect(after.graph.nodes[nodeId]).toBe('armed');
    }
    const armedRuleDiff = after.contextItems.find((item) => item.kind === 'render' && item.id === 'act2-rule-diff');
    if (!armedRuleDiff || armedRuleDiff.kind !== 'render' || armedRuleDiff.instruction.component !== 'RuleDiff') {
      throw new Error('expected the Rule Diff context item to exist after approval');
    }
    expect(armedRuleDiff.instruction.props.status).toBe('active');
    expect(armedRuleDiff.instruction.props.rules).toHaveLength(4);

    // The approval decision itself is on the audit trail, actor human.
    const approvalEntry = after.auditEntries.find((e) => e.kind === 'approval.granted');
    expect(approvalEntry?.actor).toBe('human');
    // ...and the agent's own activation confirmation is a second, separate entry.
    const activationEntry = after.auditEntries.find((e) => e.kind === 'action.executed' && e.actor === 'agent');
    expect(activationEntry).toBeTruthy();
  });

  it('the counter beat lands after approval with the exact caption and zeros', () => {
    const player = new ScenarioPlayer({ id: 'act-two-only', steps: actTwo });
    player.play();
    vi.runAllTimers();
    player.resolveStageAction('act2-await-drop');
    vi.runAllTimers();
    player.resolveApproval('act2-approval-activate', true);
    vi.runAllTimers();

    const snapshot = player.getSnapshot();
    expect(snapshot.counter).toEqual({ scanned: 0, exceptions: 0, remediated: 0 });
    expect(snapshot.counterCaption).toBe(
      'Policy → production: 4 obligations extracted · 3 rules active · 1 data gap · 1 human approval',
    );
  });
});

// ---------------------------------------------------------------------------
// actThreeSteps (P3 W3.4) — mirrors the actOneSteps/actTwoSteps split above:
// fixture invariants on the raw steps array, then end-to-end ScenarioPlayer
// passes for the prompt gate and both approval-gate outcomes. Act III's
// content is derived from the AU exception fixture (anchor-sensitive, unlike
// Acts I/II's static content), so every describe block here runs at both
// demo-date anchors — lib/soe/seed/seed.test.ts's own convention.
// ---------------------------------------------------------------------------

const ANCHORS = ['2026-08-05', '2026-08-19'] as const;

// Narrowing helpers, one per component — mirrors `ruleDiffProps` above
// (generic-parameter narrowing doesn't reliably narrow a discriminated
// union through TypeScript's control-flow analysis, so each gets its own
// small, explicitly-typed function rather than one generic).
function metricRowProps(step: RenderStep | undefined): MetricRowProps {
  if (!step || step.instruction.component !== 'MetricRow') throw new Error('expected a MetricRow render step');
  return step.instruction.props;
}
function barBreakdownProps(step: RenderStep | undefined): BarBreakdownProps {
  if (!step || step.instruction.component !== 'BarBreakdown') throw new Error('expected a BarBreakdown render step');
  return step.instruction.props;
}
function policyExceptionTableProps(step: RenderStep | undefined): PolicyExceptionTableProps {
  if (!step || step.instruction.component !== 'PolicyExceptionTable') {
    throw new Error('expected a PolicyExceptionTable render step');
  }
  return step.instruction.props;
}
function ruleCitationPropsOf(step: RenderStep | undefined): RuleCitationProps {
  if (!step || step.instruction.component !== 'RuleCitation') throw new Error('expected a RuleCitation render step');
  return step.instruction.props;
}
function decisionCardPropsOf(step: RenderStep | undefined): DecisionCardProps {
  if (!step || step.instruction.component !== 'DecisionCard') throw new Error('expected a DecisionCard render step');
  return step.instruction.props;
}
function remediationReportPropsOf(step: RenderStep | undefined): RemediationReportProps {
  if (!step || step.instruction.component !== 'RemediationReport') {
    throw new Error('expected a RemediationReport render step');
  }
  return step.instruction.props;
}

describe.each(ANCHORS)('actThreeSteps — fixture invariants @ anchor %s', (anchorIso) => {
  beforeEach(() => {
    process.env.DEMO_ANCHOR_DATE = anchorIso;
  });
  afterEach(() => {
    delete process.env.DEMO_ANCHOR_DATE;
  });

  it('opens on exactly one actMarker, act 3', async () => {
    const actThree = await actThreeSteps();
    const markers = actThree.filter((s) => s.type === 'actMarker');
    expect(markers).toHaveLength(1);
    expect(actThree[0]).toMatchObject({ type: 'actMarker', act: 3, title: 'The sweep' });
  });

  it('carries exactly one prompt stage action carrying the scripted suggestion, and no policy-drop stage action', async () => {
    const actThree = await actThreeSteps();
    const stageActions = actThree.filter((s): s is AwaitStageActionStep => s.type === 'awaitStageAction');
    expect(stageActions).toHaveLength(1);
    expect(stageActions[0]).toMatchObject({
      id: 'act3-await-prompt',
      action: 'prompt',
      suggested: 'Find me all the authorized user policy exceptions.',
    });
  });

  it('re-renders Act II’s Rule Diff card under the SAME id, with storeMeta set', async () => {
    const actThree = await actThreeSteps();
    const ruleDiffRenders = actThree.filter((s): s is RenderStep => s.type === 'render' && s.id === 'act2-rule-diff');
    expect(ruleDiffRenders).toHaveLength(1);
    const props = ruleDiffProps(ruleDiffRenders[0]);
    expect(props.status).toBe('active');
    expect(props.storeMeta).toBe('Rule store · continuous · nightly 02:00 UTC · last run 4h ago');
    expect(props.rules).toHaveLength(4);
  });

  it('Data Collector fires exactly three times, each with a distinct detail caption', async () => {
    const actThree = await actThreeSteps();
    const dataCollectorDetails = actThree
      .filter(
        (s): s is GraphStep => s.type === 'graphStep' && s.nodeId === 'data-collector' && s.detail !== undefined,
      )
      .map((s) => s.detail);
    expect(dataCollectorDetails).toHaveLength(3);
    expect(new Set(dataCollectorDetails).size).toBe(3);
    expect(dataCollectorDetails.every((d) => d?.startsWith('call'))).toBe(true);
  });

  it('MetricRow/BarBreakdown/PolicyExceptionTable figures equal the fixture — and the fixture equals the brief’s targets', async () => {
    const fixture = await getAuExceptionFixture();

    // The brief's own targets (§5d), asserted at the surface the audience
    // actually sees — never typed into the scenario itself.
    expect(fixture.relationshipsScanned).toBe(1247);
    expect(fixture.accountsScanned).toBe(962);
    expect(fixture.totalExceptions).toBe(87);
    expect(fixture.accountsAffected).toBe(74);
    expect(fixture.byRule.R1).toEqual({ relationships: 61, accounts: 52 });
    expect(fixture.byRule.R2).toEqual({ relationships: 19, accounts: 17 });
    expect(fixture.byRule.R3).toEqual({ relationships: 7, accounts: 7 });

    const actThree = await actThreeSteps();
    const renders = actThree.filter((s): s is RenderStep => s.type === 'render');

    const metrics = metricRowProps(renders.find((r) => r.id === 'act3-metric-row')).metrics;
    const metricValues = Object.fromEntries(metrics.map((m) => [m.label, m.value]));
    expect(metricValues['Relationships Scanned']).toBe('1,247');
    expect(metricValues['Accounts Scanned']).toBe('962');
    expect(metricValues['Exceptions']).toBe('87');
    expect(metricValues['Accounts Affected']).toBe('74');

    const bars = barBreakdownProps(renders.find((r) => r.id === 'act3-bar-breakdown')).bars;
    expect(bars).toHaveLength(3);
    expect(bars.map((b) => b.value)).toEqual([61, 19, 7]);
    expect(bars.map((b) => b.display)).toEqual(['61', '19', '7']);

    const table = policyExceptionTableProps(renders.find((r) => r.id === 'act3-exception-table'));
    expect(table.rows).toHaveLength(12);
    expect(table.footnote).toBe('Showing 12 of 87 exceptions.');
    expect(table.rows).toEqual(
      fixture.rows.slice(0, 12).map((row) => ({
        accountLabel: row.accountLabel,
        authorizedUser: row.authorizedUser,
        ruleId: row.ruleId,
        ruleShortName: row.ruleShortName,
        finding: row.finding,
        addedDate: row.addedDate,
      })),
    );
  });

  it('the R1 drill-down cites R1 verbatim and confirms both conditions ✓✓, off the fixture’s own deterministic first R1 row', async () => {
    const fixture = await getAuExceptionFixture();
    const r1Exemplar = fixture.rows.find((r) => r.ruleId === 'R1');
    if (!r1Exemplar) throw new Error('fixture has no R1 row');
    const r1Rule = policyRules.find((r) => r.ruleId === 'R1');
    if (!r1Rule) throw new Error('policyRules has no R1');

    const actThree = await actThreeSteps();
    const renders = actThree.filter((s): s is RenderStep => s.type === 'render');
    const citation = ruleCitationPropsOf(renders.find((r) => r.id === 'act3-rule-citation-r1'));

    expect(citation.ruleId).toBe('R1');
    expect(citation.verdict).toBe('violation');
    expect(citation.ruleText).toBe(r1Rule.plainEnglish);
    expect(citation.checks.length).toBeGreaterThanOrEqual(2);
    expect(citation.checks.every((c) => c.met)).toBe(true);
    expect(citation.checks.some((c) => c.detail === r1Exemplar.finding)).toBe(true);
  });

  it('the Patel card is a compliance pass, and Patel appears in NO fixture exception row', async () => {
    const fixture = await getAuExceptionFixture();
    const patelRows = fixture.rows.filter((r) => r.accountId === 'acct-patel');
    expect(patelRows).toHaveLength(0);

    const scan = await getAuScanPortfolio();
    const patelAuRoles = scan.roles.filter((r) => r.accountId === 'acct-patel' && r.role === 'AUTHORIZED_USER');
    expect(patelAuRoles.length).toBeGreaterThan(0);

    const actThree = await actThreeSteps();
    const renders = actThree.filter((s): s is RenderStep => s.type === 'render');
    const patelCitation = ruleCitationPropsOf(renders.find((r) => r.id === 'act3-rule-citation-patel'));
    expect(patelCitation.verdict).toBe('pass');
    expect(patelCitation.checks.every((c) => c.met)).toBe(true);
  });

  it('the DecisionCard renders under one stable id, keeps option order across every re-render, and ends rejected/rejected/selected in the brief’s order', async () => {
    const actThree = await actThreeSteps();
    const decisionRenders = actThree.filter(
      (s): s is RenderStep => s.type === 'render' && s.id === 'act3-decision-card',
    );
    expect(decisionRenders.length).toBeGreaterThanOrEqual(3);

    const optionIdOrders = decisionRenders.map((r) => decisionCardPropsOf(r).options.map((o) => o.id));
    for (const order of optionIdOrders) {
      expect(order).toEqual(['remove-all', 'stage-for-review', 'remove-and-notify']);
    }

    const finalOptions = decisionCardPropsOf(decisionRenders.at(-1)).options;
    expect(finalOptions.map((o) => o.status)).toEqual(['rejected', 'rejected', 'selected']);
    for (const option of finalOptions) {
      expect(option.rationale?.length).toBeGreaterThan(0);
    }
  });

  it('the approval card’s scope/reviewList counts equal the fixture’s', async () => {
    const fixture = await getAuExceptionFixture();
    const actThree = await actThreeSteps();
    const approval = actThree.find((s): s is AwaitApprovalStep => s.type === 'awaitApproval');
    if (!approval) throw new Error('expected an awaitApproval step in Act III');
    expect(approval.id).toBe(REMEDIATION_APPROVAL_ID);

    expect(approval.payload.scope?.summary).toBe(
      `Remove ${fixture.totalExceptions} authorized users from ${fixture.accountsAffected} accounts and notify ${fixture.accountsAffected} primary cardholders.`,
    );
    const counts = Object.fromEntries((approval.payload.scope?.counts ?? []).map((c) => [c.label, c.value]));
    expect(counts['Authorized users removed']).toBe('87');
    expect(counts['Accounts touched']).toBe('74');
    expect(counts['Cardholders notified']).toBe('74');

    const reviewRows = approval.payload.reviewList?.rows ?? [];
    expect(reviewRows.length).toBe(Math.min(25, fixture.totalExceptions));
    expect(approval.payload.reviewList?.footnote).toBe(`Showing ${reviewRows.length} of ${fixture.totalExceptions}.`);
  });

  it('carries an onDeny branch: a chatTurn, an auditWrite (run.finished, actor agent), and a counterUpdate with remediated: 0 — nothing else', async () => {
    const actThree = await actThreeSteps();
    const approval = actThree.find((s): s is AwaitApprovalStep => s.type === 'awaitApproval');
    if (!approval) throw new Error('expected an awaitApproval step in Act III');
    expect(approval.onDeny).toBeDefined();
    const onDeny = approval.onDeny ?? [];
    expect(onDeny.map((s) => s.type)).toEqual(['chatTurn', 'auditWrite', 'counterUpdate']);

    const auditStep = onDeny[1];
    if (auditStep.type !== 'auditWrite') throw new Error('expected auditWrite');
    expect(auditStep.entry.actor).toBe('agent');
    expect(auditStep.entry.kind).toBe('run.finished');

    const counterStep = onDeny[2];
    if (counterStep.type !== 'counterUpdate') throw new Error('expected counterUpdate');
    expect(counterStep.counter.remediated).toBe(0);
  });

  it('the RemediationReport confirmationId equals rem-${fixture.reportId}, derived, never a literal', async () => {
    const fixture = await getAuExceptionFixture();
    const actThree = await actThreeSteps();
    const renders = actThree.filter((s): s is RenderStep => s.type === 'render');
    const report = remediationReportPropsOf(renders.find((r) => r.id === 'act3-remediation-report'));
    expect(report.confirmationId).toBe(`rem-${fixture.reportId}`);
    expect(report.downloadUrl).toBe(`/api/sentinel/report?reportId=${fixture.reportId}`);
  });

  it('the closing counter carries remediated = the fixture’s total, and its caption is fixture-derived', async () => {
    const fixture = await getAuExceptionFixture();
    const actThree = await actThreeSteps();
    const closing = actThree.at(-1);
    if (closing?.type !== 'counterUpdate') throw new Error('expected the last Act III step to be a counterUpdate');
    expect(closing.counter).toEqual({
      scanned: fixture.relationshipsScanned,
      exceptions: fixture.totalExceptions,
      remediated: fixture.totalExceptions,
    });
    expect(closing.caption).toBe(
      `${fixture.relationshipsScanned.toLocaleString('en-US')} scanned · ${fixture.totalExceptions.toLocaleString('en-US')} exceptions · ${fixture.accountsAffected.toLocaleString('en-US')} accounts · 1 human approval · full audit trail`,
    );
  });
});

describe.each(ANCHORS)('actThreeSteps — playback @ anchor %s', (anchorIso) => {
  beforeEach(() => {
    process.env.DEMO_ANCHOR_DATE = anchorIso;
  });
  afterEach(() => {
    delete process.env.DEMO_ANCHOR_DATE;
  });

  it('the prompt gate hard-blocks; resolving with arbitrary text (nothing like `suggested`) echoes it verbatim and the script continues unchanged', async () => {
    const actThree = await actThreeSteps();
    const player = new ScenarioPlayer({ id: 'act-three-only', steps: actThree });

    player.play(); // consumes the act 3 marker, runs beat 1's framing + rule-store render, halts at the prompt gate
    vi.runAllTimers();
    expect(player.getSnapshot().status).toBe('awaiting-stage-action');
    expect(player.getSnapshot().pendingStageAction).toMatchObject({
      id: 'act3-await-prompt',
      action: 'prompt',
      suggested: 'Find me all the authorized user policy exceptions.',
    });

    player.resolveStageAction('act3-await-prompt', 'asdfgh — nothing like the suggestion');
    vi.runAllTimers();

    const snapshot = player.getSnapshot();
    // The echoed turn is verbatim...
    expect(
      snapshot.conversation.some((t) => t.role === 'user' && t.text === 'asdfgh — nothing like the suggestion'),
    ).toBe(true);
    // ...and the script continued exactly as scripted regardless — the
    // sweep still ran, evidence still landed, and playback reached the
    // approval gate (never string-matched against `suggested`, brief §9).
    expect(snapshot.status).toBe('awaiting-approval');
    expect(snapshot.contextItems.some((item) => item.kind === 'render' && item.id === 'act3-metric-row')).toBe(true);
  });

  it('approve path: RemediationReport renders, confirmationId matches the fixture, closing counter remediated = 87', async () => {
    const fixture = await getAuExceptionFixture();
    const actThree = await actThreeSteps();
    const player = new ScenarioPlayer({ id: 'act-three-only', steps: actThree });

    player.play();
    vi.runAllTimers();
    player.resolveStageAction('act3-await-prompt', 'Find me all the authorized user policy exceptions.');
    vi.runAllTimers();
    expect(player.getSnapshot().status).toBe('awaiting-approval');

    player.resolveApproval(REMEDIATION_APPROVAL_ID, true);
    vi.runAllTimers();

    const snapshot = player.getSnapshot();
    expect(snapshot.status).toBe('done');
    const report = snapshot.contextItems.find(
      (item) => item.kind === 'render' && item.id === 'act3-remediation-report',
    );
    if (!report || report.kind !== 'render' || report.instruction.component !== 'RemediationReport') {
      throw new Error('expected the RemediationReport context item to exist after approval');
    }
    expect(report.instruction.props.confirmationId).toBe(`rem-${fixture.reportId}`);
    expect(snapshot.counter.remediated).toBe(fixture.totalExceptions);

    const approvalEntry = snapshot.auditEntries.find((e) => e.kind === 'approval.granted');
    expect(approvalEntry?.actor).toBe('human');
  });

  it('decline path: no RemediationReport renders at all, remediated stays 0, and the denial is audited actor: human', async () => {
    const actThree = await actThreeSteps();
    const player = new ScenarioPlayer({ id: 'act-three-only', steps: actThree });

    player.play();
    vi.runAllTimers();
    player.resolveStageAction('act3-await-prompt', 'Find me all the authorized user policy exceptions.');
    vi.runAllTimers();
    expect(player.getSnapshot().status).toBe('awaiting-approval');

    player.resolveApproval(REMEDIATION_APPROVAL_ID, false);
    vi.runAllTimers();

    const snapshot = player.getSnapshot();
    expect(snapshot.status).toBe('done');
    expect(
      snapshot.contextItems.some((item) => item.kind === 'render' && item.id === 'act3-remediation-report'),
    ).toBe(false);
    expect(snapshot.messages.some((m) => m.type === 'render' && m.id === 'act3-remediation-report')).toBe(false);
    expect(snapshot.counter.remediated).toBe(0);

    const denialEntry = snapshot.auditEntries.find((e) => e.kind === 'approval.denied');
    expect(denialEntry?.actor).toBe('human');
    const closedEntry = snapshot.auditEntries.find((e) => e.kind === 'run.finished');
    expect(closedEntry?.actor).toBe('agent');
  });

  it('reset() after a decline restores a clean run', async () => {
    const actThree = await actThreeSteps();
    const fresh = new ScenarioPlayer({ id: 'act-three-only', steps: actThree });
    const freshSnapshot = fresh.getSnapshot();

    const player = new ScenarioPlayer({ id: 'act-three-only', steps: actThree });
    player.play();
    vi.runAllTimers();
    player.resolveStageAction('act3-await-prompt', 'Find me all the authorized user policy exceptions.');
    vi.runAllTimers();
    player.resolveApproval(REMEDIATION_APPROVAL_ID, false);
    vi.runAllTimers();
    expect(player.getSnapshot().status).toBe('done');

    player.reset();
    expect(player.getSnapshot()).toEqual(freshSnapshot);
  });

  it('the full three acts play back to back after one reset (the phase gate)', async () => {
    const scenario = await buildDemoScenario();
    const player = new ScenarioPlayer(scenario);

    player.play(); // Act I
    vi.runAllTimers();
    player.play(); // Act II
    vi.runAllTimers();
    player.resolveStageAction('act2-await-drop');
    vi.runAllTimers();
    player.resolveApproval('act2-approval-activate', true);
    vi.runAllTimers();
    expect(player.getSnapshot().status).toBe('paused');
    expect(player.getSnapshot().act).toBe(2);

    player.play(); // Act III
    vi.runAllTimers();
    expect(player.getSnapshot().status).toBe('awaiting-stage-action');

    player.resolveStageAction('act3-await-prompt', 'Find me all the authorized user policy exceptions.');
    vi.runAllTimers();
    expect(player.getSnapshot().status).toBe('awaiting-approval');

    player.resolveApproval(REMEDIATION_APPROVAL_ID, true);
    vi.runAllTimers();
    expect(player.getSnapshot().status).toBe('done');

    // Reset restores a pristine pre-Act-I state, exactly matching a
    // never-played instance over the same scenario — the deny-branch splice
    // mechanics (player.ts) never touched THIS run since it approved, but
    // this proves the ordinary reset guarantee still holds after a full
    // three-act run, not just a partial one.
    const fresh = new ScenarioPlayer(scenario);
    player.reset();
    expect(player.getSnapshot()).toEqual(fresh.getSnapshot());
  });
});

// ---------------------------------------------------------------------------
// P5 W5.3 (CARDINAL_V3_AU_BRIEF.md §8 P5 gate: "the complete demo replays
// clean, repeatedly" — the demo-safety brief phrases the same thing as
// "byte-identical across replays") — three consecutive full three-act runs,
// back to back, with a `reset()` between each, at both playback speeds. This
// is the literal phase gate, not a proxy for it: a demo that plays once
// cleanly but drifts (or throws) on a second or third run-through is exactly
// the failure mode a rehearsal-the-night-before and a live back-to-back
// "let me show you the decline path too" moment would both hit. ONE player
// instance is reused across all three replays in each speed's test — never a
// fresh `ScenarioPlayer` per run — specifically so a leaked timer, a stale
// pending-approval reference, or any other cross-run contamination the
// engine might carry forward has somewhere to show up; a fresh instance each
// time would only ever prove the scenario file itself is fine, which the
// other describe blocks in this file already cover.
// ---------------------------------------------------------------------------

describe.each(ANCHORS)('demo-scenario — 3x consecutive full replay @ anchor %s (P5 gate)', (anchorIso) => {
  beforeEach(() => {
    process.env.DEMO_ANCHOR_DATE = anchorIso;
  });
  afterEach(() => {
    delete process.env.DEMO_ANCHOR_DATE;
  });

  it.each([1, 2] as const)(
    'replays clean 3 times in a row at %ix speed — identical final snapshot every time, no leaked state',
    async (speed) => {
      const scenario = await buildDemoScenario();
      const player = new ScenarioPlayer(scenario);

      // One pass through all three acts, approving both gates — mirrors
      // "the full three acts play back to back after one reset" above,
      // factored out so it can run three times in a row here.
      async function playOneFullRun(): Promise<void> {
        // `reset()` (at the end of the previous iteration, or never-yet-run
        // for the first) restores `speed` to 1 — player.ts's
        // `initializeState` doc comment — so speed is re-armed every run
        // rather than assumed to persist.
        player.setSpeed(speed);
        player.play(); // Act I, runs to Act II's marker
        vi.runAllTimers();
        player.play(); // consumes Act II's marker, runs to the policy-drop gate
        vi.runAllTimers();
        player.resolveStageAction('act2-await-drop');
        vi.runAllTimers();
        player.resolveApproval('act2-approval-activate', true);
        vi.runAllTimers();
        player.play(); // consumes Act III's marker, runs to the prompt gate
        vi.runAllTimers();
        player.resolveStageAction('act3-await-prompt', 'Find me all the authorized user policy exceptions.');
        vi.runAllTimers();
        player.resolveApproval(REMEDIATION_APPROVAL_ID, true);
        vi.runAllTimers();
      }

      let referenceSnapshot: SentinelStageState | undefined;
      for (let run = 1; run <= 3; run++) {
        await playOneFullRun();
        const snapshot = player.getSnapshot();
        expect(snapshot.status).toBe('done');
        expect(snapshot.counter.remediated).toBeGreaterThan(0); // the approve path actually ran, every time

        if (referenceSnapshot === undefined) {
          referenceSnapshot = snapshot;
        } else {
          expect(snapshot).toEqual(referenceSnapshot);
        }

        player.reset();
      }

      // Every reset() must land back at the exact pre-Act-I state a
      // never-played instance starts at — checked after the THIRD run
      // specifically, since that is where any accumulated leak (a stray
      // audit entry, a lingering context item, a `messages` log that only
      // ever grows) would be most visible.
      const fresh = new ScenarioPlayer(scenario);
      expect(player.getSnapshot()).toEqual(fresh.getSnapshot());
    },
  );
});
