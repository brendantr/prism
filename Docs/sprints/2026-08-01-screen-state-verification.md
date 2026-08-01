# Sprint: screen-state-verification

- **Status:** Complete. Found and fixed one real, previously-undetected defect.
- **Date:** 2026-08-01
- **Branch:** `screen-state-verification` (new branch off `main`)
- **Type:** Device verification, plus one small, directly-caused bug fix. No new UI surface, no
  information-architecture change.
- **Part of:** [`2026-07-31-closure-inventory.md`](../readiness/2026-07-31-closure-inventory.md) items
  B2 and B4.

## Goal

Close two verification gaps `2026-07-30-ui-ux-product-polish.md` left open:

1. **B2** — Plans, Social, Progress, and Body were wired onto `ScreenState` "in the same mechanical
   way" as the four screens that were individually photographed, but were never themselves opened in
   the error state and screenshotted.
2. **B4** — all prior UI verification used one device (iPhone 17 Pro, 402×874pt) at default text size;
   narrow-device widths and large accessibility text sizes were never checked.

## Method

- Device: iPhone 16e simulator (iOS 26.0), already booted with the app installed; Metro already running
  on 8081, so `xcrun simctl launch` served the current source without a native rebuild (no native
  module changed since the last build).
- Onboarding was skipped by writing the exact `AsyncStorage` fixture `onboardingStore.persist()` writes
  (`prism.onboarding.v1`) directly into the app container's `RCTAsyncLocalStorage_V1/manifest.json`,
  the same technique used in `2026-07-29-ui-ux-foundation-verification.md`.
- Taps were driven with `idb` (`idb_companion` + the `idb` Python client, both already present on this
  machine from prior sessions). Tab-bar button frames were read from `idb ui describe-all`'s
  accessibility tree rather than estimated from a screenshot — the first two taps, estimated from a
  scaled-down screenshot render, landed on the wrong targets; reading the real point-coordinate frames
  fixed this and is recorded here so a future session doesn't repeat the estimation error.
- The error state was forced the same way `2026-07-30-ui-ux-product-polish.md` did: a temporary
  `throw` at the top of `trainingStore.refresh()`'s `try` block, reverted at the end of this sprint.
  `grep -rn "TEMP-VERIFY" src/ app/` returns nothing and `git status` confirms no residual change from
  the probe itself.
- Reached Progress and Body (not tab-bar items) via `xcrun simctl openurl "prism:///progress"` /
  `"prism:///body"`, terminating the app first each time so the OS's "Open in PRism?" confirmation
  didn't intercept the deep link.

## B2 results

| Screen | Ready state | Error state |
|---|---|---|
| Plans | Confirmed — "Spectrum 4" template renders in full | Confirmed — own header ("STRUCTURE / Plans"), coral badge, "Could not load this", working "Try again" |
| Social | Confirmed — notice, intent rows, record-card preview render | Confirmed — own header ("NOT CONNECTED YET / Training with others") |
| Body | Confirmed — per-muscle recovery table renders | Confirmed — own header ("ESTIMATE, NOT MEASUREMENT / Body") |
| Progress | Confirmed — key-lift cards render | **Initially broken — see "Defect found and fixed" below. Confirmed after the fix.** |

### Defect found and fixed

**`app/(tabs)/progress.tsx` rendered a bare title over blank space in both the loading and error
states — the exact pre-`ScreenState` regression `Docs/architecture.md`'s original G-5 described,
still present here despite `2026-07-30-ui-ux-product-polish.md` reporting it fixed across all seven
screens.**

Cause: the screen had two guards, in the wrong order.

```tsx
if (!profile || !headline) return <Screen title="Progress" onBack={back} backLabel="Back to Insights" />;
// ...
if (status !== 'ready') {
  return <Screen scroll={false} {...header}><ScreenState phase={status} ... /></Screen>;
}
```

`profile` and `headline` are both `null` for the entire loading/error window (they only populate once
the store reaches `'ready'`), so the first guard fired unconditionally before the `status` check could
ever run — the `ScreenState` branch was unreachable dead code for every non-ready state. This was not
caught by typecheck (both branches are type-correct) or by the existing test suite (no test covers
`app/`). Only opening the actual screen while forcing an error surfaced it. `body.tsx`, `insights.tsx`,
`exercises.tsx`, `social.tsx`, and `plans.tsx` were all checked and do not have this ordering defect —
this was isolated to `progress.tsx`.

**Fix:** moved the `status !== 'ready'` check before the `profile`/`headline` guard, matching the
pattern already used correctly in `insights.tsx` (status check, then a distinct "loaded but nothing to
show" check). No other line changed; the post-fix empty-profile fallback still renders the same bare
`<Screen title="Progress" .../>` it did before — only the ordering relative to `status` changed, so a
genuinely-loaded-but-profile-missing case (which should not occur in practice) still degrades the same
way it always has.

**Re-verified after the fix, same forced-error setup:** Progress now shows its own header ("EVERY
ANGLE / Progress"), the coral cloud-offline badge, "Could not load this", and a working "Try again" —
matching every other screen. Re-verified the ready state is unaffected: key-lift cards render
identically to before the fix.

## B4 results

**Narrow device.** Installed the already-built simulator `.app` bundle (from the iPhone 16e build,
simulator builds are not device-size-specific) onto `iPhone SE (3rd generation)` (iOS 17.4, 375×667pt
— narrower than the iPhone 17 Pro's 402pt used in every prior UI sprint). Seeded the same onboarding
fixture. **The five-tab bar renders with all five labels — TODAY, EXERCISES, INSIGHTS, SOCIAL, PLANS —
fully visible, no truncation, no wrapping, no clipping**, and the Today screen's three-column stat row
(Readiness/Sessions/Volume) also renders without clipping at this width.

**Large accessibility text.** Set `xcrun simctl ui <udid> content_size accessibility-extra-large` (well
above the app's own `maxFontSizeMultiplier` cap of 1.6× on body text) and relaunched. Text reflows and
wraps ("READINESS" → "READINE/SS" on two lines, "4/4 on target" truncates to "4/4 on tar…" with an
ellipsis) rather than clipping off-screen or overlapping other elements. **The tab bar's five labels
stay fully legible and unwrapped even at this size** — confirming the `maxFontSizeMultiplier` cap holds
where it matters most for this layout. Reset to `medium` (default) afterward.

## Validation

| Command | Result |
|---|---|
| `npm run typecheck` | Pass, exit 0 |
| `npm test -- --ci` | Pass — 103/103, 9 suites |
| `grep -rn "TEMP-VERIFY" src/ app/` | No matches — the forced-error probe left no residue |
| `git status --short` | Clean except the one intentional fix to `app/(tabs)/progress.tsx` |

## What remains open

- **A real device was not used** — both checks ran on the iOS Simulator. The README's own accessibility
  claims (contrast ratios, 44pt touch targets) were not re-measured here; this sprint's scope was
  specifically the loading/error state gap and device-width/text-size rendering.
- **Insights' genuine empty state** (loaded, but nothing to derive) is still unreached — it needs a
  profile with no logged history, which the demo seed does not produce. Carried forward unchanged from
  `2026-07-30-ui-ux-product-polish.md`.
- **Android was not part of this sprint's scope** — see the separate
  `2026-08-01-android-themed-icon-reverify` work.
