import { PageHeader } from "@/components/shell/page-header";

export default function AskPage() {
  return (
    <div>
      <PageHeader
        title="Ask"
        description="Live portfolio questions answered with generative UI over seed data. (P3: W3.3.)"
      />
      <div className="grid h-64 place-items-center rounded-lg border border-dashed text-sm text-muted-foreground">
        Ask shell — built in P3 (W3.3)
      </div>
    </div>
  );
}
