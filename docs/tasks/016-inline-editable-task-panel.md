---
id: 016
slug: inline-editable-task-panel
status: done # draft | in-progress | qa | review | done | blocked
---

# The task panel becomes an inline-editable list: type in the row, a kebab per row, one level of subtasks, and an undo toast instead of a confirm

> **History for this task** — implementation notes, QA reports, review findings and
> orchestrator rulings live in [logs/016-inline-editable-task-panel-log.md](logs/016-inline-editable-task-panel-log.md). Read it only when a
> criterion below is disputed; it is not an input to implementing them.

## Goal
`widgets/TaskPanel.tsx` becomes a panel titled **"Tasks"** holding an inline-editable list. Each row is a
drag handle, a checkbox, a borderless text input that *is* the task title, and a kebab menu (Add subtask,
Duplicate, Delete task). There is no modal, no separate edit mode and no confirm dialog: clicking the text
edits it, Enter makes the next row, Backspace on an empty row removes it, and a delete can be taken back for
five seconds. The stored shape moves to the owner's vocabulary — `completed` becomes the boolean,
`completedPomodoros` the count, `order` replaces `position` — and gains `parentId`, `createdAt`, `updatedAt`,
plus `emoji`, `color` and `etaMinutes`, which this task stores and **does not render**. Done means: a row can
be typed into and nothing is written until it has text, every keyboard move below behaves exactly as stated,
a deleted task comes back from the toast, and the timer still fits above the fold on a 320 px phone.

## Provenance
Owner requirements, 2026-11-10, given directly to the orchestrator. The interaction pattern is reproduced
from a product the owner likes; **only the pattern**. Every visual is Pomotato's own — its tokens, its
`react-icons` glyphs, its copy. No icon, no colour, no spacing scale and no sentence is copied from anywhere.
That is a hard rule from CLAUDE.md, not a preference, and it is the first thing `reviewer` should check.

**This task reverses part of a nine-day-old ruling.** DECISIONS.md 2026-11-06 ruling 3 (task 015) removed
`emoji` and `colorId` from `Task`, stripped both from every stored row in the `.version(5)` upgrade, and
deleted `components/TaskColorDot.tsx`, `components/task-palette-colors.ts` and `lib/db/palette.ts`. The owner
now wants `emoji` and `color` back in the schema. That is an intentional reversal, not an oversight, and it
is planned here as one. See Risks; **`docs/DECISIONS.md` needs an entry recording the reversal, written by
the orchestrator** — neither backend nor frontend edits `docs/`.

## Approved 2026-11-10, with the open questions settled

The owner approved this task as drafted. The five open questions below are now closed; the numbering is
theirs, from "Open questions for the owner" at the bottom of this file. **None of these changes a criterion** —
each confirms the reading the criteria were already written against, so no group needs re-numbering.

1. **`eta` goes, with no conversion.** Confirmed by the owner. The `.version(6)` upgrade deletes the field and
   `etaMinutes` starts absent on every row. Any estimate a user already set is lost, deliberately: the stored
   unit is pomodoros, the owner's field is minutes, and converting would invent a figure nobody entered
   against a focus length that has since changed. Ruling 2 stands as written.
2. **The panel keeps a visible heading, and it reads "Tasks".** Not answered by the owner; taken as drafted,
   orchestrator's call, overrule at any point. Ruling 4 stands: a rendered `<h2>Tasks</h2>` names the region
   via `aria-labelledby`. This reverses the 2026-11-10 `aria-label` ruling in DECISIONS.md, which the owner's
   own amend commit (`834f0fd`) had already reversed in the tree — `TASK_PANEL_HEADING_ID` and the `<h2>` are
   both back, reading "Task list". Criterion 17 renames that text to `Tasks`; criterion 17 also moves
   `components/TaskPanelToggle.tsx:29`'s `aria-label` off `Task list`, so the string leaves the app entirely.
3. **Three placeholder rows at mount on an empty list, not a list padded to three.** Not answered by the
   owner; taken as drafted. Ruling 6 stands.
4. **Five seconds flat.** Chosen by the owner over a window that pauses on focus and over a longer window for
   everyone. Criterion 44's 5.0-6.0 s dismissal and criterion 45's "Tab reaches Undo within three stops" are
   the requirement as it ships. The accessibility cost is accepted and named: a screen-reader user who has to
   hear the announcement before acting will sometimes miss the window. **This does not license a focus steal
   to compensate** — criterion 44 still forbids it.
5. **`color`'s values stay unanswered, and that is fine here.** The field is stored and never rendered by this
   task, so nothing blocks. The next task — the one that renders `emoji`, `color` and `etaMinutes` — opens by
   settling the swatch set, because task 015 deleted `lib/db/palette.ts` and its eight swatches, so there is
   nothing to inherit. Backend stores `color` as a free string with no enum validation; inventing a palette to
   validate against would pre-empt that decision.

**antislop runs in `during` mode for this task** (owner's choice this session). Frontend applies the rules
while it writes rather than auditing afterwards, and the Delivery Gate runs before frontend reports done.

## Settled here, do not reopen

### 1. The schema adopts the owner's field names literally, at version 6. It does not map at the boundary.

Today's stored shape is `{ id, title, eta, completed, done, position }`. The owner's list renames or
re-points five fields at once:

| stored today | the owner's name | what changes |
|---|---|---|
| `done: boolean` | `completed: boolean` | name only |
| `completed: number` (0-999 pomodoro count) | `completedPomodoros: number` | name only — **but the old name now means something else** |
| `position: number` | `order: number` | name, plus the invariant (see ruling 3) |
| `eta: number` (required, 1-20 *pomodoros*) | `etaMinutes?: number` (optional, *minutes*) | unit, optionality and name |
| — | `parentId?`, `emoji?`, `color?`, `createdAt`, `updatedAt` | new |

**Decision: rename the stored fields, in a `.version(6)` upgrade, so the repo has exactly one vocabulary.**

The reason is the collision, not tidiness. `completed` changes meaning from a count to a boolean. A
half-applied rename mostly fails `tsc` — `current.completed < COMPLETED_MAX` in
`lib/db/session-repository.ts:80` is `boolean < number`, which is an error — but **the truthiness reads
compile silently and invert**: `lib/db/task-repository.ts:21` (`find((task) => !task.done)`) and
`components/TaskChecklist.tsx:55` (`tasks.find((task) => !task.done)`) both become `!task.completed`, which
under the old meaning is "zero pomodoros done" and under the new one is "not finished". Those two lines
decide which task is current and therefore which task a completed session is credited to.

The rejected alternative, so the owner can overrule this at approval: **keep the stored names and map at the
repository boundary** (`TaskRecord` keeps `done`/`completed`/`position`, `Task` carries the owner's names, a
mapper sits in `lib/db/task-repository.ts`). Rejected because it makes `TaskRecord.completed: number` and
`Task.completed: boolean` coexist in the same codebase **permanently**, which institutionalises the exact
collision above instead of confining it to one migration commit; and because the frontend blast radius is
identical either way, since components read the public `Task`.

**Blast radius of the rename, checked rather than guessed.** `lib/db/types.ts`, `lib/db/database.ts`,
`lib/db/validation.ts`, `lib/db/task-repository.ts`, `lib/db/session-repository.ts` (lines 48, 80-81 read and
write the count), `lib/db/test-utils.ts`, `lib/db/index.ts`, `hooks/use-tasks.ts` (type only),
`components/TaskChecklist.tsx`, `components/TaskChecklistRow.tsx`, `components/TaskForm.tsx`,
`widgets/TaskPanel.tsx`, and the `lib/db` and `e2e` suites. **`lib/stats/**` needs no change**: grepped, it
reads only `taskId` and `taskTitle` off a session row and never touches `completed`, `eta`, `done` or
`position` (`lib/stats/aggregate.ts:106-176`, `lib/stats/types.ts`). Criterion 10 pins that by value anyway.

### 2. `eta` is deleted, not converted. `etaMinutes` starts absent on every row.
The owner's field list is exhaustive and does not contain a pomodoro estimate, so the stored `eta` goes with
the `.version(6)` upgrade. **It is not converted to minutes**: pomodoros → minutes needs a focus length, the
focus length is user-configurable (task 013), and multiplying by whatever it happens to be today invents
data. So every existing row loses its estimate and `etaMinutes` is absent — *absent*, not `null`, not `0` —
on every migrated row.

That is real data loss, the second destructive migration in two tasks, and it is **open question 1** below.
Consequences inside this task: `components/TaskForm.tsx`'s count field has nothing to write, and the
`+1`/`-1` controls task 015 moved into the row have no place in the row the owner specifies. Both go.
`incrementCompleted` stays — `logCompletedSession` calls it, that is the whole point of the count.
`decrementCompleted` loses its only consumer; backend records that in Implementation Notes and **does not
delete it in this task** (the count surface is expected back when ETA returns), so the orchestrator can route
it as maintenance.

### 3. `order` is dense, unique and zero-based **within a sibling group**, not across the whole table.
A sibling group is "every task sharing the same `parentId`", with absent `parentId` meaning top level. So two
rows may both hold `order: 0` provided they have different parents, and the old global invariant is
deliberately retired.

Display order is then a pure function: top-level tasks sorted by `order`, with each parent's children —
sorted by their own `order` — spliced in directly after it. Rejected in one line: **one global sequence with
children interleaved**, because "a child's `order` always falls between its parent's and the next top-level
task's" is an invariant every create, delete, reorder and duplicate has to re-police, and reordering a parent
becomes a variable-length block move. Scoped ordering makes a reorder a within-group move and makes
duplicate-with-subtasks a two-group insert. Criterion 11 pins this; it is not prose.

**Subtasks are one level deep, by validation and not by UI discipline**: a task whose `parentId` is set may
not itself be a parent, and a `parentId` must reference a stored task. Deleting a parent deletes its
children. Promoting or demoting a task (dragging a subtask out, or a task into) is **out of scope**.

### 4. The panel's title is a rendered `<h2>Tasks</h2>`, and that is what names the region.
This is the exact area DECISIONS.md 2026-11-10 records a ~157-test regression in: both the `<section>` and
the `<ul>` carried `aria-labelledby="task-panel-heading"` after the heading was deleted, and
`aria-labelledby` pointing at a missing id yields **no accessible name at all**. That ruling settled on
`aria-label="Task list"` with `TASK_PANEL_HEADING_ID` deleted — and the working tree disagrees with it (the
`<h2>` and the `aria-labelledby` are both back, uncommitted). **Open question 2** asks the owner to settle
that contradiction.

What this task needs either way: the owner asked for a panel *titled* "Tasks", which is visible content, and
the 2026-11-10 rule says prefer `aria-label` only when the naming text is **not** visible content. So:
a rendered `<h2>` whose text is `Tasks`, the region named by `aria-labelledby` pointing at its id, the id
actually rendered in the same commit, and **the `<ul>` carries no name of its own** (a list nested in a
region of the same name reads as a duplicate — that half of the ruling stands regardless).

**The accessible name changes from "Task list" to "Tasks", and that is a test fallout item, not a surprise.**
`e2e/helpers/task-list-dialog.ts:11` holds `TASK_PANEL_NAME = "Task list"` and is imported by fifteen specs,
which is how one string reached ~157 tests. The literal also appears in `e2e/control-edge-measure.spec.ts`,
`e2e/task-panel.spec.ts`, `e2e/dark-sweep.spec.ts` and `e2e/token-task-surface.spec.ts`. Re-pointing the
constant is one edit; the four literals are four more. Criterion 61 enumerates them.

The bottom-right toggle's accessible name comes from the same constant, so it moves too. Keeping it constant
across states (`aria-expanded` carries the state) is task 015 ruling 2 and is unchanged.

### 5. The kebab is `radix-ui`'s `DropdownMenu`. The drag is the `@dnd-kit` already in the tree. Nothing new is installed.
Checked before this file was written: `radix-ui` `^1.7.0`, `@dnd-kit/core` `^6.3.1`, `@dnd-kit/sortable`
`^10.0.0`, `@dnd-kit/utilities` `^3.2.2` and `react-icons` `^5.7.0` are all already dependencies. So:

- The kebab menu is built on `radix-ui`'s `DropdownMenu`, wrapped in **`components/ui/dropdown-menu.tsx`**
  following the pattern `components/ui/dialog.tsx` already sets (`import { Dialog as DialogPrimitive } from
  "radix-ui"`, tokens substituted for the stock palette, a header comment saying a future `shadcn add` is a
  conflict to merge by hand). Adapt the stock file to Pomotato's tokens; do not ship its colours.
- Reordering stays on the existing `@dnd-kit` setup in `components/TaskChecklist.tsx` — one `DndContext`,
  `PointerSensor` + `KeyboardSensor`, the title-and-position announcements already written there.
- The undo toast is built from Pomotato's own markup and tokens. **No toast library is installed**; `sonner`
  is not a dependency and does not become one. The requirement is in criteria 44-47; the mechanism is
  frontend's, recorded in Implementation Notes.
- Glyphs come from `react-icons` (ratified 2026-10-26). `lucide-react` must not gain its first import.

### 6. Three placeholder rows exist only when the stored list is empty.
"The list starts with 3 empty placeholder rows" is read as: **at mount, when the stored list is empty, the
panel renders exactly three empty rows**. It is not a running pad — with one stored task the panel renders one
row and no placeholder, so Backspace on a placeholder can take the list to zero rows without the panel
immediately re-growing one, and "+ Add Task" is the way back. **Open question 3** offers the always-pad-to-3
reading for the owner to pick instead. There is **no cap** on the number of tasks either way.

### 7. Surface and ground are unchanged: 012's **solid**, measured flat, with no image in the loop.
Every figure in the measurement group is taken with **no background stored**, where `surface-solid` paints
nothing at all (015 ruling 5, from 014's notes: computed `background`, `border` transparent, `box-shadow`
transparent since DECISIONS 2026-11-10). A row's ground is therefore **`--card` over `--background`**, not the
Surface fill. No adversarial image set, no per-image sweep, no straddle analysis. QA says so explicitly in
the report.

## Data shape / pipeline ordering

**The data shape is undecided until backend lands it, so backend runs first and alone.** Frontend does not
start until backend has handed off. Five stored fields are re-pointed, four are added and one is deleted;
`Task` changes in a way that makes `TaskChecklist.tsx`, `TaskChecklistRow.tsx` and `TaskForm.tsx` fail to
compile. There is nothing for frontend to build against until the type stops moving.

File ownership for this task:
- **Backend owns** `lib/db/**`. No preferences key is added, so `lib/preferences/**` is **not** backend's
  here and is not touched by anyone (criterion 3).
- **Frontend owns** `app/`, `components/`, `widgets/`, `hooks/`.

**Backend records in Implementation Notes, before the handoff** (criterion 1 asserts each item is present and
matches the shipped code):
1. **The `.version(6)` block as written**, verbatim, and confirmation that the highest-literal guard
   (`lib/db/database.ts:148-152`) still passes with no edit to it.
2. **What `upgradeToVersion6` does**, step by step and in order, and why it is idempotent and cannot throw on
   a row an older build wrote.
3. **The final `Task` / `TaskRecord` / `CreateTaskInput` / `UpdateTaskInput` / `ValidationIssue["field"]`
   shapes**, field by field, with each new field's type, optionality, validation range and default — and
   explicitly whether an omitted optional field is stored as absent or as `undefined`/`null`.
4. **The repository API the surface needs**, named with signatures: create (top-level and subtask), rename,
   toggle completion, reorder within a sibling group, duplicate-with-children, delete-with-children, and
   whatever makes undo possible (restoring a task and its children at their previous ids and orders). The
   surface must reach all of it without importing Dexie.
5. **How a test seeds a version-5 database** — the sibling of `seedVersion3DatabaseForTests`
   (`lib/db/test-utils.ts`) and of 015's `seedVersion4DatabaseForTests` — named, with its argument shape, plus
   whether the version-1, -3 and -4 seeders still work now that a seeded open runs through to 6.
6. **Which existing tests are red on the handoff tree and why**, so QA inherits the list instead of
   discovering it one red run at a time.

### The schema change
`CURRENT_SCHEMA_VERSION` 5 → 6. Every block from `.version(1)` to `.version(5)` is frozen; v6 is a new block
beside them, written as a literal, never as the constant. No historical block's `.stores()` argument is
edited. **`tasks: "id, position"` does change**, because the indexed field is being renamed: v6 restates
`tasks` with `order` in place of `position`. That is the first index change in this repo, so backend reads
Dexie's versioning guide before writing it and records in Implementation Notes what Dexie does to the old
index (criterion 4 pins the outcome: the database opens at `verno === 6` and a query by the new index works).

`upgradeToVersion6` operates on raw rows and does exactly this, in order: rename `done` → `completed`
(a row with no `done`, or a non-boolean `done`, becomes `completed: false`); rename the numeric `completed`
→ `completedPomodoros` (a missing or non-integer value becomes `0`); rename `position` → `order`, keeping the
value, then renumber densely and zero-based so the new per-group invariant holds on arrival (there are no
parents yet, so every row is top level); delete `eta`; set `createdAt` and `updatedAt` to one timestamp
captured once for the whole upgrade; add nothing else — `parentId`, `emoji`, `color` and `etaMinutes` stay
absent. It never reads or writes `sessions`, `backgrounds` or `appMeta`.

**Test the upgrade against a database seeded at version 5, not a fresh version-6 one.** A fresh database never
runs the callback, so a broken callback passes a green suite. This trap has now cost two tasks; it applies
again.

## Scope

**In:**
- Schema **5 → 6**: the rename, the four new fields, the `eta` deletion, the `tasks` index moving from
  `position` to `order`, and a version-5 seeding helper for tests.
- The per-sibling-group `order` invariant, `parentId` with one-level-deep validation, cascade delete of
  children, duplicate-with-children, and a restore path that undo can call.
- `widgets/TaskPanel.tsx` retitled **"Tasks"**, with the region's accessible name moving with it.
- A row of drag handle + checkbox + borderless inline input + kebab, with click-to-edit, the placeholder
  copy, three placeholder rows on an empty list, and "+ Add Task".
- The keyboard set: Enter, Escape, Backspace-on-empty, Arrow Up at caret start, Arrow Down at caret end.
- A kebab menu on `radix-ui` `DropdownMenu` with Add subtask / Duplicate / Delete task.
- One level of subtasks, indented, each with its own checkbox and inline input.
- Delete with a five-second undo toast, replacing the inline confirmation task 015 built.
- Drag-to-reorder by the handle only, pointer and keyboard, with subtasks travelling with their parent.
- Debounced (~300 ms) title persistence that flushes on blur, Enter and unmount.
- Removing the ETA field and the `+1`/`-1` controls from the surface (ruling 2).
- Updating every test the above invalidates (QA's, enumerated in criterion 61).

**Out — defer, do not absorb:**
- **A pinned "current task" of any kind.** The current task stays derived (first not-completed in display
  order, task 014's rule) and `components/CurrentTaskCard.tsx` is unchanged except for the field rename.
- **Rendering `emoji`, `color` or `etaMinutes`.** The schema carries them; no picker, no swatch, no dot, no
  duration chip, no inferred colour from the title, no per-task icon. They are stored and invisible. Bringing
  them back on screen is the next task.
- **Timer integration and stats.** No change to which task a session is credited to, no "start this task", no
  per-task progress bar, no roll-up of subtask completion onto a parent (ticking a parent does **not** tick
  its children, and vice versa — criterion 36).
- **Promoting or demoting a task between levels**, a second level of nesting, cross-parent drag, "clear
  completed", archive, filters, sorting by anything but `order`.
- **Undo for anything except a delete.** No undo for a tick, a rename, a reorder or a duplicate.
- **Any palette change.** No declaration in `:root` or `.dark` moves and no colour token is added. If a
  figure in the measurement group cannot be met without one, that is a **blocker raised before the sweep**
  (criterion 2, CLAUDE.md "Measurement ordering").
- **A second frosted surface** (012 ruling 2 caps it at one) and **a second task surface of any kind** (015
  ruling 2) — the panel is still the only place tasks live, and hiding it still hides every task control.
- **Any new persisted preference.** `PREFERENCES_VERSION` stays at 2 and `lib/preferences/**` is untouched.
- **Any new dependency.** No toast library, no icon library, no headless-UI library (ruling 5).
- Live cross-tab sync; export/import; PWA (milestone 7).
- **PLAN.md Maintenance items**, including the deferred 015 measurement pass, the `/settings`
  `role="status"` (010 R-1), the `.control-edge` applier guard (012 R-4) and the `:has()` fallback (012 R-2).
- Any change to `lib/timer/**`, `lib/stats/**`, `lib/audio/**`, `lib/preferences/**`,
  `hooks/use-timer-clock.ts`, `hooks/use-hydrate-timer-store.ts`, `components/SloshGauge.tsx`,
  `components/HoldButton.tsx` (both vendored and frozen), `app/stats/**`, `components/Stats*.tsx`,
  `components/SettingsPanel.tsx`, `components/BackgroundControl.tsx`, `package.json`, `package-lock.json`.

## Acceptance Criteria

61 criteria. **Backend owns 1-16. Frontend owns 17-57. Group P (58-59) is the measurement group and is
deliberately separate from every behaviour group** — a token change re-runs P and nothing else. Group Q
(60-61) is shared.

---

## Backend criteria (1-16) — hand off before frontend starts

### A. Gate and order
- [ ] 1. **Backend hands off before frontend starts**, and Implementation Notes record, before that handoff,
      all six items listed under "Data shape / pipeline ordering". QA asserts each item is present and matches
      the shipped code.
- [ ] 2. **No token or palette value moves in this task.** No declaration in `:root` or `.dark` in
      `app/globals.css` changes value and no colour token is added; `components/token-foundation.test.ts` and
      `components/token-dark.test.ts` still pin their hexes by value. If a figure in group P cannot be met
      without a token, that is a **blocker raised before the sweep**, not a change taken after it: a ruling
      that lands mid-sweep costs a full re-measure (CLAUDE.md "Measurement ordering").
- [ ] 3. **Nothing new is depended on, and the preference layer is untouched.** `package.json`'s
      `dependencies` and `devDependencies` key sets are exactly the sets backend records at handoff; no file
      imports `lucide-react` or any toast package; `PREFERENCES_VERSION` is still 2 and no file under
      `lib/preferences/` is modified. Asserted by value and by scan, never as a diff against `HEAD`
      (criterion 60).

### B. Schema 5 → 6: the rename, the new fields, the lost estimate
- [ ] 4. **`CURRENT_SCHEMA_VERSION` is 6**, the `.version(6)` block is declared as a literal beside a
      byte-identical `.version(5)`, no earlier block's `.stores()` argument is edited, and the highest-literal
      guard (`lib/db/database.ts:148-152`) still passes **with no edit to it**. The database opens at
      `verno === 6` and a read through the new `order` index returns rows. Proven non-vacuous by
      break-and-restore (criterion 59 — raise the version without the block and watch the guard throw).
- [ ] 5. **The type carries exactly the owner's eleven fields and nothing else.** `Task` and `TaskRecord` have
      exactly `id, title, completed, order, parentId?, emoji?, color?, etaMinutes?, completedPomodoros,
      createdAt, updatedAt`; no `done`, `eta` or `position` key exists on any exported type or anywhere under
      `lib/`, `app/`, `components/`, `widgets/` or `hooks/` (grep-level, so a half-applied rename cannot
      hide); `completed` is typed `boolean` and `completedPomodoros` `number`; `npm run typecheck` passes with
      no `any`.
- [ ] 6. **The upgrade renames in place, asserted on raw stored rows.** A database seeded at version 5 with
      five tasks carrying `done`, a numeric `completed`, `eta` and dense `position`s, then reopened: every row
      read via `db.table("tasks").toArray()` — **not** the repository's return value — satisfies
      `"done" in row === false`, `"position" in row === false`, `"eta" in row === false`, and carries
      `completed` equal to the seeded `done`, `completedPomodoros` equal to the seeded numeric `completed`, and
      `order` equal to its rank in the seeded `position` order. `id` and `title` are unchanged value-for-value.
      `sessions` and `backgrounds` rows are untouched and `appMeta` still resolves `"pinnedTaskId"` to
      `undefined`. The callback runs exactly once: reopening does not re-run it.
- [ ] 7. **The new fields arrive as stated, and the estimate is gone.** On the same migrated set, every row
      has `createdAt` and `updatedAt` as finite integers, equal to each other and equal across all rows (one
      timestamp captured once), and `"parentId" in row`, `"emoji" in row`, `"color" in row` and
      `"etaMinutes" in row` are all **false** — absent, not `null`, not `undefined`, not a default value. No
      row carries a converted minute figure derived from the old `eta`.
- [ ] 8. **Bad rows and a second run are both no-ops.** Rows hand-written with `done` absent, `done: "yes"`,
      `completed: null`, `completed: 7.5`, `position` absent, duplicate `position`s, and an empty `tasks`
      table all upgrade without throwing; a non-boolean `done` lands as `completed: false` and a missing or
      non-integer count lands as `completedPomodoros: 0`. Running the callback a second time on its own output
      changes nothing.
- [ ] 9. **A version-1, -3 and -4 database each upgrade straight through to 6.** Seeded at version 3 with a
      pin on the task at position 3, it opens at version 6 with that task at `order: 0`, the rest densely
      renumbered in their previous relative order (v4's behaviour, preserved), `completed: false` on every row,
      no `"pinnedTaskId"` row, no `emoji`/`colorId` (v5's strip, preserved), and the v6 shape from criteria 6
      and 7. Seeded at version 1 and at version 4, likewise.
- [ ] 10. **The write path never reintroduces an old name, and `/stats` is unmoved.** `createTask({ title })`
      stores a row with no `done`, `eta` or `position` key; a call passing any of those at runtime (cast past
      the type) stores none of them and does not throw; the same for `updateTask`. Asserted on the raw stored
      object. `/stats` aggregates an identical seeded `sessions` set to the same totals as before the change,
      pinned **by value** — `lib/stats/**` reads only `taskId` and `taskTitle` and must not have needed an
      edit (ruling 1).

### C. Ordering, subtasks, duplicate, restore
- [ ] 11. **`order` is dense, unique and zero-based within a sibling group, and display order is derived.**
      After any sequence of create / delete / reorder / duplicate across a set containing top-level tasks and
      subtasks under two different parents: every sibling group's `order` values are exactly
      `0..n-1` with no gaps and no repeats, groups are independent (two rows may share `order: 0` under
      different parents), and `listTasks()` returns top-level tasks by `order` with each parent's children —
      by their own `order` — immediately after it. Asserted as an invariant check re-run after each operation,
      not once at the end.
- [ ] 12. **Subtasks are one level deep and never dangle, by validation.** `createTask` with a `parentId`
      naming a task that itself has a `parentId` is rejected and writes nothing; so is a `parentId` naming no
      stored task. A task that has children cannot be given a `parentId`. Deleting a parent deletes its
      children in the same transaction and renumbers the top level densely; deleting a child renumbers only
      that parent's group and leaves the top level alone.
- [ ] 13. **Duplicate copies the task and its children, directly below the original.** Duplicating a parent
      with three children yields: a new top-level row with a fresh `id`, the same `title`,
      `completedPomodoros`, `emoji`, `color` and `etaMinutes`, `completed` copied as stored, fresh `createdAt`
      and `updatedAt`, and `order` exactly one greater than the original's — with every later top-level sibling
      shifted down by one; plus three new children under the copy, in the original children's relative order,
      with fresh ids and `order` `0,1,2`. The originals are byte-identical afterwards except where the shift
      changed their `order`. Duplicating a **child** produces a child of the same parent directly below it and
      touches no other group.
- [ ] 14. **A deleted task and its children can be restored exactly.** Delete a parent with two children from
      the middle of a five-task list, then restore: the parent returns with the **same `id`, `title`,
      `completed`, `completedPomodoros`, `createdAt`, `emoji`, `color`, `etaMinutes`** and the same `order`
      within the top level, every later sibling shifts back down, and both children return under it with their
      own ids and relative order. If the recorded `order` now exceeds the group's length (tasks were added
      meanwhile) the restored row goes last in its group rather than failing. Restoring twice is rejected or a
      no-op, never a duplicate row; backend records which.
- [ ] 15. **`updatedAt` moves on a real write and only on a real write.** A title change, a completion toggle,
      a reorder, a duplicate's source shift and a restore each set `updatedAt` to a later value and leave
      `createdAt` untouched; setting a field to the value it already holds writes nothing and moves nothing
      (the no-op guards `setTaskDone`, `incrementCompleted`, `decrementCompleted` and `reorderTask` already
      have). `createdAt <= updatedAt` on every row after every operation.
- [ ] 16. **An empty or whitespace title is never stored, from any entry point.** `createTask` and
      `updateTask` reject `""`, `"   "`, and a 101-code-point title with a `TaskValidationError` naming
      `title`, and write nothing. Titles are still trimmed to 1-100 Unicode code points
      (`lib/db/validation.ts`'s existing rule, unchanged). `ValidationIssue["field"]` is exactly the set
      backend records under criterion 1 and contains no `"eta"`.

---

## Frontend criteria (17-57) — start after the handoff

### D. The panel shell and its name
- [ ] 17. **The panel is titled "Tasks" and the region is named by that heading.** `/` renders exactly one
      element with role `region` whose accessible name is exactly `Tasks`; the name comes from a rendered
      `<h2>` whose text content is `Tasks` and whose `id` is the one the region's `aria-labelledby` points at;
      `document.getElementById(<that id>)` is non-null. The `<ul>` inside it carries **no** `aria-labelledby`
      and **no** `aria-label`. The string `Task list` appears nowhere in `/`'s rendered text or in any
      accessible name on the page, including the bottom-right toggle's.
- [ ] 18. **Hide/show still works and the panel is still the only task surface.** The bottom-right toggle
      still hides and shows the panel, its accessible name is constant with `aria-expanded` carrying the state,
      the state still survives a reload at 320 px and 1280 px, and with the panel hidden `/` renders no control
      that writes to the `tasks` table (015 criteria 28, 30, 31, re-run because the panel's contents changed
      wholesale). `.control-edge`'s applier count on `/` is still **4**.
- [ ] 19. **The panel still renders on `/` only, and adds at most one landmark.** `/settings` and `/stats` are
      unchanged and grow neither a panel nor a toggle; `npm run build` still lists exactly `/`, `/_not-found`,
      `/settings`, `/stats`; the panel contributes exactly one landmark to `/`'s accessibility tree.

### E. Row anatomy and inline editing
- [ ] 20. **Each row exposes exactly four controls, in this order.** Per row, in reading order: the drag
      handle, the checkbox, the title input, the kebab button — and nothing else. Asserted by accessible name
      and role per row at 320 px and 1280 px, on a top-level row and on a subtask row. No Edit button, no
      Delete button, no `+1`/`-1`, no ETA field, no colour dot, no emoji anywhere in the panel.
- [ ] 21. **The input is the title, and it is borderless plain text.** The title element is an
      `<input type="text">` (or `<textarea>`; frontend records which and why) whose computed `border-style` is
      `none` or whose computed `border-width` is `0px` on all four sides, whose computed `background-color` is
      transparent or identical to the row's painted ground, and whose computed `font-size`, `font-weight`,
      `font-family` and `color` equal those of the row's non-interactive text in the same state. It carries a
      visible focus indicator when focused (group P measures it).
      **OWNER RULING, 2026-11-11: no outline or ring on the title input.** The text caret is the focus
      indicator for this field, which is the accepted reading of WCAG 2.4.7 for a text input. `outline-none!`
      at `components/TaskChecklistRow.tsx:209` therefore stays, and this clause is satisfied by the caret.
      Group P measures no ring for the title input. The row's other controls (checkbox, kebab) are NOT
      covered by this ruling and keep their own 2 px `--ring` indicators. There is no separate "edit mode": the same
      element is present and editable in every row state, and clicking the row's text places the caret in it
      at the clicked position rather than opening anything.
- [ ] 22. **No dialog and no modal is involved in editing.** Editing, adding, renaming, duplicating and
      deleting a task render **zero** elements with `role="dialog"` or `role="alertdialog"` anywhere on `/`,
      and no element in the panel ever traps focus. (The kebab's `role="menu"` is not a dialog and is covered
      by group I.)
- [ ] 23. **Empty rows carry the placeholder, and the copy is exactly this.** An empty row's input has
      `placeholder="What's your priority?"` — that string, with the typographic or straight apostrophe frontend
      records, asserted by value. The placeholder is not an `aria-label` substitute: the input also has a
      programmatic accessible name that identifies which row it is. Copy is routed through
      `antislop-copywriting`: no pressure, no exclamation, nothing that reads as an enforcer (DESIGN.md
      "encouraging, never pressuring").
- [ ] 24. **Three placeholder rows on an empty list, "+ Add Task" appends and focuses, no cap.** With zero
      stored tasks the panel renders exactly three empty rows at mount (ruling 6). With one stored task it
      renders exactly one row and no placeholder. "+ Add Task" is a single control with an accessible name
      naming the action, it appends one empty row **below the last row in the list** (below the last subtask
      when the last top-level task has children), and `document.activeElement` is that new row's input
      immediately afterwards. Pressing it fifty times yields fifty rows with no truncation, no "limit" copy
      and no error.

### F. Keyboard — one criterion per interaction
- [ ] 25. **Enter commits the row and opens a new one below it, focused.** With the caret anywhere in a row
      holding text, Enter: stores that row's title (asserted by a reload, not by the DOM), inserts one empty
      row directly below it — a sibling at the same level, so Enter inside a subtask makes another subtask of
      the same parent, never a top-level task — and leaves `document.activeElement` on the new row's input.
      Enter on an **empty** row inserts nothing and writes nothing. No form submits and the page does not
      navigate.
- [ ] 26. **Escape cancels the current edit and restores the previous text.** Type into a row holding a stored
      title, then Escape: the input's value returns to the stored title character-for-character, the stored
      row is unchanged after a reload, and focus stays on that input. Escape on a never-stored row clears what
      was typed and leaves the row empty and present. Escape does **not** hide the panel, close the page,
      cancel a drag that is not running, or bubble past the row (015 criterion 17's one-owner-per-layer rule,
      re-run).
- [ ] 27. **Backspace on an empty row deletes it and focuses the previous row.** With the caret at position 0
      of an **empty** row: the row is removed and `document.activeElement` is the previous row's input with the
      caret at the end of its text. For a row that was never stored this writes nothing and shows **no** toast.
      For a stored row this deletes the task (and its children) and **does** show the undo toast of group K.
      Backspace on the **first** row when it is empty removes it if a later row exists, and is a no-op if it is
      the only row. Backspace with text present, or with the caret not at 0, deletes a character and moves no
      focus.
- [ ] 28. **Arrow Up at the caret start moves focus to the previous row.** With the caret at offset 0 and no
      selection, ArrowUp moves focus to the previous row's input in flattened visual order (so a parent's last
      child, not the parent, is "previous" to the next top-level task) with the caret at the **end** of that
      input's text. On the first row it does nothing and focus stays put — no wrap.
- [ ] 29. **Arrow Down at the caret end moves focus to the next row.** With the caret at `value.length` and no
      selection, ArrowDown moves focus to the next row's input in flattened visual order, caret at the end of
      its text. On the last row it does nothing and focus stays put — no wrap.
- [ ] 30. **Arrows away from the boundary stay inside the text.** With a 20-character title and the caret in
      the middle, ArrowUp and ArrowDown move the caret within the field per the platform's own behaviour and
      **do not move focus**; `document.activeElement` is unchanged after each. Same with a non-empty selection
      at either boundary.

### G. Persistence from the surface
- [ ] 31. **Empty rows are never written.** With three placeholder rows rendered and nothing typed, the
      `tasks` table has **zero** rows (read directly in the browser context, not inferred from the DOM). The
      same after adding ten rows with "+ Add Task" and typing in none, after Enter on a row holding text (the
      new empty row below it is not stored), and after a row's text is typed then cleared then blurred. A
      reload in each case shows the empty-list state, not nine ghost rows.
- [ ] 32. **A row is stored once it has text, and typed text debounces into one write.** Typing a title and
      stopping: the row exists in the `tasks` table within 600 ms (the ~300 ms debounce plus slack) with the
      typed title; typing ten characters inside one 300 ms window produces **exactly one** stored title change,
      asserted by instrumenting the repository call at whichever level discriminates (name it). Blur, Enter and
      unmounting the panel each flush the pending write immediately rather than waiting out the timer — proven
      by hiding the panel or reloading within 100 ms of the last keystroke and finding the text stored.
- [ ] 33. **Everything the surface does survives a reload.** After: three titles typed, one ticked, one
      subtask added and titled, one task duplicated, one dragged to the top, and one deleted and *not* undone
      — a reload shows exactly the same list, same order, same nesting, same tick states, same titles. Asserted
      at 320 px and 1280 px.
- [ ] 34. **Every failed write is reported in one place, and the row shows what is stored.** A rejected
      rename, tick, add, subtask add, duplicate, delete, restore or reorder surfaces the panel's single
      `role="alert"` write-failure line and leaves the row showing the **stored** value, not an optimistic one.
      A bare `console.error` is not sufficient on its own (015 criterion 15's reasoning). QA lists which of the
      eight it exercised and how.

### H. Completion
- [ ] 35. **The checkbox toggles completion and moves nothing.** Ticking a row in the middle of the list
      persists `completed: true` for that task and leaves every row's `order` and screen position unchanged;
      the list does not re-sort, the row does not animate to the bottom, and the derived current task moves on
      to the next not-completed task (`CurrentTaskCard` and the panel's marker agree, 014 criterion 24).
      Unticking restores it. The checkbox is reachable by Tab and operable by Space.
- [ ] 36. **A completed row is struck through and de-emphasised, and completion does not cascade.** A
      completed row's title has computed `text-decoration-line` containing `line-through` and a computed
      `color` that differs from a not-completed row's in the same theme (group P measures the ratio). Ticking a
      parent leaves every child's `completed` false; ticking every child leaves the parent's `completed` false.
      No progress summary, no count, no "x of y" anywhere.

### I. The kebab menu
- [ ] 37. **It is a real menu, built on `radix-ui`'s `DropdownMenu`.** The trigger is a `<button>` with
      `aria-haspopup="menu"`, `aria-expanded` reflecting the open state, and an accessible name that names the
      task it belongs to (so fifty rows do not yield fifty identically-named buttons). Open, and exactly one
      element with `role="menu"` exists, containing exactly three `role="menuitem"` elements named
      `Add subtask`, `Duplicate` and `Delete task` in that order. `components/ui/dropdown-menu.tsx` imports
      from `"radix-ui"` the way `components/ui/dialog.tsx` does and carries the same
      "a future `shadcn add` is a conflict" header comment.
- [ ] 38. **Menu focus and keyboard behaviour.** Opening with Enter, Space or click moves focus into the menu
      and onto its first item; ArrowDown and ArrowUp move between the three items and wrap; Escape closes the
      menu and returns focus **to the trigger**; a click outside closes it and does not activate anything;
      activating an item closes the menu and leaves focus somewhere predictable, which frontend states per item
      and QA asserts (never `<body>`). Tab while the menu is open does not leave focus inside a closed menu.
- [ ] 39. **Delete task reads as destructive without relying on colour alone.** The `Delete task` item's
      computed `color` resolves from `--destructive` (group P measures it) **and** it is distinguishable from
      the other two items by something other than hue — position plus its own wording at minimum; frontend
      states which. No `confirm()`, no dialog, no inline confirmation: the undo toast of group K is the whole
      safety net.

### J. Subtasks in the surface
- [ ] 40. **Add subtask inserts one indented empty row under its parent, focused.** It appends an empty row at
      the end of that parent's children, the new row's input has focus, the row is visually indented relative
      to its parent (its input's left edge is strictly greater than the parent input's at 320 px and 1280 px —
      QA reports both offsets), and it carries its own checkbox and inline input. It is not stored until it has
      text (criterion 31).
- [ ] 41. **Subtasks are one level deep in the surface too.** A subtask row's kebab offers **no** `Add
      subtask` item (two items, not three), so the surface cannot ask the repository for a depth the repository
      would reject. Its other two items work exactly as on a parent.
- [ ] 42. **A subtask's own controls work independently.** Its checkbox toggles only its own completion
      (criterion 36), its input persists under the same debounce and keyboard rules as a parent's (criteria
      25-32, re-run on a subtask row), and its drag handle reorders it among its siblings only — dropping it
      outside its parent's group is not possible by pointer or by keyboard, and attempting it leaves the stored
      order unchanged.

### K. Duplicate, delete and the undo toast
- [ ] 43. **Duplicate, from the surface.** Duplicating a parent with two children inserts the copy directly
      below the original with both children, in the original's relative order, and the list shows four new rows
      in the right places without a reload. The copies' titles equal the originals'. A reload agrees
      (criterion 13 is the stored half; this is the rendered half).
- [ ] 44. **Delete removes the row at once and shows an undo toast for five seconds.** `Delete task` removes
      the row (and its children) from the list immediately, shows exactly one toast containing an `Undo`
      control, and the toast disappears on its own between 5.0 s and 6.0 s after the delete with nothing else
      written. QA reports the measured dismissal time. Focus is **not** stolen into the toast; after the
      delete, focus lands on a row in the list or on "+ Add Task", never `<body>`.
- [ ] 45. **Undo restores the task and its children.** Activating `Undo` inside the window restores the row
      with the same title, completion state and position among its siblings, and its children under it
      (criterion 14 is the stored half). Undo is reachable by keyboard: Tab from the post-delete focus position
      reaches it within three stops, and Enter activates it. The toast is announced by a live region whose
      politeness frontend states; it is not a `role="dialog"` and does not trap focus.
- [ ] 46. **When the window expires the delete stands.** Five seconds after a delete with no Undo: the toast is
      gone, the task is absent from the `tasks` table, Undo is unreachable by any route, and no further write
      has happened. A reload **inside** the window also lets the delete stand — nothing about a pending undo is
      persisted — and shows no toast.
- [ ] 47. **A second delete inside the window commits the first.** Deleting task A then task B two seconds
      later: exactly **one** toast is on screen (not two stacked), its Undo restores **B** only, A stays
      deleted, and A's row does not reappear. QA asserts the toast count as 1, because two stacked toasts on a
      320 px viewport is the failure mode this rule exists to prevent.

### L. Drag
- [ ] 48. **Drag is by the handle only.** A pointer drag started on the handle reorders; the same gesture
      started on the row's input, its text, its checkbox or its kebab reorders **nothing** and leaves the stored
      order unchanged — and dragging across the title text selects text, as it would in any input. The handle
      is a focusable element with an accessible name that names the task and announces how to reorder with the
      keyboard. There is still exactly **one** `DndContext` in `app/`, `components/` and `widgets/`.
- [ ] 49. **Keyboard drag works end to end.** From the focused handle: Space or Enter picks up, ArrowUp /
      ArrowDown move, Space or Enter drops, Escape cancels and returns the row to its original position; focus
      stays on the handle through all of it; and each step produces a live-region announcement naming the task
      title and its 1-based position (the announcements already in `components/TaskChecklist.tsx:111-133`,
      re-run against the new row). The stored order after a drop matches the rendered order.
- [ ] 50. **Reordering persists immediately and subtasks travel with their parent.** A drop writes the new
      order before the toast-free list settles — a reload within 100 ms of the drop shows the new order.
      Dragging a parent with two children moves all three together and leaves the children's relative order and
      their `parentId` unchanged; no drag can place a row between a parent and its own children.

### M. Density and the phone fold
*This is the headline risk. Task 015's commit `4ca861e` fought to get the timer above the fold on a 320 px
phone, and this panel starts with three rows, grows without a cap and carries 44 px targets. DECISIONS
2026-10-28 records Start not being pressable on a phone as exactly this mistake in a different corner, so this
group is measured, not eyeballed.*
- [ ] 51. **Every interactive element in the panel is at least 44 x 44 CSS px** at 320, 375 and 1280 px, on a
      top-level row and a subtask row, with the kebab menu closed and open. **Measured on the labelled cell,
      not the bare input**: 014's notes record the checkbox's own `getBoundingClientRect()` as 24 px while its
      label cell is the 44 px target, so a probe that reads the input reports a false failure. QA states which
      element it measured per control.
- [ ] 52. **Nothing is clipped, nothing overlaps, and the title never collapses.** At 320, 375 and 1280 px
      with three tasks, one of them carrying a 100-character unbroken title: every control's rect is fully
      inside its row's rect and inside the viewport width, no two controls in a row have intersecting rects,
      and the title input's bounding box is **at least 120 px wide at 320 px** and never 0 at any width. Where
      the 120 px comes from: at 320 px the row's inner width is about 248 px (320 − `main`'s `px-4` 32 −
      Surface `p-3` 24 − row `p-2` 16), which gives up 44 px to the checkbox cell, 44 px to the handle and
      44 px to the kebab plus gaps, leaving roughly 100-130 px — so 120 px is the floor and a failure here
      means the four-control row does not fit and the owner has a layout decision to make, not a bug to patch.
      QA reports the measured title width at each width rather than only pass/fail.
- [ ] 53. **The timer is still fully visible without scrolling at 320 x 568**, with the panel shown and three
      empty placeholder rows in it, at `scrollY === 0`. Provenance for the figure: Playwright chromium,
      DPR 1, light theme (default, system), **no background stored**, measured on the timer `Surface`'s
      `getBoundingClientRect()` — the inner `[data-surface]` box, not the outer `<section>` (DECISIONS
      2026-11-06, "it must name the element"). **QA measures the baseline on the handoff tree first**, before
      any 016 frontend change, and reports both numbers: 015's recorded figures (Start at y 341, Surface
      152-710) are stale and must not be quoted. The criterion is that the number does not get worse than the
      baseline and the Surface's bottom edge is ≤ 568.
- [ ] 54. **The list is bounded at every width, and the page is not.** With 50 tasks at 1280 x 800 and at
      320 x 568: the panel's list region has a capped height with internal scrolling, the first and last rows
      are both reachable by scrolling inside it, the page behind it grows no scrollbar because of it, and
      `document.documentElement.scrollWidth <= clientWidth` at 320, 375 and 1280 in every panel state (hidden;
      shown with 0, 3 and 50 tasks; a kebab open; a toast up). QA reports the measured cap and the row height.

### N. Motion, modes and accessibility
- [ ] 55. **`prefers-reduced-motion: reduce` suppresses row add/remove and toast motion.** Under
      `emulateMedia({ reducedMotion: "reduce" })`, adding a row, removing a row and showing the toast each
      produce **zero** `document.getAnimations()` entries with a non-zero duration attributable to the panel,
      and the row and the toast still appear and disappear — suppressed, not broken. Without the override, QA
      states what does animate, so the assertion cannot pass vacuously.
- [ ] 56. **`forced-colors: active`**: in the panel, no text becomes invisible, the checkbox's checked and
      unchecked states are still told apart, the strikethrough cue survives, the drag handle and kebab still
      read as controls, the open menu's items are still distinguishable from its surface, and the toast and its
      Undo control are both visible with an edge (`border: 1px solid ButtonBorder` — a literal colour is
      ignored in that mode, DECISIONS 2026-10-29). Each assertion paired with a default-mode equivalent so it
      cannot pass vacuously. `prefers-reduced-transparency: reduce` is stated as not applying to this surface.
- [ ] 57. **No axe-core violation of serious or critical impact** on `/`, in **light and dark**, at **320 px
      and 1280 px**, in each of: panel hidden; three empty placeholder rows; three tasks none completed; three
      tasks with the first completed; a parent with two subtasks; a row focused mid-edit; a kebab menu open; an
      undo toast on screen; loading; error. Tab order through `/` matches visual order in each. Plus: after a
      1 s settle with the timer **idle** and no toast on screen, two frames of the panel region sampled 1 s
      apart are identical and **zero** `requestAnimationFrame` callbacks fire (timer running is the positive
      control); the only new `setTimeout` this task adds is the debounce and the toast window, both named by
      frontend.

---

## P. Measurement — flat, both themes, no image in the loop (58-59)
*Separate from every behaviour group on purpose (qa cost rule 4): a token change re-runs P and nothing else.
Every figure is a table row — theme, element, **painted pixel RGB**, coordinates, ratio, floor, and the ground
it was taken against. A figure without its provenance does not count: task 010 carried three wrong numbers for
exactly that reason, two read from the wrong pixel and one from the wrong colour (CLAUDE.md "Measurement
ordering"). **No background image is set for any figure here**: with nothing stored `surface-solid` paints
nothing, so a row's ground is `--card` over `--background` and there is no image in the loop (ruling 7). QA
states that explicitly in the report.*
- [ ] 58. **One capture per theme, every pixel sampled in one pass** (qa cost rule 2), reusing the sampler
      already in `e2e/helpers/`. In **light and dark**, at 1280 x 800 DPR 1, with no image stored, against the
      row's painted `--card` ground: the title input's text; **its placeholder text** on an empty row; a
      completed row's struck-through title; the drag handle glyph; the kebab glyph; the "+ Add Task" control's
      text and, if it has one, its border; the open menu's surface (`--popover`) against the row ground, its
      two ordinary item labels, and the `Delete task` item's `--destructive` label on that surface; the toast's
      text and its `Undo` control's label and edge, against whatever the toast actually sits on (QA names it);
      and the focus indicator of each of the four row controls and of `Undo`. Floors: **≥ 4.5:1** for text
      (placeholder text included — it is text), **≥ 3:1** for a control edge or a focus indicator's **outer
      edge against what surrounds it** (narrowed by DECISIONS 2026-10-26: against the ground, not against its
      own fill). Three of these have no existing figure to inherit — the placeholder, the menu surface and the
      toast — so a failure is expected to be found here rather than nowhere.
- [ ] 59. **Full-coverage pixels only, and nothing is thickened pre-emptively.** Per DECISIONS 2026-10-27, a
      stroke's measured value is its **fully covered** pixel, never its antialiasing fringe, and a 1 px stroke
      at a half-pixel offset has no covered row at all. For every 1 px boundary this task adds (the menu's
      edge, the toast's edge, any focus ring), QA reports whether a fully covered row exists at 1280 x 800
      DPR 1 and what it measures. A boundary with no covered row is reported to the orchestrator as a finding
      informing PLAN.md's open 011 R-5 question, not answered here.

---

## Q. Gates, fallout and red-proof (60-61) — shared
- [ ] 60. **No assertion added by this task is phrased as a diff against `HEAD`, `git diff`, or "unchanged
      from the previous commit".** Those invert the moment the work is committed; PLAN.md records three
      instances already. Anything this task needs to pin is pinned **by value**. Baselines (lint warning count,
      test counts, the 320 px timer figure) are measured **on the tree QA is handed**, not on `HEAD`.
- [ ] 61. **Gates pass, the fallout is updated rather than deleted around, and three criteria are red-proofed.**
      - `npm run lint` (0 errors, warnings no higher than the measured baseline), `npm run typecheck`,
        `npm run build` (routes exactly `/`, `/_not-found`, `/settings`, `/stats`), `npm run test` and
        `npm run test:e2e` all succeed. Zero console errors or warnings in both themes across: load `/`, type a
        title, Enter, Escape, Backspace an empty row, tick, open the kebab, add a subtask, duplicate, delete,
        undo, drag to the top, hide the panel, reload, show the panel, start / pause / complete a run, flip the
        theme, reload.
      - **The accessible-name re-point** (ruling 4): `e2e/helpers/task-list-dialog.ts:11`'s `TASK_PANEL_NAME`
        becomes `Tasks`, and the four files carrying the literal — `e2e/control-edge-measure.spec.ts`,
        `e2e/task-panel.spec.ts`, `e2e/dark-sweep.spec.ts`, `e2e/token-task-surface.spec.ts` — are re-pointed
        too. Grep for the **string**, not only the constant: that is exactly what the 2026-11-10 entry says the
        last pass got wrong.
      - **The suites the rename and the row restructure invalidate**, so QA inherits a list: every `lib/db`
        suite seeding `done`/`eta`/`position` (`task-repository.test.ts`, `session-repository.test.ts`,
        `background-migration.test.ts`, `upgrade-v5.test.ts`), a new 5 → 6 migration spec,
        `components/TaskForm.test.tsx` (the ETA field goes), `e2e/task-panel-behaviour.spec.ts` and
        `e2e/task-panel.spec.ts` (the eight-control row is now four), `e2e/task-list.spec.ts`,
        `e2e/accessibility.spec.ts`, `e2e/focus-cycle.spec.ts`, `e2e/dark-*.spec.ts`,
        `e2e/token-task-surface.spec.ts`, `e2e/uploaded-background*.spec.ts`, and
        `components/palette.tokens.test.ts` / `components/focus-cycle.guards.test.ts` (new files must appear in
        the discovered `FILES` set; `ALLOWED_RAW_UTILITIES` stays `{}`; zero raw Tailwind palette classes and
        zero colour literals in every file this task adds or changes, `components/ui/dropdown-menu.tsx`
        included). QA lists **every** changed or removed assertion with its reason and states that none was
        weakened and none removed to make a failure go away. The four vacuity shapes from the 2026-10-09
        DECISIONS entry are banned, and so is `toBeVisible()` on something already true.
      - **Red-proof three, at the cheapest level that discriminates** (qa cost rule 1), naming the level: the
        v6 rename on raw rows (6), the per-group `order` invariant (11), and undo restoring a parent with its
        children (14/45). Prefer a unit break and re-run only the spec that covers it; if a break stays green at
        one level and red at another, say which.

## Files likely touched

**Backend (runs first, alone):**
- `lib/db/types.ts` — `Task`/`TaskRecord` re-shaped to the eleven fields; `CreateTaskInput` and
  `UpdateTaskInput` gain `parentId`, `emoji`, `color`, `etaMinutes` and lose `eta`;
  `ValidationIssue["field"]` re-pointed; the long `Task` doc comment currently explains the pin, `done` vs
  `completed` and the global `position` invariant, and all three sentences become wrong.
- `lib/db/database.ts` — `CURRENT_SCHEMA_VERSION` 5 → 6; the `.version(6)` block, the restated `tasks` index,
  and `upgradeToVersion6`; the header comment at lines 19-26 that lists what each version does.
- `lib/db/validation.ts` — `validateEta` replaced by an `etaMinutes` validator (optional, minutes);
  validators for `parentId`, `emoji` and `color`; `COMPLETED_MIN`/`COMPLETED_MAX` keep their meaning under
  the new field name.
- `lib/db/task-repository.ts` — every function renamed-through; new create-with-parent, duplicate, cascade
  delete, restore, and within-group reorder; `renumber` becomes per-group; `firstNotDone` reads `completed`.
- `lib/db/session-repository.ts` — lines 48 and 80-81 read and write the pomodoro count by its new name.
- `lib/db/test-utils.ts` — a version-5 seeding helper; `LegacyTask` adjusted again.
- `lib/db/index.ts` — any export the above adds or removes.

**Frontend (after handoff):**
- `widgets/TaskPanel.tsx` — the `<h2>` text and the region's name; its header comment block explains the `xl`
  pin and the hide mechanism and must stay true of the shipped panel (it currently claims the region is named
  by `aria-label`, which the file itself contradicts).
- `components/TaskChecklist.tsx` — the list, the three placeholder rows, "+ Add Task", the row-level keyboard
  routing, the debounce, the delete/undo bookkeeping, the single `role="alert"` line; `TASK_PANEL_HEADING_ID`.
- `components/TaskChecklistRow.tsx` — rebuilt as handle + checkbox + inline input + kebab, with the subtask
  variant; its line-one comment describes a row that no longer exists.
- `components/TaskForm.tsx` — **likely deleted**; with no modal, no add form and no ETA field there is nothing
  left for it to do. Frontend decides and records why.
- `components/ui/dropdown-menu.tsx` — **new**, adapted from shadcn's to Pomotato's tokens (ruling 5).
- A new toast component under `components/` or `widgets/`, and wherever it mounts.
- `components/task-row-styles.ts` — its one shared class string served the old eight-control row; keep,
  re-point or delete, and make the comment true either way.
- `components/CurrentTaskCard.tsx` — field rename only.
- `hooks/use-tasks.ts` — type only; `hooks/` may gain a hook for the debounced row editing.
- `app/globals.css` — **only** if group P cannot be met without a token, which is a blocker to raise first
  (criterion 2).

**QA only:** the `lib/db` suites and a new 5 → 6 migration spec, `components/TaskForm.test.tsx`,
`components/palette.tokens.test.ts`, `components/focus-cycle.guards.test.ts`, `e2e/helpers/task-list-dialog.ts`
and the e2e specs enumerated in criterion 61, a new inline-editing / keyboard spec, a new kebab-and-toast
spec, a density spec, and whatever the existing `e2e/helpers/` sampler needs (extend it; do not write a
second one).

**Not touched:** `lib/timer/**`, `lib/stats/**`, `lib/audio/**`, `lib/preferences/**`,
`hooks/use-timer-clock.ts`, `hooks/use-hydrate-timer-store.ts`, `app/stats/**`, `components/Stats*.tsx`,
`components/SloshGauge.tsx`, `components/HoldButton.tsx`, `components/SettingsPanel.tsx`,
`components/BackgroundControl.tsx`, `package.json`, `package-lock.json`.

## Risks

- **This reverses a nine-day-old ruling, and the reversal must be on the record.** DECISIONS.md 2026-11-06
  ruling 3 removed `emoji` and `colorId` from `Task` and had the `.version(5)` upgrade strip both from every
  stored row; `components/TaskColorDot.tsx`, `components/task-palette-colors.ts` and `lib/db/palette.ts` were
  deleted with it. This task puts `emoji` and `color` back into the schema. It is intentional, but it means
  **the data those fields held is gone** — v5 deleted it, there is no export path until milestone 7, and
  nothing this task does recovers it. A `docs/DECISIONS.md` entry recording the reversal and its cost is owed
  **and is the orchestrator's to write** (neither frontend nor backend edits `docs/`). Note also that `color`
  is a different name from the deleted `colorId`, and nothing in this task says what its values are — only
  that the field exists. The next task has to settle that, and it will have no palette module to settle it
  against.
- **The `completed` collision is the most dangerous thing in this file.** It is a rename that changes a
  field's *meaning*, and the two reads that matter — `lib/db/task-repository.ts:21` and
  `components/TaskChecklist.tsx:55`, both `!task.done` today — type-check perfectly under either meaning while
  answering a different question. They decide which task is current and therefore which task a completed
  session is credited to. Criteria 5, 6 and 10 are the net, and criterion 5's grep for the old names anywhere
  under `lib/`, `app/`, `components/`, `widgets/`, `hooks/` is there because `tsc` will not catch this one.
- **Every seeded-database test now runs the chain 1 → 6.** No test can observe version 5's output any more,
  so any assertion about a mid-chain state has to be made on the final state or not at all. This is the third
  task in a row to hit that, and the third to need the "seed one version below, not fresh at the top" rule.
- **The index moves.** `tasks: "id, position"` becomes `tasks: "id, order"` — the first index change in this
  repo. Dexie handles it inside the version block, but backend must read the versioning guide
  (`node_modules/next/dist/docs/` is for Next; Dexie's own docs for this) and record what happens to the old
  index rather than assuming.
- **Row density at 320 px, again.** Four 44 px controls plus a title in roughly 248 px of inner width is
  tighter than it looks (criterion 52 does the arithmetic), and task 015's eight-control row only fitted by
  wrapping to two lines. If the title cannot hold 120 px, the honest outcome is an owner decision about what
  leaves the row — not a 40 px tap target.
- **The phone fold is a live constraint and its recorded figures are stale.** Commit `4ca861e` ("fit the
  timer above the fold on phones") plus the owner's 2026-11-06 layout pass moved the timer stack's phone
  geometry, and 015's recorded numbers predate it. Criterion 53 therefore requires a baseline measured on the
  handoff tree before anything else, which is also why it must be taken **before** the group P sweep, not
  after.
- **The undo toast is a new interaction class for this app.** Nothing in Pomotato currently shows a transient,
  auto-dismissing, action-carrying message. It is easy to build one that steals focus, that stacks, that
  announces twice, or that a screen-reader user cannot reach before it vanishes. Criteria 44-47 cover the
  behaviour and 58 covers its contrast; what none of them can cover is whether five seconds is long enough for
  a keyboard user to reach `Undo` at all — **open question 4**.
- **`e2e/helpers/task-list-dialog.ts` is load-bearing and misleadingly named.** Fifteen specs import it; it is
  named for a dialog deleted in task 015; and its one `TASK_PANEL_NAME` constant is what the 2026-11-10 entry
  measured at ~157 tests. Re-pointing it is one line and forgetting the four literal copies costs a full
  suite run. Renaming the file is tempting and is **out of scope** — do it in a trivial pass, not here.
- **The working tree is not `HEAD`.** Twenty-three files are modified and uncommitted, including
  `components/TaskChecklistRow.tsx` (which currently renders only a checkbox and a title while still accepting
  nine props it ignores) and `widgets/TaskPanel.tsx` (whose `<h2>` and `aria-labelledby` contradict the
  2026-11-10 ruling). Every baseline in this file — lint warnings, test counts, the 320 px timer figure — is
  to be measured on the tree the agent is handed, and the orchestrator should state at kickoff whether that
  tree is the uncommitted one.
- **Licensing: nothing new ships, and that is the trap.** Glyphs come from `react-icons`; no audio, no font,
  no image, no third icon library. `docs/DECISIONS.md` gains **no** asset provenance entry. The pattern being
  reproduced belongs to someone else — reproduce the interaction, never the pixels, the icons or the copy.
- **Next.js version.** Per `AGENTS.md`, read the relevant guide in `node_modules/next/dist/docs/` before
  touching `app/` or adding a client boundary; the toast's mount point is the kind of thing that wants a
  portal and therefore a client boundary decision.
- **antislop.** This changes a UI surface, copy and mobile layout, so `antislop-ui`, `antislop-copywriting`
  and `antislop-layoutmobile` all apply (R-03: mobile is a distinct state, not a squeezed desktop). Frontend
  confirms the session mode still holds, announces `antislop active: <mode> (<source>).` before its first UI
  edit, and runs the Delivery Gate. The placeholder copy and the toast copy are the two things most likely to
  come out generic.

## Open questions for the owner, to settle at approval

1. **Does `eta` really go?** Ruling 2 deletes every stored pomodoro estimate with no conversion, because the
   owner's field list has no pomodoro estimate in it and converting to minutes would invent data. That is
   permanent data loss for anyone who set estimates. Confirm, or say "keep `eta` alongside `etaMinutes` until
   the next task renders one of them".
2. **The panel's accessible name, and the 2026-11-10 contradiction.** The log says `aria-label="Task list"`
   with `TASK_PANEL_HEADING_ID` deleted; the working tree has the visible `<h2>` and `aria-labelledby` back.
   Ruling 4 goes with the visible heading (because "Tasks" is now visible content) — confirm that, and confirm
   the bottom-right toggle's accessible name moves from "Task list" to "Tasks" with it.
3. **Three placeholder rows: at mount on an empty list, or always padded to three?** Ruling 6 takes the first
   reading. The second never lets the list show fewer than three rows, which makes Backspace on a placeholder
   fight the user.
4. **Is five seconds the undo window, including for a keyboard or screen-reader user?** The requirement says
   five. A keyboard user has to hear the announcement and Tab to `Undo` inside it. Options if not: a longer
   window, a window that pauses while the toast has focus, or Undo also bound to a key.
5. **What are `color`'s values?** The field is stored and unrendered here, so this task does not need the
   answer — but `lib/db/palette.ts` and its eight-swatch set were deleted in task 015, so the next task starts
   with nothing. Flagging it now is cheaper than flagging it then.
