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
//
// P4 (W4.3) adds the Act III data-flow, data-driven end to end (no
// hardcoded 'acct-marcus' anywhere in this file): find the night's BT event
// on the replay log itself, read its `accountId` off of THAT, fetch the
// three datasets Act III's investigation cites in parallel, then match the
// adapter's `BalanceTransferEvent` back to the replay log's `StreamEvent` by
// `timestamp` (both are stamped from the same seed fixture, so they're
// identical strings — brief §5's hand-reconcilable rule, one fact, two
// shapes). Both `.find()`s throw on a miss instead of falling through
// silently — a demo that quietly plays Act III against the wrong account or
// skips the catch entirely is worse than one that fails loudly at the
// fetch (brief §5a: the model never invents data; this file doesn't either,
// it just refuses to guess when the seed doesn't shape up as expected).
//
// Addendum v2.1 (post-P4) adds two more unconditional inputs to the same
// Promise.all: `getAccount(accountId)` — Act III's decision phase renders
// the account's standing/tenure off it (demo-scenario.ts's `act3-account`
// MetricRow) — and `policyObligationGap` (`lib/sentinel/policy.ts`), threaded
// into `buildDemoScenario`'s `policy` param the same way `policyRules`
// already is: checked-in content, not seed data, so it's a direct import
// here rather than a lib/soe fetch (this file's earlier P3 comment on
// `policyDocument`/`policyRules` applies identically).

import { Stage } from "@/components/sentinel/stage";
import {
  getAccount,
  getBalanceTransferEvents,
  getPartiesForAccount,
  getPayments,
  getSentinelReplayLog,
} from "@/lib/soe";
import { buildDemoScenario } from "@/lib/sentinel/scenario/demo-scenario";
import { graphRehearsalScenario } from "@/lib/sentinel/scenario/graph-rehearsal";
import { policyDocument, policyObligationGap, policyRules } from "@/lib/sentinel/policy";

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

  const btReplayEvent = replayEvents.find((e) => e.kind === "balance_transfer.initiated");
  if (!btReplayEvent) {
    throw new Error("SentinelPage: replay log is missing its balance_transfer.initiated event");
  }
  const accountId = btReplayEvent.accountId;

  const [payments, balanceTransferEvents, parties, account] = await Promise.all([
    getPayments(accountId),
    getBalanceTransferEvents(accountId),
    getPartiesForAccount(accountId),
    getAccount(accountId),
  ]);

  const btEvent = balanceTransferEvents.find((e) => e.timestamp === btReplayEvent.timestamp);
  if (!btEvent) {
    throw new Error(`SentinelPage: no balance-transfer event on ${accountId} matches the replay log's timestamp`);
  }

  const primary = parties.find((p) => p.role.role === "PRIMARY");
  if (!primary) {
    throw new Error(`SentinelPage: no PRIMARY party on ${accountId}`);
  }
  const partyName = primary.party.fullName;

  const scenario = buildDemoScenario({
    replayEvents,
    policy: { document: policyDocument, rules: policyRules, obligationGap: policyObligationGap },
    actIII: { btEvent, payments, partyName, account },
  });

  return <Stage scenario={scenario} policyDocument={policyDocument} />;
}
