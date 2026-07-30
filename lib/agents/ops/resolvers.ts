// Pure server-side resolvers for the ops agent's five tools (DEMO_THESIS.md
// use case 1, beats 1–8). This is the ops surface's version of
// lib/agents/ask/resolvers.ts and lib/agents/servicing/resolvers.ts: every
// figure, name, date, rule sentence, and citation the chat shows is computed
// HERE, from checked-in fixtures and `lib/` functions, and the model only
// decides which of these functions runs (CLAUDE.md 5a — "the LLM is a router,
// not a data source"; 5b — "all intelligence lives server-side").
//
// Three sources feed everything below, and nothing else does:
//   • `lib/sentinel/policy.ts` — the AU policy document, its three rules, and
//     the fourth obligation the Critic parks as a data gap. The "parsed"
//     candidate rules are that fixture reshaped, never re-typed: the
//     requirement sentences are its `plainEnglish`, the citations are its
//     section headings, the machine footers are its `machine` blocks.
//   • `lib/rules/**` — the store a human's Gate-1 approval writes to, and
//     `queryViolations`, the stored-rule gate + narrowing that
//     `GET /api/violations` also calls (DEMO_BUILD_PLAN.md D3).
//   • `app/api/sentinel/remediate/route.ts` — the mock batch execution.
//     `runBatchRemoval` calls that route handler in-process rather than
//     re-implementing it, so the ops chat's confirmation id, counters, and
//     `action.executed` audit entry are the SAME ones the HTTP endpoint
//     produces, byte for byte, and cannot drift from it.
//
// The policy is server-pinned (`OPS_POLICY_ID`), the same way the servicing
// agent's cardholder is (lib/agents/servicing/identity.ts): no function here
// takes a policy id from the model, because none of them declares the
// parameter. DEMO_THESIS.md use case 3's ops side (card-activation) is a
// later wave's stitch — the seam is this constant and nothing else.

import { getAnchor } from '@/lib/soe';
import { formatDate } from '@/lib/agents/format';
import { queryViolations } from '@/lib/rules/query';
import {
  getRules,
  saveRules as saveRulesToStore,
  type PolicyId,
  type RuleInput,
} from '@/lib/rules/store';
import type { ViolationsPayload } from '@/lib/rules/evaluators';
import { getAuExceptionFixture } from '@/lib/sentinel/exception-fixture';
import { policyDocument, policyObligationGap, policyRules } from '@/lib/sentinel/policy';
import {
  sentinelRenderInstructionSchema,
  type SentinelRenderInstruction,
  type ViolationsDashboardProps,
} from '@/lib/sentinel/registry';
import { POST as remediatePost } from '@/app/api/sentinel/remediate/route';

/** The one policy this agent services (module header). */
export const OPS_POLICY_ID: PolicyId = 'authorized-user';

/** The agent id this surface runs under — also the id the remediate route's
 *  relaxed `agentId` refinement accepts (app/api/sentinel/remediate/route.ts)
 *  and the id every Event Log entry from this surface is attributed to. */
export const OPS_AGENT_ID = 'ops';

/** The rule ids a human can approve at Gate 1 — the three EVALUABLE rules of
 *  the AU policy fixture. Derived from the fixture, never re-typed, so a
 *  fourth drafted rule would flow through automatically. */
export const CANDIDATE_RULE_IDS = policyRules.map((rule) => rule.ruleId);
export type CandidateRuleId = (typeof CANDIDATE_RULE_IDS)[number];

/** How many flagged accounts the dashboard's table carries. The payload's
 *  `rows` can run to 87 and `violationsDashboardPropsSchema` caps the array at
 *  50, so a slice is required either way; 12 is the projector-legible count the
 *  Sentinel exception table already settled on, and the component prints
 *  "Showing 12 of 87" from `rows.length` and `summary.exceptions` so the slice
 *  is never mistaken for the total. */
const DASHBOARD_ROW_CAP = 12;

function validate(instruction: SentinelRenderInstruction): SentinelRenderInstruction {
  return sentinelRenderInstructionSchema.parse(instruction) as SentinelRenderInstruction;
}

/** The demo anchor as YYYY-MM-DD — `getAnchor()` is "start of today, UTC" or
 *  the pinned `DEMO_ANCHOR_DATE` (CLAUDE.md). Never `Date.now()`: every string
 *  this module stamps has to be byte-identical across a replay. */
function anchorIso(): string {
  return getAnchor().toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Beat 1–2 — parse the uploaded document into candidate rules
// ---------------------------------------------------------------------------

function sectionHeading(sectionId: string): string {
  const section = policyDocument.sections.find((s) => s.id === sectionId);
  if (!section) {
    throw new Error(`ops resolvers: policy document has no section ${sectionId}`);
  }
  return section.heading;
}

/** `"Authorized User Eligibility Policy · §Product Eligibility"` — byte-identical
 *  to the citation `lib/rules/evaluators.ts` puts on every violation row, so the
 *  rule the human approves and the rule the drill-down cites read the same. */
function citationFor(sectionId: string): string {
  return `${policyDocument.title} · §${sectionHeading(sectionId)}`;
}

/** `"R1 · accounts, account-party-roles · nightly sweep · current state"` — the
 *  RuleDiff machine footer flattened to the one line `StoredRule.machine` holds
 *  (lib/rules/store.ts's field comment). */
function machineFooter(rule: (typeof policyRules)[number]): string {
  return `${rule.machine.ruleId} · ${rule.machine.datasetsTouched.join(', ')} · ${rule.machine.evaluationTrigger}`;
}

/**
 * The candidate rules the agent proposes at Gate 1, in the policy fixture's
 * own order. `addedAt` is stamped from the demo anchor rather than the wall
 * clock so an approved rule set is byte-identical across replays
 * (lib/rules/store.ts accepts `addedAt` for exactly this reason).
 */
export function candidateRules(ruleIds?: readonly string[]): RuleInput[] {
  const wanted = ruleIds ? new Set(ruleIds) : null;
  const addedAt = `${anchorIso()}T00:00:00.000Z`;
  return policyRules
    .filter((rule) => !wanted || wanted.has(rule.ruleId))
    .map((rule) => ({
      id: rule.ruleId,
      title: rule.title,
      requirement: rule.plainEnglish,
      citation: citationFor(rule.excerpt.sectionId),
      machine: machineFooter(rule),
      addedAt,
    }));
}

/**
 * The parsed-document evidence: a `RuleDiff` card carrying the three drafted
 * rules AND the fourth obligation the Critic could not evaluate
 * (`policyObligationGap`). The data-gap row is the credibility beat — an agent
 * that names the limits of its own data — and it is the reason this render is
 * worth more than a bulleted list in narration.
 *
 * `status` is `'proposed'` here: nothing is stored until the human approves.
 */
export function parsedRulesInstruction(): SentinelRenderInstruction {
  return validate({
    component: 'RuleDiff',
    props: {
      title: `${policyDocument.id} → extracted rules`,
      status: 'proposed',
      rules: [
        ...policyRules.map((rule) => ({
          ruleId: rule.ruleId,
          title: rule.title,
          excerpt: {
            sectionHeading: sectionHeading(rule.excerpt.sectionId),
            quote: rule.excerpt.quote,
          },
          plainEnglish: rule.plainEnglish,
          machine: rule.machine,
          criticNote: rule.criticNote,
          validated: true,
          evaluability: 'evaluable' as const,
        })),
        {
          ruleId: policyObligationGap.obligationId,
          title: policyObligationGap.title,
          excerpt: {
            sectionHeading: sectionHeading(policyObligationGap.excerpt.sectionId),
            quote: policyObligationGap.excerpt.quote,
          },
          plainEnglish: policyObligationGap.plainEnglish,
          criticNote: policyObligationGap.criticNote,
          validated: false,
          evaluability: 'data-gap' as const,
        },
      ],
    },
  });
}

export interface ParsedPolicyDocument {
  status: 'parsed';
  /** The document's own title — never the uploaded file's name. The FILE is
   *  real (the presenter picks it) and its name appears on the user's turn;
   *  the CONTENT is the checked-in fixture, so everything downstream of the
   *  parse names the fixture (DEMO_BUILD_PLAN.md: "The *file* is real; the
   *  *content* is pinned"). */
  documentTitle: string;
  documentId: string;
  /** Rule ids drafted and validated — the ids Gate 1 offers to store. */
  ruleIds: string[];
  /** Obligations extracted but NOT drafted into machine-readable rules. */
  dataGapIds: string[];
  render: SentinelRenderInstruction;
}

export function parsePolicyDocument(): ParsedPolicyDocument {
  return {
    status: 'parsed',
    documentTitle: policyDocument.title,
    documentId: policyDocument.id,
    ruleIds: policyRules.map((rule) => rule.ruleId),
    dataGapIds: [policyObligationGap.obligationId],
    render: parsedRulesInstruction(),
  };
}

// ---------------------------------------------------------------------------
// Beat 3 — Gate 1: store the approved rules
// ---------------------------------------------------------------------------

export interface SaveRulesResultDetail {
  status: 'saved';
  policyId: PolicyId;
  saved: number;
  ruleIds: string[];
  /** Preformatted one-liners, `"R1 — Product Eligibility · Authorized User
   *  Eligibility Policy · §Product Eligibility"`, so a confirmation chip can
   *  name what was stored without re-deriving anything client-side. */
  stored: string[];
}

/**
 * Gate 1's side effect. The model supplies only WHICH rules to store (by id);
 * every stored field — title, requirement sentence, citation, machine footer —
 * comes from `candidateRules()` above, i.e. from the checked-in policy
 * document. There is no path by which a model-authored sentence becomes a
 * stored rule (CLAUDE.md 5a).
 */
export function saveApprovedRules(ruleIds: readonly string[]): SaveRulesResultDetail {
  const rules = candidateRules(ruleIds);
  if (rules.length === 0) {
    throw new Error(
      `ops resolvers: none of [${ruleIds.join(', ')}] is a rule in ${policyDocument.id}`,
    );
  }
  const { saved } = saveRulesToStore(OPS_POLICY_ID, rules);
  return {
    status: 'saved',
    policyId: OPS_POLICY_ID,
    saved,
    ruleIds: rules.map((r) => r.id),
    stored: rules.map((r) => `${r.title} · ${r.citation}`),
  };
}

// ---------------------------------------------------------------------------
// Beat 4–5 — query violations, render the dashboard, drill down
// ---------------------------------------------------------------------------

/**
 * A deterministic, proportional sample of the payload's rows for the on-screen
 * table. The evaluator emits rows grouped by rule (all 61 R1s, then the 19 R2s,
 * then the 7 R3s), so a plain `slice(0, 12)` would show a single-rule table
 * directly under a three-rule bar breakdown — a contradiction the audience
 * would see. Largest-remainder allocation over the per-rule counts keeps the
 * table's rule mix proportional to the breakdown above it (8 / 3 / 1 at the AU
 * figures), and every rule with at least one exception is guaranteed a row.
 *
 * This is presentation SELECTION, not derivation: no row is edited, no figure
 * is computed, and the order within each rule is the evaluator's own.
 */
function sampleRows(payload: ViolationsPayload, cap: number): ViolationsPayload['rows'] {
  if (payload.rows.length <= cap) return payload.rows;

  const byRuleId = new Map<string, ViolationsPayload['rows']>();
  for (const row of payload.rows) {
    const bucket = byRuleId.get(row.ruleId);
    if (bucket) bucket.push(row);
    else byRuleId.set(row.ruleId, [row]);
  }

  const total = payload.rows.length;
  const quotas = [...byRuleId.entries()].map(([ruleId, rows]) => {
    const exact = (rows.length * cap) / total;
    return { ruleId, rows, take: Math.floor(exact), fraction: exact - Math.floor(exact) };
  });

  let remaining = cap - quotas.reduce((sum, q) => sum + q.take, 0);
  for (const quota of [...quotas].sort((a, b) => b.fraction - a.fraction)) {
    if (remaining <= 0) break;
    quota.take += 1;
    remaining -= 1;
  }

  // Every rule that produced an exception shows at least one row, even when
  // rounding gave it none — borrowing from whichever rule has the most.
  for (const quota of quotas) {
    if (quota.take > 0) continue;
    const donor = quotas.reduce((max, q) => (q.take > max.take ? q : max), quotas[0]);
    if (donor.take <= 1) break;
    donor.take -= 1;
    quota.take += 1;
  }

  // Emitted in the payload's byRule order so the table reads R1, R2, R3.
  const order = new Map(payload.byRule.map((rule, index) => [rule.ruleId, index]));
  return quotas
    .sort((a, b) => (order.get(a.ruleId) ?? 0) - (order.get(b.ruleId) ?? 0))
    .flatMap((quota) => quota.rows.slice(0, quota.take));
}

export function violationsDashboardProps(payload: ViolationsPayload): ViolationsDashboardProps {
  return {
    policyId: payload.policyId,
    summary: payload.summary,
    byRule: payload.byRule,
    rows: sampleRows(payload, DASHBOARD_ROW_CAP),
  };
}

/** The requirement sentence a human actually approved for one rule id, read
 *  back out of the rule store (not out of the policy fixture): a narration
 *  that quotes a rule has to quote the version that is live, so the sentence
 *  on screen and the rule being enforced are the same sentence. */
export function storedRequirement(ruleId: string): string | undefined {
  return getRules(OPS_POLICY_ID).find((rule) => rule.id === ruleId)?.requirement;
}

export interface ViolationsNoRules {
  status: 'no-rules';
  policyId: PolicyId;
  message: string;
}

export interface ViolationsClean {
  status: 'clean';
  policyId: PolicyId;
  scanned: number;
  message: string;
}

export interface ViolationsFound {
  status: 'ok';
  policyId: PolicyId;
  scanned: number;
  accountsAffected: number;
  exceptions: number;
  byRule: ViolationsPayload['byRule'];
  /** How many of `exceptions` the rendered table carries. */
  rowsShown: number;
  render: SentinelRenderInstruction;
}

export type ViolationsResult = ViolationsFound | ViolationsNoRules | ViolationsClean;

/**
 * Beat 4. Calls `lib/rules/query.queryViolations` — the SAME function
 * `GET /api/violations` calls — so the chat and the endpoint enforce exactly
 * the rules a human approved, and report exactly the same totals.
 *
 * The empty-store answer is a real state, not an error to be papered over: the
 * rule store starts empty, so "no rules configured" is the literal truth until
 * Gate 1 runs. The agent says so and stops; it never fabricates a scan.
 */
export async function resolveViolations(): Promise<ViolationsResult> {
  const result = await queryViolations(OPS_POLICY_ID);

  if (result.status === 'no-rules') {
    return {
      status: 'no-rules',
      policyId: OPS_POLICY_ID,
      message:
        'No authorized-user rules are configured yet — nothing has been approved into the rule store, so there is nothing to evaluate against.',
    };
  }
  if (result.status === 'no-evaluator') {
    throw new Error(result.error);
  }

  const payload = result.payload;

  // Defensive: `violationsDashboardPropsSchema` requires at least one row, so a
  // fully clean book has no dashboard to render. Never expected at the AU seed
  // (87 exceptions at both demo anchors) — kept truthful rather than throwing
  // so a future reseed can't crash the surface.
  if (payload.rows.length === 0) {
    return {
      status: 'clean',
      policyId: OPS_POLICY_ID,
      scanned: payload.summary.scanned,
      message: `All ${payload.summary.scanned} authorized-user relationships passed the approved rules — no exceptions to report.`,
    };
  }

  const props = violationsDashboardProps(payload);
  return {
    status: 'ok',
    policyId: payload.policyId,
    scanned: payload.summary.scanned,
    accountsAffected: payload.summary.accountsAffected,
    exceptions: payload.summary.exceptions,
    byRule: payload.byRule,
    rowsShown: props.rows.length,
    render: validate({ component: 'ViolationsDashboard', props }),
  };
}

// ---------------------------------------------------------------------------
// Beat 7 — Gate 2: the mock batch removal
// ---------------------------------------------------------------------------

export interface BatchRemovalReceipt {
  status: 'executed';
  confirmationId: string;
  removed: number;
  accountsTouched: number;
  notificationsQueued: number;
  reportId: string;
  /** The mock's own words (DEMO_THESIS.md use case 1 beat 7 — "the actual
   *  removal is mocked; 'kicked off in batch' is enough"). */
  disposition: string;
}

/**
 * Gate 2's side effect, executed by calling `POST /api/sentinel/remediate`'s
 * handler in-process. Deliberately NOT a re-implementation: that route derives
 * its counters from `lib/sentinel/exception-fixture.ts`, derives
 * `confirmationId` as a pure function of the fixture's own report id, and
 * writes the single `action.executed` audit entry. Calling it means the ops
 * chat's receipt is byte-identical to the endpoint's — there is no second copy
 * of the formula to drift — and the audit trail records the removal exactly
 * once, attributed to this run.
 *
 * The route's `agentId` refinement was relaxed by one line to accept this
 * agent's id alongside `sentinel*` (see that file).
 */
export async function runBatchRemoval(runId: string): Promise<BatchRemovalReceipt> {
  const response = await remediatePost(
    new Request('http://ops.local/api/sentinel/remediate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ runId, agentId: OPS_AGENT_ID }),
    }),
  );

  if (!response.ok) {
    throw new Error(`Batch removal failed (${response.status}).`);
  }

  const body = (await response.json()) as {
    confirmationId: string;
    removed: number;
    accountsTouched: number;
    notificationsQueued: number;
    reportId: string;
  };

  return {
    status: 'executed',
    confirmationId: body.confirmationId,
    removed: body.removed,
    accountsTouched: body.accountsTouched,
    notificationsQueued: body.notificationsQueued,
    reportId: body.reportId,
    disposition: 'Kicked off in batch',
  };
}

// ---------------------------------------------------------------------------
// Beat 8 — the audit report artifact
// ---------------------------------------------------------------------------

/**
 * `rem-${reportId}` — the confirmation id `POST /api/sentinel/remediate`
 * returns. Restated here because that route computes it in a private local
 * function and this module must name the same artifact without re-running (and
 * so re-logging) the execution. The restatement is PINNED, not trusted:
 * lib/agents/ops/resolvers.test.ts asserts this value equals the id the route
 * actually returns, at both demo anchors, so the two cannot drift apart
 * silently.
 */
function confirmationIdFor(reportId: string): string {
  return `rem-${reportId}`;
}

export interface AuditReport {
  status: 'generated';
  filename: string;
  confirmationId: string;
  render: SentinelRenderInstruction;
}

/**
 * Beat 8. Renders the `ReportCard` whose download hits `GET /api/report`
 * (built separately, to this exact querystring contract). No side effect
 * beyond the render, which is why this tool is NOT approval-gated: the file is
 * produced by the GET when — and only when — a human clicks Download.
 *
 * Every figure comes from the same exception fixture the batch removal's
 * counters came from, so the sentence on the card and the receipt above it
 * cannot disagree.
 */
export async function buildAuditReport(): Promise<AuditReport> {
  const fixture = await getAuExceptionFixture();
  const anchor = anchorIso();
  const confirmationId = confirmationIdFor(fixture.reportId);
  const filename = `${OPS_POLICY_ID}-policy-audit-${anchor}.html`;

  return {
    status: 'generated',
    filename,
    confirmationId,
    render: validate({
      component: 'ReportCard',
      props: {
        filename,
        generatedAt: formatDate(anchor),
        summary: `All ${fixture.totalExceptions} authorized-user exceptions across ${fixture.accountsAffected} accounts, the rule each one breaks, and the approved batch removal recorded under ${confirmationId}.`,
        href: `/api/report?policy=${OPS_POLICY_ID}&confirmationId=${confirmationId}`,
      },
    }),
  };
}
