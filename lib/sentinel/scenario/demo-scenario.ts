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
//
// Addendum v2.1 (post-P4, CARDINAL_V2_SENTINEL_BRIEF.md's closing addendum):
// the policy document now carries a SIXTH section (§Affordability Review),
// so the Policy Analyst extracts FOUR obligations, not three — but only
// three ever become rules. The validate phase's render and every render
// after it append a fourth row, built from `policyObligationGap`
// (lib/sentinel/policy.ts) via `buildRuleDiff`'s new `withGap` option: the
// Critic parks the income-verification obligation as a `data-gap` instead
// of validating it, and `n2-gap` narrates that decision out loud right
// after the validated card renders. Activation still reads "Activate 3
// rules" — the gap is parked, not activated, and the arithmetic on the
// button is the whole point (brief v2 §5's hand-reconcilable rule).
//
// Act III (brief §3 Act III, ~2.5 min budget, W4.1/W4.2 mechanics + W4.3
// wiring): the file no longer ends on the Act III marker — this section
// appends the catch itself, TEN phases (Addendum v2.1 inserts one — see
// below), commented inline where each starts — restart (`railReset` + a
// zeroing `counterUpdate`, brief §3's "same night replays") → replay-to-catch
// (the 14-event loop again, index-aligned with `ACT_III_EVENT_DELAYS_MS`,
// brisker than Act I because the audience has already sat through this
// exact night once) → ignition (the graph wakes the instant the catch event
// lands, mirroring Act II's working→done idiom with `animatedEdges`
// replacing wholesale) → two-call collection (Data Collector fires twice —
// BT event detail, then payment history — the double `graphStep.detail`
// W4.1 built for exactly this) → verdict (Critic renders both R1 —
// violation — and R2 — pass — so the catch reads as an eligibility breach,
// not "everything fails") → **decide** (Addendum v2.1 — the new phase: R1's
// verdict is deterministic, but the RESPONSE to it is a judgment call. A
// `DecisionCard` lays out three compliant routes — hold / monitor-and-
// outreach / escalate-only — all `'considering'`; a THIRD Data Collector
// call fetches the account snapshot and the cure check; monitor is rejected
// first, then escalate loses against Act I's own "Monday 9:00 AM sampling"
// card, and hold is selected — two routes rejected, on the record, before
// any approval is asked for) → gate (a real approval, v1 brief §5d, no
// different from Act II's) → armed (the same six-node settle Act II uses,
// same order, `orchestrator` first) → rest-of-night (the loop resumes past
// the catch, Elena's event carrying `complianceBadge` — R3's compliance-pass
// beat) → close (the finale counter, `violations` derived the same way Act
// I's was).
//
// Two structural inversions worth naming because they're the whole point
// of Act III existing: (1) `counterUpdate.flagged` tracks `violations`
// tick-for-tick here — in Act I `flagged` stayed 0 no matter what
// `violations` counted after the fact, because nothing was watching in
// real time; here Sentinel catches what it sees, so the two columns move
// together. (2) `highlight`/`complianceBadge` appear ONLY in this act's
// `emitEvent` steps — Act I's whole punchline was that Marcus's event
// scrolled past styled identically to the other 13 (this file's Act I
// comment above); Act III is that same event, same data, with the judgment
// now visible. `violations` is computed once from `replayEvents` (same
// `kind === 'balance_transfer.initiated'` filter Act I's counter uses) and
// reused for both acts' finales — one fact, hand-reconcilable, cited twice.

import type { EmitEventStep, ScenarioStep, SentinelScenario } from './types';
import type { Account, BalanceTransferEvent, Payment, StreamEvent } from '@/lib/soe/types';
import type { PolicyDocument, PolicyObligationGap, PolicyRule } from '@/lib/sentinel/policy';
import type { DecisionCardProps, RuleDiffProps } from '@/lib/sentinel/registry';
import { formatCurrency, formatDate, formatMonthYear } from '@/lib/agents/format';

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

/** Act III's run id — a fresh run for the catch, start to finish, separate
 * from Act II's `RUN_ID` (brief §5e: every step logs against a `runId`,
 * and this one is a different investigation). */
const ACT_III_RUN_ID = 'sentinel-demo-act3';

/** Per-event pacing for Act III's replay of the SAME 14-event night
 * (`ACT_I_EVENT_DELAYS_MS`'s sibling table, index-aligned the same way) —
 * brisker than Act I's, on purpose: the audience just watched this exact
 * night once already, so the replay moves faster. Fixed literals only
 * (brief §8). */
const ACT_III_EVENT_DELAYS_MS = [
  1100, 1400, 1500, 1400, 1600, 1500, 1400, 1600, 2000, 1700, 1500, 1600, 1500, 1400,
] as const;

/** Elena's "quiet green check" beat (brief §3 Act III bonus beat) — the
 * ONLY `complianceBadge` in the whole scenario. */
const ACT_III_COMPLIANCE_BADGE = 'R3 satisfied — 45-day notice on record';

const ACT_III_CLOSING_CAPTION = 'Caught in seconds · human-approved response · full audit trail.';

const DAY_MS = 86_400_000;

/** Whole days between two ISO date/timestamp strings, date-part only, UTC.
 * Deliberately NOT `daysSince`/`daysUntil` (lib/agents/format.ts) — those
 * measure against the demo anchor ("today"); this measures between two
 * arbitrary dates already present in the data
 * (`missedPayment.dueDate` → `btEvent.timestamp`), so it takes both
 * endpoints as arguments instead of reading the anchor. */
function wholeDaysBetween(fromIso: string, toIso: string): number {
  const from = Date.parse(`${fromIso.slice(0, 10)}T00:00:00.000Z`);
  const to = Date.parse(`${toIso.slice(0, 10)}T00:00:00.000Z`);
  return Math.round((to - from) / DAY_MS);
}

/**
 * Maps `payments` (most-recent-first — the adapter's `getPayments` sort) to
 * `PaymentHistoryTable` rows exactly like payment-health's private
 * `resolvePaymentHistory`/`flagPayment` helpers (lib/agents/payment-health/
 * resolvers.ts) — trailing 4 statements, so the missed payment (always the
 * most recent one in this fixture) lands in the window. Not imported from
 * there: those helpers aren't exported, and re-deriving four lines here
 * keeps this file's zero-data-access-surface contract (header comment)
 * intact rather than reaching into another agent's module.
 */
function mapPaymentRows(payments: Payment[]) {
  return payments.slice(0, 4).map((p) => ({
    dueDate: formatDate(p.dueDate),
    amountDue: formatCurrency(p.amountDue),
    minimumDue: formatCurrency(p.minimumDue),
    amountPaid: formatCurrency(p.amountPaid),
    status: p.status,
    channel: p.channel,
    flag:
      p.status === 'MISSED'
        ? ('missed' as const)
        : p.amountPaid > 0 && p.amountPaid <= p.minimumDue + 0.005
          ? ('minimum-only' as const)
          : undefined,
  }));
}

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
 *
 * Addendum v2.1's `withGap` appends a FOURTH row built from
 * `policy.obligationGap`, marked `evaluability: 'data-gap'` — never counted
 * in `count` (which stays `1 | 2 | 3`, R1–R3 only) because the gap row isn't
 * a drafted rule reaching some Nth position in a sequence, it's a separate
 * fact the Critic surfaces once validation starts. `false` for every
 * draft-phase render (the Rule Engineer hasn't touched the Critic's finding
 * yet); `true` from the validated render onward (this file's Act II call
 * sites below).
 */
function buildRuleDiff(
  policy: { document: PolicyDocument; rules: PolicyRule[]; obligationGap: PolicyObligationGap },
  opts: {
    count: 1 | 2 | 3;
    validated: boolean;
    status: 'proposed' | 'active';
    withCriticNote: boolean;
    withGap: boolean;
  },
): RuleDiffProps {
  const { document, rules, obligationGap } = policy;
  const evaluableRows: RuleDiffProps['rules'] = rules.slice(0, opts.count).map((rule) => ({
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
    evaluability: 'evaluable',
  }));

  // The data-gap row: no `machine` footer (nothing was ever drafted into a
  // machine-readable rule), never `validated` (there was nothing evaluable
  // to validate), and `criticNote` carries the Critic's reason for parking
  // it — always present when the row is shown, unlike the evaluable rows'
  // optional note.
  const gapRow: RuleDiffProps['rules'][number] = {
    ruleId: obligationGap.obligationId,
    title: obligationGap.title,
    excerpt: {
      sectionHeading: sectionHeadingFor(document, obligationGap.excerpt.sectionId),
      quote: obligationGap.excerpt.quote,
    },
    plainEnglish: obligationGap.plainEnglish,
    validated: false,
    criticNote: obligationGap.criticNote,
    evaluability: 'data-gap',
  };

  return {
    title: RULE_DIFF_TITLE,
    status: opts.status,
    rules: opts.withGap ? [...evaluableRows, gapRow] : evaluableRows,
  };
}

/** Act III decide phase (Addendum v2.1): each response route's fixed
 * label/summary — editorial copy, not derived from any dataset, so it lives
 * as a constant rather than being rebuilt inline at every one of
 * `buildDecisionCard`'s three call sites below. */
const DECISION_ROUTE_COPY = {
  hold: {
    label: 'Hold the transfer for review',
    summary: 'Pause posting while eligibility is reviewed; reversible.',
  },
  monitor: {
    label: 'Allow with flag + customer outreach',
    summary: 'Let the transfer post, flag the account, draft customer outreach.',
  },
  escalate: {
    label: 'Escalate to ops review queue',
    summary: 'Refer to servicing ops without holding the transfer.',
  },
} as const;

type DecisionRouteId = keyof typeof DECISION_ROUTE_COPY;
type DecisionOptionState = { status: DecisionCardProps['options'][number]['status']; rationale?: string };

/**
 * Builds the `act3-decision` card's props at one of the decide phase's
 * three re-renders (header comment) — hold/monitor/escalate's per-render
 * `status`/`rationale`, everything else (label, summary, title, subtitle,
 * footnote) fixed editorial copy from `DECISION_ROUTE_COPY`. `options` is
 * assembled in the SAME fixed order (hold, monitor, escalate) on every
 * call, never sorted or grouped by `status` — registry.ts's `DecisionCard`
 * doc comment requires this: the card must read as the same three rows
 * progressively resolving under the same `render` id, not a reshuffled
 * list.
 */
function buildDecisionCard(routes: Record<DecisionRouteId, DecisionOptionState>): DecisionCardProps {
  const routeIds: DecisionRouteId[] = ['hold', 'monitor', 'escalate'];
  return {
    title: 'Response to R1 violation',
    subtitle: 'The verdict is deterministic. The response is a judgment call.',
    options: routeIds.map((id) => ({
      id,
      label: DECISION_ROUTE_COPY[id].label,
      summary: DECISION_ROUTE_COPY[id].summary,
      status: routes[id].status,
      rationale: routes[id].rationale,
    })),
    footnote: 'Whichever route is selected requires human approval before anything executes.',
  };
}

/**
 * Builds the checked-in Sentinel demo scenario. Act I plays start to
 * finish, then Act II's policy-to-production sequence, then Act III's
 * investigation and catch — `steps` now ends on Act III's closing
 * narration, not on its marker (this file's header comment has the full
 * ten-phase breakdown). `actIII` is required, not optional: the demo path
 * always has this data (app/sentinel/page.tsx's sole call site fetches it
 * unconditionally), and making it required here means a missing fetch
 * fails at the call site's type-check rather than silently dropping Act III
 * at runtime. Addendum v2.1 widens `policy` with `obligationGap` (Act II's
 * data-gap row) and `actIII` with `account` (the decision phase's account
 * snapshot) — both required for the same reason: the demo path always has
 * them, so a missing fetch should fail loudly at the call site instead of
 * silently dropping a beat at runtime.
 */
export function buildDemoScenario(data: {
  replayEvents: StreamEvent[];
  policy: { document: PolicyDocument; rules: PolicyRule[]; obligationGap: PolicyObligationGap };
  actIII: { btEvent: BalanceTransferEvent; payments: Payment[]; partyName: string; account: Account };
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
    text: 'BT-Servicing-Policy-2026 received — six sections. Routing to Policy Analyst for obligation extraction.',
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
      'Reading §Purpose and Scope, §Definitions, §New Transfer Eligibility, §Transfer Sizing Limits, §Affordability Review, §Promotional Rate Disclosures. Four obligations found.',
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
      inputSummary: 'BT-Servicing-Policy-2026 · 6 sections',
      outputSummary: '4 obligations extracted',
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
      props: buildRuleDiff(policy, {
        count: 1,
        validated: false,
        status: 'proposed',
        withCriticNote: false,
        withGap: false,
      }),
    },
  });
  steps.push({
    type: 'render',
    delayMs: 1500,
    id: 'rule-diff',
    instruction: {
      component: 'RuleDiff',
      props: buildRuleDiff(policy, {
        count: 2,
        validated: false,
        status: 'proposed',
        withCriticNote: false,
        withGap: false,
      }),
    },
  });
  steps.push({
    type: 'render',
    delayMs: 1500,
    id: 'rule-diff',
    instruction: {
      component: 'RuleDiff',
      props: buildRuleDiff(policy, {
        count: 3,
        validated: false,
        status: 'proposed',
        withCriticNote: false,
        withGap: false,
      }),
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
      inputSummary: '4 obligations from BT-Servicing-Policy-2026',
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
      props: buildRuleDiff(policy, {
        count: 3,
        validated: true,
        status: 'proposed',
        withCriticNote: true,
        withGap: true,
      }),
    },
  });
  // Addendum v2.1: the fourth obligation — income verification on large
  // transfers — is genuinely not evaluable against SOE's current datasets.
  // Narrated right after the validated card renders (the gap row is on
  // screen by the time the audience hears about it) and before the audit
  // write below records the same fact.
  steps.push({
    type: 'narration',
    delayMs: 400,
    id: 'n2-gap',
    text:
      'Three rules are evaluable today. The fourth obligation — income verification on large transfers — needs data SOE does not hold. Parked as a data gap, not activated.',
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
      inputSummary: 'R1, R2, R3 + income-verification obligation vs SOE data fields',
      outputSummary: '3 of 4 evaluable — 1 data gap (income verification not onboarded)',
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
        'Three of the four extracted obligations passed critic validation as evaluable with current SOE data; the income-verification obligation is parked as a data gap until that dataset is onboarded. Activation only observes and flags — no customer-facing action happens without a separate approval.',
      evidence: ['Rule Diff — BT-Servicing-Policy-2026', 'Data gap — income verification (not onboarded)'],
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
      props: buildRuleDiff(policy, {
        count: 3,
        validated: true,
        status: 'active',
        withCriticNote: true,
        withGap: true,
      }),
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

  // ---------------------------------------------------------------------
  // Act III — The catch (brief §3 Act III). Ten phases (file header,
  // Addendum v2.1): restart → replay-to-catch → ignition → two-call
  // collection → verdict → decide → gate → armed → rest-of-night → close.
  // ---------------------------------------------------------------------

  const { btEvent, payments, partyName, account } = data.actIII;
  const accountId = btEvent.accountId;

  const missedPayment = payments.find((p) => p.status === 'MISSED');
  if (!missedPayment) {
    throw new Error('buildDemoScenario: Act III requires a MISSED payment in actIII.payments');
  }
  // Addendum v2.1: the decision phase's `n3-account` narration claims "no
  // payment has posted since the [missed] due date" — the account-standing
  // half of the cure check. That claim must be hand-reconcilable against
  // the data behind it, never asserted blind (brief v2 §5), so it's a
  // throw-on-bad-fixture guard, matching this file's other Act III guards
  // (missing MISSED payment, missing `btCreditLineAtInitiation`, missing
  // catch/Elena events) rather than a silent assumption. Date-only ISO
  // strings (YYYY-MM-DD) compare correctly with `>` lexicographically.
  for (const payment of payments) {
    if (payment.postedDate !== undefined && payment.postedDate > missedPayment.dueDate) {
      throw new Error(
        `buildDemoScenario: Act III's "no payment posted since" narration is contradicted by ${payment.paymentId} (posted ${payment.postedDate}, after the missed due date ${missedPayment.dueDate})`,
      );
    }
  }
  const daysBeforeInitiation = wholeDaysBetween(missedPayment.dueDate, btEvent.timestamp);

  if (btEvent.btCreditLineAtInitiation === undefined) {
    throw new Error(
      'buildDemoScenario: Act III requires btEvent.btCreditLineAtInitiation for the R2 sizing check',
    );
  }
  const btCreditLine = btEvent.btCreditLineAtInitiation;
  const sizingCapAmount = 0.9 * btCreditLine;

  const catchIndex = replayEvents.findIndex((e) => e.kind === 'balance_transfer.initiated');
  const elenaIndex = replayEvents.findIndex((e) => e.kind === 'bt.promo_expiring');
  if (catchIndex === -1) {
    throw new Error('buildDemoScenario: Act III requires a balance_transfer.initiated event in replayEvents');
  }
  if (elenaIndex === -1) {
    throw new Error('buildDemoScenario: Act III requires a bt.promo_expiring event in replayEvents');
  }

  const rule1 = policy.rules.find((r) => r.ruleId === 'R1');
  const rule2 = policy.rules.find((r) => r.ruleId === 'R2');
  if (!rule1 || !rule2) {
    throw new Error('buildDemoScenario: Act III requires both R1 and R2 in policy.rules');
  }

  // `violations` is the SAME derivation Act I's finale counter used above
  // (`kind === 'balance_transfer.initiated'`) — one fact, computed once,
  // cited by both acts' closing counters (brief v2 §5's hand-reconcilable
  // arithmetic rule).
  const transferAmountFmt = formatCurrency(btEvent.transferAmount);
  const missedMinimumFmt = formatCurrency(missedPayment.minimumDue);
  const missedDueDateFmt = formatDate(missedPayment.dueDate);
  // Addendum v2.1: the decision phase's account-snapshot MetricRow
  // ("Customer since") — `formatMonthYear`, the same helper
  // `PartyGraph.account.detail`'s doc comment illustrates ("Open since Aug
  // 2018"), not a fresh date-formatting convention invented here.
  const customerSinceFmt = formatMonthYear(account.openedDate);

  // Phase: replay restart — a fresh observation window. Without `railReset`
  // the rail would carry Act I's 14 cards plus Act III's 14 more (types.ts's
  // `RailResetStep` doc comment: 28 rows, duplicate `eventId` React keys).
  // The zeroing `counterUpdate` right behind it carries no caption, so the
  // header reads as reset, not as a new milestone — Act I's finale card
  // (caption included) is what it's clearing.
  steps.push({ type: 'railReset', delayMs: 400 });
  steps.push({ type: 'counterUpdate', delayMs: 0, counter: { events: 0, violations: 0, flagged: 0 } });
  steps.push({
    type: 'narration',
    delayMs: 300,
    id: 'n3-replay',
    text: 'Replaying the night — same fourteen events, same order, same timestamps. R1–R3 are live this time.',
  });

  // Phase: the night again — same 14-event loop Act I used, index-aligned
  // with `ACT_III_EVENT_DELAYS_MS` instead of Act I's table. `flagged`
  // mirrors `violations` at every tick this time (the header comment's
  // inversion #1: nothing was watching in Act I, so `flagged` sat at 0 no
  // matter what `violations` counted after the fact; here Sentinel catches
  // what it sees). The catch event (Marcus, 02:47) carries `highlight:
  // true` and, the instant its counter lands, the entire investigation →
  // gate → armed sequence runs before the loop resumes one line below —
  // the rail visibly stops mid-night. Elena's event carries
  // `complianceBadge` plus a narration beat right behind it.
  replayEvents.forEach((event, i) => {
    const isCatch = i === catchIndex;
    const isElena = i === elenaIndex;
    const violationsSoFar = replayEvents
      .slice(0, i + 1)
      .filter((e) => e.kind === 'balance_transfer.initiated').length;

    const emitStep: EmitEventStep = {
      type: 'emitEvent',
      delayMs: ACT_III_EVENT_DELAYS_MS[i],
      event,
    };
    if (isCatch) emitStep.highlight = true;
    if (isElena) emitStep.complianceBadge = ACT_III_COMPLIANCE_BADGE;
    steps.push(emitStep);

    steps.push({
      type: 'counterUpdate',
      delayMs: 0,
      counter: { events: i + 1, violations: violationsSoFar, flagged: violationsSoFar },
    });

    if (isElena) {
      steps.push({
        type: 'narration',
        delayMs: 300,
        id: 'n3-elena',
        text:
          "Elena Ruiz's promo expiry passes R3 — 60 days' notice on record against a 45-day floor. Sentinel verifies compliance, not just violations.",
      });
    }

    if (!isCatch) return;

    // ---------------------------------------------------------------
    // Phase: ignition + investigation — mirrors Act II's working→done
    // graph idiom, `animatedEdges` replacing wholesale (types.ts's
    // `GraphStep` doc comment).
    // ---------------------------------------------------------------
    steps.push({
      type: 'graphStep',
      delayMs: 250,
      nodeId: 'orchestrator',
      nodeState: 'working',
      animatedEdges: [],
    });
    steps.push({
      type: 'narration',
      delayMs: 300,
      id: 'n3-catch',
      text: `02:47 — balance_transfer.initiated on ${accountId}. R1 matched on its evaluation trigger. Opening an investigation.`,
    });
    steps.push({
      type: 'auditWrite',
      delayMs: 400,
      entry: {
        runId: ACT_III_RUN_ID,
        agentId: 'sentinel-orchestrator',
        step: -1,
        kind: 'run.started',
        actor: 'agent',
        inputSummary: `balance_transfer.initiated at 02:47 on ${accountId}`,
        outputSummary: 'R1 investigation opened — seconds after initiation',
      },
    });
    steps.push({
      type: 'graphStep',
      delayMs: 300,
      nodeId: 'policy-analyst',
      nodeState: 'working',
      animatedEdges: [{ from: 'orchestrator', to: 'policy-analyst' }],
    });
    steps.push({
      type: 'narration',
      delayMs: 400,
      id: 'n3-cite',
      text: `Policy Analyst cites R1 — ${stripRuleIdPrefix(rule1)}: ${rule1.plainEnglish} Two conditions to verify — one on this event, one across payment history.`,
    });
    steps.push({
      type: 'auditWrite',
      delayMs: 600,
      entry: {
        runId: ACT_III_RUN_ID,
        agentId: 'sentinel-policy-analyst',
        step: 0,
        toolName: 'match_rules',
        kind: 'step.completed',
        actor: 'agent',
        inputSummary: 'balance_transfer.initiated vs 3 active rules',
        outputSummary: 'R1 matched — cross-dataset check required',
      },
    });
    steps.push({
      type: 'graphStep',
      delayMs: 300,
      nodeId: 'policy-analyst',
      nodeState: 'done',
      animatedEdges: [{ from: 'policy-analyst', to: 'data-collector' }],
    });

    // Data Collector — visibly two calls (brief §3: "fires twice ...
    // because R1 is a cross-dataset rule"). The `done` graphStep between
    // the two `working` calls drops the glow so they read as two distinct
    // firings, not one continuous spin.
    steps.push({
      type: 'graphStep',
      delayMs: 250,
      nodeId: 'data-collector',
      nodeState: 'working',
      detail: 'call 1 · BT event detail',
    });
    steps.push({
      type: 'narration',
      delayMs: 300,
      id: 'n3-fetch1',
      text: 'Data Collector — first call: the balance-transfer event itself.',
    });
    steps.push({
      type: 'render',
      delayMs: 700,
      id: 'act3-bt-detail',
      instruction: {
        component: 'BTEventDetail',
        props: {
          title: 'Balance transfer initiated',
          account: `${partyName} · ${accountId}`,
          amount: transferAmountFmt,
          timestamp: `02:47 UTC · ${formatDate(btEvent.timestamp)}`,
          tone: 'critical',
          attributes: [
            { label: 'Promo APR', value: `${btEvent.promoApr}%` },
            { label: 'Go-to APR', value: `${btEvent.goToApr}%` },
            { label: 'BT credit line at initiation', value: formatCurrency(btCreditLine) },
            { label: 'Event id', value: btEvent.eventId },
          ],
        },
      },
    });
    steps.push({
      type: 'auditWrite',
      delayMs: 400,
      entry: {
        runId: ACT_III_RUN_ID,
        agentId: 'sentinel-data-collector',
        step: 1,
        toolName: 'fetch_bt_event',
        kind: 'tool.executed',
        actor: 'agent',
        inputSummary: `${btEvent.eventId} detail`,
        outputSummary: `${transferAmountFmt} initiated 02:47 · BT line ${formatCurrency(btCreditLine)}`,
      },
    });
    steps.push({ type: 'graphStep', delayMs: 500, nodeId: 'data-collector', nodeState: 'done' });
    steps.push({
      type: 'graphStep',
      delayMs: 350,
      nodeId: 'data-collector',
      nodeState: 'working',
      detail: 'call 2 · payment history',
    });
    steps.push({
      type: 'narration',
      delayMs: 300,
      id: 'n3-fetch2',
      text: 'Second call: payment history. R1 is a cross-dataset rule — the look-back window is 60 days.',
    });
    steps.push({
      type: 'render',
      delayMs: 700,
      id: 'act3-payments',
      instruction: {
        component: 'PaymentHistoryTable',
        props: {
          title: `Payment history — ${accountId}`,
          rows: mapPaymentRows(payments),
        },
      },
    });
    steps.push({
      type: 'auditWrite',
      delayMs: 400,
      entry: {
        runId: ACT_III_RUN_ID,
        agentId: 'sentinel-data-collector',
        step: 2,
        toolName: 'fetch_payment_history',
        kind: 'tool.executed',
        actor: 'agent',
        inputSummary: `60-day look-back on ${accountId}`,
        outputSummary: `Missed payment found — minimum ${missedMinimumFmt} due ${missedDueDateFmt}, ${daysBeforeInitiation} days before initiation`,
      },
    });
    steps.push({
      type: 'graphStep',
      delayMs: 400,
      nodeId: 'data-collector',
      nodeState: 'done',
      animatedEdges: [{ from: 'data-collector', to: 'critic' }],
    });

    // Critic + verdict — R1 violates, R2 passes, so the catch reads as an
    // eligibility breach specifically, not "everything fails everything"
    // (brief §5's R2 note).
    steps.push({ type: 'graphStep', delayMs: 250, nodeId: 'critic', nodeState: 'working' });
    steps.push({
      type: 'narration',
      delayMs: 350,
      id: 'n3-critic',
      text: "Critic evaluating R1's two conditions — and running R2's sizing check while the event is open.",
    });
    steps.push({
      type: 'render',
      delayMs: 800,
      id: 'act3-r1',
      instruction: {
        component: 'RuleCitation',
        props: {
          ruleId: 'R1',
          title: stripRuleIdPrefix(rule1),
          ruleText: rule1.plainEnglish,
          verdict: 'violation',
          checks: [
            {
              label: 'Balance transfer initiated on the account',
              detail: `${transferAmountFmt} at 02:47 today`,
              met: true,
            },
            {
              label: 'Missed payment within the 60-day look-back',
              detail: `Minimum ${missedMinimumFmt} due ${missedDueDateFmt} — ${daysBeforeInitiation} days before initiation`,
              met: true,
            },
          ],
        },
      },
    });
    steps.push({
      type: 'render',
      delayMs: 900,
      id: 'act3-r2',
      instruction: {
        component: 'RuleCitation',
        props: {
          ruleId: 'R2',
          title: stripRuleIdPrefix(rule2),
          ruleText: rule2.plainEnglish,
          verdict: 'pass',
          checks: [
            {
              label: 'Principal within 90% of the balance-transfer credit line',
              detail: `${transferAmountFmt} ≤ ${formatCurrency(sizingCapAmount)} (90% of ${formatCurrency(btCreditLine)})`,
              met: true,
            },
          ],
        },
      },
    });
    steps.push({
      type: 'narration',
      delayMs: 400,
      id: 'n3-verdict',
      text: "R1 violated — both conditions met. R2 passes — the principal is inside the sizing limit. This is an eligibility breach, not a sizing breach.",
    });
    steps.push({
      type: 'auditWrite',
      delayMs: 500,
      entry: {
        runId: ACT_III_RUN_ID,
        agentId: 'sentinel-critic',
        step: 3,
        toolName: 'evaluate_rules',
        kind: 'step.completed',
        actor: 'agent',
        inputSummary: `R1, R2 against ${btEvent.eventId}`,
        outputSummary: 'R1 violation confirmed · R2 pass',
      },
    });
    steps.push({
      type: 'graphStep',
      delayMs: 300,
      nodeId: 'critic',
      nodeState: 'done',
      // Addendum v2.1: the gate edge no longer lights here — R1's verdict
      // is in, but nothing routes to the Approval Gate until the decide
      // phase below actually picks a route. Clearing the animated set
      // wholesale (types.ts's `GraphStep.detail`-adjacent doc comment on
      // `animatedEdges`) leaves the graph edge-quiet through the decision
      // beat rather than pointing at the gate prematurely.
      animatedEdges: [],
    });

    // ---------------------------------------------------------------
    // Phase: decide (Addendum v2.1, CARDINAL_V2_SENTINEL_BRIEF.md's
    // closing addendum) — R1's verdict is deterministic; the RESPONSE to
    // it is a judgment call. Three compliant routes go on screen at once,
    // all `'considering'`, then resolve one at a time as a THIRD Data
    // Collector call (the account snapshot + cure check) comes back —
    // monitor rejected first, then escalate loses against Act I's own
    // "Monday 9:00 AM sampling" card (context-rail.tsx's
    // `ManualReviewCard`), then hold is selected. Two rejections, on the
    // record, before any approval is asked for.
    // ---------------------------------------------------------------
    steps.push({
      type: 'narration',
      delayMs: 350,
      id: 'n3-routes',
      text:
        "R1's verdict is deterministic — the transfer is ineligible either way. The response is a judgment call: three compliant routes are open. Weighing them against the account picture.",
    });
    steps.push({
      type: 'render',
      delayMs: 800,
      id: 'act3-decision',
      instruction: {
        component: 'DecisionCard',
        props: buildDecisionCard({
          hold: { status: 'considering' },
          monitor: { status: 'considering' },
          escalate: { status: 'considering' },
        }),
      },
    });

    // Third Data Collector call — the account snapshot + cure check
    // (mirrors calls 1/2's `graphStep.detail` idiom above; call 2 already
    // ended on a `done` graphStep, so this `working` step alone reads as a
    // distinct third firing).
    steps.push({
      type: 'graphStep',
      delayMs: 300,
      nodeId: 'data-collector',
      nodeState: 'working',
      detail: 'call 3 · account snapshot',
    });
    steps.push({
      type: 'narration',
      delayMs: 400,
      id: 'n3-account',
      text: `Third call: the account picture. Checking standing, tenure — and whether the missed payment was later cured. No payment has posted since the ${missedDueDateFmt} due date; the miss stands.`,
    });
    steps.push({
      type: 'render',
      delayMs: 700,
      id: 'act3-account',
      instruction: {
        component: 'MetricRow',
        props: {
          metrics: [
            { label: 'Account standing', value: account.status, tone: 'neutral' },
            { label: 'Customer since', value: customerSinceFmt, tone: 'neutral' },
            { label: `Payment since ${missedDueDateFmt}`, value: 'None', tone: 'critical' },
          ],
        },
      },
    });
    steps.push({
      type: 'auditWrite',
      delayMs: 400,
      entry: {
        runId: ACT_III_RUN_ID,
        agentId: 'sentinel-data-collector',
        step: 4,
        toolName: 'fetch_account_snapshot',
        kind: 'tool.executed',
        actor: 'agent',
        inputSummary: `${accountId} snapshot + cure check`,
        outputSummary: `Standing ${account.status} · no payment posted since ${missedDueDateFmt}`,
      },
    });
    steps.push({ type: 'graphStep', delayMs: 400, nodeId: 'data-collector', nodeState: 'done' });

    steps.push({
      type: 'graphStep',
      delayMs: 300,
      nodeId: 'orchestrator',
      nodeState: 'working',
      detail: 'weighing 3 response routes',
    });
    steps.push({
      type: 'render',
      delayMs: 800,
      id: 'act3-decision',
      instruction: {
        component: 'DecisionCard',
        props: buildDecisionCard({
          hold: { status: 'considering' },
          monitor: {
            status: 'rejected',
            rationale:
              'The miss stands uncured — allowing the transfer completes an ineligible transaction that is hard to unwind once posted.',
          },
          escalate: { status: 'considering' },
        }),
      },
    });
    steps.push({
      type: 'render',
      delayMs: 900,
      id: 'act3-decision',
      instruction: {
        component: 'DecisionCard',
        props: buildDecisionCard({
          hold: {
            status: 'selected',
            rationale:
              "Reversible, blocks tonight's posting, and preserves the customer's request while eligibility is reviewed.",
          },
          monitor: {
            status: 'rejected',
            rationale:
              'The miss stands uncured — allowing the transfer completes an ineligible transaction that is hard to unwind once posted.',
          },
          escalate: {
            status: 'rejected',
            rationale:
              'Next scheduled ops sampling is Monday 9:00 AM, business hours only — the transfer posts tonight, days before a human would see the queue.',
          },
        }),
      },
    });
    steps.push({
      type: 'narration',
      delayMs: 350,
      id: 'n3-choice',
      text: 'Hold selected over monitor-and-outreach and escalate-only. Two routes rejected, with reasons, on the record.',
    });
    steps.push({
      type: 'auditWrite',
      delayMs: 500,
      entry: {
        runId: ACT_III_RUN_ID,
        agentId: 'sentinel-orchestrator',
        step: 5,
        toolName: 'select_response',
        kind: 'step.completed',
        actor: 'agent',
        inputSummary: '3 candidate routes vs account snapshot + cure status',
        outputSummary: 'Hold selected — monitor and escalate rejected with recorded reasons',
      },
    });
    steps.push({
      type: 'graphStep',
      delayMs: 300,
      nodeId: 'orchestrator',
      nodeState: 'working',
      // `detail` omitted — clears the "weighing 3 response routes" caption
      // back to the plain state word (types.ts's `GraphStep.detail` doc
      // comment: absence clears wholesale, it doesn't leave the old text
      // stuck). `critic` → `approval-gate`, not `orchestrator` →
      // `approval-gate`: that pair isn't in `STATIC_EDGES`
      // (live-agent-graph.tsx), and orchestrator/approval-gate sit at
      // opposite ends of the fixed vertical layout — a non-catalog edge
      // between them would cut straight through the policy-analyst and
      // critic nodes. The already-lit `critic`→`approval-gate` catalog
      // edge reads cleanly and still lands the gate lighting up the
      // instant the decision is made.
      animatedEdges: [{ from: 'critic', to: 'approval-gate' }],
    });

    // Proposed action + the gate — a real human pause (v1 brief §5d: no
    // auto-approve paths, no timeouts).
    steps.push({
      type: 'narration',
      delayMs: 350,
      id: 'n3-proposal',
      text:
        'Proposed action — the selected route: hold the transfer for review, notify servicing ops, file the case summary. Nothing executes without approval.',
    });
    steps.push({
      type: 'render',
      delayMs: 600,
      id: 'act3-case',
      instruction: {
        component: 'MetricRow',
        props: {
          metrics: [
            { label: 'Rule', value: 'R1 violation', tone: 'critical' },
            { label: 'Amount held', value: transferAmountFmt, tone: 'neutral' },
            { label: 'Detected', value: 'In seconds', delta: 'flagged at 02:47', tone: 'positive' },
          ],
        },
      },
    });
    steps.push({
      type: 'render',
      delayMs: 700,
      id: 'act3-notify',
      instruction: {
        component: 'OutreachDraftCard',
        props: {
          channel: 'EMAIL',
          to: 'servicing-ops@cardinal.example',
          subject: `Hold pending review — balance transfer on ${accountId}`,
          body: `A balance transfer of ${transferAmountFmt} initiated at 02:47 UTC on ${accountId} was flagged by rule R1 (New Transfer Eligibility Window).\n\nA missed payment (${missedMinimumFmt} minimum due ${missedDueDateFmt}) falls ${daysBeforeInitiation} days before initiation — inside the 60-day look-back. The transfer is held pending review; it will not post while the hold is active.\n\nCase file: BT event detail, 60-day payment history, R1/R2 evaluation.`,
        },
      },
    });
    steps.push({
      type: 'awaitApproval',
      id: 'act3-hold',
      payload: {
        approvalId: 'act3-hold',
        toolName: 'hold_balance_transfer',
        title: 'Hold balance transfer for review',
        description: `Place a servicing hold on the ${transferAmountFmt} transfer on ${accountId} and send the ops notification. The transfer does not post while the hold is active.`,
        rationale:
          "R1 violation confirmed across two datasets; R2 sizing passes. Hold selected over two rejected routes — reversible, and it preserves the customer's request while eligibility is reviewed.",
        evidence: [
          'BT event detail',
          'Payment history — 60-day look-back',
          'Rule R1 citation — violation',
          'Rule R2 check — pass',
          'Decision record — 3 response routes weighed',
        ],
      },
      audit: {
        runId: ACT_III_RUN_ID,
        agentId: 'sentinel-approval-gate',
        step: 6,
        toolName: 'hold_balance_transfer',
        inputSummary: `Hold ${transferAmountFmt} transfer on ${accountId} + notify ops`,
        outputSummary: 'Human decision recorded at the enforcement gate',
      },
    });
    steps.push({
      type: 'graphStep',
      delayMs: 300,
      nodeId: 'approval-gate',
      nodeState: 'done',
      animatedEdges: [],
    });
    steps.push({
      type: 'auditWrite',
      delayMs: 400,
      entry: {
        runId: ACT_III_RUN_ID,
        agentId: 'sentinel-orchestrator',
        step: 7,
        toolName: 'hold_balance_transfer',
        kind: 'action.executed',
        actor: 'agent',
        inputSummary: `Hold on ${btEvent.eventId} + ops notification`,
        outputSummary: 'Hold active — transfer will not post · ops notified',
      },
    });
    steps.push({
      type: 'narration',
      delayMs: 350,
      id: 'n3-executed',
      text: 'Hold active. Ops notified. Every step of this catch is already on the audit trail.',
    });

    // Phase: back to watching — all six nodes settle to armed, same
    // cadence Act II's armed phase uses (orchestrator first, then the
    // other five at 150ms each, same order).
    steps.push({ type: 'graphStep', delayMs: 400, nodeId: 'orchestrator', nodeState: 'armed' });
    steps.push({ type: 'graphStep', delayMs: 150, nodeId: 'policy-analyst', nodeState: 'armed' });
    steps.push({ type: 'graphStep', delayMs: 150, nodeId: 'rule-engineer', nodeState: 'armed' });
    steps.push({ type: 'graphStep', delayMs: 150, nodeId: 'data-collector', nodeState: 'armed' });
    steps.push({ type: 'graphStep', delayMs: 150, nodeId: 'critic', nodeState: 'armed' });
    steps.push({ type: 'graphStep', delayMs: 150, nodeId: 'approval-gate', nodeState: 'armed' });
    // The forEach loop resumes right after this point, at i = catchIndex + 1
    // — "the rest of the night" phase (header comment), Elena's event among
    // them.
  });

  // Phase: close.
  steps.push({
    type: 'auditWrite',
    delayMs: 400,
    entry: {
      runId: ACT_III_RUN_ID,
      agentId: 'sentinel-orchestrator',
      step: -1,
      kind: 'run.finished',
      actor: 'agent',
      outputSummary: 'Night replay complete — 1 violation caught, held, and dispositioned',
    },
  });
  steps.push({
    type: 'counterUpdate',
    delayMs: 1800,
    counter: { events: replayEvents.length, violations, flagged: violations },
    caption: ACT_III_CLOSING_CAPTION,
  });
  steps.push({
    type: 'render',
    delayMs: 600,
    id: 'act3-counter',
    instruction: {
      component: 'MetricRow',
      props: {
        metrics: [
          { label: 'Events', value: String(replayEvents.length), tone: 'neutral' },
          { label: 'Violations caught', value: String(violations), delta: 'in seconds, not days', tone: 'positive' },
          { label: 'Audit trail', value: 'Complete', delta: 'human-approved', tone: 'positive' },
        ],
      },
    },
  });
  steps.push({
    type: 'narration',
    delayMs: 400,
    id: 'n3-close',
    text: 'Same night. Same events. This time the 2:47 AM transfer never slipped past.',
  });

  return { id: 'sentinel-demo', steps };
}
