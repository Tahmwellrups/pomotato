# An always-visible task checklist at the lower left, with a real done tick and no pin — history log

Appended by frontend/backend/qa/reviewer/orchestrator after implementation began.
The task's goal, scope and acceptance criteria are in [../014-visible-task-checklist.md](../014-visible-task-checklist.md).

## Implementation Notes
(Filled in by backend, then frontend, as they build. Criterion 1 lists what backend must record **before
frontend starts**; criterion 2 gates group I.)

### Backend (complete, frontend may start)

**Field name: `done: boolean`** on `Task` (and `TaskRecord`). Not indexed. No rename proposed.

**Public API (`@/lib/db`)**
- Added: `setTaskDone(id: string, done: boolean): Promise<Task>` and `InvalidDoneValueError`.
  Returns the updated `Task`; setting the held value writes nothing and returns the record unchanged;
  throws `TaskNotFoundError` for an unknown id and `InvalidDoneValueError` for a non-boolean (nothing
  written). `ValidationIssue["field"]` was deliberately NOT widened (it would break `TaskForm`'s
  `Record<keyof TaskFormValues, string>` indexing), hence the separate error class.
- `createTask` assigns `done: false`; `CreateTaskInput`/`UpdateTaskInput` have no `done`; `updateTask` never touches it.
- `listTasks()` returns `done` on every row, still sorted by `position` only (done rows stay in place).
- `getCurrentTask(): Promise<Task | null>`: first task in `position` order whose `done` is false; `null` for an
  empty list or all done. Reads `tasks` only, never `appMeta`, never throws for data reasons. `hooks/use-current-task.ts` needs no change.
- **Removed from `lib/db/index.ts` (and deleted from `task-repository.ts`): `pinTask`, `unpinTask`.**
  `AppMetaRecord` stays exported (comment records the retirement). `normalizeTask` and `firstNotDone` are
  exported from `task-repository.ts` only, not from `index.ts`.
- `deleteTask` transaction is `tasks` only; renumber kept. `logCompletedSession` resolves the current task
  (same rule, via `firstNotDone`) inside its one `[sessions, tasks]` transaction; `&runId` dedup, 999 clamp,
  focus-type check unchanged. No current task writes `taskId: null`/`taskTitle: null`, increments nothing.
- Read-path normalization: every read through the repository maps a missing/non-boolean `done` to `false`
  (`normalizeTask`); a later write persists the normalized value.

**Frontend consequence:** `components/TaskList.tsx` still imports `pinTask`/`unpinTask`, so `npm run typecheck`
is red until frontend removes them. Nothing else outside `lib/db/` and test files fails to compile.

**`.version(4)` block as written** (`lib/db/database.ts`):
```ts
this.version(3).stores({ backgrounds: "id" });   // literalized, was CURRENT_SCHEMA_VERSION
this.version(4)
  .stores({})
  .upgrade(upgradeToVersion4);
if (this.verno !== CURRENT_SCHEMA_VERSION) throw new Error(...);   // the guard
```
`CURRENT_SCHEMA_VERSION = 4`. Versions 1 and 2 are untouched. An empty `.stores({})` is the Dexie form for a
version that only carries an upgrade (tables carry forward; no store is created, dropped or reindexed).
The guard relies on `Dexie.verno` being the highest declared version at construction time, so it throws on the
first `getDatabase()` if the constant and the highest `.version(n)` literal disagree (verified in a scratch test).
QA may additionally scan the source for literals.

**`upgradeToVersion4`, step by step** (one Dexie upgrade transaction; abort on throw leaves v3):
1. Read all `tasks` rows; order by `position` ascending, rows with a missing/non-finite `position` after valid
   ones, ties (duplicates) by `id`.
2. Read `appMeta["pinnedTaskId"]`. A non-string value, no row, or an id with no matching task = no reorder.
   A pin at index > 0 moves that task to the front; a pin at 0 changes nothing.
3. `bulkPut` every row with `done: false` and `position` = its index (dense 0..n-1; a no-op on clean data).
4. Delete the `appMeta["pinnedTaskId"]` row. The table stays declared. `sessions` and `backgrounds` are never touched.
Idempotent (a second run on its own output changes nothing) and tolerant of empty tables.

**Seeding a version-3 database in a test:** use the new helper in `lib/db/test-utils.ts`:
```ts
await seedVersion3DatabaseForTests({
  tasks: [{ id: "a", title: "A", emoji: "x", colorId: "x", eta: 1, completed: 2, position: 0 }, ...], // raw rows, no `done`
  pinnedTaskId: "c",            // string = pin row; null = row with value null; omit/undefined = no appMeta row
  sessions: [...],              // optional SessionRecord[]
  backgrounds: [...],           // optional raw rows
});
const db = await openDatabase();  // runs the upgrade; db.verno === 4
await db.table("tasks").toArray(); // raw stored rows (assert done === false here, not via the repository)
```
It deletes the current DB, writes with a bare `Dexie(DATABASE_NAME)` declaring the frozen v1/v2/v3 store strings,
closes it, and drops the singleton, so the next `openDatabase()` is a genuine 3 to 4 upgrade. Rows are written
verbatim, so hand-written bad rows (`done: "true"`, missing/duplicate `position`) can be seeded. Also added: `LegacyTask`
type, and `seedVersion1DatabaseForTests` now accepts rows without `done`.

**Existing `lib/db` tests that fail because behaviour genuinely changed (not edited; qa re-points them):**
- `task-repository.test.ts` (13): every case importing/calling `pinTask`/`unpinTask`, the `getCurrentTask`
  pin/dangling-pin cases, and "delete task transaction clears pin atomically".
- `session-repository.test.ts` (6): `pinnedTaskWithCompleted` and the cases that pin to decide `taskId`.
- `background-migration.test.ts` (1): "version 2 rows survive the upgrade to version 3" imports `pinTask` and asserts `verno` 3 (now 4; the upgrade also deletes the pin row and adds `done`).
- `background-repository.test.ts` (1): calls `pinTask`.
Plus `tsc` errors from the same `pinTask` imports in those four files. All other `lib/db` tests pass.
Gates: `npm run lint` 0 errors (21 warnings, baseline); `typecheck` red only on `components/TaskList.tsx` and the test files above.

### Frontend (complete; typecheck and build are red only on test files, see below)

antislop active: during (session override). Design Read: cozy Pomodoro dashboard, existing warm-token language, ENERGY 1 / RHYTHM 1 / MOTION 1; the timer stays the one focal point. No R-37 collision was raised: no owner ruling in the task asks for a named slop pattern. Reasons written down for the purpose-gate items: the "Current task" chip is a real status label (R-09), reusing the `--accent` pair that marked the old pinned state, so no colour is added; no glow, no extra shadow beyond 012's solid surface (R-12/R-13); no icon was added (the reorder control keeps its text, the arrows are the existing characters).

**Files.** New: `widgets/TaskPanel.tsx` (region, heading, solid Surface, positioning), `components/TaskChecklist.tsx` (the panel's list and the app's only `DndContext`), `components/TaskChecklistRow.tsx` (checkbox, marker, handle, up/down), `components/task-row-styles.ts` (the one secondary-button class string, shared by both rows). Changed: `components/TaskList.tsx` and `components/TaskRow.tsx` (now the dialog's: add/edit/delete/+1/-1, no drag, no pin, no move), `components/TaskListDialog.tsx`, `components/CurrentTaskCard.tsx`, `app/page.tsx`. Untouched by design: `hooks/use-current-task.ts`, `hooks/use-tasks.ts`, `widgets/HeaderNav.tsx`, `widgets/BottomControls.tsx`, `app/globals.css`, everything in `lib/`.

**Breakpoint: `xl`, not `lg` (criterion 29 permits a recorded reason).** The timer column is `max-w-md` centred, so at 1024 it starts at x 288. A panel pinned lower-left with its 48 px margin and 352 px of content ends past 400, which overlaps the timer Surface. At 1280 the panel's box ends at x 416 exactly where the column begins (its own 16 px right padding is the gap). Below `xl` it is ordinary content after the timer, so the bottom-right cluster (still `lg`) and the panel never need to agree. `app/page.tsx` `pb-28` is unchanged: the fixed panel sits beside the column, not under it, and reserves nothing. Order in `<main>` is header, timer, panel, cluster, so tab order matches visual order at both widths. Measured: 1280x800 the panel box is x 0-416, y 256-800, the timer is x 416-864; 320x568 Start's bottom edge is y 341 before any scroll; no horizontal scroll at 320 or 1280. **[Orchestrator correction, 2026-11-06: the y 341 figure is WRONG. Re-measured at 320x568, DPR 1, empty task list, `scrollTo(0,0)`: the timer Surface spans y 152-710 and the Start row is top 657 / bottom 701. Do not quote y 341. See DECISIONS 2026-11-06 'A recorded figure said the timer fit on a phone'.]**

**Criteria I believe are satisfied (frontend half), by piece.**
- 23: native `<input type=checkbox>` inside a `<label>` that owns the title, so the name is the title. The input draws 24 px inside a 44x44 cell and the label is the full-width target: QA should measure the label/cell, not the input's own box (`input.getBoundingClientRect()` is 24 px). Probed: every `input, button` in the panel, measured through its label where it has one, is at least 44x44 at 320 and 1280.
- 24: the card (`useCurrentTask`) and the panel marker (first not-done of `useTasks`) agree after tick, untick, reorder in my probes with no reload. **But see "Pre-existing live-query bug" below: that holds only when no background image is stored.**
- 25, 26, 52: done = native checked mark plus `line-through` and `text-muted-foreground` on the title only. The `completed / eta` count sits outside the label, never struck, never dimmed by done. Forced-colors screenshot: checked box filled with its mark, unchecked empty, strike and chip text visible.
- 27: ticking calls only `setTaskDone`; nothing touches the timer store.
- 28: the box shows the tick immediately, then follows the stored value; a rejected write clears it back to the stored value and the panel shows a `role="alert"` line ("Couldn't save that change..."). Reorder failures (drag, up, down) use the same line. Not exercised against a real mid-session failure, only by reading the code path.
- 29, 32, 33, 34: see Files above. Panel is `<section aria-labelledby>` named by the visible `<h2>` "Task list", the only landmark added; the list is `<ul aria-labelledby>`. At `xl` the Surface has `max-h` `min(30rem, 100dvh - 10rem)` and the list scrolls inside it (the scroller has 6 px side/4 px vertical padding so focus rings are not clipped). The 100-character unbroken title wraps inside the label (163 px wide at 1280, never 0) and nothing overflows.
- 30, 43, 45: the marker and card both come from "first not-done", so a done task dragged to the top is not marked. Move up/down are disabled at the ends. `DndContext` appears once, in `TaskChecklist.tsx`; the dialog has zero sortable nodes (probed).
- 31: `<Surface kind="solid">`, nothing restated. No `backdrop-filter`.
- 35: both `role="status"` loading lines are gone (card, dialog list); the panel's loading and empty lines are plain `<p>`. The panel's load-error line keeps `role="alert"`. New live-region count is in the test-fallout list below.
- 36: the list renders from `tasks.length === 0` for the empty line, not from `orderedIds`, and the id sync stays a `useLayoutEffect`, so the empty line cannot paint while tasks exist. Not run through the 8-reload MutationObserver test.
- 37: blocked says close other Pomotato tabs; unavailable says storage may be blocked and does not mention a tab.
- 38: the panel is rendered by `app/page.tsx` only.
- 40-42: keyboard path verified in a real browser (below).
- 44: the checkbox, up and down are siblings of the handle, not children; only the handle carries dnd-kit's listeners. Not tested with touch.
- 46, 47: the dialog's own structure and focus code are unchanged. The one change is the Escape selector (below).
- 48: dialog description now "Tick and reorder on the page; the first unfinished task is current." Card empty state "No unfinished tasks. Add one, or untick one in your list." Panel empty "No tasks yet. Add one with the tasks button." The word "pin" appears in no rendered text. The trigger's name is unchanged ("Your tasks"; it never named the pin); the dialog title is unchanged too. The panel heading is "Task list", chosen so the heading and the trigger do not share a name.
- 49: the dialog's delete-focus target used to be the drag handle, which the dialog no longer has. It is now the Edit button of the row that took the deleted position (id `task-edit-<id>`), then the new last row, then the add form's title. Delete focus semantics are otherwise the same.
- 53, 54: no timers, no animation added; the row keeps dnd-kit's own transform transition while dragging.
- 56: no raw palette classes or colour literals added (`accent-primary` is a token utility). Existing component guard tests pass.

**The `solid` surface's first render (ruling 6 said you would be its first exercise).** With no background stored it paints nothing at all: computed `background` transparent, `border` transparent, `box-shadow: none`. The panel is then just a heading and cards on the cream page, with no edge. That is how `surface-solid` is written (the fill is inside `body:has([data-background="active"])`), not a bug, but it means the panel has no container on the default look and the rows carry the structure. With an image stored, measured at 1280: light `background` rgb(255,250,243) = `--popover`, border rgb(214,211,209) = `--border`, shadow 0 1px 2px at 8 percent, `backdrop-filter: none`; dark `background` rgb(30,22,16) = `--popover`, border rgb(59,47,37). Rows (`bg-card`) sit on that, which is a small step (`#fbf4ea` on `#fffaf3` in light), so every row keeps its own border. Under `forced-colors: active` the surface is Canvas with a black border and no shadow, as its own rule says. Nothing about it needed changing in `globals.css`. QA: criteria 5 and 7 now have a real applier to measure.

**Keyboard reorder path outside the focus trap (criterion 40).** Exercised in headless Chromium against the dev server with a scratch script (not a repo test). Handle focused, Space: `aria-pressed="true"`. ArrowUp twice moved one place per press. Live-region text read "Charlie moved to position 1 of 4." (title and 1-based position, no UUID). Space dropped it; order persisted (Charlie first); focus stayed on "Reorder Charlie". Escape after a pickup and one ArrowUp restored the original order, left no dialog open and wrote nothing. I waited past the `KeyboardSensor.attach()` `setTimeout(0)` before pressing Escape, as 012's flake note requires, so this does not show the window is closed, only that cancel works once the listener exists. Escape with the dialog open and the panel rendered behind it closed the dialog. The dnd-kit live region is a portal on `body`, so it has no `aria-hidden` ancestor while the panel is in use. **Not covered:** Enter as a pickup key, a pointer drag, a touch drag, and Escape in the panel with no drag active (nothing handles it by construction).

**Escape ownership.** `TaskListDialog.tsx` no longer has `ACTIVE_DRAG_HANDLE`: with the drag gone from the dialog a document-wide query could only ever let a handle outside the dialog swallow its Escape. The two inner layers that remain (`li form`, `li [role="group"]`) are unchanged.

**Pre-existing live-query bug found while verifying (not caused by 014, not fixed here; needs an owner decision).** When a background image is stored, every live query on `/` that was subscribed at page load stays at its first result: add a task in the dialog and neither `CurrentTaskCard` nor the panel updates until a reload (a newly mounted subscription, such as the dialog's own list, does update). It reproduces at **HEAD** with the old code, on a git worktree of `HEAD` served on its own port: with a background stored, pinning a task left the card on "Pin a task from Your tasks whenever you're ready."; without a background it showed the task. It also reproduces on the current tree with the panel removed, so the panel is not the cause. With no background stored everything updates live. I did not find the root cause. A guess, unverified: `useBackgroundImage` opens the database from an effect before the live queries' first run, so their first read runs against an already-open `pendingOpen`/open database, and Dexie's zone tracking of the `tasks` read inside `listTasks` (which `await`s the native-promise `openDatabase()` first) is lost. That would live in `lib/db` (`listTasks` and `getCurrentTask`) or in the two hooks, and it decides whether criterion 24 can pass in any test that sets a background. QA tests that seed a background and then tick, drag or add on `/` will see stale UI.

**Test and guard fallout for qa (I edited none).**
- `typecheck` and `build` fail only on `pinTask`/`unpinTask` imports in `lib/db/{background-migration,background-repository,session-repository,task-repository}.test.ts` (build type-checks tests). No error in any non-test file. `lint` is 0 errors, 20 warnings.
- `components/focus-cycle.guards.test.ts` "criterion 33" pins the live-region count per file: it now fails because `TaskList.tsx` 2 to 1, `CurrentTaskCard.tsx` 2 to 1, and the new `components/TaskChecklist.tsx` has 2 (the load-error and write-failure `role="alert"`). The failure is genuine, the new set is the intended one; re-pin it. The other 597 `components/` unit tests pass.
- Names that changed for specs: the dialog's delete-focus target is the Edit button, not "Reorder X"; the dialog has no Reorder/Move/Pin controls; the panel's controls keep the labels "Reorder X", "Move X up", "Move X down"; the checkbox name is the task title; the panel region is named "Task list". Playwright's `locator.check()` now works (the tick shows at once); a panel behind an open modal is `aria-hidden` (Radix), so `getByRole("region", { name: "Task list" })` finds nothing while the dialog is open.
- Dark theme: the native unchecked checkbox draws a mid-grey fill and edge on `--card`. I did not measure it against 3:1; criterion 50 will, and if it fails the fix is a token, which is a blocker to raise, not something I changed.

## QA Report
Combined pass for 014 and 015, run 2026-11-06. The full report is in `docs/tasks/015-panel-only-task-surface.md` under its QA Report. It is the single pass the 2026-11-06 orchestrator note deferred to.

- **Verdict: FAIL.** The 014 items in that pass are covered as follows, with the 015 report holding the figures.
- **Re-pinned for 014 deferred items:** 8-reload `MutationObserver` flash check with the panel stored **hidden**: PASS (0 of 8 paints). With the panel stored **shown**: NOT RUN.
- **Not run:** touch and pointer drag, Enter as a keyboard pickup key, and a real mid-session write failure (014 criterion 28). These are still open.
- **Settled, not re-measured:** criterion 50 (4.92:1, owner-accepted) and the phone layout figures.
- **Unit gates:** 41 files, 1150 tests passing. Typecheck, build and lint (0 errors) pass. Full e2e: 541 passed, 128 failed, 2 never reported (see 015).
- The painted-ring and focus-ring specs (`focus-surface-sweep`, `dark-sweep`, `control-edge-measure`) are among the 128 e2e failures and were not triaged, so no 014 figure from them is re-confirmed here.


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

## Orchestrator note (2026-11-06): QA is split, and the painted sweep is deferred on purpose
**There is no QA Report for 014 below, and its absence is deliberate — do not read this task as verified.**

Task 015 deletes the task dialog, strips `emoji` and `colorId`, and changes the panel's row density, so
every painted figure 014 would produce is measured against ground that 015 moves. Measuring now means
measuring twice, which is the 2026-10-26 "Measurement ordering" mistake that cost task 010 three hours.
So QA ran a **narrow** pass and the full acceptance sweep happens **once, after 015 lands**.

What QA did do, and what it proves:
- **Re-pointed the pin-era tests rather than weakening them.** The suites that pinned a task to prove
  "the credited task is the chosen one" now prove the same thing through ordering (a decoy is created
  first and the target is moved to top with `reorderTask`, with the decoy's count asserted still 0, so the
  chosen task is provably distinct from the first-created one). `background-migration.test.ts` was rewritten
  against a genuine version-2 database and now asserts `verno === CURRENT_SCHEMA_VERSION`, the pinned task
  landing at position 0, and the `pinnedTaskId` row being deleted.
- **Pinned the liveQuery fix** in `lib/db/live-query.test.ts`, four cases, red-proofed at unit level
  (`openDatabase()` reverted to return `openShared()` directly → both concurrent cases red; restored,
  sha-verified, 4/4 green). It keeps the concurrent-`listTasks()` case so the bug is not later misread as
  background-specific, and calls `getDatabase()` before subscribing so Dexie's `domDeps` is set — without
  that the test passes for the wrong reason.
- **Measured criterion 50 only**, because a failure there would have meant a token change, and a token has
  to move *before* a sweep rather than during one. **PASS: 4.92:1** against a 3:1 floor. Provenance: dark
  theme, 1280x800, DPR 1, no background image; painted left border (80,654) and top border (92,642) both
  `133,133,133`, ground (74,654) `28,20,14` — the panel's solid surface 6 px left of the box, inside its
  44 px label cell. Spec: `e2e/checkbox-unchecked-contrast.spec.ts`. The box *interior* is 1.62:1 against
  the same ground, which is why frontend called it faint; criterion 50 names the **edge**, and an empty box
  is defined by its edge, so this is a pass and not a technicality.

Gates on this tree: `typecheck` exit 0, `lint` 0 errors / 19 warnings, `test` 39 files / **1093 passing**,
`build` succeeds. The e2e suite was **not** run — its ground is about to move.

Still outstanding for 014, to be folded into the single post-015 sweep: touch and pointer drag, Enter as a
keyboard pickup key, a real mid-session write failure (criterion 28, checked by code reading only), and the
8-reload `MutationObserver` check (criterion 36).

## QA Report (loop 3, 2026-11-06, qa): pointer
Loop 3 re-pointed the e2e suite, not the 014 criteria. The loop-3 verdict and per-file table are in `docs/tasks/015-panel-only-task-surface.md` under its QA Report (loop 3). Headline: **FAIL, 616 passed, 60 failed, 1 skipped (677)** on `npx playwright test -c e2e/scratch-3100.config.ts`, down from 585 passed and 92 failed at the start of the loop. 014-specific failures remaining: the two criterion-14 ring-ratio tests in `control-edge-measure.spec.ts` (chip ring about 1.27:1 against 3:1), plus the dark-sweep and token-task-surface sweeps, all deferred to the single post-015 measurement pass.
