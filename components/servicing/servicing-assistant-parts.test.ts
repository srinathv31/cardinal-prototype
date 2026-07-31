// Pins `hasOpenGate` (servicing-assistant-parts.tsx) — the derivation
// ServicingConversation uses to disable chips/input/send while a gate sits
// open at 'ready' stream status (a paused approval isn't "busy"). Same
// pure-predicate shape as components/ops/ops-assistant-parts.test.ts; see
// that file's header for why plain object literals suffice here (no jsdom
// in this repo, dependencies frozen).

import { describe, expect, it } from 'vitest';
import { hasOpenGate, type GateInputMessage } from './servicing-assistant-parts';

function assistantMessage(parts: GateInputMessage['parts']): GateInputMessage {
  return { role: 'assistant', parts };
}

describe('hasOpenGate (servicing)', () => {
  it('is false with no messages', () => {
    expect(hasOpenGate([])).toBe(false);
  });

  it('is false when no message carries a gate part', () => {
    const messages = [
      { role: 'user', parts: [{ type: 'text' }] },
      assistantMessage([
        { type: 'tool-renderEvidence', state: 'output-available' },
        { type: 'text' },
      ]),
    ];
    expect(hasOpenGate(messages)).toBe(false);
  });

  it.each(['tool-updateContactInfo', 'tool-activateCard'])(
    'is true while %s sits at approval-requested',
    (gateType) => {
      const messages = [assistantMessage([{ type: gateType, state: 'approval-requested' }])];
      expect(hasOpenGate(messages)).toBe(true);
    },
  );

  it('is false once the same gate part resolves to approval-responded', () => {
    const messages = [
      assistantMessage([{ type: 'tool-activateCard', state: 'approval-responded' }]),
    ];
    expect(hasOpenGate(messages)).toBe(false);
  });

  it('is false once a gate part settles to output-available/output-denied/output-error', () => {
    for (const state of ['output-available', 'output-denied', 'output-error']) {
      const messages = [assistantMessage([{ type: 'tool-updateContactInfo', state }])];
      expect(hasOpenGate(messages)).toBe(false);
    }
  });

  it('ignores approval-requested on renderEvidence, which is never gated', () => {
    const messages = [
      assistantMessage([{ type: 'tool-renderEvidence', state: 'approval-requested' }]),
    ];
    expect(hasOpenGate(messages)).toBe(false);
  });

  it('ignores an open gate on a user message (role guard)', () => {
    const messages = [
      { role: 'user', parts: [{ type: 'tool-activateCard', state: 'approval-requested' }] },
    ];
    expect(hasOpenGate(messages)).toBe(false);
  });

  it('is true when an earlier turn resolved and a later gate is open', () => {
    const messages = [
      assistantMessage([{ type: 'tool-updateContactInfo', state: 'approval-responded' }]),
      assistantMessage([{ type: 'tool-activateCard', state: 'approval-requested' }]),
    ];
    expect(hasOpenGate(messages)).toBe(true);
  });
});
