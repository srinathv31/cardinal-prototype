// Servicing agent (brief §7, §3 Part B — "this is what everyone means by
// AI"; DEMO_THESIS.md Use cases 2 and 3, customer side). Ask, re-scoped to
// one cardholder: same read-only evidence-routing shape as
// lib/agents/ask/agent.ts, plus two approval-gated action tools (brief §7c,
// DEMO_THESIS.md Use case 3). The stream route
// (app/api/agents/[agentId]/stream/route.ts, via lib/agents/registry.ts)
// constructs a fresh instance per request, seeded with that request's
// runId, so runtimeContext never leaks across runs sharing this module —
// identical to every other agent in this codebase.
//
// §7a — identity is server-pinned, and this is where that's structural, not
// just documented: the resolved identity (accountId/partyId,
// lib/agents/servicing/identity.ts) is set into runtimeContext at
// construction, the same way runId/agentId already are, AND every
// resolver/tool this agent calls (./resolvers, ./tools) closes over that
// same identity directly rather than accepting an account/party id as a
// parameter from anywhere the model could reach. Two belt-and-suspenders
// things are true at once: the pinned identity is visible in runtimeContext
// (matching the brief's literal wording, and available to telemetry same as
// runId/agentId), and — independently — the tool/resolver call graph has no
// accountId parameter for a model-supplied value to occupy in the first
// place. lib/agents/servicing/resolvers.test.ts proves the second half by
// construction, not by policy.
//
// Persona pinning (DEMO_BUILD_PLAN.md D6, Wave 2 Agent E work item 1): two
// personas now exist ('happy' → Anand Patel, 'blocked' → Marcus Webb,
// ./identity.ts). `createServicingAgent` accepts an explicit, optional
// `persona` for any direct caller (this file's own tests, or any future
// in-process caller) — but lib/agents/registry.ts's ONE real call site
// (`createServicingAgent({ runId })`, an out-of-scope file for this build's
// Wave 2 ownership split) never passes one, so persona there is parsed back
// out of `runId` via `personaFromRunId` (./identity.ts's header explains the
// convention and why it exists: registry.ts is off limits, and this is the
// one channel available to reach agent construction without touching it).
// app/servicing/page.tsx resolves `?persona=` server-side and
// components/servicing/servicing-conversation.tsx encodes it into the
// conversation id it already generates client-side per conversation, which
// becomes this exact `runId`.

import { ToolLoopAgent, stepCountIs, type InferAgentUIMessage } from 'ai';
import { getAgentModel } from '@/lib/ai/provider';
import { identityForPersona, personaFromRunId, type ServicingPersona } from './identity';
import { createServicingScript } from './script';
import { createServicingResolvers } from './resolvers';
import { createServicingTools } from './tools';

const AGENT_ID = 'servicing' as const;

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
- { component: "MetricRow", source: { kind: "servicing-next-statement" } } — their next statement: statement balance, current balance, minimum due, due date.
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

## Card activation
When the cardholder says they've received a new card and want to activate it
(e.g. "I just got my card, I'm here to activate it"), call activateCard with
a one-sentence rationale. This is side-effecting and pauses for the
cardholder's confirmation (Activate/Cancel) before it runs. Report the result
exactly as returned:
- If it activated, tell them their card is activated and give the
  confirmation id.
- If it's blocked, tell them plainly that their card arrived but the account
  is currently failing a policy, and state the finding exactly as returned —
  never soften it into an invented reason, and never call it a credit
  decision.

## Hard rules
- Every number, date, or name in your narration must come verbatim from a
  tool result. Never compute, round, or invent one yourself.
- Never describe evidence you haven't rendered — the frontend only ever
  shows what a renderEvidence call actually returned.
- Servicing language only (this is NOT a credit decision, NOT fraud/AML
  review): never say "declined" as a decision, "credit decision,"
  "creditworthiness," or "score," and never propose or imply any action
  beyond answering the question, applying a confirmed contact change, or
  running a confirmed card activation.
- After the evidence renders (or an action tool resolves), close with
  exactly one short sentence grounded in the tool results, and propose
  nothing further.`;

export function createServicingAgent({
  runId,
  persona,
}: {
  runId: string;
  persona?: ServicingPersona;
}) {
  const resolvedPersona = persona ?? personaFromRunId(runId);
  const identity = identityForPersona(resolvedPersona);
  const resolvers = createServicingResolvers(identity);
  const script = createServicingScript({ identity, persona: resolvedPersona, resolvers });
  const tools = createServicingTools({
    identity,
    persona: resolvedPersona,
    resolvers,
    runId,
    agentId: AGENT_ID,
  });

  return new ToolLoopAgent({
    id: AGENT_ID,
    model: getAgentModel(script),
    instructions: INSTRUCTIONS,
    tools,
    stopWhen: stepCountIs(8),
    toolApproval: {
      updateContactInfo: 'user-approval',
      activateCard: 'user-approval',
    },
    runtimeContext: {
      runId,
      agentId: AGENT_ID,
      persona: resolvedPersona,
      // §7a: fixed at construction, the way runId/agentId already are.
      pinnedAccountId: identity.accountId,
      pinnedPartyId: identity.partyId,
    },
    telemetry: {
      // Per-property allow-list, not a boolean (docs/ai-sdk7-notes.md).
      includeRuntimeContext: {
        runId: true,
        agentId: true,
        persona: true,
        pinnedAccountId: true,
        pinnedPartyId: true,
      },
    },
  });
}

export type ServicingAgent = ReturnType<typeof createServicingAgent>;
export type ServicingUIMessage = InferAgentUIMessage<ServicingAgent>;
