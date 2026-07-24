# Cardinal v2 — "Sentinel" Policy Enforcement Stage

**Claude Code build brief · Extension to the existing Cardinal app · Fully scripted (no live AI)**

> Sentinel is the working name for the new demo stage. This build is **additive**: nothing in the existing app is deleted, moved, or modified except one nav entry. The deployed v1 (Command Center, Workflow Canvas, Agent Runs, Ask, Event Log) remains intact and demoable.

---

## 1. What this is

A new single-screen demo stage telling one linear story in three acts: **policy enforcement over the SOE event stream, before and after AI.**

- **Act I — The gap.** A night of account events replays. A policy-violating balance transfer scrolls past at 2:47 AM. Nothing catches it. A counter lands the point: *14 events · 1 violation · 0 flagged.*
- **Act II — Policy to production.** A balance-transfer policy document is dropped in. Agents parse it into machine-readable rules, a human reviews the rule diff, approves, rules go active. Minutes, not months.
- **Act III — The catch.** The same night replays. The 2:47 AM event trips the rule the audience just approved. Agents investigate across datasets, propose a compliant action, a human approves, everything lands in the audit trail. *14 events · 1 violation · caught in seconds.*

**Entirely mocked.** No LLM calls in this build — a deterministic `ScenarioPlayer` drives everything, exactly like the current deployed instance's scripted runs. The purpose is complete visuals for a stakeholder review; real integration (live model, real APIs) begins after that review and swaps the player for a real runtime **without changing any renderer**.

**Audience for the visuals:** executive stakeholders; shown on a projector/shared screen. Big type, high contrast, nothing critical behind hover.

---

## 2. Relationship to the existing codebase (read this first)

Before writing any code, do a **recon pass** and produce `docs/v2-reuse-map.md` listing what will be reused and from where. Expected reuse:

- **Wire contract / step stream** — Sentinel's ScenarioPlayer emits the *same stream shapes* the run view already consumes (narration chunks, `{ component, props }` render instructions, approval payloads, event-log entries). If the existing shapes need extension (e.g. graph-step messages), extend additively — never break the existing consumers.
- **Component registry renderers** — PaymentHistoryTable, ApprovalCard, OutreachDraftCard, MetricRow, TrendChart, and the event-log entry components are reused as-is wherever they fit.
- **Seed infrastructure** — extend the existing deterministic seed generator; do not fork it.
- **Event ticker & event-log view patterns** — the replay rail and closing audit strip reuse their components/styles.
- **React Flow** — already a dependency (Workflow Canvas). Sentinel uses it in a new **read-only live-graph mode**; the builder canvas is untouched.
- **Theme, layout shell, nav** — Sentinel is a new route (`/sentinel`) added to the existing nav. No other page changes.

Hard rule: **no deletions, no refactors of existing screens.** Shared additions go in shared directories; Sentinel-specific code lives under its own route/module.

---

## 3. The demo script (build only what the camera sees)

Target runtime ~7 minutes across three acts. The stage has a hidden presenter bar (see §8) to start acts and reset.

### Act I — The gap (~90 seconds)
1. Stage opens: **event replay rail** (left) idle, **agent graph** (center) dimmed with all nodes idle, **context rail** (right) showing a "Manual Review" card: *"Next scheduled sampling: Monday 9:00 AM · Coverage: business hours only."*
2. Presenter starts the replay. ~14 events stream over ~40 seconds: payments posting, statements generating, transactions, a promo-expiry notice event for Elena Ruiz — and at the **2:47 AM** timestamp, `balance_transfer.initiated` on **Marcus Webb**, $3,200. It scrolls past styled *exactly like every other event*. No highlight. Nothing reacts. The agent graph stays dark.
3. Replay ends on the **counter card**, large type: **14 events processed · 1 policy violation · 0 flagged** — subtitle: *"Detected day 4 by manual sampling — if at all."*
4. Presenter beat (no UI needed): even with a static alert, someone has to be awake to work the queue. This one happened at 2:47 AM.

### Act II — Policy to production (~2.5 minutes)
1. Presenter opens the **Policy panel** (drawer from the right). Drops in `BT-Servicing-Policy-2026.docx` (mock file-pick; the "document" is seeded content — see §5).
2. The **agent graph wakes up**: Orchestrator → Policy Analyst → Rule Engineer → Critic light up in sequence, edges animating, as narration streams in the context rail: reading sections, extracting obligations, drafting rules, critic validating against available SOE data fields.
3. The **Rule Diff view** renders: left, cited excerpts of the policy text; right, three extracted rule cards (§5) in plain English with a small machine-readable footer (rule id, datasets touched, evaluation trigger). One rule card carries a critic note: *"Evaluable with current SOE data: payments + balance-transfer events."*
4. **ApprovalCard** (reused component): "Activate 3 rules for live enforcement." Presenter approves. Rules flip to **Active**; an event-log entry lands; the graph returns to idle-armed state (subtle pulse instead of dark).
5. Counter beat: **Policy → production: 3 rules · 1 human approval · minutes.**

### Act III — The catch (~2.5 minutes)
1. Presenter replays the same night. Same events, same order, same timestamps.
2. At 2:47 AM, the Marcus BT event **stops mid-rail and highlights**. The graph ignites: Orchestrator → Policy Analyst (cites Rule R1) → **Data Collector fires twice** — once for BT event detail, once for payment history — visibly two calls, because R1 is a cross-dataset rule. Evidence renders progressively in the context rail:
   - **BT event detail card** — $3,200 initiated 02:47
   - **PaymentHistoryTable** (reused) — Marcus's missed payment, 12 days prior, highlighted
   - **Rule citation card** — R1 text with both conditions checked ✓✓
3. Critic validates; **proposed action** renders: *hold the balance transfer for review + ops notification draft + case summary* (OutreachDraftCard reused for the notification). ApprovalCard: presenter approves. Hold executes (mock), audit entries stream into a closing **audit strip**.
4. Bonus beat, ~15s: Elena's promo-expiry event gets a quiet green check as it passes — *R3 satisfied: 45-day notice on record.* The system verifies compliance, not just violations.
5. Closing counter, large type: **14 events · 1 violation · caught in 6 seconds · human-approved response · full audit trail.**
6. Optional presenter close on the existing Event Log page showing Sentinel's entries alongside v1's — one audit surface for everything.

---

## 4. The stage (one screen)

Route `/sentinel`. Three-panel layout, no navigation during the demo:

- **Left — Event Replay Rail:** vertical stream of event cards with timestamps; supports normal scroll-by, highlight-and-hold (Act III catch), and compliance-check badges. Header hosts the live counter (events / violations / flagged) that persists through the act.
- **Center — Live Agent Graph:** read-only React Flow. Fixed layout, six nodes: **Orchestrator, Policy Analyst, Rule Engineer, Data Collector, Critic, Approval Gate** (Approval Gate node lights when a gate is pending). Node states: `idle` (dim), `working` (glow + subtle pulse), `done` (steady lit), with animated edges while messages flow. The graph is purely a renderer of graph-step messages from the stream — it holds no logic. Below the graph, a one-line status ticker mirrors the current narration headline.
- **Right — Context Rail:** streaming narration + progressive evidence components + approval cards, reusing the run-view patterns. The Policy panel (Act II) opens as a drawer over this rail.
- **Bottom (thin) — Audit Strip:** last N event-log entries as they land; click-through to the existing Event Log page (post-demo only).

Act transitions are presenter-triggered, never automatic.

---

## 5. Policy content and seed additions

### The policy document (seeded content, rendered as a document preview)
`BT-Servicing-Policy-2026` — a plausible internal servicing policy, ~1 page of sections. All content invented; no real regulation named. Written so the three rules below are genuinely extractable from its text (the Rule Diff cites real excerpts).

### The three rules
- **R1 (hero, cross-dataset):** *No new balance transfer may be initiated within 60 days of a missed payment on the account.* — evaluates `balance_transfer.initiated` against payments history. **This is the rule Marcus's 2:47 AM event violates.**
- **R2:** *Balance transfer principal may not exceed 90% of available credit at initiation.* — BT event × account snapshot. (Marcus's $3,200 passes this one — show ✓ in the investigation so the catch is clearly R1, not everything-fails-everything.)
- **R3:** *Customers must be notified at least 45 days before a promotional APR expires.* — Elena's compliance-pass beat.

### Seed additions (extend the existing generator; keep all arithmetic reconcilable by hand)
- `balance_transfer.initiated` on **Marcus Webb**: $3,200, timestamped 02:47, dated 12 days after his existing missed payment. His available credit must make R2 pass cleanly.
- A **promo-notice-sent** record for Elena Ruiz dated so R3 passes with margin.
- The **replay log**: an ordered, checked-in list of ~14 events for "the night," mixing existing seed personas and background accounts. Same file drives both Act I and Act III.
- The policy document content and the three rule fixtures (plain-English text, excerpt anchors, machine footer fields).

---

## 6. The ScenarioPlayer (the whole engine)

A deterministic, checked-in scenario script + a player. No LLM calls, no network calls, no randomness.

- **Scenario file** (typed TS): an ordered list of timed steps — `emitEvent`, `graphStep` (node id + state transition + edge animation), `narration` (chunked text, played with a typing effect), `render` (`{ component, props }` — registry components only), `awaitApproval` (blocks until the ApprovalCard resolves), `counterUpdate`, `auditWrite`, `actMarker`.
- **Player:** play / pause / reset / jump-to-act / speed (1x / 2x for rehearsal). Approval steps hard-block. Reset returns the entire stage to pre-Act-I state in <2s.
- **Stream compatibility:** the player publishes on the same client stream interface the run view consumes. `graphStep` and `counterUpdate` are additive message types. Document the final shapes in `docs/wire-contract.md` (additive section, versioned) — **this contract is what the post-review real runtime must emit**, so treat it as a spec, not an implementation detail.
- Narration text lives in the scenario file, written in the same voice as v1's scripted runs. Timing tuned so Act I's replay feels like surveillance footage, not a slideshow — brisk, ambient, slightly boring on purpose until 2:47.

---

## 7. Build plan — phases and work items (dependency-ordered, no time estimates)

Items grouped with `∥` have disjoint file sets and may run in parallel. **Every gate is an act playing on screen, not a report.**

### P0 — Recon & foundations
- **W0.1 Recon** — read the existing wire contract, registry, seed generator, scripted-run machinery; write `docs/v2-reuse-map.md`
- **W0.2 ScenarioPlayer** — scenario file format + player (play/pause/reset/jump/speed, approval blocking), publishing on the existing stream interface with the additive message types
- **W0.3 Seed & content additions** — §5 in full: Marcus BT event, Elena notice record, replay log, policy document, rule fixtures
- **W0.4 Stage shell** — `/sentinel` route, three-panel + audit-strip layout, nav entry, presenter bar skeleton
- Order: W0.1 → (W0.2 ∥ W0.3 ∥ W0.4)

### P1 — Act I plays
- **W1.1 Event Replay Rail** — event cards, timestamps, scroll-by animation, counter header
- **W1.2 Manual Review context card** + Act I counter finale card
- **Gate: Act I plays start to finish from the presenter bar, resets clean.**

### P2 — Live agent graph
- **W2.1 Graph renderer** — fixed six-node layout, node-state visuals (idle/working/done), animated edges, status ticker; driven entirely by `graphStep` messages
- **Gate: a test sequence in the scenario file animates the full graph convincingly.**

### P3 — Act II plays
- **W3.1 Policy panel** — drawer, mock file-drop, document preview
- **W3.2 Rule Diff view** — excerpt panel + three rule cards with machine footers and critic note
- **W3.3 Act II scenario** — parsing graph sequence, narration, ApprovalCard (reused), rules-active state, audit write, counter beat
- Order: (W3.1 ∥ W3.2) → W3.3
- **Gate: Act II plays; approving visibly arms the system.**

### P4 — Act III plays
- **W4.1 Catch mechanics** — highlight-and-hold on the rail, graph ignition, double Data-Collector firing
- **W4.2 Evidence components** — BT event detail card, rule citation card (✓✓), R2 pass check, Elena R3 green-check beat; reuse PaymentHistoryTable and OutreachDraftCard
- **W4.3 Act III scenario** — investigation narration, proposed action, approval, mock execution, audit strip, closing counter
- Order: (W4.1 ∥ W4.2) → W4.3
- **Gate: Act III plays; the full three-act run works back-to-back after one reset.**

### P5 — Demo hardening
- **W5.1 Presenter controls** — hotkeys (space play/pause, R reset, 1/2/3 jump-to-act), hidden presenter bar toggle
- **W5.2 Projector pass** — type scale, contrast, motion legibility at distance; nothing critical behind hover
- **W5.3 Resilience** — error boundaries on the stage; full-demo replay clean 3× consecutively; Playwright replay of all three acts added to the verifier script
- **Gate: the complete 3-act script replays clean, repeatedly, at 1x and 2x.**

**Cut order if the clock wins:** Elena's R3 green-check beat first, then the R2 pass-check detail, then the document-preview polish (file-drop can render rule cards directly). The three acts, the graph, and the counters are never cut.

---

## 8. Demo-safety and presenter experience

- Everything deterministic; the demo must run identically with the network cable pulled.
- Presenter bar hidden by default (keyboard toggle); audience never sees controls.
- Reset to pre-Act-I in <2 seconds; rehearsal loop friction near zero.
- No `Math.random()` anywhere in the scenario path; typing-effect timing seeded/fixed.
- Error boundaries: a component failure degrades to a static card, never a white screen.

---

## 9. Non-goals

- **No LLM calls, no external APIs, no network dependency.** This build is 100% scripted.
- No changes to existing v1 screens beyond the nav entry.
- No workflow *builder* features on the Sentinel stage — the graph is read-only theater.
- No real regulation names or real policy text; all content invented and clearly plausible-fictional.
- No fraud/AML framing; this is **servicing policy compliance**. No credit-decisioning language.
- No auth, persistence, or mobile layout.

---

## 10. Path to real (context, not scope — do not build)

After stakeholder review, integration replaces the ScenarioPlayer with a real agent runtime emitting the same stream: tools → real account/transaction APIs; rule store → a real datastore; model → the available internal endpoint; hosting → an internal app service. Because every renderer consumes only the wire contract, **none of this build's UI changes**. Keep that contract clean and documented accordingly — it is the handoff artifact for the integration team.

---

## Addendum v2.1 — judgment beats (post-P4)

Two additions after the P4 gate review, closing the "if-statement wrapper" critique — the demo must show the agent exercising judgment, not only evaluating rules:

- **Act II — the data-gap finding.** The policy carries a sixth section (§Affordability Review) whose obligation — income verification on transfers over $5,000 — is genuinely not evaluable against SOE's datasets. The Policy Analyst extracts four obligations; the Critic validates three and parks the fourth as an explicit data gap. Rendered as a fourth, visually distinct Rule Diff row; activation stays "3 rules." An agent that knows the limits of its own data is the credibility beat, and it plants the expansion story: onboard more data, enforce more policy.
- **Act III — the decision point.** After the R1 verdict (deterministic and auditable — §eligibility makes cure irrelevant to the verdict), the response is a judgment call. The agent lays out three compliant routes (hold / allow-with-outreach / escalate-only), fires a third Data Collector call (account snapshot + cure check), rejects two routes with recorded reasons — escalate-only dies against Act I's own "Monday 9:00 AM sampling" card — and selects the hold, which still requires human approval. New §9.6 component: `DecisionCard`. The framing this buys on stage: deterministic where auditability matters, generative where judgment matters, a human gate on top of both.
