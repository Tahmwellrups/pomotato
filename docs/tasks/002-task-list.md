---
id: 002
slug: task-list
status: done # draft | in-progress | qa | review | done | blocked
---

# Task list with pinned current task and drag-and-drop ordering

> **History for this task** — implementation notes, QA reports, review findings and
> orchestrator rulings live in [logs/002-task-list-log.md](logs/002-task-list-log.md). Read it only when a
> criterion below is disputed; it is not an input to implementing them.

## Goal
Add a persistent task list to the home route (`/`). Each task has a title, an emoji, a color, an estimate in pomodoros, and a completed-pomodoro count. Users can add, edit, delete, and reorder tasks, and pin exactly one of them as the "current task" shown next to the timer. Tasks, their order, and the pin are stored in IndexedDB through Dexie and survive reloads.

## Data shape / pipeline ordering
- **Backend runs first. Frontend does not start until backend has handed off.** This is the first Dexie-backed feature. The brief puts tasks in Dexie, and milestone 3 (session logging) will need to reference tasks by a stable id. Unlike milestone 1, the data shape is not decided yet, so backend owns it.
- Backend delivers, under `lib/db/`:
  - the Dexie database declaration (first schema version) with a tasks table,
  - TypeScript types for a task record,
  - a repository: create, update, delete, reorder, pin/unpin, increment/decrement completed count, and list in display order,
  - validation inside the repository for every rule under "Field rules" below, so bad data is rejected even if the UI is bypassed.
- Backend chooses where the pin is stored (a field on the task, a separate record, or something else) and how order is represented (integers, fractional keys, or something else). Whatever the choice, the invariants under "Pin" and "Order" must hold in the data layer, inside a single transaction where more than one record changes. A UI-only guarantee is not enough.
- Before handing off, backend records these in this file's Implementation Notes: the database name, table name(s), the exact record shape, the repository's function signatures, and how a test can seed or clear the database. Frontend and QA build on this.
- After backend hands off, frontend builds the UI against the repository. Backend and frontend must not edit the same files. Backend owns `lib/db/**`. Frontend owns `components/`, `app/`, and `hooks/`.

### Decision: ETA unit
ETA is **estimated pomodoros**: a whole number from 1 to 20, default 1. This is the same unit as the completed-pomodoro count, so progress reads as "2 / 4" with no time conversion. Session length also varies (Custom mode goes from 1 to 180 minutes), so a minutes-based ETA would mean nothing against a pomodoro count. Showing a wall-clock finish time is deferred.

### Decision: completed-pomodoro count is NOT wired to the timer in this task
In this task the count is stored per task and changed only by the user, through increment and decrement controls. Milestone 3 will increment it automatically when a focus session completes, in the same step that writes the session log entry. Reasons:
- Automatic counting has the same edge cases session logging has to solve anyway: a focus session that expired while the tab was closed, reloads into `complete`, and two tabs both seeing the same completion. Solving them twice, in two places, risks double counts and a count that disagrees with the session log.
- Task 001's timer store is approved and done. Hooking task writes into its completion path would reopen it with no session record to tie the increment to.
- Manual controls keep the field testable now and let users fix mistakes later.

Milestone 3 must be able to increment this count in the same transaction as the session write, so backend should keep it a plain field on the task, or equivalent, that a later transaction can update.

## Scope
**In:**
- A task list section on `/`, next to or below the existing timer. The timer's behavior does not change.
- A "Current task" area near the timer showing the pinned task's emoji, title, and `completed / estimated` count. When nothing is pinned it shows an empty-state message.
- Add a task: title, emoji, color, ETA.
- Edit a task's title, emoji, color, and ETA.
- Delete a task, with a confirmation step.
- Increment and decrement a task's completed-pomodoro count by hand.
- Pin a task as the current task, or unpin it. At most one task is pinned at any time.
- Reorder by drag and drop with dnd-kit, with pointer input and dnd-kit's keyboard sensor, plus a single-pointer alternative that does not require dragging (for example move up / move down controls; frontend picks the form). The new order persists.
- Persistence in IndexedDB through Dexie: tasks, order, and pin survive a reload.
- Installing the runtime dependencies this slice needs: `dexie` (installed by backend), the dnd-kit packages (installed by frontend), and any test-only helpers such as an IndexedDB fake for Vitest (installed by QA), following the split in `docs/DECISIONS.md`.

**Out (deferred):**
- Automatically incrementing the completed count when a focus session ends (milestone 3).
- Session logging, history, per-task stats, and charts (milestone 3).
- Marking tasks done, archiving, or hiding completed tasks.
- Subtasks, notes, due dates, tags, priorities, search, filtering, multiple lists.
- A wall-clock ETA (for example "done by 4:30 pm") or totals across tasks.
- Custom colors beyond the fixed palette, and theme-aware palettes (milestone 4).
- Undo for delete.
- Live sync between two open tabs. Each tab must show the correct state after a reload. Updating live without a reload is not required.
- Export/import and PWA (milestone 7).
- Sound, music, mascot art.
- Any change to timer behavior, durations, or the timer's persisted shape.

## Field rules
These apply both in the repository (backend) and in the UI (frontend). The repository rejects invalid input with a typed error and does not write anything.

| Field | Rule | Default on create |
|---|---|---|
| Title | Required. Leading and trailing whitespace is trimmed before validating and saving. 1 to 100 characters after trimming (counted as Unicode code points). Whitespace-only is rejected. | none (user must enter one) |
| Emoji | Exactly one emoji grapheme cluster. Multi-codepoint emoji count as one: ZWJ sequences (`👩‍💻`), skin-tone modifiers (`👍🏽`), flags (`🇵🇭`), keycaps (`1️⃣`). Rejected: empty, plain letters or digits (`a`, `7`), punctuation, two or more emoji (`🥔🍅`), emoji plus text (`🥔a`). | `🥔` |
| Color | One value from a fixed palette of 6 to 10 colors. Each color has a stable identifier and a human-readable text name. Arbitrary hex or CSS color strings are rejected. Stored as the palette identifier, not as a raw color value, so milestone 4 themes can remap it. | first palette entry |
| ETA (estimated pomodoros) | Integer from 1 to 20 inclusive. Rejected: empty, 0, negatives, decimals (`2.5`), values over 20, non-numeric text. | 1 |
| Completed pomodoros | Integer from 0 to 999 inclusive. It may be higher than ETA (overruns are allowed). Decrementing at 0 does nothing. Incrementing at 999 does nothing. | 0 |
| Id | Stable and unique. Never changes after creation and never reused after deletion. | generated |

## Acceptance Criteria

### Data layer (backend; QA verifies with unit tests against the repository)
- [ ] Creating a task with valid input persists it and returns the stored record, including its id and the defaults from the table above for any omitted optional field.
- [ ] Each rejection case in the Field rules table produces an error from the repository and writes nothing. QA checks this with one test case per listed example.
- [ ] Each acceptance case in the Field rules table succeeds: a 1-character title, a 100-character title, a title with surrounding spaces (stored trimmed), each listed multi-codepoint emoji, every palette identifier, ETA 1 and 20, completed count 0 and 999.
- [ ] A new task is added at the end of the list order.
- [ ] Listing tasks always returns them in display order, and the order is deterministic: the same stored data always produces the same order.
- [ ] Moving a task from position A to position B, for any A and B in a list of at least 5 tasks, produces the expected order. Positions stay unique after any sequence of 50 random moves (QA can check this with a property-style or looped test).
- [ ] Moving a task to the position it already occupies leaves the order unchanged.
- [ ] Pinning task B while task A is pinned leaves only B pinned, in one transaction. No read can ever see both pinned or neither pinned partway through.
- [ ] Unpinning the pinned task leaves no task pinned.
- [ ] Deleting the pinned task leaves no task pinned. No stored reference to the deleted id remains.
- [ ] If stored data somehow references a pin to a task id that does not exist, reading the current task returns "none". It does not throw.
- [ ] Deleting a task leaves the relative order of the remaining tasks unchanged.
- [ ] Updating, deleting, pinning, or reordering a task id that doesn't exist returns a typed "not found" error. It does not throw an untyped exception and does not create a record.
- [ ] Importing or calling anything in `lib/db/` during a server render or build doesn't crash. Database access happens only in the browser.
- [ ] The database is declared with an explicit schema version, so milestone 3 can add a `sessions` table with a version bump and no loss of existing tasks.

### Add task (UI)
- [ ] On first visit with an empty database, the task list shows an empty-state message and the add-task form. The Current task area shows its own empty-state message.
- [ ] The add form has a labeled title field, an emoji control, a color control, and a labeled ETA field. Defaults: emoji `🥔`, first palette color, ETA 1.
- [ ] Submitting with a valid title, by pressing Enter in the title field or activating the submit button, adds the task at the bottom of the list. The title field is cleared and keeps focus so the next task can be typed right away. Emoji, color, and ETA go back to their defaults.
- [ ] Submitting with an empty or whitespace-only title, or with any invalid field, adds nothing and shows an inline error message for each invalid field. Each error is programmatically linked to its field (screen readers read it with the field), and the field is marked invalid.
- [ ] If the emoji can be typed as free text, each rejected emoji example from the Field rules table shows an inline error and is not saved. If the emoji is chosen from a fixed set instead, the set has at least 12 options, every option is a valid single emoji, and each has an accessible name.
- [ ] The color control shows the palette with each color's text name available to assistive tech. The selected color is exposed programmatically (for example checked, selected, or pressed), not by color alone.

### Task row display
- [ ] Each task row shows its emoji, title, a color indicator, and the count as `completed / estimated` (for example `2 / 4`). Overruns display as they are (`5 / 4`).
- [ ] The color indicator has at least 3:1 contrast against the background behind it. Any text drawn on a task color has at least 4.5:1 contrast.
- [ ] Long titles (100 characters, no spaces) do not overflow the row or push controls off-screen at a 320 px viewport width.
- [ ] The list is a semantic list element (`<ul>` or `<ol>` with `<li>` items).

### Edit task
- [ ] Each task has an Edit control whose accessible name includes the task title (for example "Edit Write report").
- [ ] Editing lets the user change title, emoji, color, and ETA under the same validation rules as Add. Saving a valid edit updates the row and persists across reload.
- [ ] An invalid edit can't be saved. It shows the same inline, linked errors as Add, and the stored task stays unchanged.
- [ ] Cancelling an edit, with a Cancel control or with Escape, discards the changes. The row shows the original values and focus returns to the task's Edit control.
- [ ] Editing the pinned task updates the Current task area right away, with no reload.
- [ ] Setting ETA lower than the current completed count is allowed (it becomes an overrun display).

### Completed-pomodoro count
- [ ] Each task has increment and decrement controls for the completed count. Their accessible names include the task title (for example "Add a completed pomodoro to Write report").
- [ ] Increment adds exactly 1. Decrement removes exactly 1. Decrement is disabled or does nothing at 0. Increment is disabled or does nothing at 999. A disabled control is exposed as disabled to assistive tech.
- [ ] Count changes persist across reload.
- [ ] Count changes on the pinned task show up in the Current task area right away.
- [ ] Completing a focus session in the timer does **not** change any task's count (by decision above). QA verifies this by fast-forwarding a focus session to completion with a task pinned and checking the count did not change.

### Pin / current task
- [ ] Each task has a pin control whose accessible name includes the task title. Its pinned or unpinned state is exposed programmatically (for example `aria-pressed`, or a label that switches between "Pin" and "Unpin"), not by color or icon alone.
- [ ] With no task pinned, pinning task A makes A the current task. The Current task area shows A's emoji, title, and count.
- [ ] With A pinned, pinning task B makes B the current task and A not pinned, in a single user action with no confirmation. Afterward exactly one task (B) shows as pinned in the list.
- [ ] With A pinned, activating A's pin control again unpins A. No task is pinned, and the Current task area shows its empty-state message.
- [ ] Pinning or unpinning does not change the task's position in the list.
- [ ] The pin, or the lack of one, persists across reload.
- [ ] Pinning, unpinning, editing, reordering, or deleting tasks while the timer is running or paused doesn't change timer state. The countdown keeps running, or stays paused at the same value.

### Delete task
- [ ] Each task has a Delete control whose accessible name includes the task title.
- [ ] Activating Delete asks for confirmation before deleting. Cancelling the confirmation, with a Cancel control or with Escape, leaves the task in place unchanged and returns focus to that task's Delete control.
- [ ] Confirming removes the task from the list and from storage. It stays gone after reload.
- [ ] After deletion, focus moves to a predictable place: the task that took the deleted task's position. If the deleted task was last, focus goes to the new last task. If the list is now empty, focus goes to the add form's title field. Focus never drops to `<body>`.
- [ ] **Deleting the pinned task:** the Current task area immediately shows its empty-state message, no other task becomes pinned automatically, and after reload there is still no pinned task.
- [ ] Deleting a task that is not pinned leaves the existing pin unchanged.

### Reordering (drag and drop)
- [ ] Each task has a dedicated, focusable drag handle with an accessible name that includes the task title (for example "Reorder Write report"). Clicking or tapping the row's other controls (edit, delete, pin, increment, decrement) never starts a drag.
- [ ] **Pointer:** dragging a task by its handle to a new position and releasing it puts the task in that position.
- [ ] **Keyboard (dnd-kit keyboard sensor, required):** with the handle focused, Space or Enter picks the task up, Up/Down arrow keys move it one position at a time, and Space or Enter drops it in the new position. Escape during a keyboard drag cancels it and returns the task to its original position, and nothing is persisted. Focus stays on the moved task's handle after the drop.
- [ ] **Screen-reader announcements:** pickup, each move, drop, and cancel are announced through a live region using the task's title and its position, for example "Picked up Write report. Position 2 of 5." Announcements never expose internal ids.
- [ ] **Single-pointer alternative (WCAG 2.2 SC 2.5.7):** every task can be moved up or down one position with plain clicks or taps, no dragging required. The control that would move the first task up, or the last task down, is disabled or absent.
- [ ] **Persistence:** after any reorder (pointer, keyboard, or single-pointer), reloading the page shows the same order. QA checks this with at least: move the last of 5 tasks to the top, move the top task to the middle, then reload.
- [ ] Dropping a task in its original position changes nothing, and the stored order is identical.
- [ ] Reordering keeps working with 50 tasks, including keyboard moves across the full list.

### Persistence / rendering
- [ ] Reloading with tasks in storage produces no React hydration-mismatch errors or warnings in the console.
- [ ] While the initial database read is pending, the list does not show the empty-state message. If tasks exist, the empty-state text never appears at any point during load (QA checks this from the start of navigation).
- [ ] If IndexedDB is unavailable or the database fails to open, the page still renders the timer, and the task area shows a plain error message instead of crashing.

### Regression
- [ ] Every Vitest and Playwright test from task 001 still passes unchanged. Timer files under `lib/timer/` and the timer's persisted shape (`pomotato-timer`, version 1) are not modified.

### Accessibility
- [ ] Every control in the task area (add form fields, emoji and color controls, edit, delete and its confirmation, pin, increment, decrement, drag handle, move up/down) can be reached with Tab in a logical order matching the visual order, and can be operated with Enter and/or Space as native controls are.
- [ ] Every interactive element shows a visible focus indicator with at least 3:1 contrast, including during and after a keyboard drag.
- [ ] Native semantic elements are used (buttons, inputs, labels, list). Icon-only buttons have text accessible names that include the task title where the control acts on one task.
- [ ] Emoji are never the only accessible name of a control.
- [ ] Text meets WCAG AA contrast (4.5:1 normal text).
- [ ] No axe-core violations of serious or critical impact on `/` in each of these states: empty list; 3 tasks with none pinned; 3 tasks with one pinned; an edit in progress; the delete confirmation open; validation errors showing in the add form.
- [ ] Interactive targets in the task area are at least 24×24 CSS px (WCAG 2.2 SC 2.5.8). The 44 px used in task 001 is preferred.

### Tooling / quality gates
- [ ] `npm run lint`, `npm run typecheck`, `npm run build`, `npm run test`, and `npm run test:e2e` all succeed.
- [ ] No `any` types in new code.
- [ ] Backend's Implementation Notes record the database name, tables, record shape, repository signatures, and test seeding/clearing approach before frontend starts.

## Files likely touched
- `lib/db/` (backend): Dexie database declaration, task types, task repository, validation, palette identifiers if backend owns them. Exact file names are backend's call.
- `components/` (frontend): task list, task row, add/edit form, emoji and color controls, delete confirmation, Current task area. PascalCase filenames.
- `hooks/` (frontend): possibly `use-` hooks for reading tasks and the current task from the repository.
- `app/page.tsx` (frontend): place the task list and the Current task area alongside `<PomotatoTimer />`.
- `app/globals.css` (frontend): only if palette or focus styles need it.
- `package.json` / lockfile: `dexie` (backend), dnd-kit packages (frontend), an IndexedDB fake for Vitest if needed (QA).
- Test files (`*.test.ts(x)`, `e2e/**`): owned by QA.
- **Not touched:** `lib/timer/**`, `hooks/use-timer-clock.ts`, `hooks/use-hydrate-timer-store.ts`. `components/PomotatoTimer.tsx` changes for layout only, if at all.

## Risks
- **First Dexie schema.** Whatever ships here becomes version 1 of the user's IndexedDB. Changing it later needs a Dexie version upgrade. Backend should get the id, order, and pin representation right now, and leave room for milestone 3's `sessions` table and a task-id reference from it.
- **Pin consistency.** Keeping the pin outside the tasks database (for example in a Zustand store) would make "delete pinned task" a two-store write that can half-fail and leave a dangling pin. The invariants above require consistency. Backend should choose a representation that makes it atomic. The dangling-reference fallback is a second safety net, not the plan.
- **Order representation.** Integer positions mean rewriting many rows per move. Fractional keys can run out of precision after many moves between the same neighbors. Either is acceptable if the "unique after 50 random moves" criterion holds. Backend should note the tradeoff it picked.
- **SSR and hydration.** IndexedDB doesn't exist on the server. Reading tasks during render, or rendering an "empty" state before the read resolves, causes hydration warnings or a flash of the empty state. Both are covered by criteria.
- **Emoji validation.** "One emoji" is hard to validate by hand. Naive length checks break ZWJ sequences, flags, and skin tones. Grapheme segmentation needs a browser and Node runtime that supports it (Vitest's jsdom included). QA's table covers the hard cases.
- **Emoji licensing.** Emoji render with the OS system font. Do not bundle an emoji image set or font in this task: common sets such as Twemoji are CC-BY and need attribution, and per CLAUDE.md any bundled asset must be original or CC0 with provenance in `docs/DECISIONS.md`. Emoji will look different on each platform, and that is accepted.
- **Drag-and-drop accessibility.** dnd-kit's default screen-reader announcements read internal ids ("Draggable item 3"), so custom announcements are required. The keyboard sensor does not satisfy WCAG 2.5.7. That rule needs a single-pointer alternative, which is why move up/down is in scope.
- **Pointer drag versus controls and scrolling.** On touch screens, a drag gesture can swallow taps on row buttons or block scrolling. The handle-only and "controls never start a drag" criteria cover this.
- **Destructive delete.** There is no undo and no export until milestone 7. The confirmation step is the only safeguard.
- **Color palette and themes.** Palette colors are picked against the current cream background. Milestone 4 themes will need to remap them, which is why the identifier is stored and not the raw color. The 3:1 indicator and 4.5:1 text criteria apply only to the current background in this task.
- **Multiple tabs.** Without live cross-tab updates, two tabs can show stale lists, and a reorder in one tab can overwrite another's. Last write wins is acceptable. Corrupted order (duplicate positions) is not, and that is covered by the data-layer uniqueness criterion.
- **Stack and dependency questions for the orchestrator.**
  - The 2026-10-02 decision in `docs/DECISIONS.md` only names `zustand`. This task applies the same rule: the role whose code needs a runtime dependency installs it. A short decision entry recording that would help.
  - If backend or frontend want `dexie-react-hooks` (a separate package from the Dexie project), check whether it counts as part of the approved "Dexie" stack item or needs user approval under CLAUDE.md's "ask before changing this stack".
- **Next.js version.** Next 16.3.8. Per AGENTS.md, frontend reads `node_modules/next/dist/docs/` before writing route or component code.
- **Antislop / design direction.** There is still no `DESIGN.md`. Task 001 styled itself as "draft without direction", and this task should match that look and not invent a new visual language.
