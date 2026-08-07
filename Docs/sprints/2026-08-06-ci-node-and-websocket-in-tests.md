# Sprint: green CI — Node parity and the WebSocket dependency in tests

## 1. Document status

- **Date:** 2026-08-06
- **Branch:** `fix/ci-node-and-websocket-in-tests`, based on `main` (`08c87dd`). Off `main` rather than
  the open stack, because `main` itself is red and every open PR sits above it.
- **Owner:** Engineer/owner.
- **Labelling** per I-15: `[fact]` / `[decision]` / `[assumption]` / `[open question]`.

---

## 2. What was wrong

**`main` has been red since PR #45 merged** `[fact]`. Green at `58608d1` (#44), failing at `08c87dd`
(#45). Two tests in `src/data/__tests__/authPosture.test.ts`:

```
getWebSocketConstructor (@supabase/realtime-js/lib/websocket-factory.ts:159)
  ← getSupabase (src/data/supabase/client.ts:62)
  ← subscribeToAuthState (src/data/supabase/auth.ts:132)
  ← sessionStore.initialize()  ← authPosture.test.ts:134
```

`createClient()` builds a `RealtimeClient` eagerly, which resolves a WebSocket implementation at
construction time. **Node 22 has a global `WebSocket`; Node 20 does not.** CI pinned Node 20; local
development runs Node 22. So the suite passed on every developer machine and failed on every CI run.

This is an environment difference, not a product defect `[fact]`: React Native provides `WebSocket`, so
this path cannot fail on a device.

### 2.1 How it got missed

Worth recording plainly, because the mechanism matters more than the bug.

Four sprints in the open stack each reported "N tests passing" as validation evidence, and each was
**true on Node 22 and untrue on the repo's own CI**. The evidence was real; it was gathered in an
environment nobody had checked matched CI, and CI's disagreement went unread because the PRs targeting
non-`main` branches never triggered it (`ci.yml` runs on `push`/`pull_request` to `main` only, so
`#47`–`#52` reported "clean" having never run) `[fact]`.

The lesson is not "run more tests". It is that a local pass and a CI pass were being treated as the
same claim, and they were not.

---

## 3. What was NOT the fix

`src/data/supabase/__tests__/support/realtimeTransport.ts` **already existed**, already diagnosed this
exact failure in its header — including "Node 22+ has a global `WebSocket`; older runtimes do not, so a
suite can pass locally and fail on CI purely on runtime version" — and already provided
`OFFLINE_REALTIME_OPTIONS` for it. `sessionFlow.test.ts` uses it.

So the problem had been solved once and the solution simply was not reached for. That ruled out
inventing anything new `[decision]`.

---

## 4. The fix, in two parts

**Part 1 — use the existing tripwire from `authPosture.test.ts`.**

`sessionFlow.test.ts` can pass `OFFLINE_REALTIME_OPTIONS` because it constructs its own client.
`authPosture.test.ts` cannot: the client is built inside `client.ts`, which is *the module under test*
and must not grow a test-only parameter to accommodate its own suite. The options are therefore merged
at the `createClient` boundary via `jest.mock('@supabase/supabase-js')`, which keeps the real client
built by the real code path and replaces only the transport it would never have used.

`UnusedRealtimeTransport` throws rather than no-ops, so this stays a tripwire: a future test that
genuinely exercises realtime fails loudly instead of passing against a stub.

**Part 2 — remove the version divergence.**

`.nvmrc` is added (`22`) and `ci.yml` now reads `node-version-file: .nvmrc` rather than restating a
number. One source of truth, so the two cannot drift apart again silently — which is the actual failure
here, more than any individual global.

**Why Node 22 rather than keeping 20** `[decision]`: there is a real argument for keeping the stricter
runtime, since Node 20 is what surfaced this at all. It loses to two things. Node 20 **reached
end-of-life in April 2026**, so CI was running an unsupported runtime receiving no security patches.
And the strictness argument is weaker once Part 1 lands: the tripwire is the actual defence and it
works on any Node, so relying on an EOL runtime as an accidental linter is a poor trade.

---

## 5. Validation evidence

```
npx tsc --noEmit                              → clean
npx jest --ci                                 → 287 passed, 20 suites   (Node 22, as-is)
npx jest --ci --setupFiles <delete WebSocket> → 287 passed, 20 suites   (simulated Node 20)
```

The second run is the one that matters: `globalThis.WebSocket` is deleted before the suite loads,
reproducing CI's runtime exactly. **Before this change that command reproduced the CI failure
precisely** — same two tests, same `getWebSocketConstructor` frame — which is how the diagnosis was
confirmed rather than assumed.

**Changed files:**

```
.nvmrc                                                    (new)
.github/workflows/ci.yml
src/data/__tests__/authPosture.test.ts
Docs/sprints/2026-08-06-ci-node-and-websocket-in-tests.md  (new)
```

---

## 6. Known incompleteness

- **CI still does not run on the stacked PRs** `[fact]`. `ci.yml` triggers only on `main`, so
  `#47`–`#52` will first be exercised as each is retargeted to `main` on merge. Widening the trigger to
  `pull_request: branches: ['**']` would test a stack before it lands. Not done here — it changes CI
  spend and behaviour for every future branch, which is the owner's call `[open question]`.
- **The SQL suites are not in CI** `[fact]`. `supabase/tests/rls/run.sh` needs a live Postgres, and
  `Docs/sprints/2026-08-04-supabase-rls-ci.md` covers that work. The 132 assertions across four SQL
  suites are currently run by hand.
- **No `engines` field in `package.json`.** `.nvmrc` signals the version to a developer's shell; it
  does not enforce anything at install time. Adding `engines` + `engine-strict` would, at the cost of
  hard-failing installs on a mismatched runtime.

---

## 7. The exact next decision

None blocking — this unblocks the merge of `#46` → `#47` → `#48` → `#49` → `#51` → `#52`, and `#50`.

One worth answering when convenient: **should CI run on every branch, not just `main`?** (§6). The
current setting is why six PRs reported "clean" without ever having been tested.
