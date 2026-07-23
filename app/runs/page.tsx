// Agent Run View route (brief §4 screen 3; W1.4 payment-health, W2.3
// generalized to all three agents). Server component: the only data fetch on
// this page is the trigger events themselves — every other figure the run
// shows arrives over the wire contract via each RunView's chat session
// (docs/wire-contract.md). Nothing here touches lib/soe beyond this one
// lookup.

import { PageHeader } from "@/components/shell/page-header";
import { RunSwitcher, type RunConfig } from "@/components/run-view/run-switcher";
import { getEventStream } from "@/lib/soe";
import { AGENT_NAMES, isCardinalAgentId, type CardinalAgentId } from "@/lib/agents/registry";

// Seed dates are day-offsets from the demo anchor (start of today, UTC).
// A statically prerendered page would freeze the anchor at build time and
// drift the story facts by a day per day — resolve it per request instead.
export const dynamic = "force-dynamic";

/** Run triggers by agent (docs/wire-contract.md §6). */
const RUN_TRIGGERS: { agentId: CardinalAgentId; eventId: string }[] = [
  { agentId: "payment-health", eventId: "evt-marcus-autopay-failed" },
  { agentId: "bt-lifecycle", eventId: "evt-elena-promo-expiring" },
  { agentId: "au-growth", eventId: "evt-patel-statement" },
];

export default async function AgentRunPage({
  searchParams,
}: {
  // Next 16: searchParams is a Promise (docs/ai-sdk7-notes.md's params note
  // applies here too) — await it before reading anything off it.
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const events = await getEventStream();
  const { autostart } = await searchParams;

  // The Workflow Canvas's Run button (W3.4) always hands off to Payment
  // Health (brief §8, scripted demo), but validate anyway rather than trust
  // the query string — an unrecognized/absent value just means no autostart.
  const autostartValue = Array.isArray(autostart) ? autostart[0] : autostart;
  const autostartAgentId =
    autostartValue && isCardinalAgentId(autostartValue) ? autostartValue : undefined;

  const runs: RunConfig[] = [];
  for (const { agentId, eventId } of RUN_TRIGGERS) {
    const trigger = events.find((event) => event.eventId === eventId);
    if (!trigger) {
      console.error(`AgentRunPage: trigger event "${eventId}" not found in seed data for "${agentId}".`);
      continue;
    }
    runs.push({ agentId, agentName: AGENT_NAMES[agentId], trigger });
  }

  return (
    <div>
      <PageHeader
        title="Agent Runs"
        description="Streaming reasoning, progressive evidence, and the approval rail for Payment Health, BT Lifecycle, and AU Growth."
      />
      {runs.length > 0 ? (
        <RunSwitcher runs={runs} autostartAgentId={autostartAgentId} />
      ) : (
        <div className="grid h-64 place-items-center rounded-lg border border-dashed text-sm text-muted-foreground">
          No trigger events found in seed data.
        </div>
      )}
    </div>
  );
}
