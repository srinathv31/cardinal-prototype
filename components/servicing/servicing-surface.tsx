"use client";

// Servicing surface entry point (brief §7, §4 — /servicing reuses Ask's
// conversation surface). Mirrors components/ask/ask-surface.tsx closely: the
// only things this owns are the remount-on-new-conversation key bump and
// forwarding the server-resolved `persona` (app/servicing/page.tsx, D6)
// straight through to ServicingConversation — this component makes no
// decision about it itself.

import { useState } from "react";
import type { ServicingPersona } from "@/lib/agents/servicing/identity";
import { ServicingConversation } from "./servicing-conversation";

export function ServicingSurface({ persona }: { persona: ServicingPersona }) {
  const [instanceKey, setInstanceKey] = useState(0);
  return (
    <ServicingConversation
      key={instanceKey}
      persona={persona}
      onNewConversation={() => setInstanceKey((k) => k + 1)}
    />
  );
}
