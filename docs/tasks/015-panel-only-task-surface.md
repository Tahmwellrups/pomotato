---
id: 015
slug: panel-only-task-surface
status: draft # draft | in-progress | qa | review | done | blocked
---

# The panel becomes the only task surface: the dialog goes, the panel hides, and emoji and colour leave the model

> **History for this task** — implementation notes, QA reports, review findings and
> orchestrator rulings live in [logs/015-panel-only-task-surface-log.md](logs/015-panel-only-task-surface-log.md). Read it only when a
> criterion below is disputed; it is not an input to implementing them.

## Goal
Everything she can do to a task happens in the always-visible panel. `components/TaskListDialog.tsx` is
deleted and its add, edit, delete and `+1`/`-1` controls move inline into the panel row, joining the tick,
the drag handle and move up/down that are already there. The panel gains a hide/show control whose state
survives a reload. `emoji` and `colorId` leave the `Task` model and a `.version(5)` upgrade strips both from
every stored row. Done means: the bottom-right cluster no longer opens a task dialog, every task action is
reachable in one surface, that surface can be put away and stays away, and no stored row carries a field
nothing reads.

## Provenance
Owner ruling, 2026-11-06, recorded in full in `docs/DECISIONS.md` ("The task dialog is deleted, the panel
absorbs everything, and two of task 014's rulings are overridden"). **That entry is authoritative and is not
re-argued here.** Three changes, each of which supersedes something task 014 settled:

1. The dialog is deleted; add, edit, delete (with its inline confirmation) and `+1`/`-1` move inline into
   the panel row. Overrides 014 ruling 4.
2. The panel gets a hide/show control and the state persists: one new `lib/preferences/` key,
   `PREFERENCES_VERSION` **1 → 2**. Overrides 014 ruling 7.
3. `emoji` and `colorId` leave `Task`, stripped from stored rows by a `.version(5)` upgrade.

**This task is a delta on top of a finished 014, not a reimplementation.** The always-visible panel
(`widgets/TaskPanel.tsx`), the panel's list (`components/TaskChecklist.tsx`), its row
(`components/TaskChecklistRow.tsx`), the `done` field, `setTaskDone`, the retired pin, `getCurrentTask`'s
"first not-done task" rule and the v4 upgrade all exist and work. Nothing here re-specifies them.

## What this invalidates in task 014, so QA does not try to satisfy both
014's QA Report and Review Findings are never edited. These of its **criteria** stop being true, and 015's
criteria replace them where it says so:

| 014 criterion | Why it is invalid | Replaced by |
|---|---|---|
| 3 (`PREFERENCES_VERSION` is 1, `lib/preferences/**` untouched) | Change 2 adds a key and bumps to 2 | 26-29 |
| 17 (the v3→v4 upgrade leaves "emoji, colours … intact") | Any open now runs through to version 5, which strips both. The v4 *steps* are still asserted; the emoji/colour clause is not. | 6, 8 |
| 41, third clause (Escape with the dialog open still closes the dialog) | No dialog | 17 |
| 45, second sentence ("the dialog's rows have no drag handle") | No dialog rows. The "exactly one `DndContext`" half stands. | 16 |
| 46, 47, 48, 49 (group H, the dialog scoped down) | No dialog. The *behaviours* survive, relocated into the panel. | 11-15, 18, 19 |
| 50, the "task colour dot ≥ 3:1" row | No colour dot | — (dropped, not moved) |
| 55, the "with the dialog open over the panel" state | No dialog. The new state to sweep is "panel hidden". | 41 |
| 56 (`ALLOWED_LITERALS` still has only its `components/task-palette-colors.ts` entry; the `INLINE_STYLE_EXEMPTION` trap) | That file is deleted, so the exemption has no file and the map becomes empty | 45 |
| 57 (test fallout list) | Superseded by a longer list; `e2e/task-list-dialog.spec.ts` no longer has a surface to test | 43 |
| 60's console walk ("open the dialog … close the dialog") | No dialog | 48 |

Everything else in 014 stands, including criteria 23-27 (ticking), 29-38 (panel placement, surface, states)
and 39-44 (reordering). Where a 015 criterion re-runs one of those because the row changed underneath it, it
says so by number.

## Settled, do not reopen

### 1. The dialog is deleted outright, and so are the two components that only served it.
`components/TaskListDialog.tsx` goes. So do **`components/TaskList.tsx` and `components/TaskRow.tsx`** — pm's
call, stated explicitly because the ruling left it open. The alternative (keep `TaskRow.tsx` and make the
panel row out of it) means two row components rendering the same eight controls, which is the drift ruling 4
was trying to prevent in the other direction; and the focus-after-delete bookkeeping in
`TaskList.tsx:26-41` has to live wherever the list lives, which is now `components/TaskChecklist.tsx`.
So: the panel's row keeps its identity as `TaskChecklistRow`, grows the four controls, and `TaskRow`/
`TaskList` are deleted. Whether frontend lifts code out of them before deleting them is frontend's business.

**`components/task-row-styles.ts` stays.** It is one shared class string, with no dependency on `emoji` or
`colorId` (checked). Its comment currently says it is "shared by the dialog's row (TaskRow) and the panel's
row" — that sentence has to be rewritten rather than left describing a file that no longer exists.

### 2. One toggle, in the cluster slot the dialog trigger vacates. Not two controls.
The hide/show control is **a single toggle button in the bottom-right cluster** (`widgets/BottomControls.tsx`),
taking the slot `TaskListDialog`'s trigger occupied, with the same treatment its three siblings carry.

Why there, and why one:
- **A hidden panel needs a way back that is in a fixed place and cannot itself be hidden.** The cluster is
  that place: pinned bottom-right from `lg`, in normal flow below it, and already the home of the app's three
  other "open a thing" controls.
- **Exactly one control, never two.** A hide button in the panel header plus a show button in the cluster was
  considered and rejected: that is two controls for one boolean, which is the shape task 009's "one instance
  only" rule exists to prevent (two controls for one state eventually disagree).
- **It keeps `.control-edge`'s applier count at 4.** The toggle sits directly on the bare photograph like its
  three siblings, so per DECISIONS 2026-10-29 it **must** carry `.control-edge` — one colour cannot win
  against a photograph. That is also what keeps `e2e/control-edge-measure.spec.ts:123`'s `expect(count).toBe(4)`
  true without an edit, and it is why the ruling's "the cluster loses a trigger, so the count drops to 3" does
  not happen: the cluster loses a trigger and gains a toggle.
- Its state is carried by **`aria-expanded`**, not by the accessible name, so the name does not change meaning
  between states.

**Consequence, recorded rather than discovered:** with the panel hidden there is **no** way to add, tick,
edit, delete, reorder or count a task anywhere in the app. The toggle is the single affordance that brings it
back. That is the trade the owner took when they rejected session-only state ("a panel that reappears on
every reload reads as a bug"); criterion 31 pins it so a later task does not quietly add a second task
surface to work around it.

### 3. The add affordance is part of the panel, and it is bounded.
Add moves into the panel. The visual-weight cost DECISIONS accepts (an always-visible panel holding add, edit
and delete becomes the dominant element on `/`) is **accepted, not answered** — so the one thing this task
does owe is a bound, not a taste argument. The bound: **the panel's resting height with an empty list is
capped** (criterion 34), which is what stops the add form shipping as a permanently-expanded multi-field
block. Change 3 helps here and the two should be read together: with `emoji` and `colorId` gone, the form is
title + ETA + submit, which is the smallest the form has ever been.

The add affordance **renders in the empty state** — that is the state where it matters most, and an empty
list with no way to add is a dead screen. Whether it also renders in the error state (where a write would
fail anyway) is frontend's call, recorded in Implementation Notes.

### 4. `emoji` and `colorId` are stripped from stored rows, and four files lose their only consumers.
Already checked before the ruling, so **not re-checked**: `/stats` uses neither (its per-task breakdown keys
on `taskId`/`taskTitle`), and neither field is indexed (`tasks: "id, position"`), so no index changes. The
fields are stripped by the upgrade rather than left dormant, for the same reason v4 deleted the retired pin
row: data nothing reads is data the next reader has to investigate.

What happens to each orphaned file, stated so nobody has to decide it twice:
- **`components/TaskColorDot.tsx` — deleted.** Its consumers were the three task surfaces and `TaskForm`'s
  colour radios. Note that `components/CurrentTaskCard.tsx:4` already imports it without rendering it, a dead
  import on the handoff tree; deleting the file forces that cleanup.
- **`components/task-palette-colors.ts` — deleted.** `TASK_COLOR_HEX` has no consumer once the dot goes.
- **`lib/db/palette.ts` — deleted**, along with `PALETTE`, `DEFAULT_PALETTE_COLOR_ID`, `isPaletteColorId` and
  the `PaletteColorId` type, and their four export lines in `lib/db/index.ts:2-3`.
- **`validateEmoji`, `validateColorId` and `isEmojiGraphemeCluster` in `lib/db/validation.ts` — deleted.**
  `isEmojiGraphemeCluster` is not exported from `lib/db/index.ts` and has no consumer outside the two
  validators; backend confirms with a grep and records it.
- **`components/TaskForm.tsx` stays**, losing its emoji input, its colour fieldset and its `TaskColorDot`
  import. `TaskFormValues` narrows to `{ title, eta }`.

**One recorded knock-on that is not a code change here.** PLAN.md's standing constraint "dark `--popover`
cannot be lifted … the eight task swatches need 3:1 on it" loses its cause when the swatches go. **No token
moves in this task** (criterion 2). Retiring or rewriting that constraint is a `docs/` edit for the
orchestrator, and any token work it unlocks is a later task with its own measurement pass — a token re-point
taken inside this task would land mid-sweep, which CLAUDE.md "Measurement ordering" prices at a full
re-measure.

### 5. Surface: still 012's **solid**, and still no adversarial image set.
The panel's surface is unchanged. Every figure in group G is a **flat token measurement with no image in the
loop** — no white/black/split image set, no straddle analysis, no per-image sweep. This is 014 ruling 6
restated on purpose, because group G now covers the moved controls and someone could reasonably assume a new
sweep.

Two specifics that make this concrete, both from 014's Implementation Notes:
- With **no background stored**, `surface-solid` paints nothing at all (computed `background` transparent,
  `border` transparent, `box-shadow: none`); the panel is a heading and cards on the cream page and the rows
  carry the structure. So a panel row's ground is **`--card`**, not the Surface fill.
- The one element this task puts on an image is the cluster toggle, and it reuses the retired trigger's exact
  treatment, so it **inherits task 012's already-measured `.control-edge` figures** rather than earning a
  sweep (criterion 39).

### 6. `PREFERENCES_VERSION` goes to 2 by ruling, and the reason is recorded rather than re-derived.
`lib/preferences/store.ts:62-65` already forces any payload failing `isPreferences` through
`sanitizePreferences` on **every** rehydration, which is why task 011 could add `mix` and leave the version at
1. A new boolean key with a default is that same shape, so the sanitiser would cover it.

**The bump is taken anyway, by owner ruling.** It is not re-argued, and the deliberate decision the
orchestrator asked for is this: the bump buys nothing mechanically and is taken so the stored `version` field
records when the key appeared. What that costs is one thing and it is testable — `migratePreferences` stays a
sanitise, so a payload stored at version 1 must come back with **every other preference intact** and the new
key at its default (criterion 27). Backend records the final key shape before frontend starts (criterion 1);
if backend believes the bump is actively harmful, that is a blocker to raise, not a thing to quietly skip.

## Data shape / pipeline ordering

**Backend runs first and alone. Frontend does not start until backend has handed off.** There is a schema
change and a preferences version bump, and the `Task` type narrows in a way that makes `TaskForm`,
`TaskChecklistRow` and `TaskRow` fail to compile — frontend cannot start against a shape that is still moving.

File ownership for this task, stated because it is not the usual split:
- **Backend owns** `lib/db/**` *and* `lib/preferences/schema.ts` + `lib/preferences/store.ts`. The preference
  is versioned persisted shape, settled before anything reads it.
- **Frontend owns** `app/`, `components/`, `widgets/`, `hooks/`. Frontend does not edit `lib/preferences/`.

**Backend records in Implementation Notes, before the handoff:**
1. **The `.version(5)` block as written**, verbatim, and confirmation that the highest-literal guard
   (`database.ts:114-118`, task 014 criterion 16) still passes with no edit.
2. **What `upgradeToVersion5` does**, step by step and in order, and why it is idempotent.
3. **How a test seeds a version-4 database** with rows carrying `emoji` and `colorId` — the sibling of
   `seedVersion3DatabaseForTests` (`lib/db/test-utils.ts:105`), named, with its argument shape, plus whether
   `seedVersion3DatabaseForTests` and `seedVersion1DatabaseForTests` still work now that a seeded open runs
   through to 5.
4. **The final shape of the preferences key**: name, type, default, where its validator line sits in
   `sanitizePreferences`, its line in `isPreferences`, `PREFERENCES_VERSION = 2`, what `migratePreferences`
   does with a version-1 payload, and whether `lib/preferences/boot-script.ts` needs anything (it does not
   paint the panel today; say so explicitly either way).
5. **The exact list of names removed from `lib/db/index.ts`** and the files deleted under `lib/db/`.
6. **Which existing tests are red on the handoff tree and why** — the shape 014's backend used, so QA
   inherits the list rather than discovering it one red run at a time.

### The schema change
`CURRENT_SCHEMA_VERSION` 4 → 5. The v4 block (`database.ts:111-113`, `.stores({})` + `upgradeToVersion4`) and
every block before it are frozen; v5 is a new block beside them. No `.stores()` argument on any historical
block is edited, and `tasks: "id, position"` is not restated — neither removed field was indexed, so there is
no index change. The empty-`.stores({})`-plus-`.upgrade()` form is the shape v4 established and v5 reuses it.

`upgradeToVersion5` deletes the `emoji` and `colorId` properties from every row in `tasks` and writes the rows
back. It does **not** renumber `position`, does not touch `done`, and never reads or writes `sessions`,
`backgrounds` or `appMeta`. A row that already lacks the fields, or carries `null` for either, is a no-op
rather than an error, and a second run on its own output changes nothing.

**Test the upgrade against a database seeded at version 4, not against a fresh version-5 one** — a fresh
database never runs the callback, so a broken callback passes a green suite. This is the same trap 014's risk
section recorded, and it applies again.

## Scope

**In:**
- Deleting `components/TaskListDialog.tsx`, `components/TaskList.tsx` and `components/TaskRow.tsx`.
- Moving add, edit, delete (with its inline confirmation) and `+1`/`-1` into the panel row and the panel's
  list, with the delete-focus bookkeeping that came with them.
- One toggle control in the bottom-right cluster, carrying `.control-edge` and `aria-expanded`.
- One new `lib/preferences/` key for the panel's visibility, `PREFERENCES_VERSION` 1 → 2, its validator, its
  `isPreferences` line and its default.
- Schema **4 → 5**: a new `.version(5)` block and an `.upgrade()` that strips `emoji` and `colorId` from
  every stored row; a version-4 seeding helper for tests.
- Narrowing `Task`, `TaskRecord`, `CreateTaskInput`, `UpdateTaskInput` and `ValidationIssue["field"]`;
  deleting the two validators and `isEmojiGraphemeCluster`; deleting `lib/db/palette.ts` and its exports.
- Deleting `components/TaskColorDot.tsx` and `components/task-palette-colors.ts`; stripping the emoji input
  and colour fieldset from `components/TaskForm.tsx`; removing `CurrentTaskCard`'s dead `TaskColorDot` import.
- Copy that stops naming the dialog: the panel's empty line currently says "Add one with the tasks button",
  which is false once the button is a toggle.
- Updating every test and spec the above invalidates (QA's, enumerated in criterion 43).

**Out — defer, do not absorb:**
- **A second task surface of any kind.** No dialog, no drawer, no popover, no "quick add" anywhere else. If
  the panel is hidden, tasks are unreachable — that is ruling 2's recorded consequence, not a gap to fill.
- **Any collapse state other than the one boolean.** No per-section collapse, no remembered scroll position,
  no width preference, no "compact rows" mode.
- **Any second notion of done**, auto-ticking, undo for a tick, archive, "clear completed", hide/filter
  toggles, progress summaries. Still out, as in 014.
- **Any change to the pomodoro-count rules**: `completed` stays 0-999, `eta` stays 1-20, and the automatic
  increment is unchanged. `+1`/`-1` change surface, not behaviour.
- **Replacing the colour dot or the emoji with anything.** No avatars, no initials, no generated colour from
  the title, no icon per task. The fields are being removed because the owner considers them unnecessary.
- **Any palette change.** No token value in `:root` or `.dark` moves and no new colour token, including any
  token work the retired swatches might now unlock (ruling 4).
- **A second frosted surface.** 012 ruling 2 caps it at one and the panel is not it.
- **Fixing the live-query staleness bug** recorded in 014's Implementation Notes (with a background image
  stored, live queries subscribed at page load stay at their first result). It reproduces at HEAD, it is not
  caused by either task, and it needs an owner decision. It is in this task's Risks because it shapes how QA
  writes tests, not because this task fixes it.
- **PLAN.md Maintenance items**, including the `/settings` `role="status"` (010 R-1), the two-tone glyph halo,
  the `.control-edge` applier guard (012 R-4) and the `:has()` fallback (012 R-2).
- Live cross-tab sync; export/import; PWA (milestone 7).
- Any change to `lib/timer/**`, `lib/stats/**`, `lib/audio/**`, `hooks/use-timer-clock.ts`,
  `hooks/use-hydrate-timer-store.ts`, `components/SloshGauge.tsx`, `components/HoldButton.tsx` (both vendored
  and frozen), `app/stats/**`, `components/Stats*.tsx`, `components/SettingsPanel.tsx`,
  `components/BackgroundControl.tsx`, `package.json`, `package-lock.json`.

## Acceptance Criteria
48 criteria in nine groups. **Group G is the measurement group and is deliberately separate from every
behaviour group** (qa cost rule 4): a token change re-runs group G and nothing else.

### A. Gate and order
- [ ] 1. **Backend hands off before frontend starts**, and Implementation Notes record, before that handoff,
      all six items listed under "Data shape / pipeline ordering". QA asserts each item is present and
      matches the shipped code.
- [ ] 2. **No token or palette value moves in this task.** No declaration in `:root` or `.dark` in
      `app/globals.css` changes value, and no colour token is added; `components/token-foundation.test.ts`
      and `components/token-dark.test.ts` still pin their hexes by value. If a figure in group G cannot be met
      without a token, that is a **blocker raised before the sweep**, not a change taken after it
      (CLAUDE.md "Measurement ordering" — a ruling that lands mid-sweep costs a full re-measure).
- [ ] 3. **Nothing new is depended on and nothing else is restyled.** `package.json`'s `dependencies` and
      `devDependencies` key sets are exactly the sets backend records at handoff, no file imports
      `lucide-react`, and no file under `lib/timer/`, `lib/stats/`, `lib/audio/`, `app/stats/` or
      `hooks/use-timer-clock.ts` / `hooks/use-hydrate-timer-store.ts` references the new preference key or the
      panel. Asserted by value and by scan, never as a diff against `HEAD` (criterion 46).

### B. Schema 4 → 5: the two fields leave
- [ ] 4. **`CURRENT_SCHEMA_VERSION` is 5**, the `.version(5)` block is declared as a literal beside a
      byte-identical `.version(4)`, no earlier block's `.stores()` argument is edited, and the highest-literal
      guard from 014 criterion 16 still passes **with no edit to it**. Proven non-vacuous by break-and-restore
      (criterion 47).
- [ ] 5. **The type no longer carries either field.** `Task`, `TaskRecord`, `CreateTaskInput` and
      `UpdateTaskInput` have no `emoji` or `colorId` key; `ValidationIssue["field"]` is exactly
      `"title" | "eta"`; `lib/db/index.ts` exports no palette name; `npm run typecheck` passes with no `any`.
- [ ] 6. **The upgrade strips both fields from stored rows.** A database seeded at version 4 with five tasks
      carrying `emoji`, `colorId`, `done` and dense positions, then reopened: every raw stored row (read via
      `db.table("tasks").toArray()`, **not** the repository's return value) satisfies `"emoji" in row === false`
      and `"colorId" in row === false`, while `id`, `title`, `eta`, `completed`, `done` and `position` are
      unchanged value-for-value on every row. `sessions` and `backgrounds` rows are untouched, `appMeta` still
      resolves `"pinnedTaskId"` to `undefined`, and the callback runs exactly once (reopening does not re-run it).
- [ ] 7. **No position is renumbered and no `done` is flipped.** The same seeded set, including a row seeded
      `done: true` and a row seeded at a non-zero position, comes back with the same `position` on every row
      and the same `done` on every row. The v5 upgrade writes no ordering change of any kind.
- [ ] 8. **A version-3 database still upgrades straight through.** Seeded at version 3 with a pin on the task
      at position 3, it opens at version 5 with: that task at position 0 and the rest densely renumbered in
      their previous relative order (v4's behaviour, preserved), `done: false` on every row, no
      `"pinnedTaskId"` row, and neither `emoji` nor `colorId` on any row. Seeded at version 1 likewise.
- [ ] 9. **Bad and already-clean rows are both no-ops.** Rows hand-written with the fields already absent,
      with `emoji: null`, with `colorId: 0`, and an empty `tasks` table all upgrade without throwing. Running
      the callback a second time on its own output changes nothing.
- [ ] 10. **The write path never reintroduces either field.** `createTask({ title, eta })` stores a row with
      neither key; a call that passes `emoji`/`colorId` at runtime (cast past the type) stores neither and
      does not throw; `updateTask` with either key stores neither. Asserted on the raw stored object. `/stats`
      aggregates an identical seeded `sessions` set to the same totals as before the change, pinned by value.

### C. The dialog is gone and the panel is the only task surface
- [ ] 11. **The dialog and its two components no longer exist.** `components/TaskListDialog.tsx`,
      `components/TaskList.tsx` and `components/TaskRow.tsx` are absent from the repo, no file imports any of
      them, and `/` renders no element with `role="dialog"` from the task flow. A grep-level guard asserts
      this so a later revert cannot reintroduce half of it.
- [ ] 12. **Every task action is in the panel row.** With the panel shown, each row exposes exactly these
      eight focusable controls in display mode: the done checkbox, the drag handle, move up, move down, `-1`,
      `+1`, Edit, Delete. QA asserts the set by accessible name per row, at 320 px and 1280 px.
- [ ] 13. **Add, edit, delete and the count behave as tasks 002 and 004 specified**, now in the panel: add
      clears the title field and keeps focus in it; a valid edit returns focus to that row's Edit control; the
      delete confirmation auto-focuses Cancel, is cancellable by Escape, returns focus to Delete, and on
      confirm moves focus to the task that took the deleted position (or the new last task, or the add form's
      title field), never `<body>`. `+1` is disabled at 999 and `-1` at 0, and neither ever touches `done`
      (014 criterion 7, re-run from the new surface).
- [ ] 14. **The add affordance is present in the empty state and works from it.** With no tasks, the panel
      shows both its empty line and the add affordance; adding from there stores the task, the empty line
      disappears, and the new task becomes current (`CurrentTaskCard` and the panel marker agree, 014
      criterion 24).
- [ ] 15. **Every write the panel now owns reports its failures in one place.** A rejected add, edit, delete,
      `+1`, `-1`, tick or reorder surfaces the panel's existing `role="alert"` write-failure line and leaves
      the row showing the stored value, not an optimistic one. A bare `console.error` is not sufficient on
      its own (014 criterion 28's reasoning, now covering four more writes). QA lists which of the seven it
      exercised and how.
- [ ] 16. **Still exactly one `DndContext` in the app**, asserted by scanning `app/`, `components/` and
      `widgets/`, and it is the panel's. Pointer drag, keyboard drag (pickup, move, drop, Escape-cancel,
      focus retained) and move up/down all still work with the four new controls beside them — 014 criteria
      39, 40, 43 and 44 re-run, because the handle now has siblings it did not have when they passed.
- [ ] 17. **Escape has one owner per layer and no dialog to defer to.** Escape during a panel drag cancels
      the drag only. Escape in an in-progress edit cancels the edit; Escape in the delete confirmation cancels
      the confirmation; neither bubbles further. Escape in the panel with nothing in progress does nothing —
      it does not navigate, clear state, or hide the panel.
- [ ] 18. **The word "pin" appears nowhere in `/`'s rendered text**, and no rendered copy names a control
      that no longer exists — specifically the panel's empty line no longer says "Add one with the tasks
      button". New copy names the real mechanism in one short sentence, carries no pressure, and is routed
      through `antislop-copywriting`.
- [ ] 19. **The panel still renders on `/` only.** `/settings` and `/stats` are unchanged, neither grows a
      panel or a toggle, and `npm run build` still lists exactly `/`, `/_not-found`, `/settings`, `/stats`.

### D. Row density: tap targets and reflow at phone widths, with figures
*This is the headline risk. 014 ruling 4 capped the panel row at four controls specifically so it would not
carry the eight `TaskRow.tsx` renders; this task puts it back to eight, in a panel that is pinned at `xl` and
in normal page flow below it. DECISIONS 2026-10-28 records Start not being pressable on a phone as exactly
this mistake in a different corner, so this group is measured, not eyeballed.*
- [ ] 20. **Every interactive element in the panel is at least 44 x 44 CSS px at 320 px, 375 px and 1280 px**,
      in display mode, editing mode and confirming-delete mode. **Measured on the labelled cell, not the bare
      input**: 014's notes record that the checkbox's own `getBoundingClientRect()` is 24 px while its label
      cell is the 44 px target, so a probe that reads the input reports a false failure. QA states which
      element it measured per control.
- [ ] 21. **Nothing is clipped and nothing overlaps.** At 320, 375 and 1280 px, with three tasks: every
      control's rect is fully inside its row's rect and inside the viewport width, and no two controls in a
      row have intersecting rects. Controls may wrap to more than one line — at 320 px the row's inner width
      is about 248 px (320 − `main`'s `px-4` 32 − Surface `p-3` 24 − row `p-2` 16), which fits four 44 px
      targets and a gap but not five, so two or three wrapped lines is expected and is not a failure. QA
      reports the measured row height and the panel's total height rather than asserting a cap on them.
- [ ] 22. **The title never collapses.** With a 100-character unbroken title, the title element's bounding box
      is **at least 120 px wide at 320 px and at least 180 px at 1280 px**, and never 0 at either. Where those
      figures come from: at 320 px the row's ~248 px of inner width gives up 44 px to the checkbox cell, 8 px
      of gap and ~44 px to the `completed / eta` count and its gap, leaving ~152 px, so 120 px is the floor
      with slack for font metrics; at 1280 px, 014's frontend measured 163 px for this exact title **with the
      colour dot and emoji present**, and removing both (change 3) returns about 56 px to the title, which is
      where 180 px comes from. This is the bug task 002 lost a fix loop to
      (`TaskRow.tsx:91-101`'s measurement comment, which dies with the file — whatever replaces it must stay
      true of the shipped row).
- [ ] 23. **No horizontal page scroll** at 320, 375 and 1280 px, in every panel state (shown and hidden; empty,
      loading, error, 3 tasks, 50 tasks): `document.documentElement.scrollWidth <= clientWidth`.
- [ ] 24. **The timer is still fully visible without scrolling at 320 x 568** with the panel shown and three
      tasks in it, as 014 criterion 29 required — re-run because the panel's in-flow height roughly doubles
      with the new controls. QA reports Start's bottom edge in CSS px at rest (014's frontend measured y 341
      before this change) and asserts the timer Surface's rect is entirely above the fold.
- [ ] 25. **With 50 tasks the panel is still bounded** (014 criterion 32, re-run under the taller row): at
      1280 x 800 it has a capped height with internal scrolling, the page behind it grows no scrollbar because
      of it, and the first and last rows are both reachable. At 320 px it grows in flow with no horizontal
      scroll.

### E. Hide/show, and the preference that outlives a reload
- [ ] 26. **One new preferences key, default visible.** `Preferences` gains exactly one key (name and type as
      recorded under criterion 1), its default is "panel shown", it has a validator line in
      `sanitizePreferences` and a line in `isPreferences`, and `PREFERENCE_VALUES` is unchanged for the
      existing keys. A non-boolean stored value falls back to the default without throwing, and one bad key
      never discards a good one.
- [ ] 27. **`PREFERENCES_VERSION` is 2 and a version-1 payload survives it intact.** A localStorage entry
      written at version 1 carrying a non-default `theme`, `gaugeStyle`, `background` id and `mix` rehydrates
      with **all four values intact** and the new key at its default, and the entry is rewritten at version 2.
      A payload already at version 2 is not re-migrated. This is the whole cost of the bump and it is the one
      thing that can go wrong with it (ruling 6).
- [ ] 28. **The state persists across reloads, both ways.** Hide the panel, reload: still hidden. Show it,
      reload: still shown. Asserted at 320 px and 1280 px. Clearing the stored entry returns to shown.
- [ ] 29. **Exactly one toggle exists** in the whole app, in the bottom-right cluster, and it carries
      `.control-edge` like its three siblings (ruling 2 — it sits on the bare photograph, and DECISIONS
      2026-10-29 settles that one colour cannot hold there). `.control-edge`'s applier count on `/` is **4**,
      so `e2e/control-edge-measure.spec.ts:123` needs no change. No second show/hide control is rendered
      anywhere, including inside the panel.
- [ ] 30. **The toggle is a real toggle.** It is a `<button>` with a constant accessible name that names the
      panel, `aria-expanded` reflecting the panel's rendered state, keyboard-reachable with a visible focus
      state, at least 44 x 44 px at 320 px and 1280 px. Activating it does not move focus: focus stays on the
      toggle in both directions, and showing the panel does not steal focus into it.
- [ ] 31. **A hidden panel is really hidden, and is the only thing hidden.** With the panel hidden, at both
      viewports: no element of the panel is in the accessibility tree, no element inside it is tabbable (Tab
      from the toggle never lands in it), and `/` renders **no** control that writes to the `tasks` table. The
      toggle itself is present, reachable without scrolling at 1280 x 800, and reachable in page flow at
      320 x 568. `CurrentTaskCard` and the timer are unaffected and still name the current task.
- [ ] 32. **No hydration flash in either stored state.** With the panel stored hidden, across 8 reloads the
      panel never paints — asserted with a `MutationObserver` installed via `addInitScript` watching
      `document`, **not `document.body`**, which did not exist yet when task 002's version of this test
      silently passed for two rounds (014 criterion 36's trap). With it stored shown, the panel does not
      disappear and return. In both states and at both viewports, the timer Surface's bounding box at first
      paint equals its box after a 1 s settle, so nothing the panel does on hydration moves the timer.
      Frontend records how this is achieved; the criterion does not prescribe it.
- [ ] 33. **Toggling writes nothing else.** Hiding or showing the panel changes no timer state (the countdown
      keeps running or stays frozen at the same value, and the persisted entry's `status`, `endTimestamp`,
      `pausedRemainingMs` and `runId` are byte-identical across the toggle), writes nothing to Dexie, and
      leaves every other preference value unchanged.

### F. Visual weight: the timer is still the focal point
*DECISIONS records ruling 4's dominance argument as accepted rather than answered. These three criteria are
the bound that replaces it, and each is checkable rather than a matter of taste.*
- [ ] 34. **The panel is bounded at rest.** At 1280 x 800 with an **empty** list, the panel's rendered box is
      **no taller than 240 px** (heading ~20 + gaps ~24 + an add affordance of at most two 44 px rows + the
      empty line ~20 + Surface padding ~24 ≈ 176, so 240 carries slack) — which is what stops the add form
      shipping as a permanently-expanded multi-field block (ruling 3). With **three tasks** the panel's box
      occupies **no more than 25% of the viewport area** at 1280 x 800 (today's geometry is 416 px wide by at
      most 480 px tall, which is 19.5%), and it overlaps neither the timer Surface nor the bottom cluster.
- [ ] 35. **The timer readout is still the largest thing on the page.** The largest computed `font-size` of
      any text inside the panel is **strictly less than half** the `mm:ss` readout's, at 320 px and 1280 px.
      Where the figures come from: the readout is `components/TimerDisplay.tsx`'s element, `text-6xl` (60 px)
      at 320 and `lg:text-8xl` (96 px) at 1280; the panel's largest text today is the ETA input at
      `text-xl` (20 px). QA reports both measured values per viewport.
- [ ] 36. **The panel buys no extra prominence.** No element the panel adds carries a `box-shadow`, `filter`,
      `backdrop-filter`, `animation` or `transition` beyond what `surface-solid` and the existing row classes
      already compute to, asserted on computed styles — so "dominant element" cannot be reached by glow,
      elevation or motion. `data-surface="frosted"` still has exactly one applier (012 criterion 5).

### G. Measurement — flat, both themes, no image in the loop
*Every figure is a table row: theme, element, **painted pixel RGB**, coordinates, ratio, floor, and the ground
it was taken against. A figure without its provenance does not count — task 010 carried three wrong numbers
for exactly that reason, two read from the wrong pixel and one from the wrong colour (CLAUDE.md "Measurement
ordering"). **No background image is set for any figure in this group**: the panel's surface is opaque and,
with nothing stored, paints nothing at all, so a row's ground is `--card` over `--background` and there is no
image in the loop (ruling 5). QA states that explicitly in the report.*
- [ ] 37. **One capture per theme, every pixel sampled in one pass** (qa cost rule 2), reusing the sampler
      already in `e2e/helpers/`. In **light and dark**, at 1280 x 800 DPR 1, inside the panel with no image
      stored, against the row's painted `--card` ground: the `-1`, `+1`, Edit and Delete buttons'
      `--control-border` edge and their label text; the add affordance's input border and its text and label;
      the delete confirmation's prompt text (`--destructive` on the
      `color-mix(in srgb, var(--destructive) 6%, var(--card))` fill) and its confirm button's
      `--destructive-foreground` on `--destructive`; and each of those controls' focus indicator. Floors:
      **≥ 4.5:1** for text, **≥ 3:1** for a control edge or a focus indicator's **outer edge against what
      surrounds it** (the clause narrowed by DECISIONS 2026-10-26 — against the ground, not against its own
      fill). These are re-read rather than inherited because the ground changed: they were measured inside the
      dialog, and they now sit on the panel's row.
- [ ] 38. **Full-coverage pixels only.** Per DECISIONS 2026-10-27, a stroke's measured value is its **fully
      covered** pixel, never its antialiasing fringe, and a 1 px stroke at a half-pixel offset has no covered
      row at all. For every 1 px boundary this task moves into the panel, QA reports whether a fully covered
      row exists at 1280 x 800 DPR 1 and what it measures. **Nothing is thickened pre-emptively**; a boundary
      with no covered row is reported to the orchestrator as a finding and informs PLAN.md's open 011 R-5
      question rather than being answered here.
- [ ] 39. **The toggle inherits, it does not earn a sweep.** The cluster toggle reuses the retired trigger's
      exact `.control-edge` treatment, so its pass condition is task 012's two-part rule and QA asserts
      **both halves** from one capture per theme: `max(border, halo) >= 3` against the ground **and**
      `contrastRatio(border, halo) >= 3`. The second half is the gap 012 review R-3 records as asserted
      nowhere in the suite — whatever covers the toggle asserts it, or it inherits the same hole. No
      adversarial image set: the figures 012 measured for the four triggers stand, and QA confirms them as a
      diff rather than re-deriving them (qa cost rule 6).

### H. Modes, motion and accessibility
- [ ] 40. **`forced-colors: active`** (`emulateMedia`): in the panel, no text becomes invisible, no control
      loses its edge, the checkbox's checked and unchecked states are still told apart, the done cue survives,
      the current-task marker is still visible, and the four moved controls still read as controls. The
      toggle keeps an edge in that mode (`border: 1px solid ButtonBorder`, per DECISIONS 2026-10-29 — a
      literal colour is ignored there). Each assertion paired with a default-mode equivalent so it cannot pass
      vacuously. `prefers-reduced-transparency: reduce` is stated as not applying to this surface.
- [ ] 41. **No axe-core violation of serious or critical impact** on `/`, in **light and dark**, at **320 px
      and 1280 px**, in each of: panel hidden; panel shown with an empty list; 3 tasks none done; 3 tasks with
      the first done; a row in editing mode; a row in confirming-delete mode; loading; error. Tab order
      through `/` matches visual order in each, and the panel adds at most one landmark (014 criterion 34,
      re-run). The "dialog open over the panel" state from 014 criterion 55 is gone and is replaced by
      "panel hidden".
- [ ] 42. **Nothing animates while nothing is happening.** After a 1 s settle with the timer **idle**, two
      frames of the panel region sampled 1 s apart are identical and **zero** `requestAnimationFrame`
      callbacks fire (timer running is the positive control). No new `setInterval`, `setTimeout` or
      `requestAnimationFrame` in any file this task adds or changes. Any transition the toggle adds is
      suppressed under `prefers-reduced-motion: reduce`.

### I. Test fallout, gates and red-proof
- [ ] 43. **The suites the deletions invalidate are updated, not deleted around.** Enumerated so QA inherits a
      list rather than discovering it one red run at a time:
      - **Gone or rewritten with the dialog:** `e2e/task-list-dialog.spec.ts` (37 tests) and
        `e2e/helpers/task-list-dialog.ts` (`openTaskList`, `closeTaskList`). **Fifteen spec files reference
        that helper or the dialog**, most of them to reach a task surface for measurement:
        `e2e/task-list.spec.ts`, `e2e/sessions.spec.ts`, `e2e/accessibility.spec.ts`,
        `e2e/token-task-surface.spec.ts`, `e2e/dark-contrast.spec.ts`, `e2e/dark-sweep.spec.ts`,
        `e2e/dark-a11y-console.spec.ts`, `e2e/dark-theme-control.spec.ts`, `e2e/dark-native-ui.spec.ts`,
        `e2e/uploaded-background-legibility.spec.ts`, `e2e/uploaded-background-dialog-edge.spec.ts`,
        `e2e/control-edge-measure.spec.ts`, `e2e/focus-surface-sweep.spec.ts`. Each is re-pointed at the
        panel or retired with a stated reason.
      - **The two specs that resolve `[data-surface="solid"]`** (`e2e/control-edge-measure.spec.ts:126`,
        `e2e/focus-surface-sweep.spec.ts:235`) were written for a header fill that never shipped and, since
        014, `.first()` now resolves **the panel**, so they read the panel's fill while calling it the
        header's. Named here because PLAN.md already carries them and a reader will otherwise assume they are
        fine.
      - **Unit suites that die with the deleted files:** `components/token-foundation.test.ts:68` (imports
        `TASK_COLOR_HEX`), `e2e/dark-contrast.spec.ts:2` (same), `e2e/token-task-surface.spec.ts:329` and
        `e2e/uploaded-background-legibility.spec.ts:386` (both measure a task swatch as a painted probe — the
        latter needs a different probe, not a deleted assertion), `components/TaskForm.test.tsx` (its emoji
        and colour cases), `lib/db/task-repository.test.ts` and `lib/db/session-repository.test.ts` (every
        seed carrying `emoji`/`colorId`), `lib/db/background-migration.test.ts` (asserts `verno`),
        `components/focus-cycle.guards.test.ts` (its per-file live-region count, which moves again when
        `TaskList.tsx` and `TaskRow.tsx` go).
      QA lists **every** changed or removed assertion with the reason, and states explicitly that none was
      weakened and none removed to make a failure go away. The four vacuity shapes from the 2026-10-09
      DECISIONS entry are banned, and so is `toBeVisible()` on something already true.
- [ ] 44. **A measurement a deleted file carried is re-homed, not dropped.** Specifically:
      `e2e/uploaded-background-legibility.spec.ts`'s criterion-14 probe used the task swatch as one of three
      painted interiors proving the image changes nothing behind an opaque fill. QA names the replacement
      probe and states that the criterion still discriminates, or reports that it no longer does.
- [ ] 45. **Raw-palette and token guards pass, including the two traps.** Zero raw Tailwind palette classes
      and zero colour literals in every file this task adds or changes; every new file appears in the
      discovered `FILES` set; `ALLOWED_RAW_UTILITIES` is still `{}`. The traps, named so nobody finds them in
      review: with `components/task-palette-colors.ts` deleted, **`ALLOWED_LITERALS` must become `{}`** and
      `palette.tokens.test.ts:177`'s "the exempt files are exactly the pinned two" assertion is wrong as
      written; and `INLINE_STYLE_EXEMPTION` (lines 72-76, 191-208, 312) names a file that no longer exists, so
      `read(INLINE_STYLE_EXEMPTION.file)` throws rather than fails. It is a single object, not a map, so
      removing it means restructuring that test rather than deleting one entry.
- [ ] 46. **No assertion added by this task is phrased as a diff against `HEAD`, `git diff`, or "unchanged
      from the previous commit".** Those invert the moment the work is committed; PLAN.md records three
      instances already. Anything this task needs to pin is pinned **by value**.
- [ ] 47. **Red-proof three criteria, at the cheapest level that discriminates** (qa cost rule 1), with the
      level named in the report: the v5 strip (6), the version-1 preferences payload surviving the bump (27),
      and the hidden panel persisting across a reload (28 — nothing cheaper than e2e discriminates it, say so).
      Prefer a unit break and re-run only the spec or test that covers it. If a break stays green at one level
      and red at another, say which.
- [ ] 48. `npm run lint` (0 errors, warnings no higher than the baseline QA measures **on the tree it was
      handed**, not on `HEAD`), `npm run typecheck`, `npm run build` (routes still exactly `/`,
      `/_not-found`, `/settings`, `/stats`), `npm run test` and `npm run test:e2e` all succeed. QA states its
      counts and the baselines it compared against; 014's counts are stale by the time this runs. Zero console
      errors or warnings in both themes across: load `/`, add a task, edit it, `+1`, `-1`, tick and untick it,
      drag a task to the top, delete it, hide the panel, reload, show the panel, start / pause / complete a
      run, flip the theme, reload.

## Files likely touched

**Backend (runs first, alone):**
- `lib/db/types.ts` — `emoji` and `colorId` leave `Task`/`TaskRecord`, `CreateTaskInput`, `UpdateTaskInput`;
  `ValidationIssue["field"]` narrows; the `PaletteColorId` import goes.
- `lib/db/database.ts` — `CURRENT_SCHEMA_VERSION` 4 → 5; the new `.version(5)` block and `upgradeToVersion5`.
- `lib/db/validation.ts` — `validateEmoji`, `validateColorId`, `isEmojiGraphemeCluster` deleted.
- `lib/db/task-repository.ts` — `createTask`/`updateTask` stop validating or writing the two fields;
  `DEFAULT_EMOJI` and the palette import go.
- `lib/db/palette.ts` — **deleted**.
- `lib/db/index.ts` — the four palette export lines go.
- `lib/db/test-utils.ts` — a version-4 seeding helper; `LegacyTask` adjusted for rows that still carry the
  two fields.
- `lib/preferences/schema.ts` — the new key, its default, its validator, its `isPreferences` line,
  `PREFERENCES_VERSION` 2, and the module doc comment at lines 1-14, which currently tells the next reader
  when to bump.
- `lib/preferences/store.ts` — the setter and the `partialize` line.

**Frontend (after handoff):**
- `components/TaskListDialog.tsx`, `components/TaskList.tsx`, `components/TaskRow.tsx`,
  `components/TaskColorDot.tsx`, `components/task-palette-colors.ts` — **deleted**.
- `components/TaskChecklistRow.tsx` — grows Edit, Delete (+ confirmation), `+1`, `-1`; loses the colour dot
  and the emoji; its line-one comment (lines 82-89) has to stay true of a row that now carries eight controls.
- `components/TaskChecklist.tsx` — grows the add affordance and the delete-focus bookkeeping; the empty-state
  copy changes; the early returns have to let the add affordance render in the empty state.
- `components/TaskForm.tsx` — the emoji input and colour fieldset go; `TaskFormValues` narrows.
- `components/CurrentTaskCard.tsx` — the dead `TaskColorDot` import goes.
- `components/task-row-styles.ts` — comment only; it no longer serves two surfaces.
- A new toggle component under `components/` and `widgets/BottomControls.tsx` — the cluster slot.
- `widgets/TaskPanel.tsx` — rendered conditionally on the preference; its comment block names the breakpoint
  rules and must stay true.
- `app/page.tsx` — only if the conditional render has to live there rather than in the panel.
- `app/globals.css` — only if group G cannot be met without a token, which is a blocker to raise first
  (criterion 2).

**QA only:** the fifteen e2e files in criterion 43, `lib/db/task-repository.test.ts`,
`lib/db/session-repository.test.ts`, `lib/db/background-migration.test.ts`, a new migration spec for 4 → 5,
`lib/preferences/preferences.test.ts`, `components/TaskForm.test.tsx`, `components/palette.tokens.test.ts`,
`components/token-foundation.test.ts`, `components/focus-cycle.guards.test.ts`, plus a panel-density spec and
whatever the existing `e2e/helpers/` sampler needs (extend it; do not write a second one).

**Not touched:** `lib/timer/**`, `lib/stats/**`, `lib/audio/**`, `hooks/use-timer-clock.ts`,
`hooks/use-hydrate-timer-store.ts`, `hooks/use-current-task.ts`, `hooks/use-tasks.ts`, `app/stats/**`,
`components/Stats*.tsx`, `components/SloshGauge.tsx`, `components/HoldButton.tsx`,
`components/SettingsPanel.tsx`, `components/BackgroundControl.tsx`, `lib/preferences/boot-script.ts` (unless
backend records a reason), `package.json`, `package-lock.json`.

## Risks
- **Row density at 320 px is the one most likely to fail**, and it is a reversal of a structural answer, not
  an oversight: 014 ruling 4 capped the row at four controls *because* eight will not fit beside a title, and
  the comment recording that measurement lives in a file this task deletes. Group D is the whole safety net.
  PLAN.md already records 320 px as tight (header 80 px wrapped, gauge top at 352 px, Start not pressable at
  rest), so the panel growing taller pushes on a viewport that has no slack.
- **The panel's visual weight is accepted, not solved.** Criteria 34-36 bound it; they do not make it calm.
  If the shipped panel still reads as the page's focal point despite passing all three, that is a finding for
  the orchestrator and an owner question, not a criterion QA can fail.
- **Hiding the panel hides every task control in the app** (ruling 2). If the toggle is ever unreachable — at
  a viewport nobody measured, under forced colours, or behind a hydration bug — the data is unreachable with
  it. Criteria 30 and 31 are why that is measured at both viewports and in forced colours.
- **The migration is the second destructive one in the repo and the first that removes data.** v4 backfilled,
  reordered and deleted one key; v5 deletes two properties from every task row, with no undo and no export
  path until milestone 7. If it throws, the upgrade aborts and the user's database stays at v4 — recoverable,
  but it presents as "the app will not load". Criteria 6-9 are the net. **Seed at version 4, not fresh at 5.**
- **Every seeded-database test now runs the whole chain 1 → 5.** That is why 014 criterion 17's "emoji and
  colours intact" clause is invalid rather than merely stale: a test that opens the database cannot observe
  version 4's output any more. Any assertion about a mid-chain state has to be made on the final state or not
  at all.
- **A live-query staleness bug is already known and is not this task's to fix.** 014's Implementation Notes
  record that, when a background image is stored, every live query on `/` subscribed at page load stays at its
  first result — it reproduces at HEAD and the root cause was not found. **QA tests that seed a background and
  then add, tick, drag or delete on `/` will see stale UI**, which will look like a 015 failure and is not
  one. Tests for groups C, D and E should not seed a background unless the criterion is about one.
- **`components/palette.tokens.test.ts` is load-bearing and brittle.** Its exemption map and single
  `INLINE_STYLE_EXEMPTION` object both name a file this task deletes, so the guard that protects the whole
  token foundation breaks as a side effect of a deletion. Criterion 45 names it; restructuring it carelessly
  is how the repo loses its raw-palette guard quietly.
- **`e2e/control-edge-measure.spec.ts` does two jobs that pull apart.** Its `toBe(4)` count is protected by
  ruling 2, but its `[data-surface="solid"]` locator now resolves the panel. Fixing one without noticing the
  other leaves a spec reporting the panel's numbers under the header's name.
- **Licensing: nothing ships, and that is the trap.** No asset: the toggle's glyph comes from `react-icons`
  (ratified 2026-10-26), which the retired trigger already used (`FaTasks`); a third icon library is forbidden
  and `lucide-react` must not gain its first import. `docs/DECISIONS.md` gains **no** asset provenance entry.
- **Next.js version.** Per `AGENTS.md`, read the relevant guide in `node_modules/next/dist/docs/` before
  touching `app/page.tsx` or adding a client boundary. Backend likewise reads Dexie's versioning guide before
  writing the `.version(5)` block — a version whose only purpose is an upgrade callback is a shape this repo
  has used exactly once (v4).
- **antislop.** This changes a UI surface, copy and mobile layout, so `antislop-ui`, `antislop-copywriting`
  and `antislop-layoutmobile` all apply (R-03: mobile is a distinct state, not a squeezed desktop). Frontend
  confirms the session mode still holds, announces `antislop active: <mode> (<source>).` before its first UI
  edit, and runs the Delivery Gate.
- **A `docs/DECISIONS.md` entry is owed** for what this task settles beyond the 2026-11-06 ruling itself: the
  deletion of `TaskList.tsx`/`TaskRow.tsx` rather than their reuse, the one-toggle-in-the-cluster placement
  and why two controls were rejected, and the retirement of PLAN.md's "dark `--popover` cannot be lifted"
  constraint now that the swatches are gone. *(Owned by the orchestrator, which lands docs; neither frontend
  nor backend edits `docs/`.)*
