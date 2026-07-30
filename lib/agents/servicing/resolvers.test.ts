// Tests for lib/agents/servicing/resolvers.ts. Three concerns:
//  (a) grounding — every preformatted value a resolver returns reconciles
//      with a fresh, independent lib/soe read (never re-derived from the
//      resolver's own computation), mirroring
//      lib/agents/ask/resolvers.test.ts's pattern. Exercised against the
//      'happy' persona (Anand Patel), same as before persona pinning
//      existed.
//  (b) honesty for the 'blocked' persona (Marcus Webb) — DEMO_BUILD_PLAN.md
//      D6 / Wave 2 Agent E work item 1: every evidence kind must answer for
//      him without throwing, degrading to a truthful empty state where the
//      seed genuinely has nothing (he carries no SCHEDULED payment), never
//      inventing one.
//  (c) identity pinning (brief §7a — "the governance point of the entire
//      surface") under the factory design (Wave 2 Agent E work item 1):
//      two resolver sets built from two different identities never answer
//      with each other's data, and a resolver has no accountId parameter a
//      model-supplied tool-call value could occupy in the first place — a
//      hand-built spec carrying a bogus, schema-illegal `accountId` field
//      (bypassing evidenceSpecSchema entirely, the way a misbehaving
//      model's raw tool-call JSON theoretically could before validation)
//      still returns the resolver set's OWN identity's data, regardless of
//      what the injected field says.

import { describe, expect, it } from 'vitest';
import { getAccount, getPayments, getTransactions } from '@/lib/soe';
import { formatCurrency, formatDate, titleCase } from '@/lib/agents/format';
import type { EvidenceSpec } from '@/lib/registry/evidence';
import { identityForPersona } from './identity';
import { createServicingResolvers } from './resolvers';

const PATEL_ACCOUNT_ID = 'acct-patel';
// lib/soe/seed/marcus.ts's MARCUS_ACCOUNT_ID — not imported directly (seed
// modules are internal to lib/soe); used here only as the 'blocked'
// persona's own pinned account, and as an injected, illegal accountId to
// prove a resolver never reads one from the spec.
const MARCUS_ACCOUNT_ID = 'acct-marcus';

const happyResolvers = createServicingResolvers(identityForPersona('happy'));
const blockedResolvers = createServicingResolvers(identityForPersona('blocked'));

/** Smuggles an extra `accountId` field onto a servicing evidence spec that
 * doesn't declare one — evidenceSpecSchema.parse() would strip it, but this
 * calls resolveEvidence directly, below the schema, to prove the resolver
 * itself never reads it (not merely that the schema never lets it through). */
function withInjectedAccountId(spec: EvidenceSpec, injectedAccountId: string): EvidenceSpec {
  return { ...spec, source: { ...spec.source, accountId: injectedAccountId } } as unknown as EvidenceSpec;
}

describe('servicing resolvers — grounding (happy persona / Anand Patel)', () => {
  it('resolveNextPayment matches the pinned account\'s SCHEDULED payment', async () => {
    const scheduled = (await getPayments(PATEL_ACCOUNT_ID)).find((p) => p.status === 'SCHEDULED');
    expect(scheduled).toBeTruthy();

    const instruction = await happyResolvers.resolveEvidence({
      component: 'MetricRow',
      source: { kind: 'servicing-next-payment' },
    });
    if (instruction.component !== 'MetricRow') throw new Error('unreachable');
    const dueDate = instruction.props.metrics.find((m) => m.label === 'Due Date')?.value;
    const amountDue = instruction.props.metrics.find((m) => m.label === 'Amount Due')?.value;

    expect(dueDate).toBe(formatDate(scheduled!.dueDate));
    expect(amountDue).toBe(formatCurrency(scheduled!.amountDue));
  });

  it('resolveNextStatement matches the pinned account\'s SCHEDULED payment and current balance', async () => {
    const scheduled = (await getPayments(PATEL_ACCOUNT_ID)).find((p) => p.status === 'SCHEDULED');
    const account = await getAccount(PATEL_ACCOUNT_ID);
    expect(scheduled).toBeTruthy();

    const instruction = await happyResolvers.resolveEvidence({
      component: 'MetricRow',
      source: { kind: 'servicing-next-statement' },
    });
    if (instruction.component !== 'MetricRow') throw new Error('unreachable');

    expect(instruction.props.metrics.find((m) => m.label === 'Statement Balance')?.value).toBe(
      formatCurrency(scheduled!.amountDue),
    );
    expect(instruction.props.metrics.find((m) => m.label === 'Current Balance')?.value).toBe(
      formatCurrency(account.currentBalance),
    );
    expect(instruction.props.metrics.find((m) => m.label === 'Minimum Due')?.value).toBe(
      formatCurrency(scheduled!.minimumDue),
    );
    expect(instruction.props.metrics.find((m) => m.label === 'Due Date')?.value).toBe(
      formatDate(scheduled!.dueDate),
    );
  });

  it('resolveAccountSummary matches a fresh getAccount read', async () => {
    const account = await getAccount(PATEL_ACCOUNT_ID);
    const instruction = await happyResolvers.resolveEvidence({
      component: 'MetricRow',
      source: { kind: 'servicing-account-summary' },
    });
    if (instruction.component !== 'MetricRow') throw new Error('unreachable');

    expect(instruction.props.metrics.find((m) => m.label === 'Balance')?.value).toBe(
      formatCurrency(account.currentBalance),
    );
    expect(instruction.props.metrics.find((m) => m.label === 'Available Credit')?.value).toBe(
      formatCurrency(account.availableCredit),
    );
    expect(instruction.props.metrics.find((m) => m.label === 'Purchase APR')?.value).toBe(
      `${account.purchaseApr.toFixed(2)}%`,
    );
  });

  it('resolveRecentTransactions matches a fresh getTransactions read, most-recent-first', async () => {
    const instruction = await happyResolvers.resolveEvidence({
      component: 'TransactionTable',
      source: { kind: 'servicing-recent-transactions', months: 3, limit: 15 },
    });
    if (instruction.component !== 'TransactionTable') throw new Error('unreachable');
    expect(instruction.props.rows.length).toBeGreaterThan(0);

    const all = await getTransactions(PATEL_ACCOUNT_ID);
    const first = all[0];
    expect(instruction.props.rows[0]?.merchantName).toBe(first.merchantName);
    expect(instruction.props.rows[0]?.amount).toBe(formatCurrency(first.amount));
    expect(instruction.props.rows[0]?.category).toBe(first.category);
  });

  it('resolveCategorySpend returns whole-percent shares that sum to 100', async () => {
    const instruction = await happyResolvers.resolveEvidence({
      component: 'CategoryPie',
      source: { kind: 'servicing-category-spend', months: 3 },
    });
    if (instruction.component !== 'CategoryPie') throw new Error('unreachable');
    expect(instruction.props.slices.length).toBeGreaterThanOrEqual(2);
    const shareSum = instruction.props.slices.reduce(
      (sum, s) => sum + Number.parseInt(s.share, 10),
      0,
    );
    expect(shareSum).toBe(100);
  });

  it('the "Channel" metric is title-cased from the payment channel enum', async () => {
    const scheduled = (await getPayments(PATEL_ACCOUNT_ID)).find((p) => p.status === 'SCHEDULED');
    const instruction = await happyResolvers.resolveEvidence({
      component: 'MetricRow',
      source: { kind: 'servicing-next-payment' },
    });
    if (instruction.component !== 'MetricRow') throw new Error('unreachable');
    expect(instruction.props.metrics.find((m) => m.label === 'Channel')?.value).toBe(
      titleCase(scheduled!.channel),
    );
  });
});

describe('servicing resolvers — honesty for the blocked persona (Marcus Webb)', () => {
  it('resolveNextPayment degrades to an honest empty state — Marcus has no SCHEDULED payment', async () => {
    const scheduled = (await getPayments(MARCUS_ACCOUNT_ID)).find((p) => p.status === 'SCHEDULED');
    expect(scheduled).toBeUndefined();

    const instruction = await blockedResolvers.resolveEvidence({
      component: 'MetricRow',
      source: { kind: 'servicing-next-payment' },
    });
    if (instruction.component !== 'MetricRow') throw new Error('unreachable');
    expect(instruction.props.metrics.find((m) => m.label === 'Next Payment')?.value).toBe(
      'No payment currently scheduled',
    );
  });

  it('resolveNextStatement degrades to an honest empty state but still shows a real current balance', async () => {
    const account = await getAccount(MARCUS_ACCOUNT_ID);
    const instruction = await blockedResolvers.resolveEvidence({
      component: 'MetricRow',
      source: { kind: 'servicing-next-statement' },
    });
    if (instruction.component !== 'MetricRow') throw new Error('unreachable');
    expect(instruction.props.metrics.find((m) => m.label === 'Next Statement')?.value).toBe(
      'No statement currently scheduled',
    );
    expect(instruction.props.metrics.find((m) => m.label === 'Current Balance')?.value).toBe(
      formatCurrency(account.currentBalance),
    );
  });

  it('resolveAccountSummary answers for Marcus with his own real balance', async () => {
    const account = await getAccount(MARCUS_ACCOUNT_ID);
    const instruction = await blockedResolvers.resolveEvidence({
      component: 'MetricRow',
      source: { kind: 'servicing-account-summary' },
    });
    if (instruction.component !== 'MetricRow') throw new Error('unreachable');
    expect(instruction.props.metrics.find((m) => m.label === 'Balance')?.value).toBe(
      formatCurrency(account.currentBalance),
    );
  });

  it('resolveRecentTransactions and resolveCategorySpend never throw for Marcus — he has PURCHASE history', async () => {
    const txnInstruction = await blockedResolvers.resolveEvidence({
      component: 'TransactionTable',
      source: { kind: 'servicing-recent-transactions', months: 3, limit: 15 },
    });
    if (txnInstruction.component !== 'TransactionTable') throw new Error('unreachable');
    expect(txnInstruction.props.rows.length).toBeGreaterThan(0);

    const categoryInstruction = await blockedResolvers.resolveEvidence({
      component: 'CategoryPie',
      source: { kind: 'servicing-category-spend', months: 3 },
    });
    if (categoryInstruction.component !== 'CategoryPie') throw new Error('unreachable');
    expect(categoryInstruction.props.slices.length).toBeGreaterThan(0);
  });
});

describe('servicing resolvers — identity pinning (brief §7a, factory design)', () => {
  it('two resolver sets built from different identities never answer with the other\'s data', async () => {
    const patelAccount = await getAccount(PATEL_ACCOUNT_ID);
    const marcusAccount = await getAccount(MARCUS_ACCOUNT_ID);
    expect(patelAccount.currentBalance).not.toBe(marcusAccount.currentBalance);

    const happyInstruction = await happyResolvers.resolveEvidence({
      component: 'MetricRow',
      source: { kind: 'servicing-account-summary' },
    });
    const blockedInstruction = await blockedResolvers.resolveEvidence({
      component: 'MetricRow',
      source: { kind: 'servicing-account-summary' },
    });
    if (happyInstruction.component !== 'MetricRow' || blockedInstruction.component !== 'MetricRow') {
      throw new Error('unreachable');
    }

    expect(happyInstruction.props.metrics.find((m) => m.label === 'Balance')?.value).toBe(
      formatCurrency(patelAccount.currentBalance),
    );
    expect(blockedInstruction.props.metrics.find((m) => m.label === 'Balance')?.value).toBe(
      formatCurrency(marcusAccount.currentBalance),
    );
  });

  it('resolveNextPayment ignores an injected accountId and still returns its OWN identity\'s data', async () => {
    const scheduled = (await getPayments(PATEL_ACCOUNT_ID)).find((p) => p.status === 'SCHEDULED');
    const spec = withInjectedAccountId(
      { component: 'MetricRow', source: { kind: 'servicing-next-payment' } },
      MARCUS_ACCOUNT_ID,
    );

    const instruction = await happyResolvers.resolveEvidence(spec);
    if (instruction.component !== 'MetricRow') throw new Error('unreachable');

    // Marcus (the injected id) has NO scheduled payment at all — if this had
    // read the injected id, the resolver's own fallback branch would fire
    // ("No payment currently scheduled") instead of a real due date.
    const dueDate = instruction.props.metrics.find((m) => m.label === 'Due Date')?.value;
    expect(dueDate).toBe(formatDate(scheduled!.dueDate));
    expect(instruction.props.metrics.some((m) => m.label === 'Next Payment')).toBe(false);
  });

  it('resolveAccountSummary ignores an injected accountId and still returns its OWN identity\'s balance', async () => {
    const patelAccount = await getAccount(PATEL_ACCOUNT_ID);
    const marcusAccount = await getAccount(MARCUS_ACCOUNT_ID);

    const spec = withInjectedAccountId(
      { component: 'MetricRow', source: { kind: 'servicing-account-summary' } },
      MARCUS_ACCOUNT_ID,
    );
    const instruction = await happyResolvers.resolveEvidence(spec);
    if (instruction.component !== 'MetricRow') throw new Error('unreachable');

    expect(instruction.props.metrics.find((m) => m.label === 'Balance')?.value).toBe(
      formatCurrency(patelAccount.currentBalance),
    );
    expect(instruction.props.metrics.find((m) => m.label === 'Balance')?.value).not.toBe(
      formatCurrency(marcusAccount.currentBalance),
    );
  });

  it('resolveRecentTransactions and resolveCategorySpend ignore an injected accountId too', async () => {
    const patelTxns = await getTransactions(PATEL_ACCOUNT_ID);
    const marcusTxns = await getTransactions(MARCUS_ACCOUNT_ID);
    expect(patelTxns[0]?.merchantName).not.toBe(marcusTxns[0]?.merchantName);

    const txnSpec = withInjectedAccountId(
      { component: 'TransactionTable', source: { kind: 'servicing-recent-transactions', months: 3, limit: 15 } },
      MARCUS_ACCOUNT_ID,
    );
    const txnInstruction = await happyResolvers.resolveEvidence(txnSpec);
    if (txnInstruction.component !== 'TransactionTable') throw new Error('unreachable');
    expect(txnInstruction.props.rows[0]?.merchantName).toBe(patelTxns[0]?.merchantName);

    const categorySpec = withInjectedAccountId(
      { component: 'CategoryPie', source: { kind: 'servicing-category-spend', months: 3 } },
      MARCUS_ACCOUNT_ID,
    );
    const categoryInstruction = await happyResolvers.resolveEvidence(categorySpec);
    if (categoryInstruction.component !== 'CategoryPie') throw new Error('unreachable');
    expect(categoryInstruction.props.slices.length).toBeGreaterThanOrEqual(2);
  });
});
