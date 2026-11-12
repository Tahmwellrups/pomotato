# The panel becomes the only task surface: the dialog goes, the panel hides, and emoji and colour leave the model — history log

Appended by frontend/backend/qa/reviewer/orchestrator after implementation began.
The task's goal, scope and acceptance criteria are in [../015-panel-only-task-surface.md](../015-panel-only-task-surface.md).

## Implementation Notes
(Filled in by backend, then frontend, as they build. Criterion 1 lists what backend must record **before**
frontend starts; criterion 2 gates group G.)

### Backend (complete, frontend may start)

**Gate state on the handoff tree.** `npm run typecheck`: errors only in frontend-owned component files (listed in item 6) and in three test files. `npx eslint lib app widgets hooks`: 0 errors. Full `npx vitest run`: 7 files red, 73 tests failing, 937 passing (the 83 tests in `lib/db/task-repository.test.ts` cannot even load, so total reads 1010 against 1093).

**1. The `.version(5)` block, verbatim, in `lib/db/database.ts` beside a byte-identical `.version(4)`:**
```ts
this.version(5)
  .stores({})
  .upgrade(upgradeToVersion5);
```
`CURRENT_SCHEMA_VERSION` is 5. The highest-literal guard (`if (this.verno !== CURRENT_SCHEMA_VERSION) throw ...`) is unedited and passes: the database opens at `verno === 5` (checked by a throwaway test, deleted). No earlier `.stores()` argument was touched and `tasks: "id, position"` is not restated.

**2. `upgradeToVersion5(tx)`, in order:** (a) read every row of `tasks` with `toArray()`; (b) keep only rows that have an own `emoji` or `colorId` property, whatever its value (string, `null`, `0`); (c) copy each such row, delete both properties from the copy; (d) `bulkPut` the copies, skipped entirely when there are none. Idempotent because a row without the properties is filtered out in (b), so a second run on its own output, clean rows, or an empty table performs no write at all. It cannot throw on bad data because it validates nothing: no `position` renumber, no `done` read or write, no other field judged. It never touches `sessions`, `backgrounds` or `appMeta`.

**3. Seeding a version-4 database.** `seedVersion4DatabaseForTests(data: { tasks: Array<Record<string, unknown> & { id: string }>; sessions?: SessionRecord[]; backgrounds?: Array<Record<string, unknown> & { id: string }> })` in `lib/db/test-utils.ts`. Declares versions 1-4 with no upgrade callbacks, writes the rows exactly as given (so `emoji`, `colorId`, `done`, junk values are all seedable), closes, and drops the singleton; the next `openDatabase()` runs `upgradeToVersion5`. No pin argument: v4 deleted that row. Read raw results with `(await openDatabase()).table("tasks").toArray()`. `seedVersion3DatabaseForTests` and `seedVersion1DatabaseForTests` **still work unchanged**: verified that a v3 seed with a pin on a task and a v1 seed both open at `verno 5` with `done: false`, the pinned task first, the pin row gone and no `emoji`/`colorId`. Only change: `LegacyTask` is now `Omit<Task, "done"> & { emoji: string; colorId: string }`, since `Task` no longer carries those two and legacy seeds still must. 014 criterion 17's emoji/colour clause cannot be observed through any seeder; use the v4 seeder and assert the strip.

**4. Preferences key.** `taskPanelVisible: boolean`, default `true` (`PREFERENCE_DEFAULTS`). Validator is inline in `sanitizePreferences` (last line of the returned object, `typeof record.taskPanelVisible === "boolean"`, else the default); `isPreferences` gains a final `&& typeof record.taskPanelVisible === "boolean"`. `PREFERENCE_VALUES` is unchanged for `theme` and `gaugeStyle` (its `Exclude` list now also names `taskPanelVisible`, because it has no value set). `PREFERENCES_VERSION = 2`. Store: setter `setTaskPanelVisible(visible: boolean)` (sanitises through `sanitizePreferences`), and `partialize` includes the key. `migratePreferences` is still a sanitise: a version-1 payload with non-default theme, gaugeStyle, background and mix comes back with all four intact and `taskPanelVisible: true` (checked with a throwaway test; persist then rewrites the entry at version 2). Engineering position preserved from ruling 6: the bump buys only the stored `version` marker, since `merge` already routes any payload failing `isPreferences` through `sanitizePreferences` on every rehydration; I do not consider the bump harmful. **`lib/preferences/boot-script.ts` needs nothing**: it reads only `state.theme` and does not paint the panel, so frontend must solve criterion 32's no-flash on its own (reading `taskPanelVisible` before first paint is a frontend question; the boot script was left untouched).

**5. Removed.** From `lib/db/index.ts`: `DEFAULT_PALETTE_COLOR_ID`, `PALETTE`, `isPaletteColorId` (value export line) and the type `PaletteColorId` (type export line). Deleted file: `lib/db/palette.ts`. Deleted from `lib/db/validation.ts`: `validateEmoji`, `validateColorId`, `isEmojiGraphemeCluster` (grep confirmed no consumer outside those two and `components/TaskForm.tsx`, which imports it directly from `@/lib/db/validation` at line 5; frontend removes that). `Task`/`TaskRecord`, `CreateTaskInput`, `UpdateTaskInput` no longer have `emoji`/`colorId`; `ValidationIssue["field"]` is `"title" | "eta"`. `createTask` builds the stored row explicitly so extra runtime keys are never stored; `updateTask` only copies validated `title`/`eta`.

**6. Red on the handoff tree.**
- Frontend-owned compile errors (typecheck): `components/TaskChecklistRow.tsx`, `components/TaskRow.tsx`, `components/TaskForm.tsx`, `components/TaskColorDot.tsx`, `components/task-palette-colors.ts` (the last two and `TaskRow.tsx` are scheduled for deletion).
- Test files with type errors: `lib/db/task-repository.test.ts` (imports deleted `./palette`, whole suite fails to load, 26 type errors), `lib/db/session-repository.test.ts` (6, seeds carry `emoji`/`colorId`), `lib/db/background-repository.test.ts` (1).
- Failing vitest, with reason: `components/TaskForm.test.tsx` 15 (renders the old form, frontend must change first); `lib/db/background-migration.test.ts` 1 and `lib/db/background-repository.test.ts` 1 (assert `verno` 4); `lib/preferences/preferences.test.ts` 31 and `lib/preferences/gauge-style.test.ts` 23 (whole-object equality and key lists lacking `taskPanelVisible`, and `version: 1` envelopes); `lib/audio/mix.test.ts` 2 (same key-list/whole-object equality). No failure is a behaviour regression: all are shape or version expectations.
- Not run: e2e, build.

#### Addendum: boot script and the no-flash contract (criterion 32), backend, after handoff
Scope was widened to `lib/preferences/boot-script.ts` by the orchestrator.
- **Export renamed `THEME_BOOT_SCRIPT` -> `PREFERENCES_BOOT_SCRIPT`** (also re-exported from `lib/preferences/index.ts`). One script, one `localStorage.getItem`, one `JSON.parse`, serving both keys. `app/layout.tsx:5,47` imports the new name (frontend's edit; not edited by me). The only remaining reference to the old name is `lib/preferences/boot-script.test.ts:10` (qa's).
- **New constants in `schema.ts`:** `TASK_PANEL_ATTRIBUTE = "data-task-panel"`, `TASK_PANEL_HIDDEN_VALUE = "hidden"`; the script is built from them.
- **Attribute behaviour:** on `document.documentElement`, `data-task-panel="hidden"` is set when the stored `state.taskPanelVisible` is exactly boolean `false`. In every other case the attribute is **removed** (`removeAttribute`), never left alone and never toggled: stored `true`, key absent (a version-1 payload), non-boolean value (`"false"`, `0`, `null`), no entry, blocked storage, malformed JSON, missing `matchMedia`. Absent therefore means visible. Idempotent: running it twice, or after a bfcache restore, leaves the same state (a stale `hidden` attribute is cleared when storage says visible). Never throws. Theme behaviour is unchanged (class toggled with explicit force).
- **Expected matrix for qa's `boot-script.test.ts`** (the existing file imports the old name and is red): (1) the theme matrix as before, stored theme x OS setting, against `resolveTheme`, now with the panel key absent, true and false each crossed in to prove they do not disturb the class; (2) panel: stored `taskPanelVisible` in {`false` -> attribute `hidden`; `true`, absent, `"false"`, `0`, `null`, `undefined` -> attribute absent}; (3) no entry, `getItem` throwing, `JSON.parse` failure (`{bad`) -> attribute absent, theme default, no throw; (4) a pre-set `data-task-panel="hidden"` is removed when storage says visible or is unreadable, and re-running the script yields the same result (idempotence); (5) parity with the store: `sanitizePreferences({taskPanelVisible: x}).taskPanelVisible === false` exactly when the script sets the attribute, for each x above. Verified by a throwaway test (deleted) over six stored shapes, each run twice.

### Frontend (complete)

antislop active: during (session override). No collision raised: the toggle reuses the retired trigger's treatment, the copy change is one sentence, and no new colour, shadow or motion was added.

**Gates (non-test files).** `npm run lint` on `app components widgets hooks`: 0 errors, 0 warnings. `tsc --noEmit`: no error in any non-test, non-e2e file. `npm run build` does **not** pass yet: it type-checks the test files, which still reference `emoji`, `colorId`, `THEME_BOOT_SCRIPT` and `task-palette-colors` (qa's). The compile step itself succeeds.

**Built, by criterion**
- Deleted (git rm): `components/TaskListDialog.tsx`, `TaskList.tsx`, `TaskRow.tsx`, `TaskColorDot.tsx`, `task-palette-colors.ts`. `CurrentTaskCard`'s dead import removed. `task-row-styles.ts` kept, comment rewritten (11).
- `components/TaskChecklistRow.tsx`: one row, eight controls in display mode: tick, drag handle (now an icon, `RiDraggable`, same accessible name `Reorder <title>`), up, down, `-1`, `+1`, Edit, Delete. Edit swaps the whole row body for `TaskForm`; Delete swaps the control line for the inline confirmation (Cancel autofocused, Escape cancels, focus returns to Delete; Escape in the edit form cancels and returns to Edit). Emoji, colour dot and the sr-only colour name are gone (12, 13, 17).
- `components/TaskChecklist.tsx`: the delete-focus bookkeeping from `TaskList.tsx:26-41` moved here, unchanged in behaviour (next row, else new last row, else the add form's title). Add form renders above the list, outside its scroll region, in the empty state too; not in loading or error (a write would fail there). Every write (add, edit, delete, `+1`, `-1`, tick, reorder) clears or sets the one `role="alert"` line (15). Add and edit also rethrow so `TaskForm` keeps its inputs and shows its own field message, so a non-validation failure on those two shows two messages (panel line and field). Chosen over swallowing the error, which would clear the add form's title on a failed write. Still exactly one `DndContext` (16).
- Empty copy: "Nothing here yet. Add your first task above." Names no control, no pressure (18).
- `components/TaskForm.tsx`: emoji input, colour fieldset and the `@/lib/db/validation` import gone; `TaskFormValues` is `{ title, eta }`. Layout compacted: title on one line, then count field + buttons on one wrapping line (the dialog's four stacked fields would have blown criterion 34).
- `components/TaskPanelToggle.tsx` in `widgets/BottomControls.tsx`: the one toggle, `.control-edge`, `aria-label="Task list"` constant, `aria-expanded`, 44 x 44, retired trigger's exact classes and `FaTasks`. It stays mounted, so focus never moves (29, 30). `.control-edge` appliers stay at 4.
- `widgets/TaskPanel.tsx` is now a client component reading `taskPanelVisible`; returns `null` once hydrated and hidden, so nothing of it is in the a11y tree or tab order (31). `app/layout.tsx` imports `PREFERENCES_BOOT_SCRIPT` (backend's rename had landed).

**No-flash mechanism (32).** Server render and first client render show the panel (the store holds the default until rehydration). The boot script sets `data-task-panel="hidden"` on `<html>` for a stored `false`; `app/globals.css` gained one unlayered rule, `html[data-task-panel="hidden"] [data-task-panel-root] { display: none }` (no token, no value in `:root`/`.dark`). After rehydration `TaskPanel` unmounts itself and keeps the attribute in step in a `useLayoutEffect`; without that sync, showing the panel again would be hidden by the stylesheet. The panel is `xl:fixed` (out of flow) and sits after the timer below xl, so hiding it moves nothing above it. Known residue: before rehydration the toggle reports `aria-expanded="true"` even when the stored state is hidden (a few ms; the panel itself is already hidden).

**Measured figures.** Provenance: Playwright chromium, DPR 1, light theme (default, system), no background stored, dev server on the shared `:3000`, three tasks added through the UI, the first with a 100-character unbroken `x` title. Rects are `getBoundingClientRect()` on the buttons themselves and on the checkbox's label cell (the 24 px input was not measured).
- Controls, display mode: every button 44 high; widths 46 (handle), 44, 44, 44, 44, 50 (Edit), 66 (Delete). Edit form: title input 44 high, count input 44, Save 44, Cancel 44. Confirmation: Cancel 44, Delete 44. Checkbox label cell is 44 wide by min-h 44. Nothing overlaps or leaves its row or the viewport at 320, 375 and 1280.
- Rows wrap to two button lines at all three widths (at 320 and 1280: handle, up, down, -1 on the first, then +1, Edit, Delete; at 375: five then Edit, Delete).
- Title width (100-char title): 156 px at 320, 211 at 375, 220 at 1280 (floors 120 and 180).
- No horizontal scroll: scrollWidth equals clientWidth at 320, 375, 1280.
- Empty panel at 1280 x 800: 352 x 234 (cap 240, 6 px slack). At 320 it is 254 tall in flow.
- Three tasks at 1280 x 800: 352 x 480 = 16.5% of the viewport (cap 25%); x 48-400, clear of the timer column (starts x 416) and the cluster (toggle at x 1032).
- Largest font-size inside the panel: 16 px; readout 60 at 320 and 96 at 1280, so the ratio is 0.27 and 0.17 (floor: below 0.5).
- Four tasks at 1280: the panel is capped (surface 272-752), the list scrolls inside it (scrollHeight 704 vs clientHeight 266), page height 800 equals the viewport. The add form takes about half of the 480 px cap, so the scroll window holds about one and a half rows. This is the density cost, not a bug.
- Toggle: 44 x 44 at 320 and 1280; click leaves focus on it; `aria-expanded` flips; reload keeps hidden (attribute `hidden` on html, 0 panels) and showing again clears the attribute. Six reloads with the panel stored hidden: a `MutationObserver` on `document` saw the panel with non-zero width in 0 of 6.
- Delete focus: deleting a middle row focused the next row's Edit; deleting the last row focused the new last row's Edit.
- Console: 0 errors or warnings across add, edit, delete, hide, reload, show at all three widths.

**Raised, not fixed.** Criterion 24 cannot be met by this task as written. At 320 x 568, scrollY 0, the timer Surface spans y 152-710 with an empty panel and 152-694 with one task, so it is **not** above the fold, and the panel is below the timer in flow so nothing the panel does can move it. This disagrees with 014's recorded Start y 341. I did not investigate which commit moved it; it needs the orchestrator or qa to compare against 014's measurement tree.

**Not measured by me (qa's).** Forced colours, axe, 8-reload flash with a stored "shown" panel, the group G contrast sweep, `rAF` and idle-frame checks, 50-task case at 320 px.

## Owner-ruled layout pass (2026-11-06): NOT a 015 criterion

Do not test this as part of 015. It is a separate, contained style pass ordered by the owner so that 015's measurement sweep is taken once, on the final layout. It answers the "Raised, not fixed" item above for the timer stack (a 013 consequence: CycleDots and the always-mounted focus-length field).

Phone only (below `sm`, 640 px); the `sm`-and-up geometry is unchanged (1280 x 800 timer surface y 120-606 empty and 120-682 with three tasks, before and after). No token or palette value moved, no `lib/**` or test file touched, nothing removed from the DOM.
- `app/page.tsx`: `main` `pt-4 gap-3` (was `pt-12 gap-6`, restored at `sm`); timer Surface `gap-2` (was `gap-4`, restored at `sm`).
- `components/PomotatoTimer.tsx`: stack `gap-3` (was `gap-8`, restored at `sm`).
- `components/TimerDisplay.tsx`: gauge wrapper `min-h-32` (was `min-h-40`; `sm:min-h-44` and up untouched).
- `components/FocusLengthInput.tsx`: below `sm` the label and input share one row (input `w-24`); the label is `min-h-11`, so both the label cell and the input are 44 high. The error line wraps to its own row.
- `components/CurrentTaskCard.tsx`: below `sm` the task title clamps to two lines (`max-sm:line-clamp-2`). Without it a 100-character unbroken title is five lines and pushes Start below the fold; the full title stays in the task list and in the accessible name. This is the one place text is visibly cut on a phone.
- Known residue: the "Press and hold Reset to confirm." hint is absolutely positioned under the controls and, once shown, extends about 36 px past Start (to y 569 at 320 x 568, one pixel past the fold). It is transient and was not part of the target.

## QA Report
Combined pass for tasks 014 and 015, run 2026-11-06 by qa. The same report is recorded in `docs/tasks/014-visible-task-checklist.md` under its QA Report.

- **Verdict: FAIL.** Not every criterion was run, and one measured figure fails criterion 34. The gates that can be run are green except the full e2e suite, which is red (128 failures, not triaged). This is not a PASS.
- **Scope actually run:** unit and grep guards for most of group A, B, C, E and I; a targeted e2e spec (`e2e/task-panel.spec.ts`) for 12, 13 (partial), 14, 20-23, 24 (Start only), 28, 29-31, 32 (hidden half), 33, 34-35; the full existing e2e suite once (before the new spec and one locator fix).
- **Not run at all:** group G (37-39, the painted sweep), 40 (forced colours), 41 (axe per state, not re-checked here), 42 (idle rAF/animation), 25 (50-task case), 36 (computed-style glow check), 15 (write failure line), 16 (keyboard and pointer drag re-run), 17 (Escape ownership), 13 delete-focus and Escape, 27 (only the unit preference test), 47 red-proofs for the v5 strip and the v1 payload, and 014's deferred items except the 8-reload hidden flash. Those are open, not passed.

### Criteria
| # | Result | Evidence and provenance |
|---|---|---|
| 1 | Not verified | Backend's Implementation Notes read; the six items are present. Not checked against shipped code beyond the tests below. |
| 2 | PASS (unit) | `components/token-foundation.test.ts` and `token-dark.test.ts` pass by value. No token edited (file diff not used). |
| 3 | PASS (grep) | `components/panel-only.guards.test.ts`: no `lucide-react` import; no panel-key reference under `lib/timer`, `lib/stats`, `lib/audio`, `app/stats`. `package.json` key sets not compared to backend's record (none recorded). |
| 4 | PASS (unit) | `lib/db/upgrade-v5.test.ts`: `CURRENT_SCHEMA_VERSION` is 5, reopen at `verno` 5, guard passes. |
| 5 | PASS | `tsc --noEmit` exit 0; `panel-only.guards.test.ts`: no palette export, `ValidationIssue` field is `"title" \| "eta"`, validators gone. |
| 6 | PASS (unit) | `upgrade-v5.test.ts`: v4 seed with five tasks, `emoji`/`colorId`/`done`/positions; raw rows lose both keys, other fields unchanged; sessions untouched; callback not re-run on reopen (stray row survives). |
| 7 | PASS (unit) | Same file: positions (offset +3) and `done` unchanged on every row. |
| 8 | PASS (unit) | Same file: v3 seed with pin on position 3 opens at 5, pin first, dense positions, `done` false, no `appMeta` pin, no retired fields. v1 seed likewise. |
| 9 | PASS (unit) | Same file: absent fields, `emoji: null`, `colorId: 0`, junk values, empty table: no throw; second open changes nothing. |
| 10 | PASS (unit) | `lib/db/task-repository.test.ts` v5 block: `createTask`/`updateTask` with runtime `emoji`/`colorId` store neither. `/stats` totals not re-pinned. |
| 11 | PASS (grep) | Three files absent; no import of them; no `role="dialog"` in the panel files. |
| 12 | PASS (e2e) | `task-panel.spec.ts`, 320 and 1280: exactly the eight named controls and one checkbox per row. 375 not run. |
| 13 | PARTIAL | Add clears the title and keeps focus: PASS. Edit focus return, delete confirmation focus, `+1` at 999 / `-1` at 0: NOT RUN. The dialog spec that covered them was deleted (see re-pointing), so these are uncovered. |
| 14 | PASS (e2e) | Empty line and add form render; add stores the task; empty line disappears; task appears in the panel. |
| 15 | NOT RUN | No write-failure injection. |
| 16 | PARTIAL | Exactly one `DndContext`, in `TaskChecklist.tsx` (grep guard). Keyboard and pointer drag NOT RUN. |
| 17 | NOT RUN | Escape ownership not tested. |
| 18 | PASS (grep) | No "pin" in panel-file copy; no "tasks button" anywhere in app code. Antislop review not done here. |
| 19 | PASS (build) | `npm run build` lists exactly `/`, `/_not-found`, `/settings`, `/stats`. |
| 20 | PASS (e2e) | 320, 375, 1280 with three tasks (one 100-char title): every button at least 44 x 44; the checkbox measured on its `label:has(input)` cell. Display mode only. Editing and confirming-delete modes NOT RUN. |
| 21 | PASS (e2e) | Same run: every control inside its row and the viewport; no two controls in a row intersect. Row and panel heights not logged. |
| 22 | PASS (e2e) | Same run: title element at least 120 px at 320 and 375, and at least 180 px at 1280 (asserted). Numeric widths not logged. |
| 23 | PASS (e2e) | 320, 375, 1280, three tasks, shown and hidden: `scrollWidth <= clientWidth`. The 50-task state NOT RUN. |
| 24 | PARTIAL | 320 x 568, scrollY 0, three tasks: Start box x 104.7, y 473, 50 x 44, bottom 517, inside 568. **The timer Surface was not measured**, so the criterion's "entire Surface above the fold" clause is not verified. |
| 25 | NOT RUN | 50-task case not run. |
| 26 | PASS (unit) | `lib/preferences/preferences.test.ts`, `gauge-style.test.ts`: `taskPanelVisible` default true, non-boolean falls back, other keys kept. |
| 27 | PASS (unit) | Same suites: v1 payload with non-default theme, gaugeStyle, background and mix keeps all four and takes the new key at its default; rewritten at version 2. The red-proof is NOT done (see 47). |
| 28 | PASS (e2e) | 320 and 1280: hide, reload (still hidden), show, reload (still shown), cleared storage returns to shown. |
| 29 | PARTIAL | Exactly one `button` named "Task list" on `/`. The `.control-edge` count `toBe(4)` (`control-edge-measure.spec.ts:123`) is not among the reported failures, but I did not run it in isolation. The file's four failing tests report `0 rows`, which points at its stale `button[aria-label="Your tasks"]` trigger selector. Not triaged. |
| 30 | PARTIAL | `aria-expanded` flips; focus stays on the toggle after click. 44 x 44 not re-measured here. |
| 31 | PARTIAL | Hidden: no panel region in the tree; Tab from the toggle does not land in the panel; no "Add task" control. The toggle's reachability at 1280 x 800 and 320 x 568 in flow not measured. |
| 32 | PARTIAL | Stored hidden, eight reloads, `MutationObserver` on `document`: panel painted in 0 of 8 (width > 0). Stored shown, the no-disappear half NOT RUN. Readout box equal at first paint and after 1 s at 320 and 1280; the timer Surface box not measured. |
| 33 | PASS (e2e) | 1280: the other preference values and the full non-preference localStorage are byte-identical across a toggle; `taskPanelVisible` flips false. |
| 34 | **FAIL (empty)** | **1280 x 800, default colour scheme (light), DPR 1, scrollY 0, no background stored, empty list: panel box 298 px tall. Cap is 240.** Frontend recorded 352 x 234 for the same state. The difference is 64 px and is material; not investigated, per the brief. Three tasks, same viewport: panel 416 x 544 = 22.1% of the viewport, under the 25% cap (PASS). Frontend recorded 352 x 480 (16.5%); also a material disagreement, both pass. |
| 35 | PASS (e2e) | Largest panel text 16 px against readout 60 px at 320 (0.27) and 96 px at 1280 (0.17). Floor is below 0.5. |
| 36 | NOT RUN | |
| 37-39 | NOT RUN | Group G not swept. No painted figure was taken. Criterion 39's two-part rule is untested. |
| 40 | NOT RUN | Forced colours not run. |
| 41 | NOT RUN here | Axe on `/` per state: the full run's `accessibility.spec.ts` had 2 failures (pin-era "3 tasks, one pinned" and "validation errors showing"). `dark-a11y-console.spec.ts` had 4 failures. Not triaged. |
| 42 | PARTIAL | Grep guard: no `setInterval`, `setTimeout` or `requestAnimationFrame` in the files named. Idle-frame and rAF-count check NOT RUN. |
| 43 | PARTIAL | Listed below. |
| 44 | NOT DONE | `e2e/uploaded-background-legibility.spec.ts` still measures the deleted swatch probe; 2 failures in the full run, not replaced. |
| 45 | PASS (unit) | `components/palette.tokens.test.ts`: `ALLOWED_LITERALS` is `{}`; the exemption is removed and the literal check runs on every file; FILES walk unchanged; `ALLOWED_RAW_UTILITIES` still `{}`. 215 tests pass. |
| 46 | PASS | No assertion phrased as a diff against HEAD in the files I touched. |
| 47 | PARTIAL | Red-proof done at unit level for the boot-script parity (see below). **Not done** for the v5 strip, the v1 preference payload, or the hidden panel persisting across reload. The last is e2e only, which is the only level that discriminates it. |
| 48 | PARTIAL | `npm run lint`: 0 errors, 18 warnings (014's note recorded 19; this is not the handoff-tree baseline). `npm run typecheck` (`tsc --noEmit`): exit 0. `npm run build`: exit 0, four routes. `npm run test`: 41 files, 1150 tests passing. `npm run test:e2e`: **FAIL**, see below. Zero console errors across the listed flow NOT verified (`dark-a11y-console` failed). |

### Full e2e run (scratch port 3100, one `out/` build, before the new spec and one locator fix)
- 671 tests across 45 spec files, 5 workers. **541 passed, 128 failed, 2 never reported.** The two were still running after about five minutes with no progress; I killed the run.
- Failures by file: `task-list-dialog.spec.ts` 37 (the file was deleted after the run started), `task-list.spec.ts` 21, `token-task-surface.spec.ts` 16, `sessions.spec.ts` 13, `dark-sweep.spec.ts` 9, `focus-surface-sweep.spec.ts` 6, `dark-theme-control.spec.ts` 4, `dark-a11y-console.spec.ts` 4, `control-edge-measure.spec.ts` 4, `focus-surface-behaviour.spec.ts` 3, `uploaded-background-legibility.spec.ts` 2, `uploaded-background-dialog-edge.spec.ts` 2, `dark-contrast.spec.ts` 2, `accessibility.spec.ts` 2, `uploaded-background.spec.ts` 1, `soundscape-mixer.spec.ts` 1, `settings-gauge-style.spec.ts` 1.
- **Not triaged.** Several are pin-era or dialog-era tests that need re-pointing (`sessions.spec.ts` names "pinned" throughout; `task-list.spec.ts` and `token-task-surface.spec.ts` drive the removed trigger). Others (`focus-surface-sweep`, `dark-sweep`) may be pre-existing. I did not check which failures predate 015.

### Re-pointing (criterion 43), each stated
- `e2e/helpers/task-list-dialog.ts`: rewritten. `openTaskList` now shows the panel (reads the stored `taskPanelVisible` first and clicks the toggle only once `aria-expanded` has settled to `false`), and returns the panel region. `taskPanel` and `taskPanelToggle` added. `closeTaskList` removed: its only purpose was to dismiss the modal, which no longer exists. About 44 call sites removed.
- Fifteen specs: dialog locators replaced with `taskPanel(page)`; the "Your tasks" trigger click replaced with `openTaskList(page)`. No assertion was loosened.
- `e2e/dark-contrast.spec.ts`: swatch test (criterion 19) retired, because the swatches are deleted. Dialog fill and scrim test (criterion 15) retired, because there is no dialog or scrim. The dialog's Close border check (criterion 24) removed, its Reset and Reload checks kept. The Tasks-pill fill test (criterion 25) re-pointed to the toggle, same assertions.
- `e2e/task-list-dialog.spec.ts` (36 tests): **deleted.** Its subject is gone. Behaviours for criteria 13 (delete focus, `+1` and `-1` bounds), 15 (write failure) and 17 (Escape) are **not re-homed**; they are open. This is the one place where coverage was removed rather than moved, and it stays open until a panel spec covers those three.
- Unit: `lib/db/task-repository.test.ts` (palette import removed; emoji and colour validation describes replaced by write-path tests; collect-all test narrowed), `session-repository.test.ts` and `background-repository.test.ts` (fields removed from task seeds; v1 seeds carry legacy fields), `background-migration.test.ts` and `background-repository.test.ts` (`verno` 4 to 5), `TaskForm.test.tsx` (emoji and colour cases replaced by a title-and-ETA test), `boot-script.test.ts` (renamed export, theme-by-panel matrix and parity added), `preferences.test.ts`, `gauge-style.test.ts`, `mix.test.ts` (version 2 and `taskPanelVisible` added to whole-object and key-list expectations), `palette.tokens.test.ts` (see 45), `token-foundation.test.ts` (swatch pin retired; reason in the file), `focus-cycle.guards.test.ts` (`TaskForm` live-region count 4 to 2, `TaskList.tsx` entry removed), `TaskListDialog.tokens.test.ts` replaced by `components/TaskPanel.tokens.test.ts`.
- New: `lib/db/upgrade-v5.test.ts` (9), `components/panel-only.guards.test.ts` (20), `e2e/task-panel.spec.ts` (20).

### Red-proofs
- **Boot-script parity (criterion 7 and 32 parity), unit level, PROVEN.** A throwaway test ran the parity check against a mutant script (the `=== false` branch widened to hide for the string `"false"`). The mutant fails for stored `"false"` and passes for `false`. The throwaway file was deleted.
- **v5 strip (criterion 6), NOT PROVEN.** Not broken and restored. The unit test asserts the stripped keys directly, so a no-op upgrade would fail it, but no break was run.
- **v1 preference payload (27), NOT PROVEN.**
- **Hidden panel persistence (28), e2e only.** Not proven by a break; the e2e spec is the only level that reaches it.

### Open items the brief asked me to record
1. **Double message on add or edit failure.** Not exercised; no write-failure injection was run. From the code (`TaskChecklist.tsx`), both the panel `role="alert"` and the `TaskForm` field message are set on a non-validation failure. This is frontend's stated design. Judgement against 015 criterion 15 is left open because criterion 15 itself is not run.
2. **`aria-expanded` pre-hydration.** Not re-measured. The helper's comment and frontend's note agree it reads `true` before hydration with the stored state hidden, and the panel is already hidden by then. The helper depends on this and waits for `false` before clicking.
3. **The "Press and hold Reset" hint.** Not measured; accepted by the owner, not re-argued.

### Measurement provenance
All figures above come from one Playwright chromium run per spec, DPR 1, no background image stored, scrollY 0 where stated. Theme is Playwright's default colour scheme (light). Dark is not measured for any figure in this report.

### Blockers for the owner
- **Criterion 34 (empty panel cap of 240 px) measures 298 px** at 1280 x 800 in the current tree. Frontend's 234 is not reproduced. Either the figure or the layout is wrong, and that needs an answer before any token or layout change, per the measurement-ordering rule. No token was touched.
- **Criterion 24's timer Surface is not above the fold at 320 x 568 by the frontend's own earlier note** (152-710 before the owner-ruled layout pass). The Start-only check passes. Whether the Surface now fits is unmeasured.
- The e2e suite is red at 128 failures, not triaged. The orchestrator should decide triage ownership before a re-run.

## QA Report (round 2, 2026-11-06, qa)
Round 2 of the combined 014/015 pass. Round 1 above is kept as written. This section is the current state.

- **Verdict: FAIL.** Not every criterion passes. One criterion (15) fails on the "one place" clause. The full e2e suite is red and was **not re-pointed to green** in this round. Budget ran out during triage, so the triage is partial.
- **Criterion 34: PASS**, by selector, per the 2026-11-06 ruling (see DECISIONS).
- **Re-homed and passing:** the dialog-era behaviours for criteria 13, 16 (keyboard and pointer drag) and 17 (Escape). They live in `e2e/task-panel-behaviour.spec.ts`.
- **Scope actually run this round:** `e2e/task-panel-behaviour.spec.ts` (22 tests: 21 pass, 1 fails on the 15 one-place clause), `e2e/task-panel-measure.spec.ts` (2 tests, both pass), `npx tsc --noEmit` (exit 0), `npx vitest run` (41 files, 1150 tests pass), `npx eslint` on the two new specs (exit 0), `npm run build` (exit 0, routes `/`, `/_not-found`, `/settings`, `/stats`), and a **partial** full e2e run (see below).
- **Not run this round** (open, not passed): group G (37-39, painted figures), 40 (forced colours), 41 (axe per state), 25 (50-task case), 36 (computed-style glow), 42 (idle rAF), 44 (legibility probe), 47 red-proofs (v5 strip, v1 payload, hidden-persistence), 32 shown-half flash check, 014 deferred items (touch drag, mid-session real write failure, `aria-expanded` pre-hydration window). Dark theme was not measured for any figure in this round.

### Provenance for every figure this round
Playwright chromium, scratch port 3100, one `out/` build from `npm run build` on this tree, served by `e2e/helpers/serve-out.mjs`. Viewport: `1280 x 800` where the criterion names it (criterion 34), otherwise the Playwright Desktop Chrome default (`1280 x 720`). Colour scheme: light (Playwright default). DPR 1. scrollY 0. No background image stored. Element selectors are stated per figure.

### Criteria, round 2
| # | Result | Evidence and provenance |
|---|---|---|
| 13 | **PASS** (e2e) | `task-panel-behaviour.spec.ts`, 7 tests, default viewport. Add clears the title field and keeps focus in it. A valid edit returns focus to `Edit <title>`. Delete confirmation: Cancel is focused on open; Escape cancels and focus returns to `Delete <title>`. Confirming a middle delete focuses `Edit` on the task that took the position (Charlie). Confirming the last row's delete focuses `Edit` on the new last task (Bravo). Confirming the only task's delete focuses the add form title field. `+1` is `disabled` at 999 and `-1` at 0 (buttons selected by accessible name within the `region` named "Task list"); a `+1` on Bravo (0 to 1) and the `-1` back to 0 both pass; stored `done` stays `false` throughout (raw IDB read, not the repository). |
| 15 | **FAIL** (one-place clause) | Seven writes tested. Add, edit, delete, `+1`, `-1`, tick, move up each: the panel's `role="alert"` line (`p[role="alert"]:not([id])` inside the region) shows the generic copy `Couldn't save that change. Your list is showing what is stored. Try again.`, and the stored value is kept (raw IDB read; checkbox reverts; count reverts). **The one-place clause fails for add.** A single rejected add produces **2** `role="alert"` elements in the panel (`getByRole('alert')` count 2, expected 1, test `one place: ...`): the panel line above, and the add form's field message `Couldn't save this task. Try again.` (`#add-task-title-error`). Edit goes through the same `runFormWrite` path (`TaskChecklist.tsx`), so it should double the same way; **edit was not asserted for the one-place count this round** (by code path only). Injection: `installWriteFailureSwitch` in the spec patches `IDBObjectStore.prototype.{add,put,delete,clear}` to throw while `window.__qaFailWrites` is true. Reads are untouched. Drag-reorder failure was not injected (move up stands for the reorder write). **Verdict for the owner:** criterion 15 says failures are reported "in one place"; the add form's second message is a second place. This needs a ruling. I did not fix anything. |
| 16 | **PARTIAL** (e2e) | Keyboard drag by Space pickup, ArrowDown, Space drop: order changes and is stored; focus stays on the handle. Enter pickup, ArrowUp, Enter drop: same. Pointer drag of row 1 onto row 3 (mouse down, move, up): `Bravo, Charlie, Alpha` shown and stored. **Note:** a Space drop pressed immediately after ArrowDown was dropped by dnd-kit; a 150 ms settle (the existing keyboard specs' pattern) fixed it. That is a test sequencing fact, not an app defect. Touch drag not run. Move up/down success path not re-run here. |
| 17 | **PASS** (e2e) | Escape during keyboard drag: order restored, focus on the handle, panel stays visible. Escape during an inline edit: edit cancelled, original value shown, nothing stored, focus on `Edit <title>`, panel visible. Escape on the delete confirmation: confirmation closes, task stays, focus on `Delete <title>`, panel visible. Escape with nothing in progress: URL unchanged, typed draft kept, panel visible, focus on `Edit` unchanged. |
| 34 | **PASS** (e2e, by selector) | `e2e/task-panel-measure.spec.ts`, 1280 x 800, light, DPR 1, scrollY 0, no background stored. Selector: the region named "Task list" > `:scope > [data-surface="solid"]`. **Empty list:** Surface **352 x 234** (cap 240, 6 px slack); section 416 x 298 (the section includes the outer padding `xl:p-4 xl:pb-12 xl:pl-12`, which is not capped per the ruling). **Three tasks:** Surface **352 x 480 = 16.5%** of 1280 x 800 (cap 25%). Surface does not overlap the timer surface (`[data-surface="frosted"]`, 448 x 490 at x 416, y 120) or the cluster toggle. Round 1's figure of 298 px was the section, not the Surface. |

### Triage of the full e2e suite (partial, stopped at budget)
- The full run (`npx playwright test -c e2e/scratch-3100.config.ts`, log in the qa scratchpad) was stopped by qa after **222 of 671** tests had reported: **182 passed, 40 failed**. It ran far slower than round 1 (several tests at 30 s each). Round 1's 128 failures included 37 from the deleted dialog spec, so it is not a like-for-like count.
- Failures so far, by file: `dark-sweep` 9, `sessions` 8, `focus-surface-sweep` 6, `dark-theme-control` 4, `dark-a11y-console` 4, `control-edge-measure` 3, `focus-surface-behaviour` 2, `dark-contrast` 2, `accessibility` 2. **No spec was re-pointed in this round.** Only the two new specs were added.
- **Root causes read from the failing test titles and the spec source, not from a full investigation:**
  - `control-edge-measure.spec.ts` (the "0 rows" failures): `TRIGGERS[0]` still uses the stale `button[aria-label="Your tasks"]`, which no longer exists. The `.first()` concern **is confirmed**: `load()` goes to `/`, so `[data-surface="solid"]` `.first()` resolves the panel Surface, and the probe labelled "header fill" reads the panel. The fix is to point the trigger at the toggle (`button[aria-label="Task list"]`) and to re-point or retire the header probe with a stated reason (criterion 43). Re-point not done; a full photograph sweep is needed to re-measure.
  - `sessions.spec.ts`: "with no task pinned" and related, i.e. pin-era flows. Not re-pointed.
  - `accessibility.spec.ts`: "3 tasks, one pinned" (pin-era) and "validation errors showing" (not triaged).
  - `dark-sweep.spec.ts`: probes named for `TaskRow`, `TaskColorDot`, and the dialog's Close and delete prompt. These components are deleted. Retire with reason, or re-point to the panel.
  - `dark-theme-control.spec.ts` ("clicking Dark writes exactly the envelope"): probably the preferences version literal (1 to 2) and the new key. Not checked.
  - `focus-surface-sweep.spec.ts` and `focus-surface-behaviour.spec.ts`: sweeps and "expected failures" blocks. Not triaged; may depend on the removed swatch or the trigger.
  - `dark-a11y-console.spec.ts`: console-error sweep across flows including "dialog" and "pinned". Not triaged.
- Round 1's note stands: 014's own counts (670 to 674 green at `bc5f4d2`) are the baseline. Every failure above is fallout from 014 or 015, not a pre-existing condition, per the owner's note.

### Rulings this round needs
1. **Criterion 15, one-place clause:** the add form's field message plus the panel line is two places. FAIL until ruled otherwise.
2. **Re-point ownership:** about 90 real e2e failures across roughly 17 specs, plus the `control-edge-measure` header probe, which needs a decision about what it should measure (criterion 43 wording). Who re-points, and does the suite need to be green before the reviewer runs?

### Red-proofs this round
- **None run.** The write-failure and Escape tests are e2e-only, because focus, alert and IDB state are what they read. The injection is the only source of the alert in those tests, so the alert tests cannot pass without it, but no break-and-restore was done. Criterion 47's three red-proofs (v5 strip, v1 payload, hidden-panel persistence) are **not** done.

### Re-pointed, stated
- `e2e/task-panel-behaviour.spec.ts` (new): criteria 13, 15, 16, 17 as above.
- `e2e/task-panel-measure.spec.ts` (new): criterion 34 by selector.
- No existing spec was re-pointed or weakened this round. The round-1 deletion of `e2e/task-list-dialog.spec.ts` is now re-homed for 13, 15 and 17 (not for the 37-test file as a whole; the dialog's own layout and focus-ring checks for a deleted surface stay retired).

### Open for the owner
- Criterion 15 one-place verdict.
- Criterion 34: passes by the ruling. Round 1's 298 px figure was the outer section, not the Surface, and is withdrawn.
- Suite red: triage incomplete. Next step is to re-point the 17 specs, starting with `control-edge-measure`, `sessions`, `accessibility` and `dark-sweep`.
- Round-2 open items: group G, 40, 41, 25, 36, 42, 44, 47 red-proofs, the 32 shown-half flash, and the `aria-expanded` pre-hydration window. None of these was measured.

## Review Findings
(Filled in by reviewer.)
- Verdict: APPROVE | CHANGES REQUESTED
- Findings:

## QA Report (loop 3, 2026-11-06, qa): e2e re-point, partial, budget reached
Scope was the owner's narrow brief: re-point the e2e suite to green, take no new measurements. **The suite is not green.**

- **Verdict: FAIL.** Full e2e run: **616 passed, 60 failed, 1 skipped, 677 total.** Baseline at the start of this loop (same tree, same port, same build): 585 passed, 92 failed. Net: 32 failures removed, 1 test retired-by-skip.
- **Command:** `npx playwright test -c e2e/scratch-3100.config.ts --reporter=line` on `:3100`, served by `e2e/helpers/serve-out.mjs` from one `npm run build` of this tree (`out/`). Wall time 8.4 min. Log: qa scratchpad `full-final.log`.
- **Unit gates were not re-run in this loop** (no unit file was edited in this loop). Round 2 figures stand: 41 files, 1150 tests passing.

### Specs re-pointed (and how)
- **`e2e/sessions.spec.ts`: 13 failing to 0 (18 of 18 pass).** The pin click is replaced with `makeCurrent(page, title)`, a helper that clicks "Move <title> up" until the row is first (a no-op when already first). The two-page flows call it on the right page (`page1` for TaskA and TwoTabTask, `page2` for TaskB). "focus run with no task pinned" is re-pointed to **"no current task"**: the current task is the first not-done row, so the two tasks are ticked done first. Assertions are unchanged.
- **`e2e/task-list.spec.ts`: 21 failing to 4.** Title lookups scoped to the panel (`taskPanel(page).getByText`, 9 places), because the Current Task card repeats the title (strict-mode duplicates). The "Pin / Current Task" describe is replaced by three "Current Task" tests: lone task is current (card text); ticking done moves Current Task (the "unpin" path); moving another row to the top changes it (the "switch pin" path). Pin blocks in the edit, persist and timer-increment tests are removed; those tests now assert the card or the row. Emoji reset test keeps its ETA assertion only. Focus-after-delete tests now expect `Edit <title>` (015 criterion 13), not the `Reorder` handle. IndexedDB error check reads the panel's error line. Two keyboard tests get a 400 ms settle before a second ArrowDown.
- **`e2e/control-edge-measure.spec.ts`: 4 failing to 2.** Trigger re-pointed to `button[aria-label="Task list"]`. The header is now the HeaderNav root (`xpath=//h1/../..`), not `[data-surface="solid"]`.

### Assertions retired, with reasons
1. **`task-list.spec.ts` "shows validation error for invalid emoji"**: `test.skip`. The emoji field and its validation are deleted (015 criteria 3, 5).
2. **`task-list.spec.ts` emoji lines in "resets emoji and ETA"**: emoji assertions removed; ETA kept. Same reason.
3. **`control-edge-measure.spec.ts` "header fill" probe and the chip-ring-on-header-fill equality**: retired per the owner ruling 2026-11-06. The header carries no panel, so there is no header fill to read; the old selector read the task panel. Parked, not abandoned: re-point to the two-tone glyph halo when that ships. Both the ratio and the painted-pixel checks still use the pixel inside the ring.
4. **`task-list.spec.ts` pin tests**: reworded, not deleted. The pin button is gone, so the assertions moved to the Current Task card and to the tick-done and move-up paths.

### Deferred (needs a measurement pass, not re-pointed)
- **`dark-sweep.spec.ts` (9 failing)**: painted sweeps. Failing probes name deleted components (TaskRow, TaskColorDot, dialog Close). Not re-pointed in this loop; the retire-with-reason work is still to do.
- **`token-task-surface.spec.ts` (16 failing)**: painted pairs, target-size and axe on the dialog, console on the dialog, and the pinned-state paints. Not re-pointed.
- **`dark-theme-control.spec.ts` (4 failing)**: including #3 (line 180), an exact envelope with `version: 1` and no `taskPanelVisible`. The version is now 2 with the new key, so this is a trivial literal re-point I did not reach. Others are the 038 layout and 047 transition sweeps.
- **Group G, 40, 41, 25, 36, 42, 44, 47 red-proofs, the 32 shown-half flash, and 014's dark-theme figures**: untouched, per the brief.

### Remaining failures by file (60 total)
| File | Failing | One-line cause |
|---|---|---|
| `token-task-surface.spec.ts` | 16 | Painted contrast sweeps, dialog target-size and axe, dialog console, and pinned-state paints. Dialog-era, measurement-deferred. |
| `dark-sweep.spec.ts` | 9 | Probes for deleted TaskRow, TaskColorDot and dialog; measurement sweep, deferred. |
| `focus-surface-sweep.spec.ts` | 5 | Painted sweep and "expected failures" block; not triaged. |
| `uploaded-background-legibility.spec.ts` | 4 | Adversarial-image floors and the deleted swatch/fill probe (criterion 14, 44); not triaged. |
| `dark-a11y-console.spec.ts` | 4 | Console-error sweep over flows that include the dialog and the pin; not triaged. |
| `dark-theme-control.spec.ts` | 4 | Version literal (line 180) and the 038 and 047 sweeps; see above. |
| `task-list.spec.ts` | 4 | Keyboard drag (383): second ArrowDown after a move is not applied, even with a 400 ms settle. Persist-order (911): same keyboard path, passes in isolation. Current Task tick and move (119, 133): pass in isolation (6/6 in the group), fail under full-suite load; the added-row wait may be too short. |
| `uploaded-background-dialog-edge.spec.ts` | 2 | Task dialog no longer exists (dialog-edge probe); not re-pointed. |
| `accessibility.spec.ts` | 2 | "3 tasks, one pinned" (pin-era) and "validation errors showing" (not triaged). |
| `dark-contrast.spec.ts` | 2 | Pinned-hover border and fill on the pinned button (pin-era); not re-pointed. |
| `focus-surface-behaviour.spec.ts` | 2 | Console-error flow includes "task dialog" and "remove"; not triaged. |
| `control-edge-measure.spec.ts` | 2 | **Real criterion 14 figure failure**, not a selector fault: chip focus ring reads about 1.27:1 against the 3:1 floor on the grey and white images (light and dark). Not fixed; measurement pass. |
| `task-panel.spec.ts` | 1 | Criterion 34-35 at line 277 measures the outer section (298 px) against the 240 px Surface cap. The round-2 ruling measures the Surface (352 x 234). **This spec is QA's own and needs the selector moved to the Surface; left for the owner's measurement pass.** |
| `settings-gauge-style.spec.ts` | 1 | Stored-entry key set (criterion 24); not triaged. |
| `soundscape-mixer.spec.ts` | 1 | Stored-entry size and write-count (criterion 6); not triaged. |
| `uploaded-background.spec.ts` | 1 | Stored-entry bytes check (criterion 3); not triaged. |

### Criterion 15 (one place)
`e2e/task-panel-behaviour.spec.ts` is **not** in the failure list, so the double `role="alert"` assertion now passes at 1. I did not edit that assertion.

### Not verified, open
- Group G, 40, 41, 25, 36, 42, 44, 47 red-proofs, the 32 shown-half flash, the 014 touch and pointer drag and `aria-expanded` pre-hydration items: not run, as the brief directed.
- **Red-proofs for the re-pointed guards: none run in this loop.** The re-points are assertion-for-assertion moves, so no break-and-restore was done.

## QA Report (re-point pass, 2026-11-10, qa)

**Verdict: FAIL on the current tree.** The re-point work is done for every file the brief listed, but the final full run is 504 passed / 167 failed / 1 skipped (672). About 157 of the 167 come from one uncommitted app change (see "needs an app fix", item 1), not from the re-points. Re-pointed tests that were green on the build in place when each was run are listed per file below.

### Measured figures (same command, one build, `serve-out` on :3100)

- Build: `npm run build` (run once before the baseline, and once more before the final run, so the final run includes the current `widgets/TaskPanel.tsx`).
- Baseline, re-measured this session: `npx playwright test -c e2e/scratch-3100.config.ts --reporter=line` gave **614 passed / 62 failed / 1 skipped (677)**. The brief's 613/63 was an earlier figure; this is the one I ran.
- Final, current tree: **504 passed / 167 failed / 1 skipped (672)**. The 5-test drop is retirements (3 in token-task-surface, 2 in uploaded-background-dialog-edge).
- The coordinator's 649 / 22 figure was not reproduced. It predates the `widgets/TaskPanel.tsx` change, which is in the tree at 10:07 and was included in my 10:32 build.
- `npm run test`: **1150 passed / 41 files**. `npm run typecheck`: exit 0. `npm run lint`: 0 errors, 20 warnings, all in test files and none added by this pass.

### Per-file table (before = baseline 614/62; after = final run, current tree)

| File | Before | After | What was done |
|---|---|---|---|
| token-task-surface.spec.ts | 16 | 12 | Dialog and `addTask` scoped to the panel (the timer card repeats the title). Pin-state, swatch and pin-contrast tests retired. Criterion 31 re-pointed to the current row's `aria-current` and "Current task" label. Trigger re-pointed to the `Task list` toggle. Console/hydration/axe kept on the panel. 3 tests retired. Remaining 12 are the region-name regression. |
| dark-sweep.spec.ts | 9 | 7 | Ring list: `Your tasks` re-pointed to the panel toggle; dialog Close, emoji field, swatches, colour dot retired. Card test: pin removed, empty copy updated. Criterion 28 offset expectation changed to 2 px for every control, per e9380df. Current figures passed. |
| dark-a11y-console.spec.ts | 4 | 8 | Criterion 60 flow: Pin step removed, title scoped to the panel. Before this pass its two flows passed (12/12 on a run before the TaskPanel change). Remaining 8 are the region-name regression. |
| accessibility.spec.ts | 2 | 6 | "one pinned" → first open row is the current task (`aria-current`); "validation errors" → empty title (emoji field gone). Both passed (17/17) on a run before the TaskPanel change. Remaining 6 are the region regression. |
| dark-contrast.spec.ts | 2 | 6 | Criterion 29 pinned hover border retired. Rest border re-pointed to the current row (`--primary`), passed 2/2 before the TaskPanel change. Other 6 are the region regression. |
| focus-surface-behaviour.spec.ts | 2 | 2 | Criterion 30 "task dialog" step → panel toggle hide/show. Passed 8/8 before the TaskPanel change. Remaining 2 are the region regression. |
| uploaded-background-dialog-edge.spec.ts | 2 | 0 | Whole file retired (see below). |
| control-edge-measure.spec.ts | 3 | 3 | Header containment assertions retired. Chip and Stats rows now read `max(ring, flank)` against the photograph beyond the flank, plus ring-vs-flank (half 2). Triggers gained border-vs-halo (half 2). Ring row is `ceil`, with alignment asserted. 1280 px and 320 px light pass; 320 px dark fails for an app reason (item 3). |
| uploaded-background-legibility.spec.ts | 4 | 4 | Wordmark: halo read via computed `-webkit-text-stroke-color`; per-pixel `max(ink, halo)` against the photograph; ink-vs-halo asserted (half 2). Ground is the top and left wordmark rings. Swatch interior retired. Passed 20/20 before the TaskPanel change. Remaining 4 are the criterion 20 axe scans (light and dark, 320 and 1280); they passed before the TaskPanel change and were not individually re-checked against the regression. |
| focus-cycle.spec.ts | 1 | 0 | Criterion 21 asserts outcome (no painted shadow or border: alpha 0 or `none`), not `box-shadow: none`. Passed 23/23. |
| task-panel-behaviour.spec.ts | 0 | 21 | Not in baseline. Checkbox write-failure step uses `click` and asserts the revert. Passed 21/21 before the TaskPanel change. Current failures are the region regression. |
| task-list.spec.ts | 4 | 51 | `:119` and `:133` (add race) fixed: `addTitle` waits on the row. Both pass 3/3 repeats. `:383` and `:911` are deterministic app defects, not flakes (item 2). The rest of the 51 are the region regression. |
| settings-gauge-style, soundscape-mixer, uploaded-background, dark-theme-control:174 | 4 | 0 | Group 2 re-pointed to version 2 and the `taskPanelVisible` key. Passed 4/4 (targeted). |
| task-panel.spec.ts | 1 | 20 | `:277` is out of scope (not touched). The 19 new failures are the region regression. |
| dark-theme-control.spec.ts | 4 | 4 | 174 re-pointed (above). 38 (2) and 47 (1) out of scope. Remaining one is criterion 6, IndexedDB, likely the region regression (not individually re-checked). |
| focus-surface-sweep.spec.ts | 5 | 5 | Not touched (out of scope). 4 painted sweeps and `:634` (item 4 below). |
| sessions.spec.ts, task-panel-measure.spec.ts, dark-native-ui.spec.ts | 0 | 18 | Not in baseline. sessions.spec.ts was checked in isolation: 14 failed, 4 passed, all on the region-name error. The other two files were not individually checked, and are assumed to share the cause. |
| **Total** | **62** | **167** | |

Note on attribution: 157 failures carry the exact error `getByRole('region', { name: 'Task list' ...}) element(s) not found`. The other 10 are listed under "deferred" and "app fix" below. The per-file "after" column is therefore mostly the regression, and it is not a measure of the re-points.

### Retired, with reason

- **Task dialog and pin (commit 4ca861e, "Panel-only task surface")**: `token-task-surface` pinned-paint test, pinned aria-pressed test (replaced by the current-row test), swatch checked-ring test, swatch contrast sweep. `dark-sweep` dialog Close, emoji field, swatch loop, TaskColorDot section. `dark-contrast` pinned hover border (the rest border was re-pointed). `dark-a11y-console` and `focus-surface-behaviour` pin and dialog steps. `accessibility` "one pinned" pin click.
- **Colour swatches and emoji (commit 4ca861e)**: `uploaded-background-legibility` swatch interior (criterion 14). `dark-sweep` swatch loop and emoji field. `token-task-surface` swatch sweep.
- **Dialog-edge file, `uploaded-background-dialog-edge.spec.ts` (commit 4ca861e)**: both tests retired. The file no longer uses `test.fail`; it pins bounds, which the brief did not describe. The situation is neither "fix landed" nor "deferral still applies to a live surface", because the task dialog it measured is gone. The header of the file records the open question. See "needs an app fix", item 5.
- **Chip `-5px` offset (commit e9380df)**: `dark-sweep` and `dark-contrast` expected `-5px` for the theme chip; e9380df deleted the inset on purpose. Re-pointed to 2 px for every control.
- **Chip inside header border box (owner ruling 2026-11-06)**: `control-edge-measure` containment assertions. Their premise died with the header panel.
- **Header fill probe (owner ruling 2026-11-06)**: already retired in the spec. Its PLAN re-point is now done through the halo flank.

### Deferred to the measurement pass

- `focus-surface-sweep.spec.ts` painted sweeps (lines 565, 608): 4 failures, the wordmark "ring side has no pixel inside its surface". Out of scope per the owner.
- `focus-surface-sweep.spec.ts:634` (criterion 14 theme focus, dark white): **the block's mechanism does not do what its title says.** The describe is titled "recorded as expected failures (the suite stays green; each flips when healed)". Only the criterion 17 test inside it uses `test.fail`. The 634 test is a plain `test()`, so it is a hard red at 2.058:1. Its premise ("the chip's ring sits inside the header, so its ground is the header fill") is stale. The block has been misreporting its own status. Not edited (out of scope).
- `dark-theme-control.spec.ts` criterion 38 (2) and criterion 47 (1): out of scope.
- `task-panel.spec.ts:277`: out of scope. The 2026-11-06 section-vs-Surface question stays for the sweep.
- `task-panel-measure.spec.ts` (2): panel bounds measured on the Surface. Figures unverified on the current tree because of the region regression.
- Wordmark ground definition (`uploaded-background-legibility`): the ground is now the top and left photograph rings only, because the bottom ring touches the theme chips' flanks and the right ring touches the Settings and Stats links. The figure passes, but choosing that ground is a measurement call and should be confirmed in the sweep.

### Needs an app fix, not a test fix

1. **Uncommitted `widgets/TaskPanel.tsx` removes the panel heading but not its reference (~157 failures).** The diff deletes `<h2 id={TASK_PANEL_HEADING_ID}>Task list</h2>`. The `<section aria-labelledby={TASK_PANEL_HEADING_ID}>` still points at that id, so the region has no accessible name, and `getByRole('region', { name: 'Task list', exact: true })` finds nothing. Repro: `npx playwright test -c e2e/scratch-3100.config.ts e2e/sessions.spec.ts --reporter=line`. Expected: 4 passed. Actual: 14 failed, error "element(s) not found" on the Task list region. Fix options for the frontend: restore the visible heading, or give the section an accessible name another way. Also a likely axe `aria-valid-attr-value` violation, not checked.
2. **Keyboard reorder moves only one position per drag (task 002 criterion: "Up/Down arrow keys move it one position at a time").** Deterministic, not a timing race. Repro: `npx playwright test -c e2e/scratch-3100.config.ts e2e/task-list.spec.ts -g "moves task with arrow keys" --repeat-each=3` (fails 3/3 on a fixed-tree run, before the region regression). Observed: after one ArrowDown the order is `[Cipher, Seraph, Whisper]`; a second ArrowDown changes nothing, at 0, 300, 800 and 1500 ms, and the live region stays at "position 2 of 3". `task-list.spec.ts:911` ("persists task order after reload") depends on the same behaviour. Both tests are correct and stay red.
3. **Theme chip focus ring at 320 x 720 dark is overlapped by the wordmark's glyph halo.** Cause (diagnosed, not guessed): at 320 px the wordmark `h1` (`.glyph-halo`, a 2 px `--popover` stroke) paints over the chip's outer ring row and its flank band. The ring row reads 142,98,50 (a 59% blend with the halo colour 30,22,16). The rows above are also contaminated, so there is no fully covered ground row. This is not a sampling fringe, so the `ceil` change could not fix it. Three `control-edge-measure` failures remain (dark, white, black, grey 50%, 320 px). Their assertion is the painted-ring integrity check, and it stays red. The 1280 px and 320 light runs pass. Layout decision needed (wordmark or chip spacing at 320).
4. **The `focus-surface-sweep.spec.ts:634` block** (see deferred). Test-file label fix, not an app fix, but it needs a decision on whether the block should use `test.fail`.
5. **`--dialog-edge` and `SoundscapeDialog` (owner question).** The token is still `var(--border)` in light (`app/globals.css:116`), so the light sub-floor PLAN records has not been fixed. The token is still consumed by `components/ui/dialog.tsx`, which `components/SoundscapeDialog.tsx` renders, so the sub-floor may still stand on the soundscape dialog. The task dialog it was recorded against is deleted. Decision needed: re-point the file to the soundscape dialog (new painted figures, measurement pass), or close the PLAN item as moot for the task dialog. Routed to the owner per the coordinator.

### Verification notes

- Red-proofs: not performed in this pass. The re-points are selector and subject changes, proved by green runs of each live subject. The new half-2 assertions (control-edge rows, legibility wordmark) are new guards and were not red-proofed by breaking the halo; that is a gap to close in the measurement pass.
- Targeted runs before the region regression: token-task-surface 17/17, dark-sweep 13/13 (+6 criterion 28 after the offset fix), dark-a11y-console 12/12, accessibility 17/17, dark-contrast targeted 2/2, focus-surface-behaviour 8/8, legibility 20/20, focus-cycle 23/23, task-panel-behaviour 21/21, task-list `:119` and `:133` 3/3 repeats. Settings, soundscape and uploaded-background Group 2: 4/4.
- Unit 1150/1150, typecheck exit 0, lint 0 errors.
- Scratch-only diagnostic specs (`e2e/zz-*.spec.ts`) were created and deleted during the pass. None are committed.
