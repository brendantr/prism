# Sprint: v1 sign-out surface

## 1. Document status

- **Date:** 2026-08-08
- **Branch:** `feature/v1-signout-surface` (commit `0029a7f`), based on `feature/v1-auth-session-docs`
  (`d8c206d`) — **not** on `main`, which contains none of the auth work and where
  `signOutAndTearDown` does not exist. One branch, one purpose, per `Docs/invariants.md` I-14.
- **Owner:** Engineer/owner.
- **Labelling** per I-15: `[fact]` / `[decision]` / `[assumption]` / `[open question]`.
- **Provenance** `[fact]`: `main` remains at `ecfd1f1`. The four commits `5c18d93` → `0af00cd` →
  `d8c206d` → `0029a7f` form an unmerged chain, each based on the one before it.

---

## 2. Scope

Make the sign-out teardown reachable. `signOutAndTearDown` shipped complete, ordered and tested in the
auth sprint (`Docs/sprints/2026-08-06-auth-and-session.md` §8) with nothing calling it — a lifter could
sign in and could not sign out. This sprint adds the affordance and nothing else.

**Deliberately not a settings screen** `[decision]`. The Account sheet has three items: identity, a way
out, and one sentence about what leaving does. A fourth would make it the settings surface this sprint
was scoped to avoid.

**`src/store/authActions.ts` was not modified** `[fact]`. The teardown contract decided in ADR-0004 is
unchanged; only its reachability is new.

---

## 3. Guardrails that shaped the implementation

- **D1 — navigation frozen for v1.** No tab was added. `app/(tabs)/_layout.tsx`'s own comment sets five
  as the ceiling, so a "Profile" tab was never a candidate; the surface went on the root stack, which is
  where D1 says new surfaces go.
- **`Screen.headerRight` already existed and had zero consumers** `[fact]`. Using it meant no new layout
  and no new primitive (UX §5 rule 7). Today's header already renders the lifter's own name, so an
  account control beside it needs no explaining.
- **D2a — the surface appears only where accounts exist.** The control is gated on the same
  `isAuthEnabled()` condition as the auth screen itself, and is **absent rather than disabled**: a
  greyed "Account" implies an account that could have existed. In the misconfigured build it would also
  compete with `SUPABASE_MISCONFIGURED_MESSAGE`, which is what that build actually owes its user
  (`Docs/production-posture-v1.md` §5).
- **D6 — confirmation only when logged work would be lost.** Teardown discards the in-progress draft, so
  sign-out is destructive whenever there is work in it. The sheet warns when any set is completed and
  signs out silently otherwise.
- **I-6 — the client never asserts identity.** `email` was added for display only. No repository
  signature changed, and neither `userId` nor `email` is passed into a query.
- **I-19 — sign-out leaves nothing behind.** The invariant's "not yet enforceable by the user" caveat is
  what this sprint removes; the teardown ordering it records is untouched.
- **No component-test tooling**, by decision (`2026-08-01-onboarding-ui-redesign.md` Decision 6). This
  is why both the visibility rule and the confirmation rule are pure functions rather than logic inside
  the screen.

---

## 4. Implementation summary

**New**

| File | What it does |
|---|---|
| `src/domain/account.ts` | `canOfferSignOut`, `shouldConfirmSignOut`, `countCompletedSets` — pure |
| `src/content/account.ts` | Every string on the surface, per D11 |
| `app/account.tsx` | The modal: identity line, "Sign out" `ListRow`, one explanatory sentence |
| `src/domain/__tests__/account.test.ts`, `src/content/__tests__/accountCopy.test.ts` | See §5 |

**Modified**

| File | Change |
|---|---|
| `app/(tabs)/index.tsx` | `headerRight` control gated by `canOfferSignOut`; `sessionPhase` selector; one style |
| `app/_layout.tsx` | `<Stack.Screen name="account" options={{ presentation: 'modal' }} />` |
| `src/data/supabase/auth.ts` | `SessionUser` gains `email`; propagated through `getCurrentUser`, `signInWithPassword`, `signUpWithPassword` (`SignUpResult.userId` → `user`) and `subscribeToAuthState` |
| `src/store/sessionStore.ts` | `email` in state; `markAuthenticated(user: SessionUser)`; cleared by `markUnauthenticated` and on `SIGNED_OUT` |
| Three existing test files | Extended — see §5 |

### 4.1 Decisions worth recording

**Email propagated through all four auth call sites, not just `getCurrentUser`** `[decision]`. The
narrower change would have meant a session restored from the Keychain has an email while one obtained by
signing in this session does not — the sheet would show identity or not depending on how the lifter
arrived. This is the reason the diff is wider than "add a field", and why `SignUpResult.userId` became
`SignUpResult.user`.

**Warm-ups count as logged work** `[decision]`. `shouldConfirmSignOut` treats a completed warm-up as
something worth confirming the loss of. Warm-ups do not count toward volume, but "counts toward volume"
and "is logged work" are different questions and this is the second one. Pinned by test, because it is
the one case where the two diverge.

**The screen guards its own phase** `[decision]`. `app/account.tsx` pops if the phase stops being
`'authenticated'`. Today's control is already gated, so this covers the narrow case of a token revoked
*while the modal is open*, which would otherwise leave a "Sign out" button over a session that no longer
exists.

**Silent redirect, no success message** `[decision]`, and it required no new code: `markUnauthenticated`
already clears `lastFailure`, while an involuntary `SIGNED_OUT` sets `sessionExpired`, which the auth
screen renders as "You have been signed out." Someone who just tapped Sign out does not need telling;
someone whose token was revoked does.

---

## 5. Testing

`[fact]` **312 tests, 22 suites, all passing** (`npm test`). `npm run typecheck` exits 0.
`npm run test:integration` reports **5 skipped** — unchanged, credential-gated, no credentials created.

| Suite | Covers |
|---|---|
| `src/domain/__tests__/account.test.ts` (new) | `canOfferSignOut` across the full phase × `authEnabled` matrix, including the impossible-but-guarded `authEnabled: false, phase: 'authenticated'`; `shouldConfirmSignOut` for no session, an untouched session, one logged set, a completed warm-up, a set in a second exercise, and an empty session; `countCompletedSets` agreeing with the predicate the copy quotes |
| `src/content/__tests__/accountCopy.test.ts` (new) | No environment variable or internal identifier (I-4/I-5); nothing diagnostic or clinical (I-8); **never promises deletion or export** (I-10); the explanation states both sides of the device boundary; the confirmation names count and session; pluralisation |
| `src/store/__tests__/authActions.test.ts` (extended) | Teardown against a session with logged sets; `canOfferSignOut` false afterwards, so the control cannot survive its own action; `userId` **and** `email` cleared |
| `src/store/__tests__/sessionStore.test.ts` (extended) | A null email carried through rather than invented; identity cleared on `SIGNED_OUT` |
| `src/data/__tests__/authPosture.test.ts` (extended) | Demo and misconfigured builds offer no control — the misconfigured case asserted **together with** the message still throwing, so a sign-out control cannot become a competing explanation for a broken build |

**Not covered, and not claimed** `[fact]`: the header control's rendering, the modal presentation, and
the confirmation `Alert`. No component-test tooling exists, by decision. **No on-device verification was
performed**, so no rendering or layout claim is made here — `Docs/agents.md` requires a cold-start run
before any such claim.

---

## 6. Findings during implementation

- **Typed routes are invisible to CI, again** `[fact]`. `.expo/types/router.d.ts` is gitignored and CI
  runs no typegen step, so `/account` failed local typecheck exactly as `/auth` did last sprint. It was
  regenerated rather than cast away with `as never`. Worth a permanent fix at some point: a typegen step
  in CI, or committing the generated file.
- **`Screen.headerRight` had been built and never used** `[fact]`. The sprint needed no new component
  because a previous one had already left the right seam in place.

---

## 7. Explicitly out of scope

`[fact]` None of these were touched:

- **Password reset** — a lifter who forgets their password is still recoverable only by hand in the
  Supabase dashboard. Now the largest supportability gap; see `Docs/production-posture-v1.md` §7.
- **Account deletion and export (I-10)** — still absent, still blocking for store submission. The
  Account surface deliberately claims neither, enforced by copy test.
- **A real settings surface** — preferences, units, theme, dev affordances. v1.x+.
- **Deep-link session capture** — `detectSessionInUrl` remains false; confirmation still ends in a
  manual sign-in.
- **`Docs/release-checklist.md` and `npm run verify`** — both still absent repo-wide.
- **I-2 / G-2** (non-transactional `saveWorkout`), **G-4** (observability), **G-9** (offline).

---

## 8. Known incompleteness

- **No password reset, no deletion, no export** `[fact]`. The Account sheet is a way out of a session,
  not a way out of the product.
- **Nothing has run against a live Supabase project** `[fact]`. Unchanged from the auth sprint; the
  integration lane is still credential-gated and skipped.
- **No rendering coverage and no on-device run** `[fact]`. The control, the modal and the `Alert` are
  verified only through the pure predicates and the copy module.

---

## 9. Validation evidence

Per `Docs/agents.md` "Required handoff" — commands run and their actual results:

| Command | Result |
|---|---|
| `npm run typecheck` | Exit 0, clean |
| `npm test` | 22 suites, 312 tests, all passing |
| `npm run test:integration` | 1 suite, 5 tests, **skipped** (credential-gated) |
| On-device cold start | **Not run.** No rendering or layout claim is made in this record. |

**Changed files:** 5 new, 7 modified — enumerated in §4. No source file was modified by the
documentation pass that followed.

---

## 10. The exact next decision

Unchanged from `Docs/production-posture-v1.md` §7, minus the one this sprint closed:
**does Supabase email confirmation stay ON?** It is an owner decision, it is the cheapest of the
remaining three, and it gates password reset — which is now the largest supportability gap standing
between this branch chain and a release that could be supported.
