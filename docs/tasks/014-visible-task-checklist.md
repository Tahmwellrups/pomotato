---
id: 014
slug: visible-task-checklist
status: draft # draft | in-progress | qa | review | done | blocked
---

# An always-visible task checklist at the lower left, with a real done tick and no pin

## Goal
The task list stops being something she has to open. It renders permanently on `/` at the lower left,
each row carries a checkbox meaning *this task is finished*, the rows can still be rearranged, and the
topmost unfinished task is the current task — which is what the timer credits and what the card above the
timer names. The pin is removed from the data model; **reordering is now the only way to change which task
is current.** Done means: she can see her list, tick a task off, drag the one she wants to the top, and the
timer follows — with no second source of truth for "current".

## Provenance
Owner feedback, 2026-10-28, their **second** priority of three:

> "Task List (2nd priority) - the task list should not be hidden and will be visible on the lower left of
> the screen and they should be able to check it, like a checklist, if the task is completed. They still
> should be able to rearrange the tasks and the first one should be shown as the current task."

This is the third of three tasks from one round of feedback. **012** (full-opacity background and the
surface system) lands first because it moves the ground every painted figure is read against; **013** (the
focus cycle) is next; this one lands last, because it consumes 012's solid-surface token and because it is
the only one of the three with a schema change.

Task 004 explicitly deferred this: its interpretation decision 2 reads *"'Checklist' means the existing
list moved into the popup … It does **not** mean adding a done/ticked state. A tick-off state is a new
field, a Dexie v3 schema bump, and a migration … If the owner wants tick-off behaviour, it becomes its own
task with its own backend pass."* This is that task. The version number is 4, not 3, because task 010 used
3 for `backgrounds`.

## Settled, do not reopen

### 1. Owner decision, 2026-10-28: the pin is dropped from the data model entirely.
**The current task is derived from the list order. Reordering is how you change which task is current.**
The owner was shown the alternative — keeping the pin as an override on top of the order — and rejected it,
on the grounds that two sources of truth for "current" is the exact thing the pin was designed to avoid.

`lib/db/types.ts:4-11` currently argues the opposite, in a comment on `Task`:

> *"The pin is deliberately not a field here — see `AppMetaRecord` — so that 'exactly one task pinned' is a
> structural property of the data (a single nullable reference) rather than an invariant the write path has
> to police across many rows."*

**That reasoning is superseded by a different structural guarantee, not abandoned.** `position` is already
dense, unique and zero-based *by construction* — `task-repository.ts:19-21`'s `renumber` re-derives the
whole assignment on every structural write, which is why task 002 could promise "positions stay unique after
any sequence of 50 random moves". So "the first task in display order" is a pure function of the sorted
list: there is exactly one or none, and there is no write path that could leave two or zero. The invariant
is still structural; it just now lives in the ordering rather than in a nullable reference. **That stale
comment is rewritten as part of this task** (criterion 14) rather than left to make the next reader think
the pin was removed by accident.

### 2. pm ruling, resolving the contradiction in "position 0 is current": **current = the first task that is not done.**
"Position 0 is current" and "a finished task gets ticked" contradict each other the moment the top task is
ticked. The orchestrator asked for this settled, so it is settled here:

> **The current task is the first task in display order whose `done` is false. When every task is done, or
> the list is empty, there is no current task.**

When nothing is ticked, that *is* position 0, so the owner's "the first one should be shown as the current
task" holds literally in the normal case, and holds in spirit once something is ticked ("the first one still
to do").

**Rejected, with the reason, so nobody re-proposes it:** *auto-sorting done tasks to the bottom.* It
rewrites `position` behind her back, which fights the one interaction the owner explicitly asked to keep
("they still should be able to rearrange the tasks") and makes "rearranging decides what's current" a lie —
she drags a task to the top, ticks the one above it, and the list reshuffles itself. A done task **keeps the
position she put it in** and is marked done in place.

**Consequences, all of which are criteria below:**
- Ticking the current task immediately promotes the next unticked task, with no reload, in the panel and in
  `CurrentTaskCard` at once (criterion 24).
- With every task ticked (or no tasks at all), `logCompletedSession` writes `taskId: null` /
  `taskTitle: null` and increments nothing — which is **exactly today's untagged behaviour** for "nothing
  pinned", not a new code path (criteria 11, 12).
- Dragging a done task to position 0 does **not** make it current (criterion 30).

### 3. Two notions of "done" exist and must not be conflated.
`Task.completed` counts **pomodoros spent** (integer 0-999, incremented automatically by
`logCompletedSession`) and `Task.eta` **estimates** them (integer 1-20); `TaskRow.tsx:162-164` renders
`completed / eta`. The owner is asking for a third, unrelated fact: *she considers this task finished.*

**That is a new boolean field. It is not a repurposing of `completed`, and it is not derived from
`completed >= eta`.** A task can be ticked at `completed < eta` (it turned out easier than she thought) and
left unticked at `completed > eta` (she has spent six pomodoros and it still is not done). Both of those are
normal, not edge cases.

**Field name: `done`.** Backend may propose a different identifier in Implementation Notes *before frontend
starts*, with a reason, as long as it cannot be misread as the pomodoro count; QA then asserts whichever
name is recorded. `completed`, `completedCount` and any near-homonym are not acceptable.

### 4. The panel and the dialog split the work; the dialog survives, scoped down.
`TaskListDialog.tsx` is not redundant and is not deleted. It carries real machinery that took task 004 a
full round to get right — Escape ownership across three inner layers (lines 22-35), `onOpenAutoFocus`
landing on Close (lines 51-65) — plus 37 e2e tests in `e2e/task-list-dialog.spec.ts`. Throwing that away for
a change the owner did not ask for is a bad trade. And an always-visible panel big enough to hold an add
form, an inline edit form *and* a delete confirmation would become the dominant element on `/`, which
collides with DESIGN.md's "not overbearingly cute — no clutter of widgets competing for attention" and with
antislop's one-focal-point rule (the timer is the focal point).

| | **Panel** (always visible, lower left) | **Dialog** (opened from the bottom-right cluster) |
|---|---|---|
| Title, emoji, colour dot, `completed / eta` | shown | shown |
| **Done checkbox** | **yes** | no |
| Current-task marker | **yes** | no |
| Drag handle, move up / move down | **yes** | no |
| Add a task | no | **yes** |
| Edit, Delete (+ its inline confirmation) | no | **yes** |
| `+1` / `-1` on the pomodoro count | no | **yes** |
| Pin / Unpin | **deleted** | **deleted** |

**Exactly one `DndContext` exists in the app, and it is in the panel** (criterion 45). Two reorder surfaces
would be two code paths for one invariant, and `TaskListDialog.tsx:33`'s drag detection is a *document-wide*
`document.querySelector`, which already shows how badly a second drag surface would cross wires. WCAG 2.5.7's
single-pointer alternative to dragging only has to exist where dragging exists.

This also answers sharp edge 8 (row density) structurally rather than by shrinking targets: the panel row
carries four controls (checkbox, drag handle, up, down) instead of the eight `TaskRow.tsx` renders today.

### 5. pm ruling: `CurrentTaskCard` stays.
It renders above the `mm:ss` readout and it is what tells her what the running timer is *for*. The panel is
a list in her peripheral vision at the lower left; deleting the card would leave the one surface the eye is
actually on with an unlabelled countdown. What is **not** acceptable is the two disagreeing, or the card
claiming a pin that no longer exists — so its empty-state copy ("Pin a task from Your tasks whenever you're
ready.") is rewritten, and criterion 24 pins the two to the same task at all times.

### 6. Surface: **solid**, per task 012's R-10 ruling. No adversarial-image sweep.
Task 012 caps the app at **one** frosted surface and it is the timer panel. This panel gets 012's **solid**
token surface, reused — not copied, not re-coloured, and not swapped for the frosted one. That is 012's own
criterion 7 ("the 014 test") being cashed in.

**This is a real saving and the task file says so on purpose:** an opaque ground is fully provable, so every
figure here is a **flat token measurement with no image in the loop**. No white/black/split image set, no
straddle-clause analysis, no per-image sweep. Group I is small for a reason.

### 7. Nothing new is persisted outside Dexie.
No `lib/preferences/` key. `PREFERENCES_VERSION` stays **1**. There is **no** "hide done tasks" toggle, no
"clear completed" action, no panel collapse state, no archive. The only persisted change in this task is the
`tasks` table gaining one boolean and the `appMeta` pin row going away.

## Data shape / pipeline ordering

**Backend runs first and alone. Frontend does not start until backend has handed off.** There is a schema
change, three repository functions change or disappear, and `logCompletedSession` changes what it credits.
Backend owns `lib/db/**` and nothing else; frontend owns `components/`, `widgets/`, `hooks/`, `app/`.

Backend records in Implementation Notes, **before frontend starts**: the final field name, the `.version(4)`
block as written, what the `.upgrade()` callback does, the new `getCurrentTask` contract, which exports
disappear from `lib/db/index.ts`, and how a test seeds a pre-upgrade (version-3) database.

### The schema change, and the trap PLAN.md already recorded
`lib/db/database.ts:56` declares the current version as `.version(CURRENT_SCHEMA_VERSION)`. PLAN.md
Maintenance records this as task 010's review ruling D:

> *"Task 010 had to hand-literalize the previous block to `.version(2)` for exactly this reason — a
> historical block pinned to the constant silently renumbers itself on the next bump, which is latent data
> loss. The next schema change repeats that manual step. Retire the pattern: literalize `.version(3)` now,
> or add a one-line guard that the highest declared literal equals `CURRENT_SCHEMA_VERSION`."*

**This task is that next schema change.** It does both halves (criteria 15, 16): `.version(3)` is
literalized, and a guard asserts the highest declared literal equals `CURRENT_SCHEMA_VERSION`, so the
third bump does not repeat the manual step a fourth time.

### What an existing row reads as
Settled: **the v4 `.upgrade()` backfills `done: false` on every existing row**, so stored data is uniform
rather than living in two shapes forever. The read path *also* normalizes a missing or non-boolean `done` to
`false` rather than trusting it — same defensive posture as `getCurrentTask` never throwing on a dangling
pin. Both halves are tested (criterion 18); the backfill is the authority for existing data and the
normalization is the net under it.

`done` is **not indexed**. The repository reads the whole table and sorts in memory (`database.ts:38-40`
states why), and `completed` is unindexed for the same reason. Noted because Dexie needs no version bump at
all for a non-indexed field — the bump is taken for the `.upgrade()` callback, which is what actually has to
run. **Backend reads the Dexie versioning guide before writing the block**: a version whose only purpose is
an upgrade callback is a shape this repo has not used yet, and the house pattern ("a new `.stores()` block
naming only the changed table, nothing restated") may not apply verbatim.

### The pin's retirement, in full
- **`getCurrentTask()` keeps its name and its signature** (`Promise<Task | null>`) and changes its
  semantics to ruling 2. It stops reading `appMeta`. **`hooks/use-current-task.ts` therefore needs no
  change at all**, which is a deliberate saving — it just calls the function, and `useLiveQuery` still
  re-fires because the read still touches `db.tasks`.
- **`pinTask` and `unpinTask` are deleted**, along with their exports from `lib/db/index.ts`.
- **`deleteTask`'s transaction shrinks to `tasks` alone.** Its clear-the-pin branch
  (`task-repository.ts:142-145`) goes; the renumber stays.
- **`logCompletedSession` stops reading the pin.** `session-repository.ts:60` opens a transaction over
  `[db.sessions, db.tasks, db.appMeta]` and lines 66-67 read `appMeta` to decide `taskId`/`taskTitle`. It
  now resolves the current task from the `tasks` table by the same rule as `getCurrentTask`, **still inside
  the one transaction**, and `db.appMeta` leaves the transaction's table list. The exactly-once guard, the
  `&runId` dedup, the clamp at 999 and the focus-type check are all unchanged.
- **The stored `appMeta` row is deleted by the v4 `.upgrade()`.** Not left dormant: a dormant row that
  nothing reads is a thing the next reader has to investigate.
- **The `appMeta` *table* stays declared in the schema.** Removing it from a `.stores()` block drops the
  object store, which is a destructive change for zero benefit, and the table was designed (`types.ts:38-43`)
  to take later keys without a bump. `AppMetaRecord` keeps the `"pinnedTaskId"` literal — the upgrade has to
  name the key to delete it — with a comment recording that it was the table's only key and was retired in
  v4. Whether the type stays exported from `lib/db/index.ts` is backend's call; nothing outside `lib/db/`
  imports it today.
- **Nothing historical is rewritten.** Existing `sessions` rows keep whatever `taskId`/`taskTitle` they
  already carry, `/stats`'s per-task breakdown is unaffected, and the upgrade never touches the `sessions`
  table (criterion 20).

### The upgrade honours her last pin, rather than silently resetting it
A user with task B pinned at position 3 would otherwise wake up with task A current, because the pin's
information is thrown away. Settled: **the v4 `.upgrade()` moves the pinned task to position 0 and
renumbers**, in the same transaction as the backfill and the row delete, so her last expressed choice
survives the upgrade. No pin, a dangling pin, or a pin already at position 0 → no reorder (criterion 19).

## Scope

**In:**
- One new boolean field on `Task`, its validation, and the repository write that toggles it.
- Schema **3 → 4**: a new `.version(4)` block, `.version(3)` literalized, the highest-literal guard, and
  the `.upgrade()` callback (backfill + pin-to-position-0 + delete the `appMeta` row).
- Retiring the pin: `getCurrentTask`'s new rule, deleting `pinTask`/`unpinTask`, shrinking `deleteTask`'s
  transaction, and re-pointing what `logCompletedSession` credits.
- Rewriting the superseded `Task` comment in `lib/db/types.ts`.
- An always-visible task panel on `/` — lower-left and fixed at `lg` and up, in normal page flow below
  `lg` — on task 012's **solid** surface, with its three data states permanently on screen.
- A done checkbox per panel row, with a non-colour cue for the done state.
- Reordering (drag + keyboard sensor + move up/down) relocated into the panel, with the keyboard path
  **re-verified**, not assumed, outside a focus trap.
- A current-task marker on the panel's current row.
- Scoping the dialog down per ruling 4: Pin/Unpin, the drag handle and move up/down leave it; add, edit,
  delete, `+1`/`-1` stay. Its title, description and trigger copy stop naming the pin.
- `CurrentTaskCard`: new empty-state copy, and dropping the `role="status"` on its loading line.
- Dropping the `role="status"` on `TaskList.tsx:247`'s loading line, which would otherwise announce on
  every page load.
- Updating every test and spec the above invalidates (QA's, enumerated in criterion 57).

**Out — defer, do not absorb:**
- **Any second notion of done.** No archive, no "clear completed", no hide/filter toggle, no done count, no
  progress bar, no "x of y done" summary, no confetti.
- **Auto-ticking from the pomodoro count.** `completed >= eta` never sets `done`, in either direction
  (ruling 3).
- **Undo for a tick.** Unticking is the undo. (Delete still has its confirmation; that is unchanged.)
- **Any change to the pomodoro-count rules**: `completed` stays 0-999, `eta` stays 1-20, the automatic
  increment on a focus-type completion is unchanged except for *which* task it credits.
- **Subtasks, notes, due dates, tags, priorities, search, multiple lists, bulk actions.** Still out, as in
  task 002.
- **A second frosted surface.** Task 012 ruling 2 caps it at one and this panel is not it. Proposing glass
  here is reopening an owner ruling.
- **Any palette change.** No token value in `:root` or `.dark` moves, and no new colour token unless a
  measured floor in group I cannot be met without one — which is a blocker to raise, not a licence.
- **The focus-cycle work (task 013)** and **the background/surface work (task 012)**. This task consumes
  both and changes neither.
- **PLAN.md Maintenance items**, except where a criterion below names one: the `/settings` idle-state
  `role="status"` (010 R-1) is *not* in scope; the equivalent problem on `/`'s own two loading lines is,
  because this task is what makes them render on every load.
- Live cross-tab sync. Last write wins, as today.
- Export/import, PWA (milestone 7).
- Any change to `lib/timer/**`, `lib/stats/**`, `lib/audio/**`, `lib/preferences/**`,
  `hooks/use-timer-clock.ts`, `hooks/use-hydrate-timer-store.ts`, `components/SloshGauge.tsx`,
  `components/HoldButton.tsx` (both vendored and frozen), `app/stats/**`, `components/Stats*.tsx`,
  `package.json`, `package-lock.json`.

## Acceptance Criteria
60 criteria in eleven groups. **Group I is the measurement group and is deliberately separate from every
behaviour group** (qa cost rule 4): a token change re-runs group I and nothing else.

### A. Gate and order
- [ ] 1. **Backend hands off before frontend starts**, and Implementation Notes record, before that
      handoff: the final field name (ruling 3), the `.version(4)` block verbatim, what the `.upgrade()`
      callback does and in what order, `getCurrentTask`'s new contract, the exact list of names removed
      from `lib/db/index.ts`, and how a test seeds a version-3 database with rows and a pin. QA asserts
      each item is present and matches the code.
- [ ] 2. **Tasks 012 and 013 are in place before group I is measured.** The panel's surface is 012's solid
      token; its figures are taken once, after that token's value is final. If a token moves afterwards,
      **group I re-runs and nothing else does**, and the task file records what moved and why
      (CLAUDE.md "Measurement ordering").
- [ ] 3. **Nothing outside the named surface is persisted differently.** `PREFERENCES_VERSION` is **1** and
      `lib/preferences/**` has an empty diff. `lib/timer/**`, `lib/stats/**`, `hooks/use-timer-clock.ts`,
      `hooks/use-hydrate-timer-store.ts`, `package.json` and `package-lock.json` have empty diffs. No new
      dependency, and no first import of `lucide-react`.

### B. The new field
- [ ] 4. `Task` carries one new boolean field, name as recorded under criterion 1. `createTask` assigns it
      **`false`** and never accepts it from the caller — the same posture `completed` and `position`
      already have (`CreateTaskInput` is unchanged except that it still does not include it).
- [ ] 5. A repository function sets the field to an explicit boolean for a given id, returns the updated
      `Task`, and throws `TaskNotFoundError` (writing nothing) for an unknown id. Setting it to the value
      it already holds is a silent no-op that returns the unchanged record, matching
      `incrementCompleted`'s clamp behaviour. A non-boolean argument is rejected without writing.
- [ ] 6. `updateTask` does **not** touch the field: `UpdateTaskInput` has no key for it, and an
      `updateTask` call leaves a done task done and an undone task undone. (Same rule the file's own doc
      comment already states for `completed`, `position` and the pin.)
- [ ] 7. **The field is independent of the count, proven in both directions.** A task with
      `completed: 0, eta: 5` can be set done and stays `completed: 0`. A task with `completed: 7, eta: 3`
      is **not** done until it is explicitly set, and `incrementCompleted` taking `completed` past `eta`
      never sets it. `decrementCompleted` never clears it. Proven against the repository, not by reading
      types.
- [ ] 8. `listTasks()` returns the field on every row and its order is still `position` ascending only —
      done rows are **not** sorted to the bottom, moved, or filtered out (ruling 2's rejected alternative).

### C. Retiring the pin
- [ ] 9. `getCurrentTask()` returns **the first task in `position` order whose done field is false**. With
      three tasks and the first done, it returns the second. With every task done it returns `null`. With
      no tasks it returns `null`. It never throws, and it performs no read of `appMeta`.
- [ ] 10. `pinTask` and `unpinTask` no longer exist in `lib/db/**` and are no longer exported from
      `lib/db/index.ts`; no file in `app/`, `components/`, `widgets/` or `hooks/` references either name.
      A grep-level guard asserts this so a later revert cannot reintroduce half of the pin.
- [ ] 11. **`logCompletedSession` credits the current task by the same rule**, resolved inside its one
      transaction. With tasks A (done), B, C in order, a completing focus-type run writes one `sessions`
      row with B's id and title and takes B's `completed` up by exactly 1. A and C are unchanged. The
      `&runId` dedup, the duplicate result shape, the 999 clamp, and the break-mode "log but do not
      increment" rule are all unchanged.
- [ ] 12. **No current task is the existing untagged path, not a new one.** With every task done, and
      separately with no tasks at all, a completing focus-type run writes one row with `taskId: null` and
      `taskTitle: null` and increments nothing — identical to today's "nothing pinned" behaviour. A
      seeded-row test proves it, and `lib/stats` still aggregates such rows as untagged focus time.
- [ ] 13. `deleteTask` no longer opens `appMeta` in its transaction, still renumbers the remaining rows
      densely, and still preserves their relative order. Deleting the current task makes the next unticked
      task current with no further write.
- [ ] 14. **The superseded comment is rewritten.** `lib/db/types.ts`'s comment on `Task` no longer claims
      the pin's absence is what makes "exactly one task pinned" structural. It states the replacement
      guarantee named in ruling 1 — `position` is dense and unique by construction, so "the first not-done
      task in display order" is a pure function of the sorted list with no write path to police — and names
      this task as where the pin was retired. Reviewer verifies the comment is true of the shipped code.

### D. Migration 3 → 4
- [ ] 15. `CURRENT_SCHEMA_VERSION` is **4**. The version-3 block is declared as a **literal**
      `.version(3)`, not `.version(CURRENT_SCHEMA_VERSION)` (PLAN.md Maintenance, task 010 review ruling
      D). The version-1 and version-2 blocks are byte-identical to before. No existing block's `.stores()`
      argument is edited.
- [ ] 16. **A guard asserts the highest declared `.version(n)` literal in `lib/db/database.ts` equals
      `CURRENT_SCHEMA_VERSION`**, so bump four cannot repeat the manual step. Proven non-vacuous by
      break-and-restore.
- [ ] 17. **The upgrade runs once and is additive.** A database opened at version 3, seeded with five
      tasks, a pin on the third, some `sessions` rows and a stored background, then reopened at version 4:
      all five tasks survive with their ids, titles, emoji, colours, etas and `completed` counts intact;
      every `sessions` row and the `backgrounds` row are untouched; and the upgrade callback runs exactly
      once (reopening again does not re-run it).
- [ ] 18. **Both defaulting paths work.** (a) Every row carried through the upgrade reads the new field as
      `false` from storage — asserted by reading the raw stored object, not the repository's return value.
      (b) A row hand-written with the field missing, `null`, `0`, `"true"` or any non-boolean reads as
      `false` through the repository and is never treated as done. Neither path throws.
- [ ] 19. **Her last pin becomes position 0.** Upgrading a version-3 database whose pin is on the task at
      position 3 leaves that task at position 0, with the other four in their previous relative order and
      positions renumbered densely 0-4. Three cases produce no reorder at all and are asserted separately:
      no `appMeta` row, an `appMeta` row with `value: null`, and a pin referencing an id that no longer
      exists. A pin already at position 0 writes no position change.
- [ ] 20. **The `appMeta` pin row is gone and the table is not.** After the upgrade, `appMeta.get("pinnedTaskId")`
      resolves to `undefined`, the `appMeta` object store still exists (a write to it succeeds), and the
      `sessions` table is byte-identical to before the upgrade.
- [ ] 21. **A blocked upgrade still behaves.** With another connection holding version 3 open, opening at
      version 4 rejects with `DatabaseBlockedError` after `BLOCKED_UPGRADE_TIMEOUT_MS`, the panel shows its
      blocked-specific error copy on `/` with nothing opened, and the page does not hang on a loading state.
      Retrying after the other connection closes succeeds.
- [ ] 22. **Importing `lib/db/**` during a server render or build still does nothing.** `npm run build`
      succeeds and no module-scope database construction is introduced.

### E. Ticking (UI behaviour)
- [ ] 23. Each panel row has a **native checkbox** with a real label, keyboard-reachable, toggled by Space,
      exposing its state natively (`checked`), with an accessible name that includes the task title. Its
      visible text (if any) is contained in its accessible name (WCAG 2.5.3). Target at least 44 x 44 CSS px
      at 320 px and 1280 px.
- [ ] 24. **Ticking the current task promotes the next unticked task immediately**, with no reload, in
      **both** the panel and `CurrentTaskCard`, in the same user action. The two never name different
      tasks: QA asserts the card's text equals the panel's marked row's title after each of — tick the
      current task, untick it again, drag a different task to the top, delete the current task, add a task,
      tick every task, untick one.
- [ ] 25. **Done is shown by more than colour.** The done state carries a non-colour cue (for example
      strikethrough, or the native checkbox's own mark) that survives greyscale **and**
      `forced-colors: active`. The `peer sr-only` pattern used by `TaskForm`'s colour radios and by
      `SettingsPanel` is the recorded trap here (PLAN.md: under forced colours, borders flatten to one
      system colour and `box-shadow` drops to `none`, so a custom box with a hidden input has no indicator
      left) — whatever ships must keep a visible checked state in that mode.
- [ ] 26. **The two facts read as two facts.** A row at `completed: 2, eta: 5` that is ticked shows both the
      `2 / 5` count and the done state, and the count is not struck through, hidden, zeroed, or restyled
      into looking like the done state. A row at `7 / 3` that is unticked shows the overrun and no done
      cue. QA asserts both strings are present and distinguishable in each combination.
- [ ] 27. Ticking persists across reload. Ticking while the timer is running or paused changes no timer
      state: the countdown keeps running or stays frozen at the same value, and the persisted entry's
      `status`, `endTimestamp`, `pausedRemainingMs` and `runId` are byte-identical across the tick.
- [ ] 28. A failed write (database unavailable mid-session) leaves the checkbox showing the stored value,
      not an optimistic one that lies, and surfaces something readable rather than failing silently. The
      existing `console.error` pattern in `TaskList.tsx:186-203` is not sufficient on its own here, because
      the panel is now the only always-visible surface for this data.

### F. The panel: placement, surface, states
- [ ] 29. **Placement.** At 1280 x 800 the panel is anchored at the lower left of the viewport, does not
      overlap `widgets/BottomControls.tsx` (`fixed right-0 bottom-0`), does not overlap the timer column,
      and does not cover the `mm:ss` readout at any list length. At **320 x 568** it is **not** a fixed
      overlay: it sits in normal page flow and is reached by scrolling, with the timer still fully visible
      without scrolling. The breakpoint is `lg` unless frontend records a reason for another, and
      `app/page.tsx`'s `pb-28` reservation is reconciled with whatever ships — `BottomControls.tsx:7-9`'s
      comment says the two have to move together, and the panel joins that constraint.
- [ ] 30. **Reordering decides current, and a done task cannot win it.** Dragging task C to position 0
      makes C current (card and marker both). Dragging a **done** task to position 0 leaves the current
      task as the first unticked one and the done row is not marked current. Both asserted after a reload.
- [ ] 31. **The surface is 012's solid definition, reused.** The panel references 012's single solid-surface
      definition rather than restating a utility string or adding a colour (012 criterion 7's "014 test"),
      carries **no** `backdrop-filter` and no partial alpha, and 012's "exactly one frosted element" count
      is still **1** after this task. QA asserts the count by scanning `app/`, `components/` and `widgets/`,
      not by eye.
- [ ] 32. **With 50 tasks the panel is bounded.** At 1280 x 800 it has a capped height with internal
      scrolling, the page behind it does not grow a scrollbar because of it, and the first and last rows are
      both reachable. At 320 px the in-flow panel grows with the content and produces no horizontal scroll
      (`document.documentElement.scrollWidth <= clientWidth`).
- [ ] 33. **Long titles.** A 100-character unbroken title does not overflow the panel, does not push any
      control off-screen, and does not collapse the title element to 0 px width at either viewport — the
      exact bug task 002 lost a fix loop to (`TaskRow.tsx:131-141` records the measurement). QA measures the
      title element's bounding box, it is never 0.
- [ ] 34. **The panel has an accessible name** rendered as a visible heading, is a semantic list
      (`<ul>`/`<li>`), and adds at most one landmark to `/`. Tab order through `/` matches visual order.
- [ ] 35. **The three states are all reachable and none of them announces on arrival.** Loading, empty and
      error each render in the panel. **Neither the loading line nor the empty line is inside a live
      region**: `TaskList.tsx:247`'s `role="status"` and `CurrentTaskCard.tsx:14`'s `role="status"` are
      removed, because both now fire on every single page load — the same defect PLAN.md records as task
      010 review R-1 on `/settings`. The **error** line keeps `role="alert"`: it only renders when something
      actually failed, and task 004 required a broken database to be visible on `/` without opening
      anything. QA reports, per data state, the exact set of elements in `/`'s tree carrying `aria-live`,
      `role="status"` or `role="alert"`, and asserts a normal load with tasks present announces nothing.
- [ ] 36. **The empty state never flashes when tasks exist.** Asserted with a `MutationObserver` installed
      via `addInitScript` watching `document` (not `document.body`, which did not exist yet when task 002's
      version of this test silently passed for two rounds), across 8 reloads with tasks stored.
- [ ] 37. **The error state is informative and distinguishes the two failures.** The blocked-upgrade case
      says to close other Pomotato tabs; the unavailable case (private browsing, storage disabled) does not
      tell her to close a tab that does not exist. This is PLAN.md's 010 R-3 shape and it is in scope *here
      only* because the panel is a new always-visible surface for exactly this message — the `/settings`
      instance of it stays out (see Scope/Out).
- [ ] 38. **The panel renders on `/` only.** `/settings` and `/stats` are unchanged; neither grows a panel,
      and `npm run build` still lists exactly `/`, `/_not-found`, `/settings`, `/stats`.

### G. Reordering, outside a focus trap
- [ ] 39. **Pointer drag:** with 5 tasks, dragging row 1 by its handle to position 3 and releasing puts it
      at position 3, and the order survives a reload.
- [ ] 40. **Keyboard drag, re-verified rather than assumed.** With a handle focused: Space or Enter picks
      up, Up/Down move one position per press, Space or Enter drops, **Escape cancels and restores the
      original position with nothing written**, and focus stays on the moved task's handle after the drop.
      All five asserted in the panel, not inherited from `e2e/task-list-dialog.spec.ts`. The sensors, the
      custom `Announcements`, and the focus effects in `TaskList.tsx:64-99` were all written inside a
      focus-trapped dialog; this criterion exists because none of that is free outside one.
- [ ] 41. **Escape in the panel has no dialog to defer to, and that is checked both ways.** Escape during a
      panel drag cancels the drag only. Escape in the panel with no drag active does nothing — it does not
      close the dialog, navigate, or clear state. And with the **dialog open**, Escape still closes the
      dialog: `TaskListDialog.tsx:33`'s `document.querySelector(ACTIVE_DRAG_HANDLE)` is document-wide, so a
      sortable handle anywhere in the document with `aria-pressed="true"` would swallow it. QA asserts the
      dialog still closes on Escape with the panel rendered behind it.
- [ ] 42. **dnd-kit's live region is reachable** during a panel drag: it has no ancestor with
      `aria-hidden="true"` or `inert`, and its text updates on pickup, each move, and drop. Announcements
      still use the task's title and a 1-based position ("Picked up Write report. Position 2 of 5.") and
      never a UUID.
- [ ] 43. **Move up / move down** (WCAG 2.5.7) work in the panel by plain clicks, and the control that
      would move the first task up or the last task down is disabled or absent. They operate on the stored
      order, and they persist.
- [ ] 44. **Row controls never start a drag**, and the checkbox in particular does not: clicking or tapping
      the checkbox, move up or move down performs that action and begins no drag, at both viewports, with
      touch as well as mouse.
- [ ] 45. **Exactly one `DndContext` exists in the app** (ruling 4), asserted by scanning `app/`,
      `components/` and `widgets/`, and it is the panel's. The dialog's rows have no drag handle and no
      move up/down.

### H. The dialog, scoped down
- [ ] 46. The dialog still opens from the bottom-right cluster, still has `role="dialog"` with
      `aria-modal="true"` and a visible heading, still closes by the close control, Escape and an overlay
      click, and still returns focus to its trigger on every close path. Focus still lands on Close on
      open. Tab and Shift+Tab still cycle only inside it — **including not reaching the panel behind it**.
- [ ] 47. The dialog's rows carry Edit, Delete (with its inline confirmation), `+1` and `-1`, and carry
      **no** Pin, Unpin, drag handle, move up or move down. Escape precedence still holds for the two inner
      layers that remain: an in-progress edit and the delete confirmation each cancel themselves first, and
      a second Escape closes the dialog.
- [ ] 48. **The dialog's copy stops naming the pin.** Its description currently reads "Pin the one you're
      working on to keep it in view." and `CurrentTaskCard`'s empty state reads "Pin a task from Your tasks
      whenever you're ready." Both are false after this task. New copy names the real mechanism (the list is
      on screen; the top unfinished task is the current one) in one short sentence each, carries no
      pressure, and the word "pin" appears nowhere in `/`'s rendered text. Routed through
      `antislop-copywriting`.
- [ ] 49. **Add, edit and delete still behave exactly as task 002 and 004 specified**, inside the dialog:
      add clears the title and keeps focus in it; a valid edit returns focus to that row's Edit control; the
      delete confirmation auto-focuses Cancel, is cancellable by Escape, returns focus to Delete, and on
      confirm moves focus to the task that took the deleted position (or the new last task, or the add
      form's title field), never `<body>`. Deleting a task from the dialog updates the panel immediately.

### I. Measurement — flat, both themes, no image in the loop
*Every figure is a table row: theme, element, **painted pixel RGB**, coordinates, ratio, floor, and the
ground it was taken against. A figure without its provenance does not count — task 010 carried three wrong
numbers for exactly that reason, two read from the wrong pixel and one from the wrong colour (CLAUDE.md
"Measurement ordering"). **Every figure here is flat: no background image is set, because the panel's
surface is opaque** (ruling 6). QA states that explicitly in the report, and cites task 012's criterion 9
zero-delta result as what licenses it.*
- [ ] 50. **One capture per theme, every pixel sampled in one pass** (qa cost rule 2), with the sampler kept
      in `e2e/helpers/` so the next task reuses it. Against the panel's solid surface, in **light and dark**,
      at 1280 x 800 DPR 1: row title text **≥ 4.5:1**; the `completed / eta` count text **≥ 4.5:1**; the
      panel's heading **≥ 4.5:1** (or **≥ 3:1** if it ships as large text, stated which); the loading, empty
      and error lines **≥ 4.5:1**; the done row's text in its done treatment **≥ 4.5:1** (if the treatment
      dims it, this is the figure that catches it); the checkbox's unchecked edge and its checked mark
      **≥ 3:1**; the current-task marker **≥ 3:1**; the task colour dot **≥ 3:1**; the drag handle's and
      move buttons' `--control-border` **≥ 3:1**; and each focus indicator's **outer edge against what
      surrounds it ≥ 3:1** (the clause narrowed by DECISIONS 2026-10-26 — against the ground, not against
      its own fill).
- [ ] 51. **Full-coverage pixels only.** Per DECISIONS 2026-10-27, a stroke's measured value is its
      **fully covered** pixel, never its antialiasing fringe — and a 1 px stroke at a half-pixel offset has
      no covered row at all. For every 1 px boundary the panel introduces, QA reports whether a fully
      covered row exists at 1280 x 800 DPR 1 and what it measures. **Nothing is thickened pre-emptively**; a
      boundary with no covered row is reported to the orchestrator as a finding, and PLAN.md's open 011 R-5
      question ("does the full-coverage ruling generalise to every 1 px control border?") is informed by it
      rather than answered inside this task.
- [ ] 52. **The done cue survives greyscale.** The done and not-done treatments are told apart with
      saturation removed, and the report says which non-colour difference carries it (criterion 25's cue),
      rather than leaving it implied.

### J. Modes, motion and accessibility
- [ ] 53. **`forced-colors: active`** (`emulateMedia`): no text in the panel becomes invisible, no control
      loses its edge, the checked and unchecked checkbox states are still told apart (criterion 25), the
      done cue survives, the current-task marker is still visible, and the panel does not read as an empty
      box. Each assertion paired with a default-mode equivalent so it cannot pass vacuously.
      `prefers-reduced-transparency: reduce` is stated as not applying to this surface, since it is opaque,
      and QA says so.
- [ ] 54. **Nothing animates while nothing is happening.** After a 1 s settle with the timer **idle**, two
      frames of the panel region sampled 1 s apart are identical and **zero** `requestAnimationFrame`
      callbacks fire (timer running is the positive control). Any transition the panel adds is suppressed
      under `prefers-reduced-motion: reduce`. No new `setInterval`, `setTimeout` or `requestAnimationFrame`
      in any file this task adds or changes — the grep guard shape task 010 used, extended to this task's
      new files.
- [ ] 55. **No axe-core violation of serious or critical impact** on `/`, in **light and dark**, at **320 px
      and 1280 px**, in each of: empty list; 3 tasks none done; 3 tasks with the first done; every task
      done; loading; error; and with the dialog open over the panel. No horizontal page scroll at either
      viewport in any of those states. Every interactive element on `/` at least 44 x 44 px at both
      viewports — PLAN.md already records the 320 px header at 80 px wrapped and the gauge top at 352 px, so
      320 px is where this regresses if it regresses.
- [ ] 56. **Raw-palette and token guards pass, including the trap.** Zero raw Tailwind palette classes and
      zero colour literals in every file this task adds or changes (`components/palette.tokens.test.ts` and
      the 007 guard over `app/`, `components/`, `hooks/`, `widgets/`); every new file appears in the
      discovered `FILES` set; `ALLOWED_RAW_UTILITIES` is still `{}` and `ALLOWED_LITERALS` still has only its
      `components/task-palette-colors.ts` entry. The trap, named so nobody finds it in review:
      `INLINE_STYLE_COLOR` (`palette.tokens.test.ts:53`) flags any `style={{ … background … }}` *including*
      a custom property whose name contains `background`, and `INLINE_STYLE_EXEMPTION` is a single object
      rather than a map, so a second exemption means restructuring that test.

### K. Test fallout, gates and red-proof
- [ ] 57. **The suites that assert the pin are updated, not deleted around.** Enumerated so QA inherits a
      list rather than discovering it one red run at a time:
      `lib/db/task-repository.test.ts` (the `pinTask`/`unpinTask`/`getCurrentTask` describe blocks, the
      delete-the-pinned-task case, the dangling-pin case — the dangling-pin *intent* survives as "a done or
      missing row never becomes current"), `lib/db/session-repository.test.ts` (every case that seeds a pin
      to decide `taskId`), `lib/db/test-utils.ts` (backend's, if it seeds `appMeta`),
      `e2e/task-list.spec.ts` (52 tests; the pin tests and the drag tests both move),
      `e2e/task-list-dialog.spec.ts` (37 tests; drag, Escape-during-drag, live-region and pin tests move to
      the panel), `e2e/sessions.spec.ts` (the pin-then-complete flows become order-then-complete),
      `e2e/accessibility.spec.ts`, and `e2e/token-task-surface.spec.ts`. QA lists **every** changed or
      removed assertion with the reason, and states explicitly that none was weakened and none removed to
      make a failure go away. The four vacuity shapes from the 2026-10-09 DECISIONS entry are banned, and so
      is `toBeVisible()` on something already true — task 004's QA report records that exact shape passing
      under a real mutation before it was fixed.
- [ ] 58. **No assertion added by this task is phrased as a diff against `HEAD`, `git diff`, or "unchanged
      from the previous commit".** Those invert the moment the work is committed; PLAN.md records three
      instances already. Anything this task needs to pin is pinned **by value**.
- [ ] 59. **Red-proof three criteria, at the cheapest level that discriminates** (qa cost rule 1), with the
      level named in the report: the current-task rule (9), the v4 upgrade's pin-to-position-0 behaviour
      (19), and the highest-literal version guard (16). Prefer a unit break over an e2e one and re-run only
      the spec and test that covers it. If a break stays green at one level and red at another, say which —
      task 010 lost a round to a red-proof that did not discriminate end to end.
- [ ] 60. `npm run lint` (0 errors, warnings no higher than the baseline QA measures on the tree it was
      handed), `npm run typecheck`, `npm run build` (routes still exactly `/`, `/_not-found`, `/settings`,
      `/stats`), `npm run test` and `npm run test:e2e` all succeed. QA states its counts and the baselines
      it compared against, **measured on the tree it was handed rather than `HEAD`** — task 012 recorded 965
      unit tests across 32 files and 631 e2e tests on *its* starting tree on 2026-10-28, and both 012 and
      013 land before this task, so those are stale by the time this runs. Zero console errors or warnings
      in both themes across: load `/`, tick and untick a task, drag a task to the top, open the dialog, add
      a task, edit it, delete it, close the dialog, start / pause / complete a run, flip the theme, reload.
      No `any`; functional components, named exports.

## Files likely touched

**Backend (runs first, alone):**
- `lib/db/types.ts` — the new field on `Task`; the rewritten `Task` comment (criterion 14); the
  `AppMetaRecord` comment recording the pin's retirement; `LogSessionInput`'s doc comment, which currently
  says "the repository reads the pin itself, inside the transaction".
- `lib/db/database.ts` — `CURRENT_SCHEMA_VERSION` 3 → 4; `.version(3)` literalized; the new `.version(4)`
  block and its `.upgrade()` callback.
- `lib/db/validation.ts` — validation for the new field, if it needs any beyond a boolean check.
- `lib/db/task-repository.ts` — the toggle function; `getCurrentTask`'s new rule; deleting
  `pinTask`/`unpinTask` and the `PINNED_TASK_KEY` constant; `deleteTask`'s shrunk transaction;
  `createTask`'s default.
- `lib/db/session-repository.ts` — `logCompletedSession` resolves the current task from `tasks` instead of
  `appMeta`, inside the same transaction; `db.appMeta` leaves the transaction's table list; its own
  `PINNED_TASK_KEY` constant goes.
- `lib/db/index.ts` — remove the `pinTask`/`unpinTask` exports; add the toggle.
- `lib/db/test-utils.ts` — only if it seeds `appMeta`.

**Frontend (after handoff):**
- A new panel under `widgets/` (for example `widgets/TaskPanel.tsx`) — the fixed/in-flow positioning and the
  panel's heading. `widgets/` because CLAUDE.md defines it as "app-level chrome that frames the routes
  (header nav, bottom controls)", which is this shape exactly; the list and row components stay in
  `components/`.
- `components/TaskList.tsx` — splits per ruling 4: the panel's list (checkbox, marker, drag, up/down) and
  the dialog's list (add, edit, delete, ±1). The `DndContext`, `Announcements`, sensors and the focus
  effects go with the panel. How it splits is frontend's call; what each surface holds is not.
- `components/TaskRow.tsx` — the panel's row and the dialog's row no longer carry the same controls. Task
  002 and 003 both landed fix loops in this file; the title-row measurement comment at lines 131-141 is
  load-bearing and must stay true of whatever ships.
- `components/CurrentTaskCard.tsx` — new empty-state copy; the `role="status"` on the loading line goes.
- `components/TaskListDialog.tsx` — the description copy; the Escape-ownership selectors now that one of
  the three inner layers (the drag) has left the dialog.
- `app/page.tsx` — renders the panel; reconciles `pb-28` with it.
- `widgets/BottomControls.tsx` — only if the cluster has to move to make room (its comment says the padding
  moves with it).
- `app/globals.css` — only if group I cannot be met without a token, which is a blocker to raise first.

**QA only:** `lib/db/task-repository.test.ts`, `lib/db/session-repository.test.ts`, a new migration spec
alongside `lib/db/background-migration.test.ts`, `components/TaskForm.test.tsx` (expected unchanged — say
why if not), `components/palette.tokens.test.ts`, `e2e/task-list.spec.ts`, `e2e/task-list-dialog.spec.ts`,
`e2e/sessions.spec.ts`, `e2e/accessibility.spec.ts`, `e2e/token-task-surface.spec.ts`, plus a new panel spec
and a flat-token sampler kept in `e2e/helpers/` (`painted.ts` already exists — extend it rather than writing
a second sampler).

**Not touched:** `lib/timer/**`, `lib/stats/**`, `lib/audio/**`, `lib/preferences/**`,
`hooks/use-timer-clock.ts`, `hooks/use-hydrate-timer-store.ts`, `hooks/use-current-task.ts` (deliberately —
see Data shape), `app/stats/**`, `components/Stats*.tsx`, `components/SloshGauge.tsx`,
`components/HoldButton.tsx`, `components/SettingsPanel.tsx`, `components/BackgroundControl.tsx`,
`package.json`, `package-lock.json`.

## Risks
- **This is the first destructive-ish migration in the repo.** Versions 2 and 3 were purely additive — one
  new table each, no `.upgrade()` callback, no existing row read or rewritten. Version 4 backfills every
  task row, reorders one of them, and deletes a row from `appMeta`, all in one callback, with no undo and no
  export path until milestone 7. Criteria 17-20 are the whole safety net. **Test the upgrade against a
  database seeded at version 3, not against a fresh version-4 one** — a fresh database never runs the
  callback, so a broken callback passes a green suite.
- **The pin-to-position-0 step is the risky half of the upgrade.** It is the only part that writes to the
  `tasks` table's ordering, and it runs on data written by an older version. If it throws, the whole upgrade
  aborts and the user's database stays at version 3 — which is recoverable but presents as "the app will not
  load". A dangling pin must be a no-op, not a lookup failure (criterion 19).
- **Two notions of done is the conceptual trap, and it is the one a reader will get wrong.** `completed`
  counts pomodoros; `done` means finished. Anyone who skims will assume one implies the other. Criteria 7
  and 26 exist for that, and the field name (ruling 3) is load-bearing documentation, not cosmetics.
- **Three surfaces now read the same data and can disagree**: the panel, `CurrentTaskCard`, and the dialog.
  Criterion 24 pins the first two together. All three go through the same `useLiveQuery` hooks, which is
  what should make this true by construction — but the panel is always mounted while the dialog's content
  unmounts on close (task 004's notes record the re-mount and its loading blink), so they do not start from
  the same state.
- **Reordering leaves a focus trap.** dnd-kit's keyboard sensor, the custom `Announcements` and the focus
  effects in `TaskList.tsx` were all written inside a Radix dialog that owned Escape and constrained Tab.
  Outside one, Escape has nothing to defer to, Tab can leave the list, and `TaskListDialog.tsx:33`'s
  document-wide handle query now sees a surface it was never written for. Criteria 40-42 re-verify rather
  than assume, and criterion 41 checks the dialog's Escape from the other direction.
- **Row density at 320 px.** `TaskRow` already puts its actions on a second line because up to seven 44 px
  buttons will not fit beside a title (its comment records the measurement). The split in ruling 4 takes the
  panel down to four controls, which is what makes this tractable — but 320 px is still where it breaks, and
  PLAN.md already records that viewport as tight (header 80 px wrapped, gauge top at 352 px). Criterion 55
  is where it surfaces.
- **"Lower left" is a desktop instruction.** On a 320 x 568 viewport, a fixed lower-left panel and the timer
  want the same pixels. Criterion 29 settles it as in-flow below `lg` rather than letting frontend improvise
  a collapse state — a collapsed panel is a hidden panel, which is the thing the owner rejected.
- **Permanently-on-screen states.** A dialog showed loading/empty/error only when opened. A fixed panel shows
  one of them always, so a `role="status"` that was harmless becomes a read-out on every page load — exactly
  task 010 review R-1 on `/settings`. Criterion 35 removes two of them and keeps the one that is a real
  event.
- **The forced-colors checkbox trap.** `SettingsPanel.tsx:52-55`'s `peer sr-only` radio plus
  `peer-checked:border-primary` and an inset `box-shadow` is a known open finding precisely because forced
  colours flattens borders and drops shadows, leaving font weight as the whole indicator. A custom checkbox
  built the same way inherits the same bug on a control whose entire job is showing a binary state.
- **Test blast radius.** 52 tests in `e2e/task-list.spec.ts` and 37 in `e2e/task-list-dialog.spec.ts` plus
  the pin-driven cases in `e2e/sessions.spec.ts` and two `lib/db` suites. Criterion 57 enumerates them so a
  weakened assertion is hard to hide in the churn — task 004's QA report found one of its own tests passing
  under a real mutation because it used `toBeVisible()` on something already true.
- **Licensing: nothing, and that is the trap.** No asset ships — no icon file, no checkbox glyph image, no
  font. A tick mark is a character or CSS. If an icon is wanted, it comes from `react-icons` (ratified
  2026-10-26); a third icon library is forbidden and `lucide-react` is an unused dependency that must not
  gain its first import here. `docs/DECISIONS.md` gains **no** asset provenance entry for this task.
- **Next.js version.** Per `AGENTS.md`, read the relevant guide in `node_modules/next/dist/docs/` before
  touching `app/page.tsx` or adding a client boundary; App Router conventions in training data may not match
  this version. Backend likewise reads Dexie's own versioning guide before writing the `.version(4)` block
  (see Data shape).
- **antislop.** This adds a UI surface and changes copy, so `antislop-ui` and `antislop-copywriting` both
  apply, plus `antislop-layoutmobile` for criterion 29 (R-03: mobile is a distinct state, not a squeezed
  desktop). Tasks 005-012 all record `during (session override)`, supplied by the owner through the
  orchestrator. Frontend confirms that still holds, announces `antislop active: <mode> (<source>).` before
  its first UI edit, and runs the Delivery Gate.
- **A `docs/DECISIONS.md` entry is owed** for the rules a later task would otherwise re-ask: the pin's
  retirement and the structural guarantee that replaced it, "current = first not-done task", done tasks
  keeping their position, the panel/dialog split with one `DndContext`, `CurrentTaskCard` surviving, and the
  v4 upgrade honouring the last pin. *(Owned by the orchestrator, which lands docs; neither frontend nor
  backend edits `docs/`.)*

## Implementation Notes
(Filled in by backend, then frontend, as they build. Criterion 1 lists what backend must record **before
frontend starts**; criterion 2 gates group I.)

## QA Report
(Filled in by qa.)
- Verdict: PASS | FAIL
- Tests added:
- Repro steps for any failure:

## Review Findings
(Filled in by reviewer.)
- Verdict: APPROVE | CHANGES REQUESTED
- Findings:
