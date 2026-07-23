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
