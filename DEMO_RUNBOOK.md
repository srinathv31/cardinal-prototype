# Demo runbook — Aug 4 & 5, 2026

Presenter crib sheet. What to type, what to click, what should appear. Scope is `DEMO_THESIS.md`'s
three use cases; everything else in the app is parked.

## The model: live with a scripted net (branch `live-llm`)

The agents now run on a **real LLM** — the local llama.cpp endpoint on the LAN
(`.env.example`'s `local` provider block; credentials live in `.env.local`, gitignored).
`DEMO_MODE` picks the posture:

| Posture | Config | Behavior |
|---|---|---|
| **Demo (recommended)** | `DEMO_MODE=scripted` + `.env.local`'s local provider | live model first on every beat; any error or stall past `DEMO_LLM_TIMEOUT_MS` (8 s default) falls back to the rehearsed script for that beat. An LLM outage mid-demo degrades, it never errors. |
| Dev / tuning | `DEMO_MODE=live` | raw model, errors surface. What `.env.local` ships set to — flip it before demoing. |
| No-network | `DEMO_MODE=scripted`, no provider env | the pure checked-in script, byte-stable. The zero-risk parachute. |

Live narration **wording varies run to run** — that is the point, it's a real model. What never
varies: every figure, card, table, id, and gate (all server-derived), and the beat order below.
Verified live end-to-end 2026-07-30 (all three use cases, both gate decisions, both personas).

## Pre-flight (10 minutes before, both demo days)

```bash
curl http://192.168.6.63:8080/v1/models          # LLM host up? (IP is DHCP — if refused, fix .env.local, start serve.ps1 on the host)
npm run verify:live                              # live-path go / no-go — expect "RESULT: PASS"
npm run build                                    # once per code state
DEMO_MODE=scripted DEMO_ANCHOR_DATE=2026-08-05 npm start   # http://localhost:3000 — demo posture
node scripts/demo-replay.mjs                     # scripted-net go / no-go — expect "19/19 beats passed" + "RESULT: PASS"
```

- **Pin `DEMO_ANCHOR_DATE=2026-08-05` on the run command, on BOTH days.** Seed dates are day-offsets
  from the anchor, which defaults to "today, UTC". The whole test suite asserts at `2026-08-05` /
  `2026-08-19`, so pinning 08-05 makes every id, date and filename byte-identical to rehearsal —
  `act-card-ca-9001-20260805`, `authorized-user-policy-audit-2026-08-05.html`. Unpinned on Aug 4,
  nothing breaks, but every date on screen shifts a day off your notes. Runtime env is enough: every
  page that reads seed data is `force-dynamic`.
- **Restart the server before you demo — do not reuse yesterday's process.** `instrumentation.ts`'s
  `register()` runs once per server process and installs the Event Log telemetry; the rule store, the
  Event Log and the cached SOE db are all in-memory singletons on that process. A fresh process is
  the only guaranteed-clean start.
- **`npm run build && npm start`, not `npm run dev`.** Precedent from the repo itself: the stores
  carry explicit HMR workarounds because dev re-evaluates modules mid-session (`lib/rules/store.ts`,
  `lib/events/store.ts` headers) — production has no HMR at all; the fonts were vendored locally so
  the production build and runtime need no network (commit `350f650`); and dev compiles each route on
  first visit, so the first click on `/ops` stalls on a projector. Use `npm run dev` only if you have
  to edit code between runs.
- The live path needs `.env.local` (`CARDINAL_PROVIDER=local`, `LOCAL_LLM_BASE_URL`,
  `LOCAL_LLM_API_KEY`) — no hosted API key, the model is on the LAN. The scripted fallback needs
  nothing: with no provider env at all, every rehearsed beat is the checked-in script.

## Use case 1 — authorized-user policy, ops chat (`/ops`)

| # | You do | You should see |
|---|---|---|
| 1 | **Attach policy** → pick any file whose name does *not* say "activation" | Your turn: "Uploaded *file* — please parse this authorized-user policy document." |
| 2 | (wait) | Rule Diff card: 3 drafted rules (R1/R2/R3) with citations, **plus a 4th obligation parked as a data gap** |
| 3 | (wait — same turn) | Narration names the rules and the data gap, asks "Can I add these rules?", and **Gate 1's approval card arrives in the same turn** — the card is the question |
| 4 | Click **Approve** | "Rules stored" chip + one closing line (live wording varies), then the agent stops — the sweep is yours |
| 5 | Click chip **"Give me the accounts that fail on these authorized-user policies."** | ViolationsDashboard: **962** scanned · **74** accounts affected · **87** exceptions; bars 61 / 19 / 7 |
| 6 | Click any table row | Inline drill-down: which account, which rule, the finding sentence. No second fetch — the facts shipped with the row |
| 7 | (no prompt — wait) | **The unprompted beat**: the agent volunteers the recommendation, cites R1 by its approved title and count, and opens **Gate 2** in the same turn |
| 8 | Click **Approve** | "Batch removal kicked off — 87 relationships across 74 accounts, recorded under `rem-…`", then a ReportCard |
| 9 | Click **Download** on the ReportCard | `authorized-user-policy-audit-2026-08-05.html` — all 87 exceptions, the rule each breaks, the approval that authorized it |

## Use case 2 — servicing chatbot (`/servicing`)

Signed in as Anand Patel. Three chips plus one typed question:

1. Chip — "What are my latest transactions?" → TransactionTable.
2. Chip — "When is my next payment due?" → MetricRow (amount + due date).
3. **Type** — "What is my next statement?" → MetricRow (statement balance + due date). *No chip for
   this one — type it.*
4. Chip — "What's my balance and available credit?" → MetricRow.

## Use case 3 — card activation

**Ops side (`/ops`)** — same practice as use case 1, second document. Do this *after* use case 1.

1. **Attach policy** → pick a file whose name **contains "activation"** → the agent parses the Card
   Activation Servicing Policy and drafts **CA-R1 / CA-R2** (no data-gap row — that document states
   no obligation its data can't answer).
2. **Approve** Gate 1.
3. Click chip **"Run the card-activation policy against the book."** → **214** cards scanned · **41**
   accounts · **41** exceptions; bars CA-R1 **12** / CA-R2 **29**.
4. The agent recommends batch outreach and opens the gate → **Approve** → "Outreach queued to 41
   primary cardholders, recorded under `ca-out-20260805`."

**Customer side (`/servicing`)** — two browser tabs, opened before you start:

- Happy: `http://localhost:3000/servicing?persona=happy` → type *"I just got my card, I'm here to
  activate it."* → **Activate / Cancel** prompt → click **Activate** → "Your card is activated.
  Confirmation `act-…`."
- Blocked: `http://localhost:3000/servicing?persona=blocked` → same sentence → same prompt → click
  **Activate** → "Your card arrived, but this account is currently failing a policy — Payment missed
  … · account past-due at activation …" (CA-R1). The card physically arrived; the policy still says no.

## Presenter notes

- **Let each turn finish before clicking anything.** While the agent is working, the chips, the
  attach button and the input are disabled (greyed out) — a click during a stream is not queued, it
  is simply refused. Wait for the spinner ("Working…" / "Thinking…") to clear.
- **Order matters on `/ops`.** The active policy is whichever document was last approved. After the
  card-activation upload, *every* sweep chip runs the card-activation sweep. Run use case 1 end to
  end first; to go back to authorized-user, re-upload and re-approve that document.
- **Reset between rehearsals**: the ↺ button at the bottom of the left nav, or double-tap **`r`**
  outside a text box. It clears the Event Log, the rule store (back to "no rules configured"), and
  any contact edits, then does a full page load to `/` — which also drops every open chat session.
- **If you sweep before approving rules**, the agent answers "No authorized-user rules are configured
  yet — nothing has been approved into the rule store." That is not an error; it is the honest state
  (the endpoint returns 409). Use it: *"the store is genuinely empty until a human approves."*
- **Event Log** (`/events`): every tool execution is `actor: agent`; every gate decision is
  `actor: human`, by name of the tool it unlocked. Open it after use case 1 to show the audit trail.
- **Identity is pinned server-side.** The servicing chat has no account-id parameter anywhere — ask
  it for another customer's data and it still answers for the signed-in cardholder. The persona comes
  from the URL, resolved on the server, never from the model.
- **The business hook** (`DEMO_THESIS.md`): removing one authorized user by hand runs ~10 minutes per
  account, before login and context switching. 87 relationships across 74 accounts, one click, and a
  human approved every one of them.

## If something goes wrong

- A stuck or half-rendered conversation → **New conversation** (button top-right of the chat), or ↺.
- Odd totals or leftover state → ↺ reset, then re-run the use case from step 1.
- **LLM host dies mid-demo** → in `DEMO_MODE=scripted` nothing to do: each beat waits at most
  `DEMO_LLM_TIMEOUT_MS` (8 s) then plays the script — narration tone shifts, figures don't. If the
  host will stay down, restart the server with no provider (`CARDINAL_PROVIDER= npm start` after
  Ctrl-C) so beats stop paying the timeout.
- Model behaving oddly (wrong tool, chatty figures) → ↺ reset and re-run; if it repeats, fall back to
  the pure script (previous bullet). The invariants hold either way — the model cannot invent a
  number, only phrase around the tool results.
- Anything worse → `Ctrl-C`, `DEMO_MODE=scripted DEMO_ANCHOR_DATE=2026-08-05 npm start`,
  `node scripts/demo-replay.mjs`.
