// Shared display formatting for agent resolvers (P2+). Presentation-string
// helpers only — business arithmetic stays inside each agent's resolvers.
// (payment-health predates this module and keeps its local copies; new
// agents import from here instead of re-deriving.)
//
// Date helpers accept either a date-only ISO string (YYYY-MM-DD) or a full
// ISO timestamp; only the date part is read, always in UTC — matching the
// seed's day-offset anchoring (lib/soe/seed/anchor.ts).

import { getAnchor } from '@/lib/soe';

const DAY_MS = 86_400_000;

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

export function formatCurrency(amount: number): string {
  return currencyFormatter.format(amount);
}

function utcDate(iso: string): Date {
  return new Date(`${iso.slice(0, 10)}T00:00:00.000Z`);
}

/** "Sep 11, 2025" */
export function formatDate(iso: string): string {
  return utcDate(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** "Aug 2018" */
export function formatMonthYear(iso: string): string {
  return utcDate(iso).toLocaleDateString('en-US', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function formatShortMonth(iso: string): string {
  return utcDate(iso).toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
}

/** Short month labels, falling back to "Mon D" for every point when two
 * points would otherwise land on the same month label (30-day statement
 * cadence drifts against calendar months). */
export function monthLabels(isoDates: string[]): string[] {
  const short = isoDates.map(formatShortMonth);
  const hasCollision = new Set(short).size !== short.length;
  if (!hasCollision) return short;
  return isoDates.map((iso, i) => `${short[i]} ${Number(iso.slice(8, 10))}`);
}

/** Whole days since an ISO date (positive = in the past), against the demo
 * anchor (`getAnchor()` — start of today UTC, or DEMO_ANCHOR_DATE when
 * pinned), so day counts hold on pinned rehearsal dates. */
export function daysSince(iso: string): number {
  return Math.floor((getAnchor().getTime() - utcDate(iso).getTime()) / DAY_MS);
}

/** Whole days until an ISO date (positive = in the future), against the demo
 * anchor (`getAnchor()` — start of today UTC, or DEMO_ANCHOR_DATE when
 * pinned), so day counts hold on pinned rehearsal dates. */
export function daysUntil(iso: string): number {
  return Math.ceil((utcDate(iso).getTime() - getAnchor().getTime()) / DAY_MS);
}

/** YYYY-MM-DD shifted by whole days, in UTC. */
export function shiftDays(iso: string, days: number): string {
  return new Date(utcDate(iso).getTime() + days * DAY_MS).toISOString().slice(0, 10);
}

/** 'UTILITIES' → 'Utilities' — for enum-derived display labels. */
export function titleCase(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
}
