// Ask's DEMO_MODE=scripted state machine (W4.1, brief §8.2). Unlike the
// three monitor agents, Ask has no trigger event and no approval gate — a
// "step" here is one question/answer turn, and a run may hold several turns
// (docs/wire-contract.md §1). Must NOT import ./agent (cycle risk — see
// lib/agents/payment-health/script.ts's header for the full explanation).
//
// Matching is keyword-based against the two rehearsed questions (brief
// §8.2); every figure in the takeaway sentence comes from this agent's own
// resolveEvidence (resolvers.ts) — the same function tools.ts's
// renderEvidence tool calls — so it's always byte-identical to what's on
// screen.

import type { AgentScript, ScriptStep } from '@/lib/ai/scripted/types';
import { countToolResults, lastUserMessageText, toolResultsSinceLastUserMessage } from '@/lib/ai/scripted/types';
import { resolveEvidence } from './resolvers';

type AskMatch = 'category' | 'bt-expiring' | 'none';

function matchAskQuestion(question: string): AskMatch {
  const q = question.toLowerCase();
  if (q.includes('categor') || (q.includes('spend') && q.includes('portfolio'))) return 'category';
  if (q.includes('balance transfer') || q.includes('expir')) return 'bt-expiring';
  return 'none';
}

const CANT_HELP_NARRATION =
  'Ask can show portfolio spend by category, balance transfers expiring soon, recent transactions for one account or the whole portfolio, and a portfolio overview — try asking about one of those.';

export const askScript: AgentScript = {
  agentId: 'ask',

  async nextStep(prompt): Promise<ScriptStep> {
    const results = toolResultsSinceLastUserMessage(prompt);
    const evidenceCount = countToolResults(results, 'renderEvidence');
    const match = matchAskQuestion(lastUserMessageText(prompt) ?? '');

    if (evidenceCount === 0) {
      if (match === 'category') {
        return {
          narration: 'Pulling portfolio spend by category for the trailing quarter.',
          toolCalls: [
            {
              toolName: 'renderEvidence',
              input: { component: 'CategoryPie', source: { kind: 'portfolio-category-spend', months: 3 } },
            },
          ],
          done: false,
        };
      }
      if (match === 'bt-expiring') {
        return {
          narration: 'Checking which accounts have a balance transfer promo expiring soon.',
          toolCalls: [
            {
              toolName: 'renderEvidence',
              input: { component: 'BarBreakdown', source: { kind: 'bt-expiring-accounts', windowDays: 90 } },
            },
          ],
          done: false,
        };
      }
      return { narration: CANT_HELP_NARRATION, toolCalls: [], done: true };
    }

    // Takeaway turn — re-derive which evidence kind this question mapped to
    // (the match function is pure, so this is exactly what triggered the
    // renderEvidence call above) and ground the takeaway in its output.
    if (match === 'category') {
      const instruction = await resolveEvidence({
        component: 'CategoryPie',
        source: { kind: 'portfolio-category-spend', months: 3 },
      });
      if (instruction.component !== 'CategoryPie') {
        throw new Error('ask script: unexpected evidence shape while building the category takeaway');
      }
      const top = instruction.props.slices[0];
      const totalValue = instruction.props.total?.value;
      const narration =
        top && totalValue
          ? `${top.label} leads at ${top.share} of trailing spend, totaling ${totalValue} across the portfolio.`
          : totalValue
            ? `Trailing spend across the portfolio totals ${totalValue}.`
            : 'That covers portfolio spend by category for the trailing quarter.';
      return { narration, toolCalls: [], done: true };
    }

    if (match === 'bt-expiring') {
      const instruction = await resolveEvidence({
        component: 'BarBreakdown',
        source: { kind: 'bt-expiring-accounts', windowDays: 90 },
      });
      if (instruction.component !== 'BarBreakdown') {
        throw new Error('ask script: unexpected evidence shape while building the BT-expiring takeaway');
      }
      return {
        narration: instruction.props.footnote ?? 'That covers the accounts with a promo expiring soon.',
        toolCalls: [],
        done: true,
      };
    }

    // Unreachable in practice: evidenceCount > 0 this turn only happens after
    // this same script proposed the call above, which only happens on a
    // match. Stays terminal and truthful if it's ever hit anyway.
    return { narration: 'That covers what I found.', toolCalls: [], done: true };
  },
};
