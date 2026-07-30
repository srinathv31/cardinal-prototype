// Pure functions mapping each servicing EvidenceSpec to a validated
// RenderInstruction, using only lib/soe adapter calls (brief §5a/§5b, §7b).
// This is the servicing chatbot's version of lib/agents/ask/resolvers.ts —
// same shape, one crucial difference: every function here is a ZERO-ARGUMENT
// (or account-agnostic) function. There is no `accountId` parameter to
// accept, validate, or ignore — brief §7a says "resolvers ignore any
// model-supplied account id," and the way this file honors that is by never
// declaring the parameter in the first place, not by accepting one and
// discarding it. The pinned account (lib/agents/servicing/identity.ts) is a
// module-level constant every resolver below closes over directly.
//
// lib/agents/servicing/resolvers.test.ts is the proof: it calls
// `resolveEvidence` with a hand-built spec carrying a bogus, schema-illegal
// `accountId` field (bypassing evidenceSpecSchema entirely, the way a
// misbehaving model's raw tool-call JSON theoretically could before
// validation) and asserts the pinned cardholder's data comes back regardless.

import {
  getAccount,
  getAnchor,
  getTransactions,
  getPayments,
} from '@/lib/soe';
import type { Transaction } from '@/lib/soe';
import { formatCurrency, formatDate, shiftDays, titleCase } from '@/lib/agents/format';
import type { EvidenceSpec } from '@/lib/registry/evidence';
import {
  renderInstructionSchema,
  type CategoryPieProps,
  type MetricRowProps,
  type RenderInstruction,
  type TransactionTableProps,
} from '@/lib/registry/schemas';
import { PINNED_ACCOUNT_ID } from './identity';

const CATEGORY_SLICE_CAP = 8;
const UTILIZATION_WARNING_PCT = 75;

function validateInstruction(instruction: RenderInstruction): RenderInstruction {
  return renderInstructionSchema.parse(instruction);
}

/** ISO date (YYYY-MM-DD) `months` trailing months before "now", on the
 * seed's 30-day statement cadence — same convention lib/agents/ask/resolvers.ts's
 * trailingWindowStart uses, duplicated locally rather than imported: each
 * agent's resolvers.ts is self-contained (no cross-agent imports anywhere in
 * this codebase). "Now" is the demo anchor (`getAnchor()`). */
function trailingWindowStart(months: number): string {
  const todayIso = getAnchor().toISOString().slice(0, 10);
  return shiftDays(todayIso, -months * 30);
}

/** Whole-percent shares that sum to exactly 100 — same algorithm as
 * lib/agents/ask/resolvers.ts's wholePercentShares, duplicated for the same
 * self-containment reason as trailingWindowStart above. */
function wholePercentShares(cents: number[]): number[] {
  const total = cents.reduce((sum, c) => sum + c, 0) || 1;
  const raw = cents.map((c) => (c / total) * 100);
  const shares = raw.map((r) => Math.floor(r));
  const remainder = 100 - shares.reduce((sum, s) => sum + s, 0);
  const byFractionDesc = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac);
  for (let k = 0; k < remainder; k++) {
    shares[byFractionDesc[k % byFractionDesc.length].i] += 1;
  }
  return shares;
}

/** "When is my next payment due?" (brief §7b) — due date, amount due,
 * minimum due, and channel, from the pinned account's SCHEDULED payment. No
 * account id parameter: PINNED_ACCOUNT_ID is the only account this function
 * can ever read. */
async function resolveNextPayment(): Promise<RenderInstruction> {
  const payments = await getPayments(PINNED_ACCOUNT_ID);
  const scheduled = payments.find((p) => p.status === 'SCHEDULED');

  // Defensive, not expected: the pinned account's seed always carries one
  // SCHEDULED payment (lib/soe/seed/patel.ts's M0 statement, dueOffset +19d)
  // — that's WHY Patel is the pinned cardholder (identity.ts). Kept truthful
  // rather than throwing so a future reseed can't crash the surface.
  if (!scheduled) {
    return validateInstruction({
      component: 'MetricRow',
      props: { metrics: [{ label: 'Next Payment', value: 'No payment currently scheduled', tone: 'neutral' }] },
    });
  }

  const metrics: MetricRowProps['metrics'] = [
    { label: 'Due Date', value: formatDate(scheduled.dueDate), tone: 'neutral' },
    { label: 'Amount Due', value: formatCurrency(scheduled.amountDue), tone: 'neutral' },
    { label: 'Minimum Due', value: formatCurrency(scheduled.minimumDue), tone: 'neutral' },
    { label: 'Channel', value: titleCase(scheduled.channel), tone: 'neutral' },
  ];
  return validateInstruction({ component: 'MetricRow', props: { metrics } });
}

/** "What's my balance / available credit?" (brief §7b) — balance, available
 * credit, utilization, purchase APR, from the pinned account. No account id
 * parameter. */
async function resolveAccountSummary(): Promise<RenderInstruction> {
  const account = await getAccount(PINNED_ACCOUNT_ID);
  const utilizationPct =
    account.creditLimit > 0 ? Math.round((account.currentBalance / account.creditLimit) * 100) : 0;

  const metrics: MetricRowProps['metrics'] = [
    { label: 'Balance', value: formatCurrency(account.currentBalance), tone: 'neutral' },
    { label: 'Available Credit', value: formatCurrency(account.availableCredit), tone: 'neutral' },
    {
      label: 'Utilization',
      value: `${utilizationPct}%`,
      tone: utilizationPct >= UTILIZATION_WARNING_PCT ? 'warning' : 'neutral',
    },
    { label: 'Purchase APR', value: `${account.purchaseApr.toFixed(2)}%`, tone: 'neutral' },
  ];
  return validateInstruction({ component: 'MetricRow', props: { metrics } });
}

/** "What are my latest transactions?" (brief §7b) — the pinned account's
 * transactions, most recent first. No account id parameter. */
async function resolveRecentTransactions(months: number, limit: number): Promise<RenderInstruction> {
  const from = trailingWindowStart(months);
  // getTransactions already sorts most-recent-first (lib/soe/adapter.ts).
  const all = await getTransactions(PINNED_ACCOUNT_ID, { from });
  const limited = all.slice(0, limit);

  const rows: TransactionTableProps['rows'] = limited.map((txn) => ({
    postedDate: formatDate(txn.postedDate),
    merchantName: txn.merchantName,
    category: txn.category,
    amount: formatCurrency(txn.amount),
  }));

  return validateInstruction({
    component: 'TransactionTable',
    props: {
      title: 'Your recent transactions',
      rows,
      footnote: `Showing ${rows.length} of ${all.length} transaction${all.length === 1 ? '' : 's'} · trailing ${months} month${months === 1 ? '' : 's'}`,
    },
  });
}

/** "What am I spending on?" (brief §7b) — the pinned account's PURCHASE
 * spend by category, trailing N months. No account id parameter. */
async function resolveCategorySpend(months: number): Promise<RenderInstruction> {
  const from = trailingWindowStart(months);
  const txns = await getTransactions(PINNED_ACCOUNT_ID, { from });

  const totals = new Map<Transaction['category'], number>();
  for (const t of txns) {
    if (t.type !== 'PURCHASE') continue;
    totals.set(t.category, (totals.get(t.category) ?? 0) + Math.round(t.amount * 100));
  }

  const sorted = [...totals.entries()]
    .map(([category, cents]) => ({ category, cents }))
    .sort((a, b) => b.cents - a.cents)
    .slice(0, CATEGORY_SLICE_CAP);
  const shares = wholePercentShares(sorted.map((t) => t.cents));
  const totalCents = sorted.reduce((sum, t) => sum + t.cents, 0);

  const slices: CategoryPieProps['slices'] = sorted.map((t, i) => ({
    label: titleCase(t.category),
    value: t.cents / 100,
    display: formatCurrency(t.cents / 100),
    share: `${shares[i]}%`,
  }));

  return validateInstruction({
    component: 'CategoryPie',
    props: {
      title: `Your spending by category — trailing ${months} mo`,
      slices,
      total: { label: `Total spend · trailing ${months} mo`, value: formatCurrency(totalCents / 100) },
    },
  });
}

/** Dispatches an EvidenceSpec to its resolver — the only entry point
 * lib/agents/servicing/tools.ts's `renderEvidence` tool calls. Resolves only
 * the four servicing-prefixed kinds (brief §7b) and throws on the rest,
 * mirroring every other agent's resolver dispatch
 * (lib/agents/ask/resolvers.ts's `resolveEvidence` is the direct template). */
export async function resolveEvidence(spec: EvidenceSpec): Promise<RenderInstruction> {
  switch (spec.component) {
    case 'MetricRow': {
      if (spec.source.kind === 'servicing-next-payment') return resolveNextPayment();
      if (spec.source.kind === 'servicing-account-summary') return resolveAccountSummary();
      break;
    }
    case 'CategoryPie':
      if (spec.source.kind !== 'servicing-category-spend') break;
      return resolveCategorySpend(spec.source.months);
    case 'TransactionTable':
      if (spec.source.kind !== 'servicing-recent-transactions') break;
      return resolveRecentTransactions(spec.source.months, spec.source.limit);
  }
  throw new Error(
    `servicing does not resolve "${spec.component}" evidence from source "${spec.source.kind}"`,
  );
}
