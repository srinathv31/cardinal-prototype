// Pure functions mapping each Payment Health EvidenceSpec to a validated
// RenderInstruction, using only lib/soe adapter calls. This is where the
// agent's intelligence actually lives (brief §5b) — the model picks WHICH
// evidence to fetch (lib/agents/payment-health/tools.ts); every figure that
// reaches a screen is computed here, from adapter data, and validated
// against the registry schema before it can stream (§5a).

import { getAccount, getPayments, getTransactions } from '@/lib/soe';
import type { Payment } from '@/lib/soe';
import type { EvidenceSpec } from '@/lib/registry/evidence';
import {
  renderInstructionSchema,
  type MetricRowProps,
  type RenderInstruction,
  type Tone,
} from '@/lib/registry/schemas';

const UTILIZATION_WARNING_PCT = 50;
const UTILIZATION_CRITICAL_PCT = 75;
const RISK_WINDOW_DAYS = 30;
const MINIMUM_ONLY_EPSILON = 0.01;

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

function formatCurrency(amount: number): string {
  return currencyFormatter.format(amount);
}

function formatDate(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00.000Z`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

function formatShortMonth(isoDate: string): string {
  return new Date(`${isoDate}T00:00:00.000Z`).toLocaleString('en-US', {
    month: 'short',
    timeZone: 'UTC',
  });
}

/** Short month labels, falling back to "Mon D" for every point when two
 * points would otherwise land on the same month label. */
function monthLabels(isoDates: string[]): string[] {
  const short = isoDates.map(formatShortMonth);
  const hasCollision = new Set(short).size !== short.length;
  if (!hasCollision) return short;
  return isoDates.map((iso, i) => `${short[i]} ${Number(iso.slice(8, 10))}`);
}

function utilizationPercent(balance: number, limit: number): number {
  if (limit <= 0) return 0;
  return Math.round((balance / limit) * 100);
}

function utilizationTone(pct: number): Tone {
  if (pct >= UTILIZATION_CRITICAL_PCT) return 'critical';
  if (pct >= UTILIZATION_WARNING_PCT) return 'warning';
  return 'neutral';
}

/**
 * Days between an ISO date and "now" (positive = in the past). Compares
 * against the wall clock, matching the adapter's own default anchor
 * (lib/soe/seed/anchor.ts uses `new Date()` when DEMO_ANCHOR_DATE is unset).
 * The adapter doesn't expose the demo anchor publicly and resolvers may only
 * call lib/soe, so this only diverges from the seed's relative-date story if
 * DEMO_ANCHOR_DATE is pinned to a date other than the real today — a
 * rehearsal-only scenario, not the default run path.
 */
function daysSince(isoDate: string): number {
  const ms = Date.now() - new Date(`${isoDate}T00:00:00.000Z`).getTime();
  return Math.floor(ms / 86_400_000);
}

function validateInstruction(instruction: RenderInstruction): RenderInstruction {
  return renderInstructionSchema.parse(instruction);
}

interface UtilizationSeries {
  /** Statement-close date (ISO, YYYY-MM-DD), oldest first. */
  closeDates: string[];
  /** Closing balance per cycle, oldest first, dollars. */
  balances: number[];
  /** Utilization %, oldest first, rounded to whole points. */
  percents: number[];
}

/**
 * Reconstructs month-end (statement-close) utilization purely from adapter
 * data. Two facts about the seed shape make this possible without ever
 * touching lib/soe/seed directly:
 *  - a Payment's `amountDue` is that statement's OPENING balance, so the
 *    opening balance of cycle i+1 equals the CLOSING balance of cycle i
 *    (lib/soe/seed/marcus.ts: `amountDue: statementCents / 100` where
 *    `statementCents = row.openingCents`);
 *  - every cycle posts exactly one `INTEREST` transaction, dated on that
 *    cycle's statement-close day — used to date each point.
 * The account's current balance supplies the closing balance of the most
 * recent cycle, since there is no "next" payment to read it from.
 * Reproduces Marcus Webb's 42→48→56→63→71→78 exactly (resolvers.test.ts).
 */
async function utilizationSeries(accountId: string, months: number): Promise<UtilizationSeries> {
  const [account, payments, transactions] = await Promise.all([
    getAccount(accountId),
    getPayments(accountId),
    getTransactions(accountId),
  ]);

  const chronologicalPayments = [...payments].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const closeDatesAll = transactions
    .filter((t) => t.type === 'INTEREST')
    .map((t) => t.postedDate)
    .sort((a, b) => a.localeCompare(b));

  const cycles = Math.min(closeDatesAll.length, chronologicalPayments.length);
  const balancesAll: number[] = [];
  for (let i = 0; i < cycles; i++) {
    balancesAll.push(
      i < cycles - 1 ? chronologicalPayments[i + 1].amountDue : account.currentBalance,
    );
  }

  const take = Math.min(months, cycles);
  const closeDates = closeDatesAll.slice(-take);
  const balances = balancesAll.slice(-take);
  const percents = balances.map((b) => utilizationPercent(b, account.creditLimit));

  return { closeDates, balances, percents };
}

async function resolveAccountOverview(accountId: string): Promise<RenderInstruction> {
  const account = await getAccount(accountId);
  const utilizationPct = utilizationPercent(account.currentBalance, account.creditLimit);
  const trend = await utilizationSeries(accountId, 6);

  const metrics: MetricRowProps['metrics'] = [
    { label: 'Current Balance', value: formatCurrency(account.currentBalance), tone: 'neutral' },
    { label: 'Credit Limit', value: formatCurrency(account.creditLimit), tone: 'neutral' },
    { label: 'Available Credit', value: formatCurrency(account.availableCredit), tone: 'neutral' },
    {
      label: 'Utilization',
      value: `${utilizationPct}%`,
      delta: utilizationDelta(trend.percents),
      tone: utilizationTone(utilizationPct),
    },
    { label: 'Purchase APR', value: `${account.purchaseApr.toFixed(2)}%`, tone: 'neutral' },
  ];

  return validateInstruction({ component: 'MetricRow', props: { metrics } });
}

function utilizationDelta(percents: number[]): string | undefined {
  if (percents.length < 2) return undefined;
  const delta = percents[percents.length - 1] - percents[0];
  if (delta <= 0) return undefined;
  return `+${delta} pts in ${percents.length - 1} mo`;
}

async function resolveUtilizationTrend(accountId: string, months: number): Promise<RenderInstruction> {
  const series = await utilizationSeries(accountId, months);
  const labels = monthLabels(series.closeDates);

  return validateInstruction({
    component: 'TrendChart',
    props: {
      title: 'Utilization Trend',
      unit: 'percent',
      series: [
        {
          id: 'utilization',
          label: 'Revolving Utilization',
          points: series.percents.map((value, i) => ({ label: labels[i], value })),
        },
      ],
    },
  });
}

function flagPayment(p: Payment): 'minimum-only' | 'missed' | undefined {
  if (p.status === 'MISSED') return 'missed';
  if (p.amountPaid > 0 && p.amountPaid <= p.minimumDue + MINIMUM_ONLY_EPSILON) return 'minimum-only';
  return undefined;
}

async function resolvePaymentHistory(accountId: string, months: number): Promise<RenderInstruction> {
  // getPayments returns most-recent-first (lib/soe/adapter.ts), so the first
  // `months` entries are exactly the trailing window we want.
  const payments = await getPayments(accountId);
  const rows = payments.slice(0, months).map((p) => ({
    dueDate: formatDate(p.dueDate),
    amountDue: formatCurrency(p.amountDue),
    minimumDue: formatCurrency(p.minimumDue),
    amountPaid: formatCurrency(p.amountPaid),
    status: p.status,
    channel: p.channel,
    flag: flagPayment(p),
  }));

  return validateInstruction({
    component: 'PaymentHistoryTable',
    props: { title: `Payment History — last ${rows.length} statements`, rows },
  });
}

async function resolvePaymentRisk(accountId: string, rationale: string): Promise<RenderInstruction> {
  const [account, payments] = await Promise.all([getAccount(accountId), getPayments(accountId)]);

  const highUtilization =
    utilizationPercent(account.currentBalance, account.creditLimit) >= UTILIZATION_CRITICAL_PCT;
  const missedRecently = payments.some((p) => {
    if (p.status !== 'MISSED') return false;
    const age = daysSince(p.dueDate);
    return age >= 0 && age <= RISK_WINDOW_DAYS;
  });

  const level = missedRecently && highUtilization ? 'high' : missedRecently || highUtilization ? 'elevated' : 'low';
  const headline =
    level === 'high'
      ? 'High payment risk'
      : level === 'elevated'
        ? 'Elevated payment risk'
        : 'Low payment risk';

  return validateInstruction({ component: 'RiskBadge', props: { level, headline, rationale } });
}

/** Dispatches an EvidenceSpec to its resolver. The only entry point
 * lib/agents/payment-health/tools.ts's `renderEvidence` tool calls. */
export async function resolveEvidence(spec: EvidenceSpec): Promise<RenderInstruction> {
  switch (spec.component) {
    case 'MetricRow':
      return resolveAccountOverview(spec.source.accountId);
    case 'TrendChart':
      return resolveUtilizationTrend(spec.source.accountId, spec.source.months);
    case 'PaymentHistoryTable':
      return resolvePaymentHistory(spec.source.accountId, spec.source.months);
    case 'RiskBadge':
      return resolvePaymentRisk(spec.source.accountId, spec.rationale);
    default: {
      const exhaustive: never = spec;
      throw new Error(`Unhandled evidence spec: ${JSON.stringify(exhaustive)}`);
    }
  }
}
