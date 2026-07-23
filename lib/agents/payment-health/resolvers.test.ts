// Resolver invariants for the Payment Health evidence set (brief §5a/§5b):
// every number that reaches a component must be reconstructable from the SOE
// adapter alone. These pin Marcus Webb's story numbers (CARDINAL_BRIEF.md
// §6) exactly, so a regression here means a figure on screen would be wrong.

import { describe, expect, it } from 'vitest';
import { resolveEvidence } from './resolvers';

const MARCUS_ACCOUNT_ID = 'acct-marcus';

describe('payment-health resolvers — Marcus Webb', () => {
  it('utilization-trend reproduces 42% → 78% across 6 statement closes', async () => {
    const instruction = await resolveEvidence({
      component: 'TrendChart',
      source: { kind: 'utilization-trend', accountId: MARCUS_ACCOUNT_ID, months: 6 },
    });

    expect(instruction.component).toBe('TrendChart');
    if (instruction.component !== 'TrendChart') throw new Error('unreachable');

    const [series] = instruction.props.series;
    expect(series.points).toHaveLength(6);
    expect(series.points.map((p) => p.value)).toEqual([42, 48, 56, 63, 71, 78]);
    for (const point of series.points) {
      expect(point.label.length).toBeGreaterThan(0);
    }
  });

  it('account-overview shows the current balance and utilization', async () => {
    const instruction = await resolveEvidence({
      component: 'MetricRow',
      source: { kind: 'account-overview', accountId: MARCUS_ACCOUNT_ID },
    });

    expect(instruction.component).toBe('MetricRow');
    if (instruction.component !== 'MetricRow') throw new Error('unreachable');

    const balance = instruction.props.metrics.find((m) => m.label === 'Current Balance');
    const utilization = instruction.props.metrics.find((m) => m.label === 'Utilization');
    expect(balance?.value).toBe('$7,800.00');
    expect(utilization?.value).toBe('78%');
    expect(utilization?.tone).toBe('critical');
  });

  it('payment-history flags three minimum-only payments and one missed payment', async () => {
    const instruction = await resolveEvidence({
      component: 'PaymentHistoryTable',
      source: { kind: 'payment-history', accountId: MARCUS_ACCOUNT_ID, months: 6 },
    });

    expect(instruction.component).toBe('PaymentHistoryTable');
    if (instruction.component !== 'PaymentHistoryTable') throw new Error('unreachable');

    const flags = instruction.props.rows.map((r) => r.flag);
    expect(flags.filter((f) => f === 'minimum-only')).toHaveLength(3);
    expect(flags.filter((f) => f === 'missed')).toHaveLength(1);
  });

  it('payment-risk is high for Marcus (recent miss + high utilization)', async () => {
    const instruction = await resolveEvidence({
      component: 'RiskBadge',
      source: { kind: 'payment-risk', accountId: MARCUS_ACCOUNT_ID },
      rationale: 'Utilization has climbed to 78% and the most recent payment was missed.',
    });

    expect(instruction.component).toBe('RiskBadge');
    if (instruction.component !== 'RiskBadge') throw new Error('unreachable');

    expect(instruction.props.level).toBe('high');
    expect(instruction.props.rationale).toContain('missed');
  });
});
