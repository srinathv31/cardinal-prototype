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
replace-in-place), `awaitApproval`, `auditWrite`, `policyPanel`, and every
ordering and blocking guarantee.

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

## 7. Deferred out of P0 (recorded so nothing is silently dropped)

| Item | Phase | Note |
|---|---|---|
| `PolicyExceptionTable`, `RemediationReport` schemas + renderers | P3 (W3.1/W3.2) | §5c's two new registry components. P0 only performs the `BTEventDetail` removal half of §5c. |
| `approvalCardPropsSchema` scope/count widening | P3 (W3.3) | |
| `POST /api/sentinel/remediate`, `GET /api/sentinel/report` | P3 (W3.2) | §6c's bulk-side-effect seam. |
| Conversation-rail prompt input, `'prompt'` gating UI, suggestion chip, verbatim echo *in the UI* | P1 (W1.1) | P0 ships the read-only transcript half and the **contract** for all of it (`awaitStageAction: 'prompt'`, `resolveStageAction(id, text)`) so the engine seam is proven before the UI lands. |
| Three-panel stage re-layout, Manual Audit card, Act I counter | P1 (W1.2/W1.3) | P0 leaves `/sentinel` playable on the existing graph-rehearsal fixture; `buildDemoScenario` returns in P1. |
| `scripts/demo-replay.mjs` v3 coverage | P5 (W5.4) | The verifier asserts v1 beats 0–6 only and never referenced a Sentinel BT beat, so the teardown does not touch it. |
| Everything under `/servicing` | P4 | Disjoint file set. |
