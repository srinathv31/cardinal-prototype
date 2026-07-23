// Verifies the two hand-implemented LanguageModelV4 pieces of W4.1:
//  - scripted-model.ts: doGenerate/doStream produce well-formed results for
//    a scripted step (correct part sequence; finishReason 'tool-calls' for a
//    tool step, 'stop' for the close) — interface facts verified against the
//    installed @ai-sdk/provider types (docs/ai-sdk7-notes.md).
//  - fallback-model.ts: falls back to the scripted step on a rejecting inner
//    model, on a timeout before the inner model's doStream/doGenerate ever
//    resolves, on a stall before the inner stream's first chunk, and — the
//    "cheap, best effort" case — on a stall mid-stream after some real
//    narration has already gone out, splicing in the fallback's tool calls
//    instead of hanging.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { LanguageModelV4, LanguageModelV4CallOptions, LanguageModelV4StreamPart, LanguageModelV4Usage } from '@ai-sdk/provider';
import { createScriptedModel, wordChunks } from './scripted-model';
import { createFallbackModel } from './fallback-model';
import type { AgentScript, ScriptStep } from './types';

const EMPTY_CALL_OPTIONS = { prompt: [] } as LanguageModelV4CallOptions;

const USAGE: LanguageModelV4Usage = {
  inputTokens: { total: undefined, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: undefined, text: undefined, reasoning: undefined },
};

function stubScript(step: ScriptStep): AgentScript {
  return { agentId: 'stub', nextStep: async () => step };
}

function stubModel(overrides: Partial<LanguageModelV4>): LanguageModelV4 {
  return {
    specificationVersion: 'v4',
    provider: 'stub',
    modelId: 'stub-model',
    supportedUrls: {},
    doGenerate: async () => {
      throw new Error('doGenerate not stubbed');
    },
    doStream: async () => {
      throw new Error('doStream not stubbed');
    },
    ...overrides,
  };
}

/** A stream that eagerly enqueues every part and closes — for a
 * fully-known, non-stalling fallback stream in tests. */
function partsStream(parts: LanguageModelV4StreamPart[]): ReadableStream<LanguageModelV4StreamPart> {
  return new ReadableStream({
    start(controller) {
      for (const part of parts) controller.enqueue(part);
      controller.close();
    },
  });
}

/** A stream that never enqueues or closes — simulates a fully stalled
 * connection (nothing arrives, ever). */
function hangingStream(): ReadableStream<LanguageModelV4StreamPart> {
  return new ReadableStream({ start() {} });
}

async function collectStream<T>(stream: ReadableStream<T>): Promise<T[]> {
  const reader = stream.getReader();
  const out: T[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) return out;
    out.push(value);
  }
}

describe('scripted-model', () => {
  let previousDelay: string | undefined;

  beforeEach(() => {
    previousDelay = process.env.DEMO_SCRIPTED_DELAY_MS;
    process.env.DEMO_SCRIPTED_DELAY_MS = '0';
  });

  afterEach(() => {
    if (previousDelay === undefined) delete process.env.DEMO_SCRIPTED_DELAY_MS;
    else process.env.DEMO_SCRIPTED_DELAY_MS = previousDelay;
  });

  it('wordChunks splits text into pieces that rejoin byte-identical to the source', () => {
    const text = 'Pulling the account balance and utilization snapshot for review.';
    expect(wordChunks(text).join('')).toBe(text);
    expect(wordChunks('').length).toBe(0);
  });

  it('doGenerate emits text + tool-call content and finishReason "tool-calls" for a tool step', async () => {
    const script = stubScript({
      narration: 'Checking things.',
      toolCalls: [{ toolName: 'renderEvidence', input: { component: 'MetricRow', source: { kind: 'account-overview', accountId: 'acct-x' } } }],
      done: false,
    });
    const result = await createScriptedModel(script).doGenerate(EMPTY_CALL_OPTIONS);

    expect(result.content).toHaveLength(2);
    expect(result.content[0]).toMatchObject({ type: 'text', text: 'Checking things.' });
    const toolCallPart = result.content[1];
    expect(toolCallPart).toMatchObject({ type: 'tool-call', toolName: 'renderEvidence' });
    if (toolCallPart?.type === 'tool-call') {
      expect(JSON.parse(toolCallPart.input)).toEqual({
        component: 'MetricRow',
        source: { kind: 'account-overview', accountId: 'acct-x' },
      });
      expect(typeof toolCallPart.toolCallId).toBe('string');
      expect(toolCallPart.toolCallId.length).toBeGreaterThan(0);
    }
    expect(result.finishReason.unified).toBe('tool-calls');
    expect(result.usage).toBeDefined();
    expect(result.warnings).toEqual([]);
  });

  it('doGenerate emits only text and finishReason "stop" for a closing step', async () => {
    const script = stubScript({ narration: 'All done.', toolCalls: [], done: true });
    const result = await createScriptedModel(script).doGenerate(EMPTY_CALL_OPTIONS);

    expect(result.content).toEqual([{ type: 'text', text: 'All done.' }]);
    expect(result.finishReason.unified).toBe('stop');
  });

  it('doStream emits the correct part sequence and finishReason "tool-calls" for a tool step', async () => {
    const script = stubScript({
      narration: 'Two words here.',
      toolCalls: [{ toolName: 'renderEvidence', input: { a: 1 } }],
      done: false,
    });
    const { stream } = await createScriptedModel(script).doStream(EMPTY_CALL_OPTIONS);
    const parts = await collectStream(stream);

    expect(parts[0]).toEqual({ type: 'stream-start', warnings: [] });

    const textStartIndex = parts.findIndex((p) => p.type === 'text-start');
    const textEndIndex = parts.findIndex((p) => p.type === 'text-end');
    const toolCallIndex = parts.findIndex((p) => p.type === 'tool-call');
    const finishIndex = parts.findIndex((p) => p.type === 'finish');
    expect(textStartIndex).toBeGreaterThan(0);
    expect(textEndIndex).toBeGreaterThan(textStartIndex);
    expect(toolCallIndex).toBeGreaterThan(textEndIndex);
    expect(finishIndex).toBe(parts.length - 1);

    const textId = (parts[textStartIndex] as { id: string }).id;
    for (let i = textStartIndex + 1; i < textEndIndex; i++) {
      expect(parts[i]).toMatchObject({ type: 'text-delta', id: textId });
    }
    const narration = parts
      .slice(textStartIndex + 1, textEndIndex)
      .map((p) => (p as { delta: string }).delta)
      .join('');
    expect(narration).toBe('Two words here.');

    const toolCallPart = parts[toolCallIndex];
    expect(toolCallPart).toMatchObject({ type: 'tool-call', toolName: 'renderEvidence' });
    if (toolCallPart?.type === 'tool-call') expect(JSON.parse(toolCallPart.input)).toEqual({ a: 1 });

    expect(parts[finishIndex]).toMatchObject({ type: 'finish', finishReason: { unified: 'tool-calls' } });
  });

  it('doStream emits no tool-call parts and finishReason "stop" for a closing step', async () => {
    const script = stubScript({ narration: 'Wrapped up.', toolCalls: [], done: true });
    const { stream } = await createScriptedModel(script).doStream(EMPTY_CALL_OPTIONS);
    const parts = await collectStream(stream);

    expect(parts.some((p) => p.type === 'tool-call')).toBe(false);
    expect(parts.at(-1)).toMatchObject({ type: 'finish', finishReason: { unified: 'stop' } });
  });
});

describe('fallback-model', () => {
  let previousTimeout: string | undefined;

  beforeEach(() => {
    previousTimeout = process.env.DEMO_LLM_TIMEOUT_MS;
  });

  afterEach(() => {
    if (previousTimeout === undefined) delete process.env.DEMO_LLM_TIMEOUT_MS;
    else process.env.DEMO_LLM_TIMEOUT_MS = previousTimeout;
  });

  it('doGenerate falls back when the inner model rejects', async () => {
    process.env.DEMO_LLM_TIMEOUT_MS = '50';
    const primary = stubModel({
      doGenerate: async () => {
        throw new Error('primary exploded');
      },
    });
    const fallback = stubModel({
      doGenerate: async () => ({
        content: [{ type: 'text', text: 'from fallback' }],
        finishReason: { unified: 'stop', raw: undefined },
        usage: USAGE,
        warnings: [],
      }),
    });

    const result = await createFallbackModel({ primary, fallback }).doGenerate(EMPTY_CALL_OPTIONS);
    expect(result.content).toEqual([{ type: 'text', text: 'from fallback' }]);
  });

  it('doGenerate falls back when the inner model never resolves before the timeout', async () => {
    process.env.DEMO_LLM_TIMEOUT_MS = '20';
    const primary = stubModel({ doGenerate: () => new Promise(() => {}) });
    const fallback = stubModel({
      doGenerate: async () => ({
        content: [{ type: 'text', text: 'from fallback' }],
        finishReason: { unified: 'stop', raw: undefined },
        usage: USAGE,
        warnings: [],
      }),
    });

    const result = await createFallbackModel({ primary, fallback }).doGenerate(EMPTY_CALL_OPTIONS);
    expect(result.content).toEqual([{ type: 'text', text: 'from fallback' }]);
  });

  it('doGenerate uses the inner model when it resolves in time', async () => {
    process.env.DEMO_LLM_TIMEOUT_MS = '200';
    let fallbackCalled = false;
    const primary = stubModel({
      doGenerate: async () => ({
        content: [{ type: 'text', text: 'from primary' }],
        finishReason: { unified: 'stop', raw: undefined },
        usage: USAGE,
        warnings: [],
      }),
    });
    const fallback = stubModel({
      doGenerate: async () => {
        fallbackCalled = true;
        throw new Error('should not be called');
      },
    });

    const result = await createFallbackModel({ primary, fallback }).doGenerate(EMPTY_CALL_OPTIONS);
    expect(result.content).toEqual([{ type: 'text', text: 'from primary' }]);
    expect(fallbackCalled).toBe(false);
  });

  it('doStream falls back wholesale when the inner model rejects on doStream()', async () => {
    process.env.DEMO_LLM_TIMEOUT_MS = '50';
    const primary = stubModel({
      doStream: async () => {
        throw new Error('primary stream failed to start');
      },
    });
    const fallback = stubModel({
      doStream: async () => ({
        stream: partsStream([
          { type: 'stream-start', warnings: [] },
          { type: 'text-start', id: 'f' },
          { type: 'text-delta', id: 'f', delta: 'fallback narration' },
          { type: 'text-end', id: 'f' },
          { type: 'finish', usage: USAGE, finishReason: { unified: 'stop', raw: undefined } },
        ]),
      }),
    });

    const { stream } = await createFallbackModel({ primary, fallback }).doStream(EMPTY_CALL_OPTIONS);
    const parts = await collectStream(stream);
    expect(parts.some((p) => p.type === 'text-delta' && p.delta === 'fallback narration')).toBe(true);
  });

  it('doStream falls back wholesale when the inner stream never yields a first chunk in time', async () => {
    process.env.DEMO_LLM_TIMEOUT_MS = '30';
    const primary = stubModel({ doStream: async () => ({ stream: hangingStream() }) });
    const fallback = stubModel({
      doStream: async () => ({
        stream: partsStream([
          { type: 'stream-start', warnings: [] },
          { type: 'text-start', id: 'f' },
          { type: 'text-delta', id: 'f', delta: 'fallback narration' },
          { type: 'text-end', id: 'f' },
          { type: 'finish', usage: USAGE, finishReason: { unified: 'stop', raw: undefined } },
        ]),
      }),
    });

    const { stream } = await createFallbackModel({ primary, fallback }).doStream(EMPTY_CALL_OPTIONS);
    const parts = await collectStream(stream);
    expect(parts.some((p) => p.type === 'text-delta' && p.delta === 'fallback narration')).toBe(true);
    expect(parts.at(-1)?.type).toBe('finish');
  });

  it('doStream uses the inner stream unmodified when it completes normally', async () => {
    process.env.DEMO_LLM_TIMEOUT_MS = '200';
    const primary = stubModel({
      doStream: async () => ({
        stream: partsStream([
          { type: 'stream-start', warnings: [] },
          { type: 'text-start', id: 'p' },
          { type: 'text-delta', id: 'p', delta: 'real narration' },
          { type: 'text-end', id: 'p' },
          { type: 'finish', usage: USAGE, finishReason: { unified: 'stop', raw: undefined } },
        ]),
      }),
    });
    const fallback = stubModel({
      doStream: async () => {
        throw new Error('should not be called');
      },
    });

    const { stream } = await createFallbackModel({ primary, fallback }).doStream(EMPTY_CALL_OPTIONS);
    const parts = await collectStream(stream);
    expect(parts.some((p) => p.type === 'text-delta' && p.delta === 'real narration')).toBe(true);
  });

  it('doStream splices in the fallback tool calls when the real stream stalls after partial narration', async () => {
    process.env.DEMO_LLM_TIMEOUT_MS = '30';
    const primary = stubModel({
      doStream: async () => ({
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({ type: 'stream-start', warnings: [] });
            controller.enqueue({ type: 'text-start', id: 't' });
            controller.enqueue({ type: 'text-delta', id: 't', delta: 'partial real narration' });
            // Then stalls forever — no text-end, no finish, no close.
          },
        }),
      }),
    });
    const fallback = stubModel({
      doStream: async () => ({
        stream: partsStream([
          { type: 'stream-start', warnings: [] },
          { type: 'text-start', id: 'f' },
          { type: 'text-delta', id: 'f', delta: 'fallback narration' },
          { type: 'text-end', id: 'f' },
          { type: 'tool-call', toolCallId: 'x', toolName: 'renderEvidence', input: '{}' },
          { type: 'finish', usage: USAGE, finishReason: { unified: 'tool-calls', raw: undefined } },
        ]),
      }),
    });

    const { stream } = await createFallbackModel({ primary, fallback }).doStream(EMPTY_CALL_OPTIONS);
    const parts = await collectStream(stream);

    // The real, partial narration reached the client...
    expect(parts.some((p) => p.type === 'text-delta' && p.delta === 'partial real narration')).toBe(true);
    // ...its open text block was closed exactly once...
    expect(parts.filter((p) => p.type === 'text-end')).toHaveLength(1);
    // ...the fallback's tool call was spliced in (never its narration, which
    // would read as a non-sequitur after the real partial sentence)...
    expect(parts.some((p) => p.type === 'tool-call' && p.toolName === 'renderEvidence')).toBe(true);
    expect(parts.some((p) => p.type === 'text-delta' && p.delta === 'fallback narration')).toBe(false);
    // ...and the run terminates cleanly rather than hanging.
    expect(parts.at(-1)?.type).toBe('finish');
  });

  it('doStream closes with a bare finish (no splice) when the real stream stalls after a tool call', async () => {
    process.env.DEMO_LLM_TIMEOUT_MS = '30';
    const primary = stubModel({
      doStream: async () => ({
        stream: new ReadableStream({
          start(controller) {
            controller.enqueue({ type: 'stream-start', warnings: [] });
            controller.enqueue({ type: 'tool-call', toolCallId: 'real-1', toolName: 'renderEvidence', input: '{}' });
            // Then stalls forever — no finish, no close.
          },
        }),
      }),
    });
    let fallbackCalled = false;
    const fallback = stubModel({
      doStream: async () => {
        fallbackCalled = true;
        throw new Error('should not be called');
      },
    });

    const { stream } = await createFallbackModel({ primary, fallback }).doStream(EMPTY_CALL_OPTIONS);
    const parts = await collectStream(stream);

    // The real tool call is kept — splicing the scripted step's tool calls
    // on top of it would render duplicate evidence, so the fallback model
    // must NOT be consulted for this call at all...
    expect(parts.filter((p) => p.type === 'tool-call')).toHaveLength(1);
    expect(fallbackCalled).toBe(false);
    // ...and the step closes with finishReason "tool-calls" so the loop
    // executes the forwarded call and re-consults the model (which then
    // falls back cleanly, deriving its step from the updated history).
    const finish = parts.at(-1);
    expect(finish?.type).toBe('finish');
    expect(finish?.type === 'finish' && finish.finishReason.unified).toBe('tool-calls');
  });
});
