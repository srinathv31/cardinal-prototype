"use client";

// Hidden presenter bar (brief §4, §8: "audience never sees controls").
// Toggled by the backtick key so nothing appears on the projected screen
// unless the presenter deliberately summons it. Every control below is
// rendered disabled — the ScenarioPlayer that actually drives play / pause /
// reset / act-jump / speed is a parallel work item (brief §6, W0.2); this
// file is deliberately inert scaffolding for the P0 stage shell and gets
// wired up (not restructured) once the player lands.

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

const ACT_LABELS = ["Act 1", "Act 2", "Act 3"] as const;

export function PresenterBar() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "`") return;
      const target = event.target as HTMLElement | null;
      // Ignore the toggle while the presenter is typing anywhere else on the
      // stage (there's nothing to type into yet in P0, but this is cheap
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

  return (
    <div className="fixed inset-x-0 bottom-20 z-50 flex justify-center px-4">
      <div className="flex flex-wrap items-center gap-2 rounded-full border border-border bg-popover/95 px-4 py-2.5 shadow-lg ring-1 ring-foreground/10 backdrop-blur">
        <Button size="sm" variant="secondary" disabled>
          Play
        </Button>
        <Button size="sm" variant="secondary" disabled>
          Pause
        </Button>
        <Button size="sm" variant="secondary" disabled>
          Reset
        </Button>
        <span className="mx-1 h-4 w-px bg-border" aria-hidden="true" />
        {ACT_LABELS.map((label) => (
          <Button key={label} size="sm" variant="outline" disabled>
            {label}
          </Button>
        ))}
        <span className="mx-1 h-4 w-px bg-border" aria-hidden="true" />
        <Button size="sm" variant="outline" disabled>
          1x / 2x
        </Button>
        <span className="ml-1 text-xs text-muted-foreground">
          Controls wired in P1
        </span>
      </div>
    </div>
  );
}
