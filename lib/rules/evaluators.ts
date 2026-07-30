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
// Registration is open by design: `registerEvaluator` lets the
// card-activation work stream add its evaluator without editing this file.
// The registry is globalThis-backed (lib/events/store.ts's HMR reasoning), so
// a dev-mode reload of this module re-registers the authorized-user evaluator
// without dropping anyone else's.

import { getAuScanPortfolio } from '@/lib/soe';
import { getAuExceptionFixture } from '@/lib/sentinel/exception-fixture';
import { policyDocument, policyRules } from '@/lib/sentinel/policy';
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
