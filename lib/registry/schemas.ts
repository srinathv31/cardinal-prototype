// Component registry props schemas (brief §5c) — the only components the
// model may render. Every prop that reaches a renderer is validated against
// these schemas server-side before it crosses the wire, so the frontend can
// trust payloads blindly. Display values (currency, dates, percentages) are
// preformatted strings computed server-side; raw numbers appear only where a
// chart needs geometry. See docs/wire-contract.md §3.
//
// P1 ships the Payment Health set. Remaining registry members (BarBreakdown,
// CategoryPie, TransactionTable, BTTimeline, InterestProjectionChart,
// PartyGraph) are added in P2/P3: schema here + renderer + one union member.

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
});
export type ApprovalCardProps = z.infer<typeof approvalCardPropsSchema>;

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
  z.object({
    component: z.literal('OutreachDraftCard'),
    props: outreachDraftCardPropsSchema,
  }),
  z.object({ component: z.literal('ApprovalCard'), props: approvalCardPropsSchema }),
]);
export type RenderInstruction = z.infer<typeof renderInstructionSchema>;
export type RegistryComponentName = RenderInstruction['component'];
