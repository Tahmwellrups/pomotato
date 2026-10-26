---
id: 009
slug: dark-mode-toggle
status: draft # draft | in-progress | qa | review | done | blocked
---

# Milestone 4, part 2: the visible light/dark toggle and the `.dark` palette behind it

## Goal
Ship a visible, keyboard-operable light/dark control and the `.dark` palette block it switches to,
such that every surface rendered by `app/`, `components/`, `hooks/` and `widgets/` holds WCAG AA
**in dark as well as in light** — 4.5:1 for body text, 3:1 for large text and for any non-text
colour that carries a control, a control's boundary or a control's state — and such that the
resolved theme is applied **before first paint**, so a dark-theme user never sees a cream flash.

This is `docs/PLAN.md` milestone 4's sub-item **"Visible light/dark toggle"**. It is milestone work,
not maintenance and not polish.

## Provenance, and one owner decision that is settled

**Owner ask, taken ahead of its queue position.** 007's Review Findings (R-1) and `docs/PLAN.md`'s
milestone-4 caveat both say the `outline`-variant contrast pass should land as its own small task
*before* the toggle. The orchestrator recommended that. **The owner chose to go straight at the
toggle instead. That is settled; do not re-litigate it, in this file or in any report.**

**The consequence, which is the whole reason this task is larger than its title:** the work that was
meant to land in front of it now lands inside it. 007's reviewer named the cost precisely — folding
R-1 in "forces the dark task to re-measure light as well as dark". So this task measures both
themes, and the "Absorbed from 007's review" section below is not optional context, it is scope.
Frontend must not discover any of it mid-implementation.

Two consequences worth stating plainly so nobody is surprised later:

- **This is not a zero-visual-change task in light either.** R-1, R-6 and R-5 each change something
  visible on the cream theme. Each is enumerated below and each needs a before/after painted
  measurement, the same treatment 007 gave its three deliberate changes.
- **Any pair that is already failing in light and that this task touches gets fixed, not preserved.**
  006's criterion 14 is the precedent for why that rule exists.

### For the orchestrator (this task may not edit either file)
- `docs/PLAN.md`, milestone 4: add `([docs/tasks/009-dark-mode-toggle.md](tasks/009-dark-mode-toggle.md))`
  to the **"Visible light/dark toggle"** line, and amend the **caveat on the first sub-item** — it
  currently says the four boundaries "need their own pass before the toggle", which the owner has
  overruled. It should say the pass was folded into 009 by owner decision.
- `docs/DECISIONS.md`: a dated entry recording (a) the owner's decision to take the toggle ahead of
  the standalone R-1 pass and the re-measure-light cost that buys, and (b) the storage home for the
  theme preference, which criterion 1 requires backend to draft. 008's criterion 1 entry effectively
  lands here instead, because this task is the one that introduces the preference store.

## Pipeline — **backend → frontend → qa → reviewer**

Backend runs **first and alone**. Frontend does not start until the preference module and its
`docs/DECISIONS.md` draft exist.

**Why, given that the theme has to be readable synchronously:** the synchronous requirement rules
out *Dexie*, not *backend*. Deciding where a persisted preference lives, naming its key, versioning
it, and writing the validation that rejects a malformed stored value is exactly the backend role's
job under CLAUDE.md, and the data shape here is genuinely undecided — nothing like a user preference
exists in the repo today.

The decisive argument is collision, not rigour: `docs/tasks/008-settings-gauge-style.md` plans a
**backend-owned preference module** for the gauge style, and its own Data-shape section already
names the theme as the preference that should drive the choice of home ("Since this store holds the
theme next, picking the wrong home now is expensive later"). If 009 invents a frontend-only theme
persistence, the repo ends up with two competing preference systems and 008 either duplicates or
migrates. **009 builds the shared module; 008 adds a key to it.** That makes 009 the task that
answers 008's criterion 1, and 008 inherits the answer rather than re-deciding it.

Backend and frontend may **not** run in parallel: frontend's control reads the shape backend
defines, and the pre-hydration script shares a resolver with the store (criterion 7).

**Backend's remit is the preference only.** The `.dark` block, every token value, every component
class and the control itself are frontend's. If backend finds itself in `app/globals.css` or any
`.tsx`, the scope was wrong: stop and report.

## Decisions this task settles (scoping calls, made here, overturnable by the owner before frontend starts)

### 1. Three states: `light` / `dark` / `system`, defaulting to `system`
Not a two-state boolean. Three reasons:

1. **The repo already listens for the OS signal.** `hooks/use-resolved-tokens.ts:16-17` subscribes to
   `(prefers-color-scheme: dark)` and `hooks/use-media-query.ts` exists for exactly this. A
   two-state design makes that subscription permanently dead code.
2. **A boolean has no way back to the OS.** DESIGN.md's reason for dark mode is "she studies at
   night too" — which is a *time-of-day* behaviour, and the OS already schedules it. With a boolean,
   one tap at 11pm pins the app to dark for the next morning, with no way to re-follow the OS short
   of clearing storage.
3. **The persisted shape is the expensive half.** 008 inherits it. Widening a stored boolean to a
   three-value enum later is a migration; starting as an enum costs nothing now.

Cost, accepted: the control has three positions, not two, and `system` means the painted theme is a
function of *two* inputs (stored value and media query), so criteria 10 and 41 have to cover the
cross-product. The control shape is cheap because the repo already has the pattern — native radios
inside a `<fieldset>` with `sr-only` inputs and a `cva` variant on the labels
(`components/ModeSelector.tsx` + `components/ui/mode-chip.tsx`).

`docs/PLAN.md` says "toggle"; three states is still a visible light/dark control plus an honest
default. Q1 if the owner disagrees.

### 2. The class goes on `<html>`, set before first paint
`app/globals.css:5` already declares `@custom-variant dark (&:is(.dark *))`. That variant matches
**descendants** of `.dark`, so the class belongs on `<html>` with `<body>` and everything under it
inheriting — putting it on `<body>` would leave `<body>`'s own rule (`app/globals.css:137-141`,
which sets `background` and `color` directly, not through a utility) outside the match.

A class applied after hydration produces a visible cream flash on every load for a dark user.
**The resolved theme must be in the first painted frame**, which in practice means a small inline
script in `app/layout.tsx` ahead of the app, plus `suppressHydrationWarning` on `<html>` because the
server cannot know the stored value. That is a real cost and criterion 7 exists so the script and
the store cannot drift apart. **Per `AGENTS.md`, this Next.js version differs from training data:
frontend reads the relevant guide under `node_modules/next/dist/docs/` before touching
`app/layout.tsx`.** `app/layout.tsx:34` uses the typed `LayoutProps<"/">` signature and builds
`<html>`'s `className` from four `next/font` variables; both survive.

### 3. The dark palette's values are **derived and measured by the implementer against stated floors**, not fixed here
DESIGN.md reserves palette direction to the owner ("keep the cream direction — it suits the potato
name"), and the PM does not invent brand colours. So this file gives **constraints and required
measurements**, not hex values:

- The dark ground stays in the same **warm** family as the cream light theme (a warm dark brown /
  deep umber direction), not a neutral black or a blue-grey. It is the same product.
- Every floor in section B is a hard floor, measured painted.
- Several tokens are **constrained from below by values this task may not change** — the eight task
  swatches in `components/task-palette-colors.ts` are owner palette data, contrast-checked, and the
  `.dark` block does not get to move them (criterion 19). An arithmetic sanity check, flagged as
  arithmetic: potato brown `#8a5a2b` needs a ground at or below roughly 0.010 relative luminance to
  clear 3:1, and a naive inversion that makes `--card` the current `--foreground` `#2b2017`
  (luminance ≈ 0.016) lands near **2.7:1**. So the dark ground is probably *darker* than the obvious
  inversion. Treat that number as a warning to measure early, not as a value to adopt.

If a floor genuinely cannot be met without changing a swatch value or breaking a text pair, **stop
and raise it** (criterion 19) rather than shipping a failing surface or inventing a new swatch.

### 4. The control lives in `widgets/HeaderNav.tsx`, one instance only
`widgets/HeaderNav.tsx` currently holds only the wordmark and is rendered by `app/page.tsx:9`.
Chosen over `widgets/BottomControls.tsx` because:

- `BottomControls` is `fixed` at bottom-right and already holds two controls, with `app/page.tsx:8`
  carrying matching `pb-28` padding — the comment at `widgets/BottomControls.tsx:5-7` says the two
  have to move together. Adding a third 44 px control there widens a floating cluster over content
  at 320 px, which is the layout the mobile skill warns about.
- The header row is a wordmark alone with the whole right side empty, so a theme control costs no
  new row and no new padding contract.
- A theme control is an app-level affordance; the header is where one conventionally sits.

**One instance ships.** `/stats` (`app/stats/page.tsx`) does not render `HeaderNav`, so `/stats`
inherits the theme but has no control. Do not add a second copy to keep in sync —
`docs/tasks/008-settings-gauge-style.md` will **move or mirror** this control onto the settings
surface, and two hand-placed instances now makes that harder, not easier.

### 5. The three carried-over findings (R-9, R-5, R-8) — in or out, with reasons

| Finding | Call | Owner | Why |
|---|---|---|---|
| **R-9** — third blind palette regex, `components/TimerGauge.tokens.test.ts:15` | **IN** | **qa** | QA is writing dark gauge-contrast tests in that area anyway, and all four files the blind regex guards are already covered by the discovery-driven guard, so deleting it removes a decoy without reducing coverage. Leaving it means a fourth task carries it. Bounded: delete the `RAW_PALETTE_UTILITY` const and the two `it()` blocks that use it; keep `HEX_LITERAL`, `RGB_LITERAL` and `TIMER_SOURCE`. |
| **R-5** — pinned Pin button lost its hover state, `components/TaskRow.tsx:35` | **IN** | frontend | Hover is a control affordance that has to be re-measured per theme regardless, so the file's hover siblings are already being measured; the reviewer supplied the exact one-line fix. Out would mean opening `TaskRow.tsx` a third time for one line. It is a visible light-theme change, so it gets the deliberate-change treatment (criteria 29, 41). |
| **R-8** — three one-word widenings to `components/palette.tokens.test.ts` | **IN** | **qa** (test-file territory) | Two of the three protect *this* task directly: the inline-style block iterating `TASK_007_FILES` instead of `FILES` means a **new** component — which this task adds — can carry `style={{ backgroundColor: "..." }}` and be caught by nothing, and `text-shadow-*` is absent from `COLOR_UTILITY_PREFIX`. The `SCANNED_DIRS` self-maintaining assertion is in as the cheapest form. |

**R-2 (the 36 px colour swatch) and R-10 (Space Grotesk provenance) are OUT.** R-2 is a sizing change
inside `TaskForm`'s swatch picker with its own test-selector problem, unrelated to theming; R-10 is a
one-line `docs/DECISIONS.md` addition the orchestrator owns. Neither is blocked by this task and
neither blocks it.

### 6. `app/prototype/**` and `components/prototype/**` are excluded from the measurement criteria
`app/prototype/glyph-slosh/page.tsx` is a developer lab, not reachable from `/` and not a shipped
surface. It stays **token-clean** (the repo-wide guard covers it and must keep passing) and must not
crash or render an unreadable page in dark, but it is **not** in the painted sweep and its pairs are
not held to the floors. Saying so here stops a sweep criterion from quietly doubling in size.

---

## Absorbed from 007's Review Findings — scope, not background

### R-1 (must). One line in a generated file makes four interactive boundaries fail in *both* themes
`components/ui/button.tsx:13` — the `outline` variant hardcodes `border-border bg-background`. Every
consumer is born at **1.36:1** on `--background` / **1.43:1** on `--popover`. Live consumers and
hand-written twins:

| Site | Shape |
|---|---|
| `components/ui/dialog.tsx:89-91` | dialog Close, `variant="outline"` |
| `components/TimerControls.tsx:76` | timer Reset, `border border-border` by hand |
| `components/CurrentTaskCard.tsx:32` | Reload on the error path, `border border-border bg-background` — a fill identical to the page plus a 1.36:1 edge |
| `components/StatsViewSwitcher.tsx:41` | unchecked view chips, `border-border bg-card` (its checked branch has `font-semibold`, so this is 1.4.11 only, not 1.4.1) |

The reviewer's warning, verbatim and load-bearing: a `.dark` block that gives `--control-border` a
dark value and stops there leaves these **below 3:1 in both themes** — "the gap survives the thing
that was supposed to close it." Because the owner declined the separate pass, **criteria 23-24 cover
these four in light and in dark.**

`e2e/token-task-surface.spec.ts` already has a `borderAgainst(reading, "ground" | "fill")` helper
(line 44) and `e2e/helpers/painted.ts` exports `readPainted`, `compositeOver`, `contrast`,
`tokenRgb` and `rgbString`. Measure with those; do not write a fourth measurement harness.

### R-1b (must, not in the reviewer's list — found while writing this file)
`components/ui/button.tsx` carries **four pre-existing `dark:` utilities** (lines 7, 13, 17, 19) —
the only `dark:` classes anywhere in `app/`, `components/`, `hooks/` or `widgets/` (grep-verified).
They are shadcn defaults written for shadcn's neutral dark palette and **have never rendered**,
because there has never been a `.dark` class. Adding one activates all of them at once.

The sharpest instance, from reading the class strings: `components/TaskListDialog.tsx:41-44` is the
Tasks trigger. It takes `variant="outline"` and then overrides with `border-none bg-primary
text-primary-foreground hover:bg-primary/80`. The variant's `dark:bg-input/30` and
`dark:hover:bg-input/50` sit in a **different tailwind-merge group** from the unprefixed
`bg-primary` (variant prefix differs), so both survive the merge and the `dark:` pair wins under
`.dark`. **Predicted:** the amber primary pill turns into a translucent input-coloured one the
moment dark mode exists. This is a prediction from class strings, not a measurement — criterion 25
requires it measured painted and resolved either way.

### R-3 (must). `--control-border` is painted on **five** grounds, not the four its comment lists
`app/globals.css:52-61`'s comment names four. The fifth is `--muted`: `components/TaskForm.tsx:169`,
`:189`, `:251` and `components/CustomDurationInput.tsx:62` all carry `border border-control-border`
with `disabled:bg-muted` and **no** `disabled:border-*` override, so the token paints on `--muted`
whenever a field is disabled — which is every running timer, for the custom-duration field. The
reviewer computed it at **3.441:1** in light. Dark re-measures all five, and the comment's ground
table gains its fifth row (criterion 14).

### R-6 (must). A boundary token is doing a fill job, and the reviewer flagged it *for this task by name*
`components/TaskForm.tsx:264` — the disabled submit is filled with `--border` (`disabled:bg-border`).
Correct under 007's criterion 29 (byte-identical to the old `stone-300`, holding the disabled pair
at 1.49:1 where `--muted` would have dropped it to ~1.08:1), and wrong as a semantic. The reviewer:
*"the dark-toggle task introduces a disabled-surface token rather than inheriting the coupling."*
Once `--border` gets a dark value chosen for its boundary job, a disabled submit filled with it
lands anywhere from invisible to oddly bright. Criteria 26 and 30.

### Raw hex in the stylesheet (must)
`app/globals.css:156-159`'s unlayered `:focus-visible` rule hardcodes `outline: 2px solid #b45309`
instead of `var(--ring)`. It is unlayered, so it beats every Tailwind utility in `@layer utilities`
regardless of specificity (007's reviewer confirmed this is still the case) — which means it is the
rule that actually paints almost every focus ring in the app, and a dark palette will not reach any
of them through the token. Parked for milestone 4 by the 2026-10-07 entry in `docs/DECISIONS.md` and
by 006's Q5; **this is milestone 4.** Criterion 27.

One refinement from 007's reviewer: the **mode chips** are the exception — their ring comes from
`peer-focus-visible:outline-ring` on the `<span>` while the unlayered rule hits the `sr-only`
`<input>`, so those two never collide and the chip ring already resolves through the token.

`body { font-family: Arial, Helvetica, sans-serif }` at `app/globals.css:140` is **unrelated. Leave
it.** Same for the `--font-geist` self-reference at line 9 (006's Q2) and `--font-mono` resolving to
Comfortaa (006's Q3) — all three stay open with the owner.

---

## Technical ground truth (verified against the repo; use it rather than re-surveying)

- **Class-based dark is already wired.** `app/globals.css:5`: `@custom-variant dark (&:is(.dark *))`.
- **Every token lives in one `:root` block** (`app/globals.css:14-88`), aliased into Tailwind through
  the second `@theme inline` block (lines 90-135). Tokens needing dark values:
  `--background --foreground --card --card-foreground --popover --popover-foreground --primary
  --primary-foreground --secondary --secondary-foreground --muted --muted-foreground --accent
  --accent-foreground --gauge-liquid --destructive --destructive-foreground --border --input
  --control-border --scrim --ring` plus `--chart-1` … `--chart-5`. The `--sidebar-*` group aliases
  other tokens (lines 80-87) and **keeps doing so** — it must not be given literal dark values.
  `--radius` is not a colour.
- **Three token comments carry explicit instructions to this milestone.** `--control-border`:
  "Milestone 4 MUST give this a value in the .dark block and re-measure it against the dark
  --background, --popover and --card at 3:1". `--muted-foreground`: "Re-check against the dark
  palette in milestone 4". `--popover` and `--scrim` each explain what a dark block must not naively
  inherit — `--popover` is deliberately only 1.05:1 from `--background` so the dialog never relies on
  it alone, and `--scrim` is a token precisely so dark can pick its own instead of inheriting an
  inverted foreground. Criteria 14-17 fold all of these in.
- **`hooks/use-resolved-tokens.ts` was built for this.** It already observes `class`, `style` and
  `data-theme` on `document.documentElement` plus the `prefers-color-scheme` media query, and
  re-reads on every signal. `components/TimerGauge.tsx:31` and `components/TimerControls.tsx:32` are
  its consumers. A `.dark` class on `<html>` is the signal it is waiting for — which is independent
  support for decision 2. Its `getServerSnapshot` returns empty strings so markup matches.
- **`components/task-palette-colors.ts`** holds the eight task swatch hexes as data, exempted in
  `components/palette.tokens.test.ts:62-67` with the note "milestone 4 remaps them per theme", and
  pinned against commit `d7d1bec` by `components/token-foundation.test.ts:57-70`. **This task does
  not remap them** (criterion 19 constrains the ground instead).
- **`components/TaskColorDot.tsx:20`**'s hairline is already
  `border-[color-mix(in_srgb,var(--foreground)_12%,transparent)]` — foreground-derived, so it flips
  with the theme for free. Measure it; do not change it.
- **`components/ui/mode-chip.tsx`** carries the selected/unselected cue as **weight**
  (`font-bold` / `font-normal`) plus `text-accent-foreground` / `text-secondary-foreground`. So
  `--accent-foreground` is painted on `--background` as well as on `--accent`
  (`components/TaskRow.tsx:35`, the pinned action button) — criterion 18.
- **Existing persistence precedent:** `lib/timer/store.ts` — zustand + `persist`, `STORAGE_KEY`
  `"pomotato-timer"`, `STORAGE_VERSION = 2`, a `migrate`, and a strict `merge` that rejects
  malformed persisted data (see its comment at lines 195-202 for why `merge` and not just
  `migrate`). Dexie lives in `lib/db/`, at `CURRENT_SCHEMA_VERSION = 2`.
- **`components/palette.tokens.test.ts`** is the repo-wide guard asserting zero raw Tailwind palette
  classes across `app/`, `components/`, `hooks/`, `widgets/`, with a discovery walk rather than a
  hand-written file list. **Any new file this task adds must satisfy it** — including the `.dark`
  block's own values, which are CSS and therefore outside the guard but inside criterion 11.
- **Baseline handed over by 007:** vitest **475/475** across 14 files, Playwright **323 passed / 2
  skipped / 0 failed**, lint **0 errors / 21 warnings**, typecheck exit 0, `npm run build` exit 0.
  The 2 skips are the owner-parked `e2e/task-list-dialog.spec.ts` tests.
- **DESIGN.md**, binding here: dark mode is required because "she studies at night too"; the cream
  direction stays for light; "accessibility is not negotiable against aesthetics: text contrast
  holds at WCAG AA in **both** light and dark, every control stays keyboard-operable with a visible
  focus state, and motion respects `prefers-reduced-motion`." **A theme transition is motion** —
  criteria 48-49.

## Scope

**In:**
- A persisted theme preference (`light` / `dark` / `system`, default `system`) in a **shared,
  backend-owned preference module** that 008 extends rather than duplicates, plus its
  `docs/DECISIONS.md` draft.
- Resolving and applying the theme **before first paint**, including the inline pre-hydration script
  and `suppressHydrationWarning` that costs.
- One `.dark` block in `app/globals.css` giving every colour token a dark value, with the `:root`
  values left byte-for-byte unchanged.
- One visible, keyboard-operable control in `widgets/HeaderNav.tsx`.
- A painted contrast sweep of every shipped surface in **both** themes, against the floors in
  section B/E.
- The absorbed items above: **R-1**, **R-1b**, **R-3**, **R-6**, the `:focus-visible` hex, **R-5**,
  and (qa-owned) **R-9** and **R-8**.
- `color-scheme` on `:root` per theme, so native UA widgets (the number spinners in
  `CustomDurationInput` / `TaskForm`, scrollbars, native autofill) do not stay light on a dark page.
- A new semantic token where a role genuinely has none — specifically the disabled-surface token
  R-6 asks for — each with the reason comment 007's criterion 18 established.

**Out (do not do here):**
- **Paper grain texture** — milestone 4's third sub-item, its own task.
- **Uploaded backgrounds** — milestone 4's fifth sub-item, its own task.
- **The settings surface** — `docs/tasks/008-settings-gauge-style.md`. No `/settings` route, no
  settings button, no gauge-style preference. This task adds **one** key to the preference module.
- **R-2** (the 36 px swatch target) and **R-10** (Space Grotesk provenance) — see decision 5.
- **Remapping the eight task swatches or the five chart tokens' hues.** `--chart-*` gets dark values
  as tokens; `TASK_COLOR_HEX` is not touched (criterion 19).
- **006's open questions Q1-Q3** (`--gauge-liquid`'s light value, the `--font-geist` self-reference,
  `--font-mono` resolving to Comfortaa). Q5 — the hardcoded focus-ring hex — **is** resolved here;
  the other three stay with the owner.
- Reinstating fills, borders or radii on the mode chips (007 Part 1 settled the flat-text direction),
  or replacing any native radio with an ARIA-constructed widget (2026-10-19 entry in
  `docs/DECISIONS.md`).
- Any new runtime dependency. `next-themes` is **not** installed and is not to be installed —
  CLAUDE.md fixes the stack and says ask first. The pieces (`@custom-variant dark`, zustand
  `persist`, `useSyncExternalStore`, `useMediaQuery`) are already here.
- Any change to timer logic, durations, mode behaviour, the persisted *timer* shape, the gauge's
  geometry, the hold-to-confirm Reset behaviour, task data, or the stats calculations. Colours only.
- Un-skipping the two parked `e2e/task-list-dialog.spec.ts` tests.
- Changing the 21-warning lint baseline, or fixing the dead `TaskColorDot` import in
  `components/CurrentTaskCard.tsx:4`.

---

## Acceptance Criteria

Every contrast figure below is **painted**: read from a real browser's computed styles or painted
pixels, composited over its actual ground, then run through WCAG 2.x. **Arithmetic on token values
is not a measurement** — 005 quoted 5.02:1 and 9.89:1 where painted pixels said 4.72:1 and 7.18:1.
Every ratio in any report must say which ground it was taken against and in which theme.

### A. The preference (backend)
- [ ] 1. `docs/DECISIONS.md` gains a dated entry (drafted by backend; the orchestrator lands it)
      recording: the storage home chosen, the reason, an **explicit answer to the first-paint
      requirement** (a theme that cannot be read synchronously flashes the wrong palette on every
      load), the storage key, the persisted shape, and the statement that **008 adds its gauge-style
      key to this module** rather than creating a second one. If backend rejects localStorage-backed
      zustand `persist`, the entry must answer the first-paint argument rather than ignore it.
- [ ] 2. The preference module exposes, from **one** module, named exports with no `any` and no
      `as never`: the stored enum type, the default, a setter, and a **pure resolver** that maps
      (stored value, OS prefers-dark) → `"light" | "dark"`.
- [ ] 3. The persisted value is the enum `"light" | "dark" | "system"` and nothing else. No colour
      value, no class name, no hex, no component reference is persisted — asserted by a test that
      reads the written storage entry, not by inspection.
- [ ] 4. The entry carries its own storage key (**not** `"pomotato-timer"`), a version constant, a
      `migrate` for older versions and a strict `merge`/validator, in the shape of
      `lib/timer/store.ts`.
- [ ] 5. A malformed, unknown, truncated or wrong-typed stored value (`"Dark"`, `"auto"`, `"{"`,
      `null`, `42`, an empty string) falls back to the default, never throws, never leaves `<html>`
      with a half-applied or duplicated `dark` class, and is **not** written back as if valid. One
      test per listed shape.
- [ ] 6. The value is readable **synchronously** at document start. `git diff --stat` is empty for
      `lib/db/`; the theme is not stored in IndexedDB.
- [ ] 7. The inline pre-hydration script and the store read the **same key** and use the **same
      resolver semantics**, from a single source of truth — a test fails if the key or the accepted
      value set is changed in one place only. (This is the drift that makes hand-written boot
      scripts rot.)
- [ ] 8. **No light flash.** With `dark` stored (and, separately, with `system` stored and the OS
      dark), `document.documentElement.classList.contains("dark")` is already true at the first
      point a test can observe the document, and a first-frame screenshot shows the dark ground —
      not cream-then-dark. QA states the observation point it used.
- [ ] 9. **No React hydration mismatch** on reload of `/` and `/stats`, in each of the three stored
      states × OS light and OS dark × timer idle/running/paused. Checked on the dev server, where
      React reports mismatches; QA asserts zero console messages containing "hydrat".
- [ ] 10. With `system` stored, changing the OS colour scheme flips the painted theme **live, with no
      reload**, and `components/TimerGauge.tsx` and `components/TimerControls.tsx` repaint with it
      (they read tokens through `hooks/use-resolved-tokens.ts`, which already subscribes). With
      `light` or `dark` stored, an OS change does **not** move the theme.

### B. The `.dark` palette
- [ ] 11. `app/globals.css` gains **one** `.dark` block. Every existing `:root` value is byte-for-byte
      unchanged, `@theme inline` mappings are unchanged, and `@custom-variant dark` is unchanged.
      Reviewer verifies by diff; the only `:root` edits permitted are the `--control-border` comment
      (criterion 14) and the `:focus-visible` hex (criterion 27).
- [ ] 12. Every token in the Technical-ground-truth list has a dark value. The `--sidebar-*` group
      still aliases other tokens and is given **no** literal values. A test enumerates the token
      names and asserts each resolves to a different computed value under `.dark` than under `:root`
      (or is explicitly listed as deliberately identical, with a reason).
- [ ] 13. **Paired foregrounds, measured as pairs, in dark, ≥4.5:1:** `--foreground` on
      `--background`; `--card-foreground` on `--card`; `--popover-foreground` on `--popover`;
      `--primary-foreground` on `--primary`; `--secondary-foreground` on `--secondary`;
      `--accent-foreground` on `--accent`; `--destructive-foreground` on `--destructive`;
      `--muted-foreground` on `--muted`.
- [ ] 14. **`--control-border` ≥3:1 in dark on all five grounds** — `--background`, `--card`,
      `--popover`, `--muted` (the disabled field fill, R-3), and the delete-confirm panel tint at
      `components/TaskRow.tsx:172`. The token's comment at `app/globals.css:52-61` is corrected to
      list **five** grounds with their dark figures. Light stays ≥3:1 on all five (R-3's light figure
      for `--muted` is 3.441:1).
- [ ] 15. **The dialog still reads as a surface in dark.** The painted dialog fill vs the painted
      *scrimmed* page behind it reaches ≥3:1, **or** the dialog's edge does. One of the two carries
      it and the measurement names which. (Drop shadows are near-invisible on a dark ground, so the
      light theme's third cue is gone — this is the pair a naive dark block breaks, and `--popover`'s
      own comment says it is deliberately only 1.05:1 from `--background`.)
- [ ] 16. **`--scrim` is given a dark value, not inherited from an inverted `--foreground`.** With the
      task dialog open in dark, the page content behind the scrim is measurably dimmed relative to
      the same content with the dialog closed, and the dialog itself is not dimmed. The reason for
      the chosen value is in the Implementation Notes.
- [ ] 17. **`--muted-foreground` ≥4.5:1 in dark on all four grounds it is painted on** —
      `--background`, `--card`, `--popover`, `--muted` — per its own comment's instruction.
- [ ] 18. **`--accent-foreground` ≥4.5:1 in dark on *both* `--accent` and `--background`.** It is
      painted on the page as the selected mode-chip label (`components/ui/mode-chip.tsx:18`) and on
      `--accent` as the pinned action button label (`components/TaskRow.tsx:35`). A dark value chosen
      for only one of the two fails the other.
- [ ] 19. **The eight task swatches still identify themselves in dark.** Each value in
      `components/task-palette-colors.ts` reaches ≥3:1 against the dark `--card` and the dark
      `--popover`, **with no swatch value changed** — `git diff` for that file is empty and
      `components/token-foundation.test.ts`'s pin against `d7d1bec` still passes. If a floor cannot be
      met by choosing the dark ground, **stop and report**; do not remap a swatch, do not accept a
      failing identification cue, and do not invent a ninth colour.
- [ ] 20. **Charts hold in dark.** Each `--chart-*` reaches ≥3:1 against the dark `--card` where it is
      painted as a bar/line fill, and every axis label, tick, legend and tooltip text on `/stats`
      reaches ≥4.5:1 against the surface it sits on. Measured on real rendered chart elements, not
      on token values.
- [ ] 21. **The timer gauge holds in dark.** The `mm:ss` readout reaches ≥4.5:1 at fill levels 100,
      75, 50, 25 and 0 — on the liquid **and** on the glass, since the waterline crosses the digits.
      The liquid-vs-glass ratio in dark is **no worse than** the measured light figure. (006's Q1 —
      `--gauge-liquid` at 1.56:1 liquid-vs-glass in light — stays open with the owner; this task must
      not make it worse and must not silently "fix" it by changing the light value.)
- [ ] 22. **`color-scheme` is set per theme** on `:root` (or equivalent), so native UA chrome follows:
      the `input[type=number]` spinners in `components/CustomDurationInput.tsx` and
      `components/TaskForm.tsx`, scrollbars, and the default text-selection colours all render dark
      under `.dark`. QA verifies the computed `color-scheme` in both themes and visually confirms the
      spinner is not a light-on-light smudge.

### C. The absorbed boundary and fill fixes
- [ ] 23. **R-1, root cause.** `components/ui/button.tsx:13`'s `outline` variant no longer hands its
      consumers a 1.36:1 boundary in either theme. Whatever the fix is, the file gains the "edited —
      a future `shadcn add` is a conflict" header comment the 2026-10-15 entry in `docs/DECISIONS.md`
      requires, if it does not already carry one.
- [ ] 24. **R-1, the four call sites, measured painted in *both* themes, each ≥3:1 against its own
      ground**, using `borderAgainst()` from `e2e/token-task-surface.spec.ts` and the helpers in
      `e2e/helpers/painted.ts`: `components/ui/dialog.tsx:89-91` (dialog Close, on `--popover`);
      `components/TimerControls.tsx:76` (timer Reset, on `--background`);
      `components/CurrentTaskCard.tsx:32` (Reload on the error path — the error path must actually be
      rendered, not assumed); `components/StatsViewSwitcher.tsx:41` (unchecked view chips, on
      `--card`). Eight measurements, before and after, with the before figures from a checkout of
      HEAD rather than from memory.
- [ ] 25. **R-1b.** Every `dark:` utility currently in `components/ui/button.tsx` (4 occurrences,
      lines 7, 13, 17, 19 — the only ones in the repo) is either measured painted against its real
      dark ground and shown to pass its floor, or removed with a written reason. Specifically:
      `components/TaskListDialog.tsx:41-44`'s Tasks trigger still paints `--primary` as its fill in
      dark, not `--input/30`, and its icon still reaches ≥3:1 against that fill. QA measures the
      painted fill under `.dark` rather than reading the class list.
- [ ] 26. **R-6.** `components/TaskForm.tsx:264`'s disabled submit is filled by a **disabled-surface
      token**, not by `--border`. The token carries the reason comment of 007's criterion 18 (role,
      why no existing token fits, its value in both blocks). The disabled fill vs its surrounding
      surface and the disabled label vs the fill are measured in both themes and are **not worse than
      light's current 1.49:1**; the disabled control stays visibly disabled (WCAG exempts it from
      1.4.3, so it may stay under threshold — it may not become invisible or get worse).
- [ ] 27. **The focus ring flows through the token.** `app/globals.css:156-159` uses `var(--ring)`
      instead of `#b45309`. Light is value-preserving: the painted outline colour on `/` is unchanged
      against HEAD, byte-for-byte. Nothing else about that rule changes (still 2 px, still 2 px
      offset, still unlayered).
- [ ] 28. **Focus is visible on every control in both themes.** For each of: the new theme control,
      each mode chip (checked and unchecked), Start/Pause/Resume, Reset, the custom-duration input,
      the Tasks trigger, the dialog Close, each task-row action button, the task form's fields and
      its submit, each colour swatch, the Stats button, and each `/stats` view chip — a 2 px outline
      at 2 px offset in the computed `--ring`, reaching **≥3:1 against both the control's own fill
      and the surrounding ground**. QA measures width, offset and colour, not just presence.
- [ ] 29. **R-5.** `components/TaskRow.tsx:35`'s `pinnedActionButtonClass` has a hover state again,
      measured in both themes, with the hover border ≥3:1 against the button fill. Recorded as a
      deliberate visible change in light (the pinned button has had no hover feedback since 007).
- [ ] 30. **`--border` is a boundary token only.** No `bg-border`, `disabled:bg-border` or any other
      fill utility derived from `--border` or `--input` survives anywhere in `app/`, `components/`,
      `hooks/` or `widgets/`. Asserted by a test, not by a grep in a report.

### D. The control itself
- [ ] 31. Exactly **one** instance ships, rendered from `widgets/HeaderNav.tsx`. A test asserts there
      is one such control in the document on `/` and none on `/stats`.
- [ ] 32. It is **visible without opening a menu, dialog or settings surface** — present in the
      initial render of `/` at 320 px and at 1280 px, with no scroll and no disclosure needed.
- [ ] 33. It has an accessible name that says what it does, and **its current state is programmatically
      exposed** (a checked radio in a named group, or equivalent) — not conveyed only by which option
      looks different. QA states the exact accessible name of the group and of each option.
- [ ] 34. **The current state is conveyed by a non-colour cue** (WCAG 1.4.1), in both themes. Colour
      alone is not sufficient — this is the exact regression 007 Part 1 was written to fix on the
      mode chips, and a theme control that fails it is self-parodying. QA verifies under a greyscale
      filter, as `e2e/token-chip-cue.spec.ts` already does for the chips.
- [ ] 35. **Keyboard-operable end to end:** reachable by Tab from a cold load without a pointer, the
      group is entered once (native radio behaviour), arrow keys move between options **and change
      the theme**, the change is announced by the control's own semantics, and Escape/Tab leaves
      without stranding focus. No keyboard trap.
- [ ] 36. **Semantic HTML before ARIA.** No `role="radiogroup"`, `role="switch"` or `role="button"`
      constructed out of ARIA where a native element does the job — the 2026-10-19 entry in
      `docs/DECISIONS.md` settled this for the mode chips and the same reasoning applies. If a native
      element genuinely cannot carry the state, Implementation Notes say which and why.
- [ ] 37. Each option's hit target is **≥44 px in both dimensions** at 320 px and 1280 px, measured
      on the element that actually receives the click (the `<label>`, if the input is `sr-only`) —
      007's R-2 is the precedent for a selector that measures the wrong node.
- [ ] 38. **No layout damage.** At 320 px and 1280 px: `document.documentElement.scrollWidth <=
      clientWidth`; the wordmark's bounding box in `widgets/HeaderNav.tsx` is unchanged within 1 px
      against HEAD or moves to a stated new position deliberately; nothing in `app/page.tsx`'s main
      column shifts; the header does not wrap into a second row at 320 px, or wraps deliberately with
      the before/after heights recorded.
- [ ] 39. **axe-core: zero serious or critical violations**, on `/` in **both** themes × 320 px and
      1280 px × timer idle, running, paused and complete; with the task dialog open; with the task
      form in its error state; and on `/stats` in both themes at both viewports.
- [ ] 40. The theme changes **immediately on activation, with no reload and no second click**, and the
      new value survives a reload and a new tab in the same browser.

### E. The sweep — every shipped surface, both themes
- [ ] 41. Implementation Notes carry a **painted contrast table** covering, in **both** themes, at
      minimum: the page ground and body text; `components/CurrentTaskCard.tsx` in its normal, empty
      and error states; `components/ModeSelector.tsx` chips checked and unchecked;
      `components/TimerDisplay.tsx` / `components/TimerGauge.tsx` / `components/SloshGauge.tsx`
      (criterion 21); `components/TimerControls.tsx` primary at rest and on hover, plus Reset;
      `components/CustomDurationInput.tsx` label, field, disabled and error states;
      `components/TaskListDialog.tsx` trigger and `components/ui/dialog.tsx` surface, Close and scrim;
      `components/TaskList.tsx`, `components/TaskRow.tsx` (idle, pinned, drag-active, delete-confirm)
      and `components/TaskColorDot.tsx`; `components/TaskForm.tsx` (fields, invalid, swatches,
      submit enabled and disabled, cancel); `components/StatsButton.tsx`;
      `components/StatsDashboard.tsx`, `components/StatsViewSwitcher.tsx`,
      `components/StatsTables.tsx`, `components/StatsChart.tsx`; and the new theme control. Each row:
      element, theme, ground, measured ratio, threshold, verdict.
- [ ] 42. **No pair in either theme finishes below its threshold** — 4.5:1 body text, 3:1 for text at
      or above 24 px / 18.66 px bold, 3:1 for a non-text colour that is the only carrier of a
      control, its boundary or its state — **unless** the row is explicitly recorded as a deliberate
      exemption with a stated reason, in the shape 007's reviewer accepted for genuinely decorative
      edges (container hairlines, the unchecked swatch trim, the row card border, the confirm-panel
      tint). An exemption must say why the colour is not the carrier, and the carrier it names has to
      exist.
- [ ] 43. **Disabled surfaces are measured in both themes** even though WCAG 1.4.3 exempts them: the
      disabled custom-duration field (running and paused), the three disabled task-form fields, and
      the disabled submit. They may remain under threshold; they may not get worse than their light
      figures and may not become invisible against their surface.
- [ ] 44. **Light is re-measured, not assumed.** Because this task changes `button.tsx`, the focus
      rule, `TaskForm.tsx:264` and `TaskRow.tsx:35`, every pair those touch is measured in light
      before and after, with "before" taken from a HEAD checkout.
- [ ] 45. `app/prototype/**` and `components/prototype/**` are **excluded** from criteria 41-44 by
      decision 6, and the exclusion is stated in the QA Report rather than left as a silent gap. They
      must still pass the palette guard and must still render without error in dark.
- [ ] 46. Every ratio reported states its **theme**, its **ground**, and that it came from painted
      pixels or computed styles — never arithmetic on token values.

### F. Motion
- [ ] 47. If the theme change animates at all, the transition is **disabled under
      `prefers-reduced-motion: reduce`** (DESIGN.md: "motion respects `prefers-reduced-motion`"), and
      a test asserts the computed transition/animation duration is 0 s under that media query.
- [ ] 48. **Nothing animates on load.** A transition on the tokens would otherwise fade the whole page
      from light to dark on every cold load in dark. QA confirms the first painted frame is the final
      theme with no in-flight colour transition (criterion 8's screenshot covers this if taken
      correctly).
- [ ] 49. Existing `motion-reduce:` classes (`components/StatsButton.tsx:12`,
      `components/StatsViewSwitcher.tsx:37`, `components/TaskListDialog.tsx:44`,
      `components/ui/dialog.tsx:81`, `components/ui/mode-chip.tsx:14`'s `transition-colors`) still
      behave as they do today. `e2e/hold-reset.spec.ts`'s and `e2e/hold-label-contrast.spec.ts`'s
      reduced-motion assertions pass unchanged.

### G. Guards and freezes
- [ ] 50. `components/palette.tokens.test.ts` passes, **including** every new file this task adds, and
      `ALLOWED_RAW_UTILITIES` is still empty. No new entry is added to `ALLOWED_LITERALS` — the dark
      values live in CSS, not in TSX.
- [ ] 51. **R-8 (qa).** Three widenings to `components/palette.tokens.test.ts`: the inline-style block
      iterates `FILES`, not `TASK_007_FILES`; `text-shadow` is added to `COLOR_UTILITY_PREFIX`; and
      `SCANNED_DIRS` is asserted to equal the set of top-level directories containing `.tsx` files.
      Each is demonstrated live by break-and-restore, not just added.
- [ ] 52. **R-9 (qa).** `components/TimerGauge.tokens.test.ts`'s blind `RAW_PALETTE_UTILITY` const and
      the two `it()` blocks that use it are deleted; `HEX_LITERAL`, `RGB_LITERAL` and `TIMER_SOURCE`
      stay. QA confirms the four files it guarded are still covered by
      `components/palette.tokens.test.ts` after the deletion.
- [ ] 53. `git diff --stat` is **empty** for: `lib/db/`, `lib/timer/`, `hooks/use-timer-clock.ts`,
      `hooks/use-hydrate-timer-store.ts`, `components/task-palette-colors.ts`,
      `components/TimerDisplay.tsx`, `components/SloshGauge.tsx`, `components/HoldButton.tsx`,
      `components/PomotatoTimer.tsx`, `components/ModeSelector.tsx`, `app/prototype/`,
      `components/prototype/`, `e2e/task-list-dialog.spec.ts`, `docs/PLAN.md` and
      `docs/DECISIONS.md`. Reviewer verifies. (`components/ui/mode-chip.tsx` is **not** frozen —
      criterion 18 may require a dark-specific token there — but any change to it must be justified
      and must not reinstate a fill, border or radius.)
- [ ] 54. `git diff package.json package-lock.json components.json` is **empty**. No new dependency,
      no `next-themes`, no icon-library change.
- [ ] 55. Every new CSS custom property carries a one-line reason comment naming (a) the role, (b) why
      no existing token fits, and (c) its value in **both** `:root` and `.dark`. A new token without
      one is a failure.
- [ ] 56. `components/token-foundation.test.ts`'s existing pins (the eight swatch values against
      `d7d1bec`, the no-`any` check) pass unchanged.

### H. Regression and gates
- [ ] 57. `npm run lint` (0 errors; warnings not above the **21** baseline), `npm run typecheck`,
      `npm run build`, `npm run test` and `npm run test:e2e` all succeed.
- [ ] 58. `npx vitest run` is at least **475/475** plus this task's new tests, with the new count
      stated in the QA Report.
- [ ] 59. Playwright is at least **323 passed / 2 skipped / 0 failed**. The 2 skips stay the two
      owner-parked `e2e/task-list-dialog.spec.ts` tests, assertions untouched. Any existing
      assertion this task invalidates is listed individually with the reason, in the shape of 006's
      `hold-reset.spec.ts` exception — a class-name assertion that this task's diff makes false is a
      justified change; a *painted-value* assertion that now fails is a defect, not a stale test.
- [ ] 60. **Zero console errors or warnings** in **both** themes, at 320 px and 1280 px, across: load,
      toggle to each of the three states, start, pause, resume, Reset hold, completion, mode switch,
      a valid and an invalid custom-duration edit, open and close the task dialog, add/pin/edit/
      delete a task, navigate to `/stats` and back, and reload. Capture starts before `goto`.
- [ ] 61. **Timer behaviour is untouched**: remaining time still derived from the stored end
      timestamp, no new `setInterval` / `setTimeout` / `requestAnimationFrame` / `performance.now` in
      the diff, retroactive completion after a closed tab still works, and the timer survives a theme
      change mid-session (start a timer, change theme, confirm the remaining time has not jumped).
      `e2e/timer.spec.ts`, `e2e/timer-gauge.spec.ts`, `e2e/hold-reset.spec.ts`,
      `e2e/hold-label-contrast.spec.ts`, `e2e/sessions.spec.ts` pass.
- [ ] 62. No `any`, no `as never`, no non-null assertion introduced. Functional components with named
      exports throughout; no `export default` in any new component.
- [ ] 63. **New tests cannot pass vacuously** — none of the four shapes recorded in the 2026-10-09 and
      2026-10-15 entries in `docs/DECISIONS.md` (an assertion inside `try`/`if`/`else`, an observer
      that may never attach, a `toBeVisible()` on something already true, a test with zero
      assertions). Note the specific trap here: a painted-colour helper that **throws** on
      `rgba(0, 0, 0, 0)` — 007 found four "passing" tests that never reached an assertion for exactly
      that reason.
- [ ] 64. **Break-and-restore**, hash-verified against the real file, recorded in the QA Report per
      the 2026-10-07 standing-practice entry, for at least five criteria: the no-flash guarantee (8),
      the malformed-value fallback (5), one `--control-border` dark ground (14), one R-1 call-site
      boundary (24), and the control's non-colour state cue (34).
- [ ] 65. Implementation Notes carry, **before QA starts**: the full dark token table with its reason
      for each value, the painted contrast table (41), every deliberate visible change in light
      listed explicitly, the new disabled-surface token's reason, the resolution of R-1b, which
      `node_modules/next/dist/docs/` guide was read before editing `app/layout.tsx`, and anything
      that could not be done with the reason.

---

## Files likely touched
- **Backend:** a new module under `lib/` for the preference store (path is backend's call;
  `lib/preferences/` is the obvious one — **the same module 008 extends**). A draft `docs/DECISIONS.md`
  entry handed to the orchestrator.
- `app/globals.css` (frontend) — the `.dark` block, the `--control-border` comment's fifth ground,
  `var(--ring)` in `:focus-visible`, `color-scheme`, and any new token.
- `app/layout.tsx` (frontend) — the pre-hydration script and `suppressHydrationWarning`. Read the
  relevant `node_modules/next/dist/docs/` guide first.
- `widgets/HeaderNav.tsx` (frontend) — the control's home.
- A new component for the control (frontend) — `components/` or `components/ui/`, frontend's call,
  stated in Implementation Notes. Named export, must satisfy `components/palette.tokens.test.ts`.
- `components/ui/button.tsx` (frontend) — R-1 and R-1b. Needs the "edited" header comment.
- `components/TaskForm.tsx` (frontend) — R-6, line 264 only.
- `components/TaskRow.tsx` (frontend) — R-5, line 35 only.
- `components/TimerControls.tsx`, `components/CurrentTaskCard.tsx`, `components/StatsViewSwitcher.tsx`,
  `components/ui/dialog.tsx` (frontend) — R-1's four call sites, boundary colours only.
- `components/palette.tokens.test.ts`, `components/TimerGauge.tokens.test.ts`, `e2e/**` (**qa only**)
  — R-8, R-9, and the dark/light measurement suites. Reuse `e2e/helpers/painted.ts` and
  `borderAgainst()`.
- **Not touched:** everything frozen by criterion 53.

## Owner answers — ASKED AND ANSWERED 2026-10-23. Do not re-ask.
The orchestrator put all five of pm's open questions to the owner before backend started. Four came
back answered; the fifth keeps its default. **These are settled. Read them as decisions.**

1. **Three states — CONFIRMED.** `light` / `dark` / `system`, defaulting to `system`, exactly as
   decision 1 proposed. The owner was shown the cost (the painted theme becomes a function of two
   inputs, so the sweep covers a cross-product) and took it. The persisted shape is now fixed, and
   008 inherits it. Backend builds to this.
2. **The dark palette's hues — FRONTEND PROPOSES, OWNER APPROVES.** The owner declined to supply
   anchors up front and chose the derive-against-floors path of decision 3. So frontend derives a
   warm dark family against the floors in criteria 11-22 and **fills in the measured table**, and the
   owner reviews it. Two things follow: frontend must not treat its own palette as approved — the
   measured table is a proposal — and criterion 19's stop-and-raise still stands if the task swatches
   cannot clear 3:1 against the proposed ground.
3. **The control's shape and label — NOT ASKED, default stands.** Three-option chip group matching
   the mode chips; "Theme" as the group label, "Light / Dark / System" as the options. The
   orchestrator judged this the lowest-stakes of the five and left it to the default rather than
   spend an owner question on it. Criteria 31-40 are unchanged. If frontend finds the chip group
   genuinely wrong for the header row, raise it — do not silently substitute an icon-only control.
4. **`--gauge-liquid` — NOW IN SCOPE. Re-point `#f6c453` to `#d97706`.** The owner answered 006's Q1
   in this task's favour: the current value's 1.56:1 liquid-vs-glass fails the 3:1 non-text
   threshold, `#d97706` measures 3.07:1 with 4.99:1 for the `mm:ss`, and the owner accepted the
   purely aesthetic cost (deeper amber instead of pale yellow). This is a **one-value edit to
   `app/globals.css`'s `:root`**, and it is a deliberate visible light-theme change — it goes on the
   Implementation Notes list of those. Criterion 21 no longer merely forbids making dark worse: the
   light value must be `#d97706`, re-measured painted at both thresholds, and the dark value chosen
   against the corrected light one. **Closes 006's Q1** — note that in this task's closeout.
5. **R-4 — NOW IN SCOPE. Restore the red prompt as `text-destructive`.** The owner wants the
   delete-confirm panel reading like a warning again. `components/TaskRow.tsx:175` goes from
   `text-foreground` back to a destructive-token prompt; the reviewer measured `text-destructive` on
   the new peach tint at 5.373:1, which clears AA, so **the tint does not change** — do not revert
   `components/TaskRow.tsx:172` to `bg-red-50`. Re-measure painted in both themes, and pick the
   panel's dark tint with the red prompt on it rather than against `text-foreground`. Also a
   deliberate visible light-theme change. **Closes 007's R-4.**

### Consequences for the criteria, since two items joined scope after they were numbered
Criteria 21 and 29 are the ones affected; the `--gauge-liquid` and `TaskRow` prompt changes above
override anything in the numbered list that says those two are out of scope or untouched. Both are
one-value edits with a measurement attached, and neither adds a new file. QA should treat them as
two additional criteria rather than hunting for a renumbering.

## Risks
- **Scope. This is the largest task in the repo so far, and it got that way by owner decision.** It
  carries a persistence layer, a palette, a new control, and four absorbed findings, and it must
  measure every surface twice. The mitigation is the pipeline: backend finishes and hands over a
  shape before frontend writes a line, and frontend fills the measurement tables (criterion 65)
  before QA starts rather than after.
- **The naive dark block is a trap with four named doors.** `--control-border` with a dark value and
  nothing else (R-1); `--accent` and `--accent-foreground` chosen as a pair but `--accent-foreground`
  also painting on the page (criterion 18); `--popover` inheriting its 1.05:1 relationship into a
  theme where shadows do not read (criterion 15); `--scrim` inheriting an inverted foreground
  (criterion 16). Each is an explicit criterion because each one looks fine in a screenshot.
- **The eight task swatches constrain the dark ground from below**, and they are owner data this task
  may not change. If the ground has to go darker than the warm-brown direction wants in order to
  clear 3:1, that is a real conflict between DESIGN.md's palette direction and its
  accessibility-is-not-negotiable clause — raise it, do not resolve it silently (criterion 19).
- **The pre-hydration script is the classic source of a hydration mismatch and of drift.** Two
  failure modes: the server renders without the class and the client adds it (criterion 9's
  `suppressHydrationWarning`), and the script's hardcoded key drifts from the store's key six months
  later (criterion 7).
- **`tailwind-merge` does not dedupe across variant prefixes**, which is what makes R-1b real: an
  unprefixed `bg-primary` and a `dark:bg-input/30` both survive the merge and the `dark:` one wins
  under `.dark`. Expect more instances than the one predicted; criterion 25 is the sweep.
- **Measurement by arithmetic is not measurement.** 005 quoted token-derived 5.02:1 and 9.89:1 where
  painted pixels said 4.72:1 and 7.18:1. Alpha tokens (`--scrim`), `color-mix()` values and OKLCH
  palette conversions all diverge from naive arithmetic.
- **Editing shadcn-generated source.** R-1 and R-1b are both in `components/ui/button.tsx`; a future
  `shadcn add button` will offer to overwrite it and will look routine. The header comment required
  by criterion 23 and the 2026-10-15 entry in `docs/DECISIONS.md` is the mitigation.
- **Accessibility is the deliverable, not a check at the end.** A theme control that conveys its own
  state by colour alone (criterion 34) would be the same 1.4.1 failure 007 Part 1 existed to fix, on
  the control whose entire job is colour.
- **Licensing:** no audio, fonts, images or binaries are added. If any appear they must be original
  or CC0 with provenance in `docs/DECISIONS.md`. No icon is copied from another product; if the
  control uses an icon it comes from a dependency already installed, or is drawn as original SVG.
- **Performance:** a `MutationObserver` on `<html>` already exists (`hooks/use-resolved-tokens.ts`);
  do not add a second theme subscription per component. The inline script must stay small — it runs
  before anything else paints.
- **Next.js version:** per `AGENTS.md`, this version has breaking changes relative to training data.
  Frontend reads the relevant guide under `node_modules/next/dist/docs/` **before** touching
  `app/layout.tsx`, and criterion 65 asks which guide.
- **antislop: the mode is already resolved as `during (session override)` for this session. Do not
  re-ask.** The work is UI, copy and accessibility, so frontend reads
  `.claude/skills/antislop/SKILL.md`, `.claude/skills/antislop-ui/SKILL.md` and
  `.claude/skills/antislop-human/SKILL.md` (contrast, keyboard, focus), announces
  `antislop active: during (session override).` before its first UI edit, and runs the Delivery Gate
  before handing over. `.claude/skills/antislop-layoutmobile/SKILL.md` applies to criterion 38 (the
  header at 320 px) and `.claude/skills/antislop-copywriting/SKILL.md` to the control's labels
  (question 3).

## Implementation Notes
(Filled in by backend, then frontend, as they build. Criterion 65 lists what must be here before qa
starts.)

### Backend: the preference module (`lib/preferences/`)

Files: `schema.ts` (types, key, version, defaults, validator, resolver, class helper), `boot-script.ts`
(inline script source), `store.ts` (zustand + `persist`), `index.ts` (re-exports all three). `lib/db/`
is untouched.

**Public surface**
- Types: `ThemePreference` (`"light" | "dark" | "system"`), `ResolvedTheme` (`"light" | "dark"`),
  `Preferences` (`{ theme: ThemePreference }`), `PreferencesStore`.
- Constants: `THEME_VALUES`, `DEFAULT_THEME` (`"system"`), `PREFERENCE_DEFAULTS`, `PREFERENCE_VALUES`,
  `PREFERENCES_STORAGE_KEY` (`"pomotato-preferences"`), `PREFERENCES_VERSION` (1), `DARK_CLASS` (`"dark"`),
  `THEME_BOOT_SCRIPT` (string).
- Functions: `resolveTheme(preference, osPrefersDark): ResolvedTheme` (pure),
  `applyResolvedTheme(root, resolved)` (idempotent, `classList.toggle("dark", force)`),
  `sanitizePreferences(raw: unknown): Preferences` (per-key fallback, never throws),
  `isPreferences`, `migratePreferences`.
- Store: `usePreferencesStore` with `theme`, `hasHydrated`, `setTheme(theme)`, `setHasHydrated`.

**Persisted shape.** localStorage key `pomotato-preferences`, value
`{"state":{"theme":"light"|"dark"|"system"},"version":1}`. Only the enum is persisted (`partialize`);
`hasHydrated` is not. No colour, class name or component reference is ever written.

**Adding a key (008).** Add the field to `Preferences`, a default to `PREFERENCE_DEFAULTS`, its value list to
`PREFERENCE_VALUES`, one `pick(...)` line in `sanitizePreferences`, one line in `partialize`, and a setter in
`store.ts`. The validator, migrate, merge and persisted envelope do not change.

**Frontend consumption**
- Store (client): call `usePreferencesStore.persist.rehydrate()` once after mount (same pattern as
  `hooks/use-hydrate-timer-store.ts`; `skipHydration: true`, so the first client render is the server default
  `system` and matches the server markup). Read `theme` and `hasHydrated`. The control should not show a
  checked option before `hasHydrated`, or should accept that it briefly shows `system`.
- Painted theme (client): `const resolved = resolveTheme(theme, osPrefersDark)` with `osPrefersDark` from
  `hooks/use-media-query.ts` on `(prefers-color-scheme: dark)`, then
  `applyResolvedTheme(document.documentElement, resolved)` in an effect. Until `hasHydrated`, do not apply
  anything: the boot script has already set the class, and applying the default `system` early could
  contradict a stored `dark`.
- Pre-hydration (server component `app/layout.tsx`): import `THEME_BOOT_SCRIPT` from
  `@/lib/preferences/boot-script` (leaf module, does not pull in the store), render it as an inline
  `<script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />` as the first child of `<head>`, and set
  `suppressHydrationWarning` on `<html>`. The script is built from the same constants as the store, so the key,
  value set, default and class name cannot drift; its branching mirrors `resolveTheme`.
- The script does not set `color-scheme`; that is CSS (criterion 22) keyed off `.dark`.

**Drift test qa should write (criterion 7).** Evaluate `THEME_BOOT_SCRIPT` in jsdom with a stubbed
`localStorage`/`matchMedia` across every stored value (including the malformed shapes of criterion 5) x OS
light/dark, and assert the resulting `dark` class equals `resolveTheme(sanitize(stored), os) === "dark"`. I ran
that cross-product by hand against the script text (16 cases, all agreed); it is not a committed test.
Criterion 3: read the written `localStorage` entry after `setTheme` and assert the exact envelope above.
Criterion 5: set each bad value raw, call `rehydrate()`, assert `theme === "system"`, no throw, and that the raw
entry is unchanged (persist writes only on a state change or on a version-mismatch migration; a
version-mismatched malformed entry is migrated to the default and rewritten as a valid `system`, which is a
migration, not a malformed value kept as valid).

**Criterion 6.** `git diff --stat lib/db/` is empty.

### Backend: DECISIONS.md draft (criterion 1; orchestrator lands it)

> **2026-10-23, theme preference storage (task 009; also answers 008 criterion 1).** The theme preference
> (`light` | `dark` | `system`, default `system`) is stored in **localStorage through zustand `persist`**, in a
> new shared module `lib/preferences/`, under the key `pomotato-preferences`, as
> `{"state":{"theme":...},"version":1}`. Dexie/IndexedDB was rejected: its reads are asynchronous, so the stored
> theme cannot be known when the first frame paints, and a dark-theme user would see the cream palette flash on
> every load. localStorage is synchronous, so a small inline script in `app/layout.tsx` reads it and sets
> `.dark` on `<html>` before first paint; the script is generated from the same constants the store uses
> (`THEME_BOOT_SCRIPT`), so key, accepted values and default cannot drift. The store rehydrates manually after
> mount (`skipHydration`) so server and first client render agree. Only the enum is persisted. A malformed or
> unknown stored value falls back to `system` per key and is not written back. The module is deliberately
> shared: **008 adds its gauge-style key to it** and does not create a second preference system. Cost accepted:
> `<html>` needs `suppressHydrationWarning`, and the painted theme is a function of two inputs (stored value and
> `prefers-color-scheme`).

### Backend: criteria status
Met by implementation: 1 (draft above), 2, 3 (needs qa's storage-read test), 4, 5 (needs qa's per-shape tests),
6, 7 (single source in code; qa's drift test required). Not backend's, depend on frontend wiring: 8, 9, 10.
Nothing in 1-10 could not be met. Gates: `npm run lint` 0 errors / 21 warnings (baseline), `npm run typecheck`
clean. I did not run vitest or Playwright; no existing file was changed.

### Frontend: implementation notes (task 009, criteria 11-65)

**The dark palette is a PROPOSAL, not approved (owner answer 2).** Warm umber family, derived against the floors, measured painted. It waits for the owner.

**Scratch evidence.** Every figure below was read from painted pixels by an uncommitted, throwaway Playwright script (canvas compositing over the real ancestor ground, same method as `e2e/helpers/painted.ts`) against `npm run dev`. The script is not committed and is not evidence qa can cite; qa re-measures. "Before" figures are from a `git archive HEAD` copy served on a second port, not from memory.

**Files.** New: `components/ThemeControl.tsx`, `components/ThemeSync.tsx`, `hooks/use-theme-sync.ts`. Edited: `app/globals.css`, `app/layout.tsx`, `widgets/HeaderNav.tsx`, `components/ui/button.tsx`, `components/ui/dialog.tsx`, `components/ui/mode-chip.tsx`, `components/TimerControls.tsx`, `components/CurrentTaskCard.tsx`, `components/StatsViewSwitcher.tsx`, `components/TaskListDialog.tsx`, `components/TaskForm.tsx` (line 264 only), `components/TaskRow.tsx` (the `:35` and `:175` lines only). Nothing in `lib/`, `app/api/`, `e2e/` or `docs/` (apart from this section) was touched.

**Next.js guide read before editing `app/layout.tsx`:** `node_modules/next/dist/docs/01-app/02-guides/preventing-flash-before-hydration.md` (the "Themes" section: inline `<script>` in `<head>`, `suppressHydrationWarning` on `<html>`), plus `01-app/01-getting-started/03-layouts-and-pages.md` for the root-layout contract. `THEME_BOOT_SCRIPT` is imported from `@/lib/preferences/boot-script` (the leaf), not the index, so zustand is not on the boot path.

**How the theme is applied.** The boot script sets `.dark` on `<html>` before first paint. `ThemeSync` (rendered once in the root layout, so `/stats` follows too) rehydrates the preferences store in a layout effect and, only once `hasHydrated`, applies `resolveTheme(theme, osPrefersDark)` with `applyResolvedTheme`. Deviation from the hand-off, on purpose: the effect resolves with `window.matchMedia(...).matches` read live, and uses `useMediaQuery`'s value only as the trigger to re-run. The hook returns its server snapshot (`false`) during the hydration commit, and resolving with it could paint `light` for a frame on a dark OS. No timers, no rAF.

**Control.** `components/ThemeControl.tsx`: native radios in a `<fieldset>` with an `sr-only` `<legend>Theme</legend>`, options Light / Dark / System, using `modeChipVariants` (checked = bold, so the cue survives greyscale). One instance, rendered from `widgets/HeaderNav.tsx`; `/stats` has none. Before `hasHydrated` it shows `system` checked. Not an ARIA widget; no `role` attributes. Label boxes (the click target) are 60.5 / 54.7 / 75.2 x 44 px at both 320 and 1280. Group accessible name: "Theme"; option names: "Light", "Dark", "System". It is the first Tab stop on a cold load; arrow keys move and change the theme. The chip group fits the header at 1280. At 320 it does not fit beside the wordmark (163.7 + 199 px of chips > 288 px), so the header wraps deliberately: header height 40 -> 80 px at 320 (the timer moves down 40 px), unchanged at 1280. At 1280 the wordmark box is unchanged (x48 y48 163.7x40), header height 40 px, nothing in the main column shifts (`-my-0.5` on the fieldset keeps the 44 px target from growing the 40 px row). `scrollWidth == clientWidth` at both widths. I did not substitute an icon control.

**Motion.** The theme change adds no transition of its own and nothing animates on load (first frame with a document is already dark; the class is set by the script before style calc). Elements that already carry `transition-colors` would fade on a switch, so `components/ui/mode-chip.tsx` gained `motion-reduce:transition-none motion-reduce:duration-0` (computed duration 0s under reduce, verified). Not done: `components/TaskForm.tsx:219` swatch `transition-shadow` has no opt-out and its ring colour flips with the theme (outside the "line 264 only" remit); `components/HoldButton.tsx` (frozen) transitions `background-color` 160 ms. Both are noted for the orchestrator. Criterion 49 says mode-chip's transition-colors must "behave as today"; criterion 47 says a theme-change transition must be 0s under reduce. They conflict for that one class; I chose 47 and flag it.

### Dark token table (proposal) with reasons

All in the one `.dark` block of `app/globals.css`. Pairs painted in dark; "vs" names the ground.

| Token | `:root` (unchanged) | `.dark` | Reason |
|---|---|---|---|
| `--background`, `--card` | #fbf4ea | #1c140e | Ground capped at L 0.0078 by the swatch floor (below). Warm umber, hue ~28 deg. |
| `--popover` | #fffaf3 | #1e1610 | The highest the swatches allow (potato 3.04:1). Only 1.02:1 from `--background`, so `--dialog-edge` separates the dialog. |
| `--foreground`, `--card-foreground`, `--popover-foreground` | #2b2017 | #f5ebdc | Cream, 15.40:1 vs background, 15.12:1 vs popover. |
| `--primary`, `--ring` | #b45309 | #f0a550 | Light amber: it is text (wordmark 8.83:1, stats link) and an outline (8.83:1 vs ground) as well as a fill. |
| `--primary-foreground` | #ffffff | #1c140e | 8.83:1 on `--primary`. |
| `--secondary` / `-foreground` | #f5f5f4 / #44403c | #2b2118 / #e2d5c2 | 10.90:1 on secondary, 12.57:1 on background (unchecked mode chip). |
| `--muted` / `-foreground` | #f5f5f4 / #57534e | #251c14 / #c2b19b | Muted text 8.70 background and card, 8.54 popover, 8.01 muted. |
| `--accent` / `-foreground` | #fef3c7 / #78350f | #3d2b14 / #fbd592 | Painted on both grounds: 9.67:1 on accent, 13.01:1 on background. |
| `--destructive` / `-foreground` | #b91c1c / #ffffff | #f58b79 / #1c140e | Light salmon because it is text (errors 7.66:1, prompt 7.02:1 on the tint); label 8.79:1 on the Delete fill. |
| `--border`, `--input` | #d6d3d1 | #3b2f25 | Decorative hairline, 1.40:1 vs ground (light 1.36:1). |
| `--control-border` | #88837e | #80705d | 3.80 background and card, 3.73 popover, 3.50 muted, 3.48 delete tint (and 3.29 on `--secondary`). |
| `--scrim` | rgb(43 32 23 / .45) | rgb(8 5 3 / .62) | Dims the page (28,20,14 -> 15,10,7). An inverted foreground would be a cream veil that lifts it. |
| `--gauge-liquid` | **#d97706 (was #f6c453)** | #9d570d | See gauge row below. |
| `--chart-1..5` | tokens as before | #c4915a #f0705a #5fc08c #5fa8dc #a58fd8 | Lightened so bars hold on the dark card (chart-1 6.53:1). Hues not remapped. |
| `--dialog-edge` (new) | `var(--border)` | #80705d | See "new tokens". |
| `--disabled-surface` (new) | #d6d3d1 | #4a3d32 | See "new tokens". |
| `--sidebar-*` | aliases | aliases | Unchanged, no literal. |
| `color-scheme` | `light` (added to `:root`) | `dark` | Native spinners/scrollbars. Computed value verified `light` / `dark`. |

**Where warm direction and the floors fought.** They did not make it impossible, but they did decide it. The eight swatches are owner data, so criterion 19's arithmetic bound is real: potato `#8a5a2b` and slate `#5b6672` need a ground at or below L 0.0096. Painted swatch vs dark `--card` (28,20,14): potato 3.10, tomato 3.41, mint 5.29, sky 4.20, lavender 3.54, sunflower 3.49, blush 4.29, slate 3.10. Vs `--popover` (30,22,16, arithmetic from the same pixels): potato 3.04, slate 3.05, the rest higher. The cost is aesthetic and structural: the dark ground is darker and flatter than a lifted "warm umber" would be, `--popover` cannot be raised for elevation, and every surface separates by edge not by fill. No swatch was changed (`git diff` on `task-palette-colors.ts` is empty). I did not need to stop and raise criterion 19, but the owner should know the ground is pinned there; any lighter ground means remapping swatches.

### Painted contrast table (criterion 41; theme, ground, measured, threshold, verdict)

Light ground = `#fbf4ea` page, dark = `#1c140e` page, unless the row names another. All ratios are painted. "t" = text vs its fill, "b" = border vs ground / vs fill.

| Element | Light | Dark | Thr. | Verdict |
|---|---|---|---|---|
| Body text vs page | 14.55 | 15.40 | 4.5 | pass |
| Wordmark (36 px bold, `text-primary`) | 4.60 | 8.83 | 3.0 | pass |
| Current-task card: placeholder (muted-fg), error alert (destructive) | 6.99 / 5.92 | 8.70 / 7.66 | 4.5 | pass |
| Mode chips checked / unchecked | 8.31 / 9.41 | 13.01 / 12.57 | 4.5 | pass; cue is weight (700 vs 400) |
| Theme control checked / unchecked | 8.31 / 9.41 | 13.01 / 12.57 | 4.5 | pass; weight cue |
| mm:ss readout vs liquid / vs glass (levels 100,75,50,25,0, painted pixels) | 4.99 / 15.30 | 4.68 / 15.12 | 4.5 | pass at all five levels |
| Liquid vs glass | 3.07 (was 1.56) | 3.23 | 3.0 | pass |
| Start: icon vs fill (rest / hover) | 5.02 / 7.17 | 8.83 / 10.45 | 3.0 | pass |
| Reset: label; border vs ground / fill | 9.89; 3.44 / 3.61 | 12.34; 3.80 / 3.73 | 4.5; 3.0 | pass. Reset hover b vs fill 3.17 / 3.14 |
| Custom field: label / text / border vs ground / fill | 6.99 / 15.30 / 3.44 / 3.61 | 8.70 / 15.12 / 3.80 / 3.73 | 4.5; 3.0 | pass |
| Custom field disabled: text / b vs fill | 2.57 / 3.44 | 3.44 / 3.50 | exempt | not worse than light |
| Tasks pill: icon vs fill rest / hover; fill vs page | 5.02 / 3.62; 4.60 | 8.83 / 6.03; 8.83 | 3.0 | pass. **Dark fill painted `--primary`, not `--input/30`** |
| Stats button: icon; b vs ground / fill | 9.42; 3.44 / 3.44 | 10.90; 3.80 / 3.29 | 3.0 | pass |
| Dialog: text vs popover; title; description | 15.30; 15.30; 7.35 | 15.12; 15.12; 8.54 | 4.5 | pass |
| Dialog fill / edge vs scrimmed page (criterion 15) | 2.87 / 2.00 | 1.10 / **4.12** | 3.0 | dark: the **edge** carries it (4.12; edge vs fill 3.73). Light is unchanged and reaches 3:1 by neither; criterion 15 is a dark criterion |
| Dialog Close: b vs popover / fill | 3.61 / 3.44 | 3.73 / 3.80 | 3.0 | pass; hover b vs fill 3.44 / 3.50 |
| Task row: title; count; row border | 14.55; 6.99; 1.36 | 15.40; 8.70; 1.40 | 4.5; decor. | pass; row border is a decorative container hairline (the row's controls carry their own 3:1 boundaries) |
| Row actions Reorder/Pin/Edit: label; b vs ground / fill | 9.89; 3.44 / 3.61 | 12.34; 3.80 / 3.73 | 4.5; 3.0 | pass. Edit hover b 6.09 / 6.40 light, 8.00 / 7.85 dark |
| Pinned Unpin: label; b vs ground / fill (rest) | 8.15; 4.60 / 4.51 | 9.67; 9.87 / 7.34 | 4.5; 3.0 | pass. Hover b vs fill: 5.69 light, 7.34 dark |
| Delete confirm: panel tint vs card; prompt (`text-destructive`); Cancel b vs tint | 1.10; 5.37; 3.12 | 1.09; 7.02; 3.48 | 4.5; 3.0 | pass. Delete fill label 8.00 / 8.79 |
| Task colour dot (hairline = foreground 12% mix) vs card | potato 5.37 ... mint 3.14 | potato 3.10 ... slate 3.10 (full list above) | 3.0 | pass, thinnest are potato and slate in dark |
| Task form: label; fields text; field b vs ground / fill | 6.99; 15.30; 3.44 / 3.61 | 8.70; 15.12; 3.80 / 3.73 | 4.5; 3.0 | pass |
| Task form error text (invalid) | 5.92 | 7.66 | 4.5 | pass |
| Submit enabled: label vs fill | 5.02 | 8.83 | 4.5 | pass |
| Submit disabled: label vs fill / fill vs card | 1.49 / 1.36 | 1.73 / 1.73 | exempt | not worse than light |
| Disabled task-form fields (3): text / b vs fill / fill vs ground | 2.57 / 3.44 / 1.00 | 3.44 / 3.50 / 1.09 | exempt | not worse than light |
| /stats: link; h1/h2/total; "focus time" label | 4.60; 14.55; 9.41 | 8.83; 15.40; 12.57 | 4.5 | pass |
| /stats view chip checked / unchecked; unchecked b | 8.15 / 9.41; 3.44 | 9.67 / 12.57; 3.80 | 4.5; 3.0 | pass; checked b vs ground 4.60 / 8.83 |
| /stats chart bar (`--chart-1`) vs card; tick text | 5.37; 9.41 | 6.53; 12.57 | 3.0; 4.5 | pass. Gridline/axis (`--border`) is decorative |
| /stats tables: th / td; details border | 9.41 / 14.55; 1.36 | 12.57 / 15.40; 1.40 | 4.5; decor. | pass |
| Focus ring on every tabbed control: 2 px, offset 2 px, colour `--ring` | 4.60 vs ground | 8.83 vs ground | 3.0 | see "not met" below |

axe-core (scratch, `@axe-core/playwright`) reported zero violations of any impact on `/` idle, dialog open, dialog form error, and `/stats`, in both themes at 320 and 1280. Console clean (only React DevTools/HMR info). Hydration matrix (stored light/dark/system/none x OS light/dark x `/` and `/stats`): zero "hydrat" messages, and `.dark` matched the expected value in all 16.

### Deliberate visible changes in LIGHT (before from a HEAD checkout, after from this tree)

1. **`--gauge-liquid` #f6c453 -> #d97706** (owner answer 4; closes 006 Q1). Liquid vs glass 1.56 -> 3.07; mm:ss vs liquid 9.79 -> 4.99. Pale yellow to deeper amber.
2. **Delete-confirm prompt `text-foreground` -> `text-destructive`** (owner answer 5; closes 007 R-4). 13.20 -> 5.37 on the unchanged tint (247,231,222). Tint at `TaskRow.tsx:172` untouched.
3. **R-1 boundaries 1.36 -> 3.44:** timer Reset (1.36 vs ground, 1.43 vs fill -> 3.44 / 3.61), dialog Close (1.43 / 1.36 -> 3.61 / 3.44), CurrentTaskCard Reload (1.36 -> 3.44), unchecked stats view chips (1.36 -> 3.44). Edges are visibly darker.
4. **R-5 pinned Pin hover restored:** border 180,83,9 -> 153,73,12 on hover (4.51 -> 5.69 vs fill). It had no hover at all.
5. **Focus outline colour:** `#b45309` hardcode -> `var(--ring)`, painted `rgb(180, 83, 9)` before and after, byte-identical.
6. **Added `color-scheme: light` on `:root`** (criterion 22 asks for it per theme). No visible change.
7. **Tasks trigger `variant="outline"` -> `"default"`**: same painted fill/icon at rest and hover (the outline variant's `aria-expanded:bg-muted` no longer applies while the dialog is open, hidden behind the scrim).
Unchanged in light and verified: disabled submit (214,211,209 fill, label 1.49:1), dialog edge (`--dialog-edge` = `var(--border)`, 214,211,209), everything else on the table above.

### New tokens (criterion 55; each has its reason comment in `app/globals.css`)
- **`--disabled-surface`** (R-6): `:root` #d6d3d1 (a literal, deliberately not `var(--border)`), `.dark` #4a3d32. Role: fill of a disabled solid button. Why not existing: `--border` is a boundary token whose dark value is chosen for boundary work; `--muted` would drop the light label to 1.08:1. `TaskForm.tsx:264` now `disabled:bg-disabled-surface`.
- **`--dialog-edge`**: `:root` `var(--border)` (light unchanged), `.dark` #80705d. Role: dialog edge. Why: the dark dialog fill is capped near the page luminance by the swatch floor (1.10:1 vs the scrimmed page), so the edge must carry criterion 15, and `--border` is a 1.4:1 hairline by design. `components/ui/dialog.tsx` content uses `border-dialog-edge`.
Both are mapped in the second `@theme inline` block.

### R-1b: resolved, prediction confirmed painted
With HEAD's `button.tsx` and `TaskListDialog.tsx` under `.dark` (this task's tokens), the Tasks pill painted `oklab(0.315 0.012 0.022 / 0.3)` = `--input/30`, fill 37,27,20, icon vs fill **1.08:1**: the amber pill became a near-invisible translucent one, as predicted. Fix: all four `dark:` utilities in `components/ui/button.tsx` (lines 7, 13, 17, 19; the only ones in the repo) were removed, with a header comment explaining why. Basis: `ghost`, `destructive` and `aria-invalid` have no consumer to measure them against, and the outline one is the bug. Sweep found no other `dark:` class in `app/ components/ hooks/ widgets/`. After the fix the pill's dark fill paints `--primary` (240,165,80), icon 8.83:1. `button.tsx` outline now uses `border-control-border`. The "edited, a future `shadcn add` is a conflict" header comment was added.

### R-3 / criterion 14
The comment at `app/globals.css` for `--control-border` now lists five grounds with light and dark figures. The sentence "Milestone 4 MUST give this a value in the .dark block" was removed because the obligation is discharged; `components/token-foundation.test.ts` pins it (see stale tests).

### Criteria status (B-H, frontend-owned)
**Met, by my measurement (scratch, qa re-measures):** 8 and 48 (dark first frame, no cream frame), 9 (hydration matrix), 10 (live OS flip incl. gauge tokens and Reset background repainting; verified, not assumed, `use-resolved-tokens` needed no change), 11 (one `.dark` block; the `:root` additions are the ones listed above), 12, 13, 14, 15 (edge carries it), 16 (page 28,20,14 -> 15,10,7 under the scrim; dialog undimmed), 17, 18, 19 (no swatch changed), 20, 21, 22, 23, 24 (measured above; before from HEAD), 25, 26, 27, 29, 31-40 (32, 33, 35, 37, 38 measured as above; 34 is weight 700/400; 36 native radios; 39 scratch axe clean; 40 verified incl. reload and new context), 41-46 (table above), 47 (with the mode-chip opt-out), 49 (no existing `motion-reduce:` class touched), 50 (palette guard passes), 53, 54, 55, 56, 61 (no timer file, hook or timing API touched), 62.
**Not met or not fully met:**
- **28, "reaching 3:1 against the control's own fill":** unmeetable as worded for primary-filled controls in either theme. `--ring` equals `--primary` (kept, because criterion 27 makes the light ring value-preserving), so Start, the Tasks pill and the task submit measure outline vs own fill **1.00:1** in light and dark; the 2 px offset leaves a ground-coloured gap, and against the ground the ring is 4.60 light / 8.83 dark. A dark ring that differs from `--primary` cannot clear 3:1 against both the amber fill and the dark ground (the window is empty by arithmetic). Everything else is 2 px / offset 2 px at 4.60 (light) / 8.83 (dark) vs ground and 4.60-4.84 / 7.65-8.83 vs fill. Needs the criterion reworded or the owner to accept the offset gap.
- **30, "asserted by a test":** I wrote none (qa's). Code state: no `bg-border`/`bg-input` utility remains in the four dirs (grep).
- **47, residual motion:** `TaskForm.tsx:219` swatch `transition-shadow` and frozen `HoldButton` background transition still run on a theme change (see Motion).
- **Drag-active row ring** (`ring-ring` at 0.6 opacity) was not painted-measured. qa.
- **57-59, 60, 63, 64:** qa's. See stale tests.

### Stale tests this diff makes false (9 total; all assertions about class names, counts or measured values the criteria change)
npm run lint 0 errors / 21 warnings (baseline); typecheck clean; vitest **478 pass / 3 fail** of 481; Playwright full run **317 passed / 2 skipped / 6 failed**.
Vitest:
1. `components/TaskListDialog.tokens.test.ts` "the dialog surface, overlay and border use the semantic tokens" expects `border-border` in `ui/dialog.tsx`; the dialog edge is now `border-dialog-edge` (criterion 15 needs a non-hairline edge).
2. `components/token-foundation.test.ts` "defines --control-border once, as #88837e, in the root block": the token is now defined in `:root` and `.dark` (criterion 12).
3. Same file, "carries the three parts...": the "Milestone 4 MUST give this a value in the .dark block" sentence was replaced (criterion 14).
Playwright:
4-5. `e2e/mode-selector-legend.spec.ts:33` (x2 viewports) selects `fieldset > legend` and expects count 1; the theme control adds a second fieldset (criterion 31). Selector needs scoping to the mode selector.
6-7. `e2e/timer-gauge.spec.ts:285` and `:310` expect `data-liquid-color` `#f6c453`; owner answer 4 makes it `#d97706`. (`:312`'s dark override assertion is unaffected.)
8. `e2e/timer.spec.ts:257` "Tab through controls" expects the first Tab stop to be the Focus mode radio; the theme control is now first in DOM order.
9. `e2e/token-task-surface.spec.ts:204` reads the pinned button's border while the pointer is still over it after the click, so it now reads the R-5 hover colour (153,73,12) not `--primary`. The test should move the pointer away first.

### Observation for backend/qa, not changed
Entering `"Dark"`, `"auto"`, `{`, `null`, `42` or an empty string into `pomotato-preferences` before load: the app falls back to `system`, `<html>` is not dark on an OS-light run, no console output, and the stored entry is **rewritten** as a valid `{"state":{"theme":"system"},"version":1}` (persist's post-rehydration write). Backend's note predicted "not written back" for same-version values; this is for entries with no valid envelope. Criterion 5 says "not written back as if valid"; qa should decide whether a valid `system` envelope counts.

### Needed from qa
Update the nine stale assertions above (class-name and selector ones are justified; #9 should move the pointer, not accept the hover colour). Then own: the drift test (criterion 7), the storage-read and malformed-shape tests (3, 5), hydration (9), live OS flip with `emulateMedia` (10), first-frame screenshot (8), `.dark` token enumeration (12), measure criteria 14, 24, 25, 26, 29, 30, 39, 60 and 64, and re-take the criterion 15 and 28 readings. Do not reuse my 50 ms-sampled focus numbers: `Button` has `transition-all`, so an outline read within ~300 ms of focus is mid-fade (I saw offset 1 px and an in-between colour at 60 ms). Wait for transitions before reading.

## QA Report
(Filled in by qa.)
- Verdict: PASS | FAIL
- Tests added:
- Repro steps for any failure:

## Review Findings
(Filled in by reviewer.)
- Verdict: APPROVE | CHANGES REQUESTED
- Findings:
