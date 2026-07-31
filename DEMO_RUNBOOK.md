# Demo runbook — Aug 4 & 5, 2026

Presenter crib sheet. What to type, what to click, what should appear. Scope is `DEMO_THESIS.md`'s
three use cases; everything else in the app is parked.

## Pre-flight (10 minutes before, both demo days)

```bash
npm run build                                    # once per code state
DEMO_ANCHOR_DATE=2026-08-05 npm start            # http://localhost:3000
node scripts/demo-replay.mjs                     # go / no-go — expect "19/19 beats passed" + "RESULT: PASS"
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
- No API key is needed or used. `DEMO_MODE=scripted` is the default and every rehearsed beat is a
  checked-in script.

## Use case 1 — authorized-user policy, ops chat (`/ops`)

| # | You do | You should see |
|---|---|---|
| 1 | **Attach policy** → pick any file whose name does *not* say "activation" | Your turn: "Uploaded *file* — please parse this authorized-user policy document." |
| 2 | (wait) | Rule Diff card: 3 drafted rules (R1/R2/R3) with citations, **plus a 4th obligation parked as a data gap** |
| 3 | (wait) | **Gate 1** approval card — "Can I add these 3 rules to the rule store?" |
| 4 | Click **Approve** | "Stored — R1, R2, R3 are now active in the authorized-user rule store." |
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
- Anything worse → `Ctrl-C`, `DEMO_ANCHOR_DATE=2026-08-05 npm start`, `node scripts/demo-replay.mjs`.
