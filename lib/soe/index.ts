// Public entry point for all SOE data access (brief §6: every data access
// goes through lib/soe). Import from '@/lib/soe' — never from ./seed directly.

export * from './adapter';
export * from './types';
// v3 "AU policy" additions (brief §5d) — the AU-portfolio getters and their
// types already flow through the wildcard exports above; no separate export
// line needed.

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

// The demo anchor ("today", honoring DEMO_ANCHOR_DATE) — the same T every
// seed offset was generated from. Re-exported so consumers that compare
// against "today" (dashboard KPIs, resolvers) share the seed's clock instead
// of re-deriving it and drifting under a pinned rehearsal date.
export { getAnchor } from './seed/anchor';
