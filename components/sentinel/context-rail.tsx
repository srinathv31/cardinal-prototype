// Context Rail — right panel (brief §4). Idle placeholder only: streamed
// narration, progressive evidence, and the Policy panel drawer are later
// work items (W1.2 Manual Review card, W3.1 Policy panel, W3.2 Rule Diff,
// W4.2 evidence components) — none of that is built here.

export function ContextRail() {
  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card ring-1 ring-foreground/5">
      <header className="shrink-0 border-b border-border px-4 py-3.5">
        <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Context
        </h2>
      </header>
      <div className="flex flex-1 items-center justify-center overflow-y-auto px-4 py-6 text-center">
        <p className="text-sm text-muted-foreground">
          Narration and evidence stream here during a run.
        </p>
      </div>
    </section>
  );
}
