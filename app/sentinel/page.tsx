// Sentinel stage route (v2 brief §4, W0.4). Server shell only, mirroring the
// other route pages' convention (app/runs/page.tsx): the page component does
// no data fetching and holds no state. Unlike those pages this one does not
// mount the shared PageHeader — the stage's own compact header row (title +
// subtitle + status chip, filling the full viewport per brief §4) replaces
// it, so <Stage /> owns that header itself rather than duplicating it here.
//
// This is the idle skeleton only: no ScenarioPlayer wiring, no lib/sentinel
// import. P1 replaces the static placeholders panel-by-panel without
// touching this file's structure (brief §7).

import { Stage } from "@/components/sentinel/stage";

export default function SentinelPage() {
  return <Stage />;
}
