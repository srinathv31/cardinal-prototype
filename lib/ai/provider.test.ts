// Verifies lib/ai/provider.ts's env-driven resolution — construction only,
// no network. Every case sets/clears process.env per-case (following
// lib/ai/scripted/scripted-model.test.ts's save/restore convention) and
// never calls doGenerate/doStream: getLanguageModel()'s factories
// (createAnthropic/createOpenAI/createAzure, all @ai-sdk/*@4.x) read api
// keys and base URLs lazily inside doGenerate/doStream's request builders
// (verified in node_modules/@ai-sdk/openai/dist/index.js's createChatModel —
// `apiKey`/`baseURL` are only resolved when a request is actually built), so
// constructing a model with missing/fake credentials is safe and throws
// nothing.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { LanguageModelV4 } from '@ai-sdk/provider';
import { assertProviderConfigured, getLanguageModel, isProviderConfigured } from './provider';

/** getLanguageModel()'s declared return type is the broad `LanguageModel`
 * union for provider-agnosticism (a `GlobalProviderModelId` string is a
 * member), but every factory it can call in this test file resolves
 * concretely to `LanguageModelV4` — same fact lib/ai/provider.ts's own
 * getAgentModel documents and casts on. This helper just restores that
 * precision so tests can read `.modelId`/`.provider` directly. */
function resolvedModel(): LanguageModelV4 {
  return getLanguageModel() as LanguageModelV4;
}

/** Every env var any provider branch reads. Cleared before each case so
 * cases don't leak into each other via a real .env.local or shell env. */
const ALL_PROVIDER_ENV_KEYS = [
  'CARDINAL_PROVIDER',
  'CARDINAL_MODEL',
  'ANTHROPIC_API_KEY',
  'OPENAI_API_KEY',
  'AZURE_API_KEY',
  'AZURE_RESOURCE_NAME',
  'LOCAL_LLM_BASE_URL',
  'LOCAL_LLM_API_KEY',
] as const;

describe('provider', () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = {};
    for (const key of ALL_PROVIDER_ENV_KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of ALL_PROVIDER_ENV_KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  describe('local provider', () => {
    it('getLanguageModel() resolves a model with the default modelId and a "local" provider string when both required vars are set', () => {
      process.env.CARDINAL_PROVIDER = 'local';
      process.env.LOCAL_LLM_BASE_URL = 'http://192.168.6.63:8080/v1';
      process.env.LOCAL_LLM_API_KEY = 'local-test';

      expect(() => assertProviderConfigured()).not.toThrow();
      expect(isProviderConfigured()).toBe(true);

      const model = resolvedModel();
      expect(model.modelId).toBe('gpt-4.1-turbo');
      expect(model.provider).toContain('local');
    });

    it('respects a CARDINAL_MODEL override instead of the default', () => {
      process.env.CARDINAL_PROVIDER = 'local';
      process.env.LOCAL_LLM_BASE_URL = 'http://192.168.6.63:8080/v1';
      process.env.LOCAL_LLM_API_KEY = 'local-test';
      process.env.CARDINAL_MODEL = 'qwen3.6-35b-a3b';

      const model = resolvedModel();
      expect(model.modelId).toBe('qwen3.6-35b-a3b');
    });

    it('assertProviderConfigured() throws naming the provider and the missing var when LOCAL_LLM_BASE_URL is absent', () => {
      process.env.CARDINAL_PROVIDER = 'local';
      process.env.LOCAL_LLM_API_KEY = 'local-test';
      // LOCAL_LLM_BASE_URL intentionally left unset.

      expect(() => assertProviderConfigured()).toThrow(/local/);
      expect(() => assertProviderConfigured()).toThrow(/LOCAL_LLM_BASE_URL/);
      expect(isProviderConfigured()).toBe(false);
    });

    it('assertProviderConfigured() throws naming the missing var when LOCAL_LLM_API_KEY is absent', () => {
      process.env.CARDINAL_PROVIDER = 'local';
      process.env.LOCAL_LLM_BASE_URL = 'http://192.168.6.63:8080/v1';
      // LOCAL_LLM_API_KEY intentionally left unset.

      expect(() => assertProviderConfigured()).toThrow(/LOCAL_LLM_API_KEY/);
      expect(isProviderConfigured()).toBe(false);
    });
  });

  it('an unknown CARDINAL_PROVIDER still throws, and the error now lists "local"', () => {
    process.env.CARDINAL_PROVIDER = 'bogus';
    expect(() => getLanguageModel()).toThrow(/Unknown CARDINAL_PROVIDER "bogus"/);
    expect(() => getLanguageModel()).toThrow(/"local"/);
  });

  it('regression: CARDINAL_PROVIDER=anthropic (the default) still resolves the default model id with no behavior change', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-test';
    // CARDINAL_PROVIDER left unset — anthropic is the default.

    expect(isProviderConfigured()).toBe(true);
    const model = resolvedModel();
    expect(model.modelId).toBe('claude-sonnet-5');
    expect(model.provider).toContain('anthropic');
  });
});
