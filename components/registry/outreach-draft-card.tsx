"use client";

// Registry renderer — pure presentation only (brief §5b). `to`/`subject`/
// `body` are resolved server-side (recipient never invented by the model,
// §4). Local state only mirrors the editable draft in the textarea; no
// business logic, no data fetching.

import { useState } from "react";
import { Mail } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import type { OutreachDraftCardProps } from "@/lib/registry/schemas";

const channelLabel: Record<OutreachDraftCardProps["channel"], string> = {
  EMAIL: "Email",
};

export function OutreachDraftCard({
  channel,
  to,
  subject,
  body,
  onBodyChange,
}: OutreachDraftCardProps & { onBodyChange?: (body: string) => void }) {
  const [draftBody, setDraftBody] = useState(body);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card ring-1 ring-foreground/5">
      <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-4 py-3">
        <Mail className="size-4 text-primary" />
        <span className="inline-flex items-center rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-semibold tracking-wide text-primary uppercase">
          {channelLabel[channel]}
        </span>
        <span className="text-sm text-muted-foreground">Outreach draft</span>
      </div>
      <div className="space-y-2 border-b border-border px-4 py-3 text-sm">
        <div className="flex gap-2">
          <span className="w-16 shrink-0 text-muted-foreground">To</span>
          <span className="font-medium text-foreground">{to}</span>
        </div>
        <div className="flex gap-2">
          <span className="w-16 shrink-0 text-muted-foreground">Subject</span>
          <span className="font-medium text-foreground">{subject}</span>
        </div>
      </div>
      <div className="px-4 py-3">
        <Textarea
          value={draftBody}
          onChange={(event) => {
            setDraftBody(event.target.value);
            onBodyChange?.(event.target.value);
          }}
          className="min-h-40 text-base leading-relaxed"
          aria-label="Outreach draft body"
        />
      </div>
    </div>
  );
}
