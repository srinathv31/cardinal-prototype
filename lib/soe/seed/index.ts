// Composition root for the deterministic seed. buildSeedDb(anchor) assembles
// the full cast (brief §6): Marcus Webb (Beat 2), Elena Ruiz (Beat 3), the
// Patel household (Beat 4), and six background accounts (Beat 5). Consumed
// only by the adapter in lib/soe — nothing else imports from here.

import { buildAuPortfolio, type AuPortfolio } from './au-portfolio';
import { buildBackground } from './background';
import { buildCardActivations } from './card-activation';
import { buildElena } from './elena';
import { buildMarcus } from './marcus';
import { buildPatel } from './patel';
import type {
  Account,
  AccountPartyRole,
  BalanceTransferEvent,
  CardActivation,
  Party,
  Payment,
  StreamEvent,
  Transaction,
} from '../types';

export { getAnchor } from './anchor';

export interface SeedDb {
  parties: Party[];
  accounts: Account[];
  accountPartyRoles: AccountPartyRole[];
  transactions: Transaction[];
  payments: Payment[];
  balanceTransferEvents: BalanceTransferEvent[];
  streamEvents: StreamEvent[];
  /** v3 "AU policy" addition (brief §5d) — an additive collection, NEVER
   * merged into the arrays above, so v1's nine-account arithmetic and its
   * pinned tests stay frozen (docs/v3-migration-map.md §3). Consumed only
   * through lib/soe/adapter.ts's getAuPortfolio / getAuScanPortfolio. */
  auPortfolio: AuPortfolio;
  /** v3 "card-activation policy" addition (DEMO_THESIS.md Use case 3;
   * DEMO_BUILD_PLAN.md "Card-activation domain") — an additive collection,
   * NEVER merged into the arrays above. Consumed only through
   * lib/soe/adapter.ts's getCardActivations / getCardActivationScan. */
  cardActivations: CardActivation[];
}

export function buildSeedDb(anchor: Date): SeedDb {
  const marcus = buildMarcus(anchor);
  const elena = buildElena(anchor);
  const patel = buildPatel(anchor);
  const background = buildBackground(anchor);
  const auPortfolio = buildAuPortfolio(anchor);
  const cardActivations = buildCardActivations(anchor, auPortfolio);

  return {
    parties: [
      marcus.party,
      elena.party,
      ...patel.parties,
      ...background.parties,
    ],
    accounts: [
      marcus.account,
      elena.account,
      patel.account,
      ...background.accounts,
    ],
    accountPartyRoles: [
      marcus.role,
      elena.role,
      ...patel.roles,
      ...background.roles,
    ],
    transactions: [
      ...marcus.transactions,
      ...patel.transactions,
      ...background.transactions,
    ],
    payments: [...marcus.payments, ...elena.payments, ...patel.payments],
    balanceTransferEvents: [
      ...elena.btEvents,
      ...background.btEvents,
    ],
    streamEvents: [
      ...marcus.streamEvents,
      ...elena.streamEvents,
      ...patel.streamEvents,
      ...background.streamEvents,
    ],
    auPortfolio,
    cardActivations,
  };
}
