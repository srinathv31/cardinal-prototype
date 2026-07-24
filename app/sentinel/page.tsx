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
//
// `?scenario=graph-rehearsal` (W2.1) is an additive, rehearsal-only entry
// point for the P2 gate: it swaps in graphRehearsalScenario and skips the
// replay-log fetch entirely (that scenario carries no emitEvent steps, so
// there's nothing for the fetch to feed). The audience never sees this
// query string; any other value or its absence is the exact demo path
// above, untouched.
//
// P3 adds the policy fixtures: `policyDocument`/`policyRules`
// (lib/sentinel/policy.ts) are checked-in content, not seed data — the "all
// data access goes through lib/soe" rule (CLAUDE.md) governs seed data
// specifically, and the policy document/rules are static fixtures imported
// directly here, same as demo-scenario.ts itself. They feed
// `buildDemoScenario`'s Act II sequence and, unconditionally, `<Stage>`'s
// `policyDocument` prop (both call sites below) — the Policy Panel needs the
// document to render its preview regardless of which scenario is loaded.

import { Stage } from "@/components/sentinel/stage";
import { getSentinelReplayLog } from "@/lib/soe";
import { buildDemoScenario } from "@/lib/sentinel/scenario/demo-scenario";
import { graphRehearsalScenario } from "@/lib/sentinel/scenario/graph-rehearsal";
import { policyDocument, policyRules } from "@/lib/sentinel/policy";

export const dynamic = "force-dynamic";

export default async function SentinelPage({
  searchParams,
}: {
  // Next 16: searchParams is a Promise — await it before reading anything
  // off it (see app/runs/page.tsx's identical note).
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { scenario: scenarioParam } = await searchParams;
  const scenarioName = Array.isArray(scenarioParam) ? scenarioParam[0] : scenarioParam;

  if (scenarioName === "graph-rehearsal") {
    return <Stage scenario={graphRehearsalScenario} policyDocument={policyDocument} />;
  }

  const replayEvents = await getSentinelReplayLog();
  const scenario = buildDemoScenario({
    replayEvents,
    policy: { document: policyDocument, rules: policyRules },
  });

  return <Stage scenario={scenario} policyDocument={policyDocument} />;
}
