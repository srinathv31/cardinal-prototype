// POST /api/agents/{agentId}/stream — starts or resumes an agent run
// (docs/wire-contract.md §1). Next 16: `params` is a Promise (see
// node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/route.md).
//
// Only 'payment-health' is wired up in this phase (bt-lifecycle / au-growth
// land in P2); any other agentId 404s.

import { createAgentUIStreamResponse, getToolName, isToolUIPart, validateUIMessages } from 'ai';
import { NextResponse } from 'next/server';
import { createPaymentHealthAgent, type PaymentHealthUIMessage } from '@/lib/agents/payment-health/agent';
import { append, hasHumanDecision } from '@/lib/events/store';

const KNOWN_AGENT_IDS = new Set(['payment-health']);

/** Truncates a free-text approval reason for the audit log — never a full
 * payload dump (brief §5e). */
function truncate(value: string, maxLen = 140): string {
  return value.length > maxLen ? `${value.slice(0, maxLen - 1)}…` : value;
}

/**
 * Scans the last assistant message for tool parts the client has already
 * resolved (`state: 'approval-responded'`) and writes one actor:'human'
 * Event Log entry per decision (docs/wire-contract.md §4). Idempotent via
 * hasHumanDecision: a resume POST re-sends the full message history, so the
 * same approval-responded part can be seen more than once across resumes.
 */
function logHumanApprovalDecisions(
  runId: string,
  agentId: string,
  messages: PaymentHealthUIMessage[],
): void {
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
  if (!lastAssistant) return;

  for (const part of lastAssistant.parts) {
    if (!isToolUIPart(part) || part.state !== 'approval-responded') continue;
    const { id: approvalId, approved, reason } = part.approval;
    if (hasHumanDecision(approvalId)) continue;

    append(
      {
        runId,
        agentId,
        step: -1,
        toolName: getToolName(part),
        inputSummary: reason ? truncate(reason) : undefined,
        outputSummary: approved ? 'Approved by operator' : 'Denied by operator',
        actor: 'human',
        kind: approved ? 'approval.granted' : 'approval.denied',
      },
      { approvalId },
    );
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ agentId: string }> },
): Promise<Response> {
  const { agentId } = await context.params;
  if (!KNOWN_AGENT_IDS.has(agentId)) {
    return NextResponse.json({ error: `Unknown agentId "${agentId}"` }, { status: 404 });
  }

  try {
    const body = (await request.json()) as { id?: unknown; messages?: unknown };
    if (typeof body.id !== 'string' || body.id.length === 0) {
      throw new Error('Request body must include a non-empty string "id" (the run id).');
    }
    const runId = body.id;

    const agent = createPaymentHealthAgent({ runId });
    const uiMessages = await validateUIMessages<PaymentHealthUIMessage>({
      messages: body.messages,
    });

    logHumanApprovalDecisions(runId, agentId, uiMessages);

    return await createAgentUIStreamResponse({ agent, uiMessages });
  } catch (error) {
    console.error(`[api/agents/${agentId}/stream]`, error);
    return NextResponse.json({ error: 'Agent run failed to start.' }, { status: 500 });
  }
}
