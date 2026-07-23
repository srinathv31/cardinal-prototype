// Input side of the `renderEvidence` routing tool (brief §5c): a discriminated
// union over the registry. The model picks a member — i.e. chooses WHICH
// component renders and from WHAT source — but never supplies display data.
// Server-side resolvers (lib/agents/*) map each spec to validated props via
// the SOE adapter. Editorial fields (e.g. RiskBadge rationale) are the only
// model-authored text that reaches a renderer, per §5a.
//
// OutreachDraftCard and ApprovalCard are absent by design: they render from
// action-tool inputs and approval states, not from evidence specs. See
// docs/wire-contract.md §3–4.

import { z } from 'zod';

const accountId = z.string().describe('SOE account id, e.g. "acct-marcus"');

const months = z
  .number()
  .int()
  .min(2)
  .max(12)
  .default(6)
  .describe('How many trailing months of data to include');

export const evidenceSpecSchema = z.discriminatedUnion('component', [
  z.object({
    component: z.literal('MetricRow'),
    source: z.object({
      kind: z.literal('account-overview'),
      accountId,
    }),
  }),
  z.object({
    component: z.literal('TrendChart'),
    source: z.object({
      kind: z.literal('utilization-trend'),
      accountId,
      months,
    }),
  }),
  z.object({
    component: z.literal('PaymentHistoryTable'),
    source: z.object({
      kind: z.literal('payment-history'),
      accountId,
      months,
    }),
  }),
  z.object({
    component: z.literal('RiskBadge'),
    source: z.object({
      kind: z.literal('payment-risk'),
      accountId,
    }),
    rationale: z
      .string()
      .describe(
        'Plain-English rationale for the risk level, grounded ONLY in figures returned by prior tool calls. Servicing language only — never credit-decisioning terms.',
      ),
  }),
]);
export type EvidenceSpec = z.infer<typeof evidenceSpecSchema>;
