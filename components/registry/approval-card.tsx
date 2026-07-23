// Registry renderer — pure presentation only (brief §5b/§5d). This is the
// approval gate: a real pause in the run. Approve/Decline are wired by the
// caller (the run view) to the AI SDK tool-approval response flow — this
// component holds no approval logic itself, just renders the gate and calls
// the provided handlers.

import { CircleCheck, CircleX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ApprovalCardProps } from "@/lib/registry/schemas";

type Props = ApprovalCardProps & {
  onApprove: () => void;
  onDecline: () => void;
  disabled?: boolean;
  decision?: "approved" | "denied";
};

export function ApprovalCard({
  toolName,
  title,
  description,
  rationale,
  evidence,
  onApprove,
  onDecline,
  disabled = false,
  decision,
}: Props) {
  return (
    <div className="rounded-xl border-2 border-primary/40 bg-card p-5 ring-1 ring-foreground/5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Approval requested
        </span>
        <span className="font-mono text-sm text-muted-foreground">
          {toolName}
        </span>
      </div>
      <h3 className="mt-2 text-xl font-semibold text-foreground">{title}</h3>
      <p className="mt-1 text-base text-muted-foreground">{description}</p>

      {rationale ? (
        <p className="mt-3 rounded-lg bg-muted/50 px-3 py-2.5 text-sm leading-relaxed text-foreground/90">
          {rationale}
        </p>
      ) : null}

      {evidence.length > 0 ? (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-sm text-muted-foreground">Evidence</span>
          {evidence.map((label, index) => (
            <Badge key={`${label}-${index}`} variant="outline" className="h-6 text-sm">
              {label}
            </Badge>
          ))}
        </div>
      ) : null}

      <div className="mt-4 flex items-center gap-3">
        {decision ? (
          decision === "approved" ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-success/15 px-3 py-1.5 text-sm font-semibold text-success">
              <CircleCheck className="size-4" />
              Approved
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/15 px-3 py-1.5 text-sm font-semibold text-destructive">
              <CircleX className="size-4" />
              Declined
            </span>
          )
        ) : (
          <>
            <Button size="lg" onClick={onApprove} disabled={disabled}>
              Approve
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="border-destructive/40 text-destructive hover:bg-destructive/10"
              onClick={onDecline}
              disabled={disabled}
            >
              Decline
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
