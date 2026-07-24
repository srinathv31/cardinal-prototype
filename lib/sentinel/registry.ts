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
// (lib/sentinel/policy.ts). P3 (brief §5c) adds two new components this
// file does not yet define: `PolicyExceptionTable` (the aggregate flagged-
// relationship table Act III renders) and `RemediationReport` (the
// post-approval outcome card) — both documented in
// docs/wire-contract.md §9.6 once they land.
//
// `SentinelRenderInstruction` widens the v1 `RenderInstruction` union with
// `RuleDiff`, `RuleCitation`, and `DecisionCard`; every `render` step on the
// Sentinel stream (types.ts) carries this wider type instead of the plain
// v1 one, so `render` steps can target either registry without a second
// step type.

import { z } from 'zod';
import { renderInstructionSchema, type RenderInstruction } from '@/lib/registry/schemas';

export const ruleDiffPropsSchema = z.object({
  /** e.g. "AU-Eligibility-Policy-2026 → extracted rules". */
  title: z.string(),
  /** 'proposed' before the ApprovalCard resolves, 'active' once the
   * presenter approves activation (brief §3 Act II beat 4) — set by the
   * scenario step, never inferred client-side. */
  status: z.enum(['proposed', 'active']),
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

/** `RenderInstruction` (v1, `lib/registry/schemas.ts`) widened with the
 * Sentinel-only components. Every `render` step on the Sentinel stream
 * carries this type instead of the plain v1 one (types.ts). */
export const sentinelRenderInstructionSchema = z.union([
  renderInstructionSchema,
  z.object({ component: z.literal('RuleDiff'), props: ruleDiffPropsSchema }),
  z.object({ component: z.literal('RuleCitation'), props: ruleCitationPropsSchema }),
  z.object({ component: z.literal('DecisionCard'), props: decisionCardPropsSchema }),
]);
export type SentinelRenderInstruction =
  | RenderInstruction
  | { component: 'RuleDiff'; props: RuleDiffProps }
  | { component: 'RuleCitation'; props: RuleCitationProps }
  | { component: 'DecisionCard'; props: DecisionCardProps };
