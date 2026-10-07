---
id: 001
slug: focus-timer
status: done # draft | in-progress | qa | review | done | blocked
---

# Focus timer with modes

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

## Implementation Notes
(Filled in by frontend/backend as they build. Decisions, tradeoffs, anything the next agent needs to know.)

**Status: implementation complete, ready for QA.**

### Dependencies
- Installed `zustand@^5.0.15` as a runtime dependency (`npm install zustand`). No other runtime deps added. Did not touch the test-tooling scripts in `package.json` (`vitest`, `playwright`) — those were already present in `package.json` before this task started; QA still owns installing the packages themselves per `docs/DECISIONS.md`.

### File map
- `lib/timer/constants.ts` — fixed mode durations (focus 25, short break 5, long break 15 minutes), custom-duration bounds (1–180), default custom minutes (25).
- `lib/timer/types.ts` — `TimerMode`, `TimerStatus`, and `PersistedTimerState` (the exact persisted shape).
- `lib/timer/time.ts` — pure functions: `fullDurationMs(mode, customMinutes)`, `getRemainingMs(status, endTimestamp, pausedRemainingMs, fullMs, now)`, `formatRemaining(remainingMs)`, `parseCustomMinutes(raw)`. All pure, no `Date.now()` calls inside except where explicitly passed in — these are the functions to unit test directly.
- `lib/timer/labels.ts` — `MODE_LABELS` / `STATUS_LABELS` display strings, shared by components.
- `lib/timer/store.ts` — the Zustand store (`useTimerStore`), detailed below.
- `hooks/use-hydrate-timer-store.ts` — triggers deferred persist rehydration client-side after mount (see Hydration section).
- `hooks/use-timer-clock.ts` — `useTimerClock(isRunning): number`, returns `now` (epoch ms), refreshed on an interval while running and on `visibilitychange`/`focus`. Only ever triggers re-renders/recomputation, never writes to the store.
- `components/PomotatoTimer.tsx` — container: wires the store, clock hook, completion effect, and the `aria-live="polite"` completion announcer.
- `components/ModeSelector.tsx`, `components/TimerDisplay.tsx`, `components/CustomDurationInput.tsx`, `components/TimerControls.tsx` — presentational/interactive pieces.
- `app/page.tsx` — renders `<PomotatoTimer />` under an `<h1>Pomotato</h1>`; all create-next-app template content (Next.js/Vercel logos, "Deploy Now", template copy) removed.
- `app/layout.tsx` — metadata updated to `Pomotato` / "A cozy, local-first Pomodoro focus timer." (Geist fonts kept — a typeface choice, not branding, so no DECISIONS.md entry needed.)
- `app/globals.css` — swapped the default black/white palette for a warm cream background (`#fbf4ea`) / dark warm-brown foreground (`#2b2017`); removed the `prefers-color-scheme: dark` override since no theme/toggle is in scope this milestone (deferred to PLAN.md milestone 4); added a global `:focus-visible` outline as a baseline, with most interactive elements also carrying their own explicit focus-visible ring class.

### Store shape and API (`lib/timer/store.ts`)
Persisted state (`PersistedTimerState`, version `1`, storage key `pomotato-timer`):
```ts
{
  mode: "focus" | "shortBreak" | "longBreak" | "custom";
  customMinutes: number;          // 1-180, default 25, persists independently of mode
  status: "idle" | "running" | "paused" | "complete";
  endTimestamp: number | null;    // epoch ms, set only while running
  pausedRemainingMs: number | null; // frozen ms remaining, set only while paused
}
```
Plus a non-persisted `hasHydrated: boolean`. Actions: `selectMode`, `start`, `pause`, `resume`, `reset`, `setCustomMinutes`, `completeIfExpired(now)`, `setHasHydrated`. No action ever decrements a stored counter — `pause()` and `completeIfExpired()` are the only places that read the wall clock to freeze or finalize state, and both are one-shot transitions guarded by the current status, not per-tick writes.

- `selectMode(mode)`: no-op if already the current mode (including while running, so a running countdown keeps running); otherwise switches to the new mode at `idle` with the old end timestamp / paused value discarded.
- `start()`: valid from `idle` or `complete` only; sets `endTimestamp = Date.now() + fullDurationMs(mode, customMinutes)`.
- `pause()`: valid from `running` only; freezes `pausedRemainingMs` from `endTimestamp - Date.now()` clamped to `[0, fullMs]`, clears `endTimestamp`.
- `resume()`: valid from `paused` only; sets a fresh `endTimestamp = Date.now() + pausedRemainingMs`.
- `reset()`: always available; returns to `idle` with no end timestamp / paused value. Does not touch `customMinutes`.
- `setCustomMinutes(minutes)`: no-ops while `mode === "custom"` and status is `running`/`paused` (the in-progress countdown is never affected by edits — the UI also disables the input in those states as a second layer).
- `completeIfExpired(now)`: no-ops unless `status === "running"` and `now >= endTimestamp`; then transitions to `complete` and clears the timestamp. Called from two places: the tick hook's effect in `PomotatoTimer` (while running, on recompute) and `onRehydrateStorage` (so a reload whose end timestamp already passed while the tab was closed lands directly in `complete`, not a stale `running` state).

### Timing model
`getRemainingMs` is the single source of truth: idle/complete return constants, paused returns the frozen snapshot (clamped), running returns `clamp(endTimestamp - now, 0, fullMs)`. `now` comes from `useTimerClock`, which is driven by a `setInterval(250ms)` *only while running* plus `visibilitychange`/`focus` listeners — it only calls `setState(Date.now())` to force a recompute, never mutates any timer field itself. Clock-moved-backward is handled by the same clamp (upper-bounded to `fullMs`), verified with a manual script (see below).

### Display formatting
`formatRemaining`: seconds round up via `Math.ceil(remainingMs / 1000)`, except `remainingMs <= 0` forces `0` so `00:00` only appears at true completion (confirmed: 1500000ms → `25:00`, 1499200ms → `25:00`, 400ms → `00:01`, 0ms → `00:00`, 7200000ms → `120:00`). Minutes are zero-padded with `padStart(2, "0")` but not truncated, so triple-digit minutes render fine.

### Hydration strategy (avoiding the mismatch risk called out in the task)
`persist` is configured with `skipHydration: true`, so the server render and the first client render both use the default in-code state (`idle` / Focus / 25:00) — no mismatch is possible since both sides render identical markup. `hooks/use-hydrate-timer-store.ts` calls `useTimerStore.persist.rehydrate()` inside a `useLayoutEffect` (after hydration has already been reconciled, before the browser paints), which is a normal post-mount state update, not a hydration check. `onRehydrateStorage` additionally runs the expiry check (`completeIfExpired`) and flips `hasHydrated` to `true` once rehydration settles. `migrate()` validates the persisted shape with a runtime type guard (`isPersistedTimerState`) and falls back to defaults on a version mismatch or malformed data, rather than blindly casting — this is the hook for a future persist-version bump (noted as a risk in this task file).

### Accessibility
- Mode selector: native `<fieldset>`/`<legend>` + four real `<input type="radio" name="timer-mode">` (screen-reader-only, visually hidden via `sr-only`) with a styled `<span>` sibling; `checked` state is native, not just a CSS color change (selected chip also gets a filled background + bold weight + different border, not color alone). Reachable and operable with Tab/Space/Arrow keys as native radios.
- Start/Pause/Resume is a single button whose label and handler change with status, so "Pause" is never present while idle (nothing to disable/hide — it simply doesn't exist in that state). Reset is always present and enabled; it's a harmless no-op from idle.
- Custom duration input: `<label htmlFor>`, error text in a `<p role="alert" id="custom-duration-error">` wired via `aria-describedby` and `aria-invalid`. Disabled (native `disabled` attribute, so it's exposed as disabled to AT) while running/paused.
- Completion is announced once via a `role="status" aria-live="polite"` element that's empty except right after a genuine `complete` transition; it's cleared when leaving `complete` so a second completion in the same session re-announces (screen readers don't re-announce unchanged text). Loading directly into an already-`complete` state on reload does not trigger an announcement (no transition happened this session), which seemed like the better reading of "announced once" from the task file; flag if QA/reviewer disagree.
- All interactive elements use an explicit `focus-visible` outline (amber-700 on the cream background measures ~4.6:1 against the page background by my manual WCAG luminance calculation, i.e. above the usual 3:1 non-text contrast guidance) plus a page-wide `:focus-visible` fallback in `globals.css`. Tap targets are `min-h-11` (44px) on mode chips, buttons, and the custom input per mobile tap-target guidance.
- Palette: cream background `#fbf4ea`, dark brown text `#2b2017`, amber-700 accent. I manually checked contrast via the WCAG relative-luminance formula (not an automated tool): body text ≈ 7.6–10:1 on the background, white-on-amber-700 button text ≈ 5.0:1, red-700 error text ≈ 6.5:1 — all above the 4.5:1 AA floor for normal text. QA's axe-core pass is the authoritative check; flag back to frontend if it disagrees with this manual math.

### Design direction note (antislop)
No `DESIGN.md` exists yet and this task explicitly defers mascot art and theming to later milestones ("a plain, tidy layout is enough here"), so there was no one to ask for a style brief before building. Per the antislop skill's fallback (R-37), I'm labeling this **"draft without direction"** with dials **ENERGY 1 / RHYTHM 1 / MOTION 1**: a single flat warm palette (cream/brown/amber, no gradients/glass/glow), no motion beyond hover/focus states, one layout. Treat the visual styling here as a functional placeholder, not a final art direction — a later milestone with real theme/mascot direction should feel free to replace all of it.

### Fix loop 2: ModeSelector color-contrast violation (frontend)

QA's axe-core numbers (Focus pill ~3:1, Custom pill ~1.58:1) didn't match a plain static calculation of `text-stone-700`-on-`bg-white` (which is ~10:1) or `text-white`-on-`bg-amber-700` (~5:1), so before touching colors I reproduced and instrumented the actual cause rather than guessing.

**Root cause.** The pill `<span>` carries `transition-colors` (a 150ms transition on `color`/`background-color`/`border-color`). QA's test clicks the "Custom" label and calls `AxeBuilder().analyze()` immediately afterward, with no wait for the transition to settle. Axe-core reads `getComputedStyle`, which — mid-CSS-transition — returns the live interpolated color, not the end state. Because the previous styling inverted light/dark roles between the two states (unselected = white bg / dark text, selected = amber-700 bg / white text), the Focus pill was transitioning dark-bg→light-bg while its text went light→dark, and the Custom pill the reverse, at the same time. Partway through that 150ms window, background and foreground colors pass close to each other in luminance, producing a real (not spurious) near-1:1 contrast frame — exactly the broken-looking numbers axe reported. I confirmed this by sampling `getComputedStyle` + canvas-based sRGB conversion (to avoid misreading Tailwind v4's oklch/lab-based computed-style strings) every ~15ms after the same click QA's test performs: contrast dropped to ~1:1 for the two pills mid-transition and only recovered once the transition finished. This is a structural issue, not a "pick different end colors" issue — any pair of colors where selected/unselected swap which of fg/bg is light vs. dark will cross a low-contrast point while both channels interpolate in opposite directions.

**Fix.** Changed the selected-pill style in `components/ModeSelector.tsx` so both states keep the same light-background/dark-text relationship — no role inversion to animate across:
```
checked
  ? "border-amber-700 bg-amber-200 font-semibold text-amber-900"
  : "border-stone-300 bg-white text-stone-700 hover:border-stone-400"
```
Selected: `amber-200` background, `amber-900` text, `amber-700` border. Unselected (unchanged): `white` background, `stone-700` text, `stone-300` border. Both are light-bg/dark-text, so the `transition-colors` animation now interpolates between two already-compliant states without ever crossing a low-contrast point. Re-sampling the same way post-fix (canvas-based sRGB, every ~15ms through the full transition) showed contrast never dropped below ~7.3:1 at any sampled frame, comfortably over the 4.5:1 AA floor with real margin — not just at rest, but throughout the animation. `peer-focus-visible:outline-amber-700` and the selected/unselected semantics (native `checked` state, not color alone) are unchanged.

**Verification run (this fix loop):**
- `npm run test:e2e -- --grep "no axe violations in custom mode"` → 1 passed.
- `npm run test:e2e -- e2e/accessibility.spec.ts` → 8/8 passed.
- `npm run test:e2e` (full suite) → 30/30 passed.
- `npm run test` (Vitest) → 72/72 passed.
- `npm run lint` → 0 errors (1 pre-existing warning in `lib/timer/store.test.ts`, unrelated to this change, not touched).
- `npm run typecheck` → clean.
- `npm run build` → succeeds.

Only `components/ModeSelector.tsx` was changed for this fix; no test files touched.

### Things QA should know
- Persisted storage key is `pomotato-timer` (localStorage), shape is `PersistedTimerState` above, under zustand's usual `{ state: {...}, version: 1 }` envelope.
- The completion-on-expiry check runs both from the running tick loop and from `onRehydrateStorage`, so both "sleep past the end while tab open" and "reload/relaunch after the end passed while closed" land in `complete` without a click.
- `lib/timer/time.ts` exports are plain, dependency-free functions — good unit test targets. I hand-verified them with a throwaway `tsx` script (not committed) covering the MM:SS rounding table and the custom-duration validation table from the acceptance criteria; all matched.
- Did not add Vitest/Playwright/config files — per `docs/DECISIONS.md`, that's QA's slice to install alongside the first tests.

### Fix loop 3: hydration-gated announcement, merge-time validation, repo hygiene (frontend)

**R1 — completion announcement firing on every reload into a persisted `complete` state.**

Root cause confirmed as reviewer described: `prevStatusRef` was seeded from `status` on first render, which is always the pre-hydration default (`"idle"`, since `skipHydration: true`). Once `useHydrateTimerStore`'s layout effect rehydrated — possibly flipping status straight to `"complete"` via `onRehydrateStorage`'s `completeIfExpired` call — the announce effect read that as a same-session `idle` → `complete` transition and announced, on every load, not just a genuine in-session completion.

Fix, in `components/PomotatoTimer.tsx`:
- `useHydrateTimerStore()`'s return value (`hasHydrated`) is now captured instead of discarded.
- `prevStatusRef` starts at `null` (typed `TimerStatus | null`) instead of `status`.
- The announce effect now bails out entirely while `!hasHydrated`. The first run after `hasHydrated` becomes `true` only seeds `prevStatusRef.current = status` and returns — no announcement. Every run after that baseline compares `previous` against the new `status` as before and announces exactly on a transition *into* `complete` that happens post-hydration.
- Because `completeIfExpired` (called from `onRehydrateStorage`) and `setHasHydrated(true)` are both plain `set()` calls fired inside the same `rehydrate()` promise resolution, React batches them into one re-render — so the first render where `hasHydrated` is `true` already reflects the final hydrated `status`. The baseline-seed branch always runs before any comparison can fire, regardless of whether hydration itself changed the status.

**Scope call, made explicitly per the reviewer's ask:** reloading into an already-`complete` state (whether it was already complete when the tab closed, or expired while the tab was closed and `onRehydrateStorage` catches it on load) does **not** announce. Only a completion that happens while the page is open and mounted in this session announces. Rationale: a screen-reader user who opens the app and lands on a stale "complete" screen gets that information visually and via the status display itself (`00:00`, and whatever visual treatment `TimerDisplay` gives the complete state) at the moment they start interacting with the page — an unsolicited live-region announcement firing before they've even gotten oriented is more startling than helpful, and matches this task's existing Implementation Notes claim (now actually true) and the acceptance criterion's "announced once" framing, which reads most naturally as "once per real completion event," not "once per page load that happens to be complete." If a future task wants reload-into-complete to also announce (e.g., because users rely on the live region as their primary signal that a session finished while they were away), that's a product decision for pm, not something to default into silently.

**S1 — persisted-state validation only ran inside `migrate`.**

In `lib/timer/store.ts`:
- `isPersistedTimerState` now also checks `customMinutes` is an integer within `[CUSTOM_MINUTES_MIN, CUSTOM_MINUTES_MAX]` (previously only checked `typeof === "number"`, so `0`, `-5`, `2.5`, or `99999` would have passed).
- Added cross-field consistency checks: `status === "running"` requires a non-null `endTimestamp` and a null `pausedRemainingMs`; `status === "paused"` requires the reverse; `status === "idle" | "complete"` requires both null. A shape where every field individually type-checks but the combination is nonsensical (e.g. `running` with `endTimestamp: null`) is now rejected — that combination can't be produced by any store action, so if it shows up in storage it's tampered or corrupted data, and both `pause()` and `resume()` are guarded against it anyway (`pause()` requires `endTimestamp !== null`), so without this check the UI would be stuck showing a running state with no way to derive or clear a remaining time.
- Added a `merge` option to the `persist` config that runs `isPersistedTimerState` on every load and falls back to `currentState` (i.e., in-code defaults) when it fails, rather than only inside `migrate`. `migrate` only fires on a version mismatch — `merge` runs unconditionally on every rehydration, which is what actually closes the gap the reviewer found: a same-version but tampered/malformed `localStorage` entry is now rejected on every load, not just across a version bump.
- Kept `migrate`'s own validation call as-is (now slightly redundant with `merge`, but harmless — `migrate`'s output still gets re-validated by `merge` immediately after, which is fine since both reuse the same guard function).

**S2 — repo hygiene.**
- Added `/playwright-report/` and `/test-results/` to `.gitignore` (grouped under the existing "testing" section). Verified with `git status --short` that both directories no longer appear as untracked.
- Deleted `public/next.svg`, `public/vercel.svg`, `public/globe.svg`, `public/file.svg`, `public/window.svg`. Confirmed with a repo-wide grep (excluding `node_modules`/`.next`) that none were referenced anywhere before deleting; `public/` is now empty.

**Files touched this loop:** `components/PomotatoTimer.tsx`, `lib/timer/store.ts`, `.gitignore`, deletions under `public/`. No test files touched.

**Verification run (this fix loop):**
- `npm run lint` → 0 errors, 1 pre-existing warning (`lib/timer/store.test.ts:430`, unrelated, not touched).
- `npm run typecheck` → clean.
- `npm run build` → succeeds.
- `npm run test` (Vitest) → 72/72 passed.
- `npm run test:e2e` (Playwright) → 30/30 passed, including the existing "reload after end time passed shows 00:00 and complete state" test (test #23), which still passes under the new hydration-gated announce logic — confirming no regression on that path, though it doesn't assert on the live-region's text content (that's the QA gap the reviewer flagged, for qa to close next with `page.clock`-based live-region tests).

## QA Report
(Filled in by qa.)

**Verdict: PASS** — All acceptance criteria met after frontend fix loop 3. Three live-region tests added to verify hydration-gated announcement behavior.

### Test Suite Bugs Fixed (Fix Loop 1)

**Bug 1 — Label interception on custom mode radio clicks (FIXED)**
- Issue: 12 e2e tests used `page.locator('input[type="radio"]').click()` directly on the hidden sr-only input nested inside a label. The label's pointer events intercept, causing timeouts.
- Root cause: ModeSelector.tsx has accessible markup where the label wraps the input correctly (`<label><input sr-only /><span>visible</span></label>`), but tests tried to click the hidden input instead of the label or visible span.
- Fix: Replaced all custom radio interactions with `page.locator('label:has(input[value="X"])').click()` to click the actual clickable element (the label), or for other modes. Also updated the shortBreak mode switch test to use the same pattern.
- Files fixed: `e2e/timer.spec.ts` (lines 124, 132, 143, 154, 165, 319, and test at line 104), `e2e/accessibility.spec.ts` (line 59)

**Bug 2 — CDN axe-core load failure (FIXED)**
- Issue: All 5 accessibility axe-core tests attempted to load from `https://cdnjs.cloudflare.com/.../axe.min.js`, which fails (no network access) and was never actually running.
- Root cause: Test environment has no external network; should use local package.
- Fix: Replaced CDN approach with `@axe-core/playwright` AxeBuilder API, which loads from `node_modules` locally. Updated test code to use `new AxeBuilder({ page }).analyze()` pattern.
- Files fixed: `e2e/accessibility.spec.ts` (lines 1–67)

**Bug 3 — Incorrect label selector (FIXED)**
- Issue: "aria labels and descriptions are present" test used `radio.locator("..").locator("label")` which tries to find a sibling label via parent, but the label is an ancestor wrapping the input.
- Root cause: Wrong traversal direction in the DOM.
- Fix: Changed to `radio.locator("xpath=ancestor::label")` to correctly find the wrapping label element.
- Files fixed: `e2e/accessibility.spec.ts` (line 141)

### Application-Level Accessibility Fix (Fix Loop 2)

**Color-contrast violation in ModeSelector.tsx (FIXED)**
- Issue (loop 1 finding): The mode selector buttons had insufficient color contrast during the CSS transition animation.
- Root cause: The selected/unselected states inverted the light/dark relationship between background and foreground, causing both color channels to interpolate in opposite directions mid-transition, producing a real low-contrast frame (not spurious).
- Fix: Changed selected-pill styling to maintain light-bg/dark-text relationship in both states:
  - Selected: `bg-amber-200` background, `text-amber-900` text, `border-amber-700` border
  - Unselected (unchanged): `bg-white` background, `text-stone-700` text, `border-stone-300` border
  - Result: Both states now light-bg/dark-text; transition interpolates between two already-compliant states without crossing a low-contrast point.
- File fixed: `components/ModeSelector.tsx`
- Verification: Canvas-based sRGB sampling throughout the full CSS transition showed contrast never dropped below 7.3:1 at any sampled frame post-fix.

### New Live-Region Tests Added (Fix Loop 3)

Three new e2e tests added to `e2e/accessibility.spec.ts` to verify R1's hydration-gated announcement fix:

**Test 1: "live region is empty while timer is running"**
- Starts the timer and confirms the live region contains no text while countdown is active.
- Verifies acceptance criterion: "The live region does not announce every second of the countdown."

**Test 2: "live region contains completion text after real in-session completion"**
- Starts a timer, uses `page.clock.fastForward()` to advance 25+ minutes (past focus duration), and confirms the live region contains "Focus complete".
- Verifies acceptance criterion: "Completion is announced to screen readers once, through a polite live region."

**Test 3: "live region stays empty when reloading into already-complete state"**
- Manually sets persisted state to `complete` in localStorage before page load, reloads, and confirms the live region is empty.
- Verifies that no re-announcement occurs on reload of persisted `complete` state, confirming frontend's R1 fix.

**Files touched:** `e2e/accessibility.spec.ts` (added 3 tests at lines 134–223)

### Final Test Results (Full Suite Run — Fix Loop 3)

- **Lint:** 1 warning (pre-existing unused variable in lib/timer/store.test.ts:430, not introduced by QA changes)
- **Typecheck:** PASS (clean)
- **Build:** PASS
- **Unit tests:** PASS (72/72 tests passing)
- **E2E tests:** PASS (33/33 tests passing, including 3 new live-region tests)

### E2E Test Breakdown (33 total)

**Accessibility axe-core tests (8 total) — ALL PASS**:
- ✅ "no axe violations in idle state"
- ✅ "no axe violations in running state"
- ✅ "no axe violations in paused state"
- ✅ "no axe violations in custom mode"
- ✅ "all interactive elements are keyboard accessible"
- ✅ "focus indicator is visible"
- ✅ "aria labels and descriptions are present"
- ✅ "live region for announcements is present and properly marked"

**Live-region announcement tests (3 total) — ALL PASS**:
- ✅ "live region is empty while timer is running"
- ✅ "live region contains completion text after real in-session completion"
- ✅ "live region stays empty when reloading into already-complete state"

**Timer functionality tests (22 total) — ALL PASS**:
- Display formatting, start/pause/resume/reset, mode switching, custom-duration input, clock skew handling, persistence, hydration, keyboard navigation

### Acceptance Criteria Status

✅ **Display** — All 4 sub-criteria PASS
✅ **Start / Pause / Resume / Reset** — All 5 sub-criteria PASS
✅ **Completion** — All 3 sub-criteria PASS (verified: announcement tested via live-region tests)
✅ **Mode switching** — All 4 sub-criteria PASS
✅ **Custom duration** — All 5 sub-criteria PASS
✅ **Timestamp-anchored timing** — All 6 sub-criteria PASS
✅ **Rendering / Hydration** — All 2 sub-criteria PASS
✅ **Accessibility** — All 5 sub-criteria PASS (all tests passing; hydration-gated announcement verified)
✅ **Tooling** — All passing (lint warning is pre-existing, not from QA changes)

### Summary

**Test infrastructure:** All 3 test bugs fixed (loop 1). E2E suite now runs correctly with proper event handling and local axe-core loading. Three new live-region tests added (loop 3) to validate hydration-gated announcement behavior.

**Application code:** 
- Color-contrast violation fixed (loop 2): ModeSelector styling changed to maintain light-bg/dark-text in both selected/unselected states.
- Hydration-gated announcement fixed (loop 3): PomotatoTimer now gates announce effect until `hasHydrated` is true; first post-hydration render seeds `prevStatusRef` without announcing; only subsequent transitions into `complete` trigger announcements. Persisted-state validation strengthened (S1) and repo hygiene improved (S2).

**Test results:** 33/33 e2e tests passing (including 3 new live-region tests). 72/72 unit tests passing. All acceptance criteria met and tested.

**Verdict: PASS** — All acceptance criteria verified and passing. Fix loop 3 complete. Task ready for final review.

## Review Findings

**Verdict: CHANGES REQUESTED.** One required fix (R1); everything else is non-blocking.

### Required
**R1. The completion announcement fires on every reload that lands in `complete`, the opposite of what the Implementation Notes say.** Owners: frontend (fix), qa (test).
- In `components/PomotatoTimer.tsx`, `prevStatusRef = useRef(status)` is set on first client render, before hydration. `skipHydration: true` means that initial status is always `"idle"`. Once `useHydrateTimerStore`'s layout effect rehydrates (and `onRehydrateStorage` may call `completeIfExpired`), status flips to `"complete"`. The announce effect sees `"idle"` → `"complete"` and announces — on every reload of a persisted-complete state, not just on a genuine in-session completion.
- Breaks the "announced once" acceptance criterion and the Implementation Notes' own claim that reloading into an already-complete state does not announce.
- Fix: don't run the transition-announce logic until hydration has finished; on the first post-hydration run, just record `prevStatusRef.current = status` without announcing. Whether "expired while the page was closed" should announce on load is a scope call — ask pm if ambiguous, but write down whatever is decided.
- QA gap to close alongside this: `e2e/accessibility.spec.ts` only checks the live region exists. Add tests for (a) it's empty while running, (b) it says "Focus complete" after a real completion via `page.clock`, (c) it stays empty after reloading a persisted `complete` state.

### Should fix (non-blocking, bundled into this pass)
**S1. Persisted-state validation never runs for current-version data.** Owner: frontend.
- `isPersistedTimerState` in `lib/timer/store.ts` only runs inside `migrate`, which Zustand only calls when the stored version differs from the current one — so malformed/tampered v1 data (e.g. `status: "running"` with `endTimestamp: null`, or an out-of-range `customMinutes`) is merged unchecked and can produce a stuck or nonsense duration.
- Fix: validate in a custom `merge` option, not just `migrate`.

**S2. Repo hygiene.** Owners: frontend / orchestrator.
- `playwright-report/` and `test-results/` aren't in `.gitignore` — a broad `git add` would commit them.
- `public/next.svg`, `vercel.svg`, `globe.svg`, `file.svg`, `window.svg` are unused create-next-app leftovers (including Vercel/Next branding) — delete to avoid shipping third-party branding.

### Nits (optional, not acted on this round)
- N1: `now` can be one tick stale right after `resume()`; corrected by the clamp and the next effect tick, no observed drift risk.
- N2: the clock-tick re-render re-renders sibling components that take no props from it; cheap today, could scope narrower later.
- N3: native radio arrow-key navigation can discard a running countdown in one keystroke with no confirmation — pm accepted no-confirmation mode switching, but flag this for when milestone 3 makes lost progress costlier.
- N4: disabled custom-input text is ~2.4:1, but WCAG 1.4.3 exempts inactive controls — compliant, just dim.
- N5: "Pomodoro Technique" is a registered trademark (Cirillo) — current descriptive use ("Pomodoro focus timer") is low-risk; never use it as a product name.

### Dimension checks (all otherwise clean)
- **Timestamp-anchored timing:** verified — the only `setInterval` (`hooks/use-timer-clock.ts`) just calls `setNow(Date.now())`; `getRemainingMs` is the single derivation point; no stored value is ever decremented.
- **TypeScript:** clean — no `any`, casts are narrowing-after-guard only, typecheck/lint clean (1 pre-existing warning in a test file).
- **Accessibility:** native semantics, proper focus rings, `aria-invalid`/`aria-describedby`/`role="alert"` on the custom-duration error. Only open issue is R1.
- **Contrast fix (loop 2):** confirmed real, not test-specific — the only `transition-colors` in the codebase is the ModeSelector pill, and both its states are now light-bg/dark-text (≥7:1 throughout the interpolation in both directions). No other component inverts light/dark roles between states. Watch for this pattern again in milestone 4 (themes).
- **Performance:** no drift; re-render scope slightly broad (N2) but not a correctness issue.
- **Licensing/branding:** original copy/palette/layout; Geist font is SIL OFL (existing default); no new audio/images. Leftover template SVGs covered in S2.

### Re-review after fix loop 3

**Verdict: APPROVE.** R1 is resolved, S1 and S2 are done, and nothing is blocking.

**R1 (completion announced on reload): resolved.**
- `components/PomotatoTimer.tsx` now waits for `hasHydrated` before announcing. `prevStatusRef` starts as `null`. The first run after hydration only records the current status. An announcement happens only on a later change into `complete`.
- This works because of the order in zustand 5.0.15's `hydrate()`: it applies the merged state, then calls `completeIfExpired(Date.now())`, and only then sets `hasHydrated` to true. So any render where `hasHydrated` is true already has the final status, even if React rendered each update separately. The fix doesn't rely on the batching argument in the Implementation Notes. In practice the updates are batched anyway, because `localStorage` is synchronous and the whole chain runs inside the `useLayoutEffect`.
- Both reload cases stay silent: a stored `complete`, and a stored `running` whose end time passed while the tab was closed. A stored `running` that finishes after the page loads does announce, as it should.
- Strict-mode double effects and remounts are also fine. Before hydration the effect exits early. On a remount after hydration, the first run only records the status.
- Error path: `onRehydrateStorage` still sets `hasHydrated` on error, so the effect can't stay stuck.
- The scope decision (reloading into `complete` does not announce) is written down in the Implementation Notes. It fits the "announced once" criterion. Changing it later is a pm decision.
- Tests: the live-region test that reloads into a stored `complete` state would have failed against the old code, so it guards this fix.

**S1 (validation only in `migrate`): resolved.**
- The `merge` option runs on every load, including when the stored version matches. In zustand 5.0.15 that includes an empty store, where it receives `undefined`, and data that already went through `migrate`.
- If validation fails, `merge` returns `currentState`. That is safe because zustand applies the result with `set(..., true)` and `currentState` is the full store, actions included.
- `isPersistedTimerState` now checks that `customMinutes` is a whole number within range, and that `status`, `endTimestamp` and `pausedRemainingMs` make sense together.

**S2 (repo hygiene): resolved.**
- `.gitignore` now lists `/playwright-report/` and `/test-results/`, and `git check-ignore` confirms both are ignored.
- The five create-next-app SVGs are deleted from the working tree (`git status` shows ` D`). Nothing in `app/`, `components/`, `lib/` or `hooks/` refers to them.
- Note for the commit: the deletions are not staged. Include them (for example with `git add -A public/`) or the Vercel/Next branding stays in the repo.

**New nits (optional, can go in a later task):**
- N6: in `merge`, `{ ...currentState, ...persistedState }` copies every key from storage, not just the five that were checked. Edited `localStorage` could overwrite `hasHydrated` or an action (for example `"start": 1`, which would crash on click). This only affects hand-edited data and is no worse than zustand's default merge, but picking just `mode`, `customMinutes`, `status`, `endTimestamp` and `pausedRemainingMs` would close it. The QA test data itself stores `hasHydrated: true`. That doesn't affect R1, because of the order described above.
- N7: `endTimestamp` and `pausedRemainingMs` are only checked with `typeof === "number"`, so edited values like `NaN` or `Infinity` pass. Adding `Number.isFinite` would fix it. Same edited-data-only risk as N6.
- N8: the new live-region tests read `textContent()` once after a fixed `waitForTimeout(500)` instead of using auto-retrying `expect(locator).toHaveText(...)`. The completion test also calls `page.clock.install()` after the timer has started. Both pass, but they depend on timing. A test that reloads with a stored `running` state whose end time has passed, and checks the region stays empty, would cover the more common real-world reload path.

**Dimension checks (unchanged from the previous review unless noted):**
- Correctness: every acceptance criterion is met, including the completion announcement, which now has e2e coverage.
- TypeScript: no `any`. The new `TimerStatus | null` ref and the `merge` signature type-check, and the only casts narrow values that were already checked.
- Accessibility: one polite `role="status"` live region that stays empty during the countdown and announces once per real completion.
- Performance: the announce effect only depends on `[status, mode, hasHydrated]`, so it doesn't run on each tick. Timing still comes from the stored end timestamp, with no counting of interval ticks.
- Licensing/branding: no new assets, and the third-party branded SVGs are deleted.
