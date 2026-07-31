// Pure functions mapping each servicing EvidenceSpec to a validated
// RenderInstruction, using only lib/soe adapter calls (brief §5a/§5b, §7b).
// This is the servicing chatbot's version of lib/agents/ask/resolvers.ts —
// same shape, one crucial difference: every function here is a ZERO-ARGUMENT
// (or account-agnostic) function with respect to identity. There is no
// `accountId`/`partyId` parameter to accept, validate, or ignore anywhere a
// model-supplied tool-call value could land — brief §7a says "resolvers
// ignore any model-supplied account id," and the way this file honors that
// is by never declaring the parameter in the first place, not by accepting
// one and discarding it.
//
// Persona pinning (DEMO_BUILD_PLAN.md D6, Wave 2 Agent E work item 1): the
// pinned identity is now a per-request value (happy → Anand Patel, blocked
// → Marcus Webb — lib/agents/servicing/identity.ts), so the "closes over a
// module-level constant" shape this file used before would leak identity
// across two concurrent requests pinned to different personas. Instead,
// `createServicingResolvers(identity)` is a factory — called once per agent
// construction (lib/agents/servicing/agent.ts's createServicingAgent, itself
// already a per-request factory for runId/agentId) — whose returned
// functions close over that ONE identity for their entire lifetime. The
// structural-pinning invariant survives intact: nothing below ever gains an
// identity parameter a model's tool-call JSON could occupy; it's just
// parameterized one level up, at construction, exactly the way runId/agentId
// already are for every agent in this codebase.
//
// lib/agents/servicing/resolvers.test.ts is the proof: it builds two
// resolver sets from two different identities (happy/Patel, blocked/Marcus)
// and asserts each set only ever answers with its own identity's data —
// never the other's, and never a model-injected one (a hand-built spec
// carrying a bogus, schema-illegal `accountId` field, bypassing
// evidenceSpecSchema entirely, the way a misbehaving model's raw tool-call
// JSON theoretically could before validation).

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
import { identityForPersona, type ServicingIdentity } from './identity';

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

export interface ServicingResolvers {
  resolveEvidence(spec: EvidenceSpec): Promise<RenderInstruction>;
  resolveNextPayment(): Promise<RenderInstruction>;
  resolveNextStatement(): Promise<RenderInstruction>;
  resolveAccountSummary(): Promise<RenderInstruction>;
  resolveRecentTransactions(months: number, limit: number): Promise<RenderInstruction>;
  resolveCategorySpend(months: number): Promise<RenderInstruction>;
}

/** Builds the servicing evidence resolvers bound to ONE identity for their
 * entire lifetime (see this file's header). Call once per agent
 * construction — lib/agents/servicing/agent.ts's createServicingAgent is the
 * only real caller; lib/agents/servicing/resolvers.test.ts calls it directly
 * to prove the pinning. */
export function createServicingResolvers(identity: ServicingIdentity): ServicingResolvers {
  const { accountId } = identity;

  /** "When is my next payment due?" (brief §7b) — due date, amount due,
   * minimum due, and channel, from the pinned account's SCHEDULED payment. */
  async function resolveNextPayment(): Promise<RenderInstruction> {
    const payments = await getPayments(accountId);
    const scheduled = payments.find((p) => p.status === 'SCHEDULED');

    // Not every pinned persona carries a SCHEDULED payment — Marcus Webb's
    // (the "blocked" persona) most recent payment is MISSED, never
    // SCHEDULED (lib/soe/seed/marcus.ts). Kept truthful rather than
    // throwing so this evidence kind degrades to an honest empty state
    // instead of erroring the whole turn (brief §5a: no invented state).
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

  /**
   * "What is my next statement?" (DEMO_THESIS.md Use case 2). Data-honesty
   * note (Wave 2 Agent E work item 2): lib/soe has no separate Statement
   * entity distinct from the account's own SCHEDULED Payment record —
   * lib/soe/types.ts's Payment (dueDate/amountDue/minimumDue) already ARE a
   * statement's own figures; the seed generator's own comments call that
   * record "the M0 statement" (lib/soe/seed/patel.ts). There is no stored
   * statement-CLOSING date distinct from the payment due date, so this
   * resolver does not invent one. What makes this a genuinely different
   * answer from "next payment" rather than a relabeled duplicate: it drops
   * the payment-channel framing and instead pairs the statement's own total
   * (renamed "Statement Balance" — still `scheduled.amountDue`, the exact
   * figure the statement itself carries) with the account's LIVE running
   * balance (`getAccount`, not sourced from the payment at all) — "what your
   * last statement said you owed" next to "what you owe right now," which a
   * payment-only view can't show. Same honest empty-state shape as
   * resolveNextPayment when there's no SCHEDULED payment to source from.
   */
  async function resolveNextStatement(): Promise<RenderInstruction> {
    const [payments, account] = await Promise.all([getPayments(accountId), getAccount(accountId)]);
    const scheduled = payments.find((p) => p.status === 'SCHEDULED');

    if (!scheduled) {
      return validateInstruction({
        component: 'MetricRow',
        props: {
          metrics: [
            { label: 'Next Statement', value: 'No statement currently scheduled', tone: 'neutral' },
            { label: 'Current Balance', value: formatCurrency(account.currentBalance), tone: 'neutral' },
          ],
        },
      });
    }

    const metrics: MetricRowProps['metrics'] = [
      { label: 'Statement Balance', value: formatCurrency(scheduled.amountDue), tone: 'neutral' },
      { label: 'Current Balance', value: formatCurrency(account.currentBalance), tone: 'neutral' },
      { label: 'Minimum Due', value: formatCurrency(scheduled.minimumDue), tone: 'neutral' },
      { label: 'Due Date', value: formatDate(scheduled.dueDate), tone: 'neutral' },
    ];
    return validateInstruction({ component: 'MetricRow', props: { metrics } });
  }

  /** "What's my balance / available credit?" (brief §7b) — balance, available
   * credit, utilization, purchase APR, from the pinned account. */
  async function resolveAccountSummary(): Promise<RenderInstruction> {
    const account = await getAccount(accountId);
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
   * transactions, most recent first. */
  async function resolveRecentTransactions(months: number, limit: number): Promise<RenderInstruction> {
    const from = trailingWindowStart(months);
    // getTransactions already sorts most-recent-first (lib/soe/adapter.ts).
    const all = await getTransactions(accountId, { from });
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
   * spend by category, trailing N months. */
  async function resolveCategorySpend(months: number): Promise<RenderInstruction> {
    const from = trailingWindowStart(months);
    const txns = await getTransactions(accountId, { from });

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
   * lib/agents/servicing/tools.ts's `renderEvidence` tool calls. Resolves
   * only the servicing-prefixed kinds (brief §7b) and throws on the rest,
   * mirroring every other agent's resolver dispatch
   * (lib/agents/ask/resolvers.ts's `resolveEvidence` is the direct
   * template). */
  async function resolveEvidence(spec: EvidenceSpec): Promise<RenderInstruction> {
    switch (spec.component) {
      case 'MetricRow': {
        if (spec.source.kind === 'servicing-next-payment') return resolveNextPayment();
        if (spec.source.kind === 'servicing-next-statement') return resolveNextStatement();
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

  return {
    resolveEvidence,
    resolveNextPayment,
    resolveNextStatement,
    resolveAccountSummary,
    resolveRecentTransactions,
    resolveCategorySpend,
  };
}

// Back-compat singleton (Wave 2 Agent E persona-pinning refactor) — bound to
// the 'happy' persona (Anand Patel), exactly this module's
// pre-persona-pinning behavior. lib/agents/scripts.test.ts's cross-agent
// script suite still imports `resolveEvidence` this way; new code should
// prefer calling `createServicingResolvers` directly with the request's own
// resolved identity (lib/agents/servicing/agent.ts is the reference).
export const { resolveEvidence } = createServicingResolvers(identityForPersona('happy'));
