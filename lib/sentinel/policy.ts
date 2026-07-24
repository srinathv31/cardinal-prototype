// Sentinel policy content (CARDINAL_V2_SENTINEL_BRIEF.md §5, §9) — the
// seeded "document" Act II drops in, and the three rules Agents extract from
// it. All content invented; no real regulation is named (brief §9). Framing
// is servicing-compliance only — no fraud/AML/credit-decisioning language.
//
// Every rule's `excerpt.quote` is a verbatim substring of the body of the
// section it cites (asserted in lib/soe/seed/sentinel.test.ts) — the Rule
// Diff view (Act II) renders these as real citations, not paraphrases. R2 is
// phrased against the "balance-transfer credit line" term defined in
// §definitions, which is what makes R2 internally consistent with Marcus's
// fixture (v2-reuse-map.md §6): a balance-transfer credit line is a figure
// the BT platform tracks separately from purchase open-to-buy.

export interface PolicySection {
  id: string;
  heading: string;
  body: string;
}

export interface PolicyDocument {
  id: string;
  title: string;
  sections: PolicySection[];
}

export const policyDocument: PolicyDocument = {
  id: 'BT-Servicing-Policy-2026',
  title: 'Balance Transfer Servicing Policy',
  sections: [
    {
      id: 'purpose',
      heading: 'Purpose and Scope',
      body: 'This policy governs the servicing of balance transfer offers, obligations, and disclosures across all consumer credit card accounts. It establishes baseline controls for transfer eligibility, transfer sizing, and promotional-rate notice timing. It supersedes no external regulation and creates no new legal obligation; it documents internal servicing standards only.',
    },
    {
      id: 'definitions',
      heading: 'Definitions',
      body: 'A "balance-transfer credit line" means the dedicated credit allocation an account holds for balance-transfer principal, established and tracked separately from the account\'s purchase open-to-buy. A balance transfer draws against the balance-transfer credit line, never against purchase open-to-buy, even where both lines are attached to the same account. A "missed payment" means a scheduled payment whose status resolves to MISSED because no amount posted by its due date. A "promotional APR" means a temporary annual percentage rate offered on a balance transfer for a fixed promotional term, after which the transfer reverts to the account\'s go-to APR.',
    },
    {
      id: 'eligibility',
      heading: 'New Transfer Eligibility',
      body: 'Before initiating a new balance transfer, servicing must confirm the account is in good standing. No new balance transfer may be initiated within 60 days of a missed payment on the account. This look-back applies regardless of whether the missed payment has since been cured, and regardless of the requested transfer amount.',
    },
    {
      id: 'limits',
      heading: 'Transfer Sizing Limits',
      body: "Transfer principal is sized against the account's dedicated balance-transfer allocation, not its purchase open-to-buy. Balance transfer principal may not exceed 90% of the account's balance-transfer credit line at initiation. Requests exceeding this threshold must be declined or resized before the transfer is initiated.",
    },
    {
      id: 'notices',
      heading: 'Promotional Rate Disclosures',
      body: 'Promotional APR terms are time-bound and must be disclosed to the customer with adequate lead time before expiration. Customers must be notified at least 45 days before a promotional APR expires. Notice must state the promotional end date and the go-to APR that will apply afterward, and must be sent through a recorded channel.',
    },
  ],
};

export interface PolicyRule {
  ruleId: 'R1' | 'R2' | 'R3';
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

export const policyRules: PolicyRule[] = [
  {
    ruleId: 'R1',
    title: 'R1 — New Transfer Eligibility Window',
    plainEnglish:
      'No new balance transfer may be initiated within 60 days of a missed payment on the account.',
    excerpt: {
      sectionId: 'eligibility',
      quote:
        'No new balance transfer may be initiated within 60 days of a missed payment on the account.',
    },
    machine: {
      ruleId: 'R1',
      datasetsTouched: ['payments', 'balance-transfer-events'],
      evaluationTrigger: 'balance_transfer.initiated',
    },
    criticNote: 'Evaluable with current SOE data: payments + balance-transfer events.',
  },
  {
    ruleId: 'R2',
    title: 'R2 — Transfer Sizing Limit',
    plainEnglish:
      "Balance transfer principal may not exceed 90% of the account's balance-transfer credit line at initiation.",
    excerpt: {
      sectionId: 'limits',
      quote:
        "Balance transfer principal may not exceed 90% of the account's balance-transfer credit line at initiation.",
    },
    machine: {
      ruleId: 'R2',
      datasetsTouched: ['balance-transfer-events'],
      evaluationTrigger: 'balance_transfer.initiated',
    },
  },
  {
    ruleId: 'R3',
    title: 'R3 — Promotional Rate Notice',
    plainEnglish:
      'Customers must be notified at least 45 days before a promotional APR expires.',
    excerpt: {
      sectionId: 'notices',
      quote:
        'Customers must be notified at least 45 days before a promotional APR expires.',
    },
    machine: {
      ruleId: 'R3',
      datasetsTouched: ['promo-notices', 'balance-transfer-events'],
      evaluationTrigger: 'bt.promo_expiring',
    },
  },
];
