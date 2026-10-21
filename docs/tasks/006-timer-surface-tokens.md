---
id: 006
slug: timer-surface-tokens
status: draft # draft | in-progress | qa | review | done | blocked
---

# Timer surface: semantic tokens everywhere, mode chips as a shared variant

## Goal
Make the timer surface of `/` dark-ready by replacing every raw Tailwind palette class in
`components/ModeSelector.tsx`, `components/TimerControls.tsx` and `components/CustomDurationInput.tsx`
with the project's semantic tokens, and move the mode-chip class strings into a single `cva`
variant definition under `components/ui/` instead of the hand-rolled array in `ModeSelector.tsx`.

This is preparation for `docs/PLAN.md` milestone 4 (Themes), whose premise — per the owner's
DESIGN.md brief — is that a `.dark` block can be added without restyling anything a second time.
That premise is currently false for most of the app. This task makes it true for the timer surface.

**Nothing may change visually.** This is a refactor: no new behaviour, no new control, no layout
change, no new state.

## Provenance of this task
**Direct owner ask** ("initiate task 006"), not a `docs/PLAN.md` milestone item. `docs/PLAN.md` is
not edited, no milestone is renumbered, and milestone 4 itself does not start here — this task adds
no dark palette, no toggle and no theme switching. It only removes the obstacles to them.

## Data shape
**Unchanged and irrelevant.** No Dexie version, no table, no field, no type in `lib/db/**`. No store
shape change in `lib/timer/**`. **Backend does not run on this task.** Order is: frontend, then qa,
then reviewer.

If anything here appears to require a change under `lib/**`, `hooks/**`, or a change to
`app/globals.css` beyond adding a justified semantic token, the scope was wrong: **stop and report**
instead of editing those paths.

## The measured problem (given — do not re-survey)
Raw palette classes (`bg-/text-/border-/outline-/ring-*` against a numeric palette scale, plus
`bg-white` / `text-white` / `border-black/NN`), excluding test files and `docs/`:
**86 occurrences across 8 application files.**

| File | Count | Surface | Task |
|---|---|---|---|
| `components/TaskForm.tsx` | 38 | task list | 007 |
| `components/TaskRow.tsx` | 19 | task list | 007 |
| `components/ModeSelector.tsx` | 8 | timer | **006** |
| `components/CustomDurationInput.tsx` | 8 | timer | **006** |
| `components/TaskList.tsx` | 6 | task list | 007 |
| `components/TimerControls.tsx` | 4 | timer | **006** |
| `app/page.tsx` | 2 | timer | **006 (verify only — see below)** |
| `components/TaskColorDot.tsx` | 1 | task list | 007 |

### Scoping decision, and why
**Split, as the orchestrator recommended. 006 is the timer surface; 007 will be the task-list
surface.** Four reasons, beyond "86 sites is a big diff":

1. **Two different contrast baselines.** The timer surface sits on the cream page
   (`--background` `#fbf4ea`). The task-list surface sits inside the dialog on `--popover`
   (`#fffaf3`), on `bg-white` cards, and on a scrim. "Zero visual change, every swap
   contrast-measured" means every ratio is measured against its own ground. One task with two
   grounds invites a measurement taken against the wrong one.
2. **The task-list surface is stateful in ways the timer surface is not.** `TaskRow` alone carries a
   pinned `ring-amber-700`, a delete-confirm `bg-red-50` / `text-red-900` panel, a drag-active
   state and a dnd overlay; `TaskForm` has per-field invalid states and a colour-swatch picker with
   a `ring-stone-900` / `ring-stone-300` selection indicator. Each is a state a token swap can drop
   silently, and each needs its own measurement. The timer surface has exactly four stateful
   things: chip checked/unchecked, button hover, input disabled, input error.
3. **The `cva` extraction is structural, not mechanical.** It is the one piece of this work that
   changes file layout and may touch shadcn-generated source. It lands better next to 20 swap sites
   with a fresh test net around them (task 005 added `e2e/timer-gauge.spec.ts`,
   `e2e/hold-reset.spec.ts`, `e2e/mode-selector-legend.spec.ts`) than inside a 63-site sweep.
4. **`components/TaskColorDot.tsx` belongs with 007, and it is genuine chrome, not data.** Verified:
   its single hit is `border-black/10` on line 20 — a translucent hairline ring around the swatch,
   not a swatch value. The swatch colours themselves come from `TASK_COLOR_HEX` in
   `components/task-palette-colors.ts` via an inline `style`, which this project treats as
   contrast-checked data, not theme. So the one hit is real and does need fixing (a `black/10`
   hairline disappears on a dark card), but its only consumers are `TaskForm.tsx` and `TaskRow.tsx`
   (`CurrentTaskCard.tsx` still imports it but no longer renders it — see Observations), and the
   fix needs a decision about what a hairline on a dark surface should be. That is 007's problem.

**`app/page.tsx` is verify-only.** Both of its hits (`text-stone-900`, `text-stone-600`) sit inside
the commented-out JSX block at lines 9–12 — the hidden "Pomotato" title and tagline from the owner's
in-flight edit. There is nothing live to swap. Deleting the block would remove the only place the
product name appears on `/`, and restoring it is a product decision, so neither happens here; it
becomes open question Q4. Live site count for 006 is therefore **20**, not 22.

### Token mapping as surveyed (verify every value from computed styles — do not trust this table)
Taken from the comments in `app/globals.css`, which name the palette step each token was derived
from. Frontend re-measures each pair in a browser; this table only says where the decision points
are.

**Exact (same colour, the swap is value-preserving):**

| Raw utility | Token |
|---|---|
| `amber-700` | `--primary` / `--ring` (`#b45309`) |
| `amber-900` | `--accent-foreground` (`#78350f`) |
| `stone-300` | `--border` / `--input` (`#d6d3d1`) |
| `stone-600` | `--muted-foreground` (`#57534e`) |
| `stone-700` | `--secondary-foreground` (`#44403c`) |
| `stone-100` | `--muted` / `--secondary` (`#f5f5f4`) |
| `red-700` | `--destructive` (`#b91c1c`) |
| `white` (text) | `--primary-foreground` (`#ffffff`) |

**No exact equivalent — these are the decision points (see Q6):**

| Raw utility | Where | Nearest token | Note |
|---|---|---|---|
| `bg-white` | unselected chip, input fill | `--popover` `#fffaf3`, `--card` `#fbf4ea` | no token is pure white |
| `bg-amber-200` | selected chip fill | `--accent` is amber-100 `#fef3c7` | one step lighter |
| `hover:bg-amber-800` | primary button hover | none (shadcn's own pattern is `primary/80`, i.e. lighter) | |
| `hover:border-stone-400` | chip hover | `--border` is stone-300 | |
| `disabled:text-stone-400` | disabled input text | `--muted-foreground` is far darker | measures ~2:1 today |
| `text-stone-900` | (app/page.tsx comment only) | `--foreground` is `#2b2017` | not swapped here |

## Scope

**In:**
- Replacing every raw palette utility in `components/ModeSelector.tsx` (8),
  `components/TimerControls.tsx` (4) and `components/CustomDurationInput.tsx` (8) with semantic
  tokens.
- Factoring the mode-chip class strings into one `cva` variant exported from a module under
  `components/ui/`, consumed by `ModeSelector.tsx` through its existing `peer-*` classes.
- Measuring, recording and reporting the before/after contrast of every pair any swapped colour
  participates in, from computed styles in a real browser.
- Extending the existing raw-palette guard-test pattern
  (`components/TimerGauge.tokens.test.ts`, `components/TaskListDialog.tokens.test.ts`) to the files
  this task touches. The existing regex misses `white`, `black` and `/NN` opacity suffixes; the
  extension must catch them.
- Adding a semantic token to `app/globals.css` **only** where no existing token can carry a role,
  with a written reason in the comment block.

**Out (deferred, do not do here):**
- **The task-list surface: `components/TaskForm.tsx`, `components/TaskRow.tsx`,
  `components/TaskList.tsx`, `components/TaskColorDot.tsx` (63 sites).** This is follow-up task 007,
  which the PM has not written yet. Do not touch these files.
- Any dark palette, `.dark` block, theme toggle, theme persistence or uploaded background. That is
  milestone 4. This task only removes the obstacles.
- Replacing the native radios in `ModeSelector.tsx` with a segmented control, `ToggleGroup`, or any
  other ARIA-constructed widget. **Settled and recorded** in the 2026-10-19 entry in
  `docs/DECISIONS.md`: both ReactBits' segmented control and Radix's `ToggleGroup type="single"`
  build `role="radiogroup"` out of ARIA, which collides with CLAUDE.md's "semantic HTML before
  ARIA", and native radios already give arrow-key navigation and group semantics for free. **The
  `<input type="radio">` elements stay.** This is a rejected option, recorded so it is not revisited.
- Any new runtime dependency. `class-variance-authority` is already installed (it is what
  `components/ui/button.tsx` uses).
- Converting the Start/Pause/Resume button or the mode chips to the shadcn `<Button>` component.
  Only their colour classes and, for the chips, the location of their class strings change.
- Any change to timer logic, durations, mode behaviour, the persisted timer shape, the gauge, the
  hold-to-confirm Reset, `lib/**`, `hooks/**`, `/stats`, the task-list dialog or `CurrentTaskCard`.
- Changing `app/globals.css` beyond adding a justified token: the `body` rule, the unlayered
  `:focus-visible` rule, the `@theme inline` mappings and every existing token value stay as they
  are. The hardcoded `#b45309` in the `:focus-visible` rule is already parked for milestone 4 by the
  2026-10-07 entry in `docs/DECISIONS.md`; see Q5.
- Un-skipping the two parked tests in `e2e/task-list-dialog.spec.ts` (lines 952 and 974). They are
  blocked on an owner decision about the `CurrentTaskCard` pomodoro count. They stay skipped, their
  assertions stay untouched.
- Fixing the pre-existing chip-row jitter (a selected chip is `font-semibold`, so the row reflows
  slightly on selection). Pre-existing; do not fix or hide it here.
- Adding a visual invalid state to `CustomDurationInput`. `aria-invalid` is set and the error is
  conveyed by the `role="alert"` paragraph; that is sufficient and is not this task's business.

## Acceptance Criteria

### A. No raw palette left, and a net that keeps it that way
- [ ] 1. `components/ModeSelector.tsx`, `components/TimerControls.tsx`,
      `components/CustomDurationInput.tsx` and the new chip-variant module contain **zero** raw
      palette utilities: no `(bg|text|border|outline|ring|from|to|via|divide|placeholder|caret|
      accent|decoration|shadow)-(stone|amber|red|orange|yellow|green|emerald|teal|sky|blue|indigo|
      violet|purple|pink|rose|slate|gray|zinc|neutral|black|white)` with or without a numeric step
      and with or without a `/NN` opacity suffix.
- [ ] 2. The same four files contain no `#rrggbb`, `rgb(`, `rgba(`, `hsl(` or `hsla(` literal, and
      no inline `style` carrying a colour.
- [ ] 3. `app/page.tsx` has zero raw palette utilities in live markup. Its only two occurrences
      remain inside the commented-out block at lines 9–12, untouched, pending Q4. QA asserts both
      halves of this: zero in live markup, and the comment block unchanged against HEAD.
- [ ] 4. A guard test covers all of the above, in the shape of
      `components/TimerGauge.tokens.test.ts`: a source-text check per file with an explicit pinned
      list of allowed utilities (empty for the four files in criterion 1). QA proves it is live by
      break-and-restore: reintroduce one raw utility, confirm the test fails, restore, and record
      the hash check in the QA Report.
- [ ] 5. The guard regex catches `white`, `black` and `/NN` opacity suffixes. QA demonstrates this
      specifically — the existing `TimerGauge.tokens.test.ts` pattern does not, and a guard that
      cannot see `bg-white` would have passed this task's worst case silently.
- [ ] 6. The timer-source guard (`setInterval` / `setTimeout` / `requestAnimationFrame` /
      `performance.now`) is extended to `ModeSelector.tsx` and `CustomDurationInput.tsx` and passes.

### B. Tokens, not new colours
- [ ] 7. Every colour this task writes resolves through a semantic token already defined in
      `app/globals.css` (`--primary`, `--primary-foreground`, `--border`, `--input`, `--muted`,
      `--muted-foreground`, `--secondary`, `--secondary-foreground`, `--accent`,
      `--accent-foreground`, `--background`, `--card`, `--popover`, `--destructive`, `--ring`, …),
      or through a `color-mix()` of such tokens, or through a new token added under criterion 8.
- [ ] 8. Any new CSS custom property in `app/globals.css` carries a one-line reason comment that
      (a) names the role it serves, (b) says why no existing token fits, and (c) states that
      milestone 4 must give it a dark value. Implementation Notes justify each one. A new token
      added without a reason comment is a failure.
- [ ] 9. `git diff app/globals.css` contains **nothing but** such token additions: no edit to the
      `body` rule, the unlayered `:focus-visible` rule, the `@layer base` block, any `@theme inline`
      mapping, or any existing token value. Reviewer verifies by diff.
- [ ] 10. `git diff --stat` is empty for `lib/`, `hooks/`, `app/stats/`, `components/Task*.tsx`,
      `components/CurrentTaskCard.tsx`, `components/TimerDisplay.tsx`, `components/TimerGauge.tsx`,
      `components/SloshGauge.tsx`, `components/HoldButton.tsx` and `components/PomotatoTimer.tsx`.
      Reviewer verifies. (`HoldButton` already takes its colours from `TimerControls`'
      `RESET_TOKENS`; nothing about it needs to change.)
- [ ] 11. `git diff package.json package-lock.json` is empty. No new dependency.

### C. Zero visual change, measured rather than assumed
- [ ] 12. Implementation Notes carry a **swap table**: one row per swapped site, with file, line,
      the utility before, its computed colour, the token after, its computed colour, and a verdict
      of `exact` (byte-identical computed colour) or `deviation`.
- [ ] 13. For every `deviation` row, the table also lists each text and non-text pair that colour
      participates in, with the measured contrast ratio **before** and **after**. Ratios are
      computed from colours read out of a real browser's computed styles or painted pixels, not
      from arithmetic on token values. (Task 005 precedent: the painted glass behind the Reset label
      is `rgb(240,235,228)` in practice, not the token's `#fffaf3`, and the token-arithmetic figure
      was off by 2.7 points. Do not quote arithmetic as measurement.)
- [ ] 14. For every pair, **after >= before**, or the row is explicitly marked as a deliberate
      reduction with its reason. No pair finishes below its WCAG threshold: 4.5:1 for body text,
      3:1 for text at or above 24 px / 18.66 px bold, 3:1 for a non-text colour that is the only
      carrier of a control's state or boundary. Where a faithful swap would preserve a *failing*
      ratio, the ratio is fixed and the change is flagged in the swap table rather than the failure
      being preserved (precedent: task 005 fix loop 1 deliberately darkened `text-stone-500` to
      `--muted-foreground`, 4.39:1 → 6.99:1).
- [ ] 15. Disabled-control pairs (`CustomDurationInput` when `status` is `running` or `paused`) are
      measured and recorded even though WCAG 1.4.3 exempts them. They may stay below threshold, but
      they must not get **worse** than they are today.
- [ ] 16. These pairs are measured at minimum, each in a real browser, before and after:
      - mode chip, unselected: label on fill; fill against the page; border against the page
      - mode chip, selected: label on fill; fill against the *unselected* fill (this is the state
        indicator); border against the page
      - mode chip focus outline against the chip fill and against the page, selected and unselected
      - Start / Pause / Resume: label on fill; hover fill; focus outline against fill and page
      - Reset (unchanged, used as a control): its measured figures still match task 005's painted
        values — white label on fill ~4.72:1, dark label on glass ~7.18:1
      - `CustomDurationInput`: label on the page; input text on the input fill; input border against
        the page; disabled text on the disabled fill; disabled border against the page; the
        `role="alert"` error text on the page; focus outline against the input fill and the page
- [ ] 17. **No geometry moves.** For `/` at 320 px and at 1280 px, in each timer status, the bounding
      boxes of the four mode chips, the primary button, the Reset button, the duration label, the
      duration input and the error paragraph are the same before and after within 1 px, and
      `document.documentElement.scrollWidth <= clientWidth` holds. QA compares against HEAD (or a
      checkout copy), not against a remembered value.
- [ ] 18. Every control stays at least 44 px in both dimensions at both viewports, and the chips keep
      `min-h-11`.
- [ ] 19. No axe-core violation of serious or critical impact on `/` at 320 px and 1280 px, in each
      timer status: idle, running, paused, complete; plus with the duration field focused, disabled
      and in its error state.

### D. Mode chips as one shared variant
- [ ] 20. The chip class strings exist exactly once, in a `cva` definition exported from a module
      under `components/ui/`. `components/ModeSelector.tsx` imports it and contains no inline chip
      class list — the `[...].join(" ")` array is gone.
- [ ] 21. The variant covers the checked and unchecked appearance as variants (not as a ternary at
      the call site), and the `font-semibold`-on-checked weight difference is preserved exactly.
- [ ] 22. The variant is applied through the existing `peer-*` mechanism. The
      `<input type="radio" name="timer-mode" className="peer sr-only">` elements, the `<fieldset>`
      and the `<legend className="sr-only">Timer mode</legend>` added by task 005 are unchanged. No
      `role`, no `aria-*`, no Radix primitive and no `ToggleGroup` is introduced.
- [ ] 23. If the variant lands inside the shadcn-generated `components/ui/button.tsx`, that file
      gains the "edited, a future `shadcn add` is a conflict" header comment the 2026-10-15 entry in
      `docs/DECISIONS.md` requires. If it lands in a sibling module, Implementation Notes name the
      file and say why.
- [ ] 24. The module uses a named export (CLAUDE.md), is typed with no `any`, and exports its
      `VariantProps` type if the variant takes props.
- [ ] 25. Behaviour is identical: Tab enters the group once and lands on the checked radio; arrow
      keys move between modes and change the timer mode; clicking a chip label selects its radio;
      the group's accessible name is still exactly "Timer mode"; `e2e/mode-selector-legend.spec.ts`
      passes unchanged.
- [ ] 26. Keyboard focus is still visible on the **chip**, not only on the `sr-only` input: focusing
      a radio by keyboard shows a 2 px outline at 2 px offset in the app's amber focus colour, the
      same treatment the other timer controls use, in both the checked and unchecked state, at 3:1
      or better against the chip fill and the page. QA measures width, offset and colour, not just
      presence.

### E. Regression and gates
- [ ] 27. `npm run lint` (0 errors; warnings not above the 21 baseline), `npm run typecheck`,
      `npm run build`, `npm run test` and `npm run test:e2e` all succeed.
- [ ] 28. `npx vitest run` is at least 271/271 plus this task's new guard tests, with the new count
      stated in the QA Report.
- [ ] 29. Playwright is at least 263 passed / 2 skipped, 0 failed. The 2 skipped stay the two parked
      `e2e/task-list-dialog.spec.ts` tests (952, 974), still skipped with their reason, assertions
      untouched. `git diff -- e2e/task-list-dialog.spec.ts` shows no change from this task.
- [ ] 30. Timer behaviour is untouched: start, pause, resume, hold-to-reset, completion, retroactive
      completion after a closed tab, mode switching (which still forces `idle`), custom duration
      (still refused mid-session, still validated with the same messages), persistence across
      reload. `e2e/timer.spec.ts`, `e2e/timer-gauge.spec.ts`, `e2e/hold-reset.spec.ts`,
      `e2e/hold-label-contrast.spec.ts` and `e2e/sessions.spec.ts` pass with no assertion changed.
- [ ] 31. Remaining time is still derived from the stored end timestamp; no new clock, no new timer
      source anywhere in the diff (criterion 6 plus reviewer's read of the diff).
- [ ] 32. Zero console errors or warnings, at 320 px and 1280 px, across: load, start, pause, resume,
      short tap on Reset, completed hold on Reset, completion, mode switch, a valid custom-duration
      edit, an invalid custom-duration edit, and reload.
- [ ] 33. No React hydration mismatch warning on reload of `/` with the timer idle, running and
      paused.
- [ ] 34. No `any` in new or changed code; functional components with named exports.
- [ ] 35. New tests cannot pass vacuously — none of the four shapes recorded in the 2026-10-09 and
      2026-10-15 entries in `docs/DECISIONS.md` (an assertion inside `try`/`if`/`else`, an observer
      that may never attach, a `toBeVisible()` on something already true, a test with zero
      assertions).
- [ ] 36. QA breaks the implementation, confirms the test fails, and restores it, for at least three
      criteria: the palette guard (criterion 4), one measured contrast pair (criterion 16), and the
      chip focus indicator (criterion 26). Recorded in the QA Report per the 2026-10-07
      standing-practice entry in `docs/DECISIONS.md`.
- [ ] 37. Implementation Notes record, before QA starts: the swap table (criterion 12), every new
      token with its reason, which module holds the chip variant and why, and the list of sites
      where no exact token existed together with what was chosen for each (Q6).

## Files likely touched
- `components/ModeSelector.tsx` (frontend) — 8 swaps; chip classes move to the variant module.
- `components/TimerControls.tsx` (frontend) — 4 swaps, all on the primary Start/Pause/Resume button
  and the shared `buttonFocusRing` constant. `RESET_TOKENS`, `RESET_HOLD_MS`, the `HoldButton` props
  and the hint paragraph are unchanged.
- `components/CustomDurationInput.tsx` (frontend) — 8 swaps across label, input, disabled state and
  error text.
- `components/ui/button.tsx` **or** a new sibling under `components/ui/` (frontend) — the chip `cva`
  variant. Frontend picks; criterion 23 applies either way.
- `app/globals.css` (frontend) — **only** if a role genuinely has no token, and only as an addition.
- `components/*.tokens.test.ts` and `e2e/**` (qa only) — the extended guard plus the contrast and
  geometry checks.
- **Not touched:** `app/page.tsx` (verify only), `lib/**`, `hooks/**`, `app/stats/**`,
  `components/TaskForm.tsx`, `components/TaskRow.tsx`, `components/TaskList.tsx`,
  `components/TaskListDialog.tsx`, `components/TaskColorDot.tsx`,
  `components/CurrentTaskCard.tsx`, `components/TimerDisplay.tsx`, `components/TimerGauge.tsx`,
  `components/SloshGauge.tsx`, `components/HoldButton.tsx`, `components/PomotatoTimer.tsx`,
  `components/Stats*.tsx`, `docs/PLAN.md`, `e2e/task-list-dialog.spec.ts`.

## Open questions for the owner
Recorded here, not answered by this task. None of them blocks frontend from starting, except where
noted.

1. **`--gauge-liquid` (reviewer's R-2 from task 005, still unanswered).** Reviewer recommended
   re-pointing it from `#f6c453` to `#d97706` (amber-600). The figures are verified: the current
   value gives 1.56:1 liquid-vs-glass, which fails the 3:1 non-text threshold, with 9.79:1 for the
   `mm:ss`; `#d97706` gives 3.07:1 and 4.99:1, passing both. The cost is purely aesthetic — a deeper
   amber liquid instead of pale yellow. It is a palette decision, which DESIGN.md reserves to the
   owner. If the owner says yes, it is a one-value edit to `app/globals.css` and can ride along with
   this task; it is **not** in scope until then.
2. **A broken font token.** `app/globals.css:9` declares `--font-geist: var(--font-geist)`, a
   self-reference: nothing defines `--font-geist`. `app/layout.tsx:6` defines `--font-geist-sans`.
   So the `font-geist` utility resolves to nothing. Harmless today (no app code uses it) but dead.
   `--font-geist-mono` on line 10 does resolve, because `app/layout.tsx:11` defines that name. Fixing
   it means editing an existing `@theme inline` mapping, which criterion 9 forbids here — so it
   needs the owner's word first. Related, same area, also not touched: `app/globals.css:127` still
   sets `body { font-family: Arial, Helvetica, sans-serif }`, so no Geist reaches body text at all.
3. **`font-mono` now renders proportional** (reviewer's R-7 from task 005). `app/globals.css:82`
   maps `--font-mono` to Comfortaa, so every `font-mono` surface is proportional.
   **One correction to the brief:** `components/TaskRow.tsx:157` *does* carry `tabular-nums`
   (`shrink-0 font-mono text-sm tabular-nums text-stone-600`), as do
   `components/TimerDisplay.tsx:14`, `components/StatsDashboard.tsx:79,84` and
   `components/StatsTables.tsx:35,36,62,63`. So digit alignment is not currently broken anywhere;
   the residual issue is that `font-mono` is now a misnomer rather than a bug. Whether to re-point
   `--font-mono`, drop the utility, or leave it is the owner's call. The file is 007's anyway.
4. **The commented-out header in `app/page.tsx:9–12`.** The "Pomotato" title and "A cozy focus
   timer." tagline are commented out in the owner's in-flight edit, which is why the file's only two
   raw palette hits are dead. Delete the block, or restore the header with tokens? `/` currently
   shows the product name nowhere. Until the owner answers, the block stays exactly as it is.
5. **The focus ring still does not flow through `--ring` for the whole app.** The unlayered
   `:focus-visible` rule at `app/globals.css:143-146` hardcodes `outline: 2px solid #b45309`. The
   2026-10-07 entry in `docs/DECISIONS.md` already records this and parks it for milestone 4
   ("milestone 4's dark palette will not reach these rings through the token"). This task moves the
   *utility-driven* rings on its three files onto `--ring` (an exact-value swap, `--ring` is
   `#b45309`), but the global rule stays hardcoded, so the obstacle is only partly removed. Confirm
   that milestone 4 still owns the rest.
6. **Four roles have no exact token** (`bg-white`, `bg-amber-200`, `hover:bg-amber-800`,
   `hover:border-stone-400`, plus `disabled:text-stone-400`). Does the owner prefer the nearest
   existing token with the measured delta recorded, or a new semantic token per role? **Frontend
   proceeds under the default rule in criteria 7, 8 and 14** — prefer an existing token or a
   `color-mix()` of tokens, record the measured delta, add a token only with a written reason — and
   lists every one of these sites in Implementation Notes (criterion 37). The owner can overturn any
   single row of that list without reopening the task. The sharpest one: the selected chip is
   `bg-amber-200` (`#fde68a`) and `--accent` is amber-100 (`#fef3c7`), so using `--accent` makes the
   selected chip one step lighter. That is the one place where "zero visual change" and "no new
   token without a reason" actually collide.

## Risks
- **"Zero visual change" and "tokens only" are in tension, and the tension is real, not theoretical.**
  Five roles have no exact token (Q6). Frontend must not resolve this by hardcoding a hex or by
  quietly accepting a visible shift — the swap table (criterion 12) exists so that every
  non-identical swap is visible to the owner and the reviewer.
- **Form states are where token swaps drop things.** `CustomDurationInput` has a disabled state (a
  background *and* a text colour), an `aria-invalid` state and an error paragraph. There is no
  placeholder today — `value` is always set from the store — so there is no placeholder colour to
  swap; verify that rather than assuming, because a `placeholder:` utility is the classic omission.
- **Measurement by arithmetic is not measurement.** Task 005's reviewer and frontend both quoted
  token-derived ratios (5.02:1, 9.89:1) that painted pixels later put at 4.72:1 and 7.18:1. Any
  ratio in this task's reports must say where it came from.
- **The unselected chip is nearly boundary-less already.** `bg-white` against the cream page is about
  1.07:1 and `--border` against cream measures 1.36:1 (task 005 reviewer, "effectively invisible").
  Swapping `bg-white` to `--popover` (`#fffaf3`) narrows that further. The chips still carry text
  labels and the selected state also differs by font weight and border colour, so 1.4.11 is not
  necessarily violated — but this is the one swap that can make a control harder to see, and it
  needs the measurement in criterion 16, not a shrug.
- **Editing shadcn-generated source.** If the chip variant goes into `components/ui/button.tsx`, a
  future `shadcn add button` will offer to overwrite it and will look like a routine update. The
  header comment in criterion 23 is the mitigation, per the 2026-10-15 entry in
  `docs/DECISIONS.md`.
- **The `cva` extraction can silently change specificity or class order.** `cva` merges through `cn`
  / `tailwind-merge` in this project's `components/ui/button.tsx`; a conflicting utility can be
  dropped rather than overridden. Criteria 17, 21 and 26 (geometry, weight, focus ring) are the
  checks that catch it.
- **Accessibility:** native radios, keyboard reachability and the `sr-only` legend from task 005 are
  load-bearing and easy to lose in a refactor that touches the chip markup. Criteria 22, 25 and 26
  exist for exactly that.
- **Licensing:** no audio, fonts, images or binaries are added by this task. If any appear, they
  must be original or CC0 with provenance in `docs/DECISIONS.md`.
- **Performance:** none expected; nothing here changes render frequency. The gauge's per-snapshot
  `getComputedStyle` (reviewer's R-5 on task 005) is untouched and out of scope.
- **Next.js version:** per `AGENTS.md`, frontend reads the relevant guide in
  `node_modules/next/dist/docs/` before writing component code.
- **antislop:** task 005 records the session mode as `during (session override)`, supplied by the
  owner through the orchestrator. Frontend should confirm that still holds, announce
  `antislop active: during (session override).` before its first UI edit, and run the Delivery Gate
  before handing over.

## Observations (not criteria, not scope)
- `components/CurrentTaskCard.tsx:4` still imports `TaskColorDot` but no longer renders it — the
  owner's in-flight edit removed the usage. A dead import; it is probably part of the 21 lint
  warnings. Not this task's file; mentioned so it is not lost.
- `components/CurrentTaskCard.tsx:6` carries `border border-none bg-none`, which is three utilities
  cancelling each other out. Same in-flight edit, same reason for mentioning it.

## Implementation Notes
(Filled in by frontend as they build. Criterion 37 lists what must be here before qa starts.)
antislop active: during (session override). Next.js docs: no Next-specific API is touched (Tailwind classes and a cva module only).

### Headline finding: "exact" was wrong for every palette swap
The task's mapping table assumed Tailwind's `amber-700` etc. equal the hex values in `globals.css` comments. They do not: this project's Tailwind v4 palette is OKLCH, and painted pixels differ from the token hexes by a few RGB units (amber-700 paints `rgb(187,77,0)`; `--primary` is `rgb(180,83,9)`). So almost nothing is byte-identical. Every site below is measured (canvas-painted `getComputedStyle` colours, Chromium, `http://localhost:3000`, before = HEAD files, after = this diff, 320 and 1280 px give identical colours). The only byte-identical sites are those marked `exact`. No deviation is larger than 3 to 13 RGB units per channel except the three called out under "Visible changes".

Measurement method: `/private/tmp/.../scratchpad/measure.mjs` loads `/`, waits 700 ms per state (transition-colors would otherwise be captured mid-fade), reads computed colours through a 1x1 canvas, and `an.mjs` computes WCAG ratios from those painted values. Geometry (x, y, w, h of 4 chips, primary, Reset, label, input, error) compared at 320 and 1280 in idle, custom-idle, error, running, paused: **0 diffs beyond 1 px; in practice 0 px.** `scrollWidth <= clientWidth` held. HEAD files were restored from `git checkout HEAD --` for the "before" run and my versions copied back after.

### Swap table (before = HEAD line numbers)
| File:line | Before utility -> painted | After token -> painted | Verdict |
|---|---|---|---|
| ModeSelector.tsx:32 | `peer-focus-visible:outline-amber-700` -> 187,77,0 | `outline-ring` -> 180,83,9 | deviation (imperceptible, ratios below) |
| :34 | `border-amber-700` -> 187,77,0 | `border-primary` -> 180,83,9 | deviation |
| :34 | `bg-amber-200` -> 254,230,133 | `bg-accent` -> 254,243,199 | **deviation, visible (Q6)** |
| :34 | `text-amber-900` -> 123,51,6 | `text-accent-foreground` -> 120,53,15 | deviation |
| :35 | `border-stone-300` -> 214,211,209 | `border-border` -> 214,211,209 | exact |
| :35 | `bg-white` -> 255,255,255 | `bg-popover` -> 255,250,243 | **deviation, visible (Q6)** |
| :35 | `text-stone-700` -> 68,64,59 | `text-secondary-foreground` -> 68,64,60 | deviation (1 unit) |
| :35 | `hover:border-stone-400` -> 166,160,155 | `hover:border-[color-mix(in_srgb,var(--border),var(--foreground)_30%)]` -> 163,157,153 | deviation (3 units) |
| TimerControls.tsx:21 | `focus-visible:outline-amber-700` | `focus-visible:outline-ring` | no change in practice: the unlayered `:focus-visible` rule (`#b45309`) already wins over the layered utility, so painted outline was 180,83,9 before and after (this is Q5, untouched) |
| :47 | `bg-amber-700` -> 187,77,0 | `bg-primary` -> 180,83,9 | deviation |
| :47 | `text-white` -> 255,255,255 | `text-primary-foreground` -> 255,255,255 | exact |
| :47 | `hover:bg-amber-800` -> 151,60,0 | `hover:bg-[color-mix(in_srgb,var(--primary),var(--foreground)_30%)]` -> 139,68,13 | deviation (slightly darker) |
| CustomDurationInput.tsx:42 | `text-stone-600` -> 87,83,77 | `text-muted-foreground` -> 87,83,78 | deviation (1 unit) |
| :62 | `border-stone-300` -> 214,211,209 | `border-input` -> 214,211,209 | exact |
| :62 | `bg-white` -> 255,255,255 | `bg-popover` -> 255,250,243 | **deviation, visible (Q6)** |
| :62 | `text-stone-900` -> 28,25,23 | `text-foreground` -> 43,32,23 | deviation |
| :62 | `focus-visible:outline-amber-700` | `focus-visible:outline-ring` | no change in practice (same global-rule reason as above): painted 180,83,9 both |
| :62 | `disabled:bg-stone-100` -> 245,245,244 | `disabled:bg-muted` -> 245,245,244 | exact |
| :62 | `disabled:text-stone-400` -> 166,160,155 | `disabled:text-[color-mix(in_srgb,var(--muted-foreground)_56%,var(--muted))]` -> 157,154,151 | deviation, darker (see criterion 15) |
| :65 | `text-red-700` -> 193,0,7 | `text-destructive` -> 185,28,28 | deviation |
| ui/mode-chip.tsx | (new) all of the above chip classes live here once | | |

`cursor-not-allowed`, `rounded-*`, `min-h-11`, spacing: unchanged. `app/page.tsx`: verified zero raw palette in live markup; its two hits are inside the `{/* ... */}` block, untouched (`git diff app/page.tsx` empty). No `placeholder:` utility exists and none is needed (value is always set). There is no visual invalid-state class (out of scope per the task); `aria-invalid` still set.

### Contrast, measured (painted colours; same at 320 and 1280). Format: before -> after
| Pair | Ratio | Note |
|---|---|---|
| chip selected, label on fill | 7.28 -> 8.15 | up |
| chip selected, fill vs page | 1.14 -> 1.02 | **deliberate reduction (Q6 `--accent`)**: fill was never a carrier (<3:1 already) |
| chip selected, border vs page | 4.61 -> 4.60 | meets 3:1; this border is the state carrier, with weight 600 |
| chip selected fill vs unselected fill | 1.24 -> 1.07 | **deliberate reduction (Q6)**: both below 3:1 before; selection is carried by the 4.6:1 border (vs 1.36:1 unselected) plus font weight |
| chip unselected, label on fill | 10.28 -> 9.89 | >4.5 |
| chip unselected, fill vs page | 1.09 -> 1.05 | **deliberate reduction (Q6 `--popover`)** |
| chip unselected, border vs page | 1.36 -> 1.36 | exact; **still below 3:1, pre-existing, NOT fixed** (see "Could not do") |
| chip unselected hover border vs page / vs fill | 2.37 -> 2.45 / 2.59 -> 2.58 | 0.01 lower vs fill, rounding-level |
| chip focus outline vs selected fill | 4.04 -> 4.51 | up |
| chip focus outline vs page | 4.61 -> 4.60 | >=3 |
| primary: label on fill | 5.03 -> 5.02 | >4.5, 0.01 lower from token hex vs OKLCH palette |
| primary: fill vs page | 4.61 -> 4.60 | |
| primary hover: label on fill | 7.09 -> 7.17 | |
| primary focus outline vs page / fill | 4.60 -> 4.60 / 1.00 -> 1.00 | unchanged (global rule) |
| duration label on page | 6.99 -> 6.99 | |
| input text on fill | 17.49 -> 15.30 | **deliberate reduction**: no pure-white token; still far above 4.5 |
| input border vs page | 1.36 -> 1.36 | pre-existing, below 3:1, not fixed |
| input focus outline vs fill / page | 5.02 -> 4.84 / 4.60 -> 4.60 | fill got slightly darker |
| disabled text on disabled fill | 2.37 -> 2.57 | not worse (crit. 15); first try (50% mix) measured 2.28, worse, so the mix was moved to 56% |
| disabled border vs page | 1.36 -> 1.36 | |
| error text on page | 5.88 -> 5.92 | |
| Reset | unchanged files; painted bg 255,250,243 / label 68,64,60 identical before and after | white-on-fill ~4.72 and dark-on-glass ~7.18 not re-measured by me; `hold-label-contrast.spec.ts` passes |

### Visible changes the owner should know about (all Q6, all recorded as deviations)
1. Selected chip fill: `#fee685`-ish (254,230,133) -> `--accent` (254,243,199). One amber step lighter, as the owner chose.
2. Unselected chip and input fill: pure white -> `--popover` (255,250,243), a faint cream tint.
3. Primary hover is a touch darker and less saturated (151,60,0 -> 139,68,13).
Everything else is within roughly 10 RGB units per channel.

### New tokens
**None.** `git diff app/globals.css` is empty. The three roles without a token (hover border, primary hover, disabled text) use `color-mix(in srgb, ...)` of existing tokens, so a `.dark` block carries them. The mix percentages (30%, 30%, 56%) were tuned against painted pixels to land at or above the old contrast. Tailwind arbitrary values with `color-mix(in_srgb,var(--x),var(--y)_30%)` compile and render as measured.

### Chip variant: where and why
`components/ui/mode-chip.tsx`, a **new sibling**, not `button.tsx`. `button.tsx` is shadcn-generated and already adapted; the chip is not a button (it is a `<span>` styled off a `peer` radio), so putting it there would add an unrelated variant to a file `shadcn add button` offers to overwrite and make that conflict worse. The new file is hand-written and carries a header comment saying so. It exports `modeChipVariants` and `ModeChipVariantProps` (named exports, no `any`), with a boolean `checked` variant (`true`/`false`), default `false`. `ModeSelector` calls `modeChipVariants({ checked })`; the ternary and the `.join(" ")` array are gone. `font-semibold` lives only on `checked: true`. It uses plain `cva` (no `cn`/tailwind-merge), so no class can be dropped by a merge. Radios, `<fieldset>`, `sr-only` legend, `peer` mechanism untouched; no role, no aria, no Radix.

### Guard
`components/TimerSurface.tokens.test.ts` (new, mine). Pattern `RAW_PALETTE_UTILITY` = `\b<prefix>-(?:<palette>(?:-\d{2,3})?|white|black)(?![\w-])(?:/\d+)?` OR bare `\b<palette>-\d{2,3}\b`, global. Prefixes: bg, text, border, outline, ring, ring-offset, from, to, via, divide, placeholder, caret, accent, decoration, shadow, fill, stroke. Palette: stone amber red orange yellow green emerald teal sky blue indigo violet purple pink rose slate gray zinc neutral. **Covered forms (each has its own positive test):** `bg-white`, `text-white`, `border-black/10`, `bg-black`, `text-black/80`, `ring-offset-white`, `hover:bg-white/50`, `bg-amber-200`, `peer-focus-visible:outline-amber-700`, `hover:border-stone-400`, `from-amber-200/50`, `text-red-700`. **Negative tests:** `bg-primary`, `text-primary-foreground`, `bg-popover`, `border-border`, `outline-ring`, `text-accent-foreground`, and the `color-mix` arbitrary value must not match. **Not covered by the palette regex (left to the separate hex/rgb checks):** `bg-[#fff]`, `bg-[rgb(...)]`, `bg-[oklch(...)]` (oklch is not in the colour-function check; QA may want to add it), a palette name used outside a utility prefix (e.g. `border-x-stone-300`, `bg-linear-to-r`), and a colour assembled by string concatenation. Pins are empty for ModeSelector, TimerControls, CustomDurationInput, ui/mode-chip. Also: hex/rgb/hsl and inline-style-colour checks on the same four files; `app/page.tsx` live markup (comments stripped, `{/* */}` and `/* */`) must be clean; no `setInterval/setTimeout/requestAnimationFrame/performance.now` in ModeSelector, CustomDurationInput, TimerControls, mode-chip (criterion 6).

**One edit to an existing test file, flagged:** `components/TimerGauge.tokens.test.ts` pinned `TimerControls.tsx` to `["amber-700","amber-800"]`; that pin is now stale (the utilities are gone), so I changed it to `[]` with a comment. Nothing else in that file changed. QA should verify this edit.

### Results
- vitest 303/303 (271 + 32 new guard tests). typecheck exit 0. lint 0 errors, 21 warnings (not raised).
- Playwright: 262 passed, 2 skipped, **1 failed**: `e2e/hold-reset.spec.ts:376` "Start, Pause and Resume keep single-activation behaviour and the primary styling". It asserts class names `toHaveClass(/\bbg-amber-700\b/)`, `/\btext-white\b/` and (line ~387) `bg-amber-700` on the Pause button. That is a class-name assertion that directly contradicts criterion 1; the `toHaveCSS("color","rgb(255, 255, 255)")` line still holds. I did not edit it (QA owns tests). QA needs to change those three class assertions to `bg-primary` / `text-primary-foreground` (criterion 30's "no assertion changed" cannot hold for them). `e2e/task-list-dialog.spec.ts` untouched. `npm run build` not run by me.
- Keyboard/focus: chip focus measured as 2 px outline, 2 px offset, painted 180,83,9, on the checked chip after Shift+Tab/Tab and after ArrowRight (the newly checked chip). Native radios give Tab-once and arrows as before.

### Could not do / left for owner
- **Unselected chip border and input border are 1.36:1 against the page, pre-existing, still below 3:1.** The brief says fix failing ratios, but the only fixes are a darker border (visible change, against the zero-visual-change bar) or editing `--border` (forbidden, and it is shared by the whole app). Left as is and flagged for the owner; the chips and field also carry text, and the selected chip has a 4.6:1 border.
- Q1 (`--gauge-liquid`), Q2-Q5 untouched as instructed. Q5 note: because the global `:focus-visible` rule wins, `outline-ring` on the primary button and input does not yet reach `--ring` in practice; only the chip (which uses `peer-focus-visible`, not matched by the global rule) really follows the token now.
- Axe, console and hydration checks (criteria 19, 32, 33) and `npm run build` left for QA.

## QA Report
(Filled in by qa.)

- **Verdict: FAIL.** One criterion fails: **14**. Two boundary pairs finish below the 3:1 non-text threshold: the unselected chip border and the custom-duration input border, both 1.36:1 against the page. Both were already 1.36:1 at HEAD. The task's rule (criterion 14: "fix the ratio and flag the change, do not preserve the failure") is not met, and the only fixes are a visible change or an edit to the shared `--border` token, which criterion 9 forbids. This needs an owner decision. Everything else passes. Playwright is 285 passed / 2 skipped / 0 failed, vitest is 309/309, typecheck and build pass, lint has 0 errors.
- Per-criterion tally: **36 PASS, 1 FAIL (14).** Criterion 16 passes for every pair it names except the Reset clause, which is caveated below.

### Per-criterion result
| Crit. | Result | Evidence |
|---|---|---|
| 1 | PASS | `components/TimerSurface.tokens.test.ts` pinned-list test for the four files (empty pins); no raw utility found. |
| 2 | PASS | Hex, rgb/hsl and inline-colour checks on the four files pass. oklch-family literals added to the check (see gaps). |
| 3 | PASS | `app/page.tsx` identical to HEAD (`git diff` empty); live-markup test passes. |
| 4 | PASS | Break-and-restore below (3 guard breaks, hashes restored). |
| 5 | PASS | Break-and-restore for `bg-white`, `border-black/10`, `bg-amber-200`. Task 005 regex compared on the same samples (below). |
| 6 | PASS | Timer-source guard passes for the four files. |
| 7 | PASS | e2e asserts chip/primary/input/error paint equals the resolved `--accent`, `--popover`, `--primary`, `--destructive` etc. |
| 8 | PASS (N/A) | No new token. `git diff app/globals.css` is empty. |
| 9 | PASS | `git diff app/globals.css` empty. |
| 10 | PASS | `git diff --stat` empty for every listed path. |
| 11 | PASS | `git diff package.json package-lock.json` empty. |
| 12 | PASS | Swap table present. Re-measured against HEAD (below): every row I checked matches it. |
| 13 | PASS | Ratios in the table are reproduced from painted computed styles (below), not from token arithmetic. |
| 14 | **FAIL** | Unselected chip border 1.36:1 vs page; input border 1.36:1 vs page. Guarded by `test.fail()` in e2e so the suite stays green while the failure is real. Also: 10.28→9.89 (chip label), 5.03→5.02 (primary label) and 2.59→2.58 (hover) are reductions with no reason in the table. They stay above threshold, but the literal wording needs a reason for each. |
| 15 | PASS | Disabled input text on disabled fill 2.37 → 2.57 (not worse). Disabled border 1.36 → 1.36 (not worse). Measured in running and paused. |
| 16 | PASS, with Reset caveat | Every named pair is measured (table below). Reset: computed label/glass figures are byte-identical HEAD vs now in all five states. The 7.18 and 4.72 figures do not reproduce from computed values; `e2e/hold-label-contrast.spec.ts` (painted pixels, every sampled point of the hold) passes at ≥4.5:1. |
| 17 | PASS | HEAD copy served on :3100, current on :3000. 90 element-state pairs (320 and 1280 px; idle-focus, idle-custom, error-custom, running-custom, paused-custom, running-focus), 0 diffs over 1 px. Complete status: 0 diffs. `scrollWidth <= clientWidth` everywhere. |
| 18 | PASS | Chips 72–106 × 44 px; primary 82–93 × 48; Reset 92.6 × 44; input 288–320 × 44 at both viewports. e2e asserts chips and primary; the measurement covers Reset and input. |
| 19 | PASS | axe (serious and critical) at 320 and 1280 px: idle, running, paused and complete; plus custom focused, disabled while running, and in error. |
| 20 | PASS | `ModeSelector.tsx` imports `modeChipVariants`; no `.join` array remains. |
| 21 | PASS | `font-semibold` appears only in `checked: true`. HEAD had it only on the checked branch too. |
| 22 | PASS | Radios, fieldset and sr-only legend unchanged. No `role=` or `aria-` added in `ModeSelector.tsx`. |
| 23 | PASS (N/A) | Chip variant lives in a sibling module (`components/ui/mode-chip.tsx`), not `button.tsx`. `button.tsx` is unchanged. Implementation Notes give the reason. |
| 24 | PASS | Named exports `modeChipVariants` and `ModeChipVariantProps`. No `any` in changed files. |
| 25 | PASS | Tab enters the group once and leaves on the second Tab; ArrowRight changes the mode; label click selects; group name is exactly "Timer mode"; `e2e/mode-selector-legend.spec.ts` passes unchanged. |
| 26 | PASS | 2 px solid outline, 2 px offset, `rgb(180,83,9)` (= `--ring`), on the checked and unchecked chip. Contrast ≥3:1 against fill and page. Break-and-restore below. |
| 27 | PASS | Lint 0 errors / 21 warnings. Typecheck exit 0. Build exit 0 on a copy. vitest 309/309. Playwright 285/2/0. |
| 28 | PASS | vitest 309/309 = 271 prior + 32 frontend guard tests + 6 QA tests. |
| 29 | PASS | Playwright 285 passed, 2 skipped, 0 failed. Skips are `task-list-dialog.spec.ts` lines 953 and 976 (owner-parked). That file has no diff. |
| 30 | PASS with justified exception | The only assertion change is in `e2e/hold-reset.spec.ts`. See "Change to hold-reset.spec.ts". The other five listed files have no diff. |
| 31 | PASS | Criterion 6 guard plus the diff: no new clock or timer source. |
| 32 | PASS | Console and pageerror capture from before `goto`, at 320 and 1280 px, over the 11 named interactions. Zero entries. |
| 33 | PASS | Reload with idle, running and paused seeded state: zero console messages containing "hydrat". Checked on the dev server (React dev reports hydration mismatches there). |
| 34 | PASS | No `any` in changed or new code. |
| 35 | PASS | All new assertions are top-level. The only conditional is a loop that throws if focus never reaches the radio. The one `test.fail()` is documented and fails for the measured reason (1.36 < 3). |
| 36 | PASS | Break-and-restore for criterion 4 (guard), 16 (selected label on fill) and 26 (chip focus offset). |
| 37 | PASS | Implementation Notes contain the swap table, the no-new-token statement, the chip variant location and the Q6 list. |

### Test files changed or added (QA)
- `components/TimerSurface.tokens.test.ts`: added `oklch(` / `oklab(` / `lab(` / `lch(` / `hwb(` / `color(` to the colour-function check. Added a block of positive tests for `bg-[#fff]`, `bg-[rgb(...)]`, `bg-[oklch(...)]`, `bg-[hsl(...)]`, plus a negative test for the token utilities and `color-mix`.
- `components/TimerGauge.tokens.test.ts`: the stale `TimerControls.tsx` pin (`amber-700`, `amber-800`) is now `[]`. The check stays live (see below).
- `e2e/timer-surface-tokens.spec.ts` (new, 22 tests): painted contrast (chips, primary, input, error, disabled), chip focus outline, Tab/arrow/click behaviour, 44 px targets, axe (criterion 19), console (criterion 32) and hydration (criterion 33).
- `e2e/hold-reset.spec.ts`: see below.

### Change to hold-reset.spec.ts (criterion 30 exception)
Test "Start, Pause and Resume keep single-activation behaviour and the primary styling", lines 376–400.
- **Removed:** `toHaveClass(/\bbg-amber-700\b/)` on Start, `toHaveClass(/\btext-white\b/)` on Start, and `toHaveClass(/\bbg-amber-700\b/)` on Pause. These pinned implementation class names, and task 006 removes those classes by design.
- **Added:** the expected primary fill is resolved by the browser from `var(--primary)` on a probe element. It is sanity-checked to be `rgb(180, 83, 9)`. Start and Pause are then asserted with `toHaveCSS("background-color", primaryFill)`. Pause also gets `toHaveCSS("color", "rgb(255, 255, 255)")`.
- **Hover fix:** after clicking Resume, the pointer still sits on the Pause button, so the painted fill is the hover `color-mix` (about `rgb(139,68,13)`, serialised by Chromium as `color(srgb …)`). The test moves the mouse away before reading the resting fill.
- **Kept:** the existing `toHaveCSS("color", "rgb(255, 255, 255)")` on Start. The single-activation behaviour is still asserted by the click-then-state checks: Start shows Pause, Pause shows Resume, Resume shows Pause. These are unchanged.
- **Why this is a justified exception:** criterion 30's "no assertion changed" cannot hold literally for these three lines. They asserted class names that task 006 removes. Painted-value assertions survive the next refactor, which is the point.

### Break-and-restore (hashes are SHA-256 of the file, before, broken, restored)
1. **Guard, `bg-white`** in `components/ui/mode-chip.tsx`: `3cac3697…` → `1dd6ffae…` → `3cac3697…` (match). Broken: 1 failed ("./ui/mode-chip.tsx carries only its pinned raw palette utilities"). Restored: 38/38 pass.
2. **Guard, `border-black/10`** in `components/ModeSelector.tsx`: `19d941e5…` → `15efa157…` → `19d941e5…` (match). Broken: 1 failed. Restored: 38/38 pass.
3. **Guard, `bg-amber-200`** in `components/CustomDurationInput.tsx`: `c0e58a5b…` → `86cb4766…` → `c0e58a5b…` (match). Broken: 1 failed. Restored: 38/38 pass.
4. **Criterion 26, chip focus offset** (removed `peer-focus-visible:outline-offset-2`) in `components/ui/mode-chip.tsx`: `3cac3697…` → `510ad44f…` → `3cac3697…` (match). Broken: 2 failed; "Expected 2px, Received 0px". Restored: 2 passed.
5. **Criterion 16, selected chip label** (`text-accent-foreground` → `text-border`) in `components/ui/mode-chip.tsx`: `3cac3697…` → `33c78c26…` → `3cac3697…` (match). Broken: 1 failed; "Expected >= 4.5, Received 1.3377". Restored: 2 passed.
6. Extra, `TimerGauge.tokens.test.ts` stale pin: inserted `bg-amber-700` into `components/TimerControls.tsx`. The task 005 guard failed on "./TimerControls.tsx carries only its pinned palette utilities ()". Restored (match), 16/16 pass. So the emptied pin still enforces a check.

Note: each break ran against the real file, and the hash after restore equals the hash before. No app file is left changed.

### Guard: task 005 regex vs task 006 regex (same samples)
Task 005 pattern (`amber|stone|…` with `-\d{2,3}`) sees zero for `bg-white`, `text-white`, `border-black/10`, `bg-black`, `text-black/80`, `ring-offset-white`, `hover:bg-white/50`. Task 006 pattern sees all of them. Both see `bg-amber-200`, `peer-focus-visible:outline-amber-700`, `hover:border-stone-400`, `from-amber-200/50`, `text-red-700`.

### Guard gaps: closed and left
- **Closed:** `oklch(`, `oklab(`, `lab(`, `lch(`, `hwb(` and `color(` literals are now caught by the colour-function check. Arbitrary `bg-[oklch(...)]` has a positive test.
- **Still covered by the literal checks:** `bg-[#fff]` (hex check) and `bg-[rgb(...)]` / `bg-[hsl(...)]` (function check). Both have positive tests.
- **Palette name with a numeric step outside a utility prefix:** `border-x-stone-300` is already caught by the bare `palette-NN` alternative. Not a gap.
- **Left, conscious:** palette names without a numeric step outside a prefix (none exist for these palettes except `white`/`black`), `theme(colors.amber.700)` style references, and colours built by string concatenation in JSX. The current four files contain none of these, and the e2e painted checks would catch a visual result.

### Measurements re-taken (painted computed styles, sRGB-converted via canvas, 1280 px; the same at 320 px)
HEAD (`:3100`) → now (`:3000`). Ratios computed by me from the painted values.
| Pair | HEAD | Now | Note |
|---|---|---|---|
| Selected chip: label on fill | 7.28 | 8.15 | up |
| Selected chip: fill vs page | 1.14 | 1.02 | deliberate reduction (Q6) |
| Selected chip: border vs page | 4.61 | 4.60 | ≥3 (the state carrier) |
| Selected fill vs unselected fill | 1.24 | 1.07 | deliberate reduction (Q6) |
| Unselected chip: label on fill | 10.28 | 9.89 | unmarked reduction, above 4.5 |
| Unselected chip: fill vs page | 1.09 | 1.05 | deliberate reduction (Q6) |
| Unselected chip: border vs page | 1.36 | 1.36 | **FAIL 3:1, pre-existing** |
| Primary: label on fill | 5.03 | 5.02 | unmarked, above 4.5 |
| Primary: hover label on hover fill | n/a | 7.17 | hover fill rgb(139,68,13) |
| Primary: fill vs page | 4.61 | 4.60 | |
| Duration label on page | 6.99 | 6.99 | |
| Input text on fill | 17.49 | 15.30 | deliberate reduction (no pure white token) |
| Input border vs page | 1.36 | 1.36 | **FAIL 3:1, pre-existing** |
| Disabled input text on fill (running) | 2.37 | 2.57 | not worse (crit. 15) |
| Disabled input border vs page (running) | 1.36 | 1.36 | not worse |
| Error text on page | 5.88 | 5.92 | |
| Reset label on glass (computed, all states) | 9.89 | 9.89 | identical; see Reset caveat |

Selection without colour: the selected chip border is 4.60:1 against the page and 3.37:1 against the unselected chip's border. Weight also changes (`font-semibold` on checked). Selection stays perceivable without hue. No finding.

Q5 confirmed. The unlayered `:focus-visible` rule at `app/globals.css:143-146` still wins over the utility on the primary button and input. Their painted outline is `rgb(180,83,9)` before and after, so `outline-ring` does not reach `--ring` there. Only the chip follows the token, via `peer-focus-visible`. Milestone 4 owns the rest.

Geometry: 90 element-state pairs, 0 diffs over 1 px (idle-focus, idle-custom, error-custom, running-custom, paused-custom, running-focus at 320 and 1280), plus the complete state (0 diffs).

### Unresolved for the owner (criterion 14)
Chip and input borders are 1.36:1 against the page. Options: a darker border (a visible change) or a shared `--border` edit (criterion 9 forbids it in this task). The owner decides. Once fixed, remove the `test.fail()` marker in `e2e/timer-surface-tokens.spec.ts` ("unselected chip border against the page reaches 3:1"). The input border has no such marker yet. Add one when the owner decides, or fix it.

### Commands and results
- `npx vitest run`: 12 files, **309 passed (309)**, exit 0.
- `npm run typecheck`: exit 0.
- `npm run lint`: 0 errors, **21 warnings** (baseline).
- `npm run build` on a copy (`rsync` of the working tree, `node_modules` APFS-cloned): exit 0.
- `npx playwright test --reporter=line` (full): **285 passed, 2 skipped, 0 failed**, exit 0. The two skips are the parked tests in `e2e/task-list-dialog.spec.ts`.
- Before the QA tests: 262 passed, 2 skipped, 1 failed (`hold-reset.spec.ts` primary-styling test). That is now fixed as above.

### Tests added in this run
- Guard: +6 tests (309 total).
- e2e: +22 tests in `e2e/timer-surface-tokens.spec.ts` (287 total). One of the 22 is `test.fail()`, a documented known failure. It counts as passed.

### Repro for the failing criterion (14)
1. `cd /Users/ramwelltupas/pomotato && npx playwright test e2e/timer-surface-tokens.spec.ts -g "unselected chip border against" --reporter=line`
2. Expected (criterion 14): contrast of the unselected chip border against the page ≥ 3:1.
3. Actual: 1.36:1. The test is marked `test.fail()`, so it passes today. Removing the marker gives: `Expected: >= 3, Received: 1.36`.
4. The input border (1.36:1) has no marker. Measured with the same method, expected ≥3:1, actual 1.36:1.

### Not done
- Hover border of the unselected chip: measured as oklab and not converted. The frontend figure (2.37 → 2.45) is not re-derived.
- Primary focus outline: covered by the existing `hold-reset.spec.ts` focus-ring test (2 px, 3:1 against page), which passes. Not re-measured numerically here.

## Review Findings
(Filled in by reviewer.)
- Verdict: APPROVE | CHANGES REQUESTED
- Findings:
