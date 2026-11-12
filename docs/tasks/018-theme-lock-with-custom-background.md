---
id: 018
slug: theme-lock-with-custom-background
status: superseded
---

# Theme locks to dark while a custom background is active

> **Superseded by [019-dark-mode-only.md](019-dark-mode-only.md)** (2026-11-12) — dark became the only
> theme, so there is no longer a selector to hide or a preference to lock. The criteria below are
> history; 019 deletes the code that satisfied them.

> **History for this task** — implementation notes, QA reports, review findings and
> orchestrator rulings live in [logs/018-theme-lock-with-custom-background-log.md](logs/018-theme-lock-with-custom-background-log.md). Read it only when a
> criterion below is disputed; it is not an input to implementing them.

## Goal
Light mode is unreadable over an uploaded background and dark mode is not, so while a custom background
is active the app paints dark and the LIGHT / DARK / SYSTEM selector is hidden; removing the background
brings the selector back and restores the preference the user had before, untouched. This changes only
*when* each existing theme applies — no palette, no overlay opacity, no new theme.

## Scope
**In:** one derived `effectiveTheme` rule shared by the pre-hydration boot script, the theme provider and
the selector's visibility; hiding `components/ThemeControl.tsx` while locked; a visible, announced note in
the Settings background section; two polite announcements on lock and unlock; self-healing when the stored
background id has no loadable blob; extending the boot-script/resolver parity test to the background
dimension.

**Out (do not touch, do not "improve while here"):** the background overlay opacity
(`opacity-50`, `components/BackgroundLayer.tsx:36`, re-pointed 2026-11-12 — a criterion may read it, none
may move it); the light and dark palettes and every `app/globals.css` token; adding a theme; multiple or
per-theme backgrounds; cross-tab sync; any change to the stored preferences schema or Dexie version.

**Data shape: already decided — `backend` does not run.** `state.background` (a row id or `null`,
`lib/preferences/schema.ts:51`, `:69`) already lives in the zustand-persist envelope that
`lib/preferences/boot-script.ts:29` parses for `theme` and `taskPanelVisible`, in the one `getItem` /
`JSON.parse` it already does. No new localStorage key, no new preference field, no migration.

**Closed questions** (verified, do not re-derive): the remove control exists —
`components/BackgroundControl.tsx:124-126`, rendered only when a background is set. The selector has one
render site — `widgets/HeaderNav.tsx:12`; the fieldset at `components/SettingsPanel.tsx:51-69` is the
Timer gauge, not a theme selector. Background provenance and the half-opacity ruling:
`docs/DECISIONS.md`, 2026-11-12 entry on the retired frosted panel.

**Announcement channel — decided here:** the two theme announcements get their own polite live region,
**not** `components/BackgroundControl.tsx:129`. That region is overwritten by the background notice on the
same action (`:93` writes "Background removed…"), and the lock also changes on paths that never render
`BackgroundControl` (a self-heal on load). The existing region keeps its current text unchanged.

## Acceptance Criteria

Tags: `[unit]` vitest, `[e2e]` Playwright, `[static]` source/grep check, `[manual]` recorded by hand in
the QA Report. Criteria 40–44 are the measurement group and may be re-run alone if a token moves.

### A. The derived rule, in one place
- [ ] 1. A single exported, pure function implements `effectiveTheme = hasCustomBackground ? "dark" : resolveTheme(preference, osPrefersDark)`. It takes its inputs as arguments (no store, no DOM, no `window` read inside it) and returns a `ResolvedTheme`. `[unit]` `[static]`
- [ ] 2. The function returns `"dark"` for all six combinations of `preference` ∈ {light, dark, system} × `osPrefersDark` ∈ {true, false} when `hasCustomBackground` is `true`. `[unit]`
- [ ] 3. With `hasCustomBackground` `false` it returns exactly what `resolveTheme` returns for all six combinations (`lib/preferences/schema.ts:195`): light→light, dark→dark, system→dark|light by OS. `[unit]`
- [ ] 4. A second exported rule (function or derived boolean from the same module) answers "is the theme selector shown", and it is `false` exactly when `hasCustomBackground` is `true`. No component computes this from `state.background` itself. `[unit]` `[static]`
- [ ] 5. `grep -rn "background" components/ widgets/ hooks/ lib/preferences/` shows no component deciding a theme or a visibility from the background other than via the module in criterion 1 — no scattered `if (background) dark` checks. Name the file list in the QA Report. `[static]`
- [ ] 6. `components/ThemeControl.tsx`, the theme provider path (`components/ThemeSync.tsx` / `hooks/use-theme-sync.ts`) and the boot-script source all reference the criterion-1 rule or the constants it is built from; none of the three re-implements the branch. `[static]`

### B. First paint and refresh — no flash of the wrong theme
- [ ] 7. The boot-script/resolver parity test is extended to the background dimension: the script string is run against the criterion-1 rule across **every stored `theme` × OS setting × `background` ∈ {null, a valid-shaped id}** — 12 cases — and fails on any difference. This extends the contract in `lib/preferences/boot-script.ts:10-28`. `[unit]`
- [ ] 8. The boot script still performs exactly one `localStorage.getItem` and one `JSON.parse` (assert by spying/counting in the parity test). `[unit]`
- [ ] 9. The boot script treats a stored `background` that is not a plausible id (wrong type, empty string, malformed) as "no background" and falls through to the stored theme; a thrown storage or parse error still falls through to `DEFAULT_THEME` without throwing. `[unit]`
- [ ] 10. The script stays idempotent: running it twice in a row leaves `<html>` in the same state (the dark class toggled with an explicit force, never flipped). `[unit]`
- [ ] 11. Reload `/` with a valid background stored and preference `light`: `<html>` carries `class="dark"` in the **first** paint. Verified by asserting the class on `document.documentElement` before any React commit — e.g. a Playwright init-script/early-evaluate read, not a post-hydration read. `[e2e]`
- [ ] 12. Reload `/` with **no** background and each of preference light / dark / system: first-paint class is exactly what it is on `main` today for that combination. No regression to the existing no-background path. `[e2e]`
- [ ] 13. Manual check, recorded in the QA Report with the method used (e.g. 4× CPU throttle, or a slow-motion capture): on refresh with a background, no frame of light theme is visible. State the viewport and theme preference used. `[manual]`

### C. Live transitions, no reload
- [ ] 14. Uploading an image on `/settings` switches `<html>` to the dark class within the same interaction, with no navigation or reload, and the header selector is gone on the next render. `[e2e]`
- [ ] 15. Clicking "Remove background" (`components/BackgroundControl.tsx:124`) removes the dark class if and only if the restored effective theme is light, restores the selector, and requires no reload. `[e2e]`
- [ ] 16. The stored preference is never written by the lock: with preference `light`, upload a background, then read `localStorage["pomotato-preferences"]` — `state.theme` is still `"light"`. Repeat for `"dark"` and `"system"`. Three cases. `[e2e]`
- [ ] 17. Round-trip restore, one case per preference value: set preference → upload → remove → the app paints that preference's resolved theme again and the selector shows it as checked. light, dark, and system (system asserted against the emulated OS setting). `[e2e]`
- [ ] 18. With a background active and preference `system`, flipping the emulated OS to the opposite `prefers-color-scheme` leaves `<html>` dark — no class change, no re-render into light. `[e2e]`
- [ ] 19. After removing the background with preference `system`, the same OS flip now changes the painted theme again. `[e2e]`
- [ ] 20. "Choose a different image" while a background is already set keeps the app dark throughout — no light frame between the old and new image. `[e2e]`

### D. The selector is hidden everywhere it appears
- [ ] 21. A grep for the selector's render sites is recorded in the QA Report and the count is **1** (`widgets/HeaderNav.tsx:12` → `components/ThemeControl.tsx`). If the count is ever >1, every site is covered by criterion 22 and the report says so. `[static]`
- [ ] 22. With a background active, no theme radio (`input[name="theme"]`) is present in the accessibility tree or the DOM on `/`, `/settings` and `/stats`. Absent, not merely `hidden` or `display:none` with the inputs still focusable. `[e2e]`
- [ ] 23. With a background active, `<html>` carries the dark class on `/settings` and `/stats` as well as `/` — even though `components/BackgroundLayer.tsx` renders on `/` only (`app/page.tsx:12`). The lock is app-wide. `[e2e]`
- [ ] 24. Hiding the selector leaves no orphan: no empty `<fieldset>`, no stray `<legend>Theme</legend>`, no zero-size container in the header. Assert the fieldset is absent, not empty. `[unit]` `[e2e]`
- [ ] 25. Header layout holds at 1280 px and 320 px with the selector hidden: the header's own height and the vertical start of the content below it are measured in both states (selector shown vs hidden) at both widths, and the report records the four pairs. No overlap of wordmark and any control at 320 px. `[e2e]`

### E. Self-heal: stored id, no usable blob
- [ ] 26. With a non-null `state.background` whose Dexie row is missing, the app ends up **unlocked** after load: the selector is present and the painted theme is the stored preference's resolved theme. The first paint may be dark (the id is a hint); the settled state must not be. `[e2e]`
- [ ] 27. Same, for a row whose bytes are present but fail to decode — the case `lib/db/background-validation.ts:102-107` says the caller must treat as "no background" and `hooks/use-background-image.ts:40-44` returns `null` for. `[e2e]` or `[unit]`
- [ ] 28. While a background id is stored and its load has **not yet settled**, the app stays dark — no transient light frame before the blob resolves. Only a settled "unavailable" unlocks. Verified with a deliberately delayed/stubbed load. `[unit]` or `[e2e]`
- [ ] 29. A self-heal does not write to the stored preferences: after criterion 26's load, `state.background` and `state.theme` in localStorage are unchanged (the dangling id is deliberately not cleared — `hooks/use-background-image.ts:20-23`). `[e2e]`
- [ ] 30. The criterion-1 rule's `hasCustomBackground` input is documented in one sentence as "a background is actually painting", and the unit tests cover `true`, `false`, and the pending case feeding it. `[unit]` `[static]`

### F. The note, the announcements, focus
- [ ] 31. While a background is active, the Settings background section shows the visible text: "Theme is locked to dark while a custom background is on. Remove the background to choose Light, Dark, or System." Exact string, matched verbatim. `[unit]` `[e2e]`
- [ ] 32. The note is real text in the accessibility tree (not `title`, not a tooltip, not `aria-label` only) and is reachable by a screen reader in document order within the background fieldset. `[unit]`
- [ ] 33. The note is absent when no background is active, and appears/disappears on upload/remove without a reload. `[e2e]`
- [ ] 34. Locking announces "Dark theme applied for your custom background." and unlocking announces "Theme options restored." — exact strings, in a polite live region (`aria-live="polite"` or `role="status"`) that is **not** `components/BackgroundControl.tsx:129`. `[unit]` `[e2e]`
- [ ] 35. The existing background notice still appears unchanged on remove ("Background removed. The timer page is back to the plain ground.", `components/BackgroundControl.tsx:93`) and neither message overwrites the other — both are in the tree at the same time. `[e2e]`
- [ ] 36. Neither announcement fires on initial load or refresh (no background-change event occurred); they fire on transition only. Assert the region is empty after a reload with a background active. `[unit]` or `[e2e]`
- [ ] 37. Focus is never lost: with a theme radio focused in the header, uploading a background (selector disappears) leaves `document.activeElement` on a focusable element in the document body — not `<body>`, not a detached node. State in the report where focus lands and why that target was chosen. `[e2e]`
- [ ] 38. On unlock the selector returns keyboard-reachable: Tab order reaches the three radios, arrow keys move between them, and the checked one is the stored preference. The existing focus hand-off at `components/BackgroundControl.tsx:87-95` still works on remove (focus to the picker) and is not duplicated or fought over by the new behaviour. `[e2e]`
- [ ] 39. `npm run lint`, `npm run typecheck` and `npm run build` pass; no `any` in changed files. `[static]`

### G. Measurement group — contrast over a real image (manual, re-runnable alone)
- [ ] 40. Two test images are used and named in the QA Report: one **very bright** (near-white, low detail) and one **high-detail / busy** (high local contrast). State how each was produced or where it came from (original or CC0 only — no copied assets). These two are chosen to bound the range; do not enumerate more. `[manual]`
- [ ] 41. With the dark theme and the unchanged `opacity-50` overlay (`components/BackgroundLayer.tsx:36`), the timer digits, the wordmark and the header controls on `/` are checked against each image at 1280 px. Each recorded ratio names **the painted pixel it came from and the theme** (e.g. "dark, digit stroke centre at 640,360, over bright image") — a figure without provenance does not count. `[manual]`
- [ ] 42. The same check at 320 px, or an explicit note in the report that the background layer is fixed and the ground pixels are identical to 1280 px, with the two pixels read to prove it. `[manual]`
- [ ] 43. Any ratio below 4.5:1 for text or 3:1 for a control boundary is reported in the QA Report and routed to Review Findings. **The overlay opacity is not changed to fix it** — the fix, if any, is a separate task and an owner decision. `[manual]`
- [ ] 44. `components/BackgroundLayer.tsx` diff is empty, or the only change is unrelated to opacity; `app/globals.css` is unchanged. `[static]`

## Files likely touched
- `lib/preferences/schema.ts` — home for the criterion-1 rule, or a new sibling module beside it.
- `lib/preferences/boot-script.ts` — the script string reads `background` from the envelope it already parses.
- `lib/preferences/boot-script.test.ts` — parity test extended to 12 cases (qa).
- `hooks/use-theme-sync.ts`, `components/ThemeSync.tsx` — the provider resolves through the same rule.
- `components/ThemeControl.tsx` — rendered or not per the criterion-4 rule; or its caller decides.
- `widgets/HeaderNav.tsx` — the one render site; layout must not break when the selector is absent.
- `components/BackgroundControl.tsx` — the visible note; the new announcements live elsewhere.
- `hooks/use-background-image.ts` — may need to expose "a background is painting" beyond `/`; the hook currently returns a URL and `components/BackgroundLayer.tsx` is its only consumer.
- Possibly a new small hook/component for the lock announcement region.

## Risks
- **Three writers, one class.** `<html class="dark">` is now set from the boot script, the theme provider and (indirectly) the selector, from two inputs. Drift between them is the defect to expect; criteria 6, 7 and 11 pin them together.
- **The timer-page-only background vs the app-wide lock** (criterion 23): whatever answers "is a background painting" must be available on `/settings` and `/stats`, where `BackgroundLayer` does not render.
- **Pending-load window** (criterion 28): unlocking optimistically while the blob is still loading reintroduces exactly the flash this task exists to remove.
- **A11y:** removing a focused control mid-interaction (criterion 37); orphaned `<legend>` (24).
- **No licensing exposure** beyond the two QA test images, which must be original or CC0 (criterion 40).
- **Not a data task:** if anyone proposes a new persisted flag, that is a scope change — re-ask the owner rather than adding one.

## Note for `reviewer`
The derived rule gives one `<html>` class two inputs, written from three places. Watch for those three
drifting: a boot script that locks on a shape the runtime rule rejects, a provider that unlocks a tick
before the blob resolves, a selector whose visibility and the painted theme disagree. Criteria 5–7, 11
and 28 exist to pin them; a change that satisfies the behaviour criteria while bypassing the shared rule
should be flagged even if tests pass.

## Proposed PLAN.md entry
*(For the orchestrator to place — pm did not edit PLAN.md. Suggested position: after the task 017 entry
at `docs/PLAN.md:93`.)*

```markdown
- [ ] **018. Theme locks to dark while a custom background is active.** ([docs/tasks/018-theme-lock-with-custom-background.md](tasks/018-theme-lock-with-custom-background.md))
      Owner requirements, 2026-11-12. Light mode is unreadable over an uploaded image, so the effective
      theme becomes derived — `hasCustomBackground ? "dark" : userPreference` — and the LIGHT / DARK /
      SYSTEM selector hides while a background is on, returning with the untouched stored preference when
      it is removed. One shared rule behind the boot script, the provider and the selector; the
      boot-script parity contract extends to the background dimension. No schema change and no `backend`
      run: `state.background` is already in the envelope the boot script parses. Overlay opacity
      (`opacity-50`) and both palettes are explicitly out of scope. 44 criteria, the last five a manual
      contrast group over a bright and a busy test image.
```
