# Handoff — making Cardinal's demo real

**Audience: the AI agent (or engineer) who will replace this app's scripted model with a live
LLM API and production tool backends.** Everything in the demo is architected so that swap is
narrow. This document tells you exactly where the seam is, what is already real, what is mocked,
and what you must not break.

Read in this order: this file → `DEMO_THESIS.md` (what the demo is) → `CLAUDE.md` (invariants
and standing rules) → `docs/wire-contract.md` (the streaming/message contract) →
`DEMO_BUILD_PLAN.md` (how it was built, contracts per piece) → `DEMO_RUNBOOK.md` (how it is
presented).

## 1. The three-phase demo you are inheriting

All three phases run through chat surfaces; nav items outside them are parked (dimmed) in
`components/shell/nav.tsx` — flip the `parked` flags to restore them.

- **Phase 1 — Authorized-user policy (`/ops`)**: upload policy doc → agent parses it into
  candidate rules → human approval gate G1 → rules stored (`POST /api/rules`) → "which accounts
  fail?" → batch evaluation (`GET /api/violations?policy=authorized-user`, 962 scanned / 87
  exceptions / 74 accounts) rendered as `ViolationsDashboard` with drill-down → agent
  *unprompted* recommends batch removal of the 61 secured-card violations → gate G2 → mocked
  batch removal (`POST /api/remediate`) → downloadable HTML audit report (`GET /api/report`).
- **Phase 2 — Customer servicing chatbot (`/servicing`)**: transactions, balance, next payment,
  next statement, spend categories; approval-gated contact-info change. Identity is pinned
  server-side per conversation — the model cannot address another customer.
- **Phase 3 — Card activation**: ops side on `/ops` (same upload→rules→sweep shape, 214 cards /
  41 out-of-compliance, gated outreach action); customer side on `/servicing` ("I just got my
  card" → **Activate / Cancel** gate → happy path activates (Patel), blocked path explains the
  CA-R1 past-due failure (Marcus), `?persona=happy|blocked`).

## 2. The architectural bet — why the LLM swap is small

Five invariants (CLAUDE.md §5, enforced by tests):

1. **5a — the LLM is a router, not a data source.** No tool accepts free-form data the model
   could invent; every number/name/date on screen comes from `lib/` functions. `saveRules` takes
   rule *ids*; the stored text comes from the fixture. This does not relax when the model goes
   live.
2. **5b — intelligence server-side, frontend renders.** Components are pure renderers of
   preformatted props.
3. **5c — component whitelist.** The model may only select registered components
   (`lib/registry/schemas.ts`, `lib/sentinel/registry.ts` — incl. `ViolationsDashboard`,
   `ReportCard`). Adding a component = registering it, never codegen.
4. **5d — approval gates are real pauses** via AI SDK 7's native tool-approval flow. No
   auto-approve, no timeouts. Gates: `saveRules`, `executeBatchRemoval`,
   `queueActivationOutreach` (ops); `updateContactInfo`, `activateCard` (servicing).
5. **5e — everything writes to the Event Log** (`lib/events/telemetry.ts` + the stream route).
   Human decisions log `actor: 'human'`. `ACTION_TOOL_NAMES` distinguishes writes from reads —
   extend it when you add an action tool.

## 3. The seam you replace

**One provider seam:** `lib/ai/provider.ts`. Today `DEMO_MODE=scripted` (default) resolves every
agent to a deterministic `LanguageModelV4` script (`lib/ai/scripted/`, per-agent beats in
`lib/agents/<agent>/script.ts`). Going live means resolving a real model (e.g.
`claude-sonnet-5` via the AI SDK provider) when a key is present.

**Non-negotiable (demo-safety, brief §7d): the scripts stay.** Live mode is the upgrade;
scripted is the fallback per rehearsed beat. Do not delete script files — a rehearsed demo must
never depend on a network.

What the live model actually does per surface:

| Behavior | Today (scripted) | Live |
|---|---|---|
| Intent → tool choice | keyword match in `script.ts` | model tool-calling over the same tool defs |
| Policy doc → candidate rules | `parsePolicyDocument` returns the checked-in fixture, selected by filename | **the genuine LLM task**: parse real doc text into rule candidates *constrained to the machine-readable rule shape* (`lib/sentinel/policy.ts`, `card-activation-policy.ts`); a human still approves before anything is stored |
| Unprompted recommendation | scripted next turn | model turn grounded in the `queryViolations` tool result — it cites figures from the payload, never computes its own |
| Report narrative | checked-in constant, marked `<!-- narrative: live-model slot (D2) -->` in `lib/sentinel/report-template.ts` | model writes the executive-summary prose; figures stay template-interpolated |
| Chat prose between tools | scripted narration | model text |

**AI SDK warning (standing rule, CLAUDE.md):** AI SDK v7 postdates your training data. Consult
https://ai-sdk.dev/docs before writing integration code; `docs/ai-sdk7-notes.md` records
verified findings (e.g. `ToolExecutionOptions` carries `toolCallId`/`messages`/`context` but NOT
`runtimeContext`; telemetry's `includeRuntimeContext` is an allow-list).

## 4. What is already real vs mocked

Already real (keep, do not rewrite): the rule store (`lib/rules/store.ts`, in-memory — swap for
a DB behind the same functions), both policy evaluators re-deriving from seed data
(`lib/sentinel/au-exceptions.ts`, `ca-exceptions.ts`, registered in `lib/rules/evaluators.ts`),
all HTTP endpoints (thin wrappers over the same lib functions the tools call — that is
deliberate: tool call = endpoint, implemented once), the report generator, identity pinning,
the approval flow, telemetry, all renderers.

Mocked / demo-grade — your production integration points:

| Piece | Today | Real version |
|---|---|---|
| `POST /api/remediate` | deterministic confirmationId, no side effect | actual batch AU removal + notifications |
| `queueActivationOutreach` | deterministic `ca-out-…` id | actual outreach queue |
| Card activation execution | policy check real, "activation" is a status string | core-banking activation call after the check passes |
| Account data | deterministic seed (`lib/soe/seed/*`, day-offset dates from `DEMO_ANCHOR_DATE`) | the servicing microservice; keep `lib/soe/adapter.ts`'s getter signatures as the boundary |
| Doc upload | file picker accepts any file, content pinned to fixture | real text extraction feeding `parsePolicyDocument` |
| Identity | persona → account map (`lib/agents/servicing/identity.ts`); persona rides in the runId (`servicing-<persona>-<uuid>`) | real authenticated customer context; cleaner threading noted in `identity.ts`'s header. Keep the structural property: **no account-id parameter exists on any resolver or tool** |

## 5. Gotchas that cost prior agents time

- **Dependencies are frozen** at the lockfile. Fonts are vendored (`public/fonts` +
  `app/fonts.css`) because a `next/font/google` build fetch failed offline — do not reintroduce
  network dependencies.
- `instrumentation.ts` registers telemetry **once per server process**; after editing
  `lib/events/telemetry.ts`, restart the dev server or writes mis-log as `tool.executed`.
- No `Math.random()`/`Date.now()` on any tested path. Deterministic ids follow
  `rem-…`/`act-…`/`ca-out-…` + anchor-compact patterns.
- Tests pin **both anchors** (`DEMO_ANCHOR_DATE=2026-08-05` / `2026-08-19`); golden figures
  (962/87/74 · 61/19/7 · 214/41 · 12/29) are derived from data in tests, never restated.
- `activePolicyId()` = policy of the last stored rule; AU → CA → re-approving AU in one session
  leaves CA active (reset clears). Fine scripted; decide explicitly when live.
- `/api/sentinel/remediate`'s zod accepts `agentId` starting with `sentinel` or exactly `ops`.
- `ViolationsDashboard` rows are capped at 50 by schema; the ops resolver samples 12 across
  rules (largest remainder) — "Showing N of M" covers it.
- The embedded IDE browser pane throttles timers and serves stale frames when hidden — verify
  UI via Playwright, not the pane (repeated hard-won lesson).

## 6. Definition of done for the live swap

1. `npx tsc --noEmit` 0 · `npm run lint` clean · `npm run test` all green (665 at handoff; the
   scripted suites must still pass — scripted mode remains a supported path).
2. `npm run build` passes **with the network disabled**.
3. `node scripts/demo-replay.mjs` 30/30 against a cold `npm start` (wire-level; model-agnostic).
4. All three phases click through live: both gates on `/ops` (approve AND decline paths),
   both servicing personas, report downloads.
5. Event Log shows the full trail for every flow: `approval.requested` (agent) →
   `approval.granted`/`approval.denied` (**human**) → `action.executed` — and a declined gate
   executes nothing.
6. A model outage mid-demo degrades to the scripted fallback, not an error screen.
