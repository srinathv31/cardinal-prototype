// Component registry props schemas (brief §5c) — the only components the
// model may render. Every prop that reaches a renderer is validated against
// these schemas server-side before it crosses the wire, so the frontend can
// trust payloads blindly. Display values (currency, dates, percentages) are
// preformatted strings computed server-side; raw numbers appear only where a
// chart needs geometry. See docs/wire-contract.md §3.
//
// P1 shipped the Payment Health set; P2 added BTTimeline,
// InterestProjectionChart (W2.1) and PartyGraph (W2.2). P3 (W3.3) ships the
// final three — BarBreakdown, CategoryPie, TransactionTable — completing the
// brief §5c registry.

import { z } from 'zod';

export const toneSchema = z.enum(['neutral', 'positive', 'warning', 'critical']);
export type Tone = z.infer<typeof toneSchema>;

export const metricRowPropsSchema = z.object({
  metrics: z
    .array(
      z.object({
        label: z.string(),
        /** Preformatted display value, e.g. "$7,800.00", "78%". */
        value: z.string(),
        /** Optional preformatted delta/context line, e.g. "+36 pts in 5 mo". */
        delta: z.string().optional(),
        tone: toneSchema.default('neutral'),
      }),
    )
    .min(1)
    .max(6),
});
export type MetricRowProps = z.infer<typeof metricRowPropsSchema>;

export const trendChartPropsSchema = z.object({
  title: z.string(),
  /** Governs axis/tooltip formatting client-side. */
  unit: z.enum(['percent', 'currency', 'count']),
  series: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        points: z
          .array(
            z.object({
              /** Preformatted x label, e.g. "Feb", "Mar 12". */
              label: z.string(),
              value: z.number(),
            }),
          )
          .min(2),
      }),
    )
    .min(1)
    .max(3),
});
export type TrendChartProps = z.infer<typeof trendChartPropsSchema>;

export const paymentStatusSchema = z.enum(['SCHEDULED', 'POSTED', 'LATE', 'MISSED']);
export const paymentChannelSchema = z.enum(['AUTOPAY', 'ONLINE', 'PHONE', 'MAIL']);

export const paymentHistoryTablePropsSchema = z.object({
  title: z.string(),
  rows: z
    .array(
      z.object({
        /** Preformatted display date, e.g. "Mar 12, 2026". */
        dueDate: z.string(),
        amountDue: z.string(),
        minimumDue: z.string(),
        amountPaid: z.string(),
        status: paymentStatusSchema,
        channel: paymentChannelSchema,
        /** Row emphasis computed server-side, never inferred client-side. */
        flag: z.enum(['minimum-only', 'missed']).optional(),
      }),
    )
    .min(1),
});
export type PaymentHistoryTableProps = z.infer<typeof paymentHistoryTablePropsSchema>;

export const riskBadgePropsSchema = z.object({
  /** Derived server-side from payment/utilization data — never by the model. */
  level: z.enum(['low', 'elevated', 'high']),
  headline: z.string(),
  /** Plain-English rationale. Editorial content (model-authored), §5a. */
  rationale: z.string(),
});
export type RiskBadgeProps = z.infer<typeof riskBadgePropsSchema>;

export const btTimelinePropsSchema = z.object({
  title: z.string(),
  milestones: z
    .array(
      z.object({
        id: z.string(),
        label: z.string(),
        /** Preformatted display date, e.g. "Sep 11, 2025". */
        date: z.string(),
        /** Preformatted context line, e.g. "$8,400.00 at 0% promo APR". */
        detail: z.string().optional(),
        /** Visual treatment derived server-side from event dates. */
        kind: z.enum(['past', 'today', 'cliff']),
      }),
    )
    .min(2)
    .max(6),
  /** Preformatted emphasis line, e.g. "45 days until the promo rate ends". */
  countdown: z.string().optional(),
});
export type BTTimelineProps = z.infer<typeof btTimelinePropsSchema>;

export const interestProjectionChartPropsSchema = z.object({
  title: z.string(),
  /** Preformatted "if nothing changes" assumption caption. */
  assumption: z.string(),
  points: z
    .array(
      z.object({
        /** Preformatted x label, e.g. "M1" … "M12". */
        label: z.string(),
        /** Dollars — raw numbers appear only for chart geometry. */
        monthlyInterest: z.number(),
        cumulativeInterest: z.number(),
      }),
    )
    .min(2)
    .max(24),
  /** Preformatted stat callouts, e.g. { label: "First month", value: "$106.21" }. */
  callouts: z
    .array(z.object({ label: z.string(), value: z.string() }))
    .max(3)
    .default([]),
});
export type InterestProjectionChartProps = z.infer<
  typeof interestProjectionChartPropsSchema
>;

export const partyGraphPropsSchema = z.object({
  title: z.string(),
  account: z.object({
    label: z.string(),
    /** Preformatted, e.g. "Open since Aug 2018 · $25,000.00 limit". */
    detail: z.string().optional(),
  }),
  parties: z
    .array(
      z.object({
        /** SOE party id — lets the model reference this party in later calls. */
        id: z.string(),
        name: z.string(),
        role: z.enum(['PRIMARY', 'AUTHORIZED_USER']),
        /** Preformatted, e.g. "Authorized user since Jul 2022 · Age 22". */
        detail: z.string().optional(),
        /** Derived server-side (spend-growth rule, lib/agents/au-growth) —
         * never asserted by the model. */
        highlight: z.boolean().default(false),
      }),
    )
    .min(1)
    .max(6),
});
export type PartyGraphProps = z.infer<typeof partyGraphPropsSchema>;

export const outreachDraftCardPropsSchema = z.object({
  channel: z.literal('EMAIL'),
  /** Resolved from party data server-side; the model never invents contacts. */
  to: z.string(),
  subject: z.string(),
  body: z.string(),
});
export type OutreachDraftCardProps = z.infer<typeof outreachDraftCardPropsSchema>;

export const approvalCardPropsSchema = z.object({
  approvalId: z.string(),
  toolName: z.string(),
  title: z.string(),
  description: z.string(),
  /** Model-authored rationale for the proposed action (editorial). */
  rationale: z.string().optional(),
  /** Labels of evidence components already rendered in this run. */
  evidence: z.array(z.string()).default([]),
  /**
   * v3 addition (CARDINAL_V3_AU_BRIEF.md §3 Act III beat 7, W3.3) — a bulk
   * action's explicit scope/count expression, so "Remove 87 authorized
   * users from 74 accounts and notify 74 primary cardholders" states its
   * blast radius with every count structurally present, not buried inside
   * `description`'s prose. Additive and optional: every v1 caller that
   * never sets it is unaffected, and the renderer
   * (components/registry/approval-card.tsx) only shows this block behind a
   * presence check, so an untouched v1 card stays pixel-identical.
   */
  scope: z
    .object({
      /** Preformatted headline with the counts embedded in the sentence
       * itself, e.g. "Remove 87 authorized users from 74 accounts and
       * notify 74 primary cardholders." */
      summary: z.string(),
      /** Optional structured count chips backing `summary`, for a reader
       * who wants the numbers isolated from the sentence, e.g.
       * { label: "Accounts", value: "74" }. */
      counts: z
        .array(z.object({ label: z.string(), value: z.string() }))
        .min(1)
        .max(6)
        .optional(),
    })
    .optional(),
  /**
   * v3 addition (brief §3 Act III beat 7, W3.3) — a "Review the list"
   * disclosure so the presenter can see what they're approving before
   * approving it. Rows are preformatted and supplied by the scenario step
   * (or, for a real agent, by server-side tool execution); the card never
   * fetches them itself (v1 invariant 5b). Deliberately generic
   * (`primary`/`secondary`/`detail`, not AU-specific field names) so any
   * future bulk-approval flow can reuse this shape without coupling the
   * shared v1 registry to Sentinel/AU-policy semantics — Act III's own
   * exception rows (lib/sentinel/exception-fixture.ts's `AuExceptionRow`)
   * map onto it as accountLabel → primary, authorizedUser + ruleShortName
   * → secondary + detail. Same additive/optional/presence-check contract
   * as `scope` above.
   */
  reviewList: z
    .object({
      /** Disclosure trigger label, e.g. "Review the list (87)". */
      label: z.string(),
      rows: z
        .array(
          z.object({
            /** e.g. "Nguyen household · ••4821". */
            primary: z.string(),
            /** e.g. "AU: Marcus Chen". */
            secondary: z.string(),
            /** Preformatted right-aligned detail, e.g.
             * "R1 · Product Eligibility". */
            detail: z.string().optional(),
          }),
        )
        .min(1)
        .max(25),
      /** Same showing/total footnote convention as `TransactionTable`
       * (this file) — one preformatted sentence, e.g. "Showing 25 of 87." */
      footnote: z.string().optional(),
    })
    .optional(),
});
export type ApprovalCardProps = z.infer<typeof approvalCardPropsSchema>;

export const transactionCategorySchema = z.enum([
  'GROCERY', 'DINING', 'TRAVEL', 'SUBSCRIPTION', 'UTILITIES', 'RETAIL', 'FUEL', 'OTHER',
]);

export const barBreakdownPropsSchema = z.object({
  title: z.string(),
  unit: z.enum(['currency', 'count']),
  bars: z
    .array(
      z.object({
        label: z.string(),
        /** Raw magnitude, bar geometry only. */
        value: z.number(),
        /** Preformatted display value, e.g. "$4,400.00". */
        display: z.string(),
        /** Preformatted context line, e.g. "Promo ends Sep 20, 2026 · 59 days". */
        detail: z.string().optional(),
        tone: toneSchema.default('neutral'),
      }),
    )
    .min(1)
    .max(12),
  footnote: z.string().optional(),
});
export type BarBreakdownProps = z.infer<typeof barBreakdownPropsSchema>;

export const categoryPiePropsSchema = z.object({
  title: z.string(),
  slices: z
    .array(
      z.object({
        label: z.string(),
        /** Raw magnitude, slice geometry only. */
        value: z.number(),
        display: z.string(),
        /** Preformatted share, e.g. "34%". */
        share: z.string(),
      }),
    )
    .min(2)
    .max(8),
  /** Preformatted total callout, e.g. { label: "Total spend · trailing 3 mo", value: "$41,935.00" }. */
  total: z.object({ label: z.string(), value: z.string() }).optional(),
});
export type CategoryPieProps = z.infer<typeof categoryPiePropsSchema>;

export const transactionTablePropsSchema = z.object({
  title: z.string(),
  rows: z
    .array(
      z.object({
        /** Preformatted display date, e.g. "Jul 12, 2026". */
        postedDate: z.string(),
        merchantName: z.string(),
        category: transactionCategorySchema,
        /** Preformatted amount, e.g. "$482.19". */
        amount: z.string(),
        /** Portfolio-wide tables attribute the account, e.g. "Alicia Thompson · bg-002". */
        accountLabel: z.string().optional(),
      }),
    )
    .min(1)
    .max(25),
  footnote: z.string().optional(),
});
export type TransactionTableProps = z.infer<typeof transactionTablePropsSchema>;

/**
 * A render instruction — the `{ component, props }` payload of the wire
 * contract (§5b). Produced only by server-side tool execution; consumed only
 * by the registry renderer map.
 */
export const renderInstructionSchema = z.discriminatedUnion('component', [
  z.object({ component: z.literal('MetricRow'), props: metricRowPropsSchema }),
  z.object({ component: z.literal('TrendChart'), props: trendChartPropsSchema }),
  z.object({
    component: z.literal('PaymentHistoryTable'),
    props: paymentHistoryTablePropsSchema,
  }),
  z.object({ component: z.literal('RiskBadge'), props: riskBadgePropsSchema }),
  z.object({ component: z.literal('BTTimeline'), props: btTimelinePropsSchema }),
  z.object({
    component: z.literal('InterestProjectionChart'),
    props: interestProjectionChartPropsSchema,
  }),
  z.object({ component: z.literal('PartyGraph'), props: partyGraphPropsSchema }),
  z.object({
    component: z.literal('OutreachDraftCard'),
    props: outreachDraftCardPropsSchema,
  }),
  z.object({ component: z.literal('ApprovalCard'), props: approvalCardPropsSchema }),
  z.object({ component: z.literal('BarBreakdown'), props: barBreakdownPropsSchema }),
  z.object({ component: z.literal('CategoryPie'), props: categoryPiePropsSchema }),
  z.object({
    component: z.literal('TransactionTable'),
    props: transactionTablePropsSchema,
  }),
]);
export type RenderInstruction = z.infer<typeof renderInstructionSchema>;
export type RegistryComponentName = RenderInstruction['component'];
