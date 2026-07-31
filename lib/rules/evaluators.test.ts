// Both policy evaluators and the registry they register into. Runs at both
// demo-date anchors, following lib/sentinel/exception-fixture.test.ts's
// convention — DEMO_ANCHOR_DATE pins the adapter's cached SeedDb, and every
// figure asserted below has to fall out of that data rather than out of a
// literal in the evaluator.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getCardActivationScan } from '@/lib/soe';
import { evaluateCardActivationPolicy as scanCardActivations } from '@/lib/sentinel/ca-exceptions';
import { cardActivationPolicyRules } from '@/lib/sentinel/card-activation-policy';
import {
  evaluateAuthorizedUserPolicy,
  evaluateCardActivationPolicy,
  getEvaluator,
  listRegisteredPolicies,
  registerEvaluator,
  type PolicyEvaluator,
} from './evaluators';

const ANCHORS = ['2026-08-05', '2026-08-19'] as const;

describe.each(ANCHORS)('authorized-user evaluator @ anchor %s', (anchorIso) => {
  beforeEach(() => {
    process.env.DEMO_ANCHOR_DATE = anchorIso;
  });
  afterEach(() => {
    delete process.env.DEMO_ANCHOR_DATE;
  });

  it('reports the golden AU figures — 962 scanned, 87 exceptions across 74 accounts', async () => {
    const payload = await evaluateAuthorizedUserPolicy();
    expect(payload.policyId).toBe('authorized-user');
    expect(payload.summary).toEqual({
      scanned: 962,
      accountsAffected: 74,
      exceptions: 87,
    });
    expect(payload.rows).toHaveLength(87);
  });

  it('splits 61/19/7 by rule, in R1/R2/R3 order', async () => {
    const payload = await evaluateAuthorizedUserPolicy();
    expect(payload.byRule.map((r) => r.ruleId)).toEqual(['R1', 'R2', 'R3']);
    expect(payload.byRule.map((r) => r.count)).toEqual([61, 19, 7]);
    // The per-rule counts and the rows are two views of one derivation.
    for (const rule of payload.byRule) {
      expect(payload.rows.filter((row) => row.ruleId === rule.ruleId)).toHaveLength(
        rule.count,
      );
    }
  });

  it('every row carries a holder, a finding sentence, and preformatted detail facts', async () => {
    const payload = await evaluateAuthorizedUserPolicy();
    for (const row of payload.rows) {
      expect(row.holder.length).toBeGreaterThan(0);
      expect(row.ruleTitle).toMatch(/^R[123] — /);
      expect(row.finding.length).toBeGreaterThan(0);
      expect(row.detail.length).toBeGreaterThan(0);
      for (const fact of row.detail) {
        expect(typeof fact.label).toBe('string');
        expect(fact.label.length).toBeGreaterThan(0);
        expect(typeof fact.value).toBe('string');
        expect(fact.value.length).toBeGreaterThan(0);
        // Nothing raw for the client to format — no bare ISO dates
        // (CLAUDE.md 5a/5b).
        expect(fact.value).not.toMatch(/^\d{4}-\d{2}-\d{2}(T|$)/);
      }
    }
  });

  it('drill-down detail names the authorized user, the account, and the rule citation', async () => {
    const payload = await evaluateAuthorizedUserPolicy();
    const labels = payload.rows[0].detail.map((f) => f.label);
    expect(labels).toContain('Authorized user');
    expect(labels).toContain('Account ID');
    expect(labels).toContain('AU added');
    expect(labels).toContain('Policy citation');
    const citation = payload.rows[0].detail.find((f) => f.label === 'Policy citation');
    expect(citation?.value).toContain('Authorized User Eligibility Policy');
  });

  it('is deterministic — two evaluations return byte-identical payloads', async () => {
    const first = await evaluateAuthorizedUserPolicy();
    const second = await evaluateAuthorizedUserPolicy();
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });
});

describe.each(ANCHORS)('card-activation evaluator @ anchor %s', (anchorIso) => {
  beforeEach(() => {
    process.env.DEMO_ANCHOR_DATE = anchorIso;
  });
  afterEach(() => {
    delete process.env.DEMO_ANCHOR_DATE;
  });

  it('reports the golden CA figures — 214 cards scanned, 41 exceptions across 41 accounts', async () => {
    const payload = await evaluateCardActivationPolicy();
    expect(payload.policyId).toBe('card-activation');
    expect(payload.summary).toEqual({
      scanned: 214,
      accountsAffected: 41,
      exceptions: 41,
    });
    expect(payload.rows).toHaveLength(41);
    // One card per account and no card reported twice, so the exception count
    // and the account count are the same number here — unlike the AU policy.
    expect(new Set(payload.rows.map((row) => row.accountId)).size).toBe(41);
  });

  it('splits 12/29 by rule, in CA-R1/CA-R2 order', async () => {
    const payload = await evaluateCardActivationPolicy();
    expect(payload.byRule.map((r) => r.ruleId)).toEqual(['CA-R1', 'CA-R2']);
    expect(payload.byRule.map((r) => r.count)).toEqual([12, 29]);
    expect(payload.byRule.map((r) => r.title)).toEqual(
      cardActivationPolicyRules.map((rule) => rule.title),
    );
    for (const rule of payload.byRule) {
      expect(payload.rows.filter((row) => row.ruleId === rule.ruleId)).toHaveLength(rule.count);
    }
  });

  it('carries the domain evaluator\'s own exceptions through unchanged', async () => {
    // The adapter shape the payload is built from, re-scanned independently:
    // the ViolationsPayload adapter must not edit a finding or invent a row.
    const direct = scanCardActivations(await getCardActivationScan());
    const payload = await evaluateCardActivationPolicy();

    expect(payload.summary.scanned).toBe(direct.cardsScanned);
    expect(payload.rows.map((row) => `${row.accountId}·${row.ruleId}·${row.finding}`)).toEqual(
      direct.exceptions.map((e) => `${e.accountId}·${e.ruleId}·${e.finding}`),
    );
  });

  it('every row carries a holder, a finding sentence, and preformatted detail facts', async () => {
    const payload = await evaluateCardActivationPolicy();
    for (const row of payload.rows) {
      expect(row.holder.length).toBeGreaterThan(0);
      expect(row.ruleTitle).toMatch(/^CA-R[12] — /);
      expect(row.finding.length).toBeGreaterThan(0);
      for (const fact of row.detail) {
        expect(fact.label.length).toBeGreaterThan(0);
        expect(fact.value.length).toBeGreaterThan(0);
        // Nothing raw for the client to format (CLAUDE.md 5a/5b).
        expect(fact.value).not.toMatch(/^\d{4}-\d{2}-\d{2}(T|$)/);
      }
    }
  });

  it('drill-down detail names the card, both dates, the rule and its citation', async () => {
    const payload = await evaluateCardActivationPolicy();
    const labels = payload.rows[0].detail.map((f) => f.label);
    expect(labels).toEqual([
      'Card',
      'Primary cardholder',
      'Account ID',
      'Card issued',
      'Card activated',
      'Rule',
      'Requirement',
      'Policy citation',
    ]);

    const citation = payload.rows[0].detail.find((f) => f.label === 'Policy citation');
    expect(citation?.value).toContain('Card Activation Servicing Policy');

    // An unactivated card's "Card activated" fact is an em dash, never blank
    // and never a fabricated date.
    const unactivated = payload.rows.find((row) => row.ruleId === 'CA-R2');
    expect(unactivated?.detail.find((f) => f.label === 'Card activated')?.value).toBe('—');
    // …and an activated one carries a formatted date.
    const activated = payload.rows.find((row) => row.ruleId === 'CA-R1');
    expect(activated?.detail.find((f) => f.label === 'Card activated')?.value).toMatch(
      /^[A-Z][a-z]{2} \d{1,2}, \d{4}$/,
    );
  });

  it('quotes each rule\'s requirement verbatim from the policy fixture', async () => {
    const payload = await evaluateCardActivationPolicy();
    const requirementByRuleId = new Map<string, string>(
      cardActivationPolicyRules.map((rule) => [rule.ruleId, rule.plainEnglish]),
    );
    for (const row of payload.rows) {
      expect(row.detail.find((f) => f.label === 'Requirement')?.value).toBe(
        requirementByRuleId.get(row.ruleId),
      );
    }
  });

  it('is deterministic — two evaluations return byte-identical payloads', async () => {
    const first = await evaluateCardActivationPolicy();
    const second = await evaluateCardActivationPolicy();
    expect(JSON.stringify(second)).toBe(JSON.stringify(first));
  });
});

describe('evaluator registry', () => {
  it('registers authorized-user at module load', () => {
    expect(listRegisteredPolicies()).toContain('authorized-user');
    expect(getEvaluator('authorized-user')).toBe(evaluateAuthorizedUserPolicy);
  });

  it('registers card-activation at module load', () => {
    expect(listRegisteredPolicies()).toContain('card-activation');
    expect(getEvaluator('card-activation')).toBe(evaluateCardActivationPolicy);
  });

  it('registerEvaluator adds a policy without this module knowing about it', () => {
    const previous = getEvaluator('card-activation');
    const stub: PolicyEvaluator = async () => ({
      policyId: 'card-activation',
      summary: { scanned: 0, accountsAffected: 0, exceptions: 0 },
      byRule: [],
      rows: [],
    });
    try {
      registerEvaluator('card-activation', stub);
      expect(getEvaluator('card-activation')).toBe(stub);
      expect(listRegisteredPolicies()).toContain('card-activation');
    } finally {
      if (previous) registerEvaluator('card-activation', previous);
      else globalThis.__cardinalPolicyEvaluators?.delete('card-activation');
    }
  });
});
