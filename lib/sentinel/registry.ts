// Sentinel-stage component schemas (v3, additive) — the Sentinel-only
// extension of the v1 component registry (`lib/registry/schemas.ts`,
// CLAUDE.md 5c). v1's registry is deliberately untouched: every
// Sentinel-specific component lives here instead, mirroring the parent
// registry's zod idiom (preformatted display strings, comments on
// derived-vs-editorial fields) rather than reopening it.
//
// v3 removed `BTEventDetail` (docs/v3-migration-map.md §2b): the v2 hero
// card for a single balance-transfer event ("$3,200 initiated 02:47") has
// no v3 equivalent, because Act III's sweep is an aggregate over the whole
// book rather than an investigation into one event — there is no single
// event to build a hero card around. `RuleDiff`, `RuleCitation`, and
// `DecisionCard` all survive the re-point unchanged; only their doc-comment
// examples are updated below to the AU policy's actual language
// (lib/sentinel/policy.ts). P3 (brief §5c) adds the final two:
// `PolicyExceptionTable` (the aggregate flagged-relationship table Act III
// renders) and `RemediationReport` (the post-approval outcome card). Both
// are fed by `lib/sentinel/exception-fixture.ts` — the single server-only,
// deterministic derivation off `getAuScanPortfolio()` + `evaluateAuPolicy()`
// that also backs `GET /api/sentinel/report`'s CSV, so the table, the
// report card, and the download can never drift against each other (brief
// §6c). Documented in docs/wire-contract.md §9.6 once P5's doc pass lands.
//
// `SentinelRenderInstruction` widens the v1 `RenderInstruction` union with
// `RuleDiff`, `RuleCitation`, and `DecisionCard`; every `render` step on the
// Sentinel stream (types.ts) carries this wider type instead of the plain
// v1 one, so `render` steps can target either registry without a second
// step type.
//
// Branch `demo-aug4` (DEMO_BUILD_PLAN.md "UI components") adds the two chat
// evidence components the ops-chat demo renders: `ViolationsDashboard` — the
// batch-evaluation result (stat tiles, per-rule bar breakdown, and the
// click-to-expand account table) — and `ReportCard`, the audit-report download
// affordance that follows the batch-removal approval. They land HERE, in the
// additive Sentinel namespace, for the same reason everything else in this file
// did: v1's registry (lib/registry/schemas.ts) stays untouched. Note that these
// two are the first members of this registry whose payload is produced by a
// live server evaluator rather than a scripted scenario step — the schemas are
// identical in kind either way, since both sources are required to hand the
// renderer preformatted display strings and nothing else.

import { z } from 'zod';
import { renderInstructionSchema, type RenderInstruction } from '@/lib/registry/schemas';

export const ruleDiffPropsSchema = z.object({
  /** e.g. "AU-Eligibility-Policy-2026 → extracted rules". */
  title: z.string(),
  /** 'proposed' before the ApprovalCard resolves, 'active' once the
   * presenter approves activation (brief §3 Act II beat 4) — set by the
   * scenario step, never inferred client-side. */
  status: z.enum(['proposed', 'active']),
  /**
   * v3 addition (brief §6d, Act III beat 1, W3.4) — the rule store's own
   * label, e.g. "Rule store · continuous · nightly 02:00 UTC · last run 4h
   * ago". Optional: Act II's rows render without it (there's no store to
   * label until the rules are active); Act III re-renders this SAME card
   * under the SAME render id with `storeMeta` set, so the card the audience
   * already watched go proposed → active visibly becomes a live rule store,
   * not a new card. "Continuous"/"nightly 02:00 UTC" is a LABEL, not a
   * mechanism (brief §6d: "do not build a scheduler") — nothing in this
   * build schedules anything; the string is preformatted chrome, same as
   * every other display value in this file.
   */
  storeMeta: z.string().optional(),
  rules: z
    .array(
      z.object({
        /** e.g. "R1". */
        ruleId: z.string(),
        title: z.string(),
        /** The cited policy-document excerpt (left side of the Rule Diff
         * view) — a verbatim quote, not a paraphrase. */
        excerpt: z.object({
          /** e.g. "Product Eligibility". */
          sectionHeading: z.string(),
          /** Verbatim policy-document sentence(s). */
          quote: z.string(),
        }),
        /** Model-authored plain-English restatement (editorial, brief §5a). */
        plainEnglish: z.string(),
        /** The machine-readable footer (right side): rule id, datasets
         * touched, evaluation trigger — small monospace type in the card.
         * Optional: a `data-gap` row (`evaluability` below) was never
         * drafted into a machine-readable rule, so it has no footer to show
         * — the card's absent-footer branch (rule-diff.tsx) is how the
         * audience SEES that nothing machine-readable exists yet, not just
         * reads it in a caption. */
        machine: z
          .object({
            ruleId: z.string(),
            datasetsTouched: z.array(z.string()),
            evaluationTrigger: z.string(),
          })
          .optional(),
        /** Critic's evaluability note, e.g. "Evaluable with current SOE
         * data: accounts carry the secured-card flag, roles carry the
         * relationship." Optional — not every rule carries one. For a
         * `data-gap` row this is the Critic's reason the obligation is
         * parked (`PolicyObligationGap.criticNote`, lib/sentinel/policy.ts),
         * not an aside on an active rule — the component renders it
         * prominently either way (rule-diff.tsx). */
        criticNote: z.string().optional(),
        /** Critic-pass flag — set by the scenario step that models the
         * critic validating the rule, never derived/inferred client-side.
         * A `data-gap` row is never validated (`false`) — it was never
         * evaluable in the first place, so there's nothing to validate. */
        validated: z.boolean().default(false),
        /** `'evaluable'` (the default, R1–R3's kind) is a normal
         * drafted-and-validated-or-validating rule; `'data-gap'` marks the
         * fourth row — an obligation the Policy Analyst extracted but the
         * Critic could not evaluate against current SOE data
         * (`policyObligationGap`, lib/sentinel/policy.ts — v3's is
         * consent-on-file). Set by the scenario step, never inferred
         * client-side from the presence/absence of `machine` or
         * `validated`'s value — the renderer trusts this field alone to
         * pick its data-gap presentation (rule-diff.tsx). */
        evaluability: z.enum(['evaluable', 'data-gap']).default('evaluable'),
      }),
    )
    .min(1)
    .max(4),
});
export type RuleDiffProps = z.infer<typeof ruleDiffPropsSchema>;

/** `RuleCitation` (Act III, brief §3 beats 4–5) — the rule-text +
 * checked-conditions card the investigation renders once a rule is cited
 * against a specific flagged relationship. One component covers both of Act
 * III's verdicts: the R1 exemplar's violation and the Patel household's
 * clean pass. `verdict` is set by the scenario step and is NEVER derived
 * from `checks` here: per v1 invariant 5a/5b the renderer holds no judgment
 * logic, and a card with every check `met: true` can be either a violation
 * (R1 — all violation conditions confirmed) or a pass (the compliance
 * condition confirmed) depending only on which rule it is. */
export const ruleCitationPropsSchema = z.object({
  /** e.g. "R1". */
  ruleId: z.string(),
  /** e.g. "Product Eligibility". */
  title: z.string(),
  /** The rule's plain-English text, quoted verbatim from the active rule
   * set (not re-derived or summarized here). */
  ruleText: z.string(),
  /** Scripted by the scenario step — see the field-group comment above. */
  verdict: z.enum(['violation', 'pass']),
  checks: z
    .array(
      z.object({
        /** The condition being evaluated, e.g. "Account product is a
         * secured card". */
        label: z.string(),
        /** Preformatted evidence line, e.g. "Security deposit $500.00 ·
         * line collateralized". */
        detail: z.string().optional(),
        /** Condition-evaluation flag — scripted by the scenario step,
         * never computed by this renderer. */
        met: z.boolean(),
      }),
    )
    .min(1)
    .max(4),
});
export type RuleCitationProps = z.infer<typeof ruleCitationPropsSchema>;

/** `DecisionCard` (Act III, brief §3 beat 6) — the stacked-options card
 * that makes the agent's post-verdict JUDGMENT visible, not just its rule
 * evaluation. The rule verdicts (`RuleCitation` above) are deterministic
 * and stay that way; this card is the different thing that happens next —
 * laying out the compliant response routes, then resolving them one at a
 * time as the investigation completes.
 *
 * `options[].status` is scripted by the scenario step at each `render`,
 * NEVER derived client-side from `options[].rationale` or from the other
 * options' statuses — exactly the invariant `RuleCitation.verdict` carries
 * above (v1 invariant 5a/5b: the renderer holds no judgment logic of its
 * own, it only paints the judgment the scenario already made). The demo
 * scenario re-renders this card multiple times under the SAME `render` id
 * (wire-contract §9.1's same-id replace-in-place semantics) as the
 * investigation narrows the routes down — all `'considering'`, then one
 * rejected, then the final resolution — and `options` must keep the same
 * order across every re-render so the card reads as the routes
 * progressively resolving, not as a reshuffled list. */
export const decisionCardPropsSchema = z.object({
  /** e.g. "Response to 87 policy exceptions". */
  title: z.string(),
  /** Optional framing line under the title, e.g. "The findings are
   * deterministic. The response is a judgment call." */
  subtitle: z.string().optional(),
  options: z
    .array(
      z.object({
        /** Stable route id, e.g. 'remove-all' | 'stage-for-review' |
         * 'remove-and-notify' — also the React key, so it must stay
         * identical across same-id re-renders. */
        id: z.string(),
        label: z.string(),
        /** One-line description of the route, e.g. "Remove the 87
         * relationships and notify each primary cardholder." */
        summary: z.string(),
        /** Scripted by the scenario step — see the field-group comment
         * above. `'considering'` is the resting/open state before a
         * decision lands on this route; `'selected'`/`'rejected'` are
         * terminal for this card's lifetime. */
        status: z.enum(['considering', 'selected', 'rejected']),
        /** Why this route was selected or rejected — required reading once
         * a route leaves `'considering'`, so the rejections are "on the
         * record" rather than a silent status flip. Optional because a
         * still-`'considering'` route has no rationale yet. */
        rationale: z.string().optional(),
      }),
    )
    .min(2)
    .max(4),
  /** Small print at the card's foot, e.g. "Whichever route is selected
   * requires human approval before anything executes." */
  footnote: z.string().optional(),
});
export type DecisionCardProps = z.infer<typeof decisionCardPropsSchema>;

/** One flagged authorized-user relationship — the shared row shape between
 * `PolicyExceptionTable` (the full aggregate, brief §3 Act III beat 3) and
 * `RemediationReport` (the same rows, sliced to the first N, as a receipt
 * after execution, beat 8). Every field is preformatted server-side by
 * `lib/sentinel/exception-fixture.ts`'s `AuExceptionRow` — the same fixture
 * `GET /api/sentinel/report`'s CSV reads from — so the table, the report
 * card, and the download artifact are three views of one derivation, never
 * three places a number could drift (brief §6c). This renderer performs no
 * lookups and no arithmetic on any of these fields (brief §5a/§5b). */
const auExceptionRowSchema = z.object({
  /** e.g. "Nguyen household · ••4821" — the account's PRIMARY party's
   * household name plus a masked account identifier. Never the AU's own
   * name: the row's subject is the flagged relationship, and the account
   * label answers "whose account," not "who was added." */
  accountLabel: z.string(),
  /** The flagged authorized user's name. */
  authorizedUser: z.string(),
  /** e.g. "R1" — lets a reader correlate a row against the by-rule
   * `BarBreakdown` split rendered alongside this table. */
  ruleId: z.enum(['R1', 'R2', 'R3']),
  /** e.g. "R1 · Product Eligibility" — rule id plus a short name, so the
   * rule mix scans without a legend (brief §5c/W3.1). */
  ruleShortName: z.string(),
  /** The specific finding, preformatted, e.g. "Secured card · deposit
   * $500.00 · AU added Mar 14, 2024" (brief §5c's own example). */
  finding: z.string(),
  /** Preformatted display date, e.g. "Mar 14, 2024" — when the
   * authorized-user relationship was added, not when the exception was
   * found. */
  addedDate: z.string(),
});

/** `PolicyExceptionTable` (Act III, brief §3 beat 3 / §5c / W3.1) — the
 * aggregate flagged-relationship table the sweep renders: 12 of 87 rows on a
 * projector, each citing the rule it breaks. Pure renderer, zero derivation:
 * every string arrives preformatted (`auExceptionRowSchema` above); this
 * component performs no `toLocaleString`, no date math, no currency
 * formatting — that all happened once, server-side, in
 * `lib/sentinel/exception-fixture.ts`.
 *
 * `footnote` follows the SAME showing/total convention `TransactionTable`
 * already established (`lib/registry/schemas.ts`,
 * `lib/agents/ask/resolvers.ts`'s `Showing ${rows.length} of ${total}…`) —
 * one preformatted sentence carrying both counts, not a second structured
 * `showing`/`total` pair invented for this table alone. */
export const policyExceptionTablePropsSchema = z.object({
  title: z.string(),
  rows: z.array(auExceptionRowSchema).min(1).max(25),
  /** e.g. "Showing 12 of 87 exceptions." */
  footnote: z.string().optional(),
});
export type PolicyExceptionTableProps = z.infer<typeof policyExceptionTablePropsSchema>;

/** `RemediationReport` (Act III, brief §3 beat 8 / §5c / W3.2) — the
 * post-approval outcome card: what actually executed, in the same
 * preformatted vocabulary the exception table used. `counters` mirrors
 * `InterestProjectionChart.callouts`'s `{ label, value }` shape
 * (`lib/registry/schemas.ts`) rather than inventing a third stat-callout
 * convention. `rows` reuses `auExceptionRowSchema` verbatim — the scenario
 * step slices the same fixture's rows to the first N, it does not
 * re-describe them.
 *
 * `downloadUrl` is optional BY DESIGN, not an oversight: brief §6c requires
 * the demo to survive "the network cable pulled," so an absent URL must
 * degrade the Download CSV control to disabled with a quiet reason
 * (components/sentinel/evidence/remediation-report.tsx), never to a dead
 * link or a thrown error. */
export const remediationReportPropsSchema = z.object({
  title: z.string(),
  /** Outcome counters — brief's own list: removed, accounts touched,
   * notifications queued. Not constrained to exactly three so a future
   * counter (e.g. a decline count on the reject path) doesn't need a schema
   * change to add. */
  counters: z
    .array(z.object({ label: z.string(), value: z.string() }))
    .min(1)
    .max(6),
  /** Deterministically derived from the fixture, never random — see
   * app/api/sentinel/remediate/route.ts's derivation and brief §9's
   * "byte-identical across replays" requirement. */
  confirmationId: z.string(),
  rows: z.array(auExceptionRowSchema).min(1).max(25),
  /** Same showing/total convention as `PolicyExceptionTable.footnote`. */
  footnote: z.string().optional(),
  /** `GET /api/sentinel/report?reportId=…`. Absent → the control renders
   * disabled (see the component's doc comment above). */
  downloadUrl: z.string().optional(),
});
export type RemediationReportProps = z.infer<typeof remediationReportPropsSchema>;

/** The two policies the ops chat evaluates in batch (DEMO_BUILD_PLAN.md's
 * `PolicyId`). Declared here rather than imported from `lib/rules/**` on
 * purpose: this registry is imported by `"use client"` renderers, and the rule
 * store is a server module. Wave 2 unifies the two declarations; until then
 * this is the union the renderer validates against, and it is deliberately a
 * closed enum so `POLICY_LABEL` in violations-dashboard.tsx is exhaustive by
 * construction rather than by a runtime fallback. */
export const violationsPolicyIdSchema = z.enum(['authorized-user', 'card-activation']);
export type ViolationsPolicyId = z.infer<typeof violationsPolicyIdSchema>;

/** `ViolationsDashboard` (DEMO_THESIS.md use case 1 beats 4–5 / use case 3 ops
 * side; DEMO_BUILD_PLAN.md "UI components" + its `ViolationsPayload` contract)
 * — the batch-evaluation result rendered as chat evidence, and the demo's
 * centerpiece. One shape serves BOTH policies: the AU sweep and the
 * card-activation sweep differ only in which rule ids come back, which is why
 * `byRule[].ruleId` and `rows[].ruleId` are free strings here rather than the
 * `'R1' | 'R2' | 'R3'` enum `auExceptionRowSchema` above pins — card-activation
 * rules are `CA-R1`/`CA-R2`, and a second near-identical schema for two extra
 * ids would be a schema fork for no validation gained.
 *
 * `summary`'s three figures are NUMBERS, not preformatted strings — the only
 * place in this registry where a raw number reaches a renderer. That is the
 * plan's contract, not an oversight, and it is safe because the renderer prints
 * them verbatim: no `toLocaleString`, no separators, no arithmetic (invariant
 * 5b). `byRule[].count` is likewise raw, and the dashboard's bar widths are
 * computed from those counts purely as layout geometry — the same latitude
 * `bar-breakdown.tsx` already takes ("the only computation here is bar-width
 * geometry... never business arithmetic").
 *
 * `rows[].detail` carries EVERYTHING the drill-down needs, preformatted
 * server-side. The click-into interaction is therefore pure client state: no
 * second fetch, no model involvement, nothing to go wrong on stage with the
 * network cable pulled (invariant 5a). A row without detail pairs would render
 * an empty drawer, so the array has a `.min(1)` floor. */
export const violationsDashboardPropsSchema = z.object({
  policyId: violationsPolicyIdSchema,
  summary: z.object({
    /** Population the evaluator swept — AU relationships for
     * `authorized-user`, issued cards for `card-activation`. The label the
     * renderer shows is deliberately just "Scanned": the unit differs per
     * policy, and the payload does not name it. */
    scanned: z.number().int().nonnegative(),
    accountsAffected: z.number().int().nonnegative(),
    exceptions: z.number().int().nonnegative(),
  }),
  /** One entry per rule that produced at least one exception, in the order the
   * evaluator reports them — the renderer maps by array order and never sorts,
   * so the bars read in rule order (R1, R2, R3), not by magnitude. */
  byRule: z
    .array(
      z.object({
        /** e.g. "R1" or "CA-R2". */
        ruleId: z.string(),
        /** The rule's own title, e.g. "Product eligibility — no authorized
         * users on secured cards". */
        title: z.string(),
        count: z.number().int().nonnegative(),
      }),
    )
    .min(1)
    .max(8),
  rows: z
    .array(
      z.object({
        /** e.g. "au-acct-0043" — rendered in monospace as the row's identity. */
        accountId: z.string(),
        /** The primary cardholder's name. */
        holder: z.string(),
        ruleId: z.string(),
        ruleTitle: z.string(),
        /** A COMPLETE sentence from the evaluator — never model-authored
         * (invariant 5a). Truncated in the collapsed row, shown in full in the
         * drill-down panel. */
        finding: z.string(),
        /** Drill-down facts, every value a preformatted display string
         * ("$1,250.00", "Mar 4, 2026") — see the field-group comment above. */
        detail: z
          .array(z.object({ label: z.string(), value: z.string() }))
          .min(1)
          .max(8),
      }),
    )
    .min(1)
    .max(50),
});
export type ViolationsDashboardProps = z.infer<typeof violationsDashboardPropsSchema>;

/** `ReportCard` (DEMO_THESIS.md use case 1 beat 8) — the audit-report download
 * affordance the agent renders after the batch removal executes. Deliberately
 * thinner than `RemediationReport` above: that card is the OUTCOME receipt
 * (counters, confirmation id, result rows), this one is the ARTIFACT the
 * outcome produced. Keeping them separate means the report card can be
 * re-rendered on its own — "here's the file again" — without restating a
 * receipt the audience already read.
 *
 * The component is a plain `<a href download>`, never a client fetch: `href` is
 * inert markup until the user clicks it, so a missing route degrades to a
 * failed navigation rather than a thrown render. Unlike
 * `RemediationReport.downloadUrl` this field is REQUIRED — a report card with
 * nothing to download has no reason to exist, whereas the remediation receipt
 * still carries its counters when the download is unavailable. */
export const reportCardPropsSchema = z.object({
  /** e.g. "authorized-user-policy-audit-2026-08-04.html" — also the `download`
   * attribute's suggested filename. */
  filename: z.string(),
  /** Preformatted timestamp, e.g. "Aug 4, 2026 at 9:42 AM ET". Never an ISO
   * string: this renderer does no date formatting (invariant 5b). */
  generatedAt: z.string(),
  /** One sentence describing what the file contains. */
  summary: z.string(),
  /** e.g. "/api/report?policy=authorized-user". */
  href: z.string(),
});
export type ReportCardProps = z.infer<typeof reportCardPropsSchema>;

/** `RenderInstruction` (v1, `lib/registry/schemas.ts`) widened with the
 * Sentinel-only components. Every `render` step on the Sentinel stream
 * carries this type instead of the plain v1 one (types.ts). */
export const sentinelRenderInstructionSchema = z.union([
  renderInstructionSchema,
  z.object({ component: z.literal('RuleDiff'), props: ruleDiffPropsSchema }),
  z.object({ component: z.literal('RuleCitation'), props: ruleCitationPropsSchema }),
  z.object({ component: z.literal('DecisionCard'), props: decisionCardPropsSchema }),
  z.object({
    component: z.literal('PolicyExceptionTable'),
    props: policyExceptionTablePropsSchema,
  }),
  z.object({
    component: z.literal('RemediationReport'),
    props: remediationReportPropsSchema,
  }),
  z.object({
    component: z.literal('ViolationsDashboard'),
    props: violationsDashboardPropsSchema,
  }),
  z.object({
    component: z.literal('ReportCard'),
    props: reportCardPropsSchema,
  }),
]);
export type SentinelRenderInstruction =
  | RenderInstruction
  | { component: 'RuleDiff'; props: RuleDiffProps }
  | { component: 'RuleCitation'; props: RuleCitationProps }
  | { component: 'DecisionCard'; props: DecisionCardProps }
  | { component: 'PolicyExceptionTable'; props: PolicyExceptionTableProps }
  | { component: 'RemediationReport'; props: RemediationReportProps }
  | { component: 'ViolationsDashboard'; props: ViolationsDashboardProps }
  | { component: 'ReportCard'; props: ReportCardProps };
