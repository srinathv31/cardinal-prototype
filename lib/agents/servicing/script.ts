// Servicing's DEMO_MODE=scripted state machine (W4.5, brief §7d — "the only
// live-model surface in the demo... every rehearsed question needs a
// checked-in script"). Same shape as lib/agents/ask/script.ts: keyword-based
// matching against a fixed set of rehearsed turns, one evidence call per
// question, a grounded takeaway built from this agent's own resolveEvidence
// (resolvers.ts) — the same function tools.ts's renderEvidence tool calls —
// so narration is always byte-identical to what's on screen. Must NOT import
// ./agent (cycle risk — lib/ai/provider.ts's getAgentModel takes a script
// and agent.ts's `model:` line calls getAgentModel).
//
// Five rehearsed turns total: the four §7b evidence kinds (transactions,
// next payment, balance, spending-by-category) plus the §7c contact change.
// The phase's own verification instructions call out four turns to drive
// live (transactions / next payment / balance / contact change,
// CARDINAL_V3_AU_BRIEF.md P4 gate) — spending-by-category is the fifth,
// optional evidence kind §7b's table also lists (and the one the brief's
// cut-order names first if time runs short); it gets the same script/test
// coverage as the other three read kinds rather than being left half-wired.

import { getPayments } from '@/lib/soe';
import type { AgentScript, ScriptStep } from '@/lib/ai/scripted/types';
import {
  lastUserMessageText,
  toolDisposition,
  toolResultsSinceLastUserMessage,
} from '@/lib/ai/scripted/types';
import { PINNED_ACCOUNT_ID } from './identity';
import { resolveEvidence } from './resolvers';

type ServicingMatch = 'transactions' | 'next-payment' | 'balance' | 'category' | 'contact' | 'none';

/** Keyword match against the five rehearsed turns (brief §7b/§7c), in a
 * deliberate specificity order so e.g. "phone" never falls through to a
 * generic account question. Mirrors lib/agents/ask/script.ts's
 * matchAskQuestion. */
function matchServicingQuestion(text: string): ServicingMatch {
  const q = text.toLowerCase();
  if (q.includes('phone') || q.includes('address')) return 'contact';
  if (q.includes('transaction') || q.includes('latest')) return 'transactions';
  if (q.includes('payment') && (q.includes('due') || q.includes('next'))) return 'next-payment';
  if (q.includes('balance') || q.includes('available credit') || q.includes('credit limit')) return 'balance';
  if (q.includes('spend') || q.includes('spending') || q.includes('categor')) return 'category';
  return 'none';
}

// A fictional Austin, TX number consistent with the pinned cardholder's
// household (lib/soe/seed/patel.ts) — the fallback ONLY when the customer's
// own message doesn't contain a phone-shaped number, so a rehearsal that
// just says "I need to update my phone number" still has a concrete new
// value to propose (brief §3 Part B step 3 doesn't spell out a number).
const FALLBACK_PHONE = '(512) 555-0148';
const PHONE_PATTERN = /(\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/;

/** Pure function of the customer's message text — never random, so the same
 * turn always proposes (and later confirms) the same number. */
function extractPhone(text: string): string {
  const match = PHONE_PATTERN.exec(text);
  return match ? match[0].trim() : FALLBACK_PHONE;
}

const CANT_HELP_NARRATION =
  "I can show your recent transactions, your next payment due, your balance and available credit, or what you've been spending on by category — and I can update the phone number or mailing address on file. Try one of those.";

export const servicingScript: AgentScript = {
  agentId: 'servicing',

  async nextStep(prompt): Promise<ScriptStep> {
    const results = toolResultsSinceLastUserMessage(prompt);
    const questionText = lastUserMessageText(prompt) ?? '';
    const match = matchServicingQuestion(questionText);

    if (results.length === 0) {
      switch (match) {
        case 'transactions':
          return {
            narration: 'Pulling your recent transactions.',
            toolCalls: [
              {
                toolName: 'renderEvidence',
                input: {
                  component: 'TransactionTable',
                  source: { kind: 'servicing-recent-transactions', months: 3, limit: 15 },
                },
              },
            ],
            done: false,
          };
        case 'next-payment':
          return {
            narration: 'Checking your next payment.',
            toolCalls: [
              {
                toolName: 'renderEvidence',
                input: { component: 'MetricRow', source: { kind: 'servicing-next-payment' } },
              },
            ],
            done: false,
          };
        case 'balance':
          return {
            narration: 'Pulling your current balance and available credit.',
            toolCalls: [
              {
                toolName: 'renderEvidence',
                input: { component: 'MetricRow', source: { kind: 'servicing-account-summary' } },
              },
            ],
            done: false,
          };
        case 'category':
          return {
            narration: "Checking what you've been spending on.",
            toolCalls: [
              {
                toolName: 'renderEvidence',
                input: { component: 'CategoryPie', source: { kind: 'servicing-category-spend', months: 3 } },
              },
            ],
            done: false,
          };
        case 'contact': {
          const phone = extractPhone(questionText);
          return {
            narration: `I can update the phone number on file to ${phone} — confirming with you before I make the change.`,
            toolCalls: [
              {
                toolName: 'updateContactInfo',
                input: {
                  phone,
                  rationale: `Customer asked to update the phone number on file to ${phone}.`,
                },
              },
            ],
            done: false,
          };
        }
        case 'none':
          return { narration: CANT_HELP_NARRATION, toolCalls: [], done: true };
      }
    }

    // Second pass — the tool this turn called already has a result.
    if (match === 'contact') {
      const disposition = toolDisposition(results, 'updateContactInfo');
      const phone = extractPhone(questionText);
      const narration =
        disposition === 'approved'
          ? `Done — the phone number on file is now ${phone}.`
          : 'No problem — I did not make that change. The phone number on file is unchanged.';
      return { narration, toolCalls: [], done: true };
    }

    if (match === 'transactions') {
      const instruction = await resolveEvidence({
        component: 'TransactionTable',
        source: { kind: 'servicing-recent-transactions', months: 3, limit: 15 },
      });
      if (instruction.component !== 'TransactionTable') {
        throw new Error('servicing script: unexpected evidence shape while building the transactions takeaway');
      }
      return {
        narration: instruction.props.footnote ?? 'That covers your recent transactions.',
        toolCalls: [],
        done: true,
      };
    }

    if (match === 'next-payment') {
      // getPayments, not resolveEvidence's own recomputation, so this stays
      // a fresh SOE read independent of the resolver (same spirit as
      // lib/agents/payment-health/script.ts's missedPaymentDueDate helper).
      const scheduled = (await getPayments(PINNED_ACCOUNT_ID)).find((p) => p.status === 'SCHEDULED');
      const instruction = await resolveEvidence({
        component: 'MetricRow',
        source: { kind: 'servicing-next-payment' },
      });
      if (instruction.component !== 'MetricRow') {
        throw new Error('servicing script: unexpected evidence shape while building the next-payment takeaway');
      }
      const dueDate = instruction.props.metrics.find((m) => m.label === 'Due Date')?.value;
      const amountDue = instruction.props.metrics.find((m) => m.label === 'Amount Due')?.value;
      const narration =
        scheduled && dueDate && amountDue
          ? `Your next payment of ${amountDue} is due ${dueDate}.`
          : 'That covers your next payment.';
      return { narration, toolCalls: [], done: true };
    }

    if (match === 'balance') {
      const instruction = await resolveEvidence({
        component: 'MetricRow',
        source: { kind: 'servicing-account-summary' },
      });
      if (instruction.component !== 'MetricRow') {
        throw new Error('servicing script: unexpected evidence shape while building the balance takeaway');
      }
      const balance = instruction.props.metrics.find((m) => m.label === 'Balance')?.value;
      const available = instruction.props.metrics.find((m) => m.label === 'Available Credit')?.value;
      const narration =
        balance && available
          ? `Your balance is ${balance}, with ${available} available.`
          : 'That covers your balance and available credit.';
      return { narration, toolCalls: [], done: true };
    }

    if (match === 'category') {
      const instruction = await resolveEvidence({
        component: 'CategoryPie',
        source: { kind: 'servicing-category-spend', months: 3 },
      });
      if (instruction.component !== 'CategoryPie') {
        throw new Error('servicing script: unexpected evidence shape while building the category takeaway');
      }
      const top = instruction.props.slices[0];
      const totalValue = instruction.props.total?.value;
      const narration =
        top && totalValue
          ? `${top.label} leads at ${top.share} of your trailing spend, totaling ${totalValue}.`
          : totalValue
            ? `Your trailing spend totals ${totalValue}.`
            : "That covers what you've been spending on.";
      return { narration, toolCalls: [], done: true };
    }

    // evidenceCount > 0 with match === 'none' is unreachable — the only way
    // to get a tool result is this same script proposing one on a match.
    // Stays terminal and truthful if it's ever hit anyway.
    return { narration: 'That covers what I found.', toolCalls: [], done: true };
  },
};
