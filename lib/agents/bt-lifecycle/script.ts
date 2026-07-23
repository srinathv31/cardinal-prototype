// BT Lifecycle's DEMO_MODE=scripted state machine (W4.1) — encodes the exact
// sequence enumerated in agent.ts's INSTRUCTIONS block as a deterministic
// function of the prompt. Must NOT import ./agent (cycle risk — see
// lib/agents/payment-health/script.ts's header for the full explanation).
//
// Every number/date in narration and in the outreach draft is fetched via
// this agent's own resolveEvidence (resolvers.ts) — the same function
// tools.ts's renderEvidence tool calls — so a figure quoted here is always
// byte-identical to what's already on screen.

import type { AgentScript, ScriptStep } from '@/lib/ai/scripted/types';
import {
  countToolResults,
  extractAccountId,
  toolDisposition,
  toolResultsSinceLastUserMessage,
} from '@/lib/ai/scripted/types';
import { resolveEvidence } from './resolvers';

// lib/soe/seed/elena.ts's ELENA_ACCOUNT_ID. Not imported directly (see
// lib/agents/payment-health/script.ts's header) — used only when the
// trigger event's JSON fails to parse.
const FALLBACK_ACCOUNT_ID = 'acct-elena';

interface BtFacts {
  remainingBalance: string;
  promoEndDate: string;
  firstMonthInterest: string;
}

async function btFacts(accountId: string): Promise<BtFacts> {
  const [overview, timeline, projection] = await Promise.all([
    resolveEvidence({ component: 'MetricRow', source: { kind: 'bt-overview', accountId } }),
    resolveEvidence({ component: 'BTTimeline', source: { kind: 'bt-lifecycle', accountId } }),
    resolveEvidence({
      component: 'InterestProjectionChart',
      source: { kind: 'interest-projection', accountId, months: 12 },
    }),
  ]);
  if (
    overview.component !== 'MetricRow' ||
    timeline.component !== 'BTTimeline' ||
    projection.component !== 'InterestProjectionChart'
  ) {
    throw new Error('bt-lifecycle script: unexpected evidence shape while building outreach facts');
  }
  return {
    remainingBalance: overview.props.metrics.find((m) => m.label === 'Remaining Balance')?.value ?? '',
    promoEndDate: timeline.props.milestones.find((m) => m.id === 'promo-end')?.date ?? '',
    firstMonthInterest: projection.props.callouts.find((c) => c.label === 'First month interest')?.value ?? '',
  };
}

function outreachBody(facts: BtFacts): string {
  return [
    'Hi there,',
    '',
    `Your promotional 0% APR is set to end on ${facts.promoEndDate}. The current balance of ${facts.remainingBalance} would begin accruing interest at the standard rate — roughly ${facts.firstMonthInterest} in the first month alone if nothing changes.`,
    '',
    "We're happy to walk through payment-plan options before the promo ends — just reply and we'll set up a time.",
    '',
    '— Cardinal Servicing Team',
  ].join('\n');
}

function closingSentence(outcome: 'approved' | 'denied' | 'none'): string {
  return outcome === 'approved' ? 'The retention outreach has been sent.' : 'The retention outreach was declined.';
}

export const btLifecycleScript: AgentScript = {
  agentId: 'bt-lifecycle',

  async nextStep(prompt): Promise<ScriptStep> {
    const accountId = extractAccountId(prompt, FALLBACK_ACCOUNT_ID);
    const results = toolResultsSinceLastUserMessage(prompt);
    const evidenceCount = countToolResults(results, 'renderEvidence');

    if (evidenceCount === 0) {
      return {
        narration: 'Pulling the balance transfer overview — remaining balance, promo APR, and days left.',
        toolCalls: [
          { toolName: 'renderEvidence', input: { component: 'MetricRow', source: { kind: 'bt-overview', accountId } } },
        ],
        done: false,
      };
    }

    if (evidenceCount === 1) {
      return {
        narration: 'Mapping out the transfer timeline from initiation through the promo cliff.',
        toolCalls: [
          { toolName: 'renderEvidence', input: { component: 'BTTimeline', source: { kind: 'bt-lifecycle', accountId } } },
        ],
        done: false,
      };
    }

    if (evidenceCount === 2) {
      return {
        narration: 'Projecting interest if the balance keeps revolving at the go-to APR after the promo ends.',
        toolCalls: [
          {
            toolName: 'renderEvidence',
            input: {
              component: 'InterestProjectionChart',
              source: { kind: 'interest-projection', accountId, months: 12 },
            },
          },
        ],
        done: false,
      };
    }

    if (countToolResults(results, 'sendRetentionOutreach') === 0) {
      const facts = await btFacts(accountId);
      return {
        narration: 'Evidence is in — drafting proactive outreach before the promo expires.',
        toolCalls: [
          {
            toolName: 'sendRetentionOutreach',
            input: {
              accountId,
              subject: "Let's talk before your promo rate ends",
              body: outreachBody(facts),
              rationale: `The 0% promo ends on ${facts.promoEndDate} with ${facts.remainingBalance} remaining; reaching out now gives time to plan before interest starts accruing.`,
            },
          },
        ],
        done: false,
      };
    }

    return {
      narration: closingSentence(toolDisposition(results, 'sendRetentionOutreach')),
      toolCalls: [],
      done: true,
    };
  },
};
