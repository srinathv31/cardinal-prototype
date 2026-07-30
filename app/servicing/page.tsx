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
//
// Persona pinning (DEMO_BUILD_PLAN.md D6, Wave 2 Agent E work item 1):
// `?persona=happy|blocked` (default "happy") is resolved SERVER-SIDE, here,
// to the pinned cardholder (happy = Anand Patel, blocked = Marcus Webb —
// the same two accounts app/api/cards/activate's POST body pins, via
// lib/agents/servicing/identity.ts's shared persona→identity map). Nothing
// downstream — ServicingSurface, ServicingConversation, or the servicing
// agent itself — ever accepts an accountId; they only ever see this
// already-resolved `persona` label, which is why it's safe to hand to a
// client component as a plain string prop instead of a real identifier.

import { PageHeader } from "@/components/shell/page-header";
import { ServicingSurface } from "@/components/servicing/servicing-surface";
import { parseServicingPersona } from "@/lib/agents/servicing/identity";

const PERSONA_LABEL: Record<"happy" | "blocked", string> = {
  happy: "Anand Patel",
  blocked: "Marcus Webb",
};

export default async function ServicingPage({
  searchParams,
}: {
  // Next 16: searchParams is a Promise (app/runs/page.tsx's identical note).
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { persona: personaParam } = await searchParams;
  const persona = parseServicingPersona(personaParam);

  return (
    <div>
      <PageHeader
        title="Servicing"
        description="Ask about your account — transactions, payments, statements, balance, contact info, and card activation."
      />
      <p className="-mt-4 mb-6 text-sm text-muted-foreground">
        Signed in as {PERSONA_LABEL[persona]}
      </p>
      <ServicingSurface persona={persona} />
    </div>
  );
}
