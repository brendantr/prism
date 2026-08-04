import {
  DEEPER_SECTION,
  DEEPER_SURFACES,
  TILE_CAPTION_MAX_LINE_CHARS,
  TILE_CAPTION_MAX_LINES,
  tileIcon,
} from '../deeperSurfaces';

/**
 * How a tile lays a caption out: greedy word wrap at a fixed line width, which
 * is what `numberOfLines={2}` then truncates.
 *
 * This models the packing rather than the total length because the first
 * version of this test asserted a character budget, passed, and shipped a
 * caption that still clipped on an iPhone SE ("Sessions you finished" — 21
 * characters, inside the budget, wrapped to "Sessions / you finis…").
 */
function wrapLines(text: string, maxChars: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(' ')) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length <= maxChars) line = candidate;
    else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Content-invariant tests, not rendering tests -- this repo has no
 * component-test tooling (`Docs/sprints/2026-08-01-onboarding-ui-redesign.md`
 * Decision 6, unchanged since).
 *
 * What is worth pinning here is the property the module exists for: Today and
 * Insights cannot drift back apart. If a future edit renames a surface on one
 * screen, adds a fourth destination without a short caption, or writes a tile
 * caption long enough to clip on an iPhone SE, these fail.
 */
describe('deeper surfaces', () => {
  it('lists the three out-of-tab-bar screens in narrative order', () => {
    expect(DEEPER_SURFACES.map((s) => s.key)).toEqual(['history', 'progress', 'body']);
  });

  it('gives every surface both a tile caption and a row subtitle', () => {
    for (const surface of DEEPER_SURFACES) {
      expect(surface.tileCaption.length).toBeGreaterThan(0);
      expect(surface.rowSubtitle.length).toBeGreaterThan(0);
    }
  });

  it('keeps every tile caption inside the two lines a tile actually shows', () => {
    // Collected rather than asserted one by one so a failure names the caption.
    const overflowing = DEEPER_SURFACES.filter(
      (s) => wrapLines(s.tileCaption, TILE_CAPTION_MAX_LINE_CHARS).length > TILE_CAPTION_MAX_LINES,
    ).map((s) => s.tileCaption);

    expect(overflowing).toEqual([]);
  });

  it('would have caught the caption that clipped on an iPhone SE', () => {
    // Guards the guard: the earlier character-budget version of this test
    // passed "Sessions you finished" and it clipped on device anyway.
    expect(wrapLines('Sessions you finished', TILE_CAPTION_MAX_LINE_CHARS)).toEqual([
      'Sessions',
      'you',
      'finished',
    ]);
  });

  it('has no tile-caption word too long for a single line', () => {
    // A word wider than the tile clips on its own, however few words there are.
    for (const surface of DEEPER_SURFACES) {
      for (const word of surface.tileCaption.split(' ')) {
        expect(word.length).toBeLessThanOrEqual(TILE_CAPTION_MAX_LINE_CHARS);
      }
    }
  });

  it('says more in the row than in the tile, never less', () => {
    // The row has the whole screen width; a row subtitle no longer than the
    // tile caption means the extra space is being wasted.
    for (const surface of DEEPER_SURFACES) {
      expect(surface.rowSubtitle.length).toBeGreaterThan(surface.tileCaption.length);
    }
  });

  it('routes each surface somewhere different', () => {
    const routes = DEEPER_SURFACES.map((s) => s.route);
    expect(new Set(routes).size).toBe(routes.length);
  });

  it('names each surface once', () => {
    const labels = DEEPER_SURFACES.map((s) => s.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it('derives the tile glyph from the row glyph, so the two cannot diverge', () => {
    for (const surface of DEEPER_SURFACES) {
      expect(tileIcon(surface)).toBe(`${surface.icon}-outline`);
    }
  });

  it('carries one heading for both screens', () => {
    expect(DEEPER_SECTION).toEqual({ eyebrow: 'More detail', title: 'Go deeper' });
  });
});
