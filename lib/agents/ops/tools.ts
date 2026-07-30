// The ops agent's tool surface (DEMO_THESIS.md use case 1; DEMO_BUILD_PLAN.md
// "Ops agent (`lib/agents/ops/`) — tools, in demo order"). Five tools, two of
// them approval-gated:
//
//   1. parsePolicyDocument  read        — the uploaded doc → candidate rules
//   2. saveRules            GATE 1      — store the rules a human approved
//   3. queryViolations      read        — batch evaluation → ViolationsDashboard
//   4. executeBatchRemoval  GATE 2      — the mock batch removal
//   5. generateReport       read/render — the audit-report artifact
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
// the checked-in policy fixture via `candidateRules()`. `queryViolations` and
// `generateReport` take no input at all. The only free text the model authors
// is a `rationale`, which is editorial copy for the approval card — the same
// latitude `sendOutreachDraft` and `updateContactInfo` already take.

import { tool } from 'ai';
import { z } from 'zod';
import {
  buildAuditReport,
  candidateRules,
  CANDIDATE_RULE_IDS,
  parsePolicyDocument as parsePolicyDocumentResult,
  resolveViolations,
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
          "The uploaded file's name, exactly as the user's message reported it — " +
            'recorded for the audit trail only; the parse reads the document itself.',
        ),
    }),
    // `documentRef` is deliberately not passed through: the parse resolves the
    // checked-in policy content, and the file name is a model-relayed string
    // that must never reach the screen as if it were parsed data.
    execute: async () => parsePolicyDocumentResult(),
  });

  const saveRules = tool({
    description:
      'Store the extracted rules in the rule store so they can be evaluated ' +
      'against the book. SIDE EFFECTING — pauses for a human approval before ' +
      'it applies. Pass only the ids of the rules you extracted; the rule ' +
      'text, citation, and machine footer are read from the policy document, ' +
      'never from you. Wait for the result before continuing.',
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
      'Run the approved authorized-user rules against the whole book and ' +
      'render the results. Read-only. Returns "no-rules" — and renders ' +
      'nothing — when no rules have been approved yet; say so plainly rather ' +
      'than describing a scan that did not happen.',
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

  const generateReport = tool({
    description:
      'Produce the audit report for the completed batch removal and render its ' +
      'download card. No side effect beyond the render — the file is written ' +
      'only if a human clicks Download. Call this once, immediately after ' +
      'executeBatchRemoval succeeds; never after it is declined.',
    inputSchema: z.object({}),
    execute: async () => buildAuditReport(),
  });

  return {
    parsePolicyDocument,
    saveRules,
    queryViolations,
    executeBatchRemoval,
    generateReport,
  };
}

export type OpsTools = ReturnType<typeof createOpsTools>;

/** The two tools whose execution changes state — the ones `agent.ts` gates and
 *  `lib/events/telemetry.ts` logs as `action.executed` rather than
 *  `tool.executed`. Exported so both lists are read from one place. */
export const OPS_ACTION_TOOL_NAMES = ['saveRules', 'executeBatchRemoval'] as const;

// Re-exported for tests and the script, which need the same candidate-rule
// derivation the tools use without reaching past this module.
export { candidateRules };
