// The policy-evaluator registry (DEMO_BUILD_PLAN.md §Contracts —
// "ViolationsPayload (one shape for both policies)"). One entry per PolicyId;
// `GET /api/violations` looks the evaluator up here and never knows which
// policy it is serving.
//
// Two rules govern everything below:
//
//   • CLAUDE.md 5a — "the model never generates a number, date, name, or
//     balance." Every string in a ViolationsPayload is computed HERE, on the
//     server, from lib/soe data: `finding` is the evaluator's own sentence,
//     and `detail` is a list of already-formatted {label, value} facts. The
//     dashboard renders them verbatim; the model only decides that a
//     violations query should happen at all.
//   • CLAUDE.md 5b — "zero business logic in components." `rows[].detail`
//     therefore carries everything the drill-down needs, so clicking a row is
//     pure client state: no second fetch, no client-side join, no formatting.
//
// Registration is open by design: `registerEvaluator` lets a work stream add
// an evaluator from any module, without editing this one. Both of the demo's
// policies happen to live here — one section each, sharing the holder-name
// and rule-metadata idiom rather than forking it — and importing this module
// once on the server registers both. The registry is globalThis-backed
// (lib/events/store.ts's HMR reasoning), so a dev-mode reload re-registers
// what this file owns without dropping anyone else's.

import { getAuPortfolio, getAuScanPortfolio, getCardActivationScan, getPartiesForAccount } from '@/lib/soe';
import { formatDate } from '@/lib/agents/format';
import { getAuExceptionFixture } from '@/lib/sentinel/exception-fixture';
import { policyDocument, policyRules } from '@/lib/sentinel/policy';
import {
  cardActivationPolicyDocument,
  cardActivationPolicyRules,
} from '@/lib/sentinel/card-activation-policy';
import { evaluateCardActivationPolicy as scanCardActivations } from '@/lib/sentinel/ca-exceptions';
import type { PolicyId, StoredRule } from './store';

/** One preformatted drill-down fact. Both fields are display-ready. */
export interface ViolationDetailFact {
  label: string;
  value: string;
}

export interface ViolationRow {
  accountId: string;
  /** The account's primary cardholder. */
  holder: string;
  ruleId: string;
  ruleTitle: string;
  /** Complete sentence, from the evaluator — never model-authored. */
  finding: string;
  /** Drill-down facts, preformatted server-side. */
  detail: ViolationDetailFact[];
}

export interface ViolationsRuleCount {
  ruleId: string;
  title: string;
  count: number;
}

export interface ViolationsPayload {
  policyId: PolicyId;
  summary: {
    scanned: number;
    accountsAffected: number;
    exceptions: number;
  };
  byRule: ViolationsRuleCount[];
  rows: ViolationRow[];
}

/**
 * An evaluator returns the payload for its ENTIRE policy — every rule it
 * knows how to evaluate. Narrowing to the rules a human actually approved is
 * the route's job (`GET /api/violations` filters on stored rule ids), which
 * keeps evaluators pure functions of the data rather than of the store's
 * current contents. `rules` is passed anyway for evaluators that need the
 * approved parameters; the authorized-user evaluator ignores it.
 */
export type PolicyEvaluator = (
  rules: readonly StoredRule[],
) => Promise<ViolationsPayload>;

declare global {
  // HMR-safe singleton — see module comment. `var` is required by
  // `declare global` ambient syntax.
  var __cardinalPolicyEvaluators: Map<PolicyId, PolicyEvaluator> | undefined;
}

function getRegistry(): Map<PolicyId, PolicyEvaluator> {
  return (globalThis.__cardinalPolicyEvaluators ??= new Map());
}

/** Registers (or replaces) the evaluator for one policy. Call at module
 *  scope; the registering module must be imported once on the server for the
 *  side effect to land. */
export function registerEvaluator(
  policyId: PolicyId,
  evaluator: PolicyEvaluator,
): void {
  getRegistry().set(policyId, evaluator);
}

export function getEvaluator(policyId: PolicyId): PolicyEvaluator | undefined {
  return getRegistry().get(policyId);
}

export function listRegisteredPolicies(): PolicyId[] {
  return [...getRegistry().keys()];
}

// ---------------------------------------------------------------------------
// authorized-user
// ---------------------------------------------------------------------------

/** Rule display metadata, read straight off the checked-in policy fixture
 *  (lib/sentinel/policy.ts) rather than restated here — the citation a row
 *  shows is the section the rule was actually extracted from. */
interface AuRuleMeta {
  title: string;
  requirement: string;
  citation: string;
}

function sectionHeading(sectionId: string): string {
  const section = policyDocument.sections.find((s) => s.id === sectionId);
  if (!section) {
    throw new Error(`AU evaluator: policy document has no section ${sectionId}`);
  }
  return section.heading;
}

const AU_RULE_META: Map<string, AuRuleMeta> = new Map(
  policyRules.map((rule) => [
    rule.ruleId,
    {
      title: rule.title,
      requirement: rule.plainEnglish,
      citation: `${policyDocument.title} · §${sectionHeading(rule.excerpt.sectionId)}`,
    },
  ]),
);

function auRuleMeta(ruleId: string): AuRuleMeta {
  const meta = AU_RULE_META.get(ruleId);
  if (!meta) {
    throw new Error(`AU evaluator: no policy rule on file for ${ruleId}`);
  }
  return meta;
}

/**
 * Primary cardholder name per account. The exception fixture keeps only the
 * household SURNAME (its `accountLabel`), and lib/sentinel is read-only from
 * here, so the PRIMARY-role join is repeated over the same
 * `getAuScanPortfolio()` snapshot the fixture itself derives from — same
 * data, same anchor, so the two can't disagree.
 */
async function primaryHolderByAccount(): Promise<Map<string, string>> {
  const scan = await getAuScanPortfolio();
  const nameByPartyId = new Map(scan.parties.map((p) => [p.partyId, p.fullName]));
  const holders = new Map<string, string>();
  for (const role of scan.roles) {
    if (role.role !== 'PRIMARY') continue;
    const name = nameByPartyId.get(role.partyId);
    if (name) holders.set(role.accountId, name);
  }
  return holders;
}

/**
 * The authorized-user evaluator. Adapts the checked-in AU exception fixture
 * (lib/sentinel/exception-fixture.ts — itself a live re-derivation of
 * `getAuScanPortfolio()` + `evaluateAuPolicy()`) into the ViolationsPayload
 * shape. No figure here is a literal: 962 scanned / 87 exceptions / 74
 * accounts / 61·19·7 by rule all fall out of the data, which is what the
 * golden route test pins.
 */
export async function evaluateAuthorizedUserPolicy(): Promise<ViolationsPayload> {
  const fixture = await getAuExceptionFixture();
  const holders = await primaryHolderByAccount();

  const rows: ViolationRow[] = fixture.rows.map((row) => {
    const meta = auRuleMeta(row.ruleId);
    const holder = holders.get(row.accountId);
    if (!holder) {
      throw new Error(
        `AU evaluator: no PRIMARY party on file for account ${row.accountId}`,
      );
    }
    return {
      accountId: row.accountId,
      holder,
      ruleId: row.ruleId,
      ruleTitle: meta.title,
      finding: row.finding,
      detail: [
        { label: 'Authorized user', value: row.authorizedUser },
        { label: 'Primary cardholder', value: holder },
        { label: 'Account', value: row.accountLabel },
        { label: 'Account ID', value: row.accountId },
        { label: 'AU added', value: row.addedDate },
        { label: 'Rule', value: row.ruleShortName },
        { label: 'Requirement', value: meta.requirement },
        { label: 'Policy citation', value: meta.citation },
      ],
    };
  });

  const byRule: ViolationsRuleCount[] = policyRules.map((rule) => ({
    ruleId: rule.ruleId,
    title: rule.title,
    count: fixture.byRule[rule.ruleId].relationships,
  }));

  return {
    policyId: 'authorized-user',
    summary: {
      scanned: fixture.accountsScanned,
      accountsAffected: fixture.accountsAffected,
      exceptions: fixture.totalExceptions,
    },
    byRule,
    rows,
  };
}

registerEvaluator('authorized-user', evaluateAuthorizedUserPolicy);

// ---------------------------------------------------------------------------
// card-activation
// ---------------------------------------------------------------------------
//
// DEMO_THESIS.md use case 3, ops side — "an endpoint executes the rules in
// batch against the event logs in the backend; the agent returns the
// out-of-compliance card-activation accounts from that GET call." Same
// two-layer construction the authorized-user evaluator above uses, and for
// the same reason: the DOMAIN evaluator (lib/sentinel/ca-exceptions.ts) owns
// what a rule means and re-derives every exception from
// `getCardActivationScan()`, while this adapter owns only the presentation
// shape `ViolationsDashboard` renders. No figure below is a literal: 214
// scanned / 41 exceptions across 41 accounts / 12 CA-R1 + 29 CA-R2 all fall
// out of the seeded collection, which is what the route test pins.
//
// One card per account in the seed (asserted in
// lib/soe/seed/card-activation.test.ts) and no card can be reported under two
// rules (`checkActivationAttempt` returns on the first hit), so `exceptions`
// and `accountsAffected` are the same number here — unlike the AU policy,
// where one account can carry several flagged relationships.

interface CaRuleMeta {
  title: string;
  requirement: string;
  citation: string;
  /** `"CA-R1 · Activation While Past-Due"` — the compact rule label the
   *  drill-down's `Rule` fact shows, mirroring the AU fixture's own
   *  `ruleShortName` format. */
  shortName: string;
}

function caSectionHeading(sectionId: string): string {
  const section = cardActivationPolicyDocument.sections.find((s) => s.id === sectionId);
  if (!section) {
    throw new Error(`CA evaluator: policy document has no section ${sectionId}`);
  }
  return section.heading;
}

const CA_RULE_META: Map<string, CaRuleMeta> = new Map(
  cardActivationPolicyRules.map((rule) => {
    const heading = caSectionHeading(rule.excerpt.sectionId);
    return [
      rule.ruleId,
      {
        title: rule.title,
        requirement: rule.plainEnglish,
        citation: `${cardActivationPolicyDocument.title} · §${heading}`,
        shortName: `${rule.ruleId} · ${heading}`,
      },
    ];
  }),
);

function caRuleMeta(ruleId: string): CaRuleMeta {
  const meta = CA_RULE_META.get(ruleId);
  if (!meta) {
    throw new Error(`CA evaluator: no policy rule on file for ${ruleId}`);
  }
  return meta;
}

/**
 * Primary cardholder name for each account a card-activation exception names.
 * Cards are issued against TWO account populations (lib/soe/seed/card-activation.ts):
 * the additive AU portfolio — read here through `getAuPortfolio()`, not
 * `getAuScanPortfolio()`, because the CA-R2 pool is drawn from "book-depth"
 * accounts that carry no authorized user and are therefore absent from the AU
 * SCAN set — and v1's own cast (Patel, Marcus), reached through the adapter's
 * per-account getter. The second loop is defensive: neither special card is an
 * exception at either demo anchor, but an evaluator that silently dropped a
 * row for want of a name would be worse than one that costs two extra lookups.
 */
async function caPrimaryHolders(accountIds: Set<string>): Promise<Map<string, string>> {
  const portfolio = await getAuPortfolio();
  const nameByPartyId = new Map(portfolio.parties.map((p) => [p.partyId, p.fullName]));
  const holders = new Map<string, string>();
  for (const role of portfolio.roles) {
    if (role.role !== 'PRIMARY') continue;
    if (!accountIds.has(role.accountId)) continue;
    const name = nameByPartyId.get(role.partyId);
    if (name) holders.set(role.accountId, name);
  }

  for (const accountId of accountIds) {
    if (holders.has(accountId)) continue;
    const primary = (await getPartiesForAccount(accountId)).find(
      (entry) => entry.role.role === 'PRIMARY',
    );
    if (primary) holders.set(accountId, primary.party.fullName);
  }
  return holders;
}

/**
 * The card-activation evaluator. Adapts `evaluateCardActivationPolicy`'s
 * `CaScanResult` (lib/sentinel/ca-exceptions.ts) into the ViolationsPayload
 * shape: the exception's own `finding` sentence is carried through verbatim,
 * and `detail` is the drill-down's already-formatted facts — dates through
 * `formatDate`, never a raw ISO string reaching a renderer (CLAUDE.md 5b).
 */
export async function evaluateCardActivationPolicy(): Promise<ViolationsPayload> {
  const scan = await getCardActivationScan();
  const result = scanCardActivations(scan);
  const holders = await caPrimaryHolders(new Set(result.exceptions.map((e) => e.accountId)));

  const rows: ViolationRow[] = result.exceptions.map((exception) => {
    const meta = caRuleMeta(exception.ruleId);
    const holder = holders.get(exception.accountId);
    if (!holder) {
      throw new Error(
        `CA evaluator: no PRIMARY party on file for account ${exception.accountId}`,
      );
    }
    return {
      accountId: exception.accountId,
      holder,
      ruleId: exception.ruleId,
      ruleTitle: meta.title,
      finding: exception.finding,
      detail: [
        { label: 'Card', value: exception.cardId },
        { label: 'Primary cardholder', value: holder },
        { label: 'Account ID', value: exception.accountId },
        { label: 'Card issued', value: formatDate(exception.issuedDate) },
        {
          label: 'Card activated',
          // An em dash, not an empty string: "still unactivated" is the
          // finding for every CA-R2 row, and a blank value would read as
          // missing data rather than as the exception itself.
          value: exception.activatedDate ? formatDate(exception.activatedDate) : '—',
        },
        { label: 'Rule', value: meta.shortName },
        { label: 'Requirement', value: meta.requirement },
        { label: 'Policy citation', value: meta.citation },
      ],
    };
  });

  const byRule: ViolationsRuleCount[] = cardActivationPolicyRules.map((rule) => ({
    ruleId: rule.ruleId,
    title: rule.title,
    count: result.byRule[rule.ruleId].count,
  }));

  return {
    policyId: 'card-activation',
    summary: {
      scanned: result.cardsScanned,
      accountsAffected: result.accountsAffected,
      exceptions: result.exceptions.length,
    },
    byRule,
    rows,
  };
}

registerEvaluator('card-activation', evaluateCardActivationPolicy);
