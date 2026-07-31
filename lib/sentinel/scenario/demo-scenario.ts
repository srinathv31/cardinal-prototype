// The real Sentinel demo script (P1 W1.1-W1.3, CARDINAL_V3_AU_BRIEF.md §3) —
// the three-act AU-policy story `/sentinel` plays by default, replacing the
// P0 placeholder that pointed the route at `graphRehearsalScenario`
// (docs/v3-migration-map.md §7: "P0 leaves `/sentinel` playable on the
// existing graph-rehearsal fixture; `buildDemoScenario` returns in P1.").
//
// One export per act plus the assembler, so P2 and P3 can each fill in their
// act without touching this file's other exports or its shared `RUN_ID`:
//
//   - `actOneSteps()` — Act I, "The gap" (brief §3). Built here, in full.
//   - `actTwoSteps()` — Act II, "Policy to production" (brief §3). Built here,
//     in full (P2, W2.3), against the Policy panel + Rule Diff content P0
//     already rewired to the AU policy (W2.1/W2.2).
//   - `actThreeSteps()` — Act III, "The sweep" (brief §3). Built here, in
//     full (P3, W3.4), against `PolicyExceptionTable`/`RemediationReport`
//     (W3.1/W3.2) and `ApprovalCard`'s widened `scope`/`reviewList` (W3.3).
//     `async` for real now: every figure comes off `getAuExceptionFixture()`
//     (`lib/sentinel/exception-fixture.ts`) and `getAuScanPortfolio()`
//     (`lib/soe`) — never a typed literal — so the async seam P0 opened
//     ahead of need (see `buildDemoScenario` below) is finally load-bearing.
//   - `buildDemoScenario()` — concatenates all three into the one
//     `SentinelScenario` the stage plays. `await`s `actThreeSteps()`.
//
// Single `RUN_ID`/`AGENT_ID` pair for the whole demo — every `auditWrite`
// and `awaitApproval.audit` across all three acts is one continuous run in
// the shared Event Log (brief §5e), not three separate ones.

import type { AwaitApprovalStep, ScenarioStep, SentinelScenario } from './types';
import { policyDocument, policyObligationGap, policyRules, type PolicyRule } from '@/lib/sentinel/policy';
import type { DecisionCardProps, PolicyExceptionTableProps, RuleCitationProps, RuleDiffProps } from '@/lib/sentinel/registry';
import { getAuExceptionFixture, type AuExceptionFixture } from '@/lib/sentinel/exception-fixture';
import { getAuScanPortfolio } from '@/lib/soe';

// Exported (not just module-private) so `stage.tsx`'s remediation POST seam
// (Task 4, brief §6c) attributes `POST /api/sentinel/remediate`'s own
// `action.executed` audit entry to this SAME continuous run/agent — the
// Event Log then reads as one story across all three acts, this route's
// entry included, rather than the scripted `auditWrite` step and the real
// route's own append() looking like two unrelated runs.
export const RUN_ID = 'run-sentinel-au';
export const AGENT_ID = 'sentinel';

/** The Rule Diff card's stable render id — module scope (not local to
 * `actTwoSteps`) because Act III's beat 1 re-renders this SAME card
 * (same-id replace-in-place) to attach `storeMeta` (registry.ts's doc
 * comment on `ruleDiffPropsSchema.storeMeta`, brief §6d): "the card the
 * audience already knows visibly becomes a live rule store." Both acts also
 * share `RULE_DIFF_TITLE` for the same reason — a title that silently
 * differed between the two renders would read as two different cards. */
const RULE_DIFF_ID = 'act2-rule-diff';
const RULE_DIFF_TITLE = `${policyDocument.id} → extracted rules`;

/** The remediation gate's id — exported so `stage.tsx` (Task 4, brief §6c)
 * matches its `approvalResolved` handler against a shared symbol instead of
 * a duplicated string literal. */
export const REMEDIATION_APPROVAL_ID = 'act3-approval-remediate';

/** "1,247" — thousands-grouped display for a raw count. No shared helper
 * for this exists yet in lib/agents/format.ts (only currency/date
 * formatters do, and that module is outside this file's ownership per the
 * task brief), so this mirrors the same `Intl.NumberFormat`-backed
 * convention every other formatter in the codebase already uses
 * (lib/agents/format.ts's own `currencyFormatter`;
 * components/registry/trend-chart.tsx's `toLocaleString()`) rather than
 * inventing a new one. */
const countFormatter = new Intl.NumberFormat('en-US');
function formatCount(n: number): string {
  return countFormatter.format(n);
}

/**
 * Act I — "The gap" (brief §3, ~60s at 1x). The stage opens cold: the
 * conversation rail is empty but for its own static system line
 * (conversation-rail.tsx's `EmptyState`), the agent graph is fully dim (no
 * `graphStep` fires anywhere below — there is no mechanism yet, so nothing
 * on the graph has anything to do), and the context rail shows the Manual
 * Audit card (context-rail.tsx's `ManualAuditCard`, itself a static
 * component, not scenario-driven).
 *
 * The three chat turns narrate exactly the Manual Audit card's own figures
 * in sentence form — a second modality on the same facts, not new ones:
 * nothing continuously checks authorized-user eligibility; the manual
 * sample is 40 accounts a month against 962 accounts that carry at least
 * one authorized user; at that rate one full sweep takes 24 months; none
 * has ever completed. Serious internal-servicing register throughout —
 * no fraud/AML language, no credit-decisioning language (brief §10).
 *
 * The brief's third Act I beat — "nothing here is broken... a rule that
 * only exists in a PDF is not a control" — is explicitly a *presenter*
 * beat ("no UI"): it is spoken live after this scripted content finishes
 * and the player has paused at Act II's marker, not typed into the rail.
 * Scripting it here would put words in the presenter's mouth and steal
 * their best line, so it is deliberately absent from this file.
 *
 * Pacing: delays are dead air by design — each one is sized for a
 * presenter to read/deliver the preceding line aloud before the next beat
 * lands, not for the typing effect itself (which is ~2s total across all
 * three turns at the 16ms/3-char default). Summing every delay plus the
 * typing effect lands Act I at ~56s at 1x, matching the brief's "~60
 * seconds" — the presenter bar's 2x control halves it for a rehearsal
 * pass.
 */
export function actOneSteps(): ScenarioStep[] {
  return [
    { type: 'actMarker', act: 1, title: 'The gap' },

    {
      type: 'chatTurn',
      delayMs: 4_000,
      id: 'act1-chat-no-mechanism',
      role: 'agent',
      text: 'No agent continuously checks authorized-user eligibility today. The only check running against this policy is a manual one.',
    },
    {
      type: 'chatTurn',
      delayMs: 11_000,
      id: 'act1-chat-sample-size',
      role: 'agent',
      text: 'Servicing samples forty accounts a month by hand, against a portfolio of 962 accounts carrying at least one authorized user.',
    },
    {
      type: 'chatTurn',
      delayMs: 11_000,
      id: 'act1-chat-coverage-math',
      role: 'agent',
      text: 'At that pace, one full sweep of the portfolio takes twenty-four months — and there is no completed full review on record.',
    },

    // The large-type counter beat (brief §3 Act I beat 2). The zeros are
    // the point: nothing has been scanned because nothing scans yet.
    {
      type: 'counterUpdate',
      delayMs: 15_000,
      counter: { scanned: 0, exceptions: 0, remediated: 0 },
      caption: '1,247 authorized-user relationships · 0 continuously monitored · 0 flagged',
    },

    // Keeps the audit strip non-empty through Act I (brief: "everything
    // writes to the Event Log," §5e) — the first entry of the run, logging
    // the coverage assessment the chat turns and the Manual Audit card both
    // just narrated.
    {
      type: 'auditWrite',
      delayMs: 13_000,
      entry: {
        runId: RUN_ID,
        agentId: AGENT_ID,
        step: 0,
        toolName: 'assessCoverage',
        actor: 'agent',
        kind: 'run.started',
        inputSummary: 'Portfolio: 962 accounts carrying an authorized user · 1,247 relationships',
        outputSummary: 'No continuous policy check active — manual sampling covers 40 accounts/month; 24 months to full coverage.',
      },
    },
  ];
}

// ---------------------------------------------------------------------------
// Act II content helpers — every string a rule row needs comes off
// `lib/sentinel/policy.ts` (CLAUDE.md: "Never retype policy text into the
// scenario — import it and read fields off it"). Nothing here is a policy
// sentence; these functions only map the fixture's shape onto
// `RuleDiffProps`'s shape (`sectionId` → the section's `heading`,
// `datasetsTouched` → a de-duplicated list) and stamp on the two fields the
// fixture doesn't carry — `validated` and `evaluability` — which are the
// SCENARIO's to set (registry.ts's `ruleDiffPropsSchema` doc comment: "set by
// the scenario step, never inferred client-side").
// ---------------------------------------------------------------------------

/** `PolicyRule.excerpt`/`PolicyObligationGap.excerpt` carry a `sectionId`;
 * `ruleDiffPropsSchema.excerpt` wants the section's `sectionHeading`. This is
 * the one and only place that lookup happens, so a section rename in the
 * fixture can never drift the Rule Diff card's citations out of sync with
 * the document preview sitting right next to it. */
function sectionHeading(sectionId: string): string {
  const section = policyDocument.sections.find((s) => s.id === sectionId);
  if (!section) throw new Error(`policy document has no section "${sectionId}"`);
  return section.heading;
}

/** One evaluable row (R1–R3). `validated` doubles as the reveal gate for
 * `criticNote`: the note IS the Critic's validation finding, so it has
 * nothing to say about a rule the Critic hasn't reached yet — the card
 * shows the drafted excerpt/plain-English/machine footer the instant Rule
 * Engineer drafts the row, then the critic note lands in the same beat the
 * ✓ Validated pill does (rule-diff.tsx's `validated` branch). */
function ruleDiffRow(rule: PolicyRule, validated: boolean): RuleDiffProps['rules'][number] {
  return {
    ruleId: rule.ruleId,
    title: rule.title,
    excerpt: { sectionHeading: sectionHeading(rule.excerpt.sectionId), quote: rule.excerpt.quote },
    plainEnglish: rule.plainEnglish,
    machine: rule.machine,
    ...(validated ? { criticNote: rule.criticNote } : {}),
    validated,
    evaluability: 'evaluable',
  };
}

/** The fourth row — `policyObligationGap` (O4), never a drafted rule: no
 * `machine` key at all (absent, not empty — rule-diff.tsx's whole point),
 * `validated: false` (there was never anything to validate), and
 * `evaluability: 'data-gap'`, which is what actually selects the renderer's
 * amber/muted branch (never inferred from the missing `machine`). */
function obligationGapRow(): RuleDiffProps['rules'][number] {
  return {
    ruleId: policyObligationGap.obligationId,
    title: policyObligationGap.title,
    excerpt: {
      sectionHeading: sectionHeading(policyObligationGap.excerpt.sectionId),
      quote: policyObligationGap.excerpt.quote,
    },
    plainEnglish: policyObligationGap.plainEnglish,
    criticNote: policyObligationGap.criticNote,
    validated: false,
    evaluability: 'data-gap',
  };
}

function ruleById(ruleId: PolicyRule['ruleId']): PolicyRule {
  const rule = policyRules.find((r) => r.ruleId === ruleId);
  if (!rule) throw new Error(`policyRules has no ${ruleId}`);
  return rule;
}

/** The four active rows (R1–R3 validated, O4 parked) — Act II's final
 * activation render and Act III's beat 1 re-render (with `storeMeta`
 * layered on top) both want exactly this array, so it lives here once
 * rather than being retyped in each act. */
function activeRuleDiffRows(): RuleDiffProps['rules'] {
  return [
    ruleDiffRow(ruleById('R1'), true),
    ruleDiffRow(ruleById('R2'), true),
    ruleDiffRow(ruleById('R3'), true),
    obligationGapRow(),
  ];
}

/** The union of every dataset the three active rules touch, in
 * first-appearance order across `policyRules` — Act II's drafting narration
 * and Act III's Data Collector captions (brief §3 Act III beat 2) both
 * derive their dataset language from this, never from typed prose, so both
 * acts stay honest about what the rule set actually reads. */
function unionDatasets(): string[] {
  const datasets: string[] = [];
  for (const rule of policyRules) {
    for (const dataset of rule.machine.datasetsTouched) {
      if (!datasets.includes(dataset)) datasets.push(dataset);
    }
  }
  return datasets;
}

/**
 * Act II — "Policy to production" (brief §3 Act II, ~2.5 min at 1x). Six
 * beats, in order:
 *
 *   1. The drop — a framing chatTurn, `policyPanel: 'drop'`, the hard
 *      `awaitStageAction('policy-drop')` gate (presenter clicks the mock
 *      file card), then `policyPanel: 'preview'` on resolution.
 *   2. The graph wakes — Orchestrator → Policy Analyst → Rule Engineer →
 *      Critic light in sequence, the animated edge tracking each handoff,
 *      narration streaming alongside. `GraphStep.detail` carries a per-node
 *      activity caption the whole way (a glow alone doesn't read from the
 *      back of a room) — Policy Analyst's caption names the actual section
 *      headings it's reading, Rule Engineer's names the actual datasets its
 *      drafted rules touch, both read off `policyRules`/`policyDocument`
 *      rather than typed as prose. Every node's caption clears (a
 *      `graphStep` with no `detail`) the moment that node is done.
 *   3. The Rule Diff — one `render` id (`RULE_DIFF_ID`), re-rendered eight
 *      times as the card visibly grows: R1, then R2, then R3 land drafted
 *      (Rule Engineer's beat); each flips `validated: true` with its
 *      `criticNote` attached as the Critic clears it one at a time; O4
 *      lands last as the `data-gap` row with no `machine` footer.
 *   4. The gate — `approval-gate` → `working`, then `awaitApproval` (hard
 *      block). Approving re-renders the same Rule Diff id `status: 'active'`
 *      and settles all six graph nodes to `armed` (brief: "approving
 *      *visibly* arms the system") — plus the agent-side `auditWrite`
 *      confirming what actually went live.
 *   5. The counter beat — `{ scanned: 0, exceptions: 0, remediated: 0 }`:
 *      nothing has been scanned yet, only activated. Act III's sweep does
 *      the scanning.
 *   6. Deliberately UNSCRIPTED, exactly as Act I's beat 3 is (this file's
 *      `actOneSteps` doc comment): the brief's closing line — "the fourth
 *      row is the important one... an agent that knows what it can't check
 *      is the one you can trust on what it says it can" — is the
 *      presenter's own best line, live, not typed into the rail.
 *
 * Pacing mirrors `actOneSteps`': every delay is dead air sized for a
 * presenter to talk over the preceding beat, not for the typing effect or
 * the graph transition itself, which land near-instantly under it. Serious
 * internal-servicing register throughout (brief §10): no fraud/AML framing,
 * no credit-decisioning language.
 */
export function actTwoSteps(): ScenarioStep[] {
  const r1 = ruleById('R1');
  const r2 = ruleById('R2');
  const r3 = ruleById('R3');

  // The four sections the extracted obligations actually cite, in citation
  // order — R1/R2/R3's `excerpt.sectionId` plus O4's, never a hand-copied
  // list of headings.
  const obligationSectionIds = [...policyRules.map((r) => r.excerpt.sectionId), policyObligationGap.excerpt.sectionId];
  const obligationHeadings = obligationSectionIds.map(sectionHeading);

  // The union of every dataset the three rules touch, in first-appearance
  // order — this is the reason Act III's Data Collector fires three times
  // (policy.ts's header comment), read off the rules themselves rather than
  // retyped.
  const datasets = unionDatasets();

  function ruleDiffRender(delayMs: number, status: RuleDiffProps['status'], rows: RuleDiffProps['rules']): ScenarioStep {
    return {
      type: 'render',
      delayMs,
      id: RULE_DIFF_ID,
      instruction: { component: 'RuleDiff', props: { title: RULE_DIFF_TITLE, status, rules: rows } },
    };
  }

  return [
    { type: 'actMarker', act: 2, title: 'Policy to production' },

    // --- Beat 1 — the drop ------------------------------------------------
    {
      type: 'chatTurn',
      delayMs: 8_000,
      id: 'act2-chat-frame',
      role: 'agent',
      text: "Drop the policy file in, and watch it move end to end — Policy Analyst reads it, Rule Engineer drafts machine-readable rules, and Critic checks every rule against what the SOE can actually support before anything goes live.",
    },
    { type: 'policyPanel', delayMs: 1_800, panel: 'drop' },
    { type: 'awaitStageAction', id: 'act2-await-drop', action: 'policy-drop' },
    { type: 'policyPanel', delayMs: 1_500, panel: 'preview' },

    // --- Beat 2 — the graph wakes: Orchestrator -----------------------------
    {
      type: 'graphStep',
      delayMs: 1_800,
      nodeId: 'orchestrator',
      nodeState: 'working',
      animatedEdges: [{ from: 'orchestrator', to: 'policy-analyst' }],
      detail: `Routing ${policyDocument.id}.docx to Policy Analyst`,
    },
    { type: 'graphStep', delayMs: 1_000, nodeId: 'orchestrator', nodeState: 'done' },

    // --- Policy Analyst: reading sections, extracting obligations ---------
    {
      type: 'chatTurn',
      delayMs: 9_000,
      id: 'act2-chat-analyst',
      role: 'agent',
      text: `Policy Analyst is reading ${obligationHeadings.join(', ')}.`,
    },
    {
      type: 'graphStep',
      delayMs: 8_500,
      nodeId: 'policy-analyst',
      nodeState: 'working',
      detail: `Reading ${obligationHeadings.join(', ')}`,
    },
    {
      type: 'graphStep',
      delayMs: 1_400,
      nodeId: 'policy-analyst',
      nodeState: 'done',
      animatedEdges: [{ from: 'policy-analyst', to: 'rule-engineer' }],
    },

    // --- Rule Engineer: drafting R1, R2, R3 --------------------------------
    {
      type: 'chatTurn',
      delayMs: 9_500,
      id: 'act2-chat-obligations',
      role: 'agent',
      text: `Four obligations extracted. Rule Engineer is drafting machine-readable rules against ${datasets.join(', ')}.`,
    },
    {
      type: 'graphStep',
      delayMs: 3_200,
      nodeId: 'rule-engineer',
      nodeState: 'working',
      detail: `Drafting rules against ${datasets.join(', ')}`,
    },
    // The document preview has done its job (Policy Analyst read it on
    // screen); close the drawer now so the context rail underneath — where
    // the Rule Diff is about to grow — is actually visible instead of
    // sitting behind it (policy-panel.tsx's drawer is `absolute inset-0
    // z-10` over the context rail; `PolicyPanel` never closes itself).
    { type: 'policyPanel', delayMs: 900, panel: 'closed' },
    ruleDiffRender(3_800, 'proposed', [ruleDiffRow(r1, false)]),
    ruleDiffRender(3_800, 'proposed', [ruleDiffRow(r1, false), ruleDiffRow(r2, false)]),
    ruleDiffRender(3_800, 'proposed', [ruleDiffRow(r1, false), ruleDiffRow(r2, false), ruleDiffRow(r3, false)]),
    {
      type: 'graphStep',
      delayMs: 1_400,
      nodeId: 'rule-engineer',
      nodeState: 'done',
      animatedEdges: [{ from: 'rule-engineer', to: 'critic' }],
    },

    // --- Critic: validating each rule against available SOE data ----------
    {
      type: 'chatTurn',
      delayMs: 7_000,
      id: 'act2-chat-critic',
      role: 'agent',
      text: "Critic is checking each drafted rule against what the SOE can actually support today — not what the policy hopes it can.",
    },
    { type: 'graphStep', delayMs: 2_400, nodeId: 'critic', nodeState: 'working', detail: `Validating ${r1.ruleId} against current SOE data` },
    ruleDiffRender(3_400, 'proposed', [ruleDiffRow(r1, true), ruleDiffRow(r2, false), ruleDiffRow(r3, false)]),
    { type: 'graphStep', delayMs: 2_400, nodeId: 'critic', nodeState: 'working', detail: `Validating ${r2.ruleId} against current SOE data` },
    ruleDiffRender(3_400, 'proposed', [ruleDiffRow(r1, true), ruleDiffRow(r2, true), ruleDiffRow(r3, false)]),
    { type: 'graphStep', delayMs: 2_400, nodeId: 'critic', nodeState: 'working', detail: `Validating ${r3.ruleId} against current SOE data` },
    ruleDiffRender(3_400, 'proposed', [ruleDiffRow(r1, true), ruleDiffRow(r2, true), ruleDiffRow(r3, true)]),

    // --- Critic parks O4 (brief §3 beat 6's credibility anchor) -----------
    {
      type: 'chatTurn',
      delayMs: 10_500,
      id: 'act2-chat-gap',
      role: 'agent',
      text: "One obligation doesn't clear that check. Consent and authorization needs a documented-consent dataset the SOE doesn't carry, so Critic is parking it instead of guessing — it stays an obligation on record, not a rule enforced blind.",
    },
    {
      type: 'graphStep',
      delayMs: 2_600,
      nodeId: 'critic',
      nodeState: 'working',
      detail: `Parking ${policyObligationGap.obligationId} — ${policyObligationGap.requiredData.join(', ')} not onboarded`,
    },
    ruleDiffRender(3_800, 'proposed', [
      ruleDiffRow(r1, true),
      ruleDiffRow(r2, true),
      ruleDiffRow(r3, true),
      obligationGapRow(),
    ]),
    {
      type: 'graphStep',
      delayMs: 1_700,
      nodeId: 'critic',
      nodeState: 'done',
      animatedEdges: [{ from: 'critic', to: 'approval-gate' }],
    },

    // --- Beat 4 — the gate --------------------------------------------------
    {
      type: 'chatTurn',
      delayMs: 8_500,
      id: 'act2-chat-gate',
      role: 'agent',
      text: "Three rules are drafted and validated. One obligation stays parked until consent records are onboarded. Activate the three, and continuous enforcement starts the moment you approve.",
    },
    { type: 'graphStep', delayMs: 1_700, nodeId: 'approval-gate', nodeState: 'working' },
    {
      type: 'awaitApproval',
      id: 'act2-approval-activate',
      payload: {
        approvalId: 'act2-approval-activate',
        toolName: 'activateRules',
        title: 'Activate authorized-user policy rules',
        description: 'Activate 3 rules for continuous enforcement. 1 obligation parked pending data onboarding.',
        rationale:
          'R1, R2, and R3 validate cleanly against current SOE data. O4 (consent on file) has no supporting dataset yet, so it stays parked rather than enforced on a guess.',
        evidence: [RULE_DIFF_TITLE],
      },
      audit: {
        runId: RUN_ID,
        agentId: AGENT_ID,
        step: 1,
        toolName: 'activateRules',
        inputSummary:
          'Requesting activation: R1 product eligibility, R2 account standing, R3 minimum age. O4 consent-on-file parked as a data gap.',
        outputSummary: 'Human decision recorded for rule activation.',
      },
    },

    // On approval: the card flips active, then all six nodes settle to
    // `armed` — "approving visibly arms the system" (brief §3 beat 4).
    ruleDiffRender(1_400, 'active', activeRuleDiffRows()),
    { type: 'graphStep', delayMs: 400, nodeId: 'orchestrator', nodeState: 'armed' },
    { type: 'graphStep', delayMs: 350, nodeId: 'policy-analyst', nodeState: 'armed' },
    { type: 'graphStep', delayMs: 350, nodeId: 'rule-engineer', nodeState: 'armed' },
    { type: 'graphStep', delayMs: 350, nodeId: 'data-collector', nodeState: 'armed' },
    { type: 'graphStep', delayMs: 350, nodeId: 'critic', nodeState: 'armed' },
    { type: 'graphStep', delayMs: 400, nodeId: 'approval-gate', nodeState: 'armed', animatedEdges: [] },

    {
      type: 'auditWrite',
      delayMs: 1_500,
      entry: {
        runId: RUN_ID,
        agentId: AGENT_ID,
        step: 2,
        toolName: 'activateRules',
        actor: 'agent',
        kind: 'action.executed',
        inputSummary: 'Approval granted (act2-approval-activate).',
        outputSummary:
          '3 rules active — R1 product eligibility, R2 account standing, R3 minimum age. O4 consent-on-file remains parked pending consent-documents dataset onboarding.',
      },
    },

    // --- Beat 5 — the counter ------------------------------------------------
    {
      type: 'counterUpdate',
      delayMs: 3_000,
      counter: { scanned: 0, exceptions: 0, remediated: 0 },
      caption: 'Policy → production: 4 obligations extracted · 3 rules active · 1 data gap · 1 human approval',
    },

    // Beat 6 — brief §3 Act II beat 6 ("the fourth row is the important
    // one...") is a presenter beat with no UI, exactly like Act I's beat 3
    // (`actOneSteps`'s doc comment). Deliberately absent here.
  ];
}

// ---------------------------------------------------------------------------
// Act III content helpers — every figure below comes off `AuExceptionFixture`
// (`lib/sentinel/exception-fixture.ts`'s `getAuExceptionFixture()`) or
// `getAuScanPortfolio()` (`lib/soe`), never a typed literal (task rules: "no
// number, name, or date typed as a literal into the scenario"). Account IDs
// are the one exception — `'acct-patel'` is an IDENTIFIER, not a figure,
// and hardcoding it mirrors the codebase's own established precedent
// (lib/agents/servicing/identity.ts's `PINNED_ACCOUNT_ID`,
// lib/agents/au-growth/script.ts's `FALLBACK_ACCOUNT_ID` — both the same
// literal, for the same account, for the same reason).
// ---------------------------------------------------------------------------

const PATEL_ACCOUNT_ID = 'acct-patel';

/** "Anand Patel" → "Patel" — mirrors exception-fixture.ts's own (unexported,
 * server-only-private) `surname()` helper. Duplicated rather than imported:
 * that module's whole point is to be the single derivation behind the
 * exception rows (its own header comment), and this is the one other place
 * in the codebase that needs the same "last whitespace-delimited token"
 * convention every seed name in this file's orbit follows. */
function surnameOf(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts[parts.length - 1] ?? fullName;
}

/** Three "calls," in the fixed order the brief narrates them (§3 Act III
 * beat 2: "accounts, party roles + parties, payment history") — but the
 * dataset NAMES inside each label are read off `policyRules[].machine.
 * datasetsTouched` (via `unionDatasets()`, shared with Act II's own
 * narration), not typed as prose divorced from the rule set. `account-
 * party-roles` and `parties` are grouped into one call because a role row
 * is meaningless without the party it names — a real Data Collector reads
 * them together. Throws if the rule set's dataset shape ever changes out
 * from under this grouping, rather than silently mislabeling the graph. */
function dataCollectorCallLabels(): [string, string, string] {
  const datasets = unionDatasets();
  const expected = ['accounts', 'account-party-roles', 'payments', 'parties'];
  if (datasets.length !== expected.length || !expected.every((d) => datasets.includes(d))) {
    throw new Error(
      `actThreeSteps: policyRules' dataset set changed (${datasets.join(', ')}) — the Data Collector's three-call grouping needs re-deriving`,
    );
  }
  return ['accounts', 'party roles + parties', 'payment history'];
}

/** One RuleCitation card per rule id's short name, read straight off the
 * fixture's own rows (`AuExceptionRow.ruleShortName`) rather than
 * retyping `lib/sentinel/exception-fixture.ts`'s private `RULE_SHORT_NAME`
 * table. Throws if a rule id has zero rows — every one of R1/R2/R3 has at
 * least one exception in this fixture (au-portfolio's design, brief §5d),
 * so an empty result here means the seed changed underneath this file. */
function ruleShortName(fixture: AuExceptionFixture, ruleId: PolicyRule['ruleId']): string {
  const row = fixture.rows.find((r) => r.ruleId === ruleId);
  if (!row) throw new Error(`actThreeSteps: fixture has no ${ruleId} row to read a short name off`);
  return row.ruleShortName;
}

/** Builds the RuleCitation card for the Patel household's compliance pass
 * (brief §3 Act III beat 5) by DERIVING it — not assuming it: pulls Patel's
 * actual authorized-user roles off `getAuScanPortfolio()` and confirms the
 * account appears in ZERO fixture exception rows. Both assumptions are
 * asserted with a throw, not a comment, so a future seed or evaluator
 * change that ever put Patel into the exception set fails the build loudly
 * instead of rendering the demo's one hand-checkable row as a lie
 * (mirrored in demo-scenario.test.ts). */
async function buildPatelComplianceCitation(fixture: AuExceptionFixture): Promise<RuleCitationProps> {
  const scan = await getAuScanPortfolio();

  const patelAccount = scan.accounts.find((a) => a.accountId === PATEL_ACCOUNT_ID);
  const patelAuRoles = scan.roles.filter(
    (r) => r.accountId === PATEL_ACCOUNT_ID && r.role === 'AUTHORIZED_USER',
  );
  if (!patelAccount || patelAuRoles.length === 0) {
    throw new Error(`actThreeSteps: Patel household (${PATEL_ACCOUNT_ID}) missing from the AU scan portfolio`);
  }
  if (patelAccount.securedCard) {
    throw new Error(
      `actThreeSteps: Patel household (${PATEL_ACCOUNT_ID}) is flagged securedCard — the beat 5 compliance-pass assumption (brief §3) is violated`,
    );
  }
  const patelInExceptions = fixture.rows.some((row) => row.accountId === PATEL_ACCOUNT_ID);
  if (patelInExceptions) {
    throw new Error(
      `actThreeSteps: Patel household (${PATEL_ACCOUNT_ID}) unexpectedly appears in the exception fixture — the beat 5 compliance-pass assumption (brief §3) is violated`,
    );
  }

  const auNames = patelAuRoles.map((role) => {
    const party = scan.parties.find((p) => p.partyId === role.partyId);
    if (!party) throw new Error(`actThreeSteps: unknown party ${role.partyId} on the Patel account`);
    return party.fullName;
  });
  const primaryRole = scan.roles.find((r) => r.accountId === PATEL_ACCOUNT_ID && r.role === 'PRIMARY');
  const primaryParty = primaryRole ? scan.parties.find((p) => p.partyId === primaryRole.partyId) : undefined;
  const householdLabel = primaryParty ? `${surnameOf(primaryParty.fullName)} household` : PATEL_ACCOUNT_ID;

  return {
    ruleId: 'R1–R3',
    title: `Compliance pass — ${householdLabel}`,
    // Concatenated verbatim rule text — each sentence is an exact substring
    // of `policyRules[].plainEnglish`, quoted, not paraphrased, exactly as
    // a single-rule RuleCitation quotes its one rule.
    ruleText: policyRules.map((rule) => rule.plainEnglish).join(' '),
    verdict: 'pass',
    checks: [
      {
        label: `${auNames.length} authorized users on file`,
        detail: auNames.join(' · '),
        met: true,
      },
      {
        label: `${ruleById('R1').ruleId} — Product eligibility`,
        detail: 'Account is not a secured card',
        met: true,
      },
      {
        label: `${ruleById('R2').ruleId} — Account standing`,
        detail: 'No exception raised for either relationship at its date of addition',
        met: true,
      },
      {
        label: `${ruleById('R3').ruleId} — Minimum age at addition`,
        detail: 'No exception raised for either relationship at its date of addition',
        met: true,
      },
    ],
  };
}

/** Manual-audit throughput (brief §3 Act I beat 1 / context-rail.tsx's
 * `ManualAuditCard`): 40 accounts a month. This is a fixed OPERATIONAL
 * constant, not one of the seven fixture-derived figures the task brief
 * prohibits hardcoding — it doesn't come from `AuExceptionFixture` because
 * it isn't a fact about the exception scan at all, it's a fact about the
 * manual process the scan is being compared against (already a literal in
 * `actOneSteps`'s own narration and in `context-rail.tsx`'s static card).
 * The "two-month backlog" DecisionCard rationale below derives its own
 * figure by dividing the fixture's `accountsAffected` by this rate. */
const MANUAL_AUDIT_ACCOUNTS_PER_MONTH = 40;

/** `remove-all` / `stage-for-review` / `remove-and-notify` — the three
 * compliant response routes brief §3 Act III beat 6 lays out. Label/summary
 * are fixed editorial copy (model-authored framing, brief §5a — there is no
 * number here to derive); `rationale` is supplied per-render below, once a
 * route leaves `'considering'`. */
const DECISION_OPTION_COPY = {
  'remove-all': {
    label: 'Remove all relationships, no notice',
    summary: 'Remove every flagged authorized user immediately, with no cardholder notification.',
  },
  'stage-for-review': {
    label: 'Stage for manual review',
    summary: 'Queue every exception into the existing manual audit process instead of acting now.',
  },
  'remove-and-notify': {
    label: 'Remove and notify',
    summary:
      'Remove the flagged relationships and notify each primary cardholder with the policy citation and the reinstatement path.',
  },
} as const;

type DecisionOptionId = keyof typeof DECISION_OPTION_COPY;
type DecisionOptionStatus = DecisionCardProps['options'][number]['status'];

function decisionOption(
  id: DecisionOptionId,
  status: DecisionOptionStatus,
  rationale?: string,
): DecisionCardProps['options'][number] {
  return { id, ...DECISION_OPTION_COPY[id], status, rationale };
}

/** Maps `AuExceptionRow`s onto the row shape BOTH `PolicyExceptionTable` and
 * `RemediationReport` expect (`lib/sentinel/registry.ts`'s
 * `auExceptionRowSchema` — the exact same zod shape backs both props types),
 * so the sweep table and the post-approval receipt can never render the
 * fixture's fields differently. One mapping, not two. */
function toExceptionRows(rows: AuExceptionFixture['rows']): PolicyExceptionTableProps['rows'] {
  return rows.map((row) => ({
    accountLabel: row.accountLabel,
    authorizedUser: row.authorizedUser,
    ruleId: row.ruleId,
    ruleShortName: row.ruleShortName,
    finding: row.finding,
    addedDate: row.addedDate,
  }));
}

/** `rem-${reportId}` — mirrors `app/api/sentinel/remediate/route.ts`'s own
 * `buildConfirmationId` EXACTLY (same template, same source field), so the
 * scripted RemediationReport card and the real POST's response can never
 * drift: both are pure functions of the SAME `fixture.reportId`
 * (demo-scenario.test.ts asserts the two are byte-identical). Duplicated
 * rather than imported — `app/api/**` is a route module (forbidden to this
 * file's ownership besides), not a shared library; Next.js route files
 * export only HTTP handlers. */
function remediationConfirmationId(reportId: string): string {
  return `rem-${reportId}`;
}

/**
 * Act III — "The sweep" (brief §3 Act III, ~3 min at 1x). Nine beats:
 *
 *   1. The rule store + the prompt — Act II's Rule Diff card re-renders
 *      under the SAME id with `storeMeta` set (brief §6d: "the recurring
 *      trigger is a label, not a mechanism"), then the conversation rail's
 *      `awaitStageAction: 'prompt'` gate hard-blocks until the presenter
 *      submits (scripted OR typed — the player never string-matches,
 *      wire-contract §9.2).
 *   2. The sweep ignites — Orchestrator wakes, then Data Collector fires
 *      three times, visibly, each call captioned with the dataset it's
 *      actually reading (`dataCollectorCallLabels()`, derived from
 *      `policyRules[].machine.datasetsTouched`).
 *   3. Aggregate evidence lands progressively: MetricRow (the scan
 *      rollup), BarBreakdown (`unit: 'count'`, by rule), PolicyExceptionTable
 *      (12 of 87 rows) — three separate `render` ids, in sequence.
 *   4. The drill-down — a RuleCitation for one deterministic R1 exemplar
 *      (the first R1 row in the fixture's own stable sort), quoting R1
 *      verbatim with both conditions confirmed.
 *   5. The compliance pass — the Patel household's quiet green check,
 *      DERIVED off `getAuScanPortfolio()` + confirmed absent from every
 *      fixture row (`buildPatelComplianceCitation`), never assumed.
 *   6. The decision point — one DecisionCard id, re-rendered four times as
 *      the three routes resolve one at a time in the brief's fixed order:
 *      `remove-all` rejected, then `stage-for-review` rejected (echoing Act
 *      I's own manual-audit throughput, derived), then `remove-and-notify`
 *      selected.
 *   7. The gate — `awaitApproval` on `REMEDIATION_APPROVAL_ID`, using P3a's
 *      widened `scope`/`reviewList` fields, carrying `onDeny` (Task 1): a
 *      short closing branch that executes nothing.
 *   8. Execution and the report — on approval, the graph works, then a
 *      RemediationReport renders with a `confirmationId` derived the exact
 *      same way `POST /api/sentinel/remediate` derives its own (both pure
 *      functions of `fixture.reportId`), plus a download link and streamed
 *      `auditWrite` entries.
 *   9. The closing counter — a quiet mid-act tick right after the scan
 *      (`remediated: 0`, no caption), then the large-type closing beat with
 *      `remediated` = the fixture's total, all figures fixture-derived.
 *
 * Pacing mirrors `actOneSteps`'/`actTwoSteps`' established rhythm: delays
 * are dead air sized for a presenter to talk over the preceding beat.
 * Serious internal-servicing register throughout (brief §10): no fraud/AML
 * framing, no credit-decisioning language — "declined" appears only for the
 * PRESENTER declining an approval, never as a decision about a person.
 */
export async function actThreeSteps(): Promise<ScenarioStep[]> {
  const fixture = await getAuExceptionFixture();
  const patelCitation = await buildPatelComplianceCitation(fixture);

  const METRIC_ROW_ID = 'act3-metric-row';
  const BAR_BREAKDOWN_ID = 'act3-bar-breakdown';
  const EXCEPTION_TABLE_ID = 'act3-exception-table';
  const RULE_CITATION_R1_ID = 'act3-rule-citation-r1';
  const RULE_CITATION_PATEL_ID = 'act3-rule-citation-patel';
  const DECISION_CARD_ID = 'act3-decision-card';
  const REMEDIATION_REPORT_ID = 'act3-remediation-report';

  const EXCEPTION_TABLE_TITLE = 'Authorized-user policy exceptions — full sweep';
  const DECISION_CARD_TITLE = `Response to ${formatCount(fixture.totalExceptions)} policy exceptions`;
  const REMEDIATION_TOOL_NAME = 'remediateAuExceptions';

  const EXCEPTION_ROWS_SHOWN = 12;
  const REVIEW_LIST_LIMIT = 25; // reviewListPropsSchema's own cap (lib/registry/schemas.ts)

  const shownRows = fixture.rows.slice(0, EXCEPTION_ROWS_SHOWN);
  const exceptionTableFootnote = `Showing ${shownRows.length} of ${formatCount(fixture.totalExceptions)} exceptions.`;

  // --- Beat 2 content: the three Data Collector calls ---------------------
  const [call1, call2, call3] = dataCollectorCallLabels();

  // --- Beat 3 content: the by-rule split -----------------------------------
  const ruleIds: PolicyRule['ruleId'][] = ['R1', 'R2', 'R3'];

  // --- Beat 4 content: the deterministic R1 exemplar -----------------------
  // "The first R1 row in its stable sort" (brief §3 beat 4) — the fixture's
  // rows are already sorted (accountId, partyId, ruleId) by the evaluator
  // (au-exceptions.ts), so `.find()` is a deterministic, never-random pick.
  const r1Exemplar = fixture.rows.find((row) => row.ruleId === 'R1');
  if (!r1Exemplar) throw new Error('actThreeSteps: fixture has no R1 exception to cite as the exemplar');
  const r1 = ruleById('R1');

  // --- Beat 6 content: the two-month backlog, derived ----------------------
  const manualBacklogMonths = Math.ceil(fixture.accountsAffected / MANUAL_AUDIT_ACCOUNTS_PER_MONTH);
  const removeAllRationale =
    'Removing spend authority with no notice to the primary is an unexplained service change — it generates inbound call volume and gives the cardholder nothing to act on.';
  const stageForReviewRationale = `The manual queue clears ${formatCount(MANUAL_AUDIT_ACCOUNTS_PER_MONTH)} accounts a month; ${formatCount(fixture.accountsAffected)} accounts is a ${manualBacklogMonths}-month backlog, and every exception stays live in the meantime.`;
  const removeAndNotifyRationale = `Removes the ${formatCount(fixture.totalExceptions)} flagged relationships and gives each of the ${formatCount(fixture.accountsAffected)} primary cardholders a citation and a path back. Still requires human approval before anything executes.`;

  function decisionCardRender(delayMs: number, options: DecisionCardProps['options']): ScenarioStep {
    return {
      type: 'render',
      delayMs,
      id: DECISION_CARD_ID,
      instruction: {
        component: 'DecisionCard',
        props: {
          title: DECISION_CARD_TITLE,
          subtitle: 'The findings are deterministic. The response is a judgment call.',
          options,
          footnote: 'Whichever route is selected requires human approval before anything executes.',
        },
      },
    };
  }

  // --- Beat 7 content: the remediation gate --------------------------------
  const remediationSummary = `Remove ${formatCount(fixture.totalExceptions)} authorized users from ${formatCount(fixture.accountsAffected)} accounts and notify ${formatCount(fixture.accountsAffected)} primary cardholders`;
  const reviewListRows = fixture.rows.slice(0, REVIEW_LIST_LIMIT).map((row) => ({
    primary: row.accountLabel,
    secondary: `AU: ${row.authorizedUser}`,
    detail: row.ruleShortName,
  }));

  // --- Beat 8 content: execution + the report ------------------------------
  const confirmationId = remediationConfirmationId(fixture.reportId);
  const downloadUrl = `/api/sentinel/report?reportId=${fixture.reportId}`;

  const closingCaption = `${formatCount(fixture.relationshipsScanned)} scanned · ${formatCount(fixture.totalExceptions)} exceptions · ${formatCount(fixture.accountsAffected)} accounts · 1 human approval · full audit trail`;

  const approvalStep: AwaitApprovalStep = {
    type: 'awaitApproval',
    id: REMEDIATION_APPROVAL_ID,
    payload: {
      approvalId: REMEDIATION_APPROVAL_ID,
      toolName: REMEDIATION_TOOL_NAME,
      title: 'Remove and notify — authorized-user policy exceptions',
      description: `${remediationSummary}.`,
      rationale:
        '"Remove and notify" was the selected response: remove the relationships, and give every primary cardholder the policy citation and the reinstatement path.',
      evidence: [EXCEPTION_TABLE_TITLE, DECISION_CARD_TITLE],
      scope: {
        summary: `${remediationSummary}.`,
        counts: [
          { label: 'Authorized users removed', value: formatCount(fixture.totalExceptions) },
          { label: 'Accounts touched', value: formatCount(fixture.accountsAffected) },
          { label: 'Cardholders notified', value: formatCount(fixture.accountsAffected) },
        ],
      },
      reviewList: {
        label: `Review the list (${formatCount(fixture.totalExceptions)})`,
        rows: reviewListRows,
        footnote: `Showing ${reviewListRows.length} of ${formatCount(fixture.totalExceptions)}.`,
      },
    },
    audit: {
      runId: RUN_ID,
      agentId: AGENT_ID,
      step: 3,
      toolName: REMEDIATION_TOOL_NAME,
      inputSummary: `${remediationSummary}.`,
      outputSummary: 'Human decision recorded for AU policy remediation.',
    },
    // Task 1 — brief §3: "Reject path must work on demand." Nothing below
    // executes; the run closes with a logged disposition instead.
    onDeny: [
      {
        type: 'chatTurn',
        delayMs: 3_000,
        id: 'act3-chat-declined',
        role: 'agent',
        text: 'Nothing executed. The run is closed and the disposition is recorded in the audit trail.',
      },
      {
        type: 'auditWrite',
        delayMs: 1_500,
        entry: {
          runId: RUN_ID,
          agentId: AGENT_ID,
          step: 4,
          toolName: REMEDIATION_TOOL_NAME,
          actor: 'agent',
          kind: 'run.finished',
          inputSummary: 'Remediation declined.',
          outputSummary: 'Closed without action — 0 relationships removed, 0 notifications queued.',
        },
      },
      {
        type: 'counterUpdate',
        delayMs: 1_500,
        counter: { scanned: fixture.relationshipsScanned, exceptions: fixture.totalExceptions, remediated: 0 },
        caption: `${formatCount(fixture.relationshipsScanned)} scanned · ${formatCount(fixture.totalExceptions)} exceptions · 0 remediated · declined, disposition recorded`,
      },
    ],
  };

  return [
    { type: 'actMarker', act: 3, title: 'The sweep' },

    // --- Beat 1 — the rule store + the prompt ------------------------------
    {
      type: 'chatTurn',
      delayMs: 6_000,
      id: 'act3-chat-store-live',
      role: 'agent',
      text: 'The rule store is live — continuous enforcement, nightly at 02:00 UTC, last run four hours ago. Ask it to find every current exception.',
    },
    {
      type: 'render',
      delayMs: 1_600,
      id: RULE_DIFF_ID,
      instruction: {
        component: 'RuleDiff',
        props: {
          title: RULE_DIFF_TITLE,
          status: 'active',
          storeMeta: 'Rule store · continuous · nightly 02:00 UTC · last run 4h ago',
          rules: activeRuleDiffRows(),
        },
      },
    },
    {
      type: 'awaitStageAction',
      id: 'act3-await-prompt',
      action: 'prompt',
      suggested: 'Find me all the authorized user policy exceptions.',
    },

    // --- Beat 2 — the sweep ignites ------------------------------------------
    {
      type: 'graphStep',
      delayMs: 1_500,
      nodeId: 'orchestrator',
      nodeState: 'working',
      animatedEdges: [{ from: 'orchestrator', to: 'data-collector' }],
      detail: 'Routing the sweep across the active rule set',
    },
    {
      type: 'chatTurn',
      delayMs: 8_000,
      id: 'act3-chat-wake',
      role: 'agent',
      text: 'Waking the rule set — three active rules, three datasets, one pass across the whole book.',
    },
    { type: 'graphStep', delayMs: 1_200, nodeId: 'orchestrator', nodeState: 'armed' },

    {
      type: 'graphStep',
      delayMs: 1_800,
      nodeId: 'data-collector',
      nodeState: 'working',
      animatedEdges: [{ from: 'data-collector', to: 'critic' }],
      detail: `call 1 of 3 · ${call1}`,
    },
    { type: 'graphStep', delayMs: 2_600, nodeId: 'data-collector', nodeState: 'armed' },
    {
      type: 'graphStep',
      delayMs: 1_400,
      nodeId: 'data-collector',
      nodeState: 'working',
      detail: `call 2 of 3 · ${call2}`,
    },
    { type: 'graphStep', delayMs: 2_600, nodeId: 'data-collector', nodeState: 'armed' },
    {
      type: 'graphStep',
      delayMs: 1_400,
      nodeId: 'data-collector',
      nodeState: 'working',
      detail: `call 3 of 3 · ${call3}`,
    },
    { type: 'graphStep', delayMs: 2_600, nodeId: 'data-collector', nodeState: 'armed' },

    {
      type: 'chatTurn',
      delayMs: 9_000,
      id: 'act3-chat-scanned',
      role: 'agent',
      text: `${formatCount(fixture.relationshipsScanned)} relationships across ${formatCount(fixture.accountsScanned)} accounts, read once each. Checking every one against R1 through R3 now.`,
    },
    {
      type: 'graphStep',
      delayMs: 1_600,
      nodeId: 'critic',
      nodeState: 'working',
      detail: 'Evaluating every relationship against R1, R2, R3',
    },

    // Quiet mid-act tick (brief §3 beat 9, first half) — the tiles now show
    // the real scan, before the closing beat states it in large type.
    {
      type: 'counterUpdate',
      delayMs: 1_800,
      counter: { scanned: fixture.relationshipsScanned, exceptions: fixture.totalExceptions, remediated: 0 },
    },

    // --- Beat 3 — aggregate evidence, progressively --------------------------
    {
      type: 'render',
      delayMs: 2_400,
      id: METRIC_ROW_ID,
      instruction: {
        component: 'MetricRow',
        props: {
          metrics: [
            { label: 'Relationships Scanned', value: formatCount(fixture.relationshipsScanned), tone: 'neutral' },
            { label: 'Accounts Scanned', value: formatCount(fixture.accountsScanned), tone: 'neutral' },
            { label: 'Exceptions', value: formatCount(fixture.totalExceptions), tone: 'warning' },
            { label: 'Accounts Affected', value: formatCount(fixture.accountsAffected), tone: 'warning' },
          ],
        },
      },
    },
    {
      type: 'chatTurn',
      delayMs: 7_000,
      id: 'act3-chat-byrule',
      role: 'agent',
      text: 'Broken out by rule — product eligibility carries the most weight, account standing and minimum age make up the rest.',
    },
    {
      type: 'render',
      delayMs: 2_400,
      id: BAR_BREAKDOWN_ID,
      instruction: {
        component: 'BarBreakdown',
        props: {
          title: 'Exceptions by rule',
          unit: 'count',
          bars: ruleIds.map((ruleId) => {
            const rule = ruleById(ruleId);
            const byRule = fixture.byRule[ruleId];
            return {
              label: rule.title,
              value: byRule.relationships,
              display: formatCount(byRule.relationships),
              detail: `${ruleShortName(fixture, ruleId)} · ${formatCount(byRule.accounts)} accounts affected`,
              tone: 'warning' as const,
            };
          }),
          footnote: `${formatCount(fixture.totalExceptions)} exceptions across ${formatCount(fixture.accountsAffected)} accounts.`,
        },
      },
    },
    {
      type: 'render',
      delayMs: 2_600,
      id: EXCEPTION_TABLE_ID,
      instruction: {
        component: 'PolicyExceptionTable',
        props: {
          title: EXCEPTION_TABLE_TITLE,
          rows: toExceptionRows(shownRows),
          footnote: exceptionTableFootnote,
        },
      },
    },

    // --- Beat 4 — the drill-down ----------------------------------------------
    {
      type: 'chatTurn',
      delayMs: 9_000,
      id: 'act3-chat-exemplar',
      role: 'agent',
      text: `Here's one exemplar, cited rather than summarized — ${r1Exemplar.accountLabel}, R1.`,
    },
    {
      type: 'render',
      delayMs: 2_000,
      id: RULE_CITATION_R1_ID,
      instruction: {
        component: 'RuleCitation',
        props: {
          ruleId: r1.ruleId,
          title: sectionHeading(r1.excerpt.sectionId),
          ruleText: r1.plainEnglish,
          verdict: 'violation',
          checks: [
            { label: 'Account product is a secured card', detail: r1Exemplar.finding, met: true },
            {
              label: 'Authorized-user relationship remains on the account',
              detail: `${r1Exemplar.authorizedUser} added ${r1Exemplar.addedDate}`,
              met: true,
            },
          ],
        },
      },
    },

    // --- Beat 5 — the compliance pass (~15s) ----------------------------------
    {
      type: 'chatTurn',
      delayMs: 8_000,
      id: 'act3-chat-patel-frame',
      role: 'agent',
      text: 'One more check before the decision — the sweep verifies compliance, not only violations.',
    },
    {
      type: 'render',
      delayMs: 7_000,
      id: RULE_CITATION_PATEL_ID,
      instruction: { component: 'RuleCitation', props: patelCitation },
    },

    // --- Beat 6 — the decision point -------------------------------------------
    {
      type: 'chatTurn',
      delayMs: 9_000,
      id: 'act3-chat-decision-frame',
      role: 'agent',
      text: 'Three compliant routes from here. The findings are deterministic; the response is a judgment call.',
    },
    decisionCardRender(2_200, [
      decisionOption('remove-all', 'considering'),
      decisionOption('stage-for-review', 'considering'),
      decisionOption('remove-and-notify', 'considering'),
    ]),
    {
      type: 'chatTurn',
      delayMs: 8_000,
      id: 'act3-chat-decision-remove-all',
      role: 'agent',
      text: 'Removing every relationship with no notice is out — it is an unexplained service change with nothing for the cardholder to act on.',
    },
    decisionCardRender(2_200, [
      decisionOption('remove-all', 'rejected', removeAllRationale),
      decisionOption('stage-for-review', 'considering'),
      decisionOption('remove-and-notify', 'considering'),
    ]),
    {
      type: 'chatTurn',
      delayMs: 9_000,
      id: 'act3-chat-decision-stage',
      role: 'agent',
      text: 'Staging for the existing manual queue is out too — that queue is the very gap Act I opened with.',
    },
    decisionCardRender(2_200, [
      decisionOption('remove-all', 'rejected', removeAllRationale),
      decisionOption('stage-for-review', 'rejected', stageForReviewRationale),
      decisionOption('remove-and-notify', 'considering'),
    ]),
    {
      type: 'chatTurn',
      delayMs: 8_000,
      id: 'act3-chat-decision-selected',
      role: 'agent',
      text: 'Remove and notify: take the access away and give every cardholder a citation and a path back. Still needs your approval.',
    },
    decisionCardRender(2_200, [
      decisionOption('remove-all', 'rejected', removeAllRationale),
      decisionOption('stage-for-review', 'rejected', stageForReviewRationale),
      decisionOption('remove-and-notify', 'selected', removeAndNotifyRationale),
    ]),

    // --- Beat 7 — the gate ------------------------------------------------------
    { type: 'graphStep', delayMs: 1_700, nodeId: 'approval-gate', nodeState: 'working' },
    approvalStep,

    // --- Beat 8 — execution and the report (approve path only; onDeny above
    //     replaces everything from here down on a denial) ----------------------
    { type: 'graphStep', delayMs: 1_200, nodeId: 'approval-gate', nodeState: 'armed' },
    {
      type: 'chatTurn',
      delayMs: 2_500,
      id: 'act3-chat-executing',
      role: 'agent',
      text: 'Approved. Executing the removals and queuing notifications now.',
    },
    {
      // Orchestrator, not Data Collector — the fetch phase (beat 2) is over;
      // this is the execution phase. Keeping this off `data-collector` also
      // keeps its "fires three times" signature (beat 2) unambiguous: three
      // captioned working pulses, not four (demo-scenario.test.ts's "Data
      // Collector fires exactly three times" invariant).
      type: 'graphStep',
      delayMs: 2_000,
      nodeId: 'orchestrator',
      nodeState: 'working',
      detail: 'Executing removals · queuing notifications',
    },
    { type: 'graphStep', delayMs: 1_400, nodeId: 'orchestrator', nodeState: 'armed' },
    {
      type: 'render',
      delayMs: 2_200,
      id: REMEDIATION_REPORT_ID,
      instruction: {
        component: 'RemediationReport',
        props: {
          title: 'Remediation complete — authorized-user policy',
          counters: [
            { label: 'Authorized users removed', value: formatCount(fixture.totalExceptions) },
            { label: 'Accounts touched', value: formatCount(fixture.accountsAffected) },
            { label: 'Notifications queued', value: formatCount(fixture.accountsAffected) },
          ],
          confirmationId,
          rows: toExceptionRows(shownRows),
          footnote: exceptionTableFootnote,
          downloadUrl,
        },
      },
    },
    {
      type: 'auditWrite',
      delayMs: 1_500,
      entry: {
        runId: RUN_ID,
        agentId: AGENT_ID,
        step: 4,
        toolName: REMEDIATION_TOOL_NAME,
        actor: 'agent',
        kind: 'action.executed',
        inputSummary: `${remediationSummary}.`,
        outputSummary: `confirmationId ${confirmationId} · reportId ${fixture.reportId} · ${formatCount(fixture.accountsAffected)} notifications queued`,
      },
    },
    {
      type: 'chatTurn',
      delayMs: 3_000,
      id: 'act3-chat-closing',
      role: 'agent',
      text: `The report is on record in the audit table — confirmation ${confirmationId} — and the same file is available for download.`,
    },

    // --- Beat 9 — the closing counter (second half) -----------------------------
    {
      type: 'counterUpdate',
      delayMs: 2_000,
      counter: {
        scanned: fixture.relationshipsScanned,
        exceptions: fixture.totalExceptions,
        remediated: fixture.totalExceptions,
      },
      caption: closingCaption,
    },
  ];
}

/** Assembles the full three-act demo (brief §3 Part A). `id` is stable
 * across rebuilds — nothing keys off it changing. */
export async function buildDemoScenario(): Promise<SentinelScenario> {
  const steps: ScenarioStep[] = [...actOneSteps(), ...actTwoSteps(), ...(await actThreeSteps())];
  return { id: 'au-policy-demo', steps };
}
