---
id: 004
slug: task-list-popup
status: done # draft | in-progress | qa | review | done | blocked
---

# Move the task list into an on-click popup, keep the current task card inline

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

## Implementation Notes
(Filled in by frontend as they build. Decisions, tradeoffs, anything the next agent needs to know. The "Tooling / quality gates" section above lists the five items that must be recorded here before qa starts.)

### Frontend (2026-10-15)

**Required records (Tooling section, last item)**
- **shadcn command run:** `npm_config_legacy_peer_deps=true npx shadcn@latest add dialog button` (shadcn 4.21.5). It created only `components/ui/dialog.tsx` and `components/ui/button.tsx`. `button` was pulled in as a dependency of `dialog` (its close control), and I use it for the trigger and close control. All the dependencies (`radix-ui`, `class-variance-authority`, `lucide-react`, `cn`) were already installed by the 2026-10-07 `init`, so `package.json` and the lockfile are unchanged and the peer conflict never triggered; the env var was set as a precaution per the recorded workaround. Neither generated file was hand-edited.
- **Did the CLI touch `app/globals.css`?** No. I diffed it against a copy taken before the command. Every change in `git diff app/globals.css` is mine (two tokens, below).
- **Focus on open:** the **Close button** in the dialog header (`TaskListDialog`, via `onOpenAutoFocus`). Same element every open, first tab stop, never destructive. I did not focus the add form's Title: on a phone that raises the on-screen keyboard over the list the moment the dialog opens. QA can assert it as `getByRole("button", { name: "Close" })` inside the dialog.
- **Where the database error surfaces on `/`:** the existing inline `CurrentTaskCard` error branch, now with real copy and a "Reload" button, plus the trigger stays enabled so the dialog's own error line is one click away. `hooks/use-tasks.ts` and `hooks/use-current-task.ts` now return `{ status: "error"; blocked: boolean }` (same shape `useStats` already uses), set from `error instanceof DatabaseBlockedError`. The card shows a distinct blocked message ("Another Pomotato tab is still using an older version. Close other Pomotato tabs, then reload.") versus the generic storage message. Both still begin "Couldn't load the current task." so the existing e2e regex `/Couldn't load the current task/i` still matches. The task list's error line inside the dialog got the same blocked/generic split and still begins "Couldn't load your tasks." The blocked case takes ~5s to reject (per DECISIONS), so `/` shows "Loading..." for those 5s, then the error; nothing hangs.
- **Escape-precedence approach:** Radix listens for Escape in the capture phase, ahead of dnd-kit and the row handlers. `TaskListDialog` passes `onEscapeKeyDown` and calls `preventDefault()` (which stops Radix dismissing) when either (a) a drag is in flight, detected by `[aria-roledescription="sortable"][aria-pressed="true"]` anywhere in the document (dnd-kit sets `aria-pressed` on the active handle), or (b) the event target is inside `li form` (inline edit) or `li [role="group"]` (delete confirmation). Those inner layers then cancel themselves exactly as in task 002 (dnd-kit's KeyboardSensor, `TaskForm.handleKeyDown`, `TaskRow.handleCancelDeleteKeyDown`). A second Escape finds none of those and closes the dialog. `TaskRow` and `TaskForm` are untouched. Tradeoff: this is DOM-selector based rather than state-based; it relies on dnd-kit keeping `aria-pressed` and on the edit/confirm UI staying inside an `li`. The e2e Escape-precedence tests are the guard if either changes.

**Live region (trap 1):** `TaskList` takes an optional `announcementsContainer` and passes it to `DndContext` as `accessibility.container`; `TaskListDialog` passes the dialog content node, and renders `TaskList` only once that node exists (state-backed ref). The live region and the hidden instructions text therefore live inside `role="dialog"`, never under `<body>`, so Radix's `aria-hidden` sweep cannot reach them regardless of mount order. Verified in a real browser: during a keyboard drag the live region (`role="status"`) is inside the dialog, no ancestor has `aria-hidden="true"`, and its text was "Picked up Alpha. Position 1 of 5." I did not verify what happens with the default (body) container, so I can't say whether the default would actually have broken; this is a precaution plus a verified outcome.

**Dialog composition:** I assembled the dialog from the generated primitives (`Dialog`, `DialogTrigger`, `DialogPortal`, `DialogOverlay`, `DialogTitle`, `DialogDescription`, `DialogClose`) plus Radix's `Dialog.Content` directly, instead of the generated `DialogContent`. Reason: the generated `DialogContent` hardcodes its overlay (`bg-black/10` + backdrop blur, no className hook), a 28 px icon-only close button, and `sm:max-w-sm`, none of which fit the criteria (token scrim, 44 px close with visible text, wide scrolling body). Editing the generated file was the other option and would have broken the "not hand-authored" criterion. `aria-modal="true"` is set explicitly because Radix does not set it.

**Layout:** `/` is now one `max-w-md` column: timer, `CurrentTaskCard`, then the "Your tasks" trigger directly under the card, then "Focus stats". The trigger is an outline `Button` (h-11, min-w-44, text 16 px): secondary on purpose, the timer is the focal point. Dialog is `max-w-xl`, `w-[calc(100%-1.5rem)]` (296 px at 320), `max-h-[calc(100dvh-1.5rem)]`; the header (title, one-line description, Close) stays fixed and the body below it (`overflow-y-auto overscroll-contain`) scrolls, including the add form. The body has 6 px of horizontal padding with matching negative margin so focus outlines on row edges are not clipped. Delete confirmation is still inline in the row.

**Visual decisions (R-31 one-liners):** surface `--popover` `#fffaf3` plus 1px `border-border` plus one `shadow-lg` (the only elevation cue, reason: it is the one thing floating above the page); scrim is a token (`--scrim`, `rgb(43 32 23 / 0.45)`), no backdrop blur (R-10); radius `rounded-2xl` to match the existing cards; one accent only, the existing amber focus outline; title in `font-heading` via the generated `DialogTitle`, everything else plain sans. Motion: the generated fade/zoom (150 ms) as an open/close cue so the modal does not just appear, with `motion-reduce:animate-none motion-reduce:duration-0` on overlay and content. No icons used at all (R-04: a text "Close" instead of the generated X, since "no icon" beats a library glyph and it satisfies Label in Name).

**Tokens added to `app/globals.css`** (comments in the file explain each): `--popover` changed from `#fbf4ea` to `#fffaf3`; new `--scrim` (+ `--color-scrim` in `@theme inline`). The popover change is only 1.05:1 against the page, so the dialog relies on scrim + border + shadow to read as a surface; the token tweak alone would not. Both are semantic, so milestone 4's `.dark` block can override them. Note `DialogDescription` ships `text-muted-foreground`, which is `#78716c` and measures 4.39:1 on cream (below AA), so I overrode it to `text-secondary-foreground`.

**Contrast measured (python WCAG formula):** Focus stats link, `--primary #b45309` on `--background #fbf4ea`: **4.60:1** (passes AA 4.5; was 6.49:1 with `amber-800`, so it is a real, if thin, margin). Foreground `#2b2017` on popover `#fffaf3`: 15.3:1. Description `#44403c` on popover: 9.89:1. Trigger and Close text `#2b2017` on `--background`: 14.55:1. Primary on popover: 4.84:1. Dialog surface vs page: 1.05:1 (see above).

**Copy:** `CurrentTaskCard` empty state is now "Pin a task from Your tasks whenever you're ready." Names the real path, matches the trigger's visible text exactly, one sentence, no pressure ("whenever you're ready"). Dialog description: "Pin the one you're working on to keep it in view." (explains what Pin does, since the card is the payoff). Trigger text is the static "Your tasks" with no count: a count would change the accessible name as data loads and add a second live query for little value. `Reload` button added to the card's error state (44 px).

**Other file changes:** `TaskList.tsx`: dropped its own `<section>` and `<h2>Tasks</h2>` (the dialog title replaces them), the add form is now its own labelled `<section>` (`aria-labelledby="add-task-heading"`); no behaviour changes. `app/page.tsx` "Focus stats" link now uses `text-primary`, `hover:text-accent-foreground`, `outline-ring`, `transition-colors motion-reduce:transition-none`, identical to `StatsDashboard`'s `linkClass` (closes task 003 N4). Not touched: `TaskRow`, `TaskForm`, `lib/**`, tests.

**Known behaviours worth knowing:**
- The dialog's content unmounts on close (Radix default), so `TaskList` and its live query re-mount on every open and show "Loading your tasks..." for a few ms before the rows. This is the loading state, never the empty state, so the "no empty-state flash" criterion holds, but it is a visible blink on slow IndexedDB reads. Keeping it mounted (`forceMount`) was not worth the focus-trap and aria-hidden side effects.
- Closing mid keyboard drag: nothing is written (`onDragEnd` never fires on unmount); reopening and reloading shows the pre-drag order.
- Text/targets: every button and input in the dialog measured at least 44x44 at 1280 and 320 px except the visually-hidden 1x1 radio inputs inside the colour swatches (their 36 px labels are the target, unchanged from task 002).

**Verified by me in Chromium (throwaway scripts, not committed), at 1280x800, 320x640, and 1280 with reducedMotion=reduce:** open and close via the Close button, Escape and overlay click, focus returns to the "Your tasks" trigger each time; Tab x80 never leaves the dialog; `aria-modal="true"`; keyboard drag pickup announces "Picked up Alpha. Position 1 of 5."; Escape mid-drag keeps the dialog open, restores order, focus stays on the handle; Space/Down/Down/Space drops at position 3 with focus on the handle; Escape in edit returns focus to Edit and keeps the dialog open; Escape on delete confirmation returns focus to Delete and keeps the dialog open; pinning from the dialog updates the card with the dialog open; no horizontal overflow at 320 px open or closed; reduced motion gives `0s` animation and transition durations on both overlay and content (vs `0.15s` normally); 50 tasks: body scrolls internally (7354 px content in a 561 px body), a pointer drag of row 3 held at the bottom edge autoscrolled the body (scrollTop 4125), dropped at index 30, 50 unique rows, order survived a reload; close mid-keyboard-drag then reload leaves the 50-row order unchanged; indexedDB deleted: timer renders, the card shows the error and Reload, trigger enabled, dialog shows its own error; zero console errors or warnings in every run (including hydration, on reload). axe-core (serious/critical or any) found no violations with the dialog open in: empty; 3 tasks one pinned; edit open; delete confirmation open; add-form validation errors; and with it closed. This is my own check, not a substitute for QA's.

**Gate results:** `npm run lint` 0 errors (20 pre-existing warnings in test files), `npm run typecheck` clean, `npm run build` clean, `npm run test` 228 passed. `npx playwright test e2e/timer.spec.ts e2e/stats.spec.ts`: **57/57 passed**.

**Expected red e2e (so QA can sanity-check its own numbers):** with an 8 s per-test timeout, of the three inline-list specs 69 of 87 tests fail: `task-list.spec.ts` 50 of 52 fail (2 pass: ones that do not touch the list), `sessions.spec.ts` 14 of 18 fail, `accessibility.spec.ts` 5 of 17 fail. These are all the old "list is inline on `/`" assumption, not a regression I found. Two things for QA to know: the existing error test at `task-list.spec.ts:1155` expects "Couldn't load your tasks" visible on `/` without opening the dialog, which is now only true after opening it (the card text on `/` still matches the card regex); and the criterion's blocked-upgrade case has no e2e at all yet (DECISIONS 2026-10-09 debt).

**Not done / for the orchestrator:** no `docs/DECISIONS.md` entry for this `shadcn add` (I may not edit docs outside this section); suggest one line recording the command, the unchanged `globals.css`, and the `--popover`/`--scrim` token changes. No new dependencies, so no licence entry is needed.

### Frontend follow-up (2026-10-15): token fix, DialogContent, live-region correction

**Correction to my earlier notes.** Two statements above are superseded: (1) "Dialog composition ... instead of the generated `DialogContent`" and the "Neither generated file was hand-edited" record: `components/ui/dialog.tsx` is now deliberately edited (below); (2) the live-region workaround (`announcementsContainer`, state-backed ref) is removed, see "Live region" below.

**`--muted-foreground`.** Changed `#78716c` to `#57534e` (stone-600) in `app/globals.css`, with the measurement in a comment. Orchestrator's arithmetic verified (WCAG formula): `#57534e` is **6.99:1** on `--background #fbf4ea`, 6.99:1 on `--muted #f5f5f4`, 7.35:1 on `--popover #fffaf3`. Old value: 4.39:1 on `--background`, 4.40:1 on `--muted`, 4.62:1 on `--popover` (it only passed on the dialog surface). The per-component `text-secondary-foreground` override on the description is dropped, so `DialogDescription` is the stock class again. Milestone 4: re-check against the dark palette.

**`components/ui/dialog.tsx` edited, header comment records it.** `DialogOverlay`: `bg-scrim`, no backdrop blur, 150 ms, `motion-reduce:animate-none motion-reduce:duration-0`. `DialogContent`: `bg-popover`, 1px `border-border`, `shadow-lg`, `rounded-2xl`, `max-w-xl`, `w-[calc(100%-1.5rem)]`, `aria-modal="true"`, reduced-motion handling; built-in close is now an outline `Button` with visible text "Close" (44 px high, `min-w-11`, measured 69.8x44), positioned `absolute top-3 right-3` (`sm:top-4 sm:right-4`) with the 2px amber outline focus pattern; the `lucide` XIcon import is gone. `DialogContent` takes `className` merged via `cn`, so `TaskListDialog` overrides layout (`flex max-h-[calc(100dvh-1.5rem)] flex-col`, replacing the default `grid`). Header gets `pr-20` so the title/description never run under the absolutely-positioned Close (checked: no overlap at 1280 or 320).

**`TaskListDialog.tsx`** now uses `DialogContent`/`DialogHeader` and no longer imports `radix-ui`. Kept: `onEscapeKeyDown` precedence, `onOpenAutoFocus` landing on Close (it now finds the node by `[data-slot="dialog-close"]` inside `event.target`, since Close is rendered by `DialogContent` and no ref is available), focus returning to the trigger. Trade-off: that autofocus now depends on the `data-slot` attribute of the generated file, which is a documented attribute in the same project-owned file.

**Live region: the default was fine, workaround removed.** Tested it: with `accessibility.container` unset, the announcement region rendered inside `role="dialog"` with no `aria-hidden`/`inert` ancestor, and announced "Picked up Alpha. Position 1 of 2.". The reason is in `@dnd-kit/core`: `container ? createPortal(markup, container) : markup`, so the default is inline in the `DndContext` tree, not `document.body`. My earlier claim that dnd-kit's default is `document.body` was wrong. Removed `announcementsContainer` from `TaskList` and the contentElement state from `TaskListDialog`; `TaskList` is back to no props. (The hidden instructions text is likewise inline.)

**Verified in Chromium (throwaway script, not committed) at 1280x800, 320x640, 1280 with reducedMotion=reduce:** focus lands on Close on open; keyboard drag pickup announces inside the dialog; Escape mid-drag keeps the dialog open and cancels the drag (no `aria-pressed=true` left, focus stays on the handle); a further Escape closes; focus returns to "Your tasks" after Escape, overlay click and Close click; no horizontal overflow at 320; overlay is `rgba(43, 32, 23, 0.45)` with no `backdrop-filter`; animation durations 0.15s normal, 0s reduced for overlay and content; axe (all rules) zero violations with the dialog open in each mode; zero console errors/warnings. Note for qa: a second Escape pressed within a few ms of the first (drag cancel) can be eaten while dnd-kit tears down the drag; add a short wait or assert the drag is cancelled before sending it.

**Gates:** lint 0 errors (20 pre-existing warnings), typecheck clean, build clean, vitest 228/228, `e2e/timer.spec.ts` + `e2e/stats.spec.ts` 57/57. Re-ran the three inline specs with `--timeout=8000`: 18 passed, **69 of 87 still red, unchanged**.

## QA Report
(Filled in by qa, 2026-10-15.)

- **Verdict: PASS.** Zero failing tests in the full run. Every acceptance criterion that QA can test through unit or e2e tests passes. Criteria that are only partly covered, or that belong to the reviewer, are listed under "Coverage gaps" below. They are not failures, and they are not hidden.
- **Reconciliation against the 69-of-87 baseline (frontend's measured red):** `task-list.spec.ts` 50 of 52 red, now **52/52 green**. `sessions.spec.ts` 14 of 18 red, now **18/18 green**. `accessibility.spec.ts` 5 of 17 red, now **17/17 green**. `timer.spec.ts` + `stats.spec.ts` 57/57, unchanged. Baseline red count **69 → 0**.

### Gate results (final tree, run 2026-10-15)
| Command | Result |
|---|---|
| `npm run lint` | exit 0, 0 errors, 20 warnings (same 20 as before this task; none in new files) |
| `npm run typecheck` | exit 0 |
| `npx tsc --noEmit -p tsconfig.test.json` | exit 0 (needed a `/// <reference types="node" />` in the new token test; see Tests added) |
| `npm run build` | exit 0 |
| `npm run test` | exit 0, **235/235** (228 existing + 7 new) |
| `npm run test:e2e` | exit 0, **181/181**. Run three times on the final tree: 180, 180, 181 passed, no flakes |

### Tests added
- **`e2e/task-list-dialog.spec.ts` (new, 37 tests).** Covers the new behaviour:
  - Shell: trigger is a 44px `<button>` with Enter/Space activation, a 2px solid focus ring, and AA text contrast. The dialog has `role=dialog`, `aria-modal`, a Comfortaa heading, and no console warnings or errors across open, interact, close.
  - Close by the Close button, Escape, and overlay click, each returning focus to the trigger.
  - Focus lands on Close on open. Tab and Shift+Tab (60 presses each) never leave the dialog.
  - Timer keeps counting while the dialog is open and a paused timer stays put.
  - Reduced motion sets overlay and content durations to `0s` and the dialog still opens and closes. A paired default-motion test proves the check is not vacuous.
  - 320 px and 1280 px: no horizontal overflow, title clear of Close, every button at least 44 px. Scroll position is unchanged across open and close.
  - 50 tasks: the dialog body scrolls, the page behind does not, and the last row is reachable. A pointer drag that needs auto-scroll completes, leaves no stuck drag, announces the true drop position, and persists.
  - Escape precedence: keyboard drag, inline edit, and delete confirmation each cancel only the inner layer, with the dialog still open and focus restored. A second Escape closes.
  - Close mid keyboard drag leaves the order pre-drag or fully applied, with no console error.
  - Pointer drag persists across close, reopen, and reload.
  - The dnd-kit live region has no `aria-hidden` ancestor during a drag and announces pickup, move, and drop.
  - Move up/down, and the disabled first-up and last-down ends.
  - Focus after save, pin/unpin, +1 and -1 stays on the activated control.
  - Every enabled button, text input, and colour radio shows a solid focus ring at least 3:1 composited against its surroundings.
  - Heading uses Comfortaa. The dialog surface is distinct (translucent overlay and border). Focus Stats link is at least 4.5:1.
  - Blocked upgrade is reproduced for real: an older-version connection that never closes blocks Dexie's upgrade. `/` shows the blocked card error with no dialog open, the timer renders, and the dialog shows its own error.
  - A focus run that completes while the dialog is open updates the open row and the card and writes exactly one session row. Incrementing the pinned task in the open dialog updates the card.
- **`e2e/helpers/task-list-dialog.ts` (new).** `openTaskList(page)` opens the trigger, waits for the loading copy to clear, and waits for open animations and transitions to finish. `closeTaskList(page)` uses the Close button and waits for the dialog to unmount. Without the animation wait, axe read mid-fade colours and reported false contrast failures.
- **`components/TaskListDialog.tokens.test.ts` (new, 7 tests).** Vitest guard: no hex literal and no raw palette utility in `TaskListDialog.tsx`, `ui/dialog.tsx`, or `ui/button.tsx`, and the semantic tokens (`bg-popover`, `bg-scrim`, `border-border`) are present.

### Existing tests changed (audit)
Diffed against HEAD. All removed lines were either setup or the three items below.
- **`e2e/task-list.spec.ts`: 52 tests, all touched.** The shared `beforeEach` now calls `openTaskList`, and each of the 12 `page.reload()` sites re-opens explicitly. Setup-only changes in 49 tests. Three tests have non-setup changes:
  1. **"persists pin after reload"**: the exact-text locator was `page.getByText("Xenon", { exact: true })`. It is now `page.getByRole("main").getByText(...)`, still exact, scoped to the Current Task card. I also added a positive wait for the card to show the pin before the reload. **Finding:** I ran HEAD's version of this test against HEAD's code. Its exact locator matched only the list row, and after reload the card read "No task pinned yet". So the original assertion did not check the pin on the card. The new assertion does check the card, which is what the test name and comment describe. This is a strengthening, but it is a change, so I'm calling it out.
  2. **"completing focus timer increments pinned task completed count"**: only a comment changed. `closeTaskList` runs before Start, and `openTaskList` re-opens before the row is read.
  3. **"shows error message when IndexedDB is unavailable"**: the card error is asserted on `/` first, with no dialog. The list error is asserted after opening the dialog, using the same regex and the same 5 s timeout. Nothing was removed.
- **`e2e/sessions.spec.ts`: 14 tests get open/close/re-open steps only.** No assertion, locator, or `readSessions` helper was changed. Removed lines in this file: none.
- **`e2e/accessibility.spec.ts`: 6 tests get `openTaskList`.** The five axe-with-dialog-open tests, plus "empty task list" (which previously ran with the dialog closed). Its closed-state equivalent is covered by the existing idle test. Removed lines in this file: none.
- **`components/TaskForm.test.tsx`: not modified.**

### Falsifiability (required)
The real repo was not edited. Each mutation ran in an isolated copy at `/private/tmp/claude-501/-Users-ramwelltupas-pomotato/adfb640d-ed76-49e2-a43d-29ba3ee05c6c/scratchpad/mutant` on port 3100. The unmutated control passes, and each mutant fails.
- **(a) Escape during keyboard drag, plus edit and delete Escape.** Mutation: remove `onEscapeKeyDown` from `TaskListDialog`. Result: all 3 precedence tests fail, each at `expect(dialog).toHaveAttribute("data-state","open")`. Control: 3/3 pass.
  - **Important:** my first version of these tests used `toBeVisible()` on the dialog, and that version PASSED under this mutation. Radix keeps the dialog mounted for its 150 ms exit animation, so `toBeVisible()` stays true while it is closing. I replaced those checks with Radix's `data-state` attribute, which flips to `closed` as soon as the close starts. The mutant now fails. Any "stays open" check that uses `toBeVisible()` is the vacuous shape this project has hit before, and I fixed all of them.
- **(b) Close mid-drag preserves order.** Mutation: `handleDragOver` persists each move with an off-by-one index, leaving a partial order after two arrow presses. Result: the test fails with the partial order `["Bravo","Alpha","Charlie","Delta","Echo"]`, which is neither pre-drag nor fully applied. Control: passes.
- **(c) Live region not under `aria-hidden`.** Mutation: wrap `<TaskList/>` in `<div aria-hidden="true">`. Result: `Expected "reachable", Received "hidden"`. Control: passes.
- **(d) Focus-ring contrast.** Mutation: 25% alpha on the focus colour in the components and global `:focus-visible` rule. Result: 20 controls flagged, each at 1.42–1.44:1. Control: passes.

### Measured contrast (settled, after animations finished)
- Trigger text on page: 14.55:1
- Trigger focus ring on page: 4.60:1 (`rgb(180,83,9)`)
- Dialog heading on surface: 15.30:1
- Dialog description on surface: 7.35:1
- Close focus ring on surface: 4.84:1
- Focus stats link on page: **4.60:1**, which clears the 4.5:1 floor (frontend's figure confirmed)
- Dialog surface vs page: 1.05:1. Distinctness comes from the translucent overlay plus the border and shadow, which the criterion allows.

**Note on transient readings:** my first measurements read a 43.98 px control and a 1.98:1 ring. Both were taken mid-transition (`transition-all` on the button base and the open zoom). Settled values pass, so I'm not reporting either as a product failure.

### Observations (not failures)
- **The Close ring colour is not driven by `--ring`.** Setting `--ring` to 25% alpha left the Close ring at opaque `rgb(180,83,9)`. The colour comes from the hard-coded `#b45309` in `app/globals.css`'s `:focus-visible` rule, and most milestone 1–2 controls use `outline-amber-700`. This does not fail any criterion today, but the milestone 4 dark palette will not reach these rings through the token.
- **Focus after Move up becomes disabled.** After moving a row to the top, its "Move up" button becomes disabled and does not hold focus. I did not establish where focus lands, and no criterion covers it.
- **dnd-kit swallows the next click for about 50 ms after a pointer drop** (`@dnd-kit/core` installs a document capture click stopper, removed on a 50 ms timeout). A Close click inside that window does nothing. Human clicks are never that fast, so I treated this as a test-timing constraint, not a bug.
- **Frontend's Implementation Notes**: the "Focus stats" contrast (4.60:1) and the 44 px target claims were confirmed by the settled measurements above.

### Coverage gaps (criteria only partly covered, or not testable by QA)
These are not failures and are not in the run totals. Each would need a new test to close.
1. Trigger clicks in the loading data state are not asserted. Ready and error are.
2. A failing `open()` is not separately tested. The `indexedDB`-deleted case is.
3. "Opening while the first read is pending shows loading, never empty" is covered only by the existing reload-time MutationObserver test, not by an open-while-pending case.
4. Keyboard-reorder persistence across close and reopen is covered only by reload, and mid-drag close is covered for the pointer and keyboard cases. Plain keyboard reorder followed by close and reopen is not separately asserted.
5. "Row controls never start a drag" asserts only +1. Pin, −1, Edit, Delete, and move are not individually asserted.
6. Console is asserted clean on the Close-button path only. The Escape and overlay paths are not console-checked. The hydration test filters the console for "hydration" and "mismatch" only.
7. Tab order is tested for containment, not for matching visual order.
8. Focus indicator is measured while idle, not during and after a keyboard drag.
9. Editing the pinned task updating the card is not tested.
10. "Pinning B while A is pinned leaves exactly one pinned task" is not verified in this pass. It may be covered by existing pin tests, which I did not re-check.
11. Reviewer-owned, not verifiable by e2e: `app/globals.css` diff contents, `components/ui/` being generator output, and the `docs/DECISIONS.md` entry. For what I did observe, no changes appear in `lib/`, `hooks/use-timer-clock.ts`, `hooks/use-hydrate-timer-store.ts`, `app/stats`, `components/Stats*`, or `components/PomotatoTimer.tsx`.

### Repro steps for any failure
None. The final run has zero failures.

### Review follow-up (N1, N2, N6, N7)

- **N1**: corrected the `onOpenAutoFocus` comment in `components/TaskListDialog.tsx`. Close is the initial focus but last in DOM order (`DialogContent` renders it after children); Tab from Close goes to the add form and Radix's loop wraps back. I did not move Close into `DialogHeader`, since that changes markup qa's tests touch. Caveat: DOM order is title, description, add form, rows, Close, so the literal "tab order matches visual order" criterion is only met by the loop behaviour.
- **N2**: `onOpenAutoFocus` now focuses the close button if found, else `event.target` (the content node, `tabIndex=-1`), so focus cannot fall to `<body>`. Verified in Chromium with a throwaway script (not committed): normal open focuses `BUTTON[data-slot=dialog-close]`; with `querySelector` forced to miss, focus lands on `DIV[data-slot=dialog-content]`. The `data-slot` prop-order dependency (`Button` spreads `{...props}` after its own `data-slot="button"`) is now written in the header comment of `components/ui/dialog.tsx`.
- **N6**: removed the dead `motion-reduce:transition-none` from the Reload button in `components/CurrentTaskCard.tsx`.
- **N7**: deleted `DialogFooter` from `components/ui/dialog.tsx` (and its export). Nothing imported it; `shadcn add` can regenerate it. The header comment now says it was deleted, not adapted.
- Verification: lint (0 errors, existing warnings), typecheck, build, unit 235/235, e2e 181/181. No test files touched.

## Review Findings
- **Verdict: APPROVE.** Every acceptance criterion is met or is met-with-a-named-gap that QA disclosed. The eight findings below are non-blocking; none needs a fix loop before this lands. Checked independently: the assertion audit (by `git diff -U0`, not by reading the padded diff), the Escape-precedence mechanics (against `node_modules`), the adapted `components/ui/dialog.tsx`, the untouched-file list, types, and licensing.

### Verified independently (not taken on faith)
- **QA's 49-of-52 setup-only claim holds.** Removed lines: `sessions.spec.ts` zero, `accessibility.spec.ts` zero, `task-list.spec.ts` eight (three of them comments). The only two removed assertions are the two QA named. The pin-after-reload replacement is strictly stronger (`getByRole("main")`-scoped, still exact, plus a new positive pre-reload wait); the task-list error assertion is re-asserted inside the dialog with the same regex and the same 5 s timeout. No loosened locator, no `try`/`catch`, no `if`-wrapped or deleted assertion anywhere in the 52.
- **Escape precedence is sound, including the pointer case.** Radix dismisses from a `document` keydown listener registered with `{ capture: true }` (`@radix-ui/react-use-escape-keydown`), so `onEscapeKeyDown` really does run first and `preventDefault()` is the supported opt-out. dnd-kit sets `aria-pressed` whenever `isDragging && role === defaultRole`, i.e. for pointer drags too, and `AbstractPointerSensor.handleKeydown` cancels the drag on Escape itself — so Escape mid-pointer-drag cancels the drag and keeps the dialog open, matching the keyboard case rather than leaving a hole. No collision with `TaskRow`'s Pin button (`aria-pressed={isPinned}`, TaskRow.tsx:232): the `[aria-roledescription="sortable"]` qualifier excludes it, and `useSortable`'s `roleDescription` default is `'sortable'`.
- **The token guard test guards what it claims.** `components/TaskListDialog.tokens.test.ts` reads the three new-surface source files and rejects hex literals and the raw palette families, then asserts `bg-popover` / `bg-scrim` / `border-border` are present. Limits worth knowing: it is a source-text check, so it would not catch a raw `rgb()`/`oklch()` literal or a non-Tailwind colour name. Adequate for its stated purpose.
- **Untouched-file criterion passes.** `lib/**`, `lib/stats/**`, `lib/timer/**`, `hooks/use-timer-clock.ts`, `hooks/use-hydrate-timer-store.ts`, `app/stats/**`, `components/Stats*.tsx`, `components/PomotatoTimer.tsx`, `components/TaskRow.tsx`, `components/TaskForm.tsx` are byte-for-byte unchanged. `app/globals.css` contains only the three intended token hunks; the plain-CSS `body` rule and the `:focus-visible` rule are untouched. `--muted-foreground` has exactly one consumer in app code (`components/ui/dialog.tsx`), so the "zero visual impact" claim in DECISIONS is correct.
- **Licensing.** `package.json` and the lockfile are unchanged — nothing new shipped. `cn` (shadcn-ui/cn) is MIT and pre-existing; the `lucide-react` glyph import is gone, so no library icon ships. No binaries, fonts, audio, or images. No branding resembling another product; the Ghibli-mood-only boundary is not approached.
- **Types and performance.** No `any`. The `error instanceof DatabaseBlockedError` narrowing and the `blocked: false` no-`indexedDB` branch are both sound. `TaskListDialog` holds no state (Radix owns `open`), so the relocation adds no re-render path; the Escape handler is one `document.querySelector` per keypress. No interval-counting introduced; the timer's stored-end-timestamp derivation is untouched and the "counts down behind the modal" test reads the real countdown.
- **The blocked-upgrade path is no longer undocumented debt.** `e2e/task-list-dialog.spec.ts:793` reproduces the real condition (a second page holding an older-version connection open), and asserts the blocked copy on `/` with no dialog, `Loading…` cleared, the timer rendering, and the dialog's own matching error. The trigger is unconditionally enabled by construction (`TaskListDialog` reads no data), which resolves QA coverage gap 1 by inspection.
- **PM's live-region risk was a genuine false alarm, correctly retired.** `@dnd-kit/core` does `container ? createPortal(markup, container) : markup`, so the default is inline in the `DndContext` tree. Frontend's correction is right and the workaround removal was the correct call.

### Findings
1. **(minor, accuracy) The Close control is the *last* tab stop, not the first — and a code comment says otherwise.** `DialogContent` renders the close button after `{children}` (`components/ui/dialog.tsx:76-86`), so the DOM order is title → description → add form → rows → Close, while visually Close sits `absolute top-3 right-3` in the header. The comment at `components/TaskListDialog.tsx:49-51` ("The Close control is always the first tab stop") is factually wrong and will mislead the next reader. Practical impact is small — focus starts on Close and Radix's `loop: true` wraps Tab to the add form, which reads naturally — but the criterion "reachable with Tab in an order matching visual order" is not strictly met for this one control, and QA coverage gap 7 confirms nothing tests order. **Minimum fix: correct the comment.** Optional: render the Close inside `DialogHeader`, before the scroll body.
2. **(minor, robustness) `onOpenAutoFocus` can silently drop focus to `<body>`.** `components/TaskListDialog.tsx:48-56` calls `event.preventDefault()` unconditionally, then focuses `[data-slot="dialog-close"]` with `?.focus()`. If that query ever misses — `showCloseButton={false}`, a renamed `data-slot`, or a future `shadcn add` reshuffling the file — Radix's own auto-focus has already been cancelled and focus lands on `<body>`, which is exactly the failure the "never `<body>`" criterion forbids, with no test covering the fallback. One-line fix: fall back to focusing `event.target` (the content node already has `tabIndex={-1}` from Radix) when the query returns null. Also worth a line in `ui/dialog.tsx`'s header comment: the `data-slot="dialog-close"` survives the `asChild` + `Button` nesting only because `Button` spreads `{...props}` *after* its own `data-slot="button"` — a prop-order dependency across two generated files.
3. **(minor, latent) `li [role="group"]` is a broad hook for the Escape rule.** `ESCAPE_OWNED_BY_ROW = 'li form, li [role="group"]'` is correct today (the delete confirmation is the only `role="group"` in `TaskRow`), and the e2e precedence tests guard it. But `role="group"` is a generic role: wrapping the `+1`/`-1` pair or the move up/down pair in one — a plausible future grouping — would silently stop Escape closing the dialog whenever focus sits inside it, with no visual symptom. The tradeoff is correctly flagged in Implementation Notes and accepted here; the durable fix for a later task is a purpose-built marker (`data-escape-layer`) on the two inner layers rather than a structural selector.
4. **(observation, pm/owner call) Escape in the *add* form now discards typed input.** Escape inside an *edit* form cancels only the edit, but Escape with focus in the add form closes the whole dialog and loses a half-typed title. This matches the settled criteria exactly, so it is not a defect of this task — but it is a new asymmetry the relocation created (before, Escape in the add form did nothing). Flagging for pm as a possible follow-up, e.g. only dismissing on Escape when the add form is pristine.
5. **(observation, visual) Rows and the add-form card read nearly flat on the new popover surface.** `components/TaskList.tsx`'s add-form section and every `TaskRow` `<li>` still use `bg-white border-stone-200` — pre-existing, and converting them is explicitly out of scope. On the cream page that white read as a distinct card; on `--popover #fffaf3` it is roughly 1.02:1 with a ~1.09:1 border, so the card boundaries that structured the list are now almost invisible. Not a WCAG failure (container boundaries, not control boundaries) and not in scope here, but worth an eye before milestone 4's token conversion.
6. **(nit)** The new Reload button in `components/CurrentTaskCard.tsx` carries `motion-reduce:transition-none` with no transition to suppress — dead class.
7. **(nit)** `DialogFooter` in the adapted `components/ui/dialog.tsx` is unused and was *not* adapted: `border-t` with no token colour, `bg-muted/50`, and `rounded-b-xl` against the content's `rounded-2xl`. The DECISIONS entry's own argument — an unused stock `DialogContent` is "a loaded gun" — applies here too. Adapt or drop it next time something touches the file.
8. **(copy nit)** "Pin a task from Your tasks whenever you're ready." Matching the trigger's wording exactly was the criterion and the tone is right, but the bare "from Your tasks" mid-sentence reads like a typo. Non-blocking.
