---
id: 008
slug: settings-gauge-style
status: draft # draft | in-progress | qa | review | done | blocked
---

# Settings surface, with the timer gauge style as its first preference

## Goal
Give Pomotato a settings entry point on `/` and a settings surface behind it, and put one real
preference on it: which **gauge style** the timer renders. The preference persists per device,
applies to the real timer, and survives a reload. The surface is built so milestone 4's theme
controls drop into it later without a redesign — but **no theme control ships here**.

## Provenance
**Direct owner ask**, in the owner's words:

> "I think we can add the gauge as an option and the user can choose one of these gauge slosh in
> the settings. We can add this in milestone 4 subtask, and make a settings button so we can have
> the themes (milestone 4) there."

This is **a subtask of `docs/PLAN.md` milestone 4 (Themes)**, not maintenance and not polish. It is
the surface the milestone's "visible light/dark toggle" part will live on. `docs/PLAN.md` should
gain a line under milestone 4 pointing at this file; adding that line is the orchestrator's, not
frontend's.

## Pipeline — different from 005 and 006
**backend → frontend → qa → reviewer.**

005 and 006 both skipped backend because their data shape was already decided. This task
**introduces persisted user preferences, and nothing like them exists in the repo**. Per CLAUDE.md,
backend runs first and alone; frontend does not start until the preference module and its decision
entry exist. Backend and frontend may not run in parallel here — frontend's gauge switch reads the
shape backend defines.

## Hard dependency: 006 must be closed first
`docs/tasks/006-timer-surface-tokens.md` **criterion 10** (the brief for this task called it 11)
requires `git diff --stat` to be empty for `components/TimerDisplay.tsx` and
`components/TimerGauge.tsx`. This task has to change both. If 008 starts before 006 is closed,
006's verification is invalidated and its reviewer cannot tell the two diffs apart.

**008 stays `blocked` until 006 is `done` with a Review Findings verdict.** 006 is itself blocked
on an owner decision: its QA Report fails criterion 14 (the unselected chip border and the
custom-duration input border measure 1.36:1 against the page, below the 3:1 non-text threshold,
pre-existing at HEAD; the only fixes are a visible change or an edit to the shared `--border`
token, which 006's criterion 9 forbids). **That decision is now on this task's critical path.**

007 (the task-list token sweep named inside 006) is **not** a blocker for 008. It is a blocker for
milestone 4's theme toggle, which is out of scope here.

## Two decisions already settled — record them, do not reopen

### 1. Variant 2 does not ship, not even as an option
The owner's measured prototype figures, in-browser against the cream `--background`:

| Variant | Filled part | Unfilled part | Verdict |
|---|---|---|---|
| 1. Vessel behind the digits (ships today) | 9.79:1 (digit on liquid) | 15.30:1 (digit on glass) | passes |
| 2. Pale liquid inside the glyphs | **1.49:1** | 14.55:1 | **fails AA** |
| 3. Dark liquid (`--primary`) inside the glyphs | 4.60:1 | 14.55:1 | passes, weakest |
| 4. Both tones (`--accent-foreground` / `--muted-foreground`) | 8.31:1 | 6.99:1 | passes |

Variant 2 fails AA at 1.49:1 and `DESIGN.md` states accessibility is not negotiable against
aesthetics. **Putting a failing option behind a setting does not fix it** — it ships the failure
and adds a way to reach it. No enum entry, no renderer, no dead branch.

### 2. The theme controls are not in this task
A theme toggle with no dark tokens behind it is a non-functional control, which CLAUDE.md and
`DESIGN.md` both forbid, and 006 + 007 are what make the dark tokens possible. This task builds the
surface and the gauge preference. The theme section lands with milestone 4's token work. The
surface must be built so that section can drop in without a redesign, and must **not** ship an
empty section, a disabled control, or a "coming soon" placeholder.

## A structural finding this task has to carry
In every in-glyph variant, **at level 100 and at level 0 there is no visible waterline at all** —
the digits are a single flat colour, so the "liquid" reading only exists mid-range. The vessel shows
a level at every point, because the container is always present. **Level 100 is the state the timer
sits in at the start of every session**, so an in-glyph option shows no level cue at rest.

This is not a tuning problem — glyphs have no container. It means the options are **not
cosmetically equivalent**, and the setting's labels must not pretend they are (criterion 20).

**Recorded disagreement, deliberately unresolved:** frontend's read of the prototype was that
variant 4 "reads as liquid"; the owner's read, from stills, was that it reads more like a soft
shadow. Motion may be the difference — frontend saw it with the prototype's Jolt control. Both
readings are on the record; neither is this task's to settle.

## Data shape — undecided, backend decides
The two candidate homes, both real precedents in this repo:

- **Zustand `persist`.** `lib/timer/store.ts` is the pattern: a `STORAGE_KEY`, a `STORAGE_VERSION`,
  a `migrate` for old versions, and a strict `merge` that rejects malformed persisted data rather
  than adopting it (see its comment at lines 195-202 for why `merge` and not just `migrate`).
  Well-tested, localStorage-backed, synchronous.
- **Dexie.** `lib/db/database.ts` is at `CURRENT_SCHEMA_VERSION = 2` with a frozen-version-block
  convention, and `lib/db/types.ts` already has `AppMetaRecord`, a single-row key/value table for
  "app-wide state that must change atomically with task rows", currently holding `pinnedTaskId`.

**The PM's read, for backend to validate or reject rather than accept:** these are per-device
*display* preferences, not data needing transactional consistency with task rows, so zustand
`persist` fits better than `appMeta`. The decisive argument is the **theme** preference
specifically: IndexedDB is asynchronous and cannot be read before first paint, so a Dexie-backed
theme flashes the wrong theme on every load; localStorage can be read synchronously in a blocking
inline script, which is how this is normally solved. Since this store holds the theme next, picking
the wrong home now is expensive later.

Backend decides, writes the reason into `docs/DECISIONS.md` (criterion 1), and defines the shape
with the same version / `migrate` / `merge` rigour as the timer store. If backend rejects the PM's
read, the entry must answer the first-paint argument explicitly rather than ignoring it.

## Dialog or route — settled: a route at `/settings`
`/` has two entry-point precedents: `components/TaskListDialog.tsx` (a dialog) and the `/stats` link
in `components/StatsButton.tsx` (a route). The owner said "settings button", which reads as a
dialog. **This task says route, for four reasons:**

1. **It is built to grow, and the growth is already on the plan.** Milestone 4 adds theme controls
   *and* uploaded backgrounds; milestone 5 adds a per-layer soundscape mixer; milestone 7 adds JSON
   export/import. Four unrelated sections of controls in a modal becomes a scrolling dialog.
   `/stats` is the precedent for "a surface with its own content that grows".
2. **Uploaded backgrounds, same milestone, need a file input and a preview of the page itself.** A
   modal over a scrim is a poor place to preview a background that *is* the page.
3. **Deep-linking and Back.** `/settings` is addressable and the browser Back button closes it. A
   dialog's open state is not in the URL.
4. **Side-by-side option samples.** On a route the gauge options can be shown as live samples
   without a scrim dimming the real timer behind them.

**The counter-argument, answered:** a route navigates away from a running timer. It does not lose
it — remaining time is derived from the stored end timestamp, so the timer survives navigation
exactly as it does today through the `/stats` link. Criterion 16 asserts that.

**This is overturnable without reopening the task.** The entry-point control is the same component
either way; only the thing it opens changes. If the owner prefers a dialog, say so before frontend
starts (Q1).

## Scope

**In:**
- A persisted per-device preference store, its version/migrate/validate path, and a
  `docs/DECISIONS.md` entry recording where it lives and why (backend).
- A settings control on `/`, alongside the existing tasks and stats controls.
- A settings surface at `/settings` holding exactly one preference group: gauge style.
- The in-glyph gauge rendering, implemented properly — see "Shared spring" below.
- Applying the preference to the real timer on `/`.
- Measuring the contrast of the digits, per option, per level, in a real browser.
- Deleting the throwaway prototype (criterion 39).

**Out (deferred, do not do here):**
- **Any theme control, `.dark` block, dark palette, paper grain or uploaded background.** Milestone
  4's remaining parts. Settled above.
- **Variant 2, the pale in-glyph fill.** Settled above. Not an option, not a code path.
- **Any other preference.** Sound, notifications, auto-start-next-session, long-break interval, task
  defaults, export/import — none of them. One preference ships; the surface is the point.
- Any change to timer logic, durations, mode behaviour, the persisted *timer* shape,
  `lib/timer/**`, `hooks/use-timer-clock.ts`, `hooks/use-hydrate-timer-store.ts`, `lib/stats/**`,
  `/stats`, the task list, the task-list dialog, `CurrentTaskCard`, `components/HoldButton.tsx`,
  `components/TimerControls.tsx`, `components/ModeSelector.tsx`,
  `components/CustomDurationInput.tsx` or `components/ui/mode-chip.tsx`.
- The task-list token sweep (007). Separate task, not a dependency.
- Any new runtime dependency, including a new icon library. `react-icons` and `lucide-react` are
  both already installed (Q5).
- A second gauge, a progress bar, or any other level indicator added to compensate for the in-glyph
  options showing no level at full and empty. The option's description says so instead
  (criterion 20).
- Resolving the "liquid or soft shadow" disagreement about variant 4. Recorded, not settled.
- Fixing 006's open items (the 1.36:1 borders, `--gauge-liquid`, the broken `--font-geist` token,
  `font-mono` rendering proportional). They stay with 006 and the owner.

## Shared spring: a real extraction, not a copy-paste
`components/prototype/use-local-slosh.ts` is a **copy** of `components/SloshGauge.tsx`'s spring,
made deliberately so a throwaway would not reach into a file two completed tasks depend on. Its own
header says so. Shipping the in-glyph rendering means **extracting one shared spring properly**, so
the vessel and the in-glyph renderer run the same model.

That touches the vendored `components/SloshGauge.tsx`, which per the 2026-10-15 entry in
`docs/DECISIONS.md` already carries an "edited, a future `shadcn add` is a conflict" header. The
extraction is real work with a real regression surface — task 005's QA proved the spring is not
covered by the level attribute alone (its break D: removing `s.raf = 0` from unmount cleanup broke
the drawn liquid while every `data-gauge-level` test still passed). Criteria 36-38 exist for that.

## Acceptance Criteria

### A. Gate and order
- [ ] 1. `docs/DECISIONS.md` has a new entry recording: which home the preference store uses
      (zustand `persist` or Dexie `appMeta`), the reason, and an explicit answer to the first-paint
      argument above (whether a synchronous pre-paint read is needed for the theme that lands next,
      and how the chosen home provides or forgoes it). If backend may not edit that file, it drafts
      the wording in Implementation Notes and the orchestrator lands it; the task is not `done`
      until the entry is in the file.
- [ ] 2. Backend's work landed before frontend touched any component. Implementation Notes record
      the order, and frontend's notes name the exact module and exported type it consumed.
- [ ] 3. `docs/tasks/006-timer-surface-tokens.md` is `status: done` with a Review Findings verdict
      recorded, as of the start of this task. QA states the verdict it saw.

### B. The persisted preference (backend)
- [ ] 4. The preference persists per device and survives a reload and a new tab in the same browser.
- [ ] 5. The stored value for gauge style is a **stable string identifier from a closed set declared
      in one module**. Nothing persisted is a colour value, a class name, a component reference or a
      numeric index into an array. QA reads the stored payload and confirms.
- [ ] 6. The persisted shape carries a storage key, a version constant, a `migrate` for older
      versions and a validating step that runs on **every** load regardless of version (the `merge`
      role in `lib/timer/store.ts`, or the equivalent for whichever home is chosen).
- [ ] 7. Malformed persisted data falls back to defaults rather than being adopted, and never
      throws. Unit tests cover each of: an unknown gauge-style identifier, a wrong-typed value, a
      missing key, a payload from a *newer* version, a payload from an *older* version, a payload
      that is not an object, and unparseable JSON. Each case yields the default and leaves the app
      usable.
- [ ] 8. **An older payload missing a key hydrates that key to its default rather than discarding
      the whole payload.** Tested. This is what makes adding the theme key in milestone 4 cheap;
      Implementation Notes state in one or two sentences what adding that second key will require
      (a version bump? a `migrate` entry? neither?).
- [ ] 9. **The default for a user with no stored preference is the vessel** — exactly what `/`
      renders today — so no existing user's screen changes until they choose. If the owner overturns
      this (Q2), the change of default is treated as a migration and gets its own entry in the
      decision log.
- [ ] 10. Reading the preference during the first client render produces **no React hydration
      mismatch** on `/` or on the settings surface, with the timer idle, running and paused, for
      each shipped option.
- [ ] 11. If the chosen home is **not** Dexie, `git diff --stat` is empty for `lib/db/`. If it **is**
      Dexie, `lib/db/database.ts` follows its own frozen-version-block convention — a new
      `.version(n)` block beside the existing ones, `tasks`/`appMeta`/`sessions` not restated,
      `CURRENT_SCHEMA_VERSION` bumped, `SCHEMA_VERSION` untouched — and the upgrade is tested
      against a database populated at version 2.
- [ ] 12. `git diff --stat` is empty for `lib/timer/`, `lib/stats/`, `hooks/use-timer-clock.ts` and
      `hooks/use-hydrate-timer-store.ts`. The preference store is separate from the timer store.

### C. The entry point on `/`
- [ ] 13. `/` carries **exactly one** settings control, and it is a real control (a `<button>` or a
      link), not a div with a click handler.
- [ ] 14. Its accessible name is exactly `Settings`. If it is icon-only, the name comes from
      `sr-only` text or an `aria-label`, and QA asserts the computed accessible name by value, not
      by presence of an attribute.
- [ ] 15. It is reachable by Tab in an order matching visual order, shows the app's focus indicator
      (2 px outline, 2 px offset, resolving to `--ring`), and is at least 44 × 44 px at 320 px and
      1280 px. QA measures width, offset and colour.
- [ ] 16. Activating it reaches the settings surface, and **the timer is unaffected**: a running
      timer is still running on arrival and on return, its remaining time is continuous across the
      navigation (within 1 s of the elapsed wall time), and the persisted timer state — `status`,
      `endTimestamp`, `pausedRemainingMs`, `runId` — is byte-identical before and after. The same
      guarantee the existing `/stats` link already provides.
- [ ] 17. Browser Back from the settings surface returns to `/` with the timer still running and the
      preference still applied. (If Q1 is overturned to a dialog, this becomes: Escape and the close
      control both dismiss it, focus returns to the settings control, and the timer is unaffected.)
- [ ] 18. `git diff package.json package-lock.json` is empty. No new dependency, including no new
      icon library.

### D. The settings surface
- [ ] 19. The surface has a heading that names it, and presents the gauge preference as a **labelled
      group of mutually exclusive options built from native radio inputs**, with a group label. No
      ARIA-constructed `role="radiogroup"`, no Radix `ToggleGroup type="single"` — the 2026-10-19
      entry in `docs/DECISIONS.md` rejected both for this project, and the reasoning (CLAUDE.md:
      semantic HTML before ARIA) applies identically here.
- [ ] 20. **Every option's visible label and one-line description says what that option actually
      does**, and the in-glyph options' descriptions state that they show no level when the timer is
      full and when it is empty. No label implies the options are equivalent. No option is described
      only by a cosmetic adjective ("classic", "sleek", "modern") with no statement of behaviour.
- [ ] 21. The shipped option set is **exactly the vessel plus the owner-approved in-glyph option(s)**
      from {in-glyph dark (variant 3), in-glyph two-tone (variant 4)} — see Q3. Every shipped option
      is selectable and renders.
- [ ] 22. **Variant 2 is absent from the shipped code**: no option, no identifier, no renderer, no
      unreachable branch, no commented-out block. QA greps for the pale-liquid pairing
      (`--gauge-liquid` as a glyph fill against `--foreground` as the unfilled part) and finds
      nothing.
- [ ] 23. The surface contains **no theme control, no disabled control, no empty section and no
      "coming soon" placeholder**. Every control on it changes something now. QA enumerates every
      interactive element on the surface and confirms each one acts.
- [ ] 24. Selecting an option applies it to the **real timer**: after returning to `/`, the timer
      renders the chosen style, and the choice survives a reload and a new tab.
- [ ] 25. Changing the option **mid-session does not alter timer state**: with the timer running and
      again with it paused, `status`, `endTimestamp`, `pausedRemainingMs`, `runId` and the rendered
      `mm:ss` are unchanged, the observed level is the same before and after, and no session row is
      written.
- [ ] 26. The surface is operable by keyboard alone end to end: reach the settings control from `/`,
      open it, move within the radio group with arrow keys, change the option, and return. Tab
      enters the group once and lands on the checked radio (native radio behaviour, as in
      `ModeSelector`).
- [ ] 27. No axe-core violation of serious or critical impact: on the settings surface at 320 px and
      1280 px, and on `/` with each shipped option active in each timer status (idle, running,
      paused, complete).
- [ ] 28. At 320 px and 1280 px the settings surface has no horizontal page scroll
      (`document.documentElement.scrollWidth <= clientWidth`) and every control on it is at least
      44 px in both dimensions.

### E. The readout stays the accessible source of truth
- [ ] 29. For **every** shipped option, the `mm:ss` readout is the single accessible source of truth:
      exactly one node announces the remaining time, the gauge or fill adds no second rendered
      number, and no second announcement of the same value exists. This must hold for the in-glyph
      options, where the fill is *inside* the accessible text.
- [ ] 30. For every shipped option, the remaining time is **real text in the accessibility tree**:
      the computed accessible name / text content of the readout equals the rendered `mm:ss` string
      exactly, it is not an image or a canvas, and it is not split per character in a way that
      changes the announced or copied string.
- [ ] 31. **Forced-colors and background-image safety.** With Playwright's
      `emulateMedia({ forcedColors: "active" })`, and separately with background images unavailable,
      the digits remain visible and legible for every shipped option. A rendering that makes the
      digits transparent and relies on a painted background to show them **fails this unless it
      carries a fallback**. QA asserts the painted digit pixels differ from the painted page
      background in both conditions.
- [ ] 32. **Measured contrast, per option, per level.** For each shipped option, at levels 100, 75,
      50, 25 and 0, the filled part of the digits, the unfilled part, and the waterline region all
      measure **≥ 4.5:1** against what they are painted on. Figures come from painted pixels in a
      real browser, not from arithmetic on token values — the 005 and 006 precedent is that
      arithmetic was off by up to 2.7 points. QA records its figures next to the owner's prototype
      table and explains any difference over 0.5.
      (The digits render at 60-96 px, so WCAG's 3:1 large-text threshold would technically apply.
      This task holds them to 4.5:1 anyway, so the figures stay comparable with the owner's
      prototype table and the 005 measurements.)
- [ ] 33. **The structural fact is asserted, not treated as a bug.** For each in-glyph option, at
      level 100 and at level 0 the two parts of the digits paint the *same* colour (no visible
      waterline), and at level 50 they paint *different* colours. QA states this as expected
      behaviour and confirms it matches the option's description under criterion 20.
- [ ] 34. **`prefers-reduced-motion: reduce`**: every shipped option still renders the correct level
      and still updates as time passes, with lean, bounce and overshoot suppressed; criterion 32's
      ratios are re-measured under reduced motion and still hold. Each reduced-motion assertion is
      paired with a default-motion equivalent so it cannot pass vacuously.

### F. Gauge behaviour and the shared spring
- [ ] 35. **Task 005's gauge guarantees still hold, for every shipped option**: the level matches the
      derived remaining time at three sampled points per mode (full at start, 50 ± 2 at half, 0 at
      completion); pause freezes the level for 3 s and resume continues from it; a mode switch or a
      custom-duration change re-bases it against the new full duration; a session that expired while
      the tab was closed renders at empty on load without animating down from full.
      `e2e/timer-gauge.spec.ts` passes with no assertion weakened, and the vessel's 9.79:1 / 15.30:1
      figures still reproduce.
- [ ] 36. **One spring implementation ships.** The vessel and the in-glyph renderer consume the same
      module. QA asserts there is no second copy of the spring's constants or integration loop
      anywhere in `components/`, `hooks/` or `lib/` (the prototype's constants — `1224`, `1044`,
      `TILT_GAIN`, `REST_POS`, `REST_VEL` — appear in exactly one file).
- [ ] 37. If `components/SloshGauge.tsx` is edited or has code moved out of it, its header comment is
      updated to list the new edits and still states that a future
      `shadcn add @react-bits/SloshGauge-TS-TW` is a conflict, per the 2026-10-15 entry in
      `docs/DECISIONS.md`.
- [ ] 38. **The extraction is behaviour-preserving.** `components/TimerGauge.test.tsx` and
      `hooks/use-resolved-tokens.test.tsx` pass with no assertion changed. QA break-and-restore:
      break the shared spring once and confirm that **both** a vessel test and an in-glyph test
      fail, then restore and verify the file hash. (Task 005's break D showed the level attribute
      alone does not cover the spring.)
- [ ] 39. `app/prototype/` and `components/prototype/` no longer exist. QA confirms by path, not by
      `git diff` — the prototype is untracked, so a diff will not show its removal.
- [ ] 40. **No perpetual idle loop, per option.** With the timer idle, paused or complete, and after a
      1 s settle, zero `requestAnimationFrame` callbacks over the next 1 s, for each shipped option.
      Running is allowed to be non-zero (positive control).
- [ ] 41. **No new time source.** Remaining time is still derived from the stored end timestamp. The
      diff adds no `setInterval`, no `setTimeout` chain and no `requestAnimationFrame` counter
      outside the one shared spring. The existing timer-source guard
      (`components/TimerGauge.tokens.test.ts`, extended by 006 to `TimerSurface.tokens.test.ts`) is
      extended to every file this task adds, and passes.

### G. Tokens and dark-readiness (inherited from 006, non-negotiable)
- [ ] 42. Every file this task adds or changes contains **zero** raw palette utilities (the regex
      006's criterion 1 pins, including `white`, `black` and `/NN` opacity suffixes), zero
      `#rrggbb` / `rgb(` / `rgba(` / `hsl(` / `hsla(` / `oklch(` / `oklab(` literals, and no inline
      `style` carrying a colour. Every colour resolves through a semantic token from
      `app/globals.css` or a `color-mix()` of such tokens.
- [ ] 43. The guard test from 006 (`components/TimerSurface.tokens.test.ts`) is extended to every
      file this task adds, with empty pinned lists. QA proves it live by break-and-restore.
- [ ] 44. Any new CSS custom property in `app/globals.css` carries the three-part reason comment
      006's criterion 8 requires: the role it serves, why no existing token fits, and that
      milestone 4 must give it a dark value. `git diff app/globals.css` contains nothing but such
      additions — no edit to the `body` rule, the unlayered `:focus-visible` rule, the `@layer base`
      block, any `@theme inline` mapping, or any existing token value.
- [ ] 45. The settings surface is **dark-ready**: no colour on it only works on cream, and a future
      `.dark` block can theme it without restyling. This is DESIGN.md's stated premise for every new
      surface and the reason this task sits inside milestone 4.

### H. Regression and gates
- [ ] 46. `npm run lint` (0 errors; warnings not above the 21 baseline), `npm run typecheck`,
      `npm run build`, `npm run test` and `npm run test:e2e` all succeed. QA states the vitest and
      Playwright counts and the baselines it compared against.
- [ ] 47. Existing suites pass with **no assertion weakened**: `e2e/timer.spec.ts`,
      `e2e/timer-gauge.spec.ts`, `e2e/hold-reset.spec.ts`, `e2e/hold-label-contrast.spec.ts`,
      `e2e/mode-selector-legend.spec.ts`, `e2e/timer-surface-tokens.spec.ts`, `e2e/sessions.spec.ts`,
      `e2e/task-list.spec.ts`, `e2e/task-list-dialog.spec.ts`, `e2e/accessibility.spec.ts`,
      `e2e/stats.spec.ts`. Any changed assertion is listed in the QA Report with its reason, in the
      shape 006's QA Report used for `hold-reset.spec.ts`.
- [ ] 48. Milestone 3 logging is unaffected **under every shipped option**: a completed focus run
      still writes exactly one session row and still takes a pinned task's `completed` up by exactly
      one, with no double counting. A reset run still logs nothing.
- [ ] 49. Zero console errors or warnings, at 320 px and 1280 px, across: load, start, pause, resume,
      short tap on Reset, completed hold on Reset, completion, mode switch, opening settings,
      changing the option, returning to `/`, and reload.
- [ ] 50. No `any` in new or changed code. Functional components with named exports (CLAUDE.md).
- [ ] 51. New tests cannot pass vacuously — none of the four shapes recorded in the 2026-10-09 and
      2026-10-15 entries in `docs/DECISIONS.md` (an assertion inside `try`/`if`/`else`, an observer
      that may never attach, a `toBeVisible()` on something already true, a test with zero
      assertions).
- [ ] 52. QA breaks the implementation, confirms the test fails, and restores it (hash-verified), for
      at least four criteria: malformed-preference fallback (7), the preference reaching the real
      timer (24), forced-colors legibility (31), and the shared spring (38).
- [ ] 53. Implementation Notes record, before QA starts: the chosen storage home with its version /
      migrate / validate shape and the exported type names; every shipped option identifier and
      which prototype variant it corresponds to; where the settings surface lives and its URL; **how
      QA observes the active option** (a named `data-*` attribute, in the shape of task 005's
      `data-gauge-level`); which module holds the shared spring; and the measured contrast per
      option per level.

## Files likely touched
**Backend:**
- A new module under `lib/` for the preference store (path is backend's call; `lib/preferences/` is
  the obvious sibling to `lib/timer/` and `lib/db/`) — the shape, the enum of option identifiers,
  the version/migrate/validate path.
- `lib/db/database.ts`, `lib/db/types.ts` — **only** if criterion 1's decision chose Dexie.
  Otherwise untouched.
- `docs/DECISIONS.md` — the storage decision (or a draft in Implementation Notes for the
  orchestrator to land).

**Frontend:**
- `app/settings/page.tsx` — the route.
- A settings-surface component under `components/` (PascalCase, named export).
- A settings entry-point component under `components/`, alongside `components/StatsButton.tsx`.
- `widgets/BottomControls.tsx` — where the entry point joins the existing tasks/stats cluster. See
  Q5: `widgets/` is an uncommitted in-flight owner edit and is not in CLAUDE.md's folder structure.
- `components/TimerGauge.tsx` — reads the preference, renders the chosen option.
- `components/TimerDisplay.tsx` — the in-glyph options paint the digits, which live here.
- `components/SloshGauge.tsx` — the spring extraction; header comment updated (criterion 37).
- A shared spring module (`hooks/use-slosh.ts` or a sibling of `SloshGauge.tsx`) — frontend picks and
  records.
- `app/globals.css` — **only** if a role genuinely has no token, and only as an addition.
- **Deleted:** `app/prototype/glyph-slosh/page.tsx`, `components/prototype/GlyphSloshLab.tsx`,
  `components/prototype/use-local-slosh.ts`, `components/prototype/contrast.ts`, and both now-empty
  directories.

**QA only:** `components/*.tokens.test.ts`, `components/*.test.tsx`, `lib/**/*.test.ts`, `e2e/**`.

**Not touched:** `lib/timer/**`, `lib/stats/**`, `lib/db/task-repository.ts`,
`lib/db/session-repository.ts`, `hooks/use-timer-clock.ts`, `hooks/use-hydrate-timer-store.ts`,
`app/stats/**`, `components/TimerControls.tsx`, `components/HoldButton.tsx`,
`components/ModeSelector.tsx`, `components/CustomDurationInput.tsx`, `components/ui/mode-chip.tsx`,
`components/Task*.tsx`, `components/CurrentTaskCard.tsx`, `components/Stats*.tsx`,
`components/ui/dialog.tsx`, `components/ui/button.tsx`.

## Open questions for the owner
Recorded here, not answered by this task. Q4 blocks the start; the rest do not.

1. **Dialog or route?** Settled as a route at `/settings`, with the reasoning above. Overturnable
   before frontend starts without reopening the task — the entry-point control is the same either
   way.
2. **What is the default gauge style, and does changing it count as a migration?** Criterion 9
   defaults to the vessel, so nobody's screen changes until they choose. If the owner wants an
   in-glyph option as the default, that silently changes the appearance of `/` for every existing
   user on their next load, which this project treats as a migration: it needs its own decision-log
   entry and its own test that an existing stored preference is respected over the new default.
3. **Do variant 3 and variant 4 both ship?** Variant 3 is the weakest passing ratio (4.60:1) and
   frontend called it "the least elegant". Variant 4 measures 8.31:1 / 6.99:1 and is the stronger
   candidate, but the owner and frontend disagree on whether it reads as liquid or as a soft shadow
   (see above). Shipping both gives the owner the comparison in the real app; shipping only
   variant 4 gives two options total and a smaller surface to test. **Default assumption if the
   owner does not answer: vessel + variant 4 only.** Criterion 21 holds either way, and criterion 5
   makes adding the other one later an enum entry plus a renderer, not a redesign.
4. **Still unanswered from 006: criterion 14, the 1.36:1 chip and input borders.** 008 is blocked
   behind 006, and 006 is blocked behind this decision, so it is now on 008's critical path. The
   options are a darker border (a visible change, against 006's zero-visual-change bar) or an edit
   to the shared `--border` token (006's criterion 9 forbids it in that task).
5. **The uncommitted `widgets/` edit, and the icon library.** The working tree has an in-flight owner
   edit that `docs/` has not caught up with, and the settings button lands in the middle of it:
   - `widgets/` is a new top-level folder that CLAUDE.md's "Folder structure" section does not list.
     Does it stay, and if so should CLAUDE.md name it? The settings entry point has to go somewhere.
   - `components/StatsButton.tsx` uses a **default** export (CLAUDE.md requires named exports) and
     carries `bg-neutral-200`, a raw palette class that 006's survey did not count because the file
     is untracked. Should the settings button copy that shape for consistency, or follow CLAUDE.md?
     This task assumes CLAUDE.md, and leaves `StatsButton.tsx` alone.
   - `react-icons@^5.7.0` is in `package.json` alongside `lucide-react@^1.52.0` (shadcn's own icon
     library). Two icon libraries for one app. Which is the project's? Criterion 18 forbids adding a
     third; it does not pick between these two.
6. **Does the prototype get deleted here?** Criterion 39 says yes, and the reason is concrete: it is
   a route, so `/prototype/glyph-slosh` is reachable in a production build and renders a failing-AA
   variant, and `use-local-slosh.ts` becomes a duplicate of the shared spring the moment that lands.
   If the owner wants it kept as reference, say so and it moves to Q-status — but then it needs to
   be unreachable in a production build, which is extra work this task has not scoped.

## Risks
- **Starting before 006 closes invalidates 006.** The single highest-risk item, which is why it is
  criterion 3 and not a footnote. 006's criterion 10 pins `TimerDisplay.tsx` and `TimerGauge.tsx`
  byte-identical, and this task changes both.
- **Picking the wrong storage home is expensive later, not now.** A Dexie-backed theme preference
  cannot be read before first paint, so it flashes the wrong theme on every load — and the fix is
  to move the store, after the theme UI is built on top of it. This is the whole reason backend runs
  first instead of frontend inventing a `useState`.
- **Migration.** There is no existing preference data, so there is nothing to migrate *today*. The
  risk is the opposite one: shipping a shape with no version or no validating step, so that
  milestone 4's second key, or a hand-edited localStorage entry, has no safe path. Criteria 6-8 are
  the mitigation, and `lib/timer/store.ts` is the worked example.
- **Accessibility: the fill is inside the accessible text.** The in-glyph variants paint the
  remaining time itself. Three distinct failure modes: a second announcement of the same value; a
  readout that is no longer text (so it cannot be copied, zoomed or announced); and — the one most
  likely to be missed — **transparent digits that vanish under `forced-colors: active` or when
  background images do not paint**, leaving no timer on screen at all. Criteria 29-31.
- **The options are not cosmetically equivalent, and the labels are where that gets lied about.** At
  level 100 (every session's starting state) and level 0 an in-glyph option shows no level. If the
  labels read as four flavours of the same thing, the user picks one and quietly loses the feature
  they thought they were choosing. Criterion 20.
- **Contrast measured by arithmetic is not measurement.** 005 quoted 10.78:1 and 16.84:1 from token
  values; painted pixels later gave 9.79:1 and 15.30:1. 006 found the project's Tailwind palette is
  OKLCH, so palette utilities and token hexes differ by several RGB units. Criterion 32 requires
  painted pixels.
- **The spring extraction has a regression surface the level attribute does not cover.** Task 005's
  QA break D proved it: removing one line from `SloshGauge`'s unmount cleanup broke the drawn liquid
  in dev while every `data-gauge-level` test still passed. Criterion 38 requires the break to fail a
  test in both renderers.
- **Editing vendored source.** `components/SloshGauge.tsx` is ReactBits (MIT + Commons Clause) and
  already edited. Moving code out of it makes a future `shadcn add` a worse conflict, not a better
  one. The header comment is the only thing standing between that and a silent overwrite.
- **Performance.** A page a student keeps open for hours. Two gauge renderers must not mean two
  animation loops, and an idle timer must schedule no frames at all (criterion 40). The gauge's
  per-snapshot `getComputedStyle` (reviewer's R-5 on task 005) is pre-existing and out of scope;
  do not make it worse by adding a second subscriber per render.
- **Licensing.** No audio, fonts, images or binaries are added by this task. If any appear they must
  be original or CC0 with provenance in `docs/DECISIONS.md`. No new icon library (criterion 18,
  Q5).
- **The working tree is not clean.** `app/page.tsx`, `app/layout.tsx`, `widgets/`,
  `components/StatsButton.tsx`, `components/prototype/` and `package.json` all carry uncommitted
  in-flight owner edits, and task 005 is complete but uncommitted. Task 005's QA already lost time
  to `CurrentTaskCard.tsx` edits failing 12 unrelated e2e tests. QA should establish and state its
  baseline against the working tree it was handed, not against `HEAD`, and say which failures
  pre-date this task.
- **Next.js version.** Per `AGENTS.md`, frontend reads the relevant guide in
  `node_modules/next/dist/docs/` before writing the new route — this is the first route added since
  `/stats` and the App Router conventions in training data may not match this version.
- **antislop.** Tasks 005 and 006 record the session mode as `during (session override)`, supplied by
  the owner through the orchestrator. Frontend should confirm that still holds, announce
  `antislop active: during (session override).` before its first UI edit, and run the Delivery Gate
  before handing over. The option labels and descriptions under criterion 20 are copy work and go
  through `antislop-copywriting`.

## Observations (not criteria, not scope)
- `components/StatsButton.tsx` renders a `<Link>` inside a `<Button asChild>` wrapped in a bare
  `<div>`, with `h-9 w-9` (36 px) — below the 44 px target size that every other control on `/` is
  held to, and below what criterion 15 requires of the settings control. Untracked owner edit, not
  this task's file; mentioned so the inconsistency is on the record.
- `components/TaskListDialog.tsx`'s trigger is also `h-9 w-9`, and carries `text-white` /
  `hover:text-white` — raw palette classes inside a file 006 listed as untouched. Same note.
- `components/CurrentTaskCard.tsx:4` still imports `TaskColorDot` without rendering it, and line 6
  carries `border border-none bg-none`. Carried over from 006's observations; still true.

## Implementation Notes
(Filled in by backend, then frontend, as they build. Criterion 53 lists what must be here before qa
starts. Backend records its storage decision and the exported type names first; frontend records the
option identifiers, the surface's URL, the observation attribute, the spring module and the measured
contrast table.)

## QA Report
(Filled in by qa.)
- Verdict: PASS | FAIL
- Tests added:
- Repro steps for any failure:

## Review Findings
(Filled in by reviewer.)
- Verdict: APPROVE | CHANGES REQUESTED
- Findings:
