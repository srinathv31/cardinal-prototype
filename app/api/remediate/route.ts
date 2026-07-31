// POST /api/remediate — the batch-removal endpoint on the demo's endpoint
// checklist (DEMO_THESIS.md row 8, DEMO_BUILD_PLAN.md §Endpoints: "already
// exists as /api/sentinel/remediate — re-export at the new path, keep old
// path working").
//
// A re-export, not a copy: both paths resolve to the SAME handler function,
// so the mock execution's counters (derived from
// lib/sentinel/exception-fixture.ts), its deterministic `confirmationId`, and
// its single `action.executed` audit write can never drift between the two
// URLs. app/api/sentinel/remediate/route.test.ts covers the behavior for
// both.
//
// One inherited constraint the caller must know about: that handler validates
// `agentId` with `startsWith('sentinel')` — the Sentinel ingestion scope —
// so a caller on this path supplies a `sentinel*` agentId or gets a clean
// 400. Relaxing it is a one-line change in the handler's own zod schema, in
// the Sentinel route file.

export { POST } from '../sentinel/remediate/route';
