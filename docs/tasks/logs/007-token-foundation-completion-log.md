# Milestone 4, part 1: completing the token foundation (task-list surface, interactive-boundary token, mode-chip selection cue) — history log

Appended by frontend/backend/qa/reviewer/orchestrator after implementation began.
The task's goal, scope and acceptance criteria are in [../007-token-foundation-completion.md](../007-token-foundation-completion.md).

## Observations (not criteria, not scope)
- **Working tree at hand-off was clean** through `d7d1bec`. vitest 309/309, typecheck exit 0, lint
  0 errors / 21 warnings, Playwright 281 passed / 4 failed / 2 skipped. That is the baseline QA
  compares against — not `HEAD` of some earlier task, and not a remembered number.
- `components/CurrentTaskCard.tsx:4` still imports `TaskColorDot` without rendering it, and line 6
  carries `border border-none bg-none` — three utilities cancelling out. Carried from 006 and 008;
  still true; still not this task's file (criterion 37 pins it).
- `components/ui/button.tsx` and `components/ui/dialog.tsx` are already token-clean under the wider
  regex, including for `white`/`black`. Verified, so nobody re-checks them.
- The `pomotato` wordmark in `widgets/HeaderNav.tsx` uses `font-space-grotesk`, a fourth font family
  alongside Comfortaa, Geist and the Arial body fallback. `DESIGN.md` names Comfortaa for headers.
  Licensing and font-stack coherence are a question for whoever next touches typography — not raised
  as a Q here because no criterion in this task depends on it.

## Implementation Notes

antislop active: during (session override), inherited from the 005/006 record; this brief gave no new instruction. Delivery Gate, the items that apply (token-only colour work, no copy, no new technique): every changed control re-measured in a browser, no horizontal overflow at 320 px, every control still >= 44 px, no new decoration added.

**Method.** Every ratio below is from painted pixels: Playwright/Chromium read `getComputedStyle`, each colour (oklch, lab, color-mix, alpha) was drawn to a 1x1 canvas over its real ground and read back with `getImageData`, then WCAG 2.x contrast was computed. "Before" is a checkout of `d7d1bec` (own dev server), "after" is the working tree, same script, same seeded state, 1280 px (colours do not change with viewport; geometry and chips were also run at 320 px). Never arithmetic on token values.

### Finding the brief did not predict: the pinned state was visually dead before this task
`actionButtonClass` (`bg-white`, `border-stone-300`, `text-stone-700`) and the pinned additions (`bg-amber-100`, `border-amber-700`, `text-amber-900`) were joined into one class string with no merge step, so stylesheet order decided, and the base classes won. Painted at `d7d1bec`, a pinned Pin button and an unpinned one are identical: fill #ffffff, border #d6d3d1, label #44403b. The only pinned cues were the `Unpin` label and `aria-pressed`. I split `actionButtonClass` into shape + idle colours + pinned colours (`pinnedActionButtonClass`) so no element carries two competing colour utilities. Pinned now paints fill #fef3c7, border #b45309, label #78350f. This is a fourth deliberate visible change, and it is a fix: the pinned fill/border/label were authored and never shown.

### Part 1: mode-chip cue
**Chosen: weight differential** (the default). `components/ui/mode-chip.tsx`: checked `font-bold` (700), unchecked `font-normal` (400), delta 300. `font-bold` moved off the container in `ModeSelector.tsx:17`. Dead `hover:border-[color-mix(...)]` removed. No fill, border or radius added (painted `background-color` rgba(0,0,0,0), all four border widths 0px, both states).
- Greyscale of the label colours is 69 vs 65 out of 255, so colour cannot carry it; weight can, and survives forced-colors.
- Painted labels on the page (#fbf4ea): checked #78350f 8.31:1, unchecked #44403c 9.41:1. Chip height 44 px in all states.
- **Per-chip width delta, bold vs normal** (320 px, identical at 1280): Focus 69.7 vs 68.9 (-0.8), Short break 120.9 vs 119.0 (-1.9), Long break 111.5 vs 110.3 (-1.2), Custom 83.0 vs 82.0 (-1.0). Reflow when selection changes: chip x positions move by at most 3 px; the 320 px wrap (Focus + Short break on row 1 at y=184, Long break + Custom on row 2 at y=236) is the same for all four modes; `scrollWidth == clientWidth` (320/320 and 1280/1280) for all four modes. Before this task all four were bold, so the row was static; now it shifts by up to 3 px. I judged that acceptable and kept weight. If the owner dislikes the shift, the underline alternative is a one-line variant change; I did not take it because the measured shift is small and no chip moves between rows.
- Focus ring unchanged: 2 px, offset 2 px, #b45309 (`--ring`) on both states, 4.60:1 on the page.
- Radios, fieldset, legend untouched.

### Part 3: the token
`--control-border: #88837e` (+ `--color-control-border` in the existing `@theme inline` block). `git diff app/globals.css` is 13 added lines, 0 removed. Comment carries (a) role, (b) why `--border` does not fit (1.36 / 1.43 and app-wide), (c) milestone 4 dark obligation.
Value chosen after a first pass at #8c8782 left the Cancel button in the tinted delete-confirm panel at 2.87:1; #88837e clears it.

| Ground (painted) | Colour | Ratio |
|---|---|---|
| `--background` | #fbf4ea | 3.44 |
| `--card` (task rows, add section, edit form) | #fbf4ea | 3.44 |
| `--popover` (dialog, and the input fill) | #fffaf3 / #fffaf3 | 3.61 |
| Delete-confirm panel | #f7e7de | 3.12 |

Hover on idle action/cancel buttons: `color-mix(--control-border, --foreground 40%)` paints #635b55, 6.09:1 on the card (was 2.59).

### Boundary classification (criterion 20)
Rule: 1.4.11, identifies a component or its state = interactive, new token, 3:1; divider / container hairline / non-interactive card edge = decorative, `--border`.

| Element | Class | Reason | Painted |
|---|---|---|---|
| Custom-duration input border | interactive | the field's edge | 1.36 -> 3.44 on page |
| StatsButton border (new) | interactive | the control's only edge; fill is 1.00:1 | 1.00 -> 3.44 on page |
| TaskForm title/emoji/eta input borders | interactive | field edge | 1.49 -> 3.44 vs card, 3.61 vs input fill |
| Row action buttons (reorder, up, down, -1, +1, Edit, Delete, Pin idle) | interactive | button edge | 1.49 -> 3.44 vs card |
| Cancel in edit form, Cancel in delete-confirm | interactive | button edge | 1.49 -> 3.44 (card); 1.36 -> 3.12 (panel) |
| Pinned Pin button border | interactive (state) | identifies pressed state | 1.49 (hover-contaminated reading at before) -> 4.60 `--primary` |
| Swatch checked ring (2 px `--foreground`) | interactive (state) | identifies selection | 17.49 -> 14.55 vs card; vs unchecked ring 11.74 -> 10.67 |
| Swatch unchecked ring (1 px `--border`) | decorative | the swatch fill itself (3.14-5.37:1) identifies the radio; ring is trim | 1.49 -> 1.36 |
| Row card border | decorative | non-interactive container edge | 1.26 -> 1.36 vs fill; 1.21 -> 1.43 vs popover |
| Add-task section border | decorative | container edge | same as row card |
| Delete-confirm panel (fill only) | decorative | tint, no edge | 1.09 -> 1.10 vs card |
| TaskColorDot hairline | decorative | trim around a swatch whose fill identifies it | 1.26 -> 1.27 vs card |
| Chips (no border) | n/a | criterion 3 keeps them borderless; state carried by weight | |
| TaskListDialog trigger (no border, `--primary` fill 4.60 vs page) | n/a | fill identifies it | 4.60 |

Decorative boundaries below 3:1 are listed with their ratio above, so the choice is on the record. Q5 as asked: card is `--card` + `--border`, no new surface token; row cards are 1.05:1 against the popover and the edge is 1.43:1, still faint. That stays an owner call (needs a shadow or new surface token).

### Swap table
Verdict `exact` needs two painted readings; none qualifies (the OKLCH-vs-hex gap shows on every swap except white to `--primary-foreground`, where both read #ffffff). Columns: file:line (after), before utility -> painted, after token -> painted.

| file:line | before | after | verdict |
|---|---|---|---|
| TaskListDialog:44 | `text-white` / `hover:text-white` #ffffff | `text-primary-foreground` / `hover:text-primary-foreground` #ffffff | exact (both read #ffffff; trigger icon 5.02:1 on fill before and after; hover fill unchanged #c27336, icon 3.62:1) |
| TaskColorDot:20 | `border-black/10` #e5e5e5 on white | `border-[color-mix(in_srgb,var(--foreground)_12%,transparent)]` #e1dad0 on card | deviation (see pairs) |
| TaskList:239,240 card | `border-stone-200 bg-white` #e7e5e4 / #fff | `border-border bg-card` #d6d3d1 / #fbf4ea | deviation |
| TaskList:240 heading | `text-stone-700` #44403b | `text-secondary-foreground` #44403c | deviation |
| TaskList:247,257 messages | `text-stone-600` #57534d | `text-muted-foreground` #57534e | deviation |
| TaskList:251 error | `text-red-700` #c10007 | `text-destructive` #b91c1c | deviation |
| TaskRow:33 idle action btn | `border-stone-300 bg-white text-stone-700 hover:border-stone-400` #d6d3d1 / #fff / #44403b / #a6a09b | `border-control-border bg-popover text-secondary-foreground hover:border-[mix control-border 60 / foreground 40]` #88837e / #fffaf3 / #44403c / #635b55 | deviation (deliberate: interactive boundary) |
| TaskRow:33 focus | `outline-amber-700` #b45309 | `outline-ring` #b45309 | exact (both read #b45309 on this build; amber-700 as an outline also resolves #b45309 here, not the rgb(187,77,0) the fill does, because the global :focus-visible rule wins) |
| TaskRow:35 pinned | `border-amber-700 bg-amber-100 text-amber-900` (never painted) | `border-primary bg-accent text-accent-foreground` #b45309 / #fef3c7 / #78350f | deviation (visible change, see finding) |
| TaskRow:115 card | `border-stone-200 bg-white` | `border-border bg-card` | deviation |
| TaskRow:116 drag | `ring-amber-700` #bb4d00 | `ring-ring` #b45309 | deviation |
| TaskRow:161 title | `text-stone-900` #1c1917 | `text-foreground` #2b2017 | deviation |
| TaskRow:162 count | `text-stone-600` #57534d | `text-muted-foreground` #57534e | deviation |
| TaskRow:172 panel | `bg-red-50` #fef2f2 | `bg-[color-mix(in_srgb,var(--destructive)_6%,var(--card))]` #f7e7de | deviation |
| TaskRow:175 prompt | `text-red-900` #82181a | `text-foreground` #2b2017 | deviation (13.20:1 vs 9.16:1) |
| TaskRow:190 Delete | `bg-red-700 text-white hover:bg-red-800 outline-amber-700` #c10007 / #fff / #9f0712 | `bg-destructive text-destructive-foreground hover:bg-[mix destructive 80 / foreground 20] outline-ring` #b91c1c / #fff / #9d1d1b | deviation |
| TaskForm:155,179,202,238 labels | `text-stone-600` #57534d | `text-muted-foreground` #57534e | deviation |
| TaskForm:169,189,251 inputs | `border-stone-300 bg-white text-stone-900 outline-amber-700 disabled:bg-stone-100 disabled:text-stone-400` #d6d3d1 / #fff / #1c1917 / #b45309 / #f5f5f4 / #a6a09b | `border-control-border bg-popover text-foreground outline-ring disabled:bg-muted disabled:text-[mix muted-foreground 56 / muted]` #88837e / #fffaf3 / #2b2017 / #b45309 / #f5f5f4 / #9d9a97 | deviation |
| TaskForm:172,192,231,254 errors | `text-red-700` #c10007 | `text-destructive` #b91c1c | deviation |
| TaskForm:219 ring-offset | `ring-offset-white` #fff | `ring-offset-card` #fbf4ea | deviation (follows the card) |
| TaskForm:220 swatch focus | `outline-amber-700` #b45309 | `outline-ring` #b45309 | exact |
| TaskForm:221 swatch rings | `ring-stone-900` #1c1917 / `ring-stone-300` #d6d3d1 | `ring-foreground` #2b2017 / `ring-border` #d6d3d1 | deviation (checked) / exact (unchecked: both #d6d3d1) |
| TaskForm:264 submit | `bg-amber-700 text-white hover:bg-amber-800 disabled:bg-stone-300` #bb4d00 / #fff / #973c00 / #d6d3d1 | `bg-primary text-primary-foreground hover:bg-[mix primary 80 / foreground 20] disabled:bg-border` #b45309 / #fff / #99490c / #d6d3d1 | deviation (disabled fill exact) |
| TaskForm:273 Cancel | `border-stone-300 bg-white text-stone-700 hover:border-stone-400` | same as idle action button | deviation |
| CustomDurationInput | `border-input` #d6d3d1 | `border-control-border` #88837e | deviation (deliberate) |
| StatsButton | `border-none` | `border-control-border`, 1 px | deviation (deliberate; box unchanged, 44x44) |

Sites where no exact token existed (everything marked deviation above) took the nearest semantic token; the two non-token choices are color-mix() of tokens: hover darkenings (`--primary` or `--destructive` or `--control-border` into `--foreground`) and the delete panel tint (`--destructive` 6% into `--card`). Chosen over a new token because each is derived and inverts correctly under a `.dark` block.

### Before/after pairs (painted, each against its own ground; criterion 26/28/30)
Below-threshold or reduced pairs are listed individually; the unlisted pairs went up or are unchanged (full run is reproducible: scripts in the session scratchpad).

| Pair | before | after |
|---|---|---|
| Row card fill vs popover | 1.04 | 1.05 |
| Row card border vs fill / vs popover | 1.26 / 1.21 | 1.36 / 1.43 |
| Add section fill vs popover; border vs fill | 1.04; 1.26 | 1.05; 1.36 |
| Heading on add section | 10.28 | 9.41 |
| Label on card | 7.64 | 6.99 |
| Input text on input fill | 17.49 | 15.30 |
| Input border vs card / vs fill | 1.49 / 1.49 | 3.44 / 3.61 |
| Input outline vs fill / card | 5.02 / 5.02 | 4.84 / 4.60 |
| Error text on card | 6.42 | 5.92 |
| Submit label on fill; fill vs card | 5.03; 5.03 | 5.02; 4.60 |
| Submit hover label on hover fill | 7.09 | 6.34 |
| Submit outline vs card | 5.02 | 4.60 |
| Disabled submit label on fill (exempt) | 1.49 | 1.49 |
| Disabled field text on fill (exempt) | 2.37 | 2.57 |
| Row title on card; count on card | 17.49; 7.64 | 14.55; 6.99 |
| Action label on fill | 10.28 | 9.89 |
| Action border vs card | 1.49 | 3.44 |
| Action hover border vs card | 2.59 | 6.09 |
| Action outline vs fill / card | 5.02 / 5.02 | 4.84 / 4.60 |
| Disabled action button (opacity .4, exempt) | opacity .4 on the same border/fill | opacity .4, border now 3.44 pre-opacity (not worse) |
| Pinned label on fill | 10.28 (dead state, unpinned look) | 8.15 |
| Pinned border vs card | 1.49 (dead) | 4.60 |
| Pinned fill vs card; vs unpinned fill | 1.00; 1.00 | 1.02; 1.07 |
| Drag ring vs card | 5.03 | 4.60 |
| Confirm panel vs card | 1.09 | 1.10 |
| Prompt on panel | 9.16 | 13.20 |
| Delete label on fill; hover | 6.42; 8.36 | 6.47; 8.00 |
| Delete fill vs panel | 5.87 | 5.37 |
| Delete outline vs panel | 4.59 | 4.17 |
| Confirm Cancel border vs panel | 1.36 | 3.12 |
| Form Cancel border vs card; hover | 1.49; 2.59 | 3.44; 6.09 |
| Swatch checked ring vs card; vs unchecked ring | 17.49; 11.74 | 14.55; 10.67 |
| Swatch focus outline vs card | 5.03 | 4.60 |
| Dot hairline vs card | 1.26 | 1.27 |
| Trigger icon on fill; fill vs page; hover fill vs page | 5.02; 4.60; 3.32 | unchanged |
| Stats fill vs page; border vs page; icon on fill | 1.00; 1.00; 9.42 | 1.00; 3.44; 9.42 |
| Custom input border vs page; text on fill | 1.36; 15.30 | 3.44; 15.30 |
| Wordmark on page (verify-only) | 4.60 | 4.60 |

**Deliberate reductions** (pair went down, reason): everything between 17.49 and 4.60 above that fell is the token hex replacing a v4 OKLCH palette value or a pure white card replacing with cream; every one is still well above 4.5:1 text / 3:1 non-text. Pinned label 10.28 to 8.15 is not a reduction of what users saw (that state was not painted). Disabled-control pairs: none got worse.
Thresholds: no text pair below 4.5:1 after; lowest text pair after is submit hover 6.34 and trigger icon 3.62 (non-text, large icon, >= 3). Lowest interactive boundary 3.12 (Cancel inside delete panel).

### Eight swatches vs the new card ground (criterion 16)
`--card` #fbf4ea: potato 5.37, tomato 4.88, mint 3.14, sky 3.97, lavender 4.70, sunflower 4.77, blush 3.88, slate 5.36 (before, vs white: 5.87, 5.33, 3.43, 4.33, 5.13, 5.21, 4.24, 5.85). All >= 3:1; mint is the thin one (3.14). Docstring updated (comment only; `git diff` shows no `TASK_COLOR_HEX` value change).

### Geometry, console, other
- Bounding boxes of every button, link, text input and `li` on `/` and in the open dialog (with two rows) at 320 and 1280, `d7d1bec` vs working tree: no element differs by more than 1 px; 0 elements under 44 px (excluding `li`); `scrollWidth == clientWidth` in all four cases. The Stats button is 44x44 before and after: the base Button already carries a 1 px transparent border, so `border-none` removal adds a visible edge, not size.
- Console errors/warnings during the full measurement run (load, chips, dialog, add x3, error state, pin, confirm delete, edit/cancel): none, both builds.
- No Playwright run (QA owns it). No tests edited other than the guard work below.

### Guard (criterion 11-15)
- New `components/palette.tokens.test.ts`: walks `app/`, `components/`, `hooks/`, `widgets/` for `*.ts`/`*.tsx` (excluding `*.test.*`) and asserts per file zero raw palette utilities with an **empty** allow-list. Catches `white`/`black`, `/NN` and `/[..]` opacity suffixes, per-side `border-t|r|b|l|x|y|s|e-`, `ring-offset`, `inset-ring`, `drop-shadow`, variant prefixes (`hover:`, `dark:`, `peer-focus-visible:`), and a bare `<palette>-<NN>`; also lime/cyan/fuchsia/mauve/olive/mist/taupe. Second block: no `#hex` or `rgb( rgba( hsl( hsla( oklch( oklab( lab( lch( hwb( color(` anywhere in discovered files, with a pinned two-file exemption (`components/task-palette-colors.ts` swatch data, `components/prototype/contrast.ts` canvas probe), each with a written reason. Third block: inline-style colour exempt only for `TaskColorDot.tsx`, pinned by file, exact expression `style={{ backgroundColor: TASK_COLOR_HEX[colorId] }}` and reason; the file's other checks still run. Discovery is tested (known files from all four dirs, > 30 files, no test files, all swept files present). Positive and negative sample cases for every shape. 148 tests.
- `TaskListDialog.tokens.test.ts`: the old `<palette>-<NN>` regex and its per-file test are **deleted**, not kept beside the new guard. Hex check and token-surface test stay.
- `TimerSurface.tokens.test.ts` is untouched; its own (wide) regex still guards its files, and the new guard is a superset.
- Liveness (frontend's own spot check; QA does the formal hash-verified run): with text-white in TaskListDialog, border-black/10 in TaskColorDot, text-amber-900 in TaskRow, `bg-[oklch(...)]` in HeaderNav, and `bg-white` in `hooks/use-tasks.ts`, the guard failed each time (1 failed / 147 passed) and was green after restoring (file hashes returned to the original; TaskListDialog before 8fc1f27ff1e8 / broken 27fed66dec41 / restored 8fc1f27ff1e8).
- vitest: 454/454 (306 prior after deleting 3 old assertions, plus 148 new).

### Could not do / left for others
- Did not run Playwright. The 4 stale chip assertions and the `test.fail()` at `e2e/timer-surface-tokens.spec.ts:187` are QA's.
- The token is not painted against `--muted` (disabled field fill) in any measured state, so there is no ratio recorded for that ground.
- Q2 (`components.json` lucide) untouched, as required. Q5 recorded above. The hardcoded `#b45309` in `:focus-visible` is still there (dark toggle's job); focus outlines in the swept files use `outline-ring`, which the global rule currently overrides, so the token does not yet reach them.

## QA Report
- **Verdict: PASS.** Full Playwright run 323 passed / 2 skipped / 0 failed (baseline 281 / 4 / 2). vitest 475/475 across 14 files (baseline 454). Lint 0 errors / 21 warnings. Typecheck exit 0. `npm run build` exit 0 on a fresh copy. Criteria tally: 45 PASS, 2 PASS with a stated limit (29 and 30, see below). No criterion failed. No measurement differed from frontend's by more than 0.5.
- **Caveat on the verdict:** criteria 29 and 30 were only partly re-measured by QA. Frontend's table remains the source for the pairs QA did not repeat. The row for each is marked below.

### Tests added or changed (all test files; no application code edited)
- `e2e/helpers/painted.ts` (new): paints a colour onto a 1x1 canvas over its real ground and reads it back, so `oklch`, `color()`, `color-mix` and alpha all resolve. `parseRgb` was not extended.
- `e2e/token-chip-cue.spec.ts` (new, 18 tests): criteria 1 to 8.
- `e2e/token-task-surface.spec.ts` (new, 20 tests): criteria 17, 21 to 23, 31, 35, 36, 42, 43, the pinned Pin button painted values, and the measured pairs.
- `e2e/timer-surface-tokens.spec.ts` (changed): four stale tests rewritten and one `test.fail` replaced (see criterion 9).
- `components/palette.tokens.test.ts` (new, frontend's file, reviewed and exercised): criteria 10 to 15.
- `components/token-foundation.test.ts` (new, 21 tests): criteria 5, 16, 18, 19 (CSS text), 22 (StatsButton source), 44.
- `components/TaskListDialog.tokens.test.ts`: the old `<palette>-<NN>` regex and its test are gone. Only the hex check and the surface-token check remain.
- Not edited: `e2e/task-list.spec.ts`, `e2e/task-list-dialog.spec.ts` (`git diff` empty, both skips untouched), `e2e/timer.spec.ts` and the other timer specs.

### Per-criterion tally
| # | Result | Evidence |
|---|---|---|
| 1 | PASS | `font-weight` checked 700 vs unchecked 400, delta 300, for every selected mode. Label colour delta alone is 1.13:1, asserted below 1.5. |
| 2 | PASS | delta holds under `forced-colors: active` and under `grayscale(1)`. Each condition is paired with the default-rendering delta. Greyscale label luma difference asserted under 10 (colour cannot carry it). |
| 3 | PASS | all four chips, both states: `background-color` `rgba(0, 0, 0, 0)`, four border widths `0px`, no border colour, radius 0. |
| 4 | PASS | painted checked and unchecked labels vs page 4.5:1 or better. Colours are `--accent-foreground` and `--secondary-foreground`. |
| 5 | PASS | `mode-chip.tsx` has no `hover:` (vitest). |
| 6 | PASS | 320 and 1280 px, each mode selected: `scrollWidth` equals `clientWidth`; all chips in view; all at least 44 px. Per-chip width delta recorded below. |
| 7 | PASS | radios `type=radio`, class `peer sr-only`, no `role`, no `aria-*`; fieldset and legend unchanged; `mode-selector-legend.spec.ts` green in full run. |
| 8 | PASS | 2 px solid, 2 px offset, `--ring` exact on checked and unchecked; ring 4.60:1 vs page (3:1 floor). |
| 9 | PASS | enumerated below. Suite 0 failed. Skips untouched. |
| 10 | PASS | guard per-file zero-raw-utility assertions (`palette.tokens.test.ts`), all five files. |
| 11 | PASS | discovery walks `app`, `components`, `hooks`, `widgets`. Allow-list empty (asserted). Discovery is tested for more than 30 files. |
| 12 | PASS | literal guard covers `#hex` and all ten colour functions in the five files. |
| 13 | PASS | `TaskColorDot` inline-style exemption pinned by exact expression, with a written reason. Other checks still run on the file. |
| 14 | PASS | positive samples include `white`, `black`, `/NN`, `/[..]`, `oklch`, `dark:` and `hover:` variants. Old regex deleted, not kept beside the new one. |
| 15 | PASS | break-and-restore with hashes below. Each shape fails exactly one specific test. |
| 16 | PASS | `git diff` on `task-palette-colors.ts` is comment-only. Vitest pins all eight `TASK_COLOR_HEX` values to `d7d1bec`. The docstring names `--card`. Mint 3.14 noted. |
| 17 | PASS | `#88837e` painted: 3.44 on `--background`, 3.44 on `--card`, 3.61 on `--popover`, 3.117 on the delete-confirm panel. The brief quoted 3.12; the exact value is 3.117 and rounds to 3.12. Floor is 3:1. |
| 18 | PASS | comment carries role, the `--border` 1.36:1 and 1.43:1 reason, shared app-wide, and the milestone 4 dark obligation (vitest). |
| 19 | PASS | `git diff --numstat app/globals.css` is 13 added, 0 removed. `--border` and `--input` are still `#d6d3d1`. |
| 20 | PASS | classification table covers every interactive boundary inside the open dialog (DOM sweep, below). Decorative edges match the table. |
| 21 | PASS | custom input border 3.44:1 vs page, equal to `--control-border`. Chip half is moot: chips carry no border, so QA says so, per criterion 3. |
| 22 | PASS | Stats link: border 3.44:1 vs cream; 44x44 at 320 and 1280; name `Focus stats`; `href=/stats`; click reaches `/stats`; named export. |
| 23 | PASS | interactive boundaries measured by QA, all at least 3:1 against their own ground. Lowest is the Cancel inside the delete panel at 3.117. |
| 24 | PASS | swap table present in Implementation Notes. QA spot-checked against the painted readings below, not re-derived row by row. |
| 25 | PASS | deviations confirmed on the rows QA measured. The OKLCH-vs-hex gap is real: Delete `#c10007` painted vs `--destructive` `#b91c1c`. |
| 26 | PASS | per-pair before and after present in Implementation Notes. QA re-measured the pairs listed below. |
| 27 | PASS | every ratio QA reports comes from painted pixels or painted computed style, not token arithmetic. |
| 28 | PASS | every measured pair clears its threshold. Lowest text pair measured: 5.92 (error text). Lowest boundary: 3.117. |
| 29 | PASS with limit | QA measured the disabled `-1` action button: its pre-opacity border is 3.44:1 vs 1.49:1 at `d7d1bec`. The disabled custom-duration input text clears the existing 2.37:1 floor (existing test). Disabled submit and disabled field fills were not re-measured by QA. Frontend's figures stand for those. |
| 30 | PASS with limit | QA measured these pairs: heading, row title, error text, prompt, Delete label and fill, action border (7 buttons), pinned border and fill, edit and confirm Cancel borders, swatch ring, the eight swatches, trigger fill and icon, wordmark, custom input border, Stats border. The rest of the list is taken from frontend's table: drag-ring ratio, submit, inputs' outlines, delete hover, and similar. |
| 31 | PASS | named cues: pinned `aria-pressed` true and label `Unpin`; drag-active `opacity` 0.6 and ring present; swatch checked ring `calc(2px + 2px)` vs unchecked `calc(1px + 2px)`, so width differs; field invalid `aria-invalid="true"` plus `role=alert`; disabled attribute present while running. |
| 32 | PASS | `task-list.spec.ts` and `task-list-dialog.spec.ts` green, unmodified. |
| 33 | PASS | timer specs green, unmodified. |
| 34 | PASS | DOM geometry dump of `/` and the open dialog (with two rows, idle and custom modes) at 320 and 1280 px. Working tree vs `d7d1bec`: 0.00px worst delta across 4 phases and 120 items. Stats border `0px none` at `d7d1bec`, `1px solid #88837e` now, box 44x44 in both. |
| 35 | PASS | every visible button, link, non-radio input and `[role=button]` is at least 44 px at 320 and 1280 (the test). `<label>` text elements are not controls and are excluded. |
| 36 | PASS | axe-core: no serious or critical violation in the open dialog at both widths, in display, editing, confirming-delete and add-form-error states. |
| 37 | PASS | `git diff --stat` empty for every listed path. |
| 38 | PASS | `package.json`, `package-lock.json`, `components.json` unchanged. |
| 39 | PASS | lint 0 errors / 21 warnings. Typecheck exit 0. `npm run build` exit 0. `npm run test` 475/475. `npm run test:e2e` 323 passed, 2 skipped, 0 failed. |
| 40 | PASS | vitest 475/475 (baseline 454 plus 21 new). |
| 41 | PASS | Playwright 323 passed / 2 skipped / 0 failed. Compared to the handed-over 281 / 4 / 2. 287 total + 38 new = 325. |
| 42 | PASS | console and `pageerror` capture from before `goto`, at both widths. Covers load, dialog, add x2, edit and cancel, delete and cancel, pin, +1 and -1, reorder by keyboard, close, mode switch, reload. Zero messages. |
| 43 | PASS | no hydration console message on reload with the trigger rendered, plus the existing idle, running and paused reloads. |
| 44 | PASS | no `any` in changed files (vitest). New QA files contain no `any` type. |
| 45 | PASS | each forced-colors and greyscale assertion is paired with a default-rendering reading. No assertion sits inside `try`, `if` or `else`. Every test asserts a value. |
| 46 | PASS | four criteria broken and restored, with hashes (below). |
| 47 | PASS | Implementation Notes were recorded before QA started and contain the required items. |

### Criterion 9: the four stale failures and the `test.fail`
Baseline failure set confirmed by `file:line` from the first run: `:162`, `:173`, `:265` (checked focus) and `:265` (unchecked focus).
- `:162` selected chip: **rewritten.** Asserts flat text, no fill, no border, label 4.5:1 vs page, and label equals `--accent-foreground`. It no longer asserts the deleted fill and border.
- `:173` unselected chip: **rewritten.** Same shape, against `--secondary-foreground`.
- `:187` `test.fail()`: **replaced.** The marker passed only because the border does not exist. `readPaint()` threw on the transparent colour before any contrast check. The replacement is a real passing test: the unselected chip has no border by design (criteria 3 and 21). The 3:1 boundary is carried by the custom input and the Stats button. No `test.fail` remains in the spec (`grep` confirmed).
- `:265` checked and unchecked focus: **rewritten.** The ring is composited over the real page (`readPainted`). The transparent fill is no longer read. Assertions are width 2px, offset 2px, colour equal to `--ring`, and 3:1 vs page.
- Skips: the two `e2e/task-list-dialog.spec.ts` tests remain skipped. Their assertions and `git diff` are untouched.

### Criterion 46 and 15: break-and-restore, hash-verified
Mutations were applied to a scratch copy of the working tree, never to `/Users/ramwelltupas/pomotato`. Each restored file was compared against the real file's hash. Playwright ran on the copy's own server on port 3100, because a pre-existing `next dev` on port 3000 was reused otherwise and would have served the unbroken tree.

Guard (`components/palette.tokens.test.ts`, vitest on the copy):
| Shape | File | Before | Broken | Restored | Failing test |
|---|---|---|---|---|---|
| `bg-white` | `hooks/use-tasks.ts` | `3a6b1643a006` | `80f087d6ff66` | `3a6b1643a006` | `hooks/use-tasks.ts has no raw palette utility` |
| `border-black/10` | `components/TaskColorDot.tsx` | `f8bd32c8a634` | `aa2661107edb` | `f8bd32c8a634` | `components/TaskColorDot.tsx has no raw palette utility` |
| `text-amber-900` (palette-NN) | `components/TaskRow.tsx` | `75007a2e6aa7` | `aee8d822a6bd` | `75007a2e6aa7` | `components/TaskRow.tsx has no raw palette utility` |
| `oklch(...)` literal | `widgets/HeaderNav.tsx` | `f6ebb65f95f1` | `0df798d02ad1` | `f6ebb65f95f1` | `widgets/HeaderNav.tsx has no hex literal or colour function` |
| `text-white` (precedent) | `components/TaskListDialog.tsx` | `cf5f5016abe5` | `96243efd559e` | `cf5f5016abe5` | `components/TaskListDialog.tsx has no raw palette utility` |

After all restores the guard is 148/148 green. Each probe failed exactly one test.

Playwright (`e2e/*` on the copy's own server):
| Probe | File | Before | Broken | Restored | Failing tests |
|---|---|---|---|---|---|
| Pinned colours re-joined without merge (criteria 2, 30, 31) | `components/TaskRow.tsx` | `75007a2e6aa7` | `53fb6bd49c2c` | `75007a2e6aa7` | the pinned painted-values test, and the criterion 23 boundary test |
| Chip weight removed (criterion 1) | `components/ui/mode-chip.tsx` | `a383e26fadf9` | `0685e6ac9fb4` | `a383e26fadf9` | 8 tests (criterion 1 ×4, criterion 2 ×4) |
| Custom input border back to `--border` (criteria 21, 23) | `components/CustomDurationInput.tsx` | `479c56dccac3` | `e417244ce936` | `479c56dccac3` | `criterion 21` |
| Delete fill to `bg-muted` (criterion 30 pair) | `components/TaskRow.tsx` | `75007a2e6aa7` | `0f3673ede8e1` | `75007a2e6aa7` | `named pairs that fell but still pass` |

Unbroken copy on port 3100 passes the chip spec (18/18) first, to validate the harness.

### Measurements QA re-took (painted, against frontend's figures)
| Pair | Frontend | QA |
|---|---|---|
| Heading on add section | 9.41 | 9.41 |
| Row title on card | 14.55 | 14.55 |
| Error text on card | 5.92 | 5.92 |
| Delete prompt on panel | 13.20 | 13.20 |
| Delete label on fill | 6.47 | 6.47 |
| Delete fill vs panel | 5.37 | 5.37 |
| `--control-border` vs panel | 3.12 | 3.117 |
| Pinned border vs card | 4.60 | 4.60 |
| Action button border vs card (7 buttons) | 3.44 | 3.44 |
| Edit and confirm Cancel borders | 3.44 / 3.12 | 3.44 / 3.12 |
| Form title input border vs card / fill | 3.44 / 3.61 | 3.44 / 3.61 |
| Custom input border vs page | 3.44 | 3.44 |
| Stats border vs page | 3.44 | 3.44 |
| Swatches vs card: potato, tomato, mint, sky, lavender, sunflower, blush, slate | 5.37, 4.88, 3.14, 3.97, 4.70, 4.77, 3.88, 5.36 | same to two decimals |
| Trigger fill vs page / icon on fill | 4.60 / 5.02 | 4.60 / 5.02 |
| Wordmark on page | 4.60 | 4.60 |
| Checked swatch ring vs card / vs unchecked ring | 14.55 / 10.67 | ring width `calc(2px + 2px)` vs `calc(1px + 2px)`, colour `#2b2017` vs `#d6d3d1` |
| Chip width delta (checked vs unchecked, px) | focus -0.8, short -1.9, long -1.2, custom -1.0 | 0.9, 1.9, 1.2, 1.0 (sign convention: checked minus unchecked; magnitude matches) |

No measurement differs by more than 0.5. Not re-taken by QA: drag-ring ratio (4.60), the disabled submit and disabled field fills, the decorative card edges (1.36 and 1.43), and the pinned label (8.15). These stand on frontend's figures.

### Criterion 1 cue width delta, criterion 6
Per-chip width delta at 320 px and at 1280 px is identical in both: focus 0.9 px, short break 1.9 px, long break 1.2 px, custom 1.0 px. Chips never leave the viewport, and `scrollWidth` equals `clientWidth` for all four modes.

### Criterion 6 known gap: unlayered focus rule
Confirmed still true. `app/globals.css:156-159` is an unlayered `:focus-visible { outline: 2px solid #b45309 }`. Focus outlines that use `outline-ring` (`--ring` is also `#b45309`) are therefore painted from that hardcoded value, so the token does not reach them. Recorded for milestone 4's dark part (006 Q5). It is not a failure of this task.

### Observations outside this task's scope (not counted against the verdict)
- DOM sweep of the open dialog: two interactive boundaries sit in files this task does not touch, and both are at the soft `--border` (1.36:1). The dialog close button in `components/ui/dialog.tsx` (`#d6d3d1`) and the timer `Reset` button (`#d6d3d1`, 006 surface). Both are interactive boundaries, but neither is in the swept file list. The owner should decide whether they belong in a later task.
- `<label>` text elements in the add form are 20 px tall. They are labels, not controls, so criterion 35 does not cover them.
- The Pomotato suite's real-tree runs were served by a `next dev` already listening on port 3000 (pid 43836, cwd the working tree). I left that process alone.

### Failures
None. No criterion failed; no test is failing.

## Review Findings

**Verdict: APPROVE.** All 47 criteria check out. Nothing in this diff blocks the merge, and nothing below asks frontend to come back. The findings are ranked by consequence and every one of them is either a follow-up task, a note for the dark-toggle part, or a correction to the record.

Verified independently of the agent reports: `npm run typecheck` exit 0; `npm run lint` 0 errors / 21 warnings; `git diff --stat` empty for every path criterion 37 freezes and for `package.json`, `package-lock.json`, `components.json`; `git diff --numstat app/globals.css` 13 added / 0 removed with `--border` and `--input` still `#d6d3d1`; `#88837e` recomputed at 3.437 (`--background`, `--card`), 3.614 (`--popover`), 3.117 (delete-confirm tint); the 6% `--destructive`-into-`--card` mix recomputed at `rgb(247, 231, 222)`; the idle hover mix at `rgb(99, 91, 85)`, 6.089:1 on the card. Tailwind v4's `stone-300` `oklch(86.9% 0.005 56.366)` and `stone-100` `oklch(97% 0.001 106.424)` converted to sRGB by hand: `rgb(214, 211, 209)` and `rgb(245, 245, 244)`, byte-identical to `--border` and `--muted`, which confirms the two `exact` disabled-fill rows QA did not re-measure. `d7d1bec`'s `TaskRow.tsx` and `TaskForm.tsx` read from `git show` for every before-state claim.

**antislop:** mode unresolved for this review. No antislop instruction in the review brief, and no `~/.config/antislop/settings.json` on this machine, so the 005/006 `during (session override)` record is a prior session's instruction and cannot be carried forward as a source. No antislop Mode-2 UI audit was run; the findings below are the reviewer role's five dimensions (correctness against the criteria, TypeScript strictness, accessibility, performance, licensing/branding). If the owner wants an antislop audit of this surface, that question (DURING or AFTER) has to be answered first.

### R-1. Four interactive boundaries are still at the soft `--border`, and the root cause is one line in a generated file
`components/ui/button.tsx:13` — the `outline` variant hardcodes `border-border bg-background`. Every button that takes it is born at 1.36:1 on `--background` / 1.43:1 on `--popover`. Live consumers and hand-written twins, all outside this task's file list:
- `components/ui/dialog.tsx:89-91` — the dialog Close button (`variant="outline"`). QA named it.
- `components/TimerControls.tsx:76` — the timer Reset button, `border border-border` by hand. QA named it.
- `components/CurrentTaskCard.tsx:32` — the Reload button on the error path, `border border-border bg-background`: the same defect shape as the Stats button (a fill identical to the page plus a 1.36:1 edge), in a file criterion 37 freezes.
- `components/StatsViewSwitcher.tsx:41` — the unchecked view chips, `border-border bg-card`. (Its checked branch already carries `font-semibold`, so it is not a 1.4.1 problem, only a 1.4.11 one.)

**Why it matters:** this task's whole premise is that milestone 4 adds one `.dark` block. A dark block that assigns `--control-border` a dark value and stops there leaves these five below 3:1 in *both* themes — the gap survives the thing that was supposed to close it.

**What I would do:** give it its own small task and land it **before** the dark toggle, not folded into it. Folding it in forces the dark task to re-measure light as well as dark, which is exactly the scope creep that produced 006's criterion 14. Answering the orchestrator's question directly: these do **not** want to ride with the dark toggle. The work is one line in `button.tsx` plus four call sites plus the painted measurements, and `e2e/token-task-surface.spec.ts`'s `borderAgainst()` helper already exists to measure them.

### R-2. Criterion 35 does not actually reach the colour-swatch picker, and that is the one control under 44 px
`components/TaskForm.tsx:206-227` — the swatch target is the `<label>` wrapping an `sr-only` radio and a `h-9 w-9` span: **36 x 36 px**. The criterion-35 test at `e2e/token-task-surface.spec.ts:355` queries `button, a[href], input:not([type=radio]):not([type=checkbox]), [role=button]`, which matches the swatch by *nothing* — the radio is excluded by the selector and the label/span is not a control tag. So criterion 35 is recorded PASS while the only control that fails it is invisible to the test.

Pre-existing: `git show d7d1bec:components/TaskForm.tsx` shows `h-9 w-9` unchanged, and this task only swapped the ring colours on that element. 36 px clears WCAG 2.5.8 AA (24 px); it misses the project's own 44 px rule in CLAUDE.md and in this criterion's text ("every control"). The mode chips are the same `sr-only`-radio-plus-styled-label shape and are equally invisible to that selector, but they are covered separately and pass at >= 44 px (`e2e/token-chip-cue.spec.ts`).

**What I would do:** nothing in this diff. Record the 36 px swatch as a known gap rather than leave it implied by a selector, and widen the sweep to `label:has(input[type="radio"].sr-only)` in whichever task next opens `TaskForm.tsx`.

### R-3. The token *is* painted on `--muted`, and the Implementation Notes say it is not
Implementation Notes, "Could not do / left for others": *"The token is not painted against `--muted` (disabled field fill) in any measured state, so there is no ratio recorded for that ground."* That is not right. `components/TaskForm.tsx:169,189,251` and `components/CustomDurationInput.tsx:62` carry `border border-control-border` with `disabled:bg-muted` and **no** `disabled:border-*` override, so `#88837e` paints on `#f5f5f4` whenever a field is disabled — which happens on every running timer for the custom-duration field.

No harm done: I computed it at **3.441:1**, so criterion 17's "every ground it is painted on" holds in fact. But the note is wrong and the token's comment at `app/globals.css:52-61` lists four grounds where there are five.

**What I would do:** correct the note, and add `--muted` as a fifth row to the token's ground table so milestone 4 re-measures it against the dark `--muted` alongside the other four.

### R-4. Two visible changes in the delete-confirm panel are not on the deliberate-changes list
`components/TaskRow.tsx:172` takes the panel tint from `bg-red-50` (`#fef2f2`, unmistakably pink) to a 6% `--destructive` mix over `--card` (`#f7e7de`, a faint peach), and `:175` moves the prompt from `text-red-900` to `text-foreground`. Both are individually defensible — the tint cut is what got the in-panel Cancel border from 2.906:1 to 3.117:1 (I recomputed both), and the prompt went *up*, 9.16 -> 13.195 — and criterion 28 is satisfied. The red `Delete` button still carries the destructive signal.

But the Implementation Notes enumerate four deliberate visible changes and these two are not among them, and together they make the confirm panel read noticeably less like a warning than it did. That is a tone decision sitting inside a token sweep.

**What I would do:** nothing in code. Put it in front of the owner. If they want the red prompt back, `text-destructive` on the new tint measures **5.373:1** (I computed it), which clears 4.5:1, so the option is available without touching the tint again.

### R-5. The pinned Pin button lost its hover feedback
`components/TaskRow.tsx:35` — `pinnedActionButtonClass` has no `hover:` state, while `actionButtonClass` darkens its border to 6.089:1 on hover. Before this task the pinned button *did* have one: the unmerged join meant the base `hover:border-stone-400` still applied even though the pinned colours did not. So a correct fix traded one small regression for a much larger one.

Not an accessibility failure — the focus ring and the `Pin`/`Unpin` label are intact, and hover is not a WCAG requirement. An affordance loss on one control.

**What I would do:** add `hover:border-[color-mix(in_srgb,var(--primary),var(--foreground)_20%)]` to `pinnedActionButtonClass` in the next task that opens the file. Not worth a round trip now.

### R-6. `disabled:bg-border` couples a boundary token to a fill role
`components/TaskForm.tsx:264` — the disabled submit is filled with `--border`. This is the **correct** choice under criterion 29: `--border` is byte-identical to the old `stone-300` (verified by OKLCH conversion), so the disabled pair holds at 1.49:1, where `--muted` would have dropped it to about 1.08:1 and criterion 29 forbids getting worse. So no change is wanted here.

It is still a semantic smell worth carrying forward: milestone 4 will choose `--border`'s dark value for its boundary job, and a disabled submit filled with that value may land anywhere from invisible to oddly bright. **What I would do:** the dark-toggle task introduces a disabled-surface token rather than inheriting the coupling. Flag it there, not here.

### R-7. One unsound cast, in a test file
`e2e/token-chip-cue.spec.ts:33` — `const out: Record<Mode, { ... }> = {} as never;` asserts an empty object as a fully-populated four-key record. Safe in practice: the loop on the next lines writes all four keys before the value escapes. But `as never` is the same escape hatch as `as any` with respect to CLAUDE.md's rule, and `components/token-foundation.test.ts:125` only greps for `any`, so the guard that is supposed to catch this shape walks past it.

**What I would do:** seed the record with its four keys, or build it with `Object.fromEntries` behind a mapped type. Non-blocking, test-only.

### R-8. The guard is strong; three places it is narrower than it looks
`components/palette.tokens.test.ts` is the most valuable thing in this diff and it does what criterion 11 asks — discovery-driven, empty allow-list, asserted empty. Three notes, none a criterion failure:
- **The inline-style block (lines 164-169) iterates `TASK_007_FILES`, not `FILES`.** That list is hand-written. A file added later with `style={{ backgroundColor: "red" }}` is caught by nothing: the hex and colour-function blocks are discovery-driven but neither sees a named CSS colour. One-word fix: iterate `FILES`.
- **`SCANNED_DIRS` (line 18) is hand-maintained.** A new top-level folder is uncovered — the same hole `widgets/` sat in before this task. Criterion 11 names exactly those four directories, so this is within spec, but an assertion that `SCANNED_DIRS` equals the set of top-level folders containing `.tsx` would make it self-maintaining.
- **`text-shadow-*` is absent from `COLOR_UTILITY_PREFIX` (line 44).** Tailwind 4.1 added coloured text shadows. One word.

**The exemptions are pinned honestly.** I read both. `components/prototype/contrast.ts` is exempt only for `ctx.fillStyle = "#000"`, a 1x1 canvas reset in a measurement probe that paints nothing to the page — narrow and true. `components/task-palette-colors.ts` is the owner's swatch data, and `components/token-foundation.test.ts:57-70` pins all eight values against `d7d1bec`, so the exemption cannot be used to smuggle a changed swatch past review. The inline-style exemption is pinned to the exact expression string, so moving or editing that expression breaks the test rather than silently widening it. All three are correct.

**And the old blind regex really is deleted, not shadowed** — in the file criterion 14 names. `git diff -- components/TaskListDialog.tokens.test.ts` removes the `RAW_PALETTE_UTILITY` const and its per-file `it()`, leaving only the hex check and the surface-token check. See R-9 for the copy that criterion 14 did not name.

### R-9. A third copy of the task-005 blind regex survives
`components/TimerGauge.tokens.test.ts:15` still carries the same `(?:amber|stone|red|...)-\d{2,3}` pattern that cannot see `white`, `black` or `/NN` and that let `text-white` through for two tasks. It guards `TimerGauge.tsx`, `HoldButton.tsx`, `SloshGauge.tsx` and `hooks/use-resolved-tokens.ts`, **all four of which the new discovery-driven guard already covers**, so nothing is unguarded today.

Criterion 14's text names only `TaskListDialog.tokens.test.ts`, so this is not a criterion failure. It is the same artefact: a test that looks like a live palette guard and is blind to three of the four shapes. **What I would do:** delete those lines and the two `it()` blocks that use them in the next task that opens the file; the `HEX_LITERAL`, `RGB_LITERAL` and `TIMER_SOURCE` checks in that file are still useful and stay.

### R-10. Space Grotesk has no provenance entry
`app/layout.tsx:2` loads Space Grotesk via `next/font/google` (self-hosted at build, SIL OFL, no runtime request to Google), used for the `pomotato` wordmark in `widgets/HeaderNav.tsx`. Comfortaa has a provenance line in the 2026-10-09 asset entry in `docs/DECISIONS.md`; Space Grotesk has none — `grep -rni "space.grotesk" docs/` finds it only in task files. The typeface *choice* was already confirmed by the owner as deliberate (005's R-7); what is missing is the licence line CLAUDE.md requires. Pre-existing, outside this diff, zero risk. **What I would do:** one line added to the 2026-10-09 entry the next time typography is touched.

---

### The six judgement calls, answered

**1. `--control-border: #88837e`, and cutting the panel tint to 6%. Adequate, and the right lever.** The 0.117 margin is thinner than it looks safe, but it is not a measurement that can drift: both colours are exact token values composited with no antialiasing and no subpixel geometry, so 3.117:1 is deterministic, and I reproduce it to three decimals. The real exposure is future edits, not noise — and that is already netted, because the criterion-17 test reads the panel's painted fill rather than hardcoding it, so darkening the tint or changing `--destructive` turns the suite red.

On the lever: holding the tint at the old 10%-equivalent, even `#88837e` only reaches **2.906:1** (I computed it), so the token alone could not have cleared the floor — it would have had to go to roughly `#85807b` or darker, which lifts the other four grounds past where they need to be and darkens every control edge in the app, against the cream direction in `DESIGN.md`. Moving two variables was not over-correction; one was insufficient. The alternative worth naming is structural rather than chromatic — put the confirm buttons on `--card` instead of inside the tint, or make the panel a 1 px `--destructive`-mix edge instead of a fill — but either is markup surgery inside a colour task, and criterion 32 freezes that behaviour. Frontend took the cheaper correct option. The cost is tonal, not technical, and it is R-4.

**2. The chip cue: weight alone is sufficient and not fragile. One cue is enough; the reflow is the thing to watch.** `font-weight` 700 vs 400 is a genuine non-colour property, it is immune to `forced-colors` and to greyscale by construction, and at 14 px uppercase Comfortaa the difference is plainly visible. 1.4.1 is satisfied, 1.4.11 is not engaged (no boundary), and native `checked` still carries the state for assistive tech — so the gap was only ever sighted-CVD, and weight closes it. The one degradation path is a font-synthesis-disabled environment with no bold face available; browser default is `font-synthesis: auto`, so the browser fakes it, and the fallback stack would too.

What I would actually put to the owner is not sufficiency, it is the **3 px row shift on every mode change**. Before `2e8f967`'s successor the row was static because all four chips were bold; it now jitters, on the one surface `DESIGN.md` describes as "calm". The underline alternative the PM listed costs no width at all. Frontend measured the shift, judged it small, and kept the default — a reasonable call, and `components/ui/mode-chip.tsx` makes it a one-line variant change either way. If the owner wants a second cue rather than a swap, `underline underline-offset-4 decoration-2` on the checked variant adds zero reflow and no fill, border or radius, so criterion 3 still holds. I would not require it.

**3. The pinned fix: correct, well-targeted, and the only instance.** I confirmed the defect in `d7d1bec`'s source — the pinned classes joined onto `actionButtonClass` with no merge step, so `bg-white` and `bg-amber-100` both reach the class list and stylesheet order decides. The pinned fill, border and label had been authored and never shown since milestone 2, with state carried only by `aria-pressed` and the label.

The fix is better than the obvious one. Reaching for `cn()` would have made the merge *work*; splitting into `actionButtonShape` + `actionButtonClass` + `pinnedActionButtonClass` with mutually exclusive branches makes the collision **impossible**, which is the right level to fix a class-ordering bug at. It is covered by a painted-pixel regression test (`e2e/token-task-surface.spec.ts`, asserting painted values, not class names, so a class-list check cannot stand in for it) and by a hash-verified break-and-restore.

**No other instance of the pattern exists.** I checked every class join and template-literal `className` in `app/`, `components/` and `widgets/`: `components/TaskRow.tsx:117` (card) and `components/TaskForm.tsx:222` (swatch) both keep colour **only** in the conditional branch with a colour-free base; `components/TaskRow.tsx:148` appends only non-colour utilities to `actionButtonClass`; and `components/StatsViewSwitcher.tsx:42`, outside the diff, is already built the same correct way. The pinned Pin button was the only one.

**4. The boundary classification is drawn correctly, including the unchecked swatch ring.** On the ring specifically: 1.4.11 asks 3:1 of visual information required to identify *components* and their *states*. Identification is carried by the swatch fill (3.14-5.37:1 against the new card), not the ring. State is carried by the *change* — checked ring 14.55:1 against the card and 10.67:1 against the unchecked ring, both far over 3:1 — and "unchecked" is the default, which has nothing to assert. So a 1.36:1 trim ring on an unchecked radio is decorative under the actual text of the success criterion, not a convenient reading of it. Frontend's one-line reason is right.

I pressure-tested the other three decorative calls and they hold too. **Row card border:** the card is a container; the `li` is a dnd-kit sortable but the drag *target* is the handle button, which carries its own 3.44:1 boundary. **Delete-confirm panel:** the confirm state is announced by the prompt and two new buttons appearing — a structural change, not a colour — so the tint is not state-bearing. **`TaskColorDot` hairline:** trim around a swatch whose fill identifies it, same logic as the ring. **No decorative classification in the swept files is an interactive boundary in disguise.** Four are, outside them — that is R-1.

**5. Criterion 31 holds for sighted CVD users, and QA undersold it.** Pinned is not ARIA-only. The button's **rendered text** changes from `Pin` to `Unpin` — visible, non-colour, and asserted (`toHaveText("Unpin")`), not merely an accessible name. `aria-invalid` is likewise not the only invalid cue: a `role="alert"` paragraph *appears*, which is a visible structural change. Disabled carries the attribute plus `disabled:opacity-40` and `cursor-not-allowed`. Drag-active is `opacity: 0.6` plus a ring. So none of the five relies on colour, and two of them (pinned, invalid) change the rendered text content, which is the strongest kind of cue there is. On top of that, pinned now *also* paints, so the colour cue is redundant rather than load-bearing. **The exact gap this task was written to close is closed, more decisively than the QA Report's "aria-pressed plus the label" phrasing suggests.** The one I would call genuinely thin is the swatch's 2 px-vs-1 px ring: a 1 px geometric delta is a weak non-colour cue on its own. It is backed by a 10.67:1 colour change and the `sr-only` colour name, so it is not a 1.4.1 failure, but it is the least robust item on criterion 31's list.

**6. The evidence standard on criteria 29 and 30 is acceptable, and the limit falls in the right place.** What QA did not re-take: the drag-ring ratio, the disabled submit fill, the disabled field fills, the decorative card edges, the pinned label. Run down what each would have cost:
- The drag ring is `--ring` at 4.60:1 — a non-text indicator with a 1.6-point margin, and the same token measured in four other places.
- The disabled fills are **byte-identical swaps**, which I proved rather than took on trust: v4 `stone-100` -> `rgb(245, 245, 244)` = `--muted`, v4 `stone-300` -> `rgb(214, 211, 209)` = `--border`. Criterion 29 only requires "not worse", and identical cannot be worse. This is the one place where an unmeasured row and an `exact` claim overlap, and it is also the place where it matters least — and it is now independently confirmed.
- The decorative card edges are the rows already recorded as below 3:1 by design.

Against that, everything near a threshold **was** re-measured by QA: the 3.117:1 boundary, mint at 3.14:1, the 3.62:1 trigger hover icon, the 5.92:1 error text. That is the correct prioritisation — QA spent its re-measurement budget where a wrong number would have changed a verdict and took the table on trust where it could not. Criteria 24-26 resting on presence plus spot-check is the same trade and I accept it on the same grounds. If I were tightening anything it would not be more re-measurement; it would be asserting the byte-identical disabled swaps in vitest against the token values, so "not worse" becomes structural rather than measured.

### Known gaps: confirmed, not re-litigated
- **`app/globals.css:156-159`, the unlayered `:focus-visible { outline: 2px solid #b45309 }`.** Confirmed still present and still winning: it sits outside `@layer`, so it beats every Tailwind utility in `@layer utilities` regardless of specificity, and `focus-visible:outline-ring` on the swept controls does not reach them. No visible difference today because `--ring` is also `#b45309`. Correctly parked on the dark-toggle part (006's Q5). One refinement for whoever takes it: the **mode chips** are the exception — their ring comes from `peer-focus-visible:outline-ring` on the `<span>` while the unlayered rule hits the `sr-only` `<input>`, so those two never collide and the chip ring genuinely resolves through the token.
- **The two out-of-scope interactive boundaries QA flagged.** Confirmed, and there are more than two. See R-1: they want their own small task ahead of the dark toggle, not a ride-along.
- **`components.json`'s `"iconLibrary": "lucide"` with `lucide-react` imported by nothing.** Confirmed untouched; `git diff components.json` is empty. Out of scope by criterion 38, still open as Q2.

### The five review dimensions
- **Correctness against the criteria:** 47 of 47. The two "PASS with limit" rows are justified above.
- **TypeScript strictness:** `tsc --noEmit` exit 0. No `any` anywhere in the diff (I grepped new test files as well as app code). One unsound cast, test-only: R-7. Named exports throughout; no `export default` in any changed component.
- **Accessibility:** native radio semantics frozen and asserted down to the attribute list; arrow-key and Tab-entry behaviour covered in `e2e/timer-surface-tokens.spec.ts` (the chip spec does not test arrows — I checked that the coverage exists elsewhere before accepting criterion 7); focus visible at 2 px / 2 px offset / `--ring` >= 3:1 on both chip states; axe-core clean at serious and critical across four dialog states and two widths; 44 px holds everywhere the sweep reaches, with the one 36 px control it does not reach called out in R-2. The 1.4.1 regression that opened this task is genuinely fixed, and criterion 31 is stronger than claimed (point 5 above).
- **Performance:** nothing here changes render frequency, adds a subscriber, or touches timer logic. `actionButtonShape` / `actionButtonClass` / `pinnedActionButtonClass` are module constants evaluated once; the pinned branch is a ternary between two interned strings, strictly cheaper than the old array-join-per-render it replaces. `git diff --stat` is empty for `lib/` and `hooks/`, so the end-timestamp timer derivation is untouched by construction.
- **Licensing / branding:** no audio, fonts, images or binaries added; the diff is CSS, TSX and tests only. `package.json`, `package-lock.json` and `components.json` unchanged — no new dependency, no icon-library switch. No copied branding, UI or copy. The one documentation gap is R-10, pre-existing and outside this diff.
