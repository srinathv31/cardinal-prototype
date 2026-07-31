"use client";

// Renders one ops assistant message's parts in stream order
// (docs/wire-contract.md §2–4). Same shape as
// components/servicing/servicing-assistant-parts.tsx — text, reasoning,
// evidence, approval gates — with two differences the ops surface forces:
//
//  1. Evidence arrives on FIVE differently-named tool parts rather than one
//     `renderEvidence`, because each ops tool is its own endpoint
//     (DEMO_THESIS.md's endpoint checklist: "tool call = endpoint"). The three
//     read tools carry a `render` field on their output; the two gated ones
//     carry a receipt instead.
//  2. Evidence routes through `SentinelEvidenceRenderer`, not v1's
//     `EvidenceRenderer`: `RuleDiff`, `ViolationsDashboard`, and `ReportCard`
//     all live in the Sentinel registry (lib/sentinel/registry.ts), and that
//     renderer delegates every v1 component onward unchanged.
//
// Zero business logic (CLAUDE.md 5b): every string below is either verbatim
// model narration, a value a tool already computed server-side, or static
// copy. Nothing here formats a number, joins a name, or decides a disposition.

import { AlertTriangle, CheckCircle2, CircleX, FileCheck2 } from "lucide-react";
import { MessageResponse } from "@/components/ai-elements/message";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning";
import { Spinner } from "@/components/ui/spinner";
import { ApprovalCard } from "@/components/registry";
import { SentinelEvidenceRenderer } from "@/components/sentinel/evidence";
import { EvidenceErrorBoundary } from "@/components/ask/evidence-error-boundary";
import { readStringField } from "@/components/run-view/utils";
import type { SentinelRenderInstruction } from "@/lib/sentinel/registry";
import type { CardinalUIMessage } from "@/lib/agents/registry";

type AssistantPart = CardinalUIMessage["parts"][number];

/** Copy for the three gates. Static presentation strings — the figures live in
 * the model's `rationale`, which the card renders verbatim. `saveRules` serves
 * both policies, so its description names neither: which rule store the
 * approval writes to is decided server-side by the document that was uploaded
 * (lib/agents/ops/resolvers.ts), and a card that guessed would eventually
 * guess wrong on stage. */
const GATE_COPY = {
  saveRules: {
    title: "Adopt these rules",
    description:
      "Approving stores these rules in the policy rule store, where every sweep evaluates against them.",
  },
  executeBatchRemoval: {
    title: "Approve batch removal",
    description:
      "Approving kicks off removal of the flagged authorized-user relationships and notifies each primary cardholder.",
  },
  queueActivationOutreach: {
    title: "Approve activation outreach",
    description:
      "Approving queues outreach to the primary cardholder on every account with a card-activation exception.",
  },
} as const;

/** The wire part types this surface treats as approval gates — derived from
 * `GATE_COPY`'s own keys rather than a second literal list, so the set
 * `hasOpenGate` below checks can never drift from the set `GatePart`'s
 * switch (further down) actually renders buttons for. */
const GATED_TOOL_TYPES: ReadonlySet<string> = new Set(
  Object.keys(GATE_COPY).map((name) => `tool-${name}`),
);

/** The minimal message shape `hasOpenGate` needs — structural rather than
 * `CardinalUIMessage`, so it stays a tiny pure function a test can call with
 * plain object literals (no AI SDK generics to satisfy). */
export interface GateInputMessage {
  role: string;
  parts: ReadonlyArray<{ type: string; state?: string }>;
}

/** True if any assistant message carries a gate part still awaiting a human
 * decision — the exact `state === "approval-requested"` check `GatePart`'s
 * switch (below) uses to decide the ApprovalCard's two buttons are
 * clickable, so this can never disagree with what's actually on screen.
 * `OpsConversation` disables every OTHER control (chips, attach, input,
 * send) while this is true, so a presenter can't abandon an open gate by
 * clicking a suggestion or sending a message instead of resolving it. */
export function hasOpenGate(messages: readonly GateInputMessage[]): boolean {
  return messages.some(
    (message) =>
      message.role === "assistant" &&
      message.parts.some(
        (part) => GATED_TOOL_TYPES.has(part.type) && part.state === "approval-requested",
      ),
  );
}

/** Structural read of the `render` field the three read tools put on their
 * output. Defensive rather than typed-through: a part mid-stream, or a future
 * tool that returns no render, must degrade to "nothing to draw" and never
 * throw (brief §8 demo-safety). */
function readRender(output: unknown): SentinelRenderInstruction | undefined {
  if (!output || typeof output !== "object" || !("render" in output)) return undefined;
  const render = (output as { render?: unknown }).render;
  if (
    render &&
    typeof render === "object" &&
    "component" in render &&
    typeof (render as { component?: unknown }).component === "string"
  ) {
    return render as SentinelRenderInstruction;
  }
  return undefined;
}

export function OpsAssistantParts({
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
        <OpsPart key={index} part={part} onApprove={onApprove} onDecline={onDecline} />
      ))}
    </div>
  );
}

function Working({ label }: { label: string }) {
  return (
    <div className="flex w-fit items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1.5 text-sm text-muted-foreground">
      <Spinner className="size-3.5" />
      {label}
    </div>
  );
}

function Failed({ label, errorText }: { label: string; errorText?: string }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <span>
        {label}
        {errorText ? ` — ${errorText}` : "."}
      </span>
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-border bg-muted/30 px-4 py-3 text-base text-muted-foreground">
      <FileCheck2 className="mt-0.5 size-4 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

function Executed({ headline, detail }: { headline: string; detail?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2.5 rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-base text-success">
      <CheckCircle2 className="size-4 shrink-0" />
      <span className="font-medium">{headline}</span>
      {detail ? <span className="font-mono text-sm">{detail}</span> : null}
    </div>
  );
}

function Declined({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-border bg-muted/30 px-4 py-3 text-base text-muted-foreground">
      <CircleX className="size-4 shrink-0" />
      {children}
    </div>
  );
}

/** One read tool's part: a spinner while it runs, its `render` when it lands.
 * A read tool with no render (queryViolations' "no rules configured" answer)
 * falls back to the message the tool itself wrote. */
function EvidencePart({
  part,
  workingLabel,
  failedLabel,
}: {
  part: Extract<AssistantPart, { type: `tool-${string}` }>;
  workingLabel: string;
  failedLabel: string;
}) {
  if (part.state === "output-error") {
    return <Failed label={failedLabel} errorText={part.errorText} />;
  }
  if (part.state !== "output-available") {
    return <Working label={workingLabel} />;
  }
  const render = readRender(part.output);
  if (render) {
    return (
      <EvidenceErrorBoundary label={render.component}>
        <SentinelEvidenceRenderer instruction={render} />
      </EvidenceErrorBoundary>
    );
  }
  const message = readStringField(part.output, "message");
  return message ? <Note>{message}</Note> : null;
}

/** One gated tool's part: the ApprovalCard through its whole state machine,
 * then the executed receipt or the "nothing ran" note. */
function GatePart({
  part,
  gate,
  executedHeadline,
  detailKey,
  declinedCopy,
  failedLabel,
  preparingLabel,
  onApprove,
  onDecline,
}: {
  part: Extract<AssistantPart, { type: `tool-${string}` }>;
  gate: keyof typeof GATE_COPY;
  executedHeadline: string;
  detailKey?: string;
  declinedCopy: string;
  failedLabel: string;
  preparingLabel: string;
  onApprove: (approvalId: string) => void;
  onDecline: (approvalId: string) => void;
}) {
  const copy = GATE_COPY[gate];

  switch (part.state) {
    case "input-streaming":
    case "input-available":
      return <Working label={preparingLabel} />;
    case "approval-requested":
      return (
        <ApprovalCard
          approvalId={part.approval.id}
          toolName={gate}
          title={copy.title}
          description={copy.description}
          rationale={readStringField(part.input, "rationale")}
          evidence={[]}
          onApprove={() => onApprove(part.approval.id)}
          onDecline={() => onDecline(part.approval.id)}
        />
      );
    case "approval-responded":
      return (
        <ApprovalCard
          approvalId={part.approval.id}
          toolName={gate}
          title={copy.title}
          description={copy.description}
          rationale={readStringField(part.input, "rationale")}
          evidence={[]}
          onApprove={() => {}}
          onDecline={() => {}}
          disabled
          decision={part.approval.approved ? "approved" : "denied"}
        />
      );
    case "output-available":
      return (
        <Executed
          headline={executedHeadline}
          detail={detailKey ? readStringField(part.output, detailKey) : undefined}
        />
      );
    case "output-denied":
      return <Declined>{declinedCopy}</Declined>;
    case "output-error":
      return <Failed label={failedLabel} errorText={part.errorText} />;
    default:
      return null;
  }
}

function OpsPart({
  part,
  onApprove,
  onDecline,
}: {
  part: AssistantPart;
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
    case "tool-parsePolicyDocument":
      return (
        <EvidencePart
          part={part}
          workingLabel="Reading the document…"
          failedLabel="Couldn't parse that document"
        />
      );
    case "tool-queryViolations":
      return (
        <EvidencePart
          part={part}
          workingLabel="Sweeping the book…"
          failedLabel="Couldn't run the policy sweep"
        />
      );
    case "tool-generateReport":
      return (
        <EvidencePart
          part={part}
          workingLabel="Writing the audit report…"
          failedLabel="Couldn't generate the audit report"
        />
      );
    case "tool-saveRules":
      return (
        <GatePart
          part={part}
          gate="saveRules"
          preparingLabel="Preparing the rules for your approval…"
          executedHeadline="Rules stored"
          declinedCopy="No rules were added."
          failedLabel="Couldn't store those rules"
          onApprove={onApprove}
          onDecline={onDecline}
        />
      );
    case "tool-executeBatchRemoval":
      return (
        <GatePart
          part={part}
          gate="executeBatchRemoval"
          preparingLabel="Preparing the batch for your approval…"
          executedHeadline="Kicked off in batch"
          detailKey="confirmationId"
          declinedCopy="Nothing was removed."
          failedLabel="Couldn't start the batch removal"
          onApprove={onApprove}
          onDecline={onDecline}
        />
      );
    case "tool-queueActivationOutreach":
      return (
        <GatePart
          part={part}
          gate="queueActivationOutreach"
          preparingLabel="Preparing the outreach batch for your approval…"
          executedHeadline="Queued for outreach"
          detailKey="confirmationId"
          declinedCopy="No outreach was queued."
          failedLabel="Couldn't queue the activation outreach"
          onApprove={onApprove}
          onDecline={onDecline}
        />
      );
    default:
      // The CardinalUIMessage union also carries every other agent's tools —
      // unreachable on this surface, but must never throw on an unexpected
      // part type (CLAUDE.md 5d demo-safety).
      return null;
  }
}
