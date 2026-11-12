---
id: 001
slug: focus-timer
status: done # draft | in-progress | qa | review | done | blocked
---

# Focus timer with modes

> **History for this task** — implementation notes, QA reports, review findings and
> orchestrator rulings live in [logs/001-focus-timer-log.md](logs/001-focus-timer-log.md). Read it only when a
> criterion below is disputed; it is not an input to implementing them.

## Goal
Replace the default create-next-app home page with a working Pomodoro timer. It has four modes (focus, short break, long break, custom) and start/pause/reset controls. Remaining time is always derived from a stored end timestamp, so the countdown stays correct when the tab is backgrounded, the machine sleeps, or the page reloads.

## Data shape / pipeline ordering
- **Backend does not need to run first.** This task has no Dexie schema, repository, migration, or route handler. Timer state lives client-side in a Zustand store with the `persist` middleware, and CLAUDE.md already settles that stack choice.
- The persisted timer state is owned by frontend. Whatever its exact fields, it must include: the selected mode, the custom duration, the run status (idle / running / paused / complete), an absolute end timestamp (epoch ms) while running, and the frozen remaining duration while paused. It must not include a counter that is decremented on each tick.
- Frontend can run alone. QA can start once frontend hands off.

## Scope
**In:**
- One timer on the home route (`/`), replacing the create-next-app placeholder content.
- Four modes with these default durations: Focus 25:00, Short break 5:00, Long break 15:00, Custom (user-set, default 25:00).
- Start, Pause, Resume, and Reset controls.
- Switching modes, including while the timer is running or paused (behavior defined below).
- A custom-duration input for Custom mode.
- Reaching zero: the timer stops at 00:00 and enters a "complete" state.
- Timer state persists across page reloads via Zustand `persist`.
- Remaining time is correct after tab backgrounding, sleep, and reload.
- Adding the dependencies this slice needs: `zustand` and the test tooling already named in CLAUDE.md (Vitest + Testing Library, Playwright), so `npm run test` and `npm run test:e2e` work.

**Out (deferred):**
- Session logging, history, and stats (milestone 3).
- Task list and the pinned current task (milestone 2).
- Themes and background images (milestone 4).
- Any sound, including the completion chime, plus ambient audio and music (milestones 5 and 6).
- Browser notifications, tab-title countdown, and favicon changes.
- Automatic cycling (focus to break to focus, long break every N pomodoros) and auto-start of the next mode.
- Editing the durations of focus, short break, or long break. Only Custom is editable in this task.
- Keyboard shortcuts beyond standard Tab/Enter/Space operation of the controls.
- Syncing state between multiple open tabs.
- Potato mascot artwork. A plain, tidy layout is enough here.
- PWA and offline install (milestone 7).

## Acceptance Criteria

### Display
- [ ] On first visit with no persisted state, the page shows Focus mode selected, the display reads `25:00`, and the status is idle.
- [ ] Remaining time is formatted as `MM:SS` with zero-padded seconds. Minutes are zero-padded to at least two digits and can exceed 59 with no hours segment (for example, 120 minutes shows `120:00`).
- [ ] Partial seconds round up for display. With 1500.0 s remaining the display shows `25:00`, with 1499.2 s it shows `25:00`, and with 0.4 s it shows `00:01`. It shows `00:00` only at completion.
- [ ] While running, the display updates at least once per second while the tab is visible. The display never moves backward in time and never skips more than one second while the tab is visible and the main thread is not blocked.

### Start / Pause / Resume / Reset
- [ ] From idle, activating Start puts the timer in the running state and the display begins counting down from the mode's full duration.
- [ ] While running, Start is replaced by (or relabeled as) Pause. Activating Pause freezes the display at the current remaining value, and that value does not change while paused, even if wall-clock time advances by 10 minutes.
- [ ] From paused, activating Resume continues the countdown from the frozen value. Example: pause at `12:34`, wait 5 minutes of wall-clock time, resume, and the display reads `12:34`, then `12:33` about 1 s later.
- [ ] Reset returns the current mode to its full duration in the idle state from any of these states: running, paused, complete, or idle (no-op).
- [ ] Controls that do nothing in the current state are either hidden or disabled, and disabled controls are exposed as disabled to assistive tech. Example: Pause is not offered when idle.

### Completion
- [ ] When the end timestamp is reached, the display shows `00:00`, the status becomes complete, and the timer stops. It does not go negative and does not start another mode on its own.
- [ ] From complete, Start (or its equivalent) begins a new full-length countdown in the same mode.
- [ ] Completion is announced to screen readers once, through a polite live region (for example "Focus complete"). The live region does not announce every second of the countdown.

### Mode switching
- [ ] The four modes can be selected from a visible control. The current mode is programmatically exposed, for example as checked, selected, or pressed state, not by color alone.
- [ ] Selecting a different mode while **idle** or **complete** switches to that mode and shows its full duration in the idle state.
- [ ] Selecting a different mode while **running** or **paused** stops the current countdown and switches to the new mode at its full duration in the idle state. The old countdown does not keep running in the background, and its remaining time is discarded. No confirmation prompt is required in this task.
- [ ] Selecting the mode that is already active does nothing, and a running countdown keeps running.

### Custom duration
- [ ] When Custom mode is selected, a labeled numeric input for the duration in whole minutes is visible.
- [ ] Accepted values are integers from 1 to 180 inclusive. On first visit the value is 25.
- [ ] Empty input, 0, negatives, decimals (for example `2.5`), values above 180, and non-numeric text are rejected. An inline error message appears, linked to the input so screen readers read it with the field, and the custom duration stays at its last valid value.
- [ ] A valid change made while Custom is idle or complete updates the display right away to the new duration (for example, entering 50 shows `50:00`).
- [ ] While Custom is running or paused, the input is disabled, or edits are not applied until the next Reset or mode switch. Either way, the in-progress countdown is not changed by edits.
- [ ] The custom duration persists across reloads.

### Timestamp-anchored timing (the core requirement)
- [ ] While running, persisted state contains an absolute end timestamp in epoch ms. Remaining time is computed as `endTimestamp - now`, clamped to the range `[0, modeDuration]`. QA can verify this by reading the persisted storage entry.
- [ ] No stored value is decremented per tick. Reviewer verifies in code that any interval or animation-frame callback only triggers a re-render or recompute and never mutates remaining time.
- [ ] **Backgrounding / throttled timers:** start Focus, then advance the system clock by 10 minutes **without** letting interval or timeout callbacks fire (Playwright `page.clock` or Vitest fake timers with `setSystemTime`). On the next render, or on a `visibilitychange` to visible, the display reads `15:00` (±1 s).
- [ ] **Sleep longer than the remaining time:** start Short break, then advance the system clock by 10 minutes with no callbacks firing. On return the display reads `00:00` and the status is complete, not a negative value.
- [ ] **Reload while running:** start Focus, wait or advance 2 minutes, then reload the page. After reload the timer is still running in Focus mode and reads `23:00` (±1 s), with no click needed.
- [ ] **Reload after the end passed while closed:** start Short break, close or reload the page with the clock advanced 6 minutes. The page loads showing `00:00` and the complete state.
- [ ] **Reload while paused:** pause at some value X, reload, and the timer is still paused at X.
- [ ] **Clock moved backward:** if the system clock is set earlier than the start time while running, the display never shows more than the mode's full duration.

### Rendering / hydration
- [ ] Reloading with persisted running, paused, or complete state produces no React hydration-mismatch errors or warnings in the browser console.
- [ ] The default create-next-app content (Next.js logo, "Deploy now" links, template copy) is gone from `/`.

### Accessibility
- [ ] Every control (mode selector, Start/Pause/Resume, Reset, custom input) can be reached with Tab alone, in a logical order matching the visual order, and operated with Enter and/or Space as native controls normally are.
- [ ] Every interactive element shows a visible focus indicator under keyboard focus, with at least 3:1 contrast against its surroundings.
- [ ] Controls use native semantic elements (buttons, inputs, labels) and each has an accessible name. An icon-only button must still have a text accessible name.
- [ ] Text and the timer display meet WCAG AA contrast (4.5:1 for body text, 3:1 for the large timer digits).
- [ ] No axe-core violations of serious or critical impact on `/` in the idle, running, and paused states.

### Tooling / quality gates
- [ ] `npm run lint`, `npm run typecheck`, `npm run build`, `npm run test`, and `npm run test:e2e` all succeed.
- [ ] No `any` types in new code (TypeScript strict).

## Files likely touched
- `app/page.tsx`: replace the template content with the timer.
- `app/layout.tsx`: page title/metadata, if the template defaults remain.
- `app/globals.css`: possibly, for base styles and focus styles.
- `components/`: new timer UI component(s), PascalCase filenames.
- `lib/`: pure timer logic (duration constants, remaining-time computation, formatting) and the Zustand store. Frontend chooses exact paths. Do not use `lib/db/`, which is reserved for Dexie/backend.
- `hooks/`: possibly a `use-` hook for driving re-renders while running.
- `package.json` / lockfile: add `zustand`, Vitest, Testing Library, and Playwright (plus their config files at the repo root).
- Test files (`*.test.ts(x)`, `e2e/**`): owned by QA.

## Risks
- **Hydration mismatch.** `persist` reads from browser storage, which isn't available during server render. Naively rendering persisted values will cause mismatch warnings and a visible flash. This is covered by an acceptance criterion.
- **Next.js version.** The repo runs Next 16.3.8, and AGENTS.md warns its APIs differ from older versions. Frontend should read `node_modules/next/dist/docs/` before writing route or component code.
- **Persist versioning.** This is the first persisted shape. Later milestones (stats, auto-cycling, editable durations) will likely change it, so the persisted state should carry a version that allows a future migration rather than breaking existing users' stored state.
- **Clock skew.** Wall-clock changes (NTP adjustments, manual changes, DST doesn't affect epoch ms) can shift remaining time. Clamping is required, and anything beyond clamping is out of scope.
- **Multiple tabs.** Two open tabs share the same persisted storage key and may overwrite each other. This is explicitly not handled in this task, but implementation must not crash or corrupt state when it happens. Last write wins is acceptable.
- **Accidental mode switch.** Switching modes mid-run discards progress with no confirmation. This is accepted for this slice and may be revisited once session logging (milestone 3) makes lost progress matter more.
- **Screen-reader noise.** A per-second live region would make the page unusable with a screen reader. This is covered by an acceptance criterion.
- **Licensing.** No audio, fonts, or images are introduced. If a non-default font is added, it must be openly licensed and noted in `docs/DECISIONS.md`.
- **Test tooling not installed.** `npm run test` and `npm run test:e2e` are wired in `package.json`, but the packages are not installed. Someone has to add them in this task. The orchestrator should decide whether frontend or QA installs the test devDependencies, since QA's edit boundary is test files only.
