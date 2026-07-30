// Tests for lib/agents/servicing/resolvers.ts. Two concerns:
//  (a) grounding — every preformatted value resolveEvidence returns
//      reconciles with a fresh, independent lib/soe read (never re-derived
//      from the resolver's own computation), mirroring
//      lib/agents/ask/resolvers.test.ts's pattern.
//  (b) identity pinning (brief §7a — "the governance point of the entire
//      surface"). This is the artifact the report calls out: resolveEvidence
//      is called with a spec object carrying a bogus `accountId` field that
//      evidenceSpecSchema's servicing-prefixed kinds don't even declare —
//      constructed here with a cast to bypass the schema entirely (the way a
//      misbehaving model's raw tool-call JSON theoretically could arrive
//      before validation), pointed at Marcus's account. Marcus never has a
//      SCHEDULED payment (lib/soe/seed/marcus.ts — his only payment due
//      today is MISSED) and a different balance/utilization than Patel's
//      account. If the resolver read that injected id, resolveNextPayment
//      would hit its "no payment scheduled" fallback and
//      resolveAccountSummary would return Marcus's figures. It does neither:
//      every resolver in this file has no accountId parameter to read one
//      from in the first place.

import { describe, expect, it } from 'vitest';
import { getAccount, getPayments, getTransactions } from '@/lib/soe';
import { formatCurrency, formatDate, titleCase } from '@/lib/agents/format';
import type { EvidenceSpec } from '@/lib/registry/evidence';
import { resolveEvidence } from './resolvers';

const PINNED_ACCOUNT_ID = 'acct-patel';
// lib/soe/seed/marcus.ts's MARCUS_ACCOUNT_ID — not imported directly (seed
// modules are internal to lib/soe); used here only as an injected, illegal
// accountId to prove the resolver never reads it.
const OTHER_ACCOUNT_ID = 'acct-marcus';

/** Smuggles an extra `accountId` field onto a servicing evidence spec that
 * doesn't declare one — evidenceSpecSchema.parse() would strip it, but this
 * calls resolveEvidence directly, below the schema, to prove the resolver
 * itself never reads it (not merely that the schema never lets it through). */
function withInjectedAccountId(spec: EvidenceSpec): EvidenceSpec {
  return { ...spec, source: { ...spec.source, accountId: OTHER_ACCOUNT_ID } } as unknown as EvidenceSpec;
}

describe('servicing resolvers — grounding', () => {
  it('resolveNextPayment matches the pinned account\'s SCHEDULED payment', async () => {
    const scheduled = (await getPayments(PINNED_ACCOUNT_ID)).find((p) => p.status === 'SCHEDULED');
    expect(scheduled).toBeTruthy();

    const instruction = await resolveEvidence({
      component: 'MetricRow',
      source: { kind: 'servicing-next-payment' },
    });
    if (instruction.component !== 'MetricRow') throw new Error('unreachable');
    const dueDate = instruction.props.metrics.find((m) => m.label === 'Due Date')?.value;
    const amountDue = instruction.props.metrics.find((m) => m.label === 'Amount Due')?.value;

    expect(dueDate).toBe(formatDate(scheduled!.dueDate));
    expect(amountDue).toBe(formatCurrency(scheduled!.amountDue));
  });

  it('resolveAccountSummary matches a fresh getAccount read', async () => {
    const account = await getAccount(PINNED_ACCOUNT_ID);
    const instruction = await resolveEvidence({
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
    const instruction = await resolveEvidence({
      component: 'TransactionTable',
      source: { kind: 'servicing-recent-transactions', months: 3, limit: 15 },
    });
    if (instruction.component !== 'TransactionTable') throw new Error('unreachable');
    expect(instruction.props.rows.length).toBeGreaterThan(0);

    const all = await getTransactions(PINNED_ACCOUNT_ID);
    const first = all[0];
    expect(instruction.props.rows[0]?.merchantName).toBe(first.merchantName);
    expect(instruction.props.rows[0]?.amount).toBe(formatCurrency(first.amount));
    expect(instruction.props.rows[0]?.category).toBe(first.category);
  });

  it('resolveCategorySpend returns whole-percent shares that sum to 100', async () => {
    const instruction = await resolveEvidence({
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
    const scheduled = (await getPayments(PINNED_ACCOUNT_ID)).find((p) => p.status === 'SCHEDULED');
    const instruction = await resolveEvidence({
      component: 'MetricRow',
      source: { kind: 'servicing-next-payment' },
    });
    if (instruction.component !== 'MetricRow') throw new Error('unreachable');
    expect(instruction.props.metrics.find((m) => m.label === 'Channel')?.value).toBe(
      titleCase(scheduled!.channel),
    );
  });
});

describe('servicing resolvers — identity pinning (brief §7a)', () => {
  it('resolveNextPayment ignores an injected accountId and still returns the pinned account\'s data', async () => {
    const scheduled = (await getPayments(PINNED_ACCOUNT_ID)).find((p) => p.status === 'SCHEDULED');
    const spec = withInjectedAccountId({
      component: 'MetricRow',
      source: { kind: 'servicing-next-payment' },
    });

    const instruction = await resolveEvidence(spec);
    if (instruction.component !== 'MetricRow') throw new Error('unreachable');

    // Marcus (the injected id) has NO scheduled payment at all — if this had
    // read the injected id, the resolver's own fallback branch would fire
    // ("No payment currently scheduled") instead of a real due date.
    const dueDate = instruction.props.metrics.find((m) => m.label === 'Due Date')?.value;
    expect(dueDate).toBe(formatDate(scheduled!.dueDate));
    expect(instruction.props.metrics.some((m) => m.label === 'Next Payment')).toBe(false);
  });

  it('resolveAccountSummary ignores an injected accountId and still returns the pinned account\'s balance', async () => {
    const patelAccount = await getAccount(PINNED_ACCOUNT_ID);
    const marcusAccount = await getAccount(OTHER_ACCOUNT_ID);
    expect(patelAccount.currentBalance).not.toBe(marcusAccount.currentBalance);

    const spec = withInjectedAccountId({
      component: 'MetricRow',
      source: { kind: 'servicing-account-summary' },
    });
    const instruction = await resolveEvidence(spec);
    if (instruction.component !== 'MetricRow') throw new Error('unreachable');

    expect(instruction.props.metrics.find((m) => m.label === 'Balance')?.value).toBe(
      formatCurrency(patelAccount.currentBalance),
    );
    expect(instruction.props.metrics.find((m) => m.label === 'Balance')?.value).not.toBe(
      formatCurrency(marcusAccount.currentBalance),
    );
  });

  it('resolveRecentTransactions and resolveCategorySpend ignore an injected accountId too', async () => {
    const patelTxns = await getTransactions(PINNED_ACCOUNT_ID);
    const marcusTxns = await getTransactions(OTHER_ACCOUNT_ID);
    expect(patelTxns[0]?.merchantName).not.toBe(marcusTxns[0]?.merchantName);

    const txnSpec = withInjectedAccountId({
      component: 'TransactionTable',
      source: { kind: 'servicing-recent-transactions', months: 3, limit: 15 },
    });
    const txnInstruction = await resolveEvidence(txnSpec);
    if (txnInstruction.component !== 'TransactionTable') throw new Error('unreachable');
    expect(txnInstruction.props.rows[0]?.merchantName).toBe(patelTxns[0]?.merchantName);

    const categorySpec = withInjectedAccountId({
      component: 'CategoryPie',
      source: { kind: 'servicing-category-spend', months: 3 },
    });
    const categoryInstruction = await resolveEvidence(categorySpec);
    if (categoryInstruction.component !== 'CategoryPie') throw new Error('unreachable');
    expect(categoryInstruction.props.slices.length).toBeGreaterThanOrEqual(2);
  });
});
