// AU Growth's DEMO_MODE=scripted state machine (W4.1) — encodes the exact
// sequence enumerated in agent.ts's INSTRUCTIONS block, including the
// early-exit path when no party is highlighted for graduation. Must NOT
// import ./agent (cycle risk — see lib/agents/payment-health/script.ts's
// header for the full explanation).
//
// Every number/date/name in narration and in the invitation draft is
// fetched via this agent's own resolveEvidence (resolvers.ts) — the same
// function tools.ts's renderEvidence tool calls — or formatted from a
// resolver's own raw number with lib/agents/format.ts, so a figure quoted
// here is always byte-identical to what's already on screen.

import { formatCurrency } from '@/lib/agents/format';
import type { AgentScript, ScriptStep } from '@/lib/ai/scripted/types';
import {
  countToolResults,
  extractAccountId,
  toolDisposition,
  toolResultsSinceLastUserMessage,
} from '@/lib/ai/scripted/types';
import { resolveEvidence } from './resolvers';

// lib/soe/seed/patel.ts's PATEL_ACCOUNT_ID. Not imported directly (see
// lib/agents/payment-health/script.ts's header) — used only when the
// trigger event's JSON fails to parse.
const FALLBACK_ACCOUNT_ID = 'acct-patel';

interface HighlightedParty {
  id: string;
  name: string;
  firstName: string;
}

async function highlightedParty(accountId: string): Promise<HighlightedParty | undefined> {
  const graph = await resolveEvidence({ component: 'PartyGraph', source: { kind: 'household-overview', accountId } });
  if (graph.component !== 'PartyGraph') {
    throw new Error('au-growth script: unexpected evidence shape while reading the household graph');
  }
  const match = graph.props.parties.find((p) => p.highlight);
  if (!match) return undefined;
  return { id: match.id, name: match.name, firstName: match.name.trim().split(/\s+/)[0] ?? match.name };
}

interface SpendGrowth {
  earliestSpend: string;
  latestSpend: string;
}

async function spendGrowth(accountId: string, partyId: string): Promise<SpendGrowth> {
  const trend = await resolveEvidence({
    component: 'TrendChart',
    source: { kind: 'au-spend-trend', accountId, partyId, months: 12 },
  });
  if (trend.component !== 'TrendChart') {
    throw new Error('au-growth script: unexpected evidence shape while reading the spend trend');
  }
  const points = trend.props.series[0]?.points ?? [];
  const earliest = points[0];
  const latest = points[points.length - 1];
  return {
    earliestSpend: earliest ? formatCurrency(earliest.value) : '',
    latestSpend: latest ? formatCurrency(latest.value) : '',
  };
}

function invitationBody(firstName: string, growth: SpendGrowth): string {
  return [
    `Hi ${firstName},`,
    '',
    `We've noticed your own spending on this account has grown from ${growth.earliestSpend}/mo to ${growth.latestSpend}/mo over the past year — a strong sign of financial independence. We'd love to invite you to apply for a card of your own, building on the account history you've already established.`,
    '',
    "Reply anytime if you'd like to learn more.",
    '',
    '— Cardinal Growth Team',
  ].join('\n');
}

function closingSentence(firstName: string, outcome: 'approved' | 'denied' | 'none'): string {
  return outcome === 'approved'
    ? `The graduation invitation has been sent to ${firstName}.`
    : `The graduation invitation to ${firstName} was declined.`;
}

export const auGrowthScript: AgentScript = {
  agentId: 'au-growth',

  async nextStep(prompt): Promise<ScriptStep> {
    const accountId = extractAccountId(prompt, FALLBACK_ACCOUNT_ID);
    const results = toolResultsSinceLastUserMessage(prompt);
    const evidenceCount = countToolResults(results, 'renderEvidence');

    if (evidenceCount === 0) {
      return {
        narration: 'Mapping the household relationships on this account.',
        toolCalls: [
          {
            toolName: 'renderEvidence',
            input: { component: 'PartyGraph', source: { kind: 'household-overview', accountId } },
          },
        ],
        done: false,
      };
    }

    if (evidenceCount === 1) {
      const party = await highlightedParty(accountId);
      if (!party) {
        return {
          narration:
            'No authorized user shows the spend-growth pattern that would justify a graduation invitation right now.',
          toolCalls: [],
          done: true,
        };
      }
      return {
        narration: `Charting how ${party.name}'s independent spend has moved over the last twelve months.`,
        toolCalls: [
          {
            toolName: 'renderEvidence',
            input: { component: 'TrendChart', source: { kind: 'au-spend-trend', accountId, partyId: party.id, months: 12 } },
          },
        ],
        done: false,
      };
    }

    if (evidenceCount === 2) {
      const party = await highlightedParty(accountId);
      const partyId = party?.id ?? '';
      return {
        narration: party
          ? `Checking ${party.name}'s recurring monthly charges for signs of financial independence.`
          : "Checking the household's recurring monthly charges for signs of financial independence.",
        toolCalls: [
          {
            toolName: 'renderEvidence',
            input: { component: 'MetricRow', source: { kind: 'au-recurring-spend', accountId, partyId } },
          },
        ],
        done: false,
      };
    }

    // Evidence phase complete.
    const party = await highlightedParty(accountId);
    if (!party) {
      // Defensive only — unreachable in practice, since evidenceCount===1
      // already stops the run when no party is highlighted.
      return {
        narration: 'No graduation candidate was confirmed, so no invitation is proposed.',
        toolCalls: [],
        done: true,
      };
    }

    if (countToolResults(results, 'sendGraduationInvite') === 0) {
      const growth = await spendGrowth(accountId, party.id);
      return {
        narration: `Evidence is in — drafting a graduation invitation for ${party.firstName}.`,
        toolCalls: [
          {
            toolName: 'sendGraduationInvite',
            input: {
              accountId,
              recipientPartyId: party.id,
              subject: 'A card of your own',
              body: invitationBody(party.firstName, growth),
              rationale: `${party.firstName}'s independent spend grew from ${growth.earliestSpend}/mo to ${growth.latestSpend}/mo over the last year — a strong graduation signal.`,
            },
          },
        ],
        done: false,
      };
    }

    return {
      narration: closingSentence(party.firstName, toolDisposition(results, 'sendGraduationInvite')),
      toolCalls: [],
      done: true,
    };
  },
};
