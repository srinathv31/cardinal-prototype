// Pins `hasOpenGate` (ops-assistant-parts.tsx) — the derivation
// OpsConversation uses to disable chips/attach/input/send while a gate sits
// open at 'ready' stream status (a paused approval isn't "busy"). The
// function is intentionally a tiny pure predicate over a structural message
// shape, so these are plain object-literal fixtures — no DOM environment,
// no AI SDK generics, matching this repo's "no jsdom" testing convention
// (see components/sentinel/evidence/violations-dashboard.test.tsx's header).

import { describe, expect, it } from 'vitest';
import { hasOpenGate, type GateInputMessage } from './ops-assistant-parts';

function assistantMessage(parts: GateInputMessage['parts']): GateInputMessage {
  return { role: 'assistant', parts };
}

describe('hasOpenGate (ops)', () => {
  it('is false with no messages', () => {
    expect(hasOpenGate([])).toBe(false);
  });

  it('is false when no message carries a gate part', () => {
    const messages = [
      { role: 'user', parts: [{ type: 'text', state: undefined }] },
      assistantMessage([
        { type: 'tool-parsePolicyDocument', state: 'output-available' },
        { type: 'text' },
      ]),
    ];
    expect(hasOpenGate(messages)).toBe(false);
  });

  it.each(['tool-saveRules', 'tool-executeBatchRemoval', 'tool-queueActivationOutreach'])(
    'is true while %s sits at approval-requested',
    (gateType) => {
      const messages = [assistantMessage([{ type: gateType, state: 'approval-requested' }])];
      expect(hasOpenGate(messages)).toBe(true);
    },
  );

  it('is false once the same gate part resolves to approval-responded', () => {
    const messages = [
      assistantMessage([{ type: 'tool-saveRules', state: 'approval-responded' }]),
    ];
    expect(hasOpenGate(messages)).toBe(false);
  });

  it('is false once a gate part settles to output-available/output-denied/output-error', () => {
    for (const state of ['output-available', 'output-denied', 'output-error']) {
      const messages = [assistantMessage([{ type: 'tool-executeBatchRemoval', state }])];
      expect(hasOpenGate(messages)).toBe(false);
    }
  });

  it('ignores approval-requested on a read tool never routed through GatePart', () => {
    // Defensive: read tools (parsePolicyDocument/queryViolations/generateReport)
    // are never approval-gated server-side, but the scope must stay exact —
    // GATED_TOOL_TYPES, not "any tool-* part".
    const messages = [
      assistantMessage([{ type: 'tool-queryViolations', state: 'approval-requested' }]),
    ];
    expect(hasOpenGate(messages)).toBe(false);
  });

  it('ignores an open gate on a user message (role guard)', () => {
    const messages = [
      { role: 'user', parts: [{ type: 'tool-saveRules', state: 'approval-requested' }] },
    ];
    expect(hasOpenGate(messages)).toBe(false);
  });

  it('is true when an earlier turn resolved and a later gate is open', () => {
    const messages = [
      assistantMessage([{ type: 'tool-saveRules', state: 'approval-responded' }]),
      assistantMessage([{ type: 'tool-executeBatchRemoval', state: 'approval-requested' }]),
    ];
    expect(hasOpenGate(messages)).toBe(true);
  });
});
