// The AU portfolio — an additive, deterministic generator for the v3
// "authorized user policy" seed collection (CARDINAL_V3_AU_BRIEF.md §5d;
// docs/v3-migration-map.md §6, §6a, §6b — the resolved arithmetic those two
// sections carry is binding here). This module is NEVER merged into
// SeedDb.accounts / .parties / .accountPartyRoles / .payments — it is a
// wholly separate, additive collection, following the precedent
// sentinelReplayEvents/promoNotices set in v2. v1's nine-account portfolio
// arithmetic, its KPIs, and its pinned tests (lib/soe/seed/seed.test.ts) stay
// frozen and green.
//
// Shape (docs/v3-migration-map.md §6a/§6b resolve the brief's arithmetic):
// 1,100 accounts, ids au-acct-0001…au-acct-1100, generated in id order, one
// createRng(AU_PRNG_SEED) instance, fixed draw order per account (documented
// inline below, function by function). AU_PRNG_SEED is a NEW seed constant —
// this module never touches background.ts's PRNG_SEED instance or draw
// order, because seed.test.ts's golden checksum ({ count: 192, sumCents:
// 2_541_250 }) freezes it.
//
//   0001–0052 (52)  Set S       — secured, AU-carrying. Every AU on these
//                                 accounts is an R1 exception (61 relationships:
//                                 0001–0009 carry 2 AUs, 0010–0052 carry 1).
//   0053–0067 (15)  Set B-only  — unsecured, R2-violating AUs only (17
//                                 relationships: 0053–0054 carry 2, 0055–0067
//                                 carry 1).
//   0068–0069 (2)   Overlap     — B ∩ A. Each carries exactly 2 AUs: one
//                                 R2-violating, one R3-violating. Both overlaps
//                                 sit in B ∩ A and never in anything ∩ S — R1 is
//                                 evaluated on ACCOUNT state, so an S-overlap
//                                 would make one relationship break two rules
//                                 and double-count it (migration map §6b).
//   0070–0074 (5)   Set A-only  — unsecured, R3-violating AUs only (1 each).
//   0075–0961 (887) Clean       — unsecured, AU-carrying, no exception.
//                                 0075–0345 (271) carry 2, 0346–0961 (616)
//                                 carry 1.
//   0962–1057 (96)  Secured, no AU  — book depth. The reason 148 secured
//                                 accounts and 52 R1-exception accounts are
//                                 both exact: 52 (Set S) + 96 (here).
//   1058–1100 (43)  Unsecured, no AU — book depth.
//
// Totals: 1,245 AU relationships (61+19+7 exceptions + 4 overlap-AU-tagged +
// 1,158 clean = see the per-index tag table below); 148 secured accounts;
// 961 AU-carrying accounts; 87 exception relationships across 74 distinct
// accounts (52+17+7=76, minus the 2 overlap accounts counted twice = 74).
//
// Per-account draw order (the whole point of documenting this: a future
// change that reorders draws is visibly a deliberate act):
//   1. primary party first/last name           (2 draws: rng.pick × 2)
//   2. primary party date of birth              (2 draws: rng.int × 2)
//   3. credit line: secured deposit OR unsecured limit (1 draw: rng.pick)
//   4. purchaseApr                               (1 draw: rng.pick)
//   5. currentBalance fraction of the limit      (1 draw: rng.next)
//   [ONLY for AU-carrying accounts, indices 0001–0961:]
//   6. missed-cycle determination:
//        R2-exception accounts (0053–0069): 1 draw (rng.int(2,22))
//        every other AU-carrying account: 1 draw (rng.int(0,99)), plus a
//          2nd draw (rng.int(0,23)) only when that roll is < 15
//   7. 24 monthly payment cycles, k = 0…23, one amountDue draw each
//      (rng.int over a limit-relative range)
//   8. per AU slot (1 or 2, in slot order): AU first/last name (2 draws),
//      addedDate offset (1 draw: rng.int for an R2-tag AU, rng.pick from the
//      account's safe-offset list otherwise), date-of-birth offset (2 draws)
//   9. openedDate offset (1 draw: rng.int) — AFTER every AU addedDate is
//      known, since openedDate must precede all of them
//
// Accounts 0962–1100 skip steps 6–8 entirely (no AU, no payment history —
// "never in the scan denominator, and generating history for them is pure
// weight," brief §5d) and draw only an independent openedDate offset at step
// 9 (rng.int(400, 2600), mirroring background.ts's no-BT accounts).

import { dateOnly } from './anchor';
import { createRng } from './prng';
import { minimumDueCents } from './finance';
import type { Account, AccountPartyRole, Party, Payment } from '../types';

export interface AuPortfolio {
  accounts: Account[];
  parties: Party[];
  roles: AccountPartyRole[];
  payments: Payment[];
}

/** This module's own PRNG seed — never background.ts's PRNG_SEED, and never
 * drawn from background.ts's rng instance (see header). */
export const AU_PRNG_SEED = 20260724;

const ACCOUNT_COUNT = 1_100;
const CYCLES_PER_ACCOUNT = 24;

const DEPOSIT_POOL_DOLLARS = [200, 300, 500, 750, 1_000, 1_500, 2_500] as const;
const UNSECURED_LIMIT_POOL_DOLLARS = [
  1_500, 2_500, 5_000, 7_500, 10_000, 15_000, 20_000,
] as const;
const APR_POOL = [21.99, 23.24, 24.99, 26.99, 29.99] as const;

// Fixed name pools (background.ts style) — names repeat across 2,345 parties;
// only emails are made unique (party index in the local part).
const FIRST_NAMES = [
  'James', 'Maria', 'David', 'Linda', 'Michael', 'Susan', 'Robert', 'Karen',
  'William', 'Nancy', 'Carlos', 'Aisha', 'Wei', 'Fatima', 'Noah', 'Olivia',
  'Ethan', 'Sofia', 'Marcus', 'Priya', 'Daniel', 'Grace', 'Samuel', 'Elena',
] as const;
const LAST_NAMES = [
  'Nguyen', 'Garcia', 'Smith', 'Johnson', 'Patel', 'Kim', 'Brown', 'Davis',
  'Rodriguez', 'Martinez', 'Wilson', 'Anderson', 'Taylor', 'Thomas', 'Moore',
  'Jackson', 'Martin', 'Lee', 'Perez', 'White', 'Clark', 'Lewis', 'Young',
  'Walker',
] as const;

/** Zero-padded index string, e.g. pad(7, 4) === '0007'. */
function pad(n: number, width: number): string {
  return String(n).padStart(width, '0');
}

/** true for the 52 (Set S) + 96 (secured, no AU) secured-card indices. */
function isSecuredIndex(index: number): boolean {
  return (index >= 1 && index <= 52) || (index >= 962 && index <= 1_057);
}

/** true for the 961 AU-carrying indices (0001–0961). */
function isAuCarryingIndex(index: number): boolean {
  return index >= 1 && index <= 961;
}

/** true for the 17 accounts (15 B-only + 2 overlap) whose missed cycle is
 * forced inside the R2 look-back rather than left to the 15% book-depth roll. */
function isR2ExceptionIndex(index: number): boolean {
  return index >= 53 && index <= 69;
}

type AuTag = 'R2' | 'R3' | 'none';

/** The AU-relationship tags for an account, in slot order. R1 is NOT a tag
 * here — it is purely a function of the account's own `securedCard`, so any
 * 'none'-tagged AU on a Set-S account is automatically an R1 exception
 * without needing an AU-level marker. */
function auTagsForIndex(index: number): AuTag[] {
  if (index >= 1 && index <= 9) return ['none', 'none'];
  if (index >= 10 && index <= 52) return ['none'];
  if (index >= 53 && index <= 54) return ['R2', 'R2'];
  if (index >= 55 && index <= 67) return ['R2'];
  if (index >= 68 && index <= 69) return ['R2', 'R3'];
  if (index >= 70 && index <= 74) return ['R3'];
  if (index >= 75 && index <= 345) return ['none', 'none'];
  if (index >= 346 && index <= 961) return ['none'];
  return [];
}

/** Every integer offset in [-660, -40] EXCLUDING the 60-day forbidden window
 * [missedDueOffset, missedDueOffset + 60] when the account has a missed
 * cycle. The upper bound is INCLUSIVE to mirror au-exceptions.ts's R2 check
 * ("no missed payment within the 60 days preceding AND INCLUDING addedDate"
 * — policy.ts §Definitions): an addedOffset exactly 60 days after the missed
 * dueDate is still a violation, so it must not read as "safe" here. Built
 * explicitly (not retry-looped) so determinism is obvious by construction —
 * the same list, in the same order, every run. */
function buildSafeOffsets(missedDueOffset: number | undefined): number[] {
  const offsets: number[] = [];
  for (let offset = -660; offset <= -40; offset++) {
    if (
      missedDueOffset !== undefined &&
      offset >= missedDueOffset &&
      offset <= missedDueOffset + 60
    ) {
      continue;
    }
    offsets.push(offset);
  }
  return offsets;
}

export function buildAuPortfolio(anchor: Date): AuPortfolio {
  const rng = createRng(AU_PRNG_SEED);

  const accounts: Account[] = [];
  const parties: Party[] = [];
  const roles: AccountPartyRole[] = [];
  const payments: Payment[] = [];

  let auGenerationCounter = 0; // 1..1245, generation order, for party-au-u-####

  for (let index = 1; index <= ACCOUNT_COUNT; index++) {
    const accountId = `au-acct-${pad(index, 4)}`;
    const secured = isSecuredIndex(index);
    const auCarrying = isAuCarryingIndex(index);

    // 1–2. Primary party name + date of birth (age 25–70 at anchor).
    const primaryFirst = rng.pick(FIRST_NAMES);
    const primaryLast = rng.pick(LAST_NAMES);
    const primaryAgeYears = rng.int(25, 70);
    const primaryAgeDays = rng.int(0, 300);
    const primaryDobOffset = -(primaryAgeYears * 365 + primaryAgeDays);

    // 3. Credit line.
    let creditLimitCents: number;
    let securityDepositDollars: number | undefined;
    if (secured) {
      securityDepositDollars = rng.pick(DEPOSIT_POOL_DOLLARS);
      creditLimitCents = securityDepositDollars * 100;
    } else {
      creditLimitCents = rng.pick(UNSECURED_LIMIT_POOL_DOLLARS) * 100;
    }

    // 4. Purchase APR.
    const purchaseApr = rng.pick(APR_POOL);

    // 5. Current balance — background.ts's fraction-of-limit idiom.
    const currentBalanceCents = Math.round(
      creditLimitCents * (0.08 + rng.next() * 0.54),
    );

    // 6–7. Payment history — AU-carrying accounts only (brief §5d: accounts
    // 0962–1100 "get no payments — they are never in the scan denominator,
    // and generating history for them is pure weight").
    let hasMissed = false;
    let missedIndex: number | undefined;
    if (auCarrying) {
      if (isR2ExceptionIndex(index)) {
        missedIndex = rng.int(2, 22);
        hasMissed = true;
      } else {
        const roll = rng.int(0, 99);
        if (roll < 15) {
          missedIndex = rng.int(0, 23);
          hasMissed = true;
        }
      }
    }
    const missedDueOffset =
      hasMissed && missedIndex !== undefined
        ? -(4 + 30 * missedIndex)
        : undefined;

    if (auCarrying) {
      for (let cycle = 0; cycle < CYCLES_PER_ACCOUNT; cycle++) {
        const dueOffset = -(4 + 30 * cycle);
        const amountDueCents = rng.int(
          Math.round(creditLimitCents * 0.03),
          Math.round(creditLimitCents * 0.15),
        );
        const isMissedCycle = hasMissed && cycle === missedIndex;
        const dueDate = dateOnly(anchor, dueOffset);
        payments.push({
          paymentId: `pay-au-${pad(index, 4)}-${pad(cycle + 1, 2)}`,
          accountId,
          dueDate,
          postedDate: isMissedCycle ? undefined : dueDate,
          amountDue: amountDueCents / 100,
          minimumDue: minimumDueCents(amountDueCents) / 100,
          amountPaid: isMissedCycle ? 0 : amountDueCents / 100,
          status: isMissedCycle ? 'MISSED' : 'POSTED',
          channel: 'AUTOPAY',
        });
      }
    }

    // 8. AU relationships.
    const tags = auTagsForIndex(index);
    const safeOffsets = auCarrying ? buildSafeOffsets(missedDueOffset) : [];
    if (auCarrying && tags.some((t) => t !== 'R2') && safeOffsets.length === 0) {
      throw new Error(
        `AU portfolio: empty safe-offset list for ${accountId} — no addedDate ` +
          'candidate avoids the missed-payment look-back window.',
      );
    }

    const auAddedOffsets: number[] = [];
    for (const tag of tags) {
      const auFirst = rng.pick(FIRST_NAMES);
      const auLast = rng.pick(LAST_NAMES);

      let addedOffset: number;
      if (tag === 'R2') {
        if (missedDueOffset === undefined) {
          throw new Error(
            `AU portfolio: ${accountId} has an R2-tagged AU but no missed cycle.`,
          );
        }
        addedOffset = missedDueOffset + rng.int(5, 55);
        if (addedOffset > -5) {
          throw new Error(
            `AU portfolio: ${accountId} R2 addedOffset ${addedOffset} does not ` +
              'land inside the 60-day look-back (must be <= -5).',
          );
        }
      } else {
        addedOffset = rng.pick(safeOffsets);
      }

      let dobOffset: number;
      if (tag === 'R3') {
        const ageYears = rng.int(13, 14);
        const ageDays = rng.int(0, 300);
        dobOffset = addedOffset - (ageYears * 365 + ageDays);
      } else {
        const ageYears = rng.int(19, 70);
        const ageDays = rng.int(0, 300);
        dobOffset = addedOffset - (ageYears * 365 + ageDays);
      }

      auAddedOffsets.push(addedOffset);
      auGenerationCounter += 1;
      const partyId = `party-au-u-${pad(auGenerationCounter, 4)}`;
      const email = `${auFirst.toLowerCase()}.${auLast.toLowerCase()}.u${auGenerationCounter}@example.com`;

      parties.push({
        partyId,
        fullName: `${auFirst} ${auLast}`,
        dateOfBirth: dateOnly(anchor, dobOffset),
        email,
      });
      roles.push({
        accountId,
        partyId,
        role: 'AUTHORIZED_USER',
        addedDate: dateOnly(anchor, addedOffset),
      });
    }

    // 9. openedDate — after every AU addedDate on this account is known.
    const openedOffset =
      auAddedOffsets.length > 0
        ? Math.min(...auAddedOffsets) - rng.int(60, 1_200)
        : -rng.int(400, 2_600);
    const openedDate = dateOnly(anchor, openedOffset);

    const primaryPartyId = `party-au-p-${pad(index, 4)}`;
    parties.push({
      partyId: primaryPartyId,
      fullName: `${primaryFirst} ${primaryLast}`,
      dateOfBirth: dateOnly(anchor, primaryDobOffset),
      email: `${primaryFirst.toLowerCase()}.${primaryLast.toLowerCase()}.p${index}@example.com`,
    });
    roles.push({
      accountId,
      partyId: primaryPartyId,
      role: 'PRIMARY',
      addedDate: openedDate,
    });

    accounts.push({
      accountId,
      productType: 'CREDIT_CARD',
      openedDate,
      creditLimit: creditLimitCents / 100,
      currentBalance: currentBalanceCents / 100,
      availableCredit: (creditLimitCents - currentBalanceCents) / 100,
      purchaseApr,
      status: 'ACTIVE',
      securedCard: secured ? true : undefined,
      securityDepositAmount: secured ? securityDepositDollars : undefined,
    });
  }

  return { accounts, parties, roles, payments };
}
