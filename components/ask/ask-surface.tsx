"use client";

// Ask surface entry point (brief §4 screen 4, Beat 5). Owns only the
// remount-on-new-conversation key bump — the key-bump pattern from
// components/run-view/run-view.tsx's RunView/RunViewInstance split — since
// Ask has no run trigger and no approval plumbing to otherwise manage here.

import { useState } from "react";
import { AskConversation } from "./ask-conversation";

export function AskSurface() {
  const [instanceKey, setInstanceKey] = useState(0);
  return (
    <AskConversation
      key={instanceKey}
      onNewConversation={() => setInstanceKey((k) => k + 1)}
    />
  );
}
