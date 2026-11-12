---
id: 017
slug: timer-settings-and-chime
status: done # draft | in-progress | qa | review | done | blocked
---

# Editable session lengths and a session-end chime

> **History for this task** — implementation notes, QA reports, review findings and
> orchestrator rulings live in [logs/017-timer-settings-and-chime-log.md](logs/017-timer-settings-and-chime-log.md). Read it only when a
> criterion below is disputed; it is not an input to implementing them.

## Goal
A person can set the Focus, Short break and Long break lengths from `/settings` and hear a chime when a
session ends. The three durations and two sound settings (on/off, volume) persist; the timer reads every
duration from one settings source; the chime plays exactly once per completed session, on both the
focus-to-break and the break-to-focus transition, and never on a reload or a tab refocus for a session
that already chimed.

**This is a refactor and extension of the milestone-1 timer and task 013's focus cycle, not a rebuild.**
Every behaviour task 013 shipped — auto-advance with auto-start, the anchor on the completed run's own end
timestamp, the one-step bound, the four-dot cycle counter, the long-break rule, the polite announcement —
survives unchanged unless a criterion below says otherwise. The standing rule holds: remaining time is
always derived from a stored end timestamp, never counted via `setInterval` ticks.

## Owner rulings this task implements (settled, not open)

1. **The settings surface is the existing `/settings` route.** `app/settings/page.tsx` renders
   `components/SettingsPanel.tsx`, reached from `components/SettingsButton.tsx`. The duration fields and
   the sound controls become new sections in that panel, alongside the existing "Timer gauge" and
   background sections. `components/FocusLengthInput.tsx` moves off the timer page
   (`components/PomotatoTimer.tsx:97`) into the panel.

   > **No modal dialog is built, so the dialog criteria were dropped and replaced.** The owner's original
   > brief asked for focus trap, Escape-to-close and focus restored to the opener. None of those apply to a
   > route. They are replaced by route-level accessibility criteria (4, 5, 6, 61, 62) — keyboard
   > reachability in DOM order, visible focus, programmatic labels, `aria-describedby` error wiring, the
   > existing "Back to the timer" link, and heading structure. **Reviewer: the absence of focus-trap
   > criteria is deliberate, not an omission.**

2. **The chime is synthesized, not a bundled file.** Built from oscillators and gain envelopes through the
   one existing `AudioContext` engine (`lib/audio/engine.ts`), in a small isolated module with a mockable
   interface (e.g. `lib/audio/chime.ts`). Original by construction: no licence question and no new asset in
   `public/`. This is also what keeps `lib/audio/no-audio-asset.test.ts` passing unamended (criterion 54).

3. **antislop mode for this task is `during`** (owner's explicit session choice). `frontend` applies the
   rules while writing, not as a later audit: the core filter plus `antislop-ui`, `antislop-human` and
   `antislop-copywriting` from `.claude/skills/`. **R-23 (ask before creating any asset) is already
   satisfied by ruling 2** — nothing is created to ask about.

## Decisions pm made here, so nobody re-derives them

**Where the settings live: `lib/preferences/`, at `PREFERENCES_VERSION` 3.** The owner asked for a version
field; `lib/preferences/schema.ts` is the project's versioned preference home (`pomotato-preferences`, with
`sanitizePreferences`, `isPreferences`, `migratePreferences` and a documented "how to add a preference"
contract at the top of the file). All five new keys go there. The version bump to 3 is for the same reason
version 2 was taken for `taskPanelVisible` (owner ruling, task 015): so the stored `version` records when
the durations and sound settings appeared. Consequence: `focusMinutes` leaves the **timer** store, which is
a timer-store **version 4** migration (criteria 27–32).

**The log → chime → transition ordering, resolved.** Today `completeIfExpired` calls `set()` (the
transition) and *then* `logRunCompletion`. The store is deliberately DOM-free and every store unit test
runs without a window; the chime is observed from React state. A literal "the chime starts before the
transition is committed" is only achievable by firing audio from inside the store.

- **Taken:** reorder `completeIfExpired` so `logRunCompletion` runs **before** the `set()` (criterion 34),
  and define the chime requirement as **"the chime is started from the observation of the advance, with no
  await in between, and is never cut short by it"** (criteria 35, 38, 39). That is the audible guarantee the
  owner actually wants, and it is something a test can assert on: call order with both mocked, a play count
  keyed on the advance, and no `stop`/`disconnect`/`suspend` issued against the chime's nodes before their
  scheduled end.
- **Rejected:** importing the audio engine into `lib/timer/store.ts` so the chime fires literally between
  the log and the `set()`. It makes the persistence layer depend on the audio graph, breaks the store's
  DOM-free property (and with it the unit suite that rehydrates it in isolation), and buys nothing audible —
  the gap being closed is a few milliseconds of a React commit, inside a ~2 s sound.

**Duplicate suppression reuses the live region's mechanism.** `lib/timer/store.ts` already exposes
`lastAdvance: { completedMode, nextMode, started, endedAt }`, documented as "usable as a change key", and
`onRehydrateStorage` clears it after a reload so a refresh announces nothing.
`components/PomotatoTimer.tsx:74-83` already dedups the announcement on
`announcedAdvanceRef.current === lastAdvance.endedAt`. **The chime guard uses the same `endedAt` key and
inherits the same cleared-on-rehydrate behaviour** — that is what makes "no chime on refresh" true, and it is
what criteria 35, 37, 57 and 58 are written against. No second mechanism, no new store field.

**Running and paused runs carry their own length; idle and complete read the setting.** The owner asked for
"timer idle, or paused at the start of a mode → the display updates immediately". **A timer sitting at its
full duration in this codebase is `idle`, not `paused`** — you cannot pause without first running, so
"paused at the start of a mode" is only reachable by pausing in the same millisecond as starting. So the
immediate-update states are `idle` and `complete` (criterion 15), and a paused run keeps its own length
(criterion 17). This is not a dodge: it is what makes "must not alter the running one" true by construction,
and it fixes a real hazard — `getRemainingMs` clamps a paused value to the current full duration, so
without a run-scoped length, lowering Focus from 50 to 5 mid-pause would silently shorten a paused run.
**Owner: this is the one place the implementation reads your wording differently from how you wrote it.
Look at criteria 15 and 17 together when you approve.**

**Preview plays even when the sound toggle is off** (criterion 43). The toggle governs automatic
session-end chimes. A dead Preview button under an off toggle leaves no way to audition a level before
turning sound on, and the copy near the toggle has to say what "off" means anyway. **Flagged for owner
review**; the alternative is disabling Preview when sound is off, which is a one-line change to criterion 43.

**One chime for both transitions.** The owner's out-of-scope list already bars multiple sound choices, and a
second sound is a second thing to design and bound. Focus end and break end play the same chime.

**The whole chime, including its release tail, is ≤ 2.0 s** (criterion 45). Where the figure comes from: the
shortest legal session is 1 minute (the lower bound on all three durations), so two chimes can be at most 60 s
apart; 2.0 s leaves no possibility of overlap, and keeps the sound inside the window where the next session's
first seconds are still quiet. **Flagged for owner review** — it is a pm bound, not a measured one.

## Data shape and pipeline ordering

**The data shape is decided here, so `frontend` can start immediately. `backend` is skipped.** Normally a
persisted-shape change runs backend first; this one does not touch `lib/db/` at all:

- `plannedDurationMs` already exists on the Dexie session row (`lib/db/types.ts:132`), is validated in
  `lib/db/session-repository.ts:28`, and is threaded through `lib/timer/log-completion.ts`. **The only
  defect is in the timer store:** `lib/timer/store.ts:261` recomputes it at completion time as
  `fullDurationMs(mode, focusMinutes)` from the *current* settings, so an edit mid-run rewrites history.
  The fix is to capture the planned duration when the run **starts**, persist it on the run, and log the
  stored value — all inside `lib/timer/`. No schema version bump, no repository change, no migration in
  Dexie.
- Raw session history stays in Dexie and is out of scope.

**The shape, settled:**

`Preferences` (in `lib/preferences/schema.ts`, `PREFERENCES_VERSION` 3) gains five keys:

| key | type | default | bounds |
| --- | --- | --- | --- |
| focus duration | whole minutes | 25 | 1–180 |
| short break duration | whole minutes | 5 | 1–60 |
| long break duration | whole minutes | 15 | 1–120 |
| session-end sound on | boolean | `true` | — |
| session-end sound level | integer | 50 | 0–100 |

Key names are frontend's choice; the defaults and bounds are not. The defaults reference the single
constants module rather than restating the numbers (criterion 9). Sound defaults **on** and level **50**
(`DEFAULT_LEVEL` in `lib/audio/gain.ts`) — pm's call, flagged for the owner.

`PersistedTimerState` (timer store, version 4):
- **loses** `focusMinutes` (it moves to preferences, carried by the v3 → v4 migration);
- **gains** `plannedDurationMs: number | null` — the full duration the current run started with, non-null
  exactly when the status is `running` or `paused`, the same cross-field rule `runId` already follows.

**Volume representation reuses the mixer's.** An integer 0–100 (`LEVEL_MIN`/`LEVEL_MAX`/`DEFAULT_LEVEL` and
`isLevel` from `lib/audio/gain.ts` and `lib/audio/mix.ts`) through the existing squared `levelToGain` curve.
The chime's own peak constant may differ from `MAX_LAYER_GAIN` (a transient is not a sustained bed) but is
defined once. **No second volume representation ships.**

## Scope

**In**
- Two new sections on `/settings`: session lengths (three fields, inline errors, Reset to defaults) and
  session-end sound (on/off, volume, Preview).
- Moving `components/FocusLengthInput.tsx` off `/` into the settings panel, generalised to three durations.
- One minutes parser for all three fields, generalised from `parseFocusMinutes`.
- One settings source for every duration: `SHORT_BREAK_MINUTES` and `LONG_BREAK_MINUTES` stop being fixed
  constants and `fullDurationMs` stops hard-coding them.
- The run-scoped planned duration, and logging the value the run actually started with.
- Preferences version 2 → 3 and timer store version 3 → 4, including carrying a stored `focusMinutes`
  across stores.
- A synthesized chime module with a mockable interface, fired once per completed session on both
  transitions, with autoplay priming on the first Start.
- Reordering `completeIfExpired` to log before it commits the advance.
- Updating the unit suites and e2e specs that reach the Focus length field on `/` (criterion 72).

**Out (defer; do not drift into these)**
- Auto-start preferences of any kind ("stop after a break" stays a hypothetical; PLAN risk 4 of task 013).
- The desktop Notification API. No permission prompt ships.
- Multiple sound choices, a different sound per transition, per-theme sounds.
- Any change to the ambient soundscape mixer, its layers, its dialog or its persistence. The 2026-10-27
  ruling that **soundscape playback is manual only and does not follow timer state** is unchanged; this task
  adds one timer-linked *transient*, not a timer-linked bed.
- Any change to `/stats`, `lib/stats/`, or the Dexie schema version.
- Syncing anything between tabs. Two tabs are two chimes, as they are already two sound graphs
  (DECISIONS 2026-10-27) and two timers with last-write-wins.
- Palette or token value changes in `app/globals.css`. This task consumes tokens and measures against them.

## Acceptance Criteria

Each criterion is tagged with how it is checked: `[unit]` Vitest with fake timers and a mocked chime
module, `[guard]` a source or shape guard, `[e2e]` Playwright, `[manual]` the audibility pass in the QA
report. Per CLAUDE.md "Measurement ordering", group I is the only measurement sweep and is taken once,
after every token and copy decision in groups A–H has landed.

### A. The settings surface

- [ ] 1. `/settings` renders two new sections alongside the existing Timer gauge and background sections:
      one for the three session lengths, one for the session-end sound. Each has its own visible heading or
      legend, and the route's heading levels run h1 then one consistent lower level per section with no
      level skipped. `[e2e]`
- [ ] 2. **The Focus length field no longer renders on `/`.** The home route contains no element with the
      id `focus-length`, no "Focus length" label, and no duration input of any kind. `[e2e]`
- [ ] 3. Removing it leaves no gap: on `/`, the vertical gaps between consecutive children of the timer
      stack are equal to one another at 1280×800 and at 320×568 (no reserved slot, no leftover space). Task
      013's criterion 35 property still holds — an auto-advance does not move the digits. `[e2e]`
- [ ] 4. Tab from the "Back to the timer" link reaches, in DOM order, each of: the three duration fields,
      Reset to defaults, the sound toggle, the volume slider, Preview. Every one shows a visible focus
      indicator. No new focus trap, and nothing on the route is reachable only by pointer. `[e2e]`
- [ ] 5. Every one of the three duration fields has a programmatic label (`<label for>`), and while invalid
      carries `aria-invalid="true"` plus an `aria-describedby` pointing at its own visible error node. When
      the value becomes valid again the error node is removed and the `aria-describedby` reference goes with
      it. Asserted per field, not once. `[unit]`
- [ ] 6. The sound toggle, the volume slider and the Preview button each have an accessible name that says
      what the control does; no icon-only control ships without one. The slider exposes its value to
      assistive tech (native `input[type=range]` or an equivalent with `aria-valuenow`/`valuemin`/`valuemax`).
      `[unit]`

### B. Duration validation

- [ ] 7. On a first visit the three fields read 25, 5 and 15, and `/` shows `25:00` idle in Focus. `[e2e]`
- [ ] 8. Bounds are enforced per field: Focus 1–180, Short break 1–60, Long break 1–120. For **each** field,
      every one of `""`, `"   "`, `"0"`, `"-3"`, `"2.5"`, `"25.0"`, `"1e2"`, `"abc"`, `"12abc"` and that
      field's own first out-of-range integer (181 / 61 / 121) is rejected with an inline error, and the
      stored value keeps its last valid entry. `[unit]`
- [ ] 9. **One parser, one constants module.** A single minutes parser serves all three fields (generalised
      from `parseFocusMinutes`, whose existing error strings are the copy baseline); no second parse
      implementation exists. Each default and each bound is exported from exactly one module, and the
      preference defaults reference those constants rather than restating the numbers — so `25`, `5` and
      `15` each appear once as a duration in shipped source. `[guard]`
- [ ] 10. Error text is specific to the failure kind — empty, non-integer, out of range — and the
      out-of-range message names **that field's own** bounds ("Enter a number from 1 to 60." for Short
      break, not 1 to 180). `[unit]`
- [ ] 11. A pasted value is handled on the same path as a typed one: pasting `" 30 "` into Focus stores 30
      (surrounding whitespace is trimmed), and pasting `"abc"` shows the error. The handler is not
      keystroke-only. `[e2e]`
- [ ] 12. **Reset to defaults** restores all three durations to 25 / 5 / 15, clears every inline error, and
      persists. It is a plain button, not hold-to-confirm (retyping a number is the undo). It changes
      nothing else: not the sound settings, not the cycle position, not a running or paused run's length.
      `[e2e]`

### C. Duration behaviour

- [ ] 13. An invalid value is never persisted: with Focus at 25, typing `0` leaves
      `localStorage["pomotato-preferences"]` reading 25 at every keystroke. `[e2e]`
- [ ] 14. The three fields are **enabled in every timer state** — no `disabled` attribute on any of them at
      any mode or status. `setFocusMinutes`'s running/paused no-op and the field's matching `disabled`
      condition are both gone. `[unit]`
- [ ] 15. **Idle and complete update immediately.** With the timer idle, setting Focus to 50 makes `/` read
      `50:00`; selecting Short break with its length set to 9 reads `09:00`. `[e2e]`
- [ ] 16. **A running run is untouched.** Changing the running mode's duration leaves
      `localStorage["pomotato-timer"].endTimestamp` byte-identical and the displayed remaining time on its
      original trajectory. `[unit]`
- [ ] 17. **A paused run is untouched, including when the new duration is shorter.** With Focus 50 paused at
      40:00 remaining, setting Focus to 5 leaves the frozen remaining at 40:00 and resuming counts down from
      there — the clamp in `getRemainingMs` reads the run's own planned duration, not the new setting. `[unit]`
- [ ] 18. **The change lands on the next run of that type.** With a Focus run counting, setting Short break
      to 9 then letting Focus complete starts a short break of exactly 9 minutes; setting Focus to 50 during
      that break starts the next Focus at exactly 50. `[unit]`
- [ ] 19. While a run is running or paused, a visible note says the change applies to the next session of
      that type. It is shown only while that is true (not permanently), and its wording names the session
      type. `[e2e]`
- [ ] 20. **The logged planned duration is the one the run started with.** A Focus run started at 25 whose
      setting is edited to 50 mid-run writes a `sessions` row with `plannedDurationMs` of 25 minutes, read
      back from Dexie. `[e2e]`
- [ ] 21. `plannedDurationMs` is non-null exactly when the status is `running` or `paused`, and null
      otherwise; `reset()` and `selectMode()` clear it, `pause()` and `resume()` preserve it. A stored entry
      violating that rule falls back to defaults on both the `migrate` and the `merge` path. `[unit]`
- [ ] 22. **No drift, still.** The auto-started run's end timestamp is the completed run's own stored end
      timestamp plus the next mode's **current** full duration, to the millisecond, read from
      `localStorage["pomotato-timer"]`. Task 013's criterion 16 whole-cycle check still passes with
      configured durations. `[unit]`
- [ ] 23. Every duration is independent: changing Focus changes neither break, and changing either break
      changes neither of the other two. `fullDurationMs` (or its replacement) returns the configured value
      for all three modes and is the only function in the app computing a full duration — no
      `MS_PER_MINUTE` multiplication survives outside it and the defaults module. `[guard]`

### D. Persistence and migration

- [ ] 24. The five new settings are in `lib/preferences/` and `PREFERENCES_VERSION` is 3. They were added
      per the contract documented at the top of `lib/preferences/schema.ts` (field, default, validator or
      value set, one `pick`/validate line in `sanitizePreferences`, one line in `isPreferences`). `[guard]`
- [ ] 25. A stored preferences entry at version 2 loads with the five new keys at their defaults and **every
      existing key preserved**: theme, gaugeStyle, background, mix, taskPanelVisible. `[unit]`
- [ ] 26. Per-key fallback holds for each new key independently: a string where a number belongs, a
      fractional minute count, an out-of-range value, `null`, and a missing key each fall back to that key's
      own default without discarding the other four or the pre-existing keys. **A corrupt level takes the
      default rather than being clamped**, so a corrupt value never becomes a loud one (the `sanitizeMix`
      rule). `[unit]`
- [ ] 27. The timer persist version is **4**, and `focusMinutes` is gone from the timer's persisted slice —
      `partialize`'s output has no such key, and the stored entry after a save does not contain one. `[unit]`
- [ ] 28. **The v3 → v4 carry does not revert anyone.** A tab holding a timer v3 entry with
      `focusMinutes: 50` and no stored focus duration in preferences loads with the focus duration at 50,
      shows `50:00`, and still reads 50 after a second reload. `[e2e]`
- [ ] 29. The carry runs once and loses to an existing preference: with preferences already storing 40 and a
      stale timer v3 entry saying 50, the loaded focus duration is 40. `[unit]`
- [ ] 30. A v3 `running` or `paused` entry keeps its countdown across the upgrade: its `plannedDurationMs` is
      derived from the **v3** stored `focusMinutes` and the **v3** fixed break lengths (5 and 15), never from
      the current settings, and a paused frozen value is clamped to that derived duration. `[unit]`
- [ ] 31. The version 1 → 4 and 2 → 4 paths still work: task 013's criteria 39 and 40 behaviours survive,
      with the new step applied on top. `[unit]`
- [ ] 32. A hand-edited current-version timer entry is still rejected and falls back to defaults for each of
      task 013's criterion 42 cases, plus: a non-numeric `plannedDurationMs`, a negative one, and one present
      while the status is `idle`. `[unit]`
- [ ] 33. No hydration-mismatch error or warning in the console on `/` or `/settings`, in each of: idle,
      running, paused, mid-break, and expired-while-closed. `[e2e]`

### E. The chime

- [ ] 34. **`logRunCompletion` is called before the `set()` that commits the advance.** Asserted on call
      order with both mocked, not by reading the file. `[unit]`
- [ ] 35. The chime is started from the observation of `lastAdvance`, with **no await between the advance
      commit and the play call**, and plays **exactly once per completed run**, keyed on the completed run's
      `endedAt`. `[unit]`
- [ ] 36. The chime plays on **both** transitions: focus → break (short and long) and break → focus. `[unit]`
- [ ] 37. Exactly once, under each of: React StrictMode's double-invoked effects, an unrelated re-render
      immediately after the advance, and a manual mode-chip click immediately after the advance. `[unit]`
- [ ] 38. **The transition never cuts the chime short.** After the advance commits, no `stop`, `disconnect`
      or `suspend` is issued against the chime's nodes before their scheduled end, and a client-side
      navigation away from `/` mid-chime does not stop it (the engine is a module-level singleton, the same
      property task 011 relies on). `[unit]`
- [ ] 39. **The transition never waits for the chime.** With a chime module whose play promise never
      settles, the timer is still in the next mode and `running` in the same commit, and the announcement
      still fires. `[unit]`
- [ ] 40. A chime that throws or rejects never propagates: the timer still advances and logs, exactly one
      `console.warn` is emitted, there is no unhandled rejection and no error boundary is tripped. `[unit]`
- [ ] 41. **Sound off:** no chime at session end. The advance, the `sessions` row and the polite
      announcement are all unaffected. The setting survives a reload. `[e2e]`
- [ ] 42. **Volume:** the chime's peak gain is the stored level through the existing squared `levelToGain`
      curve; level 0 produces no audible output (gain 0), and the gain is monotonic in the level. The level
      survives a reload. `[unit]` + `[manual]`
- [ ] 43. **Preview** plays the chime once per click at the current stored level, and **works while sound is
      off** (see the ruling above). The copy near the toggle says what "off" means — no chime when a session
      ends — so a working Preview under an off toggle is not a surprise. `[e2e]`
- [ ] 44. The volume **persists on gesture commit, not per input step**: a 20-step keyboard or drag change
      writes `pomotato-preferences` at most twice. (PLAN Maintenance asks for this before a second slider
      ships; this is the second slider.) `[e2e]`
- [ ] 45. The whole chime, including its release tail, is **≤ 2.0 s** — asserted from the scheduled stop
      times recorded against a fake context, not by ear. The figure's provenance: the 1-minute minimum
      session length, so two chimes can never overlap. `[unit]`
- [ ] 46. **No JS timer drives the chime:** no `setInterval`, `setTimeout`, `requestAnimationFrame` or
      `performance.now` in the chime module; teardown is scheduled on the audio clock through the `onended`
      pattern `lib/audio/engine.ts` already uses. `[guard]`
- [ ] 47. **No click:** the chime's gain starts at 0 and returns to 0 through ramps, never an abrupt
      assignment at a non-zero value. Asserted on the recorded `AudioParam` calls. `[unit]`

### F. The audio path

- [ ] 48. **One `AudioContext` for the document.** After priming, a chime, a Preview and a soundscape start,
      `soundscape.getSnapshot().contexts` is 1 and the context constructor was called once. `[unit]`
- [ ] 49. **Priming happens inside the gesture.** The first Start (and Resume) click opens or resumes the
      audio path synchronously, before the first await, which is what autoplay policy needs. The Preview
      button and the soundscape's own start also prime it. `[unit]`
- [ ] 50. After priming, a later session-end chime plays with no further gesture. `[e2e]`
- [ ] 51. **Node hygiene:** 20 consecutive chimes leave the engine's live node count back at its pre-chime
      value, and a chime changes no soundscape layer's target gain. `[unit]`
- [ ] 52. **Suspended-context recovery:** with the soundscape turned on and then off (which leaves the
      context suspended on the audio clock), a session-end chime still plays. The context may suspend again
      afterwards; the timer is unaffected either way. `[unit]`
- [ ] 53. **Blocked playback fails silently.** With the context refusing to resume, nothing is rendered in
      the UI about it, exactly one `console.warn` is logged, nothing throws, and the session still advances
      and logs. `[unit]`
- [ ] 54. **`lib/audio/no-audio-asset.test.ts` passes with no amendment to its rules.**
      `ALLOWED_AUDIO_ASSETS`, `SOURCE_RULES` and `DECODE_EXEMPT_FILE` are unchanged — no new audio file, no
      `new Audio(`, no `<audio>`, no `createMediaElementSource`, no `decodeAudioData`, no audio data URI.
      The only permitted edit is adding the chime module's path to the "the feature's own files are in the
      scanned set" assertion. This is the cheapest proof the chime stayed original and asset-free. `[guard]`

### G. Background tabs, reload and refocus

- [ ] 55. **Hidden across the end time:** with the tab hidden while a Focus run expires, on return the state
      is already the break with the correct remaining time derived from the stored end timestamp, and the
      chime has played **exactly once** — not zero times, not twice. `[e2e]`
- [ ] 56. Both existing catch-up routes are covered by name: `onRehydrateStorage` → `completeIfExpired(Date.now())`
      for a reload, and `hooks/use-timer-clock.ts`'s `visibilitychange`/`focus` sync for a refocus. Neither
      route produces a second advance from one completion (task 013's one-step bound still holds). `[unit]`
- [ ] 57. **No chime on reload.** A reload landing on an expired run credits the run and advances one step,
      and plays no chime — the `lastAdvance` clear in `onRehydrateStorage` is the mechanism, the same one
      that already makes a reload announce nothing. `[e2e]`
- [ ] 58. **No chime on refocus for an advance that already chimed.** Repeated `visibilitychange` and
      `focus` events after an advance produce no second play, because the guard key is the completed run's
      `endedAt`. `[e2e]`
- [ ] 59. A **live** advance chimes whether the next run started or landed idle under the one-step bound —
      the completion happened either way. A **rehydration** advance never chimes (criterion 57). `[unit]`
- [ ] 60. **The timing bound, stated honestly.** In a tab that can run JS, the chime fires at the first clock
      sync at or after the stored end timestamp. No criterion here claims sample-accurate firing in a
      throttled tab, and a discarded or frozen tab (bfcache, a sleeping laptop) makes no sound at all — see
      Risk 5. What is asserted is: correct state on return, and at most one chime per completed run. `[e2e]`

### H. Accessibility, motion and mobile

- [ ] 61. The existing polite announcement on `/` still fires with both halves ("Focus complete. Short break
      started."), and **no new live region is added to `/`** — the live-region count in the `/` tree is
      still the value task 013's guard pins. On `/settings`, the expected live-region set is stated
      explicitly and matched: one error announcer per duration field, following the pattern
      `components/FocusLengthInput.tsx` already uses, and nothing else. `[e2e]`
- [ ] 62. axe-core reports no violation of serious or critical impact on `/settings`, in both themes, in
      each of: clean state, one duration field in error, sound off, sound on. `[e2e]`
- [ ] 63. **Nothing new animates.** With `prefers-reduced-motion: reduce`, and also without it, two frames
      of each new section sampled 1 s apart are byte-identical in every state, and zero
      `requestAnimationFrame` callbacks fire over that second. **`prefers-reduced-motion` does not mute the
      chime** — sound is not motion, and the toggle is the control for sound. Stated so nobody wires them
      together. `[e2e]`
- [ ] 64. At 320 px width every new interactive control has a hit area of at least 44×44 CSS px, measured on
      the hit area and not the painted thumb (the mixer's 24 px thumb is the precedent for why that
      distinction matters), and no two targets overlap. `[e2e]`
- [ ] 65. At 320 px width `/settings` has no horizontal scrollbar in any state, including with all three
      fields showing their longest error message; error text wraps rather than truncating or overflowing.
      `[e2e]`

### I. Measurement — one sweep, taken after groups A–H have settled

*(Kept in its own group so a later token change re-runs only this. Per `.claude/agents/qa.md` cost rule 6, a
figure already recorded for the same token on the same ground may be cited as a confirmed diff rather than
re-derived.)*

**The ground, stated once:** task 010 paints the uploaded background **behind `/` only**, so `/settings` is
an opaque token surface and **these figures are image-independent**. They are taken once per theme on the
flat token — there is no adversarial image set for this group, which is what keeps it cheap. Every figure is
recorded with its theme, its fully covered painted pixel as `(r,g,b)`, and its ground pixel.

- [ ] 66. Each new boundary measures **≥ 3.00:1** against its ground in **both themes**, as a non-text UI
      component under WCAG 1.4.11: the three field borders, the toggle's border and its on-state fill, the
      slider track, the slider thumb, and the Reset-to-defaults and Preview button edges. Taken at a **fully
      covered** pixel, never an antialiasing fringe — a stroke with no fully covered pixel at its shipped
      width is a defect to thicken, not a measurement to argue about (DECISIONS 2026-10-27). `[e2e]`
- [ ] 67. Error text and field labels measure **≥ 4.50:1** against their ground in both themes — they are
      body text, not boundaries. `[e2e]`
- [ ] 68. The toggle's on and off states are told apart by more than colour: the difference survives
      greyscale, and it survives `forced-colors: active`, where system colours flatten and `box-shadow` is
      dropped (CSS Color Adjust 1 §3.2). The report says which non-colour cue carries it rather than leaving
      it implied. `[e2e]`
- [ ] 69. The whole group comes from **one capture per theme** (one page load, all pixels sampled in a
      single pass), with the sampler kept in `e2e/helpers/` so the next task reuses it, and the figures
      recorded in one table in this file. `[e2e]`
- [ ] 70. The duration field's **old** measurements on `/` are re-pointed to its new ground on `/settings`
      or retired with a written reason, not deleted silently. Named: `e2e/dark-sweep.spec.ts` (which measures
      the field in its *disabled* state — a state that no longer exists, per criterion 14, so this one needs
      a ruling or a retirement, not a re-point), `e2e/timer-surface-tokens.spec.ts`,
      `e2e/focus-surface-sweep.spec.ts`, `e2e/focus-surface-behaviour.spec.ts`. `[e2e]`

### J. Test fallout and gates

- [ ] 71. The suites that reach the Focus length field are updated, not deleted around. Eleven e2e specs
      select `focus-length`: `e2e/timer.spec.ts`, `e2e/accessibility.spec.ts`, `e2e/timer-gauge.spec.ts`,
      `e2e/timer-surface-tokens.spec.ts`, `e2e/dark-sweep.spec.ts`, `e2e/dark-contrast.spec.ts`,
      `e2e/dark-a11y-console.spec.ts`, `e2e/token-task-surface.spec.ts`,
      `e2e/uploaded-background-legibility.spec.ts`, `e2e/focus-surface-sweep.spec.ts`,
      `e2e/focus-surface-behaviour.spec.ts`. Four unit suites list the component **by path** and need
      re-pointing if the file moves: `components/TimerSurface.tokens.test.ts`,
      `components/token-foundation.test.ts`, `components/palette.tokens.test.ts`,
      `components/focus-cycle.guards.test.ts`. Also affected: `components/FocusLengthInput.test.tsx`,
      `lib/timer/store.test.ts`, `lib/timer/time.test.ts`, `lib/timer/focus-cycle.test.ts`,
      `lib/preferences/preferences.test.ts`, `e2e/sessions.spec.ts`, `e2e/focus-cycle.spec.ts`. QA inherits
      this list rather than discovering it one red run at a time. `[e2e]`
- [ ] 72. **Task 013's criterion 7 is superseded and said so out loud.** It required the Focus length field
      to be present on `/` in every mode; ruling 1 moves the field to `/settings`. QA does not re-assert 013
      criterion 7, and reviewer treats its failure as intended. The reason the field was *kept* on `/` back
      then — a break is the natural moment to decide the next Focus length — is preserved differently: the
      field is now reachable from any mode at any status, and is never disabled (criterion 14). `[guard]`
- [ ] 73. Criterion 14 closes PLAN's two open task-013 findings (keyboard focus dropped, and `isFocusedRef`
      sticking, when an auto-advance disables the field mid-edit): with no `disabled` state the bug is
      unreachable. A test asserts focus is retained in the field across an auto-advance while typing.
      *(Closing the PLAN items themselves is the orchestrator's, not frontend's.)* `[e2e]`
- [ ] 74. The one-interval rule holds: the only `setInterval` in the app is still
      `hooks/use-timer-clock.ts`'s `setNow(Date.now())`, no stored value is decremented on a tick, and
      neither the chime nor the settings path adds a timer or a `requestAnimationFrame`. `[guard]`
- [ ] 75. No assertion added by this task is phrased as a diff against `HEAD`, `git diff`, or "unchanged
      from the previous commit" — those invert the moment the work is committed (PLAN Maintenance).
      Criteria 3, 16 and 61 are deliberately phrased as properties of the shipped tree, not as diffs. `[guard]`
- [ ] 76. `npm run lint`, `npm run typecheck`, `npm run build`, `npm run test` and `npm run test:e2e` all
      succeed. No `any` in new code.
- [ ] 77. A `docs/DECISIONS.md` entry records what a later task would otherwise re-ask: the settings home and
      preferences version 3, the timer version 4 plus the run-scoped planned duration, the log → chime →
      transition resolution and the alternative rejected, the synthesized chime, Preview working while sound
      is off, the fields staying enabled during a run, the paused-run ruling, the `endedAt` chime key, the
      2.0 s chime bound, and that no desktop notification ships. *(Owned by the orchestrator, which lands
      docs; neither frontend nor backend edits `docs/`.)*

### QA guidance (owner's, recorded here so it is not lost)

- **Unit, with fake timers and a mocked chime module:** every criterion tagged `[unit]` — the store's
  ordering and advance behaviour, the parsers, the migrations, the chime's call count and guard key, the
  gain envelope and node bookkeeping against a fake `AudioContext`.
- **E2E:** the settings flow end to end (type, error, persist, reload, reset to defaults) and the
  focus-to-break transition including the hidden-tab and reload cases. The chime's **play count must be
  observable from the page without audio hardware** — the mechanism is frontend's choice, and
  `lib/audio/engine.ts`'s existing `getSnapshot()`/`subscribe()` shape is the precedent.
- **Manual, listed as a manual verification step in the QA Report:** chime audibility. At minimum: focus
  end, break end, Preview, over a playing soundscape, at level 1 and at level 100, on a real device. State
  plainly in the report that it was checked by ear and by whom — do not mark it PASS from a mock.

## Files likely touched
- `lib/preferences/schema.ts` — five new keys, `PREFERENCES_VERSION` 3, their defaults, validators and
  sanitise/guard lines.
- `lib/preferences/store.ts` — setters for the five keys, `partialize`.
- `lib/timer/constants.ts` — `SHORT_BREAK_MINUTES` / `LONG_BREAK_MINUTES` stop being fixed durations;
  defaults and per-field bounds for all three.
- `lib/timer/time.ts` — `fullDurationMs` reads all three durations; `parseFocusMinutes` generalises to a
  bounded minutes parser.
- `lib/timer/types.ts` — `PersistedTimerState` loses `focusMinutes`, gains `plannedDurationMs`.
- `lib/timer/store.ts` — version 4 and its migration (including the cross-store carry), the run-scoped
  planned duration in `start`/`pause`/`resume`/`reset`/`selectMode`, the log-before-commit reorder, and
  logging the stored planned duration.
- `lib/audio/chime.ts` *(new)* — the synthesized chime, with a mockable interface and a page-readable play
  count.
- `lib/audio/engine.ts` — only if the chime needs a shared way to open, resume and prime the one context;
  the soundscape's own behaviour must not change.
- `components/SettingsPanel.tsx` — the two new sections.
- `components/FocusLengthInput.tsx` — becomes the duration-fields control (three fields, or one reused
  three times), moved into the settings panel.
- `components/PomotatoTimer.tsx` — the field goes; the chime is fired from the `lastAdvance` observation
  beside the existing announcement effect.
- `components/TimerControls.tsx` — priming on the first Start/Resume click.
- `hooks/` — only if priming or the chime trigger wants a hook; no new interval or rAF either way.
- Test files (`*.test.ts(x)`, `e2e/**`) — QA's, per criterion 71.

## Risks
1. **Cross-store migration.** The focus duration moves from `pomotato-timer` (v3) to `pomotato-preferences`
   (v3), and the two stores rehydrate independently with no guaranteed order. Getting this wrong silently
   reverts someone from a 50-minute Focus to 25, which looks like a bug in the timer rather than in a
   migration. Criteria 28, 29 and 30 pin both directions: the value carries, and an existing preference
   wins over a stale timer entry.
2. **Rewriting history.** `plannedDurationMs` is recomputed at completion today, so any duration edit
   retroactively changes what `/stats` says about sessions already finished. The fix is a new persisted
   field on the run, which is itself a migration (criteria 20, 21, 30, 32). This is the only reason the
   timer store needs a version bump at all.
3. **Autoplay policy versus an automatic cycle.** DECISIONS 2026-10-27 ruled soundscape playback manual
   *because* a timer-linked sound cannot be guaranteed on the first run after a load. This task adds exactly
   the thing that ruling avoided. The mitigation is priming on the first Start (criterion 49) plus silent
   failure (criterion 53) — but a tab that was never interacted with in this document, for instance one
   restored into a running session, legitimately cannot chime. That is accepted and must fail quietly, not
   loudly.
4. **The chime and the mixer share one context.** A chime must not duck, suspend or re-ramp a playing
   soundscape, and 20 chimes must not leak nodes into a graph that is designed to stay flat (criteria 48,
   51, 52). The engine suspends an idle context after 0.5 s of silence, so the chime has to be able to wake
   a context the soundscape put to sleep.
5. **A frozen tab makes no sound, and no criterion should pretend otherwise.** Background throttling delays
   a hidden tab's timers; bfcache and a sleeping laptop stop them entirely. Criterion 60 states the honest
   bound — correct state on return, at most one chime per run — instead of an unenforceable promise of
   on-time audio while hidden.
6. **Removing the disabled state removes a safety net.** `setFocusMinutes`'s running/paused no-op is how the
   project has avoided the planned-duration problem until now. Dropping it (criterion 14) is only safe
   because the run carries its own length; if criterion 17 or 20 is implemented half-way, a mid-run edit
   silently shortens a live session. These three criteria must be read together.
7. **Measurement cost.** Four e2e specs currently sample the duration field on `/`'s frosted panel, and one
   of them (`e2e/dark-sweep.spec.ts`) measures its *disabled* state, which stops existing. Group I is scoped
   to the new opaque ground on `/settings` and taken once; criterion 70 routes the old figures rather than
   letting them be quietly deleted. Per CLAUDE.md "Measurement ordering", do not take group I until the
   control copy and any token choice in groups A–H has settled — a ruling landing mid-sweep costs a full
   re-measure.
8. **Licensing.** None, by construction. The chime is oscillators and gain envelopes (ruling 2), so no audio
   asset, font or image is introduced and `lib/audio/no-audio-asset.test.ts` needs no amendment
   (criterion 54). If anyone reaches for a sample file instead, that is a scope change requiring an owner
   decision and a provenance entry in `docs/DECISIONS.md`, not a quiet addition to `public/`.
9. **Blast radius.** Eleven e2e specs and seven unit suites touch the moved field or the changed stores
   (criterion 71). The four unit suites that name the component **by path** fail on a rename before they
   fail on behaviour, which is the same trap task 013 hit — frontend should expect to hand the rename to QA
   rather than edit those suites.
