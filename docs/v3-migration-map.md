# Cardinal v3 "AU policy" — migration map (W0.1)

Recon of the v2 Sentinel surface against `CARDINAL_V3_AU_BRIEF.md` §2. This is
the file-by-file record of what P0 keeps, removes, and rewrites, plus the exact
assertions that must stay green through the balance-transfer teardown (§2b's
removal guardrail). It supersedes `docs/v2-reuse-map.md` for anything Sentinel;
that document remains accurate for v1 and is left in place unedited.

---

## 1. Kept unchanged (§2a)

The v3 stage is the v2 engine re-pointed at a different policy. Nothing below
is touched by P0.

| File | Why it survives the re-point |
|---|---|
| `lib/sentinel/scenario/player.ts` | Blocking semantics, speed/reset/`jumpToAct`, the one-`setTimeout` wait primitive, the typing effect. Only the step *union* it switches on changes (§4). |
| `components/sentinel/live-agent-graph.tsx` | Six fixed nodes, four node states, animated edges, per-node captions — all policy-agnostic. |
| `components/sentinel/policy-panel.tsx` | Drawer + mock file-drop + document preview; renders whatever `PolicyDocument` it is handed. |
| `components/sentinel/evidence/rule-diff.tsx` · `rule-citation.tsx` · `decision-card.tsx` | Excerpt/plain-English/machine-footer card, the `data-gap` row, the checked-conditions card, the response-routes card. All four v3 acts reuse these verbatim. |
| `components/sentinel/context-rail.tsx` · `audit-strip.tsx` · `presenter-bar.tsx` | Context rail loses only its `narration` branch (§4); the other two are untouched. |
| `app/api/sentinel/audit/route.ts`, `lib/events/*` | One audit surface for everything — unchanged. |
| All of v1 | Registry components, agents, Ask, Event Log, Workflow Canvas, Command Center. **Hard rule: no changes to v1 screens.** |

## 2. Removed (§2b)

| Path | Note |
|---|---|
| `lib/sentinel/scenario/demo-scenario.ts` + `.test.ts` | The BT three-act script (1,412 + 743 lines). P1–P3 write the v3 script fresh. |
| `components/sentinel/event-replay-rail.tsx` | Replaced by the conversation rail (§4 of the brief). Sole owner of the `balance_transfer.initiated` badge map. |
| `components/sentinel/evidence/bt-event-detail.tsx` | No single-event hero card in v3 — the sweep is an aggregate. |
| `lib/soe/seed/sentinel.ts` + `sentinel.test.ts` | Marcus's BT event, Elena's promo notice, the 14-event replay log. The test file's **policy-fixture assertions move to `lib/sentinel/policy.test.ts`** — they are not lost, only rehoused (§5). |
| `getSentinelReplayLog` / `getPromoNotices` (`lib/soe/adapter.ts`) | Nothing in v3 reads either. |
| `SeedDb.sentinelReplayEvents` / `SeedDb.promoNotices` (`lib/soe/seed/index.ts`) | The collections behind those two getters. |
| `PromoNoticeRecord` (`lib/soe/types.ts`) | R3 in v2 was the promo-notice rule; v3's R3 is minimum age. |
| `StreamEvent['balance_transfer.initiated']` | Added in v2 for the replay rail only; no v1 consumer ever produced or matched it. |
| `BalanceTransferEvent.btCreditLineAtInitiation` | Existed solely to make v2's R2 (`90% of the BT credit line`) internally consistent. v3 has no sizing rule. |
| `BTEventDetail` from `lib/sentinel/registry.ts` + `components/sentinel/evidence/index.tsx` | One union member and one routing branch. |

## 3. Removal guardrail — the assertions that must stay green (§2b)

Marcus's `bt-marcus-1` merges into `SeedDb.balanceTransferEvents` — the one
deliberate exception v2 made to "never merge into a v1 collection." Removing it
changes what `getBalanceTransferEvents('acct-marcus')` returns (one event → zero)
and what the portfolio-wide BT scans see. **Verify, don't assume:**

| Assertion | Location | Why it holds |
|---|---|---|
| BTs expiring within 90 days = exactly Elena, bg-002, bg-005 | `lib/soe/seed/seed.test.ts` — `portfolio` › *"BTs expiring within 90 days…"* | `bt-marcus-1.promoEndDate` is anchor **+348 days**, outside every ≤90-day window by design (`lib/soe/seed/sentinel.ts` header). Its removal cannot change a set it was never in. |
| `bt-expiring-accounts` resolver returns bg-002, Elena, bg-005 soonest-first at the 90-day default | `lib/agents/ask/resolvers.test.ts` — *"returns exactly bg-002, Elena Ruiz, bg-005…"* | Same set, reached through the resolver instead of the seed. This is v1 Beat 5's pinned answer. |
| `db.accounts` is exactly 9 | `lib/soe/seed/seed.test.ts` — `portfolio`; also `availableCredit` reconciliation over all 9 | v2 never added an account; v3's AU portfolio is an **additive collection**, never merged (§6). |
| Stream ticker covers exactly the 7 v1 kinds | `lib/soe/seed/seed.test.ts` — *"stream ticker covers all 7 kinds…"* | `balance_transfer.initiated` only ever lived in `sentinelReplayEvents`; dropping the union member cannot change `streamEvents`. |
| All ids unique across the SeedDb | `lib/soe/seed/seed.test.ts` | Fewer ids, same invariant. |
| Both demo anchors green | every suite runs `describe.each(['2026-08-05','2026-08-19'])` | Unchanged. |

Empty-BT-list safety: `app/page.tsx` already maps `getBalanceTransferEvents` over
all nine accounts and handles empty results (bg-001 and bg-004 have never had a
BT event), so Marcus dropping to zero events needs no call-site change.

## 4. Rewritten — the contract (§2c, §6)

`lib/sentinel/scenario/types.ts` and `docs/wire-contract.md` §9. §9 is rewritten
**in place**; v2's BT variant is superseded, not archived (§2c) — the contract is
a handoff artifact for the integration team, and one clean current version beats
an archaeological record.

| Change | Shape |
|---|---|
| **Removed** `emitEvent` | No replay rail in v3. |
| **Removed** `railReset` | Existed only to clear that rail between acts. |
| **Removed** `narration` | Collapsed into `chatTurn` with `role: 'agent'` (§6a: the two "should collapse into one step type rather than coexisting"). |
| **Added** `chatTurn` | `{ delayMs, id, role: 'user' \| 'agent', text }`. `agent` chunks into `narrationDelta` exactly as `narration` did; `user` publishes one instant `chatTurn` message. |
| **Widened** `awaitStageAction` | `action: 'policy-drop' \| 'prompt'`, plus `suggested?: string` carrying the scripted prompt for the suggestion chip. Same hard-block semantics. |
| **Widened** `resolveStageAction(id, text?)` | A `'prompt'` gate resolved with text publishes a **verbatim user `chatTurn`** before `stageActionResolved`. The player never string-matches the text — whatever the presenter types is echoed and the script continues (brief §9). |
| **Reshaped** `counterUpdate.counter` | `{ scanned, exceptions, remediated }`. v2's `{ events, violations, flagged }` has no meaning in an aggregate sweep. |
| **Reshaped** snapshot | `railEvents` → `conversation: Array<{ id, role, text, done }>`; `SentinelContextItem` drops its `'narration'` kind (narration now lives in the conversation rail, evidence in the context rail — brief §4). |

Unchanged: `actMarker`, `graphStep`, `render` (including same-id
replace-in-place), `auditWrite`, `policyPanel`, and every ordering and
blocking guarantee. `awaitApproval`'s baseline shape (`id`, `payload`,
`audit`) and its hard-block semantics are unchanged too, but see the next
two rows — it did not leave P3 as pristine as this table originally
predicted.

Two more changes landed after this table was first written, both post-P0
(P3/P3b) and both now documented in `docs/wire-contract.md` §9.1/§9.6 —
recorded here because this table's job is the full v2→v3 diff, not just
P0's slice of it:

| Change | Shape |
|---|---|
| **Added** (P3b, "reject path must work on demand") `AwaitApprovalStep.onDeny?` | `ScenarioStep[] \| undefined`. Steps played **instead of** the remainder of the scenario when the gate is DENIED; absent means denial continues the script unchanged (v2's only behavior, still the default). `ScenarioPlayer#resolveApproval` splices `onDeny`'s steps into the player's *working* step queue, never `scenario.steps` itself, so `reset()` always restores the pristine script even after a prior denial took the branch. Act III's remediation gate is the one scripted use: a decline there gets a short closing branch (an agent line, an audit entry, a zeroed counter) instead of playing into content that assumes the removal executed. |
| **Added** (P3, W3.4) `RuleDiffProps.storeMeta?` | `string`. The rule store's own label, e.g. "Rule store · continuous · nightly 02:00 UTC · last run 4h ago" — set only once the rules are active (absent in Act II, present when Act III re-renders the same card under the same `render` id). A label, not a mechanism (brief §6d: "do not build a scheduler") — nothing in this build schedules anything. |

## 5. Rewritten — policy content (§2c, §5a/§5b)

`lib/sentinel/policy.ts` is rewritten, not deleted: same three exported shapes
(`PolicyDocument`, `PolicyRule`, `PolicyObligationGap`), new content.

- Six sections: *Purpose and Scope* · *Definitions* · *Product Eligibility* ·
  *Account Standing* · *Authorized User Qualification* · *Consent and
  Authorization*.
- `Definitions` defines **good standing** and **secured card** because R1 and R2
  are phrased against those terms (§5a).
- R1 secured-card (hero) · R2 not-in-good-standing-at-`addedDate` (the
  cross-dataset one) · R3 minimum age 16 at `addedDate`.
- O4 consent-on-file reuses `PolicyObligationGap` and the `evaluability:
  'data-gap'` Rule Diff row verbatim (§5b).

New `lib/sentinel/policy.test.ts` inherits the verbatim-excerpt assertions that
lived in `lib/soe/seed/sentinel.test.ts`, and adds the definition-term and
§10-language guards.

## 6. New — the AU portfolio (§5d)

Additive collection, following the precedent `sentinelReplayEvents` set exactly:
`SeedDb.auPortfolio`, **never merged into `SeedDb.accounts`**, so v1's 9-account
arithmetic, its KPIs, and its pinned tests stay frozen (§3 above).

| File | Role |
|---|---|
| `lib/soe/seed/au-portfolio.ts` | Deterministic generator, its own PRNG seed (background.ts's golden checksum must not move). |
| `lib/sentinel/au-exceptions.ts` | The rule evaluator. Independently re-derives exceptions **from the generated data**, not from the generator's plan — that is what makes the golden-checksum test proof rather than restatement. |
| `lib/soe/seed/au-portfolio.test.ts` | Freezes all seven §5d figures, the 76 → 74 overlap, and the v1 guardrails of §3. |
| `getAuPortfolio()` / `getAuScanPortfolio()` (`lib/soe/adapter.ts`) | Raw collection vs. the scan set. The scan set merges the Patel household in from v1 — the brief requires Patel in the *denominator*, and doing that merge at the data seam keeps 962/1,247 from being re-derived anywhere else. |

`Account` gains additive `securedCard?: boolean` and `securityDepositAmount?:
number`. No other v1 type changes for the Sentinel half.

### 6a. Resolved arithmetic gap — the 148 secured cards

§5d's table is internally inconsistent as written: it asks for **148 secured-card
accounts in the collection** and **61 R1 exceptions across 52 accounts**, but R1
is "an AU may not be … maintained on a secured card account," so if every account
in the collection carried an AU, all 148 secured accounts would be exceptions.

Resolution taken: **the collection holds 1,100 accounts, of which 961 carry at
least one authorized user** (962 with Patel). The 148 secured cards split 52
AU-carrying (set S → 61 R1 exceptions) + 96 with no AU at all. Every figure in
§5d's table is met exactly; the collection simply contains AU-free accounts as
book depth, and they earn their place — *"148 secured-card accounts in the book;
52 are carrying authorized users"* is a stronger narration line than the bare 61.
AU-free accounts get an account, a primary party, and a primary role, and no
payment history: they are never in the scan denominator.

### 6b. Exception construction — how 76 becomes 74

| Set | Accounts | Relationships |
|---|---|---|
| **S** — secured, AU-carrying (R1) | 52 | 61 = 43×1 + 9×2 |
| **B** — added while not in good standing (R2) | 17 | 19 |
| **A** — under 16 at addition (R3) | 7 | 7 |
| Sum | 76 | 87 |
| **B ∩ A** — the two deliberate overlaps | −2 | — |
| **Distinct** | **74** | **87** |

The two overlaps sit in **B ∩ A**, never in anything ∩ S, and that is deliberate.
R1 is evaluated on *account* state, so any AU on a secured account is an R1
exception; an S-overlap would therefore make one *relationship* break two rules
and double-count it, leaving 87 rule-hits but only 85 distinct relationships. Put
both overlaps in B ∩ A instead and each overlap account carries **two different**
AU relationships — one added while the account was not in good standing, one
added under 16 — so 87 rule-hits are 87 distinct relationships and the account
overlap is still real. Both readings of "87 exceptions" agree.

The Patel household is the compliance pass and is in the denominator, not
excluded from it: not secured (R1 clear); a transactor with no missed payment
anywhere in its ledger (R2 clear); Priya added as an adult and Dev added at ~18
(R3 clear).

## 7. Deferred out of P0 — what shipped, and when (reconciled)

Written during P0 as a forward-looking plan; every row below is now closed
except the last one. Recorded in the past tense so this table reads as a
record of what happened, not a restatement of `docs/wire-contract.md`.

| Item | P0 deferred it to | What shipped |
|---|---|---|
| `PolicyExceptionTable`, `RemediationReport` schemas + renderers | P3 (W3.1/W3.2) | Landed as planned. `lib/sentinel/registry.ts`'s `policyExceptionTablePropsSchema` / `remediationReportPropsSchema`; `components/sentinel/evidence/policy-exception-table.tsx` / `remediation-report.tsx`. Both fed by the single checked-in `lib/sentinel/exception-fixture.ts` derivation, same fixture the two new API routes below read from — table, report card, and CSV can never drift against each other. Documented in `docs/wire-contract.md` §9.6. |
| `approvalCardPropsSchema` scope/count widening | P3 (W3.3) | Landed, but as two independently-optional fields rather than one "scope/count" field: `scope` (a preformatted blast-radius summary plus optional `counts` chips) and `reviewList` (a separate "Review the list (N)" disclosure, capped at 25 rows). `lib/registry/schemas.ts`. Documented in `docs/wire-contract.md` §4. |
| `POST /api/sentinel/remediate`, `GET /api/sentinel/report` | P3 (W3.2) | Landed. `app/api/sentinel/remediate/route.ts`, `app/api/sentinel/report/route.ts` — both mirror `/api/sentinel/audit`'s stage-calls-not-player seam exactly. Documented as the "bulk side-effect seam" in `docs/wire-contract.md` §9.7 (brief §11's first named handoff seam). |
| Conversation-rail prompt input, `'prompt'` gating UI, suggestion chip, verbatim echo *in the UI* | P1 (W1.1) | Landed. `components/sentinel/conversation-rail.tsx`'s `PromptInput` — enabled only while `awaitStageAction: 'prompt'` is pending, offers `suggested` as a one-click chip, calls `onSubmitPrompt` verbatim on submit. The engine-side contract P0 shipped ahead of this (`resolveStageAction(id, text)`) needed no changes to support it. |
| Three-panel stage re-layout, Manual Audit card, Act I counter | P1 (W1.2/W1.3) | Landed. `components/sentinel/stage.tsx`'s three-column grid; `context-rail.tsx`'s static `ManualAuditCard`; `demo-scenario.ts`'s `actOneSteps()`. `buildDemoScenario()` now assembles and returns the real three-act script (`actOneSteps` + `actTwoSteps` + `await actThreeSteps()`); `/sentinel` no longer falls back to the P0-era graph-rehearsal fixture by default. |
| Everything under `/servicing` | P4 | Landed. `lib/agents/servicing/**` (agent, identity, resolvers, tools, script), `app/servicing/`, `components/servicing/`. Documented as the "customer-scoped identity binding" seam in `docs/wire-contract.md` §10 (brief §11's second named handoff seam). |
| `scripts/demo-replay.mjs` v3 coverage | P5 (W5.4) | **Closed.** Confirmed first that the verifier never asserted a Sentinel-stage balance-transfer beat: the pre-W5.4 file had zero references to "Sentinel" or "servicing" anywhere (case-insensitive grep), and its only BT-flavored content — the `bt-lifecycle` monitor-agent beat and the "balance transfers expiring" Ask question — is v1's `BT Lifecycle` agent (brief §3's Workflow Canvas cast), unrelated to the removed v2 Sentinel BT stage (no promo-notice rail, no `balance_transfer.initiated`, no replay log). So §2b's teardown left nothing stale to remove here. Extended with 8 new beats (7–14, `docs/wire-contract.md` §8) covering everything about `/sentinel` and `/servicing` that crosses the network: the real scenario serving (vs. the error boundary or the `?scenario=graph-rehearsal` fixture), `POST /api/sentinel/remediate`'s byte-identical determinism and its real 87/74/74 figures, `GET /api/sentinel/report`'s full 87-row RFC4180 CSV and its 404 path, `POST /api/sentinel/audit`'s Event Log ingestion, all four servicing read turns, the contact-change tool's full approval round trip with its `actor:'human'` Event Log entry, §10's identity-pinning guarantee restated at the wire level for both a read and a write, and `POST /api/reset` keeping the servicing write path clean after a mutation. Explicitly NOT duplicated: the three-act scenario's own sequencing, which `lib/sentinel/scenario/demo-scenario.test.ts` already covers exhaustively in-process — there is no server-side stream for an HTTP script to drive, by construction (brief §9). Also explicitly not provable at the wire level: byte-level reversion of a mutated `phone` value, since no evidence kind (§10.3) ever surfaces `phone`/`mailingAddress` back to a caller — that specific reversion stays proven by `lib/soe/adapter.test.ts`'s direct-import unit test. `docs/wire-contract.md` §8 documents both boundaries in full, and the script's own coverage summary prints them on every run. Along the way the new servicing beats caught a real, demo-relevant issue — not an application bug, but a deployment hazard worth knowing about: `instrumentation.ts` registers the Event Log telemetry integration once per server process (its own header comment says so), so a dev server left running since before `updateContactInfo` was added to `lib/events/telemetry.ts`'s `ACTION_TOOL_NAMES` kept logging its execution as `tool.executed` instead of `action.executed` until restarted — invisible from the source tree, only catchable by hitting a live process. A cold-started server (exactly what `npm run verify:demo` does when nothing answers at `DEMO_REPLAY_URL`) never exhibits it. |
