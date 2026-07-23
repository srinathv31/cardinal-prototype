// Payment Health tool surface (brief §5c/§5d). These three tools are the
// ONLY way this agent touches data or produces a side effect — every number
// they return originates in lib/soe (§5a). renderEvidence is read-only and
// never needs approval; the two action tools are marked `user-approval` on
// the agent itself (lib/agents/payment-health/agent.ts) — approval
// precedence lives with the agent config per the AI SDK's toolApproval rule,
// not here.

import { tool } from 'ai';
import { z } from 'zod';
import { evidenceSpecSchema } from '@/lib/registry/evidence';
import { getPartiesForAccount } from '@/lib/soe';
import { resolveEvidence } from './resolvers';

export const renderEvidence = tool({
  description:
    'Render one piece of evidence on screen from live account data. Call ' +
    'this for every fact you want the user to see — balances, trends, ' +
    'payment history, risk. Never state a figure in narration without also ' +
    'calling this tool to back it with a rendered component; the output is ' +
    'the only thing that reaches the screen.',
  inputSchema: evidenceSpecSchema,
  execute: async (input) => resolveEvidence(input),
});

const proposeDueDateChangeInputSchema = z.object({
  accountId: z.string().describe('SOE account id, e.g. "acct-marcus"'),
  proposedDueDayOfMonth: z
    .number()
    .int()
    .min(1)
    .max(28)
    .describe('New monthly due day (1–28) to propose for this account'),
  rationale: z
    .string()
    .describe('Plain-English, servicing-language justification for the change'),
});

export const proposeDueDateChange = tool({
  description:
    "Propose moving this account's monthly due date to a new day of the " +
    'month. Side effecting — requires human approval before it executes.',
  inputSchema: proposeDueDateChangeInputSchema,
  execute: async ({ accountId, proposedDueDayOfMonth }) => ({
    status: 'executed' as const,
    confirmationId: `chg-${accountId}-${proposedDueDayOfMonth}`,
    effective: 'next statement cycle' as const,
  }),
});

const sendOutreachDraftInputSchema = z.object({
  accountId: z.string().describe('SOE account id, e.g. "acct-marcus"'),
  subject: z.string().describe('Email subject line'),
  body: z.string().describe('Empathetic, servicing-language email body'),
  rationale: z
    .string()
    .describe('Plain-English justification for sending this outreach'),
});

export const sendOutreachDraft = tool({
  description:
    'Send the drafted payment-support email. Side effecting — requires ' +
    'human approval before it executes. The recipient is resolved ' +
    'server-side from account party data — never supply a recipient yourself.',
  inputSchema: sendOutreachDraftInputSchema,
  execute: async ({ accountId }) => {
    const parties = await getPartiesForAccount(accountId);
    const primary = parties.find((p) => p.role.role === 'PRIMARY');
    if (!primary) {
      throw new Error(`SOE: no primary party found for account ${accountId}`);
    }
    return {
      status: 'sent' as const,
      channel: 'EMAIL' as const,
      to: primary.party.email,
      confirmationId: `out-${accountId}-1`,
    };
  },
});
