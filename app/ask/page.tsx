// Ask (brief §4 screen 4, Beat 5 — "the proof-of-life beat"). No SOE data
// fetch happens on this page itself — every figure the surface shows arrives
// over the wire contract via AskSurface's chat session
// (docs/wire-contract.md) — so, unlike app/runs/page.tsx, this stays a plain
// server component with no dynamic-anchor concern.

import { PageHeader } from "@/components/shell/page-header";
import { AskSurface } from "@/components/ask/ask-surface";

export default function AskPage() {
  return (
    <div>
      <PageHeader
        title="Ask"
        description="Live portfolio questions answered with generative UI over seed data."
      />
      <AskSurface />
    </div>
  );
}
