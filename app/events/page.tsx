import { PageHeader } from "@/components/shell/page-header";

export default function EventLogPage() {
  return (
    <div>
      <PageHeader
        title="Event Log"
        description="Every run, tool call, and approval — timestamped and attributable. (P3: filterable audit table, W3.2.)"
      />
      <div className="grid h-64 place-items-center rounded-lg border border-dashed text-sm text-muted-foreground">
        Audit table shell — built in P3 (W3.2)
      </div>
    </div>
  );
}
