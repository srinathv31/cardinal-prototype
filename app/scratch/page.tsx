"use client";

// DEV-ONLY REGISTRY SHOWCASE (W1.2, extended W2.3 to cover the P2 set, W3.3
// to cover the final P3 set). Renders every registry component (brief §5c)
// from typed fixture RenderInstruction/props objects, with story-plausible
// values (Marcus Webb for P1, Elena and the Patels for P2, portfolio-wide Ask
// data for P3) — this is how the registry gets visually verified without an
// LLM key. Not part of the §4 screen inventory. Delete this page before the
// demo ships; it superseded the P0 lib/soe smoke-test that lived at this
// route. The three P3 fixtures are parsed through renderInstructionSchema
// (not just TS-annotated like the earlier fixtures) so schema drift fails
// fast right here rather than silently at render time.

import { useState } from "react";
import { PageHeader } from "@/components/shell/page-header";
import {
  EvidenceRenderer,
  OutreachDraftCard,
  ApprovalCard,
} from "@/components/registry";
import {
  renderInstructionSchema,
  type RenderInstruction,
  type OutreachDraftCardProps,
  type ApprovalCardProps,
} from "@/lib/registry/schemas";

const metricRowFixture: RenderInstruction = {
  component: "MetricRow",
  props: {
    metrics: [
      { label: "Credit limit", value: "$8,000.00", tone: "neutral" },
      {
        label: "Utilization",
        value: "78%",
        delta: "+36 pts in 5 mo",
        tone: "critical",
      },
      {
        label: "Current balance",
        value: "$6,240.00",
        tone: "warning",
      },
      { label: "Minimum due", value: "$187.00", tone: "neutral" },
    ],
  },
};

const trendChartFixture: RenderInstruction = {
  component: "TrendChart",
  props: {
    title: "Utilization trend — Marcus Webb",
    unit: "percent",
    series: [
      {
        id: "utilization",
        label: "Utilization",
        points: [
          { label: "Feb", value: 42 },
          { label: "Mar", value: 51 },
          { label: "Apr", value: 61 },
          { label: "May", value: 69 },
          { label: "Jun", value: 78 },
        ],
      },
    ],
  },
};

const paymentHistoryFixture: RenderInstruction = {
  component: "PaymentHistoryTable",
  props: {
    title: "Payment history — last 5 cycles",
    rows: [
      {
        dueDate: "Feb 12, 2026",
        amountDue: "$187.00",
        minimumDue: "$187.00",
        amountPaid: "$187.00",
        status: "POSTED",
        channel: "AUTOPAY",
      },
      {
        dueDate: "Mar 12, 2026",
        amountDue: "$212.00",
        minimumDue: "$187.00",
        amountPaid: "$187.00",
        status: "POSTED",
        channel: "AUTOPAY",
        flag: "minimum-only",
      },
      {
        dueDate: "Apr 12, 2026",
        amountDue: "$224.00",
        minimumDue: "$189.00",
        amountPaid: "$189.00",
        status: "POSTED",
        channel: "AUTOPAY",
        flag: "minimum-only",
      },
      {
        dueDate: "May 12, 2026",
        amountDue: "$231.00",
        minimumDue: "$192.00",
        amountPaid: "$192.00",
        status: "POSTED",
        channel: "AUTOPAY",
        flag: "minimum-only",
      },
      {
        dueDate: "Jun 12, 2026",
        amountDue: "$238.00",
        minimumDue: "$196.00",
        amountPaid: "$0.00",
        status: "MISSED",
        channel: "AUTOPAY",
        flag: "missed",
      },
    ],
  },
};

const riskBadgeFixture: RenderInstruction = {
  component: "RiskBadge",
  props: {
    level: "elevated",
    headline:
      "Utilization climbing toward the limit, with a first missed payment",
    rationale:
      "Utilization rose from 42% to 78% over five months alongside three consecutive minimum-only payments. Autopay failed 12 days ago, resulting in this account's first missed payment. Payment support outreach before the next statement cycle is recommended.",
  },
};

const btTimelineFixture: RenderInstruction = {
  component: "BTTimeline",
  props: {
    title: "Balance transfer lifecycle",
    milestones: [
      {
        id: "initiated",
        label: "Balance transfer initiated",
        date: "Sep 11, 2025",
        detail: "$8,400.00 at 0.00% promo APR",
        kind: "past",
      },
      {
        id: "completed",
        label: "Transfer completed",
        date: "Sep 18, 2025",
        kind: "past",
      },
      {
        id: "today",
        label: "Today",
        date: "Jul 23, 2026",
        detail: "$5,100.00 remaining",
        kind: "today",
      },
      {
        id: "promo-end",
        label: "Promo rate ends",
        date: "Sep 6, 2026",
        detail: "Go-to APR 24.99% begins",
        kind: "cliff",
      },
    ],
    countdown: "45 days until the promo rate ends",
  },
};

const interestProjectionChartFixture: RenderInstruction = {
  component: "InterestProjectionChart",
  props: {
    title: "Projected interest after promo ends",
    assumption:
      "If nothing changes: $5,100.00 revolves at 24.99% APR after the promo ends, with $330.00/mo payments continuing",
    points: [
      { label: "M1", monthlyInterest: 106.21, cumulativeInterest: 106.21 },
      { label: "M2", monthlyInterest: 101.55, cumulativeInterest: 207.76 },
      { label: "M3", monthlyInterest: 96.79, cumulativeInterest: 304.55 },
      { label: "M4", monthlyInterest: 91.93, cumulativeInterest: 396.48 },
      { label: "M5", monthlyInterest: 86.98, cumulativeInterest: 483.46 },
      { label: "M6", monthlyInterest: 81.91, cumulativeInterest: 565.37 },
      { label: "M7", monthlyInterest: 76.75, cumulativeInterest: 642.12 },
      { label: "M8", monthlyInterest: 71.47, cumulativeInterest: 713.59 },
      { label: "M9", monthlyInterest: 66.09, cumulativeInterest: 779.68 },
      { label: "M10", monthlyInterest: 60.59, cumulativeInterest: 840.27 },
      { label: "M11", monthlyInterest: 54.98, cumulativeInterest: 895.25 },
      { label: "M12", monthlyInterest: 49.26, cumulativeInterest: 944.51 },
    ],
    callouts: [
      { label: "First month interest", value: "$106.21" },
      { label: "12-month total", value: "$944.51" },
      { label: "Assumed payment", value: "$330.00/mo" },
    ],
  },
};

const partyGraphFixture: RenderInstruction = {
  component: "PartyGraph",
  props: {
    title: "Household relationship map",
    account: {
      label: "Patel household card",
      detail: "Open since Aug 2018 · $25,000.00 limit",
    },
    parties: [
      {
        id: "party-anand-patel",
        name: "Anand Patel",
        role: "PRIMARY",
        detail: "Primary since Aug 2018",
        highlight: false,
      },
      {
        id: "party-priya-patel",
        name: "Priya Patel",
        role: "AUTHORIZED_USER",
        detail: "Authorized user since Jun 2019 · Age 49",
        highlight: false,
      },
      {
        id: "party-dev-patel",
        name: "Dev Patel",
        role: "AUTHORIZED_USER",
        detail: "Authorized user since Jul 2022 · Age 22",
        highlight: true,
      },
    ],
  },
};

// P3 (W3.3) fixtures — Ask surface evidence. Parsed through
// renderInstructionSchema (not just TS-annotated) so a schema/props drift
// fails fast on this page instead of only showing up at render time.
const barBreakdownFixture: RenderInstruction = renderInstructionSchema.parse({
  component: "BarBreakdown",
  props: {
    title: "Balance transfers expiring within 90 days",
    unit: "currency",
    bars: [
      {
        label: "Alicia Thompson",
        value: 1750,
        display: "$1,750.00",
        detail: "Promo ends Sep 4, 2026 · 30 days · go-to 22.99%",
        tone: "warning",
      },
      {
        label: "Elena Ruiz",
        value: 5100,
        display: "$5,100.00",
        detail: "Promo ends Sep 19, 2026 · 45 days · go-to 24.99%",
        tone: "warning",
      },
      {
        label: "Fatima Al-Sayed",
        value: 6000,
        display: "$6,000.00",
        detail: "Promo ends Oct 19, 2026 · 75 days · go-to 26.99%",
        tone: "neutral",
      },
    ],
    footnote: "3 portfolio accounts have a BT promo ending within 90 days.",
  },
});

const categoryPieFixture: RenderInstruction = renderInstructionSchema.parse({
  component: "CategoryPie",
  props: {
    title: "Portfolio spend by category — trailing 3 mo",
    slices: [
      { label: "Retail", value: 14200, display: "$14,200.00", share: "34%" },
      { label: "Grocery", value: 8100, display: "$8,100.00", share: "19%" },
      { label: "Travel", value: 6300, display: "$6,300.00", share: "15%" },
      { label: "Dining", value: 5200, display: "$5,200.00", share: "12%" },
      { label: "Utilities", value: 2800, display: "$2,800.00", share: "8%" },
      { label: "Fuel", value: 3100, display: "$3,100.00", share: "7%" },
      { label: "Subscription", value: 1400, display: "$1,400.00", share: "3%" },
      { label: "Other", value: 835, display: "$835.00", share: "2%" },
    ],
    total: { label: "Total spend · trailing 3 mo", value: "$41,935.00" },
  },
});

const transactionTableFixture: RenderInstruction = renderInstructionSchema.parse({
  component: "TransactionTable",
  props: {
    title: "Recent transactions — portfolio-wide",
    rows: [
      {
        postedDate: "Jul 21, 2026",
        merchantName: "Amazon",
        category: "RETAIL",
        amount: "$412.19",
        accountLabel: "Jordan Kim · bg-001",
      },
      {
        postedDate: "Jul 20, 2026",
        merchantName: "Delta Air Lines",
        category: "TRAVEL",
        amount: "$618.40",
        accountLabel: "Robert Chen · bg-003",
      },
      {
        postedDate: "Jul 19, 2026",
        merchantName: "Whole Foods",
        category: "GROCERY",
        amount: "$96.72",
        accountLabel: "Fatima Al-Sayed · bg-005",
      },
      {
        postedDate: "Jul 19, 2026",
        merchantName: "Shell",
        category: "FUEL",
        amount: "$54.10",
        accountLabel: "Luis Ortega · bg-004",
      },
      {
        postedDate: "Jul 18, 2026",
        merchantName: "Netflix",
        category: "SUBSCRIPTION",
        amount: "$15.49",
        accountLabel: "Grace Nakamura · bg-006",
      },
    ],
    footnote: "Showing 5 of 214 transactions · trailing 3 months",
  },
});

// Malformed on purpose — simulates a wire payload outside the registry to
// verify EvidenceRenderer's "never throw" guarantee (wire-contract §3,
// brief §8). Cast is deliberate; real callers never get an invalid
// RenderInstruction past the Zod schema.
const unknownComponentFixture = {
  component: "SomeUnregisteredComponent",
  props: {},
} as unknown as RenderInstruction;

const outreachDraftFixture: OutreachDraftCardProps = {
  channel: "EMAIL",
  to: "marcus.webb@example.com",
  subject: "Let's find a payment option that works for you",
  body: `Hi Marcus,

We noticed your autopay didn't go through this month and wanted to reach out before your next statement.

We can shift your due date to better match your pay cycle and set up a short-term payment plan so you stay on track. No fees, and it only takes a couple of minutes to confirm.

Reply here or call us at 1-800-555-0134 and we'll get it set up.

— Cardinal Servicing Team`,
};

const pendingApprovalFixture: ApprovalCardProps = {
  approvalId: "appr-marcus-outreach-1",
  toolName: "sendOutreachDraft",
  title: "Send payment support outreach",
  description:
    "Draft email to Marcus Webb proposing a due-date alignment and a short-term payment plan.",
  rationale:
    "Utilization climbed 36 points in five months and autopay failed 12 days ago — early outreach reduces the chance of a second missed payment.",
  evidence: ["MetricRow", "TrendChart", "PaymentHistoryTable", "RiskBadge"],
};

const resolvedApprovalFixture: ApprovalCardProps = {
  approvalId: "appr-marcus-due-date-1",
  toolName: "proposeDueDateChange",
  title: "Align due date to the 24th",
  description:
    "Shift Marcus Webb's payment due date from the 12th to the 24th to follow his pay cycle.",
  rationale:
    "Autopay has failed against the current due date; his direct-deposit pattern lands mid-month.",
  evidence: ["PaymentHistoryTable"],
};

export default function ScratchPage() {
  const [pendingDecision, setPendingDecision] = useState<
    "approved" | "denied" | undefined
  >(undefined);

  return (
    <div className="space-y-10 pb-16">
      <PageHeader
        title="Component Registry Showcase"
        description="Dev-only fixture render of the full registry set (P1 Payment Health + P2 BT Lifecycle/AU Growth) — deleted before the demo ships."
      />

      <ShowcaseSection label="MetricRow" tool="renderEvidence → EvidenceRenderer">
        <EvidenceRenderer instruction={metricRowFixture} />
      </ShowcaseSection>

      <ShowcaseSection label="TrendChart" tool="renderEvidence → EvidenceRenderer">
        <EvidenceRenderer instruction={trendChartFixture} />
      </ShowcaseSection>

      <ShowcaseSection
        label="PaymentHistoryTable"
        tool="renderEvidence → EvidenceRenderer"
      >
        <EvidenceRenderer instruction={paymentHistoryFixture} />
      </ShowcaseSection>

      <ShowcaseSection label="RiskBadge" tool="renderEvidence → EvidenceRenderer">
        <EvidenceRenderer instruction={riskBadgeFixture} />
      </ShowcaseSection>

      <ShowcaseSection label="BTTimeline" tool="renderEvidence → EvidenceRenderer">
        <EvidenceRenderer instruction={btTimelineFixture} />
      </ShowcaseSection>

      <ShowcaseSection
        label="InterestProjectionChart"
        tool="renderEvidence → EvidenceRenderer"
      >
        <EvidenceRenderer instruction={interestProjectionChartFixture} />
      </ShowcaseSection>

      <ShowcaseSection label="PartyGraph" tool="renderEvidence → EvidenceRenderer">
        <EvidenceRenderer instruction={partyGraphFixture} />
      </ShowcaseSection>

      <ShowcaseSection label="BarBreakdown" tool="renderEvidence → EvidenceRenderer">
        <EvidenceRenderer instruction={barBreakdownFixture} />
      </ShowcaseSection>

      <ShowcaseSection label="CategoryPie" tool="renderEvidence → EvidenceRenderer">
        <EvidenceRenderer instruction={categoryPieFixture} />
      </ShowcaseSection>

      <ShowcaseSection label="TransactionTable" tool="renderEvidence → EvidenceRenderer">
        <EvidenceRenderer instruction={transactionTableFixture} />
      </ShowcaseSection>

      <ShowcaseSection
        label="OutreachDraftCard"
        tool="tool-sendOutreachDraft input (not evidence-routed)"
      >
        <OutreachDraftCard
          {...outreachDraftFixture}
          onBodyChange={(body) =>
            console.log("[scratch] OutreachDraftCard body edited:", body)
          }
        />
      </ShowcaseSection>

      <ShowcaseSection
        label="ApprovalCard — pending"
        tool="tool-sendOutreachDraft approval-requested (not evidence-routed)"
      >
        <ApprovalCard
          {...pendingApprovalFixture}
          decision={pendingDecision}
          onApprove={() => {
            console.log("[scratch] ApprovalCard approved:", pendingApprovalFixture.approvalId);
            setPendingDecision("approved");
          }}
          onDecline={() => {
            console.log("[scratch] ApprovalCard declined:", pendingApprovalFixture.approvalId);
            setPendingDecision("denied");
          }}
        />
      </ShowcaseSection>

      <ShowcaseSection
        label="ApprovalCard — resolved + disabled"
        tool="tool-proposeDueDateChange approval-responded (not evidence-routed)"
      >
        <ApprovalCard
          {...resolvedApprovalFixture}
          decision="denied"
          disabled
          onApprove={() => console.log("[scratch] unreachable — resolved card")}
          onDecline={() => console.log("[scratch] unreachable — resolved card")}
        />
      </ShowcaseSection>

      <ShowcaseSection
        label="EvidenceRenderer — unregistered component"
        tool="demo-safety check: must render nothing, log a console error, never throw (brief §8)"
      >
        <div className="rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
          <EvidenceRenderer instruction={unknownComponentFixture} />
          Renders nothing above (check the console for the logged error) —
          confirms the app does not white-screen on an out-of-registry
          component name.
        </div>
      </ShowcaseSection>
    </div>
  );
}

function ShowcaseSection({
  label,
  tool,
  children,
}: {
  label: string;
  tool: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2">
        <h2 className="text-lg font-semibold">{label}</h2>
        <span className="font-mono text-xs text-muted-foreground">{tool}</span>
      </div>
      {children}
    </section>
  );
}
