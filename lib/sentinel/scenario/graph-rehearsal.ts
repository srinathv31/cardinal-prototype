// Graph rehearsal scenario — the "test sequence in the scenario file [that]
// animates the full graph convincingly" a presenter uses to dial in the
// live-agent-graph renderer against a projector (brief §4). Loaded only via
// /sentinel?scenario=graph-rehearsal (app/sentinel/page.tsx); it is never
// part of the audience demo and never reached by the default route. P0
// leaves this fixture as `/sentinel`'s default scenario too, until P1's
// `buildDemoScenario` replaces it (app/sentinel/page.tsx's header comment).
//
// Unlike smoke-scenario.ts (player.test.ts's ≤20ms fixture, tuned for fast
// fake-timer runs), every timed step here holds a human-watchable delay
// (600-1600ms) so a person can actually watch each handoff land — total
// runtime at 1x is ~26-27s including the chat narration's typing-effect
// overhead.
//
// No `awaitApproval`: the approval-resolution UI isn't fully wired to this
// fixture, so a real gate here would hard-block the rehearsal loop with no
// way to continue. The Approval Gate node is exercised directly instead, via
// explicit graphSteps, which is enough to prove its "gate pending" glow and
// its return to steady-lit. No `render`/`auditWrite`/`counterUpdate`/
// `awaitStageAction` either — this fixture rehearses only the graph and the
// status ticker beneath it.
//
// Sequence: Act II's parse-and-validate chain (Orchestrator -> Policy
// Analyst -> Rule Engineer -> Critic, each working then done, edges
// animating along the handoff), the Approval Gate lighting up and holding
// before clearing, Act III's signature Data Collector double-fire (two
// distinct working -> done cycles with a visible gap, because R2 is
// cross-dataset — accounts, payments, and account-party-roles), and a
// wind-down back to all-idle with edges cleared — proving idle dims
// correctly and edge-clearing works even though the player itself ends
// `done`. Narration between phases is one calm operational sentence each,
// played as `chatTurn` steps with `role: 'agent'` (v3's single narration
// step type — types.ts's ChatTurnStep doc comment), in the v1 scripted
// voice (see lib/agents/payment-health/script.ts and smoke-scenario.ts's
// chat narration).

import type { SentinelScenario } from './types';

export const graphRehearsalScenario: SentinelScenario = {
  id: 'graph-rehearsal',
  steps: [
    { type: 'actMarker', act: 1, title: 'Graph rehearsal loop' },

    {
      type: 'chatTurn',
      delayMs: 1200,
      id: 'narration-rehearsal-open',
      role: 'agent',
      text: 'Orchestrator is routing the authorized-user eligibility policy to Policy Analyst for parsing.',
    },

    // Act II chain — orchestrator -> policy analyst -> rule engineer ->
    // critic, each working then done, edges animating along the handoff.
    {
      type: 'graphStep',
      delayMs: 1000,
      nodeId: 'orchestrator',
      nodeState: 'working',
      animatedEdges: [{ from: 'orchestrator', to: 'policy-analyst' }],
    },
    { type: 'graphStep', delayMs: 1000, nodeId: 'policy-analyst', nodeState: 'working' },
    { type: 'graphStep', delayMs: 900, nodeId: 'orchestrator', nodeState: 'done' },
    {
      type: 'graphStep',
      delayMs: 1000,
      nodeId: 'rule-engineer',
      nodeState: 'working',
      animatedEdges: [{ from: 'policy-analyst', to: 'rule-engineer' }],
    },
    { type: 'graphStep', delayMs: 900, nodeId: 'policy-analyst', nodeState: 'done' },
    {
      type: 'graphStep',
      delayMs: 1000,
      nodeId: 'critic',
      nodeState: 'working',
      animatedEdges: [{ from: 'rule-engineer', to: 'critic' }],
    },
    { type: 'graphStep', delayMs: 900, nodeId: 'rule-engineer', nodeState: 'done' },
    {
      type: 'graphStep',
      delayMs: 1100,
      nodeId: 'critic',
      nodeState: 'done',
      animatedEdges: [{ from: 'critic', to: 'approval-gate' }],
    },

    {
      type: 'chatTurn',
      delayMs: 1100,
      id: 'narration-rehearsal-gate',
      role: 'agent',
      text: 'Critic has validated the drafted rules and is routing them to the Approval Gate for sign-off.',
    },

    // Approval Gate beat — lights up, holds ~1.5s (the "gate pending"
    // look), then settles to steady-lit with the incoming edge cleared.
    { type: 'graphStep', delayMs: 900, nodeId: 'approval-gate', nodeState: 'working' },
    { type: 'graphStep', delayMs: 1500, nodeId: 'approval-gate', nodeState: 'done', animatedEdges: [] },

    {
      type: 'chatTurn',
      delayMs: 1300,
      id: 'narration-rehearsal-cross-dataset',
      role: 'agent',
      text:
        'Policy Analyst is citing a cross-dataset rule — Data Collector will pull both account and payment history records.',
    },

    // Data Collector double-fire — Act III's signature beat (brief §3 step
    // 2): two distinct working -> done cycles with a visible gap between
    // them, because the hero rule needs two separate lookups.
    {
      type: 'graphStep',
      delayMs: 1000,
      nodeId: 'data-collector',
      nodeState: 'working',
      animatedEdges: [{ from: 'policy-analyst', to: 'data-collector' }],
    },
    { type: 'graphStep', delayMs: 900, nodeId: 'data-collector', nodeState: 'done' },
    {
      type: 'graphStep',
      delayMs: 1000,
      nodeId: 'data-collector',
      nodeState: 'working',
      animatedEdges: [{ from: 'data-collector', to: 'critic' }],
    },
    { type: 'graphStep', delayMs: 900, nodeId: 'data-collector', nodeState: 'done' },

    {
      type: 'chatTurn',
      delayMs: 1000,
      id: 'narration-rehearsal-wind-down',
      role: 'agent',
      text: 'Investigation complete — resetting every node to idle before the next walkthrough.',
    },

    // Wind-down — every node back to idle; the final step also clears
    // edges, proving both idle dimming and edge-clearing work even though
    // the player itself ends `done`, not `idle`.
    { type: 'graphStep', delayMs: 700, nodeId: 'orchestrator', nodeState: 'idle' },
    { type: 'graphStep', delayMs: 700, nodeId: 'policy-analyst', nodeState: 'idle' },
    { type: 'graphStep', delayMs: 700, nodeId: 'rule-engineer', nodeState: 'idle' },
    { type: 'graphStep', delayMs: 700, nodeId: 'data-collector', nodeState: 'idle' },
    { type: 'graphStep', delayMs: 700, nodeId: 'critic', nodeState: 'idle' },
    { type: 'graphStep', delayMs: 800, nodeId: 'approval-gate', nodeState: 'idle', animatedEdges: [] },

    {
      type: 'chatTurn',
      delayMs: 1300,
      id: 'narration-rehearsal-close',
      role: 'agent',
      text: 'Rehearsal loop complete — every node has cycled through idle, working, and done.',
    },
  ],
};
