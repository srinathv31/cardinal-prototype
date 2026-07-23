// BT Lifecycle tool surface (brief §3 Beat 3, §5c/§5d). These two tools are
// the ONLY way this agent touches data or produces a side effect — every
// number they return originates in lib/soe (§5a). renderEvidence is
// read-only and never needs approval; sendRetentionOutreach is marked
// `user-approval` on the agent itself (lib/agents/bt-lifecycle/agent.ts) —
// approval precedence lives with the agent config per the AI SDK's
// toolApproval rule, not here.

import { tool } from 'ai';
import { z } from 'zod';
import { evidenceSpecSchema } from '@/lib/registry/evidence';
import { getPartiesForAccount } from '@/lib/soe';
import { resolveEvidence } from './resolvers';

export const renderEvidence = tool({
  description:
    'Render one piece of evidence on screen from live account data. Call ' +
    'this for every fact you want the user to see — balances, promo dates, ' +
    'the transfer timeline, interest projections. Never state a figure in ' +
    'narration without also calling this tool to back it with a rendered ' +
    'component; the output is the only thing that reaches the screen.',
  inputSchema: evidenceSpecSchema,
  execute: async (input) => resolveEvidence(input),
});

const sendRetentionOutreachInputSchema = z.object({
  accountId: z.string().describe('SOE account id, e.g. "acct-elena"'),
  subject: z.string().describe('Email subject line'),
  body: z
    .string()
    .describe('Warm, plain-language email body about the upcoming promo expiration'),
  rationale: z
    .string()
    .describe('Plain-English, servicing-language justification for the outreach'),
});

export const sendRetentionOutreach = tool({
  description:
    'Send the drafted promo-expiration outreach email. Side effecting — ' +
    'requires human approval before it executes. The recipient is resolved ' +
    'server-side from account party data — never supply a recipient yourself.',
  inputSchema: sendRetentionOutreachInputSchema,
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
      confirmationId: `out-${accountId}-retention-1`,
    };
  },
});
