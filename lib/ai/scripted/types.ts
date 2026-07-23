// The AgentScript contract (W4.1) — a deterministic state machine that
// stands in for the real model in DEMO_MODE=scripted (brief §8.1) and as the
// fallback target when a configured real provider errors or times out
// (lib/ai/scripted/fallback-model.ts).
//
// A script is a pure function of the model-call prompt: given the exact
// `LanguageModelV4Prompt` the SDK would hand a real model, it returns the
// next step to take. It never holds its own run state — the step index is
// derived by counting `tool-result` parts already present in the prompt
// (docs/ai-sdk7-notes.md's "denied tools" note explains how a declined
// action tool shows up here too), so a script correctly resumes mid-run even
// if a real model completed the first few steps before falling back
// (lib/ai/scripted/fallback-model.ts).
//
// Types are imported straight from '@ai-sdk/provider' — the actual package
// `ai@7` builds its LanguageModel union from (verified against the
// installed `node_modules/@ai-sdk/provider/dist/index.d.ts`; see
// docs/ai-sdk7-notes.md for the full verification trail) — rather than from
// 'ai' itself, which imports these types internally but does not re-export
// them under their own names.

import type {
  LanguageModelV4Message,
  LanguageModelV4Prompt,
  LanguageModelV4ToolResultOutput,
} from '@ai-sdk/provider';

/** One tool call a script wants the (simulated) model to make this step. The
 * `input` is a plain JS value — the scripted model (scripted-model.ts) is
 * responsible for JSON-encoding it the way a real model's tool-call content
 * part requires. */
export interface ScriptToolCall {
  toolName: string;
  input: unknown;
}

/** The next step a script wants to take, given everything the prompt shows
 * has already happened in this run. */
export interface ScriptStep {
  /** Narration text for this step. Never empty — every step, including the
   * close, says something (mirrors every agent's INSTRUCTIONS, which never
   * call a tool silently). */
  narration: string;
  /** Zero or more tool calls to make this step, in order. Empty + `done`
   * means the run closes here. */
  toolCalls: ScriptToolCall[];
  /** True once this step's narration is the run's closing sentence — no
   * further step will ever be requested after a `done` step (mirrors every
   * agent's hard rule: "propose nothing further after that"). */
  done: boolean;
}

export interface AgentScript {
  /** For logging/error messages only — scripts never branch on this. */
  readonly agentId: string;
  /** Pure and deterministic for a given prompt (same seed anchor ⇒ same
   * output every call) — may `await` lib/soe adapter reads, never mutates
   * state and never depends on wall-clock aside from the shared demo anchor
   * every adapter call already honors. */
  nextStep(prompt: LanguageModelV4Prompt): Promise<ScriptStep>;
}

// ---------------------------------------------------------------------------
// Shared prompt-reading helpers. Every script needs these; centralizing them
// here keeps the "derive step index by counting tool results" rule (this
// file's header) implemented exactly once.
// ---------------------------------------------------------------------------

/** The text of a message's first `text` content part, or undefined for a
 * non-text-bearing message (or a `system` message, whose `content` is a
 * plain string handled separately by callers that need it). */
function firstTextPart(message: LanguageModelV4Message): string | undefined {
  if (message.role === 'system') return message.content;
  if (message.role !== 'user') return undefined;
  const part = message.content.find((p) => p.type === 'text');
  return part?.type === 'text' ? part.text : undefined;
}

/** The first user message's text — the run's trigger (docs/wire-contract.md
 * §6) for the three monitor agents. Stable across every resume in a run,
 * since resumes re-send the full history and never edit earlier messages. */
export function firstUserMessageText(prompt: LanguageModelV4Prompt): string | undefined {
  for (const message of prompt) {
    if (message.role === 'user') return firstTextPart(message);
  }
  return undefined;
}

/** The most recent user message's text — what Ask (lib/agents/ask) matches
 * against, since an Ask run may hold several question/answer turns. */
export function lastUserMessageText(prompt: LanguageModelV4Prompt): string | undefined {
  for (let i = prompt.length - 1; i >= 0; i--) {
    const message = prompt[i];
    if (message.role === 'user') return firstTextPart(message);
  }
  return undefined;
}

/**
 * Parses the run's trigger StreamEvent (the first user message) for its
 * `accountId`, defensively — untrusted, hand-authored JSON in spirit even
 * though this repo controls both ends (docs/wire-contract.md §6 tells every
 * agent to treat the trigger as untrusted context). Falls back to the
 * caller-supplied persona accountId on any parse failure, exactly as the
 * work item specifies.
 */
export function extractAccountId(prompt: LanguageModelV4Prompt, fallbackAccountId: string): string {
  const text = firstUserMessageText(prompt);
  if (!text) return fallbackAccountId;
  try {
    const parsed: unknown = JSON.parse(text);
    if (
      parsed !== null &&
      typeof parsed === 'object' &&
      'accountId' in parsed &&
      typeof (parsed as { accountId: unknown }).accountId === 'string' &&
      (parsed as { accountId: string }).accountId.length > 0
    ) {
      return (parsed as { accountId: string }).accountId;
    }
    return fallbackAccountId;
  } catch {
    return fallbackAccountId;
  }
}

export interface ToolResultEntry {
  toolName: string;
  output: LanguageModelV4ToolResultOutput;
}

/**
 * Every `tool-result` content part (approved-and-executed or denied — see
 * this file's header) that appears strictly after the most recent user
 * message. Scoping to "since the last user message" rather than the whole
 * prompt is what lets Ask's script answer a second question in the same run
 * without seeing the first question's tool results as if they were part of
 * the current turn; it's a no-op for the three monitor agents, which only
 * ever receive one user message (the trigger) for the life of a run.
 */
export function toolResultsSinceLastUserMessage(prompt: LanguageModelV4Prompt): ToolResultEntry[] {
  let lastUserIndex = -1;
  for (let i = 0; i < prompt.length; i++) {
    if (prompt[i].role === 'user') lastUserIndex = i;
  }

  const results: ToolResultEntry[] = [];
  for (let i = lastUserIndex + 1; i < prompt.length; i++) {
    const message = prompt[i];
    if (message.role !== 'tool') continue;
    for (const part of message.content) {
      if (part.type === 'tool-result') {
        results.push({ toolName: part.toolName, output: part.output });
      }
    }
  }
  return results;
}

export function countToolResults(results: ToolResultEntry[], toolName: string): number {
  return results.filter((r) => r.toolName === toolName).length;
}

/**
 * Whether the SDK recorded a human decision on `toolName`'s call, per
 * docs/ai-sdk7-notes.md's verified fact: a denied client-executed tool
 * surfaces as a normal `tool-result` whose `output.type` is
 * `'execution-denied'` (never a `tool-approval-response` part — those are
 * stripped from the model-facing prompt for non-provider-executed tools).
 * Returns 'none' when no result exists yet (still pending, or never called).
 */
export function toolDisposition(
  results: ToolResultEntry[],
  toolName: string,
): 'approved' | 'denied' | 'none' {
  const match = results.find((r) => r.toolName === toolName);
  if (!match) return 'none';
  return match.output.type === 'execution-denied' ? 'denied' : 'approved';
}
