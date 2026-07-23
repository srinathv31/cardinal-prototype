// LLM provider seam (brief §2: "structure so swapping providers is a
// one-file change"). Reads CARDINAL_PROVIDER / CARDINAL_MODEL and returns a
// LanguageModel from the matching @ai-sdk/* factory. Nothing above this
// module (tools, agents, routes) imports a provider package directly.

import { createAnthropic } from '@ai-sdk/anthropic';
import { createAzure } from '@ai-sdk/azure';
import { createOpenAI } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';

export type CardinalProvider = 'anthropic' | 'openai' | 'azure';

const DEFAULT_ANTHROPIC_MODEL = 'claude-sonnet-5';

function currentProvider(): CardinalProvider {
  const raw = process.env.CARDINAL_PROVIDER ?? 'anthropic';
  if (raw === 'anthropic' || raw === 'openai' || raw === 'azure') return raw;
  throw new Error(
    `Unknown CARDINAL_PROVIDER "${raw}" — expected "anthropic", "openai", or "azure".`,
  );
}

/** Env vars each provider needs before a call can succeed. CARDINAL_MODEL has
 * a default for anthropic only, so it's required here for the other two. */
function requiredEnvVars(provider: CardinalProvider): string[] {
  switch (provider) {
    case 'anthropic':
      return ['ANTHROPIC_API_KEY'];
    case 'openai':
      return ['OPENAI_API_KEY', 'CARDINAL_MODEL'];
    case 'azure':
      return ['AZURE_API_KEY', 'AZURE_RESOURCE_NAME', 'CARDINAL_MODEL'];
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

/** Returns the configured LanguageModel — the "one-file swap" for the provider. */
export function getLanguageModel(): LanguageModel {
  assertProviderConfigured();
  const provider = currentProvider();
  const modelId =
    process.env.CARDINAL_MODEL ??
    (provider === 'anthropic' ? DEFAULT_ANTHROPIC_MODEL : undefined);
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
  }
}
