"use client";

// Ops surface entry point (DEMO_BUILD_PLAN.md D5). Mirrors
// components/ask/ask-surface.tsx and components/servicing/servicing-surface.tsx
// exactly: the only thing this owns is the remount-on-new-conversation key
// bump, which for this surface also clears the spectacle graph back to idle
// (its state is derived from the conversation's own messages).

import { useState } from "react";
import { OpsConversation } from "./ops-conversation";

export function OpsSurface() {
  const [instanceKey, setInstanceKey] = useState(0);
  return (
    <OpsConversation
      key={instanceKey}
      onNewConversation={() => setInstanceKey((k) => k + 1)}
    />
  );
}
