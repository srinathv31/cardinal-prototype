"use client";

// Keeps the store-backed sections (agent last-run stats, recent approvals)
// current while the Command Center sits open on a projector between runs —
// router.refresh() re-runs app/page.tsx's server-side fetch in place without
// remounting client components, so the event ticker's reveal progress is
// untouched (brief W3.1 spec: "router.refresh() preserves client state, so
// the ticker won't reset"). Renders nothing; it only owns the interval.

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const REFRESH_INTERVAL_MS = 5000;

export function AutoRefresh() {
  const router = useRouter();

  useEffect(() => {
    const intervalId = setInterval(() => router.refresh(), REFRESH_INTERVAL_MS);
    return () => clearInterval(intervalId);
  }, [router]);

  return null;
}
