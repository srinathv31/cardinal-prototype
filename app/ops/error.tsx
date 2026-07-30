"use client";

// Segment error boundary for /ops — see app/error.tsx for the shared
// rationale. Mirrors app/servicing/error.tsx exactly.

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
    console.error("[app/ops/error]", error);
  }, [error]);

  return <ScreenError retryAction={reset} />;
}
