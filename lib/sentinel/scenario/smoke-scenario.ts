// Smoke scenario (P0 W0.5) — a short, checked-in fixture exercising every
// v3 ScenarioStep variant at least once, across all three act markers:
// `actMarker` (all three acts), `graphStep` (with and without `detail`,
// with and without `animatedEdges`), `chatTurn` (both roles), `render`
// (including a same-id re-render), `awaitApproval`, `awaitStageAction` with
// `action: 'policy-drop'`, `awaitStageAction` with `action: 'prompt'` plus a
// `suggested` string, `counterUpdate` (with and without `caption`),
// `auditWrite`, and `policyPanel`. It's player.test.ts's fixture for the
// full message-sequence/determinism suite.
//
// Content is synthetic, not the real demo script (that's P1–P3's job, built
// on the real seed data via lib/soe and the real policy content in
// lib/sentinel/policy.ts) — but it is v3-shaped: AU-policy language, the
// reshaped `{ scanned, exceptions, remediated }` counter, no balance-transfer
// references anywhere. Delays are kept ≤20ms so the suite runs fast under
// `vi.useFakeTimers()`. Chat narration is one calm operational sentence per
// line, in the v1 scripted voice (lib/agents/payment-health/script.ts).

import type { SentinelScenario } from './types';

export const smokeScenario: SentinelScenario = {
  id: 'smoke',
  steps: [
    { type: 'actMarker', act: 1, title: 'Act I — The gap' },

    {
      type: 'chatTurn',
      delayMs: 20,
      id: 'chat-act1-open',
      role: 'agent',
      text: 'Sentinel is idle — no continuous authorized-user policy check runs today.',
    },
    {
      type: 'counterUpdate',
      delayMs: 15,
      counter: { scanned: 0, exceptions: 0, remediated: 0 },
    },
    {
      type: 'counterUpdate',
      delayMs: 20,
      counter: { scanned: 0, exceptions: 0, remediated: 0 },
      caption: 'Manual sampling covers 40 accounts a month against 962 on the book.',
    },

    { type: 'actMarker', act: 2, title: 'Act II — Policy to production' },

    { type: 'policyPanel', delayMs: 10, panel: 'drop' },
    { type: 'policyPanel', delayMs: 10, panel: 'preview' },

    // The mock file-drop gate — a presenter-driven staging beat, not a
    // business decision (brief §6a). No `suggested`: there's nothing to
    // offer a suggestion chip for a file drop.
    { type: 'awaitStageAction', id: 'stage-action-policy-drop', action: 'policy-drop' },

    {
      type: 'chatTurn',
      delayMs: 20,
      id: 'chat-act2-open',
      role: 'agent',
      text: 'Reading the authorized-user eligibility policy and extracting enforceable rules.',
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
      detail: 'parsing §Product Eligibility',
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
      id: 'render-rule-r1',
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
              // `evaluability` has no runtime default outside an actual zod
              // `.parse()` call, so a hand-built fixture object must set it
              // explicitly — this is a normal drafted rule, not a data-gap
              // row (lib/sentinel/registry.ts's doc comment).
              evaluability: 'evaluable',
            },
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
        title: 'Activate 3 rules for continuous enforcement',
        description:
          'R1, R2, and R3 are drafted from AU-Eligibility-Policy-2026 and validated against available SOE data fields. 1 obligation is parked pending data onboarding.',
        rationale:
          'All three rules are evaluable with current SOE data — accounts, account-party-roles, and payment history.',
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
      // Same id as the earlier RuleDiff render — REPLACES it in place: the
      // visible "arming" moment (brief §3 Act II beat 4).
      type: 'render',
      delayMs: 10,
      id: 'render-rule-r1',
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
    {
      type: 'counterUpdate',
      delayMs: 20,
      counter: { scanned: 0, exceptions: 0, remediated: 0 },
      caption: 'Policy → production: 4 obligations extracted · 3 rules active · 1 data gap · 1 human approval.',
    },

    { type: 'actMarker', act: 3, title: 'Act III — The sweep' },

    // The conversation-rail prompt gate — carries `suggested` for the
    // presenter's suggestion chip (brief §4/§6a).
    {
      type: 'awaitStageAction',
      id: 'stage-action-prompt',
      action: 'prompt',
      suggested: 'Find me all the authorized user policy exceptions.',
    },

    {
      type: 'chatTurn',
      delayMs: 20,
      id: 'chat-act3-open',
      role: 'agent',
      text: 'Running the active rule set across the full portfolio — three datasets, one pass each.',
    },
    // Act III's signature beat: Data Collector fires three times, visibly,
    // because the three rules span three datasets (brief §3 Act III step
    // 2) — each call carries a `detail` caption naming the dataset.
    {
      type: 'graphStep',
      delayMs: 15,
      nodeId: 'data-collector',
      nodeState: 'working',
      animatedEdges: [{ from: 'policy-analyst', to: 'data-collector' }],
      detail: 'call 1 of 3 · accounts',
    },
    { type: 'graphStep', delayMs: 15, nodeId: 'data-collector', nodeState: 'done' },
    {
      type: 'graphStep',
      delayMs: 15,
      nodeId: 'data-collector',
      nodeState: 'working',
      detail: 'call 2 of 3 · party roles',
    },
    { type: 'graphStep', delayMs: 15, nodeId: 'data-collector', nodeState: 'done' },
    {
      type: 'graphStep',
      delayMs: 15,
      nodeId: 'data-collector',
      nodeState: 'working',
      detail: 'call 3 of 3 · payment history',
    },
    { type: 'graphStep', delayMs: 15, nodeId: 'data-collector', nodeState: 'done' },

    // A scripted user turn that is NOT a stage-action echo — proves the
    // conversation rail also carries a plain follow-up question.
    { type: 'chatTurn', delayMs: 15, id: 'chat-act3-followup', role: 'user', text: 'Show me the R1 exemplar.' },
    {
      type: 'chatTurn',
      delayMs: 20,
      id: 'chat-act3-exemplar',
      role: 'agent',
      text: 'R1 exemplar — secured card, authorized user still attached; citation follows.',
    },

    {
      type: 'counterUpdate',
      delayMs: 20,
      counter: { scanned: 1247, exceptions: 87, remediated: 0 },
    },
    {
      type: 'counterUpdate',
      delayMs: 20,
      counter: { scanned: 1247, exceptions: 87, remediated: 87 },
      caption: '1,247 scanned · 87 exceptions · 74 accounts · 1 human approval · full audit trail.',
    },
  ],
};
