"use client";

// Narration pane (brief §4 screen 3, left pane). Walks assistant messages'
// parts in stream order and maps each wire part type to a presentation
// treatment — text streams as narration, reasoning as a muted collapsible,
// tool calls as one-line step chips (docs/wire-contract.md §2). Zero
// business logic: every string here is either verbatim model narration or a
// static copy fragment keyed off part.type/part.state.

import { AlertTriangle, CheckCircle2, Clock, XCircle } from "lucide-react";
import type { ChatStatus } from "ai";
import { MessageResponse } from "@/components/ai-elements/message";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { PaymentHealthUIMessage } from "@/lib/agents/payment-health/agent";
import {
  type AssistantPart,
  type StepTone,
  humanizeComponentName,
  readComponentName,
  toneFromToolState,
} from "./utils";

/** Best-effort extraction of a human-readable message from the Error thrown
 * by useChat on a non-2xx response — the stream route responds with a JSON
 * `{ error: string }` body on failure (app/api/agents/[agentId]/stream/route.ts),
 * which HttpChatTransport surfaces as `error.message` verbatim. */
function resolveErrorMessage(error: Error): string {
  try {
    const parsed = JSON.parse(error.message) as { error?: unknown };
    if (typeof parsed.error === "string" && parsed.error.length > 0) return parsed.error;
  } catch {
    // Not JSON — fall through to the raw message.
  }
  return error.message || "The agent run failed to start.";
}

export function NarrationPane({
  messages,
  status,
  error,
  onNewRun,
}: {
  messages: PaymentHealthUIMessage[];
  status: ChatStatus;
  error: Error | undefined;
  onNewRun: () => void;
}) {
  const assistantMessages = messages.filter((message) => message.role === "assistant");

  return (
    <div className="flex flex-col gap-4">
      {assistantMessages.length === 0 && !error ? (
        <p className="text-sm text-muted-foreground">
          Narration will stream here once the run starts.
        </p>
      ) : null}

      {assistantMessages.map((message) => (
        <div key={message.id} className="flex flex-col gap-3">
          {message.parts.map((part, index) => (
            <NarrationPart key={`${message.id}-${index}`} part={part} />
          ))}
        </div>
      ))}

      {status === "submitted" || status === "streaming" ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Spinner className="size-4" />
          Agent is working…
        </div>
      ) : null}

      {error ? (
        <div className="flex flex-col gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
          <div className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="size-4 shrink-0" />
            Run failed to start
          </div>
          <p className="leading-relaxed">{resolveErrorMessage(error)}</p>
          <Button
            size="sm"
            variant="outline"
            className="w-fit border-destructive/40 text-destructive hover:bg-destructive/10"
            onClick={onNewRun}
          >
            New run
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function NarrationPart({ part }: { part: AssistantPart }) {
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
      const tone = toneFromToolState(part.state);
      const name = humanizeComponentName(
        part.state === "output-available"
          ? part.output.component
          : (readComponentName(part.input) ?? "evidence"),
      );
      const label =
        tone === "done"
          ? `Rendered evidence — ${name}`
          : tone === "error"
            ? `Evidence failed — ${name}`
            : `Rendering evidence — ${name}`;
      return <StepChip label={label} tone={tone} />;
    }
    case "tool-proposeDueDateChange":
      return <StepChip label={actionStepLabel("Due-date change", "Proposing due-date change…", part.state)} tone={toneFromToolState(part.state)} />;
    case "tool-sendOutreachDraft":
      return <StepChip label={actionStepLabel("Outreach draft", "Drafting outreach email…", part.state)} tone={toneFromToolState(part.state)} />;
    default:
      return null;
  }
}

function actionStepLabel(noun: string, pendingLabel: string, state: string): string {
  const tone = toneFromToolState(state);
  switch (tone) {
    case "pending":
      return pendingLabel;
    case "waiting":
      return `${noun} — awaiting approval`;
    case "done":
      return `${noun} — approved`;
    case "declined":
      return `${noun} — declined`;
    case "error":
      return `${noun} — failed`;
  }
}

const STEP_TONE_STYLES: Record<StepTone, string> = {
  pending: "border-border bg-muted/40 text-muted-foreground",
  waiting: "border-warning/30 bg-warning/10 text-warning",
  done: "border-success/30 bg-success/10 text-success",
  declined: "border-border bg-muted/30 text-muted-foreground",
  error: "border-destructive/30 bg-destructive/10 text-destructive",
};

function StepChip({ label, tone }: { label: string; tone: StepTone }) {
  return (
    <div
      className={cn(
        "flex w-fit items-center gap-2 rounded-full border px-3 py-1.5 text-sm",
        STEP_TONE_STYLES[tone],
      )}
    >
      {tone === "pending" ? <Spinner className="size-3.5" /> : null}
      {tone === "waiting" ? <Clock className="size-3.5" /> : null}
      {tone === "done" ? <CheckCircle2 className="size-3.5" /> : null}
      {tone === "declined" ? <XCircle className="size-3.5" /> : null}
      {tone === "error" ? <AlertTriangle className="size-3.5" /> : null}
      {label}
    </div>
  );
}
