"use client";

// Demo reset control (brief §8.5): back to opening state in <2s, for
// back-to-back rehearsals and the Aug 19 rerun. Two ways in: the quiet icon
// button here, and a global double-press-"r"-within-500ms shortcut (armed by
// the same component so it's only live once, on whichever screen mounts the
// nav). Both funnel through `resetDemo()`, exported so screen-error.tsx's
// "Reset demo" button can share the exact same logic instead of duplicating
// it.
//
// resetDemo() clears the one server-side store (POST /api/reset →
// lib/events/store.ts's reset()) then does a full document navigation to
// `/`. The full navigation — not client-side routing — is load-bearing: it's
// what drops client run state (useChat sessions, open tabs), which lives
// only in React state with no server counterpart.

import { useEffect, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

/**
 * Resets server state and navigates back to `/` as a full page load. Best
 * effort on the network call: if the POST fails, client state alone still
 * resets on navigate, which beats not resetting at all mid-demo.
 */
export async function resetDemo(): Promise<void> {
  try {
    const res = await fetch("/api/reset", { method: "POST" });
    if (!res.ok) {
      console.error(`resetDemo: POST /api/reset returned ${res.status}`);
    }
  } catch (error) {
    console.error("resetDemo: POST /api/reset failed", error);
  } finally {
    window.location.assign("/");
  }
}

const DOUBLE_TAP_WINDOW_MS = 500;

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

export function ResetControl() {
  const [resetting, setResetting] = useState(false);
  const lastRPressRef = useRef(0);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "r") return;
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
      if (isEditableTarget(event.target)) return;

      const now = Date.now();
      const sinceLast = now - lastRPressRef.current;
      lastRPressRef.current = now;
      if (sinceLast > DOUBLE_TAP_WINDOW_MS) return;

      lastRPressRef.current = 0;
      setResetting(true);
      void resetDemo();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  function handleClick() {
    setResetting(true);
    void resetDemo();
  }

  return (
    <button
      type="button"
      aria-label="Reset demo"
      title="Reset demo · press r r"
      disabled={resetting}
      onClick={handleClick}
      className={cn(
        "flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors",
        "hover:bg-sidebar-accent hover:text-sidebar-foreground",
        "disabled:pointer-events-none disabled:opacity-50",
      )}
    >
      {resetting ? (
        <Spinner className="size-3.5" />
      ) : (
        <RotateCcw className="size-3.5" />
      )}
    </button>
  );
}
