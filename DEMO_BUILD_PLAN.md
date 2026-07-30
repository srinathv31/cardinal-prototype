# Demo build plan — branch `demo-aug4`

Companion to `DEMO_THESIS.md` (the *what*). This is the *how*: decisions, contracts, wave plan,
file ownership, and gates. Subagents build from this document; the orchestrator (Fable) owns UI
direction, reviews every diff, and runs QA. **If this plan and DEMO_THESIS.md conflict, the
thesis wins.**

## Decisions (locked — do not relitigate in a subagent)

- **D1 — Overhaul = demo-first, not deletion.** New surfaces become the app's front door; v1
  screens and the Sentinel scripted stage are parked (delinked, not deleted). Deleting working
  code two days before a demo buys nothing and risks the green test suite (336 tests stay green).
- **D2 — Scripted-first, live-ready.** No `ANTHROPIC_API_KEY` exists in this environment, so the
  demo default is the existing `DEMO_MODE=scripted` seam (`lib/ai/provider.ts` +
  `lib/ai/scripted/`). Every rehearsed beat gets a checked-in script — non-negotiable. If a key
  arrives, live mode is a flag flip; scripts become the fallback.
- **D3 — Tool call = endpoint, implemented once.** Agent tools call `lib/` functions directly;
  the HTTP routes are thin wrappers over the *same* functions so external partners integrate
  against real endpoints. Every step still writes to the Event Log.
- **D4 — Rule template lives in the system prompt** for Tuesday. `GET /rules/template` is
  deferred; the thesis notes it as TBD.
- **D5 — Surfaces.** Ops chat at **`/ops`** (new route, reuses Ask's conversation machinery +
  native tool approval). Customer chat stays at **`/servicing`** (extended). The agent workflow
  graph renders beside the ops chat as **spectacle** — animated by tool lifecycle, decorative.
- **D6 — Card-activation personas are server-mapped.** `?persona=happy|blocked` →
  server-side map to a pinned account (happy = Patel, clean; blocked = Marcus, has the missed
  payment in v1 seed). Identity stays server-pinned per request — the model never picks accounts.
- **D7 — All seed additions are additive collections** (repo rule). `cardActivations` never
  merges into payments/accounts. Evaluators re-derive from data; tests never restate the
  generator's plan.

## Contracts

### Rule store — `lib/rules/store.ts` (in-memory, reset-able)

```ts
type PolicyId = 'authorized-user' | 'card-activation';
type StoredRule = {
  id: string;            // 'R1' | 'R2' | 'R3' | 'CA-R1' | 'CA-R2'
  policyId: PolicyId;
  title: string;
  requirement: string;   // human sentence, cited from the doc
  citation: string;      // doc section reference
  machine: string;       // machine-readable footer (existing RuleDiff pattern)
  addedAt: string;       // ISO
};
saveRules(policyId, rules[]): { saved: number }
getRules(policyId?): StoredRule[]
resetRules(): void       // wired into POST /api/reset
```

Store starts **empty** — "no rules configured" is a true demo state until the upload beat.

### Endpoints (thin wrappers over lib)

| Route | Verb | Behavior |
|---|---|---|
| `/api/rules` | POST | `{policyId, rules[]}` → saveRules. Logs to Event Log. |
| `/api/rules?policyId=` | GET | stored rules |
| `/api/violations?policy=authorized-user` | GET | ViolationsPayload from `getAuScanPortfolio()` + `evaluateAuPolicy()`, **filtered to stored rule ids**; empty-rules → `{error:'no rules configured'}` |
| `/api/violations?policy=card-activation` | GET | same shape from the card-activation evaluator |
| `/api/cards/activate` | POST | `{persona}` → runs stored CA rules against pinned account → `{status:'activated', confirmationId}` \| `{status:'blocked', ruleId, finding}` |
| `/api/remediate` | POST | already exists as `/api/sentinel/remediate` — re-export at the new path, keep old path working |
| `/api/report` | GET | Wave 2: HTML report file, `Content-Disposition: attachment` (CSV precedent exists) |

### ViolationsPayload (one shape for both policies)

```ts
{
  policyId: PolicyId;
  summary: { scanned: number; accountsAffected: number; exceptions: number };
  byRule: Array<{ ruleId: string; title: string; count: number }>;
  rows: Array<{
    accountId: string; holder: string; ruleId: string; ruleTitle: string;
    finding: string;               // complete sentence, from evaluator — never model-authored
    detail: Array<{ label: string; value: string }>;  // drill-down facts, preformatted server-side
  }>;
}
```

`rows[].detail` carries **everything drill-down needs** — the click-into interaction is pure
client state, no second fetch, no model involvement (invariant 5a).

### Card-activation domain (new, additive)

- Seed: `lib/soe/seed/card-activation.ts` — additive `SeedDb.cardActivations`
  `{ accountId, cardId, issuedDate (day-offset), activatedDate?, channel }`. Own PRNG seed
  constant. Deterministic at both demo anchors.
- Rules fixture (`lib/sentinel/policy.ts` additive or sibling file): **CA-R1** no activation
  while the account is past-due; **CA-R2** cards must be activated within 45 days of issuance.
- **Pinned figures (golden test, exact):** 214 cards issued in the window · **41 out-of-compliance
  = 29 (CA-R2 unactivated > 45d) + 12 (CA-R1 activated while past-due)** · no overlaps.
- Evaluator re-derives from `SeedDb` (payments for past-due), mirrors `au-exceptions.ts`.
- Personas: Patel has a fresh unactivated card, clean account → happy path. Marcus has a fresh
  card + his existing missed payment → CA-R1 block. Both asserted in tests.

### UI components (registered in the sentinel/ops registry, rendered as chat evidence)

- **`ViolationsDashboard`** — the wow centerpiece. Props = ViolationsPayload. Stat tiles
  (scanned / accounts / exceptions), per-rule bar breakdown, and the account table; clicking a
  row expands an inline drill-down panel (account facts + which rule failed + finding sentence).
  Exec-grade: generous type, tabular-nums, no dead grey boxes. Dark theme (app is dark-only).
- **`ReportCard`** — filename, generated-at, one-line summary, download button hitting
  `/api/report`.
- Activation Activate/Cancel and both batch gates reuse the existing **ApprovalCard** + native
  tool-approval flow — same machinery, different labels. No new gate UI.

### Ops agent (`lib/agents/ops/`) — tools, in demo order

| Tool | Kind | Backing |
|---|---|---|
| `parsePolicyDocument` | read | doc text in, candidate rules out (scripted: recognizes the checked-in policy fixtures) |
| `saveRules` | **approval-gated** (G1) | `lib/rules/store.saveRules` |
| `queryViolations` | read | evaluator via lib; renders `ViolationsDashboard` |
| `recommendRemediation` | read | **the unprompted beat**: after queryViolations returns, the script's next agent turn volunteers the recommendation citing the rule |
| `executeBatchRemoval` | **approval-gated** (G2) | existing remediate lib (mocked: "kicked off in batch", deterministic confirmationId) |
| `generateReport` | side-effect, auto-follows G2 approval | renders `ReportCard` → `/api/report` |

Doc upload: file input on `/ops`; upload resolves to the checked-in policy fixture content
(mock file-drop precedent from the v3 policy panel). The *file* is real; the *content* is pinned.

## Waves and ownership (file sets are disjoint — parallel agents NEVER share a file)

**Wave 0 — orchestrator (done):** branch `demo-aug4`, thesis + this plan committed, CLAUDE.md
pointed here.

**Wave 1 — parallel, background:**
- **A. srv-foundation** *(Opus)* — `lib/rules/**`, `app/api/rules/**`, `app/api/violations/**`,
  `app/api/remediate/**` (re-export), edit `app/api/reset/route.ts`. AU wired for real;
  card-activation slot left as a registry entry Wave 2 stitches. Tests.
- **B. card-activation-domain** *(Sonnet — au-portfolio.ts is the template to copy)* —
  `lib/soe/seed/card-activation.ts(+test)`, evaluator + fixture, additive edits to
  `lib/soe/types.ts`, `lib/soe/seed/index.ts`, `lib/soe/adapter.ts`, `app/api/cards/activate/`.
  Golden figures above are the acceptance test.
- **D. exec-dashboard-ui** *(Opus)* — `ViolationsDashboard` + `ReportCard` components + registry
  entries + schemas. Builds against the ViolationsPayload contract with a checked-in sample
  fixture; no server dependency.

**Wave 2 — after Wave 1 lands review:**
- **C. ops-agent** *(Opus)* — `/ops` route + agent + tools + scripts for every rehearsed beat +
  doc-upload affordance + spectacle graph wiring. Must consult ai-sdk.dev docs (standing rule).
- **E. servicing-extensions** *(Sonnet)* — next-statement evidence kind + `activateCard`
  approval-gated tool + persona pinning + scripts for happy/blocked paths.
- **F. report** *(Sonnet)* — `/api/report` HTML template render + download.

**Wave 3 — integration + QA (orchestrator-led):** stitch card-activation into `/api/violations`,
full click-throughs of all three use cases, projector pass at 1280×800, reset → replay ×2,
`verify:demo` extended, rehearsal notes.

## Gates (every agent, every wave)

1. `npx tsc --noEmit` → 0 errors; `npm run lint` clean; `npm run test` all green (including the
   frozen v1 suites — **touching v1 seed invariants is an automatic reject**).
2. **Parallel agents never run `npm run build`** (`.next/` collides); the last sequential agent
   or orchestrator runs it.
3. Nobody edits `docs/wire-contract.md` or this plan — report contract deltas back instead.
4. Every tool execution and gate decision visible in `/events` (invariant 5e).

## Timeline

| Day | Target |
|---|---|
| Thu Jul 30 (tonight) | Wave 0 + Wave 1 dispatched |
| Fri Jul 31 | Wave 1 reviewed + merged, Wave 2 dispatched and landed |
| Mon Aug 3 | Wave 3: integration, QA, projector pass, full rehearsal |
| Tue Aug 4 / Wed Aug 5 | Demo |
