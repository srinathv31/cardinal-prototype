"use client";

// Segment error boundary for /servicing (brief §8.4) — see app/error.tsx for
// the shared rationale. Mirrors app/ask/error.tsx exactly.

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
    console.error("[app/servicing/error]", error);
  }, [error]);

  return <ScreenError retryAction={reset} />;
}
