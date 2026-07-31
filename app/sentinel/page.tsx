// Sentinel stage route (brief §4). Defaults to the real three-act AU-policy
// demo (`buildDemoScenario`, lib/sentinel/scenario/demo-scenario.ts) — the
// P0 placeholder that pointed this route at `graphRehearsalScenario`
// unconditionally is gone now that P1 has something real to play
// (docs/v3-migration-map.md §7). `?scenario=graph-rehearsal` keeps working
// as the presenter's rehearsal-loop escape hatch (graph-rehearsal.ts's
// header comment) — the only other value this query string recognizes.
//
// `buildDemoScenario` is `async` (demo-scenario.ts's header comment: the
// seam Act III needs to pull its aggregate figures from `lib/soe`), so this
// server component awaits it before handing `<Stage>` a plain
// `SentinelScenario` — `Stage` itself stays synchronous and player-owning,
// unchanged from P0.
//
// `policyDocument` (lib/sentinel/policy.ts) is checked-in content, not seed
// data — the "all data access goes through lib/soe" rule (CLAUDE.md) governs
// seed data specifically. `<Stage>` needs it unconditionally: the Policy
// Panel renders its preview off this prop regardless of which scenario is
// loaded, even the rehearsal fixture, which never opens the drawer itself.
//
// `force-dynamic` mirrors app/runs/page.tsx's note: seed dates are day
// offsets from the demo anchor (start of today, UTC), so a statically
// prerendered page would freeze anchor-derived facts at build time. Act I
// carries no anchor-derived figures yet, but Act III will, so the export
// stays in place ahead of that.

import { Stage } from "@/components/sentinel/stage";
import { buildDemoScenario } from "@/lib/sentinel/scenario/demo-scenario";
import { graphRehearsalScenario } from "@/lib/sentinel/scenario/graph-rehearsal";
import { policyDocument } from "@/lib/sentinel/policy";

export const dynamic = "force-dynamic";

export default async function SentinelPage({
  searchParams,
}: {
  // Next 16: searchParams is a Promise (app/runs/page.tsx's identical note)
  // — await it before reading anything off it.
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { scenario: scenarioParam } = await searchParams;
  const scenarioValue = Array.isArray(scenarioParam) ? scenarioParam[0] : scenarioParam;

  const scenario =
    scenarioValue === "graph-rehearsal" ? graphRehearsalScenario : await buildDemoScenario();

  return <Stage scenario={scenario} policyDocument={policyDocument} />;
}
