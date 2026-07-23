// Recent-approvals strip (brief §4 screen 1, Beat 0 footer / §5e audit
// trail). Renders the latest human approval decisions across all runs.
// Every field arrives preformatted from app/page.tsx — this file only lays
// out cards and maps a decision to a badge tone.

import { cn } from "@/lib/utils";

export interface ApprovalEntryView {
  id: string;
  agentName: string;
  toolName: string;
  decision: "granted" | "denied";
  timeLabel: string;
}

export function RecentApprovals({ approvals }: { approvals: ApprovalEntryView[] }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
        Recent Approvals
      </h2>
      {approvals.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No approvals yet this session — approvals appear here as runs execute.
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {approvals.map((approval) => (
            <li
              key={approval.id}
              className="flex flex-col gap-2 rounded-xl border border-border bg-card px-4 py-3.5 ring-1 ring-foreground/5"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-foreground">
                  {approval.agentName}
                </span>
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-semibold",
                    approval.decision === "granted"
                      ? "bg-success/15 text-success"
                      : "bg-destructive/15 text-destructive",
                  )}
                >
                  {approval.decision === "granted" ? "Approved" : "Denied"}
                </span>
              </div>
              <span className="font-mono text-xs text-muted-foreground">{approval.toolName}</span>
              <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                <span>{approval.timeLabel}</span>
                <span className="rounded-full bg-muted px-2 py-0.5">actor: human</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
