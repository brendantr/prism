import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * THE ROADMAP MUST NOT REACH A SHIPPED BUILD
 * ==========================================
 * `PhasePanel` renders a "Coming next / Roadmap" card listing features that do
 * not exist. That is correct during development and is an **App Store rejection
 * under Guideline 2.1 (App Completeness)** in a submitted build — placeholder
 * and "coming soon" content is called out by name in the guideline.
 *
 * Five of the six tabs rendered one before 2026-08-09.
 *
 * This is a source-text test rather than a render test because the repository
 * has no component-render tooling by decision
 * (`Docs/sprints/2026-08-01-onboarding-ui-redesign.md` Decision 6). It is worth
 * having anyway: the failure it guards is silent, ships, and is only caught by
 * a reviewer days later — and re-adding a heading at a call site is exactly the
 * sort of thing a future screen does without thinking about it.
 */

const UI_DIR = path.join(__dirname, '..');
const APP_DIR = path.join(__dirname, '..', '..', '..', '..', 'app');

const read = (p: string) => fs.readFileSync(p, 'utf8');

/** Every `.tsx` under `app/`, which is the entire user-facing route tree. */
function appScreens(dir: string = APP_DIR, acc: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) appScreens(full, acc);
    else if (entry.name.endsWith('.tsx')) acc.push(full);
  }
  return acc;
}

describe('PhasePanel is development-only', () => {
  const source = read(path.join(UI_DIR, 'PhasePanel.tsx'));

  it('returns null when not running under __DEV__', () => {
    // `__DEV__` is false in every EAS build — development, preview and
    // production alike — so this one line is what keeps the roadmap out of
    // anything a tester or a reviewer installs.
    expect(source).toMatch(/if\s*\(\s*!__DEV__\s*\)\s*return null;/);
  });

  it('owns its own "Coming next" heading', () => {
    // The heading lives inside the gated component on purpose. Were it back at
    // the call site, hiding the panel would leave a "Coming next" header above
    // nothing at all -- which reads worse than the roadmap did.
    expect(source).toContain('title="Coming next"');
  });

  it('is the only place in the app that renders a roadmap heading', () => {
    const offenders = appScreens()
      .filter((file) => /title="Coming next"|eyebrow="Roadmap"/.test(read(file)))
      .map((file) => path.relative(APP_DIR, file));

    // A screen that renders this heading itself has re-opened the gap, because
    // its header survives even when the panel returns null.
    expect(offenders).toEqual([]);
  });
});
