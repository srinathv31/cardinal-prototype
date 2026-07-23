// Payment Health's DEMO_MODE=scripted state machine (W4.1) — encodes the
// exact sequence enumerated in agent.ts's INSTRUCTIONS block as a
// deterministic function of the prompt, so it drives the real
// ToolLoopAgent/tools/approval flow identically to a real model. Must NOT
// import ./agent (lib/ai/provider.ts's getAgentModel takes a script and
// agent.ts's `model:` line calls getAgentModel — importing agent.ts here
// would cycle).
//
// Every number/date in narration and in the two action-tool drafts is
// fetched from lib/soe — directly (missedPaymentDueDate) or via this
// agent's own resolveEvidence (resolvers.ts), which is exactly what
// tools.ts's renderEvidence tool calls, so a figure quoted here is always
// byte-identical to what's already on screen (never re-derived, never
// invented).

import { getPayments } from '@/lib/soe';
import { formatDate } from '@/lib/agents/format';
import type { AgentScript, ScriptStep, ScriptToolCall } from '@/lib/ai/scripted/types';
import {
  countToolResults,
  extractAccountId,
  toolDisposition,
  toolResultsSinceLastUserMessage,
} from '@/lib/ai/scripted/types';
import { resolveEvidence } from './resolvers';

// lib/soe/seed/marcus.ts's MARCUS_ACCOUNT_ID. Not imported directly — seed
// modules are internal to lib/soe (CLAUDE.md: "nothing imports seed data
// directly") — this is a routing id, not a data figure, used only when the
// trigger event's JSON fails to parse.
const FALLBACK_ACCOUNT_ID = 'acct-marcus';

async function missedPaymentDueDate(accountId: string): Promise<string | undefined> {
  const payments = await getPayments(accountId);
  const missed = payments.find((p) => p.status === 'MISSED');
  return missed ? formatDate(missed.dueDate) : undefined;
}

async function buildRiskRationale(accountId: string): Promise<string> {
  const [overview, risk, missedDueDate] = await Promise.all([
    resolveEvidence({ component: 'MetricRow', source: { kind: 'account-overview', accountId } }),
    // Placeholder rationale — resolvePaymentRisk only echoes it through
    // unchanged; we only want its computed `level`/`headline` here.
    resolveEvidence({ component: 'RiskBadge', source: { kind: 'payment-risk', accountId }, rationale: '' }),
    missedPaymentDueDate(accountId),
  ]);
  if (overview.component !== 'MetricRow' || risk.component !== 'RiskBadge') {
    throw new Error('payment-health script: unexpected evidence shape while building the risk rationale');
  }
  const utilization = overview.props.metrics.find((m) => m.label === 'Utilization')?.value ?? 'an elevated level';
  return missedDueDate
    ? `${risk.props.headline} — utilization is at ${utilization} and a payment was missed due ${missedDueDate}.`
    : `${risk.props.headline} — utilization is at ${utilization}, with no missed payments in the recent history.`;
}

function outreachBody(missedDueDate: string | undefined): string {
  const opening = missedDueDate
    ? `We noticed your payment due ${missedDueDate} didn't go through, and we'd like to help make sure that doesn't happen again.`
    : "We noticed some strain in your recent payment history, and we'd like to help make sure it doesn't happen again.";
  return [
    'Hi there,',
    '',
    `${opening} We're happy to talk through a short-term payment plan or adjust your due date to better match your pay schedule.`,
    '',
    "Reply anytime and we'll find an option that works for you.",
    '',
    '— Cardinal Servicing Team',
  ].join('\n');
}

function closingSentence(
  dueDateOutcome: 'approved' | 'denied' | 'none',
  outreachOutcome: 'approved' | 'denied' | 'none',
): string {
  const dueDateText =
    dueDateOutcome === 'approved' ? 'the due-date change has been applied' : 'the due-date change was declined';
  const outreachText =
    outreachOutcome === 'approved' ? 'the outreach email has been sent' : 'the outreach email was not sent';
  return `Update: ${dueDateText}, and ${outreachText}.`;
}

export const paymentHealthScript: AgentScript = {
  agentId: 'payment-health',

  async nextStep(prompt): Promise<ScriptStep> {
    const accountId = extractAccountId(prompt, FALLBACK_ACCOUNT_ID);
    const results = toolResultsSinceLastUserMessage(prompt);
    const evidenceCount = countToolResults(results, 'renderEvidence');

    if (evidenceCount === 0) {
      return {
        narration: 'Pulling the account balance and utilization snapshot for review.',
        toolCalls: [
          {
            toolName: 'renderEvidence',
            input: { component: 'MetricRow', source: { kind: 'account-overview', accountId } },
          },
        ],
        done: false,
      };
    }

    if (evidenceCount === 1) {
      return {
        narration: 'Checking how utilization has moved over the last six months.',
        toolCalls: [
          {
            toolName: 'renderEvidence',
            input: { component: 'TrendChart', source: { kind: 'utilization-trend', accountId, months: 6 } },
          },
        ],
        done: false,
      };
    }

    if (evidenceCount === 2) {
      return {
        narration: 'Reviewing the last six months of payment history for any missed payments.',
        toolCalls: [
          {
            toolName: 'renderEvidence',
            input: { component: 'PaymentHistoryTable', source: { kind: 'payment-history', accountId, months: 6 } },
          },
        ],
        done: false,
      };
    }

    if (evidenceCount === 3) {
      const rationale = await buildRiskRationale(accountId);
      return {
        narration: 'Assessing payment risk based on what the utilization and payment history show.',
        toolCalls: [
          {
            toolName: 'renderEvidence',
            input: { component: 'RiskBadge', source: { kind: 'payment-risk', accountId }, rationale },
          },
        ],
        done: false,
      };
    }

    // Evidence phase complete. Propose whichever action tools haven't
    // resolved yet — covers both the happy path (propose both together) and
    // a real model having proposed only one before falling back mid-run.
    const dueDateProposed = countToolResults(results, 'proposeDueDateChange') > 0;
    const outreachProposed = countToolResults(results, 'sendOutreachDraft') > 0;

    if (!dueDateProposed || !outreachProposed) {
      const missedDueDate = await missedPaymentDueDate(accountId);
      const toolCalls: ScriptToolCall[] = [];
      if (!dueDateProposed) {
        toolCalls.push({
          toolName: 'proposeDueDateChange',
          input: {
            accountId,
            proposedDueDayOfMonth: 22,
            rationale: missedDueDate
              ? `Moving the due date to the 22nd lands closer to a typical mid-month paycheck, reducing the chance of a repeat miss like the one due ${missedDueDate}.`
              : 'Moving the due date to the 22nd lands closer to a typical mid-month paycheck, giving more buffer before each due date.',
          },
        });
      }
      if (!outreachProposed) {
        toolCalls.push({
          toolName: 'sendOutreachDraft',
          input: {
            accountId,
            subject: "Let's find a payment plan that works for you",
            body: outreachBody(missedDueDate),
            rationale: missedDueDate
              ? `A payment due ${missedDueDate} was missed while utilization has been climbing — proactive, empathetic outreach now is warranted.`
              : 'Rising utilization calls for proactive, empathetic outreach before the next statement.',
          },
        });
      }
      return {
        narration: "Evidence is in — proposing a due-date change and payment-plan outreach for review.",
        toolCalls,
        done: false,
      };
    }

    return {
      narration: closingSentence(
        toolDisposition(results, 'proposeDueDateChange'),
        toolDisposition(results, 'sendOutreachDraft'),
      ),
      toolCalls: [],
      done: true,
    };
  },
};
