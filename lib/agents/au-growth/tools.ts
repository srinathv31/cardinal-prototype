// AU Growth tool surface (brief §3 Beat 4, §5c/§5d). These two tools are the
// ONLY way this agent touches data or produces a side effect — every number
// they return originates in lib/soe (§5a). renderEvidence is read-only and
// never needs approval; sendGraduationInvite is marked `user-approval` on
// the agent itself (lib/agents/au-growth/agent.ts) — approval precedence
// lives with the agent config per the AI SDK's toolApproval rule, not here.

import { tool } from 'ai';
import { z } from 'zod';
import { evidenceSpecSchema } from '@/lib/registry/evidence';
import { getPartiesForAccount } from '@/lib/soe';
import { resolveEvidence } from './resolvers';

export const renderEvidence = tool({
  description:
    'Render one piece of evidence on screen from live account data. Call ' +
    'this for every fact you want the user to see — household relationships, ' +
    'attributed spend trends, recurring commitments. Never state a figure in ' +
    'narration without also calling this tool to back it with a rendered ' +
    'component; the output is the only thing that reaches the screen.',
  inputSchema: evidenceSpecSchema,
  execute: async (input) => resolveEvidence(input),
});

const sendGraduationInviteInputSchema = z.object({
  accountId: z.string().describe('SOE account id, e.g. "acct-patel"'),
  recipientPartyId: z
    .string()
    .describe(
      "SOE party id of the authorized user to invite — the PartyGraph result's highlighted party",
    ),
  subject: z.string().describe('Email subject line'),
  body: z
    .string()
    .describe('Warm, plain-language invitation to apply for their own card'),
  rationale: z
    .string()
    .describe('Plain-English justification for extending this invitation'),
});

export const sendGraduationInvite = tool({
  description:
    'Send the drafted invitation for an authorized user to apply for their ' +
    'own card. Side effecting — requires human approval before it executes. ' +
    'The recipient email is resolved server-side from party data, and ' +
    'invitations may only go to authorized users on the account.',
  inputSchema: sendGraduationInviteInputSchema,
  execute: async ({ accountId, recipientPartyId }) => {
    const parties = await getPartiesForAccount(accountId);
    const recipient = parties.find((p) => p.party.partyId === recipientPartyId);
    if (!recipient) {
      throw new Error(`SOE: party ${recipientPartyId} is not on account ${accountId}`);
    }
    if (recipient.role.role !== 'AUTHORIZED_USER') {
      // Server-enforced guardrail, not model-enforced: graduation invitations
      // only ever target authorized users (brief §3 Beat 4, §9).
      throw new Error('Graduation invitations may only be sent to authorized users.');
    }
    return {
      status: 'sent' as const,
      channel: 'EMAIL' as const,
      to: recipient.party.email,
      confirmationId: `inv-${accountId}-${recipientPartyId}`,
    };
  },
});
