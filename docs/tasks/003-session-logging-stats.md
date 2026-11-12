---
id: 003
slug: session-logging-stats
status: done # draft | in-progress | qa | review | done | blocked
---

# Session logging and daily/weekly/monthly focus stats

> **History for this task** — implementation notes, QA reports, review findings and
> orchestrator rulings live in [logs/003-session-logging-stats-log.md](logs/003-session-logging-stats-log.md). Read it only when a
> criterion below is disputed; it is not an input to implementing them.

## Goal
Every timer run that reaches zero is written to a `sessions` table in IndexedDB exactly once, and a completed focus run also bumps the pinned task's completed-pomodoro count in that same transaction. A new `/stats` route then reports focus time for the current day, week, and month with one bar chart per view, plus an accessible data table carrying the same numbers.

## Data shape / pipeline ordering

- **Backend runs first. Frontend does not start until backend has handed off.** This task adds a new Dexie table and the first schema version bump in the project's history, and it adds the aggregation functions the UI reads. None of that shape is decided yet.
- Backend delivers:
  - a `.version(2)` block in `lib/db/database.ts` adding a `sessions` table. The existing `.version(1)` block (`tasks`, `appMeta`) is **not edited** — per backend's own milestone-2 notes, milestone 3 "adds a `sessions` table with a **new** `.version()` block, never editing the `version(1)` block".
  - the session record type, plus whatever range-query index the stats views need.
  - a session repository with: log a completed session (atomic with the task-count increment, see below), list sessions in a `[from, to)` timestamp window, and whatever clear/seed helper QA needs (extend `lib/db/test-utils.ts`).
  - pure aggregation functions under `lib/stats/` that take sessions plus a reference instant and a timezone-aware notion of "now", and return the bucketed series and totals for each of the three views. These must be unit-testable with no browser and no IndexedDB.
- Backend records in this file's Implementation Notes, before handing off: the session record shape, the repository signatures, how the exactly-once guarantee is enforced, how the day/week/month bucketing functions are called, and how QA seeds and clears sessions. Frontend and QA build on that.
- Frontend then: adds the per-run identity the session write needs to the timer's persisted state (this is the first change to `lib/timer/**` since task 001 — see Scope), calls the repository from the timer's completion path, and builds `/stats`.
- Backend owns `lib/db/**` and `lib/stats/**`. Frontend owns `lib/timer/**`, `hooks/**`, `components/**`, `app/**`. Those sets are disjoint, but frontend still waits for backend's handoff because it calls backend's API.

### Decision: this task supersedes task 002's "timer does not touch task counts"

Task 002 deliberately left the completed-pomodoro count manually-adjustable and added the acceptance criterion *"Completing a focus session in the timer does **not** change any task's count"*, because auto-counting would have meant solving double-counting in two places with no session record to tie an increment to. Its notes close with: *"Milestone 3 must be able to increment this count in the same transaction as the session write."* That is what this task does.

Consequences to carry deliberately, not discover later:
- **The milestone-2 regression test is now wrong on purpose.** `e2e/task-list.spec.ts`'s `completing timer does not change task completed count` (added by QA in task 002's fix loop, which starts a focus run, fast-forwards 26 minutes with `page.clock`, and asserts the pinned task's count stayed at 0) must be **inverted** by QA in this task: same setup, now asserting the count went `0 → 1`. This is an intentional behavior change, not a regression. Nobody should "fix" the new behavior to make the old test pass.
- Task 002's acceptance criterion quoted above is **superseded** by this file. Every other task-002 criterion still holds.
- The manual +1 / -1 controls stay. A user can still correct an automatic increment by hand.

### Decision: what gets logged, and what counts as focus

- **Only runs that reach their end timestamp are logged.** A run that is reset, abandoned while paused, or discarded by a mode switch writes nothing. There is no "stop and save" control in scope, task 001 already discards a run on mode switch without confirmation, and partial runs would double the number of states the exactly-once rule has to cover.
- **All four modes are logged** when they complete, with the mode stored on the record. Breaks are cheap to log now and expensive to backfill later.
- **Focus-type = `focus` and `custom`. Break-type = `shortBreak` and `longBreak`.** Stats views aggregate focus-type sessions only. Known imperfection, accepted: someone who uses Custom as a long break will see it counted as focus. Splitting Custom into focus/break intent is deferred.
- **A completed focus-type session increments the pinned task's count by 1**, regardless of its length (so a 1-minute custom run counts as one pomodoro). Break-type sessions increment nothing.
- Pause and resume inside a run do not create or split sessions. One run that reaches zero is one session, so `endedAt - startedAt` can be much larger than the run's duration. Stats therefore use the run's **planned duration** (the mode's full duration for that run) as its focus time, not wall-clock elapsed.

### Decision: which task gets credit

The task pinned **at the moment the run completes**, not at the moment it started. If the pin changed mid-run, the newly pinned task gets the increment. If nothing is pinned at completion, **the session is still logged, with no task attached** — focus time happened whether or not it was labelled. Those sessions count toward every total and appear in the per-task breakdown under a single "No task" row.

### Decision: completions that happen while the tab is closed or asleep

Task 001's timer already lands in `complete` on reload when the stored end timestamp passed while the tab was shut (`onRehydrateStorage` → `completeIfExpired`). That completion **is** logged, retroactively, with `endedAt` set to the **stored end timestamp** — the moment the run actually ended — not the moment the tab was reopened. So a run that finished at 23:40 and is discovered at 09:00 the next morning lands in the previous day's bucket. This holds no matter how old the expiry is; there is no cutoff. Accepted inaccuracy: a run that "finished" while the laptop was shut counts as focus time the user didn't spend. That is already how task 001's timer behaves, and idle detection is out of scope.

### Decision: exactly once, including across tabs

Task 001 and 002 accepted "last write wins" for timer state and task rows. **That is not acceptable for session writes.** Duplicate rows inflate every stat and duplicate increments corrupt the task count, and both are silent. The required invariant:

> One timer run that reaches zero produces exactly one session row and at most one task increment, no matter how many tabs observe the completion, how many times the page is reloaded, or how many times the completion path runs.

The mechanism is backend's and frontend's call together, but it has to be durable (surviving reloads), not in-memory. The obvious shape is a stable per-run identifier created when the run starts, carried in the timer's persisted state, passed into the session write, and rejected on a second write with the same value. That means the timer's persisted state gains a field and its persist version goes 1 → 2 with a migration — called out in Scope and in the criteria. Whatever mechanism ships must pass the two-tab and double-complete criteria below and must be written down in Implementation Notes.

## Scope

**In:**
- Dexie schema version 2 with a `sessions` table, added without editing the version-1 block and without losing existing `tasks` / `appMeta` data.
- Writing a session row when any timer run reaches zero, including the retroactive case discovered on load.
- Incrementing the pinned task's completed count in the same transaction as a focus-type session write.
- An exactly-once guarantee for session writes and increments, including two open tabs.
- A change to the timer's persisted state (`pomotato-timer`) to carry per-run identity, with a persist version bump and a migration that does not throw away a valid version-1 entry.
- A new `/stats` route with three views — Day (today), Week (current week), Month (current calendar month) — each showing: total focus time, completed focus-session count, one bar chart, a data table mirroring the chart, and a per-task breakdown table.
- A keyboard-reachable link from `/` to `/stats`.
- Local-timezone bucketing with explicit boundaries (below).
- Empty states for "no sessions in this range" that are distinguishable from the loading state.
- A non-visual equivalent for every chart.
- Installing `recharts` (frontend). Adding `components/ui/*` via `npx shadcn add <component>` as frontend judges useful for this task (frontend picks which — do not add components speculatively).

**Out (deferred):**
- Navigating to earlier days, weeks, or months. Each view shows the current period only; there are no prev/next controls.
- Any stats surface on `/` itself (a "today's focus" readout next to the timer, streaks, badges).
- Showing break sessions anywhere in the UI. They are logged and ignored by the stats views.
- Logging partial or abandoned runs, a "stop and save" control, or a confirmation prompt before a mode switch discards a run (task 001's reviewer nit N3 stays open).
- Editing or deleting a logged session by hand, and manual session entry.
- Any chart type beyond the one bar chart (no pie, donut, line, heatmap, calendar grid, stacked series).
- All-time totals, averages per day, goal setting, or time-of-day "best hours" analysis.
- Idle / away detection, or asking the user "were you really working?" after a retroactive completion.
- Cross-tab live updates. A second tab may show stale numbers until reloaded, as in task 002. What it must not do is write a duplicate.
- Export/import of sessions (milestone 7), themes and dark mode (milestone 4), sound, mascot art.
- Changing timer durations, modes, or any timer behavior other than logging and the new persisted field.

## Local-time boundaries (be exact here)

All bucketing uses the browser's local timezone and each session's `endedAt`:

- A session belongs entirely to the local calendar day its `endedAt` falls in. **It is never split across buckets.** A run from 23:50 to 00:10 counts entirely toward the later day.
- **Day view:** the current local calendar day, midnight to midnight local. 24 hourly buckets, keyed by the local hour of `endedAt`.
- **Week view:** the current local week, **starting Monday**, Monday 00:00 local through the following Monday 00:00 local. 7 buckets, one per local day.
- **Month view:** the current local calendar month, 1st 00:00 local through the 1st of the next month 00:00 local. One bucket per local day of that month (28–31 buckets).
- Day boundaries are local calendar boundaries, not fixed 24-hour offsets. On a DST-change day the local day is 23 or 25 hours long and bucketing must still follow the calendar.
- Focus time per bucket is the sum of the planned durations of the focus-type sessions in it.

## Acceptance Criteria

### Schema migration (backend; QA verifies with unit tests)
- [ ] `lib/db/database.ts` declares a `.version(2)` block adding `sessions`. The `.version(1)` block's schema string is byte-for-byte unchanged (reviewer verifies by diff).
- [ ] A database created with only the version-1 schema, holding 5 tasks with distinct positions and a pinned task, opens under version 2 with all 5 tasks present, the same ids, the same relative order, the same `completed` values, and the same pin. Nothing is dropped or renumbered.
- [ ] Opening the version-2 database on a brand-new browser profile creates `tasks`, `appMeta`, and `sessions` with no error and no session rows.
- [ ] After the upgrade, every task-repository function from task 002 still behaves as its own criteria specify (QA re-runs task 002's repository suite unchanged against the upgraded schema).
- [ ] **Blocked upgrade:** when another connection holds the database at version 1 and blocks the version change, the app does not sit in a loading state forever. It surfaces a readable message telling the user to close other tabs of the app, within 10 seconds. (Task 002's reviewer flagged this exact case as "realistic once milestone 3 bumps the schema version while another tab is still open.")

### Session records and the write path (backend; QA verifies with unit tests against the repository)
- [ ] A logged session record captures at least: a stable unique id, the mode, the per-run identity used for deduplication, `startedAt` (when the run was first started), `endedAt` (when it reached zero), the run's planned duration in ms, and the attached task id or an explicit "none".
- [ ] Logging a completed focus-type session with a task attached writes the session row and increments that task's `completed` by exactly 1, **inside one transaction**. No read can ever see one without the other.
- [ ] If the increment cannot be applied (for example the task id no longer exists), the whole transaction fails or the session is written with no task attached — never a session row plus a lost increment, and never an increment plus a lost session row. Backend picks one and records which.
- [ ] Logging a break-type session writes the session row and changes no task's `completed` value.
- [ ] Logging a focus-type session with no task attached writes the row with an explicit "none" task and changes no task's count.
- [ ] A second log call carrying a per-run identity that is already stored is a no-op: no second row, no second increment, and no thrown untyped exception. QA checks that calling the log function 5 times with the same run identity leaves exactly 1 row and `completed` incremented by exactly 1.
- [ ] If the attached task is at `completed === 999`, the session is still logged and the count stays 999 (task 002's clamp is unchanged).
- [ ] Deleting a task does **not** delete its sessions. After deleting a task that has 3 logged sessions, all 3 rows remain and total focus time is unchanged.
- [ ] A session whose task was deleted still appears in the per-task breakdown under a stable, human-readable label rather than a raw id or a blank row. Backend chooses how (title snapshot at log time, a "Deleted task" grouping, or other) and records the choice.
- [ ] A `[from, to)` window query returns exactly the sessions whose `endedAt` is `>= from` and `< to`, with a session exactly on `from` included and one exactly on `to` excluded. The query does not need to load sessions outside the window.
- [ ] Importing anything in `lib/db/` or `lib/stats/` during a server render or build does not crash, and no database access happens outside the browser (same bar as task 002).
- [ ] Errors are typed in the same style as task 002's (`TaskValidationError`, `TaskNotFoundError`, `DatabaseUnavailableError`, `InvalidReorderIndexError`) and exported from `lib/db/index.ts`. Reviewer checks the barrel actually exports them — task 002 shipped a claimed-but-missing export.

### Aggregation (backend; QA verifies with unit tests, no browser)
- [ ] The aggregation functions are pure: given the same sessions, reference instant, and timezone, they return the same buckets and totals. They do not read `Date.now()` internally.
- [ ] Break-type sessions are excluded from every bucket, total, and breakdown.
- [ ] Day view returns 24 buckets even when some are zero; week view returns 7; month view returns one per day of the given month, correct for a 28-, 29-, 30-, and 31-day month.
- [ ] A session's planned duration lands entirely in the bucket of its `endedAt`, with no splitting. QA checks a session from 23:50 to 00:10 lands wholly in the later local day.
- [ ] Sessions outside the range are excluded. A session at 23:59:59.999 local on the last day of the month is in; one at 00:00:00.000 local on the 1st of the next month is out.
- [ ] Week buckets run Monday through Sunday. A session on a Sunday belongs to the week whose Monday precedes it.
- [ ] With the timezone set to one that observes DST (for example `America/New_York`), a session at 23:30 local on a DST-change day lands in that local day's bucket, and that day's buckets still cover the whole local day.
- [ ] The per-task breakdown returns focus time and session count per task for the range, with untagged sessions grouped as one "No task" entry.
- [ ] Focus-vs-break classification lives in exactly one place in the data layer. The UI does not re-derive it. Reviewer verifies there is no second copy of the rule.
- [ ] Aggregating 5,000 sessions spread over 12 months into month buckets completes in under 100 ms in a unit test on the dev machine.

### Timer integration (frontend; QA verifies e2e)
- [ ] A focus run started with task A pinned and fast-forwarded to completion produces exactly 1 session row and takes A's `completed` from 0 to 1. **This is the inverted form of task 002's `completing timer does not change task completed count` test.**
- [ ] The pinned task's count change shows in the Current task card and the task row without a reload, as task 002's criteria already require for manual changes.
- [ ] A focus run completed with no task pinned produces 1 session row with no task attached, and no task's count changes.
- [ ] A short-break run fast-forwarded to completion produces 1 session row and changes no task's count.
- [ ] A run that is **reset** before reaching zero produces no session row and changes no count.
- [ ] A run abandoned while **paused** (paused, then the page is left or reset) produces no session row.
- [ ] A run discarded by a **mode switch** mid-run produces no session row.
- [ ] A run in progress has no session row. QA starts a focus run, confirms zero rows, reloads mid-run, confirms still zero rows, then fast-forwards to completion and confirms exactly 1.
- [ ] **Retroactive completion:** with a stored running state whose end timestamp passed while the tab was closed, loading the page logs exactly 1 session whose `endedAt` equals the stored end timestamp (not the load time) and increments the pinned task once. QA verifies the row's `endedAt`, not just its existence.
- [ ] Reloading that same page again logs nothing further: still 1 row, count unchanged. QA reloads 3 times.
- [ ] **Two tabs:** with the same completion observed by two open tabs (both fast-forwarded past the end, or one completing while the other reloads into the expired state), exactly 1 session row exists and the pinned task's count went up by exactly 1.
- [ ] From the `complete` state, starting again and completing again logs a **second**, distinct session row and a second increment. Dedup must not swallow a genuinely new run.
- [ ] If the pin changes mid-run (A pinned at start, B pinned before the end), the increment goes to B and the session is attached to B.
- [ ] If the pinned task is deleted mid-run, completing the run logs a session with no task attached, throws nothing, and shows no error state on `/`.
- [ ] If IndexedDB is unavailable, the timer still runs and completes normally; the failed session write does not break the timer or crash the page (same bar as task 002's "the page still renders the timer").
- [ ] The timer's persisted state carries per-run identity and its persist version is bumped from 1. A stored **version-1** entry in `pomotato-timer` (idle, running, paused, and complete, tested separately) survives the migration: the mode, custom minutes, status, and end timestamp are preserved, a running entry keeps counting down to the same end timestamp, and its completion logs exactly 1 session.
- [ ] Remaining time is still derived from the stored end timestamp. No interval or animation-frame callback decrements any stored value — the same check task 001's reviewer ran, re-run against the changed store.

### Stats UI (frontend; QA verifies e2e)
- [ ] `/stats` is reachable from `/` by a link that is keyboard-focusable, has a visible focus indicator, and has a text accessible name.
- [ ] `/stats` has a control that switches between Day, Week, and Month. The selected view is exposed programmatically (checked / selected / pressed), not by color alone. Exactly one view is shown at a time.
- [ ] Each view shows total focus time for the range in a readable form (for example `1 h 40 m`, not `6000000`), and the count of completed focus sessions in the range.
- [ ] Each view renders one bar chart whose bars match the bucket definitions in "Local-time boundaries" above: 24 hourly bars (Day), 7 daily bars Monday–Sunday (Week), one bar per day of the month (Month).
- [ ] Chart bar colors come from the existing `--chart-1` … `--chart-5` tokens in `app/globals.css`. No new hex values are introduced for chart colors.
- [ ] Each view renders a `<table>` with a caption and one row per bucket, carrying the same bucket labels and the same numbers as the chart. The table is in the DOM and keyboard-reachable on page load (a `<details>` disclosure is fine; hover-only or JS-injected-on-interaction is not).
- [ ] No number in the chart is available only on hover. Every value in the chart appears in the table too, so the chart's tooltip is a convenience, not the only path to the data.
- [ ] The chart's `<svg>` is not exposed as meaningful content to assistive tech without an equivalent: either `aria-hidden` with the table as the accessible equivalent, or `role="img"` with a text alternative summarizing the range. A bare unlabelled `<svg>` fails this criterion.
- [ ] Each view renders a per-task breakdown table for the range: task label, focus time, session count, with untagged sessions in one "No task" row. Ordered deterministically (QA can assert a specific order, so backend/frontend must pick one — for example focus time descending, ties broken by label).
- [ ] **Empty state:** with no focus sessions in the range, the view shows a short message naming the range (for example "Nothing logged this week yet"), shows zero totals, and does not render an empty chart frame or an all-zero table. Each of the three views has this state tested.
- [ ] **Empty state is not the loading state and does not flash.** While the initial database read is pending, the empty-state message is not shown. With sessions in storage, the empty-state text never appears at any point during load — QA checks this with a `MutationObserver` installed via `addInitScript`, watching `document` (task 002's version of this test silently passed for two rounds because it observed `document.body` before it existed; do not repeat that).
- [ ] If IndexedDB is unavailable or the database fails to open, `/stats` renders a plain error message instead of crashing or hanging on "loading". Both paths are tested: `indexedDB` deleted before load, and a failing `open()`.
- [ ] Reloading `/stats` with sessions in storage produces no React hydration-mismatch errors or warnings in the console.
- [ ] `/stats` is usable at a 320 px viewport width: no horizontal page scroll (`document.documentElement.scrollWidth <= clientWidth`), and the month view's chart and table are both readable there — a squeezed desktop chart is not acceptable, a different bucket presentation at that width is.
- [ ] With 2,000 seeded sessions spread over 12 months, `/stats` reaches its rendered Month view (totals, chart, and table present) within 3 seconds and logs no console errors.

### Accessibility
- [ ] Every control on `/stats` (the view switcher, any disclosure, the back/home link) is reachable with Tab in a logical order matching the visual order and operable with Enter and/or Space as native controls are.
- [ ] Every interactive element on `/stats` has a visible focus indicator with at least 3:1 contrast.
- [ ] Native semantic elements and a real `<table>` with `<th scope>` headers. Semantic HTML before ARIA, as in CLAUDE.md.
- [ ] Text on `/stats` meets WCAG AA contrast (4.5:1 normal text), and chart bars meet 3:1 against the surface behind them.
- [ ] WCAG 2.5.3 Label in Name holds for every control whose accessible name differs from its visible text — task 002's reviewer found three violations of this that axe does not catch by default.
- [ ] No axe-core violations of serious or critical impact on `/stats` in each of: Day view with data, Week view with data, Month view with data, and an empty range.
- [ ] No axe-core violations of serious or critical impact on `/` remain after this task's changes, in every state task 002's criteria already list.
- [ ] Interactive targets on `/stats` are at least 24×24 CSS px (44 px preferred, matching tasks 001–002).

### Regression
- [ ] Every Vitest and Playwright test from tasks 001 and 002 still passes, **with exactly one intended exception**: `e2e/task-list.spec.ts`'s `completing timer does not change task completed count`, which QA inverts as described in the Decision section. Any other failing pre-existing test is a real regression.
- [ ] Task 002's data-layer criteria still hold after the schema bump (pin atomicity, dense unique positions, dangling-pin-reads-as-none, not-found errors, 50-random-reorder order verification).
- [ ] `/` keeps its current layout and behavior apart from the added `/stats` link and the now-automatic count increment.

### Tooling / quality gates
- [ ] `npm run lint`, `npm run typecheck`, `npm run build`, `npm run test`, and `npm run test:e2e` all succeed.
- [ ] No `any` types in new code (TypeScript strict).
- [ ] Any `components/ui/*` files added came from `npx shadcn add <component>`, and no existing milestone-1 or milestone-2 component file was retrofitted onto shadcn primitives in this task (per the 2026-10-07 decision).
- [ ] Backend's Implementation Notes record the session record shape, repository signatures, the dedup mechanism, the aggregation function signatures, and the session seed/clear helper **before** frontend starts.

## Files likely touched

**Backend**
- `lib/db/database.ts` — add the `.version(2)` block; do not edit `.version(1)`.
- `lib/db/types.ts` — session record and input types.
- `lib/db/session-repository.ts` (new) — log, window query.
- `lib/db/task-repository.ts` — only if the atomic increment needs a shared transaction entry point. Keep the existing public behavior intact.
- `lib/db/errors.ts`, `lib/db/index.ts` — new typed errors plus barrel exports.
- `lib/db/test-utils.ts` — extend the reset helper to cover `sessions`.
- `lib/stats/*` (new) — pure bucketing and totals for day/week/month plus the per-task breakdown.

**Frontend**
- `lib/timer/store.ts`, `lib/timer/types.ts` — per-run identity, persist version bump, migration. First change to `lib/timer/**` since task 001; task 002 listed these as "not touched", and that restriction is lifted only for this.
- `components/PomotatoTimer.tsx` — call the session write on the completion transition, including the hydration-time retroactive case. The existing hydration-gated announcement logic must keep working.
- `hooks/` — a `use-` hook per stats view/query, following task 002's pattern of returning a `{ status: "loading" | "ready" | "error" }` union instead of letting a rejected live query throw (there is still no error boundary in this app).
- `app/stats/page.tsx` (new), `app/page.tsx` — the route and the link to it.
- `components/` — stats view switcher, chart, bucket table, breakdown table, empty states. PascalCase filenames.
- `components/ui/*` — whatever `npx shadcn add` is actually needed for.
- `app/globals.css` — only if a token is missing. `--chart-1`…`--chart-5` already exist; do not add a `.dark` block.
- `package.json` / lockfile — `recharts` (frontend).

**QA**
- `e2e/task-list.spec.ts` — invert the one superseded test.
- `e2e/stats.spec.ts`, `e2e/sessions.spec.ts` (new), `e2e/accessibility.spec.ts`, `lib/db/*.test.ts`, `lib/stats/*.test.ts`.

## Risks

- **First schema migration, and it is irreversible for a real user.** A mistake here loses someone's tasks with no export to fall back on (milestone 7 adds export/import). Editing the version-1 block instead of adding a version-2 block is the specific failure mode. Covered by criteria; reviewer should diff the version-1 block directly.
- **Blocked upgrade with two tabs open.** A version change cannot complete while another connection holds the old version. Task 002's reviewer already predicted this for milestone 3. Untreated, it looks exactly like the infinite-loading bug that took two review rounds to find in task 002.
- **Double-counting is the core difficulty of this task.** Three independent paths can observe the same completion: the running tick loop, the rehydrate-time expiry check, and a second tab doing either. A duplicate is silent — nothing errors, the numbers are just wrong. The exactly-once invariant must be enforced by the data layer, not by UI bookkeeping; a UI-only guard will leak through the two-tab case.
- **Changing an already-tested behavior.** One milestone-2 test is intentionally inverted. There is a real risk a later agent reads the new behavior as a regression and "fixes" it back, or that the inversion is used as cover for other test failures. The Regression criteria say exactly one test changes.
- **Touching `lib/timer/**` again.** Task 001's store went through three fix loops, and its hydration-gated announcement, `merge`-time validation, and clamp behavior are all load-bearing and reviewed. Adding a field plus a persist migration risks regressing any of them. The migration must not discard a valid version-1 entry — a user mid-session when they update should not have their timer reset.
- **Timezone and DST off-by-one.** Bucketing by UTC, by a fixed 24-hour offset, or with `setHours` on a date built from a UTC string all produce wrong days for someone. The boundaries are written out above specifically so this is verifiable rather than argued about. A session that spans midnight is the standard trap.
- **Chart accessibility.** Recharts renders an `<svg>` full of `<path>` elements; a screen reader gets nothing useful, and axe will not flag it. The data table is the actual fix, and it must be present on load — not revealed by hover, and not generated only when a mouse enters the chart. Tooltips are mouse-only by default, so no number may live only in a tooltip.
- **Chart color and theming.** Using `--chart-1`…`--chart-5` keeps milestone 4's theme remap possible. Hard-coded hex values in a chart config would have to be found and undone later. The 3:1 bar-contrast bar applies against the current surface only; milestone 4 re-checks it.
- **Performance of a growing table.** Sessions only ever grow. A month view that loads every session ever recorded will get slower every month. A window query plus pure aggregation keeps this bounded; the 5,000-session unit test and the 2,000-session page test are the guardrails.
- **Retroactive logging is a product judgment, not a fact.** Counting a run that expired while the machine was asleep may overstate someone's focus time. It is recorded as a decision above so it can be revisited with intent rather than discovered as a bug.
- **Stale numbers in a second tab.** No cross-tab live updates. A second tab can show yesterday's figures until reloaded. Accepted; duplicate writes are not.
- **First shadcn components in the project.** `npx shadcn add` writes into `components/ui/` and can touch `components.json` and `app/globals.css`. The 2026-10-07 decision records that `shadcn init` already tried to overwrite the warm palette once and had to be hand-reconciled. Frontend should check the diff of anything the CLI writes outside `components/ui/`, and must not let it revert the palette, the `body` rule, or the `:focus-visible` rule. The CLI may also need `--legacy-peer-deps` for the pre-existing `vitest` / `@types/node` peer conflict.
- **Licensing.** No new audio, fonts, or images in this task. Recharts is MIT; shadcn components are copied source under MIT. If any icon set beyond the already-installed `lucide-react` is wanted, it needs a DECISIONS.md entry first.
- **Next.js version.** Next 16.3.8. Per AGENTS.md, frontend reads the relevant guide in `node_modules/next/dist/docs/` before adding the `/stats` route. IndexedDB does not exist on the server, so `/stats` must not read the database during render or build.
- **Design direction.** Still no `DESIGN.md`. Tasks 001 and 002 labelled themselves "draft without direction" with ENERGY 1 / RHYTHM 1 / MOTION 1. Match that: one chart, flat warm palette, no gradients or animated chart entrances. Do not invent a new visual language for the stats page.
- **Verification standard.** Per the 2026-10-07 decision, a PASS self-report is not evidence. The dedup criteria in particular need tests that are shown to fail against the un-deduped version, since a dedup bug produces no error — only wrong numbers.
