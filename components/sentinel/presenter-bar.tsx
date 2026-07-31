"use client";

// Hidden presenter bar (brief §4, §8: "audience never sees controls").
// Toggled by the backtick key so nothing appears on the projected screen
// unless the presenter deliberately summons it. W1.1: every control below
// is now wired to the `ScenarioPlayer` methods `Stage` passes down as
// arrow-wrapper props — this file still holds no player state of its own,
// it only forwards clicks and renders the status the stage already derived.
//
// P5 W5.1 (CARDINAL_V3_AU_BRIEF.md §8/§9: "reset in under 2 seconds,"
// "presenter bar hidden by default") adds the presenter's actual driving
// controls as hotkeys, not just clickable buttons — a presenter talking
// while they drive the stage needs to fire these without hunting for the
// bar or a specific pixel. The hotkeys work whether or not the bar is
// currently visible: a presenter who already knows the keys shouldn't have
// to summon the bar first just to use them, and never having to reveal it
// at all is the strongest version of "the audience never sees controls."
//
// Key choices (brief: "cannot fire accidentally"): Space for play/pause
// mirrors every video/slide player's own convention, with `P` bound as the
// same action (this file's inline comment on that branch has the reason);
// `1`/`2`/`3` mirror the bar's own act buttons; `S` toggles speed; Reset is
// the one genuinely destructive action (it aborts a run in progress with no
// confirmation), so it alone requires Shift held — a plain letter is too
// easy to hit while reaching for something else. Backtick keeps toggling
// the bar's own visibility, unchanged from P1. Every key shares ONE guard:
// ignore the keystroke entirely while an INPUT/TEXTAREA/contenteditable has
// focus, so the conversation rail's prompt input (brief §4 — live during
// Act III, the demo's best moment) never has a keystroke stolen out from
// under it. This is the exact interaction the work item calls out to
// verify explicitly.
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { SentinelStageState } from "@/lib/sentinel/scenario/types";

const ACTS = [1, 2, 3] as const;

/** True while the event's target is a text-entry surface (the conversation
 * rail's prompt input is the only one on this stage today) — every hotkey
 * below bails out early when this is true. */
function isTextEntryTarget(target: EventTarget | null): boolean {
  const element = target as HTMLElement | null;
  return (
    element?.tagName === "INPUT" ||
    element?.tagName === "TEXTAREA" ||
    !!element?.isContentEditable
  );
}

/** The legend the presenter bar itself surfaces (brief W5.1: "somewhere
 * discoverable ... without putting them on the projected screen" — the bar
 * is hidden by default, so a legend drawn INSIDE it is never on the
 * projected resting state). Doubles as this file's one source of truth for
 * which keys do what, so the handler below and the on-screen legend can
 * never drift apart. */
const HOTKEY_LEGEND: Array<{ keys: string; action: string }> = [
  { keys: "Space / P", action: "play / pause" },
  { keys: "1 2 3", action: "jump to act" },
  { keys: "S", action: "toggle speed" },
  { keys: "⇧R", action: "reset" },
  { keys: "`", action: "hide this bar" },
];

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

  const playDisabled =
    status === "playing" ||
    status === "awaiting-approval" ||
    status === "awaiting-stage-action" ||
    status === "done";
  const pauseDisabled = status !== "playing";
  const otherSpeed = speed === 1 ? 2 : 1;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      // The one guard every hotkey shares (this file's header comment) —
      // checked ONCE, before any key is even inspected, so a stray keydown
      // while the prompt input is focused can never reach any branch below.
      if (isTextEntryTarget(event.target)) return;

      if (event.key === "`") {
        setVisible((current) => !current);
        return;
      }

      // Everything past this point is a stage-driving action, not a bar
      // visibility toggle — none of it needs `visible` to be true first
      // (this file's header comment).
      //
      // `P` is a deliberate second binding for the same action, not a
      // separate feature: Space is the primary key (every video/slide
      // player's own convention), but a presenter's hand can land on a
      // control that already owns Space's native activation (a focused
      // button treats Space as "click me" on `keyup`), so a letter with no
      // such native meaning is worth having as a fallback that always
      // reaches this handler the same way.
      if (event.code === "Space" || event.key === " " || event.key.toLowerCase() === "p") {
        event.preventDefault(); // Space's native default is page scroll
        if (status === "playing") onPause();
        else if (!playDisabled) onPlay();
        return;
      }
      if (event.key === "1" || event.key === "2" || event.key === "3") {
        onJumpToAct(Number(event.key) as 1 | 2 | 3);
        return;
      }
      if (event.key.toLowerCase() === "s" && !event.shiftKey) {
        onSetSpeed(otherSpeed);
        return;
      }
      if (event.key.toLowerCase() === "r" && event.shiftKey) {
        onReset();
        return;
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [status, playDisabled, otherSpeed, onPlay, onPause, onReset, onJumpToAct, onSetSpeed]);

  if (!visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4">
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
      {/* The hotkey legend (this file's header comment) — only ever visible
       * alongside the bar itself, so it's discoverable for the presenter on
       * demand and never part of the projected resting state. */}
      <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-full border border-border bg-popover/95 px-4 py-1.5 text-xs text-muted-foreground shadow-lg ring-1 ring-foreground/10 backdrop-blur">
        {HOTKEY_LEGEND.map(({ keys, action }) => (
          <span key={keys} className="inline-flex items-center gap-1.5">
            <kbd className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[0.7rem] font-semibold text-foreground">
              {keys}
            </kbd>
            {action}
          </span>
        ))}
      </div>
    </div>
  );
}
