---
id: 008
slug: settings-gauge-style
status: done # draft | in-progress | qa | review | done | blocked
---

# Settings surface, with the timer gauge style as its first preference

> **Refreshed 2026-10-26.** Drafted before 006, 007 and 009 landed. Criteria that survived keep their
> original numbers (DECISIONS and PLAN reference 1, 5 and 18 by number), so the gaps are deliberate —
> 53 criteria became 36. See the note at the bottom for every change and every cut.

> **History for this task** — implementation notes, QA reports, review findings and
> orchestrator rulings live in [logs/008-settings-gauge-style-log.md](logs/008-settings-gauge-style-log.md). Read it only when a
> criterion below is disputed; it is not an input to implementing them.

## Goal
Give Pomotato a settings entry point on `/` and a settings surface behind it, and put one real
preference on it: which **gauge style** the timer renders. The preference persists per device,
applies to the real timer, and survives a reload. The surface holds the gauge style and later
preferences; **no theme control ships here, and none moves here** (owner decision 2026-10-26).

## Provenance
**Direct owner ask**, in the owner's words:

> "I think we can add the gauge as an option and the user can choose one of these gauge slosh in
> the settings. We can add this in milestone 4 subtask, and make a settings button so we can have
> the themes (milestone 4) there."

Milestone 4's fourth sub-item, and the next unchecked one. The "so we can have the themes there" half
was **overruled on use** after 009 shipped the theme control — see below. PLAN.md already points at
this file and already records that amendment.

## Pipeline — **backend → frontend → qa → reviewer**
Backend's job is much smaller than the original draft assumed: 009 built the preference module, so
backend **adds one key** to `lib/preferences/` rather than designing a store. Frontend does not start
until that key, its value set and its setter exist. Not parallel.

## Dependencies — all clear
006 is `done` (closed by the orchestrator's 2026-10-21 closure note; its Review Findings section was
left as the unfilled template). Its criterion 10 pinned `components/TimerDisplay.tsx` and
`components/TimerGauge.tsx` byte-identical and this task changes both — that pin stopped binding when
006 closed. Its criterion 14 (the 1.36:1 chip and input borders) was **relocated, not failed**: 007
added `--control-border` and 009 gave it a dark value, now **3.44:1 light / 3.80:1 dark**
(`app/globals.css:55-67, 149-152`). **Q4 is answered and off the critical path.** 007 and 009 are
`done`. Nothing blocks this task.

## Settled, do not reopen

### 1. Only two options ship: the vessel and the in-glyph two-tone (variant 4)
The owner's prototype figures, **kept as provenance only — do not requote them as measured**:

| Variant | Filled part | Unfilled part | Verdict |
|---|---|---|---|
| 1. Vessel behind the digits (ships today) | 9.79:1 | 15.30:1 | passes |
| 2. Pale liquid inside the glyphs | **1.49:1** | 14.55:1 | **fails AA** |
| 3. Dark liquid (`--primary`) inside the glyphs | 4.60:1 | 14.55:1 | passes, weakest |
| 4. Both tones (`--accent-foreground` / `--muted-foreground`) | 8.31:1 | 6.99:1 | passes |

Measured in light only, against `--gauge-liquid: #f6c453`, which 009 re-pointed to `#d97706`. Every
figure involving the liquid is void: the vessel now measures **4.99:1 light / 4.68:1 dark** (digit on
liquid) and **15.30:1 / 15.12:1** (digit on glass), painted
(`docs/tasks/009-dark-mode-toggle.md:918`).

**Variant 2 still does not ship**, and not as an option either: it is a pale fill painted *as the
digits*, nothing in the retokenising brings it to this task's 4.5:1 floor, and `DESIGN.md` says
accessibility is not negotiable against aesthetics. Putting a failing option behind a setting ships
the failure and adds a way to reach it. **Variant 3 does not ship either** (Q3, settled) — criterion 5
makes it a later enum entry plus a renderer, not a redesign. Nothing that ships is justified by the
table above; criterion 32 re-measures both shipped options in both themes.

### 2. The theme control is not in this task, and does not move here
009 shipped a three-state theme control in `widgets/HeaderNav.tsx`. **Owner decision 2026-10-26: it
stays there**, because flipping the theme is a frequent, low-commitment action and putting it behind
navigation makes the common case worse. This also preserves 009's "one instance ships" rule, which
exists so two controls cannot disagree (`docs/tasks/009-dark-mode-toggle.md:145-149` says 008 would
"move or mirror" it — overruled). The earlier instruction to build the surface so a theme section
"drops in without a redesign" is therefore **gone**: there is no theme section to design around.

### 3. The in-glyph option shows no level at full and at empty
In any in-glyph rendering the digits are a single flat colour at level 100 and at level 0 — the
waterline only exists mid-range, because glyphs have no container. **Level 100 is where the timer
sits at the start of every session.** So the two options are **not cosmetically equivalent**, and the
labels must not pretend they are (criterion 20). Not a tuning problem, not a bug to fix, and not
something to compensate for with a second indicator.

**Recorded disagreement, deliberately unresolved:** frontend read variant 4 as liquid; the owner,
from stills, read it as a soft shadow. Motion may be the difference. Not this task's to settle.

## Data shape — decided. 008 adds a key, it does not choose a home
Settled by 009 and recorded in `docs/DECISIONS.md` (2026-10-23, "Theme preference storage"), which
says in its own words that it "also answers task 008's criterion 1". The PM read in the original
draft — zustand `persist` over Dexie, because the theme must be readable synchronously before first
paint — is exactly the argument that decided it. Not reopened.

What exists, verified:

- `lib/preferences/schema.ts` — pure data, no React, no DOM at import time.
  `PREFERENCES_STORAGE_KEY = "pomotato-preferences"`, `PREFERENCES_VERSION = 1`, `Preferences`,
  `PREFERENCE_DEFAULTS`, `PREFERENCE_VALUES`, `sanitizePreferences` (per-key fallback, never throws),
  `isPreferences`, `migratePreferences`.
- `lib/preferences/store.ts` — `usePreferencesStore`, zustand `persist` with `name`, `version`,
  `skipHydration: true`, `partialize`, `migrate`, and a `merge` that validates on **every**
  rehydration.
- `lib/preferences/index.ts` — re-exports `*` from schema, `THEME_BOOT_SCRIPT`, the store.
- Envelope: `{"state":{"theme":"light"|"dark"|"system"},"version":1}`. Only enums are persisted.

**`schema.ts`'s header comment (lines 6-10) names this task and gives the recipe:** add the field to
`Preferences`, its default to `PREFERENCE_DEFAULTS`, its values to `PREFERENCE_VALUES`, one `pick`
line to `sanitizePreferences`; bump `PREFERENCES_VERSION` only if an existing key's meaning changes.
009's notes add: one line in `partialize`, one setter in `store.ts`. `index.ts` likely needs no edit.

So backend's work is **one key and its five touch-points**. No second preference system, no second
storage key, no second version constant, and no new decision entry for the storage home — unless the
key forces a version bump or a `migratePreferences` branch (criterion 1).

**While in there:** `store.ts:43-45` comments that a malformed value "is not written back". The
2026-10-23 DECISIONS entry records that QA disproved this — `persist` writes the sanitised payload
back over the bad entry, which is the accepted behaviour. Correcting that comment is in scope and is
not a behaviour change. Nothing else in `lib/preferences/` is this task's.

## Dialog or route — settled: a route at `/settings`
The owner said "settings button", which reads as a dialog. This task says route:

1. **It grows, and the growth is on the plan.** Milestone 4 still owes paper grain and uploaded
   backgrounds; 5 adds a soundscape mixer; 7 adds JSON export/import. Several unrelated sections of
   controls in a modal becomes a scrolling dialog. `/stats` is the precedent.
2. **Uploaded backgrounds need a file input and a preview of the page itself.** A modal over a scrim
   is a poor place to preview a background that *is* the page.
3. **Deep-linking and Back.** `/settings` is addressable; a dialog's open state is not in the URL.
4. **Live option samples** can sit side by side without a scrim dimming the real timer behind them.

**The counter-argument, answered:** navigating away does not lose a running timer — remaining time is
derived from the stored end timestamp, exactly as it survives the `/stats` link today (criterion 16).

**Shape to copy:** `app/stats/page.tsx` is a `metadata` export plus one component;
`components/StatsDashboard.tsx:26-31` renders `<main>`, a `<Link href="/">` back link and an `<h1>`.
The back link is how a keyboard user returns without relying on browser Back.

**Overturnable without reopening the task** — the entry-point control is the same either way. If the
owner prefers a dialog, say so before frontend starts (Q1).

## One spring, and nothing left to deduplicate
**Changed since the draft:** the prototype's copy of the spring is gone with the prototype, so
`TILT_GAIN`, `REST_POS`, `REST_VEL` and the `1224 - 1044 * …` stiffness expression now appear in
**exactly one file**, `components/SloshGauge.tsx` (lines 78-81, 144, 159) — grep-verified. There is no
duplicate to collapse and no extraction forced by one.

So the requirement is only this: the in-glyph renderer must not create a *second* copy (criterion 36).
Whether it reuses the vendored `SloshGauge` as-is, drives it with different colours, or moves the
spring into a shared module is **frontend's call** — the original draft's "a real extraction, not a
copy-paste" framing assumed a duplicate that no longer exists. If frontend does move code out of
`SloshGauge.tsx`, criterion 37 applies: it is vendored ReactBits (MIT + Commons Clause) and its header
already lists six local edits, per the **2026-10-19** DECISIONS entry. Note `TimerGauge.tsx:4` imports
it as a **default** export.

Whatever the route, task 005's QA break D is the warning: removing `s.raf = 0` from unmount cleanup
broke the drawn liquid while every `data-gauge-level` test still passed. The level attribute does not
cover the spring (criterion 52).

## Scope

**In:**
- One gauge-style key in `lib/preferences/`: value set, default, `pick` line, `partialize` entry,
  setter (backend).
- A settings control on `/`, in `widgets/BottomControls.tsx` beside the tasks and stats controls.
- A settings surface at `/settings` holding exactly one preference group: gauge style.
- The in-glyph (variant 4) gauge rendering.
- Applying the preference to the real timer on `/`.
- Measuring digit contrast per option, per level, per theme, in a real browser.

**Out:**
- **Any theme control.** Not built here, not moved here. Owner decision.
- **Paper grain, uploaded backgrounds.** Milestone 4's remaining parts, each its own task.
- **Variants 2 and 3.** Settled above. No identifier, no renderer, no dead branch.
- **Any other preference.** Sound, notifications, auto-start, long-break interval, task defaults,
  export/import. One preference ships; the surface is the point.
- **The theme key, the boot script, `.dark`'s values, the resolver.** `lib/preferences/boot-script.ts`
  and its drift test stay byte-identical (criterion 12).
- **Deleting the prototype.** Already done — the owner removed `app/prototype/` and
  `components/prototype/` manually and the orchestrator landed the fallout (009's criterion 45 e2e
  block, the `ALLOWED_LITERALS` entry for `components/prototype/contrast.ts` and its assertion).
  Verified gone. Was criterion 39; no longer this task's work.
- Any change to timer logic, durations, mode behaviour, the persisted *timer* shape, `lib/timer/**`,
  `lib/db/**`, `lib/stats/**`, `hooks/use-timer-clock.ts`, `hooks/use-hydrate-timer-store.ts`,
  `/stats`, the task list or its dialog, `CurrentTaskCard`, `HoldButton`, `TimerControls`,
  `ModeSelector`, `CustomDurationInput`, or `components/ui/mode-chip.tsx` (which the radio group may
  *import* per criterion 19, but may not edit).
- A second gauge, progress bar or any other level indicator to compensate for the in-glyph option
  showing no level at full and empty. The description says so instead (criterion 20).
- Resolving the "liquid or soft shadow" disagreement. Recorded, not settled.
- **Dropping the unused `lucide-react` dependency.** Follow-up, not this task — see below.

## 009's sweep findings: what 008 absorbs
PLAN.md lists five findings plus one standing constraint from 009's two-theme sweep. Rule: none is
008's unless it touches a file 008 already changes. Ruled in writing so frontend never has to ask.

| Finding | 008 touches it? | Ruling |
|---|---|---|
| Dead `disabled:` utilities, `components/TaskForm.tsx:169,189,251` | **No** — the colour swatch is not in scope, so 008 never opens this file | **Out.** Explicitly not 008's. |
| 320 px header density (header wraps 40→80 px), `widgets/HeaderNav.tsx` | **No** — 008's control goes in `widgets/BottomControls.tsx` | **Out.** But criterion 27 re-checks the bottom cluster at 320 px, since 008 makes it a third button. |
| Drag-active row ring 2.47:1 light, `components/TaskRow.tsx:116` | No | **Out.** Needs a `--drag-ring` token; exempted with provenance in DECISIONS. |
| `HeaderNav` is a `<div>` inside `<main>`, not a `<header>` | No | **Out as a fix. In as a constraint on new code:** 008 adds a page, so its own landmark and heading structure must be semantic (criteria 19, 27). Do not copy the defect. |
| Dragging row's title below 4.5:1 via `opacity-60` | No | **Out.** |
| Constraint: dark `--popover` cannot be lifted for elevation | **Yes, indirectly** — 008 adds a surface that will want elevation | **In as a constraint, not a task.** Separation comes from edges (`--control-border`, `--dialog-edge`), not a lifted fill; the eight task swatches clear 3:1 on dark `--popover` by ~1.3 % of headroom and are owner data. `components/token-dark.test.ts` pins the hexes. Criterion 45. |
| Unused `lucide-react@^1.52.0` in `package.json` | **No, deliberately** | **Out — follow-up.** `react-icons` is the project's library (owner decision) and all four icon usages already are, so removal is correct but it is a lockfile change whose only guard here is criterion 18's empty diff, and it needs its own check that `shadcn add` does not reinstall it. Recommend a PLAN.md maintenance line. |

## Acceptance Criteria
36 criteria. Numbers are the original draft's; gaps are the 17 cuts listed at the bottom.

### A. Gate and order
- [ ] 1. **No new storage-home decision entry is needed** — DECISIONS' 2026-10-23 entry already
      answers it. An entry **is** required if, and only if, the gauge key forced a
      `PREFERENCES_VERSION` bump or a new `migratePreferences` branch; then a dated entry records the
      bump, what it migrates and why version 1 could not carry the key. Backend drafts, orchestrator
      lands. QA states which case applies and the value of `PREFERENCES_VERSION`.
- [ ] 2. Backend landed before frontend touched a component. Implementation Notes record the order,
      and frontend names the exact symbols it consumed from `lib/preferences/`.

### B. The persisted preference (backend)
- [ ] 5. The stored gauge value is a **stable string identifier from a closed set declared in
      `PREFERENCE_VALUES` in `lib/preferences/schema.ts`** — never a colour, class name, component
      reference or array index. After this task `localStorage` holds **exactly one** preferences
      entry, `pomotato-preferences`, with both keys inside its `state` and the envelope still
      `{"state":{…},"version":<PREFERENCES_VERSION>}`. No second store, key or version constant. QA
      reads the payload and enumerates the keys the app writes.
- [ ] 7. **Malformed persisted data falls back per key and never throws.** Table-driven unit tests
      cover: an unknown gauge identifier, a wrong-typed value, a missing gauge key, a newer version, an
      older version, a non-object payload, unparseable JSON. Each yields the default **for the bad key
      only** and leaves the app usable. Two clauses that are easy to get wrong:
      - The real migration case, asserted against the literal `{"state":{"theme":"dark"},"version":1}`
        — every current user's payload — which must rehydrate to `theme: "dark"` **plus** the gauge
        default, not a discarded payload and not `theme` reset to `system`.
      - The sanitised payload **is** written back over the bad entry (2026-10-23 DECISIONS). A test
        asserting the bytes are left untouched is wrong.
- [ ] 9. **The default is the vessel** — exactly what `/` renders today — so nobody's screen changes
      until they choose. Settled (Q2), not conditional.
- [ ] 10. **Rehydration is quiet.** Zero React hydration warnings on `/` and `/settings`, with the
      timer idle, running and paused, for both options; and the `mm:ss` readout's bounding box is
      unchanged across rehydration (no reflow when the in-glyph fill appears). The gauge needs **no
      pre-paint boot script** — `components/TimerGauge.tsx:44` already renders `SloshGauge` only once
      `ready`, the timer store's post-mount gate. Implementation Notes name the gate used.
- [ ] 12. `git diff --stat` is empty for `lib/timer/`, `lib/stats/`, `lib/db/`,
      `hooks/use-timer-clock.ts`, `hooks/use-hydrate-timer-store.ts` and
      `lib/preferences/boot-script.ts`, and `lib/preferences/boot-script.test.ts` passes with no
      assertion changed.

### C. The entry point on `/`
- [ ] 13. `/` carries **exactly one** settings control: a real `<button>` or link (not a div with a
      click handler), accessible name exactly `Settings` (QA asserts the computed name by value, not
      by attribute presence), at least 44 × 44 px at 320 px and 1280 px, Tab-reachable in visual
      order, with the app's focus indicator — 2 px outline at 2 px offset resolving to `--ring`
      (`app/globals.css:234-237`). Its neighbours `StatsButton` and `TaskListDialog` are both
      `size-11` (44 px) today, so this matches rather than exceeds them.
- [ ] 16. **The timer is unaffected by the trip.** Activating the control reaches the settings
      surface; a running timer is still running on arrival and on return; remaining time is continuous
      across both navigations (within 1 s of elapsed wall time); and the persisted timer state —
      `status`, `endTimestamp`, `pausedRemainingMs`, `runId` — is byte-identical before and after.
      Both ways back work: browser Back, and the surface's own back link to `/` by keyboard alone.
      (If Q1 is overturned to a dialog: Escape and the close control both dismiss it and focus returns
      to the settings control.)
- [ ] 18. `git diff package.json package-lock.json` is empty. No new dependency and no third icon
      library — new icons come from `react-icons`, the project's library per the 2026-10-26 owner
      decision. Removing the unused `lucide-react` is **not** done here.

### D. The settings surface
- [ ] 19. The surface is a `<main>` with one `<h1>` naming it, and presents the preference as a
      **`<fieldset>` with a `<legend>` and native radio inputs** sharing one `name` — the shape
      `components/ThemeControl.tsx:27-47` and `components/ModeSelector.tsx` already use. No
      ARIA-built `role="radiogroup"`, no Radix `ToggleGroup type="single"`: the **2026-10-19**
      DECISIONS entry rejected both for this project (CLAUDE.md: semantic HTML before ARIA).
      Importing `modeChipVariants` from `components/ui/mode-chip.tsx` is allowed; editing it is not.
      The whole flow is operable by keyboard alone — reach the control from `/`, open it, move within
      the group with arrow keys, change the option, return — and Tab enters the group once, landing on
      the checked radio (native behaviour).
- [ ] 20. **Each option's visible label and one-line description says what it actually does**, and the
      in-glyph option's description states that it shows no level when the timer is full and when it
      is empty. No label implies the options are equivalent; no option is described only by a cosmetic
      adjective ("classic", "sleek") with no statement of behaviour. Unlike `ThemeControl`'s `sr-only`
      legend, this group's label is visible: a settings page has the room, and the two option names
      alone do not say what the group is.
- [ ] 21. **Exactly two options ship** — the vessel and the in-glyph two-tone — and both render and
      are selectable. The value set has exactly two members and the renderer exactly two branches:
      no identifier, renderer, unreachable branch or commented-out block for variant 2 or variant 3.
- [ ] 23. **No theme control, no disabled control, no empty section, no "coming soon" placeholder.**
      The surface does not render `widgets/HeaderNav.tsx`, so 009's "one instance ships" rule holds and
      `document.querySelectorAll('input[name="theme"]')` is empty on `/settings`. QA enumerates every
      interactive element on the surface and confirms each one acts.
- [ ] 24. Selecting an option applies it to the **real timer**: back on `/` the timer renders the
      chosen style, and the choice survives a reload and a new tab in the same browser.
- [ ] 25. Changing the option **mid-session changes no timer state**: with the timer running, and
      again paused, `status`, `endTimestamp`, `pausedRemainingMs`, `runId` and the rendered `mm:ss`
      are unchanged, the observed level is the same before and after, and no session row is written.
- [ ] 27. **320 px and 1280 px, both themes.** No axe-core violation of serious or critical impact on
      `/settings`, and on `/` with each option active in each timer status (idle, running, paused,
      complete). Exactly one `main` landmark and one `h1` on the surface. No horizontal page scroll
      (`document.documentElement.scrollWidth <= clientWidth`) and every control at least 44 px in both
      dimensions — including on `/`, where this task makes `widgets/BottomControls.tsx` a three-button
      cluster that must not wrap or overflow.

### E. The readout stays the accessible source of truth
- [ ] 29. For **both** options, the `mm:ss` readout is the single accessible source of truth and is
      **real text**: exactly one node announces the remaining time, its text content equals the
      rendered `mm:ss` exactly, it is not an image or canvas, it is not split per character in a way
      that changes the announced or copied string, and neither the gauge nor the fill adds a second
      rendered number or a second announcement. This has to hold for the in-glyph option, where the
      fill is *inside* the accessible text. (`TimerGauge.tsx:36` is `aria-hidden` today; whatever
      replaces or joins it keeps that property.)
- [ ] 31. **Forced-colors and missing-background safety.** Under
      `emulateMedia({ forcedColors: "active" })`, and separately with background images unavailable,
      the digits stay visible and legible for both options. A rendering that makes the digits
      transparent and relies on a painted background to show them **fails unless it carries a
      fallback**. QA asserts the painted digit pixels differ from the painted page background in both
      conditions.
- [ ] 32. **Measured contrast, per option, per level, per theme.** In light and dark, at levels 100,
      75, 50, 25 and 0, the filled part of the digits, the unfilled part and the waterline region each
      measure **≥ 4.5:1** against what they are painted on. **Painted pixels, not arithmetic on token
      values** — 005 and 006 were off by up to 2.7 points that way. QA records figures in the shape of
      009's table and compares the vessel against 009's measured **4.99 / 15.30 light, 4.68 / 15.12
      dark**, not the pre-009 prototype table; any difference over 0.5 is explained. The digits render
      at 60-96 px (`TimerDisplay.tsx:14`, `text-6xl sm:text-7xl lg:text-8xl`), so WCAG's 3:1
      large-text threshold would technically apply; this task holds 4.5:1 anyway so the figures stay
      comparable with 005's and 009's. Expected and **not** a defect, stated as such by QA: for the
      in-glyph option both parts paint the *same* colour at 100 and at 0 and *different* colours at
      50, matching its description under criterion 20. The stored-preference × `prefers-color-scheme`
      cross-product needs no per-level re-measurement — 009's boot and drift tests pin the resolution,
      so measuring per *resolved* theme is enough, and QA says so.
- [ ] 34. **`prefers-reduced-motion: reduce`**: both options still render the correct level and still
      update as time passes, with lean, bounce and overshoot suppressed, and criterion 32's ratios
      still hold when re-measured. Each reduced-motion assertion is paired with a default-motion
      equivalent so it cannot pass vacuously.

### F. Gauge behaviour
- [ ] 35. **Task 005's gauge guarantees hold for both options**: the level matches the derived
      remaining time at three sampled points per mode (full at start, 50 ± 2 at half, 0 at
      completion); pause freezes the level for 3 s and resume continues from it; a mode switch or a
      custom-duration change re-bases it against the new full duration; a session that expired while
      the tab was closed renders at empty on load without animating down from full.
      `components/TimerGauge.test.tsx`, `hooks/use-resolved-tokens.test.tsx` and
      `e2e/timer-gauge.spec.ts` pass with no assertion changed — including the two
      `data-liquid-color` assertions, which expect `#d97706` after 009 and must not revert to
      `#f6c453`.
- [ ] 36. **One spring implementation ships.** `TILT_GAIN`, `REST_POS`, `REST_VEL`, `1224` and `1044`
      each appear in exactly one file across `components/`, `hooks/` and `lib/` — one file today
      (`components/SloshGauge.tsx`), so the count must stay at one, not grow.
- [ ] 37. If `components/SloshGauge.tsx` is edited or has code moved out of it, its header comment
      lists the new edits alongside the six already there and still states that a future
      `shadcn add @react-bits/SloshGauge-TS-TW` is a conflict (**2026-10-19** DECISIONS entry).
- [ ] 40. **No perpetual idle loop, per option.** Timer idle, paused or complete, after a 1 s settle:
      zero `requestAnimationFrame` callbacks over the next 1 s. Running is allowed to be non-zero
      (positive control).
- [ ] 41. **No new time source.** Remaining time is still derived from the stored end timestamp.
      `components/TimerGauge.tokens.test.ts`'s "no new time source" guard (covering `TimerGauge.tsx`,
      `TimerDisplay.tsx`, `TimerControls.tsx`, `hooks/use-resolved-tokens.ts`) is extended to every
      component file this task adds, and passes. **If the spring is moved into a module of its own,
      that module is the one exemption** — it holds the single rAF loop, so forbidding it there would
      be unsatisfiable — named explicitly in the guard with its reason. No `setInterval` and no
      `setTimeout` chain anywhere, including in the spring.

### G. Tokens and both themes
- [ ] 42. Every file this task adds or changes carries **zero** raw palette utilities (the regex in
      `components/palette.tokens.test.ts`, which sees `white`, `black` and `/NN` suffixes), zero
      `#rrggbb` / `rgb(` / `rgba(` / `hsl(` / `hsla(` / `oklch(` / `oklab(` literals and no inline
      `style` carrying a colour: every colour resolves through a semantic token from
      `app/globals.css` or a `color-mix()` of them. That guard **discovers** files by walking `app/`,
      `components/`, `hooks/` and `widgets/` (007 criterion 11, hardened by 009 R-8), so it needs no
      hand-extension — QA asserts each new file appears in its `FILES` set, that
      `ALLOWED_RAW_UTILITIES` is still `{}` and `ALLOWED_LITERALS` still has its single entry, and
      proves the guard live by break-and-restore. `lib/` is not walked; `lib/preferences/` is pure
      data and criterion 5 already keeps colour out of it.
- [ ] 44. Any new custom property in `app/globals.css` carries 006 criterion 8's three-part reason
      comment (the role, why no existing token fits) **and ships with both a `:root` and a `.dark`
      value, each with measured figures for every ground it is painted on**, in the shape of
      `--control-border` and `--dialog-edge`. "Milestone 4 must give it a dark value" is no longer a
      valid deferral — dark exists. `git diff app/globals.css` contains nothing but such additions: no
      edit to the `body` rule, the unlayered `:focus-visible` rule, the `@layer base` block, the
      `@media (prefers-reduced-motion)` block, any `@theme inline` mapping, or any existing token
      value in `:root` or `.dark`. `components/token-dark.test.ts` passes unchanged.
- [ ] 45. **The surface works in both themes, measured.** Every foreground/ground pair on it reaches
      4.5:1 (3:1 for a boundary that is the only carrier of a control's state) in light and dark, from
      painted pixels. Its separation from the page comes from edges (`--control-border`,
      `--dialog-edge`), not a lifted fill: dark `--popover` sits 1.02:1 from `--background` and cannot
      be raised, because the eight task swatches clear 3:1 on it by ~1.3 % of headroom and are owner
      data that may not be remapped.
      **Amended 2026-10-26 by review R-2:** the paper grain, which shipped the same day off-pipeline,
      darkens the painted light ground, so `--control-border` on it is **~3.26:1 with grain** (~3.01:1
      against a worst-case full-mask grain pixel), not the 3.44:1 against the flat token that frontend's
      and QA's notes below cite from 009. Dark moves 3.80 → ~3.66. **No floor breaks** — the unchecked
      radio edge still clears 3:1 — but it does so on roughly 60 % less headroom. Measure this pair
      painted, never from the token. Those earlier notes are left as written: they are dated records of
      what was measured when, and this amendment is the correction.

### H. Regression and gates
- [ ] 46. `npm run lint` (0 errors, warnings no higher than the 21-warning baseline),
      `npm run typecheck`, `npm run build` (routes still exactly `/`, `/settings`, `/stats`,
      `/_not-found`), `npm run test` (baseline 667) and `npm run test:e2e` all succeed, and **every
      existing spec in `e2e/` passes with no assertion weakened and none removed**. QA states its
      counts and the baselines it compared against, measured on the tree it was handed rather than
      `HEAD`. Any changed assertion is listed in the QA Report with its reason, in the shape 006's QA
      Report used for `hold-reset.spec.ts`.
- [ ] 48. Milestone 3 logging is unaffected **under both options**: a completed focus run still writes
      exactly one session row and still takes a pinned task's `completed` up by exactly one, with no
      double counting. A reset run still logs nothing.
- [ ] 49. Zero console errors or warnings, in both themes, across the settings flow: load `/`, open
      settings, change the option, return, reload, then start / pause / resume / complete.
- [ ] 50. No `any` in new or changed code. Functional components with named exports (CLAUDE.md).
- [ ] 51. New tests cannot pass vacuously — none of the four shapes in the **2026-10-09** "Milestone 3
      test-coverage debt" DECISIONS entry (an assertion inside `try`/`catch`, an assertion inside
      `if`/`else`, an observer that may never attach, a `toBeVisible()` on something already true),
      and none with zero assertions. The 2026-10-07 entry is the provenance for why this is checked.
- [ ] 52. QA breaks the implementation, confirms the test fails, and restores it (hash-verified), for
      four criteria: malformed-preference fallback (7), the preference reaching the real timer (24),
      forced-colors legibility (31), and the gauge spring — for the spring, break it once and confirm
      **both** a vessel test and an in-glyph test fail, since 005's break D showed the level attribute
      alone does not cover it.
- [ ] 53. Implementation Notes record, before QA starts: the symbols backend added to
      `lib/preferences/` and whether `PREFERENCES_VERSION` moved; both option identifiers and which
      prototype variant each corresponds to; the surface's URL; **how QA observes the active option**
      (a named `data-*` attribute, in the shape of 005's `data-gauge-level`); where the spring lives
      and, if it moved, how criterion 41's guard exempts it; and the measured contrast table (option ×
      level × theme).

## Files likely touched
**Backend:** `lib/preferences/schema.ts` (value set, type, default, `pick` line),
`lib/preferences/store.ts` (one `partialize` entry, one setter, plus the stale comment at 43-45).
`lib/preferences/index.ts` probably untouched — it re-exports `*` from schema. `docs/DECISIONS.md`
only in criterion 1's version-bump case, as a draft for the orchestrator.

**Frontend:** `app/settings/page.tsx` (shaped like `app/stats/page.tsx`); a settings-surface component
under `components/` (shaped like `components/StatsDashboard.tsx`: `<main>`, back link, `<h1>`); a
settings entry-point component under `components/` beside `StatsButton.tsx`;
`widgets/BottomControls.tsx`; `components/TimerGauge.tsx`; `components/TimerDisplay.tsx`;
possibly `components/SloshGauge.tsx` and a shared spring module if frontend goes that way (criteria
36, 37, 41); `app/globals.css` only if a role genuinely has no token, and then with both values
(criterion 44).

**QA only:** `components/*.tokens.test.ts`, `components/*.test.tsx`, `lib/**/*.test.ts`, `e2e/**`.

**Not touched:** `lib/timer/**`, `lib/stats/**`, `lib/db/**`, `lib/preferences/boot-script.ts`,
`hooks/use-timer-clock.ts`, `hooks/use-hydrate-timer-store.ts`, `app/stats/**`, `app/layout.tsx`,
`widgets/HeaderNav.tsx`, `components/ThemeControl.tsx`, `components/ThemeSync.tsx`,
`components/TimerControls.tsx`, `components/HoldButton.tsx`, `components/ModeSelector.tsx`,
`components/CustomDurationInput.tsx`, `components/ui/mode-chip.tsx`, `components/Task*.tsx`,
`components/CurrentTaskCard.tsx`, `components/Stats*.tsx`, `components/ui/dialog.tsx`,
`components/ui/button.tsx`.

## Open questions for the owner
**None blocks the start.**

1. **Dialog or route?** Settled as a route at `/settings`, reasoning above. Overturnable before
   frontend starts without reopening the task.
2. **Answered, proceeding.** Default is the vessel (criterion 9). An in-glyph default later would be a
   migration with its own decision entry and test.
3. **Answered, proceeding.** Vessel + variant 4 only (criterion 21); variant 3 is a later enum entry.
4. **Answered and closed.** 006's criterion 14 absorbed by 007 and 009; `--control-border` is 3.44:1
   light / 3.80:1 dark.
5. **Mostly answered.** `widgets/` is in CLAUDE.md. `StatsButton` is a named export at 44 px with no
   raw palette (007). `react-icons` is the icon library; criterion 18 still forbids a third.
   **Residual:** `lucide-react` is installed and imported nowhere — ruled a follow-up above.
6. **Answered and done.** The prototype is deleted and its test fallout handled; out of scope.
7. **New, non-blocking.** Visible section headings per preference group, or just group labels? Only
   cosmetic with one group. Frontend picks what reads correctly now and records it.

## Risks
- **The pre-009 prototype table is the most likely thing to be requoted as fact.** Its liquid figures
  were measured against a colour that no longer exists and it has no dark column. Anything that ships
  is justified by criterion 32's fresh painted measurements in both themes.
- **Migration is real, not hypothetical.** Every existing user has
  `{"state":{"theme":…},"version":1}` in `localStorage`; adding a key must widen it without losing the
  theme. Criterion 7; `lib/preferences/preferences.test.ts` is the worked example.
- **One hydration story, two stores.** The theme has a pre-paint boot script; the gauge does not need
  one, because the gauge already waits for the timer store's gate. The failure mode is inventing a
  second boot script, or reading the preference during render so server and first client render
  disagree. Criteria 10, 12.
- **The fill is inside the accessible text.** Three failure modes for the in-glyph option: a second
  announcement of the same value; a readout that is no longer text (not copyable, zoomable or
  announced); and the one most likely to be missed — **transparent digits that vanish under
  `forced-colors: active` or when background images do not paint**, leaving no timer on screen.
  Criteria 29, 31.
- **The labels are where "not equivalent" gets lied about.** At level 100 (every session's start) and
  level 0 the in-glyph option shows no level. If the labels read as two flavours of the same thing,
  the user picks one and quietly loses the feature they thought they chose. Criterion 20.
- **Arithmetic is not measurement.** 005 quoted 10.78:1 and 16.84:1 from token values; painted pixels
  gave 9.79:1 and 15.30:1. 006 found the Tailwind palette is OKLCH, so utilities and token hexes
  differ by several RGB units. Criterion 32.
- **Two themes doubles the measurement surface,** and 009 took four QA passes largely on measurement.
  Frontend fills the table before QA starts (criterion 53) so QA verifies rather than discovers.
- **The spring's regression surface is not covered by the level attribute.** 005's break D: one line
  removed from unmount cleanup broke the drawn liquid while every `data-gauge-level` test passed.
  Criterion 52.
- **Editing vendored source.** `SloshGauge.tsx` is ReactBits (MIT + Commons Clause) with six local
  edits already. Moving code out makes a future `shadcn add` a worse conflict; the header comment is
  the only thing standing between that and a silent overwrite. Criterion 37.
- **Performance.** A page kept open for hours. Two renderings must not mean two animation loops, and
  an idle timer must schedule no frames (criterion 40). The gauge's per-snapshot `getComputedStyle`
  (005's R-5) is pre-existing and out of scope — just do not add a second subscriber per render.
- **Licensing.** No audio, fonts, images or binaries here. If any appear they must be original or CC0
  with provenance in `docs/DECISIONS.md`. No new icon library (criterion 18).
- **Next.js version.** Per `AGENTS.md`, frontend reads the relevant guide in
  `node_modules/next/dist/docs/` before writing the route — the first route added since `/stats`, and
  App Router conventions in training data may not match 16.3.8.
- **antislop.** 005, 006, 007 and 009 all record `during (session override)`, supplied by the owner
  through the orchestrator. Frontend confirms that still holds, announces
  `antislop active: during (session override).` before its first UI edit, and runs the Delivery Gate.
  Criterion 20's labels and descriptions are copy work and go through `antislop-copywriting`.
