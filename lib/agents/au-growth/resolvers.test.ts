// Resolver invariants for the AU Growth evidence set (brief §3 Beat 4/§5a/§5b):
// every number that reaches a component must be reconstructable from the SOE
// adapter alone. These pin the Patel household's story numbers
// (CARDINAL_BRIEF.md §6 + the W2.2 spec) exactly, so a regression here means a
// figure on screen would be wrong. Dev's partyId is discovered dynamically
// from the household-overview highlight, never hardcoded.

import { describe, expect, it } from 'vitest';
import { resolveEvidence } from './resolvers';

const PATEL_ACCOUNT_ID = 'acct-patel';

async function resolveDevPartyId(): Promise<{ id: string; name: string }> {
  const instruction = await resolveEvidence({
    component: 'PartyGraph',
    source: { kind: 'household-overview', accountId: PATEL_ACCOUNT_ID },
  });
  if (instruction.component !== 'PartyGraph') throw new Error('unreachable');
  const [dev, ...rest] = instruction.props.parties.filter((p) => p.highlight);
  if (!dev) throw new Error('expected exactly one highlighted party');
  if (rest.length > 0) throw new Error('expected only one highlighted party');
  return { id: dev.id, name: dev.name };
}

describe('au-growth resolvers — Patel household', () => {
  it('household-overview highlights exactly one party: Dev Patel, AUTHORIZED_USER, age 22', async () => {
    const instruction = await resolveEvidence({
      component: 'PartyGraph',
      source: { kind: 'household-overview', accountId: PATEL_ACCOUNT_ID },
    });

    expect(instruction.component).toBe('PartyGraph');
    if (instruction.component !== 'PartyGraph') throw new Error('unreachable');

    const { account, parties } = instruction.props;
    expect(parties).toHaveLength(3);
    expect(parties[0].role).toBe('PRIMARY');
    expect(parties[0].name).toBe('Anand Patel');
    expect(account.label).toBe('Patel household card');
    expect(account.detail).toContain('$25,000.00');

    const highlighted = parties.filter((p) => p.highlight);
    expect(highlighted).toHaveLength(1);
    expect(highlighted[0].name).toBe('Dev Patel');
    expect(highlighted[0].role).toBe('AUTHORIZED_USER');
    expect(highlighted[0].detail).toContain('Age 22');
  });

  it("au-spend-trend reproduces Dev's 12-month ramp $80 → $650", async () => {
    const dev = await resolveDevPartyId();

    const instruction = await resolveEvidence({
      component: 'TrendChart',
      source: {
        kind: 'au-spend-trend',
        accountId: PATEL_ACCOUNT_ID,
        partyId: dev.id,
        months: 12,
      },
    });

    expect(instruction.component).toBe('TrendChart');
    if (instruction.component !== 'TrendChart') throw new Error('unreachable');

    expect(instruction.props.title).toBe(`Attributed spend — ${dev.name}`);
    const [series] = instruction.props.series;
    expect(series.points).toHaveLength(12);
    expect(series.points.map((p) => p.value)).toEqual([
      80, 95, 112, 141, 168, 214, 296, 342, 431, 497, 568, 650,
    ]);
    for (const point of series.points) {
      expect(point.label.length).toBeGreaterThan(0);
    }
  });

  it('au-recurring-spend finds exactly 5 recurring merchants, descending by amount', async () => {
    const dev = await resolveDevPartyId();

    const instruction = await resolveEvidence({
      component: 'MetricRow',
      source: { kind: 'au-recurring-spend', accountId: PATEL_ACCOUNT_ID, partyId: dev.id },
    });

    expect(instruction.component).toBe('MetricRow');
    if (instruction.component !== 'MetricRow') throw new Error('unreachable');

    expect(
      instruction.props.metrics.map((m) => ({ label: m.label, value: m.value, delta: m.delta })),
    ).toEqual([
      { label: 'City of Austin Utilities', value: '$85.00', delta: 'Monthly · Utilities' },
      { label: 'AT&T Wireless', value: '$70.00', delta: 'Monthly · Utilities' },
      { label: 'Planet Fitness', value: '$24.99', delta: 'Monthly · Subscription' },
      { label: 'Netflix', value: '$15.49', delta: 'Monthly · Subscription' },
      { label: 'Spotify', value: '$11.99', delta: 'Monthly · Subscription' },
    ]);
    for (const metric of instruction.props.metrics) {
      expect(metric.tone).toBe('neutral');
    }
  });

  it('throws a descriptive error for evidence kinds it does not own', async () => {
    await expect(
      resolveEvidence({
        component: 'RiskBadge',
        source: { kind: 'payment-risk', accountId: PATEL_ACCOUNT_ID },
        rationale: 'n/a',
      }),
    ).rejects.toThrow(/au-growth does not resolve "RiskBadge" evidence from source "payment-risk"/);

    await expect(
      resolveEvidence({
        component: 'TrendChart',
        source: { kind: 'utilization-trend', accountId: PATEL_ACCOUNT_ID, months: 6 },
      }),
    ).rejects.toThrow(
      /au-growth does not resolve "TrendChart" evidence from source "utilization-trend"/,
    );
  });
});
