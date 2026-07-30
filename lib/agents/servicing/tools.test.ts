// Tests for lib/agents/servicing/tools.ts's updateContactInfo — the write
// half of brief §7a's identity pinning (lib/agents/servicing/resolvers.test.ts
// covers the four read resolvers). updateContactInfo's input schema has no
// partyId field at all (tools.ts never declares one), so there is nothing
// for a model-supplied party id to occupy; this proves the BEHAVIOR that
// absence implies — even a hand-built input object carrying a bogus,
// schema-illegal `partyId` still ends up mutating the pinned party
// (PINNED_PARTY_ID, ./identity), never the injected one.
//
// `tool()` is the identity function at runtime (verified in
// node_modules/@ai-sdk/provider-utils/dist/index.js, docs/ai-sdk7-notes.md),
// so `updateContactInfo.execute` is exactly the function tools.ts defines —
// cast past its opaque static type to call it directly, the same escape
// hatch the notes document for `.inputSchema`.

import { beforeEach, describe, expect, it } from 'vitest';
import { getPartiesForAccount, resetSoeState } from '@/lib/soe';
import { PINNED_ACCOUNT_ID, PINNED_PARTY_ID } from './identity';
import { updateContactInfo } from './tools';

// lib/soe/seed/elena.ts's ELENA_PARTY_ID — not imported directly (seed
// modules are internal to lib/soe); used only as an injected, illegal party
// id to prove the tool never reads it.
const OTHER_PARTY_ID = 'party-elena';

async function pinnedPhone(): Promise<string | undefined> {
  const parties = await getPartiesForAccount(PINNED_ACCOUNT_ID);
  return parties.find((p) => p.party.partyId === PINNED_PARTY_ID)?.party.phone;
}

describe('updateContactInfo — identity pinning (brief §7a/§7c)', () => {
  beforeEach(() => {
    resetSoeState();
  });

  it('always writes the pinned party, even when the input carries a different, schema-illegal partyId', async () => {
    const before = await pinnedPhone();
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

    const after = await pinnedPhone();
    expect(after).toBe('(512) 555-0177');
    expect(after).not.toBe(before);

    // And the injected party was never touched.
    const otherParty = (await getPartiesForAccount('acct-elena')).find(
      (p) => p.party.partyId === OTHER_PARTY_ID,
    );
    expect(otherParty?.party.phone).not.toBe('(512) 555-0177');
  });

  it('derives a deterministic confirmationId from which fields changed, never from their values', async () => {
    const execute = updateContactInfo.execute as unknown as (input: unknown) => Promise<{ confirmationId: string }>;
    const phoneOnly = await execute({ phone: '(512) 555-0111', rationale: 'r' });
    resetSoeState();
    const samePhoneFieldDifferentValue = await execute({ phone: '(512) 555-0222', rationale: 'r' });

    expect(phoneOnly.confirmationId).toBe(samePhoneFieldDifferentValue.confirmationId);
    expect(phoneOnly.confirmationId).toBe(`ctc-${PINNED_PARTY_ID}-phone`);
  });
});
