// Input side of the `renderEvidence` routing tool (brief §5c): a discriminated
// union over the registry. The model picks a member — i.e. chooses WHICH
// component renders and from WHAT source — but never supplies display data.
// Server-side resolvers (lib/agents/*) map each spec to validated props via
// the SOE adapter. Editorial fields (e.g. RiskBadge rationale) are the only
// model-authored text that reaches a renderer, per §5a.
//
// The outer union discriminates on `component`; where one component serves
// several stories (MetricRow, TrendChart), an inner union discriminates on
// `source.kind`. Every agent shares this schema as its tool input; each
// agent's resolver dispatch handles only the kinds it owns and throws on the
// rest (the instructions pin which kinds each agent calls).
//
// OutreachDraftCard and ApprovalCard are absent by design: they render from
// action-tool inputs and approval states, not from evidence specs. See
// docs/wire-contract.md §3–4.

import { z } from 'zod';

const accountId = z.string().describe('SOE account id, e.g. "acct-marcus"');

const partyId = z.string().describe('SOE party id, e.g. "party-dev"');

const months = z
  .number()
  .int()
  .min(2)
  .max(12)
  .default(6)
  .describe('How many trailing months of data to include');

const statementMonths = z
  .number()
  .int()
  .min(2)
  .max(12)
  .default(12)
  .describe('How many trailing statement months to include');

const projectionMonths = z
  .number()
  .int()
  .min(2)
  .max(24)
  .default(12)
  .describe('How many months to project forward');

const spendMonths = z
  .number()
  .int()
  .min(1)
  .max(12)
  .default(3)
  .describe('How many trailing months of portfolio spend to include');

const windowDays = z
  .number()
  .int()
  .min(30)
  .max(365)
  .default(90)
  .describe('How many days ahead to look for BT promo expirations');

const rowLimit = z
  .number()
  .int()
  .min(1)
  .max(25)
  .default(15)
  .describe('Maximum transaction rows to return');

export const evidenceSpecSchema = z.discriminatedUnion('component', [
  z.object({
    component: z.literal('MetricRow'),
    source: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('account-overview'), accountId }),
      z.object({ kind: z.literal('bt-overview'), accountId }),
      z.object({ kind: z.literal('au-recurring-spend'), accountId, partyId }),
      z.object({ kind: z.literal('portfolio-overview') }),
      // v3 servicing chatbot additions (CARDINAL_V3_AU_BRIEF.md §7a/§7b) —
      // deliberately carry NO accountId/partyId field. The servicing agent's
      // account is pinned server-side at construction
      // (lib/agents/servicing/identity.ts); these two kinds have nothing for
      // a model-supplied id to even occupy, which is what "resolvers ignore
      // any model-supplied account id" means enforced by construction rather
      // than by validation.
      z.object({ kind: z.literal('servicing-next-payment') }),
      z.object({ kind: z.literal('servicing-account-summary') }),
    ]),
  }),
  z.object({
    component: z.literal('TrendChart'),
    source: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('utilization-trend'), accountId, months }),
      z.object({
        kind: z.literal('au-spend-trend'),
        accountId,
        partyId,
        months: statementMonths,
      }),
    ]),
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
  z.object({
    component: z.literal('BTTimeline'),
    source: z.object({
      kind: z.literal('bt-lifecycle'),
      accountId,
    }),
  }),
  z.object({
    component: z.literal('InterestProjectionChart'),
    source: z.object({
      kind: z.literal('interest-projection'),
      accountId,
      months: projectionMonths,
    }),
  }),
  z.object({
    component: z.literal('PartyGraph'),
    source: z.object({
      kind: z.literal('household-overview'),
      accountId,
    }),
  }),
  z.object({
    component: z.literal('BarBreakdown'),
    source: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('portfolio-category-spend'), months: spendMonths }),
      z.object({ kind: z.literal('bt-expiring-accounts'), windowDays }),
    ]),
  }),
  z.object({
    component: z.literal('CategoryPie'),
    source: z.discriminatedUnion('kind', [
      z.object({ kind: z.literal('portfolio-category-spend'), months: spendMonths }),
      // v3 servicing chatbot addition (CARDINAL_V3_AU_BRIEF.md §7b) — no
      // accountId, same reasoning as the MetricRow kinds above.
      z.object({ kind: z.literal('servicing-category-spend'), months: spendMonths }),
    ]),
  }),
  z.object({
    component: z.literal('TransactionTable'),
    source: z.discriminatedUnion('kind', [
      z.object({
        kind: z.literal('recent-transactions'),
        accountId: accountId.optional().describe('Omit for a portfolio-wide table'),
        months: spendMonths,
        limit: rowLimit,
      }),
      // v3 servicing chatbot addition (CARDINAL_V3_AU_BRIEF.md §7b) — no
      // accountId, same reasoning as the MetricRow kinds above.
      z.object({
        kind: z.literal('servicing-recent-transactions'),
        months: spendMonths,
        limit: rowLimit,
      }),
    ]),
  }),
]);
export type EvidenceSpec = z.infer<typeof evidenceSpecSchema>;
