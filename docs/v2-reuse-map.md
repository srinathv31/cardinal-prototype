# Cardinal v2 "Sentinel" — reuse map (W0.1)

Recon deliverable per CARDINAL_V2_SENTINEL_BRIEF.md §2. Lists what the
Sentinel stage reuses from the deployed v1, where each piece lives, and the
additive extension points. Hard rule restated: **no deletions, no refactors of
existing screens** — the only existing files Sentinel touches are listed in
§4, each additively.

## 1. Reused as-is (no changes)

| What | Where | Sentinel use |
|---|---|---|
| Registry renderers | `components/registry/*` via `EvidenceRenderer` (`components/registry/index.tsx`) | Context-rail evidence: `PaymentHistoryTable` (Marcus's missed payment, Act III), `MetricRow`, `TrendChart` wherever they fit. Unknown component → console error, never a crash. |
| `ApprovalCard` | `components/registry/approval-card.tsx` | Act II "Activate 3 rules" gate and Act III "hold + notify" gate. Pure renderer — caller wires `onApprove`/`onDecline`; the ScenarioPlayer is the caller instead of the AI SDK approval flow. |
| `OutreachDraftCard` | `components/registry/outreach-draft-card.tsx` | Act III ops-notification draft. |
| Props schemas / `RenderInstruction` | `lib/registry/schemas.ts` | Scenario `render` steps carry a Zod-validated `RenderInstruction` — byte-compatible with what the run view's evidence pane consumes. |
| Event log store + entry shape | `lib/events/store.ts`, `lib/events/types.ts` | Scenario `auditWrite` steps append real `EventLogEntry` rows (via the new POST route, §3) so the existing Event Log page shows Sentinel entries alongside v1's (brief §3 Act III beat 6). Shape untouched. |
| Event Log screen | `app/events/*`, `components/event-log/*` | Post-demo click-through target from the audit strip. Reads Sentinel entries with zero changes (it queries the store unfiltered). |
| Event ticker card pattern | `components/dashboard/event-ticker.tsx` | Visual/style reference for the Replay Rail's event cards (kind badge + clock time + summary, `KIND_LABEL`/`KIND_TONE` fallback pattern). The component itself is dashboard-coupled (own reveal timer); the rail is a new component that mirrors its card styling but is driven by `emitEvent` messages. |
| Run-view pane patterns | `components/run-view/narration-pane.tsx`, `evidence-pane.tsx`, `approval-rail.tsx` | Style/structure reference for the Context Rail (streamed narration + progressive evidence + approval cards). Not imported directly — those panes are `UIMessage`-coupled; the rail consumes ScenarioPlayer messages carrying the same payload shapes. |
| React Flow | `@xyflow/react` (already a dependency; used by `components/workflow-canvas/*`) | New read-only live-graph mode under `components/sentinel/`. Builder canvas untouched. |
| Theme / layout shell / nav | `app/layout.tsx`, `components/shell/nav.tsx` | `/sentinel` renders inside the standard shell; one nav entry added (the single permitted nav change). |
| SOE adapter seam | `lib/soe/adapter.ts` | All Sentinel account data (BT event detail, payment history, promo notices, replay log) flows through `lib/soe` — nothing imports seed modules directly (CLAUDE.md rule). |
| Anchor/day-offset scheme | `lib/soe/seed/anchor.ts` (`getAnchor`, `d`, `dateOnly`) | All Sentinel seed dates are day-offsets from the same anchor; amounts fixed literals; honors `DEMO_ANCHOR_DATE`. |

## 2. Reused shapes on the Sentinel stream

The ScenarioPlayer (brief §6) publishes a message stream whose **payloads are
existing wire-contract shapes**; only the envelope types below are new, and
they are additive (documented in `docs/wire-contract.md` §9):

- narration chunks — same role as `text` parts in the run view (typed text,
  editorial only, never the source of a figure);
- `render` — `RenderInstruction` from `lib/registry/schemas.ts`, unchanged;
- approval payloads — `ApprovalCardProps` shape, unchanged; approvals
  hard-block the player exactly as AI SDK approval gates pause a run
  (no auto-approve, no timeout — brief v1 §5d carries over);
- `auditWrite` — `EventLogEntry` (sans `id`/`timestamp`, which the store
  assigns on append);
- `emitEvent` — `StreamEvent` from `lib/soe/types.ts`;
- **additive envelope types**: `graphStep` (node/edge state transitions for
  the live agent graph), `counterUpdate` (replay-rail counter), `actMarker`.

This message union **is the spec the post-review real runtime must emit**
(brief §6, §10) — renderers consume only these messages.

## 3. New code (Sentinel-owned, all additive)

| Area | Files |
|---|---|
| ScenarioPlayer engine | `lib/sentinel/scenario/types.ts` (step + message unions), `lib/sentinel/scenario/player.ts`, tests, smoke scenario |
| Policy content & rule fixtures | `lib/sentinel/policy.ts` (BT-Servicing-Policy-2026 sections with excerpt anchors; rules R1/R2/R3 with plain-English text + machine footers + critic note) |
| Sentinel seed additions | `lib/soe/seed/sentinel.ts` — Marcus `BT_INITIATED` ($3,200 @ 02:47, day 0), Elena promo-notice record, the 14-event replay log ("the night") |
| Audit ingestion | `app/api/sentinel/audit/route.ts` — POST appends a Sentinel `EventLogEntry` to `lib/events/store` so the shared Event Log sees it |
| Stage | `app/sentinel/page.tsx` (+ `error.tsx`), `components/sentinel/*` (three-panel + audit-strip shell, presenter bar) |

## 4. Additive touches to existing files (the complete list)

| File | Change | Why it's safe |
|---|---|---|
| `components/shell/nav.tsx` | +1 nav entry (`/sentinel`) | The single nav change the brief permits. |
| `lib/soe/types.ts` | +`'balance_transfer.initiated'` in `StreamEvent['kind']`; +optional `btCreditLineAtInitiation?` on `BalanceTransferEvent`; +`PromoNoticeRecord` interface | Union member + optional field + new interface — no existing consumer breaks; `event-ticker.tsx` already falls back on unknown kinds. |
| `lib/soe/seed/index.ts` | Compose `buildSentinel(anchor)` into `SeedDb`; +`promoNotices`, +`sentinelReplayEvents` collections | New collections; existing arrays gain only Marcus's BT event (see §5 guardrails). |
| `lib/soe/adapter.ts` | +`getPromoNotices(accountId)`, +`getSentinelReplayLog()` | New exports only. |
| `lib/soe/index.ts` | Re-export the new adapter functions/types | New exports only. |
| `docs/wire-contract.md` | +§9 "Sentinel scenario stream (v2, additive)" | Documented as versioned, additive. |

## 5. Guardrails discovered in recon (what must NOT change)

- **`SeedDb.streamEvents` is pinned**: the Command Center ticker renders it
  and `seed.test.ts` asserts it covers *exactly* the 7 v1 kinds. The night's
  replay log therefore lives in its own collection
  (`sentinelReplayEvents`), never merged into `streamEvents`.
- **Marcus's account figures are frozen** ($10,000 limit / $7,800 balance /
  $2,200 available; utilization arc 42→78%): `seed.test.ts` recomputes the
  ledger and v1's story quotes them. Sentinel adds *events about* Marcus,
  never touches his ledger.
- **Dashboard "BTs Expiring ≤ 90 Days" KPI and its test** must keep returning
  exactly Elena + bg-002 + bg-005. Marcus's new `BT_INITIATED` carries
  `promoEndDate` at **+348 days** (02:47 initiation + 360-day term), keeping
  him out of every ≤90-day window.
- **Golden checksums**: background PRNG draw order is frozen —
  `lib/soe/seed/sentinel.ts` uses fixed literals only, no PRNG draws.
- **Frozen dependencies**: React Flow, motion, lucide-react etc. are already
  in the lockfile; Sentinel adds no packages.

## 6. Decisions flagged during recon

- **R2 vs Marcus's frozen balance.** The brief pins the violating BT at
  $3,200 *and* requires R2 ("≤ 90% of available credit at initiation") to
  pass cleanly — but Marcus's frozen open-to-buy is $2,200. Resolution: the
  (invented) policy document defines R2 against the account's
  **balance-transfer credit line**, a distinct figure from purchase
  open-to-buy (as on real card platforms). Marcus's BT event carries
  `btCreditLineAtInitiation: $4,000` → R2 check: $3,200 ≤ 90% × $4,000 =
  $3,600 ✓ with margin, hand-reconcilable from the event fixture alone.
- **Stage reset is client-side only** (<2s, brief §8): it rewinds the
  ScenarioPlayer and clears stage state. Audit entries already written stay
  in the shared Event Log (which has its own reset control) — resetting the
  stage must not wipe v1's log.
- **Elena's R3 margin**: notice sent at day **−15**, promo ends day **+45**
  → 60 days' notice against a 45-day requirement (15-day margin).
- **Act timestamps**: "the night" is anchor day 0, 00:00–06:00 UTC
  (Marcus at 02:47) — early this morning relative to both demo dates, so
  "happened at 2:47 AM" reads as recent past on either anchor.
