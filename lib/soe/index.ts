// Public entry point for all SOE data access (brief §6: every data access
// goes through lib/soe). Import from '@/lib/soe' — never from ./seed directly.

export * from './adapter';
export * from './types';

// Deterministic money math shared with the seed generator — formulas, not
// data access. Re-exported here so resolvers can project interest with the
// exact arithmetic the seed (and its tests) use, without touching ./seed
// (brief §6: projections must reconcile when someone in the room recomputes).
export {
  centsToDollars,
  minimumDueCents,
  monthlyInterestCents,
  projectInterest,
  type ProjectionRow,
} from './seed/finance';
