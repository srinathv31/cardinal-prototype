#!/usr/bin/env node
// Mechanical replay of the Cardinal demo script (CARDINAL_BRIEF.md §3, beats
// 0–6) — W4.4, the P4 phase gate ("the complete demo script replays clean,
// repeatedly"). Plain Node, no new dependencies, ESM, global fetch. Drives a
// running server purely over HTTP/SSE — no browser, no API key, no network
// beyond the target host. See docs/wire-contract.md's "Mechanical replay"
// section for how to run this and what it covers.
//
// Every wire shape asserted below (request body, UIMessageChunk framing,
// tool-part state machine, approval-response shape) was verified directly
// against the installed `ai@7.0.35` / `@ai-sdk/react@4.0.38` dist sources
// (node_modules/ai/dist/index.js) and confirmed end-to-end against a live
// server before being encoded here — see docs/ai-sdk7-notes.md for the
// standing "consult the installed source, not memory" rule this follows.

import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');

const DEFAULT_URL = 'http://localhost:3000';
const OWN_SERVER_PORT = 4312;
const OWN_SERVER_URL = `http://localhost:${OWN_SERVER_PORT}`;
const SERVER_BOOT_TIMEOUT_MS = 90_000;
const BEAT_TIMEOUT_MS = 30_000;
const FETCH_TIMEOUT_MS = 10_000;
const STREAM_TIMEOUT_MS = 25_000;

// Mutable — resolved once in main() by detectOrStartServer(), then read by
// every helper below via closure.
let BASE_URL = process.env.DEMO_REPLAY_URL
  ? process.env.DEMO_REPLAY_URL.replace(/\/$/, '')
  : DEFAULT_URL;

class ReplayError extends Error {}

function assertTrue(condition, message) {
  if (!condition) throw new ReplayError(message);
}

// ---------------------------------------------------------------------------
// Demo-fact constants — read from source, not guessed
// ---------------------------------------------------------------------------

// Evidence sequences: lib/agents/{agent}/script.ts's nextStep() branches, in
// order (each `renderEvidence` toolCall's `input.component`).
const PAYMENT_HEALTH_EVIDENCE = ['MetricRow', 'TrendChart', 'PaymentHistoryTable', 'RiskBadge'];
const BT_LIFECYCLE_EVIDENCE = ['MetricRow', 'BTTimeline', 'InterestProjectionChart'];
const AU_GROWTH_EVIDENCE = ['PartyGraph', 'TrendChart', 'MetricRow'];

// Action (approval-gated) tools by agent: docs/wire-contract.md §4, cross-
// checked against each agent's tools.ts.
const PAYMENT_HEALTH_ACTION_TOOLS = ['proposeDueDateChange', 'sendOutreachDraft'];
const BT_LIFECYCLE_ACTION_TOOLS = ['sendRetentionOutreach'];
const AU_GROWTH_ACTION_TOOLS = ['sendGraduationInvite'];

// Palette node labels — components/workflow-canvas/node-catalog.ts's
// NODE_CATALOG, brief §3 Beat 1's exact drag order. Hardcoded rather than
// imported: this script is plain Node with no TypeScript loader (frozen
// deps, no ts-node/tsx), so it can only assert against the *rendered* HTML,
// not import the catalog module directly. If node-catalog.ts's labels ever
// change, update this list to match.
const PALETTE_LABELS = ['Event Monitor', 'Analyze Account', 'Propose Action', 'Approval Gate', 'Event Log'];

// Beat 5's two rehearsed Ask questions (brief §3 Beat 5 / lib/agents/ask/script.ts).
const ASK_QUESTIONS = [
  {
    key: 'ask-category',
    question: 'Show me spend by category across the portfolio this quarter',
    expectedComponent: 'CategoryPie',
  },
  {
    key: 'ask-bt-expiring',
    question: 'Which accounts have balance transfers expiring in the next 90 days?',
    expectedComponent: 'BarBreakdown',
  },
];

// ---------------------------------------------------------------------------
// Trigger StreamEvents (docs/wire-contract.md §6) — eventId/accountId/kind
// are stable constants (verified against lib/soe/seed/{marcus,elena,patel}.ts
// and each agent script's FALLBACK_ACCOUNT_ID); summary/timestamp are
// reconstructed the same way lib/soe/seed/anchor.ts's `d()` helper does
// rather than fetched live, because no API route exposes raw StreamEvent
// JSON (only the audit Event Log, a different type, is exposed at
// GET /api/events) and this script cannot import lib/soe's TypeScript
// modules directly (plain Node, no loader; CLAUDE.md's adapter-only rule is
// about application code, not a standalone HTTP replay harness). This is
// safe: every script.ts derives its account exclusively via
// extractAccountId(prompt, FALLBACK_ACCOUNT_ID), which parses `accountId`
// out of this JSON and silently falls back to the same hardcoded persona
// constant on any mismatch — verified in lib/ai/scripted/types.ts — so the
// run behaves identically whether this trigger is byte-identical to the
// server's seed or not. summary/timestamp are never read by any script.ts.
function getAnchor() {
  const override = process.env.DEMO_ANCHOR_DATE;
  if (override) {
    const parsed = new Date(`${override}T00:00:00.000Z`);
    assertTrue(!Number.isNaN(parsed.getTime()), `DEMO_ANCHOR_DATE is not a valid ISO date: "${override}"`);
    return parsed;
  }
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function seedDate(anchor, offsetDays, hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(anchor.getTime() + offsetDays * 86_400_000 + (h * 60 + m) * 60_000).toISOString();
}

function buildTriggers() {
  const anchor = getAnchor();
  return {
    'payment-health': {
      eventId: 'evt-marcus-autopay-failed',
      accountId: 'acct-marcus',
      kind: 'autopay.failed',
      summary: 'Autopay declined for Marcus Webb — payment of $142.00 due today not covered',
      timestamp: seedDate(anchor, -12, '06:00'),
    },
    'bt-lifecycle': {
      eventId: 'evt-elena-promo-expiring',
      accountId: 'acct-elena',
      kind: 'bt.promo_expiring',
      summary: 'Balance transfer promo for Elena Ruiz ends in 45 days — $5,100.00 remaining at 0%',
      timestamp: seedDate(anchor, 0, '08:30'),
    },
    'au-growth': {
      eventId: 'evt-patel-statement',
      accountId: 'acct-patel',
      kind: 'statement.generated',
      summary: 'Statement generated for the Patel account — $3,712.84 across 3 cardholders',
      timestamp: seedDate(anchor, -2, '09:00'),
    },
  };
}

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------

async function fetchJson(pathname, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}${pathname}`, { ...options, signal: controller.signal });
    const text = await res.text();
    let json;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      throw new ReplayError(`${pathname}: response body was not valid JSON: ${text.slice(0, 200)}`);
    }
    return { status: res.status, ok: res.ok, json };
  } catch (err) {
    if (err instanceof ReplayError) throw err;
    if (err.name === 'AbortError') throw new ReplayError(`${pathname} timed out after ${FETCH_TIMEOUT_MS}ms`);
    throw new ReplayError(`${pathname}: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(pathname) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}${pathname}`, { signal: controller.signal });
    const text = await res.text();
    return { status: res.status, ok: res.ok, text };
  } catch (err) {
    if (err.name === 'AbortError') throw new ReplayError(`${pathname} timed out after ${FETCH_TIMEOUT_MS}ms`);
    throw new ReplayError(`${pathname}: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * POSTs to /api/agents/{agentId}/stream and reduces the raw SSE bytes into
 * an array of parsed UIMessageChunks. Framing verified against the
 * installed SDK's JsonToSseTransformStream (node_modules/ai/dist/index.js):
 * each event is `data: <json>\n\n`, and the stream always ends with a
 * literal `data: [DONE]\n\n` — never elided even when the run pauses for
 * approval (verified live: the paused stream still sends a `finish` chunk
 * and `[DONE]`, since the underlying generate call itself completes; only
 * the *run* is paused, not the HTTP response).
 */
async function postAgentStream(agentId, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STREAM_TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}/api/agents/${agentId}/stream`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    assertTrue(res.ok, `POST /api/agents/${agentId}/stream returned ${res.status}`);
    assertTrue(res.body, `POST /api/agents/${agentId}/stream returned no response body`);

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';
    const chunks = [];
    let sawDone = false;

    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice('data: '.length);
        if (payload === '[DONE]') {
          sawDone = true;
          continue;
        }
        chunks.push(JSON.parse(payload));
      }
      if (sawDone) break;
    }
    assertTrue(sawDone, `POST /api/agents/${agentId}/stream ended without a "data: [DONE]" terminator`);
    return chunks;
  } catch (err) {
    if (err instanceof ReplayError) throw err;
    if (err.name === 'AbortError') {
      throw new ReplayError(`POST /api/agents/${agentId}/stream timed out after ${STREAM_TIMEOUT_MS}ms`);
    }
    throw new ReplayError(`POST /api/agents/${agentId}/stream: ${err.message}`);
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// UIMessageChunk reducer — a minimal hand-rolled port of the installed SDK's
// processUIMessageStream (node_modules/ai/dist/index.js), scoped to exactly
// the chunk types this replay needs to assert against (text/tool parts).
// Reduces onto ONE persistent assistant-message object per run, exactly as
// AbstractChat does (docs/ai-sdk7-notes.md: a resume stream's chunks apply
// on top of the SAME message object the original stream produced — the
// tool-call itself is never resent, only new tool-output-available/text/
// finish chunks arrive, keyed by toolCallIds introduced earlier).
// ---------------------------------------------------------------------------

function createAssistantMessage(id) {
  return { id, role: 'assistant', parts: [] };
}

function createReducerState(message) {
  return {
    message,
    textParts: new Map(),
    toolParts: new Map(),
    finishReason: undefined,
    sawError: false,
    errorText: undefined,
  };
}

function findToolPart(state, toolCallId) {
  const cached = state.toolParts.get(toolCallId);
  if (cached) return cached;
  const found = state.message.parts.find((p) => p.toolCallId === toolCallId);
  if (found) state.toolParts.set(toolCallId, found);
  return found;
}

function applyChunk(state, chunk) {
  switch (chunk.type) {
    case 'start': {
      if (chunk.messageId) state.message.id = chunk.messageId;
      break;
    }
    case 'start-step':
      state.message.parts.push({ type: 'step-start' });
      break;
    case 'finish-step':
      break;
    case 'text-start': {
      const part = { type: 'text', text: '', state: 'streaming' };
      state.textParts.set(chunk.id, part);
      state.message.parts.push(part);
      break;
    }
    case 'text-delta': {
      const part = state.textParts.get(chunk.id);
      assertTrue(part, `text-delta for unknown text id "${chunk.id}"`);
      part.text += chunk.delta;
      break;
    }
    case 'text-end': {
      const part = state.textParts.get(chunk.id);
      assertTrue(part, `text-end for unknown text id "${chunk.id}"`);
      part.state = 'done';
      state.textParts.delete(chunk.id);
      break;
    }
    case 'tool-input-start': {
      const part = { type: `tool-${chunk.toolName}`, toolCallId: chunk.toolCallId, state: 'input-streaming' };
      state.toolParts.set(chunk.toolCallId, part);
      state.message.parts.push(part);
      break;
    }
    case 'tool-input-delta':
      // Progressive-args bookkeeping only (docs/ai-sdk7-notes.md) — never
      // observed from the scripted model (it emits bare tool-call parts)
      // and not needed for any assertion here.
      break;
    case 'tool-input-available': {
      let part = findToolPart(state, chunk.toolCallId);
      if (!part) {
        part = { type: `tool-${chunk.toolName}`, toolCallId: chunk.toolCallId, state: 'input-available' };
        state.toolParts.set(chunk.toolCallId, part);
        state.message.parts.push(part);
      }
      part.state = 'input-available';
      part.input = chunk.input;
      break;
    }
    case 'tool-approval-request': {
      const part = findToolPart(state, chunk.toolCallId);
      assertTrue(part, `tool-approval-request for unknown toolCallId "${chunk.toolCallId}"`);
      part.state = 'approval-requested';
      part.approval = { id: chunk.approvalId };
      break;
    }
    case 'tool-output-available': {
      const part = findToolPart(state, chunk.toolCallId);
      assertTrue(part, `tool-output-available for unknown toolCallId "${chunk.toolCallId}"`);
      part.state = 'output-available';
      part.output = chunk.output;
      break;
    }
    case 'tool-output-denied': {
      const part = findToolPart(state, chunk.toolCallId);
      assertTrue(part, `tool-output-denied for unknown toolCallId "${chunk.toolCallId}"`);
      part.state = 'output-denied';
      break;
    }
    case 'tool-output-error': {
      const part = findToolPart(state, chunk.toolCallId);
      assertTrue(part, `tool-output-error for unknown toolCallId "${chunk.toolCallId}"`);
      part.state = 'output-error';
      part.errorText = chunk.errorText;
      break;
    }
    case 'finish':
      state.finishReason = chunk.finishReason;
      break;
    case 'error':
      state.sawError = true;
      state.errorText = chunk.errorText;
      break;
    default:
      // Additive per docs/wire-contract.md §2 — unknown chunk types are
      // ignored, never fatal.
      break;
  }
}

function nonEmptyTextParts(parts) {
  return parts.filter((p) => p.type === 'text' && typeof p.text === 'string' && p.text.trim().length > 0);
}

// ---------------------------------------------------------------------------
// Beat 2–4: one full monitor-agent run over the wire (evidence -> approval
// -> resume -> execution -> closing narration).
// ---------------------------------------------------------------------------

async function runMonitorAgentBeat({ agentId, trigger, expectedEvidence, expectedActionTools }) {
  const runId = `run-replay-${agentId}-${Date.now()}`;
  const userMessage = {
    id: `msg-user-${runId}`,
    role: 'user',
    parts: [{ type: 'text', text: JSON.stringify(trigger, null, 2) }],
  };
  const state = createReducerState(createAssistantMessage(`msg-assistant-${runId}`));

  // Initial POST — docs/wire-contract.md §1's DefaultChatTransport shape,
  // verified against node_modules/ai/dist/index.js's HttpChatTransport:
  // { id, messages, trigger }. No `messageId` on this call — run-view.tsx's
  // handleRun() calls sendMessage({ text }) with no messageId, and
  // AbstractChat.sendMessage only threads one through when replacing an
  // existing message.
  const initialChunks = await postAgentStream(agentId, {
    id: runId,
    messages: [userMessage],
    trigger: 'submit-message',
  });
  for (const chunk of initialChunks) applyChunk(state, chunk);
  assertTrue(!state.sawError, `initial stream reported an error chunk: ${state.errorText}`);

  const narrationBeforeResume = nonEmptyTextParts(state.message.parts);
  assertTrue(narrationBeforeResume.length > 0, 'no non-empty narration text arrived during the initial stream');

  const evidenceParts = state.message.parts.filter((p) => p.type === 'tool-renderEvidence');
  const evidenceSequence = evidenceParts.map((p) => {
    assertTrue(
      p.state === 'output-available',
      `renderEvidence part ${p.toolCallId} never reached output-available (state="${p.state}")`,
    );
    return p.output.component;
  });
  assertTrue(
    JSON.stringify(evidenceSequence) === JSON.stringify(expectedEvidence),
    `renderEvidence sequence was [${evidenceSequence.join(', ')}], expected [${expectedEvidence.join(', ')}]`,
  );

  const actionParts = expectedActionTools.map((toolName) => {
    const part = state.message.parts.find((p) => p.type === `tool-${toolName}`);
    assertTrue(part, `expected an approval-gated part for tool "${toolName}", found none`);
    assertTrue(
      part.state === 'approval-requested',
      `action tool "${toolName}" was in state "${part.state}", expected "approval-requested" (run paused for approval)`,
    );
    assertTrue(
      typeof part.approval?.id === 'string' && part.approval.id.length > 0,
      `action tool "${toolName}"'s approval-requested part has no approval.id`,
    );
    return part;
  });

  // Build the resume POST the way the client does: AbstractChat's
  // addToolApprovalResponse (node_modules/ai/dist/index.js) finds the part
  // whose `approval.id` matches and rewrites it in place to
  // `{ state: 'approval-responded', approval: { ...approval, id, approved, reason } }`
  // — the `input` is untouched. Once every pending approval on the last
  // assistant message has a response,
  // lastAssistantMessageIsCompleteWithApprovalResponses fires and the full
  // history (unchanged user message + the now-updated assistant message) is
  // re-POSTed with trigger: 'submit-message' and messageId set to the last
  // message's id. Approving both of payment-health's pending tools here
  // before sending mirrors clicking Approve on each card in turn — the
  // wire-level effect (one resume POST with every approval already
  // resolved) is identical either way, since the auto-send only fires once
  // ALL pending approvals have a response.
  for (const part of actionParts) {
    part.state = 'approval-responded';
    part.approval = { ...part.approval, approved: true };
  }

  const partsCountBeforeResume = state.message.parts.length;
  const resumeChunks = await postAgentStream(agentId, {
    id: runId,
    messages: [userMessage, state.message],
    trigger: 'submit-message',
    messageId: state.message.id,
  });
  for (const chunk of resumeChunks) applyChunk(state, chunk);
  assertTrue(!state.sawError, `resume stream reported an error chunk: ${state.errorText}`);

  for (const toolName of expectedActionTools) {
    const part = state.message.parts.find((p) => p.type === `tool-${toolName}`);
    assertTrue(
      part.state === 'output-available',
      `action tool "${toolName}" did not reach output-available after approval (state="${part.state}")`,
    );
    assertTrue(
      part.output && typeof part.output === 'object',
      `action tool "${toolName}" reached output-available with no output payload`,
    );
  }

  const closingNarration = nonEmptyTextParts(state.message.parts.slice(partsCountBeforeResume));
  assertTrue(closingNarration.length > 0, 'no non-empty closing narration text arrived after approval');
  assertTrue(state.finishReason !== undefined, 'resume stream never sent a "finish" chunk');

  return { runId, evidenceSequence, actionParts };
}

// ---------------------------------------------------------------------------
// Beat 5: Ask — single-turn, read-only, no approval gate.
// ---------------------------------------------------------------------------

async function runAskBeat({ question, expectedComponent }) {
  const runId = `run-replay-ask-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const userMessage = { id: `msg-user-${runId}`, role: 'user', parts: [{ type: 'text', text: question }] };
  const state = createReducerState(createAssistantMessage(`msg-assistant-${runId}`));

  const chunks = await postAgentStream('ask', { id: runId, messages: [userMessage], trigger: 'submit-message' });
  for (const chunk of chunks) applyChunk(state, chunk);
  assertTrue(!state.sawError, `ask stream reported an error chunk: ${state.errorText}`);

  const narration = nonEmptyTextParts(state.message.parts);
  assertTrue(narration.length > 0, `no non-empty narration text arrived for "${question}"`);

  const evidence = state.message.parts.find((p) => p.type === 'tool-renderEvidence');
  assertTrue(evidence, `no renderEvidence tool part arrived for "${question}"`);
  assertTrue(
    evidence.state === 'output-available',
    `renderEvidence never reached output-available for "${question}" (state="${evidence.state}")`,
  );
  assertTrue(
    evidence.output.component === expectedComponent,
    `ask rendered "${evidence.output.component}" for "${question}", expected "${expectedComponent}"`,
  );
  assertTrue(state.finishReason !== undefined, `ask stream for "${question}" never sent a "finish" chunk`);

  return { runId };
}

// ---------------------------------------------------------------------------
// Beat 0 / 1 / 6
// ---------------------------------------------------------------------------

async function beatReset() {
  const resetRes = await fetchJson('/api/reset', { method: 'POST' });
  assertTrue(resetRes.ok, `POST /api/reset returned ${resetRes.status}`);
  assertTrue(resetRes.json?.ok === true, `POST /api/reset did not return {ok:true} (got ${JSON.stringify(resetRes.json)})`);

  const eventsRes = await fetchJson('/api/events');
  assertTrue(eventsRes.ok, `GET /api/events returned ${eventsRes.status}`);
  assertTrue(Array.isArray(eventsRes.json?.entries), 'GET /api/events did not return an "entries" array');
  assertTrue(
    eventsRes.json.entries.length === 0,
    `GET /api/events returned ${eventsRes.json.entries.length} entries immediately after reset, expected 0`,
  );
}

async function beatDashboard() {
  const res = await fetchText('/');
  assertTrue(res.ok, `GET / returned ${res.status}`);
  for (const name of ['Payment Health', 'BT Lifecycle', 'AU Growth']) {
    assertTrue(res.text.includes(name), `GET / HTML did not contain agent name "${name}"`);
  }
}

async function beatWorkflows() {
  const res = await fetchText('/workflows');
  assertTrue(res.ok, `GET /workflows returned ${res.status}`);
  for (const label of PALETTE_LABELS) {
    assertTrue(res.text.includes(label), `GET /workflows HTML did not contain palette label "${label}"`);
  }
}

async function beatEventLog(runIds) {
  const res = await fetchJson('/api/events');
  assertTrue(res.ok, `GET /api/events returned ${res.status}`);
  const entries = res.json.entries;
  assertTrue(Array.isArray(entries) && entries.length > 0, 'GET /api/events returned no entries after the demo runs');

  for (const [label, runId] of Object.entries(runIds)) {
    const runEntries = entries.filter((e) => e.runId === runId);
    assertTrue(runEntries.length > 0, `no event-log entries found for ${label} (runId "${runId}")`);
    assertTrue(
      runEntries.some((e) => e.actor === 'agent'),
      `no actor:'agent' entries found for ${label} (runId "${runId}")`,
    );
  }

  const approvalTargets = [
    ['payment-health', 'proposeDueDateChange'],
    ['payment-health', 'sendOutreachDraft'],
    ['bt-lifecycle', 'sendRetentionOutreach'],
    ['au-growth', 'sendGraduationInvite'],
  ];
  for (const [label, toolName] of approvalTargets) {
    const runId = runIds[label];
    const granted = entries.find(
      (e) => e.runId === runId && e.kind === 'approval.granted' && e.actor === 'human' && e.toolName === toolName,
    );
    assertTrue(granted, `no actor:'human' kind:'approval.granted' entry found for ${label}'s "${toolName}"`);
  }
}

// ---------------------------------------------------------------------------
// Server detection / self-start
// ---------------------------------------------------------------------------

async function isServerUp(url) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    return res.status < 500;
  } catch {
    return false;
  }
}

async function waitForServerUp(url, timeoutMs) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await isServerUp(url)) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new ReplayError(`Server at ${url} did not become ready within ${timeoutMs}ms`);
}

/**
 * Resolves which server to run against (CLAUDE.md's "server handling"
 * contract): an explicit DEMO_REPLAY_URL is trusted as-is; otherwise probes
 * the default localhost:3000 and only self-starts a scratch server on 4312
 * if nothing answers there. Strips provider env vars from the self-started
 * server's environment so DEMO_MODE=scripted (its unset default) runs the
 * pure scripted model with no API key and no network, per
 * lib/ai/provider.ts's getAgentModel.
 */
async function detectOrStartServer() {
  if (process.env.DEMO_REPLAY_URL) {
    return { url: BASE_URL, ownProcess: null, label: 'DEMO_REPLAY_URL (explicit)' };
  }
  if (await isServerUp(DEFAULT_URL)) {
    return { url: DEFAULT_URL, ownProcess: null, label: `${DEFAULT_URL} (pre-existing server)` };
  }

  console.log(`No server responding at ${DEFAULT_URL} — starting one on port ${OWN_SERVER_PORT}...`);
  const env = { ...process.env, DEMO_SCRIPTED_DELAY_MS: '0' };
  for (const key of ['ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'AZURE_API_KEY', 'AZURE_RESOURCE_NAME']) {
    delete env[key];
  }
  const child = spawn('npx', ['next', 'dev', '-p', String(OWN_SERVER_PORT)], {
    cwd: PROJECT_ROOT,
    env,
    stdio: 'ignore',
  });
  child.on('error', (err) => {
    console.error(`Failed to start self-hosted dev server: ${err.message}`);
  });
  await waitForServerUp(OWN_SERVER_URL, SERVER_BOOT_TIMEOUT_MS);
  return { url: OWN_SERVER_URL, ownProcess: child, label: `${OWN_SERVER_URL} (self-started, DEMO_SCRIPTED_DELAY_MS=0)` };
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

async function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new ReplayError(`${label} timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

function buildBeats(triggers, runIds) {
  return [
    ['Beat 0 — reset to opening state', () => beatReset()],
    ['Beat 0 — Command Center shows all three agents', () => beatDashboard()],
    ['Beat 1 — Workflow Canvas palette', () => beatWorkflows()],
    [
      'Beat 2 — Payment Health run (Marcus Webb)',
      async () => {
        const result = await runMonitorAgentBeat({
          agentId: 'payment-health',
          trigger: triggers['payment-health'],
          expectedEvidence: PAYMENT_HEALTH_EVIDENCE,
          expectedActionTools: PAYMENT_HEALTH_ACTION_TOOLS,
        });
        runIds['payment-health'] = result.runId;
      },
    ],
    [
      'Beat 3 — BT Lifecycle run (Elena Ruiz)',
      async () => {
        const result = await runMonitorAgentBeat({
          agentId: 'bt-lifecycle',
          trigger: triggers['bt-lifecycle'],
          expectedEvidence: BT_LIFECYCLE_EVIDENCE,
          expectedActionTools: BT_LIFECYCLE_ACTION_TOOLS,
        });
        runIds['bt-lifecycle'] = result.runId;
      },
    ],
    [
      'Beat 4 — AU Growth run (Patel household)',
      async () => {
        const result = await runMonitorAgentBeat({
          agentId: 'au-growth',
          trigger: triggers['au-growth'],
          expectedEvidence: AU_GROWTH_EVIDENCE,
          expectedActionTools: AU_GROWTH_ACTION_TOOLS,
        });
        runIds['au-growth'] = result.runId;
      },
    ],
    ...ASK_QUESTIONS.map(({ key, question, expectedComponent }) => [
      `Beat 5 — Ask: "${question}"`,
      async () => {
        const result = await runAskBeat({ question, expectedComponent });
        runIds[key] = result.runId;
      },
    ]),
    ['Beat 6 — Event Log covers every run', () => beatEventLog(runIds)],
    [
      'Repeatability — reset + replay Payment Health',
      async () => {
        const resetRes = await fetchJson('/api/reset', { method: 'POST' });
        assertTrue(
          resetRes.ok && resetRes.json?.ok === true,
          'POST /api/reset (repeatability pass) did not return {ok:true}',
        );

        const result = await runMonitorAgentBeat({
          agentId: 'payment-health',
          trigger: triggers['payment-health'],
          expectedEvidence: PAYMENT_HEALTH_EVIDENCE,
          expectedActionTools: PAYMENT_HEALTH_ACTION_TOOLS,
        });

        const dueDatePart = result.actionParts.find((p) => p.type === 'tool-proposeDueDateChange');
        const outreachPart = result.actionParts.find((p) => p.type === 'tool-sendOutreachDraft');
        assertTrue(
          dueDatePart.output?.confirmationId === 'chg-acct-marcus-22',
          `repeat run's due-date confirmationId was "${dueDatePart.output?.confirmationId}", expected "chg-acct-marcus-22" — the seed math must be identical run over run`,
        );
        assertTrue(
          outreachPart.output?.confirmationId === 'out-acct-marcus-1',
          `repeat run's outreach confirmationId was "${outreachPart.output?.confirmationId}", expected "out-acct-marcus-1" — the seed math must be identical run over run`,
        );
      },
    ],
  ];
}

async function main() {
  const { url, ownProcess, label } = await detectOrStartServer();
  BASE_URL = url;
  console.log(`Cardinal demo replay — target ${label}`);
  console.log(`Anchor date: ${getAnchor().toISOString().slice(0, 10)}${process.env.DEMO_ANCHOR_DATE ? ' (DEMO_ANCHOR_DATE)' : ' (today, UTC)'}\n`);

  try {
    const triggers = buildTriggers();
    const runIds = {};
    const beats = buildBeats(triggers, runIds);

    let failures = 0;
    for (const [name, fn] of beats) {
      try {
        await withTimeout(fn(), BEAT_TIMEOUT_MS, name);
        console.log(`PASS ${name}`);
      } catch (err) {
        failures += 1;
        const detail = err instanceof Error ? err.message : String(err);
        console.log(`FAIL ${name}: ${detail}`);
      }
    }

    const total = beats.length;
    const passed = total - failures;
    console.log(`\n${passed}/${total} beats passed.`);
    if (failures > 0) {
      console.log('RESULT: FAIL — the demo script did not replay clean.');
      process.exitCode = 1;
    } else {
      console.log('RESULT: PASS — the demo script replays clean.');
    }
  } finally {
    if (ownProcess) {
      console.log(`\nStopping self-started dev server (pid ${ownProcess.pid})...`);
      ownProcess.kill('SIGTERM');
    }
  }
}

main().catch((err) => {
  console.error('FATAL:', err instanceof Error ? (err.stack ?? err.message) : err);
  process.exitCode = 1;
});
