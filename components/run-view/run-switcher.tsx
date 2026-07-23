"use client";

// Run switcher (brief §4 screen 3 — three concurrent agent runs). Mounts
// every RunView up front and toggles visibility with hidden/block classes
// rather than conditionally rendering — switching tabs must never remount a
// RunView (which would drop its `useChat` session, brief §5d: a paused
// approval must survive normal UI navigation). Zero business logic: this
// only tracks which tab is selected.

import { useState } from "react";
import { cn } from "@/lib/utils";
import type { StreamEvent } from "@/lib/soe";
import { RunView } from "./run-view";

export interface RunConfig {
  agentId: string;
  agentName: string;
  trigger: StreamEvent;
}

export function RunSwitcher({ runs }: { runs: RunConfig[] }) {
  const [activeAgentId, setActiveAgentId] = useState<string | undefined>(runs[0]?.agentId);

  return (
    <div className="flex flex-col gap-6">
      <div
        role="tablist"
        aria-label="Agent runs"
        className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card/60 p-1.5 ring-1 ring-foreground/5"
      >
        {runs.map((run) => (
          <button
            key={run.agentId}
            type="button"
            role="tab"
            aria-selected={run.agentId === activeAgentId}
            onClick={() => setActiveAgentId(run.agentId)}
            className={cn(
              "rounded-lg px-3.5 py-1.5 text-sm font-semibold transition-colors",
              run.agentId === activeAgentId
                ? "bg-primary/15 text-primary"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
          >
            {run.agentName}
          </button>
        ))}
      </div>

      {runs.map((run) => (
        <div key={run.agentId} className={run.agentId === activeAgentId ? "block" : "hidden"}>
          <RunView trigger={run.trigger} agentId={run.agentId} agentName={run.agentName} />
        </div>
      ))}
    </div>
  );
}
