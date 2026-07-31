# Cardinal wire contract (v1)

The typed JSON boundary between server-side intelligence and any frontend
(brief §5b). The React app is one consumer; the production Angular port
consumes these identical contracts. Nothing in this document is
React-specific. Changes within a demo cycle must be additive.

Transport encoding is the **AI SDK 7 UI message stream**: Server-Sent Events
where each `data:` line is a JSON `UIMessageChunk`, terminated by
`data: [DONE]`. The stream reduces into `UIMessage` objects (the shapes in
§2). A non-React client can either reduce chunks itself (the chunk schema is
exported from `ai` as `uiMessageChunkSchema`) or port the small reducer in
`ai`'s `readUIMessageStream`.

---

## 1. Endpoints

### `POST /api/agents/{agentId}/stream`

Starts **or resumes** an agent run. Request body (the AI SDK
`DefaultChatTransport` shape):

```jsonc
{
  "id": "<chat id — doubles as the runId>",
  "messages": [ /* full UIMessage history, client-maintained */ ],
  "trigger": "submit-message"
}
```

- `agentId` ∈ `payment-health` (P1) · `bt-lifecycle` · `au-growth` (P2) ·
  `ask` (P3, W3.3) · `servicing` (v3 — see §10).
- The **first** message of a run is a user message whose text is a JSON
  `StreamEvent` (the trigger, e.g. Marcus's `autopay.failed`) — see §6.
  **Exception: `ask` and `servicing`.** Neither has a trigger event; each
  run's first (and every subsequent) user message is plain text, not JSON —
  a portfolio question for `ask`, a question or request about one
  cardholder's own account for `servicing`. Ask is read-only — no action
  tools, no `toolApproval` config, so §4 never applies to an `ask` run.
  `servicing` is not read-only: it has exactly one approval-gated action
  tool, scoped to the one account it was constructed for (§4, §10).
- A **resume** call is byte-identical in shape: the client re-POSTs the full
  history after appending approval responses to the last assistant message
  (§4). The server executes approved tools and continues the loop.
- Response: `text/event-stream` of `UIMessageChunk`s.

`runId := id`. It is stable across approval resumes, which is what stitches
one run's event-log entries together.

### `GET /api/events?runId=&agentId=&since=`

Returns `{ "entries": EventLogEntry[] }` (§5), oldest first. All query params
optional and ANDed. `since` is an ISO timestamp (exclusive). The run view
polls this with its `runId` while a run is live; the Event Log screen (P3)
consumes the same endpoint unfiltered.

---

## 2. Message model

A `UIMessage` is `{ id, role: 'system'|'user'|'assistant', parts: [...] }`.
Parts the frontend must handle:

| Part type | Meaning | Render as |
|---|---|---|
| `text` | Narration tokens (streamed) | Narration pane. Editorial content only — never the source of a figure. |
| `reasoning` | Model reasoning (provider-dependent, may be absent) | Optional muted block in narration pane |
| `step-start` | Loop step boundary | Visual separator (optional) |
| `tool-renderEvidence` | Evidence routing call | §3 |
| `tool-proposeDueDateChange` | Action proposal (approval-gated, payment-health) | §4 |
| `tool-sendOutreachDraft` | Action proposal (approval-gated, payment-health) | §4 |
| `tool-sendRetentionOutreach` | Action proposal (approval-gated, bt-lifecycle) | §4 |
| `tool-sendGraduationInvite` | Action proposal (approval-gated, au-growth) | §4 |
| `tool-updateContactInfo` | Action proposal (approval-gated, servicing) | §4, §10 |

A frontend handles action-tool parts **generically**: any `tool-*` part other
than `tool-renderEvidence` is an action proposal and renders off the §2 state
machine plus a static copy map keyed by tool name (§4). New action tools are
additive — an unknown tool name falls back to humanized copy, never a crash.

### Tool part state machine

Every `tool-*` part carries `toolCallId`, `input`, and a `state`:

```
input-streaming → input-available ─┬─(read-only tool)──────────→ output-available | output-error
                                   └─(approval-gated tool)→ approval-requested
                                        approval-requested → approval-responded
                                        approval-responded ─┬─(approved)→ output-available | output-error
                                                            └─(denied)──→ output-denied
```

States carry:

- `approval-requested`: `{ input, approval: { id } }` — the run is **paused**
  (stream closes with the request pending). No timeout, no auto-approve (§5d).
- `approval-responded`: `{ input, approval: { id, approved: boolean, reason? } }`
  — appended client-side, shipped back via the resume POST.
- `output-available`: `{ input, output }` — for read-only tools this arrives
  mid-stream; for approved action tools it arrives on the resume stream.
- `output-denied`: terminal state of a declined action. The run closes with a
  logged disposition; the loop may narrate a wrap-up but proposes nothing new.
- `output-error`: `{ errorText }` — render as an inline error chip, never a
  crash.

---

## 3. Render instructions — `{ component, props }`

The **only** path by which evidence reaches a screen. The `renderEvidence`
tool's input is a discriminated union over the registry
([lib/registry/evidence.ts](../lib/registry/evidence.ts)); its output is a
`RenderInstruction`:

```ts
{ component: RegistryComponentName, props: /* per-component, Zod-validated */ }
```

Props are computed **server-side** from SOE adapter data and validated against
[lib/registry/schemas.ts](../lib/registry/schemas.ts) before streaming. Display
strings (currency, dates, percents) are preformatted server-side; raw numbers
cross the wire only where a chart needs geometry. The model chooses *which*
member renders; it supplies no figures (§5a). The single editorial exception:
`RiskBadge.rationale` (model-authored plain English, flagged as such in the
schema).

The frontend maps `component` → renderer and spreads `props`. Rules:

- A component name outside the registry: render nothing, log a console error.
  Never crash (§8).
- Evidence renders progressively: paint each `tool-renderEvidence` part the
  moment it reaches `output-available`, in stream order.

Registry (P1 set ships now; rest land with their beats):

| Component | Props schema | Phase |
|---|---|---|
| MetricRow | `metricRowPropsSchema` | P1 |
| TrendChart | `trendChartPropsSchema` | P1 |
| PaymentHistoryTable | `paymentHistoryTablePropsSchema` | P1 |
| RiskBadge | `riskBadgePropsSchema` | P1 |
| OutreachDraftCard | `outreachDraftCardPropsSchema` | P1 |
| ApprovalCard | `approvalCardPropsSchema` | P1 |
| BTTimeline | `btTimelinePropsSchema` | P2 (W2.1) |
| InterestProjectionChart | `interestProjectionChartPropsSchema` | P2 (W2.1) |
| PartyGraph | `partyGraphPropsSchema` | P2 (W2.2) |
| BarBreakdown | `barBreakdownPropsSchema` | P3 (W3.3) |
| CategoryPie | `categoryPiePropsSchema` | P3 (W3.3) |
| TransactionTable | `transactionTablePropsSchema` | P3 (W3.3) |

Adding a component = props schema + renderer + one union member (§5c).

`OutreachDraftCard` and `ApprovalCard` are registry members but are **not**
produced by `renderEvidence` — they render from action-tool parts (§4).

---

## 4. Approval payloads

Action tools (side effects) are marked `user-approval` in the agent's
`toolApproval` config; read-only tools never are (§5d — itself a talking
point). Action tools by agent:

| Tool (agent) | Input (model-authored fields are editorial) | Mock side effect on approval |
|---|---|---|
| `proposeDueDateChange` (payment-health) | `{ accountId, proposedDueDayOfMonth, rationale }` | Due-date change "executes"; output `{ status: 'executed', confirmationId, effective }` |
| `sendOutreachDraft` (payment-health) | `{ accountId, subject, body, rationale }` | Outreach "sends"; output `{ status: 'sent', channel, to, confirmationId }`. Recipient resolved server-side from party data — the model never supplies contact details. |
| `sendRetentionOutreach` (bt-lifecycle) | `{ accountId, subject, body, rationale }` | Same shape as `sendOutreachDraft`; recipient is the account's primary party, resolved server-side. |
| `sendGraduationInvite` (au-growth) | `{ accountId, recipientPartyId, subject, body, rationale }` | Invitation "sends"; output `{ status: 'sent', channel, to, confirmationId }`. `recipientPartyId` is a routing reference — the email is resolved server-side, and the server rejects any recipient who is not an authorized user on the account. |
| `updateContactInfo` (servicing) | `{ phone?, mailingAddress?, rationale }` | Contact info "updates"; output `{ status: 'updated', confirmationId, phone, mailingAddress }`. `phone`/`mailingAddress` are individually optional (updating just one doesn't require restating the other); the model must use the cardholder's exact stated value, never invent one. No `accountId`/`partyId` field exists on this input — the party is the one this agent was constructed for (§10). |

**`scope` and `reviewList` (v3 addition, `ApprovalCardProps`,
`lib/registry/schemas.ts`).** Two optional fields for a bulk action's
approval card: `scope` (a preformatted headline with the blast radius
embedded in the sentence, e.g. "Remove 87 authorized users from 74 accounts
and notify 74 primary cardholders," plus optional structured count chips
backing it) and `reviewList` (a "Review the list (N)" disclosure of up to 25
rows the presenter can inspect before approving, plus a showing/total
footnote). Both are additive and optional: every v1 caller that never sets
them is unaffected, and `components/registry/approval-card.tsx` only renders
either block behind a presence check, so an untouched v1 ApprovalCard stays
pixel-identical. `reviewList.rows` deliberately uses generic field names —
`primary` / `secondary` / `detail` — rather than AU-specific ones, keeping
the shared v1 registry decoupled from Sentinel/AU-policy semantics: Sentinel's
own exception rows (`lib/sentinel/exception-fixture.ts`'s `AuExceptionRow`)
map onto this shape (`accountLabel` → `primary`, `authorizedUser` +
`ruleShortName` → `secondary` + `detail`) rather than the shared registry
adopting Sentinel's vocabulary. Sentinel's remediation gate (§9.7) is the
first caller of both fields.

Frontend mapping (mechanical, no business logic):

- `state: 'approval-requested'` → render an **ApprovalCard**:
  `approvalId = approval.id`, `toolName`, `title`/`description` from a static
  copy map keyed by tool name, `rationale = input.rationale`, `evidence` =
  labels of render instructions streamed so far in this run.
- For `sendOutreachDraft`, render an **OutreachDraftCard** above the
  ApprovalCard from `input` (`subject`, `body`; `to` shows the account's
  primary party email, which the client already holds from the
  `account-overview` MetricRow step — display-only).
- Approve/Decline click → append `approval-responded`
  (`{ approved, reason? }`) → re-POST full history (§1). The AI SDK client
  does this via `addToolApprovalResponse` +
  `sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses`;
  Angular reimplements the same two steps.

Every gate decision writes an event-log entry with `actor: 'human'` (§5).

---

## 5. Event log entries

Exact shape (brief §5e), extended with `id` and `kind`:

```ts
interface EventLogEntry {
  id: string;            // unique, monotonic per store
  runId: string;
  agentId: string;
  step: number;          // loop step index, 0-based; -1 for run-level entries
  toolName?: string;
  inputSummary?: string;   // one-line, human-readable; never full payloads
  outputSummary?: string;
  actor: 'agent' | 'human';
  timestamp: string;       // ISO 8601
  kind:
    | 'run.started'
    | 'step.completed'
    | 'tool.executed'
    | 'approval.requested'
    | 'approval.granted'     // actor: 'human'
    | 'approval.denied'      // actor: 'human'
    | 'action.executed'
    | 'run.finished'
    | 'run.failed';
}
```

Agent-actor entries are produced by **one AI SDK telemetry integration**
(`registerTelemetry`, wired at app startup via `instrumentation.ts`) mapping
lifecycle events — run start/end, tool execution start/end, step end — onto
this shape; no manual log calls inside tools (§5e). Human-actor entries are
written by the stream route when it ingests approval responses. Store is
in-memory (prototype); production swaps the sink, not the shape.

---

## 6. Run triggers

A run starts from a `StreamEvent` (lib/soe/types.ts). The client sends it as
the first user message, `text` = pretty-printed JSON of the event. Triggers
by agent:

| Agent | Trigger `eventId` | `kind` |
|---|---|---|
| payment-health | `evt-marcus-autopay-failed` | `autopay.failed` |
| bt-lifecycle | `evt-elena-promo-expiring` | `bt.promo_expiring` |
| au-growth | `evt-patel-statement` | `statement.generated` |

`ask` and `servicing` have no trigger event and are not in this table — each
one's first user message is plain text instead of a `StreamEvent` (§1
exception).

Example (payment-health):

```json
{
  "eventId": "evt-marcus-autopay-failed",
  "accountId": "acct-marcus",
  "kind": "autopay.failed",
  "summary": "Autopay declined for Marcus Webb — payment of $142.00 due today not covered",
  "timestamp": "<anchor − 12d, 06:00Z>"
}
```

The agent treats the event as untrusted context: it re-fetches everything it
asserts through its read-only tools.

---

## 7. Contract guarantees (restating brief §5)

1. Every figure on screen originated in the SOE adapter and crossed the wire
   inside validated `props` or tool `output` — the model cannot inject one.
2. All intelligence is server-side; a frontend implements §§2–4 rendering and
   nothing else.
3. Only registry components render, ever.
4. Approval gates are real pauses: a paused run has no server-side timer and
   resumes only via §4's human response.
5. Every run step is reconstructable from `GET /api/events`.

---

## 8. Mechanical replay (W4.4, extended by W5.4)

`scripts/demo-replay.mjs` is a checked-in, dependency-free Node script that
drives every beat of the demo script purely over HTTP/SSE against this
contract — no browser, no API key, no network beyond the target host. It
started as the brief §10 P4 phase gate for v1 alone ("the complete demo
script replays clean, repeatedly") and W5.4 (CARDINAL_V3_AU_BRIEF.md §8 P5)
extended it to close the SAME gate for v3: "the complete demo replays clean,
repeatedly."

**Run it:**

```sh
DEMO_SCRIPTED_DELAY_MS=0 npm run dev   # in one terminal
npm run verify:demo                    # in another
```

`DEMO_REPLAY_URL` (default `http://localhost:3000`) points the replay at a
running server. If nothing answers there, the script starts its own
(`npx next dev -p 4312`, no provider env vars, `DEMO_SCRIPTED_DELAY_MS=0`)
and tears it down when it finishes. `DEMO_SCRIPTED_DELAY_MS=0` only affects
pacing (brief §8.3) — the replay passes at the default delay too, just
slower.

**What it covers**, as sequential named beats (each prints `PASS`/`FAIL
<beat>: <detail>`; the process exits non-zero on any failure; a coverage
summary prints once at the end regardless of outcome):

- **Beat 0** — `POST /api/reset` and `GET /api/events` reach the opening
  state; `GET /` renders all three agent names.
- **Beat 1** — `GET /workflows` renders the palette's five node labels.
- **Beats 2–4** — one full run per monitor agent, mirroring the client's
  `DefaultChatTransport` request body exactly (§1): the trigger StreamEvent
  as the first user message, a hand-rolled reducer over the raw
  `UIMessageChunk` SSE stream (§2) asserting narration arrives, the agent's
  `renderEvidence` sequence matches its script.ts exactly, its action
  tool(s) reach `approval-requested`, then a resume POST built the way
  `addToolApprovalResponse` + `lastAssistantMessageIsCompleteWithApprovalResponses`
  build it (§4) — approving every pending tool and re-sending the full
  history — asserting the action tool(s) execute and a closing narration
  arrives.
- **Beat 5** — both rehearsed Ask questions (brief §8.2), asserting the
  expected evidence component (`CategoryPie` / `BarBreakdown`) and a clean
  finish.
- **Beat 6** — `GET /api/events` covers every run from beats 2–5, including
  an `actor:'human'`, `kind:'approval.granted'` entry per approved action
  tool.
- **Beats 7–10 (v3 Sentinel)** — `GET /sentinel` serves the real three-act
  scenario (markers distinguishing it from both the segment error boundary
  and the `?scenario=graph-rehearsal` fixture — §9's rehearsal escape
  hatch); `POST /api/sentinel/remediate` called twice back-to-back returns
  byte-identical bodies carrying the exception fixture's real 87/74/74
  figures (§9.7's determinism guarantee, the single most demo-critical
  invariant in v3) and writes an `action.executed` audit entry;
  `GET /api/sentinel/report` returns the header row plus exactly 87 data
  rows, RFC4180-quoted, and a clean 404 for a missing/unknown `reportId`;
  `POST /api/sentinel/audit` lands in `GET /api/events`.
- **Beats 11–14 (v3 servicing)** — all four §10.3 read turns render their
  specified component; the contact-change turn's full approval round trip
  (§10.4) — request reaches `approval-requested`, the resume POST approves
  it the same way beats 2–4 do, `updateContactInfo` reaches
  `output-available`, and the Event Log carries both an `actor:'human'`
  `approval.granted` entry and an `action.executed` entry; §10's
  identity-pinning guarantee restated at the wire level for both a read (a
  "latest transactions" question naming a different account gets back
  byte-identical data to the plain question) and the write
  (`confirmationId` stays scoped to the pinned party regardless of what
  account the request text names); `POST /api/reset` keeps the write path
  functioning cleanly immediately after a mutation.
- **Repeatability** — resets, replays Payment Health alone, and asserts its
  two action tools' `confirmationId`s are byte-identical to the first pass
  (`lib/agents/payment-health/tools.ts` derives them deterministically from
  `accountId` — never random — which is exactly what "replays clean,
  repeatedly" requires).

**What it deliberately does not cover (v3).** The Sentinel stage is 100%
client-scripted (§9 — no LLM calls, no network dependency): there is no
server-side stream for a plain-Node HTTP script to drive, so this replay
cannot and does not exercise the three-act scenario's own sequencing — graph
node transitions, the Rule Diff's proposed→active flip, `DecisionCard`'s
route resolution, the remediation gate's `onDeny` branch, or the 3×-replay /
both-demo-anchor invariants. `lib/sentinel/scenario/demo-scenario.test.ts`
covers all of that exhaustively by driving `ScenarioPlayer` in-process
(`npm run test`) — duplicating it here would mean either faking a wire that
doesn't exist or re-running the same in-process assertions under a
misleading "mechanical replay" banner, which this script's own printed
coverage summary explicitly disclaims. Similarly, byte-level reversion of a
mutated `phone` value by `POST /api/reset` is proven only by
`lib/soe/adapter.test.ts`'s direct-import unit test, not by this script: the
servicing surface exposes no read path for contact fields (no §10.3 evidence
kind shows `phone`/`mailingAddress` on screen), and `updateContactInfo`'s
own output always echoes back exactly the value THIS call just wrote, so no
sequence of wire calls can observe what a field held before a reset.

---

## 9. Sentinel scenario stream (v3)

The Sentinel stage (`/sentinel`, CARDINAL_V3_AU_BRIEF.md §4) is driven by a
`ScenarioPlayer` (`lib/sentinel/scenario/player.ts`) instead of an AI SDK agent
run — this build is 100% scripted, no LLM calls (brief §10). The player
publishes a message stream whose **payloads reuse the existing wire contract
wherever one already fits** — `RenderInstruction` (§3), `ApprovalCardProps`
(§4), `EventLogEntry` (§5) — and adds only the envelope types this stage needs.
Like the rest of this document, nothing here is React-specific:
`SentinelStreamMessage` is a plain JSON shape any renderer (the current React
stage, or a future port) can consume, and this section is transport-agnostic —
§9.3 gives one representative transport, not the only legal one.

This is a **versioned extension**: nothing in §§1–8 changes, and every Sentinel
message carries its own `seq` rather than reusing any part of §2's
`UIMessage`/`UIMessageChunk` model. Per brief §11, this contract is what the
post-review real Sentinel runtime must emit — the ScenarioPlayer is the
reference implementation, not the spec. Brief §11 calls out two seams by name
as first-class handoff concerns for the integration team: the bulk side
effect §9.7 documents, and the customer-scoped identity binding §10
documents (outside the Sentinel stream — it belongs to the `servicing` agent,
which rides §§1–8's ordinary agent-run contract, not this section's).

**This section is v3 and supersedes the v2 balance-transfer stream it replaced
in place.** v2's `emitEvent` / `railReset` / `narration` steps and its
`{ events, violations, flagged }` counter no longer exist in any form: v3 has
no event replay rail, and its sweep is an aggregate over the whole book rather
than a night of streamed events. `docs/v3-migration-map.md` §4 records the
change set; this section documents only what a runtime must emit today.

### 9.1 Scenario step format

A `SentinelScenario` (`lib/sentinel/scenario/types.ts`) is `{ id, steps }` —
an ordered, checked-in list of `ScenarioStep`s. Every variant except
`actMarker`, `awaitApproval`, and `awaitStageAction` carries `delayMs`: how
long the player waits (divided by the current playback speed) before executing
that step.

| Step | Fields | Notes |
|---|---|---|
| `actMarker` | `act: 1\|2\|3`, `title` | No `delayMs`. Playback PAUSES on reaching one — act transitions are presenter-triggered, never automatic (brief §3). |
| `graphStep` | `delayMs`, `nodeId: SentinelNodeId`, `nodeState: 'idle'\|'working'\|'done'\|'armed'`, `animatedEdges?`, `detail?` | One node's state transition on the live agent graph. `armed` is Act II's post-activation "idle-armed" state (brief §3 Act II beat 4) — rules live, nothing in flight, a subtle pulse instead of fully dark. `animatedEdges`, when present, REPLACES the animated-edge set wholesale — declarative, not a diff, because the graph renderer holds no logic. `detail`, when present, is a short per-node activity caption rendered in place of the node's state word (Act III's "call 2 of 3 · party roles" — brief §3: the Data Collector fires "three times, visibly"); same wholesale semantics — a `graphStep` WITH `detail` sets that node's caption, one WITHOUT clears it. |
| `chatTurn` | `delayMs`, `id`, `role: 'user'\|'agent'`, `text` | One turn in the conversation rail. `role: 'agent'` is played back chunked (§9.2), typing-effect style; `role: 'user'` publishes whole and instantly — a human typed it, the audience already watched that happen. **This is v3's only narration step**: v2's separate `narration` step collapsed into `role: 'agent'` rather than coexisting with it (brief §6a). |
| `render` | `delayMs`, `id`, `instruction: SentinelRenderInstruction` | Same `{ component, props }` shape §3 documents, widened to the Sentinel-only additive components of §9.6 — registry components only. A step reusing an earlier step's `id` REPLACES that rendered item in place (position preserved) instead of appending a second one — progressive/stateful evidence, e.g. Act II's rule cards flipping proposed→active as the same `id` re-renders with `status: 'active'`, or Act III's `DecisionCard` resolving its routes one at a time. |
| `awaitApproval` | `id`, `payload: ApprovalCardProps`, `audit`, `onDeny?: ScenarioStep[]` | HARD-BLOCKS playback until resolved — no auto-approve, no timeout (v1 §4 carries over verbatim). No `delayMs`: the block itself is the wait. `audit` is `Omit<EventLogEntry, 'id'\|'timestamp'\|'kind'\|'actor'>` — the fields `kind`/`actor` get filled in from the resolution (§9.2). `onDeny`, when present, is the steps played **instead of** the remainder of the scenario if this gate is DENIED — absent means denial continues the script unchanged. See below the table. |
| `awaitStageAction` | `id`, `action: 'policy-drop'\|'prompt'`, `suggested?` | HARD-BLOCKS playback until resolved, exactly like `awaitApproval` (no `delayMs`, no auto-resolve, no timeout) — but models a presenter-driven staging beat that isn't a business decision: Act II's mock file-drop into the policy panel (`'policy-drop'`) and Act III's conversation-rail prompt (`'prompt'`). `suggested` carries the scripted prompt for the rail's suggestion chip. **See §9.2 for the resolution's verbatim-echo rule** — the player never string-matches submitted text. |
| `counterUpdate` | `delayMs`, `counter: { scanned, exceptions, remediated }`, `caption?` | The large-type counter beats (brief §3: Act I's "1,247 · 0 · 0", Act III's closing "1,247 scanned · 87 exceptions"). `caption` present marks a full-size beat card rather than a quiet counter tick. |
| `auditWrite` | `delayMs`, `entry: Omit<EventLogEntry, 'id'\|'timestamp'>` | Appends straight to the shared Event Log via §9.4 — `id`/`timestamp` are assigned on append, exactly like every other entry in §5. |
| `policyPanel` | `delayMs`, `panel: 'closed'\|'drop'\|'preview'` | Drives the Act II policy drawer declaratively (brief §3 Act II beat 1) — the drawer is a pure renderer of this field, no component-local open/closed state. |

`SentinelNodeId` is the six fixed graph nodes: `orchestrator`,
`policy-analyst`, `rule-engineer`, `data-collector`, `critic`,
`approval-gate` (brief §4's fixed six-node layout — no node is ever added or
removed at runtime).

**`onDeny` — why it exists.** Brief §3 requires "reject path must work on
demand": a presenter has to be able to click Decline on any gate, at any
rehearsal, and see the stage close out honestly rather than sail on into
content that assumes approval. Most gates don't need special handling for
that — Act II's rule-activation gate, for instance, has nothing scripted
after it that depends on the decision either way, so a bare denial (no
`onDeny`) falling through to whatever comes next is already correct. Act
III's remediation gate is different: everything scripted after it — the
graph working, the `RemediationReport` card, the closing counter reading
`remediated: 87` — assumes the removal executed. Without `onDeny`, a decline
there would either desync the visible narrative from the (unexecuted) side
effect or require ad hoc branching logic inside the player itself. `onDeny`
solves this the same way the rest of this stage solves everything: with more
script, not more code. It is deliberately just an ordinary `ScenarioStep[]` —
a closing agent line, an `auditWrite` recording the disposition, a
`counterUpdate` with `remediated: 0` — not a second mini-DSL.

Mechanically, `ScenarioPlayer#resolveApproval` splices `onDeny`'s steps into
the **working** step queue (`this.steps`, a per-instance copy seeded from
`scenario.steps`) right after the denied step's position, replacing
everything that would otherwise have played next. It never touches
`scenario.steps` itself. `reset()` re-seeds `this.steps` from
`scenario.steps` on every call (and on construction), so a denial that took
the `onDeny` branch leaves no residue: deny → reset → replay reproduces the
original script byte-for-byte, exactly as a clean run does. This is the
guarantee that makes rehearsing a decline safe to do more than once in front
of an audience — the demo can't accumulate damage from being rejected
repeatedly.

### 9.2 Published message union

`SentinelStreamMessage` mirrors `ScenarioStep` one-for-one, minus `delayMs`
(consumed by the time a message publishes) and minus the three variants that
split into a different shape:

- `chatTurn` with `role: 'agent'` → one or more `narrationDelta` messages:
  `{ type: 'narrationDelta', id, delta, done }`. Fixed 3-character chunks on
  a fixed 16ms cadence (scaled by speed) — no randomness anywhere in this
  stream (brief §9). Concatenating every `delta` for one `id`, in `seq`
  order, reconstructs the step's original `text` exactly; `done: true` marks
  the final chunk. A `chatTurn` with `role: 'user'` publishes unchanged, as
  a single message.
- `awaitApproval` → an `approvalRequest` message when the gate opens (`{
  type: 'approvalRequest', id, payload }`), and — once resolved — an
  `approvalResolved` message (`{ type: 'approvalResolved', id, approved }`)
  immediately followed by an `auditWrite` message built from the step's
  `audit` field plus `kind: approved ? 'approval.granted' : 'approval.denied'`
  and `actor: 'human'` (§5's human-decision convention, unchanged).
- `awaitStageAction` → a `stageActionRequest` message when the gate opens
  (`{ type: 'stageActionRequest', id, action, suggested? }`), and — once
  resolved via `ScenarioPlayer#resolveStageAction(id, text?)` — first a
  `chatTurn` message echoing `text` **verbatim** as a `user` turn (only when
  text is present), then a `stageActionResolved` message (`{ type:
  'stageActionResolved', id, text? }`). Same hard-block semantics as
  `awaitApproval` (no timer, no auto-resolve outside `jumpToAct`'s rehearsal
  fast-forward, which auto-resolves it exactly as it auto-approves a pending
  `awaitApproval`, falling back to `suggested` for the echo).

**The verbatim-echo rule (brief §4, §9).** Any submitted text resolves a
`'prompt'` gate, and the scripted response follows regardless of what was
typed. A conforming runtime MUST NOT compare the submitted text to
`suggested`, MUST NOT branch on its content, and MUST echo it unmodified.
`suggested` is a UI affordance and a rehearsal fallback, never a key — gating
a live stage on exact string matching is how a demo dies.

Every other step publishes one message of the same `type`, carrying the
same fields minus `delayMs`:

```ts
type SentinelStreamMessage =
  | { type: 'actMarker'; act: 1 | 2 | 3; title: string; seq: number }
  | {
      type: 'graphStep';
      nodeId: SentinelNodeId;
      nodeState: 'idle' | 'working' | 'done' | 'armed';
      animatedEdges?: Array<{ from: SentinelNodeId; to: SentinelNodeId }>;
      detail?: string;
      seq: number;
    }
  | { type: 'chatTurn'; id: string; role: 'user'; text: string; seq: number }
  | { type: 'narrationDelta'; id: string; delta: string; done: boolean; seq: number }
  | { type: 'render'; id: string; instruction: SentinelRenderInstruction; seq: number }
  | { type: 'approvalRequest'; id: string; payload: ApprovalCardProps; seq: number }
  | { type: 'approvalResolved'; id: string; approved: boolean; seq: number }
  | {
      type: 'counterUpdate';
      counter: { scanned: number; exceptions: number; remediated: number };
      caption?: string;
      seq: number;
    }
  | { type: 'auditWrite'; entry: Omit<EventLogEntry, 'id' | 'timestamp'>; seq: number }
  | { type: 'policyPanel'; panel: 'closed' | 'drop' | 'preview'; seq: number }
  | {
      type: 'stageActionRequest';
      id: string;
      action: 'policy-drop' | 'prompt';
      suggested?: string;
      seq: number;
    }
  | { type: 'stageActionResolved'; id: string; text?: string; seq: number };
```

Every message carries a monotonically increasing `seq` — the ordering
guarantee a consumer relies on instead of arrival order (which a future
non-in-process transport might not preserve byte-for-byte).

### 9.2a Derived renderer state

`ScenarioPlayer#getSnapshot()` returns `SentinelStageState`, the
renderer-friendly projection of the message log above. It is not part of the
wire contract — a different renderer may project the same messages
differently — but two fields are worth naming because v2's shape is gone:

- `conversation: Array<{ id, role, text, done }>` — the conversation rail's
  transcript, oldest first, fed by `chatTurn` and `narrationDelta`. Replaces
  v2's `railEvents`.
- `counter: { scanned, exceptions, remediated }` — §9.1's reshape.

`SentinelContextItem` carries `render` and `approval` items only: in v3
narration lives in the conversation rail and evidence lives in the context
rail (brief §4), so the context rail's list is evidence and gates.

### 9.3 Transport (reference; not the contract)

The checked-in `ScenarioPlayer` is an in-process, synchronous publisher — no
network hop, matching brief §9 ("runs identically with the network cable
pulled"). A `subscribe(listener)` / `getSnapshot()` pair
(`useSyncExternalStore`-shaped) is how the current React stage consumes it.
A future real runtime is free to put the identical message union on the
wire however fits its transport (SSE, WebSocket, or another in-process
publisher) — §9.2's shapes are the contract; how they cross a process
boundary is not.

### 9.4 Sentinel's Event Log ingestion

`POST /api/sentinel/audit` — body `Omit<EventLogEntry, 'id' | 'timestamp'>`,
validated (zod: `agentId` must start with `"sentinel"`, `runId` non-empty,
`step` integer ≥ −1, `actor` ∈ `{agent, human}`, `kind` one of §5's
`EventLogEntryKind` values). On success, appends via the same
`lib/events/store.ts` §5 already documents and returns `{ entry }` (200); on
validation failure, `{ error }` (400). This is how `auditWrite` messages
(direct steps and approval-derived alike, §9.2) reach the shared Event Log —
the ScenarioPlayer itself never fetches; the stage subscribes to its
messages and calls this route. Sentinel entries are indistinguishable in
shape from any §5 entry, which is the point: one audit surface for
everything (brief §3 Act III's closing beat).

### 9.5 Contract guarantees (Sentinel-specific restatement of §7)

1. Every figure the conversation rail, graph, or context rail renders
   originated in a scenario step's literal data or an SOE-backed
   `RenderInstruction` — never computed client-side (mirrors §7.1/brief §5b;
   the ScenarioPlayer plays a script, it doesn't compute anything either).
2. Approval gates are real pauses: `awaitApproval` has no timer and no
   auto-approve path outside `jumpToAct`'s explicitly-documented rehearsal
   semantics (`lib/sentinel/scenario/player.ts`), which exist for presenter
   rehearsal only and are never reachable from the presenter bar's normal
   play/pause/reset controls. `awaitStageAction` blocks identically.
3. Only registry components render from `render` steps, ever — either §3's
   v1 registry or the Sentinel stage components of §9.6, never anything else.
4. Every Sentinel audit write is reconstructable from `GET /api/events`
   (§1), same as every v1 entry.
5. A `'prompt'` gate's resolution never changes what plays next (§9.2's
   verbatim-echo rule).
6. Every figure the remediation route's response and the downloadable report
   carry originates in `lib/sentinel/exception-fixture.ts`'s fixture —
   never assembled client-side from rendered DOM, never restated as a
   literal in a route file (§9.7).

### 9.6 Sentinel stage components (additive)

The Sentinel stage widens the `render` step's payload from `RenderInstruction`
(§3) to `SentinelRenderInstruction` (`lib/sentinel/registry.ts`) — a union of
the unchanged v1 registry and Sentinel-only additive components:

```ts
type SentinelRenderInstruction =
  | RenderInstruction
  | { component: 'RuleDiff'; props: RuleDiffProps }
  | { component: 'RuleCitation'; props: RuleCitationProps }
  | { component: 'DecisionCard'; props: DecisionCardProps }
  | { component: 'PolicyExceptionTable'; props: PolicyExceptionTableProps }
  | { component: 'RemediationReport'; props: RemediationReportProps };
```

v3 removed `BTEventDetail` from this union: the sweep is an aggregate, so
there is no single-event hero card (brief §2b). `PolicyExceptionTable` and
`RemediationReport` (Act III) are the two components P3 added; both are
documented below, after `DecisionCard`.

`lib/sentinel/registry.ts` is a separate, additive component namespace, not a
change to `lib/registry/schemas.ts` — v1's registry (§3, CLAUDE.md 5c) is
untouched.

**`RuleDiff`** (Act II, brief §3 Act II beat 3) — the split
excerpt/plain-English/machine-footer card the Rule Diff view renders while the
policy document is parsed into enforceable rules:

| Field | Type | Notes |
|---|---|---|
| `title` | `string` | e.g. "AU-Eligibility-Policy-2026 → extracted rules". |
| `status` | `'proposed' \| 'active'` | `proposed` before the ApprovalCard resolves, `active` once approved. Set by the scenario step, never inferred client-side. |
| `storeMeta?` | `string` | v3 addition (brief §6d, Act III beat 1) — the rule store's own label, e.g. "Rule store · continuous · nightly 02:00 UTC · last run 4h ago". Absent in Act II (there's no store to label until the rules are active); Act III re-renders this SAME card under the SAME `render` id with `storeMeta` set, so the card the audience watched go proposed → active visibly becomes a live rule store rather than a new card appearing. **"Continuous"/"nightly 02:00 UTC" is a label, not a mechanism** — nothing in this build schedules anything; the string is preformatted chrome, same as every other display value in this file. Do not build a scheduler to make this field "real." |
| `rules[].ruleId` | `string` | e.g. "R1" (or the obligation id, e.g. "O4", for a `data-gap` row). |
| `rules[].title` | `string` | |
| `rules[].excerpt.sectionHeading` | `string` | e.g. "Product Eligibility". |
| `rules[].excerpt.quote` | `string` | Verbatim substring of the policy document — cited, not paraphrased (asserted in `lib/sentinel/policy.test.ts`). |
| `rules[].plainEnglish` | `string` | Model-authored restatement (editorial content, brief §5a). |
| `rules[].machine?` | `{ ruleId, datasetsTouched: string[], evaluationTrigger }` | Machine-readable footer. Absent on a `data-gap` row — nothing was ever drafted into a machine-readable rule, so there is no footer to show; the renderer's absent-footer branch is how the audience SEES that, not just reads it in a caption. |
| `rules[].criticNote?` | `string` | The Critic's evaluability note, e.g. "Evaluable with current SOE data: parties carry date of birth, roles carry the date of addition." For a `data-gap` row this is instead the Critic's reason the obligation is parked, and it is always present on that row. |
| `rules[].validated` | `boolean` | Critic-pass flag, set by the scenario step, never derived client-side. A `data-gap` row is always `false` — there was nothing evaluable to validate. |
| `rules[].evaluability` | `'evaluable' \| 'data-gap'` | Defaults to `'evaluable'` (R1–R3's kind: a normal drafted rule). `'data-gap'` marks an obligation the Policy Analyst extracted but the Critic could not evaluate against current SOE data (`policyObligationGap`, `lib/sentinel/policy.ts` — v3's is consent-on-file). Set by the scenario step, never inferred client-side from `machine`'s presence or `validated`'s value. |

`rules` holds 1–4 entries: the three extracted rules R1–R3, plus at most one
`data-gap` row for an obligation the Critic parked instead of validating.

**`RuleCitation`** (Act III, brief §3 Act III beats 4–5) — the rule-text +
checked-conditions card the investigation renders once a rule is cited against
a specific flagged relationship. One component covers both of Act III's
verdicts: the R1 exemplar's violation and the Patel household's clean pass.

| Field | Type | Notes |
|---|---|---|
| `ruleId` | `string` | e.g. "R1". |
| `title` | `string` | e.g. "Product Eligibility". |
| `ruleText` | `string` | The rule's plain-English text, quoted verbatim from the active rule set — cited, not paraphrased. |
| `verdict` | `'violation' \| 'pass'` | Set by the scenario step, NEVER derived from `checks` client-side: a card with every check `met: true` is a violation for R1 (all violation conditions confirmed) and a pass for a compliance check (the compliance condition confirmed) — only the scenario knows which. The renderer colors the check icons from this field alone. |
| `checks[].label` | `string` | The condition evaluated, e.g. "Account product is a secured card". |
| `checks[].detail?` | `string` | Preformatted evidence line, e.g. "Security deposit $500.00 · line collateralized". |
| `checks[].met` | `boolean` | Condition-evaluation flag — scripted, never computed by the renderer. |

`checks` holds 1–4 entries.

**`DecisionCard`** (Act III, brief §3 Act III beat 6) — the stacked-options
card that makes the agent's post-verdict JUDGMENT visible. The rule verdicts
(`RuleCitation` above) are deterministic and stay that way; this card is the
different thing that happens next: laying out the compliant response routes,
then resolving them one at a time as the investigation completes.

| Field | Type | Notes |
|---|---|---|
| `title` | `string` | e.g. "Response to 87 policy exceptions". |
| `subtitle?` | `string` | Optional framing line, e.g. "The findings are deterministic. The response is a judgment call." |
| `options[].id` | `string` | Stable route id, e.g. `'remove-all'` \| `'stage-for-review'` \| `'remove-and-notify'` — also the render key, so it stays identical across same-id re-renders. |
| `options[].label` | `string` | |
| `options[].summary` | `string` | One-line description of the route. |
| `options[].status` | `'considering' \| 'selected' \| 'rejected'` | Set by the scenario step at each `render`, NEVER derived client-side from `rationale` or from the other options' statuses — the same invariant `RuleCitation.verdict` carries above (brief §5a/§5b: the renderer holds no judgment logic of its own). |
| `options[].rationale?` | `string` | Why this route was selected or rejected — present once a route leaves `'considering'`, so rejections are "on the record," not a silent status flip. |
| `footnote?` | `string` | Small print at the card's foot, e.g. "Whichever route is selected requires human approval before anything executes." |

`options` holds 2–4 entries. The demo scenario re-renders this card multiple
times under the SAME `render` id (§9.1's same-id replace-in-place semantics)
as the investigation narrows the routes down — all `'considering'`, then one
rejected, then the final resolution — and `options` is emitted in the SAME
order on every re-render: the card must read as the same routes
progressively resolving, never a reshuffled list.

**`PolicyExceptionTable`** (Act III, brief §3 beat 3) — the aggregate
flagged-relationship table the sweep renders: a slice of the full exception
set on a projector, each row citing the rule it breaks. A pure renderer with
zero derivation — every field arrives preformatted; the component does no
`toLocaleString`, no date math, no currency formatting of its own.

| Field | Type | Notes |
|---|---|---|
| `title` | `string` | |
| `rows[].accountLabel` | `string` | e.g. "Nguyen household · ••4821" — the account's PRIMARY party's household surname plus a masked (not a real redaction — these are synthetic seed accounts) account tail. Never the AU's own name: the row's subject is the flagged relationship. |
| `rows[].authorizedUser` | `string` | The flagged authorized user's name. |
| `rows[].ruleId` | `'R1' \| 'R2' \| 'R3'` | Lets a reader correlate a row against a by-rule `BarBreakdown` rendered alongside the table. |
| `rows[].ruleShortName` | `string` | e.g. "R1 · Product Eligibility" — rule id plus a short name, so the rule mix scans without a legend. |
| `rows[].finding` | `string` | The specific finding, preformatted, e.g. "Secured card · deposit $500.00 · AU added Mar 14, 2024". |
| `rows[].addedDate` | `string` | Preformatted display date — when the authorized-user relationship was added, not when the exception was found. |
| `footnote?` | `string` | e.g. "Showing 12 of 87 exceptions." Same showing/total convention `TransactionTable` already established (`lib/registry/schemas.ts`) — one preformatted sentence, not a second structured `showing`/`total` pair invented for this table alone. |

`rows` holds 1–25 entries — the table shows a slice, never all 87 at once; the
full set is what the CSV (§9.7) is for. Every row is one entry of
`lib/sentinel/exception-fixture.ts`'s `AuExceptionRow`, the single fixture
that also backs `RemediationReport` below and the CSV — see §9.7 for why that
matters.

**`RemediationReport`** (Act III, brief §3 beat 8) — the post-approval outcome
card: what actually executed, in the same preformatted vocabulary the
exception table used.

| Field | Type | Notes |
|---|---|---|
| `title` | `string` | |
| `counters` | `Array<{ label, value }>` (1–6) | Outcome counters — removed, accounts touched, notifications queued. Mirrors `InterestProjectionChart.callouts`'s `{ label, value }` shape (`lib/registry/schemas.ts`) rather than inventing a third stat-callout convention. Not fixed at exactly three, so a future counter (e.g. a decline count on the reject path) doesn't need a schema change. |
| `confirmationId` | `string` | Deterministically derived from the fixture, never random — see §9.7's derivation. |
| `rows` | `AuExceptionRow[]` (1–25) | Same row shape as `PolicyExceptionTable.rows` above — the scenario step slices the same fixture's rows to the first N, it does not re-describe them. |
| `footnote?` | `string` | Same showing/total convention as `PolicyExceptionTable.footnote`. |
| `downloadUrl?` | `string` | `/api/sentinel/report?reportId=…` (§9.7). Optional **by design**: brief §9 requires the demo to survive "the network cable pulled," so an absent URL must degrade the Download CSV control to disabled with a quiet reason (`components/sentinel/evidence/remediation-report.tsx`), never to a dead link or a thrown error. |

One reuse nuance: on the Sentinel stream, **`OutreachDraftCard` is a legal
`render` payload**, even though §3 documents it as never produced by
`renderEvidence` in v1 — there the card renders only from action-tool parts
(§4). Both statements hold: v1's evidence renderer still refuses it, and the
Sentinel stage's own routing layer (`components/sentinel/evidence`) renders it
from `render` steps, because on this stream the scripted scenario is the
draft's source and `render` is the only path to the screen. `ApprovalCard`
needs no such carve-out — Sentinel approvals ride `awaitApproval`, never
`render`.

### 9.7 Remediation and the report — the bulk side-effect seam

Two routes, both mirroring §9.4's seam exactly: the ScenarioPlayer never
fetches (`lib/sentinel/scenario/player.ts` is network-free by construction);
the STAGE subscribes to the player's messages and calls these routes itself,
fire-and-forget. Brief §11 names this the first place the contract describes
a **bulk** side effect — one approval authorizing a change to dozens of
accounts and relationships at once, rather than the single-account actions
§4's table covers.

#### `POST /api/sentinel/remediate`

Request:

```ts
{ runId: string; agentId: string /* must start with "sentinel" */ }
```

Response:

```ts
{
  status: 'executed';
  confirmationId: string;
  removed: number;
  accountsTouched: number;
  notificationsQueued: number;
  reportId: string;
}
```

`removed`, `accountsTouched`, and `notificationsQueued` are read straight off
`lib/sentinel/exception-fixture.ts`'s `getAuExceptionFixture()`
(`totalExceptions`, `accountsAffected`, `accountsAffected` again — one
notification per affected account's primary cardholder) — never literals in
the route file. On success the route writes one `action.executed` entry to
the shared Event Log (`toolName: 'au-policy.remediate'`), through the same
`lib/events/store.ts` §5 already documents.

**Determinism.** `confirmationId` is `rem-${fixture.reportId}` — a pure
function of the fixture's own (already-deterministic) `reportId`, never of
`runId`, wall-clock time, or `Math.random()`. Two POSTs at the same demo
anchor return byte-identical response bodies regardless of which run they're
attributed to in the audit log — only the audit trail (the route's side
effect, not its response) varies with `runId`/`agentId`. This is the same
idiom `lib/agents/payment-health/tools.ts`'s
`chg-${accountId}-${proposedDueDayOfMonth}` confirmation id already
established for a single-account action, applied here to a bulk one.

`stage.tsx` wires this to the `approvalResolved` message for the scenario's
remediation gate (`REMEDIATION_APPROVAL_ID`,
`lib/sentinel/scenario/demo-scenario.ts`) when `approved: true` — a
fire-and-forget POST whose response is read by nothing. The
`RemediationReport` card the audience sees is fully precomputed from the same
fixture by the scenario step itself, not by this route's response, which is
what makes the call safe to lose: a failed or offline POST changes nothing
the audience sees, only the completeness of the real audit trail behind it.

#### `GET /api/sentinel/report?reportId=`

Returns the downloadable CSV behind `RemediationReport.downloadUrl`. Built
server-side from the SAME fixture (`buildAuExceptionCsv`,
`lib/sentinel/exception-fixture.ts`) that feeds `PolicyExceptionTable` and
`RemediationReport` — so the download can never show a figure the on-screen
table didn't.

- `Content-Type: text/csv; charset=utf-8`,
  `Content-Disposition: attachment; filename="<reportId>.csv"`.
- Header row: `Account, Authorized User, Rule, Finding, Added Date` — matches
  `PolicyExceptionTable`'s columns.
- One row per exception, in the fixture's own (accountId, partyId, ruleId)
  order — the full set, not a slice; the on-screen table shows the slice,
  this is the whole thing.
- RFC4180-style field escaping: a field containing a comma, double quote, or
  newline is quoted with internal quotes doubled; every other field is left
  bare. CRLF line endings throughout, the convention every spreadsheet
  importer expects from a downloaded `.csv`.
- There is exactly one fixture today, so `reportId` is a VALIDATION token,
  not a lookup key across many stored reports: any `reportId` other than the
  current fixture's own — including a missing query param — returns a clean
  `404` with `{ error }`, never a crash or a silently-wrong file.

#### The stage-calls-not-player rule

Neither route is ever called by `ScenarioPlayer` itself — it has no `fetch`
anywhere in it, by construction (brief §9/§10: the scenario path has no
network dependency). `components/sentinel/stage.tsx` is the only caller: it
subscribes to the player's message stream and issues both the `auditWrite`
POST (§9.4) and this remediation POST as side effects of messages it
observes, never awaiting either before continuing. A failed or offline write
must never affect playback — every such call is wrapped in
`.catch(() => {})`, and nothing downstream reads the response. This is what
"runs identically with the network cable pulled" (brief §9) means in
practice for this seam: the visible demo is unaffected; only the durability
of the real audit/execution record degrades.

#### What an integration team must implement for real

The ScenarioPlayer's version of "execution" is a mock: it never mutates
`lib/soe`'s seed data, because there is no seed-mutation path for the AU
portfolio at all (CLAUDE.md: "Sentinel seed additions are additive"). A real
runtime replacing it must, for this seam specifically:

1. Actually remove the flagged authorized-user relationships and actually
   queue the cardholder notifications — this route's mock response shape
   (`{ status, confirmationId, removed, accountsTouched, notificationsQueued,
   reportId }`) is the target shape to preserve, not the behavior behind it.
2. Keep the confirmation id (or its replacement) a pure function of the
   executed batch's own content, not of request plumbing — the
   byte-identical-replay property matters for auditability in production the
   same way it matters for demo repeatability here.
3. Generate the downloadable report from the same data structure the
   on-screen table renders from, in the same process, so the two can never
   drift — "one fixture feeds three surfaces"
   (`lib/sentinel/exception-fixture.ts`'s header comment) is the part of this
   design worth keeping, independent of the mock/real distinction.
4. Decide what "bulk" means for a real approval gate at scale — this build's
   `reviewList` (§4) caps the presenter-visible preview at 25 rows out of
   what could be thousands in production; the cap is a UI decision the real
   backend does not need to share, but the gate's `scope.summary` must still
   state the TRUE total, never the previewed one.

---

## 10. Customer-scoped identity binding (servicing agent, v3)

The servicing chatbot (`/servicing`, CARDINAL_V3_AU_BRIEF.md §7) is v3's
second addition to this contract and the second of the two seams brief §11
names as first-class handoff concerns: *"the servicing chatbot is the first
place [the contract] describes a customer-scoped identity binding."*
Everything in §§1–8 applies to a `servicing` run unchanged — same
`DefaultChatTransport` request shape, same tool-part state machine (§2), same
approval flow (§4), same Event Log shape (§5). The only new thing is how the
run's identity is fixed, and why that is documented as a seam rather than
left as an implementation detail.

### 10.1 What's pinned, and where

`servicing`'s account and party are fixed at **agent construction**, not
accepted from the request. `createServicingAgent({ runId })`
(`lib/agents/servicing/agent.ts`) takes only `runId` — never an account or
party id — and sets `PINNED_ACCOUNT_ID`/`PINNED_PARTY_ID`
(`lib/agents/servicing/identity.ts`; currently `acct-patel`/`party-anand`)
into the agent's `runtimeContext`, the same way `runId`/`agentId` already are
for every agent in this codebase. `servicing` has no trigger event (§1's
exception, alongside `ask`): its first and every later user message is the
cardholder's plain-English question or request — there is no field in the
wire format for a client to supply an account id even if it wanted to.

### 10.2 Why this is structural, not a validation rule

The brief's requirement is "resolvers ignore any model-supplied account id."
The implementation goes one step further than validating a supplied id away:
**there is no id to ignore.**

- `lib/agents/servicing/resolvers.ts`'s four resolver functions
  (`resolveNextPayment`, `resolveAccountSummary`, `resolveRecentTransactions`,
  `resolveCategorySpend`) take zero account/party arguments — no `accountId`
  parameter exists in their signatures for a bad actor's tool-call JSON to
  populate. Each closes over `PINNED_ACCOUNT_ID` directly.
- The evidence-spec source kinds this agent's `renderEvidence` tool accepts —
  `servicing-next-payment`, `servicing-account-summary`,
  `servicing-category-spend`, `servicing-recent-transactions`
  (`lib/registry/evidence.ts`) — are schema variants that structurally omit
  the `accountId`/`partyId` fields every other agent's source kinds carry
  (contrast `account-overview`'s `{ kind, accountId }` with
  `servicing-next-payment`'s bare `{ kind }`). A model cannot supply what the
  schema has no slot for.
- `updateContactInfo`'s input schema (`lib/agents/servicing/tools.ts`) is
  `{ phone?, mailingAddress?, rationale }` — again, no `partyId` field. The
  tool always calls `updatePartyContact(PINNED_PARTY_ID, patch)`.

`lib/agents/servicing/resolvers.test.ts` proves this by construction: it
calls `resolveEvidence` with a hand-built spec carrying a bogus `accountId`
field that bypasses `evidenceSpecSchema` entirely (the way a misbehaving
model's raw tool-call JSON theoretically could before validation runs), and
asserts the pinned cardholder's data comes back regardless — the extra field
is simply never read.

### 10.3 Evidence kinds (read-only)

| Question | `source.kind` | Component | Notes |
|---|---|---|---|
| "When is my next payment due?" | `servicing-next-payment` | MetricRow | Due date, amount due, minimum due, channel, from the pinned account's `SCHEDULED` payment. |
| "What's my balance / available credit?" | `servicing-account-summary` | MetricRow | Balance, available credit, utilization (`warning` tone at ≥75%), purchase APR. |
| "What am I spending on?" | `servicing-category-spend` | CategoryPie | PURCHASE-only spend by category, trailing N months. |
| "What are my latest transactions?" | `servicing-recent-transactions` | TransactionTable | Trailing N months, capped at `limit` rows, most recent first. |

None of these tools are approval-gated — `renderEvidence` is read-only, same
as every other agent's evidence router (§3).

### 10.4 The action tool — `updateContactInfo`

The servicing agent's one side-effecting tool (brief §7c: "the first write in
`lib/soe`"), approval-gated via the same AI SDK 7 `toolApproval` flow every
other action tool in this codebase uses (§4):

| Field | Notes |
|---|---|
| Input | `{ phone?, mailingAddress?, rationale }` — `phone`/`mailingAddress` are individually optional, `rationale` is model-authored one-sentence editorial copy for the ApprovalCard. The agent's instructions require the exact value the cardholder stated; the model never invents one. |
| On approval | `updatePartyContact(PINNED_PARTY_ID, patch)` (`lib/soe/adapter.ts`) applies the patch in place and returns the updated `Party`. |
| Output | `{ status: 'updated', confirmationId, phone, mailingAddress }`. |
| `confirmationId` | `ctc-${PINNED_PARTY_ID}-${changedFields.join('-')}` (e.g. `ctc-party-anand-phone-address`) — derived from *which* fields changed, never their values, so it's deterministic without ever putting the new phone number or address into an id (brief §9's byte-identical-replay convention, the same idiom as `payment-health/tools.ts`'s `chg-` prefix). |

`Party` (`lib/soe/types.ts`) gained additive `phone?: string` and
`mailingAddress?: string` — optional so v1's fixtures and pinned tests are
untouched; today only the pinned cardholder (and, for consistency, the rest
of v1's named cast — Marcus, Elena, the Patel household) carries seed values.
The adapter's one new mutation, `updatePartyContact(partyId, patch)`
(`lib/soe/adapter.ts`), is the eighth function on a seven-getter module and
the only write path anywhere in `lib/soe`. `POST /api/reset` (brief §8.5)
now also calls the adapter's `resetSoeState()`, dropping the cached SOE db so
a prior `updatePartyContact` mutation does not survive a demo reset.

`updateContactInfo` is registered in `lib/events/telemetry.ts`'s
`ACTION_TOOL_NAMES`, so its execution logs `kind: 'action.executed'` (§5),
not `tool.executed` — the same distinction every other action tool gets. The
human approval/denial decision logs separately as
`approval.granted`/`approval.denied`, `actor: 'human'`, exactly like every
other gate (§4).

### 10.5 What a real runtime must do differently

This is the seam brief §11 flags for the integration team. The prototype
pins identity at **agent construction** because there is no session layer to
pin it to — every `servicing` request in this build is unauthenticated by
design. A real runtime has a session, and the binding must move accordingly:
**identity must be bound at session/auth time — a token resolved to an
account at agent construction, server-side, before the first tool call —
never accepted from a request body field, a tool-call argument, or anything
else the client (or a compromised model) could set.** The prototype's
"no field exists for it" property (§10.2) is the right target to preserve:
the safest version of this binding is not a validation check that rejects a
client-supplied account id, it is an API surface that never has one to
reject in the first place.
