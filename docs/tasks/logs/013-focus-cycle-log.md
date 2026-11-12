# Automatic focus cycle, a four-dot counter, and a customizable Focus length — history log

Appended by frontend/backend/qa/reviewer/orchestrator after implementation began.
The task's goal, scope and acceptance criteria are in [../013-focus-cycle.md](../013-focus-cycle.md).

## Implementation Notes
(Filled in by frontend/backend as they build. Decisions, tradeoffs, anything the next agent needs to know.)

### Backend (data layer) — done, frontend next

**Type split, and why this direction.** `SessionMode = TimerMode | LegacySessionMode` (`LegacySessionMode = "custom"`), in `lib/db/types.ts`. Chosen over an independent four-value `SessionMode` because the stored union must always be a superset of what the timer can produce: a new selectable mode becomes loggable automatically, and shrinking `TimerMode` can never remove `"custom"`, since it is named explicitly. `lib/db/session-modes.ts` additionally keys an exhaustive `Record<SessionMode, true>` and derives `SESSION_MODES` from it, so dropping `"custom"` from the union or the list fails typecheck. Likewise `lib/timer/modes.ts` has `TIMER_MODES` (exactly three) from an exhaustive `Record<TimerMode, true>`, plus `isTimerMode`. `isSessionMode("custom")`, `isFocusTypeMode("custom")` stay true; the repository's validation message is unchanged. Criterion 4 needs no repo change (it already runs on `SessionMode`).

**Renames (frontend must follow).**
- store/persisted field `customMinutes` -> `focusMinutes`; action `setCustomMinutes` -> `setFocusMinutes` (no-op while a Focus run is running or paused; also ignores a non-integer or out of 1-180 value).
- `parseCustomMinutes` -> `parseFocusMinutes`, `FocusMinutesResult`.
- constants: `DEFAULT_CUSTOM_MINUTES` / `CUSTOM_MINUTES_MIN/MAX` -> `DEFAULT_FOCUS_MINUTES` / `FOCUS_MINUTES_MIN/MAX`; the old fixed `FOCUS_MINUTES` is gone; new `CYCLE_LENGTH = 4`.
- `fullDurationMs(mode, focusMinutes)`: focus = `focusMinutes * 60000`, breaks fixed 5 and 15.
- `MODE_LABELS` has three keys.

**New persisted field.** `cyclePosition: number`, integer 0-4, in `PersistedTimerState`. Persist version is 3.

**Pure helper.** `lib/timer/cycle.ts` `nextCycleStep(completedMode, position) -> { nextMode, nextPosition }`. Focus: position = min(p+1, 4), long break when it reaches 4 else short. Short break: back to focus, position unchanged. Long break: focus, position 0.

**Advance (`completeIfExpired(now)`).** One-shot, guarded by `status === "running"`, no per-tick work. Credits the run (same `logRunCompletion`, same runId dedup), then sets the next mode and cycle position in the same `set`. `nextEnd = completedEndTimestamp + fullDurationMs(nextMode)`; never reads the wall clock for the anchor. If `nextEnd > now`: `status: "running"`, fresh `runId`, `startedAt = completed end`. Otherwise (one-step bound, criteria 19 and 36-38): `idle` at the next mode, no run. The cycle's status never rests at `complete` via this path; `start()` still accepts `complete` for hand-edited or legacy state. Reload uses the same function, so an expired run advances exactly one step.

**New non-persisted store field for the announcer (criterion 34).** `lastAdvance: TimerAdvance | null` where `TimerAdvance = { completedMode, nextMode, started, endedAt }` (exported from `lib/timer/store.ts`). Set by every advance; `endedAt` is unique per advance so it works as a change key. It is cleared in `onRehydrateStorage` after the reload advance, so a reload announces nothing. Frontend builds "Focus complete. Short break started." from it (use `started` to choose the wording when it landed idle).

**Reset.** `reset()` clears the current run only; `focusMinutes` and `cyclePosition` untouched. `selectMode` does not touch `cyclePosition`.

**Migration.** v1 runs `migrateVersionOne` then `migrateVersionTwo`; v2 runs `migrateVersionTwo`; v3 is validated and passed through; anything malformed returns defaults. v2 -> v3: `custom` becomes `focus` with `customMinutes` as `focusMinutes`; any other mode keeps its mode and gets 25. Running keeps `endTimestamp`/`runId`/`startedAt`; paused keeps its frozen value clamped to the new full duration; `cyclePosition` 0. A legacy custom run's v1 `runId` is still derived from the stored mode `"custom"`, so the dedup key matches what an old build would have written.

**Two validation paths (criterion 41).** Legacy guards `isVersionOneTimerState` / `isVersionTwoTimerState` accept `"custom"` and `customMinutes`, and are reachable only from `migrate`. `isPersistedTimerState` (current shape) uses `isTimerMode`, so rejects `"custom"`, and requires `focusMinutes` 1-180 integer and `cyclePosition` an integer 0-4; it runs in `migrate` at v3 and on every `merge`. A bad current entry falls back to defaults.

**Known test fallout (qa's, not touched).** `lib/timer/store.test.ts` and `lib/timer/time.test.ts` use the old names and `"custom"` (22 failures, listed under criterion 55). `components/background.guards.test.ts` "lib/timer ... have an empty diff against HEAD" now fails because `lib/timer` changed; that is a HEAD-diff assertion of the kind criterion 57 forbids, and qa must retire or re-point it. The two 012 failures are unchanged.

**Frontend typecheck inheritance.** After this change `npm run typecheck` is red only in `components/` and in the two timer test files; `lib/` and `lib/db` are clean, `npm run lint` has 0 errors.

### Frontend (UI half)

**Files.** New `components/CycleDots.tsx`. Changed `components/ModeSelector.tsx` (chips come from `TIMER_MODES`, three), `components/PomotatoTimer.tsx`, `components/CustomDurationInput.tsx`, `app/globals.css` (a `.cycle-dot` block appended; no custom property added, no palette value changed).

**Focus-length field: kept at the old path, renamed inside.** The file is still `components/CustomDurationInput.tsx` because three passing unit suites (`TimerSurface.tokens.test.ts`, `token-foundation.test.ts`, `palette.tokens.test.ts`) list it by path and I may not edit them; qa should rename the file when it re-points them. The export is now `FocusLengthInput`, the label is "Focus length (minutes)", and the ids are `focus-length` / `focus-length-error` (were `custom-duration`), so the e2e selectors in criterion 55 move too.

**Field in every mode (owner ruling, criterion 7 reworded).** The field is always rendered and always sets the next Focus run's length. It is `disabled` only when `mode === "focus"` and status is `running` or `paused`, the same condition `setFocusMinutes` no-ops on; a running or paused break leaves it interactive and the break's own countdown is untouched (the display length comes from `fullDurationMs(mode)`). The earlier reserved `min-h-[4.25rem]` slot is gone; its position in the stack is unchanged, so auto-advance moves nothing (criterion 35 holds trivially). Verified with a throwaway Testing Library check (deleted afterwards): disabled for focus running and paused, enabled for focus idle, short break running and paused, and a write during a break lands in the store.

**Hand-off for qa (required).** `components/CustomDurationInput.tsx` must be renamed to `components/FocusLengthInput.tsx` (the export is already `FocusLengthInput`; the old name contradicts it). The rename means updating the path in `components/TimerSurface.tokens.test.ts` (lines 40, 94), `components/token-foundation.test.ts` (122) and `components/palette.tokens.test.ts` (85), plus the one import in `components/PomotatoTimer.tsx`, which I will not change until the tests move. The input id changed `custom-duration` to `focus-length` and the error id to `focus-length-error`; every e2e spec in criterion 55 that selects `input[id="custom-duration"]` needs the new id.

**Dots.** Placed in a `gap-1` wrapper with the chip row, inside the existing `gap-8` stack, so dots-to-chips is far smaller than dots-to-digits (criterion 23). Group is `aria-hidden`; one `sr-only` `<p>` (not a live region) carries the position. Every dot is one 16 px box with a 2 px border in all four treatments, so the group never changes size (criterion 35). Colours are existing tokens only: done and ring stroke `--accent-foreground`, pending fill `--control-border`. Pending is also smaller (4 px transparent border, padding-box background) and the ring is unfilled, so the differences survive greyscale. Forced colours use `CanvasText`/`GrayText`/`Canvas` and no animation; size and fill carry the difference.

**Motion purpose (R-19, R-31).** The pulse (CSS keyframes, 1.6 s, pending colour to done colour, `.cycle-dot[data-treatment="active-running"]`) marks one real transient state, a Focus run counting down. It exists only when `status === "running"`; idle and paused paint the static ring. `prefers-reduced-motion` sets `animation: none` and the transparent fill, which is exactly the ring: no new colour (criterion 47). No glow, no JS timers in the dot file (criterion 46).

**Break modes paint no active dot.** Criterion 27 ("short break running: done, pending, pending, pending ... no dot active") and criterion 25's wording ("in a break mode ... the active dot shows the static ring") disagree; I followed 27 because it is the concrete sequence. During a break, dots below the position are done and the rest pending. qa: criterion 25 as worded would assert a ring in a break and fail; it needs re-wording or a ruling.

**Reachable state: `mode === "focus"` with `cyclePosition === 4`** (long break skipped via the chip row; reset and selectMode leave the position alone). Rendered as four done dots, no active dot, no ring and no pulse even while that Focus run is running. Reason: four Focus runs really are done, and a fifth dot does not exist. The index is never out of range; nothing silently disappears. The hidden sentence there reads "Focus, 4 of 4 runs done, long break owed", which is accurate (it matches `/\b[0-4] of 4\b/` and says why). Other sentences: Focus at position p<4 is "Focus {p+1} of 4"; a break is "Short break, {p} of 4 focus runs done". qa should test the position-4 Focus state.

**Announcer (criterion 34).** The existing polite `<p role="status">` in `PomotatoTimer` is widened, no region added. A second effect reads the store's `lastAdvance`, dedupes on its `endedAt`, and sets "Focus complete. Short break started." ("... Short break ready." if it landed idle under the one-step bound). The old "wipe when leaving complete" branch is removed so nothing erases it. The text is emptied after 10 s so the next advance, which often reads identical words, changes the live-region text and is announced again. Reloads announce nothing because the store clears `lastAdvance` before `hasHydrated` flips. The status-based "X complete" path is kept for a persisted or hand-edited `complete`.

**Gates.** Lint 0 errors. Typecheck errors remain only in `lib/timer/store.test.ts` (18) and `lib/timer/time.test.ts` (5). Not run: e2e, build, a live keyboard/mobile pass in a browser; the layout reasoning (320 px: dots row is 76 px wide, the field slot is full-width) is from the code.


## QA Report
(Filled in by qa, 2026-10-28. Group H was measured in the same single sweep as 012 group D; see 012's QA Report for the sampler and the Start-row method note.)
- Verdict: **FAIL**
- Failing or unmet: 4 (no test added), 11 (no reload test for focus length), 46 (literal file scope: `components/PomotatoTimer.tsx:81` has a one-shot `setTimeout`), 49 (visible focus not re-checked), 52 (greyscale not run), 53 (forced colours not run), 55 (87 e2e failures remain, including the dark-sweep disabled-field measurement), 58 (`test:e2e` not green). Not measured in this pass: 59 is the orchestrator's DECISIONS entry and was not verified.
- Tree and gates: as in 012's report. Unit: 36 files, **1065 passing**, 0 failing. Typecheck **0**. Lint **0 errors, 20 warnings**. Build exit 0, routes exact. E2E (scratch :3100): **569 passed, 87 failed, 2 skipped** of 658.

### Criteria
A. Mode model
1. PASS. `TIMER_MODES` is exactly `focus, shortBreak, longBreak`; an exhaustive `Record<TimerMode, true>` fails typecheck on a fourth mode (`components/focus-cycle.guards.test.ts`).
2. PASS. `ModeSelector` renders three radios, Focus / Short break / Long break; no `value="custom"` and no "Custom" text in app source (guard and `components/FocusLengthInput.test.tsx`).
3. PASS. `SESSION_MODES` is four values including `custom`; `isSessionMode("custom")` and `isFocusTypeMode("custom")` are true; `StatsSession["mode"]` includes `"custom"` (guard).
4. NOT COVERED. No seeded `custom` row was added to a test through `logCompletedSession` and `aggregateStats`. `lib/stats/aggregate.test.ts` carries a `custom` fixture but was not re-verified against this criterion. Gap, not a pass.
5. PASS. `fullDurationMs` gives 5 and 15 minutes for the break modes at any stored Focus length, and `focusLength * 60000` for Focus (`lib/timer/time.test.ts`).
6. PASS. Same mode is a no-op while running; a different mode discards the run and lands idle; the cycle position is unchanged (`lib/timer/focus-cycle.test.ts`).

B. Focus length
7. PASS (reworded version tested). The field is present in every mode; disabled only for a Focus run that is running or paused; a write during a break lands and leaves the break's end unchanged (`components/FocusLengthInput.test.tsx`). Label "Focus length (minutes)"; id `focus-length`.
8. PASS. Initial value 25; `""`, `0`, `-3`, `2.5`, `181`, `abc` rejected with `aria-invalid`, `aria-describedby` and the error text; the stored value keeps its last valid entry. The `25:00` display itself is not asserted by a unit test.
9. PASS (store). Entering 50 sets the store to 50. The `50:00` display text is not asserted.
10. PASS. `setFocusMinutes` is a no-op during a Focus run that is running or paused; the field is `disabled`.
11. NOT COVERED. Focus-length persistence across a reload is not asserted (the cycle position is: criterion 28). Gap.
12. PASS. Break durations are independent of the Focus length (`fullDurationMs`). The on-screen `05:00` is not asserted.

C. Automatic advance
13. PASS. A Focus run reaching zero is already `running` as a break (`lib/timer/focus-cycle.test.ts`, and `focus-cycle.spec.ts` with a 1-minute run and a fake clock).
14. PASS. Break to Focus auto-starts; Focus to break auto-starts (unit, and the 8-run cycle).
15. PASS. `endTimestamp - E` equals the break's full duration exactly; read from `localStorage["pomotato-timer"]` (unit).
16. PASS. Eight steps, each completion noticed 1.5 s late: the long break's end is exactly `T0 + 2,040,000` ms, no tolerance (unit).
17. PASS. Fresh `runId`; `startedAt` equals the completed run's `endedAt` (unit).
18. PASS. A cycle logs exactly 8 rows (4 focus, 3 shortBreak, 1 longBreak) with 8 unique runIds (unit, `logRunCompletion` mocked).
19. PASS. A break whose derived end is already past lands idle (unit).
20. PASS. Completing the long break sets the position to 0 and starts Focus 1 of 4 (unit).
21. PASS. Reset during an auto-started run leaves the mode, the position and the Focus length (unit).
22. PASS. Pause and resume work on an auto-started break; a paused break does not advance (unit).

D. Cycle counter
23. PASS. Dot group sits between the chip row and the digits; gap above is smaller than gap below at 1280x800 (`focus-cycle.spec.ts`).
24. PASS. Four treatments across every mode, status and position; `CycleDots.test.tsx` asserts that only the four appear.
25. PASS (reworded version tested). Dots pulse only in a running Focus run; in a break, no dot is active at any status.
26. PASS. Position is `min(p+1, 4)`; Focus at 4 keeps 4 and advances to the long break (unit).
27. PASS. The sequence of eight treatments, asserted at each step (`CycleDots.test.tsx`).
28. PASS. Integer 0 to 4 in `localStorage`; survives a rehydrate in idle, running and paused, at version 3 (unit).
29. PASS. Only a completed Focus run (+1) and a completed long break (to 0) change the position (unit).
30. PASS. Reset, manual selection (including Long break at position 2), Focus-length edit and pause/resume leave the position alone. Navigation to `/stats` and back is not tested.
31. PASS (no focusable element; click is a no-op). Tab order through `/` not re-measured.
32. PASS. The hidden sentence matches `/\b[0-4] of 4\b/`, updates with the position, and is not a live region.
33. PASS. The live-region set in the `/` tree is pinned by value and matches (guard).
34. PASS. The announcer reads "Focus complete. Short break started." after an advance (`focus-cycle.spec.ts`).
35. PASS. Digits top identical before and after an advance at 1280x800 and 320x700; the dot group's box does not change size (`focus-cycle.spec.ts`).

E. Reload into an expired run
36. PASS. A Focus run expired two hours ago: one `sessions` row, position +1, mode switched, idle (unit, and an IndexedDB count of 1 in `focus-cycle.spec.ts`).
37. PASS (unit). Expired long break gives position 0 and idle. The ring state after reload is not asserted.
38. PASS. Expired break: one row, Focus, idle, and no announcement (unit and e2e).

F. Persistence and migration
39. PASS. Version 3; v2 custom becomes focus with `customMinutes` as the Focus length; other v2 modes get 25; running and paused runs carry over with the paused value clamped; position 0 (unit, `migrate` called directly).
40. PASS. v1 to v3 path (unit).
41. PASS. The legacy guard accepts `custom` on migrate; the current guard rejects it on merge; the store ends on a selectable mode (unit).
42. PASS. Six hand-edited cases (fractional, -1, 5, NaN, missing, `custom`) fall back to the defaults (unit, `it.each`).
43. PASS (e2e, five states: idle, running, paused, complete, mid-break). No hydration message is logged. Expired-while-closed is covered by 36 but not in the console check.
44. PASS. The only interval is `hooks/use-timer-clock.ts`'s one `setNow(Date.now())` tick; no store path decrements a stored value (guard).

G. Motion and accessibility
45. PASS. Idle: two region frames one second apart are byte-identical, and zero rAF callbacks fire. Positive control: a running Focus run changes the region between frames (`focus-cycle.spec.ts`).
46. **FAIL (literal).** The grep guard over the dot implementation files passes: `CycleDots.tsx`, `Surface.tsx`, `FocusLengthInput.tsx`, `ModeSelector.tsx`, `lib/timer/cycle.ts`, `lib/timer/modes.ts`. But the literal scope is "files this task adds or changes", and `components/PomotatoTimer.tsx:81` has `window.setTimeout(() => setAnnouncement(""), ANNOUNCEMENT_CLEAR_MS)`, a one-shot clear that this task added. It does not drive the pulse or a per-tick path. **Raised for a ruling on scope; not fixed.**
47. PASS. Under `prefers-reduced-motion: reduce`, with a Focus run running, the region is byte-identical across one second. The ring cue is asserted by the `active-running` attribute, not by its painted ring (not visually checked).
48. PASS. axe-core: no serious or critical violation on `/` in idle, running, paused and mid-break, in both themes (`focus-cycle.spec.ts`, 8 runs).
49. **FAIL (incomplete).** The legend and the native checked state are asserted (`FocusLengthInput.test.tsx`). Keyboard reachability and the visible focus indicator on the mode radios were not re-run.
50. PASS. Each dot figure is >= 3:1 in both themes against its own ground, sampled in one capture per (theme, image, viewport). Frosted ground, bounded set: worst per theme in the table below. The pulse endpoints are the pending and done colours, measured.
51. PASS. Bounded set: no image (done dot only), black, white, and split (extra). Black and white are the two images run for the frosted ground; no intermediate image was run.
52. **FAIL (incomplete).** Done vs pending: each is >= 3:1 against the ground, but not against each other. The non-colour difference (filled 16 px dot vs smaller, transparent-bordered pending dot) holds by construction, but a greyscale check was not run. Ring vs pending: unfilled ring against a filled muted dot, shape-based by construction; greyscale not run.
53. **FAIL (incomplete).** Forced colours not exercised in this pass.
54. PASS. The table is taken from one capture per (theme, image, viewport). The sweep uses `paintedColours` from `e2e/helpers/background.ts`; the new `e2e/helpers/surface-sampler.ts` is a plain-screenshot variant kept for the next task.

H. Measurement (group H, frosted ground, worst across white, black and split)
| Treatment | Light, 1280 and 320 | Dark, 1280 and 320 | No image, light / dark |
|---|---|---|---|
| done (solid fill) | 6.980 (black), fill `120,53,15` | 9.696 (split), fill `251,213,146` | 7.305 / 11.606 |
| pending (muted fill) | 3.511 (black), fill `122,117,111` | 3.234 (white), fill `138,121,104` | not measured |
| active-idle (ring stroke) | 6.980 (black), stroke `120,53,15` | 9.696 (split), stroke `251,213,146` | not measured |
Each figure is a full-coverage pixel, against the worst ground pixel in a 6 px ring around its own dot (the dots' gap is 12 px, so the rings do not touch a neighbour). Pending and ring figures for no-image were not measured.

I. Test fallout and gates
55. **FAIL.** Updated: `lib/timer/store.test.ts`, `lib/timer/time.test.ts`, `components/background.guards.test.ts`, `components/BackgroundLayer.test.tsx`, the e2e helper and the listed specs' selectors and Custom flows. Not green: 87 e2e tests still fail across 18 files, including `settings-gauge-style` (36), `sessions` (10), `dark-a11y-console` (8), `timer-gauge` (4), `dark-contrast` (2, the disabled custom-field measurement), and `dark-sweep` (1, the disabled focus-length field, which is the measurement the spec says must survive). `components/TimerControls.test.tsx` passes unchanged.
56. PASS. `components/focus-cycle.guards.test.ts` explicitly covers this task's new files (`CycleDots.tsx`, `cycle.ts`, `modes.ts`, `Surface.tsx`, `FocusLengthInput.tsx`). `components/background.guards.test.ts`'s `NEW_FILES` list is not extended; that list stays scoped to 010.
57. PASS for assertions added by 013 (none is a HEAD diff). Other HEAD-diff assertions from 010 remain and are reported under 012.
58. **FAIL.** `npm run test:e2e` is not green (87 failing). Lint, typecheck, build and unit tests pass. No `any` in new code (grep).
59. NOT VERIFIED. The `docs/DECISIONS.md` entry is the orchestrator's.

### Group H is measured, but the dot treatments are the group's only image-dependent figures
Frosted ground only; the header is solid, so no header figure belongs in group H. The dots sit inside the frosted panel, so all their ground figures come from the sweep (white, black, split), in both themes, at both viewports.

### Red-proof (unit level, scratch copy)
- Criterion 16 (drift): in a scratch copy of the tree, `store.ts` anchored the next end on `now` instead of the completed run's stored end. The focus-cycle suite went **red** on criteria 13, 15, 16, 17 and 36-37 (five tests). Restored: 30 of 30 pass. Level: unit.
- Criteria 26, 27 and 42 were not broken and restored.

### Verdict basis for the orchestrator
013 is not done: the e2e suite is not green, and criteria 4, 11, 46, 49, 52, 53, 55 and 58 are unmet or not covered. Criterion 46 needs a scope ruling. The rest of the behaviour, the cycle model, the migration, the dot treatments and group H are measured and passing.

## Review Findings
(Reviewer, 2026-10-29, read-only; appended by the orchestrator on its behalf.)
- Verdict: **APPROVE.** Nothing in 013's own change set blocks landing. All eight findings
  are non-blocking; finding 1 is a pre-existing trap that must be settled before 014.
- Gates re-run by the reviewer: `npm run typecheck` exit 0; `npm run lint` 0 errors /
  20 warnings (all pre-existing, in `e2e/`); `vitest run` over `lib/timer`, `CycleDots`,
  `FocusLengthInput`, `focus-cycle.guards`, `lib/db` — 12 files, 316 tests passing.

### The five areas the review was asked to verify
1. **Timer invariant (criteria 15, 16, 19, 36-38, 44): correct in code.**
   `lib/timer/store.ts:234-264` returns early unless `status === "running" && endTimestamp
   !== null && now >= endTimestamp`, so the advance is a one-shot guarded by status with no
   per-tick work. The next end is anchored on `endTimestamp + fullDurationMs(...)` (line
   243) — the completed run's own stored end, **never `now`**, which is the drift bug QA's
   criterion 16 red-proof caught. `started = nextEnd > now` bounds the chain to one step;
   `startedAt: started ? endTimestamp : null` keeps logged runs contiguous; a fresh
   `crypto.randomUUID()` keeps the `&runId` dedup key unreused. Reload credits exactly one
   row: `onRehydrateStorage` (`store.ts:311-324`) calls it once, and a StrictMode re-entrant
   rehydrate is a no-op, with the `&runId` unique index as backstop.
2. **Mode union (criterion 1): genuinely closed.** `lib/timer/modes.ts` derives
   `TIMER_MODES` from an exhaustive `Record<TimerMode, true>`; the `Object.keys(...) as
   TimerMode[]` cast cannot widen it, since a missing or extra key each fail typecheck.
   `SessionMode = TimerMode | LegacySessionMode` is layered, not aliased, so shrinking
   `TimerMode` can never drop `"custom"`.
3. **Dots / announcements: no second live region, no per-render announce.** The dot row is
   `aria-hidden` plus one non-live `sr-only <p>`; nothing is focusable or clickable. The
   advance reuses the single existing `role="status"` and is deduped on
   `lastAdvance.endedAt` via a ref (`PomotatoTimer.tsx:72-83`).
4. **`CustomDurationInput.tsx` deletion: clean.** No surviving import, constant, label or
   chip text; `MODE_LABELS` lost its `custom` key.
5. **Migration: safe for existing rows.** v1->v2->v3 is correct; `migrateVersionTwo`
   (`store.ts:162-180`) carries `customMinutes` onto the Focus length **only** when the
   stored mode really was `"custom"` (Risk 8 honoured), preserves `endTimestamp`/`runId`/
   `startedAt` for a running entry, clamps a paused frozen value, and starts
   `cyclePosition` at 0. The legacy guards accept `"custom"` and are reachable only from
   `migrate`; `isPersistedTimerState` rejects it on every `merge`. **013 changes only the
   zustand/localStorage persist version — the Dexie schema is untouched.**

### Numbered findings
1. **`lib/db/database.ts:56` — the pinned Dexie version block is still there. MEDIUM,
   pre-existing, not 013's.** `this.version(CURRENT_SCHEMA_VERSION)` is still pinned to the
   moving constant, exactly as `docs/PLAN.md:266-270` records. 013 does not worsen it (no
   schema change), but **014 bumps to 4**: the moment the constant changes, this block
   silently renumbers 3 -> 4, version 3 stops being declared, and if 014 adds its own
   `.version(4)` Dexie throws on a duplicate version number. **Fix before 014's bump** —
   declare the literal `.version(3)` and add the guard that the highest declared literal
   equals `CURRENT_SCHEMA_VERSION`.
2. **`components/FocusLengthInput.tsx:21` + `PomotatoTimer.tsx:97` — keyboard focus is
   dropped when an auto-advance into Focus disables the field mid-edit. LOW (a11y), covered
   by no criterion.** Criterion 7's ruling deliberately invites editing the Focus length
   during a break; when that break auto-completes, `disabled` flips on a possibly-focused
   input and the browser moves focus to `<body>` (WCAG 2.4.3). Mitigations: move focus to
   Start/Pause, or keep the field enabled and no-op the write (the store already no-ops it
   at `store.ts:227-232`). Otherwise record it in DECISIONS as an accepted cost.
3. **`components/FocusLengthInput.tsx:15,25-30,63-65` — `isFocusedRef` can stick `true`
   when the field is disabled out from under the cursor. LOW.** The component is now always
   mounted (it used to unmount on leaving Custom mode, which reset the ref). If a browser
   does not fire `blur` when a focused input becomes `disabled`, the store->field sync
   effect never runs again for the life of the page and the field can show a stale raw
   value, with a stale error `<p>` and `aria-invalid="true"` left on a disabled input
   (repro: type `999` during a break, let the break end). A `useEffect` clearing the ref
   when `disabled` turns true closes both.
4. **`components/FocusLengthInput.tsx:70` — criterion 33's "unchanged live-region count"
   holds only in the no-error state. LOW, informational.** The error `<p role="alert">` is
   the same single region, but the field now renders in every mode, so it is reachable in
   all three where it was previously Custom-only. QA pinned the region set by value in the
   default state and it matched, so the criterion is satisfied as measured — flagged so a
   later task does not read "unchanged" as "unchanged in every state".
5. **`components/PomotatoTimer.tsx:52-63` — the status-derived announcement is never
   cleared. NIT.** The advance path clears its own text after 10 s; the legacy
   `${MODE_LABELS[mode]} complete` branch has no clear, so that sentence persists in the
   accessibility tree. Only reachable from hand-edited or pre-013 persisted `complete`
   state, which the advance path never produces.
6. **`components/ModeSelector.tsx:16` — chip display order is now an implicit consequence
   of object-literal key order. NIT.** `MODE_ORDER` is gone; order comes from
   `Object.keys(TIMER_MODE_SET)`. Deterministic per spec, but the painted order of a
   user-facing row is now a side effect of a type-exhaustiveness map. A comment on
   `TIMER_MODE_SET` saying "key order is the chip order" would stop someone alphabetising it.
7. **`lib/stats/types.ts:44` — `StatsSession["mode"]` duplicates the `SessionMode` union by
   hand. NIT.** Now that `SessionMode` is layered, this literal union is the one place that
   will not follow it. It fails loudly rather than silently, and criterion 3's guard asserts
   `"custom"` by name, so this is cosmetic; `mode: SessionMode` would remove the duplication.
8. **`app/globals.css:68` — stale "custom-duration input" reference in the
   `--control-border` comment. NIT.** The control is now `#focus-length`.

### Dimension summary
- **Correctness:** verified in code for groups A, B, C, E, F and the structural half of D
  and G. Group H and the painted criteria are QA's; not re-measured. Criterion 30's
  "navigate to `/stats` and back" half is still untested but sound by construction (the
  position is in `partialize`, validated on every `merge`, and the home route re-triggers
  `persist.rehydrate()`).
- **TypeScript:** no `any`, no `@ts-ignore`/`@ts-expect-error` in new code; `tsc --noEmit`
  clean. The four casts in `store.ts` are narrowing-helpers on already-validated values,
  three carried over unchanged from HEAD.
- **Accessibility:** semantic `<fieldset>`/`<legend>` with native radios and the
  weight-based non-colour selected cue retained; dots `aria-hidden` with one non-live
  sentence; no new focusable element; visible focus retained on the field. Findings 2-4 are
  the open wrinkles. Suggestion, not a finding: `aria-describedby` from the `fieldset` to
  the position sentence would surface the cycle position to a radio-group user without
  adding a live region.
- **Performance:** no new interval, timeout (bar the ruled-PASS announcement clear) or rAF;
  the pulse is CSS keyframes scoped to `[data-treatment="active-running"]` with
  `animation: none` under `prefers-reduced-motion`. `CycleDots` subscribes to three
  primitive slices so it does not re-render on the 250 ms clock tick.
- **Licensing / branding:** nothing to flag. Four CSS dots, existing tokens only, no font,
  image, audio or copied asset. A four-segment Pomodoro counter is a generic convention and
  the copy is original.

## QA Report — round 2 (2026-10-29)
- Verdict: **PASS**, with two items left to the orchestrator: criterion 59 (the DECISIONS entry, not QA's to verify) and the build gate (not re-run by QA; no app file changed by QA; the orchestrator's `out/` from this tree stands).
- Round 1's failing criteria, now: **4** PASS (new unit test), **11** PASS (new e2e test), **46** PASS (round-1 ruling, unchanged), **49** PASS (new e2e test), **52** PASS by the non-colour clause (measured below), **53** PASS (measured below), **55** PASS (e2e green), **58** PASS except the build re-run noted above.
- Shared measurement and provenance: `docs/tasks/012-full-opacity-background-frosted-surfaces.md`, "QA Report — round 2" (method corrections, the 012 figures, and the findings). The sampler and the readings are the same run.
- Gates (shared with 012): typecheck exit 0; lint 0 errors, 20 warnings; unit 38 files, **1073 passing, 0 failing**; e2e **670 expected, 2 skipped, 0 unexpected, 0 flaky, exit 0**. One intermittent unexpected failure seen once under a heavy combined run and not reproduced; see 012 for detail.

### Criteria
- **1–3** (mode model, Focus length, SessionMode): PASS (round 1, unchanged; guards pass in the 1073).
- **4** (a stored `custom` row): **PASS**, new unit test `lib/db/custom-row-counts.test.ts`. A row written through `logCompletedSession` with `mode: "custom"` is accepted, its rejection message names all four modes (asserted on the issue), and after a round trip through `listAllSessionsForTests` into `aggregateStats` it counts as one session with 600,000 ms of focus. **Red-proof, unit:** `isFocusTypeMode` changed to `mode === "focus"`: the aggregate assertion goes red; restored, green.
- **5–10**: PASS (round 1, unchanged).
- **11** (Focus length persists, unaffected by Reset): **PASS**, new `e2e/focus-surface-behaviour.spec.ts`. Set 50, the readout reads `50:00`; reload keeps 50; holding Reset keeps 50; reload again keeps 50.
- **12–22**: PASS (round 1; the full e2e run is green, including the 320 px cluster and the expired-reload cases).
- **23–35**: PASS (round 1).
- **36–44**: PASS (round 1).
- **45, 47**: PASS (round 1; focus-cycle e2e green).
- **46**: PASS (round-1 orchestrator ruling, unchanged).
- **48**: PASS (round 1; focus-cycle e2e green).
- **49** (keyboard reach and visible focus on the mode radios): **PASS**, new behaviour test. Tab from the top of the page reaches the Focus radio within 80 presses; the focused chip paints `outline: solid 2px`, offset 2px; ArrowRight moves focus and the native checked state to Short break. Default mode (no focus): no outline on any chip.
- **50** (dot fills and ring at ≥3:1 in both themes): **PASS**. Minimum by cell in the table below. Round 1's table is confirmed to three decimals: light done 6.980 (black), light pending 3.511 (black), light ring 6.980 (black), dark done 9.696 (split), dark pending 3.234 (white), dark ring 9.696 (split).
- **51** (bounded set): **PASS**. White and black bound the range; split is the extra that defeats a mean; no intermediate image is run.
- **52** (treatments told apart, greyscale). **PASS by the non-colour clause; the greyscale numbers are measured.** Greyscale, white image, 1280: done 65 / pending 118 / ground 251, done-vs-pending **2.24:1**. Dark: done 216 / pending 123 / ground 46, **2.97:1**. Neither clears 3:1 against the other, so the criterion's non-colour clause carries it: a **filled** 16 px done dot against a pending dot whose painted fill is about **8 px** inside a 4 px transparent border (pending fill read as a column, probe deleted after use; done's fill and 2 px border are the same colour). Ring vs pending: shape (an outline against a filled dot), which the criterion allows by construction; greyscale ring 65 against pending 118 (2.24:1). Dots vs ground in greyscale: every treatment 3.2:1 and above.
- **53** (forced colours: all four visible; treatments told apart): **PASS, with an observation.** Under `forced-colors: active`, done and the active-idle ring both paint `rgb(0,0,0)` (21.0:1 vs canvas), pending paints `rgb(96,0,0)` (14.0:1). Done and the ring differ by shape (filled vs outlined) and pending by size, so none is colour-only. **Observation:** `rgb(96,0,0)` is not a system colour, so forced colours are not forcing the pending fill (not a failure; flagged).
- **54** (one table, one capture per theme and background, sampler kept in `e2e/helpers/`): **PASS**. Table below. The sampler is `e2e/helpers/surface-sampler.ts` (`groundPixels`, `clipToSurface`).
- **55** (test fallout updated, not deleted): **PASS.** The listed suites are updated; `components/TimerControls.test.tsx` passes unchanged; the e2e suite is green (670 expected, 0 unexpected). The dark-sweep disabled-field measurement survives (re-pointed to `#focus-length`, still measured).
- **56**: PASS (round 1).
- **57** (no HEAD-diff assertion added by 013): **PASS.** None of the new tests (`custom-row-counts`, the behaviour spec, the sweep) asserts against `HEAD`.
- **58** (gates): lint 0 errors / 20 warnings, typecheck 0, unit 1073, e2e 0 unexpected. **Build not re-run by QA** (see verdict).
- **59** (DECISIONS entry): not verified by QA (orchestrator-owned).

### Shared figure table (group H, greyscale-free). Each cell is the minimum over every state captured for that cell (default, blur off, reduced transparency), with its provenance in `sweep-parts/merged.json`
Columns: light 1280x800 (white / black / split), light 320x720, dark 1280x800, dark 320x720. Ground = the worst painted pixel of the element's own ring or box, text hidden for ground reads (glyph excepted, see 012).

| row | light 1280 (white / black / split) | light 320 | dark 1280 | dark 320 |
|---|---|---|---|---|
| c50 dot done (fill) | 8.735 / 6.980 / 8.735 | 8.741 / 6.980 / 8.741 | 9.696 / 12.769 / 9.696 | 9.696 / 13.039 / 9.696 |
| c50 dot pending (fill) | 4.394 / 3.511 / 3.511 | 4.397 / 3.511 / 3.511 | 3.234 / 4.260 / 3.835 | 3.234 / 4.350 / 3.835 |
| c50 dot active-idle ring | 8.735 / 6.980 / 7.865 | 8.741 / 6.980 / 7.865 | 9.696 / 12.769 / 9.696 | 9.696 / 13.039 / 9.696 |
| c14 mode chip, checked | 8.735 / 6.980 / 8.735 | 8.741 / 6.980 / 8.741 | 9.696 / 12.769 / 9.696 | 9.696 / 13.039 / 9.696 |
| c14 mode chip, unchecked | 9.891 / 7.903 / 7.903 | 9.897 / 7.903 / 7.903 | 9.370 / 12.341 / 9.370 | 9.370 / 12.602 / 9.370 |
| c14 readout (vessel and glyph, all levels) | 4.987 / 4.987 / 4.987 | 4.987 / 4.987 / 4.987 | 4.681 / 4.681 / 4.681 | 4.681 / 4.681 / 4.681 |
| c14 current-task title | 7.346 / 5.870 / 5.870 | 7.350 / 5.870 / 5.870 | 6.485 / 8.541 / 6.485 | 6.485 / 8.722 / 6.485 |
| c14 Start label on fill | 5.022 / 5.022 / 5.022 | 5.022 / 5.022 / 5.022 | 8.828 / 8.828 / 8.828 | 8.828 / 8.828 / 8.828 |
| c14 focus outline, chip | 4.838 / 3.864 / 4.838 | 4.838 / 3.864 / 4.838 | 6.580 / 8.849 / 6.580 | 6.580 / 8.849 / 6.580 |
| c14 focus outline, Start | 4.838 / 3.864 / 4.592 | 4.838 / 3.864 / 4.592 | 6.580 / 8.849 / 6.580 | 6.580 / 8.849 / 6.580 |
| c14 focus outline, theme control | **5.022 / 4.182 / 4.182** | 4.835 / 4.835 / 4.835 | **2.058** / 10.203 / 10.203 | 8.665 / 8.665 / 8.665 |
| c14 Reset `--control-border` | 4.394 / 3.511 / 3.511 | 4.397 / 3.511 / 3.511 | 3.234 / 4.260 / 3.971 | 3.234 / 4.350 / 3.971 |
| c14 focus-length `--control-border` | 4.394 / 3.511 / 3.511 | 4.397 / 3.511 / 3.511 | 3.234 / 4.260 / 3.234 | 3.234 / 4.350 / 3.234 |
| c15 wordmark (solid, image-active) | 4.835 / 4.835 / 4.835 | 4.835 / 4.835 / 4.835 | 8.665 / 8.665 / 8.665 | 8.665 / 8.665 / 8.665 |
| c15 theme control text (checked) | 8.735 / 8.735 / 8.735 | 8.735 / 8.735 / 8.735 | 12.769 / 12.769 / 12.769 | 12.769 / 12.769 / 12.769 |
| c16 vessel, 100 / 50 / 0 | 4.987 / 4.987 / 4.987 | 4.987 / 4.987 / 4.987 | 4.681 / 4.681 / 4.681 | 4.681 / 4.681 / 4.681 |
| c16 glyph, 100 / 50 / 0 | 7.350 / 5.870 / 5.870 | 7.350 / 5.870 / 5.870 | 6.485 / 8.722 / 6.485 | 6.485 / 8.722 / 6.485 |

Bold is the one failing cell: the theme control's focus outline over the photograph (012 criterion 14, a finding). Every other cell clears its floor (dots, text 4.5, edges 3, wordmark 3).

### Group H: provenance and the two bound arguments
- **Ground and provenance:** the dots sit inside the frosted panel, so their ground is the frosted composite over the image. White and black bound it: the fill over a flat field returns the same field for every blur radius (criterion 14's argument (a)), and split defeats a mean. Frosted ground per cell in the table above; the frosted and solid edges are image-independent where the table shows zero delta.
- **Agreement with round 1:** every round-1 dot figure is reproduced to three decimals (see criterion 50). Round 1's dot figures were read on static idle dots, so the animation trap did not touch them.
- **Pulse endpoints:** the pulse interpolates between pending and done. Both endpoints are measured as static colours (criterion 50's rule); no per-frame sampling.
- **Criterion 45 / 47:** round-1 measurement stands (byte-identical region when idle, paused, and under reduced motion; a running Focus run is the positive control). Not re-sampled this round.

### Red-proofs (013)
- **Criterion 4 (unit):** `isFocusTypeMode` changed to `mode === "focus"`; `custom-row-counts` goes red on the aggregate assertion; restored, green (3 of 3).
- **Criterion 16 drift (round 1, unit):** unchanged; still stands.
- **Criterion 14's floor carried by the fill (e2e, CSS break):** see 012 red-proofs.
- Criteria 26 and 27: 27's token guard red-proofed at unit level for 012 (see 012); 26 is not a 013 criterion.

### Verdict basis
Every 013 criterion that was failing in round 1 now passes: 4 and 11 and 49 by new tests, 52 and 53 by measured non-colour distinctions, 55 and 58 by the green suite. Criterion 59 and the build re-run are the orchestrator's. Known gaps that remain are 012's (criterion 4 owner-deferred, the theme control focus outline, and the Tasks trigger under forced colours); none of them touches the cycle, the dots' treatments or their figures.

## Orchestrator closeout (2026-11-06)
Status moved to **done**. The two items QA left to the orchestrator are both settled:

- **Criterion 58, the build gate.** `npm run build` re-run on this tree: compiled in 2.0 s, TypeScript
  clean, 6/6 static pages generated, four routes (`/`, `/_not-found`, `/settings`, `/stats`), exit 0.
  Taken *after* 012's round-3 fixes, so it covers both tasks' change sets. Criterion 58 now passes in full.
- **Criterion 59, the DECISIONS entry.** Five of the seven named rules were already recorded across the
  2026-10-28 entries: Reset scoping to the current run, the long break as the only cycle reset, and the
  one-step expired-reload rule in "The focus cycle: what `cyclePosition` means"; symmetric auto-start as
  owner decision 1 in "One round of owner feedback"; the four dot treatments with the pulse scoped to a
  running timer, plus the R-19 reasoning, in "Two antislop collisions resolved inside the rules".
  The two that were **missing** — the chip row surviving with the dots beneath it, and the dots being
  non-interactive — were added to the `cyclePosition` entry rather than opened as a new dated section,
  since they were settled on 2026-10-28 with the rest. Criterion 59 passes.

Review finding 1 (`lib/db/database.ts:56`, the Dexie version block still pinned to the moving constant)
is **not** fixed here. It is carried into task 014, whose scope already names ".version(3) literalized,
the highest-literal guard" as part of the 3 → 4 bump — which is the task that would otherwise trip over
it. Findings 2 and 3 (focus dropped and `isFocusedRef` sticking when the Focus length field is disabled
mid-edit by an auto-advance) are open and unrouted; they are the only findings with a user-visible
symptom, and both live in `components/FocusLengthInput.tsx`, which 014 does not touch.
