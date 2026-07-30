// Render smoke for the audit-report card (report-card.tsx). Same approach and
// same reasoning as violations-dashboard.test.tsx's header comment: no DOM test
// environment exists and dependencies are frozen, so this renders through
// `react-dom/server` and asserts on markup.
//
// The assertions that matter are about the download affordance being INERT
// markup — a real anchor carrying the href and the `download` attribute — and
// never a fetch or a handler, because that is the property the demo depends on
// when the route behind it is not up yet.

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ReportCard } from './report-card';
import { auReportCardFixture } from '@/lib/sentinel/dashboard-fixture';
import { reportCardPropsSchema } from '@/lib/sentinel/registry';

const fixture = auReportCardFixture;
const markup = renderToStaticMarkup(<ReportCard {...fixture} />);

describe('ReportCard', () => {
  it('the checked-in fixture satisfies the registered props schema', () => {
    expect(() => reportCardPropsSchema.parse(fixture)).not.toThrow();
  });

  it('renders the filename, the generated-at stamp, and the summary sentence', () => {
    expect(markup).toContain(fixture.filename);
    expect(markup).toContain(fixture.generatedAt);
    expect(markup).toContain(fixture.summary);
  });

  it('renders the download as an anchor carrying the href and the download attribute', () => {
    expect(markup).toContain(`href="${fixture.href}"`);
    // The suggested filename is the same string shown on the card.
    expect(markup).toContain(`download="${fixture.filename}"`);
    expect(markup).toMatch(/<a[^>]*href="\/api\/report\?policy=authorized-user"/);
  });

  it('renders a preformatted timestamp, never an ISO string', () => {
    expect(fixture.generatedAt).not.toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(markup).toContain('Generated');
  });
});
