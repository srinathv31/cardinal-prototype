// CLAUDE.md 5e — "everything writes to the Event Log" — proved end to end for
// the ops surface, on the real path: `POST /api/agents/ops/stream`, the real
// registry dispatch, the real AI SDK agent loop (driven by the scripted model,
// which is the demo default per DEMO_BUILD_PLAN.md D2), and the real telemetry
// integration `instrumentation.ts` registers at startup.
//
// Nothing is stubbed except the model, and the model is the one thing that
// must not reach the network. `registerTelemetry(eventLogTelemetry)` is called
// here for the same reason `instrumentation.ts` calls it in the app: it is
// process-global, and without it a unit test would silently assert on an empty
// log and pass.
//
// What this pins, for the whole DEMO_THESIS.md use-case-1 conversation:
//   • every tool execution appears, `actor: 'agent'`, under this run's id;
//   • the two GATED tools appear as `action.executed`, not `tool.executed`
//     (lib/events/telemetry.ts's ACTION_TOOL_NAMES) — the distinction a
//     reviewer scanning for writes depends on;
//   • both gate decisions appear as `approval.requested` (agent) followed by
//     `approval.granted` / `approval.denied` with `actor: 'human'`;
//   • a DECLINED gate logs the human's decision and executes nothing.

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { registerTelemetry, readUIMessageStream, type UIMessageChunk } from 'ai';
import { eventLogTelemetry } from '@/lib/events/telemetry';
import { query as queryEvents, reset as resetEvents } from '@/lib/events/store';
import { resetRules } from '@/lib/rules/store';
import type { CardinalUIMessage } from '@/lib/agents/registry';
import { POST as streamPost } from '@/app/api/agents/[agentId]/stream/route';

/** Env vars that would make `getAgentModel` reach for a real provider. Cleared
 *  for the duration of this file so the scripted model is the only model in
 *  play — the same guarantee the demo itself runs under. */
const PROVIDER_ENV_KEYS = [
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'AZURE_API_KEY',
  'AZURE_RESOURCE_NAME',
] as const;

const UPLOAD_TEXT =
  'Uploaded AU-Eligibility-Policy-2026.docx — please parse this authorized-user policy document.';
const SWEEP_TEXT = 'Give me the accounts that fail on these authorized-user policies.';

type LoosePart = { type: string; state?: string; approval?: { id: string; approved?: boolean } };
type LooseMessage = { id: string; role: string; parts: LoosePart[] };

function userMessage(id: string, text: string): LooseMessage {
  return { id, role: 'user', parts: [{ type: 'text', text } as unknown as LoosePart] };
}

async function postTurn(runId: string, messages: LooseMessage[]): Promise<Response> {
  return streamPost(
    new Request('http://localhost/api/agents/ops/stream', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: runId, messages }),
    }),
    { params: Promise.resolve({ agentId: 'ops' }) },
  );
}

/** Reduces an SSE response body into the assistant message it describes.
 * A RESUME stream's first chunks are `tool-output-available` events keyed by
 * tool call ids introduced in an EARLIER stream, so the prior accumulated
 * message must be handed in as `message` or the reduction silently yields an
 * empty parts array (docs/ai-sdk7-notes.md). */
async function readAssistantMessage(
  response: Response,
  prior?: CardinalUIMessage,
): Promise<CardinalUIMessage> {
  expect(response.status).toBe(200);
  const body = await response.text();

  const chunks: UIMessageChunk[] = [];
  for (const line of body.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('data:')) continue;
    const payload = trimmed.slice('data:'.length).trim();
    if (payload.length === 0 || payload === '[DONE]') continue;
    chunks.push(JSON.parse(payload) as UIMessageChunk);
  }

  const stream = new ReadableStream<UIMessageChunk>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });

  let last = prior;
  for await (const message of readUIMessageStream<CardinalUIMessage>({ message: prior, stream })) {
    last = message;
  }
  if (!last) throw new Error('stream produced no assistant message');
  return last;
}

/** What the client's `addToolApprovalResponse({ id, approved })` produces in
 * the outgoing history: the pending part flipped to `approval-responded`.
 *
 * The returned message is also what must be handed back to
 * `readAssistantMessage` as the resume's `prior`: the resume stream only sends
 * the tool's OUTPUT, so reducing it onto the pre-decision message would leave
 * an `output-available` part whose `approval` never recorded a decision — and
 * `validateUIMessages` rejects exactly that on the next POST. */
function respondToApproval(
  message: CardinalUIMessage,
  toolType: string,
  approved: boolean,
  id: string,
): { message: LooseMessage; approvalId: string } {
  const parts = message.parts as unknown as LoosePart[];
  const pending = parts.find((p) => p.type === toolType && p.state === 'approval-requested');
  if (!pending?.approval) {
    throw new Error(
      `no pending approval for ${toolType} (states: ${parts.map((p) => `${p.type}:${p.state}`).join(', ')})`,
    );
  }
  const responded: LooseMessage = {
    id,
    role: 'assistant',
    parts: parts.map((part) =>
      part === pending
        ? {
            ...part,
            state: 'approval-responded',
            approval: { id: pending.approval!.id, approved },
          }
        : part,
    ),
  };
  return { message: responded, approvalId: pending.approval.id };
}

/** The accumulated assistant message, re-identified for the next POST — the
 * reducer leaves `id` empty, and `validateUIMessages` wants a real one. */
function asHistory(message: CardinalUIMessage, id: string): LooseMessage {
  return { id, role: 'assistant', parts: message.parts as unknown as LoosePart[] };
}

function kindsFor(runId: string, toolName: string) {
  return queryEvents({ runId })
    .filter((e) => e.toolName === toolName)
    .map((e) => `${e.kind}:${e.actor}`);
}

describe('ops agent → Event Log (CLAUDE.md 5e)', () => {
  const savedEnv = new Map<string, string | undefined>();
  let previousAnchor: string | undefined;
  let previousDelay: string | undefined;

  beforeAll(() => {
    registerTelemetry(eventLogTelemetry);
  });

  beforeEach(() => {
    for (const key of PROVIDER_ENV_KEYS) {
      savedEnv.set(key, process.env[key]);
      delete process.env[key];
    }
    previousAnchor = process.env.DEMO_ANCHOR_DATE;
    previousDelay = process.env.DEMO_SCRIPTED_DELAY_MS;
    process.env.DEMO_ANCHOR_DATE = '2026-08-05';
    process.env.DEMO_SCRIPTED_DELAY_MS = '0';
    resetEvents();
    resetRules();
  });

  afterEach(() => {
    for (const [key, value] of savedEnv) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    savedEnv.clear();
    if (previousAnchor === undefined) delete process.env.DEMO_ANCHOR_DATE;
    else process.env.DEMO_ANCHOR_DATE = previousAnchor;
    if (previousDelay === undefined) delete process.env.DEMO_SCRIPTED_DELAY_MS;
    else process.env.DEMO_SCRIPTED_DELAY_MS = previousDelay;
    resetEvents();
    resetRules();
  });

  afterAll(() => {
    resetEvents();
    resetRules();
  });

  it('logs every tool execution and both gate decisions across the full use case', async () => {
    const runId = 'run-ops-events';

    // ——— Turn A, first pass: parse, then pause at Gate 1 ———————————————
    const user1 = userMessage('m-user-1', UPLOAD_TEXT);
    let assistant = await readAssistantMessage(await postTurn(runId, [user1]));

    expect(kindsFor(runId, 'parsePolicyDocument')).toEqual(['tool.executed:agent']);
    expect(kindsFor(runId, 'saveRules')).toEqual(['approval.requested:agent']);
    expect(queryEvents({ runId }).some((e) => e.kind === 'run.started')).toBe(true);

    // ——— Gate 1 approved: resume, saveRules executes ————————————————
    const g1 = respondToApproval(assistant, 'tool-saveRules', true, 'm-assistant-1');
    assistant = await readAssistantMessage(
      await postTurn(runId, [user1, g1.message]),
      g1.message as unknown as CardinalUIMessage,
    );

    expect(kindsFor(runId, 'saveRules')).toEqual([
      'approval.requested:agent',
      'approval.granted:human',
      // Gated write → action.executed, not tool.executed.
      'action.executed:agent',
    ]);

    // ——— Turn B, first pass: sweep, then pause at Gate 2 ————————————
    const turnAHistory = [user1, asHistory(assistant, 'm-assistant-1')];
    const user2 = userMessage('m-user-2', SWEEP_TEXT);
    let assistant2 = await readAssistantMessage(
      await postTurn(runId, [...turnAHistory, user2]),
    );

    expect(kindsFor(runId, 'queryViolations')).toEqual(['tool.executed:agent']);
    expect(kindsFor(runId, 'executeBatchRemoval')).toEqual(['approval.requested:agent']);

    // ——— Gate 2 approved: the batch runs, the report follows ——————————
    const g2 = respondToApproval(assistant2, 'tool-executeBatchRemoval', true, 'm-assistant-2');
    assistant2 = await readAssistantMessage(
      await postTurn(runId, [...turnAHistory, user2, g2.message]),
      g2.message as unknown as CardinalUIMessage,
    );

    expect(kindsFor(runId, 'executeBatchRemoval')).toEqual([
      'approval.requested:agent',
      'approval.granted:human',
      'action.executed:agent',
    ]);
    // generateReport is NOT gated and has no side effect — a plain tool.
    expect(kindsFor(runId, 'generateReport')).toEqual(['tool.executed:agent']);

    // The remediation endpoint's own audit entry rode along on this run too
    // (lib/agents/ops/resolvers.ts's runBatchRemoval calls that handler).
    expect(kindsFor(runId, 'au-policy.remediate')).toEqual(['action.executed:agent']);

    // Every entry belongs to this run and this agent, and every human-actor
    // entry is a gate decision — nothing else claims to be a person.
    const entries = queryEvents({ runId });
    expect(entries.length).toBeGreaterThan(0);
    expect(new Set(entries.map((e) => e.agentId))).toEqual(new Set(['ops']));
    const humanEntries = entries.filter((e) => e.actor === 'human');
    expect(humanEntries.map((e) => e.kind)).toEqual(['approval.granted', 'approval.granted']);
    expect(humanEntries.map((e) => e.toolName)).toEqual(['saveRules', 'executeBatchRemoval']);
  }, 30_000);

  it('logs a declined gate as a human decision and executes nothing', async () => {
    const runId = 'run-ops-events-denied';

    const user1 = userMessage('m-user-1', UPLOAD_TEXT);
    const assistant = await readAssistantMessage(await postTurn(runId, [user1]));
    const g1 = respondToApproval(assistant, 'tool-saveRules', false, 'm-assistant-1');
    await readAssistantMessage(
      await postTurn(runId, [user1, g1.message]),
      g1.message as unknown as CardinalUIMessage,
    );

    expect(kindsFor(runId, 'saveRules')).toEqual([
      'approval.requested:agent',
      'approval.denied:human',
    ]);
    // A denied tool never executes — no action.executed entry exists for it.
    expect(
      queryEvents({ runId }).some(
        (e) => e.kind === 'action.executed' && e.toolName === 'saveRules',
      ),
    ).toBe(false);
  }, 30_000);
});
