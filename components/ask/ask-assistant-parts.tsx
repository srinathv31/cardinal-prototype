"use client";

// Renders one assistant message's parts in stream order (docs/wire-contract.md
// §2–3): text as narration, tool-renderEvidence as evidence the moment it
// reaches output-available, everything else as a muted pending chip or an
// inline error chip. Zero business logic — same treatment as
// components/run-view/narration-pane.tsx + evidence-pane.tsx, merged into one
// interleaved column instead of split panes (Ask is a single conversation,
// not a three-pane run view).

import { AlertTriangle } from "lucide-react";
import { MessageResponse } from "@/components/ai-elements/message";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning";
import { Spinner } from "@/components/ui/spinner";
import { EvidenceRenderer } from "@/components/registry";
import type { CardinalUIMessage } from "@/lib/agents/registry";
import { EvidenceErrorBoundary } from "./evidence-error-boundary";

type AssistantPart = CardinalUIMessage["parts"][number];

export function AskAssistantParts({ parts }: { parts: AssistantPart[] }) {
  return (
    <div className="flex flex-col gap-3">
      {parts.map((part, index) => (
        <AskPart key={index} part={part} />
      ))}
    </div>
  );
}

function AskPart({ part }: { part: AssistantPart }) {
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
            <span>Couldn&apos;t load evidence{part.errorText ? ` — ${part.errorText}` : "."}</span>
          </div>
        );
      }
      // input-streaming | input-available — renderEvidence is read-only and
      // never approval-gated for Ask (no toolApproval config, agent.ts).
      return (
        <div className="flex w-fit items-center gap-2 rounded-full border border-border bg-muted/40 px-3 py-1.5 text-sm text-muted-foreground">
          <Spinner className="size-3.5" />
          Rendering evidence…
        </div>
      );
    }
    default:
      // Ask has exactly one tool (renderEvidence) — any other tool-* part
      // type is unreachable in practice (the CardinalUIMessage union also
      // carries the other agents' action tools), but this must never throw
      // on an unexpected part type (brief §8).
      return null;
  }
}
