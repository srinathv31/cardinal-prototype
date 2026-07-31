// The audit-report HTML template (DEMO_THESIS.md UC1 beat 8: "The agent
// generates a real output file — what happened, an audit trail — in a nice
// template format", audience C-suite. DEMO_BUILD_PLAN.md §Endpoints:
// "GET /api/report — Wave 2: HTML report file, Content-Disposition:
// attachment (CSV precedent exists)").
//
// Pure function of typed inputs — no lib/soe import, no lib/sentinel/policy
// import, no I/O of any kind, no Date.now(), no Math.random(). Every figure
// and every string arrives already computed; this module only lays them out
// (CLAUDE.md 5a "the model never generates a number, date, name, or
// balance" / 5b "zero business logic in components" — the same discipline
// the brief asks of a React renderer applies here even though the output is
// a hand-built HTML string, not JSX). `app/api/report/route.ts` is the only
// caller and the only place that touches `lib/soe`, `lib/rules/store`, or
// `lib/sentinel/exception-fixture`.
//
// Mirrors lib/sentinel/exception-fixture.ts's `buildAuExceptionCsv`: given
// the same input, `buildAuAuditReportHtml` returns byte-identical output,
// forever — that determinism is what lets the route's own tests pin exact
// header/row counts and byte-for-byte equality across two calls.
//
// Design (opens standalone in a browser AND may be printed, per the route's
// contract): one self-contained document, all CSS inline in a single
// <style> block, no external requests. Light/"paper-white" theme — the one
// deliberate exception to the app's dark theme, because this file is meant
// to read like a document a bank would file, not a screen in the product.

/** One row of the "headline figures" breakdown — title/requirement/citation
 *  are prose the caller already resolved (approved rule text when a human
 *  has stored one, the checked-in policy fixture's text otherwise); `count`
 *  is always the real evaluator figure, independent of that choice. */
export interface AuditReportRuleSummary {
  ruleId: string;
  title: string;
  requirement: string;
  citation: string;
  count: number;
}

/** One row of the full exception table. Every field is already a display
 *  string — no ISO dates, no raw ids the reader has to decode. */
export interface AuditReportRow {
  accountLabel: string;
  primaryHolder: string;
  authorizedUser: string;
  ruleShortName: string;
  finding: string;
  addedDate: string;
}

/** The remediation section's figures — same shape POST /api/remediate (and
 *  its sibling app/api/sentinel/remediate) returns, plus the human-approval
 *  framing the report adds on top. */
export interface AuditReportRemediation {
  removed: number;
  accountsTouched: number;
  notificationsQueued: number;
  /** Printed verbatim — never reformatted or re-derived here. */
  confirmationId: string;
  /** Preformatted display date, e.g. "Aug 5, 2026". */
  approvedAt: string;
}

export interface AuditReportInput {
  /** Preformatted display date, e.g. "Aug 5, 2026". */
  generatedAt: string;
  /** The policy document's title, e.g. "Authorized User Eligibility Policy". */
  policyTitle: string;
  scanned: number;
  exceptions: number;
  accountsAffected: number;
  /** In rule order (R1, R2, R3) — the caller decides the order; this module
   *  renders whatever it's given without sorting. */
  byRule: AuditReportRuleSummary[];
  /** The complete exception set, in the order they should render. This
   *  module never slices or paginates — "showing N of M" is not this
   *  report's job; enumerating every row is the credibility point of an
   *  audit artifact. */
  rows: AuditReportRow[];
  /** Present only when the request carried a confirmationId — absent, the
   *  report renders without a remediation section at all. */
  remediation?: AuditReportRemediation;
}

/** Minimal HTML-escaping. Every field here is real seed-derived data — a
 *  name, a finding sentence, a citation — never model-authored markup, but
 *  escaping is cheap insurance against a future name or finding containing
 *  `&`, `<`, `>`, or `"` (mirrors exception-fixture.ts's `escapeCsvField`
 *  defensive posture: not a defensive no-op today, but a real guard against
 *  a shape the data could grow into later). */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const REPORT_CSS = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    background: #f6f4ee;
    color: #1c1a16;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif;
    font-size: 14px;
    line-height: 1.6;
    font-variant-numeric: tabular-nums;
    padding: 48px 56px 72px;
    max-width: 880px;
    margin: 0 auto;
  }
  h1, h2, h3 {
    font-family: Georgia, "Iowan Old Style", "Palatino Linotype", "Times New Roman", serif;
    font-weight: 600;
    color: #14120f;
    margin: 0 0 6px;
  }
  h1 { font-size: 24px; letter-spacing: 0.01em; }
  h2 { font-size: 16px; margin-top: 40px; padding-bottom: 8px; border-bottom: 1px solid #d9d3c3; }
  p { margin: 0 0 12px; }
  header.report-header { border-bottom: 3px double #14120f; padding-bottom: 16px; margin-bottom: 24px; }
  .report-meta { color: #55503f; font-size: 13px; }
  .exec-summary { max-width: 68ch; color: #2a271f; }
  .stat-row { display: flex; gap: 20px; margin: 16px 0 8px; break-inside: avoid; }
  .stat { flex: 1; border: 1px solid #d9d3c3; background: #ffffff; padding: 14px 18px; }
  .stat .stat-value { display: block; font-size: 26px; font-weight: 700; color: #14120f; }
  .stat .stat-label { display: block; margin-top: 2px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.06em; color: #6b6552; }
  .rule-grid { display: flex; flex-direction: column; gap: 10px; margin-top: 16px; }
  .rule-card { border: 1px solid #d9d3c3; background: #ffffff; padding: 12px 16px; break-inside: avoid; }
  .rule-card .rule-title-row { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; }
  .rule-card .rule-title { font-weight: 700; }
  .rule-card .rule-count { font-size: 18px; font-weight: 700; }
  .rule-card .rule-requirement { margin-top: 4px; color: #2a271f; }
  .rule-card .rule-citation { margin-top: 4px; font-size: 12px; color: #6b6552; font-style: italic; }
  table.exception-table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  table.exception-table thead { display: table-header-group; }
  table.exception-table th, table.exception-table td { border: 1px solid #d9d3c3; padding: 7px 9px; text-align: left; vertical-align: top; font-size: 12.5px; }
  table.exception-table th { background: #eee8d8; font-weight: 700; }
  table.exception-table tbody tr:nth-child(even) { background: #fbfaf6; }
  table.exception-table tr { break-inside: avoid; }
  section.remediation { margin-top: 40px; border: 1px solid #b9542c; background: #fdf3ec; padding: 16px 20px; break-inside: avoid; }
  section.remediation h2 { border-bottom-color: #d9a988; margin-top: 0; }
  .remediation-figures { display: flex; gap: 20px; margin: 8px 0 12px; }
  .remediation-figures .stat { border-color: #d9a988; }
  .remediation-line { margin: 4px 0; }
  .remediation-line .label { color: #6b6552; margin-right: 6px; }
  code.confirmation-id { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; background: #f1ece0; padding: 1px 6px; border: 1px solid #d9d3c3; }
  footer.report-footer { margin-top: 48px; padding-top: 12px; border-top: 1px solid #d9d3c3; color: #6b6552; font-size: 11.5px; }
  @page { margin: 20mm 18mm; }
  @media print {
    body { background: #ffffff; padding: 0; max-width: none; }
    .stat { background: #ffffff; }
  }
`.trim();

function renderHeader(input: AuditReportInput): string {
  return `<header class="report-header">
  <h1>Cardinal &middot; Authorized-User Policy Audit</h1>
  <p class="report-meta">Generated ${escapeHtml(input.generatedAt)} &middot; Policy document: ${escapeHtml(input.policyTitle)}</p>
</header>`;
}

/** Item 2 of the report contract — a checked-in narrative TEMPLATE (the
 *  sentence structure is a constant in this file), with the figures
 *  interpolated from real, server-derived numbers (CLAUDE.md 5a). The HTML
 *  comment marks exactly the slot a live model would fill later, and
 *  nothing else — every other section stays scripted regardless of D2. */
function renderSummary(input: AuditReportInput): string {
  const summary =
    `This report summarizes a compliance sweep of ${input.scanned} accounts carrying ` +
    `authorized-user relationships, evaluated against the ${escapeHtml(input.policyTitle)}. ` +
    `The sweep identified ${input.exceptions} exceptions across ${input.accountsAffected} ` +
    `accounts; each is enumerated below with its governing rule, citation, and finding.`;
  return `<section class="exec-summary">
  <h2>Executive Summary</h2>
  <!-- narrative: live-model slot (D2) — scripted constant for the demo -->
  <p>${summary}</p>
</section>`;
}

function renderHeadlineFigures(input: AuditReportInput): string {
  const stats = `<div class="stat-row">
    <div class="stat"><span class="stat-value">${input.scanned}</span><span class="stat-label">Accounts scanned</span></div>
    <div class="stat"><span class="stat-value">${input.exceptions}</span><span class="stat-label">Exceptions</span></div>
    <div class="stat"><span class="stat-value">${input.accountsAffected}</span><span class="stat-label">Accounts affected</span></div>
  </div>`;
  const cards = input.byRule
    .map(
      (rule) => `<div class="rule-card">
      <div class="rule-title-row">
        <span class="rule-title">${escapeHtml(rule.title)}</span>
        <span class="rule-count">${rule.count}</span>
      </div>
      <p class="rule-requirement">${escapeHtml(rule.requirement)}</p>
      <p class="rule-citation">${escapeHtml(rule.citation)}</p>
    </div>`,
    )
    .join('\n    ');
  return `<section class="headline-figures">
  <h2>Headline Figures</h2>
  ${stats}
  <div class="rule-grid">
    ${cards}
  </div>
</section>`;
}

function renderExceptionRow(row: AuditReportRow): string {
  return `<tr>
      <td>${escapeHtml(row.accountLabel)}</td>
      <td>${escapeHtml(row.primaryHolder)}</td>
      <td>${escapeHtml(row.authorizedUser)}</td>
      <td>${escapeHtml(row.ruleShortName)}</td>
      <td>${escapeHtml(row.finding)}</td>
      <td>${escapeHtml(row.addedDate)}</td>
    </tr>`;
}

function renderExceptionTable(input: AuditReportInput): string {
  const rows = input.rows.map(renderExceptionRow).join('\n    ');
  return `<section class="exceptions">
  <h2>Exceptions (${input.rows.length})</h2>
  <table class="exception-table">
    <thead>
      <tr>
        <th>Account</th>
        <th>Primary Holder</th>
        <th>Authorized User</th>
        <th>Rule</th>
        <th>Finding</th>
        <th>AU Added</th>
      </tr>
    </thead>
    <tbody>
    ${rows}
    </tbody>
  </table>
</section>`;
}

function renderRemediation(remediation: AuditReportRemediation): string {
  return `<section class="remediation">
  <h2>Remediation Executed</h2>
  <div class="remediation-figures">
    <div class="stat"><span class="stat-value">${remediation.removed}</span><span class="stat-label">Authorized users removed</span></div>
    <div class="stat"><span class="stat-value">${remediation.accountsTouched}</span><span class="stat-label">Accounts touched</span></div>
    <div class="stat"><span class="stat-value">${remediation.notificationsQueued}</span><span class="stat-label">Notifications queued</span></div>
  </div>
  <p class="remediation-line"><span class="label">Confirmation id:</span><code class="confirmation-id">${escapeHtml(remediation.confirmationId)}</code></p>
  <p class="remediation-line"><span class="label">Actor:</span>Approved by a human operator</p>
  <p class="remediation-line"><span class="label">Timestamp:</span>${escapeHtml(remediation.approvedAt)}</p>
</section>`;
}

function renderFooter(): string {
  return `<footer class="report-footer">
  <p>Generated by Cardinal ops agent &middot; human-approved &middot; demo data</p>
</footer>`;
}

/**
 * Builds the complete, self-contained audit-report HTML document. Pure
 * function of `input` — same input in, byte-identical string out, every
 * time (report-template.test.ts pins this directly; app/api/report's own
 * tests pin it end-to-end through the route).
 */
export function buildAuAuditReportHtml(input: AuditReportInput): string {
  const sections = [
    renderHeader(input),
    renderSummary(input),
    renderHeadlineFigures(input),
    renderExceptionTable(input),
    input.remediation ? renderRemediation(input.remediation) : '',
    renderFooter(),
  ]
    .filter((section) => section.length > 0)
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Authorized-User Policy Audit &middot; ${escapeHtml(input.generatedAt)}</title>
<style>
${REPORT_CSS}
</style>
</head>
<body>
${sections}
</body>
</html>
`;
}
