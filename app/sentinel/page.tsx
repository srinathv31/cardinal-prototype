// Sentinel stage route (v2 brief §4, W0.4/P1). Server component doing the
// stage's one data fetch: the 14-event replay log, through lib/soe's
// adapter (v1 invariant: "all data access goes through lib/soe"), never a
// direct seed import. That data feeds `buildDemoScenario` (P1,
// lib/sentinel/scenario/demo-scenario.ts) to produce the checked-in
// Sentinel demo scenario, which <Stage /> then drives entirely client-side
// via ScenarioPlayer — the page still holds no state and does no rendering
// logic of its own, it only assembles the scenario once per request and
// hands it down. Unlike other route pages this one does not mount the
// shared PageHeader — the stage's own compact header row (title + subtitle
// + status chip, filling the full viewport per brief §4) replaces it, so
// <Stage /> owns that header itself rather than duplicating it here.
//
// Seed dates are day-offsets from the demo anchor (start of today, UTC) —
// mirrors app/runs/page.tsx's `force-dynamic` note: a statically
// prerendered page would freeze the anchor at build time and drift the
// story facts by a day per day.

import { Stage } from "@/components/sentinel/stage";
import { getSentinelReplayLog } from "@/lib/soe";
import { buildDemoScenario } from "@/lib/sentinel/scenario/demo-scenario";

export const dynamic = "force-dynamic";

export default async function SentinelPage() {
  const replayEvents = await getSentinelReplayLog();
  const scenario = buildDemoScenario({ replayEvents });

  return <Stage scenario={scenario} />;
}
