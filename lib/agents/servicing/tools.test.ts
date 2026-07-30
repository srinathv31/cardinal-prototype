// Tests for lib/agents/servicing/tools.ts — updateContactInfo (the write
// half of brief §7a's identity pinning; lib/agents/servicing/resolvers.test.ts
// covers the four-plus-one read resolvers) and activateCard (DEMO_THESIS.md
// Use case 3, customer side; Wave 2 Agent E work item 3).
//
// Under the factory design (Wave 2 Agent E work item 1), each test builds
// its own `createServicingTools(ctx)` bound to a specific identity/persona —
// the same "closes over a fixed identity, no parameter for a model-supplied
// one to occupy" proof resolvers.test.ts carries out, applied to the write
// tools.
//
// `tool()` is the identity function at runtime (verified in
// node_modules/@ai-sdk/provider-utils/dist/index.js, docs/ai-sdk7-notes.md),
// so `<tool>.execute` is exactly the function tools.ts defines — cast past
// its opaque static type to call it directly, the same escape hatch the
// notes document for `.inputSchema`.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getPartiesForAccount, resetSoeState } from '@/lib/soe';
import { query, reset } from '@/lib/events/store';
import { identityForPersona } from './identity';
import { createServicingResolvers } from './resolvers';
import { createServicingTools } from './tools';

// lib/soe/seed/elena.ts's ELENA_PARTY_ID — not imported directly (seed
// modules are internal to lib/soe); used only as an injected, illegal party
// id to prove the tool never reads it.
const OTHER_PARTY_ID = 'party-elena';

function buildTools(persona: 'happy' | 'blocked', overrides?: Partial<{ runId: string; agentId: string }>) {
  const identity = identityForPersona(persona);
  const resolvers = createServicingResolvers(identity);
  return createServicingTools({
    identity,
    persona,
    resolvers,
    runId: overrides?.runId ?? `test-run-${persona}`,
    agentId: overrides?.agentId ?? 'servicing-test',
  });
}

async function pinnedPhone(accountId: string, partyId: string): Promise<string | undefined> {
  const parties = await getPartiesForAccount(accountId);
  return parties.find((p) => p.party.partyId === partyId)?.party.phone;
}

describe('updateContactInfo — identity pinning (brief §7a/§7c)', () => {
  beforeEach(() => {
    resetSoeState();
  });

  it('always writes the pinned party, even when the input carries a different, schema-illegal partyId', async () => {
    const { updateContactInfo } = buildTools('happy');
    const before = await pinnedPhone('acct-patel', 'party-anand');
    expect(before).toBeTruthy();

    const execute = updateContactInfo.execute as unknown as (input: unknown) => Promise<{
      status: string;
      confirmationId: string;
      phone?: string;
      mailingAddress?: string;
    }>;
    // updateContactInfoInputSchema (tools.ts) has no partyId field — this
    // object is illegal input a real model could never construct through the
    // tool's declared schema. Passed straight to execute() anyway, below any
    // schema validation, to prove the function itself has nowhere to read it.
    const result = await execute({
      phone: '(512) 555-0177',
      rationale: 'Customer asked to update their phone number.',
      partyId: OTHER_PARTY_ID,
    });

    expect(result.status).toBe('updated');
    expect(result.phone).toBe('(512) 555-0177');

    const after = await pinnedPhone('acct-patel', 'party-anand');
    expect(after).toBe('(512) 555-0177');
    expect(after).not.toBe(before);

    // And the injected party was never touched.
    const otherParty = (await getPartiesForAccount('acct-elena')).find(
      (p) => p.party.partyId === OTHER_PARTY_ID,
    );
    expect(otherParty?.party.phone).not.toBe('(512) 555-0177');
  });

  it('derives a deterministic confirmationId from which fields changed, never from their values', async () => {
    const { updateContactInfo } = buildTools('happy');
    const execute = updateContactInfo.execute as unknown as (input: unknown) => Promise<{ confirmationId: string }>;
    const phoneOnly = await execute({ phone: '(512) 555-0111', rationale: 'r' });
    resetSoeState();
    const samePhoneFieldDifferentValue = await execute({ phone: '(512) 555-0222', rationale: 'r' });

    expect(phoneOnly.confirmationId).toBe(samePhoneFieldDifferentValue.confirmationId);
    expect(phoneOnly.confirmationId).toBe('ctc-party-anand-phone');
  });

  it('the blocked persona\'s tools write to Marcus\'s party, never Patel\'s', async () => {
    const { updateContactInfo } = buildTools('blocked');
    const execute = updateContactInfo.execute as unknown as (input: unknown) => Promise<{ confirmationId: string }>;
    const before = await pinnedPhone('acct-patel', 'party-anand');

    const result = await execute({ phone: '(737) 555-0199', rationale: 'r' });
    expect(result.confirmationId).toBe('ctc-party-marcus-phone');

    const marcusPhone = await pinnedPhone('acct-marcus', 'party-marcus');
    expect(marcusPhone).toBe('(737) 555-0199');
    // Patel's own phone is untouched by the blocked persona's tool instance.
    expect(await pinnedPhone('acct-patel', 'party-anand')).toBe(before);
  });
});

describe('activateCard — happy/blocked persona pinning (DEMO_THESIS.md Use case 3)', () => {
  beforeEach(() => {
    process.env.DEMO_ANCHOR_DATE = '2026-08-05';
    resetSoeState();
    reset();
  });
  afterEach(() => {
    delete process.env.DEMO_ANCHOR_DATE;
    resetSoeState();
    reset();
  });

  it('happy persona (Anand Patel) activates and returns a confirmationId, no accountId/persona in the input schema', async () => {
    const { activateCard } = buildTools('happy', { runId: 'run-activate-happy', agentId: 'servicing-test' });
    const execute = activateCard.execute as unknown as (input: unknown) => Promise<
      { status: 'activated'; confirmationId: string } | { status: 'blocked'; ruleId: string; finding: string }
    >;
    const result = await execute({ rationale: 'Activate the card on file for your account.' });

    expect(result.status).toBe('activated');
    if (result.status === 'activated') {
      expect(typeof result.confirmationId).toBe('string');
      expect(result.confirmationId.length).toBeGreaterThan(0);
    }
  });

  it('blocked persona (Marcus Webb) is blocked with the real CA-R1 finding from checkActivationAttempt, not hand-typed copy', async () => {
    const { activateCard } = buildTools('blocked', { runId: 'run-activate-blocked', agentId: 'servicing-test' });
    const execute = activateCard.execute as unknown as (input: unknown) => Promise<
      { status: 'activated'; confirmationId: string } | { status: 'blocked'; ruleId: string; finding: string }
    >;
    const result = await execute({ rationale: 'Activate the card on file for your account.' });

    expect(result.status).toBe('blocked');
    if (result.status === 'blocked') {
      expect(result.ruleId).toBe('CA-R1');
      expect(result.finding).toContain('past-due');
      expect(result.finding).toContain('missed');
    }
  });

  it('writes exactly one action.executed audit entry, attributed to the tool-construction runId/agentId', async () => {
    const { activateCard } = buildTools('happy', { runId: 'run-activate-audit', agentId: 'servicing-audit-test' });
    const execute = activateCard.execute as unknown as (input: unknown) => Promise<unknown>;
    await execute({ rationale: 'r' });

    const entries = query({ runId: 'run-activate-audit' });
    expect(entries).toHaveLength(1);
    expect(entries[0].kind).toBe('action.executed');
    expect(entries[0].actor).toBe('agent');
    expect(entries[0].agentId).toBe('servicing-audit-test');
  });

  it('has no accountId/persona field in its declared input schema (structural pinning)', () => {
    const { activateCard } = buildTools('happy');
    const shape = (activateCard.inputSchema as unknown as { shape: Record<string, unknown> }).shape;
    expect(Object.keys(shape)).not.toContain('accountId');
    expect(Object.keys(shape)).not.toContain('persona');
  });
});
