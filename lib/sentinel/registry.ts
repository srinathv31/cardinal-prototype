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
// the policy document is parsed into enforceable rules. P4 will add its own
// evidence cards here (BT event detail, rule citation) alongside it —
// documented as they land in docs/wire-contract.md §9.6.
//
// `SentinelRenderInstruction` widens the v1 `RenderInstruction` union with
// `RuleDiff` only; every `render` step on the Sentinel stream (types.ts)
// carries this wider type instead of the plain v1 one, so `render` steps
// can target either registry without a second step type.

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
         * touched, evaluation trigger — small monospace type in the card. */
        machine: z.object({
          ruleId: z.string(),
          datasetsTouched: z.array(z.string()),
          evaluationTrigger: z.string(),
        }),
        /** Critic's evaluability note, e.g. "Evaluable with current SOE
         * data: payments + balance-transfer events." Optional — not every
         * rule carries one. */
        criticNote: z.string().optional(),
        /** Critic-pass flag — set by the scenario step that models the
         * critic validating the rule, never derived/inferred client-side. */
        validated: z.boolean().default(false),
      }),
    )
    .min(1)
    .max(3),
});
export type RuleDiffProps = z.infer<typeof ruleDiffPropsSchema>;

/** `RenderInstruction` (v1, `lib/registry/schemas.ts`) widened with the
 * Sentinel-only components. Every `render` step on the Sentinel stream
 * carries this type instead of the plain v1 one (types.ts). */
export const sentinelRenderInstructionSchema = z.union([
  renderInstructionSchema,
  z.object({ component: z.literal('RuleDiff'), props: ruleDiffPropsSchema }),
]);
export type SentinelRenderInstruction =
  | RenderInstruction
  | { component: 'RuleDiff'; props: RuleDiffProps };
