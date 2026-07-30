// Servicing tool surface (brief §5c/§5d/§7). Two tools:
//  - renderEvidence: read-only, same shape as every other agent's evidence
//    router — never approval-gated.
//  - updateContactInfo: the servicing chatbot's one side-effecting tool
//    (brief §7c — "the first write in lib/soe"), approval-gated via the
//    same AI SDK 7 tool-approval flow every action tool in this codebase
//    uses (toolApproval config lives on the agent, lib/agents/servicing/
//    agent.ts, per the SDK's approval-precedence rule — same pattern as
//    lib/agents/payment-health/tools.ts's header note).
//
// Neither tool's input schema accepts a partyId/accountId — brief §7a's
// "resolvers ignore any model-supplied account id" applies here too:
// updateContactInfo always writes PINNED_PARTY_ID (lib/agents/servicing/
// identity.ts), never a party id the model supplies. There is no such
// parameter to accept.

import { tool } from 'ai';
import { z } from 'zod';
import { evidenceSpecSchema } from '@/lib/registry/evidence';
import { updatePartyContact } from '@/lib/soe';
import { PINNED_PARTY_ID } from './identity';
import { resolveEvidence } from './resolvers';

export const renderEvidence = tool({
  description:
    'Render one piece of evidence on screen from the signed-in cardholder\'s ' +
    'account data. Call this for every fact you want the customer to see — ' +
    'transactions, next payment, balance, spending by category. Never state ' +
    'a figure in narration without also calling this tool to back it with a ' +
    'rendered component; the output is the only thing that reaches the screen.',
  inputSchema: evidenceSpecSchema,
  execute: async (input) => resolveEvidence(input),
});

const updateContactInfoInputSchema = z.object({
  phone: z.string().optional().describe('New phone number, exactly as the customer stated it — never invented'),
  mailingAddress: z
    .string()
    .optional()
    .describe('New mailing address, exactly as the customer stated it — never invented'),
  rationale: z
    .string()
    .describe(
      'One-sentence, plain-English summary of the requested change, for the confirmation card ' +
        '(e.g. "Update the phone number on file to the number you gave me.")',
    ),
});

/**
 * Proposes a contact-info change and, on approval, applies it via
 * lib/soe's one write path. Side effecting — requires human approval before
 * it executes (agent.ts's `toolApproval` config), exactly like every other
 * action tool in this codebase (proposeDueDateChange, sendOutreachDraft,
 * sendRetentionOutreach, sendGraduationInvite) — same machinery, pointed at
 * the customer instead of an ops user (brief §7c: the ApprovalCard reads as
 * "Confirm this change," not an ops approval).
 *
 * Pre-armed hostile question (brief §7c): changing contact information is a
 * real account-takeover vector. The confirmation gate below plus the
 * Event Log entry the stream route writes for the human decision
 * (app/api/agents/[agentId]/stream/route.ts's logHumanApprovalDecisions,
 * actor: 'human') are this prototype's controls. In production, the control
 * in front of THIS tool is step-up authentication (a fresh OTP/biometric
 * challenge) before the approval is even offered — out of scope for a
 * seeded demo with no auth (CLAUDE.md non-goals), but the reason this tool
 * doesn't pretend to be more secure than a confirmation click.
 */
export const updateContactInfo = tool({
  description:
    "Propose an update to the signed-in cardholder's phone number and/or " +
    'mailing address. Side effecting — requires the customer\'s confirmation ' +
    'before it executes. Use the exact value the customer gave you; never ' +
    'invent a phone number or address.',
  inputSchema: updateContactInfoInputSchema,
  execute: async ({ phone, mailingAddress }) => {
    const patch: { phone?: string; mailingAddress?: string } = {};
    if (phone !== undefined) patch.phone = phone;
    if (mailingAddress !== undefined) patch.mailingAddress = mailingAddress;

    const updated = await updatePartyContact(PINNED_PARTY_ID, patch);

    // Deterministic, never random (CLAUDE.md: "no Math.random() anywhere in
    // the scenario path" — the same replay-clean requirement
    // lib/agents/payment-health/tools.ts's confirmationId already follows)
    // — derived from which fields changed, not from their values, so two
    // different phone numbers still produce a stable, readable id.
    const changedFields = [
      phone !== undefined ? 'phone' : null,
      mailingAddress !== undefined ? 'address' : null,
    ].filter((f): f is string => f !== null);
    const confirmationId = `ctc-${PINNED_PARTY_ID}-${changedFields.length > 0 ? changedFields.join('-') : 'noop'}`;

    return {
      status: 'updated' as const,
      confirmationId,
      phone: updated.phone,
      mailingAddress: updated.mailingAddress,
    };
  },
});
