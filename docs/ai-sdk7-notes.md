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

- Multi-agent routes can't be typed over a union: `createAgentUIStreamResponse`
  needs `agent` and `uiMessages` generics to be the SAME agent's types, and a
  union of `ToolLoopAgent`s isn't assignable (tool sets differ). Dispatch one
  fully-narrow branch per agentId instead of a factory-map lookup —
  lib/agents/registry.ts's `createAgentRunStreamResponse` is the pattern.
  Client code CAN use the union (`useChat<CardinalUIMessage>` works fine).

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

## The model interface itself (W4.1) — verified against `@ai-sdk/provider@4.0.3`

Needed once DEMO_MODE=scripted required hand-implementing a model
(lib/ai/scripted/scripted-model.ts) instead of just calling one.

- `ai`'s `LanguageModel` type (`type LanguageModel = GlobalProviderModelId |
  LanguageModelV4 | LanguageModelV3 | LanguageModelV2`) is built from
  `@ai-sdk/provider`'s types but does **not** re-export them under their own
  names — import `LanguageModelV4`, `LanguageModelV4CallOptions`,
  `LanguageModelV4Prompt`, `LanguageModelV4StreamPart`, etc. directly from
  `'@ai-sdk/provider'` (present at top-level `node_modules` as a transitive
  dep of `ai`; not a new install). Every provider factory this repo uses
  (`createAnthropic()(id)` etc.) is declared to return `LanguageModelV4`
  concretely — `getLanguageModel()`'s broader `LanguageModel` return type
  only erases that precision at the type level, not at runtime.
- `LanguageModelV4 = { specificationVersion: 'v4', provider, modelId,
  supportedUrls, doGenerate(options), doStream(options) }`. `doGenerate`
  returns `{ content: LanguageModelV4Content[], finishReason: { unified,
  raw }, usage, warnings }`; `doStream` returns `{ stream:
  ReadableStream<LanguageModelV4StreamPart> }`. `finishReason.unified` is
  `'stop' | 'length' | 'content-filter' | 'tool-calls' | 'error' | 'other'`.
  `LanguageModelV4Usage`'s `inputTokens`/`outputTokens` sub-fields are typed
  `number | undefined` — every key must be present, but every value may be
  `undefined` (no real token accounting for a scripted call).
- Stream part names (`LanguageModelV4StreamPart`): `stream-start` (carries
  `warnings`), `text-start`/`text-delta`/`text-end` (all carry a shared
  `id`), `tool-input-start`/`tool-input-delta`/`tool-input-end` (progressive
  args, all optional), `tool-call` (`{ toolCallId, toolName, input: string
  — JSON-stringified }`), `tool-result`, `tool-approval-request`,
  `response-metadata`, `finish`, `error`. **A bare `tool-call` part needs no
  preceding `tool-input-start`/`delta`/`end`** — verified in the compiled
  SDK's `createLanguageModelV4StreamPartToLanguageModelStreamPartTransform`
  (`node_modules/ai/dist/index.js`): `tool-call` is parsed via
  `parseToolCall` independently of any `tool-input-*` bookkeeping, which
  exists purely for progressive-args UI and is otherwise optional.
- `simulateReadableStream({ chunks, initialDelayInMs, chunkDelayInMs })` is
  exported from `'ai'` itself (not the `ai/test` subpath) — safe to use in
  production code, not just tests. Delays `chunkDelayInMs` before each
  chunk after the first (`initialDelayInMs` before the first); `0` is
  honored literally (no falsy-default fallback in its implementation).
  `ai/test` (package.json subpath `"./test"`) looks dev-only by its own
  naming and wasn't used for scripted-model.ts, per the work item's
  guidance to hand-implement when a helper looks dev-only.
- `tool(config)` (re-exported from `@ai-sdk/provider-utils`) is the
  **identity function at runtime** (`function tool(tool2) { return tool2; }`
  — `node_modules/@ai-sdk/provider-utils/dist/index.js`). A tool object's
  `.inputSchema` is therefore the exact Zod schema passed into `tool()`,
  even though its declared type (`FlexibleSchema<T>`) doesn't statically
  expose `.parse` — tests that need to validate against the real schema
  must cast (`schema as z.ZodTypeAny`) to get it back.

## How a denied tool appears in the model prompt (W4.1)

For a **client-executed** tool (every tool in this repo — none are
`providerExecuted`), a declined approval does **not** reach the model as a
`tool-approval-response` part — `convertToLanguageModelMessage` filters
`tool-approval-response` out of a `tool`-role message's content unless
`part.providerExecuted` is true (`node_modules/ai/dist/index.js`). Instead,
the agent loop synthesizes a normal `tool-result` for the denied call, with
output `{ type: 'execution-denied', reason?: string }` — a real member of
`LanguageModelV4ToolResultOutput` (`@ai-sdk/provider`), sitting right next to
`'text'`/`'json'`/`'error-text'`/`'content'`. So a denied vs. approved
action tool is distinguishable purely by scanning `tool-result` parts in the
next prompt and checking `output.type === 'execution-denied'` — no need to
special-case approval-response parts at all
(lib/ai/scripted/types.ts's `toolDisposition`).

## Testing against the wire format directly (W4.1)

`readUIMessageStream({ message, stream: ReadableStream<UIMessageChunk> })`
must be given the **prior accumulated message** as `message` when reducing a
*resume* call's chunk stream — a resume stream's first chunks are
`tool-output-available` events keyed by `toolCallId`s that were only
introduced in the *original* stream's chunks (the tool-call itself is never
resent). Reducing a resume stream from a fresh/empty `message` silently
produces an empty parts array (the output-available chunks have no matching
tool part to attach to). A hand-rolled `ReadableStream<UIMessageChunk>` from
raw SSE bytes just needs to parse each `data: ` line as JSON and drop
`[DONE]`; `uiMessageChunkSchema` (also exported from `'ai'`) can validate
each parsed chunk if stricter checking is wanted.
