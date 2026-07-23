// Resolver invariants for the Ask evidence set (brief §3 Beat 5/§5a/§5b):
// every number that reaches a component must be reconstructable from the SOE
// adapter alone. Pinned at BOTH demo-date anchors (CARDINAL_BRIEF.md —
// Aug 5 and Aug 19, 2026): resolvers derive "today" from the adapter's
// `getAnchor()` (lib/agents/format.ts, lib/agents/ask/resolvers.ts), so
// pinning DEMO_ANCHOR_DATE alone is sufficient — no clock faking, unlike
// lib/soe/seed/seed.test.ts's `describe.each`, which calls buildSeedDb(anchor)
// directly and needs no clock fake either.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getAnchor, getPortfolioAccounts, getTransactions } from '@/lib/soe';
import { shiftDays } from '@/lib/agents/format';
import { resolveEvidence } from './resolvers';

const ANCHORS = ['2026-08-05', '2026-08-19'] as const;

describe.each(ANCHORS)('ask resolvers @ anchor %s', (anchorIso) => {
  beforeEach(() => {
    process.env.DEMO_ANCHOR_DATE = anchorIso;
  });

  afterEach(() => {
    delete process.env.DEMO_ANCHOR_DATE;
  });

  describe('bt-expiring-accounts (portfolio)', () => {
    it('returns exactly bg-002, Elena Ruiz, bg-005 — soonest first — at the 90-day default', async () => {
      const instruction = await resolveEvidence({
        component: 'BarBreakdown',
        source: { kind: 'bt-expiring-accounts', windowDays: 90 },
      });

      expect(instruction.component).toBe('BarBreakdown');
      if (instruction.component !== 'BarBreakdown') throw new Error('unreachable');

      expect(instruction.props.bars.map((b) => b.label)).toEqual([
        'Alicia Thompson', // bg-002, ~30d
        'Elena Ruiz', // ~45d
        'Fatima Al-Sayed', // bg-005, ~75d
      ]);

      const [bg002, elena, bg005] = instruction.props.bars;
      expect(bg002.detail).toContain('30 days');
      expect(elena.detail).toContain('45 days');
      expect(bg005.detail).toContain('75 days');
      // ≤45 days reads as warning tone; further out reads neutral.
      expect(bg002.tone).toBe('warning');
      expect(elena.tone).toBe('warning');
      expect(bg005.tone).toBe('neutral');
    });
  });

  describe('portfolio-category-spend', () => {
    it('CategoryPie slices sum to an independently recomputed PURCHASE total, shares ~100%', async () => {
      const months = 3;
      const instruction = await resolveEvidence({
        component: 'CategoryPie',
        source: { kind: 'portfolio-category-spend', months },
      });

      expect(instruction.component).toBe('CategoryPie');
      if (instruction.component !== 'CategoryPie') throw new Error('unreachable');
      expect(instruction.props.slices.length).toBeGreaterThanOrEqual(2);
      expect(instruction.props.slices.length).toBeLessThanOrEqual(8);

      // Independently recompute the trailing-window PURCHASE sum using the
      // same shared date helper the resolver uses (lib/agents/format.ts),
      // mirroring how bt-lifecycle/resolvers.test.ts reuses projectInterest.
      const from = shiftDays(getAnchor().toISOString().slice(0, 10), -months * 30);
      const accounts = await getPortfolioAccounts();
      let expectedCents = 0;
      for (const account of accounts) {
        const txns = await getTransactions(account.accountId, { from });
        for (const t of txns) {
          if (t.type === 'PURCHASE') expectedCents += Math.round(t.amount * 100);
        }
      }

      const totalCents = Math.round(
        instruction.props.slices.reduce((sum, s) => sum + s.value, 0) * 100,
      );
      expect(totalCents).toBe(expectedCents);
      expect(instruction.props.total?.value).toBe(
        new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(
          expectedCents / 100,
        ),
      );

      const shareSum = instruction.props.slices.reduce(
        (sum, s) => sum + Number(s.share.replace('%', '')),
        0,
      );
      expect(shareSum).toBeGreaterThanOrEqual(99);
      expect(shareSum).toBeLessThanOrEqual(101);
    });

    it('BarBreakdown carries the same category totals as CategoryPie', async () => {
      const months = 3;
      const [pie, bars] = await Promise.all([
        resolveEvidence({
          component: 'CategoryPie',
          source: { kind: 'portfolio-category-spend', months },
        }),
        resolveEvidence({
          component: 'BarBreakdown',
          source: { kind: 'portfolio-category-spend', months },
        }),
      ]);
      if (pie.component !== 'CategoryPie') throw new Error('unreachable');
      if (bars.component !== 'BarBreakdown') throw new Error('unreachable');

      expect(bars.props.bars.map((b) => b.display)).toEqual(
        pie.props.slices.map((s) => s.display),
      );
      expect(bars.props.bars.every((b) => b.tone === 'neutral')).toBe(true);
    });
  });

  describe('recent-transactions', () => {
    it('respects limit + sorts newest-first + populates accountLabel only portfolio-wide', async () => {
      const instruction = await resolveEvidence({
        component: 'TransactionTable',
        source: { kind: 'recent-transactions', months: 3, limit: 5 },
      });

      expect(instruction.component).toBe('TransactionTable');
      if (instruction.component !== 'TransactionTable') throw new Error('unreachable');

      expect(instruction.props.rows.length).toBeLessThanOrEqual(5);
      expect(instruction.props.rows.length).toBeGreaterThan(0);
      expect(instruction.props.rows.every((r) => Boolean(r.accountLabel))).toBe(true);

      const timestamps = instruction.props.rows.map((r) => Date.parse(r.postedDate));
      for (let i = 1; i < timestamps.length; i++) {
        expect(timestamps[i]).toBeLessThanOrEqual(timestamps[i - 1]);
      }

      expect(instruction.props.footnote).toContain(
        `Showing ${instruction.props.rows.length} of`,
      );
      expect(instruction.props.footnote).toContain('trailing 3 month');
    });

    it('omits accountLabel when scoped to a single account', async () => {
      const instruction = await resolveEvidence({
        component: 'TransactionTable',
        source: { kind: 'recent-transactions', accountId: 'acct-marcus', months: 6, limit: 15 },
      });

      if (instruction.component !== 'TransactionTable') throw new Error('unreachable');
      expect(instruction.props.rows.length).toBeGreaterThan(0);
      expect(instruction.props.rows.every((r) => r.accountLabel === undefined)).toBe(true);
    });
  });

  describe('portfolio-overview', () => {
    it('MetricRow strings match independently recomputed portfolio values', async () => {
      const instruction = await resolveEvidence({
        component: 'MetricRow',
        source: { kind: 'portfolio-overview' },
      });

      expect(instruction.component).toBe('MetricRow');
      if (instruction.component !== 'MetricRow') throw new Error('unreachable');

      const accounts = await getPortfolioAccounts();
      const activeCount = accounts.filter((a) => a.status === 'ACTIVE').length;
      const totalBalance = accounts.reduce((sum, a) => sum + a.currentBalance, 0);
      const totalLimit = accounts.reduce((sum, a) => sum + a.creditLimit, 0);
      const utilizationPct = Math.round((totalBalance / totalLimit) * 100);
      const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

      const byLabel = (label: string) =>
        instruction.props.metrics.find((m) => m.label === label);

      expect(byLabel('Active Accounts')?.value).toBe(`${activeCount}`);
      expect(byLabel('Total Balance')?.value).toBe(currency.format(totalBalance));
      expect(byLabel('Portfolio Utilization')?.value).toBe(`${utilizationPct}%`);
      // At the 90-day horizon this is exactly bg-002, Elena, bg-005.
      expect(instruction.props.metrics.find((m) => m.label.startsWith('BTs Expiring'))?.value).toBe(
        '3',
      );
    });
  });

  it('throws a descriptive error for evidence kinds it does not own', async () => {
    await expect(
      resolveEvidence({
        component: 'RiskBadge',
        source: { kind: 'payment-risk', accountId: 'acct-marcus' },
        rationale: 'n/a',
      }),
    ).rejects.toThrow(/ask does not resolve "RiskBadge" evidence from source "payment-risk"/);

    await expect(
      resolveEvidence({
        component: 'MetricRow',
        source: { kind: 'account-overview', accountId: 'acct-marcus' },
      }),
    ).rejects.toThrow(/ask does not resolve "MetricRow" evidence from source "account-overview"/);
  });
});
