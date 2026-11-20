---
id: 022
slug: timer-gauge-settings
status: review # draft | in-progress | qa | review | done | blocked
# Automated gates all pass. Open: criterion 7 (visual parity) and criterion 35 (screen-reader
# pass), both manual and owner-held; review finding F1 is signed off by criterion 35, not before.
---

# Timer gauge: off switch, style selector with live previews, and re-wiring the gauge

> **History for this task** — implementation notes, QA reports, review findings and
> orchestrator rulings live in [logs/022-timer-gauge-settings-log.md](logs/022-timer-gauge-settings-log.md). Read it only when a
> criterion below is disputed; it is not an input to implementing them.

**Pipeline: major.** New Settings surface + a new persisted preference + a store version bump, so the
full five-agent pipeline runs. **`backend` is not needed**: no gauge key exists anywhere in `lib/db/`
(grep: 0 matches), gauge preferences live only in the Zustand `persist` store. The data shape is
decided below, so `frontend` may start immediately.

**antislop mode for this session: `during`** (resolved by owner answer). Subagents read
`.claude/skills/antislop-ui/SKILL.md` only.

## Step 0 — Inventory of gauge styles that exist today

Two styles exist. **No new gauge designs are in scope.** Neither style conveys progress on `main`:
commit `41cd33f` ("Removed timer gauge in the meantime") disconnected the renderer.

| id | What renders it | On the timer today? | Selected today |
|---|---|---|---|
| `vessel` | `components/TimerGauge.tsx` → `components/SloshGauge.tsx` (liquid behind the digits) | **No — removed, must be re-wired.** `components/TimerDisplay.tsx:5` still imports `TimerGauge` but never renders it; no other file in `app/`, `components/`, `widgets/` references `TimerGauge`. The import is dead. | Settings radio, `components/SettingsPanel.tsx:51-69`. The preference still writes to storage; it has no visual effect. |
| `glyph` ("In the digits") | `components/TimerDisplay.tsx:27-33` — `DIGITS_GLYPH` plus the `OVERLAY` `::after` two-tone fill on the digits | **Present but frozen, must be re-wired.** The overlay paints, but its level comes from `--gauge-surface` / `--gauge-lean`, which only `TimerGauge`'s `onPaint` writes. With `TimerGauge` unrendered, `onPaint` (`TimerDisplay.tsx:48-53`) never fires, so the fallback `var(--gauge-surface,100)` applies — level 100, which that file's own comment states is "one flat colour". No level is shown. | same radio |

Correction to the task framing: **`lib/preferences/gauge-style.ts` does not exist.** Only
`lib/preferences/gauge-style.test.ts` does; the gauge style type, value list and default live in
`lib/preferences/schema.ts:35-36, 88`.

### Current persisted shape (gauge-related)

- Storage: `localStorage`, key `pomotato-preferences` (`PREFERENCES_STORAGE_KEY`), written by the
  Zustand `persist` store in `lib/preferences/store.ts:41-94` (`version: PREFERENCES_VERSION`,
  `migrate` at `store.ts:88`).
- `PREFERENCES_VERSION = 3` (`lib/preferences/schema.ts:85`). **The migration criterion below is
  therefore `3 → 4`.**
- `gaugeStyle: GaugeStylePreference` where `GAUGE_STYLE_VALUES = ["vessel", "glyph"]`, default
  `DEFAULT_GAUGE_STYLE = "vessel"`; validated through the closed-set `pick()` in
  `sanitizePreferences`, which already falls back per key.
- No `gaugeEnabled` key exists. There is no gauge entry in `lib/db/`.
- Setter today: `setGaugeStyle` (`store.ts:24, 45`). `hasHydrated` gates reads (`store.ts:20`).

## Goal

In Settings, let a user turn the timer gauge off entirely, and — when it is on — choose between the
two existing styles from preview cards that render the real gauge. Re-wire the chosen style so it
actually paints progress on the timer again, which `41cd33f` removed.

## Scope

**In**
- Re-wire the live gauge so both `vessel` and `glyph` convey progress on `/` again.
- One presentational gauge component taking a variant plus a progress value, used by both the timer
  and the previews; no timer logic imported into the preview.
- A "Timer gauge" section in Settings: a switch ("Show timer gauge") plus a style selector shown as
  preview cards in a responsive grid.
- `gaugeEnabled: boolean` added to the persisted preferences, with a `3 → 4` version bump and
  migration.
- Reduced-motion handling for previews and the live gauge; a11y for switch, radio group and the
  disabled-state explanation.

**Out (defer; do not touch)**
- New gauge designs, gauge colour customization, per-mode gauge styles, mascot gauges.
- Timer logic, the chime (`lib/audio/`), stats, theme, background upload behaviour.
- Any change to `lib/db/` or the Dexie schema. If a criterion seems to need one, stop and ask.
- Re-opening the `--gauge-liquid` / `--popover` token values. Per CLAUDE.md measurement ordering: if a
  token must move, it moves **before** the measurement criteria are run, recorded in the log, once.

## Data shape (decided — frontend may start)

- `gaugeEnabled: boolean`, **default `false`** (owner ruling 2026-11-19, supersedes the earlier
  default-on ruling). Validated inline with `typeof === "boolean"` in
  `sanitizePreferences` and `isPreferences`, the way `taskPanelVisible` and `chimeEnabled` are.
- `gaugeStyle` keeps its existing name, type and closed value set. The style list stays a single typed
  constant that drives selector, previews and renderer.
- `PREFERENCES_VERSION` becomes `4`; `migratePreferences` keeps every existing key and fills
  `gaugeEnabled` from the default.

## Acceptance Criteria

### A. Inventory completeness and preview/live parity

- [ ] 1. Every id in the typed gauge style list has both a preview card in Settings and a live
      renderer on `/`; a test enumerates the list and fails if an id lacks either. `[unit/component]`
- [ ] 2. The list contains exactly the two ids that exist today, `vessel` and `glyph`. No third id is
      added by this task.
- [ ] 3. Each preview renders the same component the timer renders, driven by a variant plus a
      progress value. Grep proves no screenshot, image asset, or second lookalike implementation of
      either style exists.
- [ ] 4. The preview imports nothing from the timer logic (`lib/timer/**`, `hooks/use-timer-*`,
      the timer store). Checked by import grep on the preview's source file.
- [ ] 5. Every preview renders at the same fixed sample progress (60% unless the log records
      otherwise) and does not animate on its own: with no pointer or focus interaction, the preview's
      painted level is identical across two samples ≥1 s apart.
- [ ] 6. Progress direction is the same in preview and live: the brief's 60% means the same thing in
      both. The existing live convention is `gaugeLevel = remainingMs / fullMs * 100`
      (`TimerGauge.tsx:24-27`) — level 100 at the start of a session, draining to 0. The preview must
      use that convention, not its inverse.
- [ ] 7. Manual parity check, recorded in the log with the sampled values: for each style, the live
      gauge paused at a remaining time equal to the preview's sample progress paints the same colours
      as its preview card (same resolved `--gauge-liquid` and `--popover`, or in-glyph equivalent).

### B. Off means off, with zero layout shift

- [ ] 8. With `gaugeEnabled: false`, no gauge element renders on `/`: `[data-testid="timer-gauge"]`
      is absent from the DOM, and the `glyph` overlay span is absent, regardless of `gaugeStyle`.
- [ ] 9. **Zero layout shift, measured:** the bounding box (`getBoundingClientRect`) of the digits
      element, the mode tabs container, and the primary timer controls container are each identical to
      the pixel between `gaugeEnabled: true` and `gaugeEnabled: false`, at the same viewport, same
      remaining time, with the timer paused. Same comparison again after toggling the switch live
      without a reload.
- [ ] 10. Off leaves no empty gap: nothing with reserved height, a placeholder, or a transparent
      spacer stands in for the gauge. Satisfied by criterion 9 plus a DOM check that no
      gauge-dedicated wrapper remains.
- [ ] 11. With `gaugeEnabled: false` seeded in storage, no gauge paints at any point during load (no
      flash before rehydration): an e2e assertion that `[data-testid="timer-gauge"]` never appears
      from navigation through to hydration.

### C. Persistence, defaults, migration, fallback

- [ ] 12. Toggling the switch or choosing a style applies to `/` immediately, with no reload.
- [ ] 13. Both `gaugeEnabled` and `gaugeStyle` survive a reload of `/settings` and of `/`.
- [ ] 14. Turning the gauge off, choosing nothing, then turning it back on restores the style that was
      selected before it was turned off, not `DEFAULT_GAUGE_STYLE` — including across a reload taken
      while off.
- [ ] 15. Store version is `4`. A stored payload at `version: 3` (and at `version: 1`, which
      `e2e/helpers/background.ts:105` still seeds) keeps every key it has and gains
      `gaugeEnabled: false`. `[unit]`
- [ ] 16. No existing key loses its value through the bump: a unit test asserts `background`, `mix`,
      `taskPanelVisible`, the three session lengths, `chimeEnabled`, `chimeLevel` and `gaugeStyle` all
      survive `3 → 4`.
- [ ] 17. An unknown or stale `gaugeStyle` (`"ring"`, `""`, `null`, a number, an object) falls back to
      `DEFAULT_GAUGE_STYLE` with no thrown error and no console error; a non-boolean `gaugeEnabled`
      falls back to `false`. `[unit]`
- [ ] 18. A stale `gaugeStyle` does not disable the gauge, and `gaugeEnabled: false` does not rewrite
      `gaugeStyle`. The two keys are independent.
- [ ] 19. The persisted `state` object's key set is asserted explicitly in one place and now includes
      `gaugeEnabled`; no key is added beyond it. (Updates the existing assertion at
      `e2e/settings-gauge-style.spec.ts:408`.)

### D. Defaults — gauge off by default, restoration is opt-in (ruled 2026-11-19)

- [ ] 20. A fresh install defaults to `gaugeEnabled: false`, `gaugeStyle: "vessel"`. The stored
      default style is still `vessel` even though nothing paints it yet.
- [ ] 21. An existing user's stored `gaugeStyle` is preserved exactly through the migration; the
      setting they see selected after this task is the one they chose before it.
- [ ] 22. **Restoration is real but opt-in** (ruled 2026-11-19, superseding the earlier default-on
      ruling). Two halves, both testable:
      (a) With `gaugeEnabled` turned **on**, the selected style conveys progress on `/` again —
      `vessel` renders a level that changes as the session runs, and `glyph` shows a two-tone fill whose
      boundary moves, no longer frozen at level 100. An existing user with a stored `gaugeStyle` who
      turns the gauge on sees *that* style paint, not the default.
      (b) Because the default is now off, an existing user who changes nothing sees **no gauge**, which
      is what `main` shows today. The restoration ships dormant; the user opts in. This is what makes
      "no visual change for existing users" true rather than contradicted.

### E. A running or paused session is unaffected

- [ ] 23. Toggling the switch or changing style while a session is **running** does not change
      remaining time: the rendered mm:ss at a fixed wall-clock offset matches a control run that made
      no setting change, and the stored end timestamp is byte-identical before and after the change.
- [ ] 24. The same change while **paused** leaves the timer paused, with the same remaining time, and
      does not auto-resume.
- [ ] 25. The change does not fire, re-arm, suppress or re-schedule the session-end chime: a session
      whose settings changed mid-run still chimes once at zero, at the same time as a control run.
- [ ] 26. No gauge code path writes to the timer store. Checked by grep on the gauge components for
      timer store setters.

### F. Accessibility and keyboard

- [ ] 27. The on/off control exposes `role="switch"` (or a native checkbox with that role) with
      `aria-checked` reflecting state, and a programmatically associated label reading "Show timer
      gauge".
- [ ] 28. Switch state is not conveyed by colour alone: in forced-colors and in greyscale, on and off
      are distinguishable by shape, position or glyph. Named in the log with which cue carries it.
- [ ] 29. The style selector is a radio group (native radios in a `fieldset`/`legend`, or
      `role="radiogroup"` with proper roles) with a group label, and exactly one option selected.
- [ ] 30. Keyboard: Tab reaches the switch; Space/Enter toggles it; Tab reaches the radio group;
      Left/Right/Up/Down moves selection between options and selects; the selected option is the only
      tab stop within the group. Every step shows a visible focus ring.
- [ ] 31. Each option's accessible name includes its style name ("Vessel", "In the digits"). Previews
      are `aria-hidden` graphics; no preview contributes text to the accessible name.
- [ ] 32. **While the gauge is on**, selected state does not rely on colour alone: a check mark (or
      equivalent non-colour cue) plus an outline, verified in greyscale and in forced-colors.
- [ ] 33. When the gauge is off, the selector is disabled or collapsed but still present and
      discoverable — not removed from the DOM.
- [ ] 33b. **While the gauge is off, no option shows the selected highlight** (owner ruling
      2026-11-19): neither the check mark, the outline, nor a selected-only background appears on any
      card, so the group reads as inactive rather than as "this one is active". The stored `gaugeStyle`
      is unchanged by this — it is a presentation rule only, and criteria 14 and 18 still hold: turning
      the gauge back on re-shows the highlight on the previously selected style. Checked at both
      `gaugeEnabled` states without a reload between them.
- [ ] 34. A visible line explains the disabled state (for example "Turn on the gauge to choose a
      style."), it is linked from the selector via `aria-describedby`, and it is reachable: if
      `aria-disabled` is used the group keeps a tab stop so a screen-reader user hears the
      explanation. Verified by keyboard with the gauge off.
- [ ] 35. No `role="progressbar"` and no live region is added for gauge progress; mm:ss stays the only
      announced source of truth. A screen-reader pass confirms nothing announces per tick.
- [ ] 36. `axe` scan of `/settings` with the gauge on and again with it off: zero violations.
- [ ] 37. The switch and each preview card have a ≥44×44 CSS-px activation target, measured from the
      rendered rect of the clickable element (the label wrapper counts; the `sr-only` input does not).

### G. Reduced motion

- [ ] 38. Under `prefers-reduced-motion: reduce`, previews show no motion at all, including on hover
      and focus: the painted preview is pixel-identical before and during hover/focus.
- [ ] 39. Under `prefers-reduced-motion: reduce`, the live gauge shows no slosh, spring or transition
      animation; it still updates its level as time passes, and reaches the same level as the
      unreduced run at the same remaining time.
- [ ] 40. With motion allowed, the live gauge still animates (the reduced-motion rule is not applied
      unconditionally): two samples ≥300 ms apart during a running session differ.

### H. Measurement group — contrast and small-viewport layout

Run this group **after** any token change in this task, once. Dark is the only theme (task 019), so
there is one theme to measure. Every figure recorded must name the painted pixel it came from, the
ground behind it, and the screenshot it was read from.

- [ ] 41. Contrast of the live gauge against the pixel painted directly behind it is ≥3:1 for
      graphical objects, measured at the gauge's **fully covered** pixel, never its antialiasing
      fringe (DECISIONS 2026-10-27). Measured per style, with no uploaded background, on `/`.
- [ ] 42. Same ≥3:1 for each preview card's gauge against the card's own ground on `/settings`,
      measured at the same kind of fully-covered pixel.
- [ ] 43. **Worst case over an uploaded background, derived not swept.** Black and white uploads bound
      luminance, not contrast (DECISIONS 2026-10-28): a fixed gauge colour loses most contrast against
      a ground at its *own* luminance, which sits between the extremes. So: compute the gauge colour's
      relative luminance, construct the single flat upload whose **composited** ground luminance lands
      nearest it — accounting for the background painting at half opacity over `--background`
      (DECISIONS 2026-11-12) — and measure there. Record the computed target luminance, the upload
      used, and the measured ratio. Measure the two extremes (flat white, flat black) only as a check
      that the derived case is the worse one. Three measurements per style, not a sweep.
- [ ] 44. If criterion 43 measures below 3:1, the shortfall is recorded in the log with its figure and
      the orchestrator rules on the fix before any token moves. Do not silently re-point a token.
      **Ruled 2026-11-19 — invoked and discharged.** Glyph measured 2.45:1 (accent) and 1.64:1 (muted)
      over the derived upload; vessel passed at 3.23:1 everywhere. Owner ruling: **the glyph shortfall
      is deferred to task 020**, not fixed here. Reason: the glyph tones *are* the timer's own digits,
      which have had no measured ground since the frosted panel was retired (DECISIONS 2026-11-12), and
      `docs/PLAN.md:114` records that ground as built, rejected on its look, and deferred to
      [020](020-contrast-ground-over-backgrounds.md) — still `status: draft`. Fixing it inside 022 would
      re-open a design question the owner has already settled, inside a task scoped to settings.
      So for 022: **criterion 43 gates on `vessel` only.** Glyph's figures are recorded in the log's
      measurement record as 020's inherited evidence and are not a 022 gate. No token moved.
      Severity note: `gaugeEnabled` now defaults to `false`, so reaching this requires opting the gauge
      in *and* uploading a bright image.
- [ ] 45. At 390 px width: the preview grid is 1-2 columns, cards are equal size, nothing overflows
      horizontally (`document.scrollingElement.scrollWidth === clientWidth`), and the switch, the
      explanation line and every card are fully visible without horizontal scroll.
- [ ] 46. At ≥1024 px the grid is exactly **two** columns (owner ruling 2026-11-19: two styles exist, so
      a three-column track would leave a visibly empty cell) and the two cards have identical rendered
      rects. A third style added later may widen the grid; this task does not pre-build for it.

### I. Gates and test hygiene

- [ ] 47. `npm run lint`, `npm run typecheck`, `npm run build` and `npm run test` all pass. Note that
      the dead `TimerGauge` import in `TimerDisplay.tsx:5` is resolved by this task either by use or by
      removal.
      **`npm run test:e2e` — ruled 2026-11-19: "no new failures", not "all green."** A clean-HEAD
      baseline built at `6f4bdb9` fails **112** Playwright tests with none of this task's code present,
      so the suite is already broken on `main`. 022 passes this criterion when its tree fails no more
      than that baseline. Making 022 repair 112 unrelated failures would fold an unscoped repo repair
      into a settings task. The baseline figure is recorded so the next task inherits a number rather
      than a surprise; triaging it is its own future task.
- [ ] 48. The existing specs that assert the pre-`41cd33f` gauge — `e2e/timer-gauge.spec.ts`,
      `e2e/settings-gauge-style.spec.ts`, `components/TimerGauge.test.tsx`,
      `components/TimerGauge.tokens.test.ts`, `lib/preferences/gauge-style.test.ts`,
      `lib/preferences/schema-v3.test.ts` — pass. Any assertion weakened or deleted is named in the QA
      Report with the reason; silent deletion fails this criterion.
- [ ] 49. New tests do not pass vacuously: no test with zero assertions, none asserting only that a
      component rendered.
- [ ] 50. Unit coverage exists for the `3 → 4` migration and the unknown-style fallback; a component
      test enumerates the typed style list against previews and renderers; e2e covers toggle off/on,
      selecting each style, reload, and a mid-session settings change.

## Files likely touched

- `components/SettingsPanel.tsx` — the current radio fieldset (lines 51-69) becomes the new section, or
  delegates to a new component.
- `components/TimerDisplay.tsx` — dead `TimerGauge` import; owns the `glyph` overlay and the
  `--gauge-surface` / `--gauge-lean` write.
- `components/TimerGauge.tsx` — the live renderer to re-wire; currently rendered nowhere.
- New presentational gauge component plus a preview-card component under `components/` (frontend names
  them; PascalCase).
- `lib/preferences/schema.ts` — `gaugeEnabled`, `PREFERENCES_VERSION = 4`, sanitize/isPreferences/migrate.
- `lib/preferences/store.ts` — the new setter and the `migrate` branch.
- `lib/preferences/index.ts` — re-exports.
- `lib/preferences/boot-script.ts` — **only if** criterion 11 cannot be met by hydration gating alone.
- `components/SloshGauge.tsx` — **avoid editing if possible** (see Risks).
- Tests (`qa` only): the six files named in criterion 48, plus `e2e/helpers/background.ts` seeds.

## Risks

- **Licensing.** `components/SloshGauge.tsx` is vendored ReactBits under **MIT + Commons Clause**
  (DECISIONS 2026-10-19), and its header already lists six local edits that
  `components/settings-surface.tokens.test.ts:60-65` asserts. Keeping it as the `vessel` renderer is
  unchanged use of an already-accepted dependency. Editing it means updating that header and the test;
  re-vendoring or copying it into a new file is out of scope. See Open Question 2.
- **`glyph` is not a standalone component.** It is CSS on the timer's own digits
  (`TimerDisplay.tsx:27-33`), fed by a spring that lives in `SloshGauge` via `onPaint`. A "one
  presentational component, two variants" shape has to carry the digits layer for `glyph` to be
  previewable at all. See Open Question 3.
- **Migration blast radius.** `PREFERENCES_VERSION` is read by the pre-hydration boot script and seeded
  by several e2e helpers at `version: 1`. The per-key fallback in `sanitizePreferences` should absorb
  this, but criterion 15 exists because it is the likeliest silent breakage.
- **Measurement ordering.** Criteria 41-46 are the expensive group. Settle any token move first
  (see Scope) so they run once.
- **Accessibility of the disabled selector.** `aria-disabled` plus a tab stop is the only shape that
  satisfies criteria 33-34 together; `disabled` on native radios removes them from the tab order and
  makes the explanation unreachable by keyboard.

## Open Questions — all four ruled by the owner, 2026-11-19

Nothing here is open. Implement against the rulings; do not re-litigate them.

1. **"Existing users see no change" vs "default gauge on" → RESTORE, BUT OFF BY DEFAULT.**
   *(Amended later the same day — the amendment is the operative ruling.)* The gauge is re-wired and
   works, but `gaugeEnabled` defaults to `false`, so it ships dormant and the user opts in. This
   dissolves the original conflict instead of choosing a side: the restoration is real (criterion 22a)
   and existing users still see no change (criterion 22b). The earlier reading — default on, gauge
   paints for everyone — is superseded; do not implement it.
2. **Commons Clause on `SloshGauge` → already covered, no new ruling needed.** The 2026-10-19 decision
   vendored it; the clause restricts *selling*, not use, and naming the style in a picker changes
   presentation rather than licensing. Keep `vessel` as an offered style. Do not re-vendor, re-license or
   rewrite `SloshGauge.tsx`, and leave its header and the assertion at
   `components/settings-surface.tokens.test.ts:60-65` intact.
3. **Glyph preview renders sample digits → yes.** The shared presentational component may own a digits
   layer, or the glyph level may be derived from the `progress` prop directly; that choice is
   `frontend`'s. The preview shows fixed sample digits at the sample progress. The constraint that holds
   either way: no timer logic, store or hook is imported into the preview path.
4. **Grid → two columns on desktop, stacked on mobile.** See criterion 46.
