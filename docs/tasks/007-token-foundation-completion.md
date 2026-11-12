---
id: 007
slug: token-foundation-completion
status: done # draft | in-progress | qa | review | done | blocked
---

# Milestone 4, part 1: completing the token foundation (task-list surface, interactive-boundary token, mode-chip selection cue)

> **History for this task** — implementation notes, QA reports, review findings and
> orchestrator rulings live in [logs/007-token-foundation-completion-log.md](logs/007-token-foundation-completion-log.md). Read it only when a
> criterion below is disputed; it is not an input to implementing them.

## Goal
Finish the job 006 started, so that `docs/PLAN.md` milestone 4's premise — "add a single `.dark`
block instead of restyling everything a second time" — is **true for all of the app**, not just the
timer surface. Three things, in this order:

1. **Fix a live accessibility regression:** mode selection is currently conveyed by colour alone.
2. **Sweep the last raw Tailwind palette classes out of app code**, so a repo-wide guard can assert
   zero and keep it at zero.
3. **Add the interactive-boundary token** that `--border` cannot be, and apply it to the controls
   that need a 3:1 boundary — which is how 006's open criterion 14 gets resolved.

When this closes, every colour painted by `app/**`, `components/**`, `hooks/**` and `widgets/**`
resolves through a semantic token or a `color-mix()` of tokens, and milestone 4's dark block has a
single place to define its values.

**This is not a zero-visual-change refactor.** 006 was. This task ships **three deliberate visible
changes** (the chip selection cue, a visible boundary on the Stats button, a visible boundary on the
custom-duration input) plus whatever deviations the palette sweep forces. Everything outside those
three aims at visual parity and must be measured, not assumed.

## Provenance
**Milestone 4, part 1 of five**, from the owner's "initiate milestone 4". `docs/PLAN.md`'s milestone
4 lists five parts: semantic tokens across the remaining UI (this task), the visible light/dark
toggle, paper grain, the settings surface (008), and uploaded backgrounds.

### Why this is the only milestone-4 task file being written now
**Deliberate, not an oversight.** The other four parts get their task files when their turn comes.

006 is the reason. It was written against a UI the owner was still actively redesigning, and commit
`2e8f967` ("Reconfigure of UI for aesthetic") deleted the mode-chip pills that five of 006's
criteria describe. 006's swap table, its deviation list and the chip half of its criterion 14 now
describe markup that no longer exists. A task file written in advance against a moving UI goes stale
between being written and being worked, and then an agent spends a cycle reconciling a spec with
reality instead of building.

So: no file yet for the dark toggle, the paper grain, or the uploaded backgrounds. Each is written
when the part before it has closed and the UI it describes has stopped moving. The settings surface
already has 008, written on a direct owner ask; it stays as it is.

## What closing this task does to 006 — state it plainly

**006 is superseded, not patched, and closes when this task closes.** Specifically:

- **006's criterion 14 is resolved here, by a new interactive-boundary token** — not by a per-case
  exemption and not by editing `--border`. The measurement behind that: `--border` `#d6d3d1` is
  **1.36:1** on `--background` and **1.43:1** on `--popover`; reaching 3:1 needs roughly `#8f8a85`
  (**3.13:1**). WCAG 1.4.11 only requires 3:1 for a boundary that **identifies a component or its
  state**. Decorative dividers and container hairlines are not that, so they keep the soft
  `--border`, and interactive boundaries get a stronger token. See section C.
- **006's chip criteria (its 20-26, its swap-table chip rows, its deviation list, the chip clause of
  its 14) are superseded.** `2e8f967` replaced the pill chips with flat uppercase text. The fill,
  border and radius those criteria measured are gone. What survives from 006's chip work is the
  `cva` module at `components/ui/mode-chip.tsx` and the native-radio markup, both of which this task
  keeps.
- **006's remaining open questions stay open and stay with the owner** (its Q1 `--gauge-liquid`, Q2
  the `--font-geist` self-reference, Q3 `--font-mono` rendering proportional, Q5 the hardcoded
  `#b45309` in the unlayered `:focus-visible` rule). None of them is resolved here. Q5 in particular
  now belongs to milestone 4's **dark toggle** part, not to this one: a hardcoded focus colour only
  breaks once there is a dark palette to break against.
- **006's Q4 is answered by the owner, not by an agent.** The commented-out "Pomotato" header in
  `app/page.tsx:9-12` is gone; `widgets/HeaderNav.tsx` now renders `pomotato` with `text-primary`.
  The product name is back on `/` and already token-clean. Nothing to do; recorded so the question
  stops being carried forward.

The orchestrator flips 006's `status:` once this file exists. Do not edit 006's QA Report or Review
Findings.

**008 unblocks when this task closes.** 008 names 006 as its hard dependency (its criterion 3), but
the real dependency was the token foundation, and 006's criterion 10 pin on `TimerDisplay.tsx` /
`TimerGauge.tsx` — neither of which this task touches. Once this closes, 008's blocker is gone.

## Pipeline
**Frontend-only: frontend → qa → reviewer. Backend does not run.**

**Data shape is unchanged and irrelevant.** No Dexie version, no table, no field, no type in
`lib/db/**`. No store shape change in `lib/timer/**`. No new persisted value — the chip cue is
derived from existing state and the new token is CSS.

If anything here appears to require a change under `lib/**` or `hooks/**`, or an edit to an
*existing* value in `app/globals.css`, the scope was wrong: **stop and report** instead of editing
those paths.

---

## Part 1 — the live accessibility regression (do this first)

`2e8f967` stripped the fill, border and radius out of `components/ui/mode-chip.tsx`, leaving the
chips as flat uppercase text. **Which mode is selected is now conveyed by colour alone**, which
fails WCAG 1.4.1 (Use of Color). Measured, on the cream page:

| | Token | Ratio on cream |
|---|---|---|
| Selected label | `--accent-foreground` `#78350f` | 8.31:1 |
| Unselected label | `--secondary-foreground` `#44403c` | 9.41:1 |
| **Selected vs unselected** | | **1.13:1** |

In greyscale those are **74 and 67 out of 255** — a 7-point difference, effectively identical. Both
labels are legible; what is lost is *which one is active*.

Before `2e8f967`, selection carried three redundant cues: an `--accent` fill, a `--primary` border
at 4.60:1, and `font-semibold` on the checked chip. All three are gone. The `font-bold` the owner
moved onto the container (`components/ModeSelector.tsx:17`) applies to **all four** chips, so weight
no longer differentiates either.

Native radios still report `checked`, so screen readers are unaffected. This hits sighted users with
colour vision deficiency, and anyone on a washed-out or sunlit screen.

**The flat-text direction is preserved. Do not reinstate pills, fills, borders or radii on the
chips.** What is required is a **non-colour cue that distinguishes the checked chip from the
unchecked ones**. That requirement is not optional and not tradeable against aesthetics —
`DESIGN.md`: "Accessibility is not negotiable against aesthetics." *Which* cue is aesthetic, so it is
Q1 with a default so nobody is blocked.

Also in that file, and in scope: the unchecked variant carries
`hover:border-[color-mix(in_srgb,var(--border),var(--foreground)_30%)]` with **no `border` width
class**, so the hover paints nothing. Dead CSS left behind by the same commit.

### The four failing Playwright tests belong to this task
Baseline handed over: **281 passed, 4 failed, 2 skipped.** All four failures assert a mode-chip fill
or border that `2e8f967` deleted. They are **stale assertions, not app defects**. The mechanism, for
whoever picks them up: `readPaint()` in `e2e/timer-surface-tokens.spec.ts` calls `parseRgb()`, which
throws on `rgba(0, 0, 0, 0)` — so a chip with no fill makes the helper throw before any assertion
runs.

The likely set is `e2e/timer-surface-tokens.spec.ts:162` (selected chip), `:173` (unselected chip),
and the two parameterised chip-focus tests at `:265`. QA confirms the actual set rather than trusting
this list.

**One of them needs more than a rewrite.** The `test.fail()` at `:187` ("unselected chip border
against the page reaches 3:1 — KNOWN FAILURE: 1.36:1") now *passes*, because `painted()` throws when
there is no border at all. The marker is no longer documenting "this boundary measures 1.36:1"; it
is masking "this control has no boundary". It must be removed or replaced, not carried forward.

The **2 skips stay skipped**: they are owner-parked on the `CurrentTaskCard` pomodoro count
(`e2e/task-list-dialog.spec.ts`). Their assertions stay untouched.

---

## Part 2 — the remaining raw palette

006 swept the timer surface. This is what is left, verified against the working tree at `d7d1bec`
(occurrence counts, not line counts):

| File | Count | Surface / ground |
|---|---|---|
| `components/TaskForm.tsx` | 38 | task list — `bg-white` cards inside a `--popover` dialog behind a scrim |
| `components/TaskRow.tsx` | 19 | same |
| `components/TaskList.tsx` | 6 | same |
| `components/TaskListDialog.tsx` | 2 | the dialog trigger, on the cream page |
| `components/TaskColorDot.tsx` | 1 | `border-black/10` hairline around the swatch |
| **Total** | **66** | |

**Different contrast ground from 006.** The timer surface sits on `--background` (cream `#fbf4ea`).
This surface sits on `--popover` (`#fffaf3`), on `bg-white` cards *inside* that popover, and behind a
scrim. Every ratio is measured against its own ground; a figure taken against cream is wrong here.

**`components/TaskColorDot.tsx` is genuine chrome, not data.** Its one hit is `border-black/10` on
line 20 — a translucent hairline around the swatch. The swatch values themselves come from
`TASK_COLOR_HEX` in `components/task-palette-colors.ts` through an inline `style`, which this project
treats as contrast-checked data, not theme. A `black/10` hairline vanishes on a dark card, so the
hairline needs a token; the swatch values do not change (Q3).

### Two files the orchestrator's survey did not name — added by the PM, strike them if you disagree

1. **`components/TaskListDialog.tsx`** (2 sites: `text-white`, `hover:text-white` on line 44). Not in
   the brief's enumeration, and 006 listed the file as untouched. It is in scope here for a concrete
   reason: `components/TaskListDialog.tokens.test.ts` **already guards this exact file** and passes
   today, because that guard uses the task-005-era regex
   (`/\b(?:amber|stone|red|…)-\d{2,3}\b/`) which cannot see `text-white`. A live guard on a file with
   two raw palette classes in it is the exact failure mode 006's criterion 5 was written about.
   Leaving it means the "zero raw palette in app code" assertion is false on day one.
2. **`components/task-palette-colors.ts`** — **comment only, no value changes.** Its docstring states
   the eight swatches are contrast-checked "against this milestone's card background (white,
   `#ffffff`)" and clear 3:1. This task replaces that white card fill with a token, so the stated
   ground stops existing and the claim goes stale. Re-measure the eight swatches against whatever the
   card fill becomes and update the comment to name the token. **Swatch hex values are an owner
   palette decision and do not change here** — if a swatch drops below 3:1 against the new ground,
   that is a finding for the owner, not an edit.

### Files added by `2e8f967` / `d7d1bec` and never counted by the original 86-site survey
These carry **no raw palette utility**, so they need no swap — but two of them have a colour problem
the survey's method could not see:

- **`components/StatsButton.tsx`** — `<Button variant="secondary">` with `border-none`. `--secondary`
  (`#f5f5f4`) measures **1.00:1** against the cream page (`#fbf4ea`), and there is no border. It is
  an **invisible 44 px control** holding a legible icon. Nothing is wrong with its classes; the fill
  it asks for does not exist against this page. The interactive-boundary token is the fix.
  (008's Q5 claimed this file uses a default export and carries `bg-neutral-200`. Both are now
  stale — it exports `StatsButton` by name and uses `variant="secondary"`.)
- **`widgets/HeaderNav.tsx`**, **`widgets/BottomControls.tsx`** — verify-only. `HeaderNav` paints
  `text-primary` on cream; `BottomControls` paints no colour at all. Both are already token-clean;
  they are listed so the repo-wide guard in criterion 9 covers them and so nobody re-surveys them.

---

## Part 3 — the interactive-boundary token

**Settled at owner level: a new token, not a per-case exemption, and not an edit to `--border`.**

`--border` stays soft. It is shared by the whole app and by every `shadcn add`, and WCAG does not
require 3:1 of a decorative divider or container hairline. What needs 3:1 is a boundary that
**identifies a component or its state**. Those get the new token.

Three controls are affected today:

| Control | Today | Problem |
|---|---|---|
| `CustomDurationInput` border | `border-input` (= `--border`) | 1.36:1 on cream — 006's open criterion 14 |
| Mode chips | no boundary at all since `2e8f967` | only if they regain one; the Part 1 cue should not be a border |
| `components/StatsButton.tsx` | no boundary, `--secondary` fill at 1.00:1 | the control is invisible |

Plus whatever the Part 2 sweep classifies as interactive on the task-list surface (the row action
buttons, the Cancel button, the text inputs, the swatch selection ring).

The token's name and value are frontend's to pick and measure. The **requirement** is: it reaches
3:1 against **every** ground it is painted on (at minimum `--background` and `--popover`, plus the
card fill chosen for task rows), and its comment carries milestone 4's dark obligation.

---

## Scope

**In:**
- The mode-chip non-colour selection cue, and the dead hover class in
  `components/ui/mode-chip.tsx` (Part 1).
- Resolving the four stale Playwright failures and the stale `test.fail()` marker (Part 1).
- Replacing every raw palette utility in `components/TaskForm.tsx`, `components/TaskRow.tsx`,
  `components/TaskList.tsx`, `components/TaskListDialog.tsx` and `components/TaskColorDot.tsx`
  (66 sites) with semantic tokens or `color-mix()` of tokens (Part 2).
- Re-measuring the eight task swatches against the new card ground and correcting the docstring in
  `components/task-palette-colors.ts` — comment only (Part 2).
- The new interactive-boundary token in `app/globals.css`, plus its `@theme inline` mapping, and its
  application to the custom-duration input border, the Stats button, and the task-list controls that
  identify a component or its state (Part 3).
- A written classification of every boundary this task touches as **interactive** (3:1, new token) or
  **decorative** (keeps `--border`), so the distinction is auditable rather than ad hoc.
- Measuring, recording and reporting before/after contrast for every pair any changed colour
  participates in, from painted pixels in a real browser.
- Extending the 006 guard-test pattern to every file in scope, and widening its reach to assert
  **zero** raw palette utilities across all app code.

**Out (deferred, do not do here):**
- **The dark block itself, the dark palette, and the visible light/dark toggle.** Milestone 4 part 2.
  This task makes the single-block swap possible; it does not take it.
- **Paper grain** (part 3) and **uploaded backgrounds** (part 5). Both deferred to milestone 4 by
  name in `DESIGN.md`; neither gets a task file yet.
- **The settings surface.** That is 008, which unblocks when this closes.
- Anything under `lib/**` or `hooks/**`. No data-layer change, no store change, no hook change.
- Any edit to an **existing** value, mapping or rule in `app/globals.css`. `--border` keeps
  `#d6d3d1`. The `body` rule, the unlayered `:focus-visible` rule, the `@layer base` block and every
  existing `@theme inline` mapping stay as they are. **Additions only** — including the new token's
  own `--color-*` mapping, which is an addition to an existing `@theme inline` block and is
  permitted.
- Reinstating a fill, border, radius or pill on the mode chips. The owner's flat-text redesign
  stands.
- Replacing the native radios in `ModeSelector.tsx` or in `TaskForm.tsx`'s colour picker with a
  segmented control, Radix `ToggleGroup type="single"`, or any ARIA-constructed widget. **Settled and
  recorded** in the 2026-10-19 entry in `docs/DECISIONS.md`. The `<input type="radio">` elements stay.
- Changing any `TASK_COLOR_HEX` swatch value. Owner palette decision.
- Any new runtime dependency, and any change to which icon library the app uses (Q2).
- Un-skipping the two parked tests in `e2e/task-list-dialog.spec.ts`. They stay skipped, reasons and
  assertions untouched.
- Any change to task-list *behaviour*: add, edit, delete-confirm, pin, increment/decrement, reorder,
  drag-and-drop, Escape layering, focus management, Dexie reads. Colours and the chip cue only.
- 006's open items Q1, Q2, Q3 and Q5. They stay with the owner (see "What closing this task does to
  006").
- `components/CurrentTaskCard.tsx`'s dead `TaskColorDot` import and its `border border-none bg-none`.
  Pre-existing, no colour in it, not this task's file. Still listed under Observations.

---

## Acceptance Criteria

### A. The colour-only selection regression (criterion 1 is the first thing fixed)

- [ ] 1. **The checked mode chip is distinguished from the unchecked chips by at least one cue that
      is not colour.** QA asserts a *computed, non-colour* CSS property whose value differs between
      the checked chip and every unchecked chip — for example `font-weight` with a delta of **at
      least 300**, or `text-decoration-line`. A difference that exists only in `color`,
      `background-color`, `border-color` or `outline-color` does not satisfy this criterion.
- [ ] 2. **The cue survives the loss of colour.** Under Playwright's
      `emulateMedia({ forcedColors: "active" })`, and separately with a greyscale filter applied, the
      checked chip is still distinguishable from the unchecked ones by the criterion-1 property. QA
      asserts the property in both conditions, not just at default rendering.
- [ ] 3. **The flat-text direction is preserved.** The four chips paint **no fill, no border and no
      radius** in either state: computed `background-color` is `rgba(0, 0, 0, 0)`, computed
      `border-top-width` / `border-bottom-width` / `border-left-width` / `border-right-width` are all
      `0px`, in both the checked and unchecked state. (The focus outline is not a border and is
      unaffected.)
- [ ] 4. **Both labels still pass AA on the page**: the checked label and the unchecked label each
      measure **≥ 4.5:1** against the painted page background. Figures from painted pixels.
- [ ] 5. **The dead hover class is gone.** `components/ui/mode-chip.tsx` contains no
      `hover:border-*` (or any other hover utility) that cannot paint because no width is set. QA
      greps the file and, for any hover utility that remains, asserts it produces an observed
      computed change on hover.
- [ ] 6. **The chip row does not break at 320 px.** For each of the four modes selected in turn, at
      320 px and at 1280 px: `document.documentElement.scrollWidth <= clientWidth`, all four chips are
      within the viewport, and each chip is still at least 44 px in both dimensions. If the chosen cue
      changes chip width (a weight differential does), the resulting row reflow is recorded in
      Implementation Notes with the measured per-chip width delta, and must not push any chip out of
      view or cause a horizontal scrollbar.
- [ ] 7. **Native radio semantics are unchanged.** The `<input type="radio" name="timer-mode"
      className="peer sr-only">` elements, the `<fieldset>` and the `<legend className="sr-only">Timer
      mode</legend>` are unchanged. No `role`, no `aria-*`, no Radix primitive, no `ToggleGroup`. Tab
      enters the group once and lands on the checked radio; arrow keys move between modes and change
      the timer mode; clicking a label selects its radio; the group's accessible name is exactly
      `Timer mode`. `e2e/mode-selector-legend.spec.ts` passes unchanged.
- [ ] 8. **Chip keyboard focus is unchanged and still visible on the chip**: 2 px outline at 2 px
      offset resolving to `--ring`, in both the checked and unchecked state, at **≥ 3:1** against the
      painted page. QA measures width, offset and colour, not just presence.
- [ ] 9. **The four stale Playwright failures are resolved and enumerated.** QA lists each previously
      failing test by `file:line`, states whether it was rewritten, replaced or deleted, and why. The
      suite finishes **0 failed**. The `test.fail()` marker at
      `e2e/timer-surface-tokens.spec.ts:187` is removed or replaced — it currently passes only because
      the border it measures does not exist, which masks rather than documents the condition. The
      **2 skips stay** the two owner-parked `e2e/task-list-dialog.spec.ts` tests, assertions
      untouched, and `git diff -- e2e/task-list-dialog.spec.ts` shows no change from this task.

### B. No raw palette left anywhere in app code, and a net that keeps it that way

- [ ] 10. `components/TaskForm.tsx`, `components/TaskRow.tsx`, `components/TaskList.tsx`,
      `components/TaskListDialog.tsx` and `components/TaskColorDot.tsx` contain **zero** raw palette
      utilities: no `(bg|text|border|outline|ring|ring-offset|from|to|via|divide|placeholder|caret|
      accent|decoration|shadow|fill|stroke)-(stone|amber|red|orange|yellow|green|emerald|teal|sky|
      blue|indigo|violet|purple|pink|rose|slate|gray|zinc|neutral|black|white)`, with or without a
      numeric step and with or without a `/NN` opacity suffix.
- [ ] 11. **The foundation assertion.** A guard asserts **zero** raw palette utilities across *all*
      of `app/**/*.tsx`, `components/**/*.tsx`, `hooks/**/*.ts(x)` and `widgets/**/*.tsx`, excluding
      test files, with an explicitly pinned allow-list that is **empty**. This is the criterion that
      makes "milestone 4 can add one dark block" a checked fact rather than a claim. Any file added
      later is covered automatically, or the guard's file discovery is broken and QA says so.
- [ ] 12. The five files in criterion 10 contain no `#rrggbb`, `rgb(`, `rgba(`, `hsl(`, `hsla(`,
      `oklch(`, `oklab(`, `lab(`, `lch(`, `hwb(` or `color(` literal.
- [ ] 13. **`components/TaskColorDot.tsx`'s inline swatch colour is exempted explicitly, in the
      guard, with a written reason** — not left to pass by accident. The guard's inline-style check
      pins this one file with a comment saying the swatch value is contrast-checked data from
      `TASK_COLOR_HEX`, not theme. An exemption without a reason is a failure of this criterion.
- [ ] 14. **The guard regex catches `white`, `black`, `/NN` opacity suffixes and the OKLCH-family
      colour functions.** QA demonstrates this with positive cases — the 006 pattern in
      `components/TimerSurface.tokens.test.ts` already does; `components/TaskListDialog.tokens.test.ts`
      does **not**, which is why it passed over `text-white` for two tasks. That older pattern is
      either replaced by the wider one or deleted, and QA states which.
- [ ] 15. **QA proves the guard is live by break-and-restore**, not by running it: reintroduce one
      raw utility per shape (`bg-white`, `border-black/10`, a `palette-NN`, an `oklch()` literal),
      confirm the specific test fails each time, restore, and record the before/broken/restored file
      hashes in the QA Report. Running a green guard is not evidence.
- [ ] 16. `components/task-palette-colors.ts` changes **comments only** — `git diff` on that file
      shows no change to any `TASK_COLOR_HEX` value. The docstring names the token the swatches are
      now measured against, and the eight re-measured ratios are in Implementation Notes. Any swatch
      below 3:1 against the new ground is reported as a finding for the owner, not fixed here.

### C. The interactive-boundary token

- [ ] 17. **One new token** is added to `app/globals.css` for boundaries that identify a component or
      its state. It measures **≥ 3:1** against every ground it is painted on — at minimum
      `--background` and `--popover`, plus the card fill chosen for task rows. Ratios from painted
      pixels, per ground, in Implementation Notes.
- [ ] 18. The new token's comment carries all three parts 006's criterion 8 required: **(a)** the role
      it serves, **(b)** why no existing token fits (`--border` is 1.36:1 on `--background` and
      1.43:1 on `--popover`, and is shared app-wide including by every `shadcn add`), and **(c)** that
      **milestone 4 must give it a dark value and re-measure against the dark grounds**. A token added
      without that comment fails this criterion.
- [ ] 19. **`git diff app/globals.css` contains additions only.** The new token, and its `--color-*`
      mapping appended to an existing `@theme inline` block, are the entire diff. No edit to the
      `body` rule, the unlayered `:focus-visible` rule, the `@layer base` block, any existing
      `@theme inline` mapping, or any existing token value. `--border` is still `#d6d3d1` and
      `--input` is still `#d6d3d1`. Reviewer verifies by diff.
- [ ] 20. **Every boundary this task touches is classified in writing as interactive or decorative**,
      in a table in Implementation Notes: the element, which it is, and the one-line reason. The rule
      applied is WCAG 1.4.11 — "identifies a component or its state" is interactive and takes the new
      token at 3:1; a divider, a container hairline or a non-interactive card edge is decorative and
      keeps `--border`. A boundary left unclassified is a failure.
- [ ] 21. **006's criterion 14 is resolved.** The custom-duration input's border measures **≥ 3:1**
      against the painted page. The chip half of that criterion is moot (the chips carry no border;
      criterion 3 keeps it that way and criterion 1 carries the state instead), and QA says so
      explicitly rather than silently dropping it.
- [ ] 22. **`components/StatsButton.tsx` is a visible control.** Its boundary (or fill, if frontend
      changes the fill instead) measures **≥ 3:1** against the painted cream page. Its accessible name
      is still exactly `Focus stats`, it is still at least 44 × 44 px at 320 px and 1280 px, it still
      navigates to `/stats`, and it still carries a named export.
- [ ] 23. **Every interactive boundary in the swept files reaches 3:1** against its own painted
      ground, per the classification in criterion 20. Decorative boundaries may stay below 3:1, and
      each one that does is listed with its measured ratio so the choice is on the record.

### D. Contrast, measured rather than assumed

- [ ] 24. Implementation Notes carry a **swap table**: one row per changed site, with file, line, the
      utility before, its **painted** colour, the token after, its **painted** colour, and a verdict of
      `exact` (byte-identical painted colour) or `deviation`.
- [ ] 25. **Expect deviations; do not assume exactness.** 006's headline finding, re-derived from
      `node_modules/tailwindcss/theme.css`: this project's **Tailwind v4 palette is OKLCH while the
      tokens are v3 hex**, so almost no swap is byte-identical. `amber-700` paints
      `rgb(187, 77, 0)` against `--primary`'s `rgb(180, 83, 9)`; `red-700` paints `rgb(193, 0, 7)`
      against `--destructive`'s `rgb(185, 28, 28)`. Any row claiming `exact` is backed by two painted
      readings, not by a matching comment in `globals.css`.
- [ ] 26. For every `deviation` row, the table lists each text and non-text pair that colour
      participates in, with the measured contrast **before** and **after**.
- [ ] 27. **Ratios come from painted pixels or painted computed styles in a real browser, never from
      arithmetic on token values.** The 005 and 006 precedent: token arithmetic was off by up to 2.7
      points. Every ratio in any report for this task says where it came from.
- [ ] 28. **Thresholds.** No pair finishes below its WCAG threshold: **4.5:1** for body text,
      **3:1** for text at or above 24 px / 18.66 px bold, **3:1** for a non-text colour that
      identifies a control or its state (criterion 20's classification decides which boundaries those
      are). For every pair, **after ≥ before**, or the row is explicitly marked as a deliberate
      reduction with its reason. Where a faithful swap would preserve a *failing* ratio, the ratio is
      fixed and flagged rather than the failure being preserved.
- [ ] 29. **Disabled-control pairs are measured and recorded** even though WCAG 1.4.3 exempts them:
      `TaskForm`'s submit button (`disabled:bg-stone-300` with white text today — roughly 1.6:1),
      every field's `disabled:bg-stone-100` / `disabled:text-stone-400`, and `TaskRow`'s
      `disabled:opacity-40` action buttons. They may stay below threshold; they must not get **worse**
      than they are today.
- [ ] 30. **These pairs are measured at minimum, before and after, each against its own painted
      ground:**
      - Task row card: fill against the dialog surface; border against the fill and against the
        dialog surface
      - Task row, drag-active: the drag ring against the card fill (today `ring-amber-700`)
      - Row action buttons: label on fill; border against the card fill; hover border; focus outline
        against fill and against the card
      - Pinned Pin button: fill, border and label (today `border-amber-700 bg-amber-100 text-amber-900`)
        — and the fill/border against the *unpinned* button, since this is a state indicator
      - Delete-confirm panel: panel fill against the card (today `bg-red-50`); prompt text on the
        panel (today `text-red-900`); the Delete button's label on fill and its hover fill
      - `TaskForm` fields: label on the card; input text on the input fill; input border against the
        card; error text on the card; focus outline against input fill and card
      - `TaskForm` colour swatch picker: the checked ring against the card and against the *unchecked*
        ring (a state indicator); the `ring-offset` colour against the card; each of the eight swatches
        against the new card fill; `TaskColorDot`'s hairline against the card
      - `TaskForm` submit: label on fill; hover fill; disabled fill and disabled label
      - `TaskListDialog` trigger: icon on fill; fill against the cream page; hover fill; focus outline
      - `TaskList` add-task section: fill and border against the dialog surface; heading on the fill
      - `StatsButton`: fill and boundary against the cream page; icon against the fill; focus outline
      - `CustomDurationInput`: border against the page (criterion 21)
      - Mode chips: checked label and unchecked label on the page (criterion 4)
      - `widgets/HeaderNav.tsx`: `pomotato` (`text-primary`) against the cream page — verify-only,
        recorded so the one live colour in that file has a number next to it
- [ ] 31. **No state is conveyed by colour alone anywhere in the swept surface**, not just on the
      chips. For each of these, QA names the non-colour cue: pinned vs unpinned (`aria-pressed` plus
      the Pin/Unpin label), drag-active, the selected colour swatch (ring *width* changes, 2 px vs
      1 px — assert the computed width, not only the colour), field invalid (`aria-invalid` plus the
      `role="alert"` text), and button disabled. Any state whose only distinction after this task is a
      colour is a failure of this criterion.

### E. Nothing else moves

- [ ] 32. **Task-list behaviour is untouched.** Add a task, edit and cancel an edit, confirm and back
      out of a delete, pin and unpin, +1 and -1, reorder by keyboard and by pointer, the dnd overlay,
      the Escape layering (drag → inline form → confirm → dialog), and focus management on every exit
      from a non-display row mode. `e2e/task-list.spec.ts` and `e2e/task-list-dialog.spec.ts` pass
      with **no assertion changed**.
- [ ] 33. **Timer behaviour is untouched**: start, pause, resume, hold-to-reset, completion,
      retroactive completion after a closed tab, mode switching (which still forces `idle`), custom
      duration, persistence across reload. `e2e/timer.spec.ts`, `e2e/timer-gauge.spec.ts`,
      `e2e/hold-reset.spec.ts`, `e2e/hold-label-contrast.spec.ts` and `e2e/sessions.spec.ts` pass with
      no assertion changed.
- [ ] 34. **No geometry moves, outside the deliberate chip change.** For `/` and for the open task
      dialog at 320 px and 1280 px, the bounding boxes of the task rows, their action buttons, the add
      form's fields and buttons, the dialog trigger, the Stats button and the custom-duration input
      are the same before and after within 1 px, and
      `document.documentElement.scrollWidth <= clientWidth` holds. QA compares against a checkout of
      `d7d1bec`, not against a remembered value. The mode chips are exempt and are covered by
      criterion 6 instead; if the new boundary token adds a border where none existed (the Stats
      button), that element's delta is recorded rather than asserted at 1 px.
- [ ] 35. **Every control stays at least 44 px in both dimensions** at both viewports, on `/` and in
      the open dialog.
- [ ] 36. **No axe-core violation of serious or critical impact**: on `/` at 320 px and 1280 px in
      each timer status, and in the open task dialog at both viewports with a row in each mode
      (display, editing, confirming-delete) and with the add form in its error state.
- [ ] 37. `git diff --stat` is empty for `lib/`, `hooks/`, `app/stats/`, `components/TimerDisplay.tsx`,
      `components/TimerGauge.tsx`, `components/SloshGauge.tsx`, `components/HoldButton.tsx`,
      `components/PomotatoTimer.tsx`, `components/CurrentTaskCard.tsx`, `components/Stats*.tsx`,
      `components/ui/dialog.tsx` and `components/ui/button.tsx`. Reviewer verifies.
- [ ] 38. `git diff package.json package-lock.json components.json` is empty. No new dependency, no
      icon-library change (Q2).

### F. Gates and evidence

- [ ] 39. `npm run lint` (0 errors; warnings not above the **21** baseline), `npm run typecheck`,
      `npm run build`, `npm run test` and `npm run test:e2e` all succeed.
- [ ] 40. `npx vitest run` is at least **309/309** plus this task's new guard tests, with the new count
      stated in the QA Report.
- [ ] 41. Playwright is at least **287 passed / 2 skipped / 0 failed** (the handed-over baseline was
      281 passed, 4 failed, 2 skipped; the 4 failures are resolved by criterion 9). QA states the
      exact counts and the baseline it compared against.
- [ ] 42. **Zero console errors or warnings**, at 320 px and 1280 px, across: load, open the task
      dialog, add a task, edit and cancel, confirm and back out of a delete, pin, +1/-1, reorder, close
      the dialog, switch mode, and reload. Console and `pageerror` capture starts before `goto`.
- [ ] 43. **No React hydration mismatch** on reload of `/` with the timer idle, running and paused,
      and with the task dialog's trigger rendered.
- [ ] 44. No `any` in new or changed code. Functional components with named exports (CLAUDE.md).
- [ ] 45. New tests cannot pass vacuously — none of the four shapes recorded in the 2026-10-09 and
      2026-10-15 entries in `docs/DECISIONS.md` (an assertion inside `try`/`if`/`else`, an observer
      that may never attach, a `toBeVisible()` on something already true, a test with zero
      assertions). Every `forced-colors` or greyscale assertion is paired with a default-rendering
      equivalent so it cannot pass for the wrong reason.
- [ ] 46. **QA breaks the implementation, confirms the test fails, and restores it (hash-verified),
      for at least four criteria**: the palette guard (15), the chip non-colour cue (1), the
      interactive-boundary 3:1 on one control (23), and one measured contrast pair from criterion 30.
      Per the 2026-10-07 standing-practice entry in `docs/DECISIONS.md`.
- [ ] 47. **Implementation Notes record, before QA starts**: the swap table (24), the new token with
      its three-part reason and its measured ratio per ground (17, 18), the boundary classification
      table (20), which non-colour cue was chosen for the chips and the measured per-chip width delta
      (1, 6), the eight re-measured swatch ratios (16), and the list of sites where no exact token
      existed together with what was chosen for each.

---

## Files likely touched

**Frontend:**
- `components/ui/mode-chip.tsx` — the non-colour selection cue; the dead hover class removed.
- `components/ModeSelector.tsx` — only if the cue requires the container's `font-bold` (line 17) to
  move or be overridden. No markup change beyond that; the radios, fieldset and legend are frozen by
  criterion 7.
- `components/TaskForm.tsx` — 38 swaps across labels, three inputs, their disabled and invalid
  states, the colour-swatch picker's selection ring and ring-offset, submit and cancel.
- `components/TaskRow.tsx` — 19 swaps across the card, the shared `actionButtonClass`, the title and
  count text, the pinned state, the drag-active ring and the delete-confirm panel.
- `components/TaskList.tsx` — 6 swaps across the add-task section, its heading, and the loading /
  error / empty messages.
- `components/TaskListDialog.tsx` — 2 swaps on the trigger (`text-white`, `hover:text-white`).
- `components/TaskColorDot.tsx` — 1 swap, the `border-black/10` hairline (Q3).
- `components/StatsButton.tsx` — a visible boundary (criterion 22).
- `components/task-palette-colors.ts` — **docstring only**, no value changes (criterion 16).
- `app/globals.css` — the new interactive-boundary token and its `--color-*` mapping. Additions only.

**QA only:** `components/*.tokens.test.ts`, `components/*.test.tsx`, `e2e/**`.

**Verify-only, expected to have no diff:** `widgets/HeaderNav.tsx`, `widgets/BottomControls.tsx`,
`app/page.tsx`.

**Not touched:** `lib/**`, `hooks/**`, `app/stats/**`, `components/TimerDisplay.tsx`,
`components/TimerGauge.tsx`, `components/SloshGauge.tsx`, `components/HoldButton.tsx`,
`components/PomotatoTimer.tsx`, `components/TimerControls.tsx`, `components/CustomDurationInput.tsx`
(its *border token* changes via the new token, nothing else), `components/CurrentTaskCard.tsx`,
`components/Stats*.tsx`, `components/ui/dialog.tsx`, `components/ui/button.tsx`, `docs/PLAN.md`,
`components.json`, `e2e/task-list-dialog.spec.ts`.

---

## Open questions for the owner
Recorded here, not answered by this task. None blocks frontend from starting.

1. **Which non-colour cue marks the selected mode chip?** The *requirement* that one exists is not a
   question (criterion 1, `DESIGN.md`: accessibility is not negotiable against aesthetics). The
   *choice* is aesthetic. Candidates: a **weight differential** (bold on checked, normal on the rest —
   costs no fill and no border, but note it means three chips get *lighter*, because `font-bold`
   currently sits on the container at `components/ModeSelector.tsx:17` and applies to all four; it
   also returns the chip-row reflow that 006 recorded as pre-existing jitter), or an **underline on
   the active chip** (adds a mark instead of lightening anything, and does not change chip width).
   **Default if the owner does not answer: the weight differential**, with the measured width delta
   recorded under criterion 6. Overturnable without reopening the task — it is one variant in one
   `cva` definition.
2. **Two icon libraries, and `components.json` points at the wrong one.** `components.json:13`
   declares `"iconLibrary": "lucide"` while every icon in the app now comes from `react-icons`
   (`RiBarChart2Fill`, `FaTasks`), and `lucide-react@^1.52.0` is installed and **imported by nothing**.
   The next `shadcn add` will pull lucide components into a react-icons app. Either the switch to
   `react-icons` goes in `docs/DECISIONS.md` and `components.json` follows it, or the unused library
   goes. Criterion 38 forbids this task from doing either; it needs the owner's word.
3. **What is a hairline on a dark surface?** `TaskColorDot`'s `border-black/10` vanishes on a dark
   card. A `color-mix()` of `--foreground` into the card fill inverts correctly with the dark block;
   a flat token does not. Frontend proceeds under criterion 17's default (an existing token or a
   `color-mix()` of tokens, measured) and records what it chose.
4. **Does `widgets/` stay, and should CLAUDE.md name it?** `widgets/` is a top-level folder that
   CLAUDE.md's "Folder structure" section does not list, which means no agent formally owns it. This
   task needs nothing from it (both files are colour-free and verify-only), so no precedent is set
   here — but criterion 11's guard reaches into it, and 008 wants to put the settings button there.
   Carried from 008's Q5.
5. **The task-row card fill, once `bg-white` is gone.** Row cards and the add-task section are
   `bg-white` with a `border-stone-200` edge, sitting *inside* a `--popover` dialog. Pure white on
   `#fffaf3` is already about 1.02:1, and stone-200 on white is about 1.19:1 — so the card edge is
   close to invisible today. The default is `--card` plus `--border` with the measurement recorded
   (criterion 23), **not** a new surface token: a card is not a control, so 1.4.11 does not require
   3:1 of it. If the owner wants the rows to read as distinct cards, that is a palette decision and
   needs either a new surface token or a shadow.
6. **Still with the owner from 006, unchanged by this task:** `--gauge-liquid` at 1.56:1
   liquid-vs-glass (006 Q1), the `--font-geist` self-reference at `app/globals.css:9` (006 Q2),
   `--font-mono` mapped to Comfortaa so `font-mono` renders proportional (006 Q3), and the hardcoded
   `#b45309` in the unlayered `:focus-visible` rule at `app/globals.css:143-146` (006 Q5). The last
   one now belongs to milestone 4's **dark toggle** part — a hardcoded focus colour only breaks once
   there is a dark palette to break against.

---

## Risks

- **Criterion 1 is a real regression, not a theoretical one, and it is easy to "fix" wrongly.** The
  wrong fixes: reinstating a fill or border (criterion 3 forbids it — the owner's redesign stands),
  or darkening the selected label further (still colour, still fails 1.4.1). The cue has to be a
  property that survives greyscale, which is why criterion 2 asserts it under forced-colors *and*
  under a greyscale filter rather than trusting a visual judgement.
- **A different contrast ground from 006, and three of them at once.** The task-list surface sits on
  `--popover`, on card fills inside it, and behind a scrim. A ratio measured against cream is simply
  the wrong number here. Criterion 30 names each pair with its own ground for exactly this reason.
- **Measurement by arithmetic is not measurement.** 005 quoted 5.02:1 and 9.89:1 where painted pixels
  gave 4.72:1 and 7.18:1. 006 found the Tailwind v4 palette is OKLCH while the tokens are v3 hex, so
  `amber-700` ≠ `--primary` at the pixel level. Criteria 25 and 27 exist so no row of this task's
  swap table is a guess.
- **Form and row states are where token swaps drop things silently.** `TaskForm` has three fields
  with disabled *and* invalid states, a swatch picker with a width-and-colour selection ring, and a
  disabled submit. `TaskRow` has pinned, drag-active, delete-confirm, and seven disable-able action
  buttons. Each is a state a swap can flatten without any test noticing, which is what criteria 30 and
  31 are for.
- **`--border` is shared app-wide, including with every future `shadcn add`.** Darkening it would be
  the one-line fix for 006's criterion 14 and would change the look of every surface in the app and
  every component shadcn generates from here on. Criterion 19 forbids it; the new token is the
  deliberate alternative.
- **The guard is the highest-value thing 006 produced, and it has already failed once.**
  `components/TaskListDialog.tokens.test.ts` guards a file carrying `text-white` and passes, because
  its regex cannot see `white`. A guard that is run but never broken is not evidence — criterion 15
  requires break-and-restore with hashes.
- **Accessibility, beyond criterion 1.** The dialog's focus management, the Escape layering, the
  dnd-kit announcements and the `sr-only` colour names in `TaskForm` are load-bearing and all live in
  files this task edits for colour reasons. Criterion 32 freezes the behaviour; criterion 36 catches
  what a class swap can break in the accessibility tree.
- **The swatch claim goes stale quietly.** `components/task-palette-colors.ts` documents 3:1 against
  "white `#ffffff`". Replacing the card fill makes that sentence false without any test failing.
  Criterion 16 is the only thing that catches it, and the dark block will break the swatches outright
  — a known, named consequence for milestone 4's dark part, not this one.
- **Licensing:** no audio, fonts, images or binaries are added. If any appear, they must be original
  or CC0 with provenance in `docs/DECISIONS.md`. No new icon library (criterion 38, Q2).
- **Performance:** none expected; nothing here changes render frequency or adds a subscriber. The
  gauge's per-snapshot `getComputedStyle` (005's R-5) is untouched and out of scope.
- **Next.js version:** per `AGENTS.md`, frontend reads the relevant guide in
  `node_modules/next/dist/docs/` before writing component code.
- **antislop:** 005 and 006 both record the session mode as `during (session override)`, supplied by
  the owner through the orchestrator. Frontend should confirm that still holds, announce
  `antislop active: during (session override).` before its first UI edit, and run the Delivery Gate
  before handing over. The chip cue is UI work and goes through `antislop-ui`; nothing here is copy
  work.

---
