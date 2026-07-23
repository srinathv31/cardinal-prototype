# Cardinal — build notes for Claude

**`CARDINAL_BRIEF.md` is the source of truth for this build; every decision defers to it.** Build only what the demo script (brief §3) needs. `AGENTS.md` carries current Next.js 16 conventions.

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
- **All data access goes through `lib/soe`** (the adapter). Nothing imports seed data directly.
- **Seed dates are day-offsets from the demo anchor** (start of today, UTC) so relative story facts hold on both demo dates; amounts are fixed literals. Set `DEMO_ANCHOR_DATE=YYYY-MM-DD` to pin the anchor.
