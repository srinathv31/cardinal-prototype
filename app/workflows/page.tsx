import { PageHeader } from "@/components/shell/page-header";

export default function WorkflowCanvasPage() {
  return (
    <div>
      <PageHeader
        title="Workflow Canvas"
        description="Compose an agent workflow from the node palette and run it. (P3: React Flow canvas, W3.4.)"
      />
      <div className="grid h-64 place-items-center rounded-lg border border-dashed text-sm text-muted-foreground">
        Canvas shell — built in P3 (W3.4)
      </div>
    </div>
  );
}
