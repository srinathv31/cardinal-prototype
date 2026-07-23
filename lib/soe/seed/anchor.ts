// Date anchoring. Relative story facts ("promo ends in 45 days", "missed 12
// days ago") must hold on BOTH demo dates, so every seed date is a day-offset
// from the anchor T = start of today (UTC). Amounts are fixed literals — only
// dates shift with the anchor. Set DEMO_ANCHOR_DATE=YYYY-MM-DD to pin T.

const DAY_MS = 86_400_000;

export function getAnchor(): Date {
  const override = process.env.DEMO_ANCHOR_DATE;
  if (override) {
    const parsed = new Date(`${override}T00:00:00.000Z`);
    if (Number.isNaN(parsed.getTime())) {
      throw new Error(`DEMO_ANCHOR_DATE is not a valid ISO date: ${override}`);
    }
    return parsed;
  }
  const now = new Date();
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
}

/** Full ISO timestamp at T + offsetDays, at a fixed UTC time of day. */
export function d(anchor: Date, offsetDays: number, hhmm = '12:00'): string {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(
    anchor.getTime() + offsetDays * DAY_MS + (h * 60 + m) * 60_000,
  ).toISOString();
}

/** ISO date (YYYY-MM-DD) at T + offsetDays. */
export function dateOnly(anchor: Date, offsetDays: number): string {
  return new Date(anchor.getTime() + offsetDays * DAY_MS)
    .toISOString()
    .slice(0, 10);
}
