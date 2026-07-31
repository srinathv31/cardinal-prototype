// Checked-in SAMPLE payloads for the two exec-surface renderers —
// `ViolationsDashboard` and `ReportCard` (DEMO_BUILD_PLAN.md "UI components",
// Wave 1 agent D). Read the next paragraph before using this module for
// anything but rendering.
//
// WHAT THIS IS: a hand-authored `ViolationsDashboardProps` value that lets the
// dashboard be built, tested, and reviewed with zero server dependency (the
// plan's own words: "Builds against the ViolationsPayload contract with a
// checked-in sample fixture; no server dependency"). It is a RENDERER FIXTURE.
//
// WHAT THIS IS NOT: a data source. `GET /api/violations` derives the real
// payload from `getAuScanPortfolio()` + `evaluateAuPolicy()` — the same
// deterministic path `lib/sentinel/exception-fixture.ts` already takes, and for
// the reason that file's header spells out at length: a hand-typed row set is a
// SECOND source of truth that can silently drift from the generator and the
// evaluator. Nothing that ships a number to a demo screen may read from here.
// When Wave 2 wires the live endpoint, this file keeps exactly one job: feeding
// the component tests and any storybook-style review of the components.
//
// The summary/by-rule figures below are nonetheless the REAL AU figures —
// 962 relationships scanned, 74 accounts affected, 87 exceptions split
// 61 (R1) / 19 (R2) / 7 (R3), matching `exception-fixture.test.ts`'s pinned
// assertions — so a reviewer looking at the component in isolation is looking
// at the same arithmetic the live payload will carry, not at lorem ipsum. The
// ten `rows` are representative, not a slice of the generator's actual output:
// their holders, account ids, and dates are invented in the generator's own
// vocabulary (`lib/soe/seed/au-portfolio.ts`'s name pools and `au-acct-NNNN`
// id format, `au-exceptions.ts`'s finding structure) so the fixture reads
// native without pretending to be derived.
//
// Every value is a PREFORMATTED display string, per the ViolationsPayload
// contract — currency with its symbol and cents, dates as "Mar 4, 2026", never
// an ISO string or a raw number. The renderers do no formatting (CLAUDE.md
// invariant 5b); this file is where that formatting would already have
// happened server-side.

import type { ReportCardProps, ViolationsDashboardProps } from './registry';

/**
 * The AU-policy scan payload, at the figures `exception-fixture.test.ts` pins.
 * Ten representative rows — seven R1, two R2, one R3 — roughly in the 61/19/7
 * proportion of the full 87, so the table's rule mix looks like the bar
 * breakdown above it rather than contradicting it.
 */
export const auViolationsDashboardFixture: ViolationsDashboardProps = {
  policyId: 'authorized-user',
  summary: {
    scanned: 962,
    accountsAffected: 74,
    exceptions: 87,
  },
  byRule: [
    {
      ruleId: 'R1',
      title: 'Product eligibility — no authorized users on secured cards',
      count: 61,
    },
    {
      ruleId: 'R2',
      title: 'Account standing at the date of addition',
      count: 19,
    },
    {
      ruleId: 'R3',
      title: 'Authorized user minimum age',
      count: 7,
    },
  ],
  rows: [
    {
      accountId: 'au-acct-0043',
      holder: 'Maria Nguyen',
      ruleId: 'R1',
      ruleTitle: 'Product eligibility — no authorized users on secured cards',
      finding:
        'Grace Lee holds authorized-user spending authority on a secured card account whose credit line is collateralized by a customer security deposit, which product eligibility does not permit.',
      detail: [
        { label: 'Authorized user', value: 'Grace Lee' },
        { label: 'Product', value: 'Secured consumer card' },
        { label: 'Security deposit held', value: '$500.00' },
        { label: 'Credit line', value: '$500.00' },
        { label: 'Relationship added', value: 'Mar 4, 2026' },
        { label: 'Account status', value: 'Open · current' },
      ],
    },
    {
      accountId: 'au-acct-0088',
      holder: 'David Garcia',
      ruleId: 'R1',
      ruleTitle: 'Product eligibility — no authorized users on secured cards',
      finding:
        'Samuel Kim holds authorized-user spending authority on a secured card account whose credit line is collateralized by a customer security deposit, which product eligibility does not permit.',
      detail: [
        { label: 'Authorized user', value: 'Samuel Kim' },
        { label: 'Product', value: 'Secured consumer card' },
        { label: 'Security deposit held', value: '$1,000.00' },
        { label: 'Credit line', value: '$1,000.00' },
        { label: 'Relationship added', value: 'Nov 18, 2025' },
        { label: 'Account status', value: 'Open · current' },
      ],
    },
    {
      accountId: 'au-acct-0117',
      holder: 'Priya Patel',
      ruleId: 'R1',
      ruleTitle: 'Product eligibility — no authorized users on secured cards',
      finding:
        'Linda Wilson holds authorized-user spending authority on a secured card account whose credit line is collateralized by a customer security deposit, which product eligibility does not permit.',
      detail: [
        { label: 'Authorized user', value: 'Linda Wilson' },
        { label: 'Product', value: 'Secured consumer card' },
        { label: 'Security deposit held', value: '$300.00' },
        { label: 'Credit line', value: '$300.00' },
        { label: 'Relationship added', value: 'Jul 2, 2025' },
        { label: 'Account status', value: 'Open · current' },
      ],
    },
    {
      accountId: 'au-acct-0206',
      holder: 'Carlos Martinez',
      ruleId: 'R1',
      ruleTitle: 'Product eligibility — no authorized users on secured cards',
      finding:
        'Aisha Johnson holds authorized-user spending authority on a secured card account converted to a secured product after the relationship was established, which product eligibility does not permit on a continuing basis.',
      detail: [
        { label: 'Authorized user', value: 'Aisha Johnson' },
        { label: 'Product', value: 'Secured consumer card' },
        { label: 'Security deposit held', value: '$2,500.00' },
        { label: 'Converted to secured', value: 'Jan 23, 2026' },
        { label: 'Relationship added', value: 'Aug 6, 2024' },
        { label: 'Account status', value: 'Open · current' },
      ],
    },
    {
      accountId: 'au-acct-0311',
      holder: 'Susan Brown',
      ruleId: 'R1',
      ruleTitle: 'Product eligibility — no authorized users on secured cards',
      finding:
        'Ethan Moore holds authorized-user spending authority on a secured card account whose credit line is collateralized by a customer security deposit, which product eligibility does not permit.',
      detail: [
        { label: 'Authorized user', value: 'Ethan Moore' },
        { label: 'Product', value: 'Secured consumer card' },
        { label: 'Security deposit held', value: '$750.00' },
        { label: 'Credit line', value: '$750.00' },
        { label: 'Relationship added', value: 'Sep 9, 2025' },
        { label: 'Account status', value: 'Open · current' },
      ],
    },
    {
      accountId: 'au-acct-0454',
      holder: 'Robert Davis',
      ruleId: 'R1',
      ruleTitle: 'Product eligibility — no authorized users on secured cards',
      finding:
        'Fatima Perez holds authorized-user spending authority on a secured card account whose credit line is collateralized by a customer security deposit, which product eligibility does not permit.',
      detail: [
        { label: 'Authorized user', value: 'Fatima Perez' },
        { label: 'Product', value: 'Secured consumer card' },
        { label: 'Security deposit held', value: '$200.00' },
        { label: 'Credit line', value: '$200.00' },
        { label: 'Relationship added', value: 'Apr 30, 2026' },
        { label: 'Account status', value: 'Open · current' },
      ],
    },
    {
      accountId: 'au-acct-0529',
      holder: 'Elena Rodriguez',
      ruleId: 'R1',
      ruleTitle: 'Product eligibility — no authorized users on secured cards',
      finding:
        'James Clark holds authorized-user spending authority on a secured card account whose credit line is collateralized by a customer security deposit, which product eligibility does not permit.',
      detail: [
        { label: 'Authorized user', value: 'James Clark' },
        { label: 'Product', value: 'Secured consumer card' },
        { label: 'Security deposit held', value: '$1,500.00' },
        { label: 'Credit line', value: '$1,500.00' },
        { label: 'Relationship added', value: 'Feb 11, 2026' },
        { label: 'Account status', value: 'Open · current' },
      ],
    },
    {
      accountId: 'au-acct-0632',
      holder: 'Michael Taylor',
      ruleId: 'R2',
      ruleTitle: 'Account standing at the date of addition',
      finding:
        'Karen Lewis was added as an authorized user 23 days after a missed payment, so the account was not in good standing on the date of addition.',
      detail: [
        { label: 'Authorized user', value: 'Karen Lewis' },
        { label: 'Payment missed', value: 'Dec 14, 2025' },
        { label: 'Amount past due', value: '$185.00' },
        { label: 'Relationship added', value: 'Jan 6, 2026' },
        { label: 'Gap to addition', value: '23 days' },
        { label: 'Standing at addition', value: 'Not in good standing' },
      ],
    },
    {
      accountId: 'au-acct-0745',
      holder: 'Nancy Thomas',
      ruleId: 'R2',
      ruleTitle: 'Account standing at the date of addition',
      finding:
        'Daniel White was added as an authorized user 12 days after a missed payment, so the account was not in good standing on the date of addition.',
      detail: [
        { label: 'Authorized user', value: 'Daniel White' },
        { label: 'Payment missed', value: 'May 21, 2025' },
        { label: 'Amount past due', value: '$240.00' },
        { label: 'Relationship added', value: 'Jun 2, 2025' },
        { label: 'Gap to addition', value: '12 days' },
        { label: 'Standing at addition', value: 'Not in good standing' },
      ],
    },
    {
      accountId: 'au-acct-0860',
      holder: 'Sofia Jackson',
      ruleId: 'R3',
      ruleTitle: 'Authorized user minimum age',
      finding:
        'Noah Jackson was 14 years old on the date the authorized-user relationship was established, below the minimum age of 16 the policy requires at addition.',
      detail: [
        { label: 'Authorized user', value: 'Noah Jackson' },
        { label: 'Date of birth', value: 'Aug 22, 2011' },
        { label: 'Age at addition', value: '14 years' },
        { label: 'Minimum age required', value: '16 years' },
        { label: 'Relationship added', value: 'May 9, 2026' },
      ],
    },
  ],
};

/**
 * The audit-report card that follows the batch-removal approval (DEMO_THESIS.md
 * use case 1, beat 8). `href` points at the route Wave 2 agent F builds; the
 * component is a pure download affordance and never fetches it, so this value
 * is inert until that route exists.
 */
export const auReportCardFixture: ReportCardProps = {
  filename: 'authorized-user-policy-audit-2026-08-04.html',
  generatedAt: 'Aug 4, 2026 at 9:42 AM ET',
  summary:
    'All 87 authorized-user exceptions across 74 accounts, the rule each one breaks, and the batch removal approved by Elena Rodriguez.',
  href: '/api/report?policy=authorized-user',
};
