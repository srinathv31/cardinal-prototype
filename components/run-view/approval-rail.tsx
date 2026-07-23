"use client";

// Approval rail (brief §4 screen 3, right pane; §5d approval gates). Renders
// one card per action-tool part, mapped mechanically off `part.state`
// (docs/wire-contract.md §4), plus an audit-trail feed polling the same
// run's Event Log entries (§5). No business logic: copy is a static map
// keyed by tool name (utils.ts's ACTION_COPY), decisions/labels are read
// straight off wire state. One generic proposal component handles every
// agent's action tools — new tools need only a copy-map entry.

import { useEffect, useState } from "react";
import type { ChatAddToolApproveResponseFunction, ChatStatus } from "ai";
import { Bot, CheckCircle2, User } from "lucide-react";
import { ApprovalCard, OutreachDraftCard } from "@/components/registry";
import { cn } from "@/lib/utils";
import type { CardinalUIMessage } from "@/lib/agents/registry";
import type { EventLogEntry } from "@/lib/events/types";
import {
  type ActionToolPart,
  evidenceLabelsSoFar,
  formatClockTime,
  getActionCopy,
  hasPendingApproval,
  isActionToolPart,
  readStringField,
  toolNameFromPartType,
} from "./utils";

function collectActionParts(messages: CardinalUIMessage[]): ActionToolPart[] {
  const parts: ActionToolPart[] = [];
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const part of message.parts) {
      if (isActionToolPart(part)) parts.push(part);
    }
  }
  return parts;
}

export function ApprovalRail({
  runId,
  messages,
  status,
  addToolApprovalResponse,
}: {
  runId: string;
  messages: CardinalUIMessage[];
  status: ChatStatus;
  addToolApprovalResponse: ChatAddToolApproveResponseFunction;
}) {
  const actionParts = collectActionParts(messages);
  const evidenceLabels = evidenceLabelsSoFar(messages);

  function handleDecision(approvalId: string, approved: boolean) {
    addToolApprovalResponse({ id: approvalId, approved });
  }

  return (
    <div className="flex flex-col gap-6">
      <section className="flex flex-col gap-4">
        <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Approvals
        </h2>
        {actionParts.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Proposed actions appear here once the agent finishes investigating.
          </p>
        ) : (
          actionParts.map((part) => (
            <ActionToolProposal
              key={part.toolCallId}
              part={part}
              evidenceLabels={evidenceLabels}
              onDecision={handleDecision}
            />
          ))
        )}
      </section>

      <AuditTrail runId={runId} status={status} pendingApproval={hasPendingApproval(messages)} />
    </div>
  );
}

/** Generic action-tool proposal, driven entirely by wire state (part.type ->
 * tool name -> static copy) and the §2 state machine. Covers every agent's
 * action tools with zero per-tool components (wire-contract §2, §4). */
function ActionToolProposal({
  part,
  evidenceLabels,
  onDecision,
}: {
  part: ActionToolPart;
  evidenceLabels: string[];
  onDecision: (approvalId: string, approved: boolean) => void;
}) {
  const toolName = toolNameFromPartType(part.type);
  const copy = getActionCopy(toolName);

  switch (part.state) {
    case "input-streaming":
    case "input-available":
      return <PendingActionRow label={copy.pending} />;
    case "approval-requested": {
      const subject = readStringField(part.input, "subject");
      const body = readStringField(part.input, "body");
      const rationale = readStringField(part.input, "rationale");
      return (
        <div className="flex flex-col gap-3">
          {subject && body ? (
            <OutreachDraftCard channel="EMAIL" to="—" subject={subject} body={body} />
          ) : null}
          <ApprovalCard
            approvalId={part.approval.id}
            toolName={toolName}
            title={copy.title}
            description={copy.description}
            rationale={rationale}
            evidence={evidenceLabels}
            onApprove={() => onDecision(part.approval.id, true)}
            onDecline={() => onDecision(part.approval.id, false)}
          />
        </div>
      );
    }
    case "approval-responded": {
      const subject = readStringField(part.input, "subject");
      const body = readStringField(part.input, "body");
      const rationale = readStringField(part.input, "rationale");
      return (
        <div className="flex flex-col gap-3">
          {subject && body ? (
            <OutreachDraftCard channel="EMAIL" to="—" subject={subject} body={body} />
          ) : null}
          <ApprovalCard
            approvalId={part.approval.id}
            toolName={toolName}
            title={copy.title}
            description={copy.description}
            rationale={rationale}
            evidence={evidenceLabels}
            onApprove={() => {}}
            onDecline={() => {}}
            disabled
            decision={part.approval.approved ? "approved" : "denied"}
          />
        </div>
      );
    }
    case "output-available":
      return (
        <ConfirmationRow
          title={copy.title}
          confirmationId={readStringField(part.output, "confirmationId") ?? ""}
        />
      );
    case "output-denied":
      return <DeclinedRow title={copy.title} />;
    case "output-error":
      return <FailedRow title={copy.title} errorText={part.errorText} />;
    default:
      return null;
  }
}

function PendingActionRow({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card/40 px-4 py-3.5 text-sm text-muted-foreground">
      {label}
    </div>
  );
}

function ConfirmationRow({ title, confirmationId }: { title: string; confirmationId: string }) {
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
      <CheckCircle2 className="size-4 shrink-0" />
      <span className="font-medium">{title}</span>
      <span className="font-mono text-xs text-success/80">{confirmationId}</span>
    </div>
  );
}

function DeclinedRow({ title }: { title: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground">
      Declined — no action taken ({title.toLowerCase()}).
    </div>
  );
}

function FailedRow({ title, errorText }: { title: string; errorText?: string }) {
  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
      {title} failed{errorText ? `: ${errorText}` : "."}
    </div>
  );
}

const KIND_STYLES: Record<EventLogEntry["kind"], string> = {
  "run.started": "bg-muted text-muted-foreground",
  "step.completed": "bg-muted text-muted-foreground",
  "tool.executed": "bg-primary/15 text-primary",
  "approval.requested": "bg-warning/15 text-warning",
  "approval.granted": "bg-accent text-accent-foreground",
  "approval.denied": "bg-accent text-accent-foreground",
  "action.executed": "bg-success/15 text-success",
  "run.finished": "bg-muted text-muted-foreground",
  "run.failed": "bg-destructive/15 text-destructive",
};

function KindChip({ entry }: { entry: EventLogEntry }) {
  const ActorIcon = entry.actor === "human" ? User : Bot;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        KIND_STYLES[entry.kind],
      )}
    >
      <ActorIcon className="size-3" />
      {entry.kind}
    </span>
  );
}

function AuditTrail({
  runId,
  status,
  pendingApproval,
}: {
  runId: string;
  status: ChatStatus;
  pendingApproval: boolean;
}) {
  const [entries, setEntries] = useState<EventLogEntry[]>([]);

  useEffect(() => {
    let cancelled = false;
    const shouldPoll = status === "submitted" || status === "streaming" || pendingApproval;

    async function fetchEvents() {
      try {
        const response = await fetch(`/api/events?runId=${encodeURIComponent(runId)}`);
        if (!response.ok) return;
        const data = (await response.json()) as { entries: EventLogEntry[] };
        if (!cancelled) setEntries(data.entries);
      } catch {
        // Demo-safety (brief §8): a failed poll keeps the last known entries
        // rather than surfacing a network error in the audit rail.
      }
    }

    fetchEvents();
    const intervalId = shouldPoll ? setInterval(fetchEvents, 2000) : undefined;

    return () => {
      cancelled = true;
      if (intervalId) clearInterval(intervalId);
    };
  }, [runId, status, pendingApproval]);

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
        Audit trail
      </h2>
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No event-log entries yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="animate-in fade-in slide-in-from-right-2 flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card/60 px-3 py-2 text-xs"
            >
              <KindChip entry={entry} />
              {entry.toolName ? (
                <span className="font-mono text-muted-foreground">{entry.toolName}</span>
              ) : null}
              <span className="flex-1 text-foreground/80">{entry.outputSummary ?? ""}</span>
              <span className="font-mono text-muted-foreground">{formatClockTime(entry.timestamp)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
