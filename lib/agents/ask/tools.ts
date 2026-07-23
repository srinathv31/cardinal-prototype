// Ask tool surface (brief §3 Beat 5, §5c). renderEvidence is the ONLY tool
// this agent has — Ask is read-only, so there is no action tool and no
// toolApproval config (lib/agents/ask/agent.ts). Every number it returns
// originates in lib/soe (§5a).

import { tool } from 'ai';
import { evidenceSpecSchema } from '@/lib/registry/evidence';
import { resolveEvidence } from './resolvers';

export const renderEvidence = tool({
  description:
    'Render one piece of evidence on screen from live portfolio data. Call ' +
    'this for every fact you want the user to see — category spend, BT ' +
    'expirations, transaction lists, portfolio rollups. Never state a figure ' +
    'in narration without also calling this tool to back it with a rendered ' +
    'component; the output is the only thing that reaches the screen.',
  inputSchema: evidenceSpecSchema,
  execute: async (input) => resolveEvidence(input),
});
