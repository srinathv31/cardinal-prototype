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
// ## Which policy is active — and why the model still never picks it
//
// This agent services TWO policies (DEMO_THESIS.md use case 1, and use case
// 3's ops side), but no function here takes a policy id from the model,
// because none of them declares the parameter. The active policy is decided
// by the two things a HUMAN did:
//
//   • WHICH DOCUMENT WAS UPLOADED. `parsePolicyDocument(documentRef)` selects
//     the checked-in fixture by keyword on the file name the presenter picked
//     (`/activation/i` → the card-activation policy; anything else → the
//     authorized-user policy, the default). The file name is a model-relayed
//     string, so it chooses a DOCUMENT and can never itself become on-screen
//     data — everything the parse returns still comes from the fixture.
//   • WHICH RULES WERE APPROVED. `saveApprovedRules` derives its policy from
//     the rule ids themselves (R1/R2/R3 vs CA-R1/CA-R2 — each id belongs to
//     exactly one document), so a Gate-1 approval is what makes a policy live.
//     `activePolicyId()` then reads that back out of the rule store, which is
//     the same server-side state `POST /api/reset` already clears.
//
// `OPS_POLICY_ID` remains the DEFAULT (and the id every pre-card-activation
// caller means), the same way the servicing agent's cardholder is pinned
// server-side (lib/agents/servicing/identity.ts).

import { getAnchor } from '@/lib/soe';
import { formatDate } from '@/lib/agents/format';
import { append } from '@/lib/events/store';
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
  cardActivationPolicyDocument,
  cardActivationPolicyRules,
} from '@/lib/sentinel/card-activation-policy';
import {
  sentinelRenderInstructionSchema,
  type SentinelRenderInstruction,
  type ViolationsDashboardProps,
} from '@/lib/sentinel/registry';
import { POST as remediatePost } from '@/app/api/sentinel/remediate/route';

/** The policy this agent services until a human's approval says otherwise
 *  (module header). */
export const OPS_POLICY_ID: PolicyId = 'authorized-user';

/** The agent id this surface runs under — also the id the remediate route's
 *  relaxed `agentId` refinement accepts (app/api/sentinel/remediate/route.ts)
 *  and the id every Event Log entry from this surface is attributed to. */
export const OPS_AGENT_ID = 'ops';

// ---------------------------------------------------------------------------
// The policy documents this agent can parse
// ---------------------------------------------------------------------------

/** The structural shape both checked-in policy fixtures already have —
 *  declared locally rather than imported from either, so neither
 *  `lib/sentinel/policy.ts` nor `lib/sentinel/card-activation-policy.ts` has
 *  to grow a shared base type for this agent's convenience. */
interface OpsPolicyRule {
  ruleId: string;
  title: string;
  plainEnglish: string;
  excerpt: { sectionId: string; quote: string };
  machine: { ruleId: string; datasetsTouched: string[]; evaluationTrigger: string };
  criticNote?: string;
}

interface OpsPolicySource {
  policyId: PolicyId;
  document: { id: string; title: string; sections: { id: string; heading: string; body: string }[] };
  rules: readonly OpsPolicyRule[];
  /** The obligation the Critic parked as a data gap, when the document has
   *  one. The AU policy does (§Consent and Authorization); the
   *  card-activation policy drafts every obligation it states, so its parse
   *  card carries rules only. */
  gap?: typeof policyObligationGap;
  /** Noun the sweep counts, for narration: "962 authorized-user
   *  relationships swept" vs "214 issued cards swept". Preformatted here
   *  because a policy's population is a property of the policy, not something
   *  a renderer or a model should decide. */
  scanUnit: string;
}

const AUTHORIZED_USER_SOURCE: OpsPolicySource = {
  policyId: 'authorized-user',
  document: policyDocument,
  rules: policyRules,
  gap: policyObligationGap,
  scanUnit: 'authorized-user relationships',
};

const CARD_ACTIVATION_SOURCE: OpsPolicySource = {
  policyId: 'card-activation',
  document: cardActivationPolicyDocument,
  rules: cardActivationPolicyRules,
  scanUnit: 'issued cards',
};

/** Default first — `sourceForRuleIds` scans in this order. */
const POLICY_SOURCES: readonly OpsPolicySource[] = [
  AUTHORIZED_USER_SOURCE,
  CARD_ACTIVATION_SOURCE,
];

const SOURCE_BY_POLICY_ID = new Map(POLICY_SOURCES.map((source) => [source.policyId, source]));

function sourceFor(policyId: PolicyId): OpsPolicySource {
  const source = SOURCE_BY_POLICY_ID.get(policyId);
  if (!source) throw new Error(`ops resolvers: no policy document on file for ${policyId}`);
  return source;
}

/** The one keyword that selects the card-activation fixture over the default.
 *  Matched against the uploaded file's NAME only (module header) — the
 *  checked-in document is `Card-Activation-Policy-2026`, and any file the
 *  presenter picks whose name says "activation" reads as that policy. */
const CARD_ACTIVATION_DOCUMENT_HINT = /activation/i;

/** Which checked-in document an upload resolves to. Never model-authored
 *  content: `documentRef` picks a fixture and is then discarded. */
function sourceForDocumentRef(documentRef?: string): OpsPolicySource {
  return documentRef && CARD_ACTIVATION_DOCUMENT_HINT.test(documentRef)
    ? CARD_ACTIVATION_SOURCE
    : AUTHORIZED_USER_SOURCE;
}

/** Which document defines these rule ids. Every candidate id belongs to
 *  exactly one fixture, so a Gate-1 approval names its own policy without
 *  anyone passing one; ids that belong to no document fall back to the
 *  default, where `saveApprovedRules` rejects them by name. */
function sourceForRuleIds(ruleIds: readonly string[]): OpsPolicySource {
  const wanted = new Set(ruleIds);
  return (
    POLICY_SOURCES.find((source) => source.rules.some((rule) => wanted.has(rule.ruleId))) ??
    AUTHORIZED_USER_SOURCE
  );
}

/** The policy a human's Gate-1 approval most recently made live — read out of
 *  the rule store rather than held in a second piece of session state, so
 *  `POST /api/reset` (which already calls `resetRules`) returns this to its
 *  opening value with nothing extra to wire. Empty store → the default, which
 *  is what makes "no authorized-user rules are configured yet" the honest
 *  answer at demo open. */
export function activePolicyId(): PolicyId {
  const stored = getRules();
  return stored.length > 0 ? stored[stored.length - 1].policyId : OPS_POLICY_ID;
}

/** The noun the sweep counts, e.g. "issued cards" (see `scanUnit`). */
export function policyScanUnit(policyId: PolicyId): string {
  return sourceFor(policyId).scanUnit;
}

/** The rule ids a human can approve at Gate 1 — every EVALUABLE rule of every
 *  policy fixture this agent can parse. Derived from the fixtures, never
 *  re-typed, so a fourth drafted rule would flow through automatically. Which
 *  of them may be stored TOGETHER is not this list's job: `saveApprovedRules`
 *  narrows to the single document the ids came from. */
export const CANDIDATE_RULE_IDS = POLICY_SOURCES.flatMap((source) =>
  source.rules.map((rule) => rule.ruleId),
);
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

function sectionHeading(source: OpsPolicySource, sectionId: string): string {
  const section = source.document.sections.find((s) => s.id === sectionId);
  if (!section) {
    throw new Error(`ops resolvers: policy document has no section ${sectionId}`);
  }
  return section.heading;
}

/** `"Authorized User Eligibility Policy · §Product Eligibility"` — byte-identical
 *  to the citation `lib/rules/evaluators.ts` puts on every violation row, so the
 *  rule the human approves and the rule the drill-down cites read the same. */
function citationFor(source: OpsPolicySource, sectionId: string): string {
  return `${source.document.title} · §${sectionHeading(source, sectionId)}`;
}

/** `"R1 · accounts, account-party-roles · nightly sweep · current state"` — the
 *  RuleDiff machine footer flattened to the one line `StoredRule.machine` holds
 *  (lib/rules/store.ts's field comment). */
function machineFooter(rule: OpsPolicyRule): string {
  return `${rule.machine.ruleId} · ${rule.machine.datasetsTouched.join(', ')} · ${rule.machine.evaluationTrigger}`;
}

/**
 * The candidate rules the agent proposes at Gate 1, in the policy fixture's
 * own order. `addedAt` is stamped from the demo anchor rather than the wall
 * clock so an approved rule set is byte-identical across replays
 * (lib/rules/store.ts accepts `addedAt` for exactly this reason).
 *
 * With no ids, the DEFAULT document's rules; with ids, the rules of whichever
 * document defines them (`sourceForRuleIds`) — so this never mixes two
 * policies' rules into one approval.
 */
export function candidateRules(ruleIds?: readonly string[]): RuleInput[] {
  const source = ruleIds ? sourceForRuleIds(ruleIds) : AUTHORIZED_USER_SOURCE;
  const wanted = ruleIds ? new Set(ruleIds) : null;
  const addedAt = `${anchorIso()}T00:00:00.000Z`;
  return source.rules
    .filter((rule) => !wanted || wanted.has(rule.ruleId))
    .map((rule) => ({
      id: rule.ruleId,
      title: rule.title,
      requirement: rule.plainEnglish,
      citation: citationFor(source, rule.excerpt.sectionId),
      machine: machineFooter(rule),
      addedAt,
    }));
}

/**
 * The parsed-document evidence: a `RuleDiff` card carrying every drafted rule
 * AND — for the AU policy — the fourth obligation the Critic could not
 * evaluate (`policyObligationGap`). The data-gap row is the credibility beat —
 * an agent that names the limits of its own data — and it is the reason this
 * render is worth more than a bulleted list in narration. The card-activation
 * document states no obligation its data cannot answer, so its card carries
 * rules only; inventing a gap to keep the shape symmetrical would be exactly
 * the kind of theater the gap row exists to disprove.
 *
 * `status` is `'proposed'` here: nothing is stored until the human approves.
 */
export function parsedRulesInstruction(
  source: OpsPolicySource = AUTHORIZED_USER_SOURCE,
): SentinelRenderInstruction {
  const gap = source.gap;
  return validate({
    component: 'RuleDiff',
    props: {
      title: `${source.document.id} → extracted rules`,
      status: 'proposed',
      rules: [
        ...source.rules.map((rule) => ({
          ruleId: rule.ruleId,
          title: rule.title,
          excerpt: {
            sectionHeading: sectionHeading(source, rule.excerpt.sectionId),
            quote: rule.excerpt.quote,
          },
          plainEnglish: rule.plainEnglish,
          machine: rule.machine,
          criticNote: rule.criticNote,
          validated: true,
          evaluability: 'evaluable' as const,
        })),
        ...(gap
          ? [
              {
                ruleId: gap.obligationId,
                title: gap.title,
                excerpt: {
                  sectionHeading: sectionHeading(source, gap.excerpt.sectionId),
                  quote: gap.excerpt.quote,
                },
                plainEnglish: gap.plainEnglish,
                criticNote: gap.criticNote,
                validated: false,
                evaluability: 'data-gap' as const,
              },
            ]
          : []),
      ],
    },
  });
}

export interface ParsedPolicyDocument {
  status: 'parsed';
  /** Which policy this document defines — the id every downstream beat of
   *  this turn works against. Derived from the document, never from the
   *  model. */
  policyId: PolicyId;
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

/**
 * `documentRef` — the uploaded file's name — selects WHICH checked-in document
 * is read (module header) and is then discarded: nothing it contains reaches
 * the screen. Omitted or unrecognized, the default (authorized-user) document
 * is parsed, which is the pre-card-activation behavior unchanged.
 */
export function parsePolicyDocument(documentRef?: string): ParsedPolicyDocument {
  const source = sourceForDocumentRef(documentRef);
  return {
    status: 'parsed',
    policyId: source.policyId,
    documentTitle: source.document.title,
    documentId: source.document.id,
    ruleIds: source.rules.map((rule) => rule.ruleId),
    dataGapIds: source.gap ? [source.gap.obligationId] : [],
    render: parsedRulesInstruction(source),
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
 *
 * The POLICY is derived from the ids too, not passed in: this write is what
 * makes a policy live, and `activePolicyId()` reads it back out of the store.
 */
export function saveApprovedRules(ruleIds: readonly string[]): SaveRulesResultDetail {
  const source = sourceForRuleIds(ruleIds);
  const rules = candidateRules(ruleIds);
  if (rules.length === 0) {
    throw new Error(
      `ops resolvers: none of [${ruleIds.join(', ')}] is a rule in ${source.document.id}`,
    );
  }
  const { saved } = saveRulesToStore(source.policyId, rules);
  return {
    status: 'saved',
    policyId: source.policyId,
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
export function storedRequirement(
  ruleId: string,
  policyId: PolicyId = activePolicyId(),
): string | undefined {
  return getRules(policyId).find((rule) => rule.id === ruleId)?.requirement;
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
 * The policy swept is `activePolicyId()`: the one whose rules a human most
 * recently approved (module header). It is never a parameter, so there is
 * nothing here for a model-supplied policy to occupy.
 *
 * The empty-store answer is a real state, not an error to be papered over: the
 * rule store starts empty, so "no rules configured" is the literal truth until
 * Gate 1 runs. The agent says so and stops; it never fabricates a scan.
 */
export async function resolveViolations(): Promise<ViolationsResult> {
  const policyId = activePolicyId();
  const result = await queryViolations(policyId);

  if (result.status === 'no-rules') {
    return {
      status: 'no-rules',
      policyId,
      message: `No ${policyId} rules are configured yet — nothing has been approved into the rule store, so there is nothing to evaluate against.`,
    };
  }
  if (result.status === 'no-evaluator') {
    throw new Error(result.error);
  }

  const payload = result.payload;

  // Defensive: `violationsDashboardPropsSchema` requires at least one row, so a
  // fully clean book has no dashboard to render. Never expected at either seed
  // (87 AU exceptions / 41 card-activation exceptions at both demo anchors) —
  // kept truthful rather than throwing so a future reseed can't crash the
  // surface.
  if (payload.rows.length === 0) {
    return {
      status: 'clean',
      policyId,
      scanned: payload.summary.scanned,
      message: `All ${payload.summary.scanned} ${policyScanUnit(policyId)} passed the approved rules — no exceptions to report.`,
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
// Card-activation Gate 2 — the mock activation outreach
// ---------------------------------------------------------------------------
//
// DEMO_THESIS.md use case 3, ops side: "human-in-the-loop takes some action on
// the result (same shape as use case 1's gate 2)." The action the
// card-activation policy itself prescribes is outreach, in its own words —
// "must be flagged for cardholder outreach" (CA-R2, §Activation Window) and
// "the primary cardholder directed to bring the account current" (CA-R1,
// §Activation While Past-Due) — so one batch of outreach covers the whole
// exception set, one message per flagged account.
//
// Mocked, exactly as the AU batch removal is (DEMO_THESIS.md ground rule 3 —
// "the seams are real, the backends behind some of them are not"): there is no
// card-activation remediation endpoint to call in-process, so unlike
// `runBatchRemoval` this one writes its own audit entry. The COUNT is not
// mocked: it is the narrowed evaluator's own `accountsAffected`, so approving
// only CA-R2 queues outreach to 29 cardholders and not 41.

/** `ca-out-20260805` — a pure function of the demo anchor, following
 *  lib/sentinel/activate-card.ts's `act-${cardId}-${anchorCompact}` and
 *  app/api/sentinel/remediate/route.ts's confirmation ids: byte-identical
 *  across replays, never `Math.random()`/`Date.now()`. One batch per demo day
 *  needs no per-run entropy — a second run of the same batch on the same day
 *  is the SAME batch, and a replay must be able to show that. */
export function activationOutreachConfirmationId(): string {
  return `ca-out-${anchorIso().replace(/-/g, '')}`;
}

export interface ActivationOutreachPlan {
  policyId: PolicyId;
  confirmationId: string;
  /** Primary cardholders the batch would contact — one per flagged account. */
  queued: number;
  /** Flagged cards behind those cardholders. */
  exceptions: number;
  scanned: number;
}

/**
 * What the batch WOULD do, read from the same narrowed payload the dashboard
 * rendered. Pure: no store write, no Event Log entry — the script calls this
 * to narrate the beat, and `runActivationOutreach` calls it to execute one.
 */
export async function planActivationOutreach(): Promise<ActivationOutreachPlan> {
  const result = await queryViolations(CARD_ACTIVATION_SOURCE.policyId);
  if (result.status !== 'ok') {
    throw new Error(
      `ops resolvers: cannot queue activation outreach — ${result.error}`,
    );
  }
  const { scanned, accountsAffected, exceptions } = result.payload.summary;
  return {
    policyId: CARD_ACTIVATION_SOURCE.policyId,
    confirmationId: activationOutreachConfirmationId(),
    queued: accountsAffected,
    exceptions,
    scanned,
  };
}

export interface ActivationOutreachReceipt extends ActivationOutreachPlan {
  status: 'executed';
  /** The mock's own words, mirroring `BatchRemovalReceipt.disposition`. */
  disposition: string;
}

/**
 * The gated side effect. Writes the one `action.executed` entry the batch
 * produces (CLAUDE.md 5e), attributed to this run — the counterpart of the
 * `au-policy.remediate` entry `POST /api/sentinel/remediate` writes on the AU
 * path. The agent-side record that the tool itself ran is separate and comes
 * from telemetry (lib/events/telemetry.ts's ACTION_TOOL_NAMES), the same way
 * it does for `executeBatchRemoval`.
 */
export async function runActivationOutreach(runId: string): Promise<ActivationOutreachReceipt> {
  const plan = await planActivationOutreach();
  append({
    runId,
    agentId: OPS_AGENT_ID,
    step: -1,
    kind: 'action.executed',
    toolName: 'card-activation.outreach',
    inputSummary: `Queue activation outreach for ${plan.exceptions} flagged cards across ${plan.queued} accounts`,
    outputSummary: `queued ${plan.queued} · confirmationId ${plan.confirmationId}`,
    actor: 'agent',
  });
  return { ...plan, status: 'executed', disposition: 'Queued for outreach' };
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
