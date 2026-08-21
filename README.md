# Repello

**See your training from every angle.**

Repello is a strength-training and workout-tracking app for intermediate lifters
training 3–6 days a week. It is built around one belief: a lifter should be able
to interrogate every number the app shows them. Readiness, recovery and load
recommendations are all heuristics, and Repello says so — in the UI, next to the
number, in plain language.

Expo · React Native · TypeScript · Expo Router · Supabase · Zustand

---

## Quick start

```bash
npm install
cp .env.example .env      # demo mode is on by default — no backend needed
npx expo start
```

Press `i` for the iOS simulator, `a` for Android, or scan the QR code with Expo
Go. The app opens on 8 weeks of seeded training data. **No Supabase project, no
account, no environment variables required.**

If Expo complains about dependency versions on your SDK, run:

```bash
npx expo install --fix
```

### iOS simulator quick start

Returning to the app in the simulator after a break:

```bash
cd <project-directory>
npm install          # only after a fresh clone or a dependency change
open -a Simulator
npx expo start
```

Press `i` in the Expo terminal to open the app in the booted simulator, or
`shift+i` to choose a different one.

To build and launch straight onto a named device — a native build, which
regenerates `ios/` if it is missing:

```bash
npx expo run:ios --device "iPhone 15"
```

If Metro misbehaves, restart it with a clean cache:

```bash
npx expo start --clear
```

#### When the simulator will not launch the app

Verified on macOS 26 / Xcode 26.4 (2026-07-29). `expo run:ios` can build and
install cleanly and still fail to launch, in three ways that look alike from the
terminal. Work through them in this order.

**1. Something else already holds port 8081.** `expo run:ios` finishes by
opening a dev-client deep link that points at a Metro server it expects to have
started itself. If another Expo instance is already bound to 8081, the CLI skips
starting its own, the link points nowhere reachable, and `simctl openurl` times
out with `NSPOSIXErrorDomain code 60`. Check first:

```bash
lsof -nP -iTCP:8081 -sTCP:LISTEN     # who owns the port
curl -s http://localhost:8081/status # "packager-status:running" if Metro is up
```

If Metro is already running and healthy, keep it and launch against
`localhost` rather than the LAN address the CLI chose.

**2. The device is booted but not finished booting.** `simctl boot` returns
immediately; SpringBoard keeps initialising for another minute or so, and until
it is done, launches hang and the home screen shows grey placeholder icons.
Always wait on `bootstatus` — this is the step most often skipped:

```bash
xcrun simctl bootstatus <udid> -b
```

**3. `CoreSimulatorService` is wedged.** If `simctl launch` and `simctl openurl`
still hang indefinitely on a *freshly created* device, the service itself is
stuck. Killing it is safe — it relaunches on demand — but it shuts down every
running simulator:

```bash
xcrun simctl shutdown all
killall -9 com.apple.CoreSimulator.CoreSimulatorService
```

**The full sequence that works**, once the app has been built at least once:

```bash
# 0. one healthy Metro on 8081 (reuse an existing one rather than fighting it)
npx expo start --dev-client

# 1. clear a wedged service
xcrun simctl shutdown all
killall -9 com.apple.CoreSimulator.CoreSimulatorService

# 2. a known-clean device
UDID=$(xcrun simctl create "Repello-Verify" "iPhone 17 Pro" \
  com.apple.CoreSimulator.SimRuntime.iOS-26-4)

# 3. boot, and WAIT for it
xcrun simctl boot "$UDID"
xcrun simctl bootstatus "$UDID" -b
open -a Simulator --args -CurrentDeviceUDID "$UDID"

# 4. install the build product, then launch
# The Repello app/path names below apply only after a fresh Expo prebuild. The
# ignored local ios/PRism.xcodeproj may still emit PRism.app; that stale local
# native project is not evidence of the EAS artifact. Do not use it to validate
# the shipped display name.
xcrun simctl install "$UDID" \
  ~/Library/Developer/Xcode/DerivedData/Repello-*/Build/Products/Debug-iphonesimulator/Repello.app
xcrun simctl launch "$UDID" app.prism.trainer   # returns a PID when it works
```

Useful afterwards — both read the device framebuffer directly, so they work
regardless of which window is in front:

```bash
xcrun simctl io "$UDID" screenshot shot.png
xcrun simctl openurl "$UDID" "prism:///insights"   # deep-link a route
```

A deep link sent while the app is already frontmost raises an
"Open in Repello?" confirmation. Terminate the app first and the cold start skips
it. Clean up a throwaway device with `xcrun simctl delete "$UDID"`.

### Other commands

| Command | What it does |
| --- | --- |
| `npm start` | Expo dev server |
| `npm test` | Unit suite — hermetic, runs on any Node version |
| `npm run test:integration` | Integration lane — needs a real Supabase project (see Testing) |
| `npm run typecheck` | `tsc --noEmit` across the whole project |

---

## Environment variables

All variables are prefixed `EXPO_PUBLIC_` so they are inlined into the client
bundle. Never put a service-role key here — everything below is safe for a
client because Postgres row-level security does the actual enforcing.

| Variable | Required | Default | Purpose |
| --- | --- | --- | --- |
| `EXPO_PUBLIC_DEMO_MODE` | no | `true` | `true` runs entirely on local seeded data. Set to `false` to use Supabase. |
| `EXPO_PUBLIC_SUPABASE_URL` | only when demo mode is off | — | Project Settings → Data API → Project URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | only when demo mode is off | — | Project Settings → API Keys → anon / publishable key |

Demo mode is not a mock layer bolted on the side. It is a full implementation of
the same `Repository` interface Supabase uses, so every screen behaves
identically against either backend.

---

## Connecting Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Run every migration in `supabase/migrations/`, **in numeric order**, one at a
   time in the SQL Editor — `0001_init.sql` through `0008_local_training_day.sql`.
   Applying them to a hosted project is a manual step, so each file is written to
   be re-runnable: if you lose track of which ones have run, running one again is
   a no-op rather than an error. Between them they create all 11 tables, the
   enums, the indexes, the `handle_new_user` trigger, every row-level-security
   policy, the workout/check-in/deletion RPCs, and the shared movement catalogue.
3. Do **not** hand-seed the exercise library. `0006_seed_library.sql` seeds the 43
   system movements and both template plans as `profile_id = null` rows, which is
   what makes them world-readable and immutable. Pasting
   `src/data/exerciseLibrary.ts` in as well collides with the
   `exercises_system_name_key` unique index and gets you nothing.
4. Set `EXPO_PUBLIC_DEMO_MODE=false` and fill in the two Supabase variables.
5. Restart the dev server (env changes need a fresh bundle).

### The security model in one paragraph

Every user-owned row carries `profile_id`, so most policies are a single
`profile_id = auth.uid()` check. Child tables that have no `profile_id` of their
own — `workout_exercises`, `sets`, `routine_days`, `routine_exercises` — are
guarded by an `EXISTS` walk up to their owning parent, and the indexes in the
migration keep those walks index-only. `profiles.id` references `auth.users(id)`
with `on delete cascade`, which is what makes "delete all my data" a single row
delete.

---

## Project structure

```
prism/
├── app/                          # Expo Router — file-based routes only
│   ├── _layout.tsx               # Root stack, data bootstrap, theming
│   ├── (tabs)/
│   │   ├── _layout.tsx           # Tab bar (icons + visible labels)
│   │   ├── index.tsx             # Today
│   │   ├── progress.tsx          # Progress
│   │   ├── body.tsx              # Body / recovery
│   │   ├── insights.tsx          # Insights
│   │   └── plans.tsx             # Plans
│   └── workout/
│       ├── active.tsx            # Workout logger
│       ├── picker.tsx            # Exercise picker (modal)
│       └── summary.tsx           # Post-session summary + reflection
│
├── src/
│   ├── theme/                    # Design tokens. The only source of colour,
│   │   ├── tokens.ts             # type, spacing, radius and elevation.
│   │   ├── typography.ts
│   │   └── index.ts
│   │
│   ├── components/
│   │   ├── ui/                   # Primitives: Text, Card, Button, Chip,
│   │   │                         # Screen, SectionHeader, StatBlock,
│   │   │                         # ReadinessRing, ConsistencyStrip,
│   │   │                         # LinearSpectrum, Stepper, PhasePanel
│   │   ├── today/                # ReadinessCard, SessionCard, WeekCard
│   │   └── workout/              # ExerciseBlock, SetRow, RpeSelector,
│   │                             # RestTimerBar
│   │
│   ├── domain/                   # Pure logic. No React, no I/O, no platform.
│   │   ├── types.ts              # Every entity, mirroring the SQL schema
│   │   ├── muscles.ts            # Muscle metadata + recovery baselines
│   │   ├── schedule.ts           # Which session is on today
│   │   └── calc/
│   │       ├── oneRepMax.ts      # Epley, with a rep cap
│   │       ├── volume.ts         # Volume + muscle distribution
│   │       ├── prs.ts            # PR detection, e1RM series
│   │       ├── recovery.ts       # Per-muscle recovery estimate
│   │       ├── readiness.ts      # Composite readiness score
│   │       ├── loadRecommendation.ts  # Next-load rules
│   │       └── __tests__/        # Jest suite
│   │
│   ├── data/
│   │   ├── exerciseLibrary.ts    # 43 original exercises with coaching cues
│   │   ├── routineTemplates.ts   # "Spectrum 4" and "Repello 3" display names
│   │   ├── demoSeed.ts           # Deterministic 8-week generator
│   │   ├── repository.ts         # Repository interface + both backends
│   │   └── supabase/
│   │       ├── client.ts         # Lazy client, AsyncStorage session
│   │       └── mappers.ts        # snake_case ⇄ camelCase, in one place
│   │
│   ├── store/
│   │   ├── trainingStore.ts      # Persisted data (read model)
│   │   └── activeWorkoutStore.ts # The in-progress session (ephemeral)
│   │
│   └── utils/                    # format.ts, id.ts
│
└── supabase/
    ├── migrations/               # 0001_init … 0007, applied in numeric order
    └── tests/rls/                # run.sh — RLS, write-integrity and seed suites
```

**The one rule:** `src/domain` never imports from `src/components`, `app/`, or
`src/data`. Logic flows one way. That is what makes the calculation engine
testable in isolation and portable to a server later.

---

## How the numbers work

Every formula below is implemented in `src/domain/calc`, unit-tested, and
surfaced in the UI with its reasoning attached.

### Estimated 1RM — Epley

```
e1RM = weight × (1 + reps / 30)
```

Reps are **capped at 12** before the formula runs. Epley degrades badly past
about a dozen reps, and without a cap a 20-rep back-off set would report a
higher "max" than a heavy triple. A set above the cap can still set a weight PR;
it just cannot claim a strength PR on an extrapolated number.

### Training volume

```
volume = Σ (weight × reps)   over completed working sets
```

Warm-ups are excluded. Counting them would inflate volume for anyone who ramps
properly and reward those who don't, making the workload and consistency charts
meaningless. Drop sets, back-offs and to-failure sets do count.

### Muscle distribution

A set is credited **100%** to each primary mover and **40%** to each synergist.
So a bench press set adds full volume to chest and 40% to triceps and front
delts. Displayed as *effective sets*, which is why the numbers have decimals.

### PR detection

Two records per exercise, tracked separately because they answer different
questions:

- **`e1rm`** — best estimated one-rep max, across any rep range
- **`weight`** — heaviest weight actually completed for at least one rep

A lifter can hit a weight PR on a grindy single while e1RM stays flat, or push
e1RM up on a clean set of 8 without touching a heavy single. Both are real.
Records are flagged live in the logger the moment a set is marked complete, with
the running best updating within the session.

### Recovery estimate — *clearly labelled as an estimate*

```
window    = baseRecoveryHours × clamp(effectiveSets / 6, 0.55, 1.6)
readiness = 1 − (1 − clamp(hoursSince / window, 0, 1))^1.7
```

Each muscle has a baseline window (quads 72h, calves 40h, and so on). The window
stretches with how hard the muscle was hit: three sets recover faster than
twelve. The exponent eases the curve so the first hours after a session buy back
more than the last.

**What this model does not know:** sleep, nutrition, stress, age, training age,
or how the set actually felt. It is a prompt to check in with your own body, not
a verdict. Every screen that renders it carries `RECOVERY_MODEL_EXPLANATION`
verbatim.

### Readiness score — *also an estimate*

A 0–100 composite of four weighted factors:

| Factor | Weight | Input |
| --- | --- | --- |
| Muscle recovery | 40% | Estimated readiness of the muscles today's session targets |
| Training load | 25% | Acute:chronic ratio — last 7 days vs. the 28-day weekly average |
| Check-in | 25% | Latest morning check-in; decays to neutral after 36h |
| Consistency | 10% | Sessions completed this week against the user's own target |

The acute:chronic sweet spot is 0.8–1.3. Both under- and over-shooting pull the
score down. Each factor carries its own plain-language explanation, and the
Today screen shows all four on tap — a score you cannot interrogate is a score
you will eventually stop trusting.

### Next-load recommendation

Looks at the last **2–3 comparable sessions** for the exercise and compares
their *top working set* (highest e1RM), which is the set that actually
determines whether load should move. Rules fire in priority order:

| Rule | Trigger | Action |
| --- | --- | --- |
| **Deload** | avg top-set RPE ≥ 9.3, or reps missed in 2 of the last 3 | −7% |
| **Hold** | avg RPE 8.5–9.3, or last session missed target reps | same load |
| **Increase** | avg RPE ≤ 7.5 with reps met | +5% compound / +4% isolation |
| **Increase** | avg RPE 7.5–8.5 with reps met | +2.5% compound / +2% isolation |
| **Establish** | no history | no number invented — asks for a first set |

The result is rounded to an increment you can actually load (2.5 kg / 5 lb for a
barbell, 2 kg for dumbbells), and rounding is never allowed to silently cancel
the decision. Every rule that fires appends a sentence to `rationale`, shown
verbatim in the logger.

---

## Design system

Dark, near-black, editorial. The whole visual language derives from one idea:
white light entering a prism and separating into a spectrum.

**Colour** — canvas `#07070B`, surfaces stepping up through `#0B0B12` →
`#10101A` → `#16161F`. Accents are electric violet `#7A3BFF`, cyan `#16C4DE`,
and a restrained coral `#F2604E` used only for attention, never decoration. The
spectral gradient (violet → cyan) appears as a 2px card edge, a ring stroke, or
a progress fill — never as a large filled area.

**Type** — two voices in tension. Display and numeric are tight, heavy and
negatively tracked; numbers are the hero. Eyebrows are small, wide-tracked and
uppercase, acting as an editorial rule. Ships on the platform UI font so the app
runs offline with no font-loading flash; swapping in a display face is a one-line
change in `typography.ts`.

**Space** — 4pt base, non-linear at the top end (`32 / 44 / 64`) for editorial
breathing room. Radii run `6 / 10 / 16 / 22 / 30`; on a black canvas the corner
radius does more work than a border.

### Accessibility

- **Contrast** — primary text on canvas is 18.7:1, secondary 7.4:1, tertiary 4.6:1
- **Touch targets** — every interactive element is ≥ 44pt, enforced in the
  primitives; visually small controls (chips, nudge arrows) get `hitSlop` to reach it
- **Labels** — no icon ships without an `accessibilityLabel`. Tab bar items have
  visible text labels, not just glyphs. Set rows announce as
  *"Set 2 weight in kg, 100"*; the readiness ring announces as a `progressbar`
  with a value
- **Font scaling** — respected up to 1.6× via `maxFontSizeMultiplier`, which
  stops runaway scaling from collapsing the set/rep grid
- **State** — `accessibilityState` on every toggle, checkbox and expandable

---

## Phased plan

| Phase | Scope | Status |
| --- | --- | --- |
| **1** | Foundation, design system, calc engine, schema + RLS, 8-week seed, **Today**, **Workout logger**, **Exercise picker**, **Workout summary** | ✅ shipped |
| **2** | Progress charts: interactive e1RM and volume charts, full PR history, exercise detail | next |
| **3** | Body map: original SVG muscle illustration, tap-through per region, imbalance flags | planned |
| **4** | Insights engine: ranked dismissible recommendations, stall detection, deload prompts | planned |
| **5** | Plans: custom plan editor, calendar, template cloning, exercise swaps | planned |
| **6** | Onboarding flow, Settings, Supabase auth screens, data export/delete, notifications | planned |

Tabs for phases 2–5 are **not empty placeholders**. Each one ships the real
numbers its underlying calculations already produce — Progress shows key-lift
e1RM trends, Body shows the full per-muscle recovery table, Insights derives
three live highlights, Plans renders the real template structure — plus a
`PhasePanel` stating exactly what is coming and what already exists beneath it.

---

## Testing

Two lanes, with different contracts.

```bash
npm test                  # unit: hermetic, no network, no database
npm run test:integration  # integration: real Supabase project
```

**The unit lane must pass on any Node version.** It touches no network, no
database, and no runtime networking features. That last point is not
hypothetical: `createClient()` resolves a WebSocket at construction time, so a
suite that builds a Supabase client fails outright on a Node runtime without a
global `WebSocket` (Node < 22) while passing on a newer one. Tests that need a
client therefore inject a stub transport —
`src/data/supabase/__tests__/support/realtimeTransport.ts`, which explains the
reasoning and **throws if anything actually tries to use it**, so realtime
coverage cannot creep into this lane unnoticed.

**The integration lane is where real infrastructure goes.** Files named
`*.integration.test.ts` are excluded from `npm test`. They skip unless
`PRISM_INTEGRATION_SUPABASE_URL` and `PRISM_INTEGRATION_SUPABASE_ANON_KEY` are
set — deliberately not the `EXPO_PUBLIC_*` names, so app config can never point
a test run at your own project. Use a disposable account; never a real user's
credentials and never a service-role key (`Docs/invariants.md` I-4, I-5).

The suite covers the calculation engine end to end: Epley including the rep cap
and inversion, volume with warm-up exclusion, PR detection across both record
types, recovery monotonicity and clamping, all five load-recommendation branches
including the rounding-cancellation guard, readiness bounds and weight sums, and
the determinism and shape of the 8-week seed generator.

---

## Originality

Repello's design system, copy, exercise library, coaching cues, template plans
("Spectrum 4", "Repello 3"), calculation model, recovery heuristic, readiness
composite, and every component in `src/components` were written from scratch for
this project. No UI, copy, assets, layout, ranking system or proprietary content
was taken from any existing tracking app.

The formulas that are genuinely public domain — Epley's 1RM estimate, volume as
weight × reps, and the acute:chronic workload ratio — are standard strength-training
mathematics, cited as such above.
