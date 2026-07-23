"use client";

// Agent Run View (brief §4 screen 3 — "the star"). Owns the AI SDK 7 chat
// session for one run and lays out the three-pane wire-contract surface:
// narration (left) | evidence (center) | approval rail (right). Zero
// business logic — this component only wires wire-contract state
// (docs/wire-contract.md) to the three pane renderers and static copy.

import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithApprovalResponses } from "ai";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import type { StreamEvent } from "@/lib/soe";
import type { CardinalUIMessage } from "@/lib/agents/registry";
import { NarrationPane } from "./narration-pane";
import { EvidencePane } from "./evidence-pane";
import { ApprovalRail } from "./approval-rail";
import { formatDateTime, hasPendingApproval } from "./utils";

type RunStatus = "idle" | "streaming" | "awaiting-approval" | "done" | "error";

export function RunView({
  trigger,
  agentId,
  agentName,
  autoStart,
}: {
  trigger: StreamEvent;
  agentId: string;
  agentName: string;
  /** W3.4 Workflow Canvas handoff — fire handleRun() once on mount instead
   * of waiting for the presenter to click the trigger card. */
  autoStart?: boolean;
}) {
  // Remounting on a bumped key regenerates runId and drops all chat state —
  // the "New run" control (full reset-to-opening-state is P4, brief §8.5).
  const [instanceKey, setInstanceKey] = useState(0);
  return (
    <RunViewInstance
      key={instanceKey}
      trigger={trigger}
      agentId={agentId}
      agentName={agentName}
      autoStart={autoStart}
      onNewRun={() => setInstanceKey((k) => k + 1)}
    />
  );
}

function RunViewInstance({
  trigger,
  agentId,
  agentName,
  autoStart,
  onNewRun,
}: {
  trigger: StreamEvent;
  agentId: string;
  agentName: string;
  autoStart?: boolean;
  onNewRun: () => void;
}) {
  const [runId] = useState(() => `run-${crypto.randomUUID()}`);
  const transport = useMemo(
    () => new DefaultChatTransport<CardinalUIMessage>({ api: `/api/agents/${agentId}/stream` }),
    [agentId],
  );

  const { messages, sendMessage, addToolApprovalResponse, status, error } =
    useChat<CardinalUIMessage>({
      id: runId,
      transport,
      sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    });

  const hasStarted = messages.length > 0;
  const pendingApproval = hasPendingApproval(messages);
  const runStatus: RunStatus = !hasStarted
    ? "idle"
    : error || status === "error"
      ? "error"
      : pendingApproval
        ? "awaiting-approval"
        : status === "submitted" || status === "streaming"
          ? "streaming"
          : "done";

  function handleRun() {
    sendMessage({ text: JSON.stringify(trigger, null, 2) });
  }

  // W3.4 Workflow Canvas handoff: fire the trigger once on mount so the run
  // view opens already started. Guarded with a ref (not just `!hasStarted`)
  // because React StrictMode double-invokes effects on mount in dev — without
  // the ref, the second invocation would still see `hasStarted === false`
  // (messages haven't round-tripped yet) and send the trigger message twice.
  const autoStartFiredRef = useRef(false);
  useEffect(() => {
    if (autoStart && !hasStarted && !autoStartFiredRef.current) {
      autoStartFiredRef.current = true;
      handleRun();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoStart]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card/60 px-5 py-4 ring-1 ring-foreground/5">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-base font-semibold text-foreground">{agentName}</span>
          <span className="font-mono text-sm text-muted-foreground" title={runId}>
            {runId.length > 18 ? `${runId.slice(0, 18)}…` : runId}
          </span>
          <StatusChip status={runStatus} />
        </div>
        {hasStarted ? (
          <Button size="sm" variant="outline" onClick={onNewRun}>
            New run
          </Button>
        ) : null}
      </div>

      {!hasStarted ? (
        <TriggerCard trigger={trigger} agentName={agentName} onRun={handleRun} />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[6fr_9fr_5fr]">
          <section className="flex flex-col gap-3 lg:max-h-[75vh] lg:overflow-y-auto lg:pr-1">
            <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
              Narration
            </h2>
            <NarrationPane messages={messages} status={status} error={error} onNewRun={onNewRun} />
          </section>

          <section className="flex flex-col gap-3 lg:max-h-[75vh] lg:overflow-y-auto lg:pr-1">
            <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
              Evidence
            </h2>
            <EvidencePane messages={messages} />
          </section>

          <section className="flex flex-col gap-3 lg:max-h-[75vh] lg:overflow-y-auto lg:pr-1">
            <ApprovalRail
              runId={runId}
              messages={messages}
              status={status}
              addToolApprovalResponse={addToolApprovalResponse}
            />
          </section>
        </div>
      )}
    </div>
  );
}

const STATUS_LABEL: Record<RunStatus, string> = {
  idle: "Idle",
  streaming: "Streaming",
  "awaiting-approval": "Awaiting approval",
  done: "Done",
  error: "Error",
};

const STATUS_STYLES: Record<RunStatus, string> = {
  idle: "bg-muted text-muted-foreground",
  streaming: "bg-primary/15 text-primary",
  "awaiting-approval": "bg-warning/15 text-warning",
  done: "bg-success/15 text-success",
  error: "bg-destructive/15 text-destructive",
};

function StatusChip({ status }: { status: RunStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold",
        STATUS_STYLES[status],
      )}
    >
      {status === "streaming" ? <Spinner className="size-3.5" /> : null}
      {STATUS_LABEL[status]}
    </span>
  );
}

function TriggerCard({
  trigger,
  agentName,
  onRun,
}: {
  trigger: StreamEvent;
  agentName: string;
  onRun: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-6 ring-1 ring-foreground/5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant="outline" className="h-6 font-mono text-sm tracking-wide uppercase">
          {trigger.kind}
        </Badge>
        <span className="text-sm text-muted-foreground">{formatDateTime(trigger.timestamp)}</span>
      </div>
      <p className="mt-3 text-lg text-foreground">{trigger.summary}</p>
      <Button size="lg" className="mt-5" onClick={onRun}>
        {`Run ${agentName}`}
      </Button>
    </div>
  );
}
