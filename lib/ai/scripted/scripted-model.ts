// A LanguageModelV4 implementation (interface verified against the
// installed `@ai-sdk/provider@4.0.3` types — see docs/ai-sdk7-notes.md)
// driven entirely by an AgentScript (./types.ts). Everything above the model
// — ToolLoopAgent, real tool execution against lib/soe, native tool
// approvals, telemetry→Event Log — runs completely unaware this isn't a real
// provider: the wire format is identical in scripted and live modes (brief
// §5b), because this only ever replaces the *model* seam.
//
// `ai`'s own test helpers (`node_modules/ai/dist/test/*`) look dev-only —
// the package.json subpath is literally named "./test" — so per the work
// item's guidance this hand-implements the interface instead of depending on
// them from production code. `simulateReadableStream` (exported from `ai`
// itself, not the test subpath) is a legitimate production helper and is
// reused below for the doStream chunk pacing.

import { simulateReadableStream } from 'ai';
import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4FinishReason,
  LanguageModelV4GenerateResult,
  LanguageModelV4StreamPart,
  LanguageModelV4StreamResult,
  LanguageModelV4Usage,
} from '@ai-sdk/provider';
import type { AgentScript } from './types';

/** LanguageModelV4Usage's sub-fields are typed `number | undefined` — every
 * key must be present, but a scripted call has no real token accounting, so
 * every value is `undefined`. */
export const SCRIPTED_USAGE: LanguageModelV4Usage = {
  inputTokens: { total: undefined, noCache: undefined, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: undefined, text: undefined, reasoning: undefined },
};

const DEFAULT_SCRIPTED_DELAY_MS = 24;

/** Reads DEMO_SCRIPTED_DELAY_MS (brief §8.3) fresh on every call rather than
 * caching it — the replay verifier and tests set it per-process, and this
 * keeps that trivial. "0" must disable the delay, not fall back to the
 * default, hence the explicit `=== undefined` check rather than `!raw`. */
export function scriptedDelayMs(): number {
  const raw = process.env.DEMO_SCRIPTED_DELAY_MS;
  if (raw === undefined) return DEFAULT_SCRIPTED_DELAY_MS;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_SCRIPTED_DELAY_MS;
}

/** Splits narration into chunks that rejoin byte-identical to the source —
 * each chunk keeps its own trailing whitespace — for a per-word streaming
 * feel (brief §8.3: "word-chunk text-deltas"). */
export function wordChunks(text: string): string[] {
  return text.match(/\S+\s*/g) ?? (text.length > 0 ? [text] : []);
}

function finishReasonFor(toolCallCount: number): LanguageModelV4FinishReason {
  return toolCallCount > 0
    ? { unified: 'tool-calls', raw: 'tool_calls' }
    : { unified: 'stop', raw: 'stop' };
}

let idCounter = 0;
/** Unique-enough ids for text blocks and tool calls within one process.
 * `crypto.randomUUID()` needs no import (global in Node 22+, this repo's
 * engines floor per package.json) but a monotonic counter is cheaper and
 * just as collision-free for a single scripted step's handful of ids. */
function nextId(prefix: string): string {
  idCounter += 1;
  return `${prefix}-${idCounter}`;
}

/**
 * Builds the ordered LanguageModelV4StreamPart / content sequence for one
 * scripted step. Shared by doGenerate (as GenerateResult content) and
 * doStream (as stream parts) so the two can never drift out of sync.
 */
async function planStep(
  script: AgentScript,
  options: LanguageModelV4CallOptions,
): Promise<{
  narration: string;
  toolCalls: Array<{ toolCallId: string; toolName: string; inputJson: string }>;
  finishReason: LanguageModelV4FinishReason;
}> {
  const step = await script.nextStep(options.prompt);
  const toolCalls = step.toolCalls.map((call) => ({
    toolCallId: nextId('call'),
    toolName: call.toolName,
    inputJson: JSON.stringify(call.input),
  }));
  return { narration: step.narration, toolCalls, finishReason: finishReasonFor(toolCalls.length) };
}

export function createScriptedModel(script: AgentScript): LanguageModelV4 {
  return {
    specificationVersion: 'v4',
    provider: 'cardinal-scripted',
    modelId: `scripted:${script.agentId}`,
    supportedUrls: {},

    async doGenerate(options: LanguageModelV4CallOptions): Promise<LanguageModelV4GenerateResult> {
      const plan = await planStep(script, options);
      const content: LanguageModelV4GenerateResult['content'] = [];
      if (plan.narration.length > 0) {
        content.push({ type: 'text', text: plan.narration });
      }
      for (const call of plan.toolCalls) {
        content.push({
          type: 'tool-call',
          toolCallId: call.toolCallId,
          toolName: call.toolName,
          input: call.inputJson,
        });
      }
      return {
        content,
        finishReason: plan.finishReason,
        usage: SCRIPTED_USAGE,
        warnings: [],
      };
    },

    async doStream(options: LanguageModelV4CallOptions): Promise<LanguageModelV4StreamResult> {
      const plan = await planStep(script, options);
      const parts: LanguageModelV4StreamPart[] = [{ type: 'stream-start', warnings: [] }];

      if (plan.narration.length > 0) {
        const textId = nextId('text');
        parts.push({ type: 'text-start', id: textId });
        for (const chunk of wordChunks(plan.narration)) {
          parts.push({ type: 'text-delta', id: textId, delta: chunk });
        }
        parts.push({ type: 'text-end', id: textId });
      }

      for (const call of plan.toolCalls) {
        // No tool-input-start/delta needed: a bare `tool-call` part is a
        // complete, valid step on its own (verified against the installed
        // SDK's stream-part-to-internal-step transform — see
        // docs/ai-sdk7-notes.md). Skipping the streaming-args dance is both
        // simpler and correct, since every input is already fully known.
        parts.push({
          type: 'tool-call',
          toolCallId: call.toolCallId,
          toolName: call.toolName,
          input: call.inputJson,
        });
      }

      parts.push({ type: 'finish', usage: SCRIPTED_USAGE, finishReason: plan.finishReason });

      return {
        stream: simulateReadableStream({
          chunks: parts,
          initialDelayInMs: 0,
          chunkDelayInMs: scriptedDelayMs(),
        }),
      };
    },
  };
}
