# Cardinal v3 — Authorized User Policy Enforcement

**Claude Code build brief · Replaces the v2 "Sentinel" BT stage · Fully scripted (no live AI on the agent stage)**

> v3 **replaces** the v2 balance-transfer demo. The Sentinel *engine* (agent graph, policy panel, rule diff, approval gates, audit strip, ScenarioPlayer) is kept and re-pointed at an authorized-user policy; the BT-specific content, the event replay rail, and the three-act BT script are removed. v1 (Command Center, Workflow Canvas, Agent Runs, Ask, Event Log) remains untouched and demoable.

---

## 1. What this is

Two demo surfaces, shown back to back, answering two different executive questions.

**A. The Sentinel stage (`/sentinel`) — "this is what *we* mean by AI."**
A chat-driven, three-act story about enforcing an authorized-user policy across the whole portfolio at once:

- **Act I — The gap.** Nothing continuously checks authorized-user eligibility. A manual audit clears 40 accounts a month against a 962-account book: *24 months to sweep the portfolio once.* Nobody has.
- **Act II — Policy to production.** An AU eligibility policy document is dropped in. Agents parse it into machine-readable rules, park one obligation as an explicit data gap, a human approves the rule set, rules go active. Minutes, not months.
- **Act III — The sweep.** The presenter types *"Find me all the authorized user policy exceptions."* Agents run the live rules across the entire book, return an aggregate: **87 exceptions across 74 accounts**. The agent weighs three compliant response routes, selects one, and asks for approval. Approve → removals execute → a remediation report renders in the conversation and downloads as an audit artifact.

**B. The servicing chatbot (`/servicing`) — "this is what *everyone* means by AI."**
A customer-facing assistant scoped to one cardholder: latest transactions, next payment date, account summary, and a contact-information change that passes through a real confirmation gate and writes to the audit log.

**Demo order is B then A.** Two minutes of the ordinary thing, then six minutes of the thing that actually scales. The contrast does more work than either surface alone.

**The agent stage is entirely scripted.** No LLM calls, no network dependency — a deterministic `ScenarioPlayer` drives it, exactly as in v2. The servicing chatbot is a real AI SDK 7 agent that runs deterministically under `DEMO_MODE=scripted` (the default), identical to v1's Ask surface.

**Audience:** bank technology leadership. Projector, big type, high contrast, nothing critical behind hover.

---

## 2. Relationship to the existing codebase

### 2a. Kept unchanged

- `lib/sentinel/scenario/player.ts` — the ScenarioPlayer engine, its blocking semantics, speed/reset/jump
- `components/sentinel/live-agent-graph.tsx` — six-node read-only React Flow graph, all node states
- `components/sentinel/policy-panel.tsx` — drawer, mock file-drop, document preview
- `components/sentinel/evidence/rule-diff.tsx` · `rule-citation.tsx` · `decision-card.tsx`
- `components/sentinel/context-rail.tsx` · `audit-strip.tsx` · `presenter-bar.tsx`
- `app/api/sentinel/audit/route.ts` and the shared `lib/events` store
- All of v1: registry components, agents, Ask, Event Log, Workflow Canvas, Command Center

### 2b. Removed

- `lib/sentinel/scenario/demo-scenario.ts` + `demo-scenario.test.ts` (the BT three-act script)
- `lib/sentinel/policy.ts`'s BT content (file is rewritten, not deleted)
- `components/sentinel/event-replay-rail.tsx` — replaced by the conversation rail (§4)
- `components/sentinel/evidence/bt-event-detail.tsx` — no single-event hero card in v3
- `lib/soe/seed/sentinel.ts` — Marcus's BT event, Elena's promo notice, the 14-event replay log, and their tests
- `getSentinelReplayLog` / `getPromoNotices` from the adapter; `PromoNoticeRecord`, `StreamEvent['balance_transfer.initiated']`, and `BalanceTransferEvent.btCreditLineAtInitiation` from `lib/soe/types.ts`

**Removal guardrail:** Marcus's BT event currently merges into `SeedDb.balanceTransferEvents`. Its `promoEndDate` is +348 days, deliberately outside every ≤90-day window, so removing it must not change the "BTs expiring ≤ 90 days" set (Elena + bg-002 + bg-005) that v1's Beat 5 and `lib/agents/ask/resolvers.test.ts` pin. Assert this, don't assume it.

### 2c. Rewritten or extended

- `lib/sentinel/policy.ts` — AU policy document, three rules, one obligation gap (§5)
- `components/sentinel/stage.tsx` — new three-panel layout (§4)
- `lib/sentinel/scenario/types.ts` — contract changes (§6)
- `lib/sentinel/registry.ts` — two new components, one removed (§5c)
- `docs/wire-contract.md` §9 — **rewritten in place as the v3 Sentinel stream.** v2's BT variant is superseded, not archived. The contract is a handoff artifact for the integration team; one clean current version beats an archaeological record.

**Hard rule, unchanged from v2:** no changes to v1 screens. Shared additions go in shared directories; Sentinel-specific code stays under its own route/module.

---

## 3. The demo script

Target runtime ~8 minutes. Presenter-triggered throughout; act transitions are never automatic.

### Part B first — Servicing chatbot (~2 minutes)

Open on `/servicing`, signed in as one cardholder (identity is server-pinned, §7).

1. *"What are my latest transactions?"* → **TransactionTable** renders, scoped to this account.
2. *"When is my next payment due?"* → **MetricRow**: due date, amount due, minimum due, autopay status.
3. *"I need to update my phone number."* → the agent proposes the change; a **confirmation gate** renders (the same approval machinery, pointed at the customer, not at an ops user). Presenter confirms. The change applies, and an entry lands in the Event Log with `actor: 'human'`.
4. Presenter beat: *every answer on that screen is a rendered component fed by the servicing data layer. The model chose which one to show; it did not write a single number.*

### Part A — Sentinel

#### Act I — The gap (~60 seconds)

1. Stage opens: conversation rail (left) empty with a single system line, agent graph (center) fully dim, context rail (right) showing the **Manual Audit** card:
   *"Authorized-user eligibility review · Sampling: 40 accounts/month · Portfolio: 962 accounts with authorized users · Time to full coverage: 24 months · Last completed full review: none on record."*
2. Counter lands in large type: **1,247 authorized-user relationships · 0 continuously monitored · 0 flagged.**
3. Presenter beat (no UI): nothing here is broken. There is simply no mechanism. A rule that only exists in a PDF is not a control.

#### Act II — Policy to production (~2.5 minutes)

1. Presenter opens the **Policy panel** and drops in `AU-Eligibility-Policy-2026.docx` (mock file-pick; seeded content, §5).
2. The graph wakes: Orchestrator → Policy Analyst → Rule Engineer → Critic light in sequence, edges animating, narration streaming in the conversation rail — reading sections, extracting obligations, drafting rules, critic validating each against available SOE data.
3. The **Rule Diff view** renders four rows: R1, R2, R3 as drafted rules with cited excerpts, plain-English restatements, and machine footers — plus **O4 as a visually distinct data-gap row** with no machine footer and the Critic's reason it was parked.
4. **ApprovalCard**: *"Activate 3 rules for continuous enforcement. 1 obligation parked pending data onboarding."* Presenter approves. Rules flip to **Active**; the graph settles into `armed`; an audit entry lands.
5. Counter beat: **Policy → production: 4 obligations extracted · 3 rules active · 1 data gap · 1 human approval.**
6. Presenter beat: the fourth row is the important one. An agent that knows what it *can't* check is the one you can trust on what it says it *can*.

#### Act III — The sweep (~3 minutes)

1. The rule store header shows **"Continuous · nightly 02:00 UTC · last run 4h ago"** with a **Run now** control. Presenter types into the conversation rail:
   *"Find me all the authorized user policy exceptions."*
2. The graph ignites. **Data Collector fires three times, visibly** — accounts, party roles + parties, payment history — because the three rules span three datasets. Narration streams the scan.
3. Aggregate evidence renders progressively in the context rail:
   - **MetricRow** — 1,247 relationships scanned · 962 accounts · 87 exceptions · 74 accounts affected
   - **BarBreakdown** (`unit: 'count'`) — exceptions by rule: R1 secured card **61** · R2 not in good standing **19** · R3 minimum age **7**
   - **PolicyExceptionTable** — the flagged relationships, showing 12 of 87, each row citing the rule it breaks
4. The agent drills into one exemplar and renders a **RuleCitation** for it: R1's text quoted verbatim from the active rule set, with the conditions checked ✓✓. Cited, not paraphrased.
5. **Compliance-pass beat (~15s):** the Patel household — a named account from v1 — gets a quiet green check: *2 authorized users, all three rules clear.* The system verifies compliance, not only violations.
6. **The decision point.** A **DecisionCard** lays out three compliant routes, then resolves them one at a time as the investigation completes:
   - `remove-all` — **rejected:** removing spend authority with no notice to the primary is an unexplained service change; it generates inbound volume and gives the cardholder nothing to act on.
   - `stage-for-review` — **rejected:** the manual queue clears 40 accounts a month. 74 accounts is a two-month backlog, and every exception stays live meanwhile. *(This is Act I's own card killing the option.)*
   - `remove-and-notify` — **selected:** remove the 87 relationships, notify each primary cardholder with the policy citation and the reinstatement path. Still requires human approval.
7. **ApprovalCard**: *"Remove 87 authorized users from 74 accounts and notify 74 primary cardholders."* The card states the scope explicitly and offers **Review the list** before approving. Presenter approves.
8. Removals execute (mock POST, §6c). A **RemediationReport** renders in the context rail — outcome counters, first rows, confirmation id — with a **Download CSV** control. Audit entries stream into the audit strip. The agent's closing line notes the report is stored in the audit table and offers the same file for download.
9. Closing counter, large type: **1,247 scanned · 87 exceptions · 74 accounts · 1 human approval · full audit trail.**
10. Optional close on `/events`: Sentinel's entries alongside v1's. One audit surface for everything.

**Reject path must work on demand.** If the presenter clicks Decline instead, nothing executes, the run closes with a logged disposition, and the audit strip shows the denial with `actor: 'human'`. Rehearse it; an exec will ask.

---

## 4. The stage (one screen)

Route `/sentinel`. Three panels plus the audit strip, no navigation during the demo:

- **Left — Conversation Rail** *(new; replaces the event replay rail)*. The chat transcript: presenter prompts echoed verbatim as user turns, agent narration streaming as assistant turns with the typing effect, and a prompt input at the foot. Input is enabled only while a `awaitStageAction` with `action: 'prompt'` is pending; a suggestion chip carries the scripted prompt so the presenter can click instead of type. **Any submitted text resolves the gate and is echoed verbatim** — the scripted response follows regardless of what was typed. Never gate on exact string matching on stage.
- **Center — Live Agent Graph.** Unchanged from v2: read-only React Flow, fixed six nodes (Orchestrator, Policy Analyst, Rule Engineer, Data Collector, Critic, Approval Gate), states `idle`/`working`/`done`/`armed`, animated edges, per-node activity captions, one-line status ticker below.
- **Right — Context Rail.** Progressive evidence components and approval cards. The Policy panel (Act II) opens as a drawer over it.
- **Bottom (thin) — Audit Strip.** Unchanged.

Narration lives in the conversation rail; evidence lives in the context rail. Keeping them separate is deliberate — it keeps the graph central and large, and stops the chat column from becoming the only thing worth looking at. *If rehearsal shows the chat doesn't read as the driver, the fallback layout is conversation-plus-inline-evidence on the left and the graph on the right, two columns. Do not build both.*

---

## 5. Policy content and seed additions

### 5a. The policy document

`AU-Eligibility-Policy-2026` — a plausible internal servicing policy, ~1 page, rendered as a document preview. All content invented; no real regulation named. Written so the three rules and the one gap are genuinely extractable, and every Rule Diff excerpt is a **verbatim substring** of the section it cites (assert this in tests, as v2 did).

Sections: *Purpose and Scope* · *Definitions* · *Product Eligibility* · *Account Standing* · *Authorized User Qualification* · *Consent and Authorization*.

`Definitions` must define **good standing** (no missed payment within the trailing 60 days and an open account status) and **secured card** (a card whose credit line is collateralized by a customer security deposit), because R1 and R2 are phrased against those terms.

### 5b. The three rules and the gap

- **R1 (hero) — Product Eligibility.** *An authorized user may not be added to, or maintained on, a secured card account.* Datasets: accounts × account-party-roles. Evaluated on current state — an AU sitting on a secured card today is an exception today. **This is the exec's headline case.**
- **R2 (cross-dataset) — Account Standing.** *An authorized user may not be added to an account that is not in good standing at the time of addition.* Datasets: accounts × payments × account-party-roles. Evaluated **at `addedDate`** against payment history — a missed payment within the 60 days preceding the addition. The temporal join is what makes this rule non-trivial, and it is the closest analogue to v2's R1.
- **R3 — Authorized User Qualification.** *An authorized user must be at least 16 years of age at the time of addition.* Datasets: parties × account-party-roles. Evaluated at `addedDate` against `Party.dateOfBirth`.
- **O4 (data gap, not a rule) — Consent and Authorization.** *The primary cardholder's written authorization must be on file for the life of each authorized-user relationship.* **Not evaluable:** no consent-document dataset exists in `lib/soe`, and none is being added. The Critic parks it; activation stays "3 rules." Reuse v2's `PolicyObligationGap` shape and the `evaluability: 'data-gap'` Rule Diff row verbatim — this beat is the credibility anchor and it plants the expansion story.

### 5c. Registry changes

`lib/sentinel/registry.ts` — remove `BTEventDetail`; keep `RuleDiff`, `RuleCitation`, `DecisionCard`; add:

- **`PolicyExceptionTable`** — the aggregate flagged-relationship table. Columns: account label, authorized user, rule id + short name, the specific finding (preformatted, e.g. *"Secured card · deposit $500 · AU added Mar 14, 2024"*), added date. Props carry a `showing`/`total` footnote pair, exactly as `TransactionTable` already does. All values preformatted server-side; the renderer performs no lookups or arithmetic.
- **`RemediationReport`** — outcome card: counters (removed, accounts touched, notifications queued), confirmation id, first N result rows, and a download control pointing at §6c's CSV route. The report's contents come from the same fixture that fed `PolicyExceptionTable` — never model-authored.

Reuse without change: `MetricRow` for the scan rollup, `BarBreakdown` (`unit: 'count'`) for the by-rule split, `ApprovalCard` for both gates, `RuleDiff` / `RuleCitation` / `DecisionCard`.

### 5d. Seed additions — the AU portfolio

Extend the existing deterministic generator; **do not fork it and do not merge into `SeedDb.accounts`.** This is an additive collection following the exact precedent `sentinelReplayEvents` and `promoNotices` set: v1's 9-account portfolio arithmetic, its KPIs, and its pinned tests stay frozen and green.

Target figures — the generator must produce exactly these, and a golden-checksum test must freeze them:

| Figure | Value |
|---|---|
| Accounts carrying at least one AU | **962** (961 generated + the Patel account from v1's cast) |
| AU relationships | **1,247** (1,245 generated + Priya and Dev Patel) |
| Secured-card accounts in the collection | 148 |
| **R1 exceptions** — AUs on secured cards | **61** relationships across 52 accounts |
| **R2 exceptions** — added while not in good standing | **19** relationships across 17 accounts |
| **R3 exceptions** — under 16 at addition | **7** relationships across 7 accounts |
| **Total exceptions** | **87** relationships across **74** distinct accounts |

Note the account arithmetic: 52 + 17 + 7 = 76, minus **2 accounts that carry two different violations** = 74 distinct. Build those two overlaps in deliberately. Someone will check whether the aggregation is real.

The **Patel household is a compliance pass** — 2 AUs, both clear on all three rules — and must be included in the scan denominator, not excluded from it. It is the Act III green-check beat and the one named, hand-checkable row in a screen full of aggregates.

`Account` gains an additive `securedCard?: boolean` and `securityDepositAmount?: number`. No other v1 type changes for the Sentinel half.

---

## 6. Contract and engine changes

`docs/wire-contract.md` §9 is rewritten as the v3 Sentinel stream. Changes from v2:

### 6a. Scenario steps

- **Removed:** `emitEvent`, `railReset` — there is no replay rail in v3.
- **Added:** `chatTurn` — `{ delayMs, id, role: 'user' | 'agent', text }`. A `user` turn appends the presenter's prompt to the conversation rail verbatim. An `agent` turn is chunked into `narrationDelta` messages exactly as `narration` is today; `narration` and `chatTurn` with `role: 'agent'` should collapse into one step type rather than coexisting.
- **Widened:** `awaitStageAction.action` becomes `'policy-drop' | 'prompt'`, with an optional `suggested?: string` carrying the scripted prompt for the suggestion chip. Same hard-block semantics — no timer, no auto-resolve outside `jumpToAct`'s documented rehearsal fast-forward.
- **Reshaped:** `counterUpdate.counter` becomes `{ scanned, exceptions, remediated }`. The v2 `{ events, violations, flagged }` shape has no meaning in an aggregate sweep.

Unchanged: `actMarker`, `graphStep`, `render` (including same-id replace-in-place), `awaitApproval`, `auditWrite`, `policyPanel`, and every ordering and blocking guarantee.

### 6b. Renderer state

`SentinelStageState.railEvents` is replaced by `conversation: Array<{ id, role, text, done }>`. `counter` follows §6a's reshape. Everything else on the snapshot survives.

### 6c. Remediation and the report

Two new routes, both mirroring `/api/sentinel/audit`'s existing seam — **the ScenarioPlayer never fetches; the stage subscribes to its messages and calls these itself.**

- `POST /api/sentinel/remediate` — mock execution. Returns `{ status, confirmationId, removed, accountsTouched, notificationsQueued, reportId }`, deterministically derived from its input (never random — "replays clean, repeatedly" requires byte-identical confirmation ids across runs, exactly as `lib/agents/payment-health/tools.ts` already does). Writes its own `action.executed` audit entries.
- `GET /api/sentinel/report?reportId=` — returns CSV with `Content-Disposition: attachment`. Built server-side from the same checked-in exception fixture that fed `PolicyExceptionTable`. This is the audit artifact; it must not be assembled client-side from rendered DOM, and no figure in it may originate anywhere but the fixture.

A failed or offline write must never affect playback — the demo runs with the network cable pulled (`.catch(() => {})`, as `stage.tsx` already does for audit writes). The download control degrades to disabled, not to a crash.

### 6d. The rule store

Rules are checked-in TypeScript fixtures in `lib/sentinel/policy.ts`, exactly as v2's are — no external datastore, no new dependency, no network. The UI labels the panel "Rule store · continuous · nightly 02:00 UTC · last run 4h ago" and the talking track says production persists to the org's datastore. **The recurring trigger is a label, not a mechanism.** Do not build a scheduler.

---

## 7. The servicing chatbot (`/servicing`)

A new route and a new agent id (`servicing`), reusing v1's Ask conversation surface. `/ask` is untouched — its instructions and evidence kinds are portfolio-exec-shaped and stay that way.

### 7a. Identity is server-pinned

The account under discussion is fixed in the agent's `runtimeContext` at construction, the way `runId` and `agentId` already are. **Resolvers ignore any model-supplied account id.** The model cannot address another customer's data — not by policy, by construction. This is the governance point of the whole surface and it belongs in the talking track: it is the §5a argument ("the model routes, it doesn't source") extended to authorization.

### 7b. Evidence kinds (read-only, no approval)

| Question | Evidence | Notes |
|---|---|---|
| "What are my latest transactions?" | `TransactionTable` | Existing `recent-transactions` resolver, scoped to the pinned account |
| "When is my next payment due?" | `MetricRow` | New resolver over `getPayments` — due date, amount due, minimum due, channel, from the `SCHEDULED` payment |
| "What's my balance / available credit?" | `MetricRow` | New resolver over `getAccount` — balance, available credit, utilization, purchase APR |
| "What am I spending on?" | `CategoryPie` | Existing category resolver, scoped |

### 7c. The contact-information change (approval-gated)

The first write in `lib/soe`. Scope it tightly:

- `Party` gains additive `phone?` and `mailingAddress?`.
- The adapter gains **one** mutation — `updatePartyContact(partyId, patch)` — in-memory, and `POST /api/reset` must restore it. It is the eighth function on a seven-getter module; keep it that shape.
- The tool is **approval-gated via AI SDK 7's native tool-approval flow**, identical to v1's action tools. The ApprovalCard reads as a customer confirmation ("Confirm this change"), not an ops approval. Same machinery, different human — say that out loud on stage.
- The gate decision writes to the Event Log with `actor: 'human'`, same as every other gate.

**Pre-arm the hostile question.** Changing contact information is a real account-takeover vector and someone in the room will say so. The answer is the confirmation gate, the audit entry, and step-up authentication in production. This is a servicing control, not a fraud agent — the §9 language guardrails hold.

### 7d. Demo safety

This is the only live-model surface in the demo. Every rehearsed question needs a checked-in script in `lib/ai/scripted/` and a fallback narration string, exactly as `askScript` already provides for Ask's two questions. Non-negotiable.

---

## 8. Build plan — phases and work items

Dependency-ordered. Items grouped with `∥` have disjoint file sets. **Every gate is something playing on screen, not a report.**

### P0 — Teardown and foundations
- **W0.1 Migration map** — read the v2 surface; write `docs/v3-migration-map.md` listing every file kept / removed / rewritten, and the exact assertions that must stay green through the BT removal (§2b guardrail)
- **W0.2 Teardown** — remove §2b's files and types; v1 test suite and `npm run build` stay green
- **W0.3 AU seed collection** — §5d in full, additive, golden-checksum test freezing all seven figures including the 74/76 overlap
- **W0.4 Policy content** — §5a document, §5b three rules + O4 gap, verbatim-excerpt assertions
- **W0.5 Contract v3** — §6a/§6b step union, snapshot reshape, `docs/wire-contract.md` §9 rewrite, ScenarioPlayer updated with tests
- Order: W0.1 → W0.2 → (W0.3 ∥ W0.4 ∥ W0.5)

### P1 — Conversation rail and Act I
- **W1.1 Conversation rail** — transcript, typing effect, prompt input, `awaitStageAction: 'prompt'` gating, suggestion chip, verbatim echo
- **W1.2 Stage re-layout** — three panels per §4, replay rail removed
- **W1.3 Manual Audit card + Act I counter**
- **Gate: Act I plays from the presenter bar and resets clean.**

### P2 — Act II (policy → rules)
- **W2.1 Policy panel content** — AU document preview
- **W2.2 Rule Diff content** — R1–R3 rows + the O4 data-gap row
- **W2.3 Act II scenario** — parse sequence, narration, ApprovalCard, active flip, `armed` settle, audit write, counter beat
- Order: (W2.1 ∥ W2.2) → W2.3
- **Gate: Act II plays; approving visibly arms the system; the data-gap row reads as different at projector distance.**

### P3 — Act III (the sweep)
- **W3.1 `PolicyExceptionTable`** — schema + renderer + union member
- **W3.2 Remediation** — `POST /api/sentinel/remediate`, `GET /api/sentinel/report`, `RemediationReport` component, CSV download
- **W3.3 Approval scope** — widen `approvalCardPropsSchema` with explicit scope/count and a "Review the list" affordance
- **W3.4 Act III scenario** — prompt gate → triple Data Collector fire → aggregate evidence → RuleCitation drill-down → Patel green check → DecisionCard resolution → approval → execution → report → closing counter
- Order: (W3.1 ∥ W3.2 ∥ W3.3) → W3.4
- **Gate: Act III plays; the full three-act run works back-to-back after one reset; the decline path logs cleanly.**

### P4 — Servicing chatbot *(file set is disjoint from P1–P3; may run in parallel with them)*
- **W4.1 Data** — `Party` widening, `updatePartyContact`, reset coverage
- **W4.2 Agent** — `servicing` agent, pinned identity, §7b evidence kinds + resolvers
- **W4.3 Contact change** — approval-gated tool, confirmation card, human-actor audit entry
- **W4.4 Surface** — `/servicing` route reusing the Ask conversation components
- **W4.5 Scripts** — checked-in scripted-model script + fallbacks for all four rehearsed turns
- **Gate: all four demo turns play under `DEMO_MODE=scripted` with no API key and no network.**

### P5 — Hardening
- **W5.1 Presenter controls** — hotkeys, hidden presenter bar, reset < 2s
- **W5.2 Projector pass** — type scale, contrast, motion legibility, nothing critical behind hover
- **W5.3 Resilience** — error boundaries, clean 3× consecutive full replay at 1x and 2x
- **W5.4 Verifier** — extend `scripts/demo-replay.mjs` to cover the v3 acts and the servicing turns; the BT beats it currently asserts are removed with §2b
- **Gate: the complete demo replays clean, repeatedly.**

**Cut order if the clock wins:** the O4 data-gap row first, then the DecisionCard judgment beat, then the RuleCitation drill-down, then the servicing bot's category-spend question. **Never cut:** the policy drop → rules → approve motion, the aggregate sweep → approval → report → download, the agent graph, or the servicing bot's contact-change gate.

---

## 9. Demo-safety

- The agent stage is deterministic; it runs identically with the network cable pulled. No `Math.random()` anywhere in the scenario path; typing-effect timing fixed.
- The servicing chatbot runs the scripted model by default. Every rehearsed turn has a checked-in fallback string.
- Reset to pre-Act-I in under 2 seconds. Presenter bar hidden by default.
- The prompt input never gates on exact text. Whatever the presenter types is echoed and the script continues.
- Error boundaries: a component failure degrades to a static card, never a white screen.
- Confirmation ids and report ids are derived deterministically, never random — byte-identical across replays.

---

## 10. Non-goals

- **No LLM calls on the Sentinel stage.** It is 100% scripted.
- No real datastore, no Cosmos, no scheduler. Rules are checked-in fixtures; "nightly 02:00" is a label (§6d).
- **No new dependencies.** The lockfile is frozen (v1 brief §2). The CSV route and the download control are hand-rolled.
- No changes to v1 screens.
- No workflow *builder* features on the Sentinel stage — the graph stays read-only theater.
- No real regulation names; all policy content invented and clearly plausible-fictional.
- **No fraud/AML framing and no credit-decisioning language**, on either surface. This is servicing policy compliance. Never "declined" as a decision, "creditworthiness," or "score."
- No auth, no persistence beyond seed + in-memory state, no mobile layout.

---

## 11. Path to real (context, not scope)

Unchanged from v2: after review, integration replaces the ScenarioPlayer with a real agent runtime emitting the same stream — tools over real account/party/payment APIs, the rule store in a real datastore, the model on the internal endpoint. Because every renderer consumes only the wire contract, none of this build's UI changes.

Two things v3 adds to that handoff: the remediation route is the first place the contract describes a **bulk side effect**, and the servicing chatbot is the first place it describes a **customer-scoped identity binding**. Both belong in `docs/wire-contract.md` as first-class, documented seams — they are what the integration team will have to implement for real.
