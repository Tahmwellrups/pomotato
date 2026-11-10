---
id: 016
slug: inline-editable-task-panel
status: in-progress # draft | in-progress | qa | review | done | blocked
---

# The task panel becomes an inline-editable list: type in the row, a kebab per row, one level of subtasks, and an undo toast instead of a confirm

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
      visible focus indicator when focused (group P measures it). There is no separate "edit mode": the same
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

## Implementation Notes
(Filled in by backend, then frontend, as they build. Criterion 1 lists what backend must record **before**
frontend starts; criterion 2 gates group P.)

### Backend (016, criteria 1-16) — handed off 2026-11-10

All six items criterion 1 enumerates. Schema is at **version 6**; `PREFERENCES_VERSION`, `package.json` and `lib/preferences/**` are untouched. An omitted optional field is **ABSENT**: the key does not exist on the stored row (and on the returned `Task`). Never `undefined`, never `null`, never a default. `null` appears only as an *input* to `updateTask`, meaning "delete this key".

#### 1. The `.version(6)` block, verbatim (`lib/db/database.ts`)

```ts
this.version(6)
  .stores({
    tasks: "id, order",
  })
  .upgrade(upgradeToVersion6);
```

A literal `6`, beside the unchanged v1-v5 blocks (their `.stores()` arguments are not edited; `tasks: "id, position"` is still the frozen v1 text). `CURRENT_SCHEMA_VERSION = 6`. The highest-literal guard (`if (this.verno !== CURRENT_SCHEMA_VERSION) throw ...`) is unedited and passes. The only version-1 constant, `SCHEMA_VERSION = 1`, stays 1 (it was never the moving constant; no historical block references `CURRENT_SCHEMA_VERSION`, which closes 013's finding 1).

**What Dexie does to the old `position` index** (read from `node_modules/dexie/dist/dexie.js` `updateTablesAndIndexes` and confirmed on a seeded database): when a later version restates `tasks`, Dexie diffs the old and new schemas inside the IndexedDB upgrade transaction. The `position` index is **deleted**, an `order` index is **created**, the primary key `id` is unchanged (changing a primary key is unsupported and throws), and **only then** does the `.upgrade()` callback run, so the callback's `bulkPut` writes rows into the new index. Rows that lack `order` at the moment the index is created are simply not in it until the callback writes them. Verified: after a seeded 5 -> 6 open, `db.table("tasks").orderBy("order")` returns every row and `schema.idxByName.position` is `undefined`.

#### 2. `upgradeToVersion6(tx)` (exported from `lib/db/database.ts`), in order

1. Read every `tasks` row raw. Empty table: return, no write.
2. Capture ONE `Date.now()` for the whole upgrade.
3. Sort rows by `position` (or `order` if already migrated); missing/non-finite last; ties by `id`.
4. Per row: `completed` := `row.done === true` (missing or non-boolean `done` -> `false`); `completedPomodoros` := the old numeric `completed` if it is an integer >= 0, else `0` (null, 7.5, string, negative all -> 0); `order` := dense index, zero-based, **per `parentId` group** (on a v5 database there are no parents, so one group); `createdAt`/`updatedAt` := the one timestamp (kept if the row already holds finite values).
5. Delete `done`, `position`, `eta`. `eta` is **not converted**; `etaMinutes`, `parentId`, `emoji`, `color` are not added (absent).
6. `bulkPut` the result. Never reads or writes `sessions`, `backgrounds` or `appMeta`.

**Idempotent**: a row that already has own property `completedPomodoros` is treated as migrated, so its boolean `completed` is kept instead of being re-read as a count (without that check a second run would zero the counts); `order` is dense so renumbering maps it to itself; timestamps are kept; there is nothing left to delete. **Cannot throw on an old row**: every read is a `typeof`/`isFinite`/`Number.isInteger` check with a fallback; no field is assumed present. Proven on a version-5-seeded database (bad rows: `done` absent, `"yes"`, `completed: null`, `7.5`, missing/duplicate `position`) and by running the callback a second time on its own output (scratch-checked, output unchanged). Version-1 and -3 seeded databases upgrade straight through to 6 (a pin on the task at position 3 gives it `order: 0`, rest dense in prior relative order).

#### 3. Types (`lib/db/types.ts`)

```ts
interface Task = TaskRecord {
  id: string;                 // uuid, never reused
  title: string;              // trimmed, 1-100 code points
  completed: boolean;         // default false; the finished flag. NOT a count.
  order: number;              // dense, unique, zero-based WITHIN a sibling group; indexed
  parentId?: string;          // absent = top level; must name a stored top-level task
  emoji?: string;             // 1-16 code points trimmed. stored, not rendered
  color?: string;             // FREE string, 1-64 chars trimmed, no enum. stored, not rendered
  etaMinutes?: number;        // integer 1-1440. stored, not rendered
  completedPomodoros: number; // integer 0-999, default 0
  createdAt: number;          // epoch ms, never changes (a restore keeps it)
  updatedAt: number;          // epoch ms, >= createdAt, moves only on a real write
}
interface TaskTree { task: Task; children: Task[] }   // children empty for a subtask
interface CreateTaskInput { title: string; parentId?: string; order?: number; emoji?: string; color?: string; etaMinutes?: number }
interface UpdateTaskInput { title?: string; emoji?: string | null; color?: string | null; etaMinutes?: number | null; parentId?: string | null }
ValidationIssue["field"] = "title" | "emoji" | "color" | "etaMinutes" | "parentId"   // no "eta"
```

- `CreateTaskInput.order` is an insertion index in the sibling group (clamped, later siblings shift down); omitted = last. Non-integer -> `InvalidReorderIndexError`. This is how the surface stores a row typed in the middle of the list.
- `UpdateTaskInput`: `null` removes the key. `parentId: "<id>"` moves the task to the END of that group and renumbers both groups; `parentId: null` promotes to top level, last. Rejected (`TaskValidationError`, field `parentId`, nothing written) when the target is missing, is itself a subtask, is the task itself, or the task has children. **The surface does not need this** (promote/demote is out of scope); it exists because criterion 12 needs a path by which "a task that has children cannot be given a parentId" can be asserted.
- `updateTask` and `createTask` ignore every key outside their input types (so `done`, `eta`, `position`, `emoji` on a row that way, `colorId`, `id` etc. are never stored) and never throw for them.
- `completed`, `completedPomodoros` and `order`-within-group are not reachable through `updateTask`.
- Errors: `TaskValidationError`, `TaskNotFoundError`, `InvalidReorderIndexError`, and **`InvalidCompletedValueError`** (renamed from `InvalidDoneValueError`).

#### 4. Repository API (import from `@/lib/db`, no Dexie needed)

```ts
createTask(input: CreateTaskInput): Promise<Task>                      // top-level, or subtask via parentId; insertion index via order
updateTask(id: string, input: UpdateTaskInput): Promise<Task>          // rename etc.; no-op write guard returns the stored row
setTaskCompleted(id: string, completed: boolean): Promise<Task>        // renamed from setTaskDone; no cascade either way
reorderTask(id: string, toIndex: number): Promise<Task[]>              // WITHIN the task's sibling group; a parent carries its children; returns display-ordered list
duplicateTask(id: string): Promise<TaskTree>                           // copy directly below; parent copies its children; subtask copy touches only its group
deleteTask(id: string): Promise<TaskTree>                              // was Promise<void>; now returns what it removed (parent + children) for undo
restoreTask(tree: TaskTree): Promise<Task>                             // undo: same ids/createdAt/fields, recorded order clamped to group length, children back under it
incrementCompleted(id: string): Promise<Task>                          // completedPomodoros + 1, clamp 999
decrementCompleted(id: string): Promise<Task>                          // completedPomodoros - 1, clamp 0. NO consumer after this task; kept, not deleted, per ruling 2. Route as maintenance.
listTasks(): Promise<Task[]>                                           // display order: top level by order, each parent's children right after it
getCurrentTask(): Promise<Task | null>                                 // first NOT completed in display order
```
Also exported from `lib/db/task-repository.ts` (not re-exported by `index.ts`): `displayOrder(rows)`, `firstNotCompleted(rows)`, `normalizeTask`.

- **Restore twice is a NO-OP**, not a rejection: if a row with the task's id is stored, nothing is written and the stored task is returned. Restoring a subtask whose parent is gone (or is itself a subtask) throws `TaskNotFoundError(parentId)`, writes nothing.
- **Undo for "second delete commits the first"** is entirely the surface's: backend keeps no pending state. Frontend holds the one `TaskTree` it got back from `deleteTask`.
- `updatedAt` moves on: rename, complete toggle, increment/decrement, reorder (every row whose `order` changed, including the displaced ones), duplicate (the later siblings it shifts), delete (the later siblings it shifts down), restore (restored rows and the siblings it shifts), `logCompletedSession`'s increment. A write that changes nothing writes nothing. `updatedAt` is `max(Date.now(), previous + 1)`, so it is strictly later even inside one millisecond.
- **Ambiguity for QA, decided here**: criterion 13 says originals are byte-identical "except where the shift changed their `order`", criterion 15 says a duplicate's shift moves `updatedAt`. A shifted row is rewritten, so it differs in `order` **and** `updatedAt`; compare it with `updatedAt` excluded. The duplicated source itself is not touched.
- `logCompletedSession` now credits `firstNotCompleted(...)` (display order, so a subtask can be current) and increments `completedPomodoros`, bumping `updatedAt`.

#### 5. Seeding a version-5 database

`seedVersion5DatabaseForTests(data: { tasks: Array<Record<string, unknown> & { id: string }>; sessions?: SessionRecord[]; backgrounds?: Array<Record<string, unknown> & { id: string }> }): Promise<void>` in `lib/db/test-utils.ts`; same shape as `seedVersion4DatabaseForTests`. It deletes the database and creates one that exists ONLY at version 5 (v1-v5 stores, no upgrade callbacks, `tasks` indexed by `position`), so rows land exactly as seeded; the next `openDatabase()` runs `upgradeToVersion6`. Read back with `(await openDatabase()).table("tasks").toArray()`. The version-1, -3 and -4 seeders still work unchanged and now upgrade through to 6, so **no test can observe a mid-chain state**. `LegacyTask` (the version-1 seeder's row type) is now an explicit `{ id, title, eta, completed: number, position, emoji, colorId }`.

#### 6. Red on the handoff tree, and why

Baseline before my change (measured by stashing): 5 failing tests in 2 files (4 in `components/TaskForm.test.tsx`, 1 in `components/focus-cycle.guards.test.ts`), already red and not mine. On the handoff tree `npm run test` is **55 failed / 1095 passed (1150)**, 8 files:
- `lib/db/task-repository.test.ts` (33): seeds/asserts `eta`, `done`, `position`, numeric `completed`; calls `setTaskDone`/`InvalidDoneValueError`; the v5 "never stores emoji/colorId" cases assert the old `eta` default.
- `lib/db/session-repository.test.ts` (7): reads `task.completed` as a count, `done`, and "version 4 upgrade" shape.
- `lib/db/upgrade-v5.test.ts` (6): asserts `verno === 5`, and the rows' `eta`/`done`/`position` after the open; a seeded open now runs through to 6.
- `lib/db/background-migration.test.ts` (1), `lib/db/background-repository.test.ts` (1): assert the old task shape / `verno` after a seeded open.
- `components/panel-only.guards.test.ts` (2, task 015 criterion 5): `lib/db` now contains `validateEmoji` again and `ValidationIssue["field"]` is no longer `"title" | "eta"`. This is the intended reversal of 015 ruling 3; QA re-points the guard.
- `components/TaskForm.test.tsx` (4) and `components/focus-cycle.guards.test.ts` (1): pre-existing, not caused by this change.
Non-test red: `npm run typecheck` errors in `components/TaskChecklist.tsx` (imports `setTaskDone`, reads `task.done` at line 55 — line 55 `tasks.find((task) => !task.done)` is the current-task read; it must become `!task.completed` against the NEW boolean (same answer as before), and no read of `task.completed` anywhere may still mean the old pomodoro count), `components/TaskChecklistRow.tsx` (`task.done`, `task.eta`) and `components/TaskForm.tsx` (indexes by the old `ValidationIssue["field"]`). `npm run build` fails for the same reason (`setTaskDone` export missing). All three are frontend's.

Gates run on this tree: `npm run lint` 0 errors, 37 warnings (all in test files, none in files I touched; baseline not separately measured); `npm run typecheck`: 0 errors under `lib/` outside tests, errors only in the components and test files named above.

### Frontend (016, criteria 17-57)

antislop ran in `during` mode (session override). Design Read: task panel inside an existing cozy, calm, minimalist app (DESIGN.md), dial ENERGY 1 / RHYTHM 1 / MOTION 1: no new colour, no new token, motion limited to a 150 ms toast fade and the menu's 100 ms fade, both off under reduced motion. Nothing in `:root`, `.dark` or `app/globals.css` moved.

**Component structure**
- `widgets/TaskPanel.tsx`: `<section aria-labelledby>` plus the rendered `<h2>Tasks</h2>`; the `<ul>` has no name. Surface padding is `p-2` below `sm` and `p-3` from `sm` up (needed for the 320 px title width, see M below). Header comment rewritten to match.
- `components/TaskChecklist.tsx`: the list, the write queue, the drafts, the undo state, the single `role="alert"` line, the one `DndContext`. Still exports `TASK_PANEL_HEADING_ID`.
- `components/task-rows.ts`: pure. `buildBlocks` merges stored tasks and drafts into top-level blocks that own their subtasks; `insertDraft`, `flattenBlocks`, `ordinalNames`.
- `components/TaskChecklistRow.tsx`: one `<li>` per row: handle, checkbox cell, `<input type="text">`, kebab. A parent's subtask `<ul>` is rendered inside the parent's `<li>`, so one drag moves the block. Exports `RowModel`.
- `components/TaskRowMenu.tsx` + `components/ui/dropdown-menu.tsx` (new, `radix-ui`'s `DropdownMenu`, tokens only, same "future `shadcn add` is a conflict" header as `dialog.tsx`).
- `components/UndoToast.tsx`, `hooks/use-inline-title.ts` (new). `components/task-row-styles.ts` now holds `rowIconButtonClass` (handle and kebab only); its comment is true of that.
- `components/TaskPanelToggle.tsx`: `aria-label="Tasks"`. The string `Task list` no longer appears under `app/`, `components/`, `widgets/`, `hooks/` outside test files.
- `components/CurrentTaskCard.tsx` needed no edit: it reads `task.title` only. `hooks/use-tasks.ts`: one stale comment re-pointed.
- `components/TaskForm.tsx` **deleted**. With no add form, no modal and no ETA field nothing imports it. Consequence for QA: `components/TaskForm.test.tsx` now fails to import (2 tsc errors, 1 failed file) and goes with it.

**The `completed` line.** `TaskChecklist.tsx` picks the current task with `tasks.find((task) => !task.completed)`. Every `.completed` read under `components/ widgets/ hooks/` is the boolean (grep: 4 hits, all boolean). `completedPomodoros` is not read anywhere in the frontend.

**Drafts, keys and the write queue.** A row with no text is a *draft*, held only in panel state; it is never written. The first non-empty title creates the task in place: `createTask({ title, order: <stored siblings above it>, parentId? })`. The row keeps its draft key as its React key and drag id after the write (`draftTaskIds` maps draft key to task id), so the input is the same DOM node before and after and the caret never moves. Every write (title, tick, duplicate, delete, restore, reorder) goes through one promise queue, so a row's create always lands before anything that depends on it. `insertDraft` re-anchors blank rows already waiting under the same row so blanks stay at the end of what was typed above them.

**Debounce and flush points** (the two `setTimeout`s this task adds, per criterion 57): the title debounce, `TITLE_DEBOUNCE_MS = 300` in `hooks/use-inline-title.ts`; and the undo window, `UNDO_WINDOW_MS = 5000` in `TaskChecklist.tsx`. Flush immediately on: blur, Enter, unmount (panel hidden), `pagehide` and `beforeunload`. Verified by hand: type then hide the panel at once, type then reload at once, both stored. `beforeunload` was added because `pagehide` alone lost the write in a reload test; both are best effort by nature. An empty or whitespace value is never sent to `save`; a stored row left empty goes back to its stored title on blur. Title `maxLength` is 100 UTF-16 units, which cannot exceed the repository's 100 code points.

**Undo bookkeeping.** `deleteTask` returns the removed `TaskTree`; the panel keeps exactly one in `undo` state with its message. A second delete replaces it, which is the whole of "commits the first" (the first is already deleted, the panel just forgets its tree), and the timer effect restarts, so there is one toast and the full 5 s for the newest. `Undo` calls `restoreTask(tree)`, clears the tree, and asks for focus on the restored row. Expiry only clears state; it writes nothing. **Nothing is persisted, so a reload inside the window lets the delete stand and shows no toast** (the toast is component state). `deletedIdsRef` makes a late title flush for a deleted row a no-op instead of a write-failure alert.

**Toast live region.** `<div role="status" aria-live="polite" aria-atomic="true">` is always mounted and the toast is inserted into it (a live region must exist before its content appears to be announced). Polite, not assertive: the delete is the user's own action, and assertive would cut across the screen reader reading out where focus just landed. Not a dialog, never takes focus. Note for QA: `role="status"` count on `/` goes up by one (`focus-cycle.guards.test.ts` pins that set).

**Focus after a delete (criteria 44, 45, 27).** Menu `Delete task`: focus goes to "Add task", which is directly before the toast in DOM order, so Undo is one Tab stop away. Backspace on an empty row: focus goes to the previous row's input, caret at the end, **as criterion 27 requires; in that case Undo is not within three Tab stops** unless the deleted row was near the end of the list. Criterion 45's three-stop budget is therefore met on the menu path and not on the Backspace path; the two criteria cannot both hold for a Backspace delete without a focus steal or a new shortcut, and neither is allowed. Backspace on the first row (when another row exists) lands on the next row. Add subtask: focus goes to the new subtask's input. Duplicate: focus returns to the row's kebab (Radix default).

**Where criteria read differently from what shipped**
- 17: the three-placeholder seeding, `<h2>` and landmark are as written.
- 20/48: the handle's accessible name is `Reorder <title>`; the "how to reorder with the keyboard" half is carried by dnd-kit's `aria-describedby` instructions (accessible description), not packed into the name. Name plus description is the usual pairing; say if the name itself must carry it.
- 21: `<input type="text">`, not `<textarea>`, because a title is single line and Enter has to mean "next row". `text-base` (16 px) so iOS does not zoom on focus.
- 23: placeholder is `What’s your priority?` with the typographic apostrophe (U+2019). The input's accessible name is `Task N` or `Subtask N of task M` (stable, does not change as you type).
- 25: Enter on a parent that has subtasks inserts the new top-level row after its last subtask (stored order puts a sibling there; "directly below" visually would put it between parent and children).
- 26: Escape restores the title the row had when focus arrived, and writes it back if the debounce already stored part of the edit. For a row born in the current edit (baseline empty) it can only discard the not-yet-written text.
- 27: Backspace with `event.repeat` set does not delete the row, so holding Backspace through a title stops at the empty row.
- 35: no visible "Current task" badge (the row has no room for one). The current task is `aria-current="true"` on its `<li>`, a `border-primary` edge on the row and `font-semibold` title. Old e2e that looks for the badge text needs re-pointing.
- 36: no progress or count text anywhere.
- 38/39: opening by click, Enter or Space focuses the first enabled item (Radix only does that for the keyboard, so `dropdown-menu.tsx` redirects the container's first focus). Arrow keys wrap (`loop`). The menu is **non-modal with an invisible full-screen click-catcher** behind it: Radix's modal mode `aria-hidden`s the page while leaving it focusable, which axe reports as serious `aria-hidden-focus` (8 nodes, measured). The catcher keeps "click outside closes and activates nothing" (checked: clicking the page with the menu open leaves a checkbox unchanged). `Delete task` is told apart by position (last, after a separator), wording and a bin glyph, not hue alone. Per-item focus: Add subtask to the new input, Delete to "Add task" (or to a neighbouring row for an unsaved blank), Duplicate back to the kebab.
- Unsaved blank rows: handle and checkbox are `disabled` and `Add subtask` and `Duplicate` are disabled menu items, because there is no task to act on. Their droppable is disabled so a drag cannot target a blank. Still exactly three `role="menuitem"`s on a stored top-level row, two on a subtask.
- 40/41/42: subtasks are indented 16 px below `sm`, 24 px from `sm`; subtask kebab has two items.
- 48: one `DndContext`; collision detection and the keyboard coordinate getter are restricted to the dragged row's own group (`parentKey` on the sortable data), so a subtask cannot be dropped among top-level rows and a parent never lands between a task and its children. `sortableKeyboardCoordinates` was not reusable because it looks at every droppable.
- 50: blank rows hanging below a dragged row are re-anchored to the row that was above it, so they do not ride along with the drop. A reorder is enqueued on drop; the reordered order is shown from local state until the next query result, and dropped on failure.
- 54: the list scrolls internally at every width: `max-h-[min(22rem,50dvh)]` below `xl`, the existing panel `max-height` at `xl`. Measured: 1280x800 cap 362 px; 320x568 cap 284 px, 50 rows, `scrollWidth == clientWidth`. At 320 the page itself was already taller than the viewport, and it grows from 914 to 1032 px as the list fills to its cap (the cap, not the row count).
- 55: only the toast (`animate-in fade-in-0`, 150 ms) and the menu (100 ms) animate; both carry `motion-reduce:animate-none`. Rows add and remove with no animation at all. Verified: zero `document.getAnimations()` under `reducedMotion: "reduce"` with a toast up.
- 56: menu items take `Highlight`/`HighlightText` under forced colors; row buttons and "Add task" get a border; the toast and `Undo` have real 1 px borders. Not exercised beyond a screenshot of the menu.

**Layout numbers measured by hand (not QA's sweep).** 320 px: handle 44, checkbox cell 44, kebab 44, title input 136 px on a top-level row and 120 px on a subtask row (floor met exactly on subtasks). That needed the row to carry no padding of its own and the Surface to use `p-2` on phones. Timer Surface at 320x568 with three placeholder rows: bottom edge at y 542 (<= 568); the panel is below the timer, so rows never move it. 1280: inputs 44 px tall.

**axe-core by hand** (light 320, dark 1280): placeholder rows, three tasks with one completed, menu open, toast up: no serious or critical violation; only the moderate page-level `region` (and `page-has-heading-one` before the menu opened), neither new.

**Gates (real numbers).**
- `npm run lint`: 0 errors, 20 warnings, all in `e2e/` and test files; none in files I touched.
- `npm run typecheck`: 41 errors, **0 outside tests**: 39 in `lib/db/*.test.ts` (backend's list) and 2 in `components/TaskForm.test.tsx` (its import of the deleted file).
- `npm run build`: compiles; fails at the TypeScript phase on those same 41 test-file errors, because `next build` type-checks test files. Not green and not fixable without editing tests.
- `npm run test`: 58 failed, 1094 passed (1152). Frontend-attributable reds, all QA to re-point: `TaskForm.test.tsx` (file gone); `panel-only.guards.test.ts` criterion 42 (`setTimeout` in `TaskChecklist.tsx`, the named toast window) and criterion 18 (reads deleted `TaskForm.tsx`); `TaskPanel.tokens.test.ts` and `token-foundation.test.ts` (read deleted `TaskForm.tsx`); `palette.tokens.test.ts` ("every swept file is in the discovered set": new files `TaskRowMenu.tsx`, `UndoToast.tsx`, `task-rows.ts`, `ui/dropdown-menu.tsx`); `focus-cycle.guards.test.ts` (new `role="status"` live region; was already red before this task). `token-dark.test.ts` criterion 30 was red on a `bg-border` separator in `dropdown-menu.tsx`; fixed (hairline is now `border-t border-border`); the file now passes (94/94). The remaining reds are backend's `lib/db` list.

**Delivery Gate (antislop).** Hard Gate: R-02 PASS (grep for the em dash character in every file I wrote: none), R-03 PASS (320/375-class width: no horizontal overflow, 44 px targets), R-25 PASS by token (all text on existing AA tokens; group P measures it), R-26 PASS (every control acts: handle drags, checkbox ticks, kebab items add/duplicate/delete, Undo restores, Add task appends), R-27 PASS (loading, error and empty copy present), R-32 PASS (every control Tab-reachable, 2 px focus ring on each, no `outline: none` without a replacement), R-34 PASS (light and dark both screenshotted and axe-run), R-35 PASS (ran it; click-through list below), R-23/R-38 PASS (no asset invented; glyphs from `react-icons/ri`). Purpose-Gate: R-04 PASS (Remix drag/more/add/copy/bin glyphs, each literally what the control does; no `lucide-react`), R-10 PASS (no new blur), R-12/R-13 PASS (menu has one `shadow-md` as an elevation marker over the panel; no glow), R-19 PASS (the two fades signal "this just appeared", off under reduced motion). Liveliness/quality locks: focal point stays the timer; accent unchanged (amber for the checked box and the current row's edge); no new palette colour, no pill-everything, copy is plain ("What’s your priority?", "Add task", "Deleted “x”", "Undo", "No tasks yet. Add one below.").
Click-through (Playwright, chromium, throwaway scripts outside the repo): type, Enter, Escape, arrows, Backspace on empty/stored rows, tick, kebab by click and Enter, add subtask, duplicate, delete then Tab to Undo then Enter, 5.36 s dismissal, drag by pointer and by keyboard (parent with children, and a subtask within its group), 50 rows, hide/show, reload; zero console errors or warnings.

**Not done / for QA and the orchestrator**
- `decrementCompleted` has no consumer (backend's note stands).
- Not measured: group P figures, 375 px, reduced-transparency (not applicable), a real screen reader.
- The 100 ms reload-after-drop and reload-after-typing cases are best effort in the browser, as above.

## Orchestrator notes at the backend handoff (2026-11-10)

Backend's gate numbers re-run independently, per DECISIONS.md 2026-10-07. They hold:

- `npm run typecheck`: **47 errors** — 39 across four `lib/db/*.test.ts` files, 8 in
  `components/TaskChecklistRow.tsx` (5), `components/TaskChecklist.tsx` (2) and `components/TaskForm.tsx` (1).
  Nothing under `lib/` outside tests.
- `npm run test`: **54-55 failed / ~1096 passed (1150)** across 8 files. The count moves by one between runs,
  so **one of these is flaky** and nobody has identified which; QA should pin it rather than re-run until it
  passes.
- `npm run build`: **fails** — `Export setTaskDone doesn't exist` in `components/TaskChecklist.tsx`. Frontend's.
- The **5 reds that predate this task** are confirmed pre-existing and are *not* schema fallout: 4 in
  `components/TaskForm.test.tsx` (`Cannot read properties of null` — the tests reach for the ETA field the
  owner's amend commit `834f0fd` already removed) and 1 in `components/focus-cycle.guards.test.ts` (the task
  013 criterion 33 live-region pin). They are QA's to re-point, and `TaskForm.test.tsx` probably dies with
  `TaskForm.tsx` itself.

Three things QA inherits, which are not in the criteria:

1. **The 5 → 6 upgrade currently has no committed test.** Backend proved it against a version-5 seed in a
   throwaway it then deleted, which under this project's own rule (DECISIONS.md 2026-10-07, "an uncommitted
   throwaway is not evidence") means the upgrade ships unproven. **QA writes the committed version-5-seeded
   migration spec**, covering what the throwaway covered: bad `done`/`completed`/`position` values, the `order`
   index returning every row with `position` gone, a second callback run changing nothing, and version-1 and
   version-3 seeds upgrading straight through to 6.
2. **Criteria 13 and 15 conflict slightly, by backend's own account.** A sibling shifted by a duplicate,
   delete, restore or reorder is rewritten, so its `order` *and* its `updatedAt` both change. Compare those
   rows with `updatedAt` excluded; do not weaken either criterion to make them agree.
3. **`decrementCompleted` has no consumer left.** Kept deliberately under ruling 2 rather than deleted mid-task.
   Routed to PLAN.md Maintenance when this task closes — not frontend's to call, not QA's to test.

Accepted as backend's call, overruleable later: `emoji` 1-16 code points, `color` a free string of 1-64
characters, `etaMinutes` an integer 1-1440; omitted optionals stored **absent**, with `null` meaningful only as
an `updateTask` input meaning "delete this key"; `updateTask` accepts `parentId` (criterion 12 needs some path
to assert against, and the surface does not call it); `deleteTask` returns the `TaskTree` it removed and
`restoreTask(tree)` is idempotent.

## QA Report
(Filled in by qa.)
- Verdict: PASS | FAIL
- Tests added:
- Repro steps for any failure:

## Review Findings
(Filled in by reviewer.)
- Verdict: APPROVE | CHANGES REQUESTED
- Findings:

## Proposed PLAN.md entry
Insert after the `- [ ] **014. Visible task checklist.**` entry (currently `docs/PLAN.md:68-72`). Note that
**task 015 has no PLAN.md entry at all** — only its deferred measurement items appear, under "Deferred from
tasks 014 and 015" — so the orchestrator may want to add one for 015 at the same time.

```markdown
- [ ] **016. Inline-editable task panel.** ([docs/tasks/016-inline-editable-task-panel.md](tasks/016-inline-editable-task-panel.md))
      Owner requirements, 2026-11-10. The panel is retitled "Tasks" and becomes an inline-editable list:
      borderless text inputs, a per-row kebab on `radix-ui`'s `DropdownMenu`, one level of subtasks,
      duplicate, delete with a 5 s undo toast instead of a confirm, and drag by the handle only. Schema
      **5 → 6** adopts the owner's field names (`completed` becomes the boolean, `completedPomodoros` the
      count, `order` replaces `position`, `eta` goes), adds `parentId`, `createdAt`, `updatedAt`, and brings
      back `emoji` and `color` nine days after 015 stripped them. 61 criteria. **Backend goes first and
      alone**: the rename re-points five stored fields at once and the `completed` collision type-checks
      silently at `!task.completed`, which is the line that decides which task a session is credited to.
```
