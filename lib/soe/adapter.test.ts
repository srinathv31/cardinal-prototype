// Tests for the adapter's one write path (W4.1, CARDINAL_V3_AU_BRIEF.md
// §7c): `updatePartyContact` mutates in place, and `resetSoeState` (wired
// into POST /api/reset, app/api/reset/route.ts) discards that mutation —
// asserted here rather than assumed, per the work item's explicit
// instruction ("if the db is rebuilt from the generator on reset you may get
// this for free, and if so, prove it with a test rather than assuming").
// `getDb()`'s cache only rebuilds on an anchor change (adapter.ts), so
// without `resetSoeState` a mutation would otherwise survive every
// "Reset demo" click for the rest of the process's life.

import { describe, expect, it } from 'vitest';
import { getPartiesForAccount, resetSoeState, updatePartyContact } from './adapter';

// lib/soe/seed/patel.ts's ANAND_PARTY_ID / PATEL_ACCOUNT_ID — not imported
// directly (seed modules are internal to lib/soe, CLAUDE.md: "nothing
// imports seed data directly"), same routing-id convention every agent's
// script.ts already follows.
const ANAND_PARTY_ID = 'party-anand';
const PATEL_ACCOUNT_ID = 'acct-patel';

async function anandPhone(): Promise<string | undefined> {
  const parties = await getPartiesForAccount(PATEL_ACCOUNT_ID);
  return parties.find((p) => p.party.partyId === ANAND_PARTY_ID)?.party.phone;
}

describe('updatePartyContact', () => {
  it('applies a partial patch in place and leaves the other field untouched', async () => {
    resetSoeState();
    const before = await anandPhone();
    expect(before).toBe('(512) 555-0142');

    const updated = await updatePartyContact(ANAND_PARTY_ID, { phone: '(512) 555-0199' });
    expect(updated.phone).toBe('(512) 555-0199');
    expect(updated.mailingAddress).toBe('4118 Barton Skyway, Austin, TX 78746');

    const after = await anandPhone();
    expect(after).toBe('(512) 555-0199');

    resetSoeState();
  });

  it('throws a clear error for an unknown party id', async () => {
    await expect(updatePartyContact('party-does-not-exist', { phone: '555-0100' })).rejects.toThrow(
      /unknown party/,
    );
  });
});

describe('resetSoeState', () => {
  it('discards an updatePartyContact mutation — the POST /api/reset contract', async () => {
    resetSoeState();
    const original = await anandPhone();

    await updatePartyContact(ANAND_PARTY_ID, { phone: '(512) 555-9999' });
    expect(await anandPhone()).toBe('(512) 555-9999');

    resetSoeState();
    expect(await anandPhone()).toBe(original);
  });
});
