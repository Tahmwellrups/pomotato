---
id: 019
slug: dark-mode-only
status: done # QA PASS, review APPROVE, 2026-11-12
---

# Dark mode only — retire light, system, and the theme selector

> **History for this task** — implementation notes, QA reports, review findings and
> orchestrator rulings live in [logs/019-dark-mode-only-log.md](logs/019-dark-mode-only-log.md). Read it only when a
> criterion below is disputed; it is not an input to implementing them.

## Goal
Pomotato paints dark and only dark. The LIGHT / DARK / SYSTEM selector, the light palette, the theme
store state and the theme-resolving boot logic are deleted; the OS `prefers-color-scheme` no longer
influences anything. Dark gains the robustness it was never given as an option: `color-scheme: dark`,
a matching `theme-color`, a measured ground under the timer and controls over uploaded images, and
non-colour indicators on active states.

## Scope

**In:** removing the theme selector and every render site of it; deleting the theme provider, the
`theme` store field and setter, the theme branch of the pre-hydration boot script, and task 018's
theme-lock machinery; dropping a stale stored `theme` value without error; applying dark in the
server-rendered HTML; `color-scheme: dark` and a `theme-color` meta; a localized ground behind the
timer and the main controls where measurement shows the dark palette alone misses the ratio;
non-colour active-state indicators with the matching ARIA state; flattening or statically applying
the dark tokens (decision point D1); deleting unused light-only tokens; marking task 018 superseded.

**Out (do not touch, do not "improve while here"):** the background overlay opacity (`opacity-50`,
`components/BackgroundLayer.tsx`) — a criterion may read it, none may move it; adding a second theme,
accent-colour options, or per-background tinting; the mascot; any timer, task, stats or settings
*behaviour*; any layout redesign; any restyling not named by a criterion below. Hard-coded colours may
be replaced with tokens **only** in files a criterion already makes you open.

**Data shape: decided — `backend` does not run.** `grep -rin theme lib/db/` returns zero matches: no
Dexie table, index or field holds a theme, so there is no schema change and no Dexie migration. The
stored value lives at `state.theme` inside the single zustand-persist localStorage key
`pomotato-preferences` (`lib/preferences/schema.ts:97`), envelope version `PREFERENCES_VERSION = 3`
(`:98`). Deleting that whole key would also destroy `background`, `taskPanelVisible`, the gauge style
and the session lengths — so the task removes the **field**, never the key.

**Closed questions** (verified, do not re-derive):
- The selector has exactly one render site: `widgets/HeaderNav.tsx:12` → `components/ThemeControl.tsx`.
  The fieldset in `components/SettingsPanel.tsx` is the Timer gauge, not a theme control.
- Task 018's code is uncommitted in the working tree and this task supersedes it. The theme-lock files
  it added — `components/ThemeLockAnnouncer.tsx`, `hooks/use-theme-lock.ts`, `e2e/helpers/theme-lock-sampler.ts`,
  `e2e/task-018-theme-lock.spec.ts`, `e2e/task-018-contrast.spec.ts`, and the tests
  `components/theme-lock.ui.test.tsx`, `lib/preferences/theme-lock.test.ts` — all exist and all go.
- `components/BackgroundProvider.tsx` is also new in 018 but is **background** infrastructure, not
  theme-lock. It stays. Same for the background parts of `hooks/use-background-image.ts`.
- `@custom-variant dark (&:is(.dark *))` is declared at `app/globals.css:5`; the `@theme inline` block
  (`app/globals.css:240-287`) maps `--color-*` → `var(--*)` and is theme-agnostic either way.

**What this invalidates:** `docs/PLAN.md` items about the wordmark halo over the *theme chip's* focus
ring and about `--dialog-edge`'s *light* sub-floor lose their subject. Mark them obsolete in PLAN when
this task closes; do not fix them here.

### D1 — Styling approach: an explicit decision, to be recorded in `docs/DECISIONS.md`

Pick (a) keep both token blocks and statically apply dark, or (b) flatten so the dark palette is the
base and the light values and `dark:` variants are deleted. Prefer (b) **only** if the diff is clean
and low-risk. Evidence, counted 2026-11-12:

- `:root` defines **41** custom properties (`app/globals.css:23-156`); `.dark` overrides **32** of them
  (`:171-237`).
- The **9** `:root` properties `.dark` does not override are `--radius` and the eight `--sidebar-*`.
  `--sidebar-*` is referenced only inside `app/globals.css` and two test files — no `app/`,
  `components/`, `widgets/` or `hooks/` file reads them.
- Live `dark:` Tailwind utility variants in application code: **1** — `components/ui/checkbox.tsx:16`.
  (`components/ui/button.tsx` carries 3 hits that are *comments* recording their removal;
  `components/ThemeControl.tsx:14` is the object key `dark: "Dark"`, not a variant.) The remaining 9
  repo-wide hits are all in test files.
- Each `.dark` value carries painted-pixel contrast provenance in comments (e.g. `app/globals.css:53-54`,
  `:205`, `:225`). Under (b) those comments must move with the values they document; losing them is the
  main risk in (b) and the reason a criterion below checks for it.

## Acceptance Criteria

Tags: `[unit]` vitest, `[e2e]` Playwright, `[static]` source/grep check, `[manual]` recorded by hand in
the QA Report. **Group F is the measurement group and may be re-run alone if a token moves.** Per
CLAUDE.md "Measurement ordering", D1 is settled and the tokens are in their final values *before* F runs.

### A. The selector and the theme state are gone
- [ ] 1. `components/ThemeControl.tsx` no longer exists. `[static]`
- [ ] 2. `widgets/HeaderNav.tsx` renders no theme control and no wrapper, legend, label or spacing class that existed only to hold one. State in the QA Report what the header's remaining children are. `[static]`
- [ ] 3. Tab order through the header on `/` contains no theme control stop, and no focus stop lands on an element with no visible focus target. `[e2e]`
- [ ] 4. No screen-reader-only "Theme" legend or label text remains in any rendered output. `[static]` `[e2e]`
- [ ] 5. The preferences store exposes no `theme` field and no `setTheme`; `ThemePreference`, `ResolvedTheme`, `THEME_VALUES`, `DEFAULT_THEME`, `resolveTheme`, `effectiveTheme`, `isThemeSelectorShown` and `applyResolvedTheme` are all deleted from `lib/preferences/schema.ts`. `[static]` `[unit]`
- [ ] 6. `components/ThemeSync.tsx`, `hooks/use-theme-sync.ts`, `hooks/use-theme-lock.ts` and `components/ThemeLockAnnouncer.tsx` no longer exist, and `app/layout.tsx` imports none of them. `[static]`
- [ ] 7. `hooks/use-resolved-tokens.ts` either no longer branches on a theme or is deleted; if it survives, the QA Report names what still consumes it. `[static]`
- [ ] 8. `grep -rn "prefers-color-scheme" app/ components/ widgets/ hooks/ lib/` returns no hit that selects a palette. A `prefers-reduced-motion` or unrelated media query is fine. `[static]`
- [ ] 9. No theme code is commented out rather than deleted: no commented `dark:` utility, no commented theme branch, no `// removed` placeholder left behind in a file this task touches. `[static]`
- [ ] 10. `npm run lint`, `npm run typecheck` and `npm run build` all pass with no new warning. `[static]`

### B. Dark renders unconditionally, with no flash
- [ ] 11. With Playwright emulating `colorScheme: "light"`, `/` paints the dark palette: the computed `--background` of `<html>` equals the dark value, not the former light one. `[e2e]`
- [ ] 12. The same holds with `colorScheme: "dark"` and with `colorScheme: "no-preference"`. Three emulations, one assertion each. `[e2e]`
- [ ] 13. `/` (timer), `/stats` and `/settings` — the three routes that exist (`app/page.tsx`, `app/stats/page.tsx`, `app/settings/page.tsx`) — paint the same dark `--background` under `colorScheme: "light"`. `[e2e]`
- [ ] 14. The dark signal is present in the **server-rendered** HTML: `curl`-equivalent / `page.goto` with JavaScript disabled, or a Playwright response-body read, shows the root element carrying it before any script runs. `[e2e]` `[static]`
- [ ] 15. On a hard refresh with 4× CPU throttling, no frame paints a light background. Record the method (throttle factor, viewport) and the verdict in the QA Report. `[manual]`
- [ ] 16. No `suppressHydrationWarning` remains on the root element solely to cover a theme class the server could not know; if it is kept, the QA Report names the other reason. `[static]`

### C. Stale stored preference
- [ ] 17. Booting with `pomotato-preferences` holding `{"state":{"theme":"light",...},"version":3}` throws no error and logs nothing to `console.error`. `[unit]` `[e2e]`
- [ ] 18. The same boot produces no visual difference from a boot with no stored preferences at all: the computed `--background` and the `<html>` attribute set are identical. `[e2e]`
- [ ] 19. Repeat criterion 17 for stored `"dark"`, `"system"`, an unknown string, `null`, and a non-string (number, object). Six cases, none throws. `[unit]`
- [ ] 20. After load, the persisted envelope no longer contains a `theme` field — read `localStorage.getItem("pomotato-preferences")` back and assert the key's absence from `state`. `[unit]` `[e2e]`
- [ ] 21. The same read shows `background`, `taskPanelVisible`, the gauge style and the session lengths **unchanged** from what was stored. Dropping `theme` loses nothing else. `[unit]`
- [ ] 22. The stored value is not mapped into any other preference, flag or default. `[static]` `[unit]`
- [ ] 23. The boot script reads storage at most once and parses at most once (assert by spy/count), as it did before. `[unit]`
- [ ] 24. Running the boot script twice in a row leaves the root element in the same state. `[unit]`

### D. Native UI and platform signals
- [ ] 25. The root element resolves `color-scheme: dark` in computed style on every route. `[e2e]`
- [ ] 26. A `theme-color` meta tag is present and its value equals the computed `--background` of the root element. Assert equality at runtime rather than hard-coding a hex; record the hex and that it came from the computed style of `<html>` on `/` in the QA Report. `[e2e]`
- [ ] 27. Scrollbars, a text input, a number input and a checkbox render with dark native chrome on `/settings`. Verified by `color-scheme` inheritance plus one screenshot noted in the QA Report. `[e2e]` `[manual]`
- [ ] 28. Autofill styling on any text input does not produce a light-on-light or unreadable field. `[manual]`

### E. Non-colour state and a11y
- [ ] 29. Every selected/active control that previously signalled state by colour alone — the mode tabs and the active icon button at minimum — carries a non-colour indicator (underline, pill, dot or check) that is present in the DOM/computed style when selected and absent when not. Name every control audited in the QA Report. `[e2e]` `[static]`
- [ ] 30. Each of those controls exposes the matching ARIA state: `aria-current` for navigation-like selection, `aria-pressed` for toggles, or a native checked radio/checkbox. No control signals selection to sighted users only. `[e2e]`
- [ ] 31. An axe scan on `/` (timer), `/stats` and `/settings` reports zero violations at serious or critical severity. List any moderate findings in the QA Report without failing on them. `[e2e]`
- [ ] 32. The browser console is clean of errors and React warnings across a load of all three routes. `[e2e]`
- [ ] 33. Under `prefers-reduced-motion: reduce`, no animation or transition added or modified by this task plays. `[e2e]`
- [ ] 34. Under `forced-colors: active`, the timer digits, the start/pause control and the mode tabs are all visible and operable, and the selected mode is still distinguishable. Record a screenshot reference. `[manual]`
- [ ] 35. The keyboard focus ring is visible on every interactive element on `/` with no background image. (The "over a bright uploaded image" half moved to task 020 criterion 4 with the ground it depends on; the ring's own defect, `outline-none!` with no replacement on the task-title input, is fixed here.) `[e2e]`

### F. Measurement group — contrast over uploaded backgrounds

> **Split by owner ruling, 2026-11-12.** The measurement ran, failed, was fixed, and the fix was reverted on
> its look. Criteria 37 to 40, 42 and 43 moved to [020-contrast-ground-over-backgrounds.md](020-contrast-ground-over-backgrounds.md)
> with every figure they produced. Criteria 36, 41, 44 and 45 are satisfied here: the bound was established,
> no plain-page figure fell, `opacity-50` never moved, and the before/after pair went to the owner, whose
> answer was the revert. Nothing in group F is outstanding **in this task**.

Re-runnable alone. Every figure in this group is a **painted-pixel sample** (`page.screenshot` →
pixel read), not a token value read from CSS, and every recorded ratio must name the two pixels it
came from and which ground they sit on. All measurements are taken in the one remaining (dark) theme,
so "which theme" is constant — state it once in the QA Report and do not repeat it per figure.

- [ ] 36. **Bound first, then measure the bound.** Establish that a fully white image and a high-frequency busy image bound the legibility range for the surfaces in this group, and state the one-line argument in the QA Report. Measure only those two plus the no-image case. Do not enumerate a gallery. `[manual]`
- [~] 37. **Moved to task 020.** On the white-image ground, the timer digits measure ≥ 4.5:1 against the pixel directly behind them. Record both sampled hex values and their coordinates. `[e2e]` `[manual]`
- [~] 38. **Moved to task 020.** On the busy-image ground, the timer digits measure ≥ 4.5:1 against the **worst** pixel behind them, found by sampling the brightest and darkest pixel within the digits' bounding box. Record both hexes and coordinates. `[e2e]` `[manual]`
- [~] 39. **Moved to task 020.** The main controls' labels (start/pause and the mode tabs) measure ≥ 4.5:1, and their non-text UI boundaries (borders, the active indicator from criterion 29) ≥ 3:1, on both grounds. Same sampling method; record the worst figure per surface, not every figure. `[e2e]` `[manual]`
- [~] 40. **Moved to task 020.** The focus ring measures ≥ 3:1 against the pixel immediately outside it on both grounds. `[e2e]` `[manual]`
- [ ] 41. The no-image case is measured too, and every figure in 37–40 is **unchanged** from its pre-task value there. The ground under the timer must not cost contrast on the plain page. `[e2e]`
- [~] 42. **Moved to task 020.** Where a figure in 37–40 already clears its threshold without a localized ground, **no ground is added for that surface** and the measurement that proves it is recorded. A scrim is a fix for a measured miss, not a default. `[manual]`
- [~] 43. **Moved to task 020.** Any localized ground that *is* added is localized: it changes no pixel outside the timer's and main controls' own bounding boxes on the plain page. `[e2e]`
- [ ] 44. `components/BackgroundLayer.tsx`'s overlay opacity is still `opacity-50`, byte-for-byte. `[static]`
- [ ] 45. If any added ground changes the plain-page look noticeably, a before/after screenshot pair is attached to the task log and shown to the owner **before** the task is marked done. `[manual]`

### G. Tokens
- [ ] 46. The D1 choice and its reason are recorded as one line in `docs/DECISIONS.md` with the reasoning in `docs/decisions/2026-11.md`. `[static]`
- [ ] 47. Every colour the app paints still comes from a named CSS variable; adding a second palette later would mean redefining variables, not editing components. No component gains a literal colour. `[static]`
- [ ] 48. The eight `--sidebar-*` tokens are deleted (no app-code reader exists, verified above), along with any other token that no longer has a reader after this task. The QA Report lists every token deleted. `[static]`
- [ ] 49. Every painted-pixel contrast figure recorded in an `app/globals.css` comment still sits next to the value it documents, and no figure now describes a value that moved. `[static]`
- [ ] 50. If D1 chose (b): `.dark` and `@custom-variant dark` are gone from `app/globals.css`, and `grep -rn "dark:" app/ components/ widgets/ hooks/ lib/` returns no utility variant. If D1 chose (a): the `.dark` class is applied statically in the server-rendered HTML and no code path can remove it. `[static]`

### H. Nothing else moved
- [ ] 51. The existing timer unit and e2e suites pass unmodified except where a test's *only* failure is a deleted theme affordance. Any other edit to a behaviour test is a finding, not a fix. `[unit]` `[e2e]`
- [ ] 52. Start, pause, reset, mode switching and session completion behave as before: one e2e pass through a shortened full cycle. `[e2e]`
- [ ] 53. Task add, edit, complete, reorder and delete behave as before. `[e2e]`
- [ ] 54. Stats render and settings persist as before, including the background upload and remove flow. `[e2e]`
- [ ] 55. `docs/tasks/018-theme-lock-with-custom-background.md` frontmatter reads `status: superseded` and the file carries a one-line note naming this task as its replacement. Its log file is **not** edited. `[static]`

## Files likely touched

Application code — `frontend` only:
- `app/layout.tsx` — remove theme provider/announcer imports; apply dark statically; `theme-color` meta.
- `app/globals.css` — D1; delete light-only tokens; `color-scheme: dark`; any localized ground.
- `widgets/HeaderNav.tsx` — remove the selector render site and its leftovers.
- `components/ThemeControl.tsx`, `components/ThemeSync.tsx`, `components/ThemeLockAnnouncer.tsx`,
  `hooks/use-theme-sync.ts`, `hooks/use-theme-lock.ts` — deletions.
- `hooks/use-resolved-tokens.ts` — de-theme or delete (criterion 7).
- `lib/preferences/schema.ts` — remove the theme field, values, types and resolvers.
- `lib/preferences/store.ts` — remove `theme`/`setTheme` from state, `partialize` and migration path.
- `lib/preferences/boot-script.ts` — remove the theme branch; keep the task-panel branch.
- `components/BackgroundControl.tsx`, `components/SettingsPanel.tsx` — remove theme-lock copy/notice.
- `components/ui/checkbox.tsx` — the one live `dark:` variant.
- `components/ui/button.tsx`, `components/ui/mode-chip.tsx` — only if a criterion requires it
  (criterion 29's indicator, or stale `dark:` comments under D1(b)).

Docs — `pm`/orchestrator:
- `docs/DECISIONS.md` + `docs/decisions/2026-11.md` — the D1 ruling.
- `docs/tasks/018-theme-lock-with-custom-background.md` — superseded status and note (criterion 55).
- `docs/PLAN.md` — mark the two invalidated items obsolete when this closes.

## Test inventory for `qa` (qa owns every edit here)

Update or delete — unit: `components/token-dark.test.ts`, `components/token-foundation.test.ts`,
`components/palette.tokens.test.ts`, `components/TimerSurface.tokens.test.ts`,
`components/background.guards.test.ts`, `components/focus-cycle.guards.test.ts`,
`hooks/use-resolved-tokens.test.tsx`, `lib/preferences/boot-script.test.ts`,
`lib/preferences/schema-v3.test.ts`, `lib/preferences/preferences.test.ts`.

Delete (018 theme-lock): `components/theme-lock.ui.test.tsx`, `lib/preferences/theme-lock.test.ts`,
`e2e/task-018-theme-lock.spec.ts`, `e2e/task-018-contrast.spec.ts`, `e2e/helpers/theme-lock-sampler.ts`.

Update or delete — e2e: `e2e/dark-native-ui.spec.ts`, `e2e/dark-sweep.spec.ts`,
`e2e/dark-contrast.spec.ts`, `e2e/dark-theme-control.spec.ts`, `e2e/dark-a11y-console.spec.ts`,
`e2e/mode-selector-legend.spec.ts`, `e2e/accessibility.spec.ts`, `e2e/helpers/background.ts`.

**`e2e/helpers/dark.ts` is imported by nine specs** (`dark-sweep`, `dark-contrast`, `dark-native-ui`,
`dark-theme-control`, `dark-a11y-console`, `settings-measure`, `settings-gauge-style`,
`checkbox-unchecked-contrast`, `uploaded-background-layer`). It exists to force dark before a test.
Decide once — neuter it to a no-op that still documents why, or remove it and its nine imports — and
say which in the QA Report. Do not leave half the callers on each path.

New coverage this task needs: the stale-preference cleanup (group C) as unit tests; OS-light emulation
and the hard-refresh flash check as e2e; an axe scan on timer, stats and settings. Contrast over the
bright and busy images (group F) is a manual step whose figures go in the QA Report.

## Risks
- **Flattening loses provenance.** The `.dark` values carry painted-pixel contrast comments. A
  mechanical move drops or orphans them; criterion 49 is the guard.
- **Deleting a token with a live reader.** `--sidebar-*` is proven dead, but the same reasoning must be
  applied per-token before deletion, not in bulk.
- **Scrim-induced visual drift.** A ground added for contrast can change the plain-page look the owner
  asked to keep pixel-for-pixel. Criteria 41–43 and 45 bound it; 42 says don't add one without a miss.
- **Preference loss.** `theme` lives inside the shared `pomotato-preferences` envelope. Clearing the key
  instead of the field destroys unrelated settings (criterion 21).
- **Test churn hides a regression.** Thirty-odd test files reference theme. A test deleted because it
  tested a deleted affordance is fine; a behaviour test edited to pass is not (criterion 51).
- **018's uncommitted diff is entangled.** Its background work stays and its theme-lock work goes, in the
  same files. Removing too much takes `BackgroundProvider` with it.
- No licensing exposure: no new asset.

## Open question for the owner
A localized frosted panel behind the timer was **retired by ruling on 2026-11-12** (see the
`docs/DECISIONS.md` entry on the retired frosted panel; `surface-frosted` is listed as dead code in
`docs/PLAN.md`). Group F re-opens that surface. Criterion 42 keeps it honest — no ground unless a
measurement misses — but if the measurement *does* miss, confirm that reversing the retirement is
intended rather than a second task.
