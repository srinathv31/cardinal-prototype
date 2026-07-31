// Rule store behavior (DEMO_BUILD_PLAN.md §Contracts — "Rule store"). The
// three properties the demo actually leans on: it starts empty, a replayed
// approval beat doesn't double the rule set, and reset returns it to the
// opening state.

import { beforeEach, describe, expect, it } from 'vitest';
import { getRules, isPolicyId, resetRules, saveRules, type RuleInput } from './store';

const R1: RuleInput = {
  id: 'R1',
  title: 'R1 — Product Eligibility',
  requirement:
    'An authorized user may not be added to, or maintained on, a secured card account.',
  citation: 'Authorized User Eligibility Policy · §Product Eligibility',
  machine: 'R1 · accounts, account-party-roles · nightly sweep · current state',
  addedAt: '2026-07-31T09:00:00.000Z',
};

const R2: RuleInput = {
  ...R1,
  id: 'R2',
  title: 'R2 — Account Standing',
  requirement:
    'An authorized user may not be added to an account that is not in good standing at the time of addition.',
  citation: 'Authorized User Eligibility Policy · §Account Standing',
};

const CA1: RuleInput = {
  ...R1,
  id: 'CA-R1',
  title: 'CA-R1 — No activation while past due',
  requirement: 'A card may not be activated while the account is past due.',
  citation: 'Card Activation Policy · §Account Standing',
};

describe('rule store', () => {
  beforeEach(() => {
    resetRules();
  });

  it('starts empty — "no rules configured" is a true demo state', () => {
    expect(getRules()).toEqual([]);
    expect(getRules('authorized-user')).toEqual([]);
  });

  it('stamps policyId and returns the count saved', () => {
    expect(saveRules('authorized-user', [R1, R2])).toEqual({ saved: 2 });
    const stored = getRules('authorized-user');
    expect(stored).toHaveLength(2);
    expect(stored.map((r) => r.id)).toEqual(['R1', 'R2']);
    expect(stored.every((r) => r.policyId === 'authorized-user')).toBe(true);
  });

  it('defaults addedAt to an ISO timestamp when the caller omits it', () => {
    const { addedAt, ...withoutAddedAt } = R1;
    expect(addedAt).toBeTruthy();
    saveRules('authorized-user', [withoutAddedAt]);
    expect(getRules('authorized-user')[0].addedAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/,
    );
  });

  it('honors an explicit addedAt so a scripted beat stays byte-identical on replay', () => {
    saveRules('authorized-user', [R1]);
    expect(getRules('authorized-user')[0].addedAt).toBe('2026-07-31T09:00:00.000Z');
  });

  it('upserts by id — replaying the approval beat leaves 2 rules, not 4', () => {
    saveRules('authorized-user', [R1, R2]);
    saveRules('authorized-user', [R1, R2]);
    expect(getRules('authorized-user')).toHaveLength(2);
  });

  it('a re-save replaces the stored rule in place, keeping its position', () => {
    saveRules('authorized-user', [R1, R2]);
    saveRules('authorized-user', [{ ...R1, title: 'R1 — Product Eligibility (v2)' }]);
    const stored = getRules('authorized-user');
    expect(stored.map((r) => r.id)).toEqual(['R1', 'R2']);
    expect(stored[0].title).toBe('R1 — Product Eligibility (v2)');
  });

  it('keeps policies in separate namespaces', () => {
    saveRules('authorized-user', [R1, R2]);
    saveRules('card-activation', [CA1]);
    expect(getRules('authorized-user').map((r) => r.id)).toEqual(['R1', 'R2']);
    expect(getRules('card-activation').map((r) => r.id)).toEqual(['CA-R1']);
    expect(getRules()).toHaveLength(3);
  });

  it('an id may repeat across policies without colliding', () => {
    saveRules('authorized-user', [R1]);
    saveRules('card-activation', [{ ...R1, title: 'CA copy' }]);
    expect(getRules()).toHaveLength(2);
    expect(getRules('card-activation')[0].title).toBe('CA copy');
  });

  it('hands back copies — mutating a returned row cannot corrupt the store', () => {
    saveRules('authorized-user', [R1]);
    getRules('authorized-user')[0].title = 'tampered';
    expect(getRules('authorized-user')[0].title).toBe('R1 — Product Eligibility');
  });

  it('resetRules() returns the store to its opening state', () => {
    saveRules('authorized-user', [R1, R2]);
    saveRules('card-activation', [CA1]);
    resetRules();
    expect(getRules()).toEqual([]);
  });

  it('isPolicyId narrows only the two known policies', () => {
    expect(isPolicyId('authorized-user')).toBe(true);
    expect(isPolicyId('card-activation')).toBe(true);
    expect(isPolicyId('balance-transfer')).toBe(false);
    expect(isPolicyId('')).toBe(false);
  });
});
