# Live-LLM implementation plan (branch `live-llm`)

**Goal:** replace the scripted model with a real AI SDK 7 agent connection to the local-network
LLM, keep every tool mocked exactly as it is today, and delete everything in Cardinal that does
not serve the three demo phases — Authorized-user policy (`/ops`), customer servicing chat
(`/servicing`), Card-activation policy (both surfaces).

Companion docs: `HANDOFF_LIVE_LLM.md` (the seam map this plan executes), `DEMO_THESIS.md`
(what the demo is), `docs/ai-sdk7-notes.md` (verified SDK surface), `ai-sdk-v7.md`
(local-endpoint notes; gitignored).

---

## 1. Groundwork verified 2026-07-30 (all against the frozen lockfile)

The endpoint and the full SDK path were smoke-tested before writing this plan. Everything the
swap depends on works:

| Check | Result |
|---|---|
| `GET /v1/models` (unauthenticated by design) | llama.cpp `b9305`, Qwen3.6-35B-A3B, 262k ctx, aliases `gpt-4.1-turbo`/`gpt-4.1`/`gpt-4-turbo`/`qwen3.6-35b-a3b` |
| `POST /v1/chat/completions` with `Bearer local-test` | 200, correct completion |
| Native OpenAI-style tool calling (raw HTTP) | `finish_reason: "tool_calls"`, well-formed JSON arguments |
| `generateText` tool loop via installed SDK | 2 steps (tool call → grounded narration), ~950 ms, model cited only tool-result figures |
| `ToolLoopAgent.stream()` → `toUIMessageStream()` (the production path) | parts `step-start, tool-*, step-start, text`, ~600 ms |
| `generateObject` (grammar-constrained structured output) | schema-perfect JSON, ~1 s — de-risks the future live `parsePolicyDocument` |

**Two findings that shape the design:**

1. **`@ai-sdk/openai-compatible` is NOT installed** (deps frozen — no installs). The installed
   `@ai-sdk/openai@4.0.18` covers it: `createOpenAI({ name, baseURL, apiKey })` is supported,
   **but the default factory targets OpenAI's Responses API** — a llama.cpp endpoint needs
   **`.chat(modelId)`** (the SDK's own error message prescribes exactly this). Verified working.
2. **`ai-sdk-v7.md` was written against `ai@7.0.44`; we run `7.0.35`.** Both `stepCountIs` and
   `isStepCount` exist in 7.0.35, so its examples still run — but where the two notes files
   disagree, `docs/ai-sdk7-notes.md` (verified against the installed dist) is authoritative.
   Keep using `stepCountIs`, the current codebase convention.

## 2. The design — one file grows a fourth provider

The architecture already isolates this change: agents are real `ToolLoopAgent`s with real tool
definitions, native approval gates, and telemetry; only the model behind
`lib/ai/provider.ts#getAgentModel()` is scripted. Nothing changes in agents, tools, routes,
renderers, or the wire contract.

### 2a. `lib/ai/provider.ts`

Add `'local'` to the `CardinalProvider` union:

- `CARDINAL_PROVIDER=local`
- `requiredEnvVars('local')` → `['LOCAL_LLM_BASE_URL', 'LOCAL_LLM_API_KEY']`
  (base URL stays in env because the host IP is DHCP-assigned — never hardcode it)
- `CARDINAL_MODEL` defaults to `'gpt-4.1-turbo'` for `local` (same precedent as the
  anthropic default; all four aliases resolve to the same backing model)
- Resolution: `createOpenAI({ name: 'local', baseURL, apiKey }).chat(modelId)` — **`.chat()`,
  never the bare factory** (finding 1 above)
- `.chat()` returns `LanguageModelV4` concretely, so the existing
  `as LanguageModelV4` cast in `getAgentModel` and the `createFallbackModel` wrapper both keep
  working unchanged.

### 2b. Mode semantics — no new mode needed

`DEMO_MODE` already expresses both postures we want (`lib/ai/demo-mode.ts`, untouched):

| Config | Behavior | Use |
|---|---|---|
| `DEMO_MODE=scripted` + local provider configured | live model first, per-call scripted fallback on error/timeout (`DEMO_LLM_TIMEOUT_MS`, default 8000 — generous: local responds < 1 s) | **the demo posture** — satisfies handoff DoD #6 (outage degrades to script, not an error screen) |
| `DEMO_MODE=live` | raw local model, errors surface | dev/tuning, so misbehavior is visible instead of silently masked by fallback |
| `DEMO_MODE=scripted`, no provider env | pure script, no network | unchanged; tests and `demo-replay.mjs` keep running here |

**The scripts stay** (handoff §3 non-negotiable): `lib/ai/scripted/`, `lib/agents/ops/script.ts`,
`lib/agents/servicing/script.ts` are the rehearsed fallback, not dead code.

### 2c. Env files

- `.env.example` (committed): document the `local` provider block.
- `.env.local` (gitignored, created on this machine):

  ```
  CARDINAL_PROVIDER=local
  LOCAL_LLM_BASE_URL=http://192.168.6.63:8080/v1
  LOCAL_LLM_API_KEY=local-test
  DEMO_MODE=live        # dev posture; flip to scripted for the rehearsed demo
  ```

### 2d. What "tools stay mocked" means here

Nothing. That is the point — the tool resolvers already run against seed data and deterministic
ids (`rem-…`, `ca-out-…`), and no tool schema lets the model author a figure (CLAUDE.md 5a).
The live model changes who *chooses* the tool calls and writes the narration between them; every
number on screen still comes from the same `lib/` functions. Zero resolver changes this
iteration.

## 3. Phase A — cleanup (delete everything outside the demo)

> Scope verified by a full import-graph sweep (Explore pass, this session). Every DELETE below
> has all of its importers also deleted or trimmed; every trap found is called out in §3d.
> Cleanup lands first as its own commit(s), so the provider change sits on a minimal tree.

### A0. `scripts/demo-replay.mjs` must be trimmed in the SAME commit

The replay currently drives the deleted surfaces, so "30/30 stays green" is impossible as
stated — the gate becomes **all remaining beats green** (record the post-trim count in the
commit message). Delete: `beatDashboard`, `beatWorkflows`, `beatSentinelServes`,
`beatSentinelReport`, `beatSentinelAuditIngestion`, `runAskBeat`/`ASK_QUESTIONS`,
`runMonitorAgentBeat` + the three monitor fixtures, the payment-health Repeatability beat, and
`beatEventLog`'s `approvalTargets` list for deleted agents' tools. **Keep Beat 8** (the
`/api/sentinel/remediate` byte-identity check — that route survives) and all servicing + ops
wire beats (rules → violations → remediate → report → cards/activate → reset).

### A1. DELETE — every importer is itself deleted

- **Pages:** `app/ask/`, `app/runs/`, `app/workflows/`, `app/sentinel/` (each `page.tsx` +
  `error.tsx`). `app/page.tsx` is a **trim**, not a delete — see A2.
- **API routes:** `app/api/sentinel/report/` (+ test), `app/api/sentinel/audit/` — stage-only;
  ops' report card points at the different top-level `/api/report`.
  **NOT `app/api/sentinel/remediate/`** (§3d trap 1).
- **Agents:** `lib/agents/{ask,au-growth,bt-lifecycle,payment-health}/` entirely (~20 files,
  incl. their `resolvers.test.ts`). Confirmed only imported by the registry, `scripts.test.ts`,
  and deleted pages.
- **Scenario machinery:** `lib/sentinel/scenario/{player,demo-scenario,graph-rehearsal,smoke-scenario}.ts`
  + their 4 test files (~6,700 L). `scenario/types.ts` is a **trim** (§3d trap 4).
- **Component trees:** `components/dashboard/*` (only importer: old home page),
  `components/workflow-canvas/*`, `components/run-view/*` **except `utils.ts`**,
  `components/ask/*` **except `utils.ts` and `evidence-error-boundary.tsx`**,
  `components/sentinel/{stage,presenter-bar,context-rail,conversation-rail,audit-strip,policy-panel}.tsx`,
  `components/sentinel/evidence/{decision-card,policy-exception-table,remediation-report,rule-citation}.tsx`.
- **Registry components** (after the barrel trims in A2, or the build breaks mid-way):
  `trend-chart`, `payment-history-table`, `risk-badge`, `bt-timeline`,
  `interest-projection-chart`, `party-graph`, `bar-breakdown`, `outreach-draft-card`.
  Kept surfaces render only **MetricRow, CategoryPie, TransactionTable, ApprovalCard** plus the
  sentinel evidence trio (RuleDiff, ViolationsDashboard, ReportCard).
- **Dead vendored AI Elements:** 43 of 47 files in `components/ai-elements/` have zero
  importers outside the directory (pre-existing dead vendor code). Live set: `conversation.tsx`,
  `message.tsx`, `reasoning.tsx`, `suggestion.tsx`, `shimmer.tsx`. Delete the rest.

### A2. TRIM — shared files that lose members (exact edits from the map)

| File | Edit |
|---|---|
| `app/page.tsx` | replace all 169 L with a 3-line `redirect("/ops")` — keeps `resetDemo()`'s hard-navigate to `/` working (§3d trap 5) |
| `lib/agents/registry.ts` | drop the 4 agent imports, union members, `AGENT_IDS`/`AGENT_NAMES` entries, and switch cases; keep `isCardinalAgentId`, `createAgentRunStreamResponse`, `CardinalUIMessage` — the stream route uses all three |
| `components/shell/nav.tsx` | delete the 5 `parked: true` entries, the `parked` render branch, and the field from the type |
| `components/event-log/constants.ts` | trim `AGENT_FILTER_OPTIONS` to ops + servicing — it deliberately does NOT import the registry, so **no compiler error will flag it** |
| `components/registry/index.tsx` | remove imports/exports/`EvidenceRenderer` cases for the 8 deleted components (client barrel — must be edited atomically with the deletions) |
| `components/sentinel/evidence/index.tsx` | remove `DecisionCard`/`PolicyExceptionTable`/`RemediationReport`/`RuleCitation`/`OutreachDraftCard` branches; keep `RuleDiff`, `ViolationsDashboard`, `ReportCard` + fallthrough |
| `lib/sentinel/scenario/types.ts` | shrink ~391 L → ~30 L: keep `SentinelNodeId`, `SentinelNodeState`, `SentinelGraphEdge`, `SENTINEL_NODE_IDS` (the live ops graph types); everything else serves the deleted player |
| `lib/agents/scripts.test.ts` | keep ONLY the servicing describe block + its imports — it is servicing's only end-to-end script walk (ops' equivalent lives in `lib/agents/ops/script.test.ts`); delete the 4 other agents' blocks |
| `components/run-view/utils.ts` | keep `readStringField` + `humanizeComponentName` (both chat surfaces import them); the rest becomes dead and may be pruned |

Left alone this pass (deliberate): `lib/sentinel/registry.ts` (4 schemas become renderer-less
but stay in the union `ops/resolvers.ts` validates against — safest whole) and `components/ui/`
shadcn primitives that lose their last importer (inert infra, not product surface).

### A3. KEEP — the full load-bearing set

- **`app/api/sentinel/remediate/`** — see §3d trap 1. Also `app/api/remediate/route.ts`, which
  is **literally one line**: `export { POST } from '../sentinel/remediate/route'`.
- `lib/sentinel/` non-scenario modules: `policy.ts`, `card-activation-policy.ts`,
  `au-exceptions.ts`, `ca-exceptions.ts`, `activate-card.ts`, `exception-fixture.ts`,
  `dashboard-fixture.ts` (feeds two kept component tests), `registry.ts`, `report-template.ts`.
- `app/events/` + `components/event-log/` + `lib/events/` — Event Log is DoD #5.
- `lib/soe/` seed + arithmetic tests (frozen), all of `lib/rules/`, `lib/registry/`,
  `lib/ai/scripted/`, both agents' `script.ts`, all kept API routes,
  `components/registry/approval-card.tsx`.

### A4. Traps the map caught (why a naive sweep breaks the build — or worse, runtime)

1. **`lib/agents/ops/resolvers.ts` imports the route handler** from
   `app/api/sentinel/remediate/route.ts` and calls it in-process — ops Gate 2's execution
   path. A `lib/ → app/` inversion; deleting "the sentinel API namespace" breaks `/ops` at
   **runtime**, not build time.
2. **`components/sentinel/live-agent-graph.tsx` + `components/ops/graph-state.ts`** — the
   spectacle graph beside the `/ops` chat. `graph-state.ts`'s header says "DECORATIVE" but
   `ops-conversation.tsx` imports both. Keep.
3. **`components/ask/utils.ts` + `evidence-error-boundary.tsx`** — imported by BOTH kept chat
   surfaces. `rm -rf components/ask` breaks `/ops` and `/servicing`.
4. **`lib/sentinel/scenario/types.ts` is dual-purpose** — graph types for the live ops rail +
   dead player types. Trim, don't delete.
5. **`resetDemo()` hard-navigates to `/`** (`components/shell/reset-control.tsx`) from every
   page — a deleted home page means every demo reset lands on a 404. The redirect covers it.
6. `.claude/worktrees/**` holds duplicate test copies — already excluded by `vitest.config.ts`;
   ignore that tree.

### A5. Cleanup gates

`npx tsc --noEmit` 0 · `npm run lint` clean · `npm run test` green (post-trim count recorded in
the commit message) · `npm run build` offline-green · `node scripts/demo-replay.mjs` all
remaining beats green (post-trim count recorded) · manual click-through of `/ops`, `/servicing`,
`/events`, and the reset control.

## 4. Phase B — the provider seam

1. Extend `lib/ai/provider.ts` per §2a; update `.env.example`; create `.env.local`.
2. Add `lib/ai/provider.test.ts`: env-driven resolution for all four providers
   (`local` asserts provider name `local` + default model id; missing-var messages from
   `assertProviderConfigured`; no network in tests).
3. `scripts/live-smoke.mjs` (+ `npm run verify:live`): standalone, reads the same env vars,
   runs one `ToolLoopAgent` tool-loop turn against the endpoint and asserts *structure only*
   (a tool part, then non-empty text, no error part) — the pre-demo go/no-go for the live path,
   complementing `demo-replay.mjs` for the scripted path.
4. Gates: everything in §A5, plus `verify:live` passes.

## 5. Phase C — live verification and tuning

With `DEMO_MODE=live`, click through all three phases (Playwright, not the IDE pane — handoff
§5) and fix by **adjusting instructions/params, never by weakening invariants**:

1. **Ops AU flow**: upload → parse → G1 approve → sweep → *unprompted recommendation arrives in
   the same turn* → G2 approve → report. Then the decline paths: G1 declined and G2 declined
   execute nothing (denied call surfaces as `output.type === 'execution-denied'` — the model
   must acknowledge and stop, per instructions).
2. **Ops CA flow**: CA doc → rules → sweep → `queueActivationOutreach` gate — model must pick
   the fork the tool results name, never the other action tool.
3. **Servicing**: both personas (`?persona=happy|blocked`), Q&A + `updateContactInfo` gate +
   activate-card gate.
4. **Event Log**: full trail per flow — `approval.requested` (agent) → granted/denied
   (**human**) → `action.executed`; declined gates execute nothing.
5. **Fallback drill**: kill the LLM server mid-conversation in `DEMO_MODE=scripted` — the beat
   degrades to script, no error screen (DoD #6).

Known tuning risks for a 35B open model (mitigations in that order — prompt, then params):
skipping the unprompted-recommendation beat (step 4 of the ops instructions), calling both
action tools, free-chatting figures, mishandling a denial. If narration quality wobbles,
consider `temperature: 0.2` on the agent call (server default is 0.7) — but only after prompt
fixes, since the scripted fallback must remain byte-stable regardless.

## 6. Explicitly out of scope this iteration

- Real backends behind `remediate` / outreach / activation / account data (handoff §4 table).
- Live doc-text extraction — `parsePolicyDocument` stays fixture-driven, filename-selected.
- The live report-narrative slot (`report-template.ts` D2 marker) — stays the checked-in
  constant.
- Any dependency change. The lockfile is untouched.

## 7. Execution notes

- Implementation runs on **Sonnet subagents** (one per phase-sized work item, worktree-isolated
  where they touch overlapping files); this plan is their spec. The orchestrator reviews diffs
  against the gates before each commit.
- Commit sequence: `A` cleanup (possibly split: pages/agents → components → trims; the replay
  trim rides whichever commit deletes its beats' targets), `B` provider seam, `C` tuning fixes —
  each commit green on all gates.
- Deliberate deferral: the `lib/ → app/` inversion (ops resolvers importing the
  `/api/sentinel/remediate` handler) works and stays; unwinding it (handler into `lib/`, both
  routes re-export) is a clean follow-up, not part of this swap.
- `serve.ps1` runs on the LLM host, not this machine; if `curl $LOCAL_LLM_BASE_URL/models`
  refuses, the host IP moved (DHCP) — fix `.env.local`, not code.
