"use client";

// Renders one assistant message's parts in stream order (docs/wire-contract.md
// §2–4). Mirrors components/ask/ask-assistant-parts.tsx's treatment of
// "text"/"reasoning"/"tool-renderEvidence" verbatim, and adds the one thing
// Ask never needed: the approval-gated "tool-updateContactInfo" state
// machine (brief §7c). This is inline in the conversation column rather than
// a separate approval rail (components/run-view/approval-rail.tsx) — the
// servicing surface is a single chat, not a three-pane run view (brief §4:
// "/servicing reuses Ask's conversation components"), so the confirmation
// card renders right where the proposal was made, the way a real consumer
// chat would show it.
//
// Zero business logic: every string here is either verbatim model narration,
// a value already computed server-side in a tool result, or static copy.

import { AlertTriangle, CheckCircle2, CircleX } from "lucide-react";
import { MessageResponse } from "@/components/ai-elements/message";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning";
import { Spinner } from "@/components/ui/spinner";
import { ApprovalCard, EvidenceRenderer } from "@/components/registry";
import { readStringField } from "@/components/run-view/utils";
import { EvidenceErrorBoundary } from "@/components/ask/evidence-error-boundary";
import type { CardinalUIMessage } from "@/lib/agents/registry";

type AssistantPart = CardinalUIMessage["parts"][number];

const CONTACT_CHANGE_COPY = {
  title: "Confirm this change",
  description: "We'll update the contact information on file for your account.",
};

// DEMO_THESIS.md Use case 3, customer side (gate G3) — "the agent presents an
// **Activate / Cancel** prompt". The title/description carry the framing; the
// two button labels are the thesis's own words, passed through ApprovalCard's
// optional `approveLabel`/`declineLabel` props (added on branch demo-aug4 —
// components/registry/approval-card.tsx's header for why they are component
// props and not schema fields). This is a customer confirming their own card,
// not an ops user approving an action, so "Approve/Decline" would be the wrong
// register: the shared gate machinery is unchanged, only the words are.
const ACTIVATE_CARD_COPY = {
  title: "Activate this card?",
  description: "We'll run your card through the account's activation policy checks right now.",
  approveLabel: "Activate",
  declineLabel: "Cancel",
};

/** Labels of any renderEvidence parts already rendered earlier in THIS
 * message — the same "evidence shown so far" idea
 * components/run-view/utils.ts's evidenceLabelsSoFar carries, scoped to one
 * message since that's all this component sees. Empty is fine: ApprovalCard
 * renders nothing extra when `evidence` is empty. */
function evidenceLabelsBefore(parts: AssistantPart[], index: number): string[] {
  const labels: string[] = [];
  for (let i = 0; i < index; i++) {
    const part = parts[i];
    if (part.type === "tool-renderEvidence" && part.state === "output-available") {
      labels.push(part.output.component);
    }
  }
  return labels;
}

export function ServicingAssistantParts({
  parts,
  onApprove,
  onDecline,
}: {
  parts: AssistantPart[];
  onApprove: (approvalId: string) => void;
  onDecline: (approvalId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-3">
      {parts.map((part, index) => (
        <ServicingPart
          key={index}
          part={part}
          evidence={evidenceLabelsBefore(parts, index)}
          onApprove={onApprove}
          onDecline={onDecline}
        />
      ))}
    </div>
  );
}

function ServicingPart({
  part,
  evidence,
  onApprove,
  onDecline,
}: {
  part: AssistantPart;
  evidence: string[];
  onApprove: (approvalId: string) => void;
  onDecline: (approvalId: string) => void;
}) {
  switch (part.type) {
    case "text":
      return (
        <div className="text-base leading-relaxed text-foreground">
          <MessageResponse>{part.text}</MessageResponse>
        </div>
      );
    case "reasoning":
      return (
        <Reasoning isStreaming={part.state === "streaming"} defaultOpen={false}>
          <ReasoningTrigger />
          <ReasoningContent>{part.text}</ReasoningContent>
        </Reasoning>
      );
    case "tool-renderEvidence": {
      if (part.state === "output-available") {
        return (
          <EvidenceErrorBoundary label={part.output.component}>
            <EvidenceRenderer instruction={part.output} />
          </EvidenceErrorBoundary>
        );
      }
      if (part.state === "output-error") {
        return (
          <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <span>Couldn&apos;t load that{part.errorText ? ` — ${part.errorText}` : "."}</span>
          </div>
        );
      }
      // input-streaming | input-available — renderEvidence is read-only and
      // never approval-gated (no toolApproval entry for it, agent.ts).
      return (
        <div className="flex w-fit items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1.5 text-sm text-muted-foreground">
          <Spinner className="size-3.5" />
          One moment…
        </div>
      );
    }
    case "tool-updateContactInfo":
      return (
        <ContactChangePart part={part} evidence={evidence} onApprove={onApprove} onDecline={onDecline} />
      );
    case "tool-activateCard":
      return (
        <ActivateCardPart part={part} evidence={evidence} onApprove={onApprove} onDecline={onDecline} />
      );
    default:
      // The CardinalUIMessage union also carries every other agent's action
      // tools (payment-health/bt-lifecycle/au-growth) — unreachable on this
      // surface in practice, but must never throw on an unexpected part type
      // (brief §8/CLAUDE.md 5d demo-safety).
      return null;
  }
}

type ContactChangeToolPart = Extract<AssistantPart, { type: "tool-updateContactInfo" }>;

function ContactChangePart({
  part,
  evidence,
  onApprove,
  onDecline,
}: {
  part: ContactChangeToolPart;
  evidence: string[];
  onApprove: (approvalId: string) => void;
  onDecline: (approvalId: string) => void;
}) {
  switch (part.state) {
    case "input-streaming":
    case "input-available":
      return (
        <div className="flex w-fit items-center gap-2 rounded-full border border-dashed border-border bg-card/40 px-3 py-1.5 text-sm text-muted-foreground">
          <Spinner className="size-3.5" />
          Preparing your confirmation…
        </div>
      );
    case "approval-requested":
      return (
        <ApprovalCard
          approvalId={part.approval.id}
          toolName="updateContactInfo"
          title={CONTACT_CHANGE_COPY.title}
          description={CONTACT_CHANGE_COPY.description}
          rationale={readStringField(part.input, "rationale")}
          evidence={evidence}
          onApprove={() => onApprove(part.approval.id)}
          onDecline={() => onDecline(part.approval.id)}
        />
      );
    case "approval-responded":
      return (
        <ApprovalCard
          approvalId={part.approval.id}
          toolName="updateContactInfo"
          title={CONTACT_CHANGE_COPY.title}
          description={CONTACT_CHANGE_COPY.description}
          rationale={readStringField(part.input, "rationale")}
          evidence={evidence}
          onApprove={() => {}}
          onDecline={() => {}}
          disabled
          decision={part.approval.approved ? "approved" : "denied"}
        />
      );
    case "output-available":
      return (
        <div className="flex items-center gap-2.5 rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
          <CheckCircle2 className="size-4 shrink-0" />
          <span className="font-medium">Contact information updated</span>
          <span className="font-mono text-sm text-success">
            {readStringField(part.output, "confirmationId") ?? ""}
          </span>
        </div>
      );
    case "output-denied":
      return (
        <div className="flex items-center gap-2.5 rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          <CircleX className="size-4 shrink-0" />
          No changes were made.
        </div>
      );
    case "output-error":
      return (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>Couldn&apos;t update your contact information{part.errorText ? ` — ${part.errorText}` : "."}</span>
        </div>
      );
    default:
      return null;
  }
}

type ActivateCardToolPart = Extract<AssistantPart, { type: "tool-activateCard" }>;

/** Renders lib/agents/servicing/tools.ts's activateCard gate + result
 * (DEMO_THESIS.md Use case 3, customer side). The output-available state
 * branches on the tool's own `status` field — 'activated' vs 'blocked' —
 * both real outcomes of the SAME server-side policy check
 * (lib/sentinel/activate-card.ts), never a client-side guess; a card that
 * arrived can still fail policy, and this renders that honestly rather than
 * treating every completed activation as a success. */
function ActivateCardPart({
  part,
  evidence,
  onApprove,
  onDecline,
}: {
  part: ActivateCardToolPart;
  evidence: string[];
  onApprove: (approvalId: string) => void;
  onDecline: (approvalId: string) => void;
}) {
  switch (part.state) {
    case "input-streaming":
    case "input-available":
      return (
        <div className="flex w-fit items-center gap-2 rounded-full border border-dashed border-border bg-card/40 px-3 py-1.5 text-sm text-muted-foreground">
          <Spinner className="size-3.5" />
          Preparing your confirmation…
        </div>
      );
    case "approval-requested":
      return (
        <ApprovalCard
          approvalId={part.approval.id}
          toolName="activateCard"
          title={ACTIVATE_CARD_COPY.title}
          description={ACTIVATE_CARD_COPY.description}
          rationale={readStringField(part.input, "rationale")}
          evidence={evidence}
          approveLabel={ACTIVATE_CARD_COPY.approveLabel}
          declineLabel={ACTIVATE_CARD_COPY.declineLabel}
          onApprove={() => onApprove(part.approval.id)}
          onDecline={() => onDecline(part.approval.id)}
        />
      );
    case "approval-responded":
      return (
        <ApprovalCard
          approvalId={part.approval.id}
          toolName="activateCard"
          title={ACTIVATE_CARD_COPY.title}
          description={ACTIVATE_CARD_COPY.description}
          rationale={readStringField(part.input, "rationale")}
          evidence={evidence}
          onApprove={() => {}}
          onDecline={() => {}}
          disabled
          decision={part.approval.approved ? "approved" : "denied"}
        />
      );
    case "output-available": {
      const status = readStringField(part.output, "status");
      if (status === "blocked") {
        const ruleId = readStringField(part.output, "ruleId");
        const finding = readStringField(part.output, "finding");
        return (
          <div className="flex items-start gap-2.5 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <div>
              <p className="font-medium">
                Your card arrived, but this account is currently failing a policy
                {ruleId ? ` (${ruleId})` : ""}.
              </p>
              {finding ? <p className="mt-1 text-warning/90">{finding}</p> : null}
            </div>
          </div>
        );
      }
      return (
        <div className="flex items-center gap-2.5 rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
          <CheckCircle2 className="size-4 shrink-0" />
          <span className="font-medium">Card activated</span>
          <span className="font-mono text-sm text-success">
            {readStringField(part.output, "confirmationId") ?? ""}
          </span>
        </div>
      );
    }
    case "output-denied":
      return (
        <div className="flex items-center gap-2.5 rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
          <CircleX className="size-4 shrink-0" />
          Card was not activated.
        </div>
      );
    case "output-error":
      return (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>Couldn&apos;t activate your card{part.errorText ? ` — ${part.errorText}` : "."}</span>
        </div>
      );
    default:
      return null;
  }
}
