"use client";

// Evidence pane (brief §4 screen 3, center pane — "the wow"). Paints every
// `tool-renderEvidence` part in stream order across all assistant messages,
// the moment each reaches `output-available` (docs/wire-contract.md §3).
// Zero business logic: this only maps wire state to a renderer, a skeleton,
// or an error chip. `EvidenceBoundary` guards against a malformed
// RenderInstruction throwing during render — a render must never white-screen
// the app mid-demo (brief §8).

import { Component, type ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { EvidenceRenderer } from "@/components/registry";
import { Skeleton } from "@/components/ui/skeleton";
import type { PaymentHealthUIMessage } from "@/lib/agents/payment-health/agent";
import { humanizeComponentName, readComponentName } from "./utils";

type EvidencePart = Extract<PaymentHealthUIMessage["parts"][number], { type: "tool-renderEvidence" }>;

function collectEvidenceParts(messages: PaymentHealthUIMessage[]): EvidencePart[] {
  const parts: EvidencePart[] = [];
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const part of message.parts) {
      if (part.type === "tool-renderEvidence") parts.push(part);
    }
  }
  return parts;
}

export function EvidencePane({ messages }: { messages: PaymentHealthUIMessage[] }) {
  const parts = collectEvidenceParts(messages);

  if (parts.length === 0) {
    return (
      <div className="grid min-h-40 place-items-center rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
        Evidence will render here as the agent investigates.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {parts.map((part) => (
        <EvidenceCard key={part.toolCallId} part={part} />
      ))}
    </div>
  );
}

function EvidenceCard({ part }: { part: EvidencePart }) {
  if (part.state === "output-available") {
    return (
      <EvidenceBoundary label={part.output.component}>
        <EvidenceRenderer instruction={part.output} />
      </EvidenceBoundary>
    );
  }

  if (part.state === "output-error") {
    const label = humanizeComponentName(readComponentName(part.input) ?? "evidence");
    return (
      <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <span>
          Couldn&apos;t load {label}
          {part.errorText ? ` — ${part.errorText}` : "."}
        </span>
      </div>
    );
  }

  // input-streaming | input-available | approval-requested | approval-responded
  // (renderEvidence is read-only and never approval-gated per
  // lib/agents/payment-health/agent.ts, but the wire type is shared across
  // all tool parts, so these last two are handled defensively — never
  // reached in practice.)
  const label = humanizeComponentName(readComponentName(part.input) ?? "evidence");
  return (
    <div className="space-y-3 rounded-xl border border-border bg-card/50 p-5 ring-1 ring-foreground/5">
      <span className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
        Loading {label}…
      </span>
      <Skeleton className="h-6 w-2/3" />
      <Skeleton className="h-24 w-full" />
    </div>
  );
}

class EvidenceBoundary extends Component<{ label: string; children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(caught: unknown) {
    console.error(`EvidencePane: renderer threw for "${this.props.label}"`, caught);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <span>Couldn&apos;t render {humanizeComponentName(this.props.label)} — malformed evidence.</span>
        </div>
      );
    }
    return this.props.children;
  }
}
