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
  `ask` (P3, W3.3).
- The **first** message of a run is a user message whose text is a JSON
  `StreamEvent` (the trigger, e.g. Marcus's `autopay.failed`) — see §6.
  **Exception: `ask`.** Ask has no trigger event; its first (and every
  subsequent) user message is a plain-English portfolio question, sent as
  plain text, not JSON. Ask is also read-only — no action tools, no
  `toolApproval` config — so §4 never applies to an `ask` run.
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

`ask` has no trigger event and is not in this table — its first user message
is a plain-English question instead of a `StreamEvent` (§1 exception).

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

## 8. Mechanical replay (W4.4)

`scripts/demo-replay.mjs` is a checked-in, dependency-free Node script that
drives every beat of the demo script (brief §3, beats 0–6) purely over
HTTP/SSE against this contract — no browser, no API key, no network beyond
the target host. It's the brief §10 P4 phase gate: "the complete demo script
replays clean, repeatedly."

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
<beat>: <detail>`; the process exits non-zero on any failure):

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
- **Repeatability** — resets, replays Payment Health alone, and asserts its
  two action tools' `confirmationId`s are byte-identical to the first pass
  (`lib/agents/payment-health/tools.ts` derives them deterministically from
  `accountId` — never random — which is exactly what "replays clean,
  repeatedly" requires).

---

## 9. Sentinel scenario stream (v2, additive)

The Sentinel stage (`/sentinel`, CARDINAL_V2_SENTINEL_BRIEF.md §4) is driven
by a `ScenarioPlayer` (`lib/sentinel/scenario/player.ts`) instead of an AI
SDK agent run — this build is 100% scripted, no LLM calls (brief §9). The
player publishes a message stream whose **payloads reuse the existing wire
contract wherever one already fits** — `RenderInstruction` (§3),
`ApprovalCardProps` (§4), `EventLogEntry` (§5), `StreamEvent` (§6) — and adds
only the envelope types this stage needs. Like the rest of this document,
nothing here is React-specific: `SentinelStreamMessage` is a plain JSON
shape any renderer (the current React stage, or a future port) can consume,
and this section is transport-agnostic — §9.3 gives one representative
transport, not the only legal one.

This is a **versioned, additive extension**: nothing in §§1–8 changes, and
every Sentinel message carries its own `seq` rather than reusing any part of
§2's `UIMessage`/`UIMessageChunk` model. Per brief §10, this contract is what
the post-review real Sentinel runtime must emit — the ScenarioPlayer is the
reference implementation, not the spec.

### 9.1 Scenario step format

A `SentinelScenario` (`lib/sentinel/scenario/types.ts`) is `{ id, steps }` —
an ordered, checked-in list of `ScenarioStep`s. Every variant except
`actMarker` and `awaitApproval` carries `delayMs`: how long the player waits
(divided by the current playback speed) before executing that step.

| Step | Fields | Notes |
|---|---|---|
| `actMarker` | `act: 1\|2\|3`, `title` | No `delayMs`. Playback PAUSES on reaching one — act transitions are presenter-triggered, never automatic (brief §4). |
| `emitEvent` | `delayMs`, `event: StreamEvent`, `highlight?`, `complianceBadge?` | Feeds the replay rail. `highlight` is Act III's catch; `complianceBadge` is a compliance-pass beat (e.g. Elena's R3 check). |
| `graphStep` | `delayMs`, `nodeId: SentinelNodeId`, `nodeState: 'idle'\|'working'\|'done'`, `animatedEdges?` | One node's state transition on the live agent graph. `animatedEdges`, when present, REPLACES the animated-edge set wholesale — declarative, not a diff, because the graph renderer holds no logic. |
| `narration` | `delayMs`, `id`, `text` | Played back chunked (§9.2), typing-effect style. |
| `render` | `delayMs`, `id`, `instruction: RenderInstruction` | Same `{ component, props }` shape §3 documents — registry components only. |
| `awaitApproval` | `id`, `payload: ApprovalCardProps`, `audit` | HARD-BLOCKS playback until resolved — no auto-approve, no timeout (v1 §4 carries over verbatim). No `delayMs`: the block itself is the wait. `audit` is `Omit<EventLogEntry, 'id'\|'timestamp'\|'kind'\|'actor'>` — the fields `kind`/`actor` get filled in from the resolution (§9.2). |
| `counterUpdate` | `delayMs`, `counter: { events, violations, flagged }`, `caption?` | The replay-rail counter (brief §3's "14 events · 1 violation · 0 flagged" beats). |
| `auditWrite` | `delayMs`, `entry: Omit<EventLogEntry, 'id'\|'timestamp'>` | Appends straight to the shared Event Log via §9.4 — `id`/`timestamp` are assigned on append, exactly like every other entry in §5. |

`SentinelNodeId` is the six fixed graph nodes: `orchestrator`,
`policy-analyst`, `rule-engineer`, `data-collector`, `critic`,
`approval-gate` (brief §4's fixed six-node layout — no node is ever added or
removed at runtime).

### 9.2 Published message union

`SentinelStreamMessage` mirrors `ScenarioStep` one-for-one, minus `delayMs`
(consumed by the time a message publishes) and minus the two variants that
split into a different shape:

- `narration` → one or more `narrationDelta` messages: `{ type:
  'narrationDelta', id, delta, done }`. Fixed 3-character chunks on a fixed
  16ms cadence (scaled by speed) — no randomness anywhere in this stream
  (brief §8). Concatenating every `delta` for one `id`, in `seq` order,
  reconstructs the step's original `text` exactly; `done: true` marks the
  final chunk.
- `awaitApproval` → an `approvalRequest` message when the gate opens (`{
  type: 'approvalRequest', id, payload }`), and — once resolved — an
  `approvalResolved` message (`{ type: 'approvalResolved', id, approved }`)
  immediately followed by an `auditWrite` message built from the step's
  `audit` field plus `kind: approved ? 'approval.granted' : 'approval.denied'`
  and `actor: 'human'` (§5's human-decision convention, unchanged).

Every other step publishes one message of the same `type`, carrying the
same fields minus `delayMs`:

```ts
type SentinelStreamMessage =
  | { type: 'actMarker'; act: 1 | 2 | 3; title: string; seq: number }
  | {
      type: 'emitEvent';
      event: StreamEvent;
      highlight?: boolean;
      complianceBadge?: string;
      seq: number;
    }
  | {
      type: 'graphStep';
      nodeId: SentinelNodeId;
      nodeState: 'idle' | 'working' | 'done';
      animatedEdges?: Array<{ from: SentinelNodeId; to: SentinelNodeId }>;
      seq: number;
    }
  | { type: 'narrationDelta'; id: string; delta: string; done: boolean; seq: number }
  | { type: 'render'; id: string; instruction: RenderInstruction; seq: number }
  | { type: 'approvalRequest'; id: string; payload: ApprovalCardProps; seq: number }
  | { type: 'approvalResolved'; id: string; approved: boolean; seq: number }
  | {
      type: 'counterUpdate';
      counter: { events: number; violations: number; flagged: number };
      caption?: string;
      seq: number;
    }
  | { type: 'auditWrite'; entry: Omit<EventLogEntry, 'id' | 'timestamp'>; seq: number };
```

Every message carries a monotonically increasing `seq` — the ordering
guarantee a consumer relies on instead of arrival order (which a future
non-in-process transport might not preserve byte-for-byte).

### 9.3 Transport (reference; not the contract)

The checked-in `ScenarioPlayer` is an in-process, synchronous publisher — no
network hop, matching brief §9 ("no LLM calls, no external APIs, no network
dependency"). A `subscribe(listener)` / `getSnapshot()` pair
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

1. Every figure the replay rail, graph, or context rail renders originated
   in a scenario step's literal data or an SOE-backed `RenderInstruction` —
   never computed client-side (mirrors §7.1/brief §5a; the ScenarioPlayer
   plays a script, it doesn't compute anything either).
2. Approval gates are real pauses: `awaitApproval` has no timer and no
   auto-approve path outside `jumpToAct`'s explicitly-documented rehearsal
   semantics (`lib/sentinel/scenario/player.ts`), which exist for presenter
   rehearsal only and are never reachable from the presenter bar's normal
   play/pause/reset controls.
3. Only registry components render from `render` steps, ever (§3 unchanged).
4. Every Sentinel audit write is reconstructable from `GET /api/events`
   (§1), same as every v1 entry.
