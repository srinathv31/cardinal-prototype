// Resolver invariants for the BT Lifecycle evidence set (brief §5a/§5b):
// every number that reaches a component must be reconstructable from the SOE
// adapter alone. These pin Elena Ruiz's story numbers (CARDINAL_BRIEF.md §6,
// Beat 3) exactly, so a regression here means a figure on screen would be
// wrong. Ground-truth 12-month interest projection: $106.21 first month,
// $944.51 cumulative (lib/soe/seed/finance.ts projectInterest arithmetic).

import { describe, expect, it } from 'vitest';
import { resolveEvidence } from './resolvers';

const ELENA_ACCOUNT_ID = 'acct-elena';

describe('bt-lifecycle resolvers — Elena Ruiz', () => {
  it('bt-overview shows remaining balance, days left, and go-to APR', async () => {
    const instruction = await resolveEvidence({
      component: 'MetricRow',
      source: { kind: 'bt-overview', accountId: ELENA_ACCOUNT_ID },
    });

    expect(instruction.component).toBe('MetricRow');
    if (instruction.component !== 'MetricRow') throw new Error('unreachable');

    const remaining = instruction.props.metrics.find((m) => m.label === 'Remaining Balance');
    const days = instruction.props.metrics.find((m) => m.label === 'Days Until Promo Ends');
    const goToApr = instruction.props.metrics.find((m) => m.label === 'Go-to APR');

    expect(remaining?.value).toBe('$5,100.00');
    expect(days?.value).toBe('45 days');
    expect(goToApr?.value).toBe('24.99%');
  });

  it('bt-lifecycle timeline has 4 milestones and a 45-day countdown', async () => {
    const instruction = await resolveEvidence({
      component: 'BTTimeline',
      source: { kind: 'bt-lifecycle', accountId: ELENA_ACCOUNT_ID },
    });

    expect(instruction.component).toBe('BTTimeline');
    if (instruction.component !== 'BTTimeline') throw new Error('unreachable');

    expect(instruction.props.milestones).toHaveLength(4);
    expect(instruction.props.milestones.map((m) => m.kind)).toEqual([
      'past',
      'past',
      'today',
      'cliff',
    ]);
    expect(instruction.props.countdown).toContain('45 days');
  });

  it('interest-projection reproduces the 12-month decline exactly', async () => {
    const instruction = await resolveEvidence({
      component: 'InterestProjectionChart',
      source: { kind: 'interest-projection', accountId: ELENA_ACCOUNT_ID, months: 12 },
    });

    expect(instruction.component).toBe('InterestProjectionChart');
    if (instruction.component !== 'InterestProjectionChart') throw new Error('unreachable');

    const { points, callouts } = instruction.props;
    expect(points).toHaveLength(12);
    expect(points[0].monthlyInterest).toBeCloseTo(106.21, 2);
    expect(points[1].monthlyInterest).toBeCloseTo(101.55, 2);
    expect(points[points.length - 1].cumulativeInterest).toBeCloseTo(944.51, 2);

    const values = callouts.map((c) => c.value);
    expect(values).toContain('$106.21');
    expect(values).toContain('$944.51');
  });
});
