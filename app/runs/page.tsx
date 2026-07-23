import { PageHeader } from "@/components/shell/page-header";

export default function AgentRunPage() {
  return (
    <div>
      <PageHeader
        title="Agent Runs"
        description="Streaming reasoning, progressive evidence, and the approval rail. (P1: run view, W1.4.)"
      />
      <div className="grid h-64 place-items-center rounded-lg border border-dashed text-sm text-muted-foreground">
        Run view shell — built in P1 (W1.4)
      </div>
    </div>
  );
}
