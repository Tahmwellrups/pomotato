# Milestone 4, part 2: the visible light/dark toggle and the `.dark` palette behind it — history log

Appended by frontend/backend/qa/reviewer/orchestrator after implementation began.
The task's goal, scope and acceptance criteria are in [../009-dark-mode-toggle.md](../009-dark-mode-toggle.md).

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

### Frontend: fix for QA criterion 47 (HoldButton reduced-motion transitions)

Added a `@media (prefers-reduced-motion: reduce)` block at the end of `app/globals.css` with selector `html .hb-root` and `transition-property: none !important; transition-duration: 0s !important`. `html .hb-root` outranks the vendored bare `.hb-root` rule, which is `!important` and injected at runtime, so source order is irrelevant. `components/HoldButton.tsx` and `SloshGauge.tsx` untouched. Comment on the rule gives the reason.

Measured in Chromium with `reducedMotion: "reduce"`, computed on `.hb-root` (property | duration): before (rule removed from CSSOM) `background-color, box-shadow | 0.16s, 0.2s`; after `none | 0s`, and still `none | 0s` after toggling `.dark` on `<html>`. Animation duration 0s. Note: the vendored `.hb-label>span` opacity 200ms transition is not themed and was left alone.

Gates: typecheck clean, lint 0 errors (21 pre-existing warnings), build passes.

### Frontend: fix for review R-1 (Start/Pause/Resume and colour swatch fade under reduced motion)

`components/ui/button.tsx`: added `motion-reduce:transition-none motion-reduce:duration-0` to the `buttonVariants` base, so every `Button` consumer is covered; the per-consumer `motion-reduce:transition-none` classes are now redundant and were left in place on purpose. `components/TaskForm.tsx` colour swatch: same two utilities added next to `transition-shadow`.

Measured in Chromium (Playwright, `reducedMotion` set per context, light to `.dark` class flip, `transitionrun`/`transitionstart` counted on the element itself; swatch measured with the task dialog open):

| Element | Motion | Before (transition-duration / property / transitions started) | After |
|---|---|---|---|
| Start button (`aria-label=Start`) | reduce | 0.15s / all / 6 | 0s / none / 0 |
| Colour swatch (2nd span after the radio) | reduce | 0.15s / box-shadow / 2 | 0s / none / 0 |
| Start button | no-preference | n/a | 0.15s / all / 6 (unchanged) |
| Colour swatch | no-preference | n/a | 0.15s / box-shadow / 2 (unchanged) |

Press affordance: `active:translate-y-px` is emitted by Tailwind v4 as the `translate` property, not `transform`. Held mouse-down on Start under reduced motion computes `translate: 0px 1px` after the change, same as before. Nothing is lost except the 150ms ease on hover/focus/press colour and offset changes, which now apply instantly under reduced motion (intended).

Gates: typecheck clean, lint 0 errors / 21 warnings (baseline), build passes. No tests edited; QA owns the regex widening and swatch sweep coverage.


## QA Report

- Verdict: **FAIL**
- Run on: `main` at `09a50e3`, working tree = that commit plus the QA test edits listed below. No application code was edited.
- Before-figures come from a `git archive 67ace13` checkout (the commit before this task's first commit), served on :3000 and measured with the same specs. Not from memory.
- Every ratio is theme-tagged and ground-tagged, and comes from computed styles composited over the real ancestor chain, or from pixels decoded from a real screenshot. None is arithmetic on token strings. Token-only pairs use a probe element on the real page ground (`e2e/helpers/dark.ts`).

### Gates

| Gate | Result |
| --- | --- |
| `npm run typecheck` | PASS, exit 0 |
| `npm run lint` | PASS, 0 errors, 21 warnings (baseline 21) |
| `npm run test` (Vitest) | PASS, 682 passed / 0 failed in 17 files (required at least 475; handoff count was 481 with 3 failing) |
| `npm run build` | PASS, compiled |
| `npm run test:e2e` (Playwright) | **FAIL**, 416 passed / 2 skipped / 3 failed (421 total) |

Playwright split: the 15 spec files that predate this task give 323 passed / 2 skipped / 0 failed, which meets the count in criterion 59. The 3 failures are in the QA-added specs and are real defects (see FAIL list). The 2 skips are the owner-parked `task-list-dialog.spec.ts` tests.

Flake note: `hold-label-contrast.spec.ts` failed once (white label 4.40:1 at t=450 ms, default motion) in the first full run, under parallel load. It passed 28/28 on rerun and passed in the final full run. Not reproduced; not counted against the task. Re-check if it recurs.

### Criteria

Status key: PASS, FAIL, PARTIAL (a sub-clause is not verified by QA), N/V (not verifiable from the repo state).

| # | Status | Evidence |
| --- | --- | --- |
| 1 | FAIL (literal) | DECISIONS.md entry 2026-10-23 "`.dark` is a three-state preference..." answers first paint and names 008, but does not state the storage key `pomotato-preferences` or the persisted shape. Both are in the backend draft in this file. Orchestrator must land them. |
| 2 | PASS | Resolver (`resolveTheme`) exported from `lib/preferences/schema.ts`; setter is a store action, re-exported from the package index. 6-row resolver table in `preferences.test.ts`. |
| 3 | PASS | Test reads the written localStorage entry: exactly `{"state":{"theme":"dark"},"version":1}`; no hex, rgb or class text (`preferences.test.ts`, `dark-theme-control` criterion 3). |
| 4 | PASS | Key `pomotato-preferences` (not `pomotato-timer`), version 1, `migrate` and `merge` defined. |
| 5 | PASS, with the write-back reading in the next section | One test per listed shape, unit and browser (`Dark`, `auto`, `{`, `null`, `42`, empty string), for raw and envelope forms. No page error, no duplicated class. |
| 6 | PASS | `git diff 67ace13 -- lib/db lib/timer` empty. IndexedDB dump after a theme change contains no preference value. |
| 7 | PASS | `boot-script.test.ts`: the script is built from the shared key, value set and class; key appears exactly once in the script; a value written by the store is painted per the resolver for every enum value and both OS settings. |
| 8 | PASS | Observation point: first MutationObserver callback that can see `<body>`, with the app JS held back 2.5 s. `dark` stored or `system` stored with OS dark: class set, 0 CSS transitions in flight, first painted pixel at (4,4) = (28,20,14) = dark `--background`. `light` stored with OS dark: no class, pixel (251,244,234) = light `--background`. |
| 9 | PASS | 6 stored x OS combinations, each on `/` (idle, running, paused) and `/stats`: zero console messages matching `hydrat`. The paused seed was invalid on first write (no `runId`, so the store rejected it); corrected, and the paused cases now really run. |
| 10 | PASS | `system` + OS flip: `html.dark` within 2 s with no reload; `data-liquid-color` #d97706 to #9d570d; body fill (251,244,234) to (28,20,14). `light`/`dark` stored: OS flip does not move the theme. |
| 11 | PASS, one owner-sanctioned exception | `:root` values unchanged except the `--control-border` comment and `:focus-visible` hex. Exception: `--gauge-liquid` `#f6c453` to `#d97706`, mandated by owner answer 4 in this file. Criterion text does not list it; the criterion should be amended. |
| 12 | PASS | Vitest: all 29 tokens declared in both `:root` and `.dark` with different values, sidebar group has no `.dark` literals. Playwright computed styles: 27 tokens resolve to different computed values under `.dark` (`dark-contrast` criterion 12). |
| 13 | PASS | All 8 pairs, dark: 15.40, 15.40, 15.12, 8.83, 10.90, 9.67, 7.66, 8.01. Light minimum 5.02 (`--primary-foreground` on `--primary`). |
| 14 | PASS | `--control-border`, painted, dark: 3.80 `--background`, 3.80 `--card`, 3.73 `--popover`, 3.50 `--muted`, 3.48 delete-confirm tint. Light: 3.44, 3.44, 3.61, 3.44, 3.12. Comment at `globals.css` lists five grounds. |
| 15 | PASS (dark) | Dark: dialog fill 1.10:1 against the scrimmed page (fill 30,22,16; page 16,11,7); dialog edge 4.09:1 (edge 128,112,93). The edge carries it. Light is recorded, not asserted (criterion scoped to dark): fill and edge both 2.87:1. |
| 16 | PASS | Page pixel (20,400): closed (28,20,14) to scrimmed (16,11,7), 1.08:1 contrast between the two states. Dialog fill matches `--popover` within 2 levels per channel (undimmed). |
| 17 | PASS | Dark `--muted-foreground`: 8.70 `--background`, 8.70 `--card`, 8.54 `--popover`, 8.01 `--muted`. |
| 18 | PASS | Dark `--accent-foreground`: 9.67 on `--accent`, 13.01 on `--background`. |
| 19 | PASS | Dark, all 8 swatches on `--card` and `--popover`. Minimum 3.04 (potato on `--popover`). No swatch value changed (`task-palette-colors.ts` not in the diff). |
| 20 | PARTIAL | Dark `--chart-1..5` on `--card`: 6.53, 6.20, 8.14, 7.03, 6.51. `/stats` tick text: 12.57 dark, 9.41 light. Legend and tooltip text not measured. |
| 21 | PASS (proxy, see caveat) | Level verified per row (within 1 of requested). Dark readout vs liquid 4.68 (min across 100/75/50/25/0); vs glass 15.12. Light vs liquid 4.99. Liquid-vs-glass: dark 3.23, light 3.07, so dark is not worse. |
| 22 | PARTIAL | Computed `color-scheme` is `light` / `dark` per theme. Spinner, scrollbar and selection rendering not visually confirmed. |
| 23 | PASS | `components/ui/button.tsx` carries the edited-not-as-generated header comment. Outline boundary is now `--control-border`. |
| 24 | PASS | See the before/after table below. All 8 readings at or above 3:1, both themes. |
| 25 | PASS | Tasks trigger painted fill equals `--primary` in dark (8.83 icon vs fill; 5.02 light). No `dark:` utility remains in `button.tsx`. |
| 26 | PASS | Disabled submit label vs fill: 1.49 light (identical to HEAD: same token, same colours), 1.73 dark. Fill vs surface: 1.36 light, 1.73 dark. Visible, not worse than light. |
| 27 | PASS | Light Start focus outline is (180,83,9) = `#b45309` before and after. Dark ring (240,165,80) = `--ring`. Width 2px, offset 2px. Rule still unlayered (depth 0). |
| 28 | **FAIL** (primary-filled controls) | Non-primary controls pass both readings: outline vs ground 4.60 light / 8.83 dark, outline vs own fill 4.60 to 4.84 light / 8.67 to 8.83 dark. Start (primary-filled): outline vs own fill 1.00:1 in both themes. See FAIL list. |
| 29 | PASS | Hover border vs fill: light 5.69 (153,73,12 on 254,243,199); dark 7.34. HEAD light was 4.51 (no hover change, rest colour retained). Recorded as the deliberate light change. Rest border = `--primary`. |
| 30 | PASS | `components/token-dark.test.ts` asserts no `bg-`/`fill-`/`from-`/`via-`/`to-` utility from `border` or `input` in app, components, hooks, widgets. Matcher proven non-vacuous. |
| 31 | PASS | One fieldset named "Theme" on `/`; none on `/stats`. |
| 32 | PASS | Present in initial render at 320 px and 1280 px, inside the viewport, no scroll. |
| 33 | PASS | Group name: "Theme" (sr-only legend). Option names: "Light", "Dark", "System". Checked state programmatic (`:checked`). |
| 34 | PASS | Checked option weight 700 vs others 400, both themes and both OS settings. Greyscale filter keeps the weight cue. |
| 35 | PASS | Cold Tab reaches the checked theme option; ArrowLeft/Right change the theme immediately; Tab leaves the group; no trap. |
| 36 | PASS | Native `input type=radio` in a `fieldset`. No `role=radiogroup`, `switch` or `button` constructed. |
| 37 | PASS | Each `label` is at least 44x44 at 320 px and 1280 px. |
| 38 | **FAIL** (320 px) | No horizontal overflow at either width. Wordmark box identical to HEAD at both widths. At 320 px the header wraps from 40 px to 80 px and the gauge top moves 312 px to 352 px (main column content shifts 40 px). At 1280 px nothing moves. See FAIL list. |
| 39 | PASS | axe-core: zero serious or critical violations, both themes, both viewports, timer idle / running / paused / complete; task dialog open; form in error state; `/stats`. |
| 40 | PASS | Class on `<html>` within 1 s of click; survives reload; a new page in the same context is dark and checked. |
| 41 | PARTIAL | 15+ rows measured (both themes). Not measured by QA: `TaskRow` drag-active and pinned, `TaskColorDot`, `TaskForm` invalid and the three disabled fields, `CurrentTaskCard` normal and empty, `StatsChart` legend and tooltip, `StatsTables`, `CustomDurationInput` error state. |
| 42 | PARTIAL | No measured row finishes below its floor except criterion 15 light (out of scope) and the criterion 28 primary-fill rows. Unmeasured rows are unknown. |
| 43 | PARTIAL | Disabled submit (light 1.49, dark 1.73), disabled custom field while running (light 3.44, dark 3.80 vs page). Three disabled task-form fields not measured. |
| 44 | PASS | Light before (HEAD) vs after for every pair touched: `button.tsx` outline rows, focus ring, submit, pinned button. See table. |
| 45 | PASS | `/prototype` renders in dark with no page error or hydration message. Exclusion from 41-44 stated. |
| 46 | PASS | Every annotation names theme and ground and states painted or computed. |
| 47 | **FAIL** | Under `prefers-reduced-motion: reduce`, `button.hb-root` (HoldButton, the Reset control) still transitions `background-color, box-shadow` at 0.16s and 0.2s. See FAIL list. |
| 48 | PASS | At the first observable point, 0 CSS transitions in flight (dark stored and light stored cases). |
| 49 | PASS | `hold-reset.spec.ts` (29) and `hold-label-contrast.spec.ts` (7) pass unchanged in the final run. `motion-reduce:` classes untouched except the `mode-chip.tsx` addition. |
| 50 | PASS | `palette.tokens.test.ts` passes including the new files; `ALLOWED_RAW_UTILITIES` empty; `ALLOWED_LITERALS` unchanged (2 entries). |
| 51 | PASS | R-8 widenings present and each demonstrated by break-and-restore (below). |
| 52 | PASS | `TimerGauge.tokens.test.ts`: `RAW_PALETTE_UTILITY` and the two `it()` blocks deleted; `HEX_LITERAL`, `RGB_LITERAL`, `TIMER_SOURCE` kept. Four files still covered by `palette.tokens.test.ts` FILES (pinned by a new test). |
| 53 | **FAIL** (literal) | Empty for `lib/db`, `lib/timer`, the hooks, swatch file, the timer and frozen components, prototype dirs, `e2e/task-list-dialog.spec.ts`, `package.json`, `package-lock.json`, `components.json`. Not empty: `docs/PLAN.md` (milestone 4 status line and link, orchestrator edit) and `docs/DECISIONS.md`. Criteria 1 and 53 contradict each other for DECISIONS.md. Owner or reviewer must rule. |
| 54 | PASS | `package.json`, `package-lock.json`, `components.json` diffs empty vs 67ace13. |
| 55 | PASS | New tokens `--dialog-edge` and `--disabled-surface` each carry role, why, and both values in their comment. |
| 56 | PASS | Swatch pins (`d7d1bec`) and no-`any` check in `token-foundation.test.ts` pass. The two `--control-border` pins changed under criteria 12 and 14 (see stale list). |
| 57 | **FAIL** (via 59) | Lint, typecheck, build, Vitest pass. `test:e2e` fails with 3 tests. |
| 58 | PASS | Vitest 682 passed (required at least 475 plus new). |
| 59 | **FAIL** | 416 passed / 2 skipped / 3 failed. The 3 failures are criterion 28 (2) and criterion 47 (1). Existing suite alone: 323 / 2 / 0. |
| 60 | PASS | Four combinations (light and dark x 320 and 1280), each covering every listed flow: zero console errors or warnings. A deliberate `console.warn` probe reaches the captured list first, so zero is not vacuous. |
| 61 | PASS | No timer API added (diff scan). Mid-session test: running timer, theme change to dark; `endTimestamp` unchanged, status still `running`, readout moved by wall-clock time only. Existing timer specs pass. |
| 62 | PASS | Diff scan of added app lines: no `any`, `as never`, non-null assertion or `export default`. QA-added tests use `must()` instead of non-null assertions. |
| 63 | PASS | Non-vacuity guards: console probe; element-count checks before measurement; gauge level asserted within 1 of the seeded level; chip span count asserted; boot matrix compared against the resolver, not against a constant. |
| 64 | PASS | Break-and-restore, hash-verified (below): criteria 8, 5, 14, 24, 34, plus R-8 x3 and criterion 30. |
| 65 | N/V | Notes section exists (dark token table, painted contrast table, deliberate-change list, R-1b, guide read). Whether it predates QA is not verifiable from git. |

### Criterion 24: R-1 call sites, before (67ace13) and after, painted

| Call site | Before light | After light | After dark |
| --- | --- | --- | --- |
| Dialog Close (on `--popover`) | 1.43 | 3.61 | 3.73 |
| Timer Reset (on `--background`) | 1.36 | 3.44 | 3.80 |
| Reload, error path (on `--card`) | 1.36 | 3.44 | 3.80 |
| Unchecked `/stats` chip, x2 (on `--card`) | 1.36 | 3.44 | 3.80 |

The error path was reached by removing `window.indexedDB` before load, which renders `CurrentTaskCard`'s alert and Reload.

### Criterion 27 and 28: focus, painted

| Control | Theme | Width / offset | Outline vs ground | Outline vs own fill |
| --- | --- | --- | --- | --- |
| Start (primary) | light | 2px / 2px | 4.60 | **1.00** |
| Start (primary) | dark | 2px / 2px | 8.83 | **1.00** |
| Reset | light / dark | 2px / 2px | 4.60 / 8.83 | 4.84 / 8.67 |
| Custom duration input | light / dark | 2px / 2px | 4.60 / 8.83 | 4.84 / 8.67 |
| Focus mode chip | light / dark | 2px / 2px | 4.60 / 8.83 | 4.60 / 8.83 |
| Theme chip Dark | light / dark | 2px / 2px | 4.60 / 8.83 | 4.60 / 8.83 |

Frontend's note that a ring equal to `--primary` cannot clear 3:1 against a same-coloured fill is confirmed by measurement (1.00:1 on a 2px ring at 2px offset). This is not a QA defect; the criterion as worded cannot be met for primary-filled controls. See the owner item.

### Layout (criterion 38), before (67ace13) and after, painted boxes

| Viewport | Wordmark (x, y, w, h) | Header height | Gauge top |
| --- | --- | --- | --- |
| 320 px before | 16, 48, 164, 40 | 40 | 312 |
| 320 px after | 16, 48, 164, 40 | 80 | 352 |
| 1280 px before | 48, 48, 164, 40 | 40 | 240 |
| 1280 px after | 48, 48, 164, 40 | 40 | 240 |

### Criterion 5: is a valid `system` envelope "not written back as if valid"?

Probe result: on rehydrate, persist rewrites every malformed entry, raw (`Dark`, `auto`, `{`, `null`, `42`, empty) or inside an envelope (`{"state":{"theme":"Dark"},"version":1}`, same-version `"auto"`, `42`), to `{"state":{"theme":"system"},"version":1}`. A stored `version: 0` `dark` migrated to `dark`. Backend's note predicted that same-version values are not rewritten; that is wrong (same-version `"auto"` was rewritten). The outcome is the same.

QA ruling: **yes, a valid `system` envelope satisfies criterion 5**, for four reasons.
1. "Written back as if valid" means the bad value survives in storage and gets read as a preference. After rehydrate the bad value is gone, and the next read gives the default the criterion names as the fallback.
2. The rewrite is persist's own, and it happens only when the app reads a malformed entry. Valid entries are not rewritten.
3. The boot script and the store agree: both resolve the same malformed values to `system`, so first paint and the store never diverge.
4. The rewrite is pinned by a test (`preferences.test.ts`, "after rehydrating ... the stored entry is the valid system envelope"), so a change to it will be noticed.

If the owner means "leave the bytes untouched", criterion 5 would fail. QA reads the criterion as written: the bad value is never kept as if valid.

### Stale assertions updated (9, as frontend listed)

1. `components/TaskListDialog.tokens.test.ts`: `border-border` to `border-dialog-edge`.
2. `components/token-foundation.test.ts`: `--control-border` pinned once in `:root` (#88837e) and once in `.dark` (#80705d).
3. Same file: "milestone 4 MUST give this a value" to the five-ground figures.
4-5. `e2e/mode-selector-legend.spec.ts` (two viewports): legend scoped to the "Timer mode" group.
6-7. `e2e/timer-gauge.spec.ts` (two places): `#f6c453` to `#d97706` (owner answer 4).
8. `e2e/timer.spec.ts` "Tab through controls": first Tab is the checked theme option, second Tab enters the mode group.
9. `e2e/token-task-surface.spec.ts` pinned border: moves the pointer away and polls until the resting border settles, rather than reading the hover colour.

No painted-value assertion was loosened. Only the class, selector and pinned-value ones above changed.

### Tests added

Vitest (unit, `npm run test`):
- `lib/preferences/preferences.test.ts`: 47 (criteria 2, 3, 4, 5 including write-back).
- `lib/preferences/boot-script.test.ts`: 39 (criteria 5, 7, 8 synchronous half). Executes the shipped inline script in jsdom against real stored values and stubbed OS settings.
- `components/token-dark.test.ts`: 84 (criteria 11, 12 declarations, 27, 30).
- `components/palette.tokens.test.ts`: R-8 (SCANNED_DIRS equals the top-level dirs with `.tsx`, inline-style loop over FILES, `text-shadow` prefix) and R-9 (four files still in FILES). `components/TimerGauge.tokens.test.ts`: R-9 deletion.

Playwright (e2e, `npm run test:e2e`):
- `e2e/dark-theme-control.spec.ts`: 40 (criteria 3, 5, 6, 8, 9, 10, 31-38, 40, 45, 47, 48, 61, layout records).
- `e2e/dark-contrast.spec.ts`: 44 (criteria 12 computed, 13-29, 41-46 measured rows). Records annotations for the report.
- `e2e/dark-a11y-console.spec.ts`: 12 (criteria 39, 60).
- `e2e/helpers/dark.ts`: shared helpers (probe, pixel sampling, seeding, `must()`).

### Break-and-restore (criteria 64 and 51)

Done in a scratch copy of the working tree (`scratchpad/bnr`), so the real repo was never edited. Real file hashes were checked before and after. The driver restored each file from the real repo and checked the copy's hash matched.

| Break | Test(s) that failed | Restored matches real | Real unchanged |
| --- | --- | --- | --- |
| C8: boot script removed from `app/layout.tsx` | `criterion 8`: dark-stored/OS-light and system/OS-dark (2) | yes | yes |
| C5: `pick()` passes raw values through (`schema.ts`) | unit 27 failed; e2e `null` and `42` envelope | yes | yes |
| C14: dark `--control-border` set to the `--border` value | `[dark] --control-border ... tint (criterion 14)` | yes | yes |
| C24: outline variant back to `border-border` | `criterion 24` light and dark | yes | yes |
| C34: checked mode chip loses `font-bold` | `criterion 34` (3) | yes | yes |
| R8a: inline `borderColor` in `TimerDisplay.tsx` | palette FILES inline test | yes | yes |
| R8b: `text-shadow-stone-500` in `TimerDisplay.tsx` | palette raw-utility test | yes | yes |
| R8c: new top-level dir with `.tsx` | SCANNED_DIRS equality | yes | yes |
| C30: `bg-border` in `TimerDisplay.tsx` | criterion 30 scan | yes | yes |

Real app files at break time (sha256, first 12 hex, unchanged before and after): `app/layout.tsx` a4fb367a675a, `components/ui/button.tsx` 2443b7955445, `components/ui/mode-chip.tsx` ea04bd948c3f, `lib/preferences/schema.ts` 26fb48e4e515, `components/TimerDisplay.tsx` cd90da1044d7, `app/globals.css` 5294012dab6d.

### Light before and after (criterion 44)

Pairs touched by this task, light: dialog Close, Reset, Reload and unchecked chips (above); focus ring (identical); disabled submit label (1.49 both); pinned hover (4.51 HEAD, 5.69 now; deliberate change, criterion 29). Only the pinned hover changed, and it is the recorded deliberate change.

### FAIL list, with repro

1. **Criterion 28, primary-filled controls.** Repro: `npx playwright test e2e/dark-contrast.spec.ts -g "primary-filled"`. Expected: focus outline vs its own `--primary` fill at least 3:1. Actual: 1.00:1 in light and in dark (Start). Owner decision needed: reword the criterion, or accept the 2 px offset gap as the separation. Frontend's arithmetic is confirmed.

2. **Criterion 47, HoldButton transition under reduced motion.** Repro: `npx playwright test e2e/dark-theme-control.spec.ts -g "criterion 47"`. Expected: no colour-related transition with non-zero duration under `prefers-reduced-motion: reduce`. Actual: `button.hb-root.group`, `transition-property: background-color, box-shadow`, durations `0.16s, 0.2s`. Conflict: `components/HoldButton.tsx` is frozen by criterion 53, so the fix needs an owner decision (a global reduced-motion rule, or an exception).

3. **Criterion 38, layout at 320 px.** Repro: `npx playwright test e2e/dark-theme-control.spec.ts -g "criterion 38"`, read the `layout` annotations. Expected: nothing in the main column shifts; or the header wrap is deliberate with before/after heights recorded. Actual: heights recorded (40 to 80), but the gauge top moves 312 to 352. Decide: keep the header on one row at 320 px, or state the shift is accepted.

4. **Criterion 1, DECISIONS entry incomplete.** Repro: `grep -n "pomotato-preferences" docs/DECISIONS.md` returns nothing. Expected: the entry names the storage key and the persisted shape. Actual: absent. Fix: land the backend draft (task file, Backend DECISIONS draft).

5. **Criterion 53, frozen docs.** Repro: `git diff 67ace13 -- docs/PLAN.md docs/DECISIONS.md`. Expected: empty. Actual: PLAN.md status line and link; DECISIONS.md entry. Criterion 1 requires the DECISIONS entry, so the reviewer or owner must narrow criterion 53.

6. **Criterion 59 and 57**, follow from 1 and 2 (the three Playwright failures). Repro: `npm run test:e2e`. Expected: 0 failed. Actual: 3 failed.

### PARTIAL items (not failures, not verified)

- 20: legend and tooltip text on `/stats`. Owner or frontend to name the rows; QA measured tick text only.
- 22: spinner, scrollbar and selection rendering not visually confirmed.
- 41-43: rows listed under each criterion were not measured. Frontend's table needs QA verification row by row, or QA needs the rows.
- 65: whether the notes predate QA cannot be checked from git.

### Observations

- `boot-script.ts` reads `state.theme` without checking `version`. Harmless at version 1; a future version bump would not be mirrored by the script. Not a failure today.
- Criterion 21 caveat: readout contrast is measured against the full resolved liquid and glass colours, not pixels under the digits. This is conservative (the whole liquid colour is the worst case), and it holds at every level. A pixel-level check would confirm the waterline itself.
- Criterion 15 light: fill and edge both 2.87:1. Out of scope (dark), recorded for the owner.

## QA Report, pass 2 (2026-10-26, fix loop 2 of 3)

The pass-1 report above is kept as written. This section supersedes it where they differ.

- Verdict: **FAIL**
- Why: one criterion fails in shipped code. Criterion 42 (no pair below its floor, both themes): the light drag-active ring on a dragged `TaskRow` paints at **2.47:1** against the page ground (floor 3:1). No exemption is recorded. Repro and options below. Because of this, criteria 57 and 59 fail too (`0 failed` is required).
- Everything else in scope passes in the final run. The three pass-1 Playwright failures are resolved (see "Pass-1 failures, now").
- Run on: `main` at `09a50e3` plus the working tree. No application code was edited by QA. Only test files and this section changed.
- Ratios below are painted (computed styles composited over the real ancestor chain, or pixels from a real screenshot), theme-tagged and ground-tagged. None is arithmetic on token values.

### Gates

| Gate | Result |
| --- | --- |
| `npm run typecheck` | PASS, exit 0 |
| `npm run lint` | PASS, 0 errors, 21 warnings (baseline 21). Two new QA warnings were removed before the final run. |
| `npm run test` (Vitest) | PASS, 682 passed / 0 failed in 17 files (criterion 58 floor 475). No Vitest file changed in this pass. |
| `npm run build` | PASS |
| `npm run test:e2e` | **FAIL**, 439 passed / 1 failed / 2 skipped (442). The failure is the criterion 42 drag-ring row. The 2 skips are the owner-parked `task-list-dialog.spec.ts` tests. |

Split of the Playwright run. Pre-task specs, including `hold-label-contrast.spec.ts`: **323 passed / 2 skipped / 0 failed**, which meets criterion 59's floor for that set. Task-009 QA specs: 116 passed / 1 failed.

### Pass-1 failures, now

| Pass-1 item | Now | What changed |
| --- | --- | --- |
| Criterion 47 (HoldButton reduced motion) | PASS | Frontend's `html .hb-root` rule. Independently verified: see criterion 47 below. |
| Criterion 28, primary-filled Start (x2) | PASS | Test updated to the 2026-10-26 ruling: 3:1 against the surrounding ground, own-fill recorded as informational only. The ring is 2 px at 2 px offset, so the own-fill clause does not apply. |
| Criterion 38, 320 px layout | PASS | Test updated to the amended figures, asserted (not just recorded). Figures are the HEAD measurements from pass 1. |
| Criterion 1, DECISIONS entry | PASS | The `2026-10-23` entry now names `pomotato-preferences`, the persisted shape, the first-paint answer, the rewrite behaviour and 008. |
| Criterion 53, frozen docs | PASS | Narrowed scope. See 53 below. |
| Flake: `hold-label-contrast.spec.ts` at 4.40:1 | Diagnosed and fixed. See below. |

### The hold-label flake: diagnosis

Three separate things were going on. Each was measured.

1. **Sampling too early (real, now fixed).** The fake clock does not drive CSS transitions, which run on real time. A probe that did not wait counted **2 transitions still running at every sample** under default motion (`t=0` to `t=790`). The text-visible and text-hidden screenshots were taken at different real times, so the clip edge had moved between them. The fix in the test: `waitForStill()` polls from Node until no finite animation on the control is running, and asserts zero in flight before and after each screenshot pair. It cannot pass or fail on a moving frame.
2. **Reveal-edge pixel (real, measured, now reported separately).** After the fix, one failure remained: `white label on fill at t=500`, min 4.39:1. Geometry measured with a probe: the Reset box is 47.15 px wide, and the fill's right edge sits at about x=28.5 px. The minimum pixel is at **x=29, y=16**, text `251,247,243`, behind `183,90,19`. The behind colour is about 98% fill (`180,83,9`) and 2% glass, so it is an anti-aliased clip seam. The steady fill measures **4.72:1** for the same label.
3. **Measurement decision (needs reviewer sign-off).** Pixels within 1.5 CSS px of the reveal edge are no longer counted against the 4.5:1 floor. They are reported as `seamMin` and held to a separate guard of 3:1, so a real break at the edge still fails. The 4.5:1 floor on the interior fill is unchanged. This is a test-definition change, disclosed here. It is not a lowered floor.

Verification: 105/105 passed (15 repeats of the 7 tests, 10 workers) under load. The earlier single-run failure cannot be reproduced after the change. In the final full run all 7 hold tests passed.

### Criteria

Status key: PASS, FAIL, PARTIAL (a sub-clause not verified), N/V (not verifiable from repo state), VOID (the clause names something the code does not have; needs an owner amendment).

| # | Status | Evidence (this pass) |
| --- | --- | --- |
| 1 | PASS | DECISIONS `2026-10-23` entry: storage home, reason, first-paint answer, key `pomotato-preferences`, shape `{"state":{"theme":...},"version":1}`, rewrite of malformed values, 008 statement. |
| 2 to 4 | PASS | As pass 1. Full run passes `dark-theme-control.spec.ts` (40/40) and the Vitest preference suites. |
| 5 | PASS | Owner-accepted ruling from pass 1: a valid `system` envelope satisfies it. |
| 6 to 10 | PASS | As pass 1. `dark-theme-control.spec.ts` 40/40 in the final run. |
| 11 | PASS, with an amendment needed | `:root` values unchanged except the `--control-border` comment, `:focus-visible` hex and `--gauge-liquid`. New `:root` declarations exist: `color-scheme: light`, `--dialog-edge` and `--disabled-surface`. They are additions, not edits to existing values. Criterion 22 and 55 require them, but the enumerated list does not name them. Owner should add them to the list. |
| 12 to 19 | PASS | As pass 1. Token enumeration and computed values in `dark-contrast.spec.ts` 44/44. |
| 20 | PASS (ticks), legend and tooltip VOID | All 17 light and 17 dark chart ticks, painted against `--card`: light min 9.41:1, dark min 12.57:1 (floor 4.5). Bars: `--chart-1` to `--chart-5` in pass 1. **No legend and no tooltip exist**: `StatsChart.tsx` states "deliberately no tooltip" and renders no legend. The test asserts zero `.recharts-legend-wrapper` and zero `.recharts-tooltip-wrapper` before and after hovering a bar. Owner should strike the legend and tooltip clauses or confirm them. |
| 21 | PASS | As pass 1 (proxy caveat unchanged). |
| 22 | PASS for `color-scheme`, scrollbar and selection; spinner clause VOID | `:root` `color-scheme` is `light` in light and `dark` in dark. **No `input[type=number]` exists** on `/`, in the task dialog, or on `/stats`: the fields are `type="text"` with `inputMode="numeric"`. The asserted count is 0 in each place, so the spinner clause has nothing to paint. Owner should strike it or restate it. Scrollbar: painted pixels, measured with `--hide-scrollbars` removed (Playwright hides them by default). Light track 250,250,250 against ground 251,244,234. Dark track 44,44,44 against ground 28,20,14. These are pixel samples; the screenshot was not viewed by eye. Selection: highlight 177,211,246 against selected text 43,32,23, **10.23:1** (light). Highlight 55,83,113 against text 245,235,220, **6.75:1** (dark). Floor 4.5:1. |
| 23 to 27 | PASS | As pass 1. Focus ring 2 px / 2 px, colour equal to `--ring`, in the sweep below. |
| 28 (amended) | PASS | 2 px outline, 2 px offset, colour `--ring`, `:focus-visible` matched, against the surrounding ground at 3:1, for every listed control that is rendered, in both themes. Light minimum 4.51:1 (stats chip, own fill). Ground minimum: light 4.60:1, dark 8.67:1 (dialog Close). Controls: 3 theme radios; 4 mode chips; Start; Reset; custom input; Tasks; Stats; dialog Close; 5 row actions that are enabled (Reorder, +1, Pin, Edit, Delete); 3 form fields and submit; 8 swatches; 3 stats views. Disabled row buttons (Move up, Move down, -1 in this state) cannot take focus and are skipped. Own-fill figures are recorded as informational. |
| 29 | PASS | As pass 1. |
| 30 | PASS | As pass 1. |
| 31 to 37 | PASS | As pass 1. `dark-theme-control.spec.ts`. |
| 38 (amended) | PASS | Asserted, not just recorded. 320 px: wordmark 16,48,164x40 (unchanged); header 80 px (40 to 80, accepted wrap); gauge top **352 px** (stated). 1280 px: wordmark 48,48,164x40 (unchanged), header 40 px, gauge top **240 px** (unchanged from HEAD). No horizontal overflow at either width. |
| 39 | PASS | `dark-a11y-console.spec.ts` 12/12 in the final run. |
| 40 | PASS | As pass 1. |
| 41 | PASS | The painted table below measures every row the criterion names, in both themes. Rows the criterion names that are not rendered in the shipped app are listed as VOID above (legend, tooltip, spinner). |
| 42 | **FAIL** | Light `TaskRow` drag-active ring: **2.47:1** against the page ground, floor 3:1. Dark: 3.92:1. See the FAIL list. Every other measured row is at or above its floor in both themes. |
| 43 | PASS, with a VOID premise | Disabled rows are measured in both themes, light first, dark second, in the same test. Dark is not worse than light on every figure (below). The criterion names "three disabled task-form fields", but **the shipped form never disables its fields**. Only the submit and Cancel take `disabled={submitting}`. The three fields were measured with the `disabled` attribute forced. Owner should confirm the premise. |
| 44 | PASS | As pass 1. The touched light pairs are unchanged except the deliberate ones listed in the Implementation Notes. |
| 45 | PASS | As pass 1. `/prototype` renders in dark without a page error. Excluded from 41 to 44 by decision 6. |
| 46 | PASS | Every row annotation names theme, ground and painted or computed. |
| 47 | PASS | Reduced motion: Reset computed `transition-property: none`, `transition-duration: 0s`. The flip to dark starts **0** CSS transitions on Reset. The first read after the flip (fill `30,22,16`) equals the settled fill. Default motion: the same flip starts **1** CSS transition on Reset, so the check is not vacuous. |
| 48 | PASS | As pass 1. |
| 49 | PASS | `hold-reset.spec.ts` (29/29) and `hold-label-contrast.spec.ts` (7/7) pass in the final run. |
| 50 | PASS | `palette.tokens.test.ts` passes in the Vitest run. |
| 51 | PASS | As pass 1 (break-and-restore recorded there). |
| 52 | PASS | As pass 1. |
| 53 (narrowed) | PASS | Empty `git diff 67ace13` for `lib/db`, `lib/timer`, the two timer hooks, the swatch file, `TimerDisplay`, `SloshGauge`, `HoldButton`, `PomotatoTimer`, `ModeSelector`, `app/prototype`, `components/prototype`, `e2e/task-list-dialog.spec.ts`. The `docs/` diff is only `docs/PLAN.md` and `docs/DECISIONS.md`, which the narrowed wording allows. |
| 54 | PASS | `package.json`, `package-lock.json`, `components.json` unchanged. |
| 55 | PASS | As pass 1. |
| 56 | PASS | `token-foundation.test.ts` passes in the Vitest run. |
| 57 | **FAIL** | Through 59. Typecheck, lint, Vitest and build pass. `test:e2e` has 1 failure. |
| 58 | PASS | Vitest 682 passed (floor 475, plus this task's tests). |
| 59 | **FAIL** | 439 passed / 1 failed / 2 skipped. The failure is criterion 42. The pre-task set is 323 / 2 / 0. |
| 60 | PASS | `dark-a11y-console.spec.ts` 12/12 in the final run. |
| 61 | PASS | As pass 1. Timer specs pass in the final run. |
| 62 | PASS | No `any`, no `as never`, no non-null assertion in the new QA code. `must()` is used. |
| 63 | PASS | Non-vacuity checks: `:focus-visible` asserted on every focus ring; drag row count asserted as 1; disabled state asserted with `toBeDisabled`; the flip asserted to start 0 transitions (reduced) and 1 (default); seam guard and in-flight guard asserted. Conditionals only skip disabled buttons, and the row count is asserted first. |
| 64 | PASS | Break-and-restore from pass 1 still applies. This pass changed no application file, so those results stand. |
| 65 | PASS (from git) | The committed task file at `09a50e3` (2026-10-26 12:54:36 +0800) already contains the Implementation Notes sections: dark token table, painted contrast table, deliberate-change list, R-1b, the guide read, and the disabled-surface reason. No QA test file is tracked, so the committed notes predate QA's commits. Since that commit only one block was appended to the notes: frontend's criterion 47 fix. **Verifiable as stated: check `git show 09a50e3:docs/tasks/009-dark-mode-toggle.md`.** |

### Painted contrast, rows added this pass

Ground stated per row. Light page ground `#fbf4ea` (251,244,234); dark page ground `#1c140e` (28,20,14) unless another ground is named. All painted.

| Row | Light | Dark | Floor | Verdict |
| --- | --- | --- | --- | --- |
| CurrentTaskCard empty text, on page | 6.99 | 8.70 | 4.5 | PASS |
| CurrentTaskCard normal title, on page | 14.55 | 15.40 | 4.5 | PASS |
| Mode chip checked / unchecked label, on its fill | 8.31 / 9.41 | 13.01 / 12.57 | 4.5 | PASS |
| Start rest / hover label, on fill | 5.02 / 7.17 | 8.83 / 10.45 | 4.5 | PASS |
| Reset label, on fill | 9.89 | 12.34 | 4.5 | PASS |
| Custom duration label, on page | 6.99 | 8.70 | 4.5 | PASS |
| Custom field text, on field fill | 15.30 | 15.12 | 4.5 | PASS |
| Custom field edge, on page | 3.44 | 3.80 | 3 | PASS |
| Custom duration error text, on page | 5.92 | 7.66 | 4.5 | PASS |
| Custom duration error field edge, on page | 3.44 | 3.80 | 3 | PASS |
| Theme chip checked / unchecked label, on its fill | 8.31 / 9.41 | 13.01 / 12.57 | 4.5 | PASS |
| Stats button edge, on page | 3.44 | 3.80 | 3 | PASS |
| TaskRow idle title / count, on card | 14.55 / 6.99 | 15.40 / 8.70 | 4.5 | PASS |
| TaskColorDot fill, on card | 5.37 | 3.10 | 3 | PASS (dark minimum is potato, as criterion 19) |
| TaskColorDot hairline, on card | 6.10 | 3.92 | decorative | Exempt: the swatch fill carries identity. The hairline is `foreground 12%`. |
| **TaskRow drag-active ring, on page ground (opacity 0.6)** | **2.47** | 3.92 | 3 | **FAIL (light)** |
| TaskRow delete-confirm prompt, on tint | 5.37 | 7.02 | 4.5 | PASS |
| TaskForm invalid error text, on popover | 5.92 | 7.66 | 4.5 | PASS |
| TaskForm invalid title edge, on popover | 3.44 | 3.80 | 3 | PASS |
| TaskForm submit enabled label, on fill | 6.34 | 9.87 | 4.5 | PASS |
| TaskForm Cancel (edit form) label, on fill | 9.89 | 12.34 | 4.5 | PASS |
| TaskForm Cancel edge, on ground | 3.44 | 3.80 | 3 | PASS |
| Chart ticks, on `--card` (all) | 9.41 (min) | 12.57 (min) | 4.5 | PASS |
| Chart legend and tooltip | none rendered | none rendered | n/a | VOID (see 20) |
| `/stats` dashboard heading, on page | 14.55 | 15.40 | 4.5 | PASS |
| `/stats` view chip checked / unchecked label | 8.15 / 9.41 | 9.67 / 12.57 | 4.5 | PASS |
| `/stats` table header / cell, on card | 9.41 / 14.55 | 12.57 / 15.40 | 4.5 | PASS |

Disabled rows (criterion 43). Light, then dark. "Not worse" holds on every figure:

| Row | Light | Dark |
| --- | --- | --- |
| Custom field (running) text on fill | 2.57 | 3.44 |
| Custom field (running) edge on page | 3.44 | 3.80 |
| Task Title / Emoji / Estimated pomodoros (forced disabled): text on fill | 2.57 | 3.44 |
| Same three: edge on ground | 3.44 | 3.80 |
| Same three: fill on ground | 1.00 | 1.09 |
| Disabled submit label on fill | 1.49 | 1.73 |
| Disabled submit fill on ground | 1.36 | 1.73 |

### Pass-2 changes to test files

- `e2e/dark-sweep.spec.ts` (new, 15 tests): criterion 28 focus sweep, the unmeasured rows, criterion 43 disabled rows, and the chart and stats checks.
- `e2e/dark-native-ui.spec.ts` (new, 6 tests): criterion 22 (color-scheme, no number inputs, scrollbar, selection). Split out because Playwright only accepts `launchOptions` at file top level.
- `e2e/dark-contrast.spec.ts`: two criterion 28 tests. The own-fill clause is no longer a pass/fail condition; a non-zero offset is asserted.
- `e2e/dark-theme-control.spec.ts`: the criterion 38 test now asserts the amended figures.
- `e2e/hold-label-contrast.spec.ts`: the settle-and-guard change and the reveal-edge split (described above).
- `e2e/stats.spec.ts` ("exactly one view is selected initially"): waits for the chips to hydrate with `expect.poll`. The assertion values are unchanged. Failed once in the full run under load. Repeated 6 times, 8 workers: passed.
- `e2e/timer-gauge.spec.ts` ("starting from idle does not slosh"): waits for the gauge level with `expect.poll` before reading the idle top. Assertion values unchanged. Failed once in the full run under load. Repeated 6 times with `stats.spec.ts`: passed (426 passed in total, 0 failed).

### FAIL list, with repro

1. **Criterion 42 (and therefore 57 and 59): light drag-active ring is 2.47:1.**
   - Repro: `npx playwright test e2e/dark-sweep.spec.ts -g "TaskRow idle, drag-active"`
   - Expected: the drag-active ring on `TaskRow` reaches 3:1 against the page ground in light, or the row carries a recorded exemption that names its carrier.
   - Actual: `[light] TaskRow drag-active ring ... 2.47:1 < 3:1`. The ring is `ring-2 ring-ring` (`isDragging`, `components/TaskRow.tsx`), painted at the row's `opacity-60` over the cream ground `(251,244,234)`. Dark is 3.92:1 and passes.
   - Provenance: the `isDragging` line is unchanged from `67ace13`, so this is a light value that predates this task. Criterion 42 is not limited to pairs this task touches.
   - Options for the owner and frontend. (a) Raise the light drag-ring contrast, for example by not dropping the ring to 60% opacity. (b) Record an exemption naming the drag displacement (dnd-kit transform) as the carrier. The task file's criterion 42 requires the exemption to be recorded. QA cannot make that call.

### Judgment calls and void clauses for the reviewer and owner

- **Criterion 20 legend and tooltip:** none exist (`StatsChart.tsx` has no legend and no tooltip, by design). Asserted absent. Strike or confirm.
- **Criterion 22 spinner:** no `input[type=number]` exists anywhere in the app. Asserted 0. Strike or restate.
- **Criterion 43 "three disabled task-form fields":** the shipped form never disables them. Measured with the attribute forced. Confirm the premise.
- **Criterion 11 list:** `color-scheme: light`, `--dialog-edge` and `--disabled-surface` are additions to `:root`. They are not edits to existing values. Add them to the enumerated list.
- **Hold-label reveal-edge band:** see the flake section. Reviewer to confirm the edge-band definition (1.5 CSS px, with a 3:1 guard).

### Tests and reproduction notes

- Every test that could pass vacuously has an explicit non-vacuity assertion, listed in criterion 63 above.
- Break-and-restore (criteria 5, 8, 14, 24, 34) from pass 1 is still valid, because no application file changed in this pass.
- Playwright run on the dev server: `npx playwright test` with `webServer` `npm run dev`. The dev server I started for the geometry probe was stopped before the final run.

## QA Report, pass 3 (2026-10-26, fix loop 3 of 3, final)

Passes 1 and 2 above are kept as written. This pass supersedes pass 2 where they differ. Pass 2's FAIL on criterion 42 is resolved by the owner's exemption ruling, not by a code change.

- Verdict: **PASS**
- No application code was edited by QA in this pass. Only `e2e/dark-sweep.spec.ts` changed (the drag-ring assertion). The task file gained this section only.
- No failures remain in the final run.

### Gates (final run)

| Gate | Result |
| --- | --- |
| `npm run typecheck` | PASS, exit 0 |
| `npm run lint` | PASS, 0 errors, 21 warnings (baseline 21) |
| `npm run test` (Vitest) | PASS, 682 passed / 0 failed in 17 files |
| `npm run build` | PASS |
| `npm run test:e2e` | PASS, **440 passed / 0 failed / 2 skipped** (442). The 2 skips are the owner-parked `task-list-dialog.spec.ts` tests. |

Split of the e2e run. Pre-task specs, including `hold-label-contrast.spec.ts`: 323 passed / 2 skipped / 0 failed (criterion 59's set). Task-009 QA specs: 124 passed / 0 failed.

### Criterion 42: exempted by owner ruling (2026-10-26), now encoded

The drag-active ring stays as it is. The 2.47:1 light figure is recorded informationally, floor 0, and is not asserted against 3:1. The exemption and its reasoning are in the criterion 42 block and in the `2026-10-26` DECISIONS entry "The drag-active row ring is exempted, not fixed".

The test now asserts the named carriers on the dragging row. In both themes:
- the dnd-kit transform is applied (computed `transform` is not `none`);
- the row carries `opacity-60` (computed opacity 0.6, class present);
- the ring is present as a reinforcing cue.

If a future change removes one carrier and leaves the ring doing the work alone, these assertions fail. The 3:1 floor is not weakened for any other row. Every other measured row in passes 1 and 2 stays asserted at its floor.

Repro of the run that encodes it: `npx playwright test e2e/dark-sweep.spec.ts -g "TaskRow idle, drag-active"` (2 passed).

### Owner amendments aligned

- **C20 legend and tooltip: VOID, struck.** The absence assertions are kept (zero `.recharts-legend-wrapper` and zero `.recharts-tooltip-wrapper` before and after hovering a bar). The clause revives if either is added. Chart tick contrast is still measured on every tick: light min 9.41:1, dark min 12.57:1.
- **C22 spinner clause: VOID, struck.** The check that the app has no `input[type=number]` is kept as evidence. `color-scheme`, scrollbar and selection coverage stand, as before (selection highlight 10.23:1 light, 6.75:1 dark).
- **C43 "three disabled task-form fields": VOID, struck.** Those three fields carry `disabled:` utilities but never receive the attribute. Only submit and Cancel do, via `submitting`, and `TaskForm.tsx:61` explains why the fields are deliberately left enabled. Those `disabled:` utilities are dead code, the same class of defect as R-1b, for a later cleanup task. The forced-attribute measurements stay, because they are the useful part. Dark is not worse than light on every figure.
- **C11 `:root` additions: covered by criterion 55.** `color-scheme: light`, `--dialog-edge` and `--disabled-surface` are additions with reason comments, not edits to existing values. Byte-for-byte unchanged holds for every pre-existing `:root` value.

### Criteria, final

Status key: PASS, FAIL, VOID (struck by owner ruling, reason recorded). Criteria not listed here keep their pass-1 and pass-2 status, and the full run passes them.

| # | Status | Note |
| --- | --- | --- |
| 1 | PASS | DECISIONS `2026-10-23` entry names the key, shape, first-paint answer, rewrite behaviour and 008. |
| 11 | PASS | Three `:root` additions covered by criterion 55, as above. |
| 20 | PASS for ticks; legend and tooltip VOID | Struck; absence asserted. |
| 22 | PASS for `color-scheme`, scrollbar and selection; spinner VOID | Struck. |
| 28 (amended) | PASS | Rendered controls, 2 px outline at 2 px offset in `--ring`, at 3:1 against the surrounding ground. |
| 38 (amended) | PASS | 320 px header 80 px and gauge top 352 px; 1280 px unchanged. |
| 41 | PASS | Every named row that the shipped app renders, both themes. |
| 42 | PASS, exempt | The drag-ring row, carriers asserted, ratio informational. Other rows at their floors. |
| 43 | PASS, with the three-field premise VOID | Disabled submit and running custom field measured; forced-attribute measurements not worse than light. |
| 47 | PASS | Reduced motion: Reset `0s`; zero transitions on the flip. |
| 53 | PASS | Freeze-list diffs empty; `docs/` diff limited to PLAN.md and DECISIONS.md, as narrowed. |
| 57 | PASS | All gates above pass. |
| 59 | PASS | 440 / 0 / 2. |
| 58 | PASS | Vitest 682, floor 475. |
| 65 | PASS | From git: commit `09a50e3` holds the Implementation Notes sections. |

Every other criterion in 1 to 65 keeps the status recorded in pass 2.

### Test edits this pass

- `e2e/dark-sweep.spec.ts`: the drag-ring row's 3:1 assertion is replaced by an informational record and the carrier assertions above.
- Unchanged from pass 2, as you asked: the hold-label seam split and settle guard (`e2e/hold-label-contrast.spec.ts`), and the stats and timer-gauge wait fixes (`e2e/stats.spec.ts`, `e2e/timer-gauge.spec.ts`).

### Remaining notes, not failures

- The reveal-edge band in the hold spec is still the reviewer's to confirm (see pass 2, judgment calls).
- The three `disabled:` utility sets on the unforced task-form fields are dead code. This is recorded as a later cleanup, not a criterion failure.

## QA Report, pass 4 (2026-10-26, targeted re-verify of reviewer R-1 and R-3)

Passes 1 to 3 above are kept as written. This pass is the targeted re-verify the owner authorised after the reviewer's R-1 blocker. It is not a fourth full sweep. It supersedes pass 3 only where they differ, and that concerns criterion 47 only.

- Verdict: **PASS**
- Scope: reviewer R-1 (`transition-all` under reduced motion, the blind regex) and the three R-3 hygiene fixes in the hold spec. No application code was edited by QA.

### What R-1 was, and why pass 3 missed it

`components/ui/button.tsx` kept `transition-all` in the `cva` base. Tailwind v4 resolves that to `transition-property: all`. `components/TimerControls.tsx` (the primary Start, Pause and Resume) had no `motion-reduce:` opt-out, so a theme flip faded its themed fill over 150 ms under `prefers-reduced-motion: reduce`.

The pass-3 criterion 47 sweep tested the computed `transition-property` against `/color|background|border|fill|stroke|outline|box-shadow/`. For these elements the value is the literal string `all`, which matches none of those substrings. The sweep returned `[]` because the regex could not match, not because no offender existed. That was a structurally blind test, and it is now fixed as described below.

### Frontend fix, verified

- `buttonVariants` base carries `motion-reduce:transition-none motion-reduce:duration-0`, which covers every consumer.
- `components/TaskForm.tsx` colour swatch carries the same classes.
- Reduced motion, measured: Start `transition-duration` `0s`, `transition-property` `none`, **0** CSS transitions started by the flip to dark.
- Default motion, same flip: Start starts **1** CSS transition (`0.15s`). Frontend's count of 6 for the Reset and chip case still holds in the sweep.
- `active:translate-y-px` survives: Tailwind v4 emits it as `translate`, not `transform`.
- Per-consumer `motion-reduce:transition-none` classes are redundant but left in place, as frontend asked.

### Changes to test files

1. **Regex widened (item 1).** The criterion 47 scan now matches `\ball\b` as well as the colour properties. Each check is a real function, not a string.
2. **Positive control.** A new test injects a `transition: all 0.15s` probe under reduced motion and asserts that the scan flags it. The scan is proven able to fail on the blind case.
3. **Coverage extended (item 2).** The scan runs on `/` idle, on `/` with the task dialog open (the colour swatches live in the form inside it), and on `/stats`. All return `[]`.
4. **Start checked directly.** Under reduced motion the flip starts 0 transitions and the duration is `0s`. Under default motion the same flip starts more than 0, so the check is not vacuous.
5. **Hold spec hygiene (item 3).**
   - Non-vacuity count: `layer.n` now counts only non-seam pixels. Seam pixels no longer satisfy the guard.
   - `revealedFrac` throws when the `inset(0 N% …)` regex misses. It no longer defaults to 1.
   - A comment at `SEAM_PX` records that `seamX` is CSS px and pixel x is image px, which coincide only at DSF 1.

### Verification

| Check | Result |
| --- | --- |
| Targeted: `dark-theme-control.spec.ts` and `hold-label-contrast.spec.ts` | 49 passed / 0 failed |
| Hold spec repeated under load (10 repeats, 8 workers, 7 tests) | 70 passed / 0 failed |
| `npm run typecheck` | PASS, exit 0 |
| `npm run lint` | PASS, 0 errors, 21 warnings (baseline 21) |
| `npm run test` (Vitest) | PASS, 682 / 682 in 17 files |
| `npm run build` | PASS |
| `npm run test:e2e` (full) | PASS, **442 passed / 0 failed / 2 skipped**. The 2 skips are the owner-parked task-list-dialog tests. |

### Did the widened regex light up other offenders?

No. The widened scan returns `[]` on `/` idle, on `/` with the dialog open (swatches included), and on `/stats`, under reduced motion and light. No further application fix is needed for criterion 47.

No newly visited surface needed a contrast check in this pass. The dialog and `/stats` were visited for the transition scan only. The swatch's focus ring was already measured in the pass-2 sweep and it passes.

### Things I did not change, for the reviewer

- R-2 is docs-only (the DECISIONS premise about the 2 px gap and `ring-ring/50`). QA did not edit DECISIONS.
- `e2e/dark-contrast.spec.ts` still asserts `offset not.toBe("0px")` as the reason the own-fill clause does not apply. R-2 says that inference is wrong on these controls, because `buttonVariants` adds a zero-offset 3 px `focus-visible:ring-3`. The test still asserts the 2 px / 2 px offset, so the pass/fail is unchanged. The comment's reasoning is what R-2 calls wrong, and it is left for the owner's DECISIONS fix.

## Review Findings
(Filled in by reviewer; landed by the orchestrator, since `reviewer` is read-only by design and has no
write tool. Text is the reviewer's, verbatim.)

- Verdict: **CHANGES REQUESTED** (one blocker; everything else is non-blocking)
- Reviewed: `git diff 67ace13 HEAD` plus the uncommitted working tree. Gates re-run independently:
  vitest 682/682, `tsc --noEmit` exit 0, eslint 0 errors / 21 warnings (baseline). Playwright not
  re-run (it starts a dev server); QA's 440/0/2 is consistent with everything checkable statically.

### R-1 (BLOCKER). Criterion 47 is not met for Start/Pause/Resume, and the sweep that guards it is blind to the case
`components/ui/button.tsx:19` keeps `transition-all` in the `cva` base, which Tailwind v4 resolves to
`transition-property: all` at `--default-transition-duration: 150ms`
(`node_modules/tailwindcss/theme.css:492`). `components/TimerControls.tsx:60` is the one `Button`
consumer with **no** `motion-reduce:` opt-out — `buttonFocusRing` (line 23) is focus utilities only.
`TaskListDialog.tsx:44` and `ui/dialog.tsx:91` both carry `motion-reduce:transition-none`; the primary
timer control does not. Toggling `.dark` therefore fades the page's most prominent control's themed
`bg-primary` / `text-primary-foreground` / border over 150 ms **under `prefers-reduced-motion: reduce`**
— the identical defect the owner chose to fix on HoldButton "because the criterion is satisfiable for
three lines".

The pass-3 PASS did not catch it because `e2e/dark-theme-control.spec.ts:374` filters on
`/color|background|border|fill|stroke|outline|box-shadow/` against the computed `transition-property`,
which for these elements is the literal string `all` — no substring match. The sweep returns `[]`
because the regex cannot see `transition-all`, not because no offender exists.

Same head, lower severity: `components/TaskForm.tsx:219`'s `transition-shadow` on the colour swatch
(themed `ring-foreground` / `ring-border` / `ring-offset-card`) still has no opt-out. Frontend disclosed
it; the sweep never visits it because the test loads only `/` idle and the form lives inside the dialog.
Net effect: criterion 47's "a test asserts the computed duration is 0 s" is true today only for Reset
and the mode chips.

**Asked for:** `motion-reduce:transition-none motion-reduce:duration-0` on `TimerControls.tsx:60` (or on
`buttonVariants`' base, which covers every consumer at once) and on `TaskForm.tsx:219`; and widen QA's
regex to match `all` (e.g. `/\ball\b|color|background|…/`). The regex widening is wanted even if the
owner elects to accept the fade — otherwise the criterion is guarded by a test that cannot fail.

### R-2 (should fix, docs only). C28's recorded justification contradicts the code; its conclusion survives
The DECISIONS premise "at 2 px offset the indicator never touches the fill — the 2 px gap shows the
ground" is false for exactly the controls the ruling was written for. `buttonVariants`' base adds
`focus-visible:ring-3 focus-visible:ring-ring/50`: a **zero-offset** 3 px box-shadow that fills the whole
2 px gap with `--ring` at 50 % over the ground (≈ `#d8a47a` light, `#865c2f` dark; box-shadows paint under
the outline, so 0-2 px is band and 2-4 px is solid outline). So the colour adjacent to the fill is that
band, not the ground — and a zero-offset indicator **does** exist here, which the owner's surviving
own-fill clause says it governs, at ≈2.27:1 light / ≈2.85:1 dark against the fill.

The conclusion still holds: the outline's outer edge meets the real ground at 4.60:1 / 8.83:1, and WCAG
1.4.11/2.4.13 evaluate a focus indicator as a whole. **No code change requested.** But
`e2e/dark-contrast.spec.ts:396`'s `expect(reading.offset).not.toBe("0px")` is asserted as proof that the
own-fill clause does not apply, and that inference is wrong on these controls; and `readPainted`'s
`ground` comes from the ancestor chain's computed background, so it never sees the band — the
measurement lands on the right pair by accident. One sentence in the DECISIONS entry fixes the record:
the gap is filled by `ring-ring/50`, that band is not relied on as a carrier, and the outline's outer
edge against the ground is what carries 1.4.11.

### R-3 (should fix, test hygiene). The reveal-edge band is defensible, with three caveats
1.5 px is defensible: a fixed constant rather than a derived one, seam pixels keep a 3:1 guard rather
than being dropped, interior pixels keep 4.5:1, the band is ~3 px of a 47.15 px control, and a fill
regression fails on interior pixels first. QA's own geometry (x=29, behind 98 % fill, steady fill 4.72:1)
puts the real anti-aliased edge ~0.5 px from the seam, so 1.5 px is 3× headroom, not an open-ended
widening. Three fixes:
- `layer.n += 1` runs **before** the seam `continue`, so `expect(samples.some(s => s.whiteOnFill.n > 0))`
  can be satisfied by seam pixels alone while `min` stays `null` and nothing is ever checked at 4.5:1.
  Count non-seam pixels for that guard.
- The band is x-only, and `revealedFrac` falls back to `1` whenever the `inset(0 N% …)` regex misses
  (e.g. `data-direction=up`, where the clip is vertical) — the guard then silently parks on a text-free
  strip at the control's right edge. Reset is horizontal today; the fallback should throw, not default to 1.
- `seamX` is CSS px while `x` is image px; they coincide only because the lone Playwright project is
  `devices["Desktop Chrome"]` at DSF 1. Worth a comment next to `SEAM_PX`.

### Checked and clean
- **The `.dark` derivation.** Re-derived independently from the hexes: ground `#1c140e` L = 0.00779,
  popover `#1e1610` L = 0.00887, both under the comment's ~0.0096 bound. Eight swatches on dark `--card`:
  potato 3.10, tomato 3.41, mint 5.29, sky 4.20, lavender 3.54, sunflower 3.49, blush 4.29, slate 3.10;
  on `--popover`: potato 3.04, slate 3.05, rest higher — all clear 3:1, exact match to the reported table.
  Paired foregrounds min 7.66. `--control-border` 3.80 / 3.73 / 3.50 / 3.29. `--dialog-edge` 3.73 vs
  popover, 4.12 vs the scrimmed page (scrim composite re-derived as (16,11,7)). Charts 6.20-8.14.
  `--gauge-liquid` dark 3.23 / 4.68, light 3.07 / 4.99. No disagreement with QA anywhere.
  **For the owner:** potato and slate at 3.04 / 3.05 leave 1.3 % headroom — any future lift of `--popover`
  for elevation breaks criterion 19. `components/token-dark.test.ts` pins the hexes, so it will be noticed.
- **The C47 override.** `html .hb-root` is genuinely sufficient. Both rules are unlayered author
  declarations (`app/globals.css:245` is outside any `@layer`; `components/HoldButton.tsx:364` is a plain
  runtime `<style>`), both `!important`, so specificity decides — (0,1,1) beats (0,1,0). The trap that
  would have broken it (layered `!important` outranking unlayered `!important`) does not apply because
  neither rule is layered; `tw-animate-css` and `shadcn/dist/tailwind.css` add no competing
  reduced-motion reset (shadcn's only one is scoped to `.shimmer`). Zeroing `transition-property`
  wholesale costs nothing: under reduce the vendored rule kept only `background-color 160ms` and
  `box-shadow var(--hb-release)`, and `TimerControls.tsx:66` passes `glow={false}`, so the box-shadow
  transition has nothing to animate. The progress cue (`.hb-fill` clip-path, quarter-quantized under
  reduce) and the label crossfade (`.hb-label>span` opacity 200 ms) are separate selectors, untouched.
- **The C42 exemption is honest.** `components/TaskRow.tsx:109-117`: `style={style}` carries dnd-kit's
  transform via `setNodeRef`/`useSortable`, and `isDragging ? "opacity-60 ring-2 ring-ring" : ""` carries
  the opacity. `e2e/dark-sweep.spec.ts:336-342` asserts computed `transform !== "none"`, `opacity` ≈ 0.6
  and the class string — remove either carrier and those fail. Provenance verified byte-for-byte:
  `d7d1bec:components/TaskRow.tsx:111` is `ring-amber-700`, `67ace13:…:116` is `ring-ring`, and `--ring`
  at 67ace13 is `#b45309` = amber-700. The ratio predates both tasks exactly as recorded.
- **C38 and the four void/amended clauses** all match the code: no `Legend`/`Tooltip` in `StatsChart.tsx`,
  no `type="number"` anywhere, `TaskForm.tsx:169,189,251` never receive `disabled`, and the only `:root`
  *value* change is `--gauge-liquid` — the rest are comments plus three named additions.
- **Licensing / branding.** No font, audio, image or binary added. `package.json`, `package-lock.json`
  and `components.json` are byte-identical to 67ace13. ReactBits provenance (MIT + Commons Clause,
  `DavidHDev/react-bits`) is on record in the 2026-10-19 DECISIONS entry and neither vendored file was
  touched. The control is three text labels, no icon, no borrowed glyph, no resemblance to another
  product's theme switcher. The `.dark` hexes are derived values, not lifted from any palette.
- **TypeScript strictness (C62).** No `any`, `as never`, non-null assertion or `export default` in any
  file this task adds under `lib/`, `components/`, `hooks/`, `widgets/`. The repo's pre-existing `any`s
  are confined to untouched `e2e/sessions.spec.ts` and `e2e/token-chip-cue.spec.ts`.
  `sanitizePreferences`' `unknown → Record<string, unknown>` cast follows a `typeof`/`null` check (sound
  narrowing) and `PREFERENCE_VALUES`' mapped type keeps `pick` honest. Nit: `boot-script.test.ts:153` is
  the diff's only `@ts-expect-error` (stubbing a missing `matchMedia`) — scoped to one line in a test,
  flagged not asked.
- **Freeze (C53/C54).** `git diff 67ace13 HEAD` and `git diff` are both empty for every frozen path.
  `docs/PLAN.md` and `docs/DECISIONS.md` carry only the orchestrator's edits criterion 1 requires; the
  narrowing is correct.
- **Performance / timer (C61).** No `setInterval` / `setTimeout` / `rAF` / `performance.now` added;
  remaining time still derives from the stored end timestamp; no second theme subscription
  (`useThemeSync` reuses `useMediaQuery`'s `useSyncExternalStore`, and `use-resolved-tokens.ts`'s existing
  `MutationObserver` picks up the class). `ThemeControl` uses three narrow selectors. The boot script is
  one ~400-byte IIFE importing only the leaf `schema.ts`, so zustand stays off the first-paint path.
- **Accessibility.** Native `<fieldset>` + `sr-only <legend>Theme</legend>` + three `sr-only` radios with
  `peer-focus-visible` rings on the visible spans — the `ModeSelector` pattern, no constructed ARIA, state
  via `:checked`, non-colour cue is weight 700/400. No hydration-mismatch risk: server and first client
  render both show `system` because `hasHydrated` gates the read.

### Nits (no action asked)
- `widgets/HeaderNav.tsx` still renders a `<div>`, not a `<header>` landmark, and sits inside `<main>`, so
  an app-level control now lives in the main landmark. Pre-existing shape, not a 009 regression.
- `opacity-60` on a dragging row drops the row's own title text below 4.5:1 for the duration of the drag.
  Transient, pre-existing, no criterion covers it.
