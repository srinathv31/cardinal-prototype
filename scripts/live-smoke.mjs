#!/usr/bin/env node
// Live-LLM go/no-go — Phase B of the live-LLM plan (lib/ai/provider.ts's
// 'local' provider, CARDINAL_PROVIDER=local). Plain Node, ESM, no new
// dependencies (frozen deps, CLAUDE.md) — imports only what's already
// installed (`ai`, `@ai-sdk/openai`, `zod`). Drives ONE real streamed turn
// against the configured OpenAI-compatible endpoint (a local llama.cpp
// server in practice) through the exact machinery the app uses:
// ToolLoopAgent.stream() → toUIMessageStream() → readUIMessageStream(), per
// docs/ai-sdk7-notes.md and mirroring `createAgentUIStream`'s own call shape
// (node_modules/ai/dist/index.js) so this script proves the real seam, not
// a simplified stand-in.
//
// This is deliberately NOT a vitest test: it makes a real network call, so
// it can't run in `npm run test` (no network on CI, no live endpoint in
// most dev environments). Run it by hand — or via `npm run verify:live`,
// which loads `.env.local` for you — whenever the local model box changes
// or the provider seam changes.
//
// Structure-only assertions throughout: model prose is non-deterministic
// (this is a real model, not the scripted one), so nothing here pins exact
// wording — only the wire shape brief §5a/§5d actually require (a tool ran,
// text came back, nothing errored).

import { createOpenAI } from '@ai-sdk/openai';
import { ToolLoopAgent, readUIMessageStream, stepCountIs, tool, toUIMessageStream } from 'ai';
import { z } from 'zod';

const RUN_TIMEOUT_MS = 60_000;

class SmokeError extends Error {}

function assertTrue(condition, message) {
  if (!condition) throw new SmokeError(message);
}

async function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_resolve, reject) => {
    timer = setTimeout(() => reject(new SmokeError(`${label} timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Env resolution
// ---------------------------------------------------------------------------

function resolveConfig() {
  const baseURL = process.env.LOCAL_LLM_BASE_URL;
  const apiKey = process.env.LOCAL_LLM_API_KEY;
  const model = process.env.CARDINAL_MODEL ?? 'gpt-4.1-turbo';

  const missing = [];
  if (!baseURL) missing.push('LOCAL_LLM_BASE_URL');
  if (!apiKey) missing.push('LOCAL_LLM_API_KEY');
  if (missing.length > 0) {
    console.error(`FAIL — missing required env var(s): ${missing.join(', ')}.`);
    console.error(
      'Set them directly (e.g. LOCAL_LLM_BASE_URL=http://<host>:8080/v1 LOCAL_LLM_API_KEY=local-test ' +
        'node scripts/live-smoke.mjs), or put them in .env.local and run `npm run verify:live` ' +
        '(loads .env.local via --env-file). LOCAL_LLM_BASE_URL has no default because the local ' +
        "model box's IP is DHCP-assigned — it can change between sessions.",
    );
    process.exitCode = 1;
    return null;
  }
  return { baseURL, apiKey, model };
}

// ---------------------------------------------------------------------------
// The mock tool — a queryViolations-style read-only tool (lib/agents/ops/tools.ts's
// shape: `tool({ description, inputSchema, execute })`, zod input, no
// approval gate) returning fixed figures the model cannot itself invent.
// ---------------------------------------------------------------------------

const queryFixtureStatus = tool({
  description:
    'Read-only smoke-test tool. Returns fixed account-violation figures for a status check — ' +
    'call this whenever asked for the current violation status.',
  inputSchema: z.object({}),
  execute: async () => ({ scanned: 962, exceptions: 87, accounts: 74 }),
});

function buildAgent(model) {
  return new ToolLoopAgent({
    id: 'live-smoke',
    model,
    instructions:
      'You are a status-check assistant. When asked for the current violation status, call ' +
      'queryFixtureStatus and then briefly summarize the figures it returns in one sentence. ' +
      'Never invent numbers yourself — only report what the tool returns.',
    tools: { queryFixtureStatus },
    stopWhen: stepCountIs(4),
  });
}

// ---------------------------------------------------------------------------
// Checks — each prints PASS/FAIL immediately so a failing run still shows
// which structural property broke, not just a stack trace.
// ---------------------------------------------------------------------------

function check(label, fn) {
  try {
    fn();
    console.log(`PASS ${label}`);
    return true;
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    console.log(`FAIL ${label}: ${detail}`);
    return false;
  }
}

async function runTurn(config) {
  const provider = createOpenAI({ name: 'local', baseURL: config.baseURL, apiKey: config.apiKey });
  const model = provider.chat(config.model);
  const agent = buildAgent(model);

  const result = await agent.stream({ prompt: 'What is the current violation status?' });
  const uiStream = toUIMessageStream({ stream: result.stream, tools: agent.tools });

  let last;
  for await (const message of readUIMessageStream({ stream: uiStream })) {
    last = message;
  }
  assertTrue(last !== undefined, 'stream produced no assistant message');
  return last;
}

async function main() {
  const config = resolveConfig();
  if (!config) return;

  console.log(`Cardinal live-LLM smoke — ${config.baseURL} (model: ${config.model})\n`);

  const startedAt = Date.now();
  let message;
  let failures = 0;

  try {
    message = await withTimeout(runTurn(config), RUN_TIMEOUT_MS, 'live turn');
  } catch (err) {
    const detail = err instanceof Error ? (err.stack ?? err.message) : String(err);
    console.log(`FAIL live turn: ${detail}`);
    console.log('\nRESULT: FAIL — could not complete a streamed turn against the live endpoint.');
    process.exitCode = 1;
    return;
  }
  const elapsedMs = Date.now() - startedAt;

  const parts = message.parts ?? [];

  if (!check('at least one tool part reached an output/executed state', () => {
    const toolParts = parts.filter((p) => typeof p.type === 'string' && p.type.startsWith('tool-'));
    assertTrue(toolParts.length > 0, `no tool-* parts in the final message (types seen: ${parts.map((p) => p.type).join(', ') || 'none'})`);
    const executed = toolParts.some((p) => p.state === 'output-available' || p.state === 'output-error');
    assertTrue(
      executed,
      `no tool part reached output-available/output-error (states seen: ${toolParts.map((p) => p.state).join(', ')})`,
    );
  })) failures += 1;

  if (!check('final text is non-empty', () => {
    const text = parts
      .filter((p) => p.type === 'text')
      .map((p) => p.text ?? '')
      .join('');
    assertTrue(text.trim().length > 0, 'no non-empty text part in the final message');
  })) failures += 1;

  if (!check('no error part in the final message', () => {
    const errorParts = parts.filter((p) => p.type === 'error' || p.state === 'output-error');
    assertTrue(errorParts.length === 0, `found ${errorParts.length} error part(s)`);
  })) failures += 1;

  console.log(`\nTiming: ${elapsedMs}ms for one streamed turn (stopWhen: stepCountIs(4)).`);

  if (failures > 0) {
    console.log(`\nRESULT: FAIL — ${failures} check(s) failed.`);
    process.exitCode = 1;
  } else {
    console.log('\nRESULT: PASS — the live endpoint completed a real tool-calling streamed turn.');
  }
}

main().catch((err) => {
  console.error('FATAL:', err instanceof Error ? (err.stack ?? err.message) : err);
  process.exitCode = 1;
});
