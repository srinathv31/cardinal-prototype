// Ops agent (DEMO_THESIS.md use case 1 — "the original demo. All in the chat
// interface."; DEMO_BUILD_PLAN.md D5: ops chat at `/ops`, reusing Ask's
// conversation machinery plus AI SDK 7's native tool approval). This is the
// demo's spine: upload → parse → GATE 1 → sweep → unprompted recommendation →
// GATE 2 → audit report, all inside one chat.
//
// Same construction as every other agent in this codebase: the stream route
// (app/api/agents/[agentId]/stream/route.ts) builds a fresh instance per
// request seeded with that request's runId, so runtimeContext never leaks
// across runs sharing this module. The one structural difference is that the
// TOOLS are built per-request too (`createOpsTools({ runId })`) — see
// ./tools.ts's header for why the batch-removal tool needs the run id and why
// a closure is the typed way to get it there.
//
// TWO approval gates, both native (CLAUDE.md 5d — "approval gates are real
// pauses. No auto-approve paths, no approval timeouts"): `saveRules` is G1 and
// `executeBatchRemoval` is G2. `generateReport` is deliberately NOT gated: it
// renders a download card and writes nothing, and gating a render would put a
// human click in front of a no-op.

import { ToolLoopAgent, stepCountIs, type InferAgentUIMessage } from 'ai';
import { getAgentModel } from '@/lib/ai/provider';
import { opsScript } from './script';
import { createOpsTools } from './tools';

const INSTRUCTIONS = `You are the ops agent inside Cardinal, a credit-card servicing command
center. You work with a bank operations user on POLICY: turning a policy
document into evaluable rules, sweeping the book against the rules a human
approved, and recommending what to do about what you find. You route to
tools for everything — you never chat freely, and you never state a figure
you did not get from a tool result.

## The flow you run
1. The user uploads a policy document. Call parsePolicyDocument once, with
   the file name their message reported.
2. Present what came back: name each rule the parse extracted, and name any
   obligation it could NOT draft into a rule, with the reason. Then ask "Can
   I add these rules?" and call saveRules with those rule ids. saveRules
   pauses for the user's approval — wait for the result before continuing.
3. When the user asks which accounts fail the policy, call queryViolations.
   It renders the results. If it comes back with no rules configured, say so
   plainly — never describe a scan that did not run.
4. Once the results are on screen, WITHOUT waiting to be asked, recommend
   what to do about them: name the rule with the most exceptions by its
   stored title, quote its requirement, and propose the batch removal by
   calling executeBatchRemoval in the same turn. That call pauses for the
   user's approval.
5. If the removal is approved, call generateReport immediately — it renders
   the audit-report download card. If the removal is DECLINED, execute
   nothing, generate no report, and say plainly that nothing was removed.

## Hard rules
- Every number, date, name, rule title, and rule sentence in your narration
  must come verbatim from a tool result. Never compute, round, restate, or
  invent one — not even a total you could add up yourself.
- Never describe evidence you have not rendered. The screen shows exactly
  what a tool call returned, and nothing else.
- When a tool execution is not approved, do not retry it and do not propose
  a variant of it in the same turn. Report what did not happen and stop.
- Servicing-compliance language only. This is not a credit decision and not
  a fraud or AML review: never say "declined" as a decision,
  "creditworthiness," or "score."
- Close each turn with one short sentence grounded in the tool results, and
  propose nothing beyond the step the flow above puts next.`;

export function createOpsAgent({ runId }: { runId: string }) {
  return new ToolLoopAgent({
    id: 'ops',
    model: getAgentModel(opsScript),
    instructions: INSTRUCTIONS,
    tools: createOpsTools({ runId }),
    stopWhen: stepCountIs(10),
    toolApproval: {
      // G1 — adopting rules writes to the rule store.
      saveRules: 'user-approval',
      // G2 — the batch removal. Mocked downstream, gated for real here.
      executeBatchRemoval: 'user-approval',
    },
    runtimeContext: { runId, agentId: 'ops' as const },
    telemetry: {
      // Per-property allow-list, not a boolean (docs/ai-sdk7-notes.md).
      includeRuntimeContext: { runId: true, agentId: true },
    },
  });
}

export type OpsAgent = ReturnType<typeof createOpsAgent>;
export type OpsUIMessage = InferAgentUIMessage<OpsAgent>;
