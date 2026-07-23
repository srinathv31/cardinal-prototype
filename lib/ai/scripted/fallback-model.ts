// Wraps a real LanguageModelV4 with a scripted fallback (brief §8.1's
// "scripted mode with a configured provider" path): try the real model
// first, but never let a slow or broken endpoint take the demo down. Both
// doGenerate and a stalled/erroring doStream fall back to `fallback` for
// that same call — the AgentScript (./types.ts) derives its step from the
// prompt alone, so it picks up correctly whichever step the real model left
// off at.
//
// `fallback` is typed as a plain LanguageModelV4 rather than tied to an
// AgentScript directly — in practice lib/ai/provider.ts always passes the
// scripted model (./scripted-model.ts) here, but keeping this wrapper
// generic means the mid-stream recovery path below (which re-invokes
// `fallback.doStream` and keeps only its tool-call/finish parts) works for
// any well-behaved LanguageModelV4, not just ours.

import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4FinishReason,
  LanguageModelV4GenerateResult,
  LanguageModelV4StreamPart,
  LanguageModelV4StreamResult,
  LanguageModelV4Usage,
} from '@ai-sdk/provider';

const DEFAULT_TIMEOUT_MS = 8000;

const FALLBACK_USAGE: LanguageModelV4Usage = {
  inputTokens: { total: undefined, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: undefined, text: undefined, reasoning: undefined },
};

/** Reads DEMO_LLM_TIMEOUT_MS fresh per call (see scripted-model.ts's
 * scriptedDelayMs for why: tests set it per-process). */
function timeoutBudgetMs(): number {
  const raw = process.env.DEMO_LLM_TIMEOUT_MS;
  if (raw === undefined) return DEFAULT_TIMEOUT_MS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TIMEOUT_MS;
}

class CardinalFallbackTimeoutError extends Error {}

function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new CardinalFallbackTimeoutError(`Cardinal fallback: real model call exceeded ${ms}ms.`));
    }, ms);
    Promise.resolve(promise).then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error instanceof Error ? error : new Error(String(error)));
      },
    );
  });
}

type ReadOutcome =
  | { ok: true; done: true }
  | { ok: true; done: false; value: LanguageModelV4StreamPart }
  | { ok: false };

/** Races a single reader.read() against `ms`. On timeout this resolves
 * `{ ok: false }` without waiting for the underlying read to settle — the
 * caller cancels the reader right after, which is what actually releases
 * it. */
function raceRead(reader: ReadableStreamDefaultReader<LanguageModelV4StreamPart>, ms: number): Promise<ReadOutcome> {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      resolve({ ok: false });
    }, ms);
    reader.read().then(
      (result) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(result.done ? { ok: true, done: true } : { ok: true, done: false, value: result.value });
      },
      () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ ok: false });
      },
    );
  });
}

async function pumpAll(
  stream: ReadableStream<LanguageModelV4StreamPart>,
  controller: ReadableStreamDefaultController<LanguageModelV4StreamPart>,
): Promise<void> {
  const reader = stream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) return;
    controller.enqueue(value);
  }
}

/** Reads a fallback stream to completion and keeps only its `tool-call` and
 * `finish` parts — used when the real stream has already forwarded some
 * narration and can no longer be swapped wholesale (§ this file's header,
 * "mid-stream recovery"). Synthesizes a `finish` if the fallback stream
 * somehow didn't end with one, so the step always terminates cleanly. */
async function toolCallsAndFinishFrom(
  stream: ReadableStream<LanguageModelV4StreamPart>,
): Promise<LanguageModelV4StreamPart[]> {
  const reader = stream.getReader();
  const kept: LanguageModelV4StreamPart[] = [];
  let sawFinish = false;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value.type === 'tool-call') kept.push(value);
    if (value.type === 'finish') {
      kept.push(value);
      sawFinish = true;
    }
  }
  if (!sawFinish) {
    const finishReason: LanguageModelV4FinishReason = {
      unified: kept.length > 0 ? 'tool-calls' : 'stop',
      raw: undefined,
    };
    kept.push({ type: 'finish', usage: FALLBACK_USAGE, finishReason });
  }
  return kept;
}

/**
 * Wraps a real stream so that:
 *  - a stall (or error) before any chunk has reached the consumer swaps to
 *    the fallback stream wholesale — nothing was sent yet, so the swap is
 *    invisible (this is the "time-to-first-chunk" guard the work item
 *    requires at minimum);
 *  - a stall after real narration has already gone out closes the open text
 *    block cleanly and splices in the fallback step's tool calls, so the run
 *    always keeps moving instead of hanging on stage (the "cheap, best
 *    effort" mid-flight guard).
 */
function wrapStreamWithFallback(options: {
  source: ReadableStream<LanguageModelV4StreamPart>;
  getFallbackStream: () => Promise<ReadableStream<LanguageModelV4StreamPart>>;
  firstChunkTimeoutMs: number;
  chunkTimeoutMs: number;
}): ReadableStream<LanguageModelV4StreamPart> {
  const { source, getFallbackStream, firstChunkTimeoutMs, chunkTimeoutMs } = options;

  return new ReadableStream<LanguageModelV4StreamPart>({
    async start(controller) {
      const reader = source.getReader();
      let forwardedAny = false;
      let forwardedToolCall = false;
      let openTextId: string | undefined;

      try {
        while (true) {
          const budget = forwardedAny ? chunkTimeoutMs : firstChunkTimeoutMs;
          const outcome = await raceRead(reader, budget);

          if (!outcome.ok) {
            await reader.cancel().catch(() => {});
            if (!forwardedAny) {
              const fallbackStream = await getFallbackStream();
              await pumpAll(fallbackStream, controller);
            } else {
              if (openTextId) {
                controller.enqueue({ type: 'text-end', id: openTextId });
              }
              if (forwardedToolCall) {
                // A real tool call already went out — splicing the scripted
                // step's tool calls on top would duplicate evidence on
                // screen. Close the step instead: the forwarded call
                // executes, and the NEXT model call falls back with the
                // script deriving its step from the updated history.
                controller.enqueue({
                  type: 'finish',
                  usage: FALLBACK_USAGE,
                  finishReason: { unified: 'tool-calls', raw: undefined },
                });
              } else {
                const fallbackStream = await getFallbackStream();
                for (const part of await toolCallsAndFinishFrom(fallbackStream)) {
                  controller.enqueue(part);
                }
              }
            }
            controller.close();
            return;
          }

          if (outcome.done) {
            controller.close();
            return;
          }

          const chunk = outcome.value;
          if (chunk.type === 'text-start') openTextId = chunk.id;
          if (chunk.type === 'text-end') openTextId = undefined;
          if (chunk.type === 'tool-call') forwardedToolCall = true;
          forwardedAny = true;
          controller.enqueue(chunk);
          if (chunk.type === 'finish') {
            controller.close();
            return;
          }
        }
      } catch (error) {
        controller.error(error);
      }
    },
    cancel(reason) {
      void source.cancel(reason);
    },
  });
}

export function createFallbackModel(options: {
  primary: LanguageModelV4;
  fallback: LanguageModelV4;
}): LanguageModelV4 {
  const { primary, fallback } = options;

  return {
    specificationVersion: 'v4',
    provider: primary.provider,
    modelId: primary.modelId,
    supportedUrls: primary.supportedUrls,

    async doGenerate(callOptions: LanguageModelV4CallOptions): Promise<LanguageModelV4GenerateResult> {
      try {
        return await withTimeout(primary.doGenerate(callOptions), timeoutBudgetMs());
      } catch {
        return fallback.doGenerate(callOptions);
      }
    },

    async doStream(callOptions: LanguageModelV4CallOptions): Promise<LanguageModelV4StreamResult> {
      const budgetMs = timeoutBudgetMs();
      const startedAt = Date.now();
      let primaryResult: LanguageModelV4StreamResult;
      try {
        primaryResult = await withTimeout(primary.doStream(callOptions), budgetMs);
      } catch {
        return fallback.doStream(callOptions);
      }

      const remainingMs = Math.max(budgetMs - (Date.now() - startedAt), 0);
      return {
        ...primaryResult,
        stream: wrapStreamWithFallback({
          source: primaryResult.stream,
          getFallbackStream: async () => (await fallback.doStream(callOptions)).stream,
          firstChunkTimeoutMs: remainingMs,
          chunkTimeoutMs: budgetMs,
        }),
      };
    },
  };
}
