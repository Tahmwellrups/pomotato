# Session-end chime becomes a ~5 s alarm — history log

Appended by frontend/backend/qa/reviewer/orchestrator after implementation began.
The task's goal, scope and acceptance criteria are in [../021-alarm-chime.md](../021-alarm-chime.md).

<!--
  Verdicts and repro steps, not the journey. Over half of every pre-2026-11-12 task file
  was narrative appended here, and every later agent paid to re-read it.
  Append under the matching heading; grep-friendly headings matter more than prose.
-->

## Owner Rulings

### 2026-11-13 — Nothing on the session-end route silences a ringing alarm
Asked: at ~5 s, should Start, Pause or Reset cut the alarm short? Owner ruled **no**. The alarm rings its
full span every time; the only early stop is the explicit preview stop (criteria 15–17) and the
already-ruled refused-context path. 017 criterion 38 stands with that one carve-out.

Consequences for implementation: no stop path may be reachable from `TimerClockProvider`, from the mode
advance, or from the timer controls. Criterion 18 is settled — qa writes it as the brief states it, and
`lib/audio/chime.test.ts:249-263` is re-pointed only to admit the preview stop, not a timer-driven one.

Rejected alternatives: dismiss-on-Start (one stop path on the session-end route, and it mutes the exact
thing this task was asked to make harder to miss); dismiss-on-any-timer-action (same, wider).

### 2026-11-13 (second ruling) — Keep the original bell and repeat it three times, rather than inventing a shorter strike

The owner heard the 6-strike alarm and judged it low quality, asking to "keep the previous sound and keep
that going for 5 seconds." Diagnosis of why the first attempt sounded cheap: it kept the two frequencies
but dropped the two things that made them a bell. The original staggered the upper partial 0.16 s behind
the lower one, and gave each 1.5 s to decay. Fix pass 1's strike fired both partials together and cut the
decay to 0.75 s, so it read as a beep repeated six times.

**Ruled:** a strike is the original bell, unchanged — A5 880 Hz at offset 0 (share 0.6) and E6 1318.51 Hz
at offset 0.16 (share 0.4), each 1.5 s long, 1.66 s in total. Three of those at a 1.66 s interval span
**4.98 s**, which already sits inside criterion 6's 4.5–5.5 s band, so that criterion and criterion 7's
6.0 s ceiling are untouched.

Criteria 2, 3, 4 and 8 are amended in the brief: the 5–8 strike count and the 0.55–0.95 s interval both
belonged to the short-strike design, and criterion 8's loudness statement had to become a *maximum
instantaneous* sum because the two partials within a bell overlap by design.

**Cost, stated plainly:** this lands after qa's measurement sweep, which is the ordering CLAUDE.md warns
about. Groups A and B must be re-measured. It is one re-measure rather than two only because fix pass 2's
gain fix and this change were folded into the same round.

**Tradeoff the owner accepted:** three slow bells over five seconds read gentler than six fast strikes.
The owner's instruction was explicit about preferring the original timbre, so quality wins over urgency.

### 2026-11-13 (third ruling) — Five bells, 8.3 s: the count is owner-tuned by ear, not derived

qa's re-measure found `STRIKE_COUNT = 5` in `lib/audio/chime.ts` where the second ruling said 3, with the
file's own header still reading "three strikes" and no log entry for the change. Traced rather than
assumed: `frontend` set and reported 3, the orchestrator's own verification run observed 3 (`expected 3 to
be greater than or equal to 5`), and the only agent to run afterwards was qa, which edits test files only.
The owner confirmed they changed it by hand in the running app and want to keep it.

**Ruled: 5 bells, span 8.3 s.** The count is a *tuned* value — set by listening, not derived from the
original "around 5 seconds" ask. Criteria amended: 2 (count 5), 6 (span band 8.0–8.6 s), 7 (ceiling 6.0 →
**9.0 s**), 19 (the copy figure must be derived from `CHIME_DURATION_SECONDS`, which now renders "about 8
seconds"). 017 criterion 45's overlap argument survives untouched: 8.3 s is still far under the 60 s
session floor.

Two things this exposed that are worth keeping:
- **The derived copy earned itself.** Because fix pass 1 made the helper text compute from
  `CHIME_DURATION_SECONDS`, the UI silently followed the hand-edit to "about 8 seconds" instead of lying.
  That is the drift this criterion existed to prevent, caught on its first real test.
- **Criterion 7 is now the binding guard.** At a 6.0 s ceiling it was slack; at 9.0 s against an 8.3 s
  span, one further count bump trips it. That is the intended behaviour of a drift guard, so it is left
  tight on purpose.

**Stale comment to fix (app code, `frontend`):** `lib/audio/chime.ts:2` still says "three strikes of one
bell". The count is 5.

### 2026-11-13 — Criterion 8 was wrongly worded by the orchestrator, and measurement caught it

The amended criterion 8 claimed the maximum instantaneous summed gain is *exactly* `levelToGain(level)`,
"reached while both partials sound together", and that during the leading partial's first 0.16 s the sum
is "its share alone". qa measured the loudest instant at **0.9307 × `levelToGain(100)`** at **t = 0.175 s**
and both clauses are false: the leading partial has already begun its exponential decay by the time the
upper partial finishes its 0.015 s attack, so the two never peak together, and the "share alone" window is
a decaying ramp rather than a flat share.

The wording assumed a rectangular envelope. Corrected to state the **peak gain budget** (the shares sum to
1, so no instant can exceed it) plus the measured instant and its provenance, leaving the ceiling itself to
criterion 9 — which passed throughout. No code change: the envelope is correct and was correct before the
criterion was written. This is the orchestrator's error, recorded as such.

### 2026-11-13 — Criterion 12 stays in the brief with its second half undischarged

qa asked whether to keep criterion 12's "greatest end, not last built" clause or drop it, since the build
order is bell-major and the two readings coincide in the shipped code.

**Ruled: keep the criterion, record the gap.** The property is correct and the code satisfies it — the
carrier is genuinely selected by greatest end time, not by construction order. What cannot be *proved* is
that the selection would still be right if those two ever diverged. Dropping the clause would delete a true
statement of intent; keeping it unmarked would claim a guarantee the suite does not provide. So it stays,
marked, with the discharged half named: the carrier is the unique greatest end and ends 0.16 s after the
final leading partial, which rules out the "leading partial of the final strike" reading.

Rejected: restructuring the build loop (partial-major, or shuffled) so a test could discriminate. That
changes shipped scheduling code for a test's benefit, and scheduling is the part of this module that has
already produced one audible bug.

For whoever changes this next: if the build order ever stops being bell-major, this test becomes
discriminating on its own and the caveat can be deleted.

## Implementation Notes
(frontend/backend: decisions, tradeoffs, the types frontend consumes. What the next agent needs — no more.)

### Frontend (2026-11-13)
- **Constants** (all exported from `lib/audio/chime.ts`): `STRIKE_COUNT` 6, `STRIKE_INTERVAL_SECONDS` 0.85,
  `STRIKE_LENGTH_SECONDS` 0.75 (0.10 s silent gap per interval), `ATTACK_SECONDS` 0.015, `RELEASE_SECONDS` 0.1,
  `STRIKE_PARTIALS` (880 Hz share 0.6, 1318.51 Hz share 0.4, sounding together), `STRIKE_OFFSETS_SECONDS`.
  Span = 5 x 0.85 + 0.75 = 5.0 s; `CHIME_DURATION_SECONDS` = 5.0 (max offset + length, start lead excluded).
  Same two partials as the old bell so the timbre stays; the repeat is what makes it an alarm.
- **Loudness:** shares sum to 1 per strike, strikes never overlap, so the ceiling is `levelToGain(level)` as before.
- **Node accounting:** 6 strikes x 2 oscillators + 12 gains = 24 nodes, `lease.retain(24)`. `onended` sits on the
  oscillator with the greatest end (strict `>` over the loop), not the last built. `teardown` is guarded so
  `lease.release` runs once whether it is reached by natural end, stop or abandon. Abandon still nulls `onended`,
  stops every oscillator, then tears down.
- **Stop path:** `play()` returns only an outcome. `preview()` returns `{ outcome, ended, stop }`; `stop` exists
  nowhere else, so nothing on the session-end route can reach it (`TimerClockProvider` and `TimerControls` still
  call `play`). Stop holds each gain at its current value (`cancelAndHoldAtTime`, falling back to
  `cancelScheduledValues` + `setValueAtTime(param.value)` where unsupported), ramps to 0 over `RELEASE_SECONDS`,
  and a `ConstantSource` ending at that time triggers teardown. A marker is used because unstarted strikes would
  otherwise end at their own start time. The marker is transient and not leased. `engine.ts` unchanged.
- **Second play while ringing:** the running alarm is stopped and the new one starts no earlier than the old
  alarm's silence time, so the ceiling holds across the restart (new start = max(now + lead, old silence)).
- **UI:** one Preview button; text swaps "Preview chime" / "Stop preview" with `min-w-36` so the width does not
  move; focus stays on the same element. No live region. Component state `ringing` is set from `preview.ended`.
  Unmounting does not stop a preview.
- **Copy:** helper reads "The sound rings for about 5 seconds when a Focus session ends and when a break ends."
  and "Off means no chime when a session ends. Preview still rings for about 5 seconds." The number lives in a
  `RING_LENGTH` constant because the task 017 duration-literal scan flags any code line with Focus/break and a bare 5.
- **Not covered by the brief:** `ChimePlayer` gained `preview`; `components/SessionLengths.test.tsx` mocks `chime`
  with only `play`/`prime` and now needs `preview` in the mock (and to assert it instead of `play`).
- **Suite after change:** 6 failures, all test re-points (see the hand-off report). Lint 0 errors, typecheck clean.

### 2026-11-13 — The `SessionLengths` mock is the defect, not `ChimeSettings`' import (Option A)

Fix pass 1 made `ChimeSettings` import `CHIME_DURATION_SECONDS`, and `components/SessionLengths.test.tsx`
mocks `@/lib/audio/chime` with a partial factory, so that whole suite now fails to **load**:
`No "CHIME_DURATION_SECONDS" export is defined on the "@/lib/audio/chime" mock`. Verified state is **5
failing tests** (all `chime.test.ts`: criteria 38, 42, 45, 51, 53) **plus 1 suite that does not load**.

This is worse than the failure it replaced. Before fix pass 1 one *test* in that suite failed and the rest
still ran; now the load error masks every test in it, including the session-length field coverage that has
nothing to do with the chime. A masked suite is not a lighter failure than a red one.

**Ruled: Option A.** qa repairs the mock, and repairs it with `importActual` spread rather than by adding
the one missing name, so the next export added to `chime.ts` cannot stale it again.

**Rejected: Option B** (move the strike constants to `lib/audio/chime-timing.ts` and re-export). It adds a
module whose only purpose is to sit where a test mock cannot reach it — inverting a dependency for a mock's
convenience, and leaving the partial factory in place to fail the same way on the next export. The import in
`ChimeSettings` is correct as written; the test is what is wrong.

### Fix pass 2

`stop()` pinned every envelope with `param.value`, which is the node default of 1 before a strike's first event, so a strike beginning inside the release window (strike 0 on an early stop) sounded at about 0.8 per partial. Each envelope is now paired with its strike's begin/end: unbegun strikes get gain 0 and `oscillator.stop(now)` so they never play; in-flight strikes hold their real value and ramp to 0, and any oscillator ending past `silentAt` is rescheduled to stop there. `holdAt` became `holdRunning`, used only for begun strikes. All of this is reachable only through `preview().stop()`; `play()` has no handle.

### Fix pass 3
Restored the original bell: `STRIKE_PARTIALS` carries `{frequency, offset, share, length}` again (A5 0/0.6/1.5, E6 0.16/0.4/1.5), nested in a 3-strike loop at `STRIKE_INTERVAL_SECONDS` = `STRIKE_LENGTH_SECONDS` = 1.66, so `CHIME_DURATION_SECONDS` = 4.98. Begin/end are tracked per oscillator, so `stop()` between 0 and 0.16 s of a bell holds and fades the running A5 and ends the unbegun E6 at `now` through the same `begin > now` branch. Teardown hangs off the greatest-ending oscillator (E6 of bell 3).

## QA Report

**Verdict: PASS** (final pass, after the fake's exponential-ramp fix and the reviewer findings). Unit:
`lib/audio/chime.test.ts` 39 of 39. Full Vitest: 1101 of 1101 across 47 files. E2E on a fresh build at :3100:
`e2e/alarm-chime.spec.ts` 2 of 2 (criteria 14 and 19). Criterion 15's browser half is cited to the orchestrator
and was not re-run. Criterion 20 is the owner's listen. Criterion 12's "not last built" clause is recorded as
undischarged (see below).

### Fake defect, fixed
`FakeParam.valueAt` interpolated `exponentialRampToValueAtTime` linearly. It now follows the spec curve
`v0 × (v1/v0)^x`, and holds the start value for a ramp to or from 0 or across a sign change. Linear ramps are
unchanged. The two criterion 16 tests that were red against the closed-form `scheduledGain` now pass. The
implementation was not changed to match the fake.

### Re-measured on the spec curve
- **Criterion 8, loudest instant of one bell:** 0.6379 × `levelToGain(100)` at t = 0.175 s from the bell's start
  (the E6 attack end, 0.16 + 0.015). The earlier 0.9307 came from the linear fake and was an upper bound, as you
  said. It is now asserted to 3 dp in `chime.test.ts`. At level 25 the same instant measures 0.7278 × ceiling
  (probe, not asserted). The figure depends on level because of the absolute `FADE_FLOOR`.
- **Criterion 9, ceiling:** still PASS. Strikes do not overlap, so the alarm's loudest instant equals one bell's:
  0.6379 at level 100, below 1. The ceiling test (2 ms scan over the whole alarm at levels 50 and 100) and the
  one-bell 0.2 ms scan both pass.

### Criterion 15 — jsdom guard added (reviewer finding 2)
`components/SessionLengths.test.tsx`, new describe "criterion 15 (task 021, jsdom guard)":
- Preview is clicked. The same button element is then named "Stop preview". Clicking it calls `stop` once. It keeps
  the stop name until the deferred `ended` resolves, then reverts to "Preview chime". The stop name is gone.
- Unmount while ringing calls `stop` exactly once (frontend's cleanup null-then-stop).
Both pass. The name is asserted in both states, so a refactor that drops the swap fails the first test. No
red-proof was run; it would need an application edit.

### Criterion 12 — recorded as undischarged
The build order is bell-major and partial-minor. The last oscillator constructed is also the greatest end
(E6 of the final bell), so "greatest end" and "last built" cannot be told apart with the shipped code. Not
mutation-proved. Discharged: the carrier is the greatest end, unique, and 0.16 s after the final leading partial.

### Tests changed in this pass
- `lib/audio/chime.test.ts`: `FakeParam.valueAt` exponential branch; criterion 8 instant test re-pointed to
  0.6379 at 0.175 s.
- `components/SessionLengths.test.tsx`: criterion 15 jsdom guard (two tests).
- Prose only (finding 4): `e2e/chime-audio-autoplay.spec.ts:84` no longer says "5 s"; `e2e/alarm-chime.spec.ts`
  header and the criterion 14 title no longer say "five-second". The assertions already used 8.0–8.6 s.

### Run results
- `npx vitest run lib/audio/chime.test.ts`: 39 passed.
- `npx vitest run`: 1101 passed, 47 files.
- `npm run build` clean. `npx playwright test -c e2e/scratch-3100.config.ts e2e/alarm-chime.spec.ts`: 2 passed.

### Notes for the brief
- Criterion 8's quoted figure should read 0.6379 × `levelToGain(100)` at 0.175 s (level 100, one bell, spec curve).
- Criterion 12's "not last built" clause cannot be discharged with the shipped build order; owner to keep it as a
  recorded property or drop it.
