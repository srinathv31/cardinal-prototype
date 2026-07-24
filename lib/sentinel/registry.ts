// Sentinel-stage component schemas (v2, additive) — the Sentinel-only
// extension of the v1 component registry (`lib/registry/schemas.ts`,
// brief §5c). v1's registry is deliberately untouched: `docs/v2-reuse-map.md`
// §4 is the complete list of additive touches to existing files, and this
// file is not on it — every Sentinel-specific component lives here instead,
// mirroring the parent registry's zod idiom (preformatted display strings,
// comments on derived-vs-editorial fields) rather than reopening it.
//
// `RuleDiff` (Act II, brief §3 beat 3) is the first of these: the split
// excerpt/plain-English/machine-footer card the Rule Diff view renders while
// the policy document is parsed into enforceable rules. P4 (W4.2) adds the
// Act III evidence cards alongside it: `BTEventDetail` (the "$3,200 initiated
// 02:47" hero card) and `RuleCitation` (the R1/R2 checked-condition card) —
// documented in docs/wire-contract.md §9.6.
//
// Addendum v2.1 (post-P4, CARDINAL_V2_SENTINEL_BRIEF.md's closing addendum)
// widens `RuleDiff` to carry a fourth, `data-gap` row (Act II's income-
// verification obligation, `lib/sentinel/policy.ts`'s `policyObligationGap`)
// and adds `DecisionCard` (Act III's response-routes card) — both purely
// additive: every existing `RuleDiffProps` value still validates unchanged,
// and `DecisionCard` is a new union member, not a change to an existing one.
//
// `SentinelRenderInstruction` widens the v1 `RenderInstruction` union with
// `RuleDiff`, `BTEventDetail`, `RuleCitation`, and `DecisionCard`; every
// `render` step on the Sentinel stream (types.ts) carries this wider type
// instead of the plain v1 one, so `render` steps can target either registry
// without a second step type.

import { z } from 'zod';
import { renderInstructionSchema, type RenderInstruction } from '@/lib/registry/schemas';

export const ruleDiffPropsSchema = z.object({
  /** e.g. "BT-Servicing-Policy-2026 → extracted rules". */
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
          /** e.g. "New Transfer Eligibility". */
          sectionHeading: z.string(),
          /** Verbatim policy-document sentence(s). */
          quote: z.string(),
        }),
        /** Model-authored plain-English restatement (editorial, brief §5a). */
        plainEnglish: z.string(),
        /** The machine-readable footer (right side): rule id, datasets
         * touched, evaluation trigger — small monospace type in the card.
         * Optional as of Addendum v2.1: a `data-gap` row (`evaluability`
         * below) was never drafted into a machine-readable rule, so it has
         * no footer to show — the card's absent-footer branch (rule-diff.tsx)
         * is how the audience SEES that nothing machine-readable exists yet,
         * not just reads it in a caption. */
        machine: z
          .object({
            ruleId: z.string(),
            datasetsTouched: z.array(z.string()),
            evaluationTrigger: z.string(),
          })
          .optional(),
        /** Critic's evaluability note, e.g. "Evaluable with current SOE
         * data: payments + balance-transfer events." Optional — not every
         * rule carries one. For a `data-gap` row this is the Critic's
         * reason the obligation is parked (`PolicyObligationGap.criticNote`,
         * lib/sentinel/policy.ts), not an aside on an active rule — the
         * component renders it prominently either way (rule-diff.tsx). */
        criticNote: z.string().optional(),
        /** Critic-pass flag — set by the scenario step that models the
         * critic validating the rule, never derived/inferred client-side.
         * A `data-gap` row is never validated (`false`) — it was never
         * evaluable in the first place, so there's nothing to validate. */
        validated: z.boolean().default(false),
        /** Addendum v2.1: `'evaluable'` (the default, R1–R3's kind) is a
         * normal drafted-and-validated-or-validating rule; `'data-gap'`
         * marks the fourth row — an obligation the Policy Analyst extracted
         * but the Critic could not evaluate against current SOE data
         * (`policyObligationGap`, lib/sentinel/policy.ts). Set by the
         * scenario step, never inferred client-side from the presence/
         * absence of `machine` or `validated` — the renderer trusts this
         * field alone to pick its data-gap presentation (rule-diff.tsx). */
        evaluability: z.enum(['evaluable', 'data-gap']).default('evaluable'),
      }),
    )
    .min(1)
    .max(4),
});
export type RuleDiffProps = z.infer<typeof ruleDiffPropsSchema>;

/** `BTEventDetail` (Act III, brief §3 beat 2) — the hero evidence card for
 * the balance-transfer event under investigation ("$3,200 initiated
 * 02:47"). Every field arrives preformatted from the scenario step; the
 * renderer performs no lookups or arithmetic (brief §5a/§5b). */
export const btEventDetailPropsSchema = z.object({
  /** e.g. "Balance transfer initiated". */
  title: z.string(),
  /** Preformatted party + account line, e.g. "Marcus Webb · acct-marcus". */
  account: z.string(),
  /** Preformatted display amount, e.g. "$3,200.00" — the hero figure. */
  amount: z.string(),
  /** Preformatted, e.g. "02:47 UTC · Aug 5, 2026". */
  timestamp: z.string(),
  /** Visual accent — set by the scenario step, never inferred from the
   * event's data client-side. 'critical' marks the event under
   * investigation (Act III); 'neutral' is the default resting state. */
  tone: z.enum(['neutral', 'critical']).default('neutral'),
  /** Supplementary key/value facts (e.g. transfer channel, promo APR,
   * destination account) rendered as a compact label/value grid.
   * Preformatted strings, server-scripted — never computed here. */
  attributes: z
    .array(z.object({ label: z.string(), value: z.string() }))
    .max(6)
    .default([]),
});
export type BTEventDetailProps = z.infer<typeof btEventDetailPropsSchema>;

/** `RuleCitation` (Act III, brief §3 beat 2/§5's R1/R2) — the rule-text +
 * checked-conditions card the investigation renders once the Policy Analyst
 * cites a rule against the event under review. `verdict` is set by the
 * scenario step and is NEVER derived from `checks` here: per v1 invariant
 * 5a/5b the renderer holds no judgment logic, and a card with every check
 * `met: true` can be either a violation (R1 — all violation conditions
 * confirmed) or a pass (R2 — the compliance condition confirmed) depending
 * only on which rule it is. */
export const ruleCitationPropsSchema = z.object({
  /** e.g. "R1". */
  ruleId: z.string(),
  /** e.g. "New Transfer Eligibility Window". */
  title: z.string(),
  /** The rule's plain-English text, quoted verbatim from the active rule
   * set (not re-derived or summarized here). */
  ruleText: z.string(),
  /** Scripted by the scenario step — see the field-group comment above. */
  verdict: z.enum(['violation', 'pass']),
  checks: z
    .array(
      z.object({
        /** The condition being evaluated, e.g. "Missed payment within the
         * 60-day look-back". */
        label: z.string(),
        /** Preformatted evidence line, e.g. "Minimum $142.00 due Jul 24,
         * 2026 — 12 days before initiation". */
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

/** `DecisionCard` (Act III, Addendum v2.1 — CARDINAL_V2_SENTINEL_BRIEF.md's
 * closing addendum: "the response is a judgment call") — the stacked-
 * options card that makes the agent's post-verdict JUDGMENT visible, not
 * just its rule evaluation. R1's verdict (`RuleCitation` above) is
 * deterministic and stays that way; this card is the different thing that
 * happens next — laying out the compliant response routes, then resolving
 * them one at a time as the investigation gathers more evidence (the
 * account snapshot + cure check).
 *
 * `options[].status` is scripted by the scenario step at each `render`,
 * NEVER derived client-side from `options[].rationale` or from the other
 * options' statuses — exactly the invariant `RuleCitation.verdict` carries
 * above (v1 invariant 5a/5b: the renderer holds no judgment logic of its
 * own, it only paints the judgment the scenario already made). The demo
 * scenario re-renders this card three times under the SAME `render` id
 * (wire-contract §9.1's same-id replace-in-place semantics) — all
 * `'considering'`, then one route rejected, then the final resolution — and
 * `options` must keep the same order across every re-render so the card
 * reads as three routes progressively resolving, not as a reshuffled list
 * (demo-scenario.ts's Act III decision phase). */
export const decisionCardPropsSchema = z.object({
  /** e.g. "Response to R1 violation". */
  title: z.string(),
  /** Optional framing line under the title, e.g. "The verdict is
   * deterministic. The response is a judgment call." */
  subtitle: z.string().optional(),
  options: z
    .array(
      z.object({
        /** Stable route id, e.g. 'hold' | 'monitor' | 'escalate' — also the
         * React key, so it must stay identical across same-id re-renders. */
        id: z.string(),
        label: z.string(),
        /** One-line description of the route, e.g. "Pause posting while
         * eligibility is reviewed; reversible." */
        summary: z.string(),
        /** Scripted by the scenario step — see the field-group comment
         * above. `'considering'` is the resting/open state before a
         * decision lands on this route; `'selected'`/`'rejected'` are
         * terminal for this card's lifetime. */
        status: z.enum(['considering', 'selected', 'rejected']),
        /** Why this route was selected or rejected — required reading once
         * a route leaves `'considering'`, so the rejections are "on the
         * record" (brief addendum) rather than a silent status flip.
         * Optional because a still-`'considering'` route has no rationale
         * yet. */
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
  z.object({ component: z.literal('BTEventDetail'), props: btEventDetailPropsSchema }),
  z.object({ component: z.literal('RuleCitation'), props: ruleCitationPropsSchema }),
  z.object({ component: z.literal('DecisionCard'), props: decisionCardPropsSchema }),
]);
export type SentinelRenderInstruction =
  | RenderInstruction
  | { component: 'RuleDiff'; props: RuleDiffProps }
  | { component: 'BTEventDetail'; props: BTEventDetailProps }
  | { component: 'RuleCitation'; props: RuleCitationProps }
  | { component: 'DecisionCard'; props: DecisionCardProps };
