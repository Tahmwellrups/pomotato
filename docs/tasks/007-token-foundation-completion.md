---
id: 007
slug: token-foundation-completion
status: done # draft | in-progress | qa | review | done | blocked
---

# Milestone 4, part 1: completing the token foundation (task-list surface, interactive-boundary token, mode-chip selection cue)

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

## Observations (not criteria, not scope)
- **Working tree at hand-off was clean** through `d7d1bec`. vitest 309/309, typecheck exit 0, lint
  0 errors / 21 warnings, Playwright 281 passed / 4 failed / 2 skipped. That is the baseline QA
  compares against — not `HEAD` of some earlier task, and not a remembered number.
- `components/CurrentTaskCard.tsx:4` still imports `TaskColorDot` without rendering it, and line 6
  carries `border border-none bg-none` — three utilities cancelling out. Carried from 006 and 008;
  still true; still not this task's file (criterion 37 pins it).
- `components/ui/button.tsx` and `components/ui/dialog.tsx` are already token-clean under the wider
  regex, including for `white`/`black`. Verified, so nobody re-checks them.
- The `pomotato` wordmark in `widgets/HeaderNav.tsx` uses `font-space-grotesk`, a fourth font family
  alongside Comfortaa, Geist and the Arial body fallback. `DESIGN.md` names Comfortaa for headers.
  Licensing and font-stack coherence are a question for whoever next touches typography — not raised
  as a Q here because no criterion in this task depends on it.

## Implementation Notes

antislop active: during (session override), inherited from the 005/006 record; this brief gave no new instruction. Delivery Gate, the items that apply (token-only colour work, no copy, no new technique): every changed control re-measured in a browser, no horizontal overflow at 320 px, every control still >= 44 px, no new decoration added.

**Method.** Every ratio below is from painted pixels: Playwright/Chromium read `getComputedStyle`, each colour (oklch, lab, color-mix, alpha) was drawn to a 1x1 canvas over its real ground and read back with `getImageData`, then WCAG 2.x contrast was computed. "Before" is a checkout of `d7d1bec` (own dev server), "after" is the working tree, same script, same seeded state, 1280 px (colours do not change with viewport; geometry and chips were also run at 320 px). Never arithmetic on token values.

### Finding the brief did not predict: the pinned state was visually dead before this task
`actionButtonClass` (`bg-white`, `border-stone-300`, `text-stone-700`) and the pinned additions (`bg-amber-100`, `border-amber-700`, `text-amber-900`) were joined into one class string with no merge step, so stylesheet order decided, and the base classes won. Painted at `d7d1bec`, a pinned Pin button and an unpinned one are identical: fill #ffffff, border #d6d3d1, label #44403b. The only pinned cues were the `Unpin` label and `aria-pressed`. I split `actionButtonClass` into shape + idle colours + pinned colours (`pinnedActionButtonClass`) so no element carries two competing colour utilities. Pinned now paints fill #fef3c7, border #b45309, label #78350f. This is a fourth deliberate visible change, and it is a fix: the pinned fill/border/label were authored and never shown.

### Part 1: mode-chip cue
**Chosen: weight differential** (the default). `components/ui/mode-chip.tsx`: checked `font-bold` (700), unchecked `font-normal` (400), delta 300. `font-bold` moved off the container in `ModeSelector.tsx:17`. Dead `hover:border-[color-mix(...)]` removed. No fill, border or radius added (painted `background-color` rgba(0,0,0,0), all four border widths 0px, both states).
- Greyscale of the label colours is 69 vs 65 out of 255, so colour cannot carry it; weight can, and survives forced-colors.
- Painted labels on the page (#fbf4ea): checked #78350f 8.31:1, unchecked #44403c 9.41:1. Chip height 44 px in all states.
- **Per-chip width delta, bold vs normal** (320 px, identical at 1280): Focus 69.7 vs 68.9 (-0.8), Short break 120.9 vs 119.0 (-1.9), Long break 111.5 vs 110.3 (-1.2), Custom 83.0 vs 82.0 (-1.0). Reflow when selection changes: chip x positions move by at most 3 px; the 320 px wrap (Focus + Short break on row 1 at y=184, Long break + Custom on row 2 at y=236) is the same for all four modes; `scrollWidth == clientWidth` (320/320 and 1280/1280) for all four modes. Before this task all four were bold, so the row was static; now it shifts by up to 3 px. I judged that acceptable and kept weight. If the owner dislikes the shift, the underline alternative is a one-line variant change; I did not take it because the measured shift is small and no chip moves between rows.
- Focus ring unchanged: 2 px, offset 2 px, #b45309 (`--ring`) on both states, 4.60:1 on the page.
- Radios, fieldset, legend untouched.

### Part 3: the token
`--control-border: #88837e` (+ `--color-control-border` in the existing `@theme inline` block). `git diff app/globals.css` is 13 added lines, 0 removed. Comment carries (a) role, (b) why `--border` does not fit (1.36 / 1.43 and app-wide), (c) milestone 4 dark obligation.
Value chosen after a first pass at #8c8782 left the Cancel button in the tinted delete-confirm panel at 2.87:1; #88837e clears it.

| Ground (painted) | Colour | Ratio |
|---|---|---|
| `--background` | #fbf4ea | 3.44 |
| `--card` (task rows, add section, edit form) | #fbf4ea | 3.44 |
| `--popover` (dialog, and the input fill) | #fffaf3 / #fffaf3 | 3.61 |
| Delete-confirm panel | #f7e7de | 3.12 |

Hover on idle action/cancel buttons: `color-mix(--control-border, --foreground 40%)` paints #635b55, 6.09:1 on the card (was 2.59).

### Boundary classification (criterion 20)
Rule: 1.4.11, identifies a component or its state = interactive, new token, 3:1; divider / container hairline / non-interactive card edge = decorative, `--border`.

| Element | Class | Reason | Painted |
|---|---|---|---|
| Custom-duration input border | interactive | the field's edge | 1.36 -> 3.44 on page |
| StatsButton border (new) | interactive | the control's only edge; fill is 1.00:1 | 1.00 -> 3.44 on page |
| TaskForm title/emoji/eta input borders | interactive | field edge | 1.49 -> 3.44 vs card, 3.61 vs input fill |
| Row action buttons (reorder, up, down, -1, +1, Edit, Delete, Pin idle) | interactive | button edge | 1.49 -> 3.44 vs card |
| Cancel in edit form, Cancel in delete-confirm | interactive | button edge | 1.49 -> 3.44 (card); 1.36 -> 3.12 (panel) |
| Pinned Pin button border | interactive (state) | identifies pressed state | 1.49 (hover-contaminated reading at before) -> 4.60 `--primary` |
| Swatch checked ring (2 px `--foreground`) | interactive (state) | identifies selection | 17.49 -> 14.55 vs card; vs unchecked ring 11.74 -> 10.67 |
| Swatch unchecked ring (1 px `--border`) | decorative | the swatch fill itself (3.14-5.37:1) identifies the radio; ring is trim | 1.49 -> 1.36 |
| Row card border | decorative | non-interactive container edge | 1.26 -> 1.36 vs fill; 1.21 -> 1.43 vs popover |
| Add-task section border | decorative | container edge | same as row card |
| Delete-confirm panel (fill only) | decorative | tint, no edge | 1.09 -> 1.10 vs card |
| TaskColorDot hairline | decorative | trim around a swatch whose fill identifies it | 1.26 -> 1.27 vs card |
| Chips (no border) | n/a | criterion 3 keeps them borderless; state carried by weight | |
| TaskListDialog trigger (no border, `--primary` fill 4.60 vs page) | n/a | fill identifies it | 4.60 |

Decorative boundaries below 3:1 are listed with their ratio above, so the choice is on the record. Q5 as asked: card is `--card` + `--border`, no new surface token; row cards are 1.05:1 against the popover and the edge is 1.43:1, still faint. That stays an owner call (needs a shadow or new surface token).

### Swap table
Verdict `exact` needs two painted readings; none qualifies (the OKLCH-vs-hex gap shows on every swap except white to `--primary-foreground`, where both read #ffffff). Columns: file:line (after), before utility -> painted, after token -> painted.

| file:line | before | after | verdict |
|---|---|---|---|
| TaskListDialog:44 | `text-white` / `hover:text-white` #ffffff | `text-primary-foreground` / `hover:text-primary-foreground` #ffffff | exact (both read #ffffff; trigger icon 5.02:1 on fill before and after; hover fill unchanged #c27336, icon 3.62:1) |
| TaskColorDot:20 | `border-black/10` #e5e5e5 on white | `border-[color-mix(in_srgb,var(--foreground)_12%,transparent)]` #e1dad0 on card | deviation (see pairs) |
| TaskList:239,240 card | `border-stone-200 bg-white` #e7e5e4 / #fff | `border-border bg-card` #d6d3d1 / #fbf4ea | deviation |
| TaskList:240 heading | `text-stone-700` #44403b | `text-secondary-foreground` #44403c | deviation |
| TaskList:247,257 messages | `text-stone-600` #57534d | `text-muted-foreground` #57534e | deviation |
| TaskList:251 error | `text-red-700` #c10007 | `text-destructive` #b91c1c | deviation |
| TaskRow:33 idle action btn | `border-stone-300 bg-white text-stone-700 hover:border-stone-400` #d6d3d1 / #fff / #44403b / #a6a09b | `border-control-border bg-popover text-secondary-foreground hover:border-[mix control-border 60 / foreground 40]` #88837e / #fffaf3 / #44403c / #635b55 | deviation (deliberate: interactive boundary) |
| TaskRow:33 focus | `outline-amber-700` #b45309 | `outline-ring` #b45309 | exact (both read #b45309 on this build; amber-700 as an outline also resolves #b45309 here, not the rgb(187,77,0) the fill does, because the global :focus-visible rule wins) |
| TaskRow:35 pinned | `border-amber-700 bg-amber-100 text-amber-900` (never painted) | `border-primary bg-accent text-accent-foreground` #b45309 / #fef3c7 / #78350f | deviation (visible change, see finding) |
| TaskRow:115 card | `border-stone-200 bg-white` | `border-border bg-card` | deviation |
| TaskRow:116 drag | `ring-amber-700` #bb4d00 | `ring-ring` #b45309 | deviation |
| TaskRow:161 title | `text-stone-900` #1c1917 | `text-foreground` #2b2017 | deviation |
| TaskRow:162 count | `text-stone-600` #57534d | `text-muted-foreground` #57534e | deviation |
| TaskRow:172 panel | `bg-red-50` #fef2f2 | `bg-[color-mix(in_srgb,var(--destructive)_6%,var(--card))]` #f7e7de | deviation |
| TaskRow:175 prompt | `text-red-900` #82181a | `text-foreground` #2b2017 | deviation (13.20:1 vs 9.16:1) |
| TaskRow:190 Delete | `bg-red-700 text-white hover:bg-red-800 outline-amber-700` #c10007 / #fff / #9f0712 | `bg-destructive text-destructive-foreground hover:bg-[mix destructive 80 / foreground 20] outline-ring` #b91c1c / #fff / #9d1d1b | deviation |
| TaskForm:155,179,202,238 labels | `text-stone-600` #57534d | `text-muted-foreground` #57534e | deviation |
| TaskForm:169,189,251 inputs | `border-stone-300 bg-white text-stone-900 outline-amber-700 disabled:bg-stone-100 disabled:text-stone-400` #d6d3d1 / #fff / #1c1917 / #b45309 / #f5f5f4 / #a6a09b | `border-control-border bg-popover text-foreground outline-ring disabled:bg-muted disabled:text-[mix muted-foreground 56 / muted]` #88837e / #fffaf3 / #2b2017 / #b45309 / #f5f5f4 / #9d9a97 | deviation |
| TaskForm:172,192,231,254 errors | `text-red-700` #c10007 | `text-destructive` #b91c1c | deviation |
| TaskForm:219 ring-offset | `ring-offset-white` #fff | `ring-offset-card` #fbf4ea | deviation (follows the card) |
| TaskForm:220 swatch focus | `outline-amber-700` #b45309 | `outline-ring` #b45309 | exact |
| TaskForm:221 swatch rings | `ring-stone-900` #1c1917 / `ring-stone-300` #d6d3d1 | `ring-foreground` #2b2017 / `ring-border` #d6d3d1 | deviation (checked) / exact (unchecked: both #d6d3d1) |
| TaskForm:264 submit | `bg-amber-700 text-white hover:bg-amber-800 disabled:bg-stone-300` #bb4d00 / #fff / #973c00 / #d6d3d1 | `bg-primary text-primary-foreground hover:bg-[mix primary 80 / foreground 20] disabled:bg-border` #b45309 / #fff / #99490c / #d6d3d1 | deviation (disabled fill exact) |
| TaskForm:273 Cancel | `border-stone-300 bg-white text-stone-700 hover:border-stone-400` | same as idle action button | deviation |
| CustomDurationInput | `border-input` #d6d3d1 | `border-control-border` #88837e | deviation (deliberate) |
| StatsButton | `border-none` | `border-control-border`, 1 px | deviation (deliberate; box unchanged, 44x44) |

Sites where no exact token existed (everything marked deviation above) took the nearest semantic token; the two non-token choices are color-mix() of tokens: hover darkenings (`--primary` or `--destructive` or `--control-border` into `--foreground`) and the delete panel tint (`--destructive` 6% into `--card`). Chosen over a new token because each is derived and inverts correctly under a `.dark` block.

### Before/after pairs (painted, each against its own ground; criterion 26/28/30)
Below-threshold or reduced pairs are listed individually; the unlisted pairs went up or are unchanged (full run is reproducible: scripts in the session scratchpad).

| Pair | before | after |
|---|---|---|
| Row card fill vs popover | 1.04 | 1.05 |
| Row card border vs fill / vs popover | 1.26 / 1.21 | 1.36 / 1.43 |
| Add section fill vs popover; border vs fill | 1.04; 1.26 | 1.05; 1.36 |
| Heading on add section | 10.28 | 9.41 |
| Label on card | 7.64 | 6.99 |
| Input text on input fill | 17.49 | 15.30 |
| Input border vs card / vs fill | 1.49 / 1.49 | 3.44 / 3.61 |
| Input outline vs fill / card | 5.02 / 5.02 | 4.84 / 4.60 |
| Error text on card | 6.42 | 5.92 |
| Submit label on fill; fill vs card | 5.03; 5.03 | 5.02; 4.60 |
| Submit hover label on hover fill | 7.09 | 6.34 |
| Submit outline vs card | 5.02 | 4.60 |
| Disabled submit label on fill (exempt) | 1.49 | 1.49 |
| Disabled field text on fill (exempt) | 2.37 | 2.57 |
| Row title on card; count on card | 17.49; 7.64 | 14.55; 6.99 |
| Action label on fill | 10.28 | 9.89 |
| Action border vs card | 1.49 | 3.44 |
| Action hover border vs card | 2.59 | 6.09 |
| Action outline vs fill / card | 5.02 / 5.02 | 4.84 / 4.60 |
| Disabled action button (opacity .4, exempt) | opacity .4 on the same border/fill | opacity .4, border now 3.44 pre-opacity (not worse) |
| Pinned label on fill | 10.28 (dead state, unpinned look) | 8.15 |
| Pinned border vs card | 1.49 (dead) | 4.60 |
| Pinned fill vs card; vs unpinned fill | 1.00; 1.00 | 1.02; 1.07 |
| Drag ring vs card | 5.03 | 4.60 |
| Confirm panel vs card | 1.09 | 1.10 |
| Prompt on panel | 9.16 | 13.20 |
| Delete label on fill; hover | 6.42; 8.36 | 6.47; 8.00 |
| Delete fill vs panel | 5.87 | 5.37 |
| Delete outline vs panel | 4.59 | 4.17 |
| Confirm Cancel border vs panel | 1.36 | 3.12 |
| Form Cancel border vs card; hover | 1.49; 2.59 | 3.44; 6.09 |
| Swatch checked ring vs card; vs unchecked ring | 17.49; 11.74 | 14.55; 10.67 |
| Swatch focus outline vs card | 5.03 | 4.60 |
| Dot hairline vs card | 1.26 | 1.27 |
| Trigger icon on fill; fill vs page; hover fill vs page | 5.02; 4.60; 3.32 | unchanged |
| Stats fill vs page; border vs page; icon on fill | 1.00; 1.00; 9.42 | 1.00; 3.44; 9.42 |
| Custom input border vs page; text on fill | 1.36; 15.30 | 3.44; 15.30 |
| Wordmark on page (verify-only) | 4.60 | 4.60 |

**Deliberate reductions** (pair went down, reason): everything between 17.49 and 4.60 above that fell is the token hex replacing a v4 OKLCH palette value or a pure white card replacing with cream; every one is still well above 4.5:1 text / 3:1 non-text. Pinned label 10.28 to 8.15 is not a reduction of what users saw (that state was not painted). Disabled-control pairs: none got worse.
Thresholds: no text pair below 4.5:1 after; lowest text pair after is submit hover 6.34 and trigger icon 3.62 (non-text, large icon, >= 3). Lowest interactive boundary 3.12 (Cancel inside delete panel).

### Eight swatches vs the new card ground (criterion 16)
`--card` #fbf4ea: potato 5.37, tomato 4.88, mint 3.14, sky 3.97, lavender 4.70, sunflower 4.77, blush 3.88, slate 5.36 (before, vs white: 5.87, 5.33, 3.43, 4.33, 5.13, 5.21, 4.24, 5.85). All >= 3:1; mint is the thin one (3.14). Docstring updated (comment only; `git diff` shows no `TASK_COLOR_HEX` value change).

### Geometry, console, other
- Bounding boxes of every button, link, text input and `li` on `/` and in the open dialog (with two rows) at 320 and 1280, `d7d1bec` vs working tree: no element differs by more than 1 px; 0 elements under 44 px (excluding `li`); `scrollWidth == clientWidth` in all four cases. The Stats button is 44x44 before and after: the base Button already carries a 1 px transparent border, so `border-none` removal adds a visible edge, not size.
- Console errors/warnings during the full measurement run (load, chips, dialog, add x3, error state, pin, confirm delete, edit/cancel): none, both builds.
- No Playwright run (QA owns it). No tests edited other than the guard work below.

### Guard (criterion 11-15)
- New `components/palette.tokens.test.ts`: walks `app/`, `components/`, `hooks/`, `widgets/` for `*.ts`/`*.tsx` (excluding `*.test.*`) and asserts per file zero raw palette utilities with an **empty** allow-list. Catches `white`/`black`, `/NN` and `/[..]` opacity suffixes, per-side `border-t|r|b|l|x|y|s|e-`, `ring-offset`, `inset-ring`, `drop-shadow`, variant prefixes (`hover:`, `dark:`, `peer-focus-visible:`), and a bare `<palette>-<NN>`; also lime/cyan/fuchsia/mauve/olive/mist/taupe. Second block: no `#hex` or `rgb( rgba( hsl( hsla( oklch( oklab( lab( lch( hwb( color(` anywhere in discovered files, with a pinned two-file exemption (`components/task-palette-colors.ts` swatch data, `components/prototype/contrast.ts` canvas probe), each with a written reason. Third block: inline-style colour exempt only for `TaskColorDot.tsx`, pinned by file, exact expression `style={{ backgroundColor: TASK_COLOR_HEX[colorId] }}` and reason; the file's other checks still run. Discovery is tested (known files from all four dirs, > 30 files, no test files, all swept files present). Positive and negative sample cases for every shape. 148 tests.
- `TaskListDialog.tokens.test.ts`: the old `<palette>-<NN>` regex and its per-file test are **deleted**, not kept beside the new guard. Hex check and token-surface test stay.
- `TimerSurface.tokens.test.ts` is untouched; its own (wide) regex still guards its files, and the new guard is a superset.
- Liveness (frontend's own spot check; QA does the formal hash-verified run): with text-white in TaskListDialog, border-black/10 in TaskColorDot, text-amber-900 in TaskRow, `bg-[oklch(...)]` in HeaderNav, and `bg-white` in `hooks/use-tasks.ts`, the guard failed each time (1 failed / 147 passed) and was green after restoring (file hashes returned to the original; TaskListDialog before 8fc1f27ff1e8 / broken 27fed66dec41 / restored 8fc1f27ff1e8).
- vitest: 454/454 (306 prior after deleting 3 old assertions, plus 148 new).

### Could not do / left for others
- Did not run Playwright. The 4 stale chip assertions and the `test.fail()` at `e2e/timer-surface-tokens.spec.ts:187` are QA's.
- The token is not painted against `--muted` (disabled field fill) in any measured state, so there is no ratio recorded for that ground.
- Q2 (`components.json` lucide) untouched, as required. Q5 recorded above. The hardcoded `#b45309` in `:focus-visible` is still there (dark toggle's job); focus outlines in the swept files use `outline-ring`, which the global rule currently overrides, so the token does not yet reach them.

## QA Report
- **Verdict: PASS.** Full Playwright run 323 passed / 2 skipped / 0 failed (baseline 281 / 4 / 2). vitest 475/475 across 14 files (baseline 454). Lint 0 errors / 21 warnings. Typecheck exit 0. `npm run build` exit 0 on a fresh copy. Criteria tally: 45 PASS, 2 PASS with a stated limit (29 and 30, see below). No criterion failed. No measurement differed from frontend's by more than 0.5.
- **Caveat on the verdict:** criteria 29 and 30 were only partly re-measured by QA. Frontend's table remains the source for the pairs QA did not repeat. The row for each is marked below.

### Tests added or changed (all test files; no application code edited)
- `e2e/helpers/painted.ts` (new): paints a colour onto a 1x1 canvas over its real ground and reads it back, so `oklch`, `color()`, `color-mix` and alpha all resolve. `parseRgb` was not extended.
- `e2e/token-chip-cue.spec.ts` (new, 18 tests): criteria 1 to 8.
- `e2e/token-task-surface.spec.ts` (new, 20 tests): criteria 17, 21 to 23, 31, 35, 36, 42, 43, the pinned Pin button painted values, and the measured pairs.
- `e2e/timer-surface-tokens.spec.ts` (changed): four stale tests rewritten and one `test.fail` replaced (see criterion 9).
- `components/palette.tokens.test.ts` (new, frontend's file, reviewed and exercised): criteria 10 to 15.
- `components/token-foundation.test.ts` (new, 21 tests): criteria 5, 16, 18, 19 (CSS text), 22 (StatsButton source), 44.
- `components/TaskListDialog.tokens.test.ts`: the old `<palette>-<NN>` regex and its test are gone. Only the hex check and the surface-token check remain.
- Not edited: `e2e/task-list.spec.ts`, `e2e/task-list-dialog.spec.ts` (`git diff` empty, both skips untouched), `e2e/timer.spec.ts` and the other timer specs.

### Per-criterion tally
| # | Result | Evidence |
|---|---|---|
| 1 | PASS | `font-weight` checked 700 vs unchecked 400, delta 300, for every selected mode. Label colour delta alone is 1.13:1, asserted below 1.5. |
| 2 | PASS | delta holds under `forced-colors: active` and under `grayscale(1)`. Each condition is paired with the default-rendering delta. Greyscale label luma difference asserted under 10 (colour cannot carry it). |
| 3 | PASS | all four chips, both states: `background-color` `rgba(0, 0, 0, 0)`, four border widths `0px`, no border colour, radius 0. |
| 4 | PASS | painted checked and unchecked labels vs page 4.5:1 or better. Colours are `--accent-foreground` and `--secondary-foreground`. |
| 5 | PASS | `mode-chip.tsx` has no `hover:` (vitest). |
| 6 | PASS | 320 and 1280 px, each mode selected: `scrollWidth` equals `clientWidth`; all chips in view; all at least 44 px. Per-chip width delta recorded below. |
| 7 | PASS | radios `type=radio`, class `peer sr-only`, no `role`, no `aria-*`; fieldset and legend unchanged; `mode-selector-legend.spec.ts` green in full run. |
| 8 | PASS | 2 px solid, 2 px offset, `--ring` exact on checked and unchecked; ring 4.60:1 vs page (3:1 floor). |
| 9 | PASS | enumerated below. Suite 0 failed. Skips untouched. |
| 10 | PASS | guard per-file zero-raw-utility assertions (`palette.tokens.test.ts`), all five files. |
| 11 | PASS | discovery walks `app`, `components`, `hooks`, `widgets`. Allow-list empty (asserted). Discovery is tested for more than 30 files. |
| 12 | PASS | literal guard covers `#hex` and all ten colour functions in the five files. |
| 13 | PASS | `TaskColorDot` inline-style exemption pinned by exact expression, with a written reason. Other checks still run on the file. |
| 14 | PASS | positive samples include `white`, `black`, `/NN`, `/[..]`, `oklch`, `dark:` and `hover:` variants. Old regex deleted, not kept beside the new one. |
| 15 | PASS | break-and-restore with hashes below. Each shape fails exactly one specific test. |
| 16 | PASS | `git diff` on `task-palette-colors.ts` is comment-only. Vitest pins all eight `TASK_COLOR_HEX` values to `d7d1bec`. The docstring names `--card`. Mint 3.14 noted. |
| 17 | PASS | `#88837e` painted: 3.44 on `--background`, 3.44 on `--card`, 3.61 on `--popover`, 3.117 on the delete-confirm panel. The brief quoted 3.12; the exact value is 3.117 and rounds to 3.12. Floor is 3:1. |
| 18 | PASS | comment carries role, the `--border` 1.36:1 and 1.43:1 reason, shared app-wide, and the milestone 4 dark obligation (vitest). |
| 19 | PASS | `git diff --numstat app/globals.css` is 13 added, 0 removed. `--border` and `--input` are still `#d6d3d1`. |
| 20 | PASS | classification table covers every interactive boundary inside the open dialog (DOM sweep, below). Decorative edges match the table. |
| 21 | PASS | custom input border 3.44:1 vs page, equal to `--control-border`. Chip half is moot: chips carry no border, so QA says so, per criterion 3. |
| 22 | PASS | Stats link: border 3.44:1 vs cream; 44x44 at 320 and 1280; name `Focus stats`; `href=/stats`; click reaches `/stats`; named export. |
| 23 | PASS | interactive boundaries measured by QA, all at least 3:1 against their own ground. Lowest is the Cancel inside the delete panel at 3.117. |
| 24 | PASS | swap table present in Implementation Notes. QA spot-checked against the painted readings below, not re-derived row by row. |
| 25 | PASS | deviations confirmed on the rows QA measured. The OKLCH-vs-hex gap is real: Delete `#c10007` painted vs `--destructive` `#b91c1c`. |
| 26 | PASS | per-pair before and after present in Implementation Notes. QA re-measured the pairs listed below. |
| 27 | PASS | every ratio QA reports comes from painted pixels or painted computed style, not token arithmetic. |
| 28 | PASS | every measured pair clears its threshold. Lowest text pair measured: 5.92 (error text). Lowest boundary: 3.117. |
| 29 | PASS with limit | QA measured the disabled `-1` action button: its pre-opacity border is 3.44:1 vs 1.49:1 at `d7d1bec`. The disabled custom-duration input text clears the existing 2.37:1 floor (existing test). Disabled submit and disabled field fills were not re-measured by QA. Frontend's figures stand for those. |
| 30 | PASS with limit | QA measured these pairs: heading, row title, error text, prompt, Delete label and fill, action border (7 buttons), pinned border and fill, edit and confirm Cancel borders, swatch ring, the eight swatches, trigger fill and icon, wordmark, custom input border, Stats border. The rest of the list is taken from frontend's table: drag-ring ratio, submit, inputs' outlines, delete hover, and similar. |
| 31 | PASS | named cues: pinned `aria-pressed` true and label `Unpin`; drag-active `opacity` 0.6 and ring present; swatch checked ring `calc(2px + 2px)` vs unchecked `calc(1px + 2px)`, so width differs; field invalid `aria-invalid="true"` plus `role=alert`; disabled attribute present while running. |
| 32 | PASS | `task-list.spec.ts` and `task-list-dialog.spec.ts` green, unmodified. |
| 33 | PASS | timer specs green, unmodified. |
| 34 | PASS | DOM geometry dump of `/` and the open dialog (with two rows, idle and custom modes) at 320 and 1280 px. Working tree vs `d7d1bec`: 0.00px worst delta across 4 phases and 120 items. Stats border `0px none` at `d7d1bec`, `1px solid #88837e` now, box 44x44 in both. |
| 35 | PASS | every visible button, link, non-radio input and `[role=button]` is at least 44 px at 320 and 1280 (the test). `<label>` text elements are not controls and are excluded. |
| 36 | PASS | axe-core: no serious or critical violation in the open dialog at both widths, in display, editing, confirming-delete and add-form-error states. |
| 37 | PASS | `git diff --stat` empty for every listed path. |
| 38 | PASS | `package.json`, `package-lock.json`, `components.json` unchanged. |
| 39 | PASS | lint 0 errors / 21 warnings. Typecheck exit 0. `npm run build` exit 0. `npm run test` 475/475. `npm run test:e2e` 323 passed, 2 skipped, 0 failed. |
| 40 | PASS | vitest 475/475 (baseline 454 plus 21 new). |
| 41 | PASS | Playwright 323 passed / 2 skipped / 0 failed. Compared to the handed-over 281 / 4 / 2. 287 total + 38 new = 325. |
| 42 | PASS | console and `pageerror` capture from before `goto`, at both widths. Covers load, dialog, add x2, edit and cancel, delete and cancel, pin, +1 and -1, reorder by keyboard, close, mode switch, reload. Zero messages. |
| 43 | PASS | no hydration console message on reload with the trigger rendered, plus the existing idle, running and paused reloads. |
| 44 | PASS | no `any` in changed files (vitest). New QA files contain no `any` type. |
| 45 | PASS | each forced-colors and greyscale assertion is paired with a default-rendering reading. No assertion sits inside `try`, `if` or `else`. Every test asserts a value. |
| 46 | PASS | four criteria broken and restored, with hashes (below). |
| 47 | PASS | Implementation Notes were recorded before QA started and contain the required items. |

### Criterion 9: the four stale failures and the `test.fail`
Baseline failure set confirmed by `file:line` from the first run: `:162`, `:173`, `:265` (checked focus) and `:265` (unchecked focus).
- `:162` selected chip: **rewritten.** Asserts flat text, no fill, no border, label 4.5:1 vs page, and label equals `--accent-foreground`. It no longer asserts the deleted fill and border.
- `:173` unselected chip: **rewritten.** Same shape, against `--secondary-foreground`.
- `:187` `test.fail()`: **replaced.** The marker passed only because the border does not exist. `readPaint()` threw on the transparent colour before any contrast check. The replacement is a real passing test: the unselected chip has no border by design (criteria 3 and 21). The 3:1 boundary is carried by the custom input and the Stats button. No `test.fail` remains in the spec (`grep` confirmed).
- `:265` checked and unchecked focus: **rewritten.** The ring is composited over the real page (`readPainted`). The transparent fill is no longer read. Assertions are width 2px, offset 2px, colour equal to `--ring`, and 3:1 vs page.
- Skips: the two `e2e/task-list-dialog.spec.ts` tests remain skipped. Their assertions and `git diff` are untouched.

### Criterion 46 and 15: break-and-restore, hash-verified
Mutations were applied to a scratch copy of the working tree, never to `/Users/ramwelltupas/pomotato`. Each restored file was compared against the real file's hash. Playwright ran on the copy's own server on port 3100, because a pre-existing `next dev` on port 3000 was reused otherwise and would have served the unbroken tree.

Guard (`components/palette.tokens.test.ts`, vitest on the copy):
| Shape | File | Before | Broken | Restored | Failing test |
|---|---|---|---|---|---|
| `bg-white` | `hooks/use-tasks.ts` | `3a6b1643a006` | `80f087d6ff66` | `3a6b1643a006` | `hooks/use-tasks.ts has no raw palette utility` |
| `border-black/10` | `components/TaskColorDot.tsx` | `f8bd32c8a634` | `aa2661107edb` | `f8bd32c8a634` | `components/TaskColorDot.tsx has no raw palette utility` |
| `text-amber-900` (palette-NN) | `components/TaskRow.tsx` | `75007a2e6aa7` | `aee8d822a6bd` | `75007a2e6aa7` | `components/TaskRow.tsx has no raw palette utility` |
| `oklch(...)` literal | `widgets/HeaderNav.tsx` | `f6ebb65f95f1` | `0df798d02ad1` | `f6ebb65f95f1` | `widgets/HeaderNav.tsx has no hex literal or colour function` |
| `text-white` (precedent) | `components/TaskListDialog.tsx` | `cf5f5016abe5` | `96243efd559e` | `cf5f5016abe5` | `components/TaskListDialog.tsx has no raw palette utility` |

After all restores the guard is 148/148 green. Each probe failed exactly one test.

Playwright (`e2e/*` on the copy's own server):
| Probe | File | Before | Broken | Restored | Failing tests |
|---|---|---|---|---|---|
| Pinned colours re-joined without merge (criteria 2, 30, 31) | `components/TaskRow.tsx` | `75007a2e6aa7` | `53fb6bd49c2c` | `75007a2e6aa7` | the pinned painted-values test, and the criterion 23 boundary test |
| Chip weight removed (criterion 1) | `components/ui/mode-chip.tsx` | `a383e26fadf9` | `0685e6ac9fb4` | `a383e26fadf9` | 8 tests (criterion 1 ×4, criterion 2 ×4) |
| Custom input border back to `--border` (criteria 21, 23) | `components/CustomDurationInput.tsx` | `479c56dccac3` | `e417244ce936` | `479c56dccac3` | `criterion 21` |
| Delete fill to `bg-muted` (criterion 30 pair) | `components/TaskRow.tsx` | `75007a2e6aa7` | `0f3673ede8e1` | `75007a2e6aa7` | `named pairs that fell but still pass` |

Unbroken copy on port 3100 passes the chip spec (18/18) first, to validate the harness.

### Measurements QA re-took (painted, against frontend's figures)
| Pair | Frontend | QA |
|---|---|---|
| Heading on add section | 9.41 | 9.41 |
| Row title on card | 14.55 | 14.55 |
| Error text on card | 5.92 | 5.92 |
| Delete prompt on panel | 13.20 | 13.20 |
| Delete label on fill | 6.47 | 6.47 |
| Delete fill vs panel | 5.37 | 5.37 |
| `--control-border` vs panel | 3.12 | 3.117 |
| Pinned border vs card | 4.60 | 4.60 |
| Action button border vs card (7 buttons) | 3.44 | 3.44 |
| Edit and confirm Cancel borders | 3.44 / 3.12 | 3.44 / 3.12 |
| Form title input border vs card / fill | 3.44 / 3.61 | 3.44 / 3.61 |
| Custom input border vs page | 3.44 | 3.44 |
| Stats border vs page | 3.44 | 3.44 |
| Swatches vs card: potato, tomato, mint, sky, lavender, sunflower, blush, slate | 5.37, 4.88, 3.14, 3.97, 4.70, 4.77, 3.88, 5.36 | same to two decimals |
| Trigger fill vs page / icon on fill | 4.60 / 5.02 | 4.60 / 5.02 |
| Wordmark on page | 4.60 | 4.60 |
| Checked swatch ring vs card / vs unchecked ring | 14.55 / 10.67 | ring width `calc(2px + 2px)` vs `calc(1px + 2px)`, colour `#2b2017` vs `#d6d3d1` |
| Chip width delta (checked vs unchecked, px) | focus -0.8, short -1.9, long -1.2, custom -1.0 | 0.9, 1.9, 1.2, 1.0 (sign convention: checked minus unchecked; magnitude matches) |

No measurement differs by more than 0.5. Not re-taken by QA: drag-ring ratio (4.60), the disabled submit and disabled field fills, the decorative card edges (1.36 and 1.43), and the pinned label (8.15). These stand on frontend's figures.

### Criterion 1 cue width delta, criterion 6
Per-chip width delta at 320 px and at 1280 px is identical in both: focus 0.9 px, short break 1.9 px, long break 1.2 px, custom 1.0 px. Chips never leave the viewport, and `scrollWidth` equals `clientWidth` for all four modes.

### Criterion 6 known gap: unlayered focus rule
Confirmed still true. `app/globals.css:156-159` is an unlayered `:focus-visible { outline: 2px solid #b45309 }`. Focus outlines that use `outline-ring` (`--ring` is also `#b45309`) are therefore painted from that hardcoded value, so the token does not reach them. Recorded for milestone 4's dark part (006 Q5). It is not a failure of this task.

### Observations outside this task's scope (not counted against the verdict)
- DOM sweep of the open dialog: two interactive boundaries sit in files this task does not touch, and both are at the soft `--border` (1.36:1). The dialog close button in `components/ui/dialog.tsx` (`#d6d3d1`) and the timer `Reset` button (`#d6d3d1`, 006 surface). Both are interactive boundaries, but neither is in the swept file list. The owner should decide whether they belong in a later task.
- `<label>` text elements in the add form are 20 px tall. They are labels, not controls, so criterion 35 does not cover them.
- The Pomotato suite's real-tree runs were served by a `next dev` already listening on port 3000 (pid 43836, cwd the working tree). I left that process alone.

### Failures
None. No criterion failed; no test is failing.

## Review Findings

**Verdict: APPROVE.** All 47 criteria check out. Nothing in this diff blocks the merge, and nothing below asks frontend to come back. The findings are ranked by consequence and every one of them is either a follow-up task, a note for the dark-toggle part, or a correction to the record.

Verified independently of the agent reports: `npm run typecheck` exit 0; `npm run lint` 0 errors / 21 warnings; `git diff --stat` empty for every path criterion 37 freezes and for `package.json`, `package-lock.json`, `components.json`; `git diff --numstat app/globals.css` 13 added / 0 removed with `--border` and `--input` still `#d6d3d1`; `#88837e` recomputed at 3.437 (`--background`, `--card`), 3.614 (`--popover`), 3.117 (delete-confirm tint); the 6% `--destructive`-into-`--card` mix recomputed at `rgb(247, 231, 222)`; the idle hover mix at `rgb(99, 91, 85)`, 6.089:1 on the card. Tailwind v4's `stone-300` `oklch(86.9% 0.005 56.366)` and `stone-100` `oklch(97% 0.001 106.424)` converted to sRGB by hand: `rgb(214, 211, 209)` and `rgb(245, 245, 244)`, byte-identical to `--border` and `--muted`, which confirms the two `exact` disabled-fill rows QA did not re-measure. `d7d1bec`'s `TaskRow.tsx` and `TaskForm.tsx` read from `git show` for every before-state claim.

**antislop:** mode unresolved for this review. No antislop instruction in the review brief, and no `~/.config/antislop/settings.json` on this machine, so the 005/006 `during (session override)` record is a prior session's instruction and cannot be carried forward as a source. No antislop Mode-2 UI audit was run; the findings below are the reviewer role's five dimensions (correctness against the criteria, TypeScript strictness, accessibility, performance, licensing/branding). If the owner wants an antislop audit of this surface, that question (DURING or AFTER) has to be answered first.

### R-1. Four interactive boundaries are still at the soft `--border`, and the root cause is one line in a generated file
`components/ui/button.tsx:13` — the `outline` variant hardcodes `border-border bg-background`. Every button that takes it is born at 1.36:1 on `--background` / 1.43:1 on `--popover`. Live consumers and hand-written twins, all outside this task's file list:
- `components/ui/dialog.tsx:89-91` — the dialog Close button (`variant="outline"`). QA named it.
- `components/TimerControls.tsx:76` — the timer Reset button, `border border-border` by hand. QA named it.
- `components/CurrentTaskCard.tsx:32` — the Reload button on the error path, `border border-border bg-background`: the same defect shape as the Stats button (a fill identical to the page plus a 1.36:1 edge), in a file criterion 37 freezes.
- `components/StatsViewSwitcher.tsx:41` — the unchecked view chips, `border-border bg-card`. (Its checked branch already carries `font-semibold`, so it is not a 1.4.1 problem, only a 1.4.11 one.)

**Why it matters:** this task's whole premise is that milestone 4 adds one `.dark` block. A dark block that assigns `--control-border` a dark value and stops there leaves these five below 3:1 in *both* themes — the gap survives the thing that was supposed to close it.

**What I would do:** give it its own small task and land it **before** the dark toggle, not folded into it. Folding it in forces the dark task to re-measure light as well as dark, which is exactly the scope creep that produced 006's criterion 14. Answering the orchestrator's question directly: these do **not** want to ride with the dark toggle. The work is one line in `button.tsx` plus four call sites plus the painted measurements, and `e2e/token-task-surface.spec.ts`'s `borderAgainst()` helper already exists to measure them.

### R-2. Criterion 35 does not actually reach the colour-swatch picker, and that is the one control under 44 px
`components/TaskForm.tsx:206-227` — the swatch target is the `<label>` wrapping an `sr-only` radio and a `h-9 w-9` span: **36 x 36 px**. The criterion-35 test at `e2e/token-task-surface.spec.ts:355` queries `button, a[href], input:not([type=radio]):not([type=checkbox]), [role=button]`, which matches the swatch by *nothing* — the radio is excluded by the selector and the label/span is not a control tag. So criterion 35 is recorded PASS while the only control that fails it is invisible to the test.

Pre-existing: `git show d7d1bec:components/TaskForm.tsx` shows `h-9 w-9` unchanged, and this task only swapped the ring colours on that element. 36 px clears WCAG 2.5.8 AA (24 px); it misses the project's own 44 px rule in CLAUDE.md and in this criterion's text ("every control"). The mode chips are the same `sr-only`-radio-plus-styled-label shape and are equally invisible to that selector, but they are covered separately and pass at >= 44 px (`e2e/token-chip-cue.spec.ts`).

**What I would do:** nothing in this diff. Record the 36 px swatch as a known gap rather than leave it implied by a selector, and widen the sweep to `label:has(input[type="radio"].sr-only)` in whichever task next opens `TaskForm.tsx`.

### R-3. The token *is* painted on `--muted`, and the Implementation Notes say it is not
Implementation Notes, "Could not do / left for others": *"The token is not painted against `--muted` (disabled field fill) in any measured state, so there is no ratio recorded for that ground."* That is not right. `components/TaskForm.tsx:169,189,251` and `components/CustomDurationInput.tsx:62` carry `border border-control-border` with `disabled:bg-muted` and **no** `disabled:border-*` override, so `#88837e` paints on `#f5f5f4` whenever a field is disabled — which happens on every running timer for the custom-duration field.

No harm done: I computed it at **3.441:1**, so criterion 17's "every ground it is painted on" holds in fact. But the note is wrong and the token's comment at `app/globals.css:52-61` lists four grounds where there are five.

**What I would do:** correct the note, and add `--muted` as a fifth row to the token's ground table so milestone 4 re-measures it against the dark `--muted` alongside the other four.

### R-4. Two visible changes in the delete-confirm panel are not on the deliberate-changes list
`components/TaskRow.tsx:172` takes the panel tint from `bg-red-50` (`#fef2f2`, unmistakably pink) to a 6% `--destructive` mix over `--card` (`#f7e7de`, a faint peach), and `:175` moves the prompt from `text-red-900` to `text-foreground`. Both are individually defensible — the tint cut is what got the in-panel Cancel border from 2.906:1 to 3.117:1 (I recomputed both), and the prompt went *up*, 9.16 -> 13.195 — and criterion 28 is satisfied. The red `Delete` button still carries the destructive signal.

But the Implementation Notes enumerate four deliberate visible changes and these two are not among them, and together they make the confirm panel read noticeably less like a warning than it did. That is a tone decision sitting inside a token sweep.

**What I would do:** nothing in code. Put it in front of the owner. If they want the red prompt back, `text-destructive` on the new tint measures **5.373:1** (I computed it), which clears 4.5:1, so the option is available without touching the tint again.

### R-5. The pinned Pin button lost its hover feedback
`components/TaskRow.tsx:35` — `pinnedActionButtonClass` has no `hover:` state, while `actionButtonClass` darkens its border to 6.089:1 on hover. Before this task the pinned button *did* have one: the unmerged join meant the base `hover:border-stone-400` still applied even though the pinned colours did not. So a correct fix traded one small regression for a much larger one.

Not an accessibility failure — the focus ring and the `Pin`/`Unpin` label are intact, and hover is not a WCAG requirement. An affordance loss on one control.

**What I would do:** add `hover:border-[color-mix(in_srgb,var(--primary),var(--foreground)_20%)]` to `pinnedActionButtonClass` in the next task that opens the file. Not worth a round trip now.

### R-6. `disabled:bg-border` couples a boundary token to a fill role
`components/TaskForm.tsx:264` — the disabled submit is filled with `--border`. This is the **correct** choice under criterion 29: `--border` is byte-identical to the old `stone-300` (verified by OKLCH conversion), so the disabled pair holds at 1.49:1, where `--muted` would have dropped it to about 1.08:1 and criterion 29 forbids getting worse. So no change is wanted here.

It is still a semantic smell worth carrying forward: milestone 4 will choose `--border`'s dark value for its boundary job, and a disabled submit filled with that value may land anywhere from invisible to oddly bright. **What I would do:** the dark-toggle task introduces a disabled-surface token rather than inheriting the coupling. Flag it there, not here.

### R-7. One unsound cast, in a test file
`e2e/token-chip-cue.spec.ts:33` — `const out: Record<Mode, { ... }> = {} as never;` asserts an empty object as a fully-populated four-key record. Safe in practice: the loop on the next lines writes all four keys before the value escapes. But `as never` is the same escape hatch as `as any` with respect to CLAUDE.md's rule, and `components/token-foundation.test.ts:125` only greps for `any`, so the guard that is supposed to catch this shape walks past it.

**What I would do:** seed the record with its four keys, or build it with `Object.fromEntries` behind a mapped type. Non-blocking, test-only.

### R-8. The guard is strong; three places it is narrower than it looks
`components/palette.tokens.test.ts` is the most valuable thing in this diff and it does what criterion 11 asks — discovery-driven, empty allow-list, asserted empty. Three notes, none a criterion failure:
- **The inline-style block (lines 164-169) iterates `TASK_007_FILES`, not `FILES`.** That list is hand-written. A file added later with `style={{ backgroundColor: "red" }}` is caught by nothing: the hex and colour-function blocks are discovery-driven but neither sees a named CSS colour. One-word fix: iterate `FILES`.
- **`SCANNED_DIRS` (line 18) is hand-maintained.** A new top-level folder is uncovered — the same hole `widgets/` sat in before this task. Criterion 11 names exactly those four directories, so this is within spec, but an assertion that `SCANNED_DIRS` equals the set of top-level folders containing `.tsx` would make it self-maintaining.
- **`text-shadow-*` is absent from `COLOR_UTILITY_PREFIX` (line 44).** Tailwind 4.1 added coloured text shadows. One word.

**The exemptions are pinned honestly.** I read both. `components/prototype/contrast.ts` is exempt only for `ctx.fillStyle = "#000"`, a 1x1 canvas reset in a measurement probe that paints nothing to the page — narrow and true. `components/task-palette-colors.ts` is the owner's swatch data, and `components/token-foundation.test.ts:57-70` pins all eight values against `d7d1bec`, so the exemption cannot be used to smuggle a changed swatch past review. The inline-style exemption is pinned to the exact expression string, so moving or editing that expression breaks the test rather than silently widening it. All three are correct.

**And the old blind regex really is deleted, not shadowed** — in the file criterion 14 names. `git diff -- components/TaskListDialog.tokens.test.ts` removes the `RAW_PALETTE_UTILITY` const and its per-file `it()`, leaving only the hex check and the surface-token check. See R-9 for the copy that criterion 14 did not name.

### R-9. A third copy of the task-005 blind regex survives
`components/TimerGauge.tokens.test.ts:15` still carries the same `(?:amber|stone|red|...)-\d{2,3}` pattern that cannot see `white`, `black` or `/NN` and that let `text-white` through for two tasks. It guards `TimerGauge.tsx`, `HoldButton.tsx`, `SloshGauge.tsx` and `hooks/use-resolved-tokens.ts`, **all four of which the new discovery-driven guard already covers**, so nothing is unguarded today.

Criterion 14's text names only `TaskListDialog.tokens.test.ts`, so this is not a criterion failure. It is the same artefact: a test that looks like a live palette guard and is blind to three of the four shapes. **What I would do:** delete those lines and the two `it()` blocks that use them in the next task that opens the file; the `HEX_LITERAL`, `RGB_LITERAL` and `TIMER_SOURCE` checks in that file are still useful and stay.

### R-10. Space Grotesk has no provenance entry
`app/layout.tsx:2` loads Space Grotesk via `next/font/google` (self-hosted at build, SIL OFL, no runtime request to Google), used for the `pomotato` wordmark in `widgets/HeaderNav.tsx`. Comfortaa has a provenance line in the 2026-10-09 asset entry in `docs/DECISIONS.md`; Space Grotesk has none — `grep -rni "space.grotesk" docs/` finds it only in task files. The typeface *choice* was already confirmed by the owner as deliberate (005's R-7); what is missing is the licence line CLAUDE.md requires. Pre-existing, outside this diff, zero risk. **What I would do:** one line added to the 2026-10-09 entry the next time typography is touched.

---

### The six judgement calls, answered

**1. `--control-border: #88837e`, and cutting the panel tint to 6%. Adequate, and the right lever.** The 0.117 margin is thinner than it looks safe, but it is not a measurement that can drift: both colours are exact token values composited with no antialiasing and no subpixel geometry, so 3.117:1 is deterministic, and I reproduce it to three decimals. The real exposure is future edits, not noise — and that is already netted, because the criterion-17 test reads the panel's painted fill rather than hardcoding it, so darkening the tint or changing `--destructive` turns the suite red.

On the lever: holding the tint at the old 10%-equivalent, even `#88837e` only reaches **2.906:1** (I computed it), so the token alone could not have cleared the floor — it would have had to go to roughly `#85807b` or darker, which lifts the other four grounds past where they need to be and darkens every control edge in the app, against the cream direction in `DESIGN.md`. Moving two variables was not over-correction; one was insufficient. The alternative worth naming is structural rather than chromatic — put the confirm buttons on `--card` instead of inside the tint, or make the panel a 1 px `--destructive`-mix edge instead of a fill — but either is markup surgery inside a colour task, and criterion 32 freezes that behaviour. Frontend took the cheaper correct option. The cost is tonal, not technical, and it is R-4.

**2. The chip cue: weight alone is sufficient and not fragile. One cue is enough; the reflow is the thing to watch.** `font-weight` 700 vs 400 is a genuine non-colour property, it is immune to `forced-colors` and to greyscale by construction, and at 14 px uppercase Comfortaa the difference is plainly visible. 1.4.1 is satisfied, 1.4.11 is not engaged (no boundary), and native `checked` still carries the state for assistive tech — so the gap was only ever sighted-CVD, and weight closes it. The one degradation path is a font-synthesis-disabled environment with no bold face available; browser default is `font-synthesis: auto`, so the browser fakes it, and the fallback stack would too.

What I would actually put to the owner is not sufficiency, it is the **3 px row shift on every mode change**. Before `2e8f967`'s successor the row was static because all four chips were bold; it now jitters, on the one surface `DESIGN.md` describes as "calm". The underline alternative the PM listed costs no width at all. Frontend measured the shift, judged it small, and kept the default — a reasonable call, and `components/ui/mode-chip.tsx` makes it a one-line variant change either way. If the owner wants a second cue rather than a swap, `underline underline-offset-4 decoration-2` on the checked variant adds zero reflow and no fill, border or radius, so criterion 3 still holds. I would not require it.

**3. The pinned fix: correct, well-targeted, and the only instance.** I confirmed the defect in `d7d1bec`'s source — the pinned classes joined onto `actionButtonClass` with no merge step, so `bg-white` and `bg-amber-100` both reach the class list and stylesheet order decides. The pinned fill, border and label had been authored and never shown since milestone 2, with state carried only by `aria-pressed` and the label.

The fix is better than the obvious one. Reaching for `cn()` would have made the merge *work*; splitting into `actionButtonShape` + `actionButtonClass` + `pinnedActionButtonClass` with mutually exclusive branches makes the collision **impossible**, which is the right level to fix a class-ordering bug at. It is covered by a painted-pixel regression test (`e2e/token-task-surface.spec.ts`, asserting painted values, not class names, so a class-list check cannot stand in for it) and by a hash-verified break-and-restore.

**No other instance of the pattern exists.** I checked every class join and template-literal `className` in `app/`, `components/` and `widgets/`: `components/TaskRow.tsx:117` (card) and `components/TaskForm.tsx:222` (swatch) both keep colour **only** in the conditional branch with a colour-free base; `components/TaskRow.tsx:148` appends only non-colour utilities to `actionButtonClass`; and `components/StatsViewSwitcher.tsx:42`, outside the diff, is already built the same correct way. The pinned Pin button was the only one.

**4. The boundary classification is drawn correctly, including the unchecked swatch ring.** On the ring specifically: 1.4.11 asks 3:1 of visual information required to identify *components* and their *states*. Identification is carried by the swatch fill (3.14-5.37:1 against the new card), not the ring. State is carried by the *change* — checked ring 14.55:1 against the card and 10.67:1 against the unchecked ring, both far over 3:1 — and "unchecked" is the default, which has nothing to assert. So a 1.36:1 trim ring on an unchecked radio is decorative under the actual text of the success criterion, not a convenient reading of it. Frontend's one-line reason is right.

I pressure-tested the other three decorative calls and they hold too. **Row card border:** the card is a container; the `li` is a dnd-kit sortable but the drag *target* is the handle button, which carries its own 3.44:1 boundary. **Delete-confirm panel:** the confirm state is announced by the prompt and two new buttons appearing — a structural change, not a colour — so the tint is not state-bearing. **`TaskColorDot` hairline:** trim around a swatch whose fill identifies it, same logic as the ring. **No decorative classification in the swept files is an interactive boundary in disguise.** Four are, outside them — that is R-1.

**5. Criterion 31 holds for sighted CVD users, and QA undersold it.** Pinned is not ARIA-only. The button's **rendered text** changes from `Pin` to `Unpin` — visible, non-colour, and asserted (`toHaveText("Unpin")`), not merely an accessible name. `aria-invalid` is likewise not the only invalid cue: a `role="alert"` paragraph *appears*, which is a visible structural change. Disabled carries the attribute plus `disabled:opacity-40` and `cursor-not-allowed`. Drag-active is `opacity: 0.6` plus a ring. So none of the five relies on colour, and two of them (pinned, invalid) change the rendered text content, which is the strongest kind of cue there is. On top of that, pinned now *also* paints, so the colour cue is redundant rather than load-bearing. **The exact gap this task was written to close is closed, more decisively than the QA Report's "aria-pressed plus the label" phrasing suggests.** The one I would call genuinely thin is the swatch's 2 px-vs-1 px ring: a 1 px geometric delta is a weak non-colour cue on its own. It is backed by a 10.67:1 colour change and the `sr-only` colour name, so it is not a 1.4.1 failure, but it is the least robust item on criterion 31's list.

**6. The evidence standard on criteria 29 and 30 is acceptable, and the limit falls in the right place.** What QA did not re-take: the drag-ring ratio, the disabled submit fill, the disabled field fills, the decorative card edges, the pinned label. Run down what each would have cost:
- The drag ring is `--ring` at 4.60:1 — a non-text indicator with a 1.6-point margin, and the same token measured in four other places.
- The disabled fills are **byte-identical swaps**, which I proved rather than took on trust: v4 `stone-100` -> `rgb(245, 245, 244)` = `--muted`, v4 `stone-300` -> `rgb(214, 211, 209)` = `--border`. Criterion 29 only requires "not worse", and identical cannot be worse. This is the one place where an unmeasured row and an `exact` claim overlap, and it is also the place where it matters least — and it is now independently confirmed.
- The decorative card edges are the rows already recorded as below 3:1 by design.

Against that, everything near a threshold **was** re-measured by QA: the 3.117:1 boundary, mint at 3.14:1, the 3.62:1 trigger hover icon, the 5.92:1 error text. That is the correct prioritisation — QA spent its re-measurement budget where a wrong number would have changed a verdict and took the table on trust where it could not. Criteria 24-26 resting on presence plus spot-check is the same trade and I accept it on the same grounds. If I were tightening anything it would not be more re-measurement; it would be asserting the byte-identical disabled swaps in vitest against the token values, so "not worse" becomes structural rather than measured.

### Known gaps: confirmed, not re-litigated
- **`app/globals.css:156-159`, the unlayered `:focus-visible { outline: 2px solid #b45309 }`.** Confirmed still present and still winning: it sits outside `@layer`, so it beats every Tailwind utility in `@layer utilities` regardless of specificity, and `focus-visible:outline-ring` on the swept controls does not reach them. No visible difference today because `--ring` is also `#b45309`. Correctly parked on the dark-toggle part (006's Q5). One refinement for whoever takes it: the **mode chips** are the exception — their ring comes from `peer-focus-visible:outline-ring` on the `<span>` while the unlayered rule hits the `sr-only` `<input>`, so those two never collide and the chip ring genuinely resolves through the token.
- **The two out-of-scope interactive boundaries QA flagged.** Confirmed, and there are more than two. See R-1: they want their own small task ahead of the dark toggle, not a ride-along.
- **`components.json`'s `"iconLibrary": "lucide"` with `lucide-react` imported by nothing.** Confirmed untouched; `git diff components.json` is empty. Out of scope by criterion 38, still open as Q2.

### The five review dimensions
- **Correctness against the criteria:** 47 of 47. The two "PASS with limit" rows are justified above.
- **TypeScript strictness:** `tsc --noEmit` exit 0. No `any` anywhere in the diff (I grepped new test files as well as app code). One unsound cast, test-only: R-7. Named exports throughout; no `export default` in any changed component.
- **Accessibility:** native radio semantics frozen and asserted down to the attribute list; arrow-key and Tab-entry behaviour covered in `e2e/timer-surface-tokens.spec.ts` (the chip spec does not test arrows — I checked that the coverage exists elsewhere before accepting criterion 7); focus visible at 2 px / 2 px offset / `--ring` >= 3:1 on both chip states; axe-core clean at serious and critical across four dialog states and two widths; 44 px holds everywhere the sweep reaches, with the one 36 px control it does not reach called out in R-2. The 1.4.1 regression that opened this task is genuinely fixed, and criterion 31 is stronger than claimed (point 5 above).
- **Performance:** nothing here changes render frequency, adds a subscriber, or touches timer logic. `actionButtonShape` / `actionButtonClass` / `pinnedActionButtonClass` are module constants evaluated once; the pinned branch is a ternary between two interned strings, strictly cheaper than the old array-join-per-render it replaces. `git diff --stat` is empty for `lib/` and `hooks/`, so the end-timestamp timer derivation is untouched by construction.
- **Licensing / branding:** no audio, fonts, images or binaries added; the diff is CSS, TSX and tests only. `package.json`, `package-lock.json` and `components.json` unchanged — no new dependency, no icon-library switch. No copied branding, UI or copy. The one documentation gap is R-10, pre-existing and outside this diff.
