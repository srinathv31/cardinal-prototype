// Servicing (brief §7, §3 "Part B first" — shown before /sentinel). No SOE
// data fetch happens on this page itself — every figure the surface shows
// arrives over the wire contract via ServicingSurface's chat session
// (docs/wire-contract.md), same reasoning as app/ask/page.tsx — so this
// stays a plain server component with no dynamic-anchor concern.
//
// Presented on a projector to bank technology leadership as the FIRST
// surface in the demo (brief §1: "this is what everyone means by AI"). It
// is deliberately unremarkable — an ordinary consumer servicing assistant —
// because that ordinariness is the whole point of showing it before
// /sentinel.

import { PageHeader } from "@/components/shell/page-header";
import { ServicingSurface } from "@/components/servicing/servicing-surface";

export default function ServicingPage() {
  return (
    <div>
      <PageHeader
        title="Servicing"
        description="Ask about your account — transactions, payments, balance, and contact info."
      />
      <ServicingSurface />
    </div>
  );
}
