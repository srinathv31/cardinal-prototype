// One Ask conversation instance (brief §4 screen 4, Beat 5 — "the proof-of-
// life beat"). Owns the AI SDK 7 chat session and renders it per
// docs/wire-contract.md §2: user turns as plain bubbles, assistant turns as
// interleaved narration + evidence (AskAssistantParts). No approval
// plumbing — Ask is read-only (no action tools, no toolApproval config,
// lib/agents/ask/agent.ts) — so this is deliberately thinner than
// components/run-view/run-view.tsx, which this otherwise mirrors.

import { useMemo, useState, type SubmitEvent } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
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
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import type { CardinalUIMessage } from "@/lib/agents/registry";
import { AskAssistantParts } from "./ask-assistant-parts";
import { messageText, resolveErrorMessage } from "./utils";

const SUGGESTED_QUESTIONS = [
  "Show me spend by category across the portfolio this quarter",
  "Which accounts have balance transfers expiring in the next 90 days?",
];

export function AskConversation({ onNewConversation }: { onNewConversation: () => void }) {
  const [conversationId] = useState(() => `ask-${crypto.randomUUID()}`);
  const [input, setInput] = useState("");

  const transport = useMemo(
    () => new DefaultChatTransport<CardinalUIMessage>({ api: "/api/agents/ask/stream" }),
    [],
  );

  const { messages, sendMessage, status, error } = useChat<CardinalUIMessage>({
    id: conversationId,
    transport,
  });

  const hasStarted = messages.length > 0;
  const isBusy = status === "submitted" || status === "streaming";

  function submitText(text: string) {
    const trimmed = text.trim();
    if (!trimmed || isBusy) return;
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
        <Suggestions>
          {SUGGESTED_QUESTIONS.map((question) => (
            <Suggestion
              key={question}
              suggestion={question}
              onClick={submitText}
              disabled={isBusy}
            />
          ))}
        </Suggestions>
        {hasStarted ? (
          <Button size="sm" variant="outline" onClick={onNewConversation}>
            New conversation
          </Button>
        ) : null}
      </div>

      <Conversation className="h-[60vh] rounded-xl border border-border bg-card/40">
        <ConversationContent>
          {!hasStarted ? (
            <ConversationEmptyState
              title="Ask about the portfolio"
              description="Try a suggested question above, or type your own below."
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
                    <AskAssistantParts parts={message.parts} />
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
          placeholder="Ask a portfolio question…"
          disabled={isBusy}
          aria-label="Ask a portfolio question"
        />
        <Button type="submit" disabled={isBusy || input.trim().length === 0}>
          <SendHorizontal className="size-4" />
          Ask
        </Button>
      </form>
    </div>
  );
}
