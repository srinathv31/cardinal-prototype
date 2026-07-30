// Focused unit coverage for the card-activation evaluator
// (lib/sentinel/ca-exceptions.ts) — synthetic, minimal inputs, especially at
// the CA-R2 45/46-day boundary (both arms: an unactivated card evaluated
// against `asOf`, and an activated-late card evaluated against its own
// `activatedDate`). The golden 214/41=29+12 integration figures live beside
// the generator instead (lib/soe/seed/card-activation.test.ts), which
// exercises this evaluator against the real generated collection — this
// file is deliberately narrow and hand-computed so a boundary regression is
// obvious without cross-referencing the seed's PRNG output.

import { describe, expect, it } from 'vitest';
import type { Payment } from '@/lib/soe/types';
import {
  CA_ACTIVATION_WINDOW_DAYS,
  checkActivationAttempt,
  evaluateCardActivationPolicy,
  isPastDueAsOf,
  type CaScanInput,
} from './ca-exceptions';

function payment(overrides: Partial<Payment> & Pick<Payment, 'accountId' | 'dueDate' | 'status'>): Payment {
  return {
    paymentId: `pay-${overrides.accountId}-${overrides.dueDate}`,
    amountDue: 100,
    minimumDue: 35,
    amountPaid: overrides.status === 'MISSED' ? 0 : 100,
    channel: 'AUTOPAY',
    ...overrides,
  };
}

describe('CA_ACTIVATION_WINDOW_DAYS', () => {
  it('is 45, per card-activation-policy.ts CA-R2', () => {
    expect(CA_ACTIVATION_WINDOW_DAYS).toBe(45);
  });
});

describe('isPastDueAsOf', () => {
  it('is not past-due when there is no payment on file yet', () => {
    expect(isPastDueAsOf([], 'acct-x', '2026-08-05').pastDue).toBe(false);
  });

  it('is past-due when the most recent payment due on or before the date is MISSED', () => {
    const payments = [
      payment({ accountId: 'acct-x', dueDate: '2026-07-01', status: 'POSTED' }),
      payment({ accountId: 'acct-x', dueDate: '2026-07-24', status: 'MISSED' }),
    ];
    const result = isPastDueAsOf(payments, 'acct-x', '2026-08-05');
    expect(result.pastDue).toBe(true);
    expect(result.asOfPayment?.dueDate).toBe('2026-07-24');
  });

  it('is NOT past-due when a later payment posted after the missed one', () => {
    const payments = [
      payment({ accountId: 'acct-x', dueDate: '2026-07-01', status: 'MISSED' }),
      payment({ accountId: 'acct-x', dueDate: '2026-07-31', status: 'POSTED' }),
    ];
    const result = isPastDueAsOf(payments, 'acct-x', '2026-08-05');
    expect(result.pastDue).toBe(false);
    expect(result.asOfPayment?.dueDate).toBe('2026-07-31');
  });

  it('ignores payments due AFTER the evaluation date', () => {
    const payments = [payment({ accountId: 'acct-x', dueDate: '2026-08-10', status: 'MISSED' })];
    expect(isPastDueAsOf(payments, 'acct-x', '2026-08-05').pastDue).toBe(false);
  });

  it('filters strictly by accountId — a MISSED payment on a different account never bleeds in', () => {
    const payments = [payment({ accountId: 'acct-other', dueDate: '2026-07-24', status: 'MISSED' })];
    expect(isPastDueAsOf(payments, 'acct-x', '2026-08-05').pastDue).toBe(false);
  });
});

describe('checkActivationAttempt — CA-R1 (past-due at activation)', () => {
  it('flags an activation attempt when the account is past-due', () => {
    const payments = [payment({ accountId: 'acct-x', dueDate: '2026-07-24', status: 'MISSED' })];
    const hit = checkActivationAttempt({
      accountId: 'acct-x',
      cardId: 'card-1',
      issuedDate: '2026-07-20',
      attemptDate: '2026-08-01',
      payments,
    });
    expect(hit?.ruleId).toBe('CA-R1');
    expect(hit?.finding).toContain('past-due');
  });

  it('CA-R1 is checked before CA-R2 — a card that is both past-due and outside the window is reported once, under CA-R1', () => {
    const payments = [payment({ accountId: 'acct-x', dueDate: '2026-07-24', status: 'MISSED' })];
    const hit = checkActivationAttempt({
      accountId: 'acct-x',
      cardId: 'card-1',
      issuedDate: '2026-01-01', // far more than 45 days before attemptDate too
      attemptDate: '2026-08-01',
      payments,
    });
    expect(hit?.ruleId).toBe('CA-R1');
  });

  it('does not flag an activation attempt on an account in good standing', () => {
    const payments = [payment({ accountId: 'acct-x', dueDate: '2026-07-24', status: 'POSTED' })];
    const hit = checkActivationAttempt({
      accountId: 'acct-x',
      cardId: 'card-1',
      issuedDate: '2026-07-20',
      attemptDate: '2026-08-01',
      payments,
    });
    expect(hit).toBeNull();
  });
});

describe('checkActivationAttempt — CA-R2 boundary (activated-late arm)', () => {
  it('exactly 45 elapsed days is compliant', () => {
    const hit = checkActivationAttempt({
      accountId: 'acct-x',
      cardId: 'card-1',
      issuedDate: '2026-06-01',
      attemptDate: '2026-07-16', // 45 days after 2026-06-01
      payments: [],
    });
    expect(hit).toBeNull();
  });

  it('exactly 46 elapsed days is the first violation', () => {
    const hit = checkActivationAttempt({
      accountId: 'acct-x',
      cardId: 'card-1',
      issuedDate: '2026-06-01',
      attemptDate: '2026-07-17', // 46 days after 2026-06-01
      payments: [],
    });
    expect(hit?.ruleId).toBe('CA-R2');
    expect(hit?.finding).toContain('45-day');
  });
});

describe('evaluateCardActivationPolicy — CA-R2 boundary (unactivated arm)', () => {
  const baseInput = (asOf: string, issuedDate: string): CaScanInput => ({
    cardActivations: [{ accountId: 'acct-x', cardId: 'card-1', issuedDate }],
    payments: [],
    asOf,
  });

  it('exactly 45 elapsed days, still unactivated, is compliant', () => {
    const result = evaluateCardActivationPolicy(baseInput('2026-07-16', '2026-06-01'));
    expect(result.exceptions).toHaveLength(0);
  });

  it('exactly 46 elapsed days, still unactivated, is the first violation', () => {
    const result = evaluateCardActivationPolicy(baseInput('2026-07-17', '2026-06-01'));
    expect(result.exceptions).toHaveLength(1);
    expect(result.exceptions[0]).toMatchObject({ ruleId: 'CA-R2', accountId: 'acct-x', cardId: 'card-1' });
    expect(result.exceptions[0].activatedDate).toBeUndefined();
  });
});

describe('evaluateCardActivationPolicy — CA-R1 never applies to an unactivated card', () => {
  it('a stale, unactivated, past-due account is reported once, under CA-R2 only', () => {
    const input: CaScanInput = {
      cardActivations: [{ accountId: 'acct-x', cardId: 'card-1', issuedDate: '2026-01-01' }],
      payments: [payment({ accountId: 'acct-x', dueDate: '2026-06-01', status: 'MISSED' })],
      asOf: '2026-08-05',
    };
    const result = evaluateCardActivationPolicy(input);
    expect(result.exceptions).toHaveLength(1);
    expect(result.exceptions[0].ruleId).toBe('CA-R2');
  });
});

describe('evaluateCardActivationPolicy — byRule / accountsAffected aggregation', () => {
  it('counts cards and distinct accounts per rule, and cardsScanned reflects the full input', () => {
    const input: CaScanInput = {
      cardActivations: [
        { accountId: 'acct-1', cardId: 'card-1', issuedDate: '2026-01-01' }, // stale, unactivated -> CA-R2
        { accountId: 'acct-2', cardId: 'card-2', issuedDate: '2026-07-20', activatedDate: '2026-08-01' }, // past-due -> CA-R1
        { accountId: 'acct-3', cardId: 'card-3', issuedDate: '2026-08-01' }, // fresh, unactivated -> compliant
      ],
      payments: [payment({ accountId: 'acct-2', dueDate: '2026-07-24', status: 'MISSED' })],
      asOf: '2026-08-05',
    };
    const result = evaluateCardActivationPolicy(input);
    expect(result.cardsScanned).toBe(3);
    expect(result.exceptions).toHaveLength(2);
    expect(result.byRule).toEqual({
      'CA-R1': { count: 1, accounts: 1 },
      'CA-R2': { count: 1, accounts: 1 },
    });
    expect(result.accountsAffected).toBe(2);
  });
});
