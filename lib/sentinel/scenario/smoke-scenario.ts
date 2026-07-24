// Smoke scenario (W0.2) — a short, checked-in fixture exercising every
// ScenarioStep variant at least once, across all three act markers. Two
// jobs:
//   - player.test.ts's fixture for the full message-sequence/determinism
//     suite;
//   - the W2.1 gate: "a test sequence in the scenario file animates the
//     full graph convincingly" — includes a complete Orchestrator → Policy
//     Analyst → Rule Engineer → Critic working→done pass with animated
//     edges, plus a Data Collector double-fire (two working→done cycles),
//     Act III's signature cross-dataset beat (brief §3 Act III step 2).
//
// This is a synthetic fixture, not the real demo script (that's W3.3/W4.3's
// job, built on the real seed data via lib/soe). Delays are kept ≤50ms so
// the suite runs fast under `vi.useFakeTimers()`. Narration is one calm
// operational sentence per line, in the v1 scripted voice
// (lib/agents/payment-health/script.ts).

import type { SentinelScenario } from './types';

export const smokeScenario: SentinelScenario = {
  id: 'smoke',
  steps: [
    { type: 'actMarker', act: 1, title: 'Act I — The gap' },

    {
      type: 'emitEvent',
      delayMs: 15,
      event: {
        eventId: 'evt-smoke-1',
        accountId: 'acct-marcus',
        kind: 'payment.posted',
        summary: 'Payment posted — $142.00',
        timestamp: '2026-01-01T02:10:00.000Z',
      },
    },
    {
      // Stands in for Act III's 2:47 AM catch beat (brief §3): the one
      // event in this fixture that scrolls past highlighted-and-held.
      type: 'emitEvent',
      delayMs: 15,
      event: {
        eventId: 'evt-smoke-2',
        accountId: 'acct-marcus',
        kind: 'balance_transfer.initiated',
        summary: 'Balance transfer initiated — $3,200.00',
        timestamp: '2026-01-01T02:47:00.000Z',
      },
      highlight: true,
    },
    {
      // Stands in for Elena's R3 compliance-pass beat (brief §3 Act III
      // step 4): a quiet green check, not a violation.
      type: 'emitEvent',
      delayMs: 15,
      event: {
        eventId: 'evt-smoke-3',
        accountId: 'acct-elena',
        kind: 'bt.promo_expiring',
        summary: 'Promo APR expiring in 45 days',
        timestamp: '2026-01-01T05:30:00.000Z',
      },
      complianceBadge: 'R3 satisfied — 45-day notice on record',
    },
    {
      type: 'counterUpdate',
      delayMs: 20,
      counter: { events: 3, violations: 1, flagged: 0 },
      caption: 'Detected day 4 by manual sampling — if at all.',
    },

    { type: 'actMarker', act: 2, title: 'Act II — Policy to production' },

    {
      type: 'narration',
      delayMs: 20,
      id: 'narration-act2-open',
      text: 'Reading the balance-transfer servicing policy and extracting the three rules it defines.',
    },
    {
      type: 'graphStep',
      delayMs: 15,
      nodeId: 'orchestrator',
      nodeState: 'working',
      animatedEdges: [{ from: 'orchestrator', to: 'policy-analyst' }],
    },
    { type: 'graphStep', delayMs: 15, nodeId: 'orchestrator', nodeState: 'done' },
    {
      type: 'graphStep',
      delayMs: 15,
      nodeId: 'policy-analyst',
      nodeState: 'working',
      animatedEdges: [{ from: 'policy-analyst', to: 'rule-engineer' }],
    },
    { type: 'graphStep', delayMs: 15, nodeId: 'policy-analyst', nodeState: 'done' },
    {
      type: 'graphStep',
      delayMs: 15,
      nodeId: 'rule-engineer',
      nodeState: 'working',
      animatedEdges: [{ from: 'rule-engineer', to: 'critic' }],
    },
    { type: 'graphStep', delayMs: 15, nodeId: 'rule-engineer', nodeState: 'done' },
    {
      type: 'graphStep',
      delayMs: 15,
      nodeId: 'critic',
      nodeState: 'working',
      animatedEdges: [],
    },
    { type: 'graphStep', delayMs: 15, nodeId: 'critic', nodeState: 'done' },
    {
      type: 'render',
      delayMs: 20,
      id: 'render-rules-summary',
      instruction: {
        component: 'MetricRow',
        props: {
          metrics: [
            { label: 'Rules extracted', value: '3', tone: 'neutral' },
            { label: 'Datasets touched', value: '2', tone: 'neutral' },
            { label: 'Evaluable now', value: '3 of 3', tone: 'positive' },
          ],
        },
      },
    },
    {
      type: 'awaitApproval',
      id: 'approval-activate-rules',
      payload: {
        approvalId: 'approval-activate-rules',
        toolName: 'activateRules',
        title: 'Activate 3 rules for live enforcement',
        description:
          'R1, R2, and R3 are drafted from BT-Servicing-Policy-2026 and validated against available SOE data fields.',
        rationale:
          'All three rules are evaluable with current SOE data — payments, balance-transfer events, and promo notices.',
        evidence: ['Rule Diff view'],
      },
      audit: {
        runId: 'sentinel-smoke',
        agentId: 'sentinel-rule-engineer',
        step: 4,
        toolName: 'activateRules',
        inputSummary: 'Activate R1, R2, R3',
        outputSummary: 'Rules flipped to Active',
      },
    },
    {
      type: 'auditWrite',
      delayMs: 15,
      entry: {
        runId: 'sentinel-smoke',
        agentId: 'sentinel-orchestrator',
        step: 5,
        toolName: 'activateRules',
        inputSummary: 'R1, R2, R3',
        outputSummary: 'Rules active — enforcement armed',
        actor: 'agent',
        kind: 'action.executed',
      },
    },
    {
      type: 'counterUpdate',
      delayMs: 20,
      counter: { events: 3, violations: 1, flagged: 0 },
      caption: 'Policy → production: 3 rules · 1 human approval · minutes.',
    },

    { type: 'actMarker', act: 3, title: 'Act III — The catch' },

    {
      type: 'narration',
      delayMs: 20,
      id: 'narration-act3-open',
      text: 'Replaying the same night — checking each event against the rules the team just approved.',
    },
    {
      // Act III's signature beat: Data Collector fires twice, visibly two
      // calls, because the hero rule is cross-dataset (brief §3 step 2).
      type: 'graphStep',
      delayMs: 15,
      nodeId: 'data-collector',
      nodeState: 'working',
      animatedEdges: [{ from: 'policy-analyst', to: 'data-collector' }],
    },
    { type: 'graphStep', delayMs: 15, nodeId: 'data-collector', nodeState: 'done' },
    {
      type: 'graphStep',
      delayMs: 15,
      nodeId: 'data-collector',
      nodeState: 'working',
      animatedEdges: [{ from: 'data-collector', to: 'critic' }],
    },
    { type: 'graphStep', delayMs: 15, nodeId: 'data-collector', nodeState: 'done' },
    {
      type: 'counterUpdate',
      delayMs: 20,
      counter: { events: 3, violations: 1, flagged: 1 },
      caption: 'Caught in 6 seconds · human-approved response · full audit trail.',
    },
  ],
};
