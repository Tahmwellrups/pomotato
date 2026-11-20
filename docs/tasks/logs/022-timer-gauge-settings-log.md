# Timer gauge: off switch, style selector with live previews, and re-wiring the gauge — history log

Appended by frontend/backend/qa/reviewer/orchestrator after implementation began.
The task's goal, scope and acceptance criteria are in [../022-timer-gauge-settings.md](../022-timer-gauge-settings.md).

<!--
  Verdicts and repro steps, not the journey. Over half of every pre-2026-11-12 task file
  was narrative appended here, and every later agent paid to re-read it.
  Append under the matching heading; grep-friendly headings matter more than prose.
-->

## Owner Rulings

**2026-11-19, all four of the brief's Open Questions — owner answered, orchestrator recorded.**

1. **Restore the gauge.** Q1's conflict resolves toward restoration: the gauge paints again for every
   user, existing ones included, and that visible change is the deliverable. `41cd33f` was temporary.
   Criterion 22 rewritten in the brief; no longer blocked.
2. **`SloshGauge` stays an offered style.** Owner delegated the call; orchestrator ruled it needs no new
   licensing decision — the 2026-10-19 vendoring ruling already covers rendering it, Commons Clause
   restricts selling rather than use, and listing the style in a picker is a presentation change. Do not
   edit `SloshGauge.tsx`'s header or re-vendor it.
3. **Glyph preview shows fixed sample digits.** How the shared component gets the level (digits layer vs.
   deriving from the `progress` prop) is frontend's call; importing timer logic into the preview is not.
4. **Two-column grid on desktop**, stacked on mobile. Three columns would leave an empty cell at two
   styles. Criterion 46 updated.

**2026-11-19, amendment — supersedes ruling 1 above.** Owner asked for two changes after frontend
landed and while qa was mid-run:

5. **`gaugeEnabled` defaults to `false`.** Ruling 1's restoration still stands — the gauge is re-wired
   and paints when enabled — but it ships dormant. Side effect worth noting: this makes "no visual
   change for existing users" *true* rather than overridden, so the original Q1 conflict is gone rather
   than decided. Criteria 15, 17, 20 and 22 rewritten; criterion 22 is now two-part (22a opt-in paints,
   22b default shows nothing).
6. **No selected highlight while the gauge is off.** New criterion 33b. Presentation only: the stored
   `gaugeStyle` must not change, and criteria 14 and 18 still bind — re-enabling restores the previous
   style *and* its highlight. Criterion 32's colour-independent cue requirement now applies only while
   the gauge is on.

**Cost note:** qa was stopped mid-run for this. It had already written `gaugeEnabled: true` into the
corrected assertions across 5 edited and 6 new test files; every one of those expectations flips to
`false`. This is the measurement-ordering rule in CLAUDE.md biting from the defaults direction rather
than the token direction — a default settled after the test sweep started cost one qa restart.

**2026-11-19, rulings 7 and 8 — the two QA FAILs, both discharged without code changes.**

7. **Criterion 44, glyph contrast → deferred to task 020.** Measured 2.45:1 accent / 1.64:1 muted over
   the derived upload; vessel 3.23:1 everywhere. Not fixed in 022. The glyph tones are the timer's own
   digits, groundless over bright uploads since the frosted panel was retired (DECISIONS 2026-11-12);
   `docs/PLAN.md:114` already defers that ground to task 020, which is still `draft`. Criterion 43 now
   gates on `vessel` only; glyph's figures stand as 020's inherited evidence. **No token was moved at
   any point**, which is what criterion 44 exists to protect.
8. **Criterion 47, e2e → "no new failures".** Clean-HEAD baseline at `6f4bdb9` fails 112 Playwright
   tests with none of 022's code present. 022 passes when it adds none. Triage of the 112 is a future
   task, not this one.

**Withdrawn QA finding, for the record.** QA's first report filed criterion 33b part 1 as an app defect
with a measured `rgb(240,165,80)` border. It was a QA matcher bug — `expect.soft(() => cue(...))` passes
a thunk, so `received` was `[Function anonymous]` and the assertion could never pass; the colour came
from an on-state read mid-fade. Orchestrator re-measured the built tree directly: off-state border
`rgb(138,121,104)`, identical to the unselected card, no shadow, no check mark, radio still `checked`.
Frontend's gating at `components/GaugeSettings.tsx:113` was correct throughout. Cost: one QA round trip.
Lesson worth keeping — a failing assertion whose `received` is a function is a broken test, not a found
bug, and it should be read that way before anything is filed against an implementer.

## Implementation Notes
(frontend/backend: decisions, tradeoffs, the types frontend consumes. What the next agent needs — no more.)

**frontend, 2026-11-19.** Gates run: lint 0 errors (15 pre-existing warnings), typecheck pass, build pass. `npm run test`: 43 failures, none edited; see list. e2e not run.

**Files touched:** `lib/preferences/schema.ts`, `lib/preferences/store.ts`, `components/Gauge.tsx` (new), `components/GaugePreview.tsx` (new), `components/GaugeSettings.tsx` (new), `components/TimerGauge.tsx`, `components/TimerDisplay.tsx`, `components/SettingsPanel.tsx`. `SloshGauge.tsx` untouched.

**Shared component, `components/Gauge.tsx`:**
`Gauge({ variant: GaugeStylePreference | null, progress: number /*0-1, 1 = full*/, digits: string, ready = true, animate = true, testId?, frameClassName?, digitsSizeClassName? })`. Also exports `GAUGE_DIGITS_SIZE`. It owns the frame div and the digits `<p>` (glyph paints the digits). `variant: null` renders frame + digits only: no layer, no overlay span, no wrapper (the off state, same DOM geometry, so crit 9/10). Imports no timer code.
- `TimerGauge` (still the renderer, `data-testid="timer-gauge"`, props unchanged) gained `animate?: boolean` (default true) and `testId?: string`. Gauge calls it with `remainingMs=progress, fullMs=1`, so the `gaugeLevel` convention (crit 6) is the single source. `animate=false` or `prefers-reduced-motion: reduce` (via `useMediaQuery`) sets `viscosity=0, tilt=0, splash=0` on SloshGauge: its own no-spring path, level lands the same frame (crit 38/39). Motion allowed keeps tilt/splash 0.2 (crit 40).
- `GaugePreview({variant})`: `<Gauge animate={false} progress={0.6} digits="15:00" testId="gauge-preview">` inside an `aria-hidden` span. Exports `PREVIEW_PROGRESS = 0.6`, `PREVIEW_DIGITS = "15:00"`. Imports only `Gauge` and a type. Preview `data-testid` is `gauge-preview`, not `timer-gauge`.
- `GaugeSettings`: `<section>` "Timer gauge"; native checkbox `role="switch"` + `aria-checked`, label "Show timer gauge", On/Off text and thumb side carry state (crit 28); fieldset/legend "Gauge style" with native radios, `aria-labelledby` = name, `aria-describedby` = detail; 2-col grid `sm:grid-cols-2`, 1 col below. Off: radios get `aria-disabled` (not `disabled`), click and Arrow keys are `preventDefault`ed, checked radio stays the tab stop, fieldset `aria-describedby="gauge-style-hint"` -> "Turn on the gauge to choose a style." (crit 33/34). Selected = check svg + bold + 2px primary edge.

**Glyph level derivation:** from `progress`, via the same SloshGauge spring `onPaint` -> `--gauge-surface/--gauge-lean` on the Gauge frame (no second spring, no store). In still mode the spring is parked at `progress*100`, so the preview boundary equals the live one at the same remaining time. This is what restores crit 22: `TimerDisplay` renders `Gauge` again, so `onPaint` fires.

**Behaviour decisions:**
- `TimerDisplay` shows a variant only when `prefs.hasHydrated && gaugeEnabled`; before rehydration nothing paints (crit 11). Behaviour change from before `41cd33f`: vessel previously mounted (unready) pre-hydration with the default; now absent until prefs hydrate.
- Crit 14/18: `gaugeEnabled` and `gaugeStyle` are independent keys; `setGaugeEnabled` never touches style.
- Migration: `sanitizePreferences` fills `gaugeEnabled` per key (non-boolean -> true); `isPreferences` requires boolean; `PREFERENCES_VERSION = 4`; `migratePreferences` unchanged (sanitise). `boot-script.ts` untouched.
- No gauge path imports the timer store (crit 26). No progressbar/live region added (crit 35).

**Failing tests (43). Left as is; all are qa's.**
1. `lib/preferences/schema-v3.test.ts:14` expects `PREFERENCES_VERSION` 3; correct: 4 (rename "version 3" titles). `:39` `written.version` 3 -> 4.
2. `lib/preferences/gauge-style.test.ts` (23 tests, criterion 7 sanitiser, store write-back, upgrade path): every exact `toEqual` of the full state now has a tenth key `gaugeEnabled: true`; the upgrade-path literal `{"state":{"theme":"dark"},"version":1}` now yields `gaugeEnabled: true` too. Any `version: 3` expectation of the written payload -> 4.
3. `lib/preferences/preferences.test.ts` (13): "carries a version constant" expects 3 -> 4; the task 010 background tests do exact `toEqual` on state / envelope keys, add `gaugeEnabled: true`.
4. `lib/audio/mix.test.ts` (2): "the stored state carries the mix as the fourth key" asserts the sorted key array; add `gaugeEnabled` (sorted between `focusMinutes` and `gaugeStyle` order as `Object.keys().sort()` gives). "literal shipped payload ... gains the default mix": exact state now includes `gaugeEnabled: true`.
5. `lib/audio/chime.test.ts` (3, criteria 3/4/6: strike spacing, 8.0-8.6 s span): NOT caused by this task. `lib/audio/chime.ts` carries an uncommitted edit that predates it (git status at session start); flagged for the orchestrator.
`components/TimerGauge.test.tsx` and `TimerGauge.tokens.test.ts` pass unchanged.

**Brief items not verified by me:** 7, 9, 23-25, 28, 30, 36-46 need a browser/e2e/measurement pass (qa). Nothing in the brief was unbuildable.

**frontend, follow-up (default off, 33b).** `PREFERENCE_DEFAULTS.gaugeEnabled` is now `false`; the non-boolean fallbacks in `sanitizePreferences` and the 1-3 -> 4 migration read that default, so they yield `false` with no further edit. `isPreferences` still only requires a boolean. `GaugeSettings` treats pre-hydration as off. 33b: `marked = checked && enabled` drives the check mark and bold name, and the checked-card border/shadow classes are applied only while enabled. The radio stays `checked` and the tab stop, `gaugeStyle` is untouched, and turning the gauge on re-shows the highlight with no reload. A11y seam: a screen reader still hears the checked radio while off; the "Turn on the gauge to choose a style." line is its context, no new cue added. Newly red tests (qa): every `gaugeEnabled: true` expectation I listed above becomes `false`, including the migration, upgrade-path and key-set assertions.

**frontend, review fixes.** F1: each radio's `aria-describedby` is `detailId` plus `gauge-style-hint` while off (fieldset link kept). F2: switch `onKeyDown` handles Enter (preventDefault, toggles); no `<form>` wraps it (grep: none), so the guard is only against default activation. F4: preview testid is now `gauge-preview-${variant}`, i.e. `gauge-preview-vessel` and `gauge-preview-glyph`; qa specs using `gauge-preview` must change. F6: `Gauge` maps non-finite `progress` to 0 before clamping.

## QA Report

(qa, 2026-11-19. The owner flipped the default to off mid-run, so this report is against the **current** tree, `gaugeEnabled` default `false`. The first pass ran with default `true`; its `true` expectations were flipped rather than left, and that history is kept here on purpose.)

- **Verdict: PASS on the automated criteria, with two manual items outstanding (criteria 7 visual and 35 screen-reader), which this report does not close.** Rulings 7 and 8 (owner, 2026-11-19) discharge criteria 44 and 47. Criterion 43 gates on `vessel` only; glyph is recorded and deferred to task 020.
  - Criterion 44: DISCHARGED by ruling 7. Glyph 2.45:1 (accent) and 1.64:1 (muted) are recorded, not gated. Vessel 3.23:1 everywhere.
  - Criterion 47: PASS by ruling 8. Final tree: 111 Playwright failures, all also failing at HEAD in the baseline runs, none new. Owner's clean-HEAD figure is 112.
  - Criterion 33b: MET. The earlier FAIL was a QA matcher bug; see "Withdrawn finding".
  - Criterion 48: PASS with named corrections (below). No assertion was deleted or loosened.
- **Outstanding, listed as not done:** criterion 7's manual visual parity (only numeric RGB parity has been checked), and criterion 35's by-hand screen-reader pass (only the structural check has been made). The brief requires both, and criterion 35's pass must run before F1 is signed off. The owner is handling both as manual checks. Neither is closed here.
- Nothing was re-pointed and no app file was edited by QA. No token moved.
- **Re-verified after review (CHANGES REQUESTED, F1-F6), 2026-11-19.** Frontend landed its four app fixes. QA updated its own specs and guards for them (dispositions below). Final tree: Vitest 1149/1149, lint and typecheck pass, Playwright 111 failing / 475 passed / 1 skipped, none of the failures new against the HEAD baseline set and none in a task-022 spec. Criterion 47 holds under ruling 8.
- **F1 is structurally verified only.** The off-state hint is now linked from every radio's accessible description, and a test checks it. That is the accessibility tree, not what a screen reader announces. Per the reviewer's sequencing note, criterion 35's by-hand screen-reader pass should run before F1 is signed off. F1 is **not** closed by this report.

### Criterion status

| Criterion | Status | Verified by (level) |
|---|---|---|
| 1, 2 | PASS | unit `components/Gauge.styles.test.tsx`: enumerates the typed list, map covers exactly `vessel`, `glyph` |
| 3 | PASS | grep guard `components/gauge.guards.test.ts`: no img or asset in `GaugePreview.tsx` |
| 4, 26 | PASS | static import guards, `components/gauge.guards.test.ts` |
| 5 | PASS | e2e: preview level and screenshot identical across 1.2 s |
| 6 | PASS | unit: progress 0.6 gives level 60, 1 gives 100, 0 gives 0; e2e level 60 |
| 7 | PARTIAL: numeric PASS, visual check NOT DONE | e2e measure: preview and live at 60% paint identical RGB. The brief's manual visual parity check has not been done. Outstanding. |
| 8 | PASS | e2e `task-022-gauge`, criterion 8, both styles |
| 9, 10 | PASS | e2e: digits, mode selector and controls rects identical on/off, live toggle and after reload; the digits' parent holds only the `<p>` |
| 11 | PASS | e2e: init-script MutationObserver, `timer-gauge` never appears from navigation to hydration (off seed); control shows it on |
| 12, 13, 14 | PASS | e2e: live apply on `/`, survives reload, off then reload then on restores the chosen style |
| 15, 16, 17, 18, 20 | PASS | unit `lib/preferences/gauge-enabled.test.ts` (17 tests) |
| 19 | PASS | pinned key list in `e2e/settings-gauge-style.spec.ts` includes `gaugeEnabled`, version 4 |
| 21 | PASS | unit 16 plus e2e: stored `glyph` paints as glyph after load |
| 22a | PASS | e2e: vessel level changes with the clock; glyph `--gauge-surface` moves, not frozen at 100 |
| 22b | PASS | e2e: fresh install shows no gauge, switch off, vessel preselected |
| 23, 24, 25 | PASS | e2e: stored timer key byte-identical after a mid-run change; readout unchanged; paused stays paused; chime count 0 to 1, same as control |
| 27, 29, 31 | PASS | e2e: switch role and aria-checked; group named "Gauge style"; exact option names |
| 35 | PARTIAL: structural PASS, by-hand screen-reader pass NOT DONE | e2e: no progressbar or live region inside the gauge. The brief requires a screen-reader pass by hand; not performed. Outstanding. |
| 28 | PASS | e2e: On/Off text in the switch. Greyscale and forced-colour render not captured separately; the text is the carrier. |
| 30 | PASS | e2e: Tab, Space, Tab, arrows; focus change confirmed by screenshot diff on switch and radio |
| 32 | PASS (on) | e2e: selected card has the check svg and a distinct computed outline and weight while on. Off half is part of 33b. |
| 33 | PASS | e2e: `aria-disabled`, present, not `disabled` |
| 33b | MET | e2e `task-022-gauge`, "criterion 20, 22b, 33b". Part 1: off, the selected card's border, shadow and weight equal the unselected card's (polled to settle through the transition), no check mark, radio still checked. Part 2: on re-enable, same page, the highlight returns on the chosen style, `gaugeStyle` untouched. Previously recorded as FAIL because of the matcher bug below. |
| 34 | PASS (F1 structural only) | e2e: hint visible, `aria-describedby` on fieldset, the checked radio stays the Tab stop while off, arrows do not change it |
| 36 | PASS | axe WCAG 2.0/2.1 A and AA on `/settings`, on and off, zero violations |
| 37 | PASS | e2e: switch label and both card labels at least 44x44 |
| 38, 39, 40 | PASS | e2e reduced motion: preview pixels identical on hover and focus; clip-path lands on the reported level within 300 ms; motion allowed: clip-path changes across 350 ms |
| 41 | PASS | vessel 3.23:1; glyph accent 12.53:1, muted 8.38:1 (fully covered pixels, one capture) |
| 42 | PASS | settings cards: vessel 3.23:1; glyph accent 12.65:1, muted 8.46:1 |
| 43 | PASS, vessel gate (ruling 7) | vessel derived 3.23:1, the same for white and black (the glass is opaque, the upload does not reach it). Glyph derived is flat white, recorded, not gated: deferred to task 020. |
| 44 | DISCHARGED (ruling 7) | glyph derived worst case 2.45:1 (accent), 1.64:1 (muted), recorded as task 020's evidence. Not gated. No token moved. |
| 45 | PASS | e2e at 390 px: 1 or 2 columns, equal cards, no horizontal overflow, switch and cards inside 390 px, hint visible (gauge off) |
| 46 | PASS | e2e at 1280 px: exactly 2 columns, cards identical width, height and top |
| 47 | PASS (ruling 8) | lint, typecheck, build, Vitest pass. Playwright: 111 failing on the final tree, none outside the HEAD-failing set. See Suite. |
| 48 | PASS with named corrections | see below |
| 49 | PASS | every new test asserts a value; loop-generated cases each assert |
| 50 | PASS | unit migration and fallback; component enumeration; e2e toggle, each style, reload, mid-session change |

### Withdrawn finding: criterion 33b part 1 (QA test bug, not an app defect)

- Withdrawn. The app is correct. Frontend's `marked = checked && enabled` gating covers the border: the `peer-checked:border-primary` and inset-shadow classes sit inside the `enabled ? ... : ""` branch at `components/GaugeSettings.tsx:113`. The earlier "probable cause" attributing the border to an ungated class was wrong.
- Cause: `e2e/task-022-gauge.spec.ts` passed a function to `expect.soft` (`() => cue(glyphLabel)`), so the received value was `[Function anonymous]` and could never equal an array. The same spec also compared a value read mid-fade (`transition-colors`); that is where `rgb(240, 165, 80)` came from, the on-state primary, not an off-state border.
- Fix: `expect.poll(() => cue(glyphLabel)).toEqual(vesselOff)`. Re-run: 26/26 pass in `e2e/task-022-gauge.spec.ts`. The on-state distinction is still asserted before the off-state check, so the check cannot pass vacuously.
- Other new specs were checked for the same mistake. The only other function-valued matchers are `expect.poll` thunks (correct) and `expect(() => ...).not.toThrow()` in `lib/preferences/gauge-enabled.test.ts` (correct). No other `expect.soft` takes a thunk.
- Orchestrator's independent check on the same `out/` build, off state: border rgb(138,121,104), equal to the unselected card; box-shadow none; no check mark; radio checked. Matches the fixed assertion.

### Original repro, retained for the history (withdrawn above)

(Kept as written at the time. Its "app defect" conclusion is withdrawn.)

- Seed `localStorage["pomotato-preferences"]` = `{"state":{"gaugeEnabled":true,"gaugeStyle":"glyph"},"version":4}`, open `/settings`, click the "Show timer gauge" label (turns it off).
- Command: `npx playwright test -c e2e/scratch-3100.config.ts e2e/task-022-gauge.spec.ts -g "33b"`
- Expected: the selected "In the digits" card's `border-top-color` equals the unselected "Vessel" card's, `rgb(138, 121, 104)`, once the 150 ms colour transition settles.
- Actual, stable after polling: `rgb(240, 165, 80)`, which is `--primary`. Probable cause: `peer-checked:border-primary` on the card span in `GaugeSettings.tsx` still applies because the radio stays `checked` while off. The `marked` gating covers the check mark and bold name but not the border. Shadow matched.

### Criterion 44 (glyph): recorded, deferred to task 020 by ruling 7

Not a gate any more. The repro is kept so the figure can be reproduced.

- Command: `npx playwright test -c e2e/scratch-3100.config.ts e2e/task-022-measure.spec.ts -g "criterion 43 glyph"`
- Expected: derived worst case at or above 3:1.
- Actual: glyph accent 2.45:1, muted 1.64:1 on the page ground rgb(142,138,135). The derived grey is 255. No flat grey upload, composited at half opacity over `--background` rgb(28,20,14), reaches the accent's luminance; the brightest achievable composite is grey 142. So the derived case is the flat white upload, and it is the worst of the three (black gives 14.11:1).
- Owner ruling 7 defers the glyph shortfall to task 020. No token moved.

### Review findings F1-F6: QA dispositions

- **F1 (criterion 34 hint, medium, blocking):** frontend now links the off-state hint from each radio's `aria-describedby` as well as the fieldset. QA test: `e2e/task-022-gauge.spec.ts`, "review F1" (accessible description on every radio while off, and absent when on). **Structural verification only.** Sign-off waits for criterion 35's by-hand screen-reader pass.
- **F2 (Enter on the switch, low-medium):** frontend added Enter handling. QA test: `e2e/task-022-gauge.spec.ts`, "criterion 30 (Enter clause, review F2)": Enter toggles the focused switch off and on, and storage follows. Passing. This was the clause that had passed unevidenced.
- **F3 (no-new-time-source guard, low):** `Gauge.tsx`, `GaugePreview.tsx` and `GaugeSettings.tsx` added to the no-`setInterval`/`setTimeout`/`requestAnimationFrame`/`performance.now` guard, and to the hex/rgb literal list, in `components/TimerGauge.tokens.test.ts`. Passing (38 cases in that file).
- **F4 (shared preview test id, low):** each card now has `gauge-preview-<style>`. QA updated every selector: exact per-style id plus `data-gauge-style` in the helpers and unit test; the count assertion (criterion 31 preview count) uses the prefix `[data-testid^="gauge-preview-"]`, so it still counts 2 and is not vacuous.
- **F5 (measurement state, informational):** see the note at the head of Measurements.
- **F6 (non-finite progress, informational):** `Gauge.tsx` now clamps `NaN` to 0. QA test: `components/Gauge.styles.test.tsx`, "review F6": `NaN` paints level `"0"`, never `"NaN"`. Passing.

### Late QA test fixes (not app changes)

- Criterion 39 (reduced motion): the clip-path parser did not accept exponent notation (`6.66667e-05%`, at full level), and the first painted-level read raced the React commit under load. Both were QA test bugs. Fixed in `e2e/helpers/gauge-sampler.ts` (regex accepts exponents) and `e2e/task-022-gauge.spec.ts` (first read is now polled to the reported level). Re-run: 6/6 under parallel load.

### Criterion 48 corrections

No assertion was deleted, and none was loosened to `toMatchObject`. Each change is named:

1. `lib/preferences/schema-v3.test.ts`: `PREFERENCES_VERSION` 3 to 4 (2 literals, 1 title).
2. `lib/preferences/gauge-style.test.ts`: 5 exact-state `toEqual`s gained `gaugeEnabled: false` (the fixtures omit the key, so the default applies; it was `true` before the default flip). The written-envelope `version: 3` became 4.
3. `lib/preferences/preferences.test.ts`: version literal 3 to 4; 4 exact-state `toEqual`s gained `gaugeEnabled: false`.
4. `lib/audio/mix.test.ts`: 2 sorted key lists gained `gaugeEnabled`.
5. `e2e/settings-gauge-style.spec.ts`: criterion 19 key list gained `gaugeEnabled`, version 3 to 4. Group-label assertion moved from the old fieldset legend "Timer gauge" to the radio group's legend "Gauge style" (the heading is now an `h2`; the same visible group label is asserted, 2 tests). Interactive-element list gained one `input:checkbox` (the new switch). The `open()` seed gained `gaugeEnabled: true`, a fixture change because the default is now off. The "fresh visitor" test was rewritten for the default-off state, per criterion 20: gauge absent, vessel preselected, then switch on and the same style-persistence checks.
6. `e2e/timer-gauge.spec.ts`: 9 `localStorage.clear()` became clear plus a seed of `gaugeEnabled: true`. No assertion touched. A first attempt kept the timer state and broke one contrast test; caught and corrected in the same pass.

Outside the criterion-48 list, corrected for the same reasons: `e2e/session-lengths.spec.ts` (legend to "Gauge style"; the sound-checkbox locator excludes the new switch), `e2e/settings-measure.spec.ts` (On/Off scoped to the chime checkbox it was written for), `e2e/uploaded-background.spec.ts` (the forced-colour checked-card test seeds `gaugeEnabled: true`, because the 3px edge shows only while on).

### Tests added (QA)

- Unit `lib/preferences/gauge-enabled.test.ts` (17): 3 to 4 migration keeps every key and fills `gaugeEnabled: false`; v1 entry; stale `gaugeStyle` falls back with no console output; non-boolean `gaugeEnabled` falls back to false; a stale style does not disable the gauge.
- Component `components/Gauge.styles.test.tsx`: enumerates `GAUGE_STYLE_VALUES` against a marker map and renders each preview and live renderer; progress 0.6 gives level 60.
- Guards `components/gauge.guards.test.ts`: preview imports no timer code and no image; gauge components never call timer store setters.
- E2E `e2e/task-022-gauge.spec.ts` (behaviour, 28 tests, all passing; added after review: Enter on the switch, and the F1 per-radio description), `e2e/task-022-measure.spec.ts` (measurement, 7 tests, all passing; the glyph 43 case is recorded, not gated, per ruling 7).
- Unit additions after review: `components/Gauge.styles.test.tsx` (F6 NaN case); `components/TimerGauge.tokens.test.ts` (F3, the three gauge files added to the two guard lists).
- Helper `e2e/helpers/gauge-sampler.ts`: one capture, many points; exact-colour pixel search; clip-path top parser.

Red-proof: the style-enumeration guard went red when a fake `ring` id was added through a mock in a throwaway copy (3 failures); the copy was deleted. The other unit guards were not red-proven. Their expectations are exact values, but this gap is noted.

### Suite

Final tree, after the review fixes and the late QA test fixes:

- Vitest: **1149 / 1149 pass** (50 files). The 3 `lib/audio/chime.test.ts` failures from the first run no longer reproduce; `lib/audio/chime.ts` is no longer modified in git, and QA did not touch it.
- Lint: 0 errors on the touched files; the repo's 15 pre-existing warnings are not in gauge files. Typecheck and build pass.
- Playwright, scratch :3100, served from a build newer than every gauge source file: **111 failed, 475 passed, 1 skipped**.
  - None of the 111 is new against the HEAD baseline set (scratch :3101, clean HEAD 6f4bdb9). None is a task-022 spec.
  - Ruling 8 threshold: no more than 112. The owner's clean-HEAD full-suite figure is 112; this run is 111.
  - Caveat, unchanged: my HEAD comparison came from partial baseline runs covering the spec files that failed in the first full run, not one complete clean-HEAD suite. The 112 is the owner's figure against my tree.
- Criterion 47 (ruling 8): PASS on this evidence. Pre-existing failures are not fixed here.

### Standalone record for criteria 41-44 (evidence for any follow-up on the contrast ground)

- What was measured: the painted pixel of each gauge tone (vessel fill, glyph accent, glyph muted) against the painted page ground beside it. Read from one full-viewport screenshot per scenario, 1280x800, device scale 1, dark theme only, gauge paused at 60% remaining.
- Where the figures come from: `e2e/task-022-measure.spec.ts` (scenarios and derivation), `e2e/helpers/gauge-sampler.ts` (pixel reading), `e2e/helpers/background.ts` (`makePng`, `chooseOnSettings`, `contrastRatio`). Command: `npx playwright test -c e2e/scratch-3100.config.ts e2e/task-022-measure.spec.ts`, against a `npm run build` served from `out/` on :3100.
- Glyph tones are the timer's own digits (`--accent-foreground`, `--muted-foreground`). Their ground in the table is the page background beside the digits, not a card.
- Open figure: glyph accent 2.45:1 and muted 1.64:1 against the derived flat-white ground, versus 3:1. The derived grey is 255 because no grey composite (half opacity over `--background`) reaches the accent's luminance. Owner ruling pending. No token moved in this task.

### Notes for the orchestrator

- Outstanding manual items, not closed by this report: criterion 7's visual parity check (only numeric RGB parity has been done), and criterion 35's by-hand screen-reader pass (only the structural check has been done).
- Criterion 7's parity check is numeric (identical RGB).
- Criterion 35's screen-reader pass was not run by hand; the structural check passes.
- The default-off ruling landed mid-run. Every expectation that depended on the old default was flipped, and the list above names them.


## Measurements

(qa: criteria 41-46. Dark is the only theme. One capture per scenario, viewport 1280x800, device scale 1. The gauge is paused at 15:00 of a 25:00 Focus, which is 60% remaining and matches the preview sample. Run once against the current tree, after the default flip. The figures match the earlier run to the RGB value.)

**Measurement state (review F5).** Criteria 41 and 42 were measured with the gauge **on**. The settings previews carry `opacity-50` while the gauge is off, which is now the shipped default. So the vessel preview's 3.23:1 (and glyph's 12.65:1 and 8.46:1) are the on-state figures and do not describe the default `/settings` view. This is defensible: WCAG 1.4.11 exempts inactive components, and the group is `aria-disabled`. Recorded so the figure is not later read as applying to the default view. Not re-measured.

Tokens resolved in the browser: `--gauge-liquid` rgb(157,87,13); `--popover` (glass) rgb(30,22,16); `--accent-foreground` rgb(251,213,146); `--muted-foreground` rgb(194,177,155); `--background` rgb(28,20,14).

| Criterion | Scenario (capture) | Painted pixel (x, y) | Fill, painted | Ground behind, painted | Ratio |
|---|---|---|---|---|---|
| 41 vessel | live `/`, no upload | left margin, 75% down the layer | rgb(157,87,13), equals `--gauge-liquid` | rgb(30,22,16) glass, 10% down | **3.23:1** |
| 41 glyph accent | live `/`, no upload | exact-match pixel (516,310) in the digits | rgb(251,213,146), equals `--accent-foreground` | rgb(32,24,17) page, left of the digits | **12.53:1** |
| 41 glyph muted | live `/`, no upload | exact-match pixel (678,281) in the digits | rgb(194,177,155), equals `--muted-foreground` | rgb(32,24,17) page | **8.38:1** |
| 42 vessel card | `/settings`, one capture, both cards in view | left margin of the vessel preview | rgb(157,87,13) | rgb(30,22,16) glass | **3.23:1** |
| 42 glyph accent card | same capture | exact-match pixel in the glyph preview digits | rgb(251,213,146) | rgb(31,23,17) card ground | **12.65:1** |
| 42 glyph muted card | same capture | exact-match pixel in the glyph preview digits | rgb(194,177,155) | rgb(31,23,17) card ground | **8.46:1** |
| 43 vessel, derived | live `/`, flat grey 188 upload | as 41 vessel | as 41 | rgb(30,22,16), the glass (opaque; the upload does not reach it) | 3.23:1 |
| 43 vessel, white | live `/`, flat 255 | as 41 vessel | as 41 | rgb(30,22,16) | 3.23:1 |
| 43 vessel, black | live `/`, flat 0 | as 41 vessel | as 41 | rgb(30,22,16) | 3.23:1 |
| 43 glyph, derived | live `/`, flat 255 (no grey reaches the target) | exact accent pixel (516,310) | rgb(251,213,146) | rgb(142,138,135) = 0.5 x 255 + 0.5 x `--background` | **2.45:1** |
| 43 glyph, white | same as derived | same | same | rgb(142,138,135) | 2.45:1 |
| 43 glyph, black | live `/`, flat 0 | exact accent pixel (516,310) | rgb(251,213,146) | rgb(14,10,7) | 14.11:1 |
| 43 glyph muted (derived) | live `/`, flat 255 | exact muted pixel (678,281) | rgb(194,177,155) | rgb(142,138,135) | 1.64:1 |

**Criterion 43 derivation.** Target = relative luminance of the gauge colour. Vessel: `--gauge-liquid`. Glyph: `--accent-foreground`, the tone above the surface. For each grey u from 0 to 255, composite = 0.5 x u + 0.5 x `--background`. The composite nearest the target luminance gives the derived upload. Vessel: grey 188. Glyph: grey 255, because the brightest composite (142) is still below the accent's luminance. The derived case is no higher than white and black in either style (asserted in the spec).

**Criterion 44: discharged by ruling 7.** Glyph worst case 2.45:1 (accent tone), muted 1.64:1. Recorded as task 020's evidence. Not gated; no token moved.

**Criterion 7 parity (numeric substitute for the manual check).** At 60% remaining the live gauge and the preview paint identical RGB: vessel fill rgb(157,87,13) and glass rgb(30,22,16) in both; glyph accent rgb(251,213,146) in both; glyph muted rgb(194,177,155) in both. Grounds differ by 1 to 2 units (page vs card).

**Criteria 45 and 46.** Pass. These are DOM and rect checks (grid columns, card rects, overflow, visibility), recorded as pass in the table above.


## Review Findings

**Verdict: CHANGES REQUESTED** (2026-11-19). Transcribed by the orchestrator; `reviewer` is read-only.
Independently verified by reviewer, not taken from the QA report: `SloshGauge.tsx` untouched (last
touching commit `3d8cb05`, predates this task); criterion 26 by import grep over all four gauge
components — zero references to `lib/timer`, `useTimerStore` or any timer setter; the stored-end-timestamp
rule intact (`getRemainingMs` is the only time source, the gauge consumes it as a prop); `TimerDisplay.tsx:5`
dead import resolved **by use** (`gaugeLevel` imported and used at line 29); licensing and copy clean, no
new assets, only an inline check-mark SVG.

`Gauge.tsx:89`'s odd-looking `remainingMs={clamped} fullMs={1}` is **correct, not inverted**:
`gaugeLevel(p, 1) = clamp(p*100, 0, 100)` makes the round trip idempotent, and `Gauge.styles.test.tsx`
asserts progress 1 → level 100, 0 → 0, 0.6 → 60 "and not its inverse (40)".

| # | File | Severity | Finding | Disposition |
|---|---|---|---|---|
| F1 | `components/GaugeSettings.tsx:72,97` | medium, blocking | Criterion 34's hint is `aria-describedby` on the `<fieldset>` only; the element that actually takes focus (the checked radio) describes `detailId` alone. A description on `role=group` is the weakest-supported AT placement — VoiceOver commonly drops it — so the off-state user may never hear "Turn on the gauge to choose a style.", which is the entire accepted mitigation for the 33b seam. | **Fix.** Add the hint id to each radio's `aria-describedby` while off. |
| F2 | `components/GaugeSettings.tsx:51-58` | low-medium | Criterion 30 says "Space/Enter toggles it". A native checkbox toggles on Space only; `role="switch"` adds no Enter handling. QA's evidence never exercised Enter, so the clause passed unevidenced. | **Fix** (implement Enter) rather than amend the criterion. |
| F3 | `components/TimerGauge.tokens.test.ts:48-80` | low | The three new components are absent from the no-new-time-source guard (and its hex-literal list). No current violation — reviewer read all three. But `Gauge.tsx` is now the shared gauge, so it is exactly where a future tick-driven level would land, and CLAUDE.md's never-count-intervals rule is unguarded there. | **Fix.** Add all three to the guard. |
| F4 | `components/GaugePreview.tsx:23` | low | Both cards share `data-testid="gauge-preview"`, so any strict-mode `getByTestId` throws; current specs disambiguate via `[data-gauge-style]`. A trap for the next task. | **Fix.** Per-variant id. |
| F5 | `components/GaugeSettings.tsx:115` | informational | `opacity-50` applies to previews while off — now the shipped default — so criterion 42's 3.23:1 was measured in a state users do not see by default. Defensible (WCAG 1.4.11 exempts inactive components, group is `aria-disabled`); recorded so the figure is not later misread. | **No code change.** Annotate the measurement record with the measured state. |
| F6 | `components/Gauge.tsx:83` | informational | The clamp does not reject non-finite input: `NaN` would survive to `SloshGauge`, where `parked` is never true for `NaN`, so the rAF loop would never park (silent battery drain) and `data-gauge-level` would serialise `"NaN"`. Unreachable today — no caller can produce it. | **Fix** as cheap hardening of the now-shared component. |

**Disposition, 2026-11-19 (orchestrator, after one fix loop).** F2, F3, F4, F5, F6 **closed**; each
carries a new test except F5, which is a record annotation. F1's code fix is in — each radio now links
the hint while off (`GaugeSettings.tsx:103`), fieldset link kept — and is **structurally verified only**;
it stays open until the by-hand screen-reader pass. Orchestrator verified independently: Vitest 1149/1149,
the time-source and hex-literal guards cover all three new components, and the F1/F2/F6 edits are present
in the built tree. No second `reviewer` pass was spent: the five closed findings are each a few lines and
each gained a test, and the one finding that cannot be closed by inspection cannot be closed by a review
pass either. Two late QA test bugs were fixed in the same loop (clip-path parser rejecting exponent
notation; a reduced-motion read racing the React commit) — test-side only, no app change.

**Reviewer's sequencing note, accepted:** F1 is precisely what criterion 35's by-hand screen-reader pass
exists to catch, so run that pass *before* closing F1, not after.

**Coverage note:** `session-lengths.spec.ts`'s narrowed locator means the new switch's focus-ring coverage
now rests solely on `e2e/task-022-gauge.spec.ts`.
