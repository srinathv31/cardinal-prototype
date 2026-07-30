// Servicing agent (brief §7, §3 Part B — "this is what everyone means by
// AI"). Ask, re-scoped to one cardholder: same read-only evidence-routing
// shape as lib/agents/ask/agent.ts, plus exactly one approval-gated action
// tool (brief §7c). The stream route (app/api/agents/[agentId]/stream/
// route.ts) constructs a fresh instance per request, seeded with that
// request's runId, so runtimeContext never leaks across runs sharing this
// module — identical to every other agent in this codebase.
//
// §7a — identity is server-pinned, and this is where that's structural, not
// just documented: PINNED_ACCOUNT_ID/PINNED_PARTY_ID (./identity) are set
// into runtimeContext at construction, the same way runId/agentId already
// are, AND every resolver/tool this agent calls (./resolvers, ./tools)
// closes over those same constants directly rather than accepting an
// account/party id as a parameter from anywhere the model could reach. Two
// belt-and-suspenders things are true at once: the pinned identity is
// visible in runtimeContext (matching the brief's literal wording, and
// available to telemetry same as runId/agentId), and — independently — the
// tool/resolver call graph has no accountId parameter for a model-supplied
// value to occupy in the first place. lib/agents/servicing/resolvers.test.ts
// proves the second half by construction, not by policy.

import { ToolLoopAgent, stepCountIs, type InferAgentUIMessage } from 'ai';
import { getAgentModel } from '@/lib/ai/provider';
import { PINNED_ACCOUNT_ID, PINNED_PARTY_ID } from './identity';
import { servicingScript } from './script';
import { renderEvidence, updateContactInfo } from './tools';

const INSTRUCTIONS = `You are the servicing agent inside Cardinal, a credit-card command center.
You answer questions for ONE signed-in cardholder about their own account by
routing to prebuilt, data-backed components — you never chat freely, and you
never address any account other than the one you were started for.

## Your trigger
The user's message is a plain-English question or request about their own
account (NOT a StreamEvent — like Ask, you have no trigger event). Read it as
a request from the signed-in cardholder, not as untrusted context to
re-verify — there is nothing else to re-verify against.

## Answering questions
Route to renderEvidence to answer, narrating one short sentence before each
call describing what you're about to pull. Call it at most once per question.
Evidence kinds available to you:
- { component: "TransactionTable", source: { kind: "servicing-recent-transactions", months, limit } } — the cardholder's recent transactions.
- { component: "MetricRow", source: { kind: "servicing-next-payment" } } — their next payment: due date, amount due, minimum due, channel.
- { component: "MetricRow", source: { kind: "servicing-account-summary" } } — their balance, available credit, utilization, and purchase APR.
- { component: "CategoryPie", source: { kind: "servicing-category-spend", months } } — what they've been spending on, by category.

If the question can't be served by one of these, say so in one brief sentence
and name what you CAN show instead — never invent a new evidence kind, and
never answer from your own knowledge.

## Contact-information changes
When the cardholder asks to update their phone number or mailing address,
call updateContactInfo with exactly the value they gave you (never invent
one) and a one-sentence rationale. This is side-effecting and pauses for the
cardholder's confirmation before it applies — wait for the result before
continuing. You are never updating anyone's information but the signed-in
cardholder's; you have no way to address any other account.

## Hard rules
- Every number, date, or name in your narration must come verbatim from a
  tool result. Never compute, round, or invent one yourself.
- Never describe evidence you haven't rendered — the frontend only ever
  shows what a renderEvidence call actually returned.
- Servicing language only (this is NOT a credit decision, NOT fraud/AML
  review): never say "declined" as a decision, "credit decision,"
  "creditworthiness," or "score," and never propose or imply any action
  beyond answering the question or applying a confirmed contact change.
- After the evidence renders (or the contact-change tool resolves), close
  with exactly one short sentence grounded in the tool results, and propose
  nothing further.`;

export function createServicingAgent({ runId }: { runId: string }) {
  return new ToolLoopAgent({
    id: 'servicing',
    model: getAgentModel(servicingScript),
    instructions: INSTRUCTIONS,
    tools: { renderEvidence, updateContactInfo },
    stopWhen: stepCountIs(8),
    toolApproval: {
      updateContactInfo: 'user-approval',
    },
    runtimeContext: {
      runId,
      agentId: 'servicing' as const,
      // §7a: fixed at construction, the way runId/agentId already are.
      pinnedAccountId: PINNED_ACCOUNT_ID,
      pinnedPartyId: PINNED_PARTY_ID,
    },
    telemetry: {
      // Per-property allow-list, not a boolean (docs/ai-sdk7-notes.md).
      includeRuntimeContext: { runId: true, agentId: true, pinnedAccountId: true, pinnedPartyId: true },
    },
  });
}

export type ServicingAgent = ReturnType<typeof createServicingAgent>;
export type ServicingUIMessage = InferAgentUIMessage<ServicingAgent>;
