---
id: 008
slug: settings-gauge-style
status: done # draft | in-progress | qa | review | done | blocked
---

# Settings surface, with the timer gauge style as its first preference

> **Refreshed 2026-10-26.** Drafted before 006, 007 and 009 landed. Criteria that survived keep their
> original numbers (DECISIONS and PLAN reference 1, 5 and 18 by number), so the gaps are deliberate —
> 53 criteria became 36. See the note at the bottom for every change and every cut.

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

## Observations (not criteria, not scope)
- The draft's observations about `StatsButton` (36 px, default export, `bg-neutral-200`) and
  `TaskListDialog` (36 px, `text-white`) are **resolved**: both triggers are `size-11` with named
  exports and token colours after 007. Removed rather than carried.
- `components/CurrentTaskCard.tsx:4` still imports `TaskColorDot` without rendering it; line 6 still
  carries `border border-none bg-none`. From 006's observations; still true, still nobody's task.
- `docs/PLAN.md` still describes 005 and 009 as "complete but not committed"; the git log says
  otherwise (`09a50e3`, `e47caca`). Orchestrator's to fix.

## Implementation Notes
(Backend, then frontend. Criterion 53 lists what must be here before qa starts.)

### Backend (done, ran first and alone; criterion 2 order)
Files: `lib/preferences/schema.ts`, `lib/preferences/store.ts`. Nothing else. `index.ts` re-exports `*`
from schema, so it needed no edit.

**Exports frontend imports from `@/lib/preferences`:**
- `GAUGE_STYLE_VALUES` = `["vessel", "glyph"] as const`
- `type GaugeStylePreference` = `"vessel" | "glyph"`
- `DEFAULT_GAUGE_STYLE` = `"vessel"`
- `Preferences` now `{ theme: ThemePreference; gaugeStyle: GaugeStylePreference }`
- On `usePreferencesStore`: `gaugeStyle` (state) and `setGaugeStyle(style: GaugeStylePreference)`
  (re-sanitises, so an off-set value falls back to the default). `hasHydrated` is the existing gate.

**Identifiers:** `vessel` = prototype variant 1 (liquid behind the digits, today's rendering, the
default); `glyph` = prototype variant 4 (two-tone fill inside the digits). A third style is a new entry in
`GAUGE_STYLE_VALUES` plus a renderer (criteria 5, 21).

**Storage:** still the single `pomotato-preferences` key; envelope
`{"state":{"theme":...,"gaugeStyle":...},"version":1}`. No second store, key or version constant.

**Criterion 1: no version bump, no new `migratePreferences` branch, no DECISIONS entry.**
`PREFERENCES_VERSION` stays **1**. A pre-existing `{"state":{"theme":"dark"},"version":1}` rehydrates via
`merge` (not `migrate`, which is skipped at matching version): `isPreferences` is false for it, so
`sanitizePreferences` runs per key and yields `theme: "dark"` plus `gaugeStyle: "vessel"`. Verified by
reading the code path, not yet by a test (qa, criterion 7). Persist then writes the widened envelope back.

**Stale comment fixed** (`store.ts` merge comment): now says persist writes the sanitised state back
over a malformed entry. Comment only, behaviour unchanged.

**Criterion 10 gate:** none needed from backend; `TimerGauge.tsx` already renders the gauge only after
the timer store's `ready`. Frontend must still call `usePreferencesStore.persist.rehydrate()` after mount
the way the theme consumer does (`skipHydration: true`) and read `gaugeStyle` only once `hasHydrated`.

**For qa (existing tests that must be updated, not mine to edit):** 18 tests in
`lib/preferences/preferences.test.ts` fail because they pin the theme-only shape (`{theme:"system"}`,
`state` keys `["theme"]`, `{"state":{"theme":"system"},"version":1}` after write-back, and "accepts exactly
the three enum values" via `isPreferences({theme})`). Each is the new key showing up, not a regression.
Baseline before this change was 667/667; now 649 pass / 18 fail. typecheck clean; lint 0 errors, 21
warnings (baseline).

### Frontend (ran after backend; criterion 2 order)
antislop: `during (session override)`, announced before the first edit.

**Consumed from `@/lib/preferences`:** `GAUGE_STYLE_VALUES`, `DEFAULT_GAUGE_STYLE`, `GaugeStylePreference`,
`usePreferencesStore` (`gaugeStyle`, `setGaugeStyle`, `hasHydrated`). Rehydration is not called again in the
new code: `ThemeSync` in `app/layout.tsx` already runs `usePreferencesStore.persist.rehydrate()` on every
route, so `/` and `/settings` are covered. Both consumers read `gaugeStyle` only once `hasHydrated`.
**Criterion 10 gate:** preference `hasHydrated` for the style, plus `TimerGauge`'s existing `ready` (timer
store) for mounting the gauge. No boot script.

**Files.** New: `app/settings/page.tsx`, `components/SettingsPanel.tsx`, `components/SettingsButton.tsx`.
Changed: `widgets/BottomControls.tsx` (third button), `components/TimerDisplay.tsx` (now `"use client"`; reads
the style, sets `--gauge-surface` / `--gauge-lean` on its frame), `components/TimerGauge.tsx` (optional
`style`, `onPaint`), `components/SloshGauge.tsx` (optional `onPaint`, listed as the seventh local edit in the
header). `app/globals.css`, `package.json`, `lib/**` untouched: **no new token**, so criterion 44 has nothing
to add.

**One spring (36, 37, 41).** The glyph style does not copy the spring. It mounts the same `SloshGauge` with
transparent liquid/glass and takes its per-frame surface and lean through `onPaint`; the digits clip a
two-stop `linear-gradient` driven by those two custom properties. No new rAF loop, no new file, no
`setInterval`. Constants still live only in `SloshGauge.tsx`. Idle: the spring parks as before.

**How QA observes the active option:** `data-gauge-style="vessel" | "glyph"` on `[data-testid="timer-gauge"]`.
Glyph digits are the same single `<p>`, real text, with `background-clip: text`.

**Fallbacks (31).** Base colour is `text-foreground`; transparent only inside
`supports-[background-clip:text]`; `forced-colors:` resets to `text-foreground` and no background image.
Not yet exercised under `emulateMedia` by me; QA owns that.

**Surface (19, 20, 21, 23).** `<main>`, back link, one `<h1>Settings</h1>`, one `<fieldset>` with a visible
`<legend>Timer gauge</legend>` and two native radios `name="gauge-style"`. Checked is a bold name plus a 2px
`--primary` edge (1px border + 1px inset), no lifted fill. No `HeaderNav`, no theme control. Entry point:
`SettingsButton`, `size-11` link, `aria-label="Settings"`, in `BottomControls` beside tasks and stats.
Q7: one visible group heading.

**Criteria status, C-G (my belief, QA verifies):** 13, 16, 18, 19, 20, 21, 23, 24, 25, 29, 31, 35, 36, 37,
41, 42, 44, 45, 50 satisfied by construction; 27 and 32 measured partly (below); 34 and 40 not measured by me.
Reduced motion is handled inside `SloshGauge` (lean and bounce already suppressed; `onPaint` receives lean 0).

**Measured, painted pixels, 1280 px, idle (screenshots, glyph digits; ground = painted page corner pixel
including paper grain).** Level set by writing `--gauge-surface`, lean 0.
| Level | Light filled / unfilled | Dark filled / unfilled |
|---|---|---|
| 100 | 7.81 / (none on screen) | 12.39 / (none) |
| 75, 50, 25 | 7.81 / 6.56 | 12.39 / 8.29 |
| 0 | (none) / 6.56 | (none) / 8.29 |
Grounds: light 244,237,227; dark 33,25,19. At 100 and 0 the digits are one flat colour (matches criterion 20).
I did not re-measure the vessel; 009's 4.99 / 15.30 light, 4.68 / 15.12 dark stands, and its code path is
unchanged. Waterline region and reduced-motion re-measure are left to QA.
`/settings` checked-option edge (`--primary`) against painted ground: 4.28:1 light (ground 243,236,226),
8.35:1 dark (ground 33,26,20); needs 3:1. Unchecked edge is `--control-border` (3.44 / 3.80, 009). No
horizontal scroll at 320 or 1280, both themes.

**Gates on this tree:** typecheck clean; lint 21 warnings / 0 errors; vitest 661 pass / 18 fail (the 18 in
`lib/preferences/preferences.test.ts`); build routes `/`, `/_not-found`, `/settings`, `/stats`; e2e 440 pass /
2 skipped / 1 fail (`dark-theme-control.spec.ts:173`, the known one).

**Tests made stale by me:** none observed. Tests QA should add: settings route/e2e, `data-gauge-style`, and
extend `TimerGauge.tokens.test.ts`'s no-time-source guard to `SettingsPanel.tsx`, `SettingsButton.tsx`.
Known gap: not checked in a real browser under forced-colors, nor axe on `/settings`, nor the BottomControls
cluster at 320 px by assertion (visually it fit in the dark 320 screenshot only for `/settings`).

### QA fix round: F4 and F5 (2026-10-26)

- F4 (criterion 31). The glyph digits are now always a solid text layer in the foreground colour. The two-tone fill moved to a `::after` overlay on the same `<p>` that repeats the time via `content: attr(data-time)`, is `text-transparent`, and clips the gradient to its glyphs. Losing the background image drops only the overlay. The readout is still one real, selectable text node (generated content is not in `textContent` or the selection), no second spring, rAF loop or time source. Forced colours hides the overlay. Verified by the QA spec: digits paint with `background-image: none`, the normal path shows both tones, forced-colors still passes. Tradeoff: at anti-aliased glyph edges the foreground layer blends under the overlay, a sub-pixel fringe only.
- F5 (criterion 32). The stop was `14 + 0.7 * level`, which at 100 lands at 84% from the bottom, below the ink top (about 86.5%). It is now `14 + 0.7 * level + 0.4 * max(0, level - 90)`: the slope is unchanged up to level 90, then adds up to 4 points, so level 100 sits at 88% and clears the ink top. Level 0 stays at 14%, below the ink bottom, and was already flat. Because nothing changes below 90, the 75/50/25 waterlines are untouched by construction, and the spec's waterline checks pass.
- Result: `e2e/settings-gauge-style.spec.ts` 89 passed, 1 failed (F1 focus ring, deliberately untouched). Typecheck clean, lint 21 warnings / 0 errors, vitest unchanged.

### Follow-up round: overlay a11y, F1 (2026-10-26)

- Overlay accessibility. Checked the Chromium accessibility tree (CDP `Accessibility.getFullAXTree`). With the overlay as `p::after { content: attr(data-time) }` the time appeared twice (two StaticText nodes), so the first F4 fix was wrong for assistive tech. The `content: ... / ""` alt-text form fixed the tree but made the overlay paint nothing, so it was dropped. Now the overlay is an empty `<span aria-hidden="true" data-time>` inside the `<p>` and the `::after` lives on that span. Pseudo-elements of an aria-hidden element are hidden from the tree: one StaticText "25:00" after the change. The solid layer is kept, `textContent` is still the time once, no real text duplicated. No conflict between accessibility and effect.
- Fringe at display size: the solid foreground layer is only visible where the overlay glyph edge is anti-aliased, a fraction of one pixel wide. At 60-96px it reads as a very slightly darker edge, not visible without zoom; the contrast and flat-colour specs measure the interior and pass.
- F1. `SettingsButton` and `StatsButton` now add `focus-visible:transition-none focus-visible:ring-0 focus-visible:border-control-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring` on top of the shadcn base. Measured on both: solid, 2px, offset 2px, `--ring` full opacity (light rgb(180,83,9) on #fbf4ea = 4.6:1; dark #f0a550 on #1c140e = 8.8:1, both over 3:1). `transition-none` is needed: the base `transition-all` animated the outline in from the 3px translucent ring, so a read at focus time saw 3px. StatsButton: this class change only.
- Gates: typecheck clean, lint 21 warnings / 0 errors, vitest 732 passed, build clean (/, /_not-found, /settings, /stats), full e2e 531 passed / 0 failed / 2 skipped (533 tests total; the earlier 529/4/2 sums to 535, so I think that count was a slip, not a moved test).

## QA Report
Date: 2026-10-26. Tree: working tree as handed over (009 and 008 both uncommitted; nothing committed).

- Verdict: **FAIL**. Four e2e tests fail on app behaviour, and criterion 52 is not met for two clauses. Everything else in the gate set is green.
- Gates run on this tree:
  - `npm run typecheck`: exit 0.
  - `npm run lint`: 0 errors, 21 warnings (baseline 21).
  - `npm run test` (vitest): 732 passed, 0 failed, 19 files. Baseline 667, so +65 new tests and the 18 stale ones updated in place.
  - `npm run build`: exit 0. Routes `/`, `/_not-found`, `/settings`, `/stats`.
  - `npm run test:e2e`: 535 ran (443 existing, 90 new in `e2e/settings-gauge-style.spec.ts`, plus 2 from a temporary probe file deleted before this report). 529 passed, 4 failed (all in the new spec), 2 skipped (not investigated; frontend's pre-QA baseline also had 2). No existing spec failed.

### Stale assertions updated (criterion 46 list)
- `lib/preferences/preferences.test.ts`: the 18 failing assertions. Expected objects and write-back envelopes now carry `gaugeStyle: "vessel"`. The key list is now `["gaugeStyle","theme"]` (sorted). `isPreferences({theme})` is now checked with `gaugeStyle` present, and a new assertion shows a theme with no gauge key is not a complete `Preferences`. Nothing was weakened: an unexpected extra key still fails.
- `e2e/dark-theme-control.spec.ts` (line 173, "3: clicking Dark"): expects exactly `{"state":{"theme":"dark","gaugeStyle":"vessel"},"version":1}` and the key set `["gaugeStyle","theme"]`. The `envelope()` helper is unchanged; it still seeds the legacy theme-only entry, which is the migration case.
- `components/TimerGauge.tokens.test.ts`: lists extended with `SettingsPanel.tsx` and `SettingsButton.tsx` (criterion 41). Entries added only.

### Tests added
- `lib/preferences/gauge-style.test.ts` (new): criterion 7 table (unknown identifier, colour, class name, component name, case change, empty, number, array index, null, boolean, object, missing key, non-object payloads), per-key fallback, and the stored-entry table (unknown id, wrong type, missing key, older/newer version, non-object state, unparseable JSON, array payload). Each row checks the store rehydrates without throwing, the bad key falls back, and the sanitised envelope is written back over the bad entry. Upgrade path: the literal `{"state":{"theme":"dark"},"version":1}` rehydrates to `theme:"dark"`, `gaugeStyle:"vessel"`, written back as the widened envelope. Criterion 9: default is vessel, value set is exactly `["vessel","glyph"]`.
- `components/settings-surface.tokens.test.ts` (new): criterion 42 membership (new files are in the palette guard's walked set), criterion 36 (`TILT_GAIN`, `REST_POS`, `REST_VEL`, `1224`, `1044` each occur in exactly one source file, `SloshGauge.tsx`; test files excluded from the count), criterion 50 (no `any` in new or changed files), criterion 37 (header lists seven local edits, names the shadcn conflict).
- `e2e/settings-gauge-style.spec.ts` (new, 90 tests), covering criteria 13, 16, 19, 20, 23, 24, 25, 27, 29, 31, 32, 34, 40, 48, 49, 52 and the hydration console check for 10.

### Per-criterion result
| # | Result | Evidence |
|---|---|---|
| 1 | PASS | `PREFERENCES_VERSION = 1`, no `migratePreferences` branch, no version bump; no DECISIONS entry required. |
| 2 | PASS (by notes) | Implementation Notes record backend first, frontend second, and the symbols consumed. |
| 5 | PASS | One key `pomotato-preferences`; envelope `{"state":{theme,gaugeStyle},"version":1}`; e2e enumerates the keys written (exactly `gaugeStyle`, `theme`). |
| 7 | PASS | Table tests above; break B1 (sanitiser passes unknown gauge ids through) turns 14 tests red. |
| 9 | PASS | Unit and e2e: fresh visitor sees `data-gauge-style="vessel"`. |
| 10 | PARTIAL | Zero console errors or warnings containing "hydrat" on `/` and `/settings`, vessel and glyph, idle/running/paused. Readout bounding box is identical between the two options at steady state. Not measured across the rehydration instant itself. |
| 12 | PASS | `git diff HEAD` empty for `lib/timer`, `lib/stats`, `lib/db`, both hooks, `boot-script.ts` and its test. |
| 13 | **FAIL** | Size and single-link checks pass at 320 and 1280 px. Focus ring fails: see F1. |
| 16 | PASS | Running and paused timers: byte-identical `pomotato-timer` value across `/` to `/settings` and back; remaining time continuous within 1.5 s; browser Back and the keyboard back link both work. |
| 18 | PASS | `package.json` and `package-lock.json` not modified. |
| 19 | PASS | One `main`, one `h1`, `fieldset`/`legend`, two native radios sharing `name="gauge-style"`. Keyboard: Tab enters the group once on the checked radio, ArrowDown changes it, Tab leaves it, back link returns. |
| 20 | PASS (text) | Visible legend "Timer gauge"; glyph description states no level at full or empty; vessel description states the level shows throughout. |
| 21 | PASS | Two members, two branches; both selectable. |
| 23 | PASS | No `input[name="theme"]` on `/settings`. Every interactive element enumerated: back link and two radios only, each acts. |
| 24 | PASS | Choice applies on `/`, survives reload and a new tab. Break B4 (preference ignored by `TimerDisplay`) turns the test red. |
| 25 | PASS | Running and paused: timer key, readout, `data-gauge-level` and session count unchanged after changing the option. |
| 27 | PASS (see F2) | axe-core (serious/critical) clean on `/settings` in both themes at 320 and 1280; `/` clean for both options x four statuses x both themes x both viewports (32 tests). No horizontal overflow. Every control at least 44x44; the three-button cluster is one row. |
| 29 | PASS | Gauge is `aria-hidden` and carries no digits; `mm:ss` appears once in `main` text, for both options. |
| 31 | **FAIL** | Forced colours: PASS (see F3). Background images unavailable: **FAIL** (F4). Vessel pair passes. |
| 32 | **FAIL** (see F5) | Contrast figures below. Only the flat-colour-at-full clause fails; every ratio floor passes. |
| 34 | PARTIAL | Level tracks the derived remaining time in both reduced and default motion, for both options (tolerance 3). Glyph lean is 0 under reduce, with a default-motion positive control that moves. Vessel lean is not observable from the DOM, so vessel lean suppression is not verified. Ratios under reduced motion were not re-measured. |
| 35 | PARTIAL | `timer-gauge.spec.ts`, `TimerGauge.test.tsx`, `use-resolved-tokens.test.tsx` pass with no assertion changed; they test the vessel only. Glyph three-point sampling and pause-freeze are not separately tested. |
| 36 | PASS | Spring constants in exactly one file. |
| 37 | PASS | Header lists seven local edits, including the `onPaint` edit; still says a future `shadcn add` is a conflict. |
| 40 | PASS | Zero rAF callbacks over 1 s after a 1 s settle, idle/paused/complete, both options. Running positive control non-zero, both options. |
| 41 | PASS | Guard extended to `SettingsPanel.tsx` and `SettingsButton.tsx`; no `setInterval`/`setTimeout`/rAF there. |
| 42 | PASS | `ALLOWED_RAW_UTILITIES` is `{}`; `ALLOWED_LITERALS` has its one entry; new files in the walked set. Break B2 (`bg-white` in `SettingsPanel`) turns the palette guard red. |
| 44 | PASS (no new token) | `--gauge-surface`/`--gauge-lean` are inline properties on the frame; zero matches in `app/globals.css`. Cannot diff against a pre-008 `globals.css` because 009 is also uncommitted. |
| 45 | PARTIAL | Text pairs on `/settings` pass axe `color-contrast` in both themes (painted). Boundary figures are frontend's (checked edge `--primary` 4.28:1 light, 8.35:1 dark; unchecked `--control-border` 3.44 / 3.80 from 009). Not independently re-measured. |
| 46 | PASS (see notes above) | Gates listed above. |
| 48 | PASS (partial) | Completed focus run (seeded 1.5 s) logs exactly one session row under each option, no double count after 1.5 s more; a reset run logs none. Pinned task `completed` count not checked. |
| 49 | PASS | Zero console errors or warnings through load, settings, change, return, reload, start, pause, resume, both themes. |
| 50 | PASS | Guard test over new and changed files. |
| 51 | PASS | No try/catch or conditional assertions in the new specs; flat-colour and positive-control checks are separate tests. |
| 52 | **FAIL** (see G) | Break-and-restore results below. |
| 53 | PASS | Implementation Notes contain the symbols, the option identifiers and variant mapping, the URL, `data-gauge-style`, the spring location, and the contrast table. |

### Contrast, measured (criterion 32)
Method: `readout` (`p` after the gauge) screenshotted at DPR 1 and decoded in the browser. Ground = mean of the four 3x3 corner blocks of the digit box (the grain-painted page). Accent and muted are the resolved `--accent-foreground` and `--muted-foreground`. Filled = accent pixels below the stop, unfilled = muted pixels above it, waterline = hard-colour pixels within 2 px of the stop. Stop = 14 + 0.7 x level percent from the bottom (the calibration in `TimerDisplay.tsx`). Level set by writing `--gauge-surface` on the frame.

Ground used: light mean (245,237,227); dark mean (32,24,18). Frontend's single-corner samples (244,237,227) and (33,25,19) differ by under 0.2 in every ratio.

| Theme (ground) | Level | Filled | Unfilled | Waterline |
|---|---|---|---|---|
| light (245,237,227) | 100 | 7.82 (n=7455) | 6.58 (n=141, the sliver in F5) | none |
| light | 75 | 7.82 | 6.58 | 6.08 (n=332) |
| light | 50 | 7.82 | 6.58 | 6.06 (n=419) |
| light | 25 | 7.82 | 6.58 | 5.81 (n=374) |
| light | 0 | none | 6.58 (n=7635) | none |
| dark (32,24,18) | 100 | 12.52 (n=7449) | 8.37 (n=141, the sliver in F5) | none |
| dark | 75 | 12.52 | 8.37 | 7.92 (n=332) |
| dark | 50 | 12.52 | 8.37 | 7.90 (n=419) |
| dark | 25 | 12.52 | 8.37 | 7.92 (n=373) |
| dark | 0 | none | 8.37 (n=7615) | none |

Every ratio is at or above 4.5. Vessel was not re-measured, as instructed; the existing `dark-contrast` and `timer-surface` specs that carry 009's vessel figures pass unchanged.

### Failures and repro

**F1 (criterion 13, focus indicator). Owner: frontend.**
- Repro: `npx playwright test e2e/settings-gauge-style.spec.ts -g "focus ring"`
- Expected: focused Settings link paints a 2 px outline at 2 px offset in `--ring`.
- Actual: computed `outline: solid 3px`, `outline-offset: 0px`, colour `--ring` at 50% (painted [215,164,122]). The shadcn `Button` classes (`focus-visible:ring-3 focus-visible:ring-ring/50`, `outline-ring/50` from the base layer) win over the unlayered `:focus-visible` rule in `app/globals.css:268-271`.
- Note: `StatsButton` (`a[aria-label="Focus stats"]`) shows the identical value. Fixing only `SettingsButton` would diverge it from its neighbour; the owner or orchestrator should decide whether to fix both.

**F2 (criterion 27, cluster and 320 px). No failure.** Listed for completeness: the cluster is one row, 44 px, no overflow in all 32 `/` cases.

**F3 (criterion 31, forced colours). Passes, but the fallback is not load-bearing in Chromium.** The glyph digits paint (ink 200+ px, max ratio at or above 4.5) under `emulateMedia({forcedColors:"active"})`, and so do vessel digits. Break B5 (removing the `forced-colors:` fallback classes from `DIGITS_GLYPH`) still passes this test: Chromium's forced-colour override supplies the digits on its own. So this test cannot show the fallback works. See G.

**F4 (criterion 31, background images unavailable). FAIL. Owner: frontend.**
- Repro: `npx playwright test e2e/settings-gauge-style.spec.ts -g "background images unavailable: glyph"`
- Setup: glyph style, light theme, `addStyleTag("*, *::before, *::after { background-image: none !important; }")`.
- Expected: painted digit pixels differ from the ground (criterion 31 asks for this in both conditions).
- Actual: 0 painted digit pixels. The digits are `text-transparent` and the only paint is the `background-clip: text` gradient, so they vanish. The vessel pair passes (digits visible with no background images), so the failure is specific to the glyph style. `forced-colors` is not a fallback for this case.

**F5 (criterion 20/32, flat colour at full). FAIL, minor. Owner: frontend.**
- Repro: `npx playwright test e2e/settings-gauge-style.spec.ts -g "at full the digits are one flat colour"`
- Expected: at level 100 the in-digits option paints one colour (criterion 32 "same colour at 100 and 0"; criterion 20 description).
- Actual: 141 muted pixels, in rows 13-14 of a 96 px box, colour (87,83,78) light / the dark equivalent. The gradient stop at 84% from the bottom sits a little below the ink top, so the top two rows of the digits are painted muted. Visually this is a thin cap. Its contrast passes (6.58 light, 8.37 dark), so only the flat-colour clause fails. At level 0 the digits are flat (no accent pixels), so the failure is at full only.

**G. Criterion 52, break-and-restore. Not met for two clauses.** Each break was applied to a scratch copy (`scratchpad/qa-copy`, node_modules cloned); the real tree was never edited. Each file was hash-verified after restore.
- Criterion 7 (B1, sanitiser passes unknown gauge ids): 14 tests red. Met.
- Criterion 24 (B4, `TimerDisplay` ignores the stored value): 1 test red (the fresh-visitor flow). Met.
- Criterion 31 (B5, forced-colours fallback removed): the forced-colours test stays green. Not met; a test that does not discriminate. The no-background test (F4) is the one that discriminates, and it is failing at baseline.
- Spring, clause 1 (D, unmount `s.raf = 0` removed, the 005 break): the new spring movement tests fail for both vessel and glyph, and existing `timer-gauge.spec.ts` drawn-liquid tests fail too. Met.
- Spring, clause 2 (B3, stiffness `1224` changed to `1100`): no test fails. The movement test samples per frame and checks distinct frames and settling; a 5% stiffness change still converges. Not met. A settle-time test calibrated against the vendored spring is needed; I did not write one because that is calibration against vendored code and is a judgement call for the owner.

### Notes on the new coverage
- The per-frame spring sampler (`sampleDrawnLevel`) reads the glyph surface, or the vessel `clip-path` top percentage, which is what the spring draws.
- Pixel classifiers have positive controls: the glyph classifier at level 50 must find both sides and a waterline; the ink detector must find digits in the normal render before it is trusted to report zero in F4.
- Rate-of-idle and reduced-motion assertions are paired with running or default-motion positive controls.

### Process notes
- The antislop mode for this QA session was not resolved: no session instruction was given to QA and I did not check a global preference. The test-file comments I wrote were not run through `antislop-code`. The orchestrator should resolve the mode and review those comments.
- Scratch artefacts (`scratchpad/qa-copy`, debug PNGs, logs) are outside the repo. `e2e/qa-debug.spec.ts` was created and deleted during the run; confirmed absent.

### QA Report, pass 2 (dated 2026-10-26)
Scope: re-verify after frontend's fixes to F1, F4 and F5, plus three QA jobs: a discriminating forced-colours probe, an accessibility-tree pin for the doubled readout, and a recorded spring calibration gap. Pass-1 report above is intact.

- **Verdict: PASS.** All gates green on the handed-over tree. Criterion 52's forced-colour clause is now proven red. One known gap is recorded below, per owner decision, and is not a failure.
- **Gates**
  - `npm run typecheck`: exit 0.
  - `npm run lint`: 0 errors, 21 warnings (baseline).
  - `npm run test` (vitest): 732 passed, 0 failed, 19 files. Matches the coordinator's count.
  - `npm run build`: exit 0; routes `/`, `/_not-found`, `/settings`, `/stats`.
  - `npm run test:e2e`: 536 tests (443 existing, 93 in `e2e/settings-gauge-style.spec.ts`). **534 passed, 0 failed, 2 skipped** (pre-existing skips). Frontend's 533 and my earlier 535 were both wrong for this tree: the new spec now has 93 tests (+3 from this pass), and the probe file is gone.

#### What changed in the tests this pass
- **F1 (focus), both entry buttons.** Two tests: `Settings` and `Focus stats` each assert a solid 2px outline, 2px offset, and the resolved `--ring` colour on keyboard focus. Both pass.
- **F4 (background images unavailable).** The existing test now passes: the digits stay painted as a solid text layer, and only the overlay is lost.
- **F5 (flat at full).** The "at full the digits are one flat colour" tests (light and dark) now pass: zero muted pixels at level 100.
- **Forced colours, rewritten to assert our fallback.** The old pixel probe was dropped. It asserts that the overlay host (`span[aria-hidden][data-time]`) has computed `display: none` under `forced-colors: active`. Positive control: the same host is not `none` outside forced colours. The solid digits must not be a transparent colour, with pixel checks kept as support.
- **Accessibility tree, new.** `Accessibility.getFullAXTree` over CDP, for both options: the mm:ss readout is exposed as StaticText exactly once. Positive control: the time is present at all.
- **Comments.** Antislop is in DURING mode (session override), announced before the first edit. Per antislop-code, I flattened the `// ---- ----` banners in the e2e spec to plain labels, and trimmed the over-long comments in `e2e/settings-gauge-style.spec.ts` and `lib/preferences/gauge-style.test.ts`. No code, assertions or identifiers changed. `tsc` and `eslint` are clean on the touched files.

#### Red-proof: each guard fails when its fallback is removed (scratch copy `scratchpad/qa-copy`, real tree untouched)
- **B6, forced-colours fallback removed** (`forced-colors:hidden` taken off the overlay): the forced-colours test goes red. Computed overlay display is `inline`, expected `none`. Restored and matched to the real tree by hash.
- **B7, aria-hidden removed from the overlay host**: the AX test goes red. Received `["02:05", "02:05"]`, expected one. This reproduces the doubled readout. Restored and matched by hash.
- Earlier breaks from pass 1 still stand: B1 (sanitiser, 14 red), B2 (guard, 1 red), B4 (timer ignores stored style, 1 red), D (spring unmount, both renderings red).

#### Glyph contrast, measured (pass 2; ground = mean of 4 corner blocks, as in pass 1)
Light ground (245,237,227); dark ground (32,24,18). Level 100 now has no muted pixels, so the flat-colour clause passes.

| Theme | Level | Filled | Unfilled | Waterline |
|---|---|---|---|---|
| light | 100 | 7.82 (n=7930) | none (flat) | none |
| light | 75 | 7.82 | 6.58 | 6.07 |
| light | 50 | 7.82 | 6.58 | 6.33 |
| light | 25 | 7.82 | 6.58 | 5.96 |
| light | 0 | none (flat) | 6.58 | none |
| dark | 100 | 12.52 (n=7925) | none (flat) | none |
| dark | 75 | 12.52 | 8.37 | 8.01 |
| dark | 50 | 12.52 | 8.37 | 8.25 |
| dark | 25 | 12.52 | 8.37 | 7.87 |
| dark | 0 | none (flat) | 8.37 | none |

- Every ratio is at or above 4.5.
- Filled and unfilled at 75, 50 and 25 are identical to pass 1. The waterline minima moved by up to about +0.3 (light 50: 6.06 to 6.33; dark 50: 7.90 to 8.25), because the band now samples the overlay over the solid base. All pass.

#### Known gap (recorded per owner decision; not built)
- **Spring stiffness is not guarded.** Changing `k = 1224 - 1044 * vis` (`components/SloshGauge.tsx`, stiffness base 1224) to 1100 makes no test fail. This is break B3 from pass 1, and the pass-2 movement test still passes under it.
- **What a future test would need.** A settle-time test that samples the drawn level per frame after a fixed level step, and compares the settle time with a tolerance calibrated against 1224. Calibration needs a deterministic step (a fixed-timestep harness, or stubbed `requestAnimationFrame` time) so the number is stable across machines. That is the work; it is not in this task.
- **Why it is acceptable now.** The constant has not moved since 005. Break D (the unmount `raf` reset) is still caught for both renderings.

#### Files touched in pass 2
- `e2e/settings-gauge-style.spec.ts` (focus tests for both buttons, forced-colours rewrite, AX test, banners, comment trims)
- `lib/preferences/gauge-style.test.ts` (comment trims only)
- `docs/tasks/008-settings-gauge-style.md` (this section only)

## Review Findings
(Reviewer, read-only, 2026-10-26. Working tree vs `e47caca`. Landed by the orchestrator, since
`reviewer` has no write tool by design; the text is the reviewer's, verbatim.)

- **Verdict: APPROVE.** All 36 criteria check out against the diff; the two new red-proofs do
  discriminate; no licensing, branding or `any` exposure. Findings below are ranked, and none of them
  blocks landing.
- **Gates I re-ran myself:** `npm run typecheck` exit 0; `vitest run` 732 passed / 0 failed / 19 files.
  Build and e2e taken from QA pass 2 (534/0/2 of 536), not re-run.
- **Freeze list (criterion 12) is clean**, verified directly: `git diff HEAD` is empty for `lib/timer/`,
  `lib/stats/`, `lib/db/`, `hooks/use-timer-clock.ts`, `hooks/use-hydrate-timer-store.ts`,
  `lib/preferences/boot-script.ts` and its test — and for `package.json` / `package-lock.json`
  (criterion 18). One icon library: the only new icon is `RiSettings3Fill` from `react-icons`.
- **Conventions hold.** No `any` or unsound cast in app code (the only casts are CDP response typing in
  the e2e spec). Named exports throughout. Native `<fieldset>/<legend>/<input type="radio">` on
  `/settings`, one `<main>`, one `<h1>`, back link first in DOM order. Remaining time still derives from
  the stored end timestamp — `TimerDisplay` takes `remainingMs` as a prop, the spring's rAF loop is
  still only in `SloshGauge.tsx`, and the no-time-source guard now covers the two new components.
- **Licensing/branding:** nothing shipped. The grain is a procedural `feTurbulence` data URI, no texture
  asset; `SloshGauge.tsx`'s header still names ReactBits (MIT + Commons Clause), the `shadcn add`
  conflict, and now lists seven local edits (criterion 37). `onPaint` is genuinely optional — typed
  `onPaint?:`, stored as `| undefined` in `Live`, invoked `live.current.onPaint?.(x, th)`, and
  `TimerGauge` passes `undefined` for `vessel`, so the vendored behaviour is untouched when unused.

### Judgement calls I was asked for

1. **The glyph readout's structure is sound.** One `<p>` holds the only text node; the overlay is an
   empty `aria-hidden` `<span data-time>` whose `::after` carries `content: attr(data-time)`. Generated
   content is not in `textContent`, not in Chromium's `innerText` (the criterion-29 test proves this:
   `main` innerText contains the time exactly once in glyph mode), not selectable (`after:select-none`
   on top of generated content not being selectable at all), and not in the AX tree. Copy/paste
   therefore yields `mm:ss` once. The overlay is out of flow (`absolute inset-0` against the `relative`
   `<p>`), so it adds no width and cannot reflow — pinned by the identical-bounding-box test. Losing
   background images drops only the overlay; forced colours sets the host to `display: none`. I looked
   for a third failure mode and found two soft edges, both recorded below as R-3 and R-4, neither a
   defect today. One thing I checked and cleared: there is **no vessel flash** for a stored `glyph`
   preference, because `ThemeSync`'s `persist.rehydrate()` effect commits before the timer store's gate
   that mounts the gauge, so `prefsHydrated` is already true when the first gauge frame paints.
2. **Both new red-proofs discriminate.** Forced colours (`e2e/settings-gauge-style.spec.ts:575-593`)
   reads the host's computed `display` and returns the sentinel `"no-host"` when the element is absent,
   so every way of losing the fallback — removing `forced-colors:hidden`, or removing the host — turns
   the `expect.poll(...).toBe("none")` red, and the positive control outside forced colours is a real
   assertion. The AX test (`:734-758`) filters non-ignored `StaticText` nodes over CDP and asserts both
   `toContain(time)` (positive control) and `filter(=== time).toHaveLength(1)`; removing `aria-hidden`
   genuinely yields two nodes, which matches QA's recorded `["02:05","02:05"]`. Neither has 009's
   can't-fail shape.
3. **The grain costs real contrast headroom in exactly one place** — see R-2. Everything else is safe,
   and I verified why: the grain sits behind all element backgrounds, and every surface that carries a
   measured figure (`--card` task rows, `--popover` dialog and gauge glass, `bg-secondary` buttons) is
   opaque, so the eight task swatches, the vessel's 4.99/15.30 light and 4.68/15.12 dark, and the dark
   `--popover` figures all stand unchanged. The glyph table was measured painted *with* grain, so it is
   the most trustworthy table in this file.
4. **`SloshGauge.tsx`'s `onPaint` is correctly recorded and correctly optional** — see the licensing
   bullet above. It also costs nothing per frame for `vessel`, and writing two custom properties on an
   ancestor from inside `paint()` keeps the per-frame work out of React entirely: no re-render per
   frame, `onPaint` is a `useCallback([])`, and `live.current` is refreshed by ref, not by effect
   re-subscription.

### Findings

**R-1 (medium, follow-up — not a blocker). On `/settings` the selected option is distinguishable only
by font weight under forced colours.** `components/SettingsPanel.tsx:52-55`: the radio is `peer sr-only`,
and checked state is carried by `peer-checked:border-primary` plus
`peer-checked:shadow-[inset_0_0_0_1px_var(--primary)]`. In forced-colors mode the UA forces every
`border-color` to the same system colour and forces `box-shadow` to `none` (CSS Color Adjust 1 §3.2),
so both edges render identically and the clipped native radio shows nothing — leaving `font-bold` vs
`font-medium` as the whole indicator. No criterion requires forced-colors *state* indication (criterion
31 scopes forced colours to the digits, criterion 45 to measured ratios), and weight is a non-colour
cue, so this is not a WCAG failure — but it is thin for the one screen whose job is choosing. Cheapest
fixes: `forced-colors:not-sr-only` on the input (restores the native dot), or a
`peer-checked:forced-colors:outline peer-checked:forced-colors:outline-2` on the card. Either way, the
comment at `SettingsPanel.tsx:22-25` ("so it holds in greyscale and forced colours") should be
corrected: greyscale holds, forced colours does not.

**R-2 (medium, documentation accuracy — no floor broken).** The paper grain makes criterion 45's quoted
unchecked-edge figure stale. `--control-border` (`#88837e`) on the light page ground measures **3.44:1
against the flat token, ~3.26:1 against the mean grained ground, and 3.01:1 against a worst-case
full-mask grain pixel** (my computation, compositing `--grain-ink` at `--grain-opacity` over
`--background`; my mean reproduces QA's painted sample of 245,237,227 to within a unit). So the
unchecked radio edge — which has no fill behind it and therefore sits on grain inside *and* out — still
clears its 3:1 floor, but on roughly 60% less headroom than the figure criterion 45 cites. Dark is
comfortable (3.80 → ~3.66). Two things to land with this: (a) criterion 45's "unchecked edge is
`--control-border` (3.44 / 3.80, 009)" should read ~3.26 light; (b) `--control-border` is now the one
token in the palette with no room left to spend — worth a line in DECISIONS or PLAN so the next task
that darkens a ground, or reuses this edge on a fill-less control, knows it. Also note for the record
that the grain's own tokens ship without criterion 44's "measured figures for every ground it is
painted on" (the equivalent evidence — the 236-251 / 28-40 painted spread — is in DECISIONS instead);
that is consistent with the grain having shipped off-pipeline, and the figure above closes the gap.
Everything else in the DECISIONS grain entry checks out, including "never composites over text,
controls or the eight task swatches".

**R-3 (low).** The glyph waterline mapping (`14 + 0.7·level + 0.4·max(0, level-90)`, `TimerDisplay.tsx`)
is calibrated to Space Grotesk's ink box at 60-96 px. If the webfont does not paint (a 404, or the
`font-display` fallback window), the fallback face's cap height and baseline differ and the stop no
longer lands on the ink — which is exactly the F5 class of bug, including the muted cap at level 100
that pass 2 just removed. Nothing asserts this, and I am not asking for a test; one sentence in the
Implementation Notes saying the calibration assumes the loaded face would stop the next person
re-deriving it.

**R-4 (low).** At the `@supports (background-clip: text)` boundary (older Safari), the overlay renders
as fully transparent text and the vessel is already transparent and borderless in glyph mode — so those
users get legible digits with **no level indicator of any kind**, rather than a fallback to the vessel.
Criterion 31 is satisfied (digits legible), and the browser set is narrow, so this is a record-it item,
not work.

**R-5 (nit).** Criterion 29's "copied string" clause is covered by `textContent` / `innerText` proxies
only; nothing reads the clipboard. The proxies are sound here (generated content is not selectable), so
this is noted for completeness.

**R-6 (nit).** `docs/PLAN.md` still labels 009 "Complete but not committed" while the git log shows
`09a50e3` / `e47caca`. The task file already flags this under Observations as the orchestrator's; it is
still unfixed in this tree. The same line is *correct* for the paper grain, which genuinely is
uncommitted.

**R-7 (nits, cosmetic).** `CLAUDE.md` leaves a doubled blank line where the old "Trivial changes…"
sentence was removed. `TimerDisplay.tsx`'s block comment has one run-on line that breaks the file's
wrap width, left over from the F4 edit rounds. `SettingsButton.tsx` wraps its `<Button asChild>` in a
bare `<div>` — redundant, but it mirrors `StatsButton` exactly, which is the right call for a pair that
must not diverge.

### Checked and clear, for the record
Prototype deletion is complete — no `app/prototype` or `components/prototype` reference survives in
`app/`, `components/`, `hooks/`, `lib/`, `widgets/` or `e2e/`; the `ALLOWED_LITERALS` entry and the
009 criterion-45 block are gone with it, and the `settle` import went with the block so lint stays at
0 errors. The reworked first-paint assertion in `e2e/dark-theme-control.spec.ts` is *stronger* than the
exact-match it replaced, because the "nearer the correct ground than the other theme's" clause is a
~220-per-channel margin against ~15 of noise. The vessel path is byte-equivalent in output: the
non-glyph branch composes the identical class list it had at `HEAD`. Spring constants still resolve to
exactly one file, and the recorded stiffness gap (B3) is correctly characterised as uncovered rather
than passing.

---

## Refreshed 2026-10-26 — what changed, and what was cut

Original draft predates 006, 007 and 009. **53 criteria → 36.** Survivors keep their original
numbers, because DECISIONS and PLAN cite 1, 5 and 18 by number.

**Blockers removed**
- "Hard dependency: 006 must be closed first" → "Dependencies — all clear". 006's criterion-10 pin no
  longer binds. *Correction to the brief this refresh was given:* 006 has **no reviewer verdict** — it
  was closed by an orchestrator note on 2026-10-21 with its Review Findings left as the template.
  That is why old criterion 3 ("006 is done with a Review Findings verdict") was cut rather than
  reworded: as written it can never be satisfied.
- **Q4 answered and closed** (`--control-border`, 3.44:1 / 3.80:1).

**Data shape: undecided → decided**
- The zustand-vs-Dexie section is replaced with what exists. 009 built `lib/preferences/` exactly as
  this file's PM read argued, and DECISIONS records it as answering 008's criterion 1. **008 adds one
  key.** Criterion 1 now only asks for an entry in the version-bump case. Criterion 5 absorbed "exactly
  one preference system". Criterion 7 absorbed the real migration case and now matches the recorded
  write-back behaviour — a test asserting the bytes are untouched would be wrong, which is also a
  stale comment in `store.ts:43-45` that backend should fix while it is in the file.

**Theme controls: deferred → never**
- The "build it so a theme section drops in" instruction is gone. 009 shipped the control in
  `widgets/HeaderNav.tsx` and the owner's 2026-10-26 decision keeps it there; criterion 23 now asserts
  `/settings` renders no theme radio, which is what preserves 009's "one instance ships" rule. 009's
  own "008 will move or mirror this control" line is overruled.

**Prototype: scope → already done**
- The owner deleted `app/prototype/` and `components/prototype/`; the orchestrator landed the fallout
  (009's criterion 45 e2e block, the `ALLOWED_LITERALS` entry and its assertion). Verified gone.
  Old criterion 39 is **cut, not deferred**, and the stale-test instruction with it.
- Knock-on, verified by grep: the spring constants now live in **exactly one file**, so there is no
  duplicate to collapse. The "a real extraction, not a copy-paste" section is rewritten — the
  extraction is now **optional and frontend's call**; the only requirement is that no *second* copy
  appears (criterion 36).

**Facts corrected against the code**
- The vessel's "9.79:1 / 15.30:1" is void — 009 re-pointed `--gauge-liquid` to `#d97706`, making it
  4.99 / 15.30 light and 4.68 / 15.12 dark. The whole variant table is relabelled pre-009 provenance;
  variant 2's 1.49:1 is void too, and the decision not to ship it now rests on this task's 4.5:1
  floor, not that figure.
- Old criterion 41 was **unsatisfiable**: it required the no-rAF guard to cover every file the task
  adds, including a spring module that must contain exactly one rAF loop. Now a named exemption.
- Old criterion 43 told QA to hand-extend `TimerSurface.tokens.test.ts`; 007's
  `components/palette.tokens.test.ts` discovers files by walking four directories, so it covers new
  files automatically. Merged into 42 as a membership assertion.
- Criterion 44: a new token now needs **both** a `:root` and a `.dark` value with measured figures —
  "milestone 4 will give it a dark value" stopped being valid when `.dark` shipped. The pinned list
  gained the `.dark` block and 009's `prefers-reduced-motion` block.
- Criterion 45 was "dark-ready for a future `.dark` block"; dark exists, so it is measured in both
  themes, with the `--popover`-cannot-be-lifted constraint named.
- Criterion 46 restores the verified baselines (lint 21 warnings, vitest 667, routes `/`, `/settings`,
  `/stats`, `/_not-found`) and absorbs old criterion 47, whose named spec list was five files short.
- Criterion 51 cited 2026-10-15 for the four can't-fail shapes; they are in the 2026-10-09 entry.
  Criterion 37 and the spring section cited 2026-10-15 for the ReactBits vendoring entry, dated
  2026-10-19.
- Criterion 19 names the real precedent (`ThemeControl.tsx:27-47`) instead of describing one.
- Criterion 10 now says what "no mismatch" means here and records that **no boot script is needed**,
  because `TimerGauge.tsx:44` already gates on the timer's hydration.
- Criteria 13 and 27 account for `widgets/BottomControls.tsx` becoming a three-button cluster.
- Criterion 36 states the constant count must stay at one rather than grow.
- Criterion 21 fixed to the settled answer (two options), and absorbed old 22.
- Stale observations about `StatsButton`/`TaskListDialog` sizes and raw palette classes removed — 007
  fixed both.

**Cut, with reasons** (17 criteria; numbers left as gaps so survivors keep theirs)

| Cut | Why |
|---|---|
| 3 | Gated on a 006 review verdict that does not exist. Unsatisfiable as worded. |
| 4 | "Persists and survives reload/new tab" is already criterion 24's second clause. |
| 6 | Merged into 5 (one storage key, one store, one version constant). |
| 8 | Merged into 7 as its first named case, where the test lives anyway. |
| 11 | The Dexie branch is void; `lib/db/` moved into criterion 12's diff pin. |
| 14, 15 | Merged into 13 — one entry-point criterion instead of three. |
| 17 | Merged into 16; both are "the trip does not disturb the timer". |
| 22 | Merged into 21 — a two-member value set already excludes a third identifier. |
| 26 | Merged into 19; native radios are what make the keyboard walk work. |
| 28 | Merged into 27 — same two viewports, same run. |
| 30 | Merged into 29; "real text in the a11y tree" is the same assertion. |
| 33 | Merged into 32 as its "expected, not a defect" clause. |
| 38 | Covered by 35 (named tests pass unchanged) plus 52 (break-and-restore in both renderers). |
| 39 | Already done — prototype deleted, fallout landed. |
| 43 | Merged into 42; the guard is self-discovering. |
| 47 | Merged into 46. |

**009's sweep findings** are ruled on in a table rather than left for frontend to discover: all five
are **out**, two leave a constraint behind (the 320 px bottom cluster, the `--popover` elevation cap),
and the `HeaderNav` landmark defect must not be copied into the new page. `components/TaskForm.tsx` is
not touched by this task at all, so its dead `disabled:` utilities are explicitly not 008's.
