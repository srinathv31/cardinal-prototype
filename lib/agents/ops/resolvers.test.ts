// Tests for lib/agents/ops/resolvers.ts — the ops surface's grounding proof
// (CLAUDE.md 5a/5b). Three concerns, mirroring
// lib/agents/servicing/resolvers.test.ts's structure:
//
//  (a) GROUNDING — every string a tool returns reconciles with a fresh,
//      independent read of the source it claims to come from: the policy
//      fixture for rule text and citations, `GET /api/violations`'s own
//      helper for the sweep figures, and the exception fixture for the
//      remediation counters. Nothing is re-derived from the resolver's own
//      output.
//
//  (b) THE CONFIRMATION-ID PIN — `buildAuditReport()` restates the
//      confirmation id `POST /api/sentinel/remediate` mints (that route
//      computes it in a private local function). This file asserts the two are
//      byte-identical, at both demo anchors, so the restatement cannot drift
//      away from the route silently.
//
//  (c) POLICY PINNING — no resolver takes a policy id, so there is nothing for
//      a model-supplied one to occupy; `saveApprovedRules` additionally
//      refuses to store any rule that is not in the checked-in document, even
//      when handed the id directly, below any schema validation.
//
// Both demo anchors are exercised, per lib/soe/seed/seed.test.ts's convention.

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { reset as resetEvents, query as queryEvents } from '@/lib/events/store';
import { getRules, resetRules } from '@/lib/rules/store';
import { queryViolations } from '@/lib/rules/query';
import { getAuExceptionFixture } from '@/lib/sentinel/exception-fixture';
import { policyDocument, policyObligationGap, policyRules } from '@/lib/sentinel/policy';
import { sentinelRenderInstructionSchema } from '@/lib/sentinel/registry';
import { POST as remediatePost } from '@/app/api/sentinel/remediate/route';
import {
  buildAuditReport,
  candidateRules,
  OPS_AGENT_ID,
  OPS_POLICY_ID,
  parsePolicyDocument,
  resolveViolations,
  runBatchRemoval,
  saveApprovedRules,
  storedRequirement,
} from './resolvers';

const ANCHORS = ['2026-08-05', '2026-08-19'] as const;

describe.each(ANCHORS)('ops resolvers @ anchor %s', (anchorIso) => {
  let previousAnchor: string | undefined;

  beforeEach(() => {
    previousAnchor = process.env.DEMO_ANCHOR_DATE;
    process.env.DEMO_ANCHOR_DATE = anchorIso;
    resetRules();
    resetEvents();
  });

  afterEach(() => {
    if (previousAnchor === undefined) delete process.env.DEMO_ANCHOR_DATE;
    else process.env.DEMO_ANCHOR_DATE = previousAnchor;
    resetRules();
    resetEvents();
  });

  // -------------------------------------------------------------------------
  // Beat 1–2 — parse
  // -------------------------------------------------------------------------

  describe('parsePolicyDocument', () => {
    it('reports the checked-in document, never the uploaded file name', () => {
      const parsed = parsePolicyDocument();
      expect(parsed.status).toBe('parsed');
      expect(parsed.documentTitle).toBe(policyDocument.title);
      expect(parsed.documentId).toBe(policyDocument.id);
      expect(parsed.ruleIds).toEqual(policyRules.map((r) => r.ruleId));
      expect(parsed.dataGapIds).toEqual([policyObligationGap.obligationId]);
    });

    it('renders a RuleDiff carrying every drafted rule plus the parked obligation', () => {
      const parsed = parsePolicyDocument();
      expect(() => sentinelRenderInstructionSchema.parse(parsed.render)).not.toThrow();
      if (parsed.render.component !== 'RuleDiff') throw new Error('unreachable');

      const rows = parsed.render.props.rules;
      expect(rows).toHaveLength(policyRules.length + 1);
      expect(parsed.render.props.status).toBe('proposed');

      // Every drafted row quotes the policy document verbatim — the quote must
      // be a real substring of the section it cites, the same invariant
      // lib/sentinel/policy.test.ts pins on the fixture itself.
      for (const rule of policyRules) {
        const row = rows.find((r) => r.ruleId === rule.ruleId);
        expect(row).toBeTruthy();
        expect(row?.plainEnglish).toBe(rule.plainEnglish);
        expect(row?.evaluability).toBe('evaluable');
        const section = policyDocument.sections.find((s) => s.id === rule.excerpt.sectionId);
        expect(section).toBeTruthy();
        expect(row?.excerpt.sectionHeading).toBe(section?.heading);
        expect(section?.body).toContain(row?.excerpt.quote);
      }

      // …and the fourth row is the obligation nothing could evaluate — the
      // credibility beat, present and clearly marked.
      const gap = rows.find((r) => r.evaluability === 'data-gap');
      expect(gap?.ruleId).toBe(policyObligationGap.obligationId);
      expect(gap?.criticNote).toBe(policyObligationGap.criticNote);
      expect(gap?.machine).toBeUndefined();
      expect(gap?.validated).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // Beat 3 — Gate 1
  // -------------------------------------------------------------------------

  describe('candidateRules / saveApprovedRules', () => {
    it('derives every stored field from the policy document, not from a literal', () => {
      const rules = candidateRules();
      expect(rules.map((r) => r.id)).toEqual(policyRules.map((r) => r.ruleId));

      for (const rule of policyRules) {
        const candidate = rules.find((r) => r.id === rule.ruleId);
        expect(candidate?.title).toBe(rule.title);
        expect(candidate?.requirement).toBe(rule.plainEnglish);
        const section = policyDocument.sections.find((s) => s.id === rule.excerpt.sectionId);
        expect(candidate?.citation).toBe(`${policyDocument.title} · §${section?.heading}`);
        expect(candidate?.machine).toBe(
          `${rule.machine.ruleId} · ${rule.machine.datasetsTouched.join(', ')} · ${rule.machine.evaluationTrigger}`,
        );
      }
    });

    it('stamps addedAt from the demo anchor, so a replay is byte-identical', () => {
      expect(candidateRules().map((r) => r.addedAt)).toEqual(
        candidateRules().map(() => `${anchorIso}T00:00:00.000Z`),
      );
    });

    it('stores the approved rules under the pinned policy', () => {
      const result = saveApprovedRules(['R1', 'R2', 'R3']);
      expect(result).toMatchObject({ status: 'saved', policyId: OPS_POLICY_ID, saved: 3 });

      const stored = getRules(OPS_POLICY_ID);
      expect(stored.map((r) => r.id)).toEqual(['R1', 'R2', 'R3']);
      expect(stored.every((r) => r.policyId === OPS_POLICY_ID)).toBe(true);
      expect(storedRequirement('R1')).toBe(policyRules[0].plainEnglish);
    });

    it('narrows to the ids it was given, and stores nothing outside the document', () => {
      saveApprovedRules(['R1']);
      expect(getRules(OPS_POLICY_ID).map((r) => r.id)).toEqual(['R1']);

      // An id the document never defines cannot become a stored rule, even
      // handed to the resolver directly (below any schema validation).
      expect(() => saveApprovedRules(['R9'])).toThrow(/R9/);
      expect(getRules(OPS_POLICY_ID).map((r) => r.id)).toEqual(['R1']);
    });

    it('re-running the approval beat leaves three rules stored, not six', () => {
      saveApprovedRules(['R1', 'R2', 'R3']);
      saveApprovedRules(['R1', 'R2', 'R3']);
      expect(getRules(OPS_POLICY_ID)).toHaveLength(3);
    });
  });

  // -------------------------------------------------------------------------
  // Beat 4–5 — the sweep
  // -------------------------------------------------------------------------

  describe('resolveViolations', () => {
    it('answers "no rules configured" before Gate 1 has run — and renders nothing', async () => {
      const result = await resolveViolations();
      expect(result.status).toBe('no-rules');
      expect(result).not.toHaveProperty('render');
      if (result.status !== 'no-rules') throw new Error('unreachable');
      expect(result.message.toLowerCase()).toContain('no authorized-user rules');
    });

    it('reports the evaluator\'s own figures, matching GET /api/violations exactly', async () => {
      saveApprovedRules(['R1', 'R2', 'R3']);

      const direct = await queryViolations(OPS_POLICY_ID);
      if (direct.status !== 'ok') throw new Error('unreachable');
      const result = await resolveViolations();
      if (result.status !== 'ok') throw new Error('unreachable');

      expect(result.scanned).toBe(direct.payload.summary.scanned);
      expect(result.accountsAffected).toBe(direct.payload.summary.accountsAffected);
      expect(result.exceptions).toBe(direct.payload.summary.exceptions);
      expect(result.byRule).toEqual(direct.payload.byRule);

      // The golden AU figures the demo shows (app/api/violations/route.test.ts
      // pins the same ones on the HTTP path).
      expect(result.scanned).toBe(962);
      expect(result.accountsAffected).toBe(74);
      expect(result.exceptions).toBe(87);
      expect(result.byRule.map((r) => r.count)).toEqual([61, 19, 7]);
    });

    it('renders a schema-valid dashboard whose table samples every rule proportionally', async () => {
      saveApprovedRules(['R1', 'R2', 'R3']);
      const result = await resolveViolations();
      if (result.status !== 'ok') throw new Error('unreachable');

      expect(() => sentinelRenderInstructionSchema.parse(result.render)).not.toThrow();
      if (result.render.component !== 'ViolationsDashboard') throw new Error('unreachable');
      const props = result.render.props;

      // Summary and breakdown carry the TOTALS; the table carries a sample,
      // and the component prints "Showing 12 of 87" from the two together.
      expect(props.summary).toEqual({ scanned: 962, accountsAffected: 74, exceptions: 87 });
      expect(props.rows).toHaveLength(12);
      expect(result.rowsShown).toBe(12);

      // Every rule with exceptions appears in the table, in breakdown order,
      // roughly in proportion — never a single-rule table under a three-rule
      // bar chart.
      const mix = props.rows.map((r) => r.ruleId);
      expect(mix).toEqual([...mix].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
      expect(new Set(mix)).toEqual(new Set(['R1', 'R2', 'R3']));
      expect(mix.filter((id) => id === 'R1').length).toBeGreaterThan(
        mix.filter((id) => id === 'R2').length,
      );

      // Every rendered row is a row the evaluator actually produced.
      const direct = await queryViolations(OPS_POLICY_ID);
      if (direct.status !== 'ok') throw new Error('unreachable');
      const known = new Set(direct.payload.rows.map((r) => `${r.accountId}·${r.ruleId}`));
      for (const row of props.rows) {
        expect(known.has(`${row.accountId}·${row.ruleId}`)).toBe(true);
        expect(row.detail.length).toBeGreaterThan(0);
        for (const fact of row.detail) {
          // Preformatted server-side — never a raw ISO date reaching a renderer.
          expect(fact.value).not.toMatch(/^\d{4}-\d{2}-\d{2}(T|$)/);
        }
      }
    });

    it('narrows to the rules a human approved — R1 alone reports 61', async () => {
      saveApprovedRules(['R1']);
      const result = await resolveViolations();
      if (result.status !== 'ok') throw new Error('unreachable');
      expect(result.exceptions).toBe(61);
      expect(result.byRule.map((r) => r.ruleId)).toEqual(['R1']);
      if (result.render.component !== 'ViolationsDashboard') throw new Error('unreachable');
      expect(result.render.props.rows.every((r) => r.ruleId === 'R1')).toBe(true);
    });

    it('is deterministic — two sweeps return byte-identical payloads', async () => {
      saveApprovedRules(['R1', 'R2', 'R3']);
      const first = await resolveViolations();
      const second = await resolveViolations();
      expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    });
  });

  // -------------------------------------------------------------------------
  // Beat 7–8 — Gate 2 and the report
  // -------------------------------------------------------------------------

  describe('runBatchRemoval', () => {
    it('returns the remediation endpoint\'s own counters and confirmation id', async () => {
      const fixture = await getAuExceptionFixture();
      const receipt = await runBatchRemoval('run-ops-test');

      expect(receipt.status).toBe('executed');
      expect(receipt.removed).toBe(fixture.totalExceptions);
      expect(receipt.accountsTouched).toBe(fixture.accountsAffected);
      expect(receipt.notificationsQueued).toBe(fixture.accountsAffected);
      expect(receipt.reportId).toBe(fixture.reportId);
      expect(receipt.disposition).toBe('Kicked off in batch');
    });

    it('writes exactly one action.executed entry, attributed to this run', async () => {
      await runBatchRemoval('run-ops-test');
      const actions = queryEvents({ runId: 'run-ops-test' }).filter(
        (e) => e.kind === 'action.executed',
      );
      expect(actions).toHaveLength(1);
      expect(actions[0]).toMatchObject({
        agentId: OPS_AGENT_ID,
        toolName: 'au-policy.remediate',
        actor: 'agent',
      });
    });

    it('is deterministic across replays — same body, different run ids', async () => {
      const first = await runBatchRemoval('run-a');
      const second = await runBatchRemoval('run-b');
      expect(second.confirmationId).toBe(first.confirmationId);
      expect(second.removed).toBe(first.removed);
    });
  });

  describe('buildAuditReport', () => {
    it('pins its confirmation id to the one POST /api/sentinel/remediate actually mints', async () => {
      const response = await remediatePost(
        new Request('http://localhost/api/sentinel/remediate', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ runId: 'run-pin', agentId: OPS_AGENT_ID }),
        }),
      );
      expect(response.status).toBe(200);
      const routeBody = (await response.json()) as { confirmationId: string };

      const report = await buildAuditReport();
      expect(report.confirmationId).toBe(routeBody.confirmationId);
    });

    it('renders a schema-valid ReportCard naming the anchor-dated file and the real totals', async () => {
      const fixture = await getAuExceptionFixture();
      const report = await buildAuditReport();

      expect(() => sentinelRenderInstructionSchema.parse(report.render)).not.toThrow();
      if (report.render.component !== 'ReportCard') throw new Error('unreachable');
      const props = report.render.props;

      expect(props.filename).toBe(`authorized-user-policy-audit-${anchorIso}.html`);
      expect(report.filename).toBe(props.filename);
      expect(props.href).toBe(
        `/api/report?policy=authorized-user&confirmationId=${report.confirmationId}`,
      );
      expect(props.summary).toContain(String(fixture.totalExceptions));
      expect(props.summary).toContain(String(fixture.accountsAffected));
      expect(props.summary).toContain(report.confirmationId);
      // Preformatted, never an ISO string — the renderer does no date work.
      expect(props.generatedAt).not.toMatch(/^\d{4}-\d{2}-\d{2}/);
    });

    it('has no side effect — generating the report logs nothing', async () => {
      await buildAuditReport();
      expect(queryEvents()).toHaveLength(0);
    });

    it('is deterministic — two generations are byte-identical', async () => {
      const first = await buildAuditReport();
      const second = await buildAuditReport();
      expect(JSON.stringify(second)).toBe(JSON.stringify(first));
    });
  });
});
