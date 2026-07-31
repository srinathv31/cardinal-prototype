// Ops chat (DEMO_THESIS.md use case 1 — "the original demo. All in the chat
// interface."; DEMO_BUILD_PLAN.md D5). No SOE data fetch happens on this page
// itself — every figure the surface shows arrives over the wire contract via
// OpsSurface's chat session (docs/wire-contract.md), same reasoning as
// app/ask/page.tsx and app/servicing/page.tsx — so this stays a plain server
// component with no dynamic-anchor concern.
//
// Presented on a projector to executives: this is the surface the demo's
// business point lives on — one upload, two human approvals, and a book-wide
// remediation that would otherwise be ten minutes per account.

import { PageHeader } from "@/components/shell/page-header";
import { OpsSurface } from "@/components/ops/ops-surface";

export default function OpsPage() {
  return (
    <div>
      <PageHeader
        title="Ops"
        description="Upload a policy, approve the rules, sweep the book, and act on what it finds."
      />
      <OpsSurface />
    </div>
  );
}
