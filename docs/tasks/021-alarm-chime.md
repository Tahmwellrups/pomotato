---
id: 021
slug: alarm-chime
status: in-progress # draft | in-progress | qa | review | done | blocked
---

# Session-end chime becomes a repeated-bell alarm (~8 s)

> **History for this task** — implementation notes, QA reports, review findings and
> orchestrator rulings live in [logs/021-alarm-chime-log.md](logs/021-alarm-chime-log.md). Read it only when a
> criterion below is disputed; it is not an input to implementing them.

## Goal
Replace the single 1.66 s two-note bell with a sound that rings long enough to notice and reads as an
alarm — the same bell struck repeatedly, still synthesized from oscillators and gain envelopes, still
scheduled entirely on the audio clock. Direct owner ask (2026-11-13), not a PLAN item: the current chime is
too short to notice if you have looked away.

**Length is owner-set and has moved twice**, both times after listening: "around 5 seconds" at the original
ask, then **5 bells / 8.3 s** on 2026-11-13 after the owner auditioned 5 in the running app. The criteria
below carry 8.3 s. Treat the length as a tuned value, not a derived one — it is the count that was tuned,
and every duration figure here follows from it.

## Scope
**In:** the chime module's scheduled envelope (`lib/audio/chime.ts`), the duration bound it exports, the
Preview control's behaviour for a sound this long, the settings copy that describes it, and re-pointing
the task 017 tests and e2e specs the duration change invalidates.

**Out — do not build any of these here:**
- A second sound choice, a sound picker, or a per-session-type sound (focus vs break).
- A user-configurable duration, strike count or pattern. The pattern is fixed in code.
- Any bundled or downloaded audio file, anything in `public/`. Synthesis only — so there is no licence
  question in this task at all.
- Cross-tab coordination (two tabs ending a session at once may both ring; out of scope).
- Changes to the volume slider, the on/off toggle's persistence, or `levelToGain`.
- Changes to when the alarm fires. `TimerClockProvider`'s one-per-`lastAdvance.endedAt` guard stands.

### Data shape
**Already decided — no schema work.** The alarm reuses the stored on/off flag and level; the Dexie
schema and `ChimeSnapshot` (`plays`, `lastLevel`) are unchanged except as criterion 13 states. **Backend
does not need to run before frontend.** This is one module plus its settings copy.

### What this supersedes in task 017
`docs/tasks/017-timer-settings-and-chime.md` section E owns the current contract. This task replaces
**45** (≤ 2.0 s total) with criterion 7 below, restates **42** as criteria 8–9, re-points **38** as
criterion 19, and leaves **46** in force as criterion 11. Grep 017 for those numbers if you need its
wording; do not read it whole.

## Acceptance Criteria

Tagged `[unit]` / `[e2e]` / `[manual]` as in 017. Groups A–B are the measured contract and re-run on any
change to the pattern constants; C–F are behaviour and do not.

### A. The sound is a repeated alarm, not one decaying bell

- [ ] 1. `[unit]` `lib/audio/chime.ts` exports named constants for the strike count, the strike interval,
      the per-strike length, and the attack and release times. Every number in the scheduling code is one
      of those constants or derived from them — no bare literals in the schedule.
- [ ] 2. `[unit]` The strike count is a fixed constant of **5**, not derived from a measured elapsed time
      and not recomputed per play. *Owner-tuned, 2026-11-13 (third ruling):* the owner set this to 5 by
      hand in the running app and kept it. The earlier values were 5–8 (short-strike design) and then 3
      (first restoration of the full bell); both are superseded.
- [ ] 3. `[unit]` Strikes are evenly spaced: strike *k* (0-indexed) is scheduled to begin at
      `k × STRIKE_INTERVAL` after the alarm's start, with the interval equal to **one bell's full length
      (1.66 s)** so each bell completes its natural decay before the next is struck. Asserted from the
      scheduled oscillator `start` times, not from wall-clock — a strike's start is its **leading**
      partial's start, with the upper partial following `offset` later. *Amended by the same ruling:* the
      0.55–0.95 s band belonged to the short-strike design.
- [ ] 4. `[unit]` A strike's **last** partial reaches 0 at or before the **first** partial of the next
      strike begins — three distinct bell strikes, not one sustained drone and not bells ringing into each
      other. Asserted from the gain automation times. Note that the two partials *within* a strike
      deliberately overlap: that stagger is what makes it a bell rather than a beep.
- [ ] 5. `[unit]` Every strike's envelope begins with `setValueAtTime(0)` and ends with a ramp to 0, with
      no abrupt non-zero write anywhere in the schedule. Supersedes 017 criterion 47, which covered only
      two notes; it now applies to every strike.
- [ ] 6. `[unit]` The whole alarm spans **8.0 s to 8.6 s** — `STRIKE_COUNT × STRIKE_INTERVAL_SECONDS`
      with the final bell's full decay, i.e. 4 × 1.66 + 1.66 = **8.3 s**. *Provenance:* read from the
      scheduled node times on the shared `AudioContext` — `max(strike offset + partial offset + partial
      length)` across all strikes — in a unit test with a stubbed context. It is not a wall-clock or
      stopwatch figure, and `START_LEAD_SECONDS` is excluded from it. *Amended 2026-11-13 (third ruling):*
      the 4.5–5.5 s band carried the owner's original "around 5 seconds"; the owner has since tuned the
      count to 5 by ear. The band is ±0.3 s around 8.3 s, wide enough only for floating-point tails — it
      is not an invitation to re-tune the count without a ruling.
- [ ] 7. `[unit]` `CHIME_DURATION_SECONDS` equals `max(offset + length)` across every scheduled node and
      is **≤ 9.0 s**. The exported constant and the scheduled stop times agree to 6 decimal places.
      *Provenance:* this replaces 017 criterion 45's 2.0 s. 45's justification — "the shortest legal
      session is 1 minute, so two chimes can never overlap" — still holds: the minimum session length
      enforced by the settings validation in task 017 is 60 s, and the shipped 8.3 s is ≪ 60 s, so the alarm still
      cannot overlap the next session's. *Amended 2026-11-13 (third ruling):* the ceiling is now **9.0 s**,
      the smallest round figure above criterion 6's upper bound. 8.3 s is still an order of magnitude under
      the 60 s session floor, so 45's overlap argument is untouched. The ceiling is a guard against the
      constants drifting, **not** a figure derived from the session floor — and at 9.0 s it is now the
      binding check that a further count bump would trip.

### B. Loudness — the alarm is not louder than today's chime

- [ ] 8. `[unit]` A single strike's **peak gain budget** is exactly `levelToGain(level)`: the partials'
      shares sum to 1, so no instant can exceed it. The loudest *instant* is strictly below that budget —
      measured at **0.6379 × `levelToGain(100)`**, reached at **t = 0.175 s**, where the upper partial
      finishes its 0.015 s attack while the leading partial has already begun its exponential decay. The
      two never peak together, which is inherent to the 0.16 s stagger. Assert the budget and the measured
      instant, not an equality at any instant. `level` 0 gives gain 0, and gain is monotonic across the
      whole 0–100 range. Restates 017 criterion 42, which asserted the same *budget* for this same bell.
      *Provenance:* computed from the scheduled gain automation on a stubbed context, summed across both
      partials at 1 ms resolution; the ceiling itself is criterion 9's job.
      *Corrected twice, 2026-11-13.* First the wording: "exactly … reached while both partials sound
      together" and "its share alone" were the orchestrator's error, assuming a rectangular envelope.
      Then the figure: the first measurement read **0.9307**, taken from a test fake that interpolated
      `exponentialRampToValueAtTime` linearly and so overstated every fade by up to 46%. The fake was
      corrected to the spec curve `v0 × (v1/v0)^x` when a closed-form implementation disagreed with it;
      **0.6379 is the figure from the corrected curve.** Any future re-measure must confirm the fake's
      exponential branch is still in place before trusting a number from it.
- [ ] 9. `[unit]` No two strikes overlap in time (follows from criterion 4), so the instantaneous summed
      gain across the whole alarm never exceeds `levelToGain(level)`. *Provenance:* the ceiling is the
      current chime's peak at the same stored level, computed from `levelToGain` in
      `lib/audio/gain.ts` — equal to it, never above it. Repeating a strike must not raise the peak.

### C. Timing discipline

- [ ] 10. `[unit]` Every strike is scheduled in one synchronous pass inside `play()`. Nothing re-arms
      itself from a callback, and no strike's timing depends on a previous strike having ended.
- [ ] 11. `[unit]` `lib/audio/chime.ts` contains no `setInterval`, `setTimeout`, `requestAnimationFrame`
      or `performance.now`. 017 criterion 46, unchanged and still binding.
- [ ] 12. `[unit]` *(property kept, half undischarged — see the ruling in the log.)* Teardown hangs off the **last-ending** oscillator's `onended` (greatest
      `offset + length`), not the last one constructed. After 20 consecutive alarms the live node count
      returns to its pre-alarm value and no soundscape layer's target gain has moved. Re-points 017
      criterion 51, which asserted the same over 20 of the old two-node chimes.
- [ ] 13. `[unit]` One alarm increments `plays` by exactly 1, not once per strike. `lastLevel` is the
      level passed to `play()`. `data-chime-plays` therefore still counts alarms.

### D. Preview

- [ ] 14. `[unit]` `[e2e]` Preview plays the whole alarm — same constants, same strike count, not a
      shortened audition. It still plays while the on/off toggle is off (017 behaviour, unchanged).
- [ ] 15. `[e2e]` While a preview is ringing, the Preview control is a stop control: its accessible name
      changes to name the stop action, it stays keyboard-reachable with a visible focus state, and
      activating it silences the preview. When nothing is ringing it reads as Preview again. No second
      button appears and disappears — one control, two states.
- [ ] 16. `[unit]` Stopping a preview ramps the live gain to 0 over at most the release time and then
      disconnects; no abrupt write to a non-zero value, no click. The `soundscape.lease()` it holds is
      released exactly once.
- [ ] 17. `[unit]` A second `play()` while a preview is ringing does not layer two alarms: the running
      preview is stopped before the new one is scheduled, so the instantaneous gain ceiling in
      criterion 9 holds across the restart.

### E. Interruption

- [ ] 18. `[unit]` A session-end alarm is **not** cut short by the mode advance, by pausing, by resetting,
      or by a client-side navigation: no node is stopped or disconnected before its scheduled end. Only an
      explicit stop (criteria 15–17, and the already-ruled refused-context path) may stop a node early.
      Re-points 017 criterion 38 — its test asserts "no node stopped before its scheduled end" with no
      exception, and now needs the explicit-stop carve-out. **Ruled 2026-11-13: nothing on the
      session-end route silences the alarm** — see the Risks section; this criterion is settled and QA
      may write it.

### F. Copy and manual check

- [ ] 19. `[e2e]` The settings copy in `components/ChimeSettings.tsx` tells the user how long the sound
      rings, and the figure is **derived from `CHIME_DURATION_SECONDS`, never hand-written** — at the
      shipped count that renders "about 8 seconds". The toggle label or the `#chime-state` helper text
      says so. No copy anywhere describes it as a single chime or a brief one. Assert the derivation (the
      rendered figure tracks the constant), not the literal word "eight" — that is what stops the copy
      drifting from the sound the next time the count is tuned.
- [ ] 20. `[manual]` One listen on one device, at level 50 and at level 100: the strikes are individually
      distinct, the sound reads as an alarm rather than a bell or a drone, and there is no click or pop at
      any strike boundary, at the start, at the end, or on a preview stop.

## Files likely touched
- `lib/audio/chime.ts` — the pattern constants, the strike loop, the exported duration, the stop path.
- `components/ChimeSettings.tsx` — Preview/stop control state, toggle label and helper copy.
- `lib/audio/gain.ts` — read only; `levelToGain` is unchanged.
- `lib/audio/engine.ts` — read only unless the stop path needs a lease release it does not already have.
- `docs/DECISIONS.md` + `docs/decisions/2026-11.md` — already written by the orchestrator (2026-11-13);
  implementers do not touch these.

Not touched: `lib/db/**` (no schema change), `components/TimerClockProvider.tsx` (the fire-once guard is
unchanged), `docs/PLAN.md` (direct owner ask, not a milestone item — no plan line added).

## Tests this invalidates — for QA to re-point, not rediscover
Grepped 2026-11-13; these are the only places the duration or node count is asserted.

- `lib/audio/chime.test.ts:211-224` — `describe("criterion 45: … at most 2.0 s")` asserts
  `CHIME_DURATION_SECONDS <= 2.0` and `span <= 2.0`. **Re-point to criteria 6 and 7.**
- `lib/audio/chime.test.ts:183-209` — criterion 42, "the two notes' peaks sum to `levelToGain(level)`".
  **Re-point to criterion 8:** the sum is per strike now, across however many nodes a strike has.
- `lib/audio/chime.test.ts:233-247` — criterion 47, envelope starts and ends at 0. **Widen to every
  strike** (criterion 5).
- `lib/audio/chime.test.ts:249-263` — criterion 38, "no node is stopped or disconnected before its
  scheduled end". **Needs the explicit-stop carve-out** (criterion 18) and will fail as written once a
  preview stop exists.
- `lib/audio/chime.test.ts:291-312` — criterion 51, node hygiene across 20 chimes. Should still pass, but
  20 alarms is now 20 × strike-count × notes-per-strike nodes; watch for a slow or flaky run.
- `lib/audio/chime.test.ts:226-231` — criterion 46, the no-JS-timer source scan. **Must keep passing
  unchanged.**
- `lib/timer/task-017-guards.test.ts:86-126` — the shipped-source timer scan. Must keep passing; a stop
  path implemented with `setTimeout` anywhere in the chime module fails both this and criterion 11.
- `e2e/chime-audio-autoplay.spec.ts:84` — comment reads "the 1.7 s chime"; the surrounding navigation test
  polls `data-chime-plays` with a 15 s timeout, which still covers a 5 s alarm. Update the comment and
  check the test still overlaps the sound it claims to.
- `lib/audio/no-audio-asset.test.ts` — asserts no bundled audio asset. Must keep passing; synthesis only.
- `e2e/chime-audio-blocked.spec.ts`, `components/TimerClockProvider.test.tsx`,
  `components/SessionLengths.test.tsx` — reference the chime but assert no duration figure. Expected to
  pass untouched; if one fails, that is a regression, not a re-point.

## Risks
- **Interruption: ruled, not open (owner, 2026-11-13).** Nothing on the session-end route silences a
  ringing alarm — not the mode advance, not Pause, not Reset, not a client-side navigation. The only
  early stop is the explicit preview stop in criteria 15–17 and the already-ruled refused-context path.
  017 criterion 38 survives with that one carve-out. Criterion 18 and the re-point of
  `chime.test.ts:249-263` are settled on this basis; implement and test them as written.
- **Intrusiveness.** 8.3 s of alarm is much harder to live with than 1.66 s of bell if it fires unexpectedly.
  The only mitigation in scope is the existing off toggle and the copy in criterion 19. If this comes
  back as "too much", the fix is a later task, not a mid-task duration tweak.
- **Node count.** 20 alarms in a hygiene test now constructs an order of magnitude more nodes than 017's
  version. If `chime.test.ts:291-312` gets slow, say so in the log rather than lowering the count.
- **Licensing:** none. Synthesis only, no asset, no provenance entry needed.
- **Accessibility:** criterion 15 changes a button's accessible name while it is focused. Keep the change
  announced by the name itself, not by a live region, and keep the focus state visible through the swap.
- **No data migration.** Stored preferences are untouched.
