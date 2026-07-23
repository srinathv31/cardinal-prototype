// Pure functions mapping each Ask EvidenceSpec to a validated
// RenderInstruction, using only lib/soe adapter calls. This is where Beat 5's
// intelligence actually lives (brief §5a/§5b, §3 Beat 5): the model picks
// WHICH evidence to fetch, over WHAT window/account; every figure that
// reaches a screen — category totals, BT expirations, transaction rows,
// portfolio rollups — is computed here, from adapter data, and validated
// against the registry schema before it can stream. Ask is read-only: it
// never proposes an action (docs/wire-contract.md — no toolApproval config).

import {
  getAccount,
  getAnchor,
  getBalanceTransferEvents,
  getPartiesForAccount,
  getPortfolioAccounts,
  getTransactions,
} from '@/lib/soe';
import type { Account, Transaction } from '@/lib/soe';
import { daysUntil, formatCurrency, formatDate, shiftDays, titleCase } from '@/lib/agents/format';
import type { EvidenceSpec } from '@/lib/registry/evidence';
import {
  renderInstructionSchema,
  type BarBreakdownProps,
  type CategoryPieProps,
  type MetricRowProps,
  type RenderInstruction,
  type TransactionTableProps,
} from '@/lib/registry/schemas';

const CATEGORY_SLICE_CAP = 8;
const BT_EXPIRING_WARNING_DAYS = 45;
const PORTFOLIO_UTILIZATION_WARNING_PCT = 75;
const PORTFOLIO_BT_HORIZON_DAYS = 90;

function validateInstruction(instruction: RenderInstruction): RenderInstruction {
  return renderInstructionSchema.parse(instruction);
}

/** ISO date (YYYY-MM-DD) `months` trailing months before "now", on the
 * seed's 30-day statement cadence (lib/soe/seed/background.ts) — consistent
 * with the day-offset convention the rest of the seed uses (CLAUDE.md).
 * "Now" is the demo anchor (`getAnchor()`). */
function trailingWindowStart(months: number): string {
  const todayIso = getAnchor().toISOString().slice(0, 10);
  return shiftDays(todayIso, -months * 30);
}

/** Whole-percent shares that sum to exactly 100 — floors every share, then
 * hands the rounding remainder to the entries with the largest fractional
 * part first, so no category's share is ever misleadingly rounded up twice. */
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

interface CategoryTotal {
  category: Transaction['category'];
  cents: number;
}

/** Sums PURCHASE transactions by category across every portfolio account
 * over the trailing `months` window, sorted descending by amount. */
async function categorySpendTotals(months: number): Promise<CategoryTotal[]> {
  const accounts = await getPortfolioAccounts();
  const from = trailingWindowStart(months);
  const perAccountTxns = await Promise.all(
    accounts.map((account) => getTransactions(account.accountId, { from })),
  );

  const totals = new Map<Transaction['category'], number>();
  for (const txns of perAccountTxns) {
    for (const t of txns) {
      if (t.type !== 'PURCHASE') continue;
      totals.set(t.category, (totals.get(t.category) ?? 0) + Math.round(t.amount * 100));
    }
  }

  return [...totals.entries()]
    .map(([category, cents]) => ({ category, cents }))
    .sort((a, b) => b.cents - a.cents);
}

async function resolveCategorySpend(
  component: 'BarBreakdown' | 'CategoryPie',
  months: number,
): Promise<RenderInstruction> {
  const totals = (await categorySpendTotals(months)).slice(0, CATEGORY_SLICE_CAP);
  const shares = wholePercentShares(totals.map((t) => t.cents));
  const totalCents = totals.reduce((sum, t) => sum + t.cents, 0);

  if (component === 'CategoryPie') {
    const slices: CategoryPieProps['slices'] = totals.map((t, i) => ({
      label: titleCase(t.category),
      value: t.cents / 100,
      display: formatCurrency(t.cents / 100),
      share: `${shares[i]}%`,
    }));
    return validateInstruction({
      component: 'CategoryPie',
      props: {
        title: `Portfolio spend by category — trailing ${months} mo`,
        slices,
        total: {
          label: `Total spend · trailing ${months} mo`,
          value: formatCurrency(totalCents / 100),
        },
      },
    });
  }

  const bars: BarBreakdownProps['bars'] = totals.map((t, i) => ({
    label: titleCase(t.category),
    value: t.cents / 100,
    display: formatCurrency(t.cents / 100),
    detail: `${shares[i]}% of trailing ${months}-mo spend`,
    tone: 'neutral',
  }));
  return validateInstruction({
    component: 'BarBreakdown',
    props: {
      title: `Portfolio spend by category — trailing ${months} mo`,
      unit: 'currency',
      bars,
      footnote: `${formatCurrency(totalCents / 100)} total across all portfolio accounts.`,
    },
  });
}

interface ExpiringBt {
  accountId: string;
  partyName: string;
  remaining: number;
  daysLeft: number;
  promoEndDate: string;
  goToApr: number;
}

/** For every portfolio account, reads its latest BT event (by timestamp) and
 * keeps it when the promo ends in the future, within `windowDays`, and the
 * event isn't already a PROMO_EXPIRED terminal state. With the seed cast and
 * the default 90-day window this returns exactly bg-002 (~30d), Elena Ruiz
 * (~45d), bg-005 (~75d), soonest first (lib/agents/ask/resolvers.test.ts). */
async function expiringBtAccounts(windowDays: number): Promise<ExpiringBt[]> {
  const accounts = await getPortfolioAccounts();
  const perAccount = await Promise.all(
    accounts.map(async (account): Promise<ExpiringBt | null> => {
      const events = await getBalanceTransferEvents(account.accountId);
      if (events.length === 0) return null;
      // getBalanceTransferEvents returns ascending by timestamp (lib/soe/adapter.ts).
      const latest = events[events.length - 1];
      if (latest.type === 'PROMO_EXPIRED') return null;
      const daysLeft = daysUntil(latest.promoEndDate);
      if (daysLeft <= 0 || daysLeft > windowDays) return null;

      const parties = await getPartiesForAccount(account.accountId);
      const primary = parties.find((p) => p.role.role === 'PRIMARY');
      return {
        accountId: account.accountId,
        partyName: primary?.party.fullName ?? account.accountId,
        remaining: latest.remainingBalance ?? latest.transferAmount,
        daysLeft,
        promoEndDate: latest.promoEndDate,
        goToApr: latest.goToApr,
      };
    }),
  );

  return perAccount
    .filter((m): m is ExpiringBt => m !== null)
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

async function resolveBtExpiringAccounts(windowDays: number): Promise<RenderInstruction> {
  const matches = await expiringBtAccounts(windowDays);

  const bars: BarBreakdownProps['bars'] = matches.map((m) => ({
    label: m.partyName,
    value: m.remaining,
    display: formatCurrency(m.remaining),
    detail: `Promo ends ${formatDate(m.promoEndDate)} · ${m.daysLeft} days · go-to ${m.goToApr.toFixed(2)}%`,
    tone: m.daysLeft <= BT_EXPIRING_WARNING_DAYS ? 'warning' : 'neutral',
  }));

  return validateInstruction({
    component: 'BarBreakdown',
    props: {
      title: `Balance transfers expiring within ${windowDays} days`,
      unit: 'currency',
      bars,
      footnote: `${matches.length} portfolio account${matches.length === 1 ? '' : 's'} with a BT promo ending within ${windowDays} days.`,
    },
  });
}

async function resolveRecentTransactions(
  accountId: string | undefined,
  months: number,
  limit: number,
): Promise<RenderInstruction> {
  const from = trailingWindowStart(months);
  const accounts: Account[] = accountId
    ? [await getAccount(accountId)]
    : await getPortfolioAccounts();

  const perAccount = await Promise.all(
    accounts.map(async (account) => {
      const txns = await getTransactions(account.accountId, { from });
      let accountLabel: string | undefined;
      if (!accountId) {
        const parties = await getPartiesForAccount(account.accountId);
        const primary = parties.find((p) => p.role.role === 'PRIMARY');
        accountLabel = `${primary?.party.fullName ?? account.accountId} · ${account.accountId}`;
      }
      return { txns, accountLabel };
    }),
  );

  const combined = perAccount
    .flatMap(({ txns, accountLabel }) => txns.map((txn) => ({ txn, accountLabel })))
    .sort((a, b) => b.txn.postedDate.localeCompare(a.txn.postedDate));

  const total = combined.length;
  const limited = combined.slice(0, limit);

  const rows: TransactionTableProps['rows'] = limited.map(({ txn, accountLabel }) => ({
    postedDate: formatDate(txn.postedDate),
    merchantName: txn.merchantName,
    category: txn.category,
    amount: formatCurrency(txn.amount),
    accountLabel,
  }));

  let title: string;
  if (accountId) {
    const parties = await getPartiesForAccount(accountId);
    const primary = parties.find((p) => p.role.role === 'PRIMARY');
    title = primary ? `Recent transactions — ${primary.party.fullName}` : `Recent transactions — ${accountId}`;
  } else {
    title = 'Recent transactions — portfolio-wide';
  }

  return validateInstruction({
    component: 'TransactionTable',
    props: {
      title,
      rows,
      footnote: `Showing ${rows.length} of ${total} transaction${total === 1 ? '' : 's'} · trailing ${months} month${months === 1 ? '' : 's'}`,
    },
  });
}

async function resolvePortfolioOverview(): Promise<RenderInstruction> {
  const accounts = await getPortfolioAccounts();
  const active = accounts.filter((a) => a.status === 'ACTIVE');
  const totalBalance = accounts.reduce((sum, a) => sum + a.currentBalance, 0);
  const totalLimit = accounts.reduce((sum, a) => sum + a.creditLimit, 0);
  const utilizationPct = totalLimit > 0 ? Math.round((totalBalance / totalLimit) * 100) : 0;

  const expiring = await expiringBtAccounts(PORTFOLIO_BT_HORIZON_DAYS);

  const metrics: MetricRowProps['metrics'] = [
    { label: 'Active Accounts', value: `${active.length}`, tone: 'neutral' },
    { label: 'Total Balance', value: formatCurrency(totalBalance), tone: 'neutral' },
    {
      label: 'Portfolio Utilization',
      value: `${utilizationPct}%`,
      tone: utilizationPct >= PORTFOLIO_UTILIZATION_WARNING_PCT ? 'warning' : 'neutral',
    },
    {
      label: `BTs Expiring ≤${PORTFOLIO_BT_HORIZON_DAYS}d`,
      value: `${expiring.length}`,
      tone: expiring.length > 0 ? 'warning' : 'neutral',
    },
  ];

  return validateInstruction({ component: 'MetricRow', props: { metrics } });
}

/** Dispatches an EvidenceSpec to its resolver. The only entry point
 * lib/agents/ask/tools.ts's `renderEvidence` tool calls. The evidence union
 * is shared across all agents (lib/registry/evidence.ts); this agent
 * resolves only the Ask kinds and throws on the rest — the tool surfaces
 * that as an output-error chip, never a crash (mirrors
 * lib/agents/payment-health/resolvers.ts's dispatch shape). */
export async function resolveEvidence(spec: EvidenceSpec): Promise<RenderInstruction> {
  switch (spec.component) {
    case 'MetricRow':
      if (spec.source.kind !== 'portfolio-overview') break;
      return resolvePortfolioOverview();
    case 'BarBreakdown':
      if (spec.source.kind === 'portfolio-category-spend') {
        return resolveCategorySpend('BarBreakdown', spec.source.months);
      }
      if (spec.source.kind === 'bt-expiring-accounts') {
        return resolveBtExpiringAccounts(spec.source.windowDays);
      }
      break;
    case 'CategoryPie':
      if (spec.source.kind !== 'portfolio-category-spend') break;
      return resolveCategorySpend('CategoryPie', spec.source.months);
    case 'TransactionTable':
      if (spec.source.kind !== 'recent-transactions') break;
      return resolveRecentTransactions(spec.source.accountId, spec.source.months, spec.source.limit);
  }
  throw new Error(
    `ask does not resolve "${spec.component}" evidence from source "${spec.source.kind}"`,
  );
}
