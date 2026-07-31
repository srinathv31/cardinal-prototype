// Agent registry — maps an agentId to its agent implementation and owns the
// per-agent stream dispatch, plus the union UI-message type the run view is
// written against. Client components import ONLY types from this module
// (`import type`), which erase at build time; the values pull in server-only
// provider config and must never be value-imported from a client component.

import { createAgentUIStreamResponse, validateUIMessages } from 'ai';
import {
  createPaymentHealthAgent,
  type PaymentHealthUIMessage,
} from './payment-health/agent';
import {
  createBTLifecycleAgent,
  type BTLifecycleUIMessage,
} from './bt-lifecycle/agent';
import { createAUGrowthAgent, type AUGrowthUIMessage } from './au-growth/agent';
import { createAskAgent, type AskUIMessage } from './ask/agent';
import { createServicingAgent, type ServicingUIMessage } from './servicing/agent';
import { createOpsAgent, type OpsUIMessage } from './ops/agent';

export type CardinalUIMessage =
  | PaymentHealthUIMessage
  | BTLifecycleUIMessage
  | AUGrowthUIMessage
  | AskUIMessage
  | ServicingUIMessage
  | OpsUIMessage;

export const AGENT_IDS = [
  'payment-health',
  'bt-lifecycle',
  'au-growth',
  'ask',
  'servicing',
  'ops',
] as const;
export type CardinalAgentId = (typeof AGENT_IDS)[number];

export const AGENT_NAMES: Record<CardinalAgentId, string> = {
  'payment-health': 'Payment Health',
  'bt-lifecycle': 'BT Lifecycle',
  'au-growth': 'AU Growth',
  ask: 'Ask',
  servicing: 'Servicing',
  ops: 'Ops',
};

export function isCardinalAgentId(value: string): value is CardinalAgentId {
  return (AGENT_IDS as readonly string[]).includes(value);
}

/**
 * Validates a run's incoming message history, hands the validated messages
 * to `onValidated` (the route logs human approval decisions there), then
 * starts/resumes the agent's UI-message stream (docs/wire-contract.md §1).
 *
 * Dispatch is one branch per agent rather than a factory lookup so each
 * branch keeps the SDK generics fully narrow — a run's history only ever
 * POSTs to its own agentId, but TypeScript can't correlate union members
 * across `agent` and `uiMessages` without this.
 */
export async function createAgentRunStreamResponse(options: {
  agentId: CardinalAgentId;
  runId: string;
  messages: unknown;
  onValidated: (messages: CardinalUIMessage[]) => void;
}): Promise<Response> {
  const { agentId, runId, messages, onValidated } = options;
  switch (agentId) {
    case 'payment-health': {
      const uiMessages = await validateUIMessages<PaymentHealthUIMessage>({ messages });
      onValidated(uiMessages);
      const agent = createPaymentHealthAgent({ runId });
      return createAgentUIStreamResponse({ agent, uiMessages });
    }
    case 'bt-lifecycle': {
      const uiMessages = await validateUIMessages<BTLifecycleUIMessage>({ messages });
      onValidated(uiMessages);
      const agent = createBTLifecycleAgent({ runId });
      return createAgentUIStreamResponse({ agent, uiMessages });
    }
    case 'au-growth': {
      const uiMessages = await validateUIMessages<AUGrowthUIMessage>({ messages });
      onValidated(uiMessages);
      const agent = createAUGrowthAgent({ runId });
      return createAgentUIStreamResponse({ agent, uiMessages });
    }
    case 'ask': {
      const uiMessages = await validateUIMessages<AskUIMessage>({ messages });
      onValidated(uiMessages);
      const agent = createAskAgent({ runId });
      return createAgentUIStreamResponse({ agent, uiMessages });
    }
    case 'servicing': {
      const uiMessages = await validateUIMessages<ServicingUIMessage>({ messages });
      onValidated(uiMessages);
      const agent = createServicingAgent({ runId });
      return createAgentUIStreamResponse({ agent, uiMessages });
    }
    case 'ops': {
      const uiMessages = await validateUIMessages<OpsUIMessage>({ messages });
      onValidated(uiMessages);
      const agent = createOpsAgent({ runId });
      return createAgentUIStreamResponse({ agent, uiMessages });
    }
  }
}
