# Project Cardinal — Credit Card Agent Command Center

**Claude Code build brief · Greenfield prototype · Demo dates: Aug 5 and Aug 19, 2026**

> "Cardinal" is a working codename (credit **card**-inal). Rename is a find-and-replace; don't let naming block scaffolding.

---

## 1. What this is

A demo prototype showing **governed agentic AI over credit card servicing data**. Three named AI agents monitor a live account event stream, investigate using SOE data (parties, accounts, transactions, payments, balance-transfer events), present their evidence as dynamically rendered UI, and propose actions that a human approves before execution. Every agent step writes to an audit log.

This is **not** a chatbot. The core demo motion is: *event fires → agent picks it up → agent narrates its reasoning while pulling data → evidence renders as charts/tables/timelines → approval gate → human approves → action executes → audit entry appears.*

**Audience:** bank technology leadership, potentially up to CIO level. Shown live on a shared screen/projector twice (Aug 5, Aug 19).

**Positioning:** Dev-only proof of concept. It must *look* production-plausible but is explicitly a prototype. The production path is a port into an existing Angular application, which drives a hard architectural rule (see §5).

**The two themes every beat must serve:** **governance** (approval gates, audit trail, traceable agent decisions) and **growth** (retaining revenue, preventing losses, finding new customers in existing data).

---

## 2. Tech stack

- **Next.js 16** (App Router, latest **16.2.x stable** — do *not* use the 16.3 preview line for a demo build; do not enable the React Compiler) + **TypeScript** (strict)
- **Tailwind CSS v4** + **shadcn/ui** (latest CLI)
- **Vercel AI SDK v7** (`ai@7.x`) for agent orchestration, tool calling, and streaming. Use its native primitives instead of hand-rolling: **ToolLoopAgent** for the three agent runs, **built-in tool approvals** for the approval gates (§5d), and the **telemetry / lifecycle-event system** to feed the Event Log (§5e).
- **AI Elements** (`npx ai-elements@latest`) for streaming message/reasoning surfaces — verify component compatibility against AI SDK 7 at install time; the SDK's message-parts model is the source of truth
- **@xyflow/react v12** (React Flow) for the workflow canvas
- **Recharts v3** (via shadcn chart components) for data viz
- **Zod v4** for every tool schema and every data contract
- **Seed data in-repo** (typed TS modules or JSON). No external database. The entire demo must run with zero external dependencies except the LLM endpoint.

**Version policy:** this brief pins majors only. Resolve exact versions with `@latest` on scaffold day, commit the lockfile, and **freeze all dependencies immediately after scaffold (W0.1)** — no upgrades for the remainder of the build for any reason. AI SDK 7 shipped late June 2026 and postdates most training data and online examples (v5/v6 patterns differ materially — the message-parts model and streaming wire format changed in v6, and agent/approval APIs changed again in v7). **Consult the official v7 docs and migration guides at build time; do not code AI SDK integration from memory.**

**LLM provider:** abstract behind AI SDK provider config. Local dev may use any key via env var. The demo will target an internal Azure OpenAI endpoint (details TBD from the SOE/AI-endpoint team); structure so swapping providers is a one-file change. Assume **no streaming guarantees and mediocre latency** from the target endpoint — design accordingly (see §8).

**Visual reference:** the prior `ai-agent-registry` app (repo: https://github.com/srinathv31/ai-agent-registry, live: https://ai-agent-registry-tau.vercel.app). Port the *vibe*, not the code wholesale — see §7 for the specific porting list. This is a reference for aesthetics and interaction patterns only; Cardinal is a fresh codebase with a much narrower scope.

---

## 3. The demo script (build only what the camera sees)

Target runtime: **~8 minutes**. Every screen, component, and animation exists to serve one of these beats. If a feature isn't in a beat, don't build it.

### Beat 0 — Open on the Command Center (30s)
Dashboard view. A live event stream ticks in the left rail (payments posting, statements generating, a balance transfer completing, an autopay failing). Three named agents sit in a status column: **Payment Health**, **BT Lifecycle**, **AU Growth** — each idle, each showing last-run stats. The room absorbs: *agents are watching the portfolio.*

### Beat 1 — Compose a workflow (60s)
Presenter opens the **Workflow Canvas**. Drags nodes from a small palette: `Event Monitor → Analyze Account → Propose Action → Approval Gate → Event Log`. Connects them. Names it "Payment Health." Hits **Run**. This is the "create a custom agent" moment the exec loves — scripted, minimal, reliable. The palette contains *only* the node types used in the demo (5–6 max).

### Beat 2 — Payment Health Agent: Marcus Webb (2 min) — *the money-saving beat*
The run view opens. The agent streams its reasoning: it noticed `autopay.failed` on Marcus's account, pulls 6 months of payments and transactions. Evidence renders progressively as generative UI:
- **Utilization trend chart** — climbing 42% → 78% over five months
- **Payment history table** — three consecutive minimum payments, then a miss 12 days ago
- **Risk summary badge** — elevated, with plain-English rationale

The agent proposes: *due-date alignment change + payment-plan outreach draft* (rendered as an **OutreachDraftCard** with editable email copy). An **ApprovalCard** appears: proposed action, rationale, evidence links. Presenter clicks **Approve**. Action executes; a green confirmation lands; an **Event Log entry** slides into the audit rail. Framing note: this is **servicing outreach**, never "credit decisioning" — see §9.

### Beat 3 — BT Lifecycle Agent: Elena Ruiz (2 min) — *the revenue-protection beat*
Triggered by a `PROMO_EXPIRING` event. Agent streams: Elena transferred $8,400 ten months ago at 0% promo APR; promo ends in 45 days; $5,100 remains. Evidence:
- **BT lifecycle timeline** — transfer initiated → completed → today → promo cliff
- **Interest projection chart** — "if nothing changes": ~$94/month in interest at the 24.99% go-to APR, cumulative curve over 12 months
- Proposed action: proactive outreach with a payment-plan option and a retention path. ApprovalCard → Approve → Event Log.

### Beat 4 — AU Growth Agent: the Patel household (90s) — *the money-making beat*
Triggered on a statement cycle. The agent maps the household: Anand (primary), Priya (AU), Dev (AU, age 22). Evidence:
- **Party relationship graph** — the only visual in the demo that uses party data, and the most novel thing in the room
- **AU spend trend** — Dev's independent spend grew $80/mo → $650/mo over twelve months, with recurring categories suggesting financial independence
- Proposed action: graduation offer — invite Dev to his own card. ApprovalCard → Approve → drafted offer letter → Event Log.
Talking point (not UI): today, only the primary cardholder gets communications; AU relationships are an untapped acquisition channel sitting in data we already have.

### Beat 5 — Live portfolio query (60s) — *the proof-of-life beat*
Presenter opens the **Ask** surface and types a genuinely live question, e.g. *"Show me spend by category across the portfolio this quarter"* or *"Which accounts have balance transfers expiring in the next 90 days?"* The model routes to a pre-built chart/table component fed by seed data, and it renders. This is the only unscripted moment — see §8 for its safety net.

### Beat 6 — Close on the audit trail (30s)
Cut to the **Event Log** view: every agent run, every tool call, every approval, timestamped and attributable. Closing line: agents act, humans approve, everything is auditable. *Governance close.*

**Aug 19 headroom:** the second showing should have one visible addition (a fourth workflow beat, a polish pass, or a portfolio-level summary view). Leave obvious extension points; do not pre-build.

---

## 4. Screen inventory (5 screens, no more)

1. **Command Center (dashboard)** — event stream rail, three agent status cards, portfolio KPI row, recent-approvals strip. Landing screen; Beat 0.
2. **Workflow Canvas** — React Flow canvas + minimal node palette + Run button. Beat 1.
3. **Agent Run View** — the star. Streaming reasoning pane (left), progressive generative-UI evidence pane (center), approval/action rail (right). Beats 2–4. One layout reused by all three agents.
4. **Ask** — single input + streamed generative-UI answer. Beat 5. May be a modal/drawer off the Command Center rather than a route.
5. **Event Log** — filterable audit table (run, agent, step, actor, timestamp, payload summary). Beat 6.

No auth screens, no settings, no admin, no session history, no "learning" — see §9.

---

## 5. Architecture rules (non-negotiable)

### 5a. The LLM is a router, not a data source
The model **never generates a number, date, name, or balance**. All data flows: seed data → typed tool results → typed component props. The model's jobs are exactly three:
1. Choose which tools to call (agent reasoning)
2. Choose which registered UI components render the evidence, with props drawn *only* from tool results
3. Generate natural-language narration and outreach drafts (clearly editorial content, reviewed at the approval gate)

If someone asks "how do you know the AI isn't making numbers up," the answer is architectural: it can't — it routes to components fed by the data layer.

### 5b. All intelligence lives server-side; the frontend is renderers
Hard boundary, because production is an **Angular port** into an existing SOE application. Agents, tools, orchestration, approval logic, and event logging live behind API routes. The wire format is typed JSON: streamed narration tokens, `{ component: string, props: T }` render instructions, approval-gate payloads, and event-log entries. React components are pure renderers of these payloads. **Zero business logic in components.** A future Angular frontend consumes the identical contracts. Document the wire format in `docs/wire-contract.md` as part of the build.

### 5c. Component registry (the only things the model may render)
`MetricRow` · `TrendChart` (line) · `BarBreakdown` · `CategoryPie` · `PaymentHistoryTable` · `TransactionTable` · `BTTimeline` · `InterestProjectionChart` · `PartyGraph` · `RiskBadge` · `OutreachDraftCard` · `ApprovalCard`

Each has a Zod props schema. The routing tool's parameters are a discriminated union over this registry. Adding a component = schema + renderer + one union member.

### 5d. Approval gates are real pauses
Implement gates with **AI SDK 7's native tool-approval flow** — mark every action-executing tool (outreach send, due-date change, offer dispatch) as requiring approval — rather than hand-rolling a pause mechanism. The run halts, the pending approval streams to the client and renders as an `ApprovalCard`, and the run resumes only on an explicit human decision. Approve → the "action" executes (mock side effect) → `ActionExecuted` event → Event Log entries. Decline → run closes with a logged disposition. No auto-approve paths, no approval timeouts. (Read-only tools — data fetches — never require approval; only tools with side effects do. That distinction is itself a talking point.)

### 5e. Everything writes to the Event Log
Every run step logs `{ runId, agentId, step, toolName, inputSummary, outputSummary, actor ('agent' | 'human'), timestamp }`. Wire this through **AI SDK 7's telemetry / lifecycle-event system**: register one integration at application startup that maps agent lifecycle events to Event Log entries, rather than sprinkling manual log calls through every tool. Human approvals log with `actor: 'human'`. In production this stream targets the org's Event Log platform via its SDK — mirror that mental model now; the log store itself is in-memory/seeded.

---

## 6. Data layer — mock SOE contracts

All access goes through a single `lib/soe/` module (the *adapter*). Tools call the adapter, never raw seed data, so swapping mock → real SOE endpoints later touches one module. Field names below are plausible placeholders — **reconcile with the SOE team's actual shapes and adjust the adapter, not the tools.**

```ts
// lib/soe/types.ts
export interface Party {
  partyId: string;
  fullName: string;
  dateOfBirth: string;      // ISO date
  email: string;
}

export interface Account {
  accountId: string;
  productType: 'CREDIT_CARD';
  openedDate: string;
  creditLimit: number;
  currentBalance: number;
  availableCredit: number;
  purchaseApr: number;      // e.g. 24.99
  status: 'ACTIVE' | 'CLOSED' | 'SUSPENDED';
}

export interface AccountPartyRole {
  accountId: string;
  partyId: string;
  role: 'PRIMARY' | 'AUTHORIZED_USER';
  addedDate: string;
}

export interface Transaction {
  transactionId: string;
  accountId: string;
  partyId?: string;         // spender attribution — required for AU Growth
  postedDate: string;
  amount: number;           // positive = charge, negative = credit
  merchantName: string;
  category: 'GROCERY' | 'DINING' | 'TRAVEL' | 'SUBSCRIPTION' | 'UTILITIES' | 'RETAIL' | 'FUEL' | 'OTHER';
  type: 'PURCHASE' | 'CREDIT' | 'FEE' | 'INTEREST';
}

export interface Payment {
  paymentId: string;
  accountId: string;
  dueDate: string;
  postedDate?: string;
  amountDue: number;
  minimumDue: number;
  amountPaid: number;
  status: 'SCHEDULED' | 'POSTED' | 'LATE' | 'MISSED';
  channel: 'AUTOPAY' | 'ONLINE' | 'PHONE' | 'MAIL';
}

export interface BalanceTransferEvent {
  eventId: string;
  accountId: string;
  type: 'BT_INITIATED' | 'BT_COMPLETED' | 'PROMO_EXPIRING' | 'PROMO_EXPIRED';
  transferAmount: number;
  promoApr: number;
  promoEndDate: string;
  goToApr: number;
  remainingBalance?: number;
  timestamp: string;
}

export interface StreamEvent {                 // the dashboard ticker
  eventId: string;
  accountId: string;
  kind: 'payment.posted' | 'payment.missed' | 'autopay.failed'
      | 'statement.generated' | 'balance_transfer.completed'
      | 'bt.promo_expiring' | 'transaction.posted';
  summary: string;
  timestamp: string;
}
```

**Adapter surface (tools call these):** `getAccount`, `getPartiesForAccount`, `getTransactions(accountId, range)`, `getPayments(accountId, range)`, `getBalanceTransferEvents(accountId)`, `getPortfolioAccounts()`, `getEventStream()`.

### Seed cast (deterministic — same numbers every run, every rehearsal, both demo dates)

| Persona | Accounts | Story | Serves |
|---|---|---|---|
| **Marcus Webb** | 1 card | Utilization 42%→78% over 5 months; 3 consecutive minimum payments; autopay failure → first miss 12 days ago | Beat 2 |
| **Elena Ruiz** | 1 card | $8,400 BT completed 10 months ago; 0% promo ends in 45 days; $5,100 remaining; 24.99% go-to APR | Beat 3 |
| **Patel household** | 1 card, 3 parties | Anand (primary), Priya (AU), Dev (AU, 22); Dev's attributed spend $80/mo → $650/mo over 12 months, recurring subscription/utility categories | Beat 4 |
| **5–7 background accounts** | varied | Diverse categories and balances; at least 2 with BTs expiring inside 90 days | Beat 5 portfolio queries |

Generate seed data with a **seeded/deterministic generator checked into the repo** — not `Math.random()` at runtime. Amounts should sum correctly (utilization math, remaining balances, interest projections must be internally consistent; assume someone in the room does the arithmetic).

---

## 7. What to port from `ai-agent-registry` (reference only — no code dependency)

**Port the feel:**
- The dark "control room" aesthetic and information density *dialed down one notch* — this shows on a projector, so bump base font sizes, increase contrast, and never put critical info in hover-only tooltips
- The agent palette card design (name, category chip, capability blurb)
- The React Flow canvas interactions (drag from palette, connect, select/delete)
- The approval-card interaction pattern

**Explicitly do not port:**
- The twelve-agent palette (Cardinal has 3 agents + 5–6 node types)
- Fraud, AML, compliance, and risk agents — out of scope, wrong story
- Domains / Sessions / AI Learning navigation — platform features, not demo features
- Any page that isn't in the §4 screen inventory

---

## 8. Demo-safety engineering

This runs live in front of leadership twice. Optimize for *cannot fail on stage*:

1. **`DEMO_MODE=scripted` (default):** Beats 1–4 run with deterministic tool results from seed data. The LLM generates only narration and outreach drafts, at low temperature. Every narration/draft has a **checked-in fallback string**; if the LLM call errors or exceeds a timeout (~8s), the run continues seamlessly with fallbacks. The demo must be completable with the network down.
2. **The live beat (Beat 5) has a parachute:** cache the response to the two rehearsed questions; on error/timeout, render the cached result with no visible difference.
3. **Streaming may not be available** on the internal endpoint — narration should also work request/response with a typing-effect animation client-side, so the experience is identical either way.
4. Error boundaries on every screen; an error can never white-screen the app mid-demo.
5. **Reset control:** a keyboard shortcut or hidden button that resets all runs/approvals/logs to the opening state in <2 seconds, for back-to-back rehearsals and the Aug 19 rerun.
6. Fast cold start; no build-on-demand surprises. Verify a full demo pass works from a fresh browser tab.

---

## 9. Non-goals and language guardrails

- **No fraud, no AML, no compliance agents.** Not in this org's scope; also the fastest way to lose the room to jurisdiction questions.
- **No credit decisioning language.** The Payment Health agent proposes *servicing outreach* (due-date changes, payment plans, contact drafts). Never "declined," "line decrease," "creditworthiness," or "score" as a lending decision. UI copy and agent narration must both respect this.
- **No offers/campaign management.** A separate funded program owns that space. The AU Growth agent stops at "drafted invitation for human review" — it does not build campaigns, segments, or offer economics.
- **No auth/SSO, no persistence beyond seed + in-memory run state, no mobile layout, no multi-tenant/platform features.** Prototype, two demo dates, that's the lifespan.

---

## 10. Build plan — phases and work items (dependency-ordered, no time estimates)

Structured to map 1:1 onto harness phases (`P0…P4`) and work items — the planner should consume this section as the literal phase structure, not invent its own decomposition. Items grouped with `∥` have disjoint file sets and may run in parallel; groups run in listed order. Every phase gate is a demo beat playing, not a report saying it plays.

### P0 — Foundation (everything depends on it)
- **W0.1 Scaffold** — create-next-app (16.2 stable), Tailwind v4, shadcn init, AI Elements; commit lockfile; **dependency freeze from this point**
- **W0.2 App shell** — dark theme tokens, nav, route stubs for the five §4 screens
- **W0.3 SOE contracts + adapter** — `lib/soe/types.ts` + adapter surface (§6); all data access flows through it
- **W0.4 Seed generator** — deterministic persona cast (§6 table) checked in; all arithmetic internally consistent
- Order: W0.1 → (W0.2 ∥ W0.3) → W0.4

### P1 — Core agent loop (**risk-retirement phase — nothing in P2+ starts until its gate passes**)
- **W1.1 Wire contract** — `docs/wire-contract.md`: streamed narration, `{ component, props }` render instructions, approval payloads, event-log entries (§5b)
- **W1.2 Component registry, Payment-Health set** — Zod schemas + renderers: MetricRow, TrendChart, PaymentHistoryTable, RiskBadge, OutreachDraftCard, ApprovalCard
- **W1.3 Agent runtime** — ToolLoopAgent + native tool approvals + telemetry→Event Log integration (§5d/§5e), behind API routes
- **W1.4 Run view screen** — streaming narration pane, progressive evidence pane, approval rail; renders the wire contract and nothing else
- **W1.5 Payment Health agent** — tools over the adapter + run definition; full loop working: event → run → evidence → approval → execution → event log
- Order: W1.1 → (W1.2 ∥ W1.3) → W1.4 → W1.5
- **Gate: Beat 2 plays start to finish.**

### P2 — Remaining agents (parallel to each other; both reuse the run view unchanged)
- **W2.1 BT Lifecycle agent** — tools + BTTimeline + InterestProjectionChart
- **W2.2 AU Growth agent** — tools + PartyGraph + spend-attribution logic
- **Gate: Beats 3 and 4 play.**

### P3 — Surrounding surfaces (all parallel, all independent)
- **W3.1 Command Center dashboard** — event ticker, agent status cards, KPI row, recent-approvals strip
- **W3.2 Event Log view** — filterable audit table
- **W3.3 Ask surface** — live generative-UI query + remaining registry components (BarBreakdown, CategoryPie, TransactionTable)
- **W3.4 Workflow canvas** — React Flow palette (5–6 node types), connect + Run wired to the Payment Health workflow
- **Gate: Beats 0, 1, 5, 6 play.**

### P4 — Demo hardening (serial polish; never skipped)
- **W4.1 DEMO_MODE fallbacks** — checked-in narration/draft strings, cached answers for the two rehearsed Ask queries, timeout wiring (§8)
- **W4.2 Resilience** — reset control (<2s to opening state), error boundaries on every screen
- **W4.3 Projector pass** — font sizes, contrast, nothing critical behind hover
- **W4.4 Verifier coverage** — `runtime.web.routes` covering every beat; full mechanical replay of the 8-minute script goes green
- **Gate: the complete demo script replays clean, repeatedly.**

**Cut order if the clock wins:** W3.4 (canvas) first, then W3.3 (Ask goes scripted-only), then W2.2 (demo ships with two agents). P1 and P4 are never cut — a two-agent demo with a bulletproof loop beats a four-surface demo that stutters.

---

## 11. Exec Q&A prep (informs copy and architecture, not a screen)

- *"How do we know the numbers are real?"* → The model routes; it never generates data. Every figure on screen came from the (mock) SOE layer through typed contracts. Production swaps the adapter to real SOE endpoints.
- *"What about governance?"* → Every agent action passes a human approval gate and writes to an audit log; production targets the existing enterprise Event Log platform.
- *"How does this get to production?"* → All intelligence is server-side behind documented JSON contracts. The production frontend is an Angular implementation of the same renderers inside the existing SOE application, built with the SOE team.
- *"Why these three use cases?"* → One saves money (delinquency prevention), one protects revenue (BT retention), one makes money (AU graduation) — all from data we already have, all human-approved.
