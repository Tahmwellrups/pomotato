---
id: 004
slug: task-list-popup
status: done # draft | in-progress | qa | review | done | blocked
---

# Move the task list into an on-click popup, keep the current task card inline

> **History for this task** — implementation notes, QA reports, review findings and
> orchestrator rulings live in [logs/004-task-list-popup-log.md](logs/004-task-list-popup-log.md). Read it only when a
> criterion below is disputed; it is not an input to implementing them.

## Goal
Relocate the existing task list (`components/TaskList.tsx`) from the body of `/` into a shadcn Dialog opened by a trigger button on `/`. `CurrentTaskCard` stays rendered inline on `/` exactly as today. Nothing about the task data, the timer, or stats changes: this is a relocation of existing UI plus the focus, keyboard, and drag behaviour that relocation puts at risk.

## Interpretation decisions (settled, not open questions)
The owner's words were: "Refactor the tasklist to be an on-click pop up task checklist but keep the current task card. Utilize shadcn for this". The owner declined clarifying questions, so the orchestrator settled the reading below. These are decisions. Do not reopen them inside this task; a change of mind becomes a new task.

1. **"Pop up" means a shadcn Dialog**, a centered modal over `/`, built from `npx shadcn add dialog` (Radix Dialog under the hood). Not a popover, not a dropdown, not a side sheet, not a new route.
2. **"Checklist" means the existing list moved into the popup**, with the same task shape it has today: title, emoji, color, ETA, completed-pomodoro count, pin, drag-reorder, plus add / edit / delete. It does **not** mean adding a done/ticked state. A tick-off state is a new field, a Dexie v3 schema bump, and a migration, which is far outside "refactor the tasklist". If the owner wants tick-off behaviour, it becomes its own task with its own backend pass.
3. **`CurrentTaskCard` stays inline on `/`**, explicitly required by the owner ("keep the current task card"). It is the at-a-glance view while the timer runs; the popup is where the list is managed.
4. **No backend work.** The data shape is already decided and shipped (task 002 Implementation Notes, plus task 003's v2 schema). `lib/db/**` and `lib/stats/**` are untouched by this task, so there is no backend-before-frontend ordering: **frontend runs first, then qa**. Any need to change `lib/db/**` means this task's scope was wrong, so stop and report instead of editing it.
5. **The delete confirmation stays inline in the task row, inside the dialog.** It is not promoted to an `AlertDialog`. Reason: a nested modal means two stacked focus traps and two Escape handlers over a list that also has a keyboard drag mode, which is already the riskiest interaction in this task. Task 002's inline prompt (auto-focus on Cancel, Escape cancels, focus returns to that row's Delete button, `role="group"` + `aria-labelledby` pointing at the question) is reviewed, working, and does not need a focus trap. Promoting it to `AlertDialog` is deferred.

## Scope

**In:**
- A trigger control on `/` that opens the task list in a shadcn Dialog.
- `components/TaskList.tsx` rendered inside that dialog, with its current behaviour intact: add form, task rows, edit, delete with inline confirmation, pin/unpin, increment/decrement, drag-reorder (pointer + dnd-kit keyboard sensor), move up / move down, loading / empty / error states.
- `CurrentTaskCard` rendered inline on `/`, unchanged except for copy that stops being true once the list is behind a click (its empty state currently reads "Pin one from your task list below", and there is no list below any more).
- Running `npx shadcn add dialog` for the first time in this repo, including reconciling anything the CLI tries to do to `app/globals.css`.
- Making the dialog chrome (overlay, surface, title, close control) and the trigger follow DESIGN.md: semantic tokens only, Comfortaa for the dialog heading via the existing `font-heading`, motion that respects `prefers-reduced-motion`.
- A one-line token fix folded in: `app/page.tsx`'s "Focus stats" link currently uses `text-amber-800` and `focus-visible:outline-amber-700`, flagged as N4 in task 003's Review Findings. It is in the same file this task edits, it is one line, and leaving raw palette utilities on `/` while adding a new token-based surface next to them is the exact drift that note warned about.
- Updating every existing test that assumed the list renders inline (owned by qa, see the cost note below).

**Out (deferred, do not do here):**
- Any done/ticked state, archiving, or hiding completed tasks (decision 2 above).
- Any change to `lib/db/**`, `lib/stats/**`, the Dexie schema, or stored data.
- Any change to timer behaviour, durations, persisted timer shape, or `/stats`.
- Promoting the delete confirmation to `AlertDialog` (decision 5 above).
- Swapping the Dialog for a Sheet/Drawer at small viewports. The Dialog must work at 320 px (criteria below); a different component on mobile is a separate decision for the owner.
- Retrofitting milestone 1 and 2 components onto shadcn primitives. Per the 2026-10-07 decision in `docs/DECISIONS.md`, shadcn applies to new surfaces only: `PomotatoTimer`, `TaskRow`, `TaskForm`, `ModeSelector` and friends keep their hand-built markup. The only new shadcn surface here is the Dialog (and, if frontend wants it, the trigger `Button`).
- Converting the rest of `/`'s existing `stone-*` / `amber-*` utility classes to tokens. Only the one line named above.
- Dark mode, themes, paper grain, mascot animation (milestone 4).
- Bulk actions, search, filtering, multiple lists, undo.

## Known cost: 52 e2e tests need an "open the popup" step
`e2e/task-list.spec.ts` contains **52 `test(...)` cases**, all of which currently drive the task list straight after `page.goto("/")` because the list renders inline. Nearly every one needs the dialog opened before its first interaction. `e2e/accessibility.spec.ts` and `e2e/sessions.spec.ts` also reach into task-list markup (pin, add, row controls) and need the same treatment.

**This is expected work for this task, not scope creep and not a regression.** A later reader seeing ~52 modified tests in the diff should read this paragraph first. Specifics:

- **qa owns all of it.** Frontend does not touch `e2e/**` or `*.test.ts(x)`.
- Most of the cost should land in the existing shared `test.beforeEach` in `e2e/task-list.spec.ts` plus one helper (open the dialog, wait for the list), not 52 hand-edited blocks. Tests that reload mid-test need an explicit re-open after each reload, since a reload closes the dialog.
- **No assertion about task behaviour may be weakened while relocating.** Only navigation and setup may change. Deleting an assertion, loosening an exact-match locator into a substring, wrapping an assertion in `try`/`catch` or `if`, or replacing an assertion with a `toBeVisible()` on something already true, all count as a FAIL of this task, not a test cleanup. (Two of those four shapes have already shipped in this repo and are recorded in the 2026-10-09 "test-coverage debt" decision entry.)
- `components/TaskForm.test.tsx` tests the form component directly and should need no change. If it does, say why in the QA Report.

## Acceptance Criteria

### Popup shell (frontend)
- [ ] `/` renders a single visible trigger control that opens the task list. It is a real `<button>`, keyboard-focusable, activatable with Enter and Space, with a visible focus indicator of at least 3:1 contrast and a target at least 44 px in both dimensions.
- [ ] The trigger's visible text names what it opens in product terms (for example "Tasks" with a count, or "Your tasks"). It is not a generic CTA ("Open", "Get started", "View more"), and it is not icon-only. Its visible text is contained in its accessible name (WCAG 2.5.3).
- [ ] Activating the trigger opens a modal dialog containing the full task list UI: the add form, every task row with all of its controls, and whichever of the loading / empty / error states applies.
- [ ] The dialog has an accessible name rendered as a visible heading, and the dialog element exposes `role="dialog"` with `aria-modal="true"`.
- [ ] Opening the dialog logs **no** console warnings or errors, including Radix's own "`DialogContent` requires a `DialogTitle`" and missing-`Description` warnings. QA asserts a clean console across open, interact, close.
- [ ] The dialog closes by: the close control, Escape (when no edit, no delete confirmation, and no keyboard drag is active), and a click on the overlay outside the dialog. All three paths leave `/` rendered normally with no console error.
- [ ] While the dialog is open, the timer behind it keeps running: a running countdown still decreases, and a paused one stays at the same value. Opening or closing the dialog never changes timer state.
- [ ] With 50 tasks, the dialog's content scrolls internally and both the add form and the last row are reachable; the page behind the dialog does not scroll while the dialog is open.
- [ ] At a 320 px viewport the dialog fits with no horizontal page scroll (`document.documentElement.scrollWidth <= clientWidth`), no text escaping its container, and every row control still at least 44 px. Same check at 1280 px.
- [ ] Opening and then closing the dialog returns `/` to the scroll position and layout it had before, with no horizontal overflow introduced at either viewport above.

### Focus management (frontend)
Task 002's reviewer spent a full round on focus choreography. All of it must still hold inside the dialog.

- [ ] On open, focus moves to a deterministic element inside the dialog, the same one on every open, never `<body>`, and never a destructive control (Delete or a delete confirmation). Frontend records which element in Implementation Notes so QA can assert it by name.
- [ ] On close by any of the three paths (close control, Escape, overlay click), focus returns to the trigger that opened the dialog.
- [ ] Tab and Shift+Tab cycle only through controls inside the dialog. Tabbing past the last control does not reach the timer, the current task card, or the "Focus stats" link behind the dialog.
- [ ] **Add:** submitting a valid task from inside the dialog clears the title field and leaves focus in it, as task 002 requires. The dialog stays open.
- [ ] **Edit:** saving a valid edit returns focus to that row's Edit control and the dialog stays open. Cancelling by the Cancel control does the same.
- [ ] **Escape while an edit is in progress cancels the edit only.** The dialog stays open, the row shows the original values, and focus returns to that row's Edit control. A second Escape then closes the dialog.
- [ ] **Escape while the delete confirmation is open cancels the confirmation only.** The dialog stays open, the task stays in place unchanged, and focus returns to that row's Delete control. A second Escape then closes the dialog.
- [ ] **Delete:** confirming removes the row, the dialog stays open, and focus lands where task 002 specifies: the task that took the deleted task's position, or the new last task if the deleted one was last, or the add form's title field if the list is now empty. Focus never drops to `<body>` and never jumps to the trigger behind the dialog.
- [ ] Pin, unpin, increment, and decrement leave focus on the control that was activated.

### Drag and drop inside the dialog (frontend)
dnd-kit and Radix Dialog both manage focus and pointer events. This is the single most likely place for a real bug in this task.

- [ ] **Pointer drag:** with 5 tasks, dragging row 1 by its handle to position 3 and releasing puts it at position 3. The new order survives closing and reopening the dialog, and survives a page reload.
- [ ] **Pointer drag with scrolling:** with 50 tasks in a dialog whose content scrolls, a pointer drag that needs the container to scroll completes and persists. It does not drop the task at an unrelated index and does not leave the dialog in a stuck drag state.
- [ ] **Keyboard drag:** with a row's handle focused, Space picks the task up, Up/Down arrows move it one position per press, and Space drops it. Focus stays on the moved task's handle after the drop, inside the dialog. Order persists across close/reopen and reload.
- [ ] **Escape during an active keyboard drag cancels the drag, not the dialog.** The task returns to its original position, nothing is written to storage, the dialog is still open, and focus is still on that row's handle. QA asserts both the dialog's open state and the restored order in the same test, then presses Escape a second time and asserts the dialog closes.
- [ ] **Closing the dialog mid-drag does not corrupt order.** After a keyboard drag is started and the dialog is then closed without dropping, reopening the dialog (and reloading the page) shows an order that is either the pre-drag order or the fully-applied move, never a partial one, never a duplicate or missing row. No console error.
- [ ] Row controls still never start a drag: clicking or tapping Pin, +1, -1, Edit, Delete, move up, or move down inside the dialog performs that action and begins no drag.
- [ ] **dnd-kit's live region is still reachable by assistive tech while the dialog is open.** Radix marks content outside the dialog `aria-hidden="true"`, and dnd-kit renders its announcement region in a portal, so this can silently break. QA asserts that during a keyboard drag the live region element has no ancestor with `aria-hidden="true"`, and that its text updates on pickup, move, and drop.
- [ ] Announcements still read the task title and a 1-based position (for example "Picked up Write report. Position 2 of 5.") and never a UUID, matching task 002's fixed behaviour.
- [ ] Move up / move down (the WCAG 2.5.7 single-pointer alternative) still work inside the dialog, and the control that would move the first task up or the last task down is still disabled or absent.

### States: loading, empty, error (frontend)
A user with a broken database must not have to click a popup open to find out.

- [ ] With `indexedDB` unavailable (deleted before load) the timer on `/` still renders and works, and `/` shows a readable error about the task data **without the dialog being opened**. Frontend chooses the surface (the existing `CurrentTaskCard` error branch already renders inline on `/` and reads the same database) and records the choice in Implementation Notes.
- [ ] Same requirement for a failing `open()` and for the blocked-upgrade case (`DatabaseBlockedError`, "close your other Pomotato tabs"): `/` is not silently normal-looking while the data layer is broken, and nothing hangs forever on a loading state. The blocked case today only has a message on `/stats` (`components/StatsDashboard.tsx`); whatever `/` does with it must be stated, even if the decision is that the existing `CurrentTaskCard` error text covers it.
- [ ] The trigger is present and operable in every data state (loading, ready, empty, error). If it is ever disabled, the reason is visible to the user in text, not implied by a greyed-out control.
- [ ] Opening the dialog while the first database read is still pending shows the loading state, never the empty state. The empty-state text ("No tasks yet...") never appears at any point when tasks exist. QA checks this with a `MutationObserver` installed via `addInitScript` watching `document` (not `document.body`, which did not exist yet when task 002's version of this test silently passed for two rounds).
- [ ] With zero tasks, opening the dialog shows the empty state and the add form, and the inline `CurrentTaskCard` shows its own empty state on `/`.
- [ ] `CurrentTaskCard`'s empty-state copy no longer points at a list that is not on the page. Its new wording names the actual way to pin a task now (through the popup), matches the trigger's wording, and stays one short sentence.
- [ ] Reloading `/` with tasks in storage produces no React hydration-mismatch errors or warnings in the console, with the dialog closed and after opening it.

### Visual direction and tokens (frontend)
DESIGN.md is owner-authored. Apply it; do not rewrite it.

- [ ] Every color on the new surfaces (trigger, overlay, dialog surface, border, heading, close control) comes from a semantic token (`bg-popover`, `text-foreground`, `border-border`, `outline-ring`, `text-primary`, and so on). **No hardcoded hex and no raw palette utilities** (`amber-*`, `stone-*`, `red-*`) in any line this task adds, so milestone 4 can add one `.dark` block instead of restyling this twice.
- [ ] `--popover` is currently the same cream as `--background` (`#fbf4ea`). The open dialog must still read as a distinct surface above the page (overlay plus border, or a new token value). If a new value is needed, it is added as a **token** in `app/globals.css` with a one-line reason in the comment block, never inlined on the component.
- [ ] Text on the dialog surface and on the trigger meets WCAG AA (4.5:1 normal text, 3:1 large text), measured against the surface actually behind it, not assumed. QA records the measured ratios.
- [ ] The dialog heading uses the existing `font-heading` (Comfortaa, headings only per DESIGN.md). Body text and controls inside the dialog stay the plain sans.
- [ ] Open/close motion is allowed and welcome, and it is suppressed under `prefers-reduced-motion: reduce`. QA asserts with Playwright's `emulateMedia({ reducedMotion: "reduce" })` that the overlay's and content's computed `animation-duration` and `transition-duration` are `0s`, and that the dialog still opens and closes correctly in that mode. The repo's existing pattern for this is the `motion-reduce:` variant used in `components/StatsDashboard.tsx`.
- [ ] The dialog does not stack decoration: it is one surface with one accent, matching the calm, minimalist, not-overbearing direction in DESIGN.md. Any technique beyond a plain surface plus the existing accent needs a one-line reason in Implementation Notes (antislop R-31).
- [ ] `app/page.tsx`'s "Focus stats" link uses token classes instead of `text-amber-800` / `focus-visible:outline-amber-700`, matching `StatsDashboard`'s `linkClass`. Its contrast against the cream page background is **re-measured** after the swap and recorded: `--primary` (`#b45309`) is lighter than `amber-800` (`#92400e`), so this must be shown to still clear 4.5:1 rather than assumed.
- [ ] `git diff app/globals.css` after `npx shadcn add dialog` contains only intentional additions. If the CLI overwrites the palette with its own generic theme (it did exactly this during `shadcn init`, see the 2026-10-07 decision entry), the warm cream/brown values, the plain-CSS `body` rule, and the `:focus-visible` rule are restored byte-for-byte. Frontend states in Implementation Notes whether the CLI touched the file at all.

### Accessibility (frontend builds, qa verifies)
Everything task 002 and task 003 earned must survive the move.

- [ ] No axe-core violations of serious or critical impact on `/` with the dialog **open**, in each of: empty list; 3 tasks none pinned; 3 tasks one pinned; an edit in progress; the delete confirmation open; validation errors showing in the add form.
- [ ] No axe-core violations of serious or critical impact on `/` with the dialog **closed**, in the states `e2e/accessibility.spec.ts` already covers.
- [ ] Every control inside the dialog (add form fields, emoji and color controls, edit, delete and its confirmation, pin, increment, decrement, drag handle, move up/down, close) is reachable with Tab in an order matching visual order, and operable with Enter and/or Space as native controls are.
- [ ] Every interactive element in the dialog and the trigger shows a visible focus indicator with at least 3:1 contrast, including during and after a keyboard drag.
- [ ] WCAG 2.5.3 Label in Name holds for the trigger and the dialog's close control, and the three fixes from task 003's review stay fixed: the drag handle's visible "Reorder" text, and the `+1` / `-1` buttons whose accessible names lead with their visible text.
- [ ] Icon-only controls still have text accessible names that include the task title where they act on one task. Emoji are never the only accessible name of a control.
- [ ] Interactive targets in the dialog are at least 24x24 CSS px (WCAG 2.2 SC 2.5.8), with the 44 px used in tasks 001 to 003 preferred.
- [ ] Semantic HTML before ARIA: the list is still a real `<ul>`/`<li>`, controls are still real `<button>`s and `<input>`s with `<label>`s.

### Tests (qa)
- [ ] `e2e/task-list.spec.ts`: all 52 tests pass against the popup. Navigation and setup changed; no assertion weakened (see the cost section). The QA Report states how many tests were touched and confirms that only setup/navigation changed.
- [ ] `e2e/accessibility.spec.ts` and `e2e/sessions.spec.ts`: every test that reaches task-list markup passes, with the dialog opened where needed. `e2e/sessions.spec.ts`'s pin-then-complete flows still assert the same counts.
- [ ] New e2e coverage for the interactions this task creates, each as its own test that would fail if the behaviour broke: dialog open/close by all three paths; focus returns to the trigger on close; focus trap holds; Escape precedence (keyboard drag, then edit, then delete confirmation, then close); close mid-drag leaves order uncorrupted; dnd-kit live region not inside an `aria-hidden` subtree during a keyboard drag; reduced-motion durations are `0s`; 320 px no-overflow; 50-task internal scrolling with a scrolling pointer drag.
- [ ] Before reporting PASS, qa spot-checks at least the two riskiest new tests (Escape-during-keyboard-drag, and the live-region-not-aria-hidden check) by temporarily breaking the implementation and confirming the test actually fails, then restoring it. The QA Report records what was broken and what failed. This is standing practice per the 2026-10-07 decision entry; a PASS without it is not accepted.
- [ ] No test added by this task can pass vacuously: no assertion inside `try`/`catch` or `if`, no observer that may never attach, no `toBeVisible()` on something already true at the time it is asserted, no test with zero assertions.

### Regression (must keep working, unchanged)
- [ ] **Pin flow feeding `CurrentTaskCard`:** pinning task A in the dialog updates the inline current task card on `/` immediately, with no reload, including while the dialog is still open. Pinning B while A is pinned leaves exactly one pinned task. Unpinning clears the card to its empty state. Deleting the pinned task clears it and auto-pins nothing. The pin survives a reload.
- [ ] Editing or incrementing the pinned task in the dialog updates the inline card immediately, with the dialog still open.
- [ ] **Milestone 3 increment:** completing a focus run with a task pinned still writes exactly 1 session row and takes that task's `completed` up by exactly 1, with no double counting, including when the run completes while the dialog is open (the count must update in both the open dialog's row and the card behind it) and when it completes while the dialog is closed.
- [ ] Retroactive completion (a run that expired while the tab was closed) still logs exactly 1 session on load with the stored `endedAt`, and reloading again logs nothing further. Dedup is unaffected by this task.
- [ ] Break runs still log a session and change no count. Reset, paused-and-abandoned, and mode-switched runs still log nothing.
- [ ] The full existing suites pass: `lib/timer/*.test.ts`, `lib/db/*.test.ts`, `lib/stats/aggregate.test.ts`, `components/TaskForm.test.tsx`, `e2e/timer.spec.ts`, `e2e/stats.spec.ts`, `e2e/sessions.spec.ts`, `e2e/accessibility.spec.ts`. Any failure outside the relocated task-list setup is a real regression, not an environment issue.
- [ ] `lib/db/**`, `lib/stats/**`, `lib/timer/**`, `hooks/use-timer-clock.ts`, `hooks/use-hydrate-timer-store.ts`, and the Dexie schema are byte-for-byte unchanged (reviewer verifies by diff).
- [ ] `/stats` is unchanged apart from nothing: the route, its link target, and its behaviour are untouched.

### Tooling / quality gates
- [ ] `npm run lint`, `npm run typecheck`, `npm run build`, `npm run test`, and `npm run test:e2e` all succeed.
- [ ] No `any` types in new code (TypeScript strict).
- [ ] Any file under `components/ui/` came from `npx shadcn add <component>` and is not hand-authored. No milestone 1 or 2 component was retrofitted onto shadcn primitives (2026-10-07 decision).
- [ ] New dependencies, if any, are installed by the role whose code needs them (2026-10-02 decision) and their licences are recorded in `docs/DECISIONS.md` if anything new ships.
- [ ] Frontend's Implementation Notes record: the shadcn command actually run and how the peer-dependency conflict was handled, whether the CLI touched `app/globals.css`, the element focus lands on when the dialog opens, where the database-error state surfaces on `/`, and the Escape-precedence approach, before qa starts.

## Files likely touched
- `app/page.tsx` (frontend): render the trigger plus the dialog, keep `PomotatoTimer` and `CurrentTaskCard` inline, and fix the one "Focus stats" link line. Layout will need rethinking now that the right-hand column is gone.
- `components/ui/dialog.tsx` (frontend, generated): output of `npx shadcn add dialog`. Possibly `components/ui/button.tsx` if the trigger uses it.
- A new component for the popup, for example `components/TaskListDialog.tsx` (frontend): PascalCase, owns the trigger, the dialog, and the open state so `app/page.tsx` stays thin. Name and split are frontend's call.
- `components/TaskList.tsx` (frontend): whatever the move requires (its own `<section>`/`<h2>` may now be redundant next to the dialog title, and the add form may need to sit inside a scroll container). Behaviour unchanged.
- `components/TaskRow.tsx` (frontend): only if the dialog context forces a change. Prefer not touching it; task 002's two fix loops and task 003's review all landed here.
- `components/CurrentTaskCard.tsx` (frontend): empty-state copy only.
- `app/globals.css` (frontend): only if a token value is genuinely needed, plus restoring anything the shadcn CLI overwrites.
- `package.json` / lockfile: whatever `shadcn add dialog` pulls in.
- `e2e/task-list.spec.ts`, `e2e/accessibility.spec.ts`, `e2e/sessions.spec.ts`, and any new spec (qa only).
- **Not touched:** `lib/db/**`, `lib/stats/**`, `lib/timer/**`, `hooks/use-timer-clock.ts`, `hooks/use-hydrate-timer-store.ts`, `app/stats/**`, `components/Stats*.tsx`, `components/PomotatoTimer.tsx` and its children (layout-only changes at most).

## Risks
- **dnd-kit inside a Radix Dialog is the real risk.** Both libraries manage focus and pointer events, and both claim Escape. Three specific failure modes, each with its own criterion above: Escape during a keyboard drag closing the dialog instead of cancelling the drag; a drag left half-applied when the dialog unmounts mid-gesture; and dnd-kit's portalled live region ending up inside Radix's `aria-hidden` background subtree, which breaks screen-reader announcements silently with no visual symptom and no axe violation.
- **Pointer drag inside a scroll container.** The dialog gives the list a scrollable body it did not have before. dnd-kit's auto-scroll and the dialog's own scroll locking can fight, and a drag that needs to scroll is exactly the case that breaks with 50 tasks.
- **Focus choreography regressing quietly.** Task 002's reviewer spent a whole round on add/edit/delete/cancel focus and the delete-confirmation flow. Inside a focus trap, a mistake shows up as "focus went somewhere plausible" rather than as an error. The criteria name each landing spot explicitly so QA asserts the element, not just "something is focused".
- **Escape precedence is a three-way conflict** (keyboard drag, inline edit, delete confirmation) on top of Radix's own close-on-Escape. Getting one layer right and another wrong is easy and the criteria test all three independently.
- **First real `npx shadcn add` in this repo.** `shadcn init` already tried to overwrite `app/globals.css` with a generic oklch blue/slate theme and had to be hand-reconciled (2026-10-07 decision entry). An `add` may try again. Also expect the pre-existing `vitest` / `@types/node` peer conflict: the recorded workaround is `--legacy-peer-deps`, or `npm_config_legacy_peer_deps=true` in the environment for a CLI that does not expose the flag. Do not "fix" it by bumping `vitest` or `@types/node`.
- **`--popover` equals `--background`.** A dialog that uses the token straight will be the same cream as the page behind it. Solvable with the overlay plus a border, but it needs a deliberate decision and a contrast measurement, not a guess.
- **Discoverability.** Moving the list behind a click makes it less discoverable and makes a broken database invisible on `/` unless the error surfaces inline. The states section covers the error case. Discoverability itself is the owner's call and the owner made it.
- **Mobile.** A centered modal at 320 px with a long task list, an add form, and up to eight controls per row is the hardest layout in this app so far. It must be a distinct working state, not a squeezed desktop dialog (antislop R-03 and the layoutmobile skill). Switching to a Sheet at small widths is explicitly deferred, so the Dialog has to hold up.
- **Test churn hiding a real regression.** With ~52 tests edited in one diff, a weakened assertion is easy to miss. That is why the "no assertion weakened" rule, the break-it-and-confirm-it-fails spot check, and the vacuous-test ban are acceptance criteria rather than advice.
- **Licensing:** nothing new is expected. shadcn/ui components are MIT and vendored into the repo. No audio, fonts, or images are added by this task. If anything binary appears, it must be original or CC0 with provenance in `docs/DECISIONS.md`.
- **Next.js version.** Per `AGENTS.md`, frontend reads the relevant guide in `node_modules/next/dist/docs/` before writing component or route code. The dialog needs a client component; `app/page.tsx` is currently a server component with client children, so the open state has to live in a client component rather than in the page.
- **antislop mode is unresolved.** There is no `~/.config/antislop/settings.json` on this machine and no session instruction selecting `during` or `after`. Per `CLAUDE.md`, frontend must get the mode from the orchestrator (who must get it from the owner) before the first UI edit, and announce `antislop active: <mode> (<source>).` It must not be guessed.
