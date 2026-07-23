// Workflow Canvas route (brief §4 screen 2; W3.4). Server shell only — all
// canvas state (nodes/edges/name) and the Run handoff live in the client
// component (brief §5b: zero business logic in components, and there is no
// server data to fetch here at all).

import { PageHeader } from "@/components/shell/page-header";
import { WorkflowCanvas } from "@/components/workflow-canvas/workflow-canvas";

export default function WorkflowCanvasPage() {
  return (
    <div>
      <PageHeader
        title="Workflow Canvas"
        description="Compose an agent workflow from the node palette and run it."
      />
      <WorkflowCanvas />
    </div>
  );
}
