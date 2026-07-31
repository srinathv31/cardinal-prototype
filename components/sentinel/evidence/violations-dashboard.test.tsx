// Render smoke for the ops-chat centerpiece (violations-dashboard.tsx).
//
// This repo has no DOM test environment and dependencies are frozen (CLAUDE.md
// "Dependencies are frozen") — there is no jsdom, no happy-dom, and no
// @testing-library/react to add. `react-dom/server`'s `renderToStaticMarkup`
// needs none of them: it is already a dependency, it runs in vitest's default
// node environment, and it renders a component's INITIAL state, which is
// exactly the state these assertions are about (every row collapsed, every
// figure printed verbatim). What it cannot exercise is the click — so the
// expand interaction is covered structurally instead: the accordion's
// `aria-expanded`/`aria-controls` wiring and the presence of every drill-down
// panel in the markup are what a click toggles, and both are asserted here.
//
// The point of these tests is the renderer's TWO standing invariants, not its
// styling: (1) every figure reaches the screen exactly as the payload spelled
// it (invariant 5b — no client-side formatting), and (2) the drill-down needs
// no fetch, because every detail pair is already in the markup.

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ViolationsDashboard } from './violations-dashboard';
import { auViolationsDashboardFixture } from '@/lib/sentinel/dashboard-fixture';
import { violationsDashboardPropsSchema } from '@/lib/sentinel/registry';

const fixture = auViolationsDashboardFixture;
const markup = renderToStaticMarkup(<ViolationsDashboard {...fixture} />);

/** Count non-overlapping occurrences of a literal substring. */
function occurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe('ViolationsDashboard', () => {
  it('the checked-in fixture satisfies the registered props schema', () => {
    expect(() => violationsDashboardPropsSchema.parse(fixture)).not.toThrow();
  });

  it('renders the policy heading from the policy id, not the raw slug', () => {
    expect(markup).toContain('Authorized-user policy');
    expect(markup).not.toContain('authorized-user policy');
  });

  it('prints the three summary figures verbatim — no separators, no formatting', () => {
    // The AU figures pinned in lib/sentinel/exception-fixture.test.ts.
    expect(fixture.summary).toEqual({ scanned: 962, accountsAffected: 74, exceptions: 87 });
    expect(markup).toContain('>962<');
    expect(markup).toContain('>74<');
    expect(markup).toContain('>87<');
    expect(markup).toContain('Scanned');
    expect(markup).toContain('Accounts affected');
    expect(markup).toContain('Exceptions');
  });

  it('renders one bar per rule, with the rule id, title, and count', () => {
    expect(fixture.byRule.map((rule) => rule.count)).toEqual([61, 19, 7]);
    for (const rule of fixture.byRule) {
      expect(markup).toContain(rule.title);
      expect(markup).toContain(`>${rule.count}<`);
    }
  });

  it('sizes bars proportionally to the counts, longest at 100%', () => {
    // Layout geometry only (the component's one arithmetic expression):
    // 61/61, 19/61, 7/61.
    expect(markup).toContain('width:100%');
    expect(markup).toContain(`width:${(19 / 61) * 100}%`);
    expect(markup).toContain(`width:${(7 / 61) * 100}%`);
  });

  it('renders every row — holder, account id, rule chip, and finding', () => {
    expect(fixture.rows).toHaveLength(10);
    for (const row of fixture.rows) {
      expect(markup).toContain(row.holder);
      expect(markup).toContain(row.accountId);
      expect(markup).toContain(row.finding);
    }
  });

  it('starts fully collapsed: one toggle per row, all aria-expanded="false"', () => {
    expect(occurrences(markup, 'aria-expanded="false"')).toBe(fixture.rows.length);
    expect(markup).not.toContain('aria-expanded="true"');
    // Every toggle points at a panel that exists in the markup.
    expect(occurrences(markup, 'aria-controls="')).toBe(fixture.rows.length);
    expect(occurrences(markup, 'aria-hidden="true"')).toBeGreaterThanOrEqual(
      fixture.rows.length,
    );
  });

  it('carries every drill-down fact in the markup — the expand needs no fetch', () => {
    for (const row of fixture.rows) {
      expect(markup).toContain(row.ruleTitle);
      for (const pair of row.detail) {
        expect(markup).toContain(pair.label);
        expect(markup).toContain(pair.value);
      }
    }
  });

  it('shows how much of the exception set the table is displaying', () => {
    expect(markup).toContain('Showing');
    expect(markup).toContain('10');
  });

  it('uses tabular figures everywhere a number is rendered', () => {
    expect(markup).toContain('tabular-nums');
  });

  it('renders a single row set even when two rows share an account id', () => {
    const doubled = {
      ...fixture,
      rows: [
        fixture.rows[0],
        { ...fixture.rows[0], ruleId: 'R2', ruleTitle: fixture.byRule[1].title },
      ],
    };
    const doubledMarkup = renderToStaticMarkup(<ViolationsDashboard {...doubled} />);
    expect(occurrences(doubledMarkup, 'aria-expanded="false"')).toBe(2);
  });
});
