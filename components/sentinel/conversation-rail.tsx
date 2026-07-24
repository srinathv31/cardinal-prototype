"use client";

// Conversation Rail — left panel (brief §4). Replaces v2's event replay
// rail: v3 has no night of streamed events to scroll past, so the left
// column is the chat transcript instead — presenter prompts echoed
// verbatim as user turns, agent narration streaming in as assistant turns
// with the typing effect (brief §4). Pure renderer of `Stage`'s
// `ScenarioPlayer` snapshot (v1 invariant 5b): every figure below comes
// from props, nothing is fetched or derived from lib/soe or lib/sentinel
// here — only types cross that boundary.
//
// This is the READ-ONLY half of W1.1: the transcript and the counter/beat
// footer. The prompt input, the `awaitStageAction: 'prompt'` enable/disable
// gating, and the suggestion chip land in P1 alongside `buildDemoScenario` —
// there is no real script yet for a presenter to type against, so wiring an
// input here would have nothing to submit to. `turns` is already exactly
// the shape a future input would append to (`SentinelChatTurn`), so P1 adds
// UI, not a new data shape.
//
// Modeled on the deleted event-replay-rail.tsx's panel chrome (rounded-xl
// border/card/ring, uppercase tracking-wide header, counter tiles) and on
// context-rail.tsx's auto-follow scroll idiom — this rail is oldest-first
// and grows downward (a human reads a transcript top-to-bottom), unlike the
// old newest-first rail, so it needs the scroll-follow effect the old one
// never did.

import { useEffect, useRef } from "react";
import type { SentinelChatTurn, SentinelCounter } from "@/lib/sentinel/scenario/types";
import { cn } from "@/lib/utils";

export function ConversationRail({
  turns,
  counter,
  caption,
}: {
  turns: SentinelChatTurn[];
  counter: SentinelCounter;
  caption?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-follow: newest content is always in view for the presenter demo
  // (brief §1) — an instant `scrollTop` jump on every `turns` change, no
  // smooth-scroll easing, no scroll-position preservation (context-rail.tsx's
  // identical pattern).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [turns]);

  const counters = [
    { value: counter.scanned, label: "scanned" },
    { value: counter.exceptions, label: "exceptions" },
    { value: counter.remediated, label: "remediated" },
  ] as const;

  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card ring-1 ring-foreground/5">
      <header className="shrink-0 border-b border-border px-4 py-3.5">
        <h2 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Conversation
        </h2>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6">
        {turns.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="flex flex-col gap-3">
            {turns.map((turn) => (
              <ChatBubble key={turn.id} turn={turn} />
            ))}
          </div>
        )}
      </div>

      <footer className="shrink-0 border-t border-border px-4 py-3.5">
        {caption ? (
          <div className="animate-in fade-in zoom-in-95 flex flex-col gap-1 duration-700">
            <p className="text-xl font-semibold tracking-tight text-foreground sm:text-2xl">
              {counter.scanned} scanned · {counter.exceptions} exception
              {counter.exceptions === 1 ? "" : "s"} · {counter.remediated} remediated
            </p>
            <p className="text-sm text-muted-foreground">{caption}</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {counters.map((c) => (
              <div
                key={c.label}
                className="flex flex-col items-center gap-0.5 rounded-lg bg-muted/40 py-2.5"
              >
                <span className="font-mono text-3xl font-semibold tabular-nums tracking-tight text-foreground">
                  {c.value}
                </span>
                <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  {c.label}
                </span>
              </div>
            ))}
          </div>
        )}
      </footer>
    </section>
  );
}

/** The pre-Act-I resting state (brief §3 Act I beat 1): "conversation rail
 * empty with a single system line." A single muted line, not a placeholder
 * card — there is nothing to show yet, and saying so quietly is the point. */
function EmptyState() {
  return (
    <div className="flex h-full items-center justify-center text-center">
      <p className="text-sm text-muted-foreground">
        Sentinel · authorized-user policy enforcement · idle
      </p>
    </div>
  );
}

/** User and agent turns must read as visually distinct at projector
 * distance (brief §4, §9: big type, high contrast, nothing critical behind
 * hover) — a right-aligned, filled bubble for the presenter's prompt versus
 * a left-aligned, muted block for the agent's response, mirroring an
 * ordinary chat UI's convention because that convention is legible from the
 * back of the room already. */
function ChatBubble({ turn }: { turn: SentinelChatTurn }) {
  const isUser = turn.role === "user";
  return (
    <div className={cn("flex", isUser ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[85%] rounded-xl px-4 py-3 text-base leading-relaxed",
          isUser
            ? "bg-primary font-medium text-primary-foreground"
            : "bg-muted/60 text-foreground ring-1 ring-foreground/5",
        )}
      >
        {turn.text}
        {!isUser && !turn.done ? (
          <span
            aria-hidden
            className="ml-0.5 inline-block h-4 w-2 animate-pulse bg-primary/70 align-middle"
          />
        ) : null}
      </div>
    </div>
  );
}
