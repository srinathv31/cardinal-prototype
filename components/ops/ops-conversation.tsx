"use client";

// One ops-chat conversation (DEMO_THESIS.md use case 1; DEMO_BUILD_PLAN.md D5
// — "Ops chat at `/ops` (new route, reuses Ask's conversation machinery +
// native tool approval)"). Structurally this is
// components/servicing/servicing-conversation.tsx with two additions the ops
// beat needs:
//
//  1. **The attach affordance.** DEMO_THESIS.md use case 1 opens with an
//     upload. Picking ANY file produces a user turn naming that file and
//     hands the agent the checked-in policy content — the v3 policy-panel
//     mock file-drop, moved into a chat input. Nothing is read from the file
//     and nothing leaves the browser: `input.files[0].name` is the only thing
//     this component touches, which is exactly what "the file is real, the
//     content is pinned" means in practice.
//  2. **The spectacle column.** At `xl` and wider, the read-only Sentinel
//     agent graph renders beside the chat, coarsely driven by tool lifecycle
//     (components/ops/graph-state.ts). It is decorative — DEMO_THESIS.md
//     ground rule 4, "nothing functional depends on it" — and it is hidden
//     entirely below `xl` rather than squeezed, because a legible chat is
//     worth more on a projector than an illegible diagram beside it.
//
// Approval plumbing is the servicing surface's, unchanged:
// `addToolApprovalResponse` + `sendAutomaticallyWhen:
// lastAssistantMessageIsCompleteWithApprovalResponses` (docs/ai-sdk7-notes.md).
// Two gates instead of one needs no extra wiring — the resume POST fires once
// every pending approval has a response.

import { useMemo, useRef, useState, type SubmitEvent } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, lastAssistantMessageIsCompleteWithApprovalResponses } from "ai";
import { Paperclip, SendHorizontal } from "lucide-react";
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
import { LiveAgentGraph } from "@/components/sentinel/live-agent-graph";
import { messageText, resolveErrorMessage } from "@/components/ask/utils";
import type { CardinalUIMessage } from "@/lib/agents/registry";
import { deriveOpsGraphState } from "./graph-state";
import { OpsAssistantParts } from "./ops-assistant-parts";

const SUGGESTED_REQUESTS = [
  "Give me the accounts that fail on these authorized-user policies.",
  "Which relationships are out of compliance?",
  "Run the card-activation policy against the book.",
];

/** Which policy a picked file names, by the one keyword the server uses for
 * the same decision (lib/agents/ops/resolvers.ts's
 * `CARD_ACTIVATION_DOCUMENT_HINT`). This is copy for the USER'S OWN turn, not
 * a routing decision: the server re-derives the document from the same file
 * name independently, and would parse the card-activation fixture even if this
 * sentence said nothing about it. */
const CARD_ACTIVATION_FILENAME = /activation/i;

/** The user turn an upload produces. The file name is the user's own — read
 * from the picker, never invented — and the sentence after it is what tells
 * the agent this is a policy document to parse. */
function uploadMessage(filename: string): string {
  const policy = CARD_ACTIVATION_FILENAME.test(filename)
    ? "card-activation"
    : "authorized-user";
  return `Uploaded ${filename} — please parse this ${policy} policy document.`;
}

export function OpsConversation({ onNewConversation }: { onNewConversation: () => void }) {
  const [conversationId] = useState(() => `ops-${crypto.randomUUID()}`);
  const [input, setInput] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const transport = useMemo(
    () => new DefaultChatTransport<CardinalUIMessage>({ api: "/api/agents/ops/stream" }),
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
  const graph = useMemo(() => deriveOpsGraphState(messages, isBusy), [messages, isBusy]);

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

  function handleFilePicked(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Reset immediately so picking the same file twice fires again.
    event.target.value = "";
    if (!file) return;
    submitText(uploadMessage(file.name));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {SUGGESTED_REQUESTS.map((request) => (
            <Suggestion
              key={request}
              suggestion={request}
              onClick={submitText}
              disabled={isBusy}
            />
          ))}
        </div>
        {hasStarted ? (
          <Button size="sm" variant="outline" onClick={onNewConversation}>
            New conversation
          </Button>
        ) : null}
      </div>

      <div className="grid min-h-0 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_22rem]">
        <Conversation className="h-[65vh] rounded-xl border border-border bg-card/40">
          <ConversationContent>
            {!hasStarted ? (
              <ConversationEmptyState
                title="Start with a policy document"
                description="Attach the authorized-user policy and I'll extract the rules for your approval."
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
                      <OpsAssistantParts
                        parts={message.parts}
                        onApprove={(approvalId) =>
                          addToolApprovalResponse({ id: approvalId, approved: true })
                        }
                        onDecline={(approvalId) =>
                          addToolApprovalResponse({ id: approvalId, approved: false })
                        }
                      />
                    </MessageContent>
                  </Message>
                ),
              )
            )}

            {isBusy ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Spinner className="size-4" />
                Working…
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

        {/* Spectacle only (module header). Hidden below xl. `grid` rather than
            `flex`: LiveAgentGraph's root section sizes to its content, and a
            grid container stretches a lone child to the track's full height
            without that component needing a className prop it doesn't have. */}
        <div className="hidden h-[65vh] min-h-0 xl:grid">
          <LiveAgentGraph
            nodes={graph.nodes}
            animatedEdges={graph.animatedEdges}
            headline={graph.headline}
            approvalPending={graph.approvalPending}
            nodeDetails={graph.nodeDetails}
          />
        </div>
      </div>

      <form onSubmit={handleSubmit} className="flex items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          onChange={handleFilePicked}
          aria-hidden="true"
          tabIndex={-1}
        />
        <Button
          type="button"
          variant="outline"
          disabled={isBusy}
          onClick={() => fileInputRef.current?.click()}
          aria-label="Attach a policy document"
        >
          <Paperclip className="size-4" />
          Attach policy
        </Button>
        <Input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="Ask about policy compliance…"
          disabled={isBusy}
          aria-label="Ask about policy compliance"
        />
        <Button type="submit" disabled={isBusy || input.trim().length === 0}>
          <SendHorizontal className="size-4" />
          Send
        </Button>
      </form>
    </div>
  );
}
