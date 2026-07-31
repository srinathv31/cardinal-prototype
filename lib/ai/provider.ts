// LLM provider seam (brief §2: "structure so swapping providers is a
// one-file change"). Reads CARDINAL_PROVIDER / CARDINAL_MODEL and returns a
// LanguageModel from the matching @ai-sdk/* factory. Nothing above this
// module (tools, agents, routes) imports a provider package directly.

import { createAnthropic } from '@ai-sdk/anthropic';
import { createAzure } from '@ai-sdk/azure';
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';
import type { LanguageModelV4 } from '@ai-sdk/provider';
import { demoMode } from './demo-mode';
import { createFallbackModel } from './scripted/fallback-model';
import { createScriptedModel } from './scripted/scripted-model';
import type { AgentScript } from './scripted/types';

export type CardinalProvider = 'anthropic' | 'openai' | 'azure' | 'local';

const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-5';
const DEFAULT_LOCAL_MODEL = 'gpt-4.1-turbo';

function currentProvider(): CardinalProvider {
  const raw = process.env.CARDINAL_PROVIDER ?? 'anthropic';
  if (raw === 'anthropic' || raw === 'openai' || raw === 'azure' || raw === 'local') return raw;
  throw new Error(
    `Unknown CARDINAL_PROVIDER "${raw}" — expected "anthropic", "openai", "azure", or "local".`,
  );
}

/** Env vars each provider needs before a call can succeed. CARDINAL_MODEL has
 * a default for anthropic and local only, so it's required here for the
 * other two. `local` reads its base URL from env rather than a hardcoded
 * default — the host IP is DHCP-assigned. */
function requiredEnvVars(provider: CardinalProvider): string[] {
  switch (provider) {
    case 'anthropic':
      return ['ANTHROPIC_API_KEY'];
    case 'openai':
      return ['OPENAI_API_KEY', 'CARDINAL_MODEL'];
    case 'azure':
      return ['AZURE_API_KEY', 'AZURE_RESOURCE_NAME', 'CARDINAL_MODEL'];
    case 'local':
      return ['LOCAL_LLM_BASE_URL', 'LOCAL_LLM_API_KEY'];
  }
}

/**
 * Throws a clear, named error if the active provider's required env vars are
 * missing. Call before any LLM call so a misconfigured box fails fast with an
 * actionable message instead of a provider-SDK stack trace.
 */
export function assertProviderConfigured(): void {
  const provider = currentProvider();
  const missing = requiredEnvVars(provider).filter((name) => !process.env[name]);
  if (missing.length > 0) {
    throw new Error(
      `CARDINAL_PROVIDER="${provider}" is missing required env var(s): ${missing.join(', ')}. See .env.example.`,
    );
  }
}

/**
 * Non-throwing sibling of assertProviderConfigured — used by getAgentModel
 * (W4.1) to decide, in DEMO_MODE=scripted, whether a real model is even
 * worth trying before falling back to the pure scripted model. Scripted mode
 * with no provider env configured must never throw (brief §8.1: the demo
 * "must be completable with the network down"), which rules out reusing
 * assertProviderConfigured directly here.
 */
export function isProviderConfigured(): boolean {
  const missing = requiredEnvVars(currentProvider()).filter((name) => !process.env[name]);
  return missing.length === 0;
}

/** Returns the configured LanguageModel — the "one-file swap" for the provider. */
export function getLanguageModel(): LanguageModel {
  assertProviderConfigured();
  const provider = currentProvider();
  const modelId =
    process.env.CARDINAL_MODEL ??
    (provider === 'anthropic'
      ? DEFAULT_ANTHROPIC_MODEL
      : provider === 'local'
        ? DEFAULT_LOCAL_MODEL
        : undefined);
  if (!modelId) {
    // Unreachable in practice — assertProviderConfigured() already requires
    // CARDINAL_MODEL for openai/azure — but keeps this function safe to call
    // standalone.
    throw new Error(`CARDINAL_MODEL is required for CARDINAL_PROVIDER="${provider}".`);
  }

  switch (provider) {
    case 'anthropic':
      return createAnthropic()(modelId);
    case 'openai':
      return createOpenAI()(modelId);
    case 'azure':
      return createAzure()(modelId);
    case 'local':
      // llama.cpp's OpenAI-compatible server only implements the Chat
      // Completions surface — `.chat(modelId)` targets that explicitly.
      // The bare factory (`createOpenAI(...)(modelId)`) targets OpenAI's
      // Responses API instead and fails against llama.cpp. `.chat()` is
      // still declared to return LanguageModelV4 concretely (verified in
      // node_modules/@ai-sdk/openai/dist/index.d.ts), so the cast in
      // getAgentModel below keeps working unchanged.
      return createOpenAI({
        name: 'local',
        baseURL: process.env.LOCAL_LLM_BASE_URL,
        apiKey: process.env.LOCAL_LLM_API_KEY,
      }).chat(modelId);
  }
}

/**
 * Returns the LanguageModel a given agent should use, per DEMO_MODE (brief
 * §8.1 / CLAUDE.md):
 *  - `live`: identical to pre-W4.1 behavior — the configured real model,
 *    throwing if the active provider's env vars are missing.
 *  - `scripted` with a configured provider: the real model wrapped by
 *    lib/ai/scripted/fallback-model.ts, which races every doGenerate/
 *    doStream call against a timeout and falls back to the deterministic
 *    script (lib/ai/scripted/scripted-model.ts) on error or timeout.
 *  - `scripted` with no provider env configured: the pure scripted model —
 *    this branch never calls assertProviderConfigured and never throws, so
 *    every agent completes a full run with no API key and no network.
 */
export function getAgentModel(script: AgentScript): LanguageModel {
  if (demoMode() === 'live') {
    return getLanguageModel();
  }

  if (!isProviderConfigured()) {
    return createScriptedModel(script);
  }

  // getLanguageModel()'s declared return type is the broad `LanguageModel`
  // union (GlobalProviderModelId | V2 | V3 | V4) for provider-agnosticism,
  // but every factory this module calls — createAnthropic/createOpenAI/
  // createAzure, all pinned to @ai-sdk/*@4.x per the dependency freeze — is
  // declared to return LanguageModelV4 concretely (verified against each
  // package's dist/index.d.ts; see docs/ai-sdk7-notes.md). The cast below
  // just restores that precision for the fallback wrapper, which needs the
  // concrete V4 shape to race doGenerate/doStream.
  const primary = getLanguageModel() as LanguageModelV4;
  return createFallbackModel({ primary, fallback: createScriptedModel(script) });
}
