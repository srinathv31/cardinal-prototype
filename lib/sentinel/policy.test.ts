// Policy-fixture enforcement (CARDINAL_V3_AU_BRIEF.md §5a: "every Rule Diff
// excerpt is a verbatim substring of the section it cites — assert this, as v2
// did"). Inherits the excerpt assertions that lived in the now-deleted
// lib/soe/seed/sentinel.test.ts (docs/v3-migration-map.md §5) and adds two
// guards v3 needs: the terms R1/R2 are phrased against must actually be
// defined in the document, and §10's banned language must never appear in it.
//
// Policy content is a checked-in fixture, not seed data — no anchor, no
// buildSeedDb, no lib/soe import. That is why this suite lives beside the
// fixture instead of under lib/soe/seed.

import { describe, expect, it } from 'vitest';
import { policyDocument, policyObligationGap, policyRules } from './policy';

const sectionBody = (id: string): string => {
  const section = policyDocument.sections.find((s) => s.id === id);
  if (!section) throw new Error(`policy document has no section "${id}"`);
  return section.body;
};

describe('AU eligibility policy document', () => {
  it('is the six sections brief §5a names, in order', () => {
    expect(policyDocument.id).toBe('AU-Eligibility-Policy-2026');
    expect(policyDocument.sections.map((s) => s.id)).toEqual([
      'purpose',
      'definitions',
      'product-eligibility',
      'account-standing',
      'qualification',
      'consent',
    ]);
    expect(policyDocument.sections.map((s) => s.heading)).toEqual([
      'Purpose and Scope',
      'Definitions',
      'Product Eligibility',
      'Account Standing',
      'Authorized User Qualification',
      'Consent and Authorization',
    ]);
  });

  // R1 is phrased against "secured card" and R2 against "good standing"
  // (brief §5a). A rule citing a term its own document never defines is the
  // first thing a bank reviewer catches.
  it('§Definitions defines the terms R1 and R2 are phrased against', () => {
    const definitions = sectionBody('definitions');
    expect(definitions).toContain(
      'A "secured card" means a card whose credit line is collateralized by a customer security deposit',
    );
    expect(definitions).toContain(
      'An account is in "good standing" when it carries no missed payment within the trailing 60 days and its status is open.',
    );
    expect(definitions).toContain('A "missed payment" means');
    expect(definitions).toContain('An "authorized user" means');
  });

  // Brief §10: no fraud/AML framing, no credit-decisioning language. This is
  // servicing policy compliance.
  it('carries no fraud/AML or credit-decisioning language', () => {
    const corpus = policyDocument.sections
      .map((s) => `${s.heading} ${s.body}`)
      .concat(
        policyRules.map(
          (r) => `${r.title} ${r.plainEnglish} ${r.criticNote ?? ''}`,
        ),
      )
      .concat(`${policyObligationGap.title} ${policyObligationGap.plainEnglish} ${policyObligationGap.criticNote}`)
      .join(' ')
      .toLowerCase();

    for (const banned of [
      'fraud',
      'money laundering',
      'aml',
      'creditworth',
      'credit score',
      'declined',
      'underwrit',
      'delinquen',
    ]) {
      expect(corpus).not.toContain(banned);
    }
  });
});

describe('extracted rules', () => {
  it('ruleIds are exactly R1, R2, R3 in order', () => {
    expect(policyRules.map((r) => r.ruleId)).toEqual(['R1', 'R2', 'R3']);
  });

  it("every rule's excerpt.quote is a verbatim substring of the cited section's body", () => {
    for (const rule of policyRules) {
      expect(sectionBody(rule.excerpt.sectionId)).toContain(rule.excerpt.quote);
    }
  });

  // The plain-English restatement is editorial (brief §5a), but for these
  // three rules the policy sentence already reads as plain English, so the
  // restatement IS the quote — and if that ever stops being true, the Rule
  // Diff's left and right halves must still both be traceable to the document.
  it('every plainEnglish restatement is itself grounded in the cited section', () => {
    for (const rule of policyRules) {
      expect(sectionBody(rule.excerpt.sectionId)).toContain(rule.plainEnglish);
    }
  });

  it('rules span three datasets, which is what makes the sweep cross-dataset', () => {
    const byId = Object.fromEntries(policyRules.map((r) => [r.ruleId, r]));
    expect(byId.R1.machine.datasetsTouched).toEqual(['accounts', 'account-party-roles']);
    expect(byId.R2.machine.datasetsTouched).toEqual([
      'accounts',
      'payments',
      'account-party-roles',
    ]);
    expect(byId.R3.machine.datasetsTouched).toEqual(['parties', 'account-party-roles']);

    // Three rules, three distinct primary datasets beyond the shared roles
    // table — the reason Act III's Data Collector fires three times (brief §3).
    const primary = new Set(
      policyRules.flatMap((r) =>
        r.machine.datasetsTouched.filter((d) => d !== 'account-party-roles'),
      ),
    );
    expect([...primary].sort()).toEqual(['accounts', 'parties', 'payments']);
  });

  it('R1 is current-state; R2 and R3 are evaluated at the date of addition', () => {
    const byId = Object.fromEntries(policyRules.map((r) => [r.ruleId, r]));
    expect(byId.R1.machine.evaluationTrigger).toContain('current state');
    expect(byId.R2.machine.evaluationTrigger).toContain('date of addition');
    expect(byId.R3.machine.evaluationTrigger).toContain('date of addition');
  });

  it('every rule carries the Critic evaluability note that lets it be activated', () => {
    for (const rule of policyRules) {
      expect(rule.criticNote).toBeTruthy();
    }
  });
});

describe('O4 — the parked obligation (brief §5b)', () => {
  it("the obligation gap's excerpt.quote is a verbatim substring of §Consent and Authorization", () => {
    expect(policyObligationGap.excerpt.sectionId).toBe('consent');
    expect(sectionBody('consent')).toContain(policyObligationGap.excerpt.quote);
  });

  it('names the dataset that would close it, and that dataset is genuinely absent', () => {
    expect(policyObligationGap.obligationId).toBe('O4');
    expect(policyObligationGap.requiredData).toEqual(['consent-documents']);
    expect(policyObligationGap.criticNote).toContain('Not evaluable');
    // The gap must not be reachable as a rule — activation stays "3 rules".
    expect(policyRules.map((r) => r.ruleId)).not.toContain(
      policyObligationGap.obligationId,
    );
  });
});
