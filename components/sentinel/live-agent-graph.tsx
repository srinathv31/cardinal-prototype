// Live Agent Graph — center panel (brief §4). Dimmed placeholder: the six
// fixed node names, rendered as idle chips with no positions, no edges, no
// animation. This is *not* React Flow — W2.1 replaces this entire file's
// contents with a read-only React Flow renderer driven by `graphStep`
// messages (docs/wire-contract.md §9); the graph "holds no logic" even then,
// so swapping this placeholder out changes nothing else on the stage.

const NODE_NAMES = [
  "Orchestrator",
  "Policy Analyst",
  "Rule Engineer",
  "Data Collector",
  "Critic",
  "Approval Gate",
] as const;

export function LiveAgentGraph() {
  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card ring-1 ring-foreground/5">
      <header className="shrink-0 border-b border-border px-4 py-3.5">
        <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Live agent graph
        </h2>
      </header>
      <div className="flex flex-1 flex-col items-center justify-center gap-8 overflow-y-auto px-6 py-6">
        <div className="flex flex-wrap items-center justify-center gap-3">
          {NODE_NAMES.map((name) => (
            <span
              key={name}
              className="rounded-full border border-border bg-card/40 px-4 py-2 text-sm font-medium text-muted-foreground opacity-60 ring-1 ring-foreground/5"
            >
              {name}
            </span>
          ))}
        </div>
        <p className="w-full truncate text-center font-mono text-sm text-muted-foreground">
          —
        </p>
      </div>
    </section>
  );
}
