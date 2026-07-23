"use client";

// Segment error boundary for /runs (brief §8.4) — see app/error.tsx for the
// shared rationale.

import { useEffect } from "react";
import { ScreenError } from "@/components/shell/screen-error";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app/runs/error]", error);
  }, [error]);

  return <ScreenError retryAction={reset} />;
}
