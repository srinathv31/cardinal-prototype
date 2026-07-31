// The ops agent's DEMO_MODE=scripted state machine (DEMO_BUILD_PLAN.md D2 —
// "No `ANTHROPIC_API_KEY` exists in this environment, so the demo default is
// the existing `DEMO_MODE=scripted` seam. Every rehearsed beat gets a
// checked-in script — non-negotiable"). Same mechanism as
// lib/agents/ask/script.ts and lib/agents/servicing/script.ts: keyword
// matching against the rehearsed turns, step index derived by counting the
// tool results already in the prompt, and every figure in every sentence
// re-read from this agent's own resolvers (./resolvers) — the same functions
// the tools call — so narration is always byte-identical to what is on screen.
// Must NOT import ./agent (cycle risk: getAgentModel takes a script, and
// agent.ts's `model:` line calls getAgentModel).
//
// The full DEMO_THESIS.md use-case-1 conversation, in two user turns:
//
//   Turn A — the upload
//     1. parsePolicyDocument         → RuleDiff: 3 drafted rules + 1 data gap
//     2. narrate the rules, ask "Can I add these rules?" + saveRules  ← GATE 1
//     3. close, truthfully, on either disposition
//
//   Turn B — the sweep
//     4. queryViolations             → ViolationsDashboard
//     5. THE UNPROMPTED BEAT: with no further prompt, volunteer the
//        remediation recommendation, citing R1 by its stored title and its
//        real count, and open GATE 2 in the same turn (executeBatchRemoval)
//     6. on approval, generateReport → ReportCard; on decline, execute
//        nothing and say so
//     7. close
//
// DEMO_THESIS.md use case 3's ops side is the SAME two turns against a
// different uploaded document ("same practice as use case 1"), and this script
// plays it with the same steps rather than a parallel state machine: turn A is
// policy-agnostic already (every string it says comes off the parse result),
// and turn B forks exactly once — at the action the swept policy calls for.
// Card activation's is `queueActivationOutreach`, and it has no report to
// follow, so its turn closes one step earlier. Which policy is in play is read
// from the resolvers, never matched out of the user's words: the document the
// presenter uploaded decided it (./resolvers.ts's header).
//
// All three gates close truthfully when declined (`toolDisposition`, verified
// shape per docs/ai-sdk7-notes.md: a declined client-executed tool arrives as a
// normal tool-result whose `output.type` is `'execution-denied'`).

import type { AgentScript, ScriptStep } from '@/lib/ai/scripted/types';
import {
  countToolResults,
  lastUserMessageText,
  toolDisposition,
  toolResultsSinceLastUserMessage,
} from '@/lib/ai/scripted/types';
import {
  buildAuditReport,
  parsePolicyDocument,
  planActivationOutreach,
  policyScanUnit,
  resolveViolations,
  storedRequirement,
  type ParsedPolicyDocument,
} from './resolvers';

type OpsMatch = 'upload' | 'violations' | 'none';

/** Keyword match against the two rehearsed turns, in a deliberate specificity
 * order: the upload turn is recognized first because "policy" appears in the
 * sweep question too. Mirrors matchAskQuestion / matchServicingQuestion. */
function matchOpsRequest(text: string): OpsMatch {
  const q = text.toLowerCase();
  if (
    q.includes('upload') ||
    q.includes('attach') ||
    /\.(docx?|pdf|md|txt)\b/.test(q) ||
    (q.includes('policy') && q.includes('document')) ||
    (q.includes('parse') && q.includes('polic'))
  ) {
    return 'upload';
  }
  if (
    q.includes('fail') ||
    q.includes('violat') ||
    q.includes('exception') ||
    q.includes('breach') ||
    q.includes('non-compliant') ||
    q.includes('out of compliance') ||
    q.includes('sweep') ||
    q.includes('scan') ||
    // Use case 3's own phrasing and the suggestion chip that carries it
    // ("Run the card-activation policy against the book"). Reached only after
    // the upload branch above has had its chance, so the card-activation
    // UPLOAD turn — which also says "card activation" — still parses.
    q.includes('against the book') ||
    (q.includes('card') && q.includes('activation'))
  ) {
    return 'violations';
  }
  return 'none';
}

/** Deliberately excludes spaces: allowing them makes the match greedy
 * leftwards and swallows the sentence in front of the file name ("Uploaded
 * policy.docx" → "Uploaded policy.docx"). A name that genuinely contains a
 * space records its last token instead, which is a cosmetic loss on an
 * audit-trail field and never affects what gets parsed. */
const FILENAME_PATTERN = /[\w][\w.-]*\.(?:docx?|pdf|md|txt)\b/i;

/** The uploaded file's name as the user's own message reported it — a pure
 * function of that text, never invented. Recorded on the tool call for the
 * audit trail, and used to pick which checked-in document is parsed; the parse
 * reads that document's own content either way (DEMO_BUILD_PLAN.md: "The
 * *file* is real; the *content* is pinned"). Undefined when the message names
 * no file at all, which is the case the caller resolves against the whole
 * sentence instead. */
function extractDocumentRef(text: string): string | undefined {
  const match = FILENAME_PATTERN.exec(text);
  return match ? match[0].trim() : undefined;
}

const CANT_HELP_NARRATION =
  'I work servicing policy here — authorized-user eligibility and card activation: upload a policy document and I will extract the rules for your approval, then sweep the book for accounts that fail them and recommend what to do about it. Start by uploading the policy.';

/** The drafted rules and the parked obligation, read off the SAME render
 * instruction the parsePolicyDocument tool returns — so every rule this
 * narration names is a rule the audience can see on the card. */
function parsedRuleSummary(parsed: ParsedPolicyDocument): {
  titles: string[];
  gapTitle: string | undefined;
  gapNote: string | undefined;
} {
  if (parsed.render.component !== 'RuleDiff') {
    throw new Error('ops script: unexpected evidence shape while reading the parsed rules');
  }
  const rows = parsed.render.props.rules;
  const evaluable = rows.filter((rule) => rule.evaluability !== 'data-gap');
  const gap = rows.find((rule) => rule.evaluability === 'data-gap');
  return {
    titles: evaluable.map((rule) => rule.title),
    gapTitle: gap?.title,
    gapNote: gap?.criticNote,
  };
}

export const opsScript: AgentScript = {
  agentId: 'ops',

  async nextStep(prompt): Promise<ScriptStep> {
    const results = toolResultsSinceLastUserMessage(prompt);
    const requestText = lastUserMessageText(prompt) ?? '';
    const match = matchOpsRequest(requestText);

    // ————————————————————————————————————————————————————————————————
    // Turn A — upload → parse → Gate 1
    // ————————————————————————————————————————————————————————————————
    if (match === 'upload') {
      // The file name selects the document when the message names one; with no
      // file name, the sentence itself is handed to the same keyword match, so
      // "parse this card-activation policy document" still resolves without an
      // attachment. Either way the resolver picks a CHECKED-IN document — this
      // text never becomes on-screen data.
      const fileName = extractDocumentRef(requestText);
      const parsed = parsePolicyDocument(fileName ?? requestText);

      if (countToolResults(results, 'parsePolicyDocument') === 0) {
        return {
          narration: 'Reading the document you uploaded and pulling out the rules it defines.',
          toolCalls: [
            {
              toolName: 'parsePolicyDocument',
              input: { documentRef: fileName ?? `${parsed.documentId}.docx` },
            },
          ],
          done: false,
        };
      }

      if (countToolResults(results, 'saveRules') === 0) {
        const { titles, gapTitle, gapNote } = parsedRuleSummary(parsed);
        const gapSentence =
          gapTitle && gapNote
            ? ` One more obligation — ${gapTitle} — I have left undrafted: ${gapNote}`
            : '';
        return {
          narration:
            `That is the ${parsed.documentTitle}. I extracted ${titles.length} rules I can evaluate against the book, each cited to the section it came from: ${titles.join('; ')}.` +
            `${gapSentence} Can I add these ${titles.length} rules to the rule store?`,
          toolCalls: [
            {
              toolName: 'saveRules',
              input: {
                ruleIds: parsed.ruleIds,
                rationale: `Adopt the ${parsed.ruleIds.length} evaluable rules extracted from the ${parsed.documentTitle} so the book can be swept against them.`,
              },
            },
          ],
          done: false,
        };
      }

      const disposition = toolDisposition(results, 'saveRules');
      return {
        narration:
          disposition === 'approved'
            ? `Stored — ${parsed.ruleIds.join(', ')} are now active in the ${parsed.policyId} rule store. Ask me which accounts fail them whenever you are ready.`
            : `Understood — no rules were added. The ${parsed.policyId} rule store is unchanged, so there is nothing to evaluate against yet.`,
        toolCalls: [],
        done: true,
      };
    }

    // ————————————————————————————————————————————————————————————————
    // Turn B — sweep → the unprompted recommendation → Gate 2 → report
    // ————————————————————————————————————————————————————————————————
    if (match === 'violations') {
      if (countToolResults(results, 'queryViolations') === 0) {
        return {
          narration: 'Running the approved authorized-user rules across the whole book.',
          toolCalls: [{ toolName: 'queryViolations', input: {} }],
          done: false,
        };
      }

      // Fresh, independent read of the same resolver the tool called, so every
      // figure below is the evaluator's own (CLAUDE.md 5a).
      const violations = await resolveViolations();
      if (violations.status !== 'ok') {
        return { narration: violations.message, toolCalls: [], done: true };
      }

      const { exceptions, accountsAffected, scanned, byRule, policyId } = violations;
      // The largest rule group by the evaluator's count — cited by its STORED
      // title, i.e. the title the human approved at Gate 1.
      const leadRule = byRule.reduce((max, rule) => (rule.count > max.count ? rule : max), byRule[0]);
      const leadRequirement = storedRequirement(leadRule.ruleId, policyId);
      // "N of them break <stored title> — "<stored requirement>" — the single
      // largest group." Shared by both policies: the sentence names the rule
      // the evaluator itself put on top, never one chosen here.
      const leadSentence = leadRequirement
        ? `${leadRule.count} of them break ${leadRule.title} — "${leadRequirement}" — the single largest group. `
        : `${leadRule.count} of them break ${leadRule.title}, the single largest group. `;
      // "962 authorized-user relationships swept" / "214 issued cards swept" —
      // the unit is the policy's, from the resolvers (CLAUDE.md 5a).
      const sweptSentence = `${scanned} ${policyScanUnit(policyId)} swept: ${exceptions} exceptions across ${accountsAffected} accounts. `;

      // ——— Card activation: outreach, and no report ————————————————
      if (policyId === 'card-activation') {
        if (countToolResults(results, 'queueActivationOutreach') === 0) {
          // The same unprompted beat as the AU turn below, pointed at the
          // action this policy's own text prescribes ("flagged for cardholder
          // outreach").
          return {
            narration:
              sweptSentence +
              leadSentence +
              `Chasing one of these by hand runs about ten minutes an account. I recommend queueing activation outreach to all ${accountsAffected} primary cardholders in one batch, the ${leadRule.count} ${leadRule.ruleId} cases first. Approve below and I will queue it.`,
            toolCalls: [
              {
                toolName: 'queueActivationOutreach',
                input: {
                  rationale: `Queue activation outreach to the ${accountsAffected} primary cardholders behind the ${exceptions} flagged cards, led by the ${leadRule.count} ${leadRule.ruleId} cases.`,
                },
              },
            ],
            done: false,
          };
        }

        const outreachDisposition = toolDisposition(results, 'queueActivationOutreach');
        if (outreachDisposition !== 'approved') {
          return {
            narration: `Understood — no outreach was queued. All ${exceptions} flagged cards across ${accountsAffected} accounts stay out of compliance, and the rule store is unchanged.`,
            toolCalls: [],
            done: true,
          };
        }

        // Fresh, independent read of the batch the tool just executed — the
        // figures below are the resolver's, not this script's.
        const outreach = await planActivationOutreach();
        return {
          narration: `Outreach queued to ${outreach.queued} primary cardholders, recorded under ${outreach.confirmationId}. Every one of the ${outreach.exceptions} flagged cards stays on the exception list until it is activated or reissued.`,
          toolCalls: [],
          done: true,
        };
      }

      if (countToolResults(results, 'executeBatchRemoval') === 0) {
        // THE UNPROMPTED BEAT (DEMO_THESIS.md use case 1 beat 6): no user
        // prompt precedes this — the agent volunteers the recommendation off
        // the aggregate it just rendered, and opens Gate 2 in the same turn.
        // The rule is named by its STORED title and quoted by its STORED
        // requirement, never by a gloss written here.
        return {
          narration:
            sweptSentence +
            leadSentence +
            // "about ten minutes an account" is DEMO_THESIS.md's stated
            // business constant, spelled out rather than fetched — it is the
            // only figure in this script that does not come from a resolver,
            // and it carries no digits for that reason.
            `Clearing one of these by hand runs about ten minutes an account. I recommend removing all ${exceptions} flagged relationships in one batch, the ${leadRule.count} ${leadRule.ruleId} cases first. Approve below and I will kick it off.`,
          toolCalls: [
            {
              toolName: 'executeBatchRemoval',
              input: {
                rationale: `Remove the ${exceptions} flagged authorized-user relationships across ${accountsAffected} accounts in one batch, led by the ${leadRule.count} ${leadRule.ruleId} cases.`,
              },
            },
          ],
          done: false,
        };
      }

      const removalDisposition = toolDisposition(results, 'executeBatchRemoval');
      if (removalDisposition !== 'approved') {
        // A declined gate executes NOTHING — no removal, and no report of one.
        return {
          narration: `Understood — nothing was removed. All ${exceptions} exceptions across ${accountsAffected} accounts stay flagged, and the rule store is unchanged.`,
          toolCalls: [],
          done: true,
        };
      }

      const report = await buildAuditReport();

      if (countToolResults(results, 'generateReport') === 0) {
        return {
          narration: `Batch removal kicked off — ${exceptions} relationships across ${accountsAffected} accounts, recorded under ${report.confirmationId}. Writing up the audit trail.`,
          toolCalls: [{ toolName: 'generateReport', input: {} }],
          done: false,
        };
      }

      return {
        narration: `The audit report is ready: ${report.filename}. It carries all ${exceptions} exceptions, the rule each one breaks, and the approval that authorized the removal.`,
        toolCalls: [],
        done: true,
      };
    }

    return { narration: CANT_HELP_NARRATION, toolCalls: [], done: true };
  },
};
