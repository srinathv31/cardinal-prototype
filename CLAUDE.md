# Cardinal — build notes for Claude

**`CARDINAL_BRIEF.md` is the source of truth for v1** (Command Center, Workflow Canvas, Agent Runs, Ask, Event Log) — every decision on those screens defers to it, and **v1 screens do not change.** Build only what the demo script (brief §3) needs. `AGENTS.md` carries current Next.js 16 conventions.

**`CARDINAL_V3_AU_BRIEF.md` is the source of truth for the Sentinel stage (`/sentinel`) and the servicing chatbot (`/servicing`).** It **replaces** the v2 balance-transfer stage: `CARDINAL_V2_SENTINEL_BRIEF.md` is historical only — read it for context, never as a spec. `docs/v3-migration-map.md` records what v3 keeps, removes, and rewrites, and the v1 assertions that must stay green.

## Architecture invariants (brief §5 — non-negotiable)

- **5a. The LLM is a router, not a data source.** "The model never generates a number, date, name, or balance."
- **5b. All intelligence lives server-side; the frontend is renderers.** "Zero business logic in components." Wire format documented in `docs/wire-contract.md`.
- **5c. Component registry (the only things the model may render):** MetricRow · TrendChart · BarBreakdown · CategoryPie · PaymentHistoryTable · TransactionTable · BTTimeline · InterestProjectionChart · PartyGraph · RiskBadge · OutreachDraftCard · ApprovalCard.
- **5d. Approval gates are real pauses.** "No auto-approve paths, no approval timeouts." Use AI SDK 7's native tool-approval flow; only side-effect tools require approval.
- **5e. Everything writes to the Event Log.** Every step logs `{ runId, agentId, step, toolName, inputSummary, outputSummary, actor ('agent' | 'human'), timestamp }` via AI SDK 7's telemetry/lifecycle events.

## Standing instruction — AI SDK

AI SDK v7 (June 2026) postdates your training data — the message-parts model and streaming wire format changed in v6, and agent/approval APIs changed again in v7. Always consult the official docs at https://ai-sdk.dev/docs before writing any AI SDK integration code. Never write it from memory.

## Commands

- `npm run dev` — dev server (Turbopack)
- `npm run build` — production build + typecheck
- `npm run lint` — ESLint
- `npm run test` — vitest (seed arithmetic invariants, pinned at both demo anchors)

## Project rules

- **Dependencies are frozen** at the W0.1 lockfile commit (brief §2) — no installs or upgrades for any reason. shadcn + AI Elements components are already vendored (note: 3 ai-elements files carry small patches for the ai@7 type surface).
- **All data access goes through `lib/soe`** (the adapter). Nothing imports seed data directly. Checked-in *fixtures* that are not seed data — `lib/sentinel/policy.ts`, the scenario files — are imported directly; the rule governs account data.
- **Seed dates are day-offsets from the demo anchor** (start of today, UTC) so relative story facts hold on both demo dates; amounts are fixed literals. Set `DEMO_ANCHOR_DATE=YYYY-MM-DD` to pin the anchor.
- **Sentinel seed additions are additive collections**, never merged into `SeedDb.accounts` / `parties` / `accountPartyRoles` / `payments` — v1's nine-account arithmetic and its pinned tests stay frozen (`docs/v3-migration-map.md` §3).
- **The Sentinel stage is 100% scripted** — no LLM calls, no network dependency, no `Math.random()` anywhere in the scenario path. `docs/wire-contract.md` §9 is the stream a real runtime must emit; `ScenarioPlayer` is the reference implementation, not the spec.
