// Sentinel policy content (CARDINAL_V3_AU_BRIEF.md §5a/§5b) — the seeded
// "document" Act II drops in, and the three rules agents extract from it. All
// content invented; no real regulation is named (brief §10). Framing is
// servicing-compliance only — no fraud/AML language, no credit-decisioning
// language, never "declined"/"creditworthiness"/"score" (asserted in
// policy.test.ts).
//
// v3 replaces v2's balance-transfer servicing policy wholesale
// (docs/v3-migration-map.md §5). Same three exported shapes, new content: an
// authorized-user eligibility policy whose obligations span three different
// SOE datasets, which is what makes the Act III sweep a real cross-dataset
// scan rather than a filter over one table.
//
// Every excerpt `quote` is a VERBATIM substring of the body of the section it
// cites (asserted in policy.test.ts) — the Rule Diff view renders these as
// real citations, not paraphrases. §Definitions carries its weight: R1 is
// phrased against "secured card" and R2 against "good standing," so both terms
// are defined in the document itself rather than assumed. An excerpt that
// cites a term the document never defines is exactly the kind of thing a bank
// reviewer catches.
//
// The fourth obligation (§Consent and Authorization) is `policyObligationGap`,
// deliberately typed as its OWN interface rather than a fourth `PolicyRule`:
// it never becomes a rule (no `machine` footer — nothing a Rule Engineer
// drafted), so folding it into `PolicyRule` would force every consumer to
// guard against fields that don't apply to it. The Critic's job in Act II is
// to find this gap and say so out loud — an agent that knows the limits of its
// own data is the credibility beat (brief §3 Act II beat 6), not a fourth rule
// quietly failing validation.

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
  id: 'AU-Eligibility-Policy-2026',
  title: 'Authorized User Eligibility Policy',
  sections: [
    {
      id: 'purpose',
      heading: 'Purpose and Scope',
      body: 'This policy governs the addition, maintenance, and removal of authorized users on consumer credit card accounts. It establishes baseline servicing controls for product eligibility, account standing at the time of addition, authorized-user qualification, and cardholder consent. It applies to every consumer credit card account on the book, including accounts serviced under legacy product codes. It supersedes no external regulation and creates no new legal obligation; it documents internal servicing standards only.',
    },
    {
      id: 'definitions',
      heading: 'Definitions',
      body: 'An "authorized user" means a party granted spending authority on an account they do not own and for which they carry no repayment liability. A "secured card" means a card whose credit line is collateralized by a customer security deposit held by the bank. An account is in "good standing" when it carries no missed payment within the trailing 60 days and its status is open. A "missed payment" means a scheduled payment whose status resolves to MISSED because no amount posted by its due date. The "date of addition" means the date the authorized-user relationship was established on the account, which is the date every point-in-time test in this policy is evaluated against.',
    },
    {
      id: 'product-eligibility',
      heading: 'Product Eligibility',
      body: 'Authorized users are supported on unsecured consumer credit card products only. An authorized user may not be added to, or maintained on, a secured card account. This restriction is continuous rather than point-in-time: a relationship that was permissible when the account was opened becomes an exception if the account is later converted to a secured product. Where an authorized user is found on a secured card account, the relationship must be removed and the primary cardholder notified.',
    },
    {
      id: 'account-standing',
      heading: 'Account Standing',
      body: 'Account standing is assessed at the moment an authorized user is added, not on a rolling basis thereafter. An authorized user may not be added to an account that is not in good standing at the time of addition. A relationship added while the account was not in good standing remains an exception until it is removed, regardless of the account\'s standing today. Servicing must retain the payment history supporting the standing assessment for the life of the relationship.',
    },
    {
      id: 'qualification',
      heading: 'Authorized User Qualification',
      body: 'An authorized user must be at least 16 years of age at the time of addition. Age is assessed against the date of birth held for the party on the date the relationship was added, and is not reassessed afterwards. No exception to the minimum age applies for household, family, or estate relationships.',
    },
    {
      id: 'consent',
      heading: 'Consent and Authorization',
      body: 'Spending authority may be granted only with the account owner\'s documented consent. The primary cardholder\'s written authorization must be on file for the life of each authorized-user relationship. The authorization must name the authorized user, be dated, and be retained until the relationship is closed. An authorization that cannot be produced on request is treated as absent.',
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

/**
 * The three rules Act II extracts. Their `datasetsTouched` are the reason Act
 * III's Data Collector fires three times, visibly (brief §3 Act III beat 2) —
 * the three rules genuinely span three datasets, so the three calls are the
 * script following the rule set, not theater bolted onto it.
 *
 * `evaluationTrigger` records WHEN each rule is evaluated, which is the whole
 * difference between R1 and R2/R3: R1 is a statement about the account's
 * current state (an AU on a secured card today is an exception today), while
 * R2 and R3 are point-in-time tests re-read against `addedDate` (brief §5b).
 * "nightly sweep" is a label for the cadence the rule store advertises, not a
 * scheduler — nothing in this build schedules anything (brief §6d).
 */
export const policyRules: PolicyRule[] = [
  {
    ruleId: 'R1',
    title: 'R1 — Product Eligibility',
    plainEnglish:
      'An authorized user may not be added to, or maintained on, a secured card account.',
    excerpt: {
      sectionId: 'product-eligibility',
      quote:
        'An authorized user may not be added to, or maintained on, a secured card account.',
    },
    machine: {
      ruleId: 'R1',
      datasetsTouched: ['accounts', 'account-party-roles'],
      evaluationTrigger: 'nightly sweep · current state',
    },
    criticNote:
      'Evaluable with current SOE data: accounts carry the secured-card flag, roles carry the relationship.',
  },
  {
    ruleId: 'R2',
    title: 'R2 — Account Standing',
    plainEnglish:
      'An authorized user may not be added to an account that is not in good standing at the time of addition.',
    excerpt: {
      sectionId: 'account-standing',
      quote:
        'An authorized user may not be added to an account that is not in good standing at the time of addition.',
    },
    machine: {
      ruleId: 'R2',
      datasetsTouched: ['accounts', 'payments', 'account-party-roles'],
      evaluationTrigger: 'nightly sweep · at date of addition',
    },
    criticNote:
      'Evaluable with current SOE data: payment history covers the 60-day look-back before every addition on file.',
  },
  {
    ruleId: 'R3',
    title: 'R3 — Authorized User Qualification',
    plainEnglish:
      'An authorized user must be at least 16 years of age at the time of addition.',
    excerpt: {
      sectionId: 'qualification',
      quote:
        'An authorized user must be at least 16 years of age at the time of addition.',
    },
    machine: {
      ruleId: 'R3',
      datasetsTouched: ['parties', 'account-party-roles'],
      evaluationTrigger: 'nightly sweep · at date of addition',
    },
    criticNote:
      'Evaluable with current SOE data: parties carry date of birth, roles carry the date of addition.',
  },
];

/**
 * The fourth obligation the Policy Analyst extracts from §Consent and
 * Authorization — and the one the Critic parks as a data gap instead of
 * validating (header comment; brief §5b). Deliberately NOT a `PolicyRule`: it
 * has no `machine` footer because no Rule Engineer ever drafted it into a
 * machine-readable rule, and its `criticNote` is the reason the obligation is
 * PARKED, not a note on an active rule. `requiredData` names the dataset
 * Sentinel would need onboarded to close the gap — `lib/soe` has no
 * consent-document collection today and none is being added, so the gap is
 * real, not staged.
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
     * policy.test.ts, mirroring the `policyRules` excerpt assertions). */
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
  title: 'Consent on File for Every Authorized-User Relationship',
  plainEnglish:
    "The primary cardholder's written authorization must be on file for as long as the authorized-user relationship exists.",
  excerpt: {
    sectionId: 'consent',
    quote:
      "The primary cardholder's written authorization must be on file for the life of each authorized-user relationship.",
  },
  criticNote:
    'Not evaluable with current SOE data — requires consent-document records; dataset not onboarded.',
  requiredData: ['consent-documents'],
};
