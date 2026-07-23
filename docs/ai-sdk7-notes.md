# AI SDK 7 build notes (ai@7.0.35 / @ai-sdk/react@4.0.38 — frozen)

Working notes from the P1 build, verified against the **installed** packages
(`node_modules/ai/dist/index.d.ts` and, where the types were stale, the
compiled `dist/index.js`). AI SDK 7 postdates model training data — trust
these notes and the installed source over memory, and re-verify anything not
listed here before using it. Do not use v5/v6 patterns (`maxSteps`,
`toolInvocations`, hand-rolled approval pauses).

## Core surface used by Cardinal

- `new ToolLoopAgent({ id, model, instructions, tools, stopWhen: stepCountIs(n), toolApproval, runtimeContext, telemetry })`
  — `instructions`, not `system`. `tool({ description, inputSchema, execute })`
  — `inputSchema` (Zod v4), not `parameters`.
- Route bridge: `createAgentUIStreamResponse({ agent, uiMessages })` →
  `Promise<Response>` (SSE of `UIMessageChunk`). Handles the full loop,
  including executing tools whose approval arrived in the incoming history.
- Validate incoming messages with `validateUIMessages({ messages })`.
- Next 16 route handlers: `params` is a `Promise` — `await ctx.params`.

## Tool approvals (§5d)

- Config: `toolApproval: { toolName: 'user-approval' }` on the agent
  (takes precedence over tool-level settings). Read-only tools: omit.
- Tool UI part states: `input-streaming → input-available →
  (approval-requested → approval-responded) → output-available |
  output-error | output-denied`. Approval-requested parts carry
  `approval: { id }`.
- Client: `useChat` returns `addToolApprovalResponse({ id, approved, reason? })`
  — `id` is `approval.id`, **not** `toolCallId`. Pair with
  `sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses`
  (import from `'ai'`) so the resume POST fires once all pending approvals
  have responses. The resume POST is shape-identical (full history re-sent).
- `InferAgentUIMessage<typeof agent>` types the useChat generic; tool parts
  are `tool-${toolName}` (e.g. `part.type === 'tool-renderEvidence'`).

## Telemetry → Event Log (§5e) — hard-won details

- `registerTelemetry(integration)` (from `'ai'`, called once in
  `instrumentation.ts` `register()`) applies globally, but only when a call
  doesn't set its own `telemetry.integrations`.
- `telemetry.includeRuntimeContext` is a **per-property allow-list**
  (`{ runId: true, agentId: true }`), not a boolean.
- `onStart` / `onStepStart` / `onStepEnd` / `onEnd` carry `runtimeContext`
  (allow-listed keys only). `onToolExecutionStart/End` carry **no**
  runtimeContext — correlate via `event.callId`, shared across all events of
  one generate/stream call (lib/events/telemetry.ts keeps a
  `Map<callId, ctx>` seeded in `onStart`).
- `onStart`/`onEnd` events are unions across generateText/object/embed/rerank —
  narrow with `'runtimeContext' in event` before touching text-specific fields.
- `onError` is typed `Callback<unknown>` but is invoked with
  `{ callId, error }` at every call site in the compiled SDK (types are
  stale) — narrow defensively.
- Approval-gated tools do NOT fire tool-execution events at request time;
  execution (and its events) happens on the resume call after approval.
  Detect `approval.requested` from `tool-approval-request` parts in
  `onStepEnd`'s step content.

## Misc gotchas

- Vendored AI Elements (components/ai-elements) predates naming in current
  docs: narration markdown is `MessageResponse` in `message.tsx` (no
  `response.tsx`), and there is no `loader.tsx` — use
  `components/ui/spinner.tsx`.
- Recharts v3 `TooltipContentProps` marks injected props required; local
  tooltip prop types must mark `active`/`payload`/`label` optional
  (components/registry/trend-chart.tsx shows the pattern).
- Pages that read seed data must opt out of static prerender
  (`export const dynamic = 'force-dynamic'`) — the seed anchor is
  request-time "start of today, UTC" and a build-time freeze drifts the
  story facts (see app/runs/page.tsx).
- Provider factories (all v4): `createAnthropic` / `createOpenAI` /
  `createAzure`; env vars per lib/ai/provider.ts + .env.example.
