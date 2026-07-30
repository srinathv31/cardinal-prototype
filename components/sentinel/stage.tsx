"use client";

// The Sentinel stage shell (brief §4). Three-panel layout plus the audit
// strip, filling the viewport with no page scroll (brief §1: projected for
// stakeholders, nothing critical behind hover or below the fold). v3
// re-points the left panel from the event replay rail to the conversation
// rail (docs/v3-migration-map.md §4) — everything else about the shell is
// unchanged. `Stage` is the ONLY stateful component on this screen —
// it owns the single `ScenarioPlayer` instance and every other component
// here is a pure renderer of the snapshot it hands down via props (v1
// invariant 5b — zero business logic in components).
//
// `useSyncExternalStore` is the correct hook for a mutable class outside
// React's state graph (the player mutates in place and notifies via
// `subscribe`): the server snapshot equals the client's initial idle
// snapshot, so hydration never mismatches — the player hasn't ticked yet on
// either side.
//
// Height math: app/layout.tsx's <main> applies `py-6` (1.5rem top + 1.5rem
// bottom = 3rem = var(--spacing)*12, --spacing: 0.25rem per Tailwind's
// default theme) around every route, so the stage fills exactly the
// remaining viewport height rather than the more common `h-screen`.
//
// P3 closes the audit seam player.ts's header comment has documented since
// P0 ("the stage subscribes to the player's `auditWrite` messages and POSTs
// each one here itself"): the player is constructed with an `onMessage`
// callback that POSTs every `auditWrite` message's `entry` to
// `/api/sentinel/audit`, fire-and-forget. A failed or offline write must
// never affect playback (brief §8: the demo runs with the network cable
// pulled) — `.catch(() => {})` swallows the rejection instead of
// propagating it anywhere the player or a renderer would see. Rehearsal
// jumps (`jumpToAct`) re-post every `auditWrite` they fast-forward through
// same as normal playback; each replay is simply its own run in the shared
// Event Log, which is fine.
//
// P3b (brief §6c, Act III beat 8, W3.4) extends that SAME `onMessage`
// callback with one more fire-and-forget POST: when an `approvalResolved`
// message arrives for `REMEDIATION_APPROVAL_ID` with `approved: true`, this
// calls `POST /api/sentinel/remediate` — never awaited, never branched on,
// exactly the audit write's own shape one line above. This is deliberately
// a pure side effect with no observable role in playback: the
// `RemediationReport` card that renders right after this in the SCRIPT is
// already fully precomputed from `lib/sentinel/exception-fixture.ts`'s
// fixture (demo-scenario.ts's `actThreeSteps`), not from this POST's
// response — the response is read by nothing. That is what makes "the
// network cable pulled" (brief §9) survivable here: a failed or offline
// remediate call changes nothing the audience sees. It is still worth
// making for real, though, because the route's own `confirmationId` is a
// PURE function of the same `fixture.reportId` the scripted card already
// used (`rem-${fixture.reportId}`, both derivations — see
// app/api/sentinel/remediate/route.ts and demo-scenario.ts's
// `remediationConfirmationId` — read the identical field), so the scripted
// card and the route's real audit-log entry are byte-identical without
// this call ever needing to feed data back into the stage.

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import { ScenarioPlayer } from "@/lib/sentinel/scenario/player";
import type { SentinelScenario, SentinelStageState } from "@/lib/sentinel/scenario/types";
import type { PolicyDocument } from "@/lib/sentinel/policy";
import { AGENT_ID, REMEDIATION_APPROVAL_ID, RUN_ID } from "@/lib/sentinel/scenario/demo-scenario";
import { AuditStrip } from "./audit-strip";
import { ContextRail } from "./context-rail";
import { ConversationRail } from "./conversation-rail";
import { LiveAgentGraph } from "./live-agent-graph";
import { PolicyPanel } from "./policy-panel";
import { PresenterBar } from "./presenter-bar";

export function Stage({
  scenario,
  policyDocument,
}: {
  scenario: SentinelScenario;
  policyDocument: PolicyDocument;
}) {
  const player = useMemo(
    () =>
      new ScenarioPlayer(scenario, {
        onMessage: (message) => {
          if (message.type === "auditWrite") {
            fetch("/api/sentinel/audit", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(message.entry),
            }).catch(() => {});
            return;
          }
          // Task 4 / brief §6c: the remediation gate's own execution POST.
          // Fire-and-forget, exactly like the audit write above — see this
          // file's header comment for why the response is never read.
          if (message.type === "approvalResolved" && message.id === REMEDIATION_APPROVAL_ID && message.approved) {
            fetch("/api/sentinel/remediate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ runId: RUN_ID, agentId: AGENT_ID }),
            }).catch(() => {});
          }
        },
      }),
    [scenario],
  );

  // Clears any pending timer on unmount (and on scenario swap, since the
  // memo above tears down the old player) — a stray setTimeout must never
  // outlive the component that armed it.
  useEffect(() => () => player.reset(), [player]);

  const subscribe = useCallback((onStoreChange: () => void) => player.subscribe(onStoreChange), [player]);
  const getSnapshot = useCallback(() => player.getSnapshot(), [player]);
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const onPlay = useCallback(() => player.play(), [player]);
  const onPause = useCallback(() => player.pause(), [player]);
  const onReset = useCallback(() => player.reset(), [player]);
  const onJumpToAct = useCallback((act: 1 | 2 | 3) => player.jumpToAct(act), [player]);
  const onSetSpeed = useCallback((speed: 1 | 2) => player.setSpeed(speed), [player]);
  const onResolveApproval = useCallback(
    (id: string, approved: boolean) => player.resolveApproval(id, approved),
    [player],
  );
  const onPolicyDrop = useCallback(() => {
    const pending = player.getSnapshot().pendingStageAction;
    if (pending) player.resolveStageAction(pending.id);
  }, [player]);
  // Mirrors `onPolicyDrop` exactly (W1.1): reads the pending gate off the
  // player rather than trusting a stale prop, and only resolves it when
  // it's actually the `'prompt'` kind the conversation rail's input is for
  // — `ConversationRail` itself disables the input outside that state, but
  // this is the belt-and-suspenders check against a click racing a script
  // advance.
  const onSubmitPrompt = useCallback(
    (text: string) => {
      const pending = player.getSnapshot().pendingStageAction;
      if (pending?.action === "prompt") player.resolveStageAction(pending.id, text);
    },
    [player],
  );

  return (
    <div className="flex h-[calc(100vh-var(--spacing)*12)] min-h-0 flex-col gap-4">
      <StageHeader status={state.status} act={state.act} />
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(280px,3fr)_minmax(0,6fr)_minmax(320px,4fr)] gap-4">
        <ConversationRail
          turns={state.conversation}
          counter={state.counter}
          caption={state.counterCaption}
          pendingStageAction={state.pendingStageAction}
          onSubmitPrompt={onSubmitPrompt}
        />
        <LiveAgentGraph
          nodes={state.graph.nodes}
          animatedEdges={state.graph.animatedEdges}
          headline={state.headline}
          approvalPending={state.status === "awaiting-approval"}
          nodeDetails={state.graph.nodeDetails}
        />
        <div className="relative grid min-h-0 overflow-hidden">
          <ContextRail items={state.contextItems} onResolveApproval={onResolveApproval} />
          <PolicyPanel
            panel={state.policyPanel}
            dropEnabled={state.pendingStageAction?.action === "policy-drop"}
            onDrop={onPolicyDrop}
            document={policyDocument}
          />
        </div>
      </div>
      <AuditStrip entries={state.auditEntries} />
      <PresenterBar
        status={state.status}
        act={state.act}
        speed={state.speed}
        onPlay={onPlay}
        onPause={onPause}
        onReset={onReset}
        onJumpToAct={onJumpToAct}
        onSetSpeed={onSetSpeed}
      />
    </div>
  );
}

/** Same status→label mapping as the presenter bar's readout
 * (presenter-bar.tsx) — kept duplicated rather than shared because each is
 * a tiny, screen-local presentational lookup, not business logic. */
function statusLabel(status: SentinelStageState["status"], act: SentinelStageState["act"]): string {
  switch (status) {
    case "idle":
      return "Idle";
    case "playing":
      return `Act ${act} · Playing`;
    case "paused":
      return act === 0 ? "Paused" : `Act ${act} · Paused`;
    case "awaiting-approval":
      return "Awaiting approval";
    case "awaiting-stage-action":
      return "Awaiting presenter";
    case "done":
      return "Complete";
  }
}

function StageHeader({ status, act }: { status: SentinelStageState["status"]; act: SentinelStageState["act"] }) {
  const playing = status === "playing";
  return (
    <header className="flex shrink-0 items-center justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sentinel</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Authorized-user policy enforcement across the portfolio
        </p>
      </div>
      <span
        className={
          playing
            ? "inline-flex shrink-0 items-center gap-1.5 rounded-full bg-primary/15 px-3 py-1 text-sm font-semibold text-primary"
            : "inline-flex shrink-0 items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-sm font-semibold text-muted-foreground"
        }
      >
        {statusLabel(status, act)}
      </span>
    </header>
  );
}
