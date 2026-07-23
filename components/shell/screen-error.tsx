"use client";

// Shared fallback UI for every route segment's error.tsx (brief §8.4: "an
// error can never white-screen the app mid-demo"). Rendered by app/error.tsx
// and every app/<screen>/error.tsx — never used directly as a boundary
// itself, since Next requires each error.tsx to be its own default export
// (docs: node_modules/next/dist/docs/.../file-conventions/error.md).
//
// Two ways out, both non-destructive to the rest of the app:
//  - "Try again" calls the boundary's own `reset()` — re-renders this
//    segment's children without touching server state.
//  - "Reset demo" runs the same resetDemo() the nav's ResetControl uses
//    (POST /api/reset, then full navigate to `/`) — shared, not duplicated,
//    per the work item's instruction.

import { useState } from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { resetDemo } from "./reset-control";

// Prop is named retryAction (not `reset`) to satisfy Next's serializable-
// props lint for exported client components; it receives each boundary's
// reset() and stays a plain client-side callback.
export function ScreenError({ retryAction }: { retryAction: () => void }) {
  const [resetting, setResetting] = useState(false);

  function handleResetDemo() {
    setResetting(true);
    void resetDemo();
  }

  return (
    <div className="grid min-h-[60vh] place-items-center p-8">
      <div className="w-full max-w-md space-y-4 rounded-xl border border-border bg-card p-6 text-center ring-1 ring-foreground/5">
        <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <AlertTriangle className="size-5" />
        </div>
        <div className="space-y-1">
          <h2 className="text-base font-semibold text-card-foreground">
            This screen hit an error — the demo is still running.
          </h2>
          <p className="text-sm text-muted-foreground">
            Nothing else was affected. Try this screen again, or reset the
            demo back to its opening state.
          </p>
        </div>
        <div className="flex items-center justify-center gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={retryAction}>
            Try again
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleResetDemo}
            disabled={resetting}
          >
            {resetting ? (
              <Spinner className="size-3.5" />
            ) : (
              <RotateCcw className="size-3.5" />
            )}
            Reset demo
          </Button>
        </div>
      </div>
    </div>
  );
}
