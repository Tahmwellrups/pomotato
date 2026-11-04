---
id: 013
slug: focus-cycle
status: in-progress # draft | in-progress | qa | review | done | blocked
---

# Automatic focus cycle, a four-dot counter, and a customizable Focus length

## Goal
The timer runs a Pomodoro cycle by itself: a finished Focus run switches to a break and starts it, four
finished Focus runs earn the long break, and the cycle then starts over. A four-dot indicator under the
mode row says where in the cycle she is. Custom stops being a mode of its own — the Focus timer carries
the editable duration instead.

## Owner decisions this task implements (settled 2026-10-28, not open)
- **Auto-advance switches the mode *and* starts the next run.** "Switch, then wait for Start" was shown
  and rejected.
- **Only the Focus length is editable** (whole minutes, 1–180, the range `parseCustomMinutes` already
  enforces). Short break stays 5, long break stays 15.
- **Custom is no longer a selectable mode.** Its duration becomes the Focus length.
- Four Focus runs per cycle; the fourth earns the long break. Modelled on Flocus.
- **The active dot pulses only while the timer is actually running; idle and paused get a static outlined
  ring instead.** The owner's "pulsate switching from mute to solid" collided with antislop R-19 and
  `.claude/skills/antislop-ui/SKILL.md`'s "Decorative Status Dot" entry — a dot marking a real state should
  drop the endless pulse — and with task 010's standing constraint that nothing animates while the timer is
  idle. Shown the collision, the owner chose this resolution; **no override was needed.** So there are
  **four painted treatments, not three**: done solid, active-running pulsing, active-idle outlined ring,
  pending muted. The pulse marks a real, transient state, which is the purpose R-19 requires be written
  down — this paragraph is where it is written down.
- **Task 012's frosted surface is the timer panel only** (owner ruling, R-10 dose cap). Every other surface
  on `/` is an opaque token surface. The dots live inside that panel, so they sit on the one translucent
  ground on the page and their contrast figures are image-dependent. That is why group H is gated on 012
  and taken once.

## Product questions settled here (pm's call, so frontend and QA do not re-derive them)

**Cycle reset.** Completing the long break returns the cycle to Focus 1 of 4. That is the only thing that
resets it (criteria 20, 29). Reset does *not*, and no manual "reset cycle" control ships — see Out.

**Where the dots go: the chip row stays, the dot group sits directly beneath it.**
There is no plain "Focus" text today; `components/ModeSelector.tsx` renders four flat text chips over
native radios, and the selected one is carried by `font-bold` plus `--accent-foreground`
(`components/ui/mode-chip.tsx`). With Custom removed there are three. The row **stays** and the dot group
becomes a sibling row immediately below it (criterion 23). Why that and not "replace the chips with one
active-mode label":
- The chip row is the only manual escape hatch out of an otherwise automatic cycle. Once the timer
  advances and starts on its own, a way to say "no, give me the long break now" matters *more* than it did
  when every run was started by hand, not less.
- The chips are native radios with a legend, keyboard operation, a measured non-colour selected cue and
  existing e2e and axe coverage. Turning them into a label plus some other control re-opens all of that for
  a change the owner did not ask for.
- The dots describe the **cycle**, which outlives any one mode — they stay meaningful during a break, when
  no Focus chip is active. Anchoring them to the whole mode row is therefore more truthful than hanging
  them under one chip. The owner's "below the 'Focus' text" is honoured: Focus is the first chip, and the
  group sits directly below the row that holds it.

**The dots are not interactive.** They are a status read-out, not a control: nothing about them is
focusable, clickable or keyboard-reachable (criterion 31). The dot group is `aria-hidden`, and the
position is carried for assistive tech by one visually hidden sentence naming the mode and the position
(criterion 32). **No new live region is added** (criterion 33) — the timer already has one polite
announcer in `components/PomotatoTimer.tsx` and another in `components/TimerControls.tsx`, and a third
firing on every cycle step is noise.

## Data shape / pipeline ordering
**Backend runs first, alone, and only on `lib/db/`.** The coupling is one line:
`lib/db/types.ts:73` declares `export type SessionMode = TimerMode`. Shrinking `TimerMode` to three
values would silently shrink `SessionMode` too, which is data loss in `/stats` (see Risk 1). Backend
decouples the two types; frontend then shrinks `TimerMode`. The two file sets are disjoint
(`lib/db/` vs `lib/timer/` + `components/` + `hooks/`), but the order is not optional.

The persisted timer slice gains one field and goes to version 3. Its shape is settled here:
- the cycle position — **how many Focus runs of the current cycle have completed**, an integer 0–4
  inclusive (4 is a legal resting value: it is what "the long break is owed/running" looks like).
- the Focus length, which is the existing `customMinutes` field repurposed. Frontend may rename the key
  as part of the version-3 migration or leave it; either way criterion 39 pins the migration behaviour.

## Scope

**In**
- Removing Custom as a selectable mode; three chips remain.
- Making the Focus length editable through the existing duration field, now shown in Focus mode.
- Automatic advance with auto-start, on the home route only.
- The persisted cycle position, its version 2 → 3 migration, and validation on both the `migrate` and
  `merge` paths.
- The four-dot indicator with its four painted treatments, its reduced-motion behaviour and its contrast.
- Decoupling `SessionMode` from `TimerMode` so `"custom"` survives as a stored value.
- Updating the tests and e2e specs that assert the four-mode model (criterion 55).

**Out (deferred, do not drift into these)**
- **The frosted-surface token work is task 012.** This task *consumes* those tokens and measures against
  them; it does not change `app/globals.css` palette values. If a dot treatment needs a token that 012 does
  not provide, raise it rather than inventing one.
- The always-visible lower-left task list is task 014.
- **No new preference on `/settings`.** The Focus length lives in the timer store where `customMinutes`
  already is. No "auto-start" toggle, no "cycle length" setting, no "pause after break" preference — a
  cycle of 4 is the owner's number and is a constant in this task.
- **No manual "reset cycle" control.** Completing the long break is the only reset. A mis-held Reset must
  not be able to throw away four Focus runs, and there is no undo; a stuck count of 3 merely brings the
  long break one run early, which is recoverable by letting it run. If this turns out to annoy, it is one
  later task.
- No change to how sessions are logged beyond what Risk 1 requires: same `logRunCompletion` call, same
  one-row-per-completed-run rule, same dedup key.
- Sound or notification on advance (milestone 5/6 own audio; no chime ships here).
- Syncing the cycle between tabs. Last write wins, as today.

## Acceptance Criteria

### A. The mode model
- [ ] 1. The timer's selectable mode type has exactly three values: `focus`, `shortBreak`, `longBreak`.
      A code-level guard asserts the union, so adding a fourth selectable mode fails a test.
- [ ] 2. `/` renders exactly three mode chips, labelled Focus, Short break and Long break. No chip,
      radio, option or label anywhere in the app has the value or text "Custom".
- [ ] 3. `SessionMode` still admits `"custom"`: `SESSION_MODES` is still a four-value list,
      `isSessionMode("custom")` is `true`, `isFocusTypeMode("custom")` is `true`, and
      `StatsSession["mode"]` still includes it. A guard asserts each of these four facts by name, so a
      later cleanup cannot quietly drop the historical value.
- [ ] 4. A pre-existing session row with `mode: "custom"` is still accepted by
      `logCompletedSession` (its validation message still names all four modes) and is still counted as
      focus time by `aggregateStats` — proven with a seeded row, not by reading the types.
- [ ] 5. `fullDurationMs` returns 5 and 15 minutes for the two break modes regardless of the stored Focus
      length, and returns `focusLength × 60000` for `focus`.
- [ ] 6. Selecting a mode manually behaves as it does today: same mode is a no-op (a running countdown
      keeps running); a different mode discards the current run and lands idle at the new mode's full
      duration. It does **not** change the cycle position (criterion 30).

### B. The Focus length
- [ ] 7. The duration field is **present in every mode, including both break modes**, and its value always
      sets the length of the **next** Focus run. Its label names Focus (for example "Focus length
      (minutes)") and does not say "Custom". It is interactive except while a **Focus** run is itself
      `running` or `paused`, which matches `setFocusMinutes`'s existing no-op; a break running does not
      disable it, because the next Focus run has not begun. Changing it during a break does not alter the
      break's own countdown.

      > **Reworded by the orchestrator, 2026-10-28, on an owner ruling.** As first written this said the
      > field was "absent in both break modes". Built that way it left a conspicuous empty gap for 5 or 15
      > minutes of every cycle (frontend reserved the slot so the controls would not jump under the cursor
      > during an unattended auto-advance, which was the right call given the alternative). Caught by
      > looking at the painted page: an empty slot is leftover space, not structural whitespace, which is
      > a Delivery Gate Block 3 failure. The ruling also removes a real loss the original wording caused,
      > since **a break is the natural moment to decide the next Focus length** and hiding the field
      > removed the control exactly when it was most usable. Consequence: criterion 35's no-shift property
      > now holds trivially because the field never leaves, and the reserved-slot `min-h` can go.
- [ ] 8. Accepted values are integers 1–180 inclusive; on a first visit the value is 25 and the display
      reads `25:00`. Empty, `0`, negative, `2.5`, `181` and non-numeric input are all rejected with the
      inline error still wired by `aria-describedby` + `aria-invalid`, and the stored length keeps its
      last valid value.
- [ ] 9. A valid change while Focus is idle or complete updates the display immediately (entering 50
      shows `50:00`).
- [ ] 10. While a Focus run is running or paused the field is disabled via the native `disabled`
      attribute, and an attempted store write is a no-op. The in-progress countdown never changes length.
- [ ] 11. The Focus length persists across reloads and is unaffected by Reset.
- [ ] 12. Changing the Focus length never changes either break duration: with the length at 1, a short
      break still reads `05:00` and a long break `15:00`.

### C. Automatic advance
- [ ] 13. A Focus run that reaches zero switches the mode and **is already counting** without any click:
      to `shortBreak` when fewer than four Focus runs of this cycle have completed, to `longBreak` on the
      fourth. The status observable in the persisted entry is `running`, not `idle` or `complete`.
- [ ] 14. A short break that reaches zero switches to `focus` and starts it. A long break that reaches
      zero switches to `focus` and starts it. Every completed run advances; the cycle is continuous until
      Reset or a manual mode selection stops it.
- [ ] 15. **No drift.** The auto-started run's end timestamp is derived from the *completed run's own
      stored end timestamp* `E`, not from the clock at the moment completion was noticed:
      `endTimestamp - E` equals the next mode's full duration to the millisecond, read from
      `localStorage["pomotato-timer"]`.
- [ ] 16. **No accumulated drift over a whole cycle.** With the Focus length at 1 minute, driving a full
      cycle with a fake clock (focus, short, focus, short, focus, short, focus, long) leaves the long
      break's end timestamp **exactly** 34 minutes (2,040,000 ms) after the first Focus run's start — no
      per-step tolerance, because no step may read the wall clock.
- [ ] 17. The auto-started run gets a **fresh** `runId` (different from the completed run's) and a
      `startedAt` equal to the completed run's `endedAt`, so logged sessions are contiguous and the
      `&runId` dedup key is never reused.
- [ ] 18. Each completed run still produces exactly one `sessions` row with the mode it ran as, and a
      whole cycle produces exactly 8 rows (4 focus, 3 shortBreak, 1 longBreak) with no duplicates.
- [ ] 19. **The chain is bounded to one step.** If the newly derived end timestamp is already in the past
      at the moment it is minted (completion noticed very late), the timer lands **idle** at the new
      mode's full duration instead of completing again and chaining. No sequence of events produces two
      advances from one completion.
- [ ] 20. Completing the long break returns the cycle to Focus 1 of 4: the persisted cycle position is 0,
      three dots read pending and dot 1 reads active.
- [ ] 21. Reset during an auto-started run resets **that run only** — the mode stays where the advance put
      it, idle at its full duration, and the cycle position is unchanged. Reset is still hold-to-confirm
      and `reset()` still leaves the Focus length alone.
- [ ] 22. Pause works on an auto-started run exactly as on a hand-started one (freeze, resume from the
      frozen value), and a paused break does not advance.

### D. The cycle counter
- [ ] 23. Four dots render in one group, as a sibling row **immediately below** the mode chip row and
      above the timer digits. Measured at 1280×800: the vertical gap between the dot group and the chip
      row is smaller than the gap between the dot group and the digits, so proximity groups the dots with
      the mode row.
- [ ] 24. **Four painted treatments, and no fifth.** For a cycle position `p` (0–4):
      - **done** — solid — every dot with index < `p`;
      - **pending** — muted — every dot with index > `p`;
      - **active** — the dot at index `p`, in one of two treatments:
        **active-running**, pulsing between the pending and done colours, **only while the timer status is
        `running`**; and **active-idle**, a static outlined ring (not a pulse, not a solid), whenever the
        status is `idle`, `paused` or `complete`.
      - At `p = 4` all four dots are done and no dot is active.
      A guard asserts that the component paints exactly these four treatments; a fifth is a failure.
- [ ] 25. **The pulse is scoped to a running Focus run.** No dot animates unless the mode is `focus`
      **and** the status is `running`. In `focus` at `idle`, `paused` or `complete`, the active dot shows
      the static ring and the rest are solid or muted. **In either break mode, at any status, no dot is
      active at all**: the Focus runs already completed are solid, the rest are muted, with no ring and
      nothing animating. (Criterion 45 is the frame-level half of this; this one is the painted-state
      half.)

      > **Reworded by the orchestrator, 2026-10-28.** As first written this said the active dot shows the
      > ring "in a break mode of any status", which contradicted criterion 27's step-by-step sequence
      > ("nothing animating, no dot active" after Focus 1 completes). **27 is correct.** The dots count
      > Focus runs, so during a break no Focus run is active and there is nothing for a ring to mark; the
      > ring exists only because R-19 forbids an endless pulse on an idle timer, which is a Focus-mode
      > problem. Frontend implemented 27 and raised the conflict instead of choosing silently, which is
      > why this was caught before QA measured a state the spec disagreed with itself about.
- [ ] 26. The count advances only on a completed Focus run: position becomes `min(position + 1, 4)`. A
      Focus run completing at position 4 keeps the position at 4 and advances to the long break (so a
      manually chosen Focus during an owed long break is defined, not undefined).
- [ ] 27. Sequence check, with the Focus length at 1 minute and a fake clock, asserting the four dots'
      treatments after each step:
      - fresh load, idle Focus → `active-idle, pending, pending, pending`;
      - Start pressed → `active-running, pending, pending, pending`;
      - after Focus 1 completes (short break now running) → `done, pending, pending, pending`, nothing
        animating, no dot active;
      - after Focus 2 → `done, done, pending, pending`;
      - after Focus 3 → `done, done, done, pending`;
      - after Focus 4 (long break running) → `done, done, done, done`;
      - after the long break (Focus running again) → `active-running, pending, pending, pending`;
      - Pause pressed → `active-idle, pending, pending, pending`.
- [ ] 28. The cycle position survives a reload in every state (idle, running, paused, during a break)
      and is readable in `localStorage["pomotato-timer"]` as an integer 0–4.
- [ ] 29. Nothing except a completed Focus run (+1) and a completed long break (→ 0) changes the position.
- [ ] 30. Specifically unchanged by: Reset, a manual mode selection (including selecting Long break at
      position 2 — the run goes idle at `15:00`, the position stays 2, and completing that long break then
      sets it to 0), editing the Focus length, a reload, and a page navigation to `/stats` and back.
- [ ] 31. No dot is focusable, clickable, or reachable by Tab, and clicking one changes no state. Tab
      order through `/` is unchanged from before this task.
- [ ] 32. A visually hidden text node states the position for assistive tech: it names the mode and
      matches `/\b[0-4] of 4\b/` (for example "Focus 2 of 4"), and its text updates when the position
      changes. It is not inside a live region.
- [ ] 33. The number of live regions (`aria-live` or `role="status"`/`role="alert"`) in the `/` tree is
      unchanged from before this task. Nothing new announces.
- [ ] 34. The existing completion announcement survives the advance and names both halves: after a Focus
      run auto-advances, the polite announcer in `PomotatoTimer` reads text containing both the finished
      mode's label and the started mode's label (for example "Focus complete. Short break started."), set
      once, and it is not wiped by the status immediately leaving `complete`.
- [ ] 35. Auto-advance does not move the timer digits. The digits' bounding box top is identical before
      and after an advance from Focus to a break (the duration field appearing and disappearing must not
      shift them), at 1280×800 and at 320 px wide. The dot group's own box does not change size between
      treatments either, so a pulse or ring never nudges the row.

### E. Reload into an expired run
- [ ] 36. **Advance exactly one step, then stop.** A tab whose stored `running` Focus run expired two
      hours ago loads with: the completed run credited once (one `sessions` row, position +1), the mode
      switched to the next mode in the cycle, and the status **`idle`** at that mode's full duration — not
      running, and not replayed through the intervening cycles.
- [ ] 37. After that load the dots reflect exactly one credited completion: +1 done for an expired Focus
      run, position 0 for an expired long break. A long-stale run never produces more than one dot's worth
      of change, and the active dot shows the static ring (the timer is idle).
- [ ] 38. The same rule applies to an expired break: one credited row, mode switched to `focus`, status
      idle. A reload that lands this way announces nothing (the existing hydration gate in
      `PomotatoTimer` still holds).

### F. Persistence and migration
- [ ] 39. The persist version is **3**. A stored version 2 entry migrates without data loss:
      - `mode: "custom"` becomes `focus` and the stored `customMinutes` becomes the Focus length;
      - any other v2 mode keeps its mode and the Focus length becomes the default **25**, because someone
        who never selected Custom never chose that number for Focus;
      - a v2 `running` entry keeps its `endTimestamp`, `runId` and `startedAt`, so the countdown continues
        across the upgrade (for `mode: "custom"` the remaining time is unchanged, since the full duration
        is the same number of minutes);
      - a v2 `paused` entry keeps its frozen remaining value, clamped to the new full duration;
      - the cycle position starts at 0.
- [ ] 40. The version 1 → 3 path still works (a v1 entry is a real possibility in the wild): it keeps the
      v1 → v2 `runId`/`startedAt` behaviour and then applies criterion 39.
- [ ] 41. **Both validation paths handle the new shape.** `migrate` runs only on a version mismatch while
      `merge` runs on every rehydration, and `isVersionOneTimerState`'s `validModes` list is reachable
      from both. The guard that validates **legacy stored shapes** still accepts `"custom"`; the guard
      that validates the **current** shape rejects it. Whichever path a load takes, the store ends with a
      mode that is one of the three selectable ones.
- [ ] 42. A hand-edited current-version entry is rejected and falls back to defaults for each of: a cycle
      position that is not an integer, `-1`, `5`, `NaN`, a missing position field, and `mode: "custom"`.
      Each case is proven to land on the in-code defaults rather than being adopted.
- [ ] 43. No hydration-mismatch error or warning in the browser console on reload in any of: idle,
      running, paused, complete, mid-break, and expired-while-closed.
- [ ] 44. Remaining time is still never counted: no stored value is decremented on a tick, the only
      interval remains `hooks/use-timer-clock.ts` calling `setNow(Date.now())`, and the advance is a
      one-shot transition guarded by status — not per-tick work. Reviewer verifies in code.

### G. Motion and accessibility
- [ ] 45. **Nothing animates when nothing is happening.** With the timer idle (any mode) and after a 1 s
      settle, two frames of the dot region sampled 1 s apart are byte-identical and zero
      `requestAnimationFrame` callbacks fire over that second. Same with a Focus run paused. A running
      Focus run is the positive control for the pulse.
- [ ] 46. The pulse is CSS, not JS: the dot implementation adds no `setInterval`, `setTimeout`,
      `requestAnimationFrame` or `performance.now` (grep guard over the files this task adds or changes,
      the same shape task 010 used).
- [ ] 47. Under `prefers-reduced-motion: reduce` the dot region is static in **every** state, including
      while a Focus run is running: two frames 1 s apart are byte-identical. **The pulse is replaced by
      the active-idle ring treatment, not by nothing** — a reduced-motion user still gets a real cue for
      which Focus run is in progress, and it is a cue that survives greyscale. No third colour is
      introduced for this: the reduced-motion treatment is the same ring already measured in group H.
- [ ] 48. No axe-core violation of serious or critical impact on `/` in: idle Focus, running Focus,
      paused Focus, and mid-short-break, in both themes.
- [ ] 49. Every control on `/` is still keyboard-reachable with a visible focus indicator, the mode radios
      still carry their legend and native checked state, and the selected chip's non-colour cue (weight)
      is unchanged.

### H. Measurement — run once, after task 012's tokens are in place
*(Kept in its own group, and intended to live in its own spec file, so a later token change re-runs these
and nothing else. Per CLAUDE.md "Measurement ordering": do not take this sweep until 012's token set has
landed. Per `.claude/agents/qa.md` cost rule 6, a figure that task 010 or 012 already recorded for the same
token on the same ground may be cited as a confirmed diff rather than re-derived.)*

**The ground, stated once so nobody measures the wrong one:** after task 012's R-10 dose cap, the **timer
panel is the only translucent surface on `/`** — every other surface is an opaque token surface. The dots
sit inside that panel. So their ground is the frosted panel composited over whatever is behind it, which
means the figures are **image-dependent** and must be taken with an uploaded background in play, not on the
flat token.

- [ ] 50. Each painted dot colour measures **≥ 3.00:1** against that ground, in **both themes**, as a
      status indicator under WCAG 1.4.11: **done** (the solid fill), **pending** (the muted fill) and
      **active-idle** (the ring's stroke). The pulse is an interpolation between the pending and done
      colours, so proving both endpoints proves the whole animation — no per-frame sampling is required,
      and the report should say so rather than sampling frames. Every figure is recorded with its
      provenance: the theme, the full-coverage painted pixel as `(r,g,b)`, and the ground. Per the
      2026-10-27 ruling a figure is taken at a fill or stroke's **fully covered** pixel, never its
      antialiasing fringe — a ring with no fully covered pixel at its shipped width is a defect to thicken,
      not a measurement to argue about (DECISIONS 2026-10-27: a 1 px stroke cannot carry a 3:1 boundary on a
      surface that is not pixel-aligned).
- [ ] 51. The adversarial set is **bounded, not enumerated**: no uploaded background, a full-black
      background, and a full-white background. The report states that black and white bound the range for a
      frosted ground and gives the worst figure per theme; intermediate images are not run.
- [ ] 52. The treatments are distinguishable **from each other**, not just from the ground:
      - **done vs pending** — either ≥ 3.00:1 against one another, or a non-colour difference as well
        (filled vs ring, or a size difference of at least 2 px) that survives greyscale;
      - **active-idle ring vs pending** — same rule. The ring's shape (an unfilled outline against a filled
        muted dot) satisfies the non-colour half by construction, but the report must say so explicitly
        rather than leaving it implied, and must confirm the two are still told apart in greyscale.
- [ ] 53. Under `forced-colors: active` all four dots are still visible, and done, pending and the
      active-idle ring are still told apart — so none of those distinctions may be colour-only in that mode
      (system colours flatten and `box-shadow` is dropped, per CSS Color Adjust 1 §3.2; see the open
      `/settings` finding in PLAN.md for what that costs when weight or shadow is the whole indicator).
- [ ] 54. The dot figures are reported in one table in this file, taken from **one capture per theme and
      per background** (one page load, all pixels sampled in a single pass), with the sampler kept in
      `e2e/helpers/` so the next task reuses it.

### I. Test fallout and gates
- [ ] 55. The existing suites that assert the four-mode model are updated, not deleted around:
      `lib/timer/store.test.ts` (selectMode to custom, the `setCustomMinutes` no-op cases, the persisted
      fixtures), `lib/timer/time.test.ts` (`fullDurationMs("custom", …)` and "ignores customMinutes for
      non-custom modes"), `components/TimerControls.test.tsx`, and every e2e spec that reaches the Custom
      chip or the custom-duration field: `e2e/timer.spec.ts`, `e2e/accessibility.spec.ts`,
      `e2e/timer-gauge.spec.ts`, `e2e/timer-surface-tokens.spec.ts`, `e2e/dark-sweep.spec.ts`,
      `e2e/dark-contrast.spec.ts`, `e2e/dark-a11y-console.spec.ts`, `e2e/token-task-surface.spec.ts`,
      `e2e/settings-gauge-style.spec.ts`, `e2e/uploaded-background-legibility.spec.ts`,
      `e2e/uploaded-background-dialog-edge.spec.ts`.
      **`e2e/dark-sweep.spec.ts` needs care**: it measures the *disabled* custom-duration field, a surface
      that still exists but is now reached by starting a Focus run instead of selecting a Custom chip. The
      measurement must survive, not be dropped with the chip.
- [ ] 56. Any guard that enumerates a task's new files (the `NEW_FILES` pattern in
      `components/background.guards.test.ts`) either covers this task's new files or is explicitly noted
      as not covering them. A guard scoped to one task's file list silently stops guarding — see PLAN.md
      Maintenance.
- [ ] 57. No assertion added by this task is phrased as a diff against `HEAD`, `git diff`, or "unchanged
      from the previous commit". Those invert the moment the work is committed (PLAN.md Maintenance).
- [ ] 58. `npm run lint`, `npm run typecheck`, `npm run build`, `npm run test` and `npm run test:e2e` all
      succeed. No `any` in new code.
- [ ] 59. A `docs/DECISIONS.md` entry records the settled rules a later task would otherwise re-ask:
      symmetric auto-start, Reset scoping to the current run, the long break as the only cycle reset, the
      chip row surviving with the dots beneath it, the dots being non-interactive, the four dot treatments
      with the pulse scoped to a running timer (and the R-19 reasoning behind it), and the one-step rule
      for an expired reload. *(Owned by the orchestrator, which lands docs; neither frontend nor backend
      edits `docs/`.)*

## Files likely touched
- `lib/db/types.ts` — **backend, first.** `SessionMode` stops aliasing `TimerMode` and becomes its own
  four-value union including `"custom"`.
- `lib/db/session-modes.ts` — keeps `SESSION_MODES`, `isFocusTypeMode` and `isSessionMode` on the stored
  union; comments updated to say why `"custom"` persists after the timer stopped producing it.
- `lib/db/session-repository.ts` — the validation message naming the four modes stays accurate.
- `lib/timer/types.ts` — `TimerMode` shrinks to three; the persisted interface gains the cycle position.
- `lib/timer/constants.ts` — the Focus-length bounds and default (today's `CUSTOM_MINUTES_*` /
  `DEFAULT_CUSTOM_MINUTES`), plus the cycle length of 4.
- `lib/timer/time.ts` — `fullDurationMs` loses the `custom` branch and `focus` gains the stored length;
  `parseCustomMinutes` keeps its 1–180 rule.
- `lib/timer/labels.ts` — the `Custom` label goes; `MODE_LABELS` is keyed by the three-value union.
- `lib/timer/store.ts` — version 3, the migration, the two validation paths, the cycle position, and the
  advance transition inside `completeIfExpired` (or wherever completion is finalised).
- `lib/timer/log-completion.ts` — only if the advance needs the completed run's end timestamp threaded
  differently; the logging contract itself does not change.
- `components/ModeSelector.tsx` — three chips.
- `components/CycleDots.tsx` *(new)* — the four-dot group, its four treatments, and the hidden position
  sentence.
- `components/CustomDurationInput.tsx` — now the Focus-length field: relabelled, shown in Focus mode.
- `components/PomotatoTimer.tsx` — renders the dot group, shows the field for `focus`, and widens the
  completion announcement to name the started mode.
- `hooks/use-hydrate-timer-store.ts`, `hooks/use-timer-clock.ts` — only if the one-step reload rule needs
  it; the no-counting rule in criterion 44 is binding on both.
- `components/ui/mode-chip.tsx` — only if the row's spacing changes; the selected cue must not.
- Test files (`*.test.ts(x)`, `e2e/**`) — QA's, per criterion 55.

## Risks
1. **Dropping `"custom"` from the stored union is silent data loss.** `lib/db/types.ts:73` currently aliases
   `SessionMode` to `TimerMode`, so shrinking the timer's union shrinks the session union with it —
   `SESSION_MODES` would stop validating a mode that rows already carry, `isFocusTypeMode` would stop
   counting those rows as focus, and `/stats` would quietly lose focus time it used to show. The union that
   shrinks is the timer's *selectable* mode; the *stored* one does not. Criteria 1, 3 and 4 pin both halves.
2. **Drift.** Anchoring the next run on `Date.now()` at the moment completion is noticed loses the tick
   latency on every step, and the loss accumulates over four Focus runs and four breaks. The anchor must be
   the completed run's own stored end timestamp. Criteria 15 and 16; criterion 16 deliberately allows no
   tolerance, because a correct implementation has no rounding to forgive.
3. **A long-stale reload could replay history.** `onRehydrateStorage` already calls
   `completeIfExpired(Date.now())`; with advance plus auto-start, a tab closed for two hours could chain
   through several whole cycles on load, fabricating `sessions` rows and incrementing the pinned task's
   `completed` several times. Settled: advance exactly one step and stop, idle (criteria 36–38). Criterion
   19 applies the same bound to the live path.
4. **A timer that never stops on its own.** Symmetric auto-start means the cycle runs until Reset or a
   manual selection. That is what the owner's "it should switch automatically" and the Flocus reference
   imply, and it is one state machine instead of two coupled ones — but it does mean a Focus run can start
   while she is away from the desk after a break, and sessions keep being logged. The cheap future
   mitigation, if it annoys, is one preference key ("stop after a break"), which is additive and does not
   reopen this shape. Flagged rather than hedged.
5. **Motion while idle.** Task 010 criterion 28 set a standing constraint of zero `requestAnimationFrame`
   with the timer idle, and antislop R-19 / the "Decorative Status Dot" entry say a state dot should not
   pulse forever. Both are satisfied by the owner's ruling: the pulse exists only while the status is
   `running`, and idle/paused get the static ring (criteria 24, 25, 45–47).
6. **A fourth treatment is a fourth thing to measure.** The ring buys reduced-motion users a real cue
   instead of nothing, which is why it was taken — but it adds a third painted colour to group H and a
   second "told apart from each other" pair. That is the accepted cost, and it is bounded: criterion 50
   proves the pulse from its two endpoints rather than per frame, so three colours and two pairs is the
   whole sweep.
7. **Contrast against a ground that is moving under us, and that is translucent.** Task 012 replaces the
   ground these dots sit on, and after the R-10 dose cap the timer panel is the *only* translucent surface
   on `/` — so the dots are the one indicator on the page whose figures depend on an uploaded image.
   Measuring before 012 lands means measuring twice, which is exactly what cost task 010 two of its three
   expensive rounds. Group H is gated on 012 and separated from the behaviour groups so a token change
   re-runs only it.
8. **Migration surprise on the Focus length.** Carrying `customMinutes` onto Focus unconditionally would
   silently give a 50-minute Focus to someone who set 50 for Custom months ago and has used Focus at 25
   ever since. Criterion 39 carries it only when the stored mode actually *was* Custom.
9. **Layout shift mid-cycle.** The Focus-length field appears and disappears as the mode advances, with
   nobody touching the keyboard, and the dot treatments differ in shape. Criterion 35 pins both the digits'
   position and the dot group's box so an unattended advance does not make the page jump.
10. **Licensing / assets.** None. Four dots are CSS; no audio, font or image is introduced. If any asset
    is considered, it must be original or CC0 with provenance in `docs/DECISIONS.md` — and no chime ships
    here regardless (milestone 5 owns audio).
11. **Test-suite blast radius.** Eleven e2e specs and three unit suites reach the Custom chip or the
    custom-duration field. They are enumerated in criterion 55 so QA inherits a list rather than
    discovering the fallout one red run at a time; `e2e/dark-sweep.spec.ts`'s disabled-field measurement is
    the one that must be re-routed rather than removed.

## Implementation Notes
(Filled in by frontend/backend as they build. Decisions, tradeoffs, anything the next agent needs to know.)

### Backend (data layer) — done, frontend next

**Type split, and why this direction.** `SessionMode = TimerMode | LegacySessionMode` (`LegacySessionMode = "custom"`), in `lib/db/types.ts`. Chosen over an independent four-value `SessionMode` because the stored union must always be a superset of what the timer can produce: a new selectable mode becomes loggable automatically, and shrinking `TimerMode` can never remove `"custom"`, since it is named explicitly. `lib/db/session-modes.ts` additionally keys an exhaustive `Record<SessionMode, true>` and derives `SESSION_MODES` from it, so dropping `"custom"` from the union or the list fails typecheck. Likewise `lib/timer/modes.ts` has `TIMER_MODES` (exactly three) from an exhaustive `Record<TimerMode, true>`, plus `isTimerMode`. `isSessionMode("custom")`, `isFocusTypeMode("custom")` stay true; the repository's validation message is unchanged. Criterion 4 needs no repo change (it already runs on `SessionMode`).

**Renames (frontend must follow).**
- store/persisted field `customMinutes` -> `focusMinutes`; action `setCustomMinutes` -> `setFocusMinutes` (no-op while a Focus run is running or paused; also ignores a non-integer or out of 1-180 value).
- `parseCustomMinutes` -> `parseFocusMinutes`, `FocusMinutesResult`.
- constants: `DEFAULT_CUSTOM_MINUTES` / `CUSTOM_MINUTES_MIN/MAX` -> `DEFAULT_FOCUS_MINUTES` / `FOCUS_MINUTES_MIN/MAX`; the old fixed `FOCUS_MINUTES` is gone; new `CYCLE_LENGTH = 4`.
- `fullDurationMs(mode, focusMinutes)`: focus = `focusMinutes * 60000`, breaks fixed 5 and 15.
- `MODE_LABELS` has three keys.

**New persisted field.** `cyclePosition: number`, integer 0-4, in `PersistedTimerState`. Persist version is 3.

**Pure helper.** `lib/timer/cycle.ts` `nextCycleStep(completedMode, position) -> { nextMode, nextPosition }`. Focus: position = min(p+1, 4), long break when it reaches 4 else short. Short break: back to focus, position unchanged. Long break: focus, position 0.

**Advance (`completeIfExpired(now)`).** One-shot, guarded by `status === "running"`, no per-tick work. Credits the run (same `logRunCompletion`, same runId dedup), then sets the next mode and cycle position in the same `set`. `nextEnd = completedEndTimestamp + fullDurationMs(nextMode)`; never reads the wall clock for the anchor. If `nextEnd > now`: `status: "running"`, fresh `runId`, `startedAt = completed end`. Otherwise (one-step bound, criteria 19 and 36-38): `idle` at the next mode, no run. The cycle's status never rests at `complete` via this path; `start()` still accepts `complete` for hand-edited or legacy state. Reload uses the same function, so an expired run advances exactly one step.

**New non-persisted store field for the announcer (criterion 34).** `lastAdvance: TimerAdvance | null` where `TimerAdvance = { completedMode, nextMode, started, endedAt }` (exported from `lib/timer/store.ts`). Set by every advance; `endedAt` is unique per advance so it works as a change key. It is cleared in `onRehydrateStorage` after the reload advance, so a reload announces nothing. Frontend builds "Focus complete. Short break started." from it (use `started` to choose the wording when it landed idle).

**Reset.** `reset()` clears the current run only; `focusMinutes` and `cyclePosition` untouched. `selectMode` does not touch `cyclePosition`.

**Migration.** v1 runs `migrateVersionOne` then `migrateVersionTwo`; v2 runs `migrateVersionTwo`; v3 is validated and passed through; anything malformed returns defaults. v2 -> v3: `custom` becomes `focus` with `customMinutes` as `focusMinutes`; any other mode keeps its mode and gets 25. Running keeps `endTimestamp`/`runId`/`startedAt`; paused keeps its frozen value clamped to the new full duration; `cyclePosition` 0. A legacy custom run's v1 `runId` is still derived from the stored mode `"custom"`, so the dedup key matches what an old build would have written.

**Two validation paths (criterion 41).** Legacy guards `isVersionOneTimerState` / `isVersionTwoTimerState` accept `"custom"` and `customMinutes`, and are reachable only from `migrate`. `isPersistedTimerState` (current shape) uses `isTimerMode`, so rejects `"custom"`, and requires `focusMinutes` 1-180 integer and `cyclePosition` an integer 0-4; it runs in `migrate` at v3 and on every `merge`. A bad current entry falls back to defaults.

**Known test fallout (qa's, not touched).** `lib/timer/store.test.ts` and `lib/timer/time.test.ts` use the old names and `"custom"` (22 failures, listed under criterion 55). `components/background.guards.test.ts` "lib/timer ... have an empty diff against HEAD" now fails because `lib/timer` changed; that is a HEAD-diff assertion of the kind criterion 57 forbids, and qa must retire or re-point it. The two 012 failures are unchanged.

**Frontend typecheck inheritance.** After this change `npm run typecheck` is red only in `components/` and in the two timer test files; `lib/` and `lib/db` are clean, `npm run lint` has 0 errors.

### Frontend (UI half)

**Files.** New `components/CycleDots.tsx`. Changed `components/ModeSelector.tsx` (chips come from `TIMER_MODES`, three), `components/PomotatoTimer.tsx`, `components/CustomDurationInput.tsx`, `app/globals.css` (a `.cycle-dot` block appended; no custom property added, no palette value changed).

**Focus-length field: kept at the old path, renamed inside.** The file is still `components/CustomDurationInput.tsx` because three passing unit suites (`TimerSurface.tokens.test.ts`, `token-foundation.test.ts`, `palette.tokens.test.ts`) list it by path and I may not edit them; qa should rename the file when it re-points them. The export is now `FocusLengthInput`, the label is "Focus length (minutes)", and the ids are `focus-length` / `focus-length-error` (were `custom-duration`), so the e2e selectors in criterion 55 move too.

**Field in every mode (owner ruling, criterion 7 reworded).** The field is always rendered and always sets the next Focus run's length. It is `disabled` only when `mode === "focus"` and status is `running` or `paused`, the same condition `setFocusMinutes` no-ops on; a running or paused break leaves it interactive and the break's own countdown is untouched (the display length comes from `fullDurationMs(mode)`). The earlier reserved `min-h-[4.25rem]` slot is gone; its position in the stack is unchanged, so auto-advance moves nothing (criterion 35 holds trivially). Verified with a throwaway Testing Library check (deleted afterwards): disabled for focus running and paused, enabled for focus idle, short break running and paused, and a write during a break lands in the store.

**Hand-off for qa (required).** `components/CustomDurationInput.tsx` must be renamed to `components/FocusLengthInput.tsx` (the export is already `FocusLengthInput`; the old name contradicts it). The rename means updating the path in `components/TimerSurface.tokens.test.ts` (lines 40, 94), `components/token-foundation.test.ts` (122) and `components/palette.tokens.test.ts` (85), plus the one import in `components/PomotatoTimer.tsx`, which I will not change until the tests move. The input id changed `custom-duration` to `focus-length` and the error id to `focus-length-error`; every e2e spec in criterion 55 that selects `input[id="custom-duration"]` needs the new id.

**Dots.** Placed in a `gap-1` wrapper with the chip row, inside the existing `gap-8` stack, so dots-to-chips is far smaller than dots-to-digits (criterion 23). Group is `aria-hidden`; one `sr-only` `<p>` (not a live region) carries the position. Every dot is one 16 px box with a 2 px border in all four treatments, so the group never changes size (criterion 35). Colours are existing tokens only: done and ring stroke `--accent-foreground`, pending fill `--control-border`. Pending is also smaller (4 px transparent border, padding-box background) and the ring is unfilled, so the differences survive greyscale. Forced colours use `CanvasText`/`GrayText`/`Canvas` and no animation; size and fill carry the difference.

**Motion purpose (R-19, R-31).** The pulse (CSS keyframes, 1.6 s, pending colour to done colour, `.cycle-dot[data-treatment="active-running"]`) marks one real transient state, a Focus run counting down. It exists only when `status === "running"`; idle and paused paint the static ring. `prefers-reduced-motion` sets `animation: none` and the transparent fill, which is exactly the ring: no new colour (criterion 47). No glow, no JS timers in the dot file (criterion 46).

**Break modes paint no active dot.** Criterion 27 ("short break running: done, pending, pending, pending ... no dot active") and criterion 25's wording ("in a break mode ... the active dot shows the static ring") disagree; I followed 27 because it is the concrete sequence. During a break, dots below the position are done and the rest pending. qa: criterion 25 as worded would assert a ring in a break and fail; it needs re-wording or a ruling.

**Reachable state: `mode === "focus"` with `cyclePosition === 4`** (long break skipped via the chip row; reset and selectMode leave the position alone). Rendered as four done dots, no active dot, no ring and no pulse even while that Focus run is running. Reason: four Focus runs really are done, and a fifth dot does not exist. The index is never out of range; nothing silently disappears. The hidden sentence there reads "Focus, 4 of 4 runs done, long break owed", which is accurate (it matches `/\b[0-4] of 4\b/` and says why). Other sentences: Focus at position p<4 is "Focus {p+1} of 4"; a break is "Short break, {p} of 4 focus runs done". qa should test the position-4 Focus state.

**Announcer (criterion 34).** The existing polite `<p role="status">` in `PomotatoTimer` is widened, no region added. A second effect reads the store's `lastAdvance`, dedupes on its `endedAt`, and sets "Focus complete. Short break started." ("... Short break ready." if it landed idle under the one-step bound). The old "wipe when leaving complete" branch is removed so nothing erases it. The text is emptied after 10 s so the next advance, which often reads identical words, changes the live-region text and is announced again. Reloads announce nothing because the store clears `lastAdvance` before `hasHydrated` flips. The status-based "X complete" path is kept for a persisted or hand-edited `complete`.

**Gates.** Lint 0 errors. Typecheck errors remain only in `lib/timer/store.test.ts` (18) and `lib/timer/time.test.ts` (5). Not run: e2e, build, a live keyboard/mobile pass in a browser; the layout reasoning (320 px: dots row is 76 px wide, the field slot is full-width) is from the code.


## QA Report
(Filled in by qa, 2026-10-28. Group H was measured in the same single sweep as 012 group D; see 012's QA Report for the sampler and the Start-row method note.)
- Verdict: **FAIL**
- Failing or unmet: 4 (no test added), 11 (no reload test for focus length), 46 (literal file scope: `components/PomotatoTimer.tsx:81` has a one-shot `setTimeout`), 49 (visible focus not re-checked), 52 (greyscale not run), 53 (forced colours not run), 55 (87 e2e failures remain, including the dark-sweep disabled-field measurement), 58 (`test:e2e` not green). Not measured in this pass: 59 is the orchestrator's DECISIONS entry and was not verified.
- Tree and gates: as in 012's report. Unit: 36 files, **1065 passing**, 0 failing. Typecheck **0**. Lint **0 errors, 20 warnings**. Build exit 0, routes exact. E2E (scratch :3100): **569 passed, 87 failed, 2 skipped** of 658.

### Criteria
A. Mode model
1. PASS. `TIMER_MODES` is exactly `focus, shortBreak, longBreak`; an exhaustive `Record<TimerMode, true>` fails typecheck on a fourth mode (`components/focus-cycle.guards.test.ts`).
2. PASS. `ModeSelector` renders three radios, Focus / Short break / Long break; no `value="custom"` and no "Custom" text in app source (guard and `components/FocusLengthInput.test.tsx`).
3. PASS. `SESSION_MODES` is four values including `custom`; `isSessionMode("custom")` and `isFocusTypeMode("custom")` are true; `StatsSession["mode"]` includes `"custom"` (guard).
4. NOT COVERED. No seeded `custom` row was added to a test through `logCompletedSession` and `aggregateStats`. `lib/stats/aggregate.test.ts` carries a `custom` fixture but was not re-verified against this criterion. Gap, not a pass.
5. PASS. `fullDurationMs` gives 5 and 15 minutes for the break modes at any stored Focus length, and `focusLength * 60000` for Focus (`lib/timer/time.test.ts`).
6. PASS. Same mode is a no-op while running; a different mode discards the run and lands idle; the cycle position is unchanged (`lib/timer/focus-cycle.test.ts`).

B. Focus length
7. PASS (reworded version tested). The field is present in every mode; disabled only for a Focus run that is running or paused; a write during a break lands and leaves the break's end unchanged (`components/FocusLengthInput.test.tsx`). Label "Focus length (minutes)"; id `focus-length`.
8. PASS. Initial value 25; `""`, `0`, `-3`, `2.5`, `181`, `abc` rejected with `aria-invalid`, `aria-describedby` and the error text; the stored value keeps its last valid entry. The `25:00` display itself is not asserted by a unit test.
9. PASS (store). Entering 50 sets the store to 50. The `50:00` display text is not asserted.
10. PASS. `setFocusMinutes` is a no-op during a Focus run that is running or paused; the field is `disabled`.
11. NOT COVERED. Focus-length persistence across a reload is not asserted (the cycle position is: criterion 28). Gap.
12. PASS. Break durations are independent of the Focus length (`fullDurationMs`). The on-screen `05:00` is not asserted.

C. Automatic advance
13. PASS. A Focus run reaching zero is already `running` as a break (`lib/timer/focus-cycle.test.ts`, and `focus-cycle.spec.ts` with a 1-minute run and a fake clock).
14. PASS. Break to Focus auto-starts; Focus to break auto-starts (unit, and the 8-run cycle).
15. PASS. `endTimestamp - E` equals the break's full duration exactly; read from `localStorage["pomotato-timer"]` (unit).
16. PASS. Eight steps, each completion noticed 1.5 s late: the long break's end is exactly `T0 + 2,040,000` ms, no tolerance (unit).
17. PASS. Fresh `runId`; `startedAt` equals the completed run's `endedAt` (unit).
18. PASS. A cycle logs exactly 8 rows (4 focus, 3 shortBreak, 1 longBreak) with 8 unique runIds (unit, `logRunCompletion` mocked).
19. PASS. A break whose derived end is already past lands idle (unit).
20. PASS. Completing the long break sets the position to 0 and starts Focus 1 of 4 (unit).
21. PASS. Reset during an auto-started run leaves the mode, the position and the Focus length (unit).
22. PASS. Pause and resume work on an auto-started break; a paused break does not advance (unit).

D. Cycle counter
23. PASS. Dot group sits between the chip row and the digits; gap above is smaller than gap below at 1280x800 (`focus-cycle.spec.ts`).
24. PASS. Four treatments across every mode, status and position; `CycleDots.test.tsx` asserts that only the four appear.
25. PASS (reworded version tested). Dots pulse only in a running Focus run; in a break, no dot is active at any status.
26. PASS. Position is `min(p+1, 4)`; Focus at 4 keeps 4 and advances to the long break (unit).
27. PASS. The sequence of eight treatments, asserted at each step (`CycleDots.test.tsx`).
28. PASS. Integer 0 to 4 in `localStorage`; survives a rehydrate in idle, running and paused, at version 3 (unit).
29. PASS. Only a completed Focus run (+1) and a completed long break (to 0) change the position (unit).
30. PASS. Reset, manual selection (including Long break at position 2), Focus-length edit and pause/resume leave the position alone. Navigation to `/stats` and back is not tested.
31. PASS (no focusable element; click is a no-op). Tab order through `/` not re-measured.
32. PASS. The hidden sentence matches `/\b[0-4] of 4\b/`, updates with the position, and is not a live region.
33. PASS. The live-region set in the `/` tree is pinned by value and matches (guard).
34. PASS. The announcer reads "Focus complete. Short break started." after an advance (`focus-cycle.spec.ts`).
35. PASS. Digits top identical before and after an advance at 1280x800 and 320x700; the dot group's box does not change size (`focus-cycle.spec.ts`).

E. Reload into an expired run
36. PASS. A Focus run expired two hours ago: one `sessions` row, position +1, mode switched, idle (unit, and an IndexedDB count of 1 in `focus-cycle.spec.ts`).
37. PASS (unit). Expired long break gives position 0 and idle. The ring state after reload is not asserted.
38. PASS. Expired break: one row, Focus, idle, and no announcement (unit and e2e).

F. Persistence and migration
39. PASS. Version 3; v2 custom becomes focus with `customMinutes` as the Focus length; other v2 modes get 25; running and paused runs carry over with the paused value clamped; position 0 (unit, `migrate` called directly).
40. PASS. v1 to v3 path (unit).
41. PASS. The legacy guard accepts `custom` on migrate; the current guard rejects it on merge; the store ends on a selectable mode (unit).
42. PASS. Six hand-edited cases (fractional, -1, 5, NaN, missing, `custom`) fall back to the defaults (unit, `it.each`).
43. PASS (e2e, five states: idle, running, paused, complete, mid-break). No hydration message is logged. Expired-while-closed is covered by 36 but not in the console check.
44. PASS. The only interval is `hooks/use-timer-clock.ts`'s one `setNow(Date.now())` tick; no store path decrements a stored value (guard).

G. Motion and accessibility
45. PASS. Idle: two region frames one second apart are byte-identical, and zero rAF callbacks fire. Positive control: a running Focus run changes the region between frames (`focus-cycle.spec.ts`).
46. **FAIL (literal).** The grep guard over the dot implementation files passes: `CycleDots.tsx`, `Surface.tsx`, `FocusLengthInput.tsx`, `ModeSelector.tsx`, `lib/timer/cycle.ts`, `lib/timer/modes.ts`. But the literal scope is "files this task adds or changes", and `components/PomotatoTimer.tsx:81` has `window.setTimeout(() => setAnnouncement(""), ANNOUNCEMENT_CLEAR_MS)`, a one-shot clear that this task added. It does not drive the pulse or a per-tick path. **Raised for a ruling on scope; not fixed.**
47. PASS. Under `prefers-reduced-motion: reduce`, with a Focus run running, the region is byte-identical across one second. The ring cue is asserted by the `active-running` attribute, not by its painted ring (not visually checked).
48. PASS. axe-core: no serious or critical violation on `/` in idle, running, paused and mid-break, in both themes (`focus-cycle.spec.ts`, 8 runs).
49. **FAIL (incomplete).** The legend and the native checked state are asserted (`FocusLengthInput.test.tsx`). Keyboard reachability and the visible focus indicator on the mode radios were not re-run.
50. PASS. Each dot figure is >= 3:1 in both themes against its own ground, sampled in one capture per (theme, image, viewport). Frosted ground, bounded set: worst per theme in the table below. The pulse endpoints are the pending and done colours, measured.
51. PASS. Bounded set: no image (done dot only), black, white, and split (extra). Black and white are the two images run for the frosted ground; no intermediate image was run.
52. **FAIL (incomplete).** Done vs pending: each is >= 3:1 against the ground, but not against each other. The non-colour difference (filled 16 px dot vs smaller, transparent-bordered pending dot) holds by construction, but a greyscale check was not run. Ring vs pending: unfilled ring against a filled muted dot, shape-based by construction; greyscale not run.
53. **FAIL (incomplete).** Forced colours not exercised in this pass.
54. PASS. The table is taken from one capture per (theme, image, viewport). The sweep uses `paintedColours` from `e2e/helpers/background.ts`; the new `e2e/helpers/surface-sampler.ts` is a plain-screenshot variant kept for the next task.

H. Measurement (group H, frosted ground, worst across white, black and split)
| Treatment | Light, 1280 and 320 | Dark, 1280 and 320 | No image, light / dark |
|---|---|---|---|
| done (solid fill) | 6.980 (black), fill `120,53,15` | 9.696 (split), fill `251,213,146` | 7.305 / 11.606 |
| pending (muted fill) | 3.511 (black), fill `122,117,111` | 3.234 (white), fill `138,121,104` | not measured |
| active-idle (ring stroke) | 6.980 (black), stroke `120,53,15` | 9.696 (split), stroke `251,213,146` | not measured |
Each figure is a full-coverage pixel, against the worst ground pixel in a 6 px ring around its own dot (the dots' gap is 12 px, so the rings do not touch a neighbour). Pending and ring figures for no-image were not measured.

I. Test fallout and gates
55. **FAIL.** Updated: `lib/timer/store.test.ts`, `lib/timer/time.test.ts`, `components/background.guards.test.ts`, `components/BackgroundLayer.test.tsx`, the e2e helper and the listed specs' selectors and Custom flows. Not green: 87 e2e tests still fail across 18 files, including `settings-gauge-style` (36), `sessions` (10), `dark-a11y-console` (8), `timer-gauge` (4), `dark-contrast` (2, the disabled custom-field measurement), and `dark-sweep` (1, the disabled focus-length field, which is the measurement the spec says must survive). `components/TimerControls.test.tsx` passes unchanged.
56. PASS. `components/focus-cycle.guards.test.ts` explicitly covers this task's new files (`CycleDots.tsx`, `cycle.ts`, `modes.ts`, `Surface.tsx`, `FocusLengthInput.tsx`). `components/background.guards.test.ts`'s `NEW_FILES` list is not extended; that list stays scoped to 010.
57. PASS for assertions added by 013 (none is a HEAD diff). Other HEAD-diff assertions from 010 remain and are reported under 012.
58. **FAIL.** `npm run test:e2e` is not green (87 failing). Lint, typecheck, build and unit tests pass. No `any` in new code (grep).
59. NOT VERIFIED. The `docs/DECISIONS.md` entry is the orchestrator's.

### Group H is measured, but the dot treatments are the group's only image-dependent figures
Frosted ground only; the header is solid, so no header figure belongs in group H. The dots sit inside the frosted panel, so all their ground figures come from the sweep (white, black, split), in both themes, at both viewports.

### Red-proof (unit level, scratch copy)
- Criterion 16 (drift): in a scratch copy of the tree, `store.ts` anchored the next end on `now` instead of the completed run's stored end. The focus-cycle suite went **red** on criteria 13, 15, 16, 17 and 36-37 (five tests). Restored: 30 of 30 pass. Level: unit.
- Criteria 26, 27 and 42 were not broken and restored.

### Verdict basis for the orchestrator
013 is not done: the e2e suite is not green, and criteria 4, 11, 46, 49, 52, 53, 55 and 58 are unmet or not covered. Criterion 46 needs a scope ruling. The rest of the behaviour, the cycle model, the migration, the dot treatments and group H are measured and passing.

## Review Findings
(Reviewer, 2026-10-29, read-only; appended by the orchestrator on its behalf.)
- Verdict: **APPROVE.** Nothing in 013's own change set blocks landing. All eight findings
  are non-blocking; finding 1 is a pre-existing trap that must be settled before 014.
- Gates re-run by the reviewer: `npm run typecheck` exit 0; `npm run lint` 0 errors /
  20 warnings (all pre-existing, in `e2e/`); `vitest run` over `lib/timer`, `CycleDots`,
  `FocusLengthInput`, `focus-cycle.guards`, `lib/db` — 12 files, 316 tests passing.

### The five areas the review was asked to verify
1. **Timer invariant (criteria 15, 16, 19, 36-38, 44): correct in code.**
   `lib/timer/store.ts:234-264` returns early unless `status === "running" && endTimestamp
   !== null && now >= endTimestamp`, so the advance is a one-shot guarded by status with no
   per-tick work. The next end is anchored on `endTimestamp + fullDurationMs(...)` (line
   243) — the completed run's own stored end, **never `now`**, which is the drift bug QA's
   criterion 16 red-proof caught. `started = nextEnd > now` bounds the chain to one step;
   `startedAt: started ? endTimestamp : null` keeps logged runs contiguous; a fresh
   `crypto.randomUUID()` keeps the `&runId` dedup key unreused. Reload credits exactly one
   row: `onRehydrateStorage` (`store.ts:311-324`) calls it once, and a StrictMode re-entrant
   rehydrate is a no-op, with the `&runId` unique index as backstop.
2. **Mode union (criterion 1): genuinely closed.** `lib/timer/modes.ts` derives
   `TIMER_MODES` from an exhaustive `Record<TimerMode, true>`; the `Object.keys(...) as
   TimerMode[]` cast cannot widen it, since a missing or extra key each fail typecheck.
   `SessionMode = TimerMode | LegacySessionMode` is layered, not aliased, so shrinking
   `TimerMode` can never drop `"custom"`.
3. **Dots / announcements: no second live region, no per-render announce.** The dot row is
   `aria-hidden` plus one non-live `sr-only <p>`; nothing is focusable or clickable. The
   advance reuses the single existing `role="status"` and is deduped on
   `lastAdvance.endedAt` via a ref (`PomotatoTimer.tsx:72-83`).
4. **`CustomDurationInput.tsx` deletion: clean.** No surviving import, constant, label or
   chip text; `MODE_LABELS` lost its `custom` key.
5. **Migration: safe for existing rows.** v1->v2->v3 is correct; `migrateVersionTwo`
   (`store.ts:162-180`) carries `customMinutes` onto the Focus length **only** when the
   stored mode really was `"custom"` (Risk 8 honoured), preserves `endTimestamp`/`runId`/
   `startedAt` for a running entry, clamps a paused frozen value, and starts
   `cyclePosition` at 0. The legacy guards accept `"custom"` and are reachable only from
   `migrate`; `isPersistedTimerState` rejects it on every `merge`. **013 changes only the
   zustand/localStorage persist version — the Dexie schema is untouched.**

### Numbered findings
1. **`lib/db/database.ts:56` — the pinned Dexie version block is still there. MEDIUM,
   pre-existing, not 013's.** `this.version(CURRENT_SCHEMA_VERSION)` is still pinned to the
   moving constant, exactly as `docs/PLAN.md:266-270` records. 013 does not worsen it (no
   schema change), but **014 bumps to 4**: the moment the constant changes, this block
   silently renumbers 3 -> 4, version 3 stops being declared, and if 014 adds its own
   `.version(4)` Dexie throws on a duplicate version number. **Fix before 014's bump** —
   declare the literal `.version(3)` and add the guard that the highest declared literal
   equals `CURRENT_SCHEMA_VERSION`.
2. **`components/FocusLengthInput.tsx:21` + `PomotatoTimer.tsx:97` — keyboard focus is
   dropped when an auto-advance into Focus disables the field mid-edit. LOW (a11y), covered
   by no criterion.** Criterion 7's ruling deliberately invites editing the Focus length
   during a break; when that break auto-completes, `disabled` flips on a possibly-focused
   input and the browser moves focus to `<body>` (WCAG 2.4.3). Mitigations: move focus to
   Start/Pause, or keep the field enabled and no-op the write (the store already no-ops it
   at `store.ts:227-232`). Otherwise record it in DECISIONS as an accepted cost.
3. **`components/FocusLengthInput.tsx:15,25-30,63-65` — `isFocusedRef` can stick `true`
   when the field is disabled out from under the cursor. LOW.** The component is now always
   mounted (it used to unmount on leaving Custom mode, which reset the ref). If a browser
   does not fire `blur` when a focused input becomes `disabled`, the store->field sync
   effect never runs again for the life of the page and the field can show a stale raw
   value, with a stale error `<p>` and `aria-invalid="true"` left on a disabled input
   (repro: type `999` during a break, let the break end). A `useEffect` clearing the ref
   when `disabled` turns true closes both.
4. **`components/FocusLengthInput.tsx:70` — criterion 33's "unchanged live-region count"
   holds only in the no-error state. LOW, informational.** The error `<p role="alert">` is
   the same single region, but the field now renders in every mode, so it is reachable in
   all three where it was previously Custom-only. QA pinned the region set by value in the
   default state and it matched, so the criterion is satisfied as measured — flagged so a
   later task does not read "unchanged" as "unchanged in every state".
5. **`components/PomotatoTimer.tsx:52-63` — the status-derived announcement is never
   cleared. NIT.** The advance path clears its own text after 10 s; the legacy
   `${MODE_LABELS[mode]} complete` branch has no clear, so that sentence persists in the
   accessibility tree. Only reachable from hand-edited or pre-013 persisted `complete`
   state, which the advance path never produces.
6. **`components/ModeSelector.tsx:16` — chip display order is now an implicit consequence
   of object-literal key order. NIT.** `MODE_ORDER` is gone; order comes from
   `Object.keys(TIMER_MODE_SET)`. Deterministic per spec, but the painted order of a
   user-facing row is now a side effect of a type-exhaustiveness map. A comment on
   `TIMER_MODE_SET` saying "key order is the chip order" would stop someone alphabetising it.
7. **`lib/stats/types.ts:44` — `StatsSession["mode"]` duplicates the `SessionMode` union by
   hand. NIT.** Now that `SessionMode` is layered, this literal union is the one place that
   will not follow it. It fails loudly rather than silently, and criterion 3's guard asserts
   `"custom"` by name, so this is cosmetic; `mode: SessionMode` would remove the duplication.
8. **`app/globals.css:68` — stale "custom-duration input" reference in the
   `--control-border` comment. NIT.** The control is now `#focus-length`.

### Dimension summary
- **Correctness:** verified in code for groups A, B, C, E, F and the structural half of D
  and G. Group H and the painted criteria are QA's; not re-measured. Criterion 30's
  "navigate to `/stats` and back" half is still untested but sound by construction (the
  position is in `partialize`, validated on every `merge`, and the home route re-triggers
  `persist.rehydrate()`).
- **TypeScript:** no `any`, no `@ts-ignore`/`@ts-expect-error` in new code; `tsc --noEmit`
  clean. The four casts in `store.ts` are narrowing-helpers on already-validated values,
  three carried over unchanged from HEAD.
- **Accessibility:** semantic `<fieldset>`/`<legend>` with native radios and the
  weight-based non-colour selected cue retained; dots `aria-hidden` with one non-live
  sentence; no new focusable element; visible focus retained on the field. Findings 2-4 are
  the open wrinkles. Suggestion, not a finding: `aria-describedby` from the `fieldset` to
  the position sentence would surface the cycle position to a radio-group user without
  adding a live region.
- **Performance:** no new interval, timeout (bar the ruled-PASS announcement clear) or rAF;
  the pulse is CSS keyframes scoped to `[data-treatment="active-running"]` with
  `animation: none` under `prefers-reduced-motion`. `CycleDots` subscribes to three
  primitive slices so it does not re-render on the 250 ms clock tick.
- **Licensing / branding:** nothing to flag. Four CSS dots, existing tokens only, no font,
  image, audio or copied asset. A four-segment Pomodoro counter is a generic convention and
  the copy is original.

## Orchestrator rulings (2026-10-28, after QA round 1)

### Criterion 46 — the one-shot announcer `setTimeout`: NOT A FAILURE
`components/PomotatoTimer.tsx:81` schedules `setTimeout(() => setAnnouncement(""), ...)`
once per advance, to clear a spent aria-live sentence. Criterion 46 exists to enforce
the project rule that **the remaining timer value is derived from a stored end
timestamp and never counted by ticks**. This timeout counts no time, reads no
duration, and feeds nothing back into the store: it empties a string so a screen
reader does not re-read a stale announcement. Criterion 46 is scoped to timekeeping
paths. A one-shot announcement clear is out of scope and PASSES. The grep guard over
the dot files stays as written; it is not widened to ban every `setTimeout`, which
would ban correct accessibility code.

### Criterion 55/58 — the 87 e2e failures: triaged, 0 app defects in the diagnostic subset
I re-ran the five highest-signal files myself (`dark-sweep`, `dark-contrast`,
`mode-selector-legend`, `task-list`, `accessibility`): 134 passed, 6 failed, and
**every one of the six is a stale or invalid test, not an app defect**:

- `accessibility.spec.ts:109` asserts `modeCount` is 4. 013 deliberately removed the
  Custom radio. Re-point to 3.
- `dark-contrast.spec.ts:316` x2 and `dark-sweep.spec.ts:451` measure "the disabled
  custom-duration field while running". The field is now `#focus-length` and is
  disabled only during a running or paused **Focus** run. Re-point the selector and
  the state; **the measurement itself must survive**, per criterion 55.
- `task-list.spec.ts:1170` expects `00:00` at completion and reads `03:55`. That is
  the auto-advance contract working. Re-point to the break being under way. (Its
  "pinned task" flow is retired by task 014 and will move again there.)
- `mode-selector-legend.spec.ts:73` is an **invalid method**, not a regression. At
  320 px the three chips wrap 2+1 and *each row is centred to 0.0 px* with no
  horizontal scroll (measured: group centre 160.0, row 1 centre 160.0, row 2 centre
  160.0). The reported 21.7 px comes from the test's own single-row arithmetic, which
  takes row 1's left edge and row 2's right edge. With four chips it wrapped 2+2 and
  the bad arithmetic cancelled; removing Custom exposed it. Fix: assert centring
  per row, keep the no-horizontal-scroll assertion.

The remaining ~81 failures are the same families QA named (lost `cluster` selector
after the `lg` flow change, Custom-mode flows, "complete at zero", 97% scrim figures).
Re-point them; do not delete a measurement to make a failure go away.

### Measurement method — `animations: "disabled"` is the likely sampler fault
`paintedColours` screenshots with `animations: "disabled"`. Playwright **cancels
infinite animations to their initial state** under that flag, and this page now has an
infinite pulse. That is the one structural difference from `groundPixels`, which does
not pass the flag and which read the Start button correctly. Before the next sweep,
prove which sampler is right on one rect with a known opaque fill rather than carrying
the disagreement forward. The dot figures are not invalidated: both pulse endpoints
were measured as static colours, which sidesteps the animation.

## Orchestrator rulings (2026-10-29, round 2 — measurement method settled before the sweep)

### `groundPixels` is the correct sampler. `paintedColours` is wrong on animated elements.
Run myself against the round-1 tree (`e2e/sampler-agreement.spec.ts`, probe 1), on a
`span.cycle-dot` whose computed fill is **opaque** `rgb(121, 84, 61)`:

| reading | value | verdict |
|---|---|---|
| reference (computed style over black) | `121,84,61` | — |
| `groundPixels` | `121,82,58` | correct (±3, profile rounding) |
| `paintedColours` | `120,53,15` | **wrong** |

`120,53,15` is `#78350f` — the dot's *pending* base colour, i.e. the animation's initial
state. The hypothesis in the round-1 ruling is **confirmed with a figure**: the sole
difference between the two helpers is `animations: "disabled"` at
`e2e/helpers/background.ts:146`, and Playwright **cancels infinite animations to their
initial state** under that flag. `groundPixels` (`e2e/helpers/surface-sampler.ts:12`)
passes no such flag and reads the live paint. The probe pauses (not cancels) each
infinite animation first, so both helpers were asked about the same instant.

**Consequence, binding on the next sweep:** every figure for an element carrying an
infinite animation that was taken with `paintedColours` is void and must be re-read with
`groundPixels`. This is exactly the artifact behind 012 criterion 14's unresolved note
("the pixel sample of that rect disagreed with the saved screenshot") and behind its chip
reading of `120,53,15` — the same wrong number, from the same cause, in two places.
Figures for *static* elements are unaffected: with no animation to cancel, the flag is
inert, which is why the two helpers agreed everywhere else.

### 012 criterion 15's wordmark failure is a test-method error, not an app defect.
Probe 2 classifies each side of the 6 px ring the legibility spec takes around `main h1`
by whether it lies inside the h1's solid `Surface`, under a **black** uploaded image, light
theme. Ink is `rgb(180,83,9)`; the surface fill is `rgb(255,250,243)`.

| viewport | ring side | inside the Surface? | worst pixel | ratio |
|---|---|---|---|---|
| 1280x800 | top | **no** | `200,197,195` | 2.925 |
| 1280x800 | bottom | **no** | `199,196,194` | 2.894 |
| 1280x800 | left / right | yes | `255,250,243` | **4.835** |
| 320x720 | top | **no** | `118,117,115` | 1.091 |
| 320x720 | bottom / right | yes | `255,250,243` | **4.835** |
| 320x720 | left | yes | `215,211,208` | 3.376 |

At 1280x800 the Surface is 50 px tall and the h1 is 40 px, so a 6 px ring **overflows it by
1 px top and bottom** and its worst pixel is the photograph. The sub-3 figures measure the
image, not the wordmark's ground. The pixel immediately beside the glyph, inside the
padding box, is the flat surface fill at **4.835:1** — clearing the 3:1 large-text floor
and the 4.5:1 body floor at both viewports. The 320x720 left side's 3.376 is the glyph's
own antialiasing (the probe dumps the 215→249 ramp across x=23..26), still over floor.

**Ruling: the wordmark passes. The ring method is at fault and must be fixed, not the
token.** A ring probe may only count pixels that lie inside the surface under test;
a side that crosses the surface's edge is measuring a different ground and is an invalid
reading. QA constrains `ringAround` consumers accordingly — clip each side to the
surface's padding box, and fail loudly if a side has no in-surface pixels left, rather
than silently reading the photograph. Do **not** delete the assertion to make it green.

## QA Report — round 2 (2026-10-29)
- Verdict: **PASS**, with two items left to the orchestrator: criterion 59 (the DECISIONS entry, not QA's to verify) and the build gate (not re-run by QA; no app file changed by QA; the orchestrator's `out/` from this tree stands).
- Round 1's failing criteria, now: **4** PASS (new unit test), **11** PASS (new e2e test), **46** PASS (round-1 ruling, unchanged), **49** PASS (new e2e test), **52** PASS by the non-colour clause (measured below), **53** PASS (measured below), **55** PASS (e2e green), **58** PASS except the build re-run noted above.
- Shared measurement and provenance: `docs/tasks/012-full-opacity-background-frosted-surfaces.md`, "QA Report — round 2" (method corrections, the 012 figures, and the findings). The sampler and the readings are the same run.
- Gates (shared with 012): typecheck exit 0; lint 0 errors, 20 warnings; unit 38 files, **1073 passing, 0 failing**; e2e **670 expected, 2 skipped, 0 unexpected, 0 flaky, exit 0**. One intermittent unexpected failure seen once under a heavy combined run and not reproduced; see 012 for detail.

### Criteria
- **1–3** (mode model, Focus length, SessionMode): PASS (round 1, unchanged; guards pass in the 1073).
- **4** (a stored `custom` row): **PASS**, new unit test `lib/db/custom-row-counts.test.ts`. A row written through `logCompletedSession` with `mode: "custom"` is accepted, its rejection message names all four modes (asserted on the issue), and after a round trip through `listAllSessionsForTests` into `aggregateStats` it counts as one session with 600,000 ms of focus. **Red-proof, unit:** `isFocusTypeMode` changed to `mode === "focus"`: the aggregate assertion goes red; restored, green.
- **5–10**: PASS (round 1, unchanged).
- **11** (Focus length persists, unaffected by Reset): **PASS**, new `e2e/focus-surface-behaviour.spec.ts`. Set 50, the readout reads `50:00`; reload keeps 50; holding Reset keeps 50; reload again keeps 50.
- **12–22**: PASS (round 1; the full e2e run is green, including the 320 px cluster and the expired-reload cases).
- **23–35**: PASS (round 1).
- **36–44**: PASS (round 1).
- **45, 47**: PASS (round 1; focus-cycle e2e green).
- **46**: PASS (round-1 orchestrator ruling, unchanged).
- **48**: PASS (round 1; focus-cycle e2e green).
- **49** (keyboard reach and visible focus on the mode radios): **PASS**, new behaviour test. Tab from the top of the page reaches the Focus radio within 80 presses; the focused chip paints `outline: solid 2px`, offset 2px; ArrowRight moves focus and the native checked state to Short break. Default mode (no focus): no outline on any chip.
- **50** (dot fills and ring at ≥3:1 in both themes): **PASS**. Minimum by cell in the table below. Round 1's table is confirmed to three decimals: light done 6.980 (black), light pending 3.511 (black), light ring 6.980 (black), dark done 9.696 (split), dark pending 3.234 (white), dark ring 9.696 (split).
- **51** (bounded set): **PASS**. White and black bound the range; split is the extra that defeats a mean; no intermediate image is run.
- **52** (treatments told apart, greyscale). **PASS by the non-colour clause; the greyscale numbers are measured.** Greyscale, white image, 1280: done 65 / pending 118 / ground 251, done-vs-pending **2.24:1**. Dark: done 216 / pending 123 / ground 46, **2.97:1**. Neither clears 3:1 against the other, so the criterion's non-colour clause carries it: a **filled** 16 px done dot against a pending dot whose painted fill is about **8 px** inside a 4 px transparent border (pending fill read as a column, probe deleted after use; done's fill and 2 px border are the same colour). Ring vs pending: shape (an outline against a filled dot), which the criterion allows by construction; greyscale ring 65 against pending 118 (2.24:1). Dots vs ground in greyscale: every treatment 3.2:1 and above.
- **53** (forced colours: all four visible; treatments told apart): **PASS, with an observation.** Under `forced-colors: active`, done and the active-idle ring both paint `rgb(0,0,0)` (21.0:1 vs canvas), pending paints `rgb(96,0,0)` (14.0:1). Done and the ring differ by shape (filled vs outlined) and pending by size, so none is colour-only. **Observation:** `rgb(96,0,0)` is not a system colour, so forced colours are not forcing the pending fill (not a failure; flagged).
- **54** (one table, one capture per theme and background, sampler kept in `e2e/helpers/`): **PASS**. Table below. The sampler is `e2e/helpers/surface-sampler.ts` (`groundPixels`, `clipToSurface`).
- **55** (test fallout updated, not deleted): **PASS.** The listed suites are updated; `components/TimerControls.test.tsx` passes unchanged; the e2e suite is green (670 expected, 0 unexpected). The dark-sweep disabled-field measurement survives (re-pointed to `#focus-length`, still measured).
- **56**: PASS (round 1).
- **57** (no HEAD-diff assertion added by 013): **PASS.** None of the new tests (`custom-row-counts`, the behaviour spec, the sweep) asserts against `HEAD`.
- **58** (gates): lint 0 errors / 20 warnings, typecheck 0, unit 1073, e2e 0 unexpected. **Build not re-run by QA** (see verdict).
- **59** (DECISIONS entry): not verified by QA (orchestrator-owned).

### Shared figure table (group H, greyscale-free). Each cell is the minimum over every state captured for that cell (default, blur off, reduced transparency), with its provenance in `sweep-parts/merged.json`
Columns: light 1280x800 (white / black / split), light 320x720, dark 1280x800, dark 320x720. Ground = the worst painted pixel of the element's own ring or box, text hidden for ground reads (glyph excepted, see 012).

| row | light 1280 (white / black / split) | light 320 | dark 1280 | dark 320 |
|---|---|---|---|---|
| c50 dot done (fill) | 8.735 / 6.980 / 8.735 | 8.741 / 6.980 / 8.741 | 9.696 / 12.769 / 9.696 | 9.696 / 13.039 / 9.696 |
| c50 dot pending (fill) | 4.394 / 3.511 / 3.511 | 4.397 / 3.511 / 3.511 | 3.234 / 4.260 / 3.835 | 3.234 / 4.350 / 3.835 |
| c50 dot active-idle ring | 8.735 / 6.980 / 7.865 | 8.741 / 6.980 / 7.865 | 9.696 / 12.769 / 9.696 | 9.696 / 13.039 / 9.696 |
| c14 mode chip, checked | 8.735 / 6.980 / 8.735 | 8.741 / 6.980 / 8.741 | 9.696 / 12.769 / 9.696 | 9.696 / 13.039 / 9.696 |
| c14 mode chip, unchecked | 9.891 / 7.903 / 7.903 | 9.897 / 7.903 / 7.903 | 9.370 / 12.341 / 9.370 | 9.370 / 12.602 / 9.370 |
| c14 readout (vessel and glyph, all levels) | 4.987 / 4.987 / 4.987 | 4.987 / 4.987 / 4.987 | 4.681 / 4.681 / 4.681 | 4.681 / 4.681 / 4.681 |
| c14 current-task title | 7.346 / 5.870 / 5.870 | 7.350 / 5.870 / 5.870 | 6.485 / 8.541 / 6.485 | 6.485 / 8.722 / 6.485 |
| c14 Start label on fill | 5.022 / 5.022 / 5.022 | 5.022 / 5.022 / 5.022 | 8.828 / 8.828 / 8.828 | 8.828 / 8.828 / 8.828 |
| c14 focus outline, chip | 4.838 / 3.864 / 4.838 | 4.838 / 3.864 / 4.838 | 6.580 / 8.849 / 6.580 | 6.580 / 8.849 / 6.580 |
| c14 focus outline, Start | 4.838 / 3.864 / 4.592 | 4.838 / 3.864 / 4.592 | 6.580 / 8.849 / 6.580 | 6.580 / 8.849 / 6.580 |
| c14 focus outline, theme control | **5.022 / 4.182 / 4.182** | 4.835 / 4.835 / 4.835 | **2.058** / 10.203 / 10.203 | 8.665 / 8.665 / 8.665 |
| c14 Reset `--control-border` | 4.394 / 3.511 / 3.511 | 4.397 / 3.511 / 3.511 | 3.234 / 4.260 / 3.971 | 3.234 / 4.350 / 3.971 |
| c14 focus-length `--control-border` | 4.394 / 3.511 / 3.511 | 4.397 / 3.511 / 3.511 | 3.234 / 4.260 / 3.234 | 3.234 / 4.350 / 3.234 |
| c15 wordmark (solid, image-active) | 4.835 / 4.835 / 4.835 | 4.835 / 4.835 / 4.835 | 8.665 / 8.665 / 8.665 | 8.665 / 8.665 / 8.665 |
| c15 theme control text (checked) | 8.735 / 8.735 / 8.735 | 8.735 / 8.735 / 8.735 | 12.769 / 12.769 / 12.769 | 12.769 / 12.769 / 12.769 |
| c16 vessel, 100 / 50 / 0 | 4.987 / 4.987 / 4.987 | 4.987 / 4.987 / 4.987 | 4.681 / 4.681 / 4.681 | 4.681 / 4.681 / 4.681 |
| c16 glyph, 100 / 50 / 0 | 7.350 / 5.870 / 5.870 | 7.350 / 5.870 / 5.870 | 6.485 / 8.722 / 6.485 | 6.485 / 8.722 / 6.485 |

Bold is the one failing cell: the theme control's focus outline over the photograph (012 criterion 14, a finding). Every other cell clears its floor (dots, text 4.5, edges 3, wordmark 3).

### Group H: provenance and the two bound arguments
- **Ground and provenance:** the dots sit inside the frosted panel, so their ground is the frosted composite over the image. White and black bound it: the fill over a flat field returns the same field for every blur radius (criterion 14's argument (a)), and split defeats a mean. Frosted ground per cell in the table above; the frosted and solid edges are image-independent where the table shows zero delta.
- **Agreement with round 1:** every round-1 dot figure is reproduced to three decimals (see criterion 50). Round 1's dot figures were read on static idle dots, so the animation trap did not touch them.
- **Pulse endpoints:** the pulse interpolates between pending and done. Both endpoints are measured as static colours (criterion 50's rule); no per-frame sampling.
- **Criterion 45 / 47:** round-1 measurement stands (byte-identical region when idle, paused, and under reduced motion; a running Focus run is the positive control). Not re-sampled this round.

### Red-proofs (013)
- **Criterion 4 (unit):** `isFocusTypeMode` changed to `mode === "focus"`; `custom-row-counts` goes red on the aggregate assertion; restored, green (3 of 3).
- **Criterion 16 drift (round 1, unit):** unchanged; still stands.
- **Criterion 14's floor carried by the fill (e2e, CSS break):** see 012 red-proofs.
- Criteria 26 and 27: 27's token guard red-proofed at unit level for 012 (see 012); 26 is not a 013 criterion.

### Verdict basis
Every 013 criterion that was failing in round 1 now passes: 4 and 11 and 49 by new tests, 52 and 53 by measured non-colour distinctions, 55 and 58 by the green suite. Criterion 59 and the build re-run are the orchestrator's. Known gaps that remain are 012's (criterion 4 owner-deferred, the theme control focus outline, and the Tasks trigger under forced colours); none of them touches the cycle, the dots' treatments or their figures.
