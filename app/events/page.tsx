import { PageHeader } from "@/components/shell/page-header";
import { EventLogTable } from "@/components/event-log/event-log-table";

// Server shell (brief §5b) — all filtering/polling state lives in the
// client component; this route only renders the header and mounts it.
export default function EventLogPage() {
  return (
    <div>
      <PageHeader
        title="Event Log"
        description="Agents act, humans approve, everything is auditable — every run, tool call, and approval gate, timestamped and attributable."
      />
      <EventLogTable />
    </div>
  );
}
