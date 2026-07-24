// ScenarioPlayer (W0.2, brief §6) — the whole Sentinel engine. A plain,
// framework-free class: no React import (client-safe but not
// React-coupled), no network calls (the player itself never fetches — the
// stage wires its `auditWrite` messages to `POST /api/sentinel/audit` in
// P1), no `Math.random()`, no `Date.now()` dependence for logic (brief §8:
// "no randomness anywhere in the scenario path"; audit-entry timestamps are
// assigned server-side by lib/events/store.ts on append, not here).
//
// Timer discipline: exactly one pending `setTimeout` at a time, armed via
// `scheduleAfter` for the FULL remaining delay — never a tick loop. Browsers
// clamp nested `setTimeout`s to ≥4ms once nesting passes depth 5, so slicing
// waits into small ticks would stretch every delay ~4× in real playback
// (invisible under fake timers, fatal on stage). `pause()` computes the
// remaining delay from `Date.now() − waitArmedAt` — wall-clock bookkeeping
// only, which never reaches the message log, so determinism (brief §8) is
// untouched, and fake timers mock `Date` in lockstep so tests stay exact.
// `scheduleAfter` is also what narration's inter-chunk gaps use, so the same
// pause/resume mechanics cover both "waiting to start a step" and "waiting
// between typing-effect chunks" for free.
//
// This is 100% scripted (brief §9) — no imports from 'ai', no live model.

import type {
  ActMarkerStep,
  AuditWriteStep,
  AwaitApprovalStep,
  AwaitStageActionStep,
  CounterUpdateStep,
  EmitEventStep,
  GraphStep,
  NarrationStep,
  PolicyPanelStep,
  RenderStep,
  ScenarioTimedStep,
  SentinelContextItem,
  SentinelGraphEdge,
  SentinelNodeId,
  SentinelNodeState,
  SentinelScenario,
  SentinelStageState,
  SentinelStreamMessage,
  SentinelStreamMessageBase,
} from './types';
import { SENTINEL_NODE_IDS } from './types';
import type { EventLogEntry } from '@/lib/events/types';

/** Typing-effect granularity (brief §8): fixed 3-character chunks on a
 * fixed 16ms cadence (scaled by speed) — deterministic, no jitter. */
const NARRATION_CHUNK_SIZE = 3;
const NARRATION_TICK_MS = 16;

function chunkText(text: string, size: number): string[] {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += size) {
    chunks.push(text.slice(i, i + size));
  }
  return chunks.length > 0 ? chunks : [''];
}

function idleGraphNodes(): Record<SentinelNodeId, SentinelNodeState> {
  const nodes = {} as Record<SentinelNodeId, SentinelNodeState>;
  for (const id of SENTINEL_NODE_IDS) nodes[id] = 'idle';
  return nodes;
}

type InstantStep =
  | EmitEventStep
  | GraphStep
  | RenderStep
  | CounterUpdateStep
  | AuditWriteStep
  | PolicyPanelStep;

export class ScenarioPlayer {
  private readonly scenario: SentinelScenario;
  private readonly onMessage?: (message: SentinelStreamMessage) => void;
  private readonly listeners = new Set<() => void>();

  // Playback cursor + timer bookkeeping.
  private stepIndex = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private remainingWaitMs: number | null = null;
  /** Wall clock at the moment the current wait's timeout was armed — pause
   * bookkeeping only (this file's header comment), never published. */
  private waitArmedAt: number | null = null;
  private onWaitComplete: (() => void) | null = null;
  private pendingApproval: AwaitApprovalStep | null = null;
  private pendingStageAction: AwaitStageActionStep | null = null;

  // Derived state (mirrors SentinelStageState field-for-field; see commit()).
  private status: SentinelStageState['status'] = 'idle';
  private act: SentinelStageState['act'] = 0;
  private speed: SentinelStageState['speed'] = 1;
  private railEvents: SentinelStageState['railEvents'] = [];
  private counter: SentinelStageState['counter'] = { events: 0, violations: 0, flagged: 0 };
  private counterCaption: string | undefined = undefined;
  private graphNodes: Record<SentinelNodeId, SentinelNodeState> = idleGraphNodes();
  private animatedEdges: SentinelGraphEdge[] = [];
  private headline = '';
  private contextItems: SentinelContextItem[] = [];
  private auditEntries: SentinelStageState['auditEntries'] = [];
  private messages: SentinelStreamMessage[] = [];
  private seq = 0;
  private policyPanel: SentinelStageState['policyPanel'] = 'closed';

  private snapshot: SentinelStageState;

  constructor(scenario: SentinelScenario, options?: { onMessage?: (message: SentinelStreamMessage) => void }) {
    this.scenario = scenario;
    this.onMessage = options?.onMessage;
    this.snapshot = this.buildSnapshot();
  }

  // ---------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------

  play(): void {
    if (
      this.status === 'playing' ||
      this.status === 'done' ||
      this.status === 'awaiting-approval' ||
      this.status === 'awaiting-stage-action'
    ) {
      return; // guard against double-play and against resuming states that aren't resumable this way
    }

    // A marker only gets consumed by play() when we're actually sitting at
    // it (not mid-wait) — covers both the very first play() (status
    // 'idle', stepIndex 0 pointing at act I's marker) and resuming after a
    // mid-demo act boundary (status 'paused' for the same reason).
    if (this.remainingWaitMs === null) {
      const current = this.scenario.steps[this.stepIndex];
      if (current?.type === 'actMarker') {
        this.consumeMarker(current);
      }
    }

    this.status = 'playing';
    this.commit();

    if (this.remainingWaitMs !== null) {
      this.armWaitTimer(); // resume mid-wait with the exact remaining delay
    } else {
      this.advance();
    }
  }

  pause(): void {
    if (this.status !== 'playing') return;
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
      // Record how much of the armed wait is still owed, so play() resumes
      // exactly where the wait left off.
      if (this.remainingWaitMs !== null && this.waitArmedAt !== null) {
        const elapsed = Date.now() - this.waitArmedAt;
        this.remainingWaitMs = Math.max(0, this.remainingWaitMs - elapsed);
      }
      this.waitArmedAt = null;
    }
    this.status = 'paused';
    this.commit();
  }

  /** Full return to pre-Act-I state, synchronous (brief §8: <2s trivially —
   * there's no async work here at all). Cancels any pending timer AND any
   * pending approval. */
  reset(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.initializeState();
    this.commit();
  }

  /**
   * Rehearsal shortcut. Resets, then fast-forwards through every step
   * strictly before `act`'s marker with zero delay: narration is emitted
   * whole in one final `narrationDelta` (`done: true`) instead of chunked,
   * and any `awaitApproval` encountered along the way is auto-resolved as
   * approved (publishing `approvalRequest` + `approvalResolved` +
   * the derived `auditWrite` back-to-back) — there's no presenter around to
   * click through a rehearsal. Likewise, any `awaitStageAction` is
   * auto-resolved (publishing `stageActionRequest` + `stageActionResolved`
   * back-to-back), same rationale. Earlier `actMarker`s are consumed (and
   * published) exactly as normal playback would; the TARGET marker for
   * `act` is left unconsumed so the player "ends paused at the marker" —
   * identical to how a live run pauses at an act boundary, just arrived at
   * instantly. A subsequent `play()` consumes it and continues normally.
   */
  jumpToAct(act: 1 | 2 | 3): void {
    this.reset();
    const steps = this.scenario.steps;

    while (this.stepIndex < steps.length) {
      const step = steps[this.stepIndex];

      if (step.type === 'actMarker') {
        if (step.act === act) break; // stop here, unconsumed
        this.consumeMarker(step);
        continue;
      }

      if (step.type === 'awaitApproval') {
        this.handleApprovalRequest(step);
        this.handleApprovalResolution(step, true);
        this.stepIndex++;
        continue;
      }

      if (step.type === 'awaitStageAction') {
        // No presenter around to click through a rehearsal — same rationale
        // as the approval auto-resolve above: publish the request and its
        // resolution back-to-back and keep fast-forwarding.
        this.publish({ type: 'stageActionRequest', id: step.id, action: step.action });
        this.publish({ type: 'stageActionResolved', id: step.id });
        this.stepIndex++;
        continue;
      }

      if (step.type === 'narration') {
        this.emitNarrationDelta(step.id, step.text, true, step.text);
        this.stepIndex++;
        continue;
      }

      this.executeInstant(step);
      this.stepIndex++;
    }

    this.status = this.stepIndex < steps.length ? 'paused' : 'done';
    this.commit();
  }

  setSpeed(speed: 1 | 2): void {
    this.speed = speed;
    // Applies to subsequent waits only — an in-flight wait keeps running at
    // whatever pace it was armed with (implementation note in the spec:
    // "don't bother rescaling an in-flight wait").
    this.commit();
  }

  /** No-op unless this approval is the one currently pending. */
  resolveApproval(id: string, approved: boolean): void {
    if (this.status !== 'awaiting-approval' || this.pendingApproval === null || this.pendingApproval.id !== id) {
      return;
    }
    const step = this.pendingApproval;
    this.pendingApproval = null;
    this.handleApprovalResolution(step, approved);
    this.stepIndex++;
    this.status = 'playing';
    this.commit();
    this.advance();
  }

  /** No-op unless this stage action is the one currently pending — mirrors
   * `resolveApproval`. */
  resolveStageAction(id: string): void {
    if (
      this.status !== 'awaiting-stage-action' ||
      this.pendingStageAction === null ||
      this.pendingStageAction.id !== id
    ) {
      return;
    }
    this.pendingStageAction = null;
    this.publish({ type: 'stageActionResolved', id });
    this.stepIndex++;
    this.status = 'playing';
    this.commit();
    this.advance();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  getSnapshot(): SentinelStageState {
    return this.snapshot;
  }

  // ---------------------------------------------------------------------
  // Playback engine
  // ---------------------------------------------------------------------

  /** Looks at the step currently under the cursor and decides what to do:
   * finish the run, pause at a marker, block on an approval or stage
   * action, or schedule the wait for a timed step. Called after every step
   * completes, after a marker is consumed, and after an approval or stage
   * action resolves. */
  private advance(): void {
    if (this.stepIndex >= this.scenario.steps.length) {
      this.status = 'done';
      this.commit();
      return;
    }

    const step = this.scenario.steps[this.stepIndex];

    if (step.type === 'actMarker') {
      this.status = 'paused';
      this.commit();
      return;
    }

    if (step.type === 'awaitApproval') {
      this.handleApprovalRequest(step);
      this.pendingApproval = step;
      this.status = 'awaiting-approval';
      this.commit();
      return;
    }

    if (step.type === 'awaitStageAction') {
      this.publish({ type: 'stageActionRequest', id: step.id, action: step.action });
      this.pendingStageAction = step;
      this.status = 'awaiting-stage-action';
      this.commit();
      return;
    }

    this.scheduleAfter(step.delayMs / this.speed, () => this.executeTimedStep(step));
  }

  private executeTimedStep(step: ScenarioTimedStep): void {
    if (step.type === 'narration') {
      this.beginNarration(step);
      return;
    }
    this.executeInstant(step);
    this.finishStep();
  }

  private executeInstant(step: InstantStep): void {
    switch (step.type) {
      case 'emitEvent':
        this.handleEmitEvent(step);
        return;
      case 'graphStep':
        this.handleGraphStep(step);
        return;
      case 'render':
        this.handleRender(step);
        return;
      case 'counterUpdate':
        this.handleCounterUpdate(step);
        return;
      case 'auditWrite':
        this.handleAuditWrite(step);
        return;
      case 'policyPanel':
        this.handlePolicyPanel(step);
        return;
    }
  }

  private finishStep(): void {
    this.stepIndex++;
    this.advance();
  }

  private consumeMarker(marker: ActMarkerStep): void {
    this.act = marker.act;
    this.publish({ type: 'actMarker', act: marker.act, title: marker.title });
    this.stepIndex++;
    this.commit();
  }

  // ---------------------------------------------------------------------
  // Wait primitive — shared by step delays and narration inter-chunk gaps.
  // ---------------------------------------------------------------------

  private scheduleAfter(ms: number, onComplete: () => void): void {
    this.remainingWaitMs = ms;
    this.onWaitComplete = onComplete;
    this.armWaitTimer();
  }

  private armWaitTimer(): void {
    const remaining = this.remainingWaitMs ?? 0;
    this.waitArmedAt = Date.now();
    this.timer = setTimeout(() => {
      this.timer = null;
      this.waitArmedAt = null;
      this.remainingWaitMs = null;
      const complete = this.onWaitComplete;
      this.onWaitComplete = null;
      complete?.();
    }, remaining);
  }

  // ---------------------------------------------------------------------
  // Narration (chunked typing effect)
  // ---------------------------------------------------------------------

  private beginNarration(step: NarrationStep): void {
    const chunks = chunkText(step.text, NARRATION_CHUNK_SIZE);
    this.playNarrationChunks(step.id, chunks, 0, '');
  }

  private playNarrationChunks(id: string, chunks: string[], index: number, soFar: string): void {
    const delta = chunks[index];
    const accumulated = soFar + delta;
    const done = index === chunks.length - 1;
    this.emitNarrationDelta(id, delta, done, accumulated);
    if (done) {
      this.finishStep();
      return;
    }
    this.scheduleAfter(NARRATION_TICK_MS / this.speed, () =>
      this.playNarrationChunks(id, chunks, index + 1, accumulated),
    );
  }

  private emitNarrationDelta(id: string, delta: string, done: boolean, textSoFar: string): void {
    this.publish({ type: 'narrationDelta', id, delta, done });
    const index = this.contextItems.findIndex((item) => item.kind === 'narration' && item.id === id);
    const item: SentinelContextItem = { kind: 'narration', id, text: textSoFar, done };
    if (index === -1) this.contextItems.push(item);
    else this.contextItems[index] = item;
    this.headline = textSoFar;
    this.commit();
  }

  // ---------------------------------------------------------------------
  // Approvals
  // ---------------------------------------------------------------------

  private handleApprovalRequest(step: AwaitApprovalStep): void {
    this.publish({ type: 'approvalRequest', id: step.id, payload: step.payload });
    this.contextItems.push({ kind: 'approval', id: step.id, payload: step.payload });
    this.commit();
  }

  private handleApprovalResolution(step: AwaitApprovalStep, approved: boolean): void {
    this.publish({ type: 'approvalResolved', id: step.id, approved });
    const index = this.contextItems.findIndex((item) => item.kind === 'approval' && item.id === step.id);
    if (index !== -1) {
      const existing = this.contextItems[index];
      if (existing.kind === 'approval') {
        this.contextItems[index] = { ...existing, decision: approved ? 'approved' : 'denied' };
      }
    }
    this.commit();

    const entry: Omit<EventLogEntry, 'id' | 'timestamp'> = {
      ...step.audit,
      kind: approved ? 'approval.granted' : 'approval.denied',
      actor: 'human',
    };
    this.writeAudit(entry);
  }

  // ---------------------------------------------------------------------
  // Per-step-type publish + derived-state handlers
  // ---------------------------------------------------------------------

  private handleEmitEvent(step: EmitEventStep): void {
    this.publish({
      type: 'emitEvent',
      event: step.event,
      highlight: step.highlight,
      complianceBadge: step.complianceBadge,
    });
    this.railEvents.push({
      event: step.event,
      highlight: step.highlight ?? false,
      complianceBadge: step.complianceBadge,
    });
    this.commit();
  }

  private handleGraphStep(step: GraphStep): void {
    this.publish({
      type: 'graphStep',
      nodeId: step.nodeId,
      nodeState: step.nodeState,
      animatedEdges: step.animatedEdges,
    });
    this.graphNodes = { ...this.graphNodes, [step.nodeId]: step.nodeState };
    if (step.animatedEdges !== undefined) {
      this.animatedEdges = step.animatedEdges.slice();
    }
    this.commit();
  }

  /** A `render` step whose `id` matches an existing 'render' context item
   * REPLACES it in place (position preserved) rather than appending a new
   * one — how Act II's rule cards flip proposed→active and grow
   * progressively, mirroring `emitNarrationDelta`'s same-id replace-in-place
   * for narration. Different ids still append, exactly as before. */
  private handleRender(step: RenderStep): void {
    this.publish({ type: 'render', id: step.id, instruction: step.instruction });
    const item: SentinelContextItem = { kind: 'render', id: step.id, instruction: step.instruction };
    const index = this.contextItems.findIndex((existing) => existing.kind === 'render' && existing.id === step.id);
    if (index === -1) this.contextItems.push(item);
    else this.contextItems[index] = item;
    this.commit();
  }

  private handleCounterUpdate(step: CounterUpdateStep): void {
    this.publish({ type: 'counterUpdate', counter: step.counter, caption: step.caption });
    this.counter = { ...step.counter };
    this.counterCaption = step.caption;
    this.commit();
  }

  private handleAuditWrite(step: AuditWriteStep): void {
    this.writeAudit(step.entry);
  }

  private handlePolicyPanel(step: PolicyPanelStep): void {
    this.publish({ type: 'policyPanel', panel: step.panel });
    this.policyPanel = step.panel;
    this.commit();
  }

  private writeAudit(entry: Omit<EventLogEntry, 'id' | 'timestamp'>): void {
    const message = this.publish({ type: 'auditWrite', entry });
    if (message.type === 'auditWrite') {
      this.auditEntries.push({ ...message.entry, seq: message.seq });
    }
    this.commit();
  }

  // ---------------------------------------------------------------------
  // Publish / snapshot plumbing
  // ---------------------------------------------------------------------

  private publish(base: SentinelStreamMessageBase): SentinelStreamMessage {
    const message = { ...base, seq: this.seq++ } as SentinelStreamMessage;
    this.messages.push(message);
    this.onMessage?.(message);
    return message;
  }

  private initializeState(): void {
    this.stepIndex = 0;
    this.remainingWaitMs = null;
    this.waitArmedAt = null;
    this.onWaitComplete = null;
    this.pendingApproval = null;
    this.pendingStageAction = null;

    this.status = 'idle';
    this.act = 0;
    this.speed = 1;
    this.railEvents = [];
    this.counter = { events: 0, violations: 0, flagged: 0 };
    this.counterCaption = undefined;
    this.graphNodes = idleGraphNodes();
    this.animatedEdges = [];
    this.headline = '';
    this.contextItems = [];
    this.auditEntries = [];
    this.messages = [];
    this.seq = 0;
    this.policyPanel = 'closed';
  }

  /** Builds a fresh, frozen snapshot object from current internal state and
   * notifies subscribers — the only place `this.snapshot` is reassigned, so
   * `getSnapshot()` returns a new identity exactly when state changed. */
  private commit(): void {
    this.snapshot = this.buildSnapshot();
    for (const listener of this.listeners) listener();
  }

  private buildSnapshot(): SentinelStageState {
    return Object.freeze({
      status: this.status,
      act: this.act,
      speed: this.speed,
      railEvents: this.railEvents.slice(),
      counter: { ...this.counter },
      counterCaption: this.counterCaption,
      graph: { nodes: { ...this.graphNodes }, animatedEdges: this.animatedEdges.slice() },
      headline: this.headline,
      contextItems: this.contextItems.slice(),
      auditEntries: this.auditEntries.slice(),
      messages: this.messages.slice(),
      policyPanel: this.policyPanel,
      pendingStageAction: this.pendingStageAction
        ? { id: this.pendingStageAction.id, action: this.pendingStageAction.action }
        : null,
    });
  }
}
