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
//
// Addendum v2.1 (post-P4, CARDINAL_V2_SENTINEL_BRIEF.md's closing addendum):
// the document carries a SIXTH section, §Affordability Review, whose
// obligation — income verification on transfers over $5,000 — Sentinel
// genuinely cannot evaluate against SOE's current datasets. That obligation
// is `policyObligationGap` below, deliberately typed as its OWN interface
// rather than a fourth `PolicyRule`: it never becomes a rule (no `machine`
// footer — nothing a Rule Engineer drafted), so folding it into `PolicyRule`
// would force every consumer to guard against fields that don't apply to it.
// The Critic's job in Act II is to find this gap and say so out loud — an
// agent that knows the limits of its own data is the credibility beat the
// addendum is for, not a fourth rule quietly failing validation.

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
      id: 'affordability',
      heading: 'Affordability Review',
      body: 'Balance transfers must be affordable on the customer\'s current income, not only within credit limits. For any transfer request exceeding $5,000, servicing must verify that the customer\'s stated annual income on file is no more than 12 months old before initiation. Where current income cannot be verified, the request must be referred for manual affordability review before any transfer is initiated.',
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

/**
 * The fourth obligation the Policy Analyst extracts from §Affordability
 * Review — and the one the Critic parks as a data gap instead of validating
 * (Addendum v2.1, header comment). Deliberately NOT a `PolicyRule`: it has no
 * `machine` footer because no Rule Engineer ever drafted it into a
 * machine-readable rule, and no `criticNote` in the "evaluable" sense R1
 * carries — `criticNote` here is the Critic's reason the obligation is
 * PARKED, not a note on an active rule. `requiredData` names the dataset
 * Sentinel would need to onboard to close the gap (`lib/sentinel/policy.ts`
 * has no `income-verification` collection today, and neither does
 * `lib/soe` — the gap is real, not staged).
 */
export interface PolicyObligationGap {
  obligationId: string;
  title: string;
  /** Model-authored plain-English restatement (editorial, brief §5a) —
   * mirrors `PolicyRule.plainEnglish`'s role. */
  plainEnglish: string;
  excerpt: {
    sectionId: string;
    /** Verbatim substring of the cited section's body (asserted in
     * lib/soe/seed/sentinel.test.ts, mirroring the `policyRules` excerpt
     * assertions). */
    quote: string;
  };
  /** Why the Critic parked this obligation instead of validating it — the
   * fourth Rule Diff row's headline fact (rule-diff.tsx). */
  criticNote: string;
  /** The dataset(s) Sentinel would need onboarded to close the gap. */
  requiredData: string[];
}

export const policyObligationGap: PolicyObligationGap = {
  obligationId: 'O4',
  title: 'Income Verification for Large Transfers',
  plainEnglish:
    "Transfers over $5,000 require the customer's stated income on file to be verified as no more than 12 months old before initiation.",
  excerpt: {
    sectionId: 'affordability',
    quote:
      "For any transfer request exceeding $5,000, servicing must verify that the customer's stated annual income on file is no more than 12 months old before initiation.",
  },
  criticNote:
    'Not evaluable with current SOE data — requires income-verification records; dataset not onboarded.',
  requiredData: ['income-verification'],
};
