"use client";

// Root segment error boundary (brief §8.4). Renders inside app/layout.tsx —
// error.js wraps page.js/layout.js *below* it in the tree, not the root
// layout itself, so the nav (and its reset control) survives even when a
// page throws here. Root-layout-level crashes are caught by
// app/global-error.tsx instead, which must render its own <html>/<body>.

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
    console.error("[app/error]", error);
  }, [error]);

  return <ScreenError retryAction={reset} />;
}
