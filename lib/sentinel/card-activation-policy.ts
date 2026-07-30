// Card-activation servicing policy content (DEMO_THESIS.md Use case 3;
// DEMO_BUILD_PLAN.md "Card-activation domain") — the checked-in "document"
// the ops chat's parse → propose-rules beat (DEMO_THESIS.md Use case 1 step
// 2, the same flow use case 3 reuses on the ops side) recognizes and
// extracts CA-R1/CA-R2 from. Same shape and idiom as
// lib/sentinel/policy.ts's AU-eligibility fixture: a small `PolicyDocument`
// of cited sections, and rule entries whose `excerpt.quote` is a verbatim
// substring of the section it cites, plus a machine-readable footer
// (`machine`) the same Rule Diff pattern renders.
//
// All content invented; no real regulation is named — same convention
// policy.ts documents for the AU fixture. Framing is servicing-compliance
// only: no fraud/AML language, no credit-decisioning language (the word
// "declined" is deliberately avoided below — "blocked" instead, which also
// matches app/api/cards/activate/route.ts's own response vocabulary).
//
// Pure fixture, not seed data: no anchor, no lib/soe import (CLAUDE.md:
// "Checked-in fixtures that are not seed data ... are imported directly;
// the rule governs account data").

export interface CaPolicySection {
  id: string;
  heading: string;
  body: string;
}

export interface CaPolicyDocument {
  id: string;
  title: string;
  sections: CaPolicySection[];
}

export const cardActivationPolicyDocument: CaPolicyDocument = {
  id: 'Card-Activation-Policy-2026',
  title: 'Card Activation Servicing Policy',
  sections: [
    {
      id: 'purpose',
      heading: 'Purpose and Scope',
      body: 'This policy governs the activation of newly issued consumer credit cards. It establishes baseline servicing controls for the standing of the account at the moment of activation and for the timing of activation relative to issuance. It applies to every card issued on a consumer credit card account, including replacement and reissued cards. It supersedes no external regulation and creates no new legal obligation; it documents internal servicing standards only.',
    },
    {
      id: 'definitions',
      heading: 'Definitions',
      body: 'A card is "issued" on the date it is produced and delivered to the cardholder. A card is "activated" on the date the cardholder completes the activation request through any servicing channel. An account is "past-due" when its most recently due scheduled payment has not been paid by its due date. The "activation window" means the period beginning on the issued date during which activation is expected to occur.',
    },
    {
      id: 'past-due-activation',
      heading: 'Activation While Past-Due',
      body: 'A card may not be activated while the account is past-due. Where an activation request is received on an account that is past-due, the activation must be blocked and the primary cardholder directed to bring the account current before reattempting activation.',
    },
    {
      id: 'activation-window',
      heading: 'Activation Window',
      body: 'Cards must be activated within 45 days of issuance. A card that remains unactivated more than 45 days after issuance is an exception and must be flagged for cardholder outreach. This restriction is assessed against the elapsed time between the issued date and, once activation occurs, the activated date.',
    },
  ],
};

export interface CaPolicyRule {
  ruleId: 'CA-R1' | 'CA-R2';
  title: string;
  plainEnglish: string;
  excerpt: {
    sectionId: string;
    /** Verbatim substring of the cited section's body. */
    quote: string;
  };
  machine: {
    ruleId: string;
    datasetsTouched: string[];
    evaluationTrigger: string;
  };
  criticNote?: string;
}

/**
 * The two rules the ops chat's parse → propose-rules beat extracts
 * (DEMO_THESIS.md Use case 3, ops side). Evaluated by
 * lib/sentinel/ca-exceptions.ts, which re-derives every exception from
 * lib/soe/adapter.ts's getCardActivationScan() rather than trusting
 * anything stated here — this document exists to be cited, not computed
 * from.
 */
export const cardActivationPolicyRules: CaPolicyRule[] = [
  {
    ruleId: 'CA-R1',
    title: 'CA-R1 — Activation While Past-Due',
    plainEnglish: 'A card may not be activated while the account is past-due.',
    excerpt: {
      sectionId: 'past-due-activation',
      quote: 'A card may not be activated while the account is past-due.',
    },
    machine: {
      ruleId: 'CA-R1',
      datasetsTouched: ['card-activations', 'payments'],
      evaluationTrigger: 'at activation attempt · payment-derived past-due state',
    },
    criticNote:
      'Evaluable with current SOE data: payment history resolves the account’s past-due state as of any activation date.',
  },
  {
    ruleId: 'CA-R2',
    title: 'CA-R2 — 45-Day Activation Window',
    plainEnglish: 'Cards must be activated within 45 days of issuance.',
    excerpt: {
      sectionId: 'activation-window',
      quote: 'Cards must be activated within 45 days of issuance.',
    },
    machine: {
      ruleId: 'CA-R2',
      datasetsTouched: ['card-activations'],
      evaluationTrigger: 'nightly sweep · issuedDate/activatedDate elapsed window',
    },
    criticNote:
      'Evaluable with current SOE data: every card carries its own issuedDate and, once activated, its activatedDate.',
  },
];
