// Pure functions mapping each BT Lifecycle EvidenceSpec to a validated
// RenderInstruction, using only lib/soe adapter calls. This is where the
// agent's intelligence actually lives (brief §5b) — the model picks WHICH
// evidence to fetch (lib/agents/bt-lifecycle/tools.ts); every figure that
// reaches a screen is computed here, from adapter data, and validated
// against the registry schema before it can stream (§5a). Reproduces Elena
// Ruiz's story (CARDINAL_BRIEF.md §6, Beat 3) exactly.

import {
  getAccount,
  getBalanceTransferEvents,
  getPayments,
  projectInterest,
} from '@/lib/soe';
import type { BalanceTransferEvent } from '@/lib/soe';
import { daysUntil, formatCurrency, formatDate } from '@/lib/agents/format';
import type { EvidenceSpec } from '@/lib/registry/evidence';
import {
  renderInstructionSchema,
  type BTTimelineProps,
  type InterestProjectionChartProps,
  type MetricRowProps,
  type RenderInstruction,
} from '@/lib/registry/schemas';

function validateInstruction(instruction: RenderInstruction): RenderInstruction {
  return renderInstructionSchema.parse(instruction);
}

/** Shared derivation for all three evidence kinds. The three BT lifecycle
 * events (lib/soe/seed/elena.ts) share transferAmount/promoApr/promoEndDate/
 * goToApr; only `type` and `remainingBalance` vary by event. */
interface LifecycleFacts {
  initiated: BalanceTransferEvent;
  completed: BalanceTransferEvent;
  /** Last event by timestamp (getBalanceTransferEvents returns ascending). */
  latest: BalanceTransferEvent;
  /** Falls back to the account balance if the latest event omits it. */
  remaining: number;
}

async function lifecycleFacts(accountId: string): Promise<LifecycleFacts> {
  const [account, events] = await Promise.all([
    getAccount(accountId),
    getBalanceTransferEvents(accountId),
  ]);

  const initiated = events.find((e) => e.type === 'BT_INITIATED');
  const completed = events.find((e) => e.type === 'BT_COMPLETED');
  const latest = events[events.length - 1];
  if (!initiated || !completed || !latest) {
    throw new Error(`bt-lifecycle: incomplete BT event history for "${accountId}"`);
  }

  return { initiated, completed, latest, remaining: latest.remainingBalance ?? account.currentBalance };
}

async function resolveBtOverview(accountId: string): Promise<RenderInstruction> {
  const { completed, latest, remaining } = await lifecycleFacts(accountId);
  const daysLeft = daysUntil(latest.promoEndDate);

  const metrics: MetricRowProps['metrics'] = [
    {
      label: 'Transferred',
      value: formatCurrency(completed.transferAmount),
      delta: `Completed ${formatDate(completed.timestamp)}`,
      tone: 'neutral',
    },
    { label: 'Remaining Balance', value: formatCurrency(remaining), tone: 'warning' },
    {
      label: 'Promo APR',
      value: `${latest.promoApr.toFixed(2)}%`,
      delta: `Ends ${formatDate(latest.promoEndDate)}`,
      tone: 'warning',
    },
    { label: 'Go-to APR', value: `${latest.goToApr.toFixed(2)}%`, tone: 'critical' },
    { label: 'Days Until Promo Ends', value: `${daysLeft} days`, tone: 'warning' },
  ];

  return validateInstruction({ component: 'MetricRow', props: { metrics } });
}

async function resolveBtLifecycleTimeline(accountId: string): Promise<RenderInstruction> {
  const { initiated, completed, latest, remaining } = await lifecycleFacts(accountId);
  const daysLeft = daysUntil(latest.promoEndDate);

  const milestones: BTTimelineProps['milestones'] = [
    {
      id: 'initiated',
      label: 'Transfer initiated',
      date: formatDate(initiated.timestamp),
      detail: `${formatCurrency(initiated.transferAmount)} at ${initiated.promoApr.toFixed(2)}% promo APR`,
      kind: 'past',
    },
    {
      id: 'completed',
      label: 'Transfer completed',
      date: formatDate(completed.timestamp),
      detail: `${formatCurrency(completed.transferAmount)} posted; ${completed.promoApr.toFixed(2)}% promo APR begins`,
      kind: 'past',
    },
    {
      id: 'today',
      label: 'Today',
      date: formatDate(new Date().toISOString()),
      detail: `${formatCurrency(remaining)} remaining`,
      kind: 'today',
    },
    {
      id: 'promo-end',
      label: 'Promo rate ends',
      date: formatDate(latest.promoEndDate),
      detail: `${latest.goToApr.toFixed(2)}% go-to APR begins`,
      kind: 'cliff',
    },
  ];

  return validateInstruction({
    component: 'BTTimeline',
    props: {
      title: 'Balance transfer lifecycle',
      milestones,
      countdown: `${daysLeft} days until the promo rate ends`,
    },
  });
}

async function resolveInterestProjection(
  accountId: string,
  months: number,
): Promise<RenderInstruction> {
  const { latest, remaining } = await lifecycleFacts(accountId);
  const payments = await getPayments(accountId);
  // getPayments returns most-recent-first (lib/soe/adapter.ts); the first
  // POSTED entry is the current monthly payment the projection assumes.
  const mostRecentPosted = payments.find((p) => p.status === 'POSTED');
  if (!mostRecentPosted) {
    throw new Error(`bt-lifecycle: no posted payments to project from for "${accountId}"`);
  }

  const balanceCents = Math.round(remaining * 100);
  const aprBps = Math.round(latest.goToApr * 100);
  const paymentCents = Math.round(mostRecentPosted.amountPaid * 100);
  const rows = projectInterest(balanceCents, aprBps, paymentCents, months);

  const points: InterestProjectionChartProps['points'] = rows.map((row) => ({
    label: `M${row.month}`,
    monthlyInterest: row.interestCents / 100,
    cumulativeInterest: row.cumulativeInterestCents / 100,
  }));

  const assumedPayment = formatCurrency(mostRecentPosted.amountPaid);
  const firstMonthInterest = formatCurrency(points[0].monthlyInterest);
  const finalCumulative = formatCurrency(points[points.length - 1].cumulativeInterest);

  return validateInstruction({
    component: 'InterestProjectionChart',
    props: {
      title: 'Interest projection — if nothing changes',
      assumption: `If the ${formatCurrency(remaining)} balance revolves at the ${latest.goToApr.toFixed(2)}% go-to APR and the current ${assumedPayment}/month payment continues, interest accrues as projected below.`,
      points,
      callouts: [
        { label: 'First month interest', value: firstMonthInterest },
        { label: `${months}-month total`, value: finalCumulative },
        { label: 'Assumed payment', value: `${assumedPayment}/mo` },
      ],
    },
  });
}

/** Dispatches an EvidenceSpec to its resolver. The only entry point
 * lib/agents/bt-lifecycle/tools.ts's `renderEvidence` tool calls. The
 * evidence union is shared across all agents (lib/registry/evidence.ts);
 * this agent resolves only the BT Lifecycle kinds and throws on the rest —
 * the tool surfaces that as an output-error chip, never a crash. */
export async function resolveEvidence(spec: EvidenceSpec): Promise<RenderInstruction> {
  switch (spec.component) {
    case 'MetricRow':
      if (spec.source.kind !== 'bt-overview') break;
      return resolveBtOverview(spec.source.accountId);
    case 'BTTimeline':
      return resolveBtLifecycleTimeline(spec.source.accountId);
    case 'InterestProjectionChart':
      return resolveInterestProjection(spec.source.accountId, spec.source.months);
  }
  throw new Error(
    `bt-lifecycle does not resolve "${spec.component}" evidence from source "${spec.source.kind}"`,
  );
}
