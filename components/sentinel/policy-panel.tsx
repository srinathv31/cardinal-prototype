"use client";

// Policy Panel — Act II's drawer over the context rail (brief §3 Act II
// beat 1, §4, W3.1). Pure renderer of `PolicyPanelState`: the stage wires
// this to `ScenarioPlayer`'s `policyPanel` snapshot field and the
// `policy-drop` stage-action gate (lib/sentinel/scenario/types.ts) — drawer
// visibility is entirely scenario-driven, never component-local state. The
// presenter's click on the mock file card only forwards `onDrop()` upstream
// (Stage → `ScenarioPlayer#resolveStageAction`); this component never
// resolves the gate itself, never imports the player, never fetches.
//
// Always mounted (never conditionally rendered) so the slide-in/out has
// something to animate: `closed` translates the panel fully off-screen
// (`translate-x-full`, `pointer-events-none`, `aria-hidden`) instead of
// unmounting it. It's positioned `absolute inset-0` over the stage's
// context-rail column — the stage wraps ContextRail + PolicyPanel in a
// `relative` container (separate work item) — and matches context-rail.tsx
// / conversation-rail.tsx's sibling panel chrome (rounded-xl border/card/
// ring, uppercase tracking-wide header) so the drawer reads as part of the
// same column, not a modal dialog.

import { FileText } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PolicyPanelState } from "@/lib/sentinel/scenario/types";
import type { PolicyDocument } from "@/lib/sentinel/policy";

interface PolicyPanelProps {
  panel: PolicyPanelState;
  dropEnabled: boolean;
  onDrop: () => void;
  document: PolicyDocument;
}

export function PolicyPanel({ panel, dropEnabled, onDrop, document }: PolicyPanelProps) {
  const open = panel !== "closed";
  /** The dropped file's name, derived from the document's own id rather than
   * held as a second literal beside it (v3 renamed the policy and the old
   * hardcoded filename survived the rename — exactly the drift deriving it
   * prevents). Both the drop target and the preview chip name the same file
   * because they read the same source. */
  const filename = `${document.id}.docx`;

  return (
    <section
      aria-hidden={!open}
      className={cn(
        "absolute inset-0 z-10 flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card ring-1 ring-foreground/5 transition-transform duration-500",
        open ? "translate-x-0" : "pointer-events-none translate-x-full",
      )}
    >
      <header className="shrink-0 border-b border-border px-4 py-3.5">
        <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Policy intake
        </h2>
      </header>
      <div className="flex min-h-0 flex-1 flex-col">
        {panel === "drop" ? (
          <DropZone dropEnabled={dropEnabled} onDrop={onDrop} filename={filename} />
        ) : panel === "preview" ? (
          <DocumentPreview document={document} filename={filename} />
        ) : null}
      </div>
    </section>
  );
}

/** brief §3 Act II beat 1's mock file-pick. `dropEnabled` mirrors the
 * player's `awaitStageAction('policy-drop')` gate — dimmed and inert until
 * that gate is actually pending, so a presenter can't jump ahead of the
 * scenario by clicking early. */
function DropZone({
  dropEnabled,
  onDrop,
  filename,
}: {
  dropEnabled: boolean;
  onDrop: () => void;
  filename: string;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-4 py-6">
      <div className="flex w-full flex-col items-center gap-5 rounded-xl border-2 border-dashed border-border px-6 py-12">
        <button
          type="button"
          onClick={dropEnabled ? onDrop : undefined}
          disabled={!dropEnabled}
          aria-disabled={!dropEnabled}
          className={cn(
            "flex w-full max-w-sm items-center gap-4 rounded-xl border border-border bg-muted/40 px-6 py-5 text-left transition-colors duration-200",
            dropEnabled
              ? "cursor-pointer hover:border-primary hover:bg-primary/10"
              : "cursor-not-allowed opacity-50",
          )}
        >
          <FileText className="size-9 shrink-0 text-primary" aria-hidden />
          <span className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-lg font-semibold text-foreground">
              {filename}
            </span>
            <span className="text-base text-muted-foreground">48 KB · Servicing policy</span>
          </span>
        </button>
        <p className="text-base text-muted-foreground">Click the file to drop it in.</p>
      </div>
    </div>
  );
}

/** The received-document preview (brief §3 Act II beat 1, tail end): a
 * 1-page typographic rendering of the seeded policy content, straight from
 * `document` — no lib/sentinel/policy import here, the stage passes the
 * value down. */
function DocumentPreview({
  document,
  filename,
}: {
  document: PolicyDocument;
  filename: string;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 py-4">
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <span className="text-base font-semibold text-foreground">{filename}</span>
        <span className="inline-flex items-center rounded-full bg-success/15 px-2.5 py-0.5 text-sm font-semibold text-success">
          Received · routing to Policy Analyst
        </span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto rounded-xl border border-border bg-muted/20 px-5 py-5">
        <h3 className="text-xl font-semibold tracking-tight text-foreground">{document.title}</h3>
        <div className="mt-4 flex flex-col gap-4">
          {document.sections.map((section) => (
            <div key={section.id} className="flex flex-col gap-1">
              <h4 className="text-base font-semibold text-foreground">{section.heading}</h4>
              <p className="text-base leading-relaxed text-muted-foreground">{section.body}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
