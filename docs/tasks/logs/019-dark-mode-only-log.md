# Dark mode only — retire light, system, and the theme selector — history log

Appended by frontend/backend/qa/reviewer/orchestrator after implementation began.
The task's goal, scope and acceptance criteria are in [../019-dark-mode-only.md](../019-dark-mode-only.md).

<!--
  Verdicts and repro steps, not the journey. Over half of every pre-2026-11-12 task file
  was narrative appended here, and every later agent paid to re-read it.
  Append under the matching heading; grep-friendly headings matter more than prose.
-->

## Implementation Notes

### frontend, round 1 (groups A-E, G)
- Deleted: `components/ThemeControl.tsx`, `components/ThemeSync.tsx`, `components/ThemeLockAnnouncer.tsx`,
  `hooks/use-theme-sync.ts`, `hooks/use-theme-lock.ts`. Created: none.
- **Dark in SSR HTML:** `<html data-theme="dark">` static in `app/layout.tsx`; `color-scheme: dark` in
  `:root`; `export const viewport` sets `colorScheme: "dark"` and `themeColor: "#1c140e"`. The hex repeats
  `--background` because metadata cannot read a CSS variable; criterion 26 asserts the equality at runtime.
- **`theme` field dropped without a version bump.** `PREFERENCES_VERSION` stays 3; no surviving key changed
  meaning. `store.merge` previously spread the stored envelope as-is, so a stale `theme` key passed through;
  it now returns `{ ...current, ...sanitizePreferences(persisted) }`, and `sanitizePreferences` builds from
  known keys only. The storage key itself is never cleared, only the field.
  - **Unverified:** the write-back of the cleaned envelope rides `onRehydrateStorage` -> `setHasHydrated`.
    Criterion 20's e2e is the check. If it fails, bump to 4 to force the write.
- **Boot script** has no theme branch. One `getItem`, one `JSON.parse`, sets or removes `data-task-panel`
  outright, so a second run is a no-op. `suppressHydrationWarning` stays on `<html>` for `data-task-panel`
  (criterion 16's "other reason").
- Preferences rehydration moved off `ThemeSync` to `useHydrateTimerStore` in `TimerClockProvider`.
- **Tokens deleted:** the eight `--sidebar-*` plus their `--color-sidebar-*` mappings; `.dark` and
  `@custom-variant dark`; the light value of all 32 overridden tokens. `--radius` kept (not a colour).
  `grep "dark:"` and `grep "\.dark\b"` over app code return nothing.
- **Provenance (criterion 49):** every `.dark` contrast figure moved into the `:root` comment of the value it
  documents; light-only figures removed with their values. `--control-border`'s 3.23:1 / 4.35:1 are still
  marked "computed, not yet read from painted pixels".
- **Checks:** lint 0 errors / 15 warnings (2 pre-existing unused imports outside tests). `typecheck` and
  `build` compile but fail type-check **on test files only**, all importing deleted theme exports. Criterion
  10 stays open until qa updates them. `lib/preferences/gauge-style.test.ts` uses `theme` at :145, :166, :177
  and is missing from the brief's inventory.
- Nothing was run in a browser; no unit or e2e test was executed.

## Orchestrator Review

### Round 1 (antislop core, DURING mode) - CHANGES REQUESTED, 2 must-fix
Scope of this gate: the core filter plus the brief's own boundaries. Groups F and H are qa's.

**R1-1 (must fix) - task 018's background provider/context/status apparatus is dead; revert it.**
`components/BackgroundProvider.tsx`, the `BackgroundSource`/`status` rewrite of `hooks/use-background-image.ts`
and `BackgroundStatus` in `lib/preferences/schema.ts:192` all arrived with 018 (none is in HEAD) for one
reason: the theme lock needed `pending` told apart from `absent`. Evidence it now serves nothing:
`useBackgroundStatus` has zero consumers in app code; the only consumer of the context is
`components/BackgroundLayer.tsx:26`, which takes `.url` alone; and `BackgroundLayer` is mounted **only** in
`app/page.tsx:12`, while `BackgroundProvider` sits in the root layout, so `/stats` and `/settings` now pay a
Dexie read and an image decode they did not pay before 019. 018's own decision entry records that cost as the
accepted price of the lock. The lock is gone, so the price buys nothing. The owner's instruction was to remove
018's code where it already exists; the pm's closed question calling the provider "background infrastructure,
not theme-lock" was wrong on this file, and the orchestrator repeated it in the implementation handoff.
Keeping it because "tests may use it" inverts the dependency.
*Fix:* revert `hooks/use-background-image.ts` to HEAD, delete `components/BackgroundProvider.tsx`, drop the
wrapper from `app/layout.tsx`, delete the `BackgroundStatus` type. Background upload/remove behaviour must be
unchanged (criterion 54).

**R1-2 (must fix) - the selected-state underline was applied to three controls that already had a non-colour
cue, changing visuals the owner asked to keep pixel-for-pixel.**
Criterion 29 is scoped to controls that "previously signalled state by colour alone". These did not:
- `components/ui/mode-chip.tsx` - bold when checked. Its own comment documented choosing weight *over* an
  underline ("unlike an underline it needs no extra mark"); the edit reverses a recorded decision without
  naming it.
- `components/StatsViewSwitcher.tsx` - `font-semibold` plus `border-primary`.
- `components/SettingsPanel.tsx` gauge cards - `font-bold` plus a 2px primary edge, with a 3px forced-colors
  fallback already in place.
Three underlines added for a criterion that did not ask for them is technique without purpose (C-1).
*Fix:* revert the underline utilities and the comment edits on those three; keep the comments' original
reasoning.
*Keep:* the `TaskPanelToggle` bar. That icon button rendered identically in both states, so it was the one
control genuinely signalling nothing; a drawn mark is correct where there is no text to weight.

**R1-3 (ruling, no change) - the current task row stays as it is.** `aria-current` plus `border-primary` plus
a semibold/medium weight step. Weight is a non-colour cue, and R1-2 holds weight sufficient for the mode
chips, so it is sufficient here. An underline would collide with the row's `line-through`.

**R1-4 (ruling, no change) - `aria-expanded` is correct on `TaskPanelToggle`.** It discloses a panel. Criterion
30 wants a programmatic state, and names `aria-pressed` for toggles only; a disclosure is not a toggle button.

**R1-5 (fix) - `BACKGROUND_ID_PATTERN` was changed from module-private to exported** (`lib/preferences/schema.ts`)
with no consumer and no stated reason. Revert unless something needs it.

**Noted, no change:** `data-theme="dark"` is read by nothing, but it is the stable server-rendered target for
criterion 14 and the natural hook if a second theme ever lands - cheap, keep. `isPreferences` is now exported
with test-only consumers; it still documents the envelope contract, so reviewer's call, not a blocker.

**Delivery Gate, R-35: not satisfied.** Nothing has been run in a browser and no test has been executed. The
gate cannot pass until qa runs groups F and H. No PASS may be reported before then.

## QA Report
(qa, 2026-11-12. Run on the tree as frontend and the orchestrator left it, plus the QA test edits listed below. One production build; scratch Playwright on :3100. Baseline = HEAD exported with git archive, built and run on :3100.)

- **Verdict: FAIL.**
- Fails: criteria 35, 37, 38, 39, 40 (painted-pixel floors missed on the white and busy grounds); 47 (palette guard hit on `app/layout.tsx:43`); 51 (three palette-literal expectations still red in timer-gauge, hold-reset and uploaded-background; not edited, see rulings needed); 54 (uploaded-background picker-focus test red for the same reason).
- Not verified: 28 (autofill, manual step not run); 52 (full session cycle: `sessions.spec.ts` is red at HEAD, 14 tests, same titles).
- Run totals: `npm run typecheck` clean. `npm run lint` 0 errors / 15 warnings (no new warning from this task). `npm run build` compiled (app code unchanged since). Vitest: 1 failed / 1073 passed (1074), 47 files. Playwright, full suite on :3100: 456 passed, 88 failed, 1 skipped (545). Of the 88, 81 fail identically at HEAD (same titles, HEAD build). The 7 new are: `task-019-measure` ×2 (criteria 37–40), `hold-reset` ×2, `timer-gauge` ×1, `uploaded-background` ×2 (palette literals).

### Criteria
| # | Verdict | Level | Evidence |
|---|---|---|---|
| 1 | PASS | static | `ThemeControl.tsx` absent (guard test). |
| 2 | PASS | e2e | HeaderNav is `div > h1` only; header children on `/` = `h1`. |
| 3 | PASS | e2e | Tab on `/` has no theme stop; no header stop exists. Task-row inputs are out of scope here (see 35). |
| 4 | PASS | static+e2e | No `Theme` text in app/components/widgets/hooks; no `theme` word in any route's `innerText`. |
| 5 | PASS | unit+static | Named exports absent from `lib/`; store has no `theme`/`setTheme` (guard tests). |
| 6 | PASS | static | Five theme files absent; `layout.tsx` imports none. |
| 7 | PASS | static | `use-resolved-tokens.ts` has no theme/matchMedia branch. Consumers: `TimerControls`, `SloshGauge`, `TimerGauge`. |
| 8 | PASS | static | `prefers-color-scheme` in no app source file. |
| 9 | PASS | static | No commented `dark:`, theme branch or `removed` placeholder in app source (guard). |
| 10 | PASS | static | typecheck 0; lint 0 errors / 15 warnings; build compiled. |
| 11 | PASS | e2e | `colorScheme: light`: `--background` = `#1c140e` on `/`. |
| 12 | PASS | e2e | `colorScheme: dark` and `no-preference`: same. |
| 13 | PASS | e2e | `/`, `/stats`, `/settings` under `light`: same. |
| 14 | PASS | e2e+static | JS disabled: `<html data-theme="dark">` in `page.content()` for all three routes. `page.request.get` body carries it too. `layout.tsx` has `data-theme="dark"` static. |
| 15 | PASS (instrumented) | e2e | CDP CPU throttle 4×, viewport 1280×800, hard reload with a rAF sampler from `addInitScript`. 4 frames sampled, all `#1c140e`. Thin sample: a rAF tick, not a capture. |
| 16 | PASS | static | `suppressHydrationWarning` kept on `<html>` for `data-task-panel`, which the boot script sets (`layout.tsx:48` comment). |
| 17 | PASS | unit+e2e | Six stale-theme cases plus `light`: no throw, no `console.error`/`warn`. E2E: no page error or console error. |
| 18 | PASS | e2e+unit | Stale-theme boot vs no-entry boot: same `--background` and same `<html>` attribute set. |
| 19 | PASS | unit | `light`, `dark`, `system`, unknown string, `null`, number, object: none throws. |
| 20 | PASS | unit+e2e | After load the stored entry has no `theme` key. The write-back happens (`version` stays 3, no bump). |
| 21 | PASS | unit+e2e | `background`, `taskPanelVisible`, `gaugeStyle`, the three session lengths and chime values unchanged. |
| 22 | PASS | static+unit | `theme` appears in `lib/` only in comments. Not mapped to any other key. |
| 23 | PASS | unit | Spy: one `localStorage.getItem` and one `JSON.parse` per boot-script run. |
| 24 | PASS | unit | Run twice: same attribute set, both for stale and absent entries. |
| 25 | PASS | e2e | `getComputedStyle(html).colorScheme === "dark"` on `/`, `/stats`, `/settings`. |
| 26 | PASS | e2e | `meta[name=theme-color]` = `#1c140e`. Computed `--background` on `<html>` of `/` = `#1c140e`. Equal. |
| 27 | PASS (computed) / manual pending | e2e+manual | `/settings` `color-scheme` = dark. Screenshot: `test-results/task-019-dark-criterion-27-…/task-019-settings-native.png`. Visual sign-off of scrollbars and inputs is not done by QA. |
| 28 | NOT RUN | manual | Autofill not exercised. |
| 29 | PASS | e2e+static | Named: mode chips (3) and the Tasks toggle. Checked chip `font-weight` 700 vs 400 unchecked. Toggle's active bar present iff `aria-expanded=true`. Cue is weight, per R1-2. |
| 30 | PASS | e2e | Mode chips are native radios (checked). Tasks toggle: `aria-expanded` matches the bar. |
| 31 | PASS | e2e | axe on `/`, `/stats`, `/settings`: 0 serious/critical. Moderate: none on all three. |
| 32 | PASS (production build) | e2e | No console error or warning across the three routes. Note: production bundle, so React dev-only warnings are not emitted. |
| 33 | PASS | e2e+static | `reducedMotion: reduce` on `/`: no running finite animation. The added-lines grep matches only existing `transition-colors` class strings re-emitted without `dark:`. |
| 34 | PASS (computed) / manual pending | e2e+manual | `forcedColors: active` on `/`: digits, start control, both mode chips visible; checked chip heavier. Screenshot: `test-results/task-019-dark-criterion-27-…/task-019-forced-colors.png`. Visual review not done by QA. |
| 35 | **FAIL** | e2e | Focus stops on `/` without a visible focus target: `input` "Task 1", "Task 2", "Task 3" (the title inputs). Cause: `components/TaskChecklistRow.tsx:209` `outline-none!` with no replacement. Not touched by 019; the class comes from 016. Repro below. |
| 36 | PASS | manual | Bound: white is the brightest image pixel; the 1px checker has pure white cells too, so its worst case for light text and edges equals white's. Both bound the range. Three grounds measured (none, white, checker). |
| 37 | **FAIL** | e2e+manual | White ground: digits `#f5ebdc` on worst `#8e8a87` @ (416,252) = **2.901:1** (need 4.5). |
| 38 | **FAIL** | e2e+manual | Busy checker: brightest `#8e8a87` @ (416,252), darkest `#0e0a07` @ (417,252). Worst = **2.901:1**. |
| 39 | **FAIL** | e2e+manual | White: checked chip `#fbd592` on `#8e8a87` @ (482,156) = 2.450:1; unchecked chip `#e2d5c2` on `#8e8a87` @ (560,156) = 2.368:1; primary edge `#f0a550` vs `#8e8a87` @ (580,416) = 1.663:1; Tasks edge `#f0a550` vs `#8e8a87` @ (1028,712) = 1.663:1. Checker identical worst. |
| 40 | **FAIL** | e2e+manual | Focus ring `#f0a550` vs worst adjacent ground `#8e8a87` = **1.663:1** on white; 1.663:1 on checker (min over 3 rows adjacent). Needs 3:1. |
| 41 | PASS | e2e | Plain page vs HEAD build, same method: digits 4.681 both; primary edge 8.030 both; Tasks edge 8.121 both; ring 8.406 both; chips 11.563 (HEAD) vs 11.477 (now). The chip figure moves ±0.09 between runs of the same build. Floors clear. |
| 42 | NOT SATISFIED (procedure followed) | manual | Surfaces 37–40 miss on the image grounds. Per brief: no ground added, figures recorded, stop for owner ruling. |
| 43 | N/A | e2e | No ground added. |
| 44 | PASS | static | `components/BackgroundLayer.tsx` md5 identical to HEAD; `opacity-50` on the active branch. |
| 45 | N/A | manual | No ground added; plain-page look unchanged. |
| 46 | PASS | static | `docs/DECISIONS.md` line 12 carries the 2026-11-12 entry for D1. |
| 47 | **FAIL** | static | Palette guard `components/palette.tokens.test.ts` fails on `app/layout.tsx:43`: `themeColor: "#1c140e"`. Criterion 26 needs a literal because metadata cannot read a CSS variable. Needs a ruling (see below). |
| 48 | PASS | static | Removed (16): `--sidebar`, `--sidebar-accent`, `--sidebar-accent-foreground`, `--sidebar-border`, `--sidebar-foreground`, `--sidebar-primary`, `--sidebar-primary-foreground`, `--sidebar-ring`, and their eight `--color-sidebar-*` mappings. No other token removed. Flag: `--surface-glass` and `--surface-blur` are read only by the dead `.surface-frosted` utility; kept (guard-pinned). |
| 49 | PASS | static | Provenance comments kept beside the `:root` values (`--control-border` 3.86:1 etc.). No figure describes a moved value. |
| 50 | PASS | static | No `.dark`, no `@custom-variant dark`, no `dark:` utility in app code. |
| 51 | **FAIL** | unit+e2e | Theme-only edits made (see Tests). Left red because the failure is a palette value, not a removed affordance: `timer-gauge.spec.ts:293`, `hold-reset.spec.ts:315`, `hold-reset.spec.ts:390`, `uploaded-background.spec.ts:137` (1280 and 320). Not edited. |
| 52 | NOT VERIFIED | e2e | `sessions.spec.ts` red at HEAD, same 14 titles, so no passing full-cycle spec. `timer.spec.ts` (start/pause/mode steps) passes after the theme-only edit. |
| 53 | PASS | e2e | `task-016-drag`, `task-016-measure`, `task-016-a11y` pass. `task-016-surface` has one test red at HEAD (320 px height), identical here. |
| 54 | PARTIAL / FAIL | e2e | `stats.spec` and `settings-gauge-style` pass. `uploaded-background.spec`: 5 red at HEAD, same titles; 2 new red on the picker focus ring literal (`rgb(180,83,9)` expected, `rgb(240,165,80)` received). |
| 55 | PASS | static | `018` frontmatter `status: superseded`; one-line note naming 019 (line 9). Its log untouched. |

### Group F: painted-pixel figures (dark is the only palette; stated once)
Method: `e2e/helpers/task-019-sampler.ts`. One screenshot per ground, text colour hidden so only the ground remains. Regions read from that PNG; worst = brightest pixel for light text and edges. Text colours are the computed opaque colour of each element (the glyph itself is not sampled). Coordinates are CSS px at DPR 1.
Grounds: none (no image); white (`makePng` solid `#ffffff`, 0.5 layer); busy (1px black/white checker, 0.5 layer).

| Surface | Ground | Fg / fill | Worst painted pixel (hex @ x,y) | Ratio | Floor | Result |
|---|---|---|---|---|---|---|
| Timer digits | none | `#f5ebdc` | `#9d570d` @ (480,253) (gauge liquid) | 4.681 | 4.5 | pass |
| Timer digits | white | `#f5ebdc` | `#8e8a87` @ (416,252) | 2.901 | 4.5 | **fail** |
| Timer digits | busy | `#f5ebdc` | `#8e8a87` @ (416,252) | 2.901 | 4.5 | **fail** |
| Checked chip | none | `#fbd592` | `#281f19` @ (512,173) | 11.477 | 4.5 | pass |
| Checked chip | white | `#fbd592` | `#8e8a87` @ (482,156) | 2.450 | 4.5 | **fail** |
| Checked chip | busy | `#fbd592` | `#8e8a87` @ (482,156) | 2.450 | 4.5 | **fail** |
| Unchecked chip | none | `#e2d5c2` | `#281f19` @ (611,195) | 11.175 | 4.5 | pass |
| Unchecked chip | white | `#e2d5c2` | `#8e8a87` @ (560,156) | 2.368 | 4.5 | **fail** |
| Unchecked chip | busy | `#e2d5c2` | `#8e8a87` @ (560,156) | 2.368 | 4.5 | **fail** |
| Start/Pause edge | none | fill `#f0a550` | `#261d17` @ (580,436) | 8.030 | 3 | pass |
| Start/Pause edge | white | fill `#f0a550` | `#8e8a87` @ (580,416) | 1.663 | 3 | **fail** |
| Start/Pause edge | busy | fill `#f0a550` | `#8e8a87` @ (580,416) (vs darkest `#0e0a07` 9.579) | 1.663 | 3 | **fail** |
| Tasks edge | none | fill `#f0a550` | `#251c16` @ (1028,745) | 8.121 | 3 | pass |
| Tasks edge | white | fill `#f0a550` | `#8e8a87` @ (1028,712) | 1.663 | 3 | **fail** |
| Tasks edge | busy | fill `#f0a550` | `#8e8a87` @ (1028,712) | 1.663 | 3 | **fail** |
| Focus ring (Start) | none | ring `#f0a550` | adjacent ground `#211914` (row −1) | 8.406 | 3 | pass |
| Focus ring (Start) | white | ring `#f0a550` | adjacent ground `#8e8a87` | 1.663 | 3 | **fail** |
| Focus ring (Start) | busy | ring `#f0a550` | adjacent ground `#8e8a87` (row 0) | 1.663 | 3 | **fail** |

Notes: the timer digits' box includes the gauge liquid (`#9d570d`) on the plain page. The white and busy grounds share the same worst pixel for text and edges (both contain pure white). Ratios on the checker's darkest pixel are higher and are not the worst case. HEAD baseline on the same method matches the table (no-image digits 4.681, edges 8.030/8.121, ring 8.406; white 2.901, chips 2.450/2.368, edges 1.663, ring 1.663).
Stop: no localised ground was added, as the brief requires for a miss. The owner ruling on the 2026-11-12 frosted-panel retirement is reserved, so these figures are for that decision.

### Tests (QA edits, test files only)
Added:
- `components/dark-only.guards.test.ts` (31): criteria 1, 5, 6, 8, 9, 14 (static), 16, 44, 48, 50; ported task 009 criteria 27 (focus through `--ring`) and 30 (no `bg-border`/`bg-input` fill), which lived in the deleted `token-dark.test.ts`.
- `lib/preferences/stale-theme.test.ts` (12): group C store half (17, 18 unit half, 19, 20, 21, 22 part).
- `lib/preferences/boot-script.test.ts` rewritten (29): group C boot half (17, 22, 23, 24) plus task-015 panel-attribute and parity checks.
- `e2e/task-019-dark.spec.ts` (27): criteria 3, 4, 11–15, 17, 18, 20, 21, 25, 26, 27 (computed + screenshot), 29–34 (34 computed + screenshot), 31 axe, 32 console.
- `e2e/task-019-measure.spec.ts` (3 grounds): group F. Writes `test-results/task-019-measure-<ground>.json`.
- `e2e/helpers/task-019-sampler.ts`: one-screenshot painted-pixel sampler with coordinates. Reusable.

Deleted (subject gone):
- 018 theme lock: `components/theme-lock.ui.test.tsx`, `lib/preferences/theme-lock.test.ts`, `e2e/task-018-theme-lock.spec.ts`, `e2e/task-018-contrast.spec.ts`, `e2e/helpers/theme-lock-sampler.ts`.
- `components/token-dark.test.ts` (the `.dark` block guard; its focus and fill checks were ported into `dark-only.guards.test.ts`).
- e2e theme specs: `dark-theme-control.spec.ts`, `mode-selector-legend.spec.ts`, `dark-native-ui.spec.ts`, `dark-a11y-console.spec.ts` (replaced by `task-019-dark.spec.ts`), `dark-sweep.spec.ts`, `dark-contrast.spec.ts`. Flag: the last two measured dark surfaces beyond timer and controls. That coverage is not re-measured here. Owner to decide whether a dark-only sweep is wanted.

Edited (theme-only; assertions on live behaviour kept):
- `lib/preferences/preferences.test.ts`: criterion 2 and the stored-theme blocks removed. Criterion 4 and the background block kept, with `theme` expectations dropped.
- `lib/preferences/gauge-style.test.ts`, `lib/audio/mix.test.ts`, `lib/preferences/schema-v3.test.ts`, `components/BackgroundControl.test.tsx`: `theme` fixtures and expectations removed; stored-theme JSON inputs kept as stale data.
- `hooks/use-background-image.test.tsx` (reverted to HEAD, then theme-only edits; one `gaugeStyle` assertion restored).
- `components/token-foundation.test.ts`: `--control-border` is one dark value; `--border`/`--input` now `#3b2f25`; light-only figures (1.36, 1.43) removed; dark figure 3.86 asserted.
- `components/background.guards.test.ts`: grain asserted dark; pinned names minus the 16 sidebar names.
- `components/focus-cycle.guards.test.ts`: `ThemeLockAnnouncer` pin removed; `--surface-glass` declared once.
- `e2e/helpers/dark.ts`: theme forcing removed (`openThemed`→`openPage`, envelope, `Preference`, `THEME_KEY`, `themeRadio`, `themeLabel`, `htmlHasDark`). Measurement utilities kept. Remaining importers: `checkbox-unchecked-contrast`, `settings-measure` (both moved to `openPage`), `settings-gauge-style` (uses `PREFS_KEY`), `uploaded-background-layer` (unchanged).
- `e2e/timer.spec.ts`: the first-Tab theme-radio steps removed (theme-only failure); the rest unchanged.
- `e2e/settings-gauge-style.spec.ts`: `theme` dropped from the expected envelope key list and title (theme-only).
- `e2e/timer-gauge.spec.ts`: the `.dark`-class test deleted (the mechanism is gone).
- `components/BackgroundLayer.test.tsx`: `opacity-100` → `opacity-50` (owner ruling 2026-11-12). **Not a 019 change.** HEAD's copy was red (component paints 50). Kept; flagged.
- `e2e/helpers/background.ts`: reverted to HEAD (018 edits removed).

Tempted, not done (criterion 51):
- `hold-reset.spec.ts` (two tests) and `uploaded-background.spec.ts` (two picker tests): expected `rgb(180,83,9)` (light `--ring`); received `#f0a550`.
- `timer-gauge.spec.ts:293`: expected `#d97706`; received `#9d570d`.
These assert light-palette values. Updating them is a ruling, not a QA call.

### Failures and repro
1. **Criterion 35, task-title inputs have no focus ring.** `npx playwright test -c e2e/scratch-3100.config.ts task-019-dark.spec.ts -g "tab order"`. Expected: every focus stop on `/` shows an outline or box-shadow. Actual: `input:Task 1(no visible focus)`, same for Task 2 and 3. Code: `components/TaskChecklistRow.tsx:209` (`outline-none!`, no replacement). Pre-existing (016).
2. **Criteria 37–40, white and busy grounds.** `npx playwright test -c e2e/scratch-3100.config.ts task-019-measure.spec.ts`. Expected: digits ≥4.5, chips ≥4.5, edges ≥3, ring ≥3. Actual: see the group F table (2.901, 2.450/2.368, 1.663, 1.663).
3. **Criterion 47, palette guard on `app/layout.tsx:43`.** `npx vitest run components/palette.tokens.test.ts -t "app/layout.tsx"`. Expected: no hex literal in app code (guard `ALLOWED_LITERALS` is empty). Actual: `themeColor: "#1c140e"`. Criterion 26 needs the value to match `--background` and metadata cannot read a CSS variable. Ruling needed: an allow-listed pinned-data module, like `components/task-palette-colors.ts`, or a guard amendment. QA has not weakened the guard.
4. **Criterion 51/54, palette-literal expectations.** `npx playwright test -c e2e/scratch-3100.config.ts hold-reset.spec.ts uploaded-background.spec.ts timer-gauge.spec.ts -g "primary styling|focus ring matches|Tab-reachable|liquid and glass"`. Expected: the light `--ring` and gauge literals. Actual: the dark values. Ruling needed.
5. **Pre-existing red at HEAD (not 019).** 81 e2e tests in 14 spec files, unchanged by this task: `uploaded-background-legibility` 18, `uploaded-background-layer` 17, `sessions` 14, `uploaded-background` 5, `focus-surface-sweep` 5, `focus-surface-behaviour` 5, `accessibility` 5, `focus-cycle` 3, `control-edge-measure` 3, `soundscape-measure` 2, `task-016-surface` 1, `soundscape-mixer` 1, `chime-audio-blocked` 1, `checkbox-unchecked-contrast` 1. Observed causes include the opacity-1 expectations against the 0.5 ruling and `locator.fill` timeouts in the task list. Repro: check out HEAD, `npm run build`, `npx playwright test -c e2e/scratch-3100.config.ts <those files>`.

### Rulings needed (QA does not decide these)
- Criterion 47 vs 26: where the `theme-color` literal lives.
- Criteria 37–40 misses on the image grounds: the brief says stop. The owner's frosted-panel reservation applies.
- Criteria 51/54: whether the light-palette literals in hold-reset, uploaded-background and timer-gauge become dark values.
- Criterion 35: the task-title inputs need a focus style (frontend, `TaskChecklistRow.tsx`, pre-existing).
- `--surface-glass`/`--surface-blur` have only the dead `.surface-frosted` reader. Remove the utility and tokens?
- The two deleted dark sweeps (`dark-sweep`, `dark-contrast`) were the only dark-surface sweeps. Restore a dark-only one?

### Not done (honest)
- No red-proofs were run. Guards passed on first run except one fixture, which was vacuous (`bootWith` wrote defaults after the stale entry, so criterion 20 passed without a write-back) and was fixed by reordering. The non-vacuous run is the one reported.
- Criterion 28 not run. Criteria 27 and 34 have computed checks plus screenshots, but no visual sign-off by QA.
- React dev-only warnings (criterion 32) are not visible in the production build.

### Second pass, 2026-11-12 (coordinator's final pass; the entry above is kept as the measurement record)

- **Verdict for 019 as it now stands: FAIL, on two unverified criteria only (28 and 52).** No criterion in 019's own scope is failing. A PASS cannot be attested while 28 and 52 are unverified, so the gate needs the coordinator's acceptance of those two reasons.

**Run results (this pass)**
- `npm run lint`: 0 errors, 15 warnings (unchanged). `npm run typecheck`: clean. `npm run build`: compiled against the current tree. Criterion 10 is confirmed.
- Vitest: 47 files, 1075 / 1075 pass. Palette guard green.
- Playwright, touched specs only (`task-019-dark`, `task-019-measure`, `task-019-surfaces`, `hold-reset`, `uploaded-background`, `timer-gauge`): 105 passed, 5 failed. The 5 are `uploaded-background` tests with titles identical to the HEAD baseline (the criterion 3, 8 and 29 groups). Pre-existing, not 019's.

**Criteria, updated**
- 10: PASS (confirmed above).
- 26: PASS. The theme-color hex equals computed `--background` on `/` at runtime (`#1c140e`), and the static test pins the same value to `:root`.
- 35: PASS, scoped to the plain page per ruling 4. Keyboard focus on every stop on `/` shows a visible target, including the task-title inputs (`TaskChecklistRow.tsx:209`, now `outline-none focus-visible:outline…`, no `!`). Mouse focus: no default UA outline on the title input (Chromium matches `:focus-visible` on a clicked text input by design, so the check is "not `auto`"), and the Start button shows no ring. Test: `task-019-dark.spec.ts`, "criterion 35 (plain page)".
- 36: satisfied per ruling 2. The bound is argued in the first entry and the busy checker measures identically to white.
- 37, 38, 39, 40, 42, 43: moved to task 020 per ruling 2. Figures carried verbatim in the first entry, which is the handoff record.
- 41: satisfied. Plain-page floors pass in `task-019-measure.spec.ts`. The figures match the HEAD build (first entry).
- 44: PASS. `BackgroundLayer.tsx` is byte-identical to HEAD (md5 match).
- 45: satisfied per ruling 2. The revert answers it, and no ground remains.
- 47: PASS. The palette guard now exempts exactly one literal, `app/layout.tsx` `themeColor: "#1c140e"` (ruling 1). The exemption is one site, one value. A static test pins it to `:root` `--background`. Every other literal in `layout.tsx` still fails.
- 48: PASS with a hold. Removed (16): the sidebar tokens and mappings, as listed in the first entry. Held, not deleted, per ruling 5: `--surface-glass`, `--surface-blur` and `.surface-frosted`. Task 020 decides them under its criterion 18.
- 51: PASS, within the carve-out. The palette-literal expectations are updated per ruling 3 (see Tests). No behaviour assertion was edited.
- 54: PASS for 019's changes. `uploaded-background`'s 5 red tests are identical to HEAD, so the upload and remove behaviour is unchanged.
- 28: NOT VERIFIED. Manual step (autofill): headless Chromium does not exercise browser autofill styling, and no run was done. Recorded as not run. It is not 019's to fix.
- 52: NOT VERIFIED. `sessions.spec.ts` is red at HEAD (14 tests, identical titles), so no passing full-cycle spec exists to attest. `timer.spec.ts` start, pause and mode steps pass.
- Everything else: unchanged from the first entry.

**Tests changed in this pass**
- `components/palette.tokens.test.ts`: `ALLOWED_LITERALS` holds one entry, `app/layout.tsx` with a single `themeColor` site, reason recorded. New test: the exempt hex equals `:root` `--background`.
- `e2e/helpers/task-019-tokens.ts` (new): reads `:root` tokens from `app/globals.css`.
- Ruling 3, palette expectations now read tokens:
  - `hold-reset.spec.ts`: focus ring and primary fill read `--ring` and `--primary`. Start/Pause foreground reads `--primary-foreground`. The three pinned values were the light palette (`rgb(180,83,9)`, `rgb(255,255,255)`).
  - `uploaded-background.spec.ts`: picker focus ring reads `--ring` (two viewports).
  - `timer-gauge.spec.ts`: liquid reads `--gauge-liquid`. Glass reads `--popover` (`#fffaf3` was light `--popover`).
  Note: the glass and foreground assertions sit in the same tests named in ruling 3, so they went too.
- `e2e/task-019-measure.spec.ts`: ruling 2 option, kept working on the no-ground state. GROUNDS is the no-image entry only. White and busy moved to 020. Header comment updated.
- `e2e/task-019-dark.spec.ts`: criterion 35 tests added (see above).
- `e2e/task-019-surfaces.spec.ts` (new), ruling 6: one screenshot per route on the plain page, text hidden, every visible text element sampled through `task-019-sampler.ts`. Asserts that the misses equal the recorded set below and nothing else. Passes.
- `components/dark-only.guards.test.ts`: unused helper removed.

**Known plain-page findings (recorded, not fixed; owner ruling needed)**
The sweep found five misses on the plain page. HEAD's dark build gives identical figures (same method), so they predate 019. These are not 020's image grounds.
- `/stats`: "Day" `#fbd592` on the selected fill `#f0a550` at (296,160) = 1.474:1. "Week" `#e2d5c2` on `#8a7968` at (384,160) = 2.897:1. "Month" same at (472,160) = 2.897:1.
- `/settings`: "Reset to defaults" `#f5ebdc` on `#8a7968` at (296,464) = 3.549:1. "Preview chime" same at (296,762) = 3.549:1.
The spec pins these as known. It fails on any new miss, or on any change to these figures. Which owner-ruled task fixes them is open.

**Repro**
- Criterion 35 (plain-page ring): `npx playwright test -c e2e/scratch-3100.config.ts task-019-dark.spec.ts -g "criterion 35"`.
- Surface sweep: `npx playwright test -c e2e/scratch-3100.config.ts task-019-surfaces.spec.ts`. The annotation lists every miss with coordinates.
- Palette guard: `npx vitest run components/palette.tokens.test.ts`.

### Correction, 2026-11-12 (coordinator rulings on the second pass; supersedes the second pass where they differ)

**Verdict for 019: PASS.** Criteria 37, 38, 39, 40, 42 and 43 are moved to task 020 (ruling 2), with the first entry's figures as the handoff record. Criterion 28 is N/A (below). Criterion 52 is BLOCKED by a pre-existing red suite and is accepted as blocked, not failed. Nothing in 019's own scope fails.

**Withdrawn figures (sampling artifacts, not misses).** The first sweep sampled each element's whole bounding box. The box contains the element's own border, which is a token and not the ground behind the glyphs, so the border became the "worst pixel". Withdrawn, kept here so the next task does not rediscover them:
- `/stats`, "Day" `#fbd592` vs `#f0a550` at (296,160) = 1.474:1. Actually the checked range chip's `--primary` border.
- `/stats`, "Week" `#e2d5c2` vs `#8a7968` at (384,160) = 2.897:1. Actually the chip's `--control-border`.
- `/stats`, "Month" `#e2d5c2` vs `#8a7968` at (472,160) = 2.897:1. Same as Week.
- `/settings`, "Reset to defaults" `#f5ebdc` vs `#8a7968` at (296,464) = 3.549:1. The outline button's `--control-border` edge.
- `/settings`, "Preview chime" `#f5ebdc` vs `#8a7968` at (296,762) = 3.549:1. Same.
The coordinator's check confirmed each pixel is a border and that the real behind-glyph figures are about 11:1.

**Corrected method (in `e2e/task-019-surfaces.spec.ts`).** Sampling is restricted to the text-run rectangles from `Range.getClientRects()`, so only the pixels the glyphs sit on are read. Text a sighted user cannot see is excluded: an element must pass `checkVisibility({opacityProperty, visibilityProperty})`, and each run's centre must hit-test to the element or a descendant. One screenshot per route, text hidden, as before.

**Hidden text found and excluded.** The first corrected run flagged "Press and hold for 0.8 seconds to confirm" (`#e2d5c2` vs `#8a7968` at (694,432) = 2.897:1) on `/`. Inspection showed the hint text belongs to the hold-to-reset button and is not painted. A visible crop of that area shows only the reset icon. An ancestor hides it, and the text is not sr-only on its own element. It is excluded by the visibility and hit-test checks, so it is not a finding.

**Corrected sweep results (plain page, dark only, one screenshot per route):**
- `/`: 8 text elements; minimum 4.681:1; misses none.
- `/stats`: 11 text elements; minimum 7.828:1; misses none.
- `/settings`: 15 text elements; minimum 7.508:1; misses none.

`KNOWN_MISSES` is empty for all three routes, and the spec still fails on any new miss. It passes 3/3. Survivors: none, so no figure needs flagging.

**Criterion 28 (autofill): N/A, not unverified.** Evidence checked in the tree, not just taken from the ruling:
- The input types in `app/`, `components/`, `widgets/` are text (2), radio, checkbox, range and file. The `type="number"` and `type="category"` matches are Recharts axis props (`StatsChart.tsx`), not inputs.
- Both text inputs set `autoComplete="off"`: `components/DurationField.tsx:61` and `components/TaskChecklistRow.tsx:203`.
- No email, name, address, password or tel field exists, so there is no autofill state to style.

**Criterion 52 (full session cycle): BLOCKED by a pre-existing red suite, accepted, not failed.** `e2e/sessions.spec.ts` is red at HEAD (14 tests, identical titles), so 019 cannot attest it and is not the cause. `e2e/timer.spec.ts` start, pause and mode steps pass. This is the red suite blocking verification again, which the 2026-11-11 ruling predicted.

**Measurement-method note (not corrected in this pass).** `e2e/task-019-measure.spec.ts` (no-image ground) still samples element boxes for the digits and chips, so the same artifact can apply there. Its plain-page floors pass, so no current result is wrong, but a task that re-uses those figures should switch to the text-run method first. The timer digits are mostly glyph and gauge, so the box is closer to the ground than a control's box is.

**Criteria, as they now stand (supersedes the second pass where different).** 28: N/A (evidence above). 35: PASS. 47: PASS. 52: BLOCKED (pre-existing red, accepted). Everything else as stated in the second pass.

**Test changes in this correction:** `e2e/task-019-surfaces.spec.ts` rewritten to the text-run method with the visibility and hit-test filters, `KNOWN_MISSES` emptied. No other spec changed.

#### Appendix, 2026-11-12: corrected measurement table (groundwork for 020; the 019 PASS is not reopened)

Re-measured with the text-run method for text and the outermost painted boundary for controls, on three grounds in one run. Source: `test-results/task-019-measure-corrected-<ground>.json`, written by `e2e/task-019-measure.spec.ts`. Method per row:
- Digits and chips: pixels covered by each text run (`Range.getClientRects()`), worst of brightest and darkest. Text colour is the computed glyph colour.
- Start/Pause and Tasks edges: the outermost painted boundary pixel scanned outward-in (the computed fill, or `--popover` where `control-edge` draws its one-pixel ring on an image page), against the painted column immediately outside it. Worst of brightest and darkest in that column.
- Focus ring: the ring pixels against the nearest painted ground pixel, three rows, worst.

| Surface | No image | White (0.5 layer) | Busy 1px checker (0.5 layer) | Worst pixel, white / busy |
|---|---|---|---|---|
| Timer digits `#f5ebdc` | 4.681 | 4.681 | 4.681 | `#9d570d` (the gauge fill) at (506,255) |
| Checked chip `#fbd592` | 11.477 | 2.354 | 2.354 | `#928d88` at (492,171) / (493,171) |
| Unchecked chip `#e2d5c2` | 11.182 | 2.279 | 2.279 | `#918d89` at (579,171) |
| Start/Pause edge, fill `#f0a550` | 8.318 | 1.663 | 1.663 | `#8e8a87` at (585,430) / (585,431) |
| Tasks edge, boundary `#1e1610` (control-edge ring) | 8.234 (fill `#f0a550`, no ring) | 5.211 | 1.105 | `#8e8a87` at (1030,726) / `#0e0a07` at (1030,727) |
| Focus ring `#f0a550` | 8.406 | 1.663 | 1.663 | `#8e8a87` adjacent |

**Which earlier figures stand and which are withdrawn**
- **Timer digits, 2.901 on white and busy: WITHDRAWN, artifact.** You were right. The `[class*="tabular-nums"]` selector matched the full-width host (448×128), not the `<p>` that holds "25:00" (507–774 × 255–377). The corrected figure is 4.681 on every ground. Behind the glyphs is the opaque gauge fill (`#9d570d`) on all three grounds, so the digits need no ground on any measured ground. Your expectation holds.
- **Timer digits, 4.681 no image: STANDS.** The same value.
- **Mode chips, 2.450 and 2.368 (box method): REPLACED.** The text-run figures are 2.354 and 2.279. These are genuine: flat text, with the composited image behind the glyphs. The gap from your expected 2.45 and 2.37 is the sampled region (run rather than box), not noise. Carry 2.354 and 2.279. The chips sit at 11.5 and 11.2 on the plain page, so the plain-page floor holds.
- **Start/Pause edge, 1.663 on white and busy: STANDS.** The boundary is the fill, with no rim (`Start` has no `control-edge`). The earlier 1.663 is the same pair. The no-image figure moves from 8.030 to 8.318 because the boundary column is now the first painted fill column, not the next pixel inward.
- **Tasks edge, 1.663 on white and busy (first pass): WITHDRAWN, artifact.** On an image page `control-edge` draws a 1px cream border (`--foreground`) on the box edge and a 1px `--popover` ring outside it. The first pass took the cream border column as ground, against the fill. The painted boundary is the ring, so the corrected figures are 5.211 on white (passes) and 1.105 on the busy checker (fails). **The 1.105 is a genuine miss the brief did not anticipate.** The ring `#1e1610` is almost the same as a black checker cell `#0e0a07`, so the control's outer edge is not separated from black cells. The no-image Tasks figure moves from 8.121 to 8.234.
- **Focus ring, 1.663 on white and busy: STANDS.** The ring method was already a painted boundary method.

**What 020 should carry**
- Digits: no ground needed on any tested ground. 4.681 throughout.
- Mode chips: genuine misses, 2.354 and 2.279 on both image grounds.
- Start/Pause edge: genuine miss, 1.663 on both image grounds.
- Tasks edge: 5.211 on white (pass), 1.105 on busy (miss, against black cells).
- Focus ring: genuine miss, 1.663 on both image grounds.

The `test-results` JSON files carry the full painted column profiles for both edges, so any figure above can be checked against its pixels.

## Review Findings
(reviewer, 2026-11-12 — static review of `git diff HEAD` scoped to `app/ components/ widgets/ hooks/ lib/`,
plus `npm run lint` and `npm run typecheck`. Test files not reviewed; no e2e/unit run. Pasted by the
orchestrator: `reviewer` is read-only by design and has no write tool.)

- **Verdict: APPROVE.** Nothing blocking. Five non-blocking findings.

**1. Palette flatten lost no value and no figure.** The `.dark` declaration list at HEAD and the current
`:root` list, comments stripped and sorted, are byte-identical across all 32 overrides plus
`color-scheme: dark`; the only addition is `--radius: 0.5rem` at its original value. Every painted-pixel
figure sits beside the value it documents (`--control-border`'s five-ground set, `--dialog-edge` 3.469 /
4.266 / 3.731, `--surface-glass`'s white-image set, `--disabled-surface` 1.73:1). No light figure survived
next to a dark value, so criterion 49 holds. The 8 `--sidebar-*` and their 8 `--color-sidebar-*` mappings are
gone with zero readers. `--surface-glass` / `--surface-blur` / `.surface-frosted` remain reachable through
`components/Surface.tsx:14`, so the hold for 020 is not dead code. `BackgroundLayer.tsx:36` still reads
`opacity-50`.

**2. The `theme`-field drop without a version bump is sound, and strictly safer than what it replaced.**
`store.ts:106-109` `merge` → `{ ...current, ...sanitizePreferences(persisted) }`; `sanitizePreferences`
builds from known keys with per-key fallback, so no sibling can be lost or reset and no unknown key reaches
state or the written-back envelope. The v<3 path was checked: `migrate` carries the legacy Focus length and
re-sanitising cannot drop it, because `readLegacyTimerFocusMinutes` gates on the same `isDurationMinutes`
predicate. The old `isPreferences(persisted) ? persisted : …` spread the stored object and *would* have
carried a stale `theme` into state. The cleaned-envelope write-back does ride
`onRehydrateStorage → setHasHydrated`, which persist subscribes to, so it will write — but that link is
e2e-verified (criterion 20), not statically provable.

**3. Every orchestrator round-1 must-fix is reflected in the tree.** `BackgroundProvider.tsx` gone;
`hooks/use-background-image.ts`, `components/BackgroundLayer.tsx` and `app/page.tsx` have no diff against HEAD
at all; `BackgroundStatus`/`useBackgroundStatus` have no app-code hits; `BACKGROUND_ID_PATTERN` is private
again; the three extra underlines are reverted, `mode-chip.tsx` and `StatsViewSwitcher.tsx` untouched.

**4. No outline removed without a replacement.** `TaskChecklistRow.tsx:209` uses the app-wide idiom,
identical to `DurationField.tsx:72`, `UndoToast.tsx:24` and nine other sites; dropping the `!` flags is
correct because the `focus-visible:` variant carries a pseudo-class and outranks the unprefixed
`outline-none` in the same layer. The orchestrator's reading on selected-state cues is confirmed:
`mode-chip.tsx:22-23` carries `font-bold` vs `font-normal` on native radios in a `<fieldset>` with an
`sr-only` legend, so criteria 29 and 30 are met without a drawn mark. `HeaderNav.tsx` is an `h1` in one div,
no orphan wrapper or gap class.

**5. Licensing and branding clean.** No asset, font, audio or vendored markup added. The grain stays a
procedurally painted SVG with its "nothing to license" note intact (`app/globals.css:189`).

### Non-blocking findings

- **F1 (minor, a11y) — the one new state indicator does not survive forced colours.**
  `TaskPanelToggle.tsx:37-42` draws the active bar as `bg-primary-foreground` inside a `bg-primary` button
  with no `forced-colors:` fallback; under `forced-colors: active` both backgrounds are system-repainted and
  the bar likely vanishes. `SettingsPanel.tsx` handles the same situation with a 3px border fallback.
  `aria-expanded` still carries the state and criterion 34 does not name this control, so it is not a
  criterion miss. Contrast is otherwise far past 3:1. **Orchestrator ruling: carried to task 020**, not fixed
  here — frontend had already used its three fix loops and this is not a criterion miss.
- **F2 (nit) — stale comment, fixed by the orchestrator.** `mode-chip.tsx:14` justified
  `motion-reduce:transition-none` with "a theme switch repaints every chip". No theme switch can happen now.
  The utility is still right (mode selection repaints the chip); only the stated reason was dead.
- **F3 (nit) — stale comment, fixed by the orchestrator.** `app/globals.css:212` still read "it exists to
  make flat cream read as paper", two lines below a hunk this task edited. The ground is `#1c140e`.
- **F4 (nit) — `.glyph-halo` (`app/globals.css:360-371`) has no reader.** Its comment was rewritten in this
  diff to claim "the header wordmark", but `HeaderNav.tsx`'s `h1` does not carry the class (dropped in
  06404a4, before this task) and the `input:focus-visible + .glyph-halo` selector could only ever match
  `ThemeControl`'s radios, now deleted. Pre-existing dead CSS, outside criterion 48's letter since it is a
  class and not a token. **Carried to task 020** to either restore a consumer or delete the rule.
- **F5 (informational) — two collapsed values carry no measurement.** `checkbox.tsx:16` folds the deleted
  `dark:` variants into the base (`aria-invalid:border-destructive/50`, `ring-destructive/40`), preserving
  what actually rendered under `.dark`, so it is not a visual change — but `button.tsx`'s rewritten comment
  now asks for a colour to be stated "unprefixed, with a measurement" and these two alphas have none.
  Likewise `--muted-foreground`'s new comment claims "all >= 4.5:1" without figures; the light comment it
  replaced pointed at figures "in the .dark block" that the block never contained, so nothing was lost, but
  the claim is unsourced. **Carried to task 020.**

### Checked and clean
`grep` for `dark:` utilities, `.dark`, `DARK_CLASS`, `prefers-color-scheme`, `resolveTheme`, `setTheme`,
`THEME_VALUES`, `DEFAULT_THEME`, `applyResolvedTheme`, `ThemePreference` and `ResolvedTheme` over app code
returns nothing but the two intentional `data-theme="dark"` lines in `app/layout.tsx:50,54`. No theme code is
commented out rather than deleted (criterion 9). `hooks/use-resolved-tokens.ts` survives with three live
consumers — `TimerControls`, `SloshGauge`, `TimerGauge` (criterion 7) — and its narrowed `MutationObserver`
strictly reduces re-renders. No timer logic touched; nothing counts intervals. `typecheck` passes; `lint` is
0 errors and 15 warnings, the only two in app code (`app/page.tsx:4` unused `Surface`,
`TaskChecklistRow.tsx:11` unused `Button`) present at HEAD too, so no new warning. Dead exports after the
removal: `isPreferences` has zero non-test readers (kept deliberately as the executable spec for the
envelope); `BACKGROUND_ID_MAX_LENGTH` was already test-only at HEAD.

### Out of this review's reach
Every `[e2e]`, `[unit]` and `[manual]` criterion (qa's, and the sampler was being corrected during this
pass), and criteria 51 to 54 behaviour regression.
