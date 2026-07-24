// Sentinel stage route (brief §4). P0 placeholder: with `buildDemoScenario`
// torn down alongside the rest of the v2 BT script (docs/v3-migration-map.md
// §2b), this route has nothing of its own to assemble yet — it renders the
// graph-rehearsal fixture (lib/sentinel/scenario/graph-rehearsal.ts) as the
// only scenario there is, unconditionally, for both the bare route and its
// `?scenario=graph-rehearsal` query string. P1's `buildDemoScenario`
// (rebuilt fresh for the AU policy script, lib/sentinel/scenario/) replaces
// this once Act I lands — do not read this file as a preview of the real
// three-act demo; it isn't one yet, and no query string here reaches one.
//
// `policyDocument` (lib/sentinel/policy.ts) is checked-in content, not seed
// data — the "all data access goes through lib/soe" rule (CLAUDE.md) governs
// seed data specifically. `<Stage>` needs it unconditionally: the Policy
// Panel renders its preview off this prop regardless of which scenario is
// loaded, even the rehearsal fixture, which never opens the drawer itself.
//
// `force-dynamic` mirrors app/runs/page.tsx's note: seed dates are day
// offsets from the demo anchor (start of today, UTC), so a statically
// prerendered page would freeze anchor-derived facts at build time. Nothing
// on this placeholder route is anchor-derived yet, but P1's real scenario
// will be, so the export stays in place ahead of that.

import { Stage } from "@/components/sentinel/stage";
import { graphRehearsalScenario } from "@/lib/sentinel/scenario/graph-rehearsal";
import { policyDocument } from "@/lib/sentinel/policy";

export const dynamic = "force-dynamic";

export default function SentinelPage() {
  return <Stage scenario={graphRehearsalScenario} policyDocument={policyDocument} />;
}
