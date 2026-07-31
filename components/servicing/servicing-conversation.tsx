"use client";

// One servicing conversation instance (brief §3 Part B, §7, §4 — reuses
// Ask's conversation surface). Mirrors components/ask/ask-conversation.tsx
// closely, with the one structural difference the brief calls out
// (CARDINAL_V3_AU_BRIEF.md §7c): this agent has ONE approval-gated action
// tool, so — unlike Ask, which is fully read-only — this component wires
// `addToolApprovalResponse` + `sendAutomaticallyWhen` the same way
// components/run-view/run-view.tsx already does for the three monitor
// agents. That's the one genuine "can't reuse Ask's components as-is" gap
// (CLAUDE.md's file-ownership note) — everything else here is Ask's shape.
//
// Presented on a projector to bank technology leadership (brief §7's intro,
// §3's "big type, high contrast, nothing critical behind hover") — this
// screen is deliberately the FIRST thing shown, and it's supposed to read as
// an ordinary consumer servicing assistant. No agent-run chrome (no runId
// badge, no status pill) — just a chat, like any bank's app.
//
// P5 W5.2 projector fix: unlike Ask's two suggestions, this surface has
// four, and the fourth — "I need to update my phone number." — is the
// prompt for brief §8's "never cut" contact-change gate. The shared
// `Suggestions` wrapper (components/ai-elements/suggestion.tsx) lays its
// children out in a single non-wrapping row inside a horizontally-scrolling
// `ScrollArea` with its scrollbar hidden — at a realistic 1280×800 projector
// viewport (brief §1) that clips the fourth chip off the right edge with no
// visible affordance that more content exists. That component is shared
// with /ask (v1, frozen — CLAUDE.md), so it isn't this file's to change;
// the fix instead skips the `Suggestions` wrapper here and lays the same
// `Suggestion` buttons out in a plain wrapping flex row, so a narrow
// viewport wraps to a second line instead of clipping.

import { useMemo, useState, type SubmitEvent } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithApprovalResponses } from "ai";
import { SendHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent } from "@/components/ai-elements/message";
import { Suggestion } from "@/components/ai-elements/suggestion";
import { messageText, resolveErrorMessage } from "@/components/ask/utils";
import type { CardinalUIMessage } from "@/lib/agents/registry";
import { servicingRunId, type ServicingPersona } from "@/lib/agents/servicing/identity";
import { hasOpenGate, ServicingAssistantParts } from "./servicing-assistant-parts";

const SUGGESTED_QUESTIONS = [
  "What are my latest transactions?",
  "When is my next payment due?",
  "What's my balance and available credit?",
  "I need to update my phone number.",
];

export function ServicingConversation({
  persona,
  onNewConversation,
}: {
  persona: ServicingPersona;
  onNewConversation: () => void;
}) {
  // D6 persona pinning: encodes `persona` into the conversation/run id so
  // the servicing agent (constructed server-side, per request, by
  // lib/agents/registry.ts — a file this build keeps off limits) can
  // recover it without a registry.ts change; see
  // lib/agents/servicing/identity.ts's header for the full rationale.
  const [conversationId] = useState(() => servicingRunId(persona, crypto.randomUUID()));
  const [input, setInput] = useState("");

  const transport = useMemo(
    () => new DefaultChatTransport<CardinalUIMessage>({ api: "/api/agents/servicing/stream" }),
    [],
  );

  const { messages, sendMessage, addToolApprovalResponse, status, error } =
    useChat<CardinalUIMessage>({
      id: conversationId,
      transport,
      sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses,
    });

  const hasStarted = messages.length > 0;
  const isBusy = status === "submitted" || status === "streaming";
  // While a gate sits open (stream status is 'ready' — isBusy is false) the
  // only live controls should be the ApprovalCard's own two buttons; see
  // hasOpenGate's header in servicing-assistant-parts.tsx.
  const gateOpen = hasOpenGate(messages);
  const controlsDisabled = isBusy || gateOpen;

  function submitText(text: string) {
    const trimmed = text.trim();
    if (!trimmed || controlsDisabled) return;
    sendMessage({ text: trimmed });
    setInput("");
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    submitText(input);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {SUGGESTED_QUESTIONS.map((question) => (
            <Suggestion
              key={question}
              suggestion={question}
              onClick={submitText}
              disabled={controlsDisabled}
            />
          ))}
        </div>
        {hasStarted ? (
          <Button size="sm" variant="outline" onClick={onNewConversation}>
            New conversation
          </Button>
        ) : null}
      </div>

      <Conversation className="h-[65vh] rounded-xl border border-border bg-card/40">
        <ConversationContent>
          {!hasStarted ? (
            <ConversationEmptyState
              title="Ask about your account"
              description="Try a suggestion above, or type your own question below."
            />
          ) : (
            messages.map((message) =>
              message.role === "user" ? (
                <Message from="user" key={message.id}>
                  <MessageContent>{messageText(message)}</MessageContent>
                </Message>
              ) : (
                <Message from="assistant" key={message.id}>
                  <MessageContent>
                    <ServicingAssistantParts
                      parts={message.parts}
                      onApprove={(approvalId) => addToolApprovalResponse({ id: approvalId, approved: true })}
                      onDecline={(approvalId) => addToolApprovalResponse({ id: approvalId, approved: false })}
                    />
                  </MessageContent>
                </Message>
              ),
            )
          )}

          {isBusy ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner className="size-4" />
              Thinking…
            </div>
          ) : null}

          {error ? (
            <div className="flex flex-col gap-3 rounded-xl border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
              <p className="leading-relaxed">{resolveErrorMessage(error)}</p>
              <Button
                size="sm"
                variant="outline"
                className="w-fit border-destructive/40 text-destructive hover:bg-destructive/10"
                onClick={onNewConversation}
              >
                New conversation
              </Button>
            </div>
          ) : null}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <Input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask about your account…"
          disabled={controlsDisabled}
          aria-label="Ask about your account"
        />
        <Button type="submit" disabled={controlsDisabled || input.trim().length === 0}>
          <SendHorizontal className="size-4" />
          Send
        </Button>
      </form>
    </div>
  );
}
