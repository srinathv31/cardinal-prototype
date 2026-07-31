// The ops agent's tool surface (DEMO_THESIS.md use case 1 and use case 3's ops
// side; DEMO_BUILD_PLAN.md "Ops agent (`lib/agents/ops/`) — tools, in demo
// order"). Six tools, three of them approval-gated:
//
//   1. parsePolicyDocument      read        — the uploaded doc → candidate rules
//   2. saveRules                GATE 1      — store the rules a human approved
//   3. queryViolations          read        — batch evaluation → ViolationsDashboard
//   4. executeBatchRemoval      GATE 2 (AU) — the mock batch removal
//   5. queueActivationOutreach  GATE 2 (CA) — the mock activation outreach
//   6. generateReport           read/render — the audit-report artifact
//
// The two policies share beats 1–3 and fork at the action: the AU sweep ends
// in a batch removal and an audit report, the card-activation sweep in queued
// cardholder outreach and no file (DEMO_THESIS.md's endpoint checklist puts the
// report on UC1 only). Which fork runs is decided by the policy a human
// approved at Gate 1, never by the model — see ./resolvers.ts's header.
//
// Approval config lives on the AGENT (`toolApproval`, ./agent.ts), not on the
// tools, per the SDK's approval-precedence rule and the precedent every action
// tool in this codebase already follows (lib/agents/servicing/tools.ts's
// `updateContactInfo`). Read-only tools simply have no entry there.
//
// ## Why this file exports a factory and the other agents' tools are consts
//
// `executeBatchRemoval` calls `POST /api/sentinel/remediate`'s handler
// in-process, and that handler needs the run's id to attribute its
// `action.executed` audit entry (CLAUDE.md 5e). AI SDK 7's
// `ToolExecutionOptions` carries `toolCallId`/`messages`/`context` but NOT the
// agent's `runtimeContext` (verified against
// node_modules/@ai-sdk/provider-utils/dist/index.d.ts), so the runId reaches
// the tool the only way that is fully typed and needs no unverified SDK
// surface: a closure, created per request alongside the agent itself.
//
// ## What the model may and may not put in a tool call
//
// Nothing in any schema below can become a number, name, date, or policy
// sentence on screen (CLAUDE.md 5a). `saveRules` takes rule IDS, never rule
// text — the stored title/requirement/citation/machine footer all come from
// the checked-in policy fixture via `candidateRules()`. `queryViolations`,
// `queueActivationOutreach`'s figures, and `generateReport` take no input at
// all. The only free text the model authors is a `rationale`, which is
// editorial copy for the approval card — the same latitude `sendOutreachDraft`
// and `updateContactInfo` already take.
//
// `parsePolicyDocument`'s `documentRef` is the one input that CHANGES what a
// tool does rather than only what the audit trail records: the file name picks
// which checked-in document is read (./resolvers.ts's header). It still cannot
// become on-screen data — the parse returns the fixture's own content and
// discards the ref — so the model chooses at most between two documents a
// human physically uploaded, and never a figure.

import { tool } from 'ai';
import { z } from 'zod';
import {
  buildAuditReport,
  candidateRules,
  CANDIDATE_RULE_IDS,
  parsePolicyDocument as parsePolicyDocumentResult,
  resolveViolations,
  runActivationOutreach,
  runBatchRemoval,
  saveApprovedRules,
} from './resolvers';

/** Non-empty tuple form of the candidate rule ids, for `z.enum`. Built from
 *  the policy fixture (resolvers.ts) rather than typed out, so the schema and
 *  the document can never list different rules. */
const RULE_ID_VALUES = CANDIDATE_RULE_IDS as [string, ...string[]];

export function createOpsTools({ runId }: { runId: string }) {
  const parsePolicyDocument = tool({
    description:
      'Read the policy document the user uploaded and extract the rules it ' +
      'contains. Returns the drafted, machine-evaluable rules plus any ' +
      'obligation that could NOT be drafted because the data to evaluate it ' +
      'is not on file. Read-only: nothing is stored until saveRules is ' +
      'approved. Call this once, immediately after a document is uploaded.',
    inputSchema: z.object({
      documentRef: z
        .string()
        .describe(
          "The uploaded file's name, exactly as the user's message reported it. " +
            'It selects which policy document is read and is recorded on the ' +
            'audit trail; the parse reads that document itself, never this string.',
        ),
    }),
    // `documentRef` reaches the resolver, which uses it ONLY to pick between
    // the checked-in policy fixtures (keyword match) and then drops it. No
    // model-relayed text reaches the screen as if it were parsed data.
    execute: async ({ documentRef }) => parsePolicyDocumentResult(documentRef),
  });

  const saveRules = tool({
    description:
      'Store the extracted rules in the rule store so they can be evaluated ' +
      'against the book. SIDE EFFECTING — pauses for a human approval before ' +
      'it applies. Pass only the ids of the rules you extracted, all from the ' +
      'one document you just parsed; the rule text, citation, machine footer, ' +
      'and the policy they belong to are read from that document, never from ' +
      'you. Wait for the result before continuing.',
    inputSchema: z.object({
      ruleIds: z
        .array(z.enum(RULE_ID_VALUES))
        .min(1)
        .describe('Ids of the extracted rules to store, e.g. ["R1","R2","R3"].'),
      rationale: z
        .string()
        .describe(
          'One sentence for the approval card describing what adopting these ' +
            'rules means (e.g. "Adopt the three evaluable authorized-user rules ' +
            'so the book can be swept against them.")',
        ),
    }),
    execute: async ({ ruleIds }) => saveApprovedRules(ruleIds),
  });

  const queryViolations = tool({
    description:
      'Run the approved rules against the whole book and render the results. ' +
      'Read-only. It sweeps whichever policy the user last approved rules for ' +
      '— you do not choose one. Returns "no-rules" — and renders nothing — ' +
      'when no rules have been approved yet; say so plainly rather than ' +
      'describing a scan that did not happen.',
    inputSchema: z.object({}),
    execute: async () => resolveViolations(),
  });

  const executeBatchRemoval = tool({
    description:
      'Kick off batch removal of the flagged authorized-user relationships. ' +
      'SIDE EFFECTING — pauses for a human approval before anything runs, and ' +
      'executes nothing if the approval is declined. Only propose this after ' +
      'queryViolations has rendered its findings.',
    inputSchema: z.object({
      rationale: z
        .string()
        .describe(
          'One sentence for the approval card describing the batch being ' +
            'proposed, grounded in the figures queryViolations returned.',
        ),
    }),
    execute: async () => runBatchRemoval(runId),
  });

  const queueActivationOutreach = tool({
    description:
      'Queue cardholder outreach for the flagged card-activation exceptions — ' +
      'one message per flagged account, which is what the card-activation ' +
      'policy itself prescribes. SIDE EFFECTING — pauses for a human approval ' +
      'before anything runs, and queues nothing if the approval is declined. ' +
      'Only propose this after queryViolations has rendered card-activation ' +
      'findings; it is not the action for an authorized-user sweep.',
    inputSchema: z.object({
      rationale: z
        .string()
        .describe(
          'One sentence for the approval card describing the outreach batch ' +
            'being proposed, grounded in the figures queryViolations returned.',
        ),
    }),
    execute: async () => runActivationOutreach(runId),
  });

  const generateReport = tool({
    description:
      'Produce the audit report for the completed AUTHORIZED-USER batch removal ' +
      'and render its download card. No side effect beyond the render — the ' +
      'file is written only if a human clicks Download. Call this once, ' +
      'immediately after executeBatchRemoval succeeds; never after it is ' +
      'declined, and never for a card-activation sweep, which produces no ' +
      'report.',
    inputSchema: z.object({}),
    execute: async () => buildAuditReport(),
  });

  return {
    parsePolicyDocument,
    saveRules,
    queryViolations,
    executeBatchRemoval,
    queueActivationOutreach,
    generateReport,
  };
}

export type OpsTools = ReturnType<typeof createOpsTools>;

/** The three tools whose execution changes state — the ones `agent.ts` gates
 *  and `lib/events/telemetry.ts` logs as `action.executed` rather than
 *  `tool.executed`. Exported so both lists are read from one place. */
export const OPS_ACTION_TOOL_NAMES = [
  'saveRules',
  'executeBatchRemoval',
  'queueActivationOutreach',
] as const;

// Re-exported for tests and the script, which need the same candidate-rule
// derivation the tools use without reaching past this module.
export { candidateRules };
