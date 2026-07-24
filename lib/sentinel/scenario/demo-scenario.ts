// Demo scenario (P1/P3, brief §3 Act I + Act II / §6) — the REAL demo
// script, as opposed to smoke-scenario.ts's synthetic player-test fixture.
// P1 shipped Act I only: the night's 14-event replay, ending paused at the
// Act II marker (brief §4: "Act transitions are presenter-triggered, never
// automatic"). P3 (W3.3) appends Act II's policy-to-production sequence —
// drop the policy → parse → draft rules → validate → human approval → arm
// the graph — ending paused at the Act III marker; this file grows, it
// doesn't get replaced. P4 will append Act III's catch the same way.
//
// Pure function, not a constant: `buildDemoScenario` takes the replay log
// AND the policy fixtures as data rather than importing either, so this
// module has zero data-access surface of its own — the caller
// (app/sentinel/page.tsx) does the lib/soe fetch (`getSentinelReplayLog()`)
// plus the direct `lib/sentinel/policy` import (checked-in content, not
// seed data — the "all data access goes through lib/soe" rule in
// CLAUDE.md is about seed data specifically; the policy document and rule
// fixtures are static, checked-in fixtures the same way this scenario file
// itself is) and hands both in. That keeps this file trivially unit-testable
// (no seed/adapter machinery required, see demo-scenario.test.ts) and keeps
// scenario authoring consistent with v1 invariant 5a/5b's spirit: this
// module never reaches into data on its own, it only shapes what it's given.
//
// Act I pacing (brief §6: "surveillance footage, not a slideshow — brisk,
// ambient, slightly boring on purpose until 2:47"): each of the 14 replay
// events gets its own fixed delay from ACT_I_EVENT_DELAYS_MS, index-aligned
// with the replay log's ascending-timestamp order; the table sums to 38.6s.
// A zero-delay counterUpdate follows every emitEvent, ticking the header
// counter up by one — instantaneous, so it never adds its own pause on top
// of the event's.
//
// The punchline is what does NOT happen here: no event carries `highlight`
// or `complianceBadge`. Marcus's 02:47 balance_transfer.initiated — the one
// event that will trip a rule in Act III — is styled identically to the
// other 13 (brief §3 Act I beat 2). `violations` stays 0 through the whole
// replay for the same reason: nothing in Act I judges anything in real
// time. Only the finale counter reveals "1 violation," after the fact,
// because manual sampling caught it late — if at all — and that gap is the
// whole point of Act I. The violation count is computed from the data
// (`kind === 'balance_transfer.initiated'`), never hardcoded, so it stays
// hand-reconcilable against the replay log per brief v2 §5's arithmetic
// rule.
//
// Act II pacing (brief §3 Act II, ~2.5 min budget): six phases, commented
// inline below exactly where they start — intake (file drop, orchestrator
// routes it) → parse (Policy Analyst reads sections, extracts obligations)
// → draft (Rule Engineer writes R1/R2/R3, rendered progressively) →
// validate (Critic checks each rule against available SOE data fields,
// attaching the evaluability note) → gate (the ApprovalCard hard-blocks on
// a real human decision, v1 brief §5d) → armed (all six graph nodes settle
// into the "idle-armed" pulse once activation lands). The Rule Diff card
// (`id: 'rule-diff'`) re-renders under the same id at every phase boundary
// — 1 rule, then 2, then 3, then 3-validated, then 3-active — using the
// render step's same-id replace-in-place semantics (types.ts, wire-contract
// §9.2) instead of five separate cards.

import type { ScenarioStep, SentinelScenario } from './types';
import type { StreamEvent } from '@/lib/soe/types';
import type { PolicyDocument, PolicyRule } from '@/lib/sentinel/policy';
import type { RuleDiffProps } from '@/lib/sentinel/registry';

/** Per-event pacing for Act I's replay, index-aligned with the 14-event
 * replay log's ascending-timestamp order. Fixed literals only (brief §8:
 * "no randomness anywhere in the scenario path"); sums to 38.6s. */
const ACT_I_EVENT_DELAYS_MS = [
  1600, 2600, 2900, 2700, 3100, 2800, 2600, 3000, 3200, 2900, 2700, 3100, 2800, 2600,
] as const;

/** Beat after the last event: a pause to let "14 events" register before the
 * counter flips to reveal the violation count. */
const ACT_I_FINALE_DELAY_MS = 2200;

const ACT_I_FINALE_CAPTION = 'Detected day 4 by manual sampling — if at all.';

/** Act II's run id for every `auditWrite` step and `awaitApproval.audit`
 * below — a single run, start (`run.started`) to finish (`run.finished`),
 * stitching the policy-intake story together on the shared Event Log
 * exactly like a v1 agent run does (wire-contract §5). */
const RUN_ID = 'sentinel-demo-act2';

/** The Rule Diff card's fixed title (brief §3 Act II beat 3) — same string
 * at every phase, only `status`/`rules` change as the card re-renders under
 * the same `id`. */
const RULE_DIFF_TITLE = 'BT-Servicing-Policy-2026 → extracted rules';

/** Looks up the HEADING of the policy-document section a rule cites, by
 * `rule.excerpt.sectionId` — the Rule Diff card's left-hand citation shows
 * the section heading, not its id. */
function sectionHeadingFor(document: PolicyDocument, sectionId: string): string {
  const section = document.sections.find((s) => s.id === sectionId);
  if (!section) {
    throw new Error(`buildRuleDiff: unknown policy section id "${sectionId}"`);
  }
  return section.heading;
}

/** `RuleDiff` renders `rule.ruleId` as its own badge (evidence/rule-diff.tsx)
 * — the fixture's `title` carries a redundant `"R1 — "`-style prefix meant
 * for plain-text contexts, so this strips it before handing the string to
 * the card. */
function stripRuleIdPrefix(rule: PolicyRule): string {
  const prefix = `${rule.ruleId} — `;
  return rule.title.startsWith(prefix) ? rule.title.slice(prefix.length) : rule.title;
}

/**
 * Maps the `policyRules` fixtures (lib/sentinel/policy.ts) into a
 * `RuleDiffProps` at one of Act II's five phases (header comment): how many
 * rules have been drafted so far (`count`), whether the Critic has validated
 * them yet (`validated`), whether the card is still `proposed` or has
 * flipped `active` post-approval, and whether the critic's evaluability note
 * should show (`withCriticNote` — the note is the critic's voice; it must
 * not appear while the Rule Engineer is still drafting). Only R1 carries a
 * `criticNote` in the fixture data, so gating by `withCriticNote` is enough
 * to keep it off R2/R3 without any extra bookkeeping here.
 */
function buildRuleDiff(
  policy: { document: PolicyDocument; rules: PolicyRule[] },
  opts: { count: 1 | 2 | 3; validated: boolean; status: 'proposed' | 'active'; withCriticNote: boolean },
): RuleDiffProps {
  const { document, rules } = policy;
  return {
    title: RULE_DIFF_TITLE,
    status: opts.status,
    rules: rules.slice(0, opts.count).map((rule) => ({
      ruleId: rule.ruleId,
      title: stripRuleIdPrefix(rule),
      excerpt: {
        sectionHeading: sectionHeadingFor(document, rule.excerpt.sectionId),
        quote: rule.excerpt.quote,
      },
      plainEnglish: rule.plainEnglish,
      machine: rule.machine,
      validated: opts.validated,
      criticNote: opts.withCriticNote ? rule.criticNote : undefined,
    })),
  };
}

/**
 * Builds the checked-in Sentinel demo scenario. Act I plays start to
 * finish, then Act II's policy-to-production sequence, ending paused at the
 * Act III marker; P4 extends `steps` with Act III's content.
 */
export function buildDemoScenario(data: {
  replayEvents: StreamEvent[];
  policy: { document: PolicyDocument; rules: PolicyRule[] };
}): SentinelScenario {
  const { replayEvents, policy } = data;

  const steps: ScenarioStep[] = [{ type: 'actMarker', act: 1, title: 'Act I — The gap' }];

  replayEvents.forEach((event, i) => {
    steps.push({
      type: 'emitEvent',
      delayMs: ACT_I_EVENT_DELAYS_MS[i],
      event,
      // No `highlight`, no `complianceBadge` — see header. Marcus's
      // balance_transfer.initiated event scrolls past exactly like every
      // other event in this list.
    });
    steps.push({
      type: 'counterUpdate',
      delayMs: 0,
      counter: { events: i + 1, violations: 0, flagged: 0 },
    });
  });

  const violations = replayEvents.filter((event) => event.kind === 'balance_transfer.initiated').length;

  steps.push({
    type: 'counterUpdate',
    delayMs: ACT_I_FINALE_DELAY_MS,
    counter: { events: replayEvents.length, violations, flagged: 0 },
    caption: ACT_I_FINALE_CAPTION,
  });

  steps.push({ type: 'actMarker', act: 2, title: 'Act II — Policy to production' });

  // ---------------------------------------------------------------------
  // Act II — Policy to production (brief §3 Act II). Six phases: intake →
  // parse → draft → validate → gate → armed.
  // ---------------------------------------------------------------------

  // Phase: intake — the presenter opens the drawer and mock-drops the
  // policy file; the orchestrator's run starts and routes it to the Policy
  // Analyst.
  steps.push({ type: 'policyPanel', delayMs: 500, panel: 'drop' });
  steps.push({ type: 'awaitStageAction', id: 'policy-drop', action: 'policy-drop' });
  steps.push({ type: 'policyPanel', delayMs: 0, panel: 'preview' });
  steps.push({
    type: 'auditWrite',
    delayMs: 400,
    entry: {
      runId: RUN_ID,
      agentId: 'sentinel-orchestrator',
      step: -1,
      kind: 'run.started',
      actor: 'agent',
      inputSummary: 'BT-Servicing-Policy-2026.docx received',
      outputSummary: 'Policy intake run started',
    },
  });
  steps.push({
    type: 'graphStep',
    delayMs: 300,
    nodeId: 'orchestrator',
    nodeState: 'working',
    animatedEdges: [],
  });
  steps.push({
    type: 'narration',
    delayMs: 400,
    id: 'n2-intake',
    text: 'BT-Servicing-Policy-2026 received — five sections. Routing to Policy Analyst for obligation extraction.',
  });

  // Phase: parse — Policy Analyst reads every section and extracts the
  // enforceable obligations.
  steps.push({
    type: 'graphStep',
    delayMs: 300,
    nodeId: 'policy-analyst',
    nodeState: 'working',
    animatedEdges: [{ from: 'orchestrator', to: 'policy-analyst' }],
  });
  steps.push({
    type: 'narration',
    delayMs: 900,
    id: 'n2-read',
    text:
      'Reading §Purpose and Scope, §Definitions, §New Transfer Eligibility, §Transfer Sizing Limits, §Promotional Rate Disclosures. Three enforceable obligations found.',
  });
  steps.push({
    type: 'auditWrite',
    delayMs: 700,
    entry: {
      runId: RUN_ID,
      agentId: 'sentinel-policy-analyst',
      step: 0,
      toolName: 'extract_obligations',
      kind: 'step.completed',
      actor: 'agent',
      inputSummary: 'BT-Servicing-Policy-2026 · 5 sections',
      outputSummary: '3 enforceable obligations extracted',
    },
  });
  // Drawer slides away; the rail beneath already holds the narration.
  steps.push({ type: 'policyPanel', delayMs: 600, panel: 'closed' });
  steps.push({
    type: 'graphStep',
    delayMs: 400,
    nodeId: 'policy-analyst',
    nodeState: 'done',
    animatedEdges: [{ from: 'policy-analyst', to: 'rule-engineer' }],
  });

  // Phase: draft — Rule Engineer drafts R1/R2/R3 against SOE data fields;
  // the Rule Diff card grows one rule at a time under the same `id`.
  steps.push({ type: 'graphStep', delayMs: 200, nodeId: 'rule-engineer', nodeState: 'working' });
  steps.push({
    type: 'narration',
    delayMs: 400,
    id: 'n2-draft',
    text: 'Rule Engineer drafting machine-readable rules against SOE data fields…',
  });
  steps.push({
    type: 'render',
    delayMs: 800,
    id: 'rule-diff',
    instruction: {
      component: 'RuleDiff',
      props: buildRuleDiff(policy, { count: 1, validated: false, status: 'proposed', withCriticNote: false }),
    },
  });
  steps.push({
    type: 'render',
    delayMs: 1500,
    id: 'rule-diff',
    instruction: {
      component: 'RuleDiff',
      props: buildRuleDiff(policy, { count: 2, validated: false, status: 'proposed', withCriticNote: false }),
    },
  });
  steps.push({
    type: 'render',
    delayMs: 1500,
    id: 'rule-diff',
    instruction: {
      component: 'RuleDiff',
      props: buildRuleDiff(policy, { count: 3, validated: false, status: 'proposed', withCriticNote: false }),
    },
  });
  steps.push({
    type: 'auditWrite',
    delayMs: 500,
    entry: {
      runId: RUN_ID,
      agentId: 'sentinel-rule-engineer',
      step: 1,
      toolName: 'draft_rules',
      kind: 'tool.executed',
      actor: 'agent',
      inputSummary: '3 obligations from BT-Servicing-Policy-2026',
      outputSummary: 'Rules R1, R2, R3 drafted',
    },
  });
  steps.push({
    type: 'graphStep',
    delayMs: 300,
    nodeId: 'rule-engineer',
    nodeState: 'done',
    animatedEdges: [{ from: 'rule-engineer', to: 'critic' }],
  });

  // Phase: validate — Critic checks each rule against available SOE data
  // fields and attaches the evaluability note.
  steps.push({ type: 'graphStep', delayMs: 200, nodeId: 'critic', nodeState: 'working' });
  steps.push({
    type: 'narration',
    delayMs: 400,
    id: 'n2-critic',
    text:
      'Critic validating each rule against available SOE data fields — payments, balance-transfer events, promo notices.',
  });
  steps.push({
    type: 'render',
    delayMs: 1100,
    id: 'rule-diff',
    instruction: {
      component: 'RuleDiff',
      props: buildRuleDiff(policy, { count: 3, validated: true, status: 'proposed', withCriticNote: true }),
    },
  });
  steps.push({
    type: 'auditWrite',
    delayMs: 500,
    entry: {
      runId: RUN_ID,
      agentId: 'sentinel-critic',
      step: 2,
      toolName: 'validate_rules',
      kind: 'step.completed',
      actor: 'agent',
      inputSummary: 'R1, R2, R3 against SOE data fields',
      outputSummary: '3 of 3 rules evaluable with current SOE data',
    },
  });
  steps.push({
    type: 'graphStep',
    delayMs: 300,
    nodeId: 'critic',
    nodeState: 'done',
    animatedEdges: [{ from: 'critic', to: 'approval-gate' }],
  });

  // Phase: gate — a real human decision (v1 brief §5d: no auto-approve, no
  // timeout). Approving is the visible arming moment.
  steps.push({
    type: 'narration',
    delayMs: 300,
    id: 'n2-ready',
    text: 'Three rules ready for activation. Awaiting human approval.',
  });
  steps.push({
    type: 'awaitApproval',
    id: 'act2-activate',
    payload: {
      approvalId: 'act2-activate',
      toolName: 'activate_rules',
      title: 'Activate 3 rules for live enforcement',
      description:
        'R1, R2 and R3 begin evaluating every event on the SOE stream the moment you approve.',
      rationale:
        'All three rules passed critic validation as evaluable with current SOE data. Activation only observes and flags — no customer-facing action happens without a separate approval.',
      evidence: ['Rule Diff — BT-Servicing-Policy-2026'],
    },
    audit: {
      runId: RUN_ID,
      agentId: 'sentinel-approval-gate',
      step: 3,
      toolName: 'activate_rules',
      inputSummary: 'Activate R1, R2, R3 for live enforcement',
      outputSummary: 'Human decision recorded at the activation gate',
    },
  });
  steps.push({
    type: 'render',
    delayMs: 400,
    id: 'rule-diff',
    instruction: {
      component: 'RuleDiff',
      props: buildRuleDiff(policy, { count: 3, validated: true, status: 'active', withCriticNote: true }),
    },
  });
  steps.push({
    type: 'auditWrite',
    delayMs: 300,
    entry: {
      runId: RUN_ID,
      agentId: 'sentinel-orchestrator',
      step: 4,
      toolName: 'activate_rules',
      kind: 'action.executed',
      actor: 'agent',
      inputSummary: 'R1, R2, R3 → active',
      outputSummary: 'Live enforcement armed on the SOE stream',
    },
  });
  steps.push({
    type: 'graphStep',
    delayMs: 300,
    nodeId: 'approval-gate',
    nodeState: 'done',
    animatedEdges: [],
  });

  // Phase: armed — every node settles into the idle-armed pulse (brief §3
  // beat 4: "idle-armed, subtle pulse instead of dark").
  steps.push({ type: 'graphStep', delayMs: 500, nodeId: 'orchestrator', nodeState: 'armed' });
  steps.push({ type: 'graphStep', delayMs: 150, nodeId: 'policy-analyst', nodeState: 'armed' });
  steps.push({ type: 'graphStep', delayMs: 150, nodeId: 'rule-engineer', nodeState: 'armed' });
  steps.push({ type: 'graphStep', delayMs: 150, nodeId: 'data-collector', nodeState: 'armed' });
  steps.push({ type: 'graphStep', delayMs: 150, nodeId: 'critic', nodeState: 'armed' });
  steps.push({ type: 'graphStep', delayMs: 150, nodeId: 'approval-gate', nodeState: 'armed' });
  steps.push({
    type: 'narration',
    delayMs: 400,
    id: 'n2-armed',
    text: 'R1–R3 active. Sentinel is watching the stream.',
  });
  steps.push({
    type: 'render',
    delayMs: 700,
    id: 'act2-counter',
    instruction: {
      component: 'MetricRow',
      props: {
        metrics: [
          { label: 'Rules activated', value: '3', tone: 'positive' },
          { label: 'Human approvals', value: '1', tone: 'neutral' },
          { label: 'Policy → production', value: 'Minutes', delta: 'not months', tone: 'positive' },
        ],
      },
    },
  });
  steps.push({
    type: 'auditWrite',
    delayMs: 400,
    entry: {
      runId: RUN_ID,
      agentId: 'sentinel-orchestrator',
      step: -1,
      kind: 'run.finished',
      actor: 'agent',
      outputSummary: 'Policy to production complete — 3 rules active, 1 human approval',
    },
  });

  steps.push({ type: 'actMarker', act: 3, title: 'Act III — The catch' });

  return { id: 'sentinel-demo', steps };
}
