# Settings surface, with the timer gauge style as its first preference — history log

Appended by frontend/backend/qa/reviewer/orchestrator after implementation began.
The task's goal, scope and acceptance criteria are in [../008-settings-gauge-style.md](../008-settings-gauge-style.md).

## Observations (not criteria, not scope)
- The draft's observations about `StatsButton` (36 px, default export, `bg-neutral-200`) and
  `TaskListDialog` (36 px, `text-white`) are **resolved**: both triggers are `size-11` with named
  exports and token colours after 007. Removed rather than carried.
- `components/CurrentTaskCard.tsx:4` still imports `TaskColorDot` without rendering it; line 6 still
  carries `border border-none bg-none`. From 006's observations; still true, still nobody's task.
- `docs/PLAN.md` still describes 005 and 009 as "complete but not committed"; the git log says
  otherwise (`09a50e3`, `e47caca`). Orchestrator's to fix.

## Implementation Notes
(Backend, then frontend. Criterion 53 lists what must be here before qa starts.)

### Backend (done, ran first and alone; criterion 2 order)
Files: `lib/preferences/schema.ts`, `lib/preferences/store.ts`. Nothing else. `index.ts` re-exports `*`
from schema, so it needed no edit.

**Exports frontend imports from `@/lib/preferences`:**
- `GAUGE_STYLE_VALUES` = `["vessel", "glyph"] as const`
- `type GaugeStylePreference` = `"vessel" | "glyph"`
- `DEFAULT_GAUGE_STYLE` = `"vessel"`
- `Preferences` now `{ theme: ThemePreference; gaugeStyle: GaugeStylePreference }`
- On `usePreferencesStore`: `gaugeStyle` (state) and `setGaugeStyle(style: GaugeStylePreference)`
  (re-sanitises, so an off-set value falls back to the default). `hasHydrated` is the existing gate.

**Identifiers:** `vessel` = prototype variant 1 (liquid behind the digits, today's rendering, the
default); `glyph` = prototype variant 4 (two-tone fill inside the digits). A third style is a new entry in
`GAUGE_STYLE_VALUES` plus a renderer (criteria 5, 21).

**Storage:** still the single `pomotato-preferences` key; envelope
`{"state":{"theme":...,"gaugeStyle":...},"version":1}`. No second store, key or version constant.

**Criterion 1: no version bump, no new `migratePreferences` branch, no DECISIONS entry.**
`PREFERENCES_VERSION` stays **1**. A pre-existing `{"state":{"theme":"dark"},"version":1}` rehydrates via
`merge` (not `migrate`, which is skipped at matching version): `isPreferences` is false for it, so
`sanitizePreferences` runs per key and yields `theme: "dark"` plus `gaugeStyle: "vessel"`. Verified by
reading the code path, not yet by a test (qa, criterion 7). Persist then writes the widened envelope back.

**Stale comment fixed** (`store.ts` merge comment): now says persist writes the sanitised state back
over a malformed entry. Comment only, behaviour unchanged.

**Criterion 10 gate:** none needed from backend; `TimerGauge.tsx` already renders the gauge only after
the timer store's `ready`. Frontend must still call `usePreferencesStore.persist.rehydrate()` after mount
the way the theme consumer does (`skipHydration: true`) and read `gaugeStyle` only once `hasHydrated`.

**For qa (existing tests that must be updated, not mine to edit):** 18 tests in
`lib/preferences/preferences.test.ts` fail because they pin the theme-only shape (`{theme:"system"}`,
`state` keys `["theme"]`, `{"state":{"theme":"system"},"version":1}` after write-back, and "accepts exactly
the three enum values" via `isPreferences({theme})`). Each is the new key showing up, not a regression.
Baseline before this change was 667/667; now 649 pass / 18 fail. typecheck clean; lint 0 errors, 21
warnings (baseline).

### Frontend (ran after backend; criterion 2 order)
antislop: `during (session override)`, announced before the first edit.

**Consumed from `@/lib/preferences`:** `GAUGE_STYLE_VALUES`, `DEFAULT_GAUGE_STYLE`, `GaugeStylePreference`,
`usePreferencesStore` (`gaugeStyle`, `setGaugeStyle`, `hasHydrated`). Rehydration is not called again in the
new code: `ThemeSync` in `app/layout.tsx` already runs `usePreferencesStore.persist.rehydrate()` on every
route, so `/` and `/settings` are covered. Both consumers read `gaugeStyle` only once `hasHydrated`.
**Criterion 10 gate:** preference `hasHydrated` for the style, plus `TimerGauge`'s existing `ready` (timer
store) for mounting the gauge. No boot script.

**Files.** New: `app/settings/page.tsx`, `components/SettingsPanel.tsx`, `components/SettingsButton.tsx`.
Changed: `widgets/BottomControls.tsx` (third button), `components/TimerDisplay.tsx` (now `"use client"`; reads
the style, sets `--gauge-surface` / `--gauge-lean` on its frame), `components/TimerGauge.tsx` (optional
`style`, `onPaint`), `components/SloshGauge.tsx` (optional `onPaint`, listed as the seventh local edit in the
header). `app/globals.css`, `package.json`, `lib/**` untouched: **no new token**, so criterion 44 has nothing
to add.

**One spring (36, 37, 41).** The glyph style does not copy the spring. It mounts the same `SloshGauge` with
transparent liquid/glass and takes its per-frame surface and lean through `onPaint`; the digits clip a
two-stop `linear-gradient` driven by those two custom properties. No new rAF loop, no new file, no
`setInterval`. Constants still live only in `SloshGauge.tsx`. Idle: the spring parks as before.

**How QA observes the active option:** `data-gauge-style="vessel" | "glyph"` on `[data-testid="timer-gauge"]`.
Glyph digits are the same single `<p>`, real text, with `background-clip: text`.

**Fallbacks (31).** Base colour is `text-foreground`; transparent only inside
`supports-[background-clip:text]`; `forced-colors:` resets to `text-foreground` and no background image.
Not yet exercised under `emulateMedia` by me; QA owns that.

**Surface (19, 20, 21, 23).** `<main>`, back link, one `<h1>Settings</h1>`, one `<fieldset>` with a visible
`<legend>Timer gauge</legend>` and two native radios `name="gauge-style"`. Checked is a bold name plus a 2px
`--primary` edge (1px border + 1px inset), no lifted fill. No `HeaderNav`, no theme control. Entry point:
`SettingsButton`, `size-11` link, `aria-label="Settings"`, in `BottomControls` beside tasks and stats.
Q7: one visible group heading.

**Criteria status, C-G (my belief, QA verifies):** 13, 16, 18, 19, 20, 21, 23, 24, 25, 29, 31, 35, 36, 37,
41, 42, 44, 45, 50 satisfied by construction; 27 and 32 measured partly (below); 34 and 40 not measured by me.
Reduced motion is handled inside `SloshGauge` (lean and bounce already suppressed; `onPaint` receives lean 0).

**Measured, painted pixels, 1280 px, idle (screenshots, glyph digits; ground = painted page corner pixel
including paper grain).** Level set by writing `--gauge-surface`, lean 0.
| Level | Light filled / unfilled | Dark filled / unfilled |
|---|---|---|
| 100 | 7.81 / (none on screen) | 12.39 / (none) |
| 75, 50, 25 | 7.81 / 6.56 | 12.39 / 8.29 |
| 0 | (none) / 6.56 | (none) / 8.29 |
Grounds: light 244,237,227; dark 33,25,19. At 100 and 0 the digits are one flat colour (matches criterion 20).
I did not re-measure the vessel; 009's 4.99 / 15.30 light, 4.68 / 15.12 dark stands, and its code path is
unchanged. Waterline region and reduced-motion re-measure are left to QA.
`/settings` checked-option edge (`--primary`) against painted ground: 4.28:1 light (ground 243,236,226),
8.35:1 dark (ground 33,26,20); needs 3:1. Unchecked edge is `--control-border` (3.44 / 3.80, 009). No
horizontal scroll at 320 or 1280, both themes.

**Gates on this tree:** typecheck clean; lint 21 warnings / 0 errors; vitest 661 pass / 18 fail (the 18 in
`lib/preferences/preferences.test.ts`); build routes `/`, `/_not-found`, `/settings`, `/stats`; e2e 440 pass /
2 skipped / 1 fail (`dark-theme-control.spec.ts:173`, the known one).

**Tests made stale by me:** none observed. Tests QA should add: settings route/e2e, `data-gauge-style`, and
extend `TimerGauge.tokens.test.ts`'s no-time-source guard to `SettingsPanel.tsx`, `SettingsButton.tsx`.
Known gap: not checked in a real browser under forced-colors, nor axe on `/settings`, nor the BottomControls
cluster at 320 px by assertion (visually it fit in the dark 320 screenshot only for `/settings`).

### QA fix round: F4 and F5 (2026-10-26)

- F4 (criterion 31). The glyph digits are now always a solid text layer in the foreground colour. The two-tone fill moved to a `::after` overlay on the same `<p>` that repeats the time via `content: attr(data-time)`, is `text-transparent`, and clips the gradient to its glyphs. Losing the background image drops only the overlay. The readout is still one real, selectable text node (generated content is not in `textContent` or the selection), no second spring, rAF loop or time source. Forced colours hides the overlay. Verified by the QA spec: digits paint with `background-image: none`, the normal path shows both tones, forced-colors still passes. Tradeoff: at anti-aliased glyph edges the foreground layer blends under the overlay, a sub-pixel fringe only.
- F5 (criterion 32). The stop was `14 + 0.7 * level`, which at 100 lands at 84% from the bottom, below the ink top (about 86.5%). It is now `14 + 0.7 * level + 0.4 * max(0, level - 90)`: the slope is unchanged up to level 90, then adds up to 4 points, so level 100 sits at 88% and clears the ink top. Level 0 stays at 14%, below the ink bottom, and was already flat. Because nothing changes below 90, the 75/50/25 waterlines are untouched by construction, and the spec's waterline checks pass.
- Result: `e2e/settings-gauge-style.spec.ts` 89 passed, 1 failed (F1 focus ring, deliberately untouched). Typecheck clean, lint 21 warnings / 0 errors, vitest unchanged.

### Follow-up round: overlay a11y, F1 (2026-10-26)

- Overlay accessibility. Checked the Chromium accessibility tree (CDP `Accessibility.getFullAXTree`). With the overlay as `p::after { content: attr(data-time) }` the time appeared twice (two StaticText nodes), so the first F4 fix was wrong for assistive tech. The `content: ... / ""` alt-text form fixed the tree but made the overlay paint nothing, so it was dropped. Now the overlay is an empty `<span aria-hidden="true" data-time>` inside the `<p>` and the `::after` lives on that span. Pseudo-elements of an aria-hidden element are hidden from the tree: one StaticText "25:00" after the change. The solid layer is kept, `textContent` is still the time once, no real text duplicated. No conflict between accessibility and effect.
- Fringe at display size: the solid foreground layer is only visible where the overlay glyph edge is anti-aliased, a fraction of one pixel wide. At 60-96px it reads as a very slightly darker edge, not visible without zoom; the contrast and flat-colour specs measure the interior and pass.
- F1. `SettingsButton` and `StatsButton` now add `focus-visible:transition-none focus-visible:ring-0 focus-visible:border-control-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring` on top of the shadcn base. Measured on both: solid, 2px, offset 2px, `--ring` full opacity (light rgb(180,83,9) on #fbf4ea = 4.6:1; dark #f0a550 on #1c140e = 8.8:1, both over 3:1). `transition-none` is needed: the base `transition-all` animated the outline in from the 3px translucent ring, so a read at focus time saw 3px. StatsButton: this class change only.
- Gates: typecheck clean, lint 21 warnings / 0 errors, vitest 732 passed, build clean (/, /_not-found, /settings, /stats), full e2e 531 passed / 0 failed / 2 skipped (533 tests total; the earlier 529/4/2 sums to 535, so I think that count was a slip, not a moved test).

## QA Report
Date: 2026-10-26. Tree: working tree as handed over (009 and 008 both uncommitted; nothing committed).

- Verdict: **FAIL**. Four e2e tests fail on app behaviour, and criterion 52 is not met for two clauses. Everything else in the gate set is green.
- Gates run on this tree:
  - `npm run typecheck`: exit 0.
  - `npm run lint`: 0 errors, 21 warnings (baseline 21).
  - `npm run test` (vitest): 732 passed, 0 failed, 19 files. Baseline 667, so +65 new tests and the 18 stale ones updated in place.
  - `npm run build`: exit 0. Routes `/`, `/_not-found`, `/settings`, `/stats`.
  - `npm run test:e2e`: 535 ran (443 existing, 90 new in `e2e/settings-gauge-style.spec.ts`, plus 2 from a temporary probe file deleted before this report). 529 passed, 4 failed (all in the new spec), 2 skipped (not investigated; frontend's pre-QA baseline also had 2). No existing spec failed.

### Stale assertions updated (criterion 46 list)
- `lib/preferences/preferences.test.ts`: the 18 failing assertions. Expected objects and write-back envelopes now carry `gaugeStyle: "vessel"`. The key list is now `["gaugeStyle","theme"]` (sorted). `isPreferences({theme})` is now checked with `gaugeStyle` present, and a new assertion shows a theme with no gauge key is not a complete `Preferences`. Nothing was weakened: an unexpected extra key still fails.
- `e2e/dark-theme-control.spec.ts` (line 173, "3: clicking Dark"): expects exactly `{"state":{"theme":"dark","gaugeStyle":"vessel"},"version":1}` and the key set `["gaugeStyle","theme"]`. The `envelope()` helper is unchanged; it still seeds the legacy theme-only entry, which is the migration case.
- `components/TimerGauge.tokens.test.ts`: lists extended with `SettingsPanel.tsx` and `SettingsButton.tsx` (criterion 41). Entries added only.

### Tests added
- `lib/preferences/gauge-style.test.ts` (new): criterion 7 table (unknown identifier, colour, class name, component name, case change, empty, number, array index, null, boolean, object, missing key, non-object payloads), per-key fallback, and the stored-entry table (unknown id, wrong type, missing key, older/newer version, non-object state, unparseable JSON, array payload). Each row checks the store rehydrates without throwing, the bad key falls back, and the sanitised envelope is written back over the bad entry. Upgrade path: the literal `{"state":{"theme":"dark"},"version":1}` rehydrates to `theme:"dark"`, `gaugeStyle:"vessel"`, written back as the widened envelope. Criterion 9: default is vessel, value set is exactly `["vessel","glyph"]`.
- `components/settings-surface.tokens.test.ts` (new): criterion 42 membership (new files are in the palette guard's walked set), criterion 36 (`TILT_GAIN`, `REST_POS`, `REST_VEL`, `1224`, `1044` each occur in exactly one source file, `SloshGauge.tsx`; test files excluded from the count), criterion 50 (no `any` in new or changed files), criterion 37 (header lists seven local edits, names the shadcn conflict).
- `e2e/settings-gauge-style.spec.ts` (new, 90 tests), covering criteria 13, 16, 19, 20, 23, 24, 25, 27, 29, 31, 32, 34, 40, 48, 49, 52 and the hydration console check for 10.

### Per-criterion result
| # | Result | Evidence |
|---|---|---|
| 1 | PASS | `PREFERENCES_VERSION = 1`, no `migratePreferences` branch, no version bump; no DECISIONS entry required. |
| 2 | PASS (by notes) | Implementation Notes record backend first, frontend second, and the symbols consumed. |
| 5 | PASS | One key `pomotato-preferences`; envelope `{"state":{theme,gaugeStyle},"version":1}`; e2e enumerates the keys written (exactly `gaugeStyle`, `theme`). |
| 7 | PASS | Table tests above; break B1 (sanitiser passes unknown gauge ids through) turns 14 tests red. |
| 9 | PASS | Unit and e2e: fresh visitor sees `data-gauge-style="vessel"`. |
| 10 | PARTIAL | Zero console errors or warnings containing "hydrat" on `/` and `/settings`, vessel and glyph, idle/running/paused. Readout bounding box is identical between the two options at steady state. Not measured across the rehydration instant itself. |
| 12 | PASS | `git diff HEAD` empty for `lib/timer`, `lib/stats`, `lib/db`, both hooks, `boot-script.ts` and its test. |
| 13 | **FAIL** | Size and single-link checks pass at 320 and 1280 px. Focus ring fails: see F1. |
| 16 | PASS | Running and paused timers: byte-identical `pomotato-timer` value across `/` to `/settings` and back; remaining time continuous within 1.5 s; browser Back and the keyboard back link both work. |
| 18 | PASS | `package.json` and `package-lock.json` not modified. |
| 19 | PASS | One `main`, one `h1`, `fieldset`/`legend`, two native radios sharing `name="gauge-style"`. Keyboard: Tab enters the group once on the checked radio, ArrowDown changes it, Tab leaves it, back link returns. |
| 20 | PASS (text) | Visible legend "Timer gauge"; glyph description states no level at full or empty; vessel description states the level shows throughout. |
| 21 | PASS | Two members, two branches; both selectable. |
| 23 | PASS | No `input[name="theme"]` on `/settings`. Every interactive element enumerated: back link and two radios only, each acts. |
| 24 | PASS | Choice applies on `/`, survives reload and a new tab. Break B4 (preference ignored by `TimerDisplay`) turns the test red. |
| 25 | PASS | Running and paused: timer key, readout, `data-gauge-level` and session count unchanged after changing the option. |
| 27 | PASS (see F2) | axe-core (serious/critical) clean on `/settings` in both themes at 320 and 1280; `/` clean for both options x four statuses x both themes x both viewports (32 tests). No horizontal overflow. Every control at least 44x44; the three-button cluster is one row. |
| 29 | PASS | Gauge is `aria-hidden` and carries no digits; `mm:ss` appears once in `main` text, for both options. |
| 31 | **FAIL** | Forced colours: PASS (see F3). Background images unavailable: **FAIL** (F4). Vessel pair passes. |
| 32 | **FAIL** (see F5) | Contrast figures below. Only the flat-colour-at-full clause fails; every ratio floor passes. |
| 34 | PARTIAL | Level tracks the derived remaining time in both reduced and default motion, for both options (tolerance 3). Glyph lean is 0 under reduce, with a default-motion positive control that moves. Vessel lean is not observable from the DOM, so vessel lean suppression is not verified. Ratios under reduced motion were not re-measured. |
| 35 | PARTIAL | `timer-gauge.spec.ts`, `TimerGauge.test.tsx`, `use-resolved-tokens.test.tsx` pass with no assertion changed; they test the vessel only. Glyph three-point sampling and pause-freeze are not separately tested. |
| 36 | PASS | Spring constants in exactly one file. |
| 37 | PASS | Header lists seven local edits, including the `onPaint` edit; still says a future `shadcn add` is a conflict. |
| 40 | PASS | Zero rAF callbacks over 1 s after a 1 s settle, idle/paused/complete, both options. Running positive control non-zero, both options. |
| 41 | PASS | Guard extended to `SettingsPanel.tsx` and `SettingsButton.tsx`; no `setInterval`/`setTimeout`/rAF there. |
| 42 | PASS | `ALLOWED_RAW_UTILITIES` is `{}`; `ALLOWED_LITERALS` has its one entry; new files in the walked set. Break B2 (`bg-white` in `SettingsPanel`) turns the palette guard red. |
| 44 | PASS (no new token) | `--gauge-surface`/`--gauge-lean` are inline properties on the frame; zero matches in `app/globals.css`. Cannot diff against a pre-008 `globals.css` because 009 is also uncommitted. |
| 45 | PARTIAL | Text pairs on `/settings` pass axe `color-contrast` in both themes (painted). Boundary figures are frontend's (checked edge `--primary` 4.28:1 light, 8.35:1 dark; unchecked `--control-border` 3.44 / 3.80 from 009). Not independently re-measured. |
| 46 | PASS (see notes above) | Gates listed above. |
| 48 | PASS (partial) | Completed focus run (seeded 1.5 s) logs exactly one session row under each option, no double count after 1.5 s more; a reset run logs none. Pinned task `completed` count not checked. |
| 49 | PASS | Zero console errors or warnings through load, settings, change, return, reload, start, pause, resume, both themes. |
| 50 | PASS | Guard test over new and changed files. |
| 51 | PASS | No try/catch or conditional assertions in the new specs; flat-colour and positive-control checks are separate tests. |
| 52 | **FAIL** (see G) | Break-and-restore results below. |
| 53 | PASS | Implementation Notes contain the symbols, the option identifiers and variant mapping, the URL, `data-gauge-style`, the spring location, and the contrast table. |

### Contrast, measured (criterion 32)
Method: `readout` (`p` after the gauge) screenshotted at DPR 1 and decoded in the browser. Ground = mean of the four 3x3 corner blocks of the digit box (the grain-painted page). Accent and muted are the resolved `--accent-foreground` and `--muted-foreground`. Filled = accent pixels below the stop, unfilled = muted pixels above it, waterline = hard-colour pixels within 2 px of the stop. Stop = 14 + 0.7 x level percent from the bottom (the calibration in `TimerDisplay.tsx`). Level set by writing `--gauge-surface` on the frame.

Ground used: light mean (245,237,227); dark mean (32,24,18). Frontend's single-corner samples (244,237,227) and (33,25,19) differ by under 0.2 in every ratio.

| Theme (ground) | Level | Filled | Unfilled | Waterline |
|---|---|---|---|---|
| light (245,237,227) | 100 | 7.82 (n=7455) | 6.58 (n=141, the sliver in F5) | none |
| light | 75 | 7.82 | 6.58 | 6.08 (n=332) |
| light | 50 | 7.82 | 6.58 | 6.06 (n=419) |
| light | 25 | 7.82 | 6.58 | 5.81 (n=374) |
| light | 0 | none | 6.58 (n=7635) | none |
| dark (32,24,18) | 100 | 12.52 (n=7449) | 8.37 (n=141, the sliver in F5) | none |
| dark | 75 | 12.52 | 8.37 | 7.92 (n=332) |
| dark | 50 | 12.52 | 8.37 | 7.90 (n=419) |
| dark | 25 | 12.52 | 8.37 | 7.92 (n=373) |
| dark | 0 | none | 8.37 (n=7615) | none |

Every ratio is at or above 4.5. Vessel was not re-measured, as instructed; the existing `dark-contrast` and `timer-surface` specs that carry 009's vessel figures pass unchanged.

### Failures and repro

**F1 (criterion 13, focus indicator). Owner: frontend.**
- Repro: `npx playwright test e2e/settings-gauge-style.spec.ts -g "focus ring"`
- Expected: focused Settings link paints a 2 px outline at 2 px offset in `--ring`.
- Actual: computed `outline: solid 3px`, `outline-offset: 0px`, colour `--ring` at 50% (painted [215,164,122]). The shadcn `Button` classes (`focus-visible:ring-3 focus-visible:ring-ring/50`, `outline-ring/50` from the base layer) win over the unlayered `:focus-visible` rule in `app/globals.css:268-271`.
- Note: `StatsButton` (`a[aria-label="Focus stats"]`) shows the identical value. Fixing only `SettingsButton` would diverge it from its neighbour; the owner or orchestrator should decide whether to fix both.

**F2 (criterion 27, cluster and 320 px). No failure.** Listed for completeness: the cluster is one row, 44 px, no overflow in all 32 `/` cases.

**F3 (criterion 31, forced colours). Passes, but the fallback is not load-bearing in Chromium.** The glyph digits paint (ink 200+ px, max ratio at or above 4.5) under `emulateMedia({forcedColors:"active"})`, and so do vessel digits. Break B5 (removing the `forced-colors:` fallback classes from `DIGITS_GLYPH`) still passes this test: Chromium's forced-colour override supplies the digits on its own. So this test cannot show the fallback works. See G.

**F4 (criterion 31, background images unavailable). FAIL. Owner: frontend.**
- Repro: `npx playwright test e2e/settings-gauge-style.spec.ts -g "background images unavailable: glyph"`
- Setup: glyph style, light theme, `addStyleTag("*, *::before, *::after { background-image: none !important; }")`.
- Expected: painted digit pixels differ from the ground (criterion 31 asks for this in both conditions).
- Actual: 0 painted digit pixels. The digits are `text-transparent` and the only paint is the `background-clip: text` gradient, so they vanish. The vessel pair passes (digits visible with no background images), so the failure is specific to the glyph style. `forced-colors` is not a fallback for this case.

**F5 (criterion 20/32, flat colour at full). FAIL, minor. Owner: frontend.**
- Repro: `npx playwright test e2e/settings-gauge-style.spec.ts -g "at full the digits are one flat colour"`
- Expected: at level 100 the in-digits option paints one colour (criterion 32 "same colour at 100 and 0"; criterion 20 description).
- Actual: 141 muted pixels, in rows 13-14 of a 96 px box, colour (87,83,78) light / the dark equivalent. The gradient stop at 84% from the bottom sits a little below the ink top, so the top two rows of the digits are painted muted. Visually this is a thin cap. Its contrast passes (6.58 light, 8.37 dark), so only the flat-colour clause fails. At level 0 the digits are flat (no accent pixels), so the failure is at full only.

**G. Criterion 52, break-and-restore. Not met for two clauses.** Each break was applied to a scratch copy (`scratchpad/qa-copy`, node_modules cloned); the real tree was never edited. Each file was hash-verified after restore.
- Criterion 7 (B1, sanitiser passes unknown gauge ids): 14 tests red. Met.
- Criterion 24 (B4, `TimerDisplay` ignores the stored value): 1 test red (the fresh-visitor flow). Met.
- Criterion 31 (B5, forced-colours fallback removed): the forced-colours test stays green. Not met; a test that does not discriminate. The no-background test (F4) is the one that discriminates, and it is failing at baseline.
- Spring, clause 1 (D, unmount `s.raf = 0` removed, the 005 break): the new spring movement tests fail for both vessel and glyph, and existing `timer-gauge.spec.ts` drawn-liquid tests fail too. Met.
- Spring, clause 2 (B3, stiffness `1224` changed to `1100`): no test fails. The movement test samples per frame and checks distinct frames and settling; a 5% stiffness change still converges. Not met. A settle-time test calibrated against the vendored spring is needed; I did not write one because that is calibration against vendored code and is a judgement call for the owner.

### Notes on the new coverage
- The per-frame spring sampler (`sampleDrawnLevel`) reads the glyph surface, or the vessel `clip-path` top percentage, which is what the spring draws.
- Pixel classifiers have positive controls: the glyph classifier at level 50 must find both sides and a waterline; the ink detector must find digits in the normal render before it is trusted to report zero in F4.
- Rate-of-idle and reduced-motion assertions are paired with running or default-motion positive controls.

### Process notes
- The antislop mode for this QA session was not resolved: no session instruction was given to QA and I did not check a global preference. The test-file comments I wrote were not run through `antislop-code`. The orchestrator should resolve the mode and review those comments.
- Scratch artefacts (`scratchpad/qa-copy`, debug PNGs, logs) are outside the repo. `e2e/qa-debug.spec.ts` was created and deleted during the run; confirmed absent.

### QA Report, pass 2 (dated 2026-10-26)
Scope: re-verify after frontend's fixes to F1, F4 and F5, plus three QA jobs: a discriminating forced-colours probe, an accessibility-tree pin for the doubled readout, and a recorded spring calibration gap. Pass-1 report above is intact.

- **Verdict: PASS.** All gates green on the handed-over tree. Criterion 52's forced-colour clause is now proven red. One known gap is recorded below, per owner decision, and is not a failure.
- **Gates**
  - `npm run typecheck`: exit 0.
  - `npm run lint`: 0 errors, 21 warnings (baseline).
  - `npm run test` (vitest): 732 passed, 0 failed, 19 files. Matches the coordinator's count.
  - `npm run build`: exit 0; routes `/`, `/_not-found`, `/settings`, `/stats`.
  - `npm run test:e2e`: 536 tests (443 existing, 93 in `e2e/settings-gauge-style.spec.ts`). **534 passed, 0 failed, 2 skipped** (pre-existing skips). Frontend's 533 and my earlier 535 were both wrong for this tree: the new spec now has 93 tests (+3 from this pass), and the probe file is gone.

#### What changed in the tests this pass
- **F1 (focus), both entry buttons.** Two tests: `Settings` and `Focus stats` each assert a solid 2px outline, 2px offset, and the resolved `--ring` colour on keyboard focus. Both pass.
- **F4 (background images unavailable).** The existing test now passes: the digits stay painted as a solid text layer, and only the overlay is lost.
- **F5 (flat at full).** The "at full the digits are one flat colour" tests (light and dark) now pass: zero muted pixels at level 100.
- **Forced colours, rewritten to assert our fallback.** The old pixel probe was dropped. It asserts that the overlay host (`span[aria-hidden][data-time]`) has computed `display: none` under `forced-colors: active`. Positive control: the same host is not `none` outside forced colours. The solid digits must not be a transparent colour, with pixel checks kept as support.
- **Accessibility tree, new.** `Accessibility.getFullAXTree` over CDP, for both options: the mm:ss readout is exposed as StaticText exactly once. Positive control: the time is present at all.
- **Comments.** Antislop is in DURING mode (session override), announced before the first edit. Per antislop-code, I flattened the `// ---- ----` banners in the e2e spec to plain labels, and trimmed the over-long comments in `e2e/settings-gauge-style.spec.ts` and `lib/preferences/gauge-style.test.ts`. No code, assertions or identifiers changed. `tsc` and `eslint` are clean on the touched files.

#### Red-proof: each guard fails when its fallback is removed (scratch copy `scratchpad/qa-copy`, real tree untouched)
- **B6, forced-colours fallback removed** (`forced-colors:hidden` taken off the overlay): the forced-colours test goes red. Computed overlay display is `inline`, expected `none`. Restored and matched to the real tree by hash.
- **B7, aria-hidden removed from the overlay host**: the AX test goes red. Received `["02:05", "02:05"]`, expected one. This reproduces the doubled readout. Restored and matched by hash.
- Earlier breaks from pass 1 still stand: B1 (sanitiser, 14 red), B2 (guard, 1 red), B4 (timer ignores stored style, 1 red), D (spring unmount, both renderings red).

#### Glyph contrast, measured (pass 2; ground = mean of 4 corner blocks, as in pass 1)
Light ground (245,237,227); dark ground (32,24,18). Level 100 now has no muted pixels, so the flat-colour clause passes.

| Theme | Level | Filled | Unfilled | Waterline |
|---|---|---|---|---|
| light | 100 | 7.82 (n=7930) | none (flat) | none |
| light | 75 | 7.82 | 6.58 | 6.07 |
| light | 50 | 7.82 | 6.58 | 6.33 |
| light | 25 | 7.82 | 6.58 | 5.96 |
| light | 0 | none (flat) | 6.58 | none |
| dark | 100 | 12.52 (n=7925) | none (flat) | none |
| dark | 75 | 12.52 | 8.37 | 8.01 |
| dark | 50 | 12.52 | 8.37 | 8.25 |
| dark | 25 | 12.52 | 8.37 | 7.87 |
| dark | 0 | none (flat) | 8.37 | none |

- Every ratio is at or above 4.5.
- Filled and unfilled at 75, 50 and 25 are identical to pass 1. The waterline minima moved by up to about +0.3 (light 50: 6.06 to 6.33; dark 50: 7.90 to 8.25), because the band now samples the overlay over the solid base. All pass.

#### Known gap (recorded per owner decision; not built)
- **Spring stiffness is not guarded.** Changing `k = 1224 - 1044 * vis` (`components/SloshGauge.tsx`, stiffness base 1224) to 1100 makes no test fail. This is break B3 from pass 1, and the pass-2 movement test still passes under it.
- **What a future test would need.** A settle-time test that samples the drawn level per frame after a fixed level step, and compares the settle time with a tolerance calibrated against 1224. Calibration needs a deterministic step (a fixed-timestep harness, or stubbed `requestAnimationFrame` time) so the number is stable across machines. That is the work; it is not in this task.
- **Why it is acceptable now.** The constant has not moved since 005. Break D (the unmount `raf` reset) is still caught for both renderings.

#### Files touched in pass 2
- `e2e/settings-gauge-style.spec.ts` (focus tests for both buttons, forced-colours rewrite, AX test, banners, comment trims)
- `lib/preferences/gauge-style.test.ts` (comment trims only)
- `docs/tasks/008-settings-gauge-style.md` (this section only)

## Review Findings
(Reviewer, read-only, 2026-10-26. Working tree vs `e47caca`. Landed by the orchestrator, since
`reviewer` has no write tool by design; the text is the reviewer's, verbatim.)

- **Verdict: APPROVE.** All 36 criteria check out against the diff; the two new red-proofs do
  discriminate; no licensing, branding or `any` exposure. Findings below are ranked, and none of them
  blocks landing.
- **Gates I re-ran myself:** `npm run typecheck` exit 0; `vitest run` 732 passed / 0 failed / 19 files.
  Build and e2e taken from QA pass 2 (534/0/2 of 536), not re-run.
- **Freeze list (criterion 12) is clean**, verified directly: `git diff HEAD` is empty for `lib/timer/`,
  `lib/stats/`, `lib/db/`, `hooks/use-timer-clock.ts`, `hooks/use-hydrate-timer-store.ts`,
  `lib/preferences/boot-script.ts` and its test — and for `package.json` / `package-lock.json`
  (criterion 18). One icon library: the only new icon is `RiSettings3Fill` from `react-icons`.
- **Conventions hold.** No `any` or unsound cast in app code (the only casts are CDP response typing in
  the e2e spec). Named exports throughout. Native `<fieldset>/<legend>/<input type="radio">` on
  `/settings`, one `<main>`, one `<h1>`, back link first in DOM order. Remaining time still derives from
  the stored end timestamp — `TimerDisplay` takes `remainingMs` as a prop, the spring's rAF loop is
  still only in `SloshGauge.tsx`, and the no-time-source guard now covers the two new components.
- **Licensing/branding:** nothing shipped. The grain is a procedural `feTurbulence` data URI, no texture
  asset; `SloshGauge.tsx`'s header still names ReactBits (MIT + Commons Clause), the `shadcn add`
  conflict, and now lists seven local edits (criterion 37). `onPaint` is genuinely optional — typed
  `onPaint?:`, stored as `| undefined` in `Live`, invoked `live.current.onPaint?.(x, th)`, and
  `TimerGauge` passes `undefined` for `vessel`, so the vendored behaviour is untouched when unused.

### Judgement calls I was asked for

1. **The glyph readout's structure is sound.** One `<p>` holds the only text node; the overlay is an
   empty `aria-hidden` `<span data-time>` whose `::after` carries `content: attr(data-time)`. Generated
   content is not in `textContent`, not in Chromium's `innerText` (the criterion-29 test proves this:
   `main` innerText contains the time exactly once in glyph mode), not selectable (`after:select-none`
   on top of generated content not being selectable at all), and not in the AX tree. Copy/paste
   therefore yields `mm:ss` once. The overlay is out of flow (`absolute inset-0` against the `relative`
   `<p>`), so it adds no width and cannot reflow — pinned by the identical-bounding-box test. Losing
   background images drops only the overlay; forced colours sets the host to `display: none`. I looked
   for a third failure mode and found two soft edges, both recorded below as R-3 and R-4, neither a
   defect today. One thing I checked and cleared: there is **no vessel flash** for a stored `glyph`
   preference, because `ThemeSync`'s `persist.rehydrate()` effect commits before the timer store's gate
   that mounts the gauge, so `prefsHydrated` is already true when the first gauge frame paints.
2. **Both new red-proofs discriminate.** Forced colours (`e2e/settings-gauge-style.spec.ts:575-593`)
   reads the host's computed `display` and returns the sentinel `"no-host"` when the element is absent,
   so every way of losing the fallback — removing `forced-colors:hidden`, or removing the host — turns
   the `expect.poll(...).toBe("none")` red, and the positive control outside forced colours is a real
   assertion. The AX test (`:734-758`) filters non-ignored `StaticText` nodes over CDP and asserts both
   `toContain(time)` (positive control) and `filter(=== time).toHaveLength(1)`; removing `aria-hidden`
   genuinely yields two nodes, which matches QA's recorded `["02:05","02:05"]`. Neither has 009's
   can't-fail shape.
3. **The grain costs real contrast headroom in exactly one place** — see R-2. Everything else is safe,
   and I verified why: the grain sits behind all element backgrounds, and every surface that carries a
   measured figure (`--card` task rows, `--popover` dialog and gauge glass, `bg-secondary` buttons) is
   opaque, so the eight task swatches, the vessel's 4.99/15.30 light and 4.68/15.12 dark, and the dark
   `--popover` figures all stand unchanged. The glyph table was measured painted *with* grain, so it is
   the most trustworthy table in this file.
4. **`SloshGauge.tsx`'s `onPaint` is correctly recorded and correctly optional** — see the licensing
   bullet above. It also costs nothing per frame for `vessel`, and writing two custom properties on an
   ancestor from inside `paint()` keeps the per-frame work out of React entirely: no re-render per
   frame, `onPaint` is a `useCallback([])`, and `live.current` is refreshed by ref, not by effect
   re-subscription.

### Findings

**R-1 (medium, follow-up — not a blocker). On `/settings` the selected option is distinguishable only
by font weight under forced colours.** `components/SettingsPanel.tsx:52-55`: the radio is `peer sr-only`,
and checked state is carried by `peer-checked:border-primary` plus
`peer-checked:shadow-[inset_0_0_0_1px_var(--primary)]`. In forced-colors mode the UA forces every
`border-color` to the same system colour and forces `box-shadow` to `none` (CSS Color Adjust 1 §3.2),
so both edges render identically and the clipped native radio shows nothing — leaving `font-bold` vs
`font-medium` as the whole indicator. No criterion requires forced-colors *state* indication (criterion
31 scopes forced colours to the digits, criterion 45 to measured ratios), and weight is a non-colour
cue, so this is not a WCAG failure — but it is thin for the one screen whose job is choosing. Cheapest
fixes: `forced-colors:not-sr-only` on the input (restores the native dot), or a
`peer-checked:forced-colors:outline peer-checked:forced-colors:outline-2` on the card. Either way, the
comment at `SettingsPanel.tsx:22-25` ("so it holds in greyscale and forced colours") should be
corrected: greyscale holds, forced colours does not.

**R-2 (medium, documentation accuracy — no floor broken).** The paper grain makes criterion 45's quoted
unchecked-edge figure stale. `--control-border` (`#88837e`) on the light page ground measures **3.44:1
against the flat token, ~3.26:1 against the mean grained ground, and 3.01:1 against a worst-case
full-mask grain pixel** (my computation, compositing `--grain-ink` at `--grain-opacity` over
`--background`; my mean reproduces QA's painted sample of 245,237,227 to within a unit). So the
unchecked radio edge — which has no fill behind it and therefore sits on grain inside *and* out — still
clears its 3:1 floor, but on roughly 60% less headroom than the figure criterion 45 cites. Dark is
comfortable (3.80 → ~3.66). Two things to land with this: (a) criterion 45's "unchecked edge is
`--control-border` (3.44 / 3.80, 009)" should read ~3.26 light; (b) `--control-border` is now the one
token in the palette with no room left to spend — worth a line in DECISIONS or PLAN so the next task
that darkens a ground, or reuses this edge on a fill-less control, knows it. Also note for the record
that the grain's own tokens ship without criterion 44's "measured figures for every ground it is
painted on" (the equivalent evidence — the 236-251 / 28-40 painted spread — is in DECISIONS instead);
that is consistent with the grain having shipped off-pipeline, and the figure above closes the gap.
Everything else in the DECISIONS grain entry checks out, including "never composites over text,
controls or the eight task swatches".

**R-3 (low).** The glyph waterline mapping (`14 + 0.7·level + 0.4·max(0, level-90)`, `TimerDisplay.tsx`)
is calibrated to Space Grotesk's ink box at 60-96 px. If the webfont does not paint (a 404, or the
`font-display` fallback window), the fallback face's cap height and baseline differ and the stop no
longer lands on the ink — which is exactly the F5 class of bug, including the muted cap at level 100
that pass 2 just removed. Nothing asserts this, and I am not asking for a test; one sentence in the
Implementation Notes saying the calibration assumes the loaded face would stop the next person
re-deriving it.

**R-4 (low).** At the `@supports (background-clip: text)` boundary (older Safari), the overlay renders
as fully transparent text and the vessel is already transparent and borderless in glyph mode — so those
users get legible digits with **no level indicator of any kind**, rather than a fallback to the vessel.
Criterion 31 is satisfied (digits legible), and the browser set is narrow, so this is a record-it item,
not work.

**R-5 (nit).** Criterion 29's "copied string" clause is covered by `textContent` / `innerText` proxies
only; nothing reads the clipboard. The proxies are sound here (generated content is not selectable), so
this is noted for completeness.

**R-6 (nit).** `docs/PLAN.md` still labels 009 "Complete but not committed" while the git log shows
`09a50e3` / `e47caca`. The task file already flags this under Observations as the orchestrator's; it is
still unfixed in this tree. The same line is *correct* for the paper grain, which genuinely is
uncommitted.

**R-7 (nits, cosmetic).** `CLAUDE.md` leaves a doubled blank line where the old "Trivial changes…"
sentence was removed. `TimerDisplay.tsx`'s block comment has one run-on line that breaks the file's
wrap width, left over from the F4 edit rounds. `SettingsButton.tsx` wraps its `<Button asChild>` in a
bare `<div>` — redundant, but it mirrors `StatsButton` exactly, which is the right call for a pair that
must not diverge.

### Checked and clear, for the record
Prototype deletion is complete — no `app/prototype` or `components/prototype` reference survives in
`app/`, `components/`, `hooks/`, `lib/`, `widgets/` or `e2e/`; the `ALLOWED_LITERALS` entry and the
009 criterion-45 block are gone with it, and the `settle` import went with the block so lint stays at
0 errors. The reworked first-paint assertion in `e2e/dark-theme-control.spec.ts` is *stronger* than the
exact-match it replaced, because the "nearer the correct ground than the other theme's" clause is a
~220-per-channel margin against ~15 of noise. The vessel path is byte-equivalent in output: the
non-glyph branch composes the identical class list it had at `HEAD`. Spring constants still resolve to
exactly one file, and the recorded stiffness gap (B3) is correctly characterised as uncovered rather
than passing.

---

## Refreshed 2026-10-26 — what changed, and what was cut

Original draft predates 006, 007 and 009. **53 criteria → 36.** Survivors keep their original
numbers, because DECISIONS and PLAN cite 1, 5 and 18 by number.

**Blockers removed**
- "Hard dependency: 006 must be closed first" → "Dependencies — all clear". 006's criterion-10 pin no
  longer binds. *Correction to the brief this refresh was given:* 006 has **no reviewer verdict** — it
  was closed by an orchestrator note on 2026-10-21 with its Review Findings left as the template.
  That is why old criterion 3 ("006 is done with a Review Findings verdict") was cut rather than
  reworded: as written it can never be satisfied.
- **Q4 answered and closed** (`--control-border`, 3.44:1 / 3.80:1).

**Data shape: undecided → decided**
- The zustand-vs-Dexie section is replaced with what exists. 009 built `lib/preferences/` exactly as
  this file's PM read argued, and DECISIONS records it as answering 008's criterion 1. **008 adds one
  key.** Criterion 1 now only asks for an entry in the version-bump case. Criterion 5 absorbed "exactly
  one preference system". Criterion 7 absorbed the real migration case and now matches the recorded
  write-back behaviour — a test asserting the bytes are untouched would be wrong, which is also a
  stale comment in `store.ts:43-45` that backend should fix while it is in the file.

**Theme controls: deferred → never**
- The "build it so a theme section drops in" instruction is gone. 009 shipped the control in
  `widgets/HeaderNav.tsx` and the owner's 2026-10-26 decision keeps it there; criterion 23 now asserts
  `/settings` renders no theme radio, which is what preserves 009's "one instance ships" rule. 009's
  own "008 will move or mirror this control" line is overruled.

**Prototype: scope → already done**
- The owner deleted `app/prototype/` and `components/prototype/`; the orchestrator landed the fallout
  (009's criterion 45 e2e block, the `ALLOWED_LITERALS` entry and its assertion). Verified gone.
  Old criterion 39 is **cut, not deferred**, and the stale-test instruction with it.
- Knock-on, verified by grep: the spring constants now live in **exactly one file**, so there is no
  duplicate to collapse. The "a real extraction, not a copy-paste" section is rewritten — the
  extraction is now **optional and frontend's call**; the only requirement is that no *second* copy
  appears (criterion 36).

**Facts corrected against the code**
- The vessel's "9.79:1 / 15.30:1" is void — 009 re-pointed `--gauge-liquid` to `#d97706`, making it
  4.99 / 15.30 light and 4.68 / 15.12 dark. The whole variant table is relabelled pre-009 provenance;
  variant 2's 1.49:1 is void too, and the decision not to ship it now rests on this task's 4.5:1
  floor, not that figure.
- Old criterion 41 was **unsatisfiable**: it required the no-rAF guard to cover every file the task
  adds, including a spring module that must contain exactly one rAF loop. Now a named exemption.
- Old criterion 43 told QA to hand-extend `TimerSurface.tokens.test.ts`; 007's
  `components/palette.tokens.test.ts` discovers files by walking four directories, so it covers new
  files automatically. Merged into 42 as a membership assertion.
- Criterion 44: a new token now needs **both** a `:root` and a `.dark` value with measured figures —
  "milestone 4 will give it a dark value" stopped being valid when `.dark` shipped. The pinned list
  gained the `.dark` block and 009's `prefers-reduced-motion` block.
- Criterion 45 was "dark-ready for a future `.dark` block"; dark exists, so it is measured in both
  themes, with the `--popover`-cannot-be-lifted constraint named.
- Criterion 46 restores the verified baselines (lint 21 warnings, vitest 667, routes `/`, `/settings`,
  `/stats`, `/_not-found`) and absorbs old criterion 47, whose named spec list was five files short.
- Criterion 51 cited 2026-10-15 for the four can't-fail shapes; they are in the 2026-10-09 entry.
  Criterion 37 and the spring section cited 2026-10-15 for the ReactBits vendoring entry, dated
  2026-10-19.
- Criterion 19 names the real precedent (`ThemeControl.tsx:27-47`) instead of describing one.
- Criterion 10 now says what "no mismatch" means here and records that **no boot script is needed**,
  because `TimerGauge.tsx:44` already gates on the timer's hydration.
- Criteria 13 and 27 account for `widgets/BottomControls.tsx` becoming a three-button cluster.
- Criterion 36 states the constant count must stay at one rather than grow.
- Criterion 21 fixed to the settled answer (two options), and absorbed old 22.
- Stale observations about `StatsButton`/`TaskListDialog` sizes and raw palette classes removed — 007
  fixed both.

**Cut, with reasons** (17 criteria; numbers left as gaps so survivors keep theirs)

| Cut | Why |
|---|---|
| 3 | Gated on a 006 review verdict that does not exist. Unsatisfiable as worded. |
| 4 | "Persists and survives reload/new tab" is already criterion 24's second clause. |
| 6 | Merged into 5 (one storage key, one store, one version constant). |
| 8 | Merged into 7 as its first named case, where the test lives anyway. |
| 11 | The Dexie branch is void; `lib/db/` moved into criterion 12's diff pin. |
| 14, 15 | Merged into 13 — one entry-point criterion instead of three. |
| 17 | Merged into 16; both are "the trip does not disturb the timer". |
| 22 | Merged into 21 — a two-member value set already excludes a third identifier. |
| 26 | Merged into 19; native radios are what make the keyboard walk work. |
| 28 | Merged into 27 — same two viewports, same run. |
| 30 | Merged into 29; "real text in the a11y tree" is the same assertion. |
| 33 | Merged into 32 as its "expected, not a defect" clause. |
| 38 | Covered by 35 (named tests pass unchanged) plus 52 (break-and-restore in both renderers). |
| 39 | Already done — prototype deleted, fallout landed. |
| 43 | Merged into 42; the guard is self-discovering. |
| 47 | Merged into 46. |

**009's sweep findings** are ruled on in a table rather than left for frontend to discover: all five
are **out**, two leave a constraint behind (the 320 px bottom cluster, the `--popover` elevation cap),
and the `HeaderNav` landmark defect must not be copied into the new page. `components/TaskForm.tsx` is
not touched by this task at all, so its dead `disabled:` utilities are explicitly not 008's.
