"use client";

// Hidden presenter bar (brief §4, §8: "audience never sees controls").
// Toggled by the backtick key so nothing appears on the projected screen
// unless the presenter deliberately summons it. W1.1: every control below
// is now wired to the `ScenarioPlayer` methods `Stage` passes down as
// arrow-wrapper props — this file still holds no player state of its own,
// it only forwards clicks and renders the status the stage already derived.

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { SentinelStageState } from "@/lib/sentinel/scenario/types";

const ACTS = [1, 2, 3] as const;

/** Same status→label mapping as the stage header's chip (stage.tsx) — kept
 * duplicated rather than shared because each is a tiny, screen-local
 * presentational lookup, not business logic. */
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

interface PresenterBarProps {
  status: SentinelStageState["status"];
  act: SentinelStageState["act"];
  speed: 1 | 2;
  onPlay: () => void;
  onPause: () => void;
  onReset: () => void;
  onJumpToAct: (act: 1 | 2 | 3) => void;
  onSetSpeed: (speed: 1 | 2) => void;
}

export function PresenterBar({
  status,
  act,
  speed,
  onPlay,
  onPause,
  onReset,
  onJumpToAct,
  onSetSpeed,
}: PresenterBarProps) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "`") return;
      const target = event.target as HTMLElement | null;
      // Ignore the toggle while the presenter is typing anywhere else on the
      // stage (there's nothing to type into yet in P1, but this is cheap
      // insurance for later work items that add inputs to the rail/drawer).
      const editing =
        target?.tagName === "INPUT" ||
        target?.tagName === "TEXTAREA" ||
        target?.isContentEditable;
      if (editing) return;
      setVisible((current) => !current);
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  if (!visible) return null;

  const playDisabled =
    status === "playing" ||
    status === "awaiting-approval" ||
    status === "awaiting-stage-action" ||
    status === "done";
  const pauseDisabled = status !== "playing";
  const otherSpeed = speed === 1 ? 2 : 1;

  return (
    <div className="fixed inset-x-0 bottom-20 z-50 flex justify-center px-4">
      <div className="flex flex-wrap items-center gap-2 rounded-full border border-border bg-popover/95 px-4 py-2.5 shadow-lg ring-1 ring-foreground/10 backdrop-blur">
        <Button size="sm" variant="secondary" disabled={playDisabled} onClick={onPlay}>
          Play
        </Button>
        <Button size="sm" variant="secondary" disabled={pauseDisabled} onClick={onPause}>
          Pause
        </Button>
        <Button size="sm" variant="secondary" onClick={onReset}>
          Reset
        </Button>
        <span className="mx-1 h-4 w-px bg-border" aria-hidden="true" />
        {ACTS.map((actNumber) => (
          <Button
            key={actNumber}
            size="sm"
            variant={act === actNumber ? "secondary" : "outline"}
            onClick={() => onJumpToAct(actNumber)}
          >
            Act {actNumber}
          </Button>
        ))}
        <span className="mx-1 h-4 w-px bg-border" aria-hidden="true" />
        <Button size="sm" variant="outline" onClick={() => onSetSpeed(otherSpeed)}>
          {speed}x
        </Button>
        <span className="ml-1 text-xs text-muted-foreground">{statusLabel(status, act)}</span>
      </div>
    </div>
  );
}
