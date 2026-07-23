// Agent Run View route (brief §4 screen 3; W1.4). Server component: the
// only data fetch on this page is the trigger event itself — every other
// figure the run shows arrives over the wire contract via RunView's chat
// session (docs/wire-contract.md). Nothing here touches lib/soe beyond this
// one lookup.

import { PageHeader } from "@/components/shell/page-header";
import { RunView } from "@/components/run-view/run-view";
import { getEventStream } from "@/lib/soe";

// Seed dates are day-offsets from the demo anchor (start of today, UTC).
// A statically prerendered page would freeze the anchor at build time and
// drift the story facts by a day per day — resolve it per request instead.
export const dynamic = "force-dynamic";

/** P1 trigger (docs/wire-contract.md §6) — Marcus Webb's autopay failure. */
const TRIGGER_EVENT_ID = "evt-marcus-autopay-failed";

export default async function AgentRunPage() {
  const events = await getEventStream();
  const trigger = events.find((event) => event.eventId === TRIGGER_EVENT_ID);

  return (
    <div>
      <PageHeader
        title="Agent Runs"
        description="Streaming reasoning, progressive evidence, and the approval rail."
      />
      {trigger ? (
        <RunView trigger={trigger} agentId="payment-health" agentName="Payment Health" />
      ) : (
        <div className="grid h-64 place-items-center rounded-lg border border-dashed text-sm text-muted-foreground">
          Trigger event &quot;{TRIGGER_EVENT_ID}&quot; not found in seed data.
        </div>
      )}
    </div>
  );
}
