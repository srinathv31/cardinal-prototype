// Servicing tool surface (brief §5c/§5d/§7). Three tools:
//  - renderEvidence: read-only, same shape as every other agent's evidence
//    router — never approval-gated.
//  - updateContactInfo: a side-effecting tool (brief §7c — "the first write
//    in lib/soe"), approval-gated via the same AI SDK 7 tool-approval flow
//    every action tool in this codebase uses (toolApproval config lives on
//    the agent, lib/agents/servicing/agent.ts, per the SDK's
//    approval-precedence rule).
//  - activateCard: the card-activation gate (DEMO_THESIS.md Use case 3,
//    customer side; Wave 2 Agent E work item 3) — also approval-gated, also
//    side effecting. Calls lib/sentinel/activate-card.ts's
//    `activateCardForPersona`, the exact same function
//    POST /api/cards/activate wraps (D3: "tool call = endpoint, implemented
//    once").
//
// None of the three tools' input schemas accept a partyId/accountId/persona
// — brief §7a's "resolvers ignore any model-supplied account id" applies
// here too. There is no such parameter to accept.
//
// Persona pinning (DEMO_BUILD_PLAN.md D6, Wave 2 Agent E work item 1): like
// resolvers.ts, this file is now a factory — `createServicingTools(ctx)` —
// so the identity/persona a given agent instance was constructed for stays
// fixed for that instance's whole lifetime, never a per-call parameter a
// model's tool-call JSON could reach.

import { tool } from 'ai';
import { z } from 'zod';
import { servicingEvidenceSpecSchema, type EvidenceSpec } from '@/lib/registry/evidence';
import { updatePartyContact } from '@/lib/soe';
import { activateCardForPersona } from '@/lib/sentinel/activate-card';
import { identityForPersona, type ServicingIdentity, type ServicingPersona } from './identity';
import { createServicingResolvers, type ServicingResolvers } from './resolvers';

export interface ServicingToolsContext {
  identity: ServicingIdentity;
  persona: ServicingPersona;
  resolvers: ServicingResolvers;
  runId: string;
  agentId: string;
}

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

const activateCardInputSchema = z.object({
  rationale: z
    .string()
    .describe(
      'One-sentence, plain-English summary of the requested activation, for the confirmation card ' +
        '(e.g. "Activate the card on file for your account.")',
    ),
});

/**
 * Builds the servicing tool surface bound to ONE request's identity/persona
 * (see this file's header, and lib/agents/servicing/resolvers.ts's matching
 * header for the full structural-pinning rationale). Call once per agent
 * construction — lib/agents/servicing/agent.ts's createServicingAgent is the
 * only real caller; lib/agents/servicing/tools.test.ts calls it directly to
 * exercise both personas.
 */
export function createServicingTools(ctx: ServicingToolsContext) {
  const { identity, persona, resolvers, runId, agentId } = ctx;

  const renderEvidence = tool({
    description:
      'Render one piece of evidence on screen from the signed-in cardholder\'s ' +
      'account data. Call this for every fact you want the customer to see — ' +
      'transactions, next payment, next statement, balance, spending by ' +
      'category. Never state a figure in narration without also calling this ' +
      'tool to back it with a rendered component; the output is the only ' +
      'thing that reaches the screen.',
    // Narrowed to the kinds resolveEvidence actually dispatches, and FLAT —
    // the local llama.cpp endpoint emits `{}` for anyOf-shaped tool schemas
    // (see the schema's header in lib/registry/evidence.ts). Every valid
    // flat input is byte-compatible with the EvidenceSpec union member it
    // narrows, so the cast below is shape-preserving; a mismatched
    // component/kind pair still lands on resolveEvidence's existing throw.
    inputSchema: servicingEvidenceSpecSchema,
    execute: async (input) => resolvers.resolveEvidence(input as EvidenceSpec),
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
  const updateContactInfo = tool({
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

      const updated = await updatePartyContact(identity.partyId, patch);

      // Deterministic, never random (CLAUDE.md: "no Math.random() anywhere in
      // the scenario path") — derived from which fields changed, not from
      // their values, so two different phone numbers still produce a stable,
      // readable id.
      const changedFields = [
        phone !== undefined ? 'phone' : null,
        mailingAddress !== undefined ? 'address' : null,
      ].filter((f): f is string => f !== null);
      const confirmationId = `ctc-${identity.partyId}-${changedFields.length > 0 ? changedFields.join('-') : 'noop'}`;

      return {
        status: 'updated' as const,
        confirmationId,
        phone: updated.phone,
        mailingAddress: updated.mailingAddress,
      };
    },
  });

  /**
   * Activates the card on file for the signed-in cardholder's pinned
   * account (DEMO_THESIS.md Use case 3, customer side). Side effecting —
   * requires the customer's confirmation before it runs, same machinery as
   * updateContactInfo above (agent.ts's `toolApproval` config). Delegates to
   * lib/sentinel/activate-card.ts's `activateCardForPersona` — the exact
   * function POST /api/cards/activate wraps — so the chat gate and the REST
   * endpoint can never evaluate the policy two different ways. No
   * accountId/cardId input: `persona` is fixed for this tool instance's
   * whole lifetime (closed over via `ctx`, set once at agent construction —
   * see identity.ts's header for how persona reaches that construction
   * call), never a value the model supplies.
   */
  const activateCard = tool({
    description:
      "Activate the signed-in cardholder's newly issued card. Side effecting " +
      "— requires the customer's confirmation (a real Activate/Cancel pause) " +
      'before it runs. Runs the card-activation policy checks against this ' +
      "cardholder's own account and reports the real result: either the card " +
      'activates, or the account is currently failing a policy — report that ' +
      'result exactly as returned, in plain servicing language, never as a ' +
      'credit decision.',
    inputSchema: activateCardInputSchema,
    execute: async () => activateCardForPersona(persona, { runId, agentId }),
  });

  return { renderEvidence, updateContactInfo, activateCard };
}

export type ServicingTools = ReturnType<typeof createServicingTools>;

// Back-compat singletons (Wave 2 Agent E persona-pinning refactor) — bound
// to the 'happy' persona (Anand Patel) with a fixed, non-request-scoped
// runId/agentId. lib/agents/scripts.test.ts's cross-agent script suite
// still imports `updateContactInfo` this way (only to read its
// `.inputSchema`, never to `.execute` it — this pair is never wired into a
// real request; lib/agents/servicing/agent.ts's createServicingAgent always
// builds its own per-request instance via createServicingTools above). New
// code should prefer calling createServicingTools directly.
export const { renderEvidence, updateContactInfo, activateCard } = createServicingTools({
  identity: identityForPersona('happy'),
  persona: 'happy',
  resolvers: createServicingResolvers(identityForPersona('happy')),
  runId: 'servicing-default',
  agentId: 'servicing',
});
