// Registry renderer — pure presentation only (brief §5b/§5d). This is the
// approval gate: a real pause in the run. Approve/Decline are wired by the
// caller (the run view) to the AI SDK tool-approval response flow — this
// component holds no approval logic itself, just renders the gate and calls
// the provided handlers.
//
// v3 addition (CARDINAL_V3_AU_BRIEF.md §3 Act III beat 7, W3.3): `scope` and
// `reviewList` are optional, additive props (lib/registry/schemas.ts) each
// rendered behind its own presence check below — a v1 card that never sets
// either is pixel-identical to before. `scope` states a bulk action's blast
// radius structurally (not buried in `description`'s prose); `reviewList`
// is a collapsed disclosure so the presenter can see what they're approving
// before approving it. Both are pure presentation of preformatted strings
// — this component still fetches nothing and computes nothing.

import { ChevronDown, CircleCheck, CircleX } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
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
  scope,
  reviewList,
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

      {scope ? (
        <div className="mt-3 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5">
          <p className="text-base font-medium text-foreground">{scope.summary}</p>
          {scope.counts && scope.counts.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-2">
              {scope.counts.map((count, index) => (
                <span
                  key={`${count.label}-${index}`}
                  className="inline-flex items-center gap-1.5 rounded-full bg-background px-2.5 py-1 text-sm text-foreground/90 ring-1 ring-border"
                >
                  <span className="text-muted-foreground">{count.label}</span>
                  <span className="font-semibold tabular-nums">{count.value}</span>
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {reviewList ? (
        <Collapsible className="mt-3">
          <CollapsibleTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              <ChevronDown className="size-3.5" />
              {reviewList.label}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2 flex flex-col divide-y divide-border rounded-lg border border-border">
            {reviewList.rows.map((row, index) => (
              <div
                key={`${row.primary}-${row.secondary}-${index}`}
                className="flex flex-wrap items-center justify-between gap-2 px-3 py-2"
              >
                <div>
                  <p className="text-sm font-medium text-foreground">{row.primary}</p>
                  <p className="text-sm text-muted-foreground">{row.secondary}</p>
                </div>
                {row.detail ? (
                  <span className="text-sm text-muted-foreground">{row.detail}</span>
                ) : null}
              </div>
            ))}
          </CollapsibleContent>
          {reviewList.footnote ? (
            <p className="mt-2 text-sm text-muted-foreground">{reviewList.footnote}</p>
          ) : null}
        </Collapsible>
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
