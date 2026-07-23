// Command Center — the landing screen (brief §4 screen 1, Beat 0: "the room
// absorbs: agents are watching the portfolio"). Pure server component: every
// figure on this page is computed here from lib/soe + lib/events/store and
// handed down as preformatted strings/props. Client components below
// (EventTicker, AutoRefresh) do no arithmetic — see their own file comments.
// The LLM is not involved anywhere on this screen (brief §5a).

import { PageHeader } from "@/components/shell/page-header";
import {
  getAnchor,
  getBalanceTransferEvents,
  getEventStream,
  getPortfolioAccounts,
} from "@/lib/soe";
import { query } from "@/lib/events/store";
import { AGENT_NAMES, isCardinalAgentId, type CardinalAgentId } from "@/lib/agents/registry";
import type { MetricRowProps } from "@/lib/registry/schemas";
import { KpiRow } from "@/components/dashboard/kpi-row";
import { EventTicker, type TickerEvent } from "@/components/dashboard/event-ticker";
import { AgentStatusCard } from "@/components/dashboard/agent-status-card";
import { RecentApprovals, type ApprovalEntryView } from "@/components/dashboard/recent-approvals";
import { AutoRefresh } from "@/components/dashboard/auto-refresh";
import { formatClockTime, formatCurrency, formatPercent } from "@/components/dashboard/format";

// Seed dates are day-offsets from the demo anchor (start of today, UTC) —
// a statically prerendered page would freeze that anchor at build time and
// drift the story facts by a day per day (same reasoning as app/runs/page.tsx).
export const dynamic = "force-dynamic";

// Hardcoded rather than derived from lib/agents/registry's AGENT_IDS: this
// screen only ever shows the three *monitor* agents (brief Beat 0), and a
// parallel P3 work item is adding a fourth, non-monitor id to that array.
const MONITOR_AGENTS: { id: CardinalAgentId; blurb: string }[] = [
  {
    id: "payment-health",
    blurb: "Watches autopay and delinquency signals across the portfolio.",
  },
  {
    id: "bt-lifecycle",
    blurb: "Watches promo cliffs and balance-transfer retention risk.",
  },
  {
    id: "au-growth",
    blurb: "Watches authorized-user spend maturity for graduation candidates.",
  },
];

const DAY_MS = 86_400_000;

function daysBetween(laterIso: string, earlierIso: string): number {
  const later = Date.parse(`${laterIso}T00:00:00.000Z`);
  const earlier = Date.parse(`${earlierIso}T00:00:00.000Z`);
  return Math.round((later - earlier) / DAY_MS);
}

/** "2 runs this session · last finished 14:03", or the empty-store copy
 * from the brief. `entries` is oldest-first (lib/events/store.ts query()). */
function agentStats(entries: ReturnType<typeof query>, agentId: CardinalAgentId): string {
  const agentEntries = entries.filter((entry) => entry.agentId === agentId);
  const startedCount = agentEntries.filter((entry) => entry.kind === "run.started").length;
  if (startedCount === 0) return "No runs this session";
  const finished = agentEntries.filter((entry) => entry.kind === "run.finished");
  const lastFinished = finished[finished.length - 1];
  const runWord = startedCount === 1 ? "run" : "runs";
  return lastFinished
    ? `${startedCount} ${runWord} this session · last finished ${formatClockTime(lastFinished.timestamp)}`
    : `${startedCount} ${runWord} this session · in progress`;
}

export default async function CommandCenterPage() {
  const [streamEvents, accounts] = await Promise.all([
    getEventStream(),
    getPortfolioAccounts(),
  ]);
  const btEventsByAccount = await Promise.all(
    accounts.map((account) => getBalanceTransferEvents(account.accountId)),
  );
  const logEntries = query(); // full, unfiltered — small in-memory store (brief §5e)

  // — KPI row —
  const activeAccountCount = accounts.filter((account) => account.status === "ACTIVE").length;
  const portfolioBalance = accounts.reduce((sum, account) => sum + account.currentBalance, 0);
  const portfolioLimit = accounts.reduce((sum, account) => sum + account.creditLimit, 0);
  const utilization = portfolioLimit > 0 ? portfolioBalance / portfolioLimit : 0;

  // Same T the seed's promoEndDate offsets were generated from (honors
  // DEMO_ANCHOR_DATE), so this KPI can't drift under a pinned rehearsal date.
  const today = getAnchor().toISOString().slice(0, 10);
  const btsExpiringCount = btEventsByAccount.filter((events) => {
    const latest = events[events.length - 1]; // getBalanceTransferEvents sorts ascending
    if (!latest || latest.type === "PROMO_EXPIRED") return false;
    const daysUntilCliff = daysBetween(latest.promoEndDate, today);
    return daysUntilCliff > 0 && daysUntilCliff <= 90;
  }).length;

  const metrics: MetricRowProps["metrics"] = [
    { label: "Active Accounts", value: String(activeAccountCount), tone: "neutral" },
    { label: "Portfolio Balance", value: formatCurrency(portfolioBalance), tone: "neutral" },
    { label: "Portfolio Utilization", value: formatPercent(utilization), tone: "neutral" },
    {
      label: "BTs Expiring ≤ 90 Days",
      value: String(btsExpiringCount),
      tone: btsExpiringCount > 0 ? "warning" : "neutral",
    },
  ];

  // — Live event stream rail —
  const tickerEvents: TickerEvent[] = streamEvents.map((event) => ({
    eventId: event.eventId,
    kind: event.kind,
    summary: event.summary,
    timeLabel: formatClockTime(event.timestamp),
  }));

  // — Recent approvals strip —
  const recentApprovals: ApprovalEntryView[] = logEntries
    .filter((entry) => entry.kind === "approval.granted" || entry.kind === "approval.denied")
    .slice(-5) // logEntries is oldest-first; the last 5 are the most recent
    .reverse()
    .map((entry) => ({
      id: entry.id,
      agentName: isCardinalAgentId(entry.agentId) ? AGENT_NAMES[entry.agentId] : entry.agentId,
      toolName: entry.toolName ?? "—",
      decision: entry.kind === "approval.granted" ? "granted" : "denied",
      timeLabel: formatClockTime(entry.timestamp),
    }));

  return (
    <div>
      <AutoRefresh />
      <PageHeader
        title="Command Center"
        description="Live event stream, agent status, and portfolio KPIs."
      />
      <div className="flex flex-col gap-8">
        <KpiRow metrics={metrics} />

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
              Live Event Stream
            </h2>
            <div className="max-h-[70vh] overflow-y-auto pr-1">
              <EventTicker events={tickerEvents} />
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
              Agent Status
            </h2>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              {MONITOR_AGENTS.map((agent) => (
                <AgentStatusCard
                  key={agent.id}
                  name={AGENT_NAMES[agent.id]}
                  blurb={agent.blurb}
                  stats={agentStats(logEntries, agent.id)}
                />
              ))}
            </div>
          </section>
        </div>

        <RecentApprovals approvals={recentApprovals} />
      </div>
    </div>
  );
}
