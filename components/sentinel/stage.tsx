"use client";

// The Sentinel stage shell (v2 brief §4, W0.4) — three-panel layout plus the
// audit strip, filling the viewport with no page scroll (brief §1: projected
// for stakeholders, nothing critical behind hover or below the fold). This
// is the idle P0 skeleton: every figure below is a static placeholder, never
// derived from lib/soe or lib/sentinel (v1 invariant 5b — zero business
// logic in components). P1+ swaps each panel's placeholder body for the
// ScenarioPlayer-driven view without touching this layout.
//
// Height math: app/layout.tsx's <main> applies `py-6` (1.5rem top + 1.5rem
// bottom = 3rem = var(--spacing)*12, --spacing: 0.25rem per Tailwind's
// default theme) around every route, so the stage fills exactly the
// remaining viewport height rather than the more common `h-screen`.

import { AuditStrip } from "./audit-strip";
import { ContextRail } from "./context-rail";
import { EventReplayRail } from "./event-replay-rail";
import { LiveAgentGraph } from "./live-agent-graph";
import { PresenterBar } from "./presenter-bar";

export function Stage() {
  return (
    <div className="flex h-[calc(100vh-var(--spacing)*12)] min-h-0 flex-col gap-4">
      <StageHeader />
      <div className="grid min-h-0 flex-1 grid-cols-[minmax(280px,3fr)_minmax(0,6fr)_minmax(320px,4fr)] gap-4">
        <EventReplayRail />
        <LiveAgentGraph />
        <ContextRail />
      </div>
      <AuditStrip />
      <PresenterBar />
    </div>
  );
}

function StageHeader() {
  return (
    <header className="flex shrink-0 items-center justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sentinel</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Policy enforcement over the SOE event stream
        </p>
      </div>
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-muted px-3 py-1 text-sm font-semibold text-muted-foreground">
        Idle
      </span>
    </header>
  );
}
