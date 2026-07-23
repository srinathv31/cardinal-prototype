// Composition root for the deterministic seed. buildSeedDb(anchor) assembles
// the full cast (brief §6): Marcus Webb (Beat 2), Elena Ruiz (Beat 3), the
// Patel household (Beat 4), and six background accounts (Beat 5). Consumed
// only by the adapter in lib/soe — nothing else imports from here.

import { buildBackground } from './background';
import { buildElena } from './elena';
import { buildMarcus } from './marcus';
import { buildPatel } from './patel';
import type {
  Account,
  AccountPartyRole,
  BalanceTransferEvent,
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
}

export function buildSeedDb(anchor: Date): SeedDb {
  const marcus = buildMarcus(anchor);
  const elena = buildElena(anchor);
  const patel = buildPatel(anchor);
  const background = buildBackground(anchor);

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
    balanceTransferEvents: [...elena.btEvents, ...background.btEvents],
    streamEvents: [
      ...marcus.streamEvents,
      ...elena.streamEvents,
      ...patel.streamEvents,
      ...background.streamEvents,
    ],
  };
}
