"use client";

// Servicing surface entry point (brief §7, §4 — /servicing reuses Ask's
// conversation surface). Mirrors components/ask/ask-surface.tsx exactly: the
// only thing this owns is the remount-on-new-conversation key bump.

import { useState } from "react";
import { ServicingConversation } from "./servicing-conversation";

export function ServicingSurface() {
  const [instanceKey, setInstanceKey] = useState(0);
  return (
    <ServicingConversation
      key={instanceKey}
      onNewConversation={() => setInstanceKey((k) => k + 1)}
    />
  );
}
