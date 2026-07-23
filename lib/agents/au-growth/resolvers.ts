// Pure functions mapping each AU Growth EvidenceSpec to a validated
// RenderInstruction, using only lib/soe adapter calls. This is where Beat 4's
// intelligence actually lives (brief §5a/§5b, §3 Beat 4): the model picks
// WHICH evidence to fetch and for WHICH party; every figure that reaches a
// screen — including the graduation-candidate highlight — is computed here,
// from adapter data, and validated against the registry schema before it can
// stream. Beat 4 is an invitation, never an "offer" or credit-terms language
// (brief §9) — this file only supplies numbers, so that guardrail lives in
// the agent's narration/outreach copy, not here.

import { getAccount, getAnchor, getPartiesForAccount, getPayments, getTransactions } from '@/lib/soe';
import type { Transaction } from '@/lib/soe';
import type { EvidenceSpec } from '@/lib/registry/evidence';
import {
  renderInstructionSchema,
  type MetricRowProps,
  type PartyGraphProps,
  type RenderInstruction,
} from '@/lib/registry/schemas';
import {
  formatCurrency,
  formatMonthYear,
  monthLabels,
  shiftDays,
  titleCase,
} from '@/lib/agents/format';

/** A statement's spend-attribution window: (start, end] over posted dates
 * (ISO YYYY-MM-DD strings, compared lexicographically). */
interface StatementWindow {
  start: string;
  end: string;
}

function validateInstruction(instruction: RenderInstruction): RenderInstruction {
  return renderInstructionSchema.parse(instruction);
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Reconstructs statement windows purely from adapter data. The adapter never
 * exposes a statement-close date directly, but every payment's due date is
 * fixed at close + 21 days (brief §3 Beat 4 story spec), so
 * `close[i] = dueDate[i] − 21d` recovers it. Each window runs from the prior
 * close (exclusive) to this close (inclusive); the oldest window's start is
 * synthesized as `close[0] − 30d` (the seed's statement cadence) since there
 * is no payment before it to read a prior close from.
 */
async function accountStatementWindows(
  accountId: string,
): Promise<{ windows: StatementWindow[]; transactions: Transaction[] }> {
  const [payments, transactions] = await Promise.all([
    getPayments(accountId),
    getTransactions(accountId),
  ]);

  const chronological = [...payments].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const closes = chronological.map((p) => shiftDays(p.dueDate, -21));
  const windows: StatementWindow[] = closes.map((end, i) => ({
    start: i === 0 ? shiftDays(closes[0], -30) : closes[i - 1],
    end,
  }));

  return { windows, transactions };
}

function windowPurchaseTotalCents(
  transactions: Transaction[],
  partyId: string,
  window: StatementWindow,
): number {
  return transactions
    .filter((t) => t.partyId === partyId && t.type === 'PURCHASE')
    .filter((t) => {
      const posted = t.postedDate.slice(0, 10);
      return posted > window.start && posted <= window.end;
    })
    .reduce((sum, t) => sum + Math.round(t.amount * 100), 0);
}

/** Per-party monthly totals (cents), oldest window first, aligned 1:1 with
 * `windows`. Reproduces the seed's DEV_MONTHLY_CENTS exactly (resolvers.test.ts). */
async function partyMonthlyTotalsCents(
  accountId: string,
  partyId: string,
): Promise<{ windows: StatementWindow[]; totalsCents: number[] }> {
  const { windows, transactions } = await accountStatementWindows(accountId);
  const totalsCents = windows.map((w) => windowPurchaseTotalCents(transactions, partyId, w));
  return { windows, totalsCents };
}

const MS_PER_YEAR = 365.25 * 86_400_000;

function ageFromDateOfBirth(dateOfBirth: string): number {
  const dobMs = new Date(`${dateOfBirth.slice(0, 10)}T00:00:00.000Z`).getTime();
  return Math.floor((getAnchor().getTime() - dobMs) / MS_PER_YEAR);
}

/**
 * The graduation-candidate rule (brief §3 Beat 4): an authorized user whose
 * most recent 3-month spend average is at least 3x their earliest 3-month
 * average (and that earliest average is nonzero) reads as an AU who has
 * grown into independent spending. With the seed this marks Dev, and only
 * Dev — Anand and Priya hold flat bands by design.
 */
function isGraduationCandidate(monthlyTotalsCents: number[]): boolean {
  const last12 = monthlyTotalsCents.slice(-12);
  const firstThreeAvg = average(last12.slice(0, 3));
  const lastThreeAvg = average(last12.slice(-3));
  return firstThreeAvg > 0 && lastThreeAvg >= 3 * firstThreeAvg;
}

async function resolveHouseholdOverview(accountId: string): Promise<RenderInstruction> {
  const [account, accountParties] = await Promise.all([
    getAccount(accountId),
    getPartiesForAccount(accountId),
  ]);

  const primary = accountParties.find((ap) => ap.role.role === 'PRIMARY');
  if (!primary) throw new Error(`au-growth: account "${accountId}" has no PRIMARY party`);

  const authorizedUsers = accountParties
    .filter((ap) => ap.role.role === 'AUTHORIZED_USER')
    .sort((a, b) => a.role.addedDate.localeCompare(b.role.addedDate));

  const auHighlights = await Promise.all(
    authorizedUsers.map(async (ap) => {
      const { totalsCents } = await partyMonthlyTotalsCents(accountId, ap.party.partyId);
      return isGraduationCandidate(totalsCents);
    }),
  );

  const surname = primary.party.fullName.trim().split(/\s+/).pop() ?? primary.party.fullName;

  const parties: PartyGraphProps['parties'] = [
    {
      id: primary.party.partyId,
      name: primary.party.fullName,
      role: 'PRIMARY',
      detail: `Primary since ${formatMonthYear(primary.role.addedDate)}`,
      highlight: false,
    },
    ...authorizedUsers.map((ap, i) => ({
      id: ap.party.partyId,
      name: ap.party.fullName,
      role: 'AUTHORIZED_USER' as const,
      detail: `Authorized user since ${formatMonthYear(ap.role.addedDate)} · Age ${ageFromDateOfBirth(ap.party.dateOfBirth)}`,
      highlight: auHighlights[i],
    })),
  ];

  return validateInstruction({
    component: 'PartyGraph',
    props: {
      title: 'Household relationship map',
      account: {
        label: `${surname} household card`,
        detail: `Open since ${formatMonthYear(account.openedDate)} · ${formatCurrency(account.creditLimit)} limit`,
      },
      parties,
    },
  });
}

async function resolveAuSpendTrend(
  accountId: string,
  partyId: string,
  months: number,
): Promise<RenderInstruction> {
  const accountParties = await getPartiesForAccount(accountId);
  const match = accountParties.find((ap) => ap.party.partyId === partyId);
  if (!match) throw new Error(`au-growth: party "${partyId}" is not on account "${accountId}"`);

  const { windows, totalsCents } = await partyMonthlyTotalsCents(accountId, partyId);
  const take = Math.min(months, windows.length);
  const recentWindows = windows.slice(-take);
  const recentTotalsCents = totalsCents.slice(-take);
  const labels = monthLabels(recentWindows.map((w) => w.end));

  return validateInstruction({
    component: 'TrendChart',
    props: {
      title: `Attributed spend — ${match.party.fullName}`,
      unit: 'currency',
      series: [
        {
          id: 'au-spend',
          label: match.party.fullName,
          points: recentTotalsCents.map((cents, i) => ({ label: labels[i], value: cents / 100 })),
        },
      ],
    },
  });
}

async function resolveAuRecurringSpend(
  accountId: string,
  partyId: string,
): Promise<RenderInstruction> {
  const { windows, transactions } = await accountStatementWindows(accountId);
  const lastThreeWindows = windows.slice(-3);

  const partyPurchases = transactions.filter(
    (t) => t.partyId === partyId && t.type === 'PURCHASE',
  );

  // Per-window per-merchant totals, so "recurring" means an identical total
  // in every one of the last 3 windows — not merely present in all of them.
  const perWindowMerchantTotals = lastThreeWindows.map((window) => {
    const totals = new Map<string, number>();
    for (const t of partyPurchases) {
      const posted = t.postedDate.slice(0, 10);
      if (!(posted > window.start && posted <= window.end)) continue;
      totals.set(t.merchantName, (totals.get(t.merchantName) ?? 0) + Math.round(t.amount * 100));
    }
    return totals;
  });

  const merchantCategory = new Map<string, Transaction['category']>();
  for (const t of partyPurchases) {
    if (!merchantCategory.has(t.merchantName)) merchantCategory.set(t.merchantName, t.category);
  }

  const merchantNames = new Set<string>();
  for (const windowTotals of perWindowMerchantTotals) {
    for (const name of windowTotals.keys()) merchantNames.add(name);
  }

  const recurring: { merchant: string; cents: number; category: Transaction['category'] }[] = [];
  for (const merchant of merchantNames) {
    const amounts = perWindowMerchantTotals.map((windowTotals) => windowTotals.get(merchant));
    if (amounts.some((amount) => amount === undefined)) continue;
    const [first, ...rest] = amounts as number[];
    if (rest.every((amount) => amount === first)) {
      const category = merchantCategory.get(merchant);
      if (category) recurring.push({ merchant, cents: first, category });
    }
  }

  recurring.sort((a, b) => b.cents - a.cents);

  const metrics: MetricRowProps['metrics'] = recurring.map((r) => ({
    label: r.merchant,
    value: formatCurrency(r.cents / 100),
    delta: `Monthly · ${titleCase(r.category)}`,
    tone: 'neutral',
  }));

  return validateInstruction({ component: 'MetricRow', props: { metrics } });
}

/** Dispatches an EvidenceSpec to its resolver. The only entry point
 * lib/agents/au-growth/tools.ts's `renderEvidence` tool calls. The evidence
 * union is shared across all agents (lib/registry/evidence.ts); this agent
 * resolves only the AU Growth kinds and throws on the rest — the tool
 * surfaces that as an output-error chip, never a crash (mirrors
 * lib/agents/payment-health/resolvers.ts's dispatch shape). */
export async function resolveEvidence(spec: EvidenceSpec): Promise<RenderInstruction> {
  switch (spec.component) {
    case 'PartyGraph':
      return resolveHouseholdOverview(spec.source.accountId);
    case 'TrendChart':
      if (spec.source.kind !== 'au-spend-trend') break;
      return resolveAuSpendTrend(spec.source.accountId, spec.source.partyId, spec.source.months);
    case 'MetricRow':
      if (spec.source.kind !== 'au-recurring-spend') break;
      return resolveAuRecurringSpend(spec.source.accountId, spec.source.partyId);
  }
  throw new Error(
    `au-growth does not resolve "${spec.component}" evidence from source "${spec.source.kind}"`,
  );
}
