# Editable session lengths and a session-end chime — history log

Appended by frontend/backend/qa/reviewer/orchestrator after implementation began.
The task's goal, scope and acceptance criteria are in [../017-timer-settings-and-chime.md](../017-timer-settings-and-chime.md).

## Implementation Notes
*(frontend, antislop `during`. Gates and a smoke run are at the end.)*

### Final names and shapes
- **Preferences v3 keys:** `focusMinutes`, `shortBreakMinutes`, `longBreakMinutes` (whole minutes), `chimeEnabled` (boolean, default true), `chimeLevel` (integer 0-100, default `DEFAULT_LEVEL` = 50). Setters on `usePreferencesStore`: `setDuration(key, minutes)` (ignores anything outside that key's bounds), `resetDurations()`, `setChimeEnabled`, `setChimeLevel` (ignores non-`isLevel`).
- **Constants, one module:** `lib/timer/constants.ts` holds `DEFAULT_*_MINUTES`, `*_MINUTES_MIN/MAX`, the `DURATION_LIMITS` table, `DURATION_KEYS`, `DurationKey`, `TIMER_STORAGE_KEY`. `SHORT_BREAK_MINUTES` / `LONG_BREAK_MINUTES` (the fixed constants) are gone. `lib/preferences/schema.ts` defaults reference `DURATION_LIMITS`.
- **`lib/timer/time.ts`:** `fullDurationMs(mode, durations)` now takes a `Durations` record (`{focusMinutes, shortBreakMinutes, longBreakMinutes}`), is the only place minutes become ms, and uses `MODE_DURATION_KEY`. `parseFocusMinutes` is replaced by `parseMinutes(key, raw)` (same error strings, the out-of-range one names that key's bounds). `isDurationMinutes(key, value)` is the shared validator (preferences, timer guards, setters). `lib/timer/durations.ts` `readDurations()` reads the three values from the preferences store; it is the one place the timer store reads settings.
- **Timer store v4:** `focusMinutes` and `setFocusMinutes` removed; `plannedDurationMs: number | null` added. `start` captures it, `pause`/`resume` keep it, `reset`/`selectMode` clear it, `completeIfExpired` logs the stored value and stores the next run's. `hasValidRunIdentity(candidate, hasPlannedDuration)` enforces non-null exactly while running/paused, finite, > 0 and <= the largest legal run (180 min); v2/v3 guards call it with `false`. `getRemainingMs` is unchanged: components pass `plannedDurationMs ?? fullDurationMs(...)` as its `fullMs`, so a paused value clamps to the run's own length (17).
- **`completeIfExpired` order (34):** `logRunCompletion` first, then `set()`. The audio engine is NOT imported into the store.

### The cross-store carry (Risk 1)
Written from both ends, safe to run twice, existing preference always wins:
- Preferences end (`lib/preferences/store.ts` + `lib/preferences/legacy-focus.ts`): `migrate` for a stored version < 3, and `merge` when there is no stored entry at all, take the Focus length from a raw `pomotato-timer` entry at **version 3** (`readLegacyTimerFocusMinutes`). A stored v3 entry is never touched.
- Timer end (`lib/timer/carry-focus.ts`, called from `migrateVersionThree`): if the stored preferences entry has no `focusMinutes` key, move it. If preferences are already hydrated it uses `setState`; if not, it merges into the raw stored entry (a `setState` before rehydration would persist defaults over the user's theme and mix).
- `hooks/use-hydrate-timer-store.ts` now rehydrates preferences first when they are not yet hydrated, because a reload onto an expired run starts the next run from the settings during timer rehydration. The store itself does not do this, so store unit tests that `setState` preferences are not clobbered.
- v3 -> v4 planned duration comes from the **v3** `focusMinutes` and the then-fixed breaks. Those two are `VERSION_THREE_SHORT_BREAK_MINUTES = DEFAULT_SHORT_BREAK_MINUTES` and `..._LONG_... = DEFAULT_LONG_BREAK_MINUTES` in `lib/timer/store.ts`, referencing the defaults so `5` and `15` stay single-source (criterion 9). **Tradeoff:** if either default ever changes, those two must be frozen to 5 and 15 first; a comment says so.
- **Not carried (accepted):** a v1 or v2 timer entry never reaches the preferences-side carry (only v3 is read). The timer-side carry still runs when it migrates, but only wins if preferences have no key yet. Pre-v3 `custom` minutes were never a Focus length for most users, so this is a narrow case.
- The timer store is rehydrated on every route by the layout provider, so the "applies to the next session" note on `/settings` knows the live status. A fresh tab opened on `/settings` (or `/stats`) over an already-expired run credits and advances it once, **still with no chime, by design**: that is a rehydration advance, and `onRehydrateStorage` clears `lastAdvance` exactly as it does on a reload (criterion 57). A session that expires while the tab is open on any route does chime.

### The chime
- **Module:** `lib/audio/chime.ts`, export `chime: ChimePlayer`:
  - `play(level: number): Promise<"played" | "blocked" | "unsupported" | "failed">`. Schedules synchronously (no await before the nodes exist), always resolves, never throws. Failure logs exactly one `console.warn`. A blocked context aborts the scheduled nodes so nothing plays late.
  - `prime(): void` opens/resumes the one context; call inside a click.
  - `getSnapshot() -> { plays, lastLevel }`, `subscribe`, `getServerSnapshot` (the `useSyncExternalStore` shape). `plays` counts `play` calls, Preview included. `CHIME_DURATION_SECONDS` (1.66) is exported for the <= 2.0 s assertion.
- **Engine additions (`lib/audio/engine.ts`, soundscape behaviour unchanged):** `soundscape.prime()` and `soundscape.lease()` returning a `ChimeLease { context, ready, retain(n), release(n) }`. While a lease is open the idle-suspend marker will not suspend the context (so toggling the soundscape off mid-chime cannot cut it), `lease` bumps `generation`, and `release` re-suspends an idle context on the audio clock. Node counts go through `retain`/`release`, so the snapshot's `nodes` returns to its prior value after `onended`.
- **Sound:** two sine notes (880 Hz and 1318.51 Hz, a fifth apart; second starts 0.16 s later), each `setValueAtTime(0)`, linear 15 ms attack, exponential fade to 0.0001, linear ramp to 0 (47). Peak gain = `levelToGain(level)` split 0.6/0.4 across the notes; level 0 is gain 0. No JS timer, rAF or `performance.now` in the module (46).
- **How qa mocks it:** component/unit level, `vi.mock("@/lib/audio/chime", ...)` replacing `chime.play` / `chime.prime`. `PomotatoTimer` wraps the call (`try` plus `Promise.resolve(...).catch`) and warns once, so a mock that throws or rejects is also covered (40). For the real module, stub `window.AudioContext` with a fake exposing `currentTime`, `state`, `resume`, `createGain`, `createOscillator`, `createConstantSource`, `destination`; `lib/audio/engine.test.ts` already has a fake context to copy. Note the engine is a module singleton, so tests that care about node counts should use `vi.resetModules()`.
- **Guard:** now in `components/TimerClockProvider.tsx` (it began in `PomotatoTimer`), a `chimedAdvanceRef` keyed on `lastAdvance.endedAt`, beside the announcement effect, same `hasHydrated` gate. Reads `chimeEnabled`/`chimeLevel` via `usePreferencesStore.getState()` at observation time. Rehydration clears `lastAdvance`, so reload and post-chime refocus never play. Priming: `TimerControls.handlePrimary` calls `chime.prime()` first for Start and Resume (not Pause); Preview primes too. The soundscape's own `apply` already creates/resumes the same context.
- **Page-readable play count:** `data-chime-plays="<n>"` on the timer's root `div` in `PomotatoTimer` (on `/`) and on the sound `fieldset` in `ChimeSettings` (on `/settings`). Same number from `chime.getSnapshot().plays`.
- **Where it is observed (revised, see "Owner ruling after implementation" below):** `components/TimerClockProvider.tsx`, mounted in `app/layout.tsx`, so every route.

### Owner ruling after implementation: the chime fires on every route
This was added after the first hand-back, by owner ruling, so the structure differs from the task file's "Files likely touched" (which has the chime fired from `PomotatoTimer`).
- **New component:** `components/TimerClockProvider.tsx`, wrapping `{children}` in `app/layout.tsx` (client component, so it stays mounted across client-side navigation). It exports `useTimerNow()`.
- **Who owns the clock:** the provider, alone. It calls `useHydrateTimerStore()` (timer rehydration, preferences first), `useTimerClock(status === "running")` (the single interval, plus `visibilitychange`/`focus` sync), the `completeIfExpired` effect, and the chime effect. It publishes `now` through context; `PomotatoTimer` only reads `useTimerNow()` for its display and reads `hasHydrated` straight from the store. `completeIfExpired` is called from one place and the clock is driven once. With no provider mounted `useTimerNow()` returns one non-ticking read.
- **Guard across navigation:** `chimedAdvanceRef` (keyed on `lastAdvance.endedAt`, gated on `hasHydrated`) lives in the provider, which the layout never unmounts, so `/` -> `/settings` -> `/` around the moment a session ends cannot replay it. Keying and the cleared-on-rehydrate behaviour are unchanged. `SessionLengths` no longer calls `useHydrateTimerStore`.
- **Announcement stays in `PomotatoTimer`** (`announcedAdvanceRef`), unmoved, but its ref is now seeded on mount from the `lastAdvance` that already exists, so only an advance observed while mounted is announced. A session that ended on `/settings` is not re-announced on the return to `/` (it was reachable for the first time with the layout driver). The chime and the announcement are deliberately asymmetric: the chime fires for an advance observed on any route, the announcement only for one observed on `/`; a comment in `PomotatoTimer` says not to align them.
- `data-chime-plays` on the timer root and the settings fieldset is unchanged. Store still imports no audio module.
- Smoke: on `/settings`, a running entry 2.5 s from its end advanced to a short break and `data-chime-plays` read 1. (Headless Chromium blocked the context without a gesture, so the one-warn failure path ran; nothing was audible.)

### Fix after QA: criterion 53 (blocked playback hung `play()`)
- **Cause:** under autoplay policy `resume()` neither resolves nor rejects, so `lease.ready` never settled: `play()` never resolved, no warning, nodes never torn down, and `chimesInFlight` stayed above zero, which blocks every later idle suspend.
- **Fix:** `chime.play` waits on `settleWithin(lease.ready, RESUME_BOUND_MS = 500, false)` (new `lib/settle-within.ts`), so a pending resume classifies as blocked, runs `abandon()`, logs the one warning and releases the lease. 500 ms because a real resume takes tens of ms even on a slow device, and it is under a third of the 1.66 s chime. A running context already has `ready = Promise.resolve(true)`, so a primed chime pays nothing. **Where the timer lives:** not in `engine.ts` (its static guards, `engine.test.ts` criterion 26 and `TimerGauge.tokens.test.ts`, ban timers there) and not in `chime.ts` (criterion 46 bans them there); `lib/settle-within.ts` holds the one `setTimeout`, outside `lib/audio`. The audio clock cannot time it because a suspended context's clock does not advance. Criterion 46's intent is that no JS timer drives the sound, which holds; this one only classifies a blocked start. qa should know the helper exists if the 46 guard is ever widened to imports.
- **`chimesInFlight` returns to zero on every path:** `lease()` increments it once and `release()` (idempotent) is the only decrement. In `chime.play`: lease null means no increment; a throw while scheduling calls `release(0)`; blocked or `ready === false` calls `abandon()` which runs `teardown` and `release`; success releases from the last oscillator's `onended`. A resume that completes after the timeout is ignored (`settled`), and the abandoned oscillators have already been stopped.

### Settings surface
- `/settings` order: Session lengths, Session-end sound, Timer gauge, Background image. New sections are `fieldset` + `legend` like the existing two (no h2 anywhere, so heading levels are h1 only; the legend is the section title). New files: `components/SessionLengths.tsx` (section, the note, Reset), `components/DurationField.tsx` (one field, reused x3), `components/ChimeSettings.tsx` (toggle, volume, Preview).
- **Ids:** `focus-length` (kept so e2e selectors move with a route change only), `short-break-length`, `long-break-length`; error nodes `<id>-error` with `role="alert"` (the only live regions added anywhere: one per field, only while invalid). The "applies to next session" note is a plain `<p>`, shown only while status is running or paused, naming the live session ("Your Focus session is running ...", "Your short break is paused ..."). No live region on `/`: `FocusLengthInput`'s `role="alert"` left the `/` tree, so task 013's pinned live-region count on `/` is now one lower (see fallout).
- **Reset to defaults** is a plain button; it calls `resetDurations()` and bumps a key that remounts the three fields, so text and errors clear even when the stored value was already the default. It touches nothing else.
- **Volume persistence (44), decision left to me:** local draft on every step; one store write on pointer up, pointer cancel, blur, `pagehide`, and unmount. No debounce timer, because 74 says the settings path adds no timer. A keyboard run of twenty steps is one write, on blur. Preview commits the draft first and plays it. Consequence for tests: a `fill` or arrow-key change is not in `localStorage` until blur/pointerup/pagehide; a reload fires `pagehide`, which flushes it.
- **Toggle:** native checkbox (the mixer's checkbox classes), name "Play a chime when a session ends", with a visible "On"/"Off" word beside it and state copy under it. The non-colour cue for 68 is that word plus the filled-versus-empty box; in forced colours the checked fill is `Highlight`. The slider reuses the mixer's slider classes (copied, not imported, so `SoundscapeDialog.tsx` stays untouched for its by-path suites).
- Tokens only; `app/globals.css` untouched. No new motion, no rAF, no timers added by the settings path.

### Decisions the task left to me
- Key names above. `chimeEnabled`/`chimeLevel` rather than `sound*`, to keep it distinct from the soundscape's "sound".
- Both ends of the carry (above), and rehydrating preferences first in `useHydrateTimerStore`.
- `plannedDurationMs` upper bound (180 min) in the guard; zero and negative rejected.
- `FocusLengthInput.tsx` is **deleted**, not repurposed; the generalised pieces are the three new components. That is what makes the four by-path suites fail on the path first.
- `prime()` leaves the context to be suspended again by the engine once silent; a later chime wakes it (52).

### Not satisfied / not mine
- Criterion 77 (DECISIONS.md) is the orchestrator's. 54: the rule lists are untouched and the suite passes; adding `lib/audio/chime.ts` to its "feature's own files are scanned" assertion is qa's.
- Group I (66-70) measurements and the e2e criteria are qa's to take; nothing was measured by me. The a11y sweep (62) and 64 (44 px targets) are built for (every control `min-h-11`, slider input `h-11`, the toggle row `min-h-11 w-full`) but not measured.
- Manual audibility (42, 43) is not checked by ear. The chime was exercised against a fake context only.
- `npm run build` and `npm run typecheck` fail, but only in test files (see fallout). The compile step succeeds and non-test sources are type-clean. Both were already red before this task from 41 type errors in `lib/db/*.test.ts` and `components/TaskForm.test.tsx`; this task adds 54 more in the files below.

### Test fallout for qa (nothing edited by me)
Unit/type-level, all from removed or renamed API, none from a wrong implementation:
- `components/FocusLengthInput.test.tsx`: imports the deleted component and uses `focusMinutes`/`setFocusMinutes` on the timer store. Supersede with tests of `DurationField`/`SessionLengths` on `/settings` (criteria 5, 8, 10, 14); 013 criterion 7 is superseded (72).
- `components/TimerSurface.tokens.test.ts`, `components/token-foundation.test.ts`, `components/palette.tokens.test.ts`, `components/focus-cycle.guards.test.ts`: list `FocusLengthInput.tsx` by path (ENOENT). Re-point to `DurationField.tsx` / `SessionLengths.tsx` / `ChimeSettings.tsx` or drop where the surface left `/`. `focus-cycle.guards.test.ts` also pins the live-region count in the `/` tree: it is now one lower because the field left.
- `components/CycleDots.test.tsx`: seeds `focusMinutes` on the timer store (type error, 1 line).
- `lib/timer/time.test.ts`: `parseFocusMinutes` -> `parseMinutes(key, raw)`, `SHORT_BREAK_MINUTES`/`LONG_BREAK_MINUTES` gone, `fullDurationMs(mode, durations)` takes a record, `getRemainingMs` cases unchanged.
- `lib/timer/store.test.ts`: `focusMinutes`/`setFocusMinutes` gone from the timer store (5 failing, 17 type errors); seed `plannedDurationMs`; set lengths through `usePreferencesStore`; persist version is 4.
- `lib/timer/focus-cycle.test.ts`: persist-version 3 -> 4, v2/v1 migration expectations now end in the v4 shape, `setFocusMinutes`, the 8-run cycle (criterion 16) and `seedV3` need the preferences store for 1-minute focus. The v3 -> v4 cases (28-32) are new.
- `lib/preferences/preferences.test.ts`, `lib/preferences/gauge-style.test.ts`, `lib/audio/mix.test.ts`: version 2 -> 3 and the entry now has ten keys; every `toEqual` on a sanitised payload or stored envelope lists four or five keys.
- Already failing before this task, unchanged: `components/TaskForm.test.tsx`, `components/TaskPanel.tokens.test.ts`, `components/panel-only.guards.test.ts`, `components/token-dark.test.ts`, `lib/db/background-migration.test.ts`, `lib/db/background-repository.test.ts`, `lib/db/session-repository.test.ts`, `lib/db/task-repository.test.ts`, `lib/db/upgrade-v5.test.ts`. (`components/palette.tokens.test.ts`, `token-foundation.test.ts` and `focus-cycle.guards.test.ts` were already red on one assertion each, and have more now.)
- Passing and still relevant: `lib/audio/no-audio-asset.test.ts`, `lib/audio/engine.test.ts`.
- e2e (not run by me): the eleven specs in criterion 71 select `#focus-length` on `/`; it now exists on `/settings` only, with the same id. `e2e/sessions.spec.ts` and `e2e/focus-cycle.spec.ts` set a Focus length through the field, and also read `focusMinutes` from `pomotato-timer`, which is now `pomotato-preferences`. Also worth a look: `e2e/sampler-agreement.spec.ts`, `e2e/uploaded-background-layer.spec.ts`, `e2e/settings-gauge-style.spec.ts`, `e2e/control-edge-measure.spec.ts`, `e2e/helpers/timer-hold.ts`, which mention the field or `focusMinutes`.

### Gate results and smoke check
- `npm run lint`: 0 errors, 21 pre-existing warnings (none in files this task touched).
- `npm run typecheck`: fails only in test files (95 errors, 41 of them pre-existing); zero in non-test sources.
- `npm run build`: "Compiled successfully", then fails at "Running TypeScript" on the same test-file errors.
- `npm run test`: 20 failed files / 147 failed tests, against 12 / 59 before this task; the added failures are all listed above.
- Smoke (real Chromium, dev server, 320x568): a v3 timer entry with `focusMinutes: 50` and no preferences showed `50:00` on `/`, `/settings` read 50 / 5 / 15, an out-of-range short break showed "Enter a number from 1 to 60.", no horizontal overflow, preferences persisted at version 3, Preview bumped `data-chime-plays`, Start wrote a v4 timer entry with `plannedDurationMs`, and there were no console warnings or errors. A scratch Vitest check (since deleted) covered: v3 paused entry clamped to its own 50 minutes, existing preference beating a stale timer entry, the timer-first carry, log-before-commit order, the logged length being the one the run started with, the next run reading the new break length, and the chime's node count returning to zero after `onended`.

## QA Report
(qa, second pass after the coordinator's resume note. Tree: HEAD plus task 017 only, with the four owner-stashed files back at their committed state. Scratch build served on :3100 from a clean copy of the current tree, test files removed.)

- **Verdict: FAIL, on criterion 76 only.** Amended in place after the second and third passes (see "Amendment" and "Third pass" below). Criterion 1 is PASS by orchestrator ruling. Criterion 53 is PASS on the unit evidence added in the amendment; its real-browser e2e confirmation is **blocked** (it cannot run against the stale build). Criterion 76 stays FAIL because the repo-wide gates are red for reasons pre-existing to this task (`lib/db/*` and `TaskForm.test.tsx` type errors). Criterion 9 has an open literal exception awaiting an orchestrator ruling.
  - **Criterion 1 (resolved by ruling).** The orchestrator rules that the `fieldset`/`legend` convention satisfies the heading clause. See the amendment.
  - **Criterion 53 (resolved, unit-proven).** The fix in `lib/audio/chime.ts` bounds the resume. The unit tests added in the amendment prove the hang path. The real-browser e2e check is blocked, see below.
  - **Criterion 76 (not caused by 017).** `npm run typecheck` is 41 errors, all pre-existing in `lib/db/*.test.ts` and `components/TaskForm.test.tsx`. `npm run build` is red for the same reason (verified green in a copy with test files removed). `npm run test` has the pre-existing 12 failed files. The full `npm run test:e2e` was not run to completion (see Gates).
  - **Literal exception, criterion 9.** The task's own files pass. The only shipped-path literal `25 * 60 * 1000` is `lib/db/test-utils.ts:45`, a pre-existing Dexie seed helper that this task did not touch. Excluded explicitly in the guard with a comment. **RULED PASS (orchestrator, 2026-11-11):** criterion 9 governs shipped durations, and a Dexie fixture seed is not one. Reviewer confirmed independently that the only shipped `MS_PER_MINUTE` multiplications are `lib/timer/time.ts:16` and the exempted `MAX_PLANNED_DURATION_MS` bound. Recorded in docs/DECISIONS.md.
  - **Criterion 23 (resolved, not a fail).** The guard originally flagged `lib/timer/store.ts:101` (`MAX_PLANNED_DURATION_MS`). Per the coordinator's ruling it now has a narrow, named exemption matched by exact line text. Any second full-duration multiplication still fails the guard.

### Gates (before and after, stated explicitly)

| gate | HEAD / orchestrator baseline | now (QA's run, current tree) | what the difference is |
| --- | --- | --- | --- |
| `npm run typecheck` | 95 errors at the start of this pass (54 from this task) | **41 errors**, all in `lib/db/*.test.ts` and `components/TaskForm.test.tsx`; **0** in non-test source or in any 017 test file | 54 cleared. The 41 are pre-existing and out of scope. |
| `npm run test` (vitest) | HEAD: **12 failed files / 59 failed tests** | **12 failed files / 59 failed tests**, the same files and the same tests as HEAD. 1279 tests in 269 files now (1152 before). | No new failures. The 12 are: `TaskForm.test.tsx` (suite error), `TaskPanel.tokens`, `panel-only.guards` (6), `token-dark`, `palette.tokens` (1, pre-existing), `token-foundation` (1, pre-existing TaskForm `any`), `focus-cycle.guards` (1, pre-existing: `TaskForm.tsx` expected, `UndoToast.tsx` received, task-015 fallout, not 017), and `lib/db/*` (5 files, 48 tests). |
| `npm run lint` | 0 errors, 21 warnings (orchestrator) | ESLint on every touched directory: **0 errors**, 14 warnings, none introduced by the new test files I reviewed. Whole-repo lint not re-run by QA. | n/a |
| `npm run build` | red at HEAD (test-file type errors) | red for the same pre-existing reason. A clean copy with test files removed **builds and exports** (`/`, `/settings`, `/stats`). | Not a 017 regression. |
| `npm run test:e2e` | not measured at HEAD in full | 22 spec files, **408 tests**, run on the rebuilt tree: final run 324 passed, 79 failed. Three of the 79 were mine and are fixed (see below). **75 failing tests are name-identical to HEAD failures** in the same specs (HEAD baseline on the same 14 spec files: 76). **1 new failure**: criterion 53's real-browser clause, measured on the pre-fix build. It cannot be re-run now (see the amendment). | The whole 672-test suite was **not** run; see "not run" below. |

The unit-suite difference is legible: HEAD 12/59, now 12/59, with the same files. The only new red unit test from this task (criterion 23) is now green after the ruled exemption.

Not run in e2e this pass (the remaining specs, roughly 260 tests): `checkbox-unchecked-contrast`, `dark-native-ui`, `dark-theme-control`, `hold-label-contrast`, `hold-reset`, `mode-selector-legend`, `soundscape-layout`, `soundscape-measure`, `soundscape-mixer`, `stats`, `task-list`, `task-panel-behaviour`, `task-panel-measure`, `task-panel`, `token-chip-cue`, `uploaded-background-dialog-edge`, `uploaded-background`. They do not name `#focus-length`, but several use `seedTimerState`, whose seed routing changed, so they are a known risk.

### Tests added and updated

**Unit, new:** `lib/audio/chime.test.ts` (12, fake AudioContext), `components/TimerClockProvider.test.tsx` (15, mocked chime module, StrictMode, refocus, reload, one-step bound), `components/SessionLengths.test.tsx` (49, covers `SessionLengths`, `DurationField` x3 and `ChimeSettings`), `lib/timer/store-v4.test.ts` (19), `lib/preferences/schema-v3.test.ts` (20), `lib/timer/task-017-guards.test.ts` (8, source guards).

**Unit, updated:** `lib/timer/time.test.ts`, `lib/timer/store.test.ts`, `lib/timer/focus-cycle.test.ts`, `components/CycleDots.test.tsx`, `lib/preferences/preferences.test.ts`, `lib/preferences/gauge-style.test.ts`, `lib/audio/mix.test.ts`, `components/focus-cycle.guards.test.ts` (live-region pin, `/` tree, plus an exact `/settings` pin for `DurationField` only), `components/TimerSurface.tokens.test.ts`, `components/token-foundation.test.ts`, `components/palette.tokens.test.ts` (by-path re-pointed to `DurationField.tsx`), `lib/audio/no-audio-asset.test.ts` (one path added, rule lists unchanged). `components/FocusLengthInput.test.tsx` deleted.

**E2E, new:** `e2e/session-lengths.spec.ts` (criteria 1, 2, 3, 4, 5, 6, 7, 8, 11, 12, 13, 14, 15, 16, 17, 19, 20, 28, 33, 41, 43, 44, 57, 58, 61, 62, 63, 64, 65, 73); `e2e/settings-measure.spec.ts` (group I, criteria 66 to 69); `e2e/chime-audio-blocked.spec.ts` (criterion 53 real-browser); `e2e/chime-audio-autoplay.spec.ts` (success path, see below). Helpers: `e2e/helpers/session-lengths.ts`, `e2e/helpers/settings-sampler.ts` (the group I sampler, for the next task), and `timer-hold.ts` now routes a seeded `focusMinutes` to preferences and writes a v4 timer entry with `plannedDurationMs`.

**E2E, updated (criterion 71):** all eleven `#focus-length` specs were re-pointed to `/settings`, or the `/`-ground rows were retired with a comment: `timer`, `accessibility`, `timer-gauge`, `timer-surface-tokens`, `dark-sweep`, `dark-contrast`, `dark-a11y-console`, `token-task-surface`, `uploaded-background-legibility`, `focus-surface-sweep`, `focus-surface-behaviour`. Also `settings-gauge-style` (interactive-element list, tab order, preferences version 3). **`sessions.spec.ts` was not updated.** It writes raw v1 and v3 timer entries with `focusMinutes`, and it cannot pass the `openTaskList` precondition at HEAD either (its 14 failures are name-identical to HEAD). Its migration seeds are therefore **unverified**, and criterion 71 is PARTIAL for that file.

### Per-criterion status

Legend: PASS (automated, run and passing), PASS-unit (proven at unit level only), PARTIAL, FAIL, NOT DECIDABLE (needs a human or a deliberate hardware step), NOT ASSESSED (orchestrator-owned).

**A. Settings surface**
1. PASS by orchestrator ruling (see the amendment): the `fieldset`/`legend` convention is the one the route already uses for "Timer gauge". The legend is the correct group name for form controls and there are no section headings, so no level is skipped.
2. PASS (e2e, `/` has no `#focus-length`, label, or numeric input).
3. PASS (e2e, equal child gaps at 1280x800 and 320x568, absolutely-positioned announcer excluded).
4. PASS (e2e, Tab order from "Back to the timer" through the seven controls; outline style checked on each).
5. PASS-unit (`SessionLengths.test.tsx`, per field, per error).
6. PASS (unit and e2e, accessible names; slider `min`/`max`/value).

**B. Duration validation**
7. PASS (e2e, 25/5/15 on first visit; `/` reads `25:00`).
8. PASS-unit (all 9 bad values plus each field's own first out-of-range integer, 30 cases).
9. **PASS.** The task's own files pass. Literal exception `lib/db/test-utils.ts:45` (pre-existing Dexie fixture seed, outside this task) ruled PASS by the orchestrator on 2026-11-11 — criterion 9 governs shipped durations. See docs/DECISIONS.md.
10. PASS-unit (messages per kind; per-field range message).
11. PASS (e2e, `" 30 "` stores 30, `"abc"` shows error). Paste is simulated by `fill`, which fires the same `input` path; no real clipboard paste was driven.
12. PASS (e2e and unit, Reset clears errors, persists, leaves sound settings and run untouched).

**C. Duration behaviour**
13. PASS (e2e, stored value stays 25 across `0`, `00`, `0 ` typed one key at a time).
14. PASS (unit and e2e, no `disabled` in any state).
15. PASS (e2e, idle Focus 50 reads `50:00`; Short break 9 reads `09:00`).
16. PASS-unit (end timestamp byte-identical, countdown on trajectory).
17. PASS (unit and e2e, paused 40:00 stays frozen when lowered to 5).
18. PASS-unit (next run of that type reads the new length, in both directions).
19. PASS (e2e, note shown only while live, names the session type).
20. PASS (e2e, a run edited from 25 to 50 mid-run logs `plannedDurationMs` of 25 min, read from IndexedDB `sessions`).
21. PASS-unit (non-null exactly while running or paused; merge fallback).
22. PASS-unit (end = completed end + next current full duration, to the millisecond).
23. PASS (guard, with the ruled exemption described above).

**D. Persistence and migration**
24. PASS-unit (v3, five keys, defaults reference the constants module).
25. PASS-unit (v2 payload keeps all existing keys and gains the new defaults).
26. PASS-unit (each new key falls back on its own; corrupt level takes default, not clamped).
27. PASS-unit (`partialize` has no `focusMinutes`; version 4; stored entry checked in e2e as well).
28. PASS (e2e, v3 entry with 50 shows `50:00`, still 50 after a second reload; the timer entry has no `focusMinutes`).
29. PASS-unit (preferences at 40 beat a stale timer 50, in both rehydration orders).
30. PASS-unit (v3 running keeps 50; v3 break derives from 5; v3 paused Focus clamps to its own 50).
31. PASS-unit (v1 running custom to v4 with planned duration; the existing `focus-cycle` v1/v2 cases still pass).
32. PASS-unit (non-numeric, negative, and idle-with-planned-duration each fall back to defaults on migrate; merge fallback too).
33. PASS (e2e, no hydration-prefixed console warnings or errors across idle, running, paused, mid-break, expired-while-closed on `/` and `/settings`).

**E. The chime**
34. PASS-unit (log written before the advance is committed; asserted by a store subscriber).
35. PASS-unit (chime started from the observed `lastAdvance`, one call per `endedAt`).
36. PASS-unit (focus to short break, focus to long break, break to focus each chime once).
37. PASS-unit (StrictMode, unrelated re-render, mode-chip click after advance: each still one play).
38. PASS-unit and PASS-e2e (no immediate `stop()` on the chime's oscillators in a real browser when navigating `/` to `/settings` mid-chime; `immediateStops` is 0). A real-browser mid-chime navigation was driven under the autoplay flag.
39. PASS-unit (a never-settling play promise does not hold the transition).
40. PASS-unit (sync throw and async rejection each produce one warning, no unhandled rejection).
41. PASS (e2e, sound off: advance and log happen, zero plays, setting survives reload).
42. PARTIAL. PASS-unit for peak = `levelToGain(level)` split across the two notes, level 0 gives gain 0, and monotonic over 0 to 100. The level surviving a reload is not driven in a browser. **Audibility of level is MANUAL (see the section below), not PASS.**
43. PASS (e2e, Preview plays once per click with sound off; off copy present).
44. PASS (unit and e2e, 20 steps then blur writes preferences at most twice).
45. PASS-unit (`span` from first sample to last stop is 1.66 s, bound 2.0 s).
46. PASS (guard, `chime.ts` has no timer or frame source).
47. PASS-unit (gain starts and ends at 0 through ramps, no direct writes).
48. PASS-unit (one context across prime, chime, soundscape start).
49. PARTIAL. PASS-unit that `prime()` calls `resume()` synchronously. **The wiring in `TimerControls.handlePrimary` is not asserted by any test.** Read by source only.
50. PARTIAL. PASS-e2e under `--autoplay-policy=no-user-gesture-required` (Preview, then a session end on a fresh document, two oscillators scheduled, one context). This is not the default browser, so "no further gesture" is only as strong as the flag. The default-browser behaviour is criterion 53.
51. PASS-unit (20 chimes: engine node count returns to baseline, no layer gain moves).
52. PASS-unit (chime wakes a suspended context and plays).
53. PASS (unit, amendment): the resume that never settles is classified `blocked` within a 500 ms bound, warns once, releases its lease, and the context can suspend again. Three new hung-resume tests in `lib/audio/chime.test.ts`, plus `lib/settle-within.test.ts`. Red-proofed in a scratch copy: with the bound removed, both hang tests fail on timeout. **Real-browser confirmation (e2e `chime-audio-blocked.spec.ts`) is BLOCKED**, see the amendment. The earlier real-browser failure is recorded there as the reason for the fix.
54. PASS (`no-audio-asset.test.ts` unchanged except the one permitted path).

**F. Background tabs, reload and refocus**
55. PARTIAL. A literal hidden-tab expiry (throttled timers) cannot be driven here. Covered by proxies: reload into expired (57) and refocus after advance (58). Not claimed as PASS for the hidden-tab case.
56. PASS-unit (rehydrate and refocus each produce one advance, no second step).
57. PASS (e2e, reload into an expired run: one step, zero chime plays, empty announcement).
58. PASS (e2e, three `focus` and `visibilitychange` events after an advance: still one play).
59. PASS-unit (live advance chimes whether the next run started or landed idle).
60. PASS (e2e, honest bound: at most one chime per run; no on-time claim while hidden).

**G. Accessibility, motion and mobile**
61. PASS (e2e, announcement reads "Focus complete. Short break started." on `/`; an invalid field on `/settings` adds exactly its own error live region; no `-error` alert on `/`. Pinned in guard: `/` tree count one lower; `DurationField` pinned exactly on `/settings`.)
62. PASS (e2e, axe-core run: `/settings`, both themes, four states: clean, field in error, sound off, sound on; zero serious or critical). **This criterion was run, not just built for.**
63. PASS (e2e, two frames one second apart byte-identical with and without reduced motion; zero `requestAnimationFrame` calls over the second).
64. PASS (e2e, at 320 px every new control's box is at least 44 by 44 and no two overlap). Note: the toggle target measured is the wrapping label row (44 px), not the 24 px native checkbox box, which is inside it.
65. PASS (e2e, 320 px, three invalid fields with the longest message: no horizontal overflow).

**I. Measurement (group I)** - see the table below.
66. PASS. Every boundary is at least 3.00:1 in both themes (lowest: short-break border 3.89:1 light; 4.15:1 dark Preview edge is the lowest dark row).
67. PASS. Every text ground is at least 4.50:1 (lowest: error text 5.42:1 light, 7.20:1 dark).
68. PASS for the test (e2e, forced colours: the On and Off words switch and are visible). The cue is the On/Off word beside the box, plus the box's filled versus empty state. **Greyscale was not rendered as a separate pass**; the word cue is colour-independent by construction, but that is not a screenshot.
69. PASS. One capture per theme (`groundPixels` in `e2e/helpers/settings-sampler.ts`); figures are in one table here.
70. PASS (re-pointed or retired with written reasons in each file): `dark-sweep` custom-field rows and the disabled-state test retired; `dark-contrast` disabled test and focus-ring row retired; `timer-surface-tokens` disabled test retired and the field rows re-pointed to `/settings`; `focus-surface-sweep` field rows retired; `uploaded-background-legibility` edge entry retired (group I covers it over the opaque surface, which is image-independent). `token-task-surface` criterion 21 re-pointed to `/settings`.

**J. Test fallout and gates**
71. PARTIAL. Eleven `#focus-length` specs updated (see above). The four by-path unit suites and the seven unit suites are updated. `sessions.spec.ts` is not updated and cannot be verified at HEAD either (task-panel precondition).
72. PASS (guard: `/` has no `focus-length`; `FocusLengthInput` and its suite are gone).
73. PASS (e2e, focus kept in the field across an auto-advance while typing; field never disabled).
74. PASS (guard, the only `setInterval` is in `hooks/use-timer-clock.ts`; no new timer or frame source in the new or changed clock and settings files, except the one pre-existing announcement `setTimeout` in `PomotatoTimer.tsx`, allowed by line count).
75. PASS by inspection. No new assertion is phrased against `git diff`, `HEAD` or a previous commit. The guard file's `HEAD` references are comments that name a pre-existing line, not assertions.
76. FAIL, not caused by 017 (see Gates). Lint has zero errors. The `build` and `typecheck` reds are the pre-existing `lib/db` and `TaskForm` test errors.

**77.** NOT ASSESSED (orchestrator-owned).

### Group I measurement, one capture per theme

**Provenance, stated once for every row:** a single `page.screenshot` of `/settings` per theme, at 1280x800, on the rebuilt tree after the owner's stash (committed `app/page.tsx`, `ThemeControl.tsx`, `HeaderNav.tsx`, `BackgroundLayer.tsx`). The ground is the opaque token surface, not `/`'s frosted panel, and it is image-independent (no background image is stored). The error state is on the short-break field, in the same capture. Boundaries: a fully covered 1 px row at the top edge of the box, read inside the box, against the 1 px row 2 px above it. Fills (toggle on, thumb): read at the centre against a pixel just outside. Text: the **computed** ink colour (the glyph colour, not a sampled glyph pixel) against the painted ground pixel 2 px left of the text, mid-height. The slider track is read on its unfilled side (right of the thumb), because the filled side measures the primary fill.

Light theme (`light` stored preference):

| kind | element | ink or pixel | ground pixel | ratio |
| --- | --- | --- | --- | --- |
| boundary | focus-length field border | 122,117,111 | 246,239,229 | 4.00 |
| boundary | short-break field border | 122,117,111 | 243,236,226 | 3.89 |
| boundary | long-break field border | 122,117,111 | 246,238,228 | 3.97 |
| boundary | toggle border | 180,83,9 | 245,237,228 | 4.33 |
| boundary | toggle on-state fill | 180,83,9 | 247,240,230 | 4.44 |
| boundary | slider track edge (unfilled) | 122,117,111 | 247,240,230 | 4.03 |
| boundary | slider thumb fill | 180,83,9 | 249,242,232 | 4.52 |
| boundary | Reset button edge | 122,117,111 | 247,240,230 | 4.03 |
| boundary | Preview button edge | 122,117,111 | 245,237,228 | 3.94 |
| text | Focus length label | 68,64,60 | 242,235,225 | 8.68 |
| text | Short break label | 68,64,60 | 246,238,228 | 8.94 |
| text | Long break label | 68,64,60 | 242,235,225 | 8.68 |
| text | Chime volume label | 68,64,60 | 242,235,225 | 8.68 |
| text | error text (short break) | 185,28,28 | 241,234,225 | 5.42 |

Dark theme (`dark` stored preference):

| kind | element | ink or pixel | ground pixel | ratio |
| --- | --- | --- | --- | --- |
| boundary | focus-length field border | 138,121,104 | 32,24,18 | 4.18 |
| boundary | short-break field border | 138,121,104 | 31,23,17 | 4.22 |
| boundary | long-break field border | 138,121,104 | 32,24,18 | 4.18 |
| boundary | toggle border | 240,165,80 | 32,25,18 | 8.44 |
| boundary | toggle on-state fill | 240,165,80 | 31,23,16 | 8.59 |
| boundary | slider track edge (unfilled) | 138,121,104 | 31,22,16 | 4.25 |
| boundary | slider thumb fill | 240,165,80 | 30,22,15 | 8.67 |
| boundary | Reset button edge | 138,121,104 | 31,23,17 | 4.22 |
| boundary | Preview button edge | 138,121,104 | 32,25,18 | 4.15 |
| text | Focus length label | 226,213,194 | 34,26,20 | 11.85 |
| text | Short break label | 226,213,194 | 32,24,17 | 12.11 |
| text | Long break label | 226,213,194 | 34,26,20 | 11.85 |
| text | Chime volume label | 226,213,194 | 34,26,20 | 11.85 |
| text | error text (short break) | 245,139,121 | 35,26,21 | 7.20 |

**Dark-sweep re-point, stated next to the numbers.** The `dark-sweep` rows that measured the duration field on `/`'s frosted panel are retired (criterion 70), and their replacements are the rows above, measured on `/settings`'s opaque token surface. The two sets are not comparable: different ground, different route. Nothing from the frosted-panel measurements is carried over.

Figures from the first pass (before the stash) are discarded. They were measured on a tree that included the stashed changes, and the stash changed the ground.

### Chime and transition: what was driven, what is by construction

**Driven in a browser (Chromium, Playwright, scratch build on :3100):**
- Default launch (no gesture): an expiring focus session on `/` advances, logs, and increments `data-chime-plays` to 1. No "could not play" warning was observed (see FAIL 53). No raw-app error.
- Autoplay flag (`--autoplay-policy=no-user-gesture-required`): Preview schedules two oscillators on one `AudioContext`. A later session end on a fresh document schedules two more oscillators on the same single context. A client-side navigation from `/` to `/settings` mid-chime produces **zero immediate `stop()` calls** on the chime's oscillators and exactly one context. The counters live in the document, so they reset on reload.
- Round trip `/` to `/settings` to `/` (criterion 41/58 e2e): a session that expires while `/settings` is open plays exactly once (`data-chime-plays` 1). Returning to `/` by the back link does not re-announce it: the polite live region does not read "Focus complete". **This asymmetry is deliberate** (the chime fires for an advance observed on any route, the announcement only on `/`). It is not reported as a bug.
- Reload into an expired run: no chime, no announcement. Refocus or visibility events after an advance: still one play.

**By construction only (unit, fakes):** `play()` returns `played`, `blocked`, `unsupported` or `failed` and always resolves; each path's warning count; node hygiene over 20 chimes; suspended-context wake; 45's 2.0 s bound; gain envelope. Nothing here proves an audible result.

**Not driven, unresolved:** a real audible result, any level's loudness, and the blocked-path warning in a real default browser (FAIL 53).

### Repro steps for failures

1. **Criterion 53, real-browser warning missing (historical; the cause is fixed, see the amendment).** The repro fails on the build made before the fix, which is what `out/` still holds.
   Command: `npx playwright test -c e2e/scratch-3100.config.ts e2e/chime-audio-blocked.spec.ts --reporter=line --workers=1` (after `next build` of the current tree, served on :3100).
   Expected: exactly one console warning containing "session chime" when a session expires on `/` with no gesture.
   Actual: `Expected length: 1, Received length: 0`. `data-chime-plays` reaches `1`, and only Chrome's own "AudioContext was not allowed to start" warnings appear.

2. **Criterion 1, heading clause (resolved by ruling; no longer a repro).**
   Command: `npx playwright test -c e2e/scratch-3100.config.ts e2e/session-lengths.spec.ts -g "criterion 1, 2, 7"` after changing nothing (this spec asserts the legend clause and `h1` count only; the heading-level clause is the owner's call). Expected under the literal criterion: a visible `h2` (or equivalent) per new section. Actual: no `h2` in the route. Owner or frontend to decide.

3. **Pre-existing gates (criterion 76).**
   `npm run typecheck` → `41 errors` in `lib/db/*.test.ts` and `components/TaskForm.test.tsx`. `npm run build` → fails at "Running TypeScript" for the same files.

### Manual verification (chime audibility): DONE — PASS (owner, 2026-11-11)

**The owner ran the eight by-ear steps below and reported all of them working.** Criterion 42's audibility
clause and criterion 43's audible Preview are therefore **PASS on owner verification**, recorded by the
orchestrator. Device and browser were not stated; the confirmation covered the eight steps as a set rather
than step by step. QA itself never heard the chime and marked nothing audible as PASS — this PASS rests
entirely on the owner's ears, which is what the step was for.

The steps as run:

1. Focus end: set Focus to 1 min on `/settings`, start on `/`, let it end. One chime. Note the level used.
2. Break end: same with Short break 1 min. One chime, same sound.
3. Preview on `/settings` with sound on, then with sound off. Both play. Note whether the off-state Preview is what the copy promises.
4. Over a playing soundscape: start the soundscape, then run step 1. The chime is heard over it, and the soundscape is not ducked, cut, or re-ramped by the chime.
5. Level 1 and level 100: set the volume slider to 1, Preview; then to 100, Preview. Both are audible at the expected difference; level 0 is silent.
6. Length: the whole chime finishes within about two seconds, with no click at start or end.
7. Reload immediately after a chime: no second chime (criterion 57, by ear).
8. Refocus after an advance: no second chime (criterion 58, by ear).

**Result:** all eight confirmed working by the owner on 2026-11-11. If a later regression is suspected in the
chime's audible behaviour, these eight steps are the reproduction set — automation cannot decide them, so they
must be re-run by ear rather than inferred from the mocked call counts in `lib/audio/chime.test.ts`.

### Amendment (second pass, after the criterion 53 fix)

**Scope of this amendment.** The coordinator's note asked for the verdict and the affected criteria to be updated, and for two additions to the tests. It did not ask for the measurement sweep or the e2e suite to be re-run, and neither was re-run. Every group I figure above stands. Nothing visual changed.

**Background, verified.** The defect behind criterion 53: a resume that never settles (Chrome under autoplay policy, no gesture) left `play()` awaiting forever. The chime's lease never released, so the engine's open-chime count (`chimesInFlight`, `lib/audio/engine.ts`) stayed above zero, which stops the context suspending for the life of the page. The fix is in `lib/audio/chime.ts`: `settleWithin(lease.ready, 500 ms, false)`. A pending resume is then classified `blocked`, the schedule is abandoned, one warning is logged, and the lease releases. Frontend's dev-server run confirmed the symptom; it is not counted as QA evidence.

**Tests added (unit, fake timers, the existing fake-context harness):**
- `lib/audio/chime.test.ts`, criterion 53 (real browser), three cases:
  1. A pending-forever resume resolves `blocked` within the bound, warns exactly once, leaves no chime node live, and the context can suspend again. Suspension is asserted by a later chime that does play, followed by silence, which suspends the running context only if the earlier lease has released.
  2. A resume that settles after the bound is ignored: no second outcome, no second warning, no extra node change, plays count stays at 1.
  3. A context already running takes the synchronous path: `played` with no timer advance, and no timer left pending.
- `lib/settle-within.test.ts` (new), five cases: resolves with the value when the promise wins; clears its timer when it wins; resolves with the fallback at the bound (not before); resolves with the fallback on rejection without throwing; ignores a late settle after the bound.

**Red-proof (scratch copy, not the real tree).** A copy of `lib/` was mutated to restore the pre-fix `await lease.ready`. The two hang tests then fail on the 5 s test timeout. So they discriminate the defect. The suspension assertion sits after the hang in case 1, so it is masked by the timeout in this mutant and is **not separately proven red by this mutant**. The targeted mutant that proves it is in the "Third pass" section below.

**Results.** `chime.test.ts` and `settle-within.test.ts`: 20 of 20 pass on the fixed tree. Full unit suite: 272 files, 1287 tests, **12 failed files and 59 failed tests**, the same files and tests as the HEAD baseline (no new failures). Typecheck: **41** errors, all pre-existing.

**Criterion 1 ruling (orchestrator).** The heading-level clause is satisfied by the `fieldset`/`legend` convention the route already uses for "Timer gauge". A `legend` is the correct element for a group of form controls and supplies the group's accessible name. There are no section headings, so no level is skipped. The implementation follows the convention the owner chose when they asked for the existing panel to be extended. **Criterion 1: PASS**, attributed to the orchestrator's ruling.

**Criterion 53: PASS on the unit evidence above.** The real-browser confirmation is **BLOCKED, not passed**. `e2e/chime-audio-blocked.spec.ts` serves a static `out/` build. `npm run build` cannot regenerate `out/`, because it fails at the type check on the 41 pre-existing errors in `lib/db/*.test.ts` and `components/TaskForm.test.tsx`. So the e2e spec can only run against the stale pre-fix build, where it fails as recorded in repro 1. A fixed-build browser run needs either the pre-existing type errors cleared, or a build that excludes test files, which QA did not do for the real repo. Until one of those happens, the browser-level guarantee for this fix is unverified.

**View on the timer-ban guard intent (for reviewer and owner).** Moving the timer to `lib/settle-within.ts` satisfies the literal scope of the guards (criterion 46 covers `chime.ts`, and the engine and gauge guards cover their own files). Whether it satisfies the intent is a narrower question, and my view is that it **mostly does, with one caveat that the wording should not hide**:
- The intent, as the criteria state it, is that no JS timer drives the chime's sound and that teardown is scheduled on the audio clock. The timer here does not schedule, shape or time any sound. In the audible path (a running context) it is a `clearTimeout` on a promise that has already resolved, so no sound depends on it. A suspended context's clock does not advance, so the audio clock genuinely cannot bound the wait, which is a real design reason.
- The caveat: in the blocked path the timer's outcome calls `abandon()`, which issues an immediate `stop()` on the chime's oscillators. So a JS timer does trigger a node stop. In that path the context is not running, so nothing audible is cut, but the literal wording of criterion 38 ("no stop issued before the scheduled end") is met only because the stop is classified as a refusal, not a cut. That deserves an explicit note.
- The doc comment in `lib/settle-within.ts` currently gives the constraint as the reason ("Lives outside `lib/audio` because the audio code holds no JS timer"). That is the reason the file was placed to pass a guard. The design reason is the one above: the audio clock cannot time a suspended context. The comment should say so, so a future reader does not treat the placement as the rule. I have not edited it (QA does not edit application code).
- Verdict on intent: **the merits favour the fix, and the intent is honoured for the audible path; the blocked-path stop is a judgement call the owner should explicitly accept.**

**Verdict, restated.** **FAIL, on criterion 76 only**, for reasons pre-existing to this task. Every other criterion is PASS, PASS-unit, PARTIAL, or NOT DECIDABLE as listed above. Criterion 53 is PASS on unit evidence with its browser confirmation BLOCKED. Criterion 1 is PASS by ruling. Criterion 9 has its literal exception awaiting ruling. Audibility is undecided until the owner runs the manual steps.

### Third pass (reviewer findings 1, 2, 8 and the seed addendum)

No measurement sweep or e2e suite was re-run. Group I stands. The manual audibility section is unchanged.

**Finding 1, guard for the one sanctioned timer: addressed.** `lib/timer/task-017-guards.test.ts` now scans `lib/settle-within.ts` in the criterion 46/74 set. The single sanctioned line, `const timeout = setTimeout(() => resolve(fallback), ms);`, is exempt by exact line text. The file must contain exactly that one timer line and no other timer or frame source. The reason stated in the guard is the design (a suspended AudioContext's clock does not advance, so the audio clock cannot bound that wait; the timer classifies an outcome and never schedules, shapes or times a sound), not the file's location. **Red-proof (scratch copy):** a second `setTimeout` added to `lib/settle-within.ts` fails the guard ("the task's new and changed settings and clock files add no timer…"). The guard passes on the real tree (8 of 8).

**Finding 2, the suspension clause, targeted mutant: addressed, and the clause is now proven red.** The mutant keeps the 500 ms bound and drops the lease release from `abandon()` (the blocked path no longer calls `lease.release`, so `chimesInFlight` stays above zero). Result: `lib/audio/chime.test.ts` case 1 ("a pending-forever resume…") **fails on the suspension assertion**: `expected 'running' to be 'suspended'`, with the message "a hung chime must not wedge suspension". The earlier timeout-based red-proof is superseded by this. Case 1 passes on the real tree.

**Finding 8, the dark-sweep retirement: addressed by correcting the comment, rows not restored.** The `dark-sweep` retirement comment now says what is and is not covered, per row:
- The custom duration field (running, disabled): retired, the field is never disabled (criterion 14).
- The disabled submit: still measured in `e2e/dark-contrast.spec.ts` ("criterion 26, 43"), in both themes. The old claim that the rows were "still covered by the task dialog sweep" was wrong and is removed.
- **The three task-form fields with the disabled attribute forced: NOT measured anywhere now.** The shipped form never disables them, so this was a what-if state. I did not restore the rows, because that would mean editing a skipped test and running it, which this pass did not do. Acceptable because no shipped state reaches those fields; a future task that disables a task-form field must add its own rows.

**Seed addendum, `e2e/helpers/timer-hold.ts`: addressed.** The break lengths in the seed now come from `DEFAULT_SHORT_BREAK_MINUTES` and `DEFAULT_LONG_BREAK_MINUTES` in `lib/timer/constants.ts` (passed into `page.evaluate` as arguments). No `5` or `15` is restated in the helper. The e2e typecheck is clean.

**Finding 10** (carry-focus second writer) is app code and was left alone, as instructed.

**Results.** Full unit suite: 272 files, 1287 tests, **12 failed files and 59 failed tests**, the same as the HEAD baseline. Typecheck: **41**, all pre-existing.

**Verdict, final.** **FAIL, on criterion 76 only**, for reasons pre-existing to this task. Criterion 1 is PASS by ruling. Criterion 53 is PASS on unit evidence, with the real-browser e2e check **BLOCKED** because `out/` cannot be regenerated while the type check is red on pre-existing errors (`e2e/chime-audio-blocked.spec.ts` stays BLOCKED, not passed). Criterion 9 has its literal exception awaiting an orchestrator ruling. Audibility is undecided until the owner runs the manual steps.

### Criterion 62 (axe): run

The axe run was executed as part of `e2e/session-lengths.spec.ts`, across both themes and four states, and passed with zero serious or critical violations. Not a stub. The `accessibility` and `dark-a11y-console` task-list axe failures are pre-existing (HEAD).

### Checks QA did not perform

- No red-proof of any guard by editing application code. QA may not edit `app/`, `components/` or `lib/`. The guards are proven at the unit level against recorded calls and fakes, which is the cheapest discriminating level; the e2e layer covers them where a browser is needed.
- The full 672-test `test:e2e` suite was not run to completion (see Gates).
- `sessions.spec.ts` migration seeds: unverified (task-panel precondition fails at HEAD too).
- Greyscale rendering for criterion 68 and a real clipboard paste for criterion 11.


## Review Findings
(Filled in by reviewer.)
- Verdict: APPROVE | CHANGES REQUESTED
- Findings:

---

## Review Findings
*(reviewer, read-only. Diff reviewed: everything in `git status` against HEAD on `feature/TaskPanel` except this
file. The four owner-stashed files (`app/page.tsx`, `BackgroundLayer.tsx`, `ThemeControl.tsx`, `HeaderNav.tsx`)
are `stash@{0}` and were not reviewed as part of this task. antislop mode: `during`, per ruling 3.)*

### Verdict: **APPROVE**

Ten findings, **none blocking**. The two store migrations — the highest-risk part of this task — hold up under
direct reading of the guards, and the chime is original by construction with no licensing exposure. Everything
below is either a test-gate gap, a latent trap for a later task, or a recorded observation. Nothing needs a fix
loop before this task is called done; findings 1, 2, 8 and 10 are worth landing before the *next* task touches
the same code.

### What was checked, and what held

**Migration invariants (criteria 21, 29, 30, 32) — verified by reading, not taken from the QA Report.**
- `hasValidRunFields` (`lib/timer/store.ts:104-119`) enforces the status/`endTimestamp`/`pausedRemainingMs`
  triple: running must carry an end and no frozen value, paused the reverse, idle and complete neither.
- `hasValidRunIdentity(candidate, true)` (`lib/timer/store.ts:126-141`) enforces `plannedDurationMs` non-null
  **exactly** while running or paused. `if (!hasRun) return plannedDurationMs === null` rejects an idle entry
  carrying a value *and* (because `undefined === null` is false) a current-version entry that omits the key
  entirely — strict in the safe direction. For a live run it requires number, finite, `> 0` and
  `<= MAX_PLANNED_DURATION_MS` (180 min, derived from `DURATION_LIMITS`, not restated), so non-numeric, zero,
  negative and absurd values all fall back. Criterion 32's three new cases are genuinely covered.
- A malformed or tampered **current-version** entry cannot slip through: `merge` (`lib/timer/store.ts:407-412`)
  calls `isPersistedTimerState` on every rehydration regardless of stored version, so `migrate` being skipped on
  a version match is not a hole.
- Criterion 30 is right. `migrateVersionThree` derives the planned duration through `versionThreeDurationMs`,
  which reads the entry's own `focusMinutes` plus `VERSION_THREE_SHORT_BREAK_MINUTES` /
  `VERSION_THREE_LONG_BREAK_MINUTES` (`lib/timer/store.ts:94-95, 230-236`) and never calls `readDurations()`.
  The paused value is then clamped to that derived duration (`lib/timer/store.ts:249-252`), so an upgrade cannot
  shorten a frozen run. The "freeze these to 5 and 15 before moving a default" comment is the right hedge.
- Criterion 29 holds on every path, because all three writers are deferential: preferences `migrate` consults
  the legacy timer entry only when the stored version is `< 3` (`lib/preferences/store.ts:96`), preferences
  `merge` only when there is no entry at all (`lib/preferences/store.ts:105-111`), and
  `carryFocusMinutesToPreferences` returns early whenever the raw preferences entry already carries a
  `focusMinutes` key (`lib/timer/carry-focus.ts:28`). A stored 40 beats a stale timer 50 in both rehydration
  orders. `readLegacyTimerFocusMinutes` requires `version === 3` exactly, so a v1/v2 `customMinutes` is never
  read — the narrowing frontend documented and accepted.

**Timer discipline (the standing rule).** Remaining time is still derived from the stored end timestamp
everywhere: `getRemainingMs` is unchanged, and the one new state-changing tick path
(`components/TimerClockProvider.tsx:40-44`) compares `now >= endTimestamp` rather than decrementing anything.
The only `setInterval` in shipped source is still `hooks/use-timer-clock.ts:25`.

**TypeScript.** No `any` in any new or changed source. Every cast is either the `value as Record<string, unknown>`
narrowing idiom inside a type predicate (every field re-validated before use) or the pre-existing
`window as unknown as { webkitAudioContext?: ... }`. `setDuration`'s computed-key `set({ [key]: minutes })`
(`lib/preferences/store.ts:55-58`) is the one implicit widening; it is sound because `DurationKey` is a closed
union of number-valued keys and `isDurationMinutes(key, minutes)` gates the write.

**Licensing and branding: clean, and verified rather than assumed.** No new file in `public/` (the only audio
asset remains the pre-existing CC0 `rain-865572.m4a`, provenance already in DECISIONS). The chime is two sine
`OscillatorNode`s at 880 Hz and 1318.51 Hz with scheduled gain ramps (`lib/audio/chime.ts:52-55, 107-131`) —
original by construction; frequencies and a perfect-fifth bell are not protectable, and nothing resembles another
product's mark or sound signature. `lib/audio/no-audio-asset.test.ts` is unchanged except the one permitted path
addition, and passes. The slider and checkbox classes in `ChimeSettings.tsx` were copied from this repo's own
mixer, not from outside. No font, image or copy was imported. **Criterion 54 and Risk 8: satisfied.**

### The `lib/settle-within.ts` placement question — my verdict

**It respects the guards' intent, not routes around them — but the move is only defensible if the new boundary is
itself guarded, and today it is not (finding 1).**

Reasoning. The intent criterion 46 states is twofold: no JS timer *drives the sound*, and teardown runs on the
audio clock via `onended`. Both hold where they can. On the audible path the context is already running,
`lease.ready` is `Promise.resolve(true)`, and the timer is created and cleared in the same microtask — it never
fires, and no sound depends on it; teardown comes from the last oscillator's `onended`
(`lib/audio/chime.ts:124-127`). On the blocked path the audio clock is frozen by definition, so it *cannot*
measure the wait: that is a real design constraint, not a convenience. I checked the alternatives before
accepting it — a synchronous `state !== "running"` verdict would misclassify the engine's own idle-suspend (where
`resume()` does settle in tens of ms), and `statechange` can tell you the context started but can never tell you
it never will. A bounded wait is the only available answer. The current doc comment states that design reason,
which is the right framing; the trailing clause "which is why it does not belong in `lib/audio`" still reads as
placement justification and could go.

I also agree with the orchestrator's ruling 6 on criterion 38, with qa's qualifier kept visible: `abandon()` runs
only on the `blocked` / `failed` outcomes, i.e. when the context never started, so nothing audible is truncated,
and it nulls `onended` before stopping so teardown cannot double-fire (`lib/audio/chime.ts:136-146`). Criterion 38
is met because the stop is a refusal rather than a cut. That qualifier should go into the DECISIONS entry so a
later reader does not take "no stop before the scheduled end" as absolute.

### Findings

**1. The timer-ban guard does not cover `lib/settle-within.ts`. (medium, test-only — qa)**
`lib/timer/task-017-guards.test.ts` lists eleven files in its criterion 46/74 scan and omits the one file that
actually holds the new `setTimeout`. The whole defence of the placement is now the module boundary, and the
boundary is ungated: a later task can add a second timer to that file, or widen `settleWithin` into something
that does schedule sound, and no gate fires. Add `lib/settle-within.ts` to the scanned set with a single
exact-text exemption for `const timeout = setTimeout(() => resolve(fallback), ms);`, mirroring the
`MAX_PLANNED_DURATION_MS` exemption the same file already uses for criterion 23. That turns "one bounded wait,
and only one" into an asserted property instead of a convention.

**2. The masked suspension assertion is worth the second mutant. (medium, test-only — qa)**
qa's own open item. It matters more than its framing suggests: the hang was the *symptom*, but the defect that
froze the context for the life of the page was `chimesInFlight` never returning to zero. The red-proof currently
discriminates only the hang. A mutant that keeps the 500 ms bound and drops the `release` from `abandon()` is a
one-line scratch edit and would prove the clause the fix actually turns on. Not blocking, because the code path
is legible — `release` is idempotent via the `released` flag (`lib/audio/engine.ts`, `release`), and
`lib/audio/chime.ts:149-169` reaches it from exactly four named places — but it is cheap and it closes the one
gap qa declared.

**3. A partial schedule failure orphans nodes on the destination. (low, correctness — frontend, if ever touched)**
`lib/audio/chime.ts:107-132`: if `createOscillator`/`createGain` throws on the second note, `schedule` never
returns, so `abandon` is still `null` and `play`'s catch takes the `lease?.release(0)` branch
(`lib/audio/chime.ts:166`). `liveNodes` stays honest because `retain` runs last, but the first note's gain node
is left connected to `context.destination` and is never disconnected. Realistically unreachable, and the
envelope's opening `setValueAtTime(0, …)` means the orphan is silent. A `try/finally` around the loop, or
building the node list before connecting anything, would close it. Not worth a round trip on its own.

**4. `chimesInFlight` is released only from `onended`. (low, latent — note for the next engine task)**
`lib/audio/engine.ts:190` makes idle-suspend conditional on `chimesInFlight === 0`, and on the success path the
decrement comes solely from the last oscillator's `onended` (`lib/audio/chime.ts:124-127`). If something outside
the app suspends the context mid-chime — OS audio focus, a `statechange` the engine does not observe — `onended`
never fires and idle-suspend is disabled for the rest of the page's life. Same failure class as the criterion 53
defect, reached through a different door; `settleWithin` bounds the *start* only. No criterion reaches it and a
second timer would be the wrong cure, so this is recorded rather than requested: the invariant a later task needs
to know is "the lease releases on `onended` and nowhere else."

**5. The clock now runs on every route. (low, performance — accepted consequence of ruling 3)**
`TimerClockProvider` sits in `app/layout.tsx`, so `useTimerClock` ticks at 250 ms on `/settings` and `/stats`
while a run is counting, even though only `/` consumes `now`. The cost is bounded: `children` arrives as a
referentially stable element from the server-rendered layout, so React bails out of the subtree and only the
provider itself plus context consumers re-render. This is the price of the owner's "chime on every route"
ruling and is the right trade; recorded so the next person profiling `/stats` knows why the interval is there.

**6. `useRef` with a store read in its argument. (low, concurrent-safety — frontend)**
`components/PomotatoTimer.tsx:76`: `useRef(useTimerStore.getState().lastAdvance?.endedAt ?? null)`. Unlike
`useState`, `useRef`'s argument is evaluated on **every** render, so this reads mutable external state during
render on each pass — the pattern React's concurrent rules warn about, since it is neither a
`useSyncExternalStore` subscription nor an effect. Only the first value is kept, so there is no bug today.
`useState(() => …)` for the seed, or seeding in a mount-only effect, costs nothing and removes the smell.

**7. Three fields now triple the per-keystroke alert surface. (low, accessibility — pm's call, not a defect)**
`components/DurationField.tsx:74-78`: the error node carries both `role="alert"` and the `aria-describedby`
target, and `handleChange` revalidates on every keystroke, so typing `abc` fires three successive alert
announcements, each also being the field's description. This is exactly the pattern `FocusLengthInput` shipped,
so it is not a regression, and criterion 5 is met as written — flagged only because moving from one field to
three triples the surface a screen-reader user hits. Validating on blur, or dropping `role="alert"` and leaving
the node as the description, would be quieter. Scope decision, not mine to make.

**8. One retirement dropped coverage criterion 70 did not authorise. (low, test — qa)**
`e2e/dark-sweep.spec.ts:434` retires by `test.skip` on a test that measured **three** things, only one of which
criterion 70 covers: the duration field's disabled state, *plus* the forced-disabled task Title and Estimated
pomodoros fields, *plus* the disabled submit, each light-vs-dark. The disabled submit is still measured in
`e2e/dark-contrast.spec.ts:248`; the two forced-disabled task-form rows are now measured **nowhere** (no other
spec matches "forced disabled"). The loss is genuinely small — the test's own comment records that the shipped
form never disables those fields, so the rows measure a hypothetical state — but the retirement comment's claim
that they are "still covered by the task dialog sweep" is not accurate for those two rows. Either split the test
so the task-form rows keep running, or correct the comment. Correcting the comment is the minimum; an inaccurate
retirement note is how a figure gets lost for good.

**9. Dead validation branch. (cosmetic — frontend)**
`lib/preferences/store.ts:65`: `setChimeEnabled` re-checks `typeof enabled === "boolean"` on a parameter already
typed `boolean`. Unreachable, and inconsistent with the sibling setters, which either route through
`sanitizePreferences` or guard a genuinely unsound input (`isLevel`, `isDurationMinutes`).

**10. A second, unversioned writer to `pomotato-preferences`. (low, latent trap — note for the next preferences task)**
`lib/timer/carry-focus.ts:34-37` writes `{ state: sanitizePreferences(state), version: PREFERENCES_VERSION }`
straight into storage on the pre-hydration branch. It is correct **today** only because `migratePreferences` is
literally `sanitizePreferences` (`lib/preferences/schema.ts:187-189`). The day a v3 → v4 preferences migration
does anything more than sanitise, this writer will stamp the new version number onto un-migrated data and the
real `migrate` will then be skipped on the version match. The branch is also near-dead in the shipped app, since
`hooks/use-hydrate-timer-store.ts:18` rehydrates preferences first — which is itself worth noting, because the
whole carry's correctness leans on that one line. Routing the write through `migratePreferences`, or a comment
at both ends naming the coupling, would keep them tied together.

### On the orchestrator's three rulings

**Ruling 4 (criterion 1, heading clause): agree.** `<legend>` is the correct element for a group of form
controls and supplies the group's accessible name; the route keeps one `h1` and has no section headings, so no
level is skipped and the new sections match the convention "Timer gauge" already set. The alternative — adding
`h2`s — would have left headings and legends doing the same job on the same groups, which is worse markup, not
better.

**Ruling 5 (criterion 9, literal exception): agree.** Criterion 9's own wording scopes to *shipped* source, and
`lib/db/test-utils.ts:45` is a pre-existing Dexie fixture seed. Independently confirmed: the only
`MS_PER_MINUTE` multiplications in shipped source are `lib/timer/time.ts:16` and the exempted
`MAX_PLANNED_DURATION_MS`. One adjacent note that is not a criterion violation but will bite:
`e2e/helpers/timer-hold.ts:42` now hard-codes `5` and `15` for the break lengths in its seed, which is a third
home for those two numbers and will seed wrong planned durations the day a default moves. Importing
`DURATION_LIMITS` into the helper would fix it.

**Ruling 6 (blocked-path `stop()` vs criterion 38): agree, with qa's qualifier kept.** See the settle-within
verdict above.

### Consequences noted, not charged to this task

- **Criterion 76 / criterion 53's browser clause.** The 41 pre-existing type errors in `lib/db/*.test.ts` and
  `components/TaskForm.test.tsx` keep `npm run build` from regenerating `out/`, so
  `e2e/chime-audio-blocked.spec.ts` can only run against the stale pre-fix build. The chime's blocked path is
  therefore PASS on unit evidence with **real-browser confirmation blocked, not passed**. The cause predates
  this task; the consequence is that one shipped behaviour has no browser-level proof. Clearing those 41 errors
  unblocks it and is the single highest-value follow-up in the repo right now.
- **Audibility is undecided, correctly.** Nothing in this review treats a mocked call count as proof of sound.
  `data-chime-plays` counts `play()` *calls* (incremented at `lib/audio/chime.ts:150`, before the lease), so it
  reads as "a chime was attempted", not "a chime was heard" — which is the honest thing for it to be, and is
  documented. The eight by-ear steps still need a named person and device.
- **Criterion 77** (the DECISIONS entry) is not in this diff; `docs/DECISIONS.md` is unmodified. Orchestrator-owned,
  flagged only so it is not lost. When it lands it should carry the criterion 38 qualifier above and the
  `VERSION_THREE_*` freeze note from `lib/timer/store.ts:88-95`.
