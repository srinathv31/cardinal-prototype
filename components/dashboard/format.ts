// Presentation-only formatting for the Command Center (brief §5b: "zero
// business logic in components" — these are mechanical string conversions
// over values already computed by the server component, never data
// derivation). Kept local to this directory rather than reused from
// components/run-view/utils.ts, which is scoped to that screen's
// wire-contract types and owned by a different work item.

export function formatCurrency(amount: number): string {
  return amount.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

export function formatClockTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  });
}
