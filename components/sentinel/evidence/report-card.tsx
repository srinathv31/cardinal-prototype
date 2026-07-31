"use client";

// The audit-report artifact card (DEMO_THESIS.md use case 1 beat 8 — "the
// agent generates a real output file... in a nice template format"; props
// schema in lib/sentinel/registry.ts's `ReportCardProps`). Rendered as chat
// evidence once the batch removal executes: this is the FILE, not the receipt
// — `RemediationReport` is the receipt.
//
// Pure renderer, and pure markup: the download is a plain `<a href download>`,
// never a client fetch. A GET to a static URL is the one download mechanism
// that cannot itself throw during render, which is the same reasoning
// `remediation-report.tsx` records for its own control. Nothing here validates
// the href, retries, or reports progress — if the route is down the browser
// shows a failed navigation and the card is still on screen, intact.
//
// `filename` doubles as the `download` attribute's suggested name, so the file
// the audience sees named on the card is the file that lands in the downloads
// folder.

import { Download, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ReportCardProps } from "@/lib/sentinel/registry";

export function ReportCard({
  filename,
  generatedAt,
  summary,
  href,
}: ReportCardProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 ring-1 ring-foreground/5">
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-primary">
            <FileText className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-widest text-muted-foreground uppercase">
              Audit report
            </p>
            <p className="mt-1 font-mono text-base font-semibold break-all text-foreground">
              {filename}
            </p>
            <p className="mt-0.5 text-sm tabular-nums text-muted-foreground">
              Generated {generatedAt}
            </p>
          </div>
        </div>
        <Button asChild size="lg" variant="outline">
          <a href={href} download={filename}>
            <Download className="size-4" />
            Download
          </a>
        </Button>
      </div>
      <p className="mt-4 border-t border-border pt-3 text-base leading-relaxed text-foreground/90">
        {summary}
      </p>
    </div>
  );
}
