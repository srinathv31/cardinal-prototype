// GET /api/report?policy=&confirmationId= — the audit-report file
// (DEMO_THESIS.md UC1 beat 8: "The agent generates a real output file — what
// happened, an audit trail — in a nice template format", audience C-suite.
// DEMO_BUILD_PLAN.md §Endpoints: "Wave 2: HTML report file,
// Content-Disposition: attachment (CSV precedent exists)").
//
// The CSV precedent is app/api/sentinel/report/route.ts (a different agent's
// file — untouched here). The shape carries over: validate the query,
// derive every figure server-side from a checked-in fixture, stream back an
// `attachment`. What's new is the template format (a full, print-ready HTML
// document, not a spreadsheet import) and the query contract (`policy` +
// optional `confirmationId`, not a `reportId` lookup token).
//
// Every number and name comes from lib/sentinel/exception-fixture.ts's
// getAuExceptionFixture() (CLAUDE.md 5a: "the model never generates a
// number, date, name, or balance") — the SAME fixture GET
// /api/sentinel/report's CSV and app/api/remediate's mock execution both
// read, so this file can never show a figure those don't. Rule metadata
// (title/requirement/citation) prefers the human-approved copy in the rule
// store (lib/rules/store.ts's getRules) and falls back, rule id by rule id,
// to the checked-in lib/sentinel/policy.ts fixture when a given rule isn't
// stored — so the report always builds, including a demo reset or a
// rehearsal that jumps straight to beat 8 before Gate 1 has run in that
// session. In the real demo flow the two copies read identically: the
// ops-agent's saveRules tool stores exactly this fixture's own text.
//
// `confirmationId` is a QUERY PARAM here, not recomputed: by the time beat 8
// runs, POST /api/remediate has already returned one, and the caller (the
// generateReport tool, DEMO_BUILD_PLAN.md's ops-agent table) passes it
// straight through. This route never re-derives or validates its shape — it
// prints it verbatim, per contract — but the removed/accountsTouched/
// notificationsQueued figures alongside it are recomputed from the same
// fixture app/api/sentinel/remediate/route.ts uses, so they can't drift from
// what that route actually returned.
//
// `card-activation` is a valid PolicyId (lib/rules/store.ts's POLICY_IDS)
// but has no report built yet — 501, not 400, because the policy id itself
// is well-formed; only this report is unbuilt (DEMO_BUILD_PLAN.md: "stitched
// Wave 3"). Anything else in the `policy` param is a genuine 400.
//
// Determinism ("byte-identical output for identical query + anchor"): no
// Date.now(), no Math.random(). getAnchor() is the only clock read, and it's
// pinnable (DEMO_ANCHOR_DATE) exactly like every other route in this
// codebase. Read-only, so — like GET /api/violations — it writes no Event
// Log entry of its own; the agent's tool call is what gets logged.

import { NextResponse } from 'next/server';
import { getAnchor, getAuScanPortfolio } from '@/lib/soe';
import { formatDate } from '@/lib/agents/format';
import { getAuExceptionFixture } from '@/lib/sentinel/exception-fixture';
import { policyDocument, policyRules, type PolicyRule } from '@/lib/sentinel/policy';
import type { AuRuleId } from '@/lib/sentinel/au-exceptions';
import { getRules, isPolicyId, POLICY_IDS, type StoredRule } from '@/lib/rules/store';
import {
  buildAuAuditReportHtml,
  type AuditReportRow,
  type AuditReportRuleSummary,
} from '@/lib/sentinel/report-template';

const AU_RULE_IDS: readonly AuRuleId[] = ['R1', 'R2', 'R3'];

interface RuleMeta {
  title: string;
  requirement: string;
  citation: string;
}

/** The checked-in fallback for one AU rule's display text, read straight off
 *  lib/sentinel/policy.ts — same technique lib/rules/evaluators.ts's private
 *  AU_RULE_META uses (that module isn't in this agent's file set, so this is
 *  a small, deliberate duplication of a few lines rather than a cross-file
 *  import: both are independently derivable from the same checked-in
 *  fixture, so they can't disagree). */
function fallbackRuleMeta(ruleId: AuRuleId): RuleMeta {
  const rule: PolicyRule | undefined = policyRules.find((r) => r.ruleId === ruleId);
  if (!rule) {
    throw new Error(`report: no fallback policy rule on file for ${ruleId}`);
  }
  const section = policyDocument.sections.find((s) => s.id === rule.excerpt.sectionId);
  if (!section) {
    throw new Error(`report: policy document has no section ${rule.excerpt.sectionId}`);
  }
  return {
    title: rule.title,
    requirement: rule.plainEnglish,
    citation: `${policyDocument.title} · §${section.heading}`,
  };
}

/** Human-approved text when the rule is on file in the store, the fixture's
 *  own text otherwise — resolved independently per rule id, so a partially
 *  populated store (or one repopulated after a reset) still renders every
 *  rule's real requirement and citation, never a blank. */
function ruleMetaFor(ruleId: AuRuleId, stored: readonly StoredRule[]): RuleMeta {
  const match = stored.find((r) => r.id === ruleId);
  if (match) {
    return { title: match.title, requirement: match.requirement, citation: match.citation };
  }
  return fallbackRuleMeta(ruleId);
}

/** Primary cardholder full name per account. Mirrors
 *  lib/sentinel/exception-fixture.ts's own PRIMARY-role join (that module
 *  keeps only the household surname for its `accountLabel`; this report
 *  needs the full name for its "Primary Holder" column), read from the same
 *  lib/soe snapshot the fixture itself derives from — same data, same
 *  anchor, so the two can't disagree. */
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

export async function GET(request: Request): Promise<Response> {
  const { searchParams } = new URL(request.url);
  const policy = searchParams.get('policy');
  const confirmationId = searchParams.get('confirmationId');

  if (!policy || !isPolicyId(policy)) {
    return NextResponse.json(
      {
        error: `Query parameter "policy" is required and must be one of: ${POLICY_IDS.join(', ')}.`,
      },
      { status: 400 },
    );
  }

  if (policy === 'card-activation') {
    return NextResponse.json(
      {
        error:
          'The card-activation audit report is not available yet — only "authorized-user" is built.',
      },
      { status: 501 },
    );
  }

  const anchor = getAnchor();
  const anchorDateOnly = anchor.toISOString().slice(0, 10);
  const generatedAt = formatDate(anchor.toISOString());

  const [fixture, holders] = await Promise.all([
    getAuExceptionFixture(),
    primaryHolderByAccount(),
  ]);
  const storedRules = getRules('authorized-user');

  const byRule: AuditReportRuleSummary[] = AU_RULE_IDS.map((ruleId) => {
    const meta = ruleMetaFor(ruleId, storedRules);
    return {
      ruleId,
      title: meta.title,
      requirement: meta.requirement,
      citation: meta.citation,
      count: fixture.byRule[ruleId].relationships,
    };
  });

  const rows: AuditReportRow[] = fixture.rows.map((row) => {
    const holder = holders.get(row.accountId);
    if (!holder) {
      throw new Error(`report: no PRIMARY party on file for account ${row.accountId}`);
    }
    return {
      accountLabel: row.accountLabel,
      primaryHolder: holder,
      authorizedUser: row.authorizedUser,
      ruleShortName: row.ruleShortName,
      finding: row.finding,
      addedDate: row.addedDate,
    };
  });

  const remediation = confirmationId
    ? {
        removed: fixture.totalExceptions,
        accountsTouched: fixture.accountsAffected,
        notificationsQueued: fixture.accountsAffected,
        confirmationId,
        approvedAt: generatedAt,
      }
    : undefined;

  const html = buildAuAuditReportHtml({
    generatedAt,
    policyTitle: policyDocument.title,
    scanned: fixture.accountsScanned,
    exceptions: fixture.totalExceptions,
    accountsAffected: fixture.accountsAffected,
    byRule,
    rows,
    remediation,
  });

  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': `attachment; filename="authorized-user-policy-audit-${anchorDateOnly}.html"`,
    },
  });
}
