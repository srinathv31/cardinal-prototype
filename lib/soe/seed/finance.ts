// Shared money math. All arithmetic is integer cents; APRs are basis points
// (24.99% = 2499 bps). These formulas are the single source for the seed, the
// arithmetic tests, and (in P2) the InterestProjectionChart — so the numbers
// someone recomputes by hand in the demo room always reconcile.

/** Simple monthly interest: opening balance × APR / 12, rounded to cents. */
export function monthlyInterestCents(
  openingCents: number,
  aprBps: number,
): number {
  return Math.round((openingCents * aprBps) / 120_000);
}

/** Minimum payment: max($35, 2% of statement balance), rounded to cents. */
export function minimumDueCents(statementCents: number): number {
  return Math.max(3_500, Math.round(statementCents * 0.02));
}

export interface ProjectionRow {
  month: number; // 1-based
  openingCents: number;
  interestCents: number;
  cumulativeInterestCents: number;
  closingCents: number;
}

/**
 * "If nothing changes" projection: a balance revolving at aprBps while the
 * holder keeps making a fixed monthly payment. closing = opening + interest −
 * payment, stopping early if the balance is paid off.
 */
export function projectInterest(
  balanceCents: number,
  aprBps: number,
  paymentCents: number,
  months: number,
): ProjectionRow[] {
  const rows: ProjectionRow[] = [];
  let opening = balanceCents;
  let cumulative = 0;
  for (let month = 1; month <= months && opening > 0; month++) {
    const interest = monthlyInterestCents(opening, aprBps);
    cumulative += interest;
    const closing = Math.max(0, opening + interest - paymentCents);
    rows.push({
      month,
      openingCents: opening,
      interestCents: interest,
      cumulativeInterestCents: cumulative,
      closingCents: closing,
    });
    opening = closing;
  }
  return rows;
}

export const centsToDollars = (cents: number): number => cents / 100;
