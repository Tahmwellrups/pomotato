# Theme locks to dark while a custom background is active — history log

Appended by frontend/backend/qa/reviewer/orchestrator after implementation began.
The task's goal, scope and acceptance criteria are in [../018-theme-lock-with-custom-background.md](../018-theme-lock-with-custom-background.md).

<!--
  Verdicts and repro steps, not the journey. Over half of every pre-2026-11-12 task file
  was narrative appended here, and every later agent paid to re-read it.
  Append under the matching heading; grep-friendly headings matter more than prose.
-->

## Orchestrator rulings before implementation (2026-11-12)

Two of pm's criteria could not be implemented as a set without a call the brief left open. Both were put
to the owner with the brief; the owner approved the brief and said to start, so these are the orchestrator's
calls, made explicit here so `frontend` does not have to guess and `reviewer` can hold them to it.

**Ruling 1 — one read, one decode, shared app-wide. `hasCustomBackground` means "settled present".**
Criterion 23 wants the lock on `/settings` and `/stats`, criterion 30 defines the input as "a background is
actually painting", and criterion 28 wants the pending window to stay dark. `hooks/use-background-image.ts`
cannot serve that: it returns `string | null` and **collapses "still loading" into the same `null` as "dangling
id" and "bytes will not decode"** (its own docstring, `:14-16`, lists every failure path as `null`). Three
criteria need those apart.

So: a single owner of the background read — a provider or equivalent mounted in `app/layout.tsx` beside
`ThemeSync` (`:51`) — performs **one** Dexie read and **one** decode per stored id and exposes both the object
URL and a three-state status (`pending` | `present` | `absent`). `components/BackgroundLayer.tsx` becomes a
consumer of the URL instead of doing its own read; `ThemeSync` consumes the status. `pending` counts as locked
(dark), `absent` unlocks, and only `absent` satisfies criterion 26's self-heal.

Why not the cheap alternative: locking on `state.background` alone is synchronous and flash-free, but a
dangling id would then leave `/settings` locked to dark **with the selector hidden and nothing on that route
able to discover the blob is dead** — the user is stuck with no way back. That is a worse failure than the cost
below, so it is rejected.

**The cost, named rather than hidden:** `/settings` and `/stats` now pay one Dexie read plus one image decode
they did not pay before, after hydration. That is the price of the lock and the self-heal agreeing on every
route. Do not pay it twice — the single-read invariant is binding and criterion 8's style of assertion should
pin it (count the reads, not just the result).

**Ruling 2 — the object URL's lifecycle moves with the read.** Because the read moves to a layout-level owner,
so does `URL.createObjectURL` / `revokeObjectURL`. Keep the existing contract from
`hooks/use-background-image.ts:18-19`: revoke on id change and on unmount, one URL alive at a time. A leak here
is invisible on `/` and only shows up after route changes, so `reviewer` should check it explicitly rather
than trusting the move.

**Unchanged by both rulings:** no new persisted field, no schema change, no `backend` run. `state.background`
stays the only stored signal and stays a hint; the boot script keeps reading it from the envelope it already
parses. A dangling id is still never cleared (`hooks/use-background-image.ts:20-23` — another tab may have
replaced the image).

## Implementation Notes

### 2026-11-12 frontend

Gates: lint 0 errors (15 warnings, all in existing test files); typecheck pass; build pass. No `any`.
`BackgroundLayer.tsx` and `app/globals.css` untouched (44).

**Names for qa**
- `lib/preferences/schema.ts`: `effectiveTheme(pref, osPrefersDark, hasCustomBackground)`, `isThemeSelectorShown(hasCustomBackground)`, `isBackgroundLocking(status)`, type `BackgroundStatus` (`pending|present|absent`), exported `BACKGROUND_ID_PATTERN`.
- `hooks/use-background-image.ts`: `useBackgroundSource()` is now the single read (returns `{url,status}`); `BackgroundContext`; `useBackgroundImage()` and `useBackgroundStatus()` are context consumers. The old `hooks/use-background-image.test.tsx` renders the hook with no provider and now tests the wrong function: retarget it to `useBackgroundSource`. `BackgroundLayer.test.tsx` mocks `useBackgroundImage` and is unaffected.
- `hooks/use-theme-lock.ts`: `useThemeLock()` -> `{hasCustomBackground, selectorShown}`. `pending` and `present` lock; `absent` (incl. not hydrated, dangling, undecodable, load error) unlocks.
- `components/BackgroundProvider.tsx` mounted in `app/layout.tsx` around `ThemeSync`, `ThemeLockAnnouncer`, children.
- Announcer: `components/ThemeLockAnnouncer.tsx`, `[data-testid="theme-lock-status"]`, `role="status"` `aria-live="polite"`, sr-only. Exports `THEME_LOCKED_MESSAGE`, `THEME_UNLOCKED_MESSAGE`. Speaks only when the stored background id goes null<->non-null after hydration; empty on load and on self-heal (id unchanged).
- Note: `<p id="background-theme-note">` inside the background fieldset, between help text and the picker row; shown while `hasCustomBackground` (so also during `pending`).
- Selector: `ThemeControl` returns `null` when locked (no fieldset/legend/radios). Header container is untouched, only the wordmark remains.

**Boot script** (one `getItem`, one `JSON.parse`, unchanged). Reads `state.background`; `k=true` only if string, length 1..`BACKGROUND_ID_MAX_LENGTH`, and matches `BACKGROUND_ID_PATTERN` (same constants as `isBackgroundId`). `d = theme==="dark" || k`; the matchMedia query runs only when `theme==="system" && !k`. Storage/parse throw -> `DEFAULT_THEME` (system), no lock. Dark class still set via `classList.toggle(cls, d)`. 12-case parity: expected = `effectiveTheme(storedTheme, os, background is valid-shaped)`.

**Focus (37)**: radios are only in the header, so a focused radio plus an upload is only reachable from another surface; if it happens, focus goes to the wordmark `<h1 id="pomotato-wordmark" tabindex="-1">` (programmatic-only, same header, no new tab stop, no ring). Tracked with onFocus/onBlur on the fieldset; moved only if focus fell to `<body>`. Not browser-tested by me.

**Not verified in a browser** (no e2e run by me): 11-20, 22-29, 33-38 behaviour; 13 and 25 need qa. Believed satisfied by implementation: 1-10, 14-24, 26-39 (28 via status `pending`). Criterion 5 grep: only `useThemeLock` and the announcer/provider read `state.background`; `BackgroundControl` still reads it for the "A background image is set." line and button label (not a theme or selector decision).
(frontend/backend: decisions, tradeoffs, the types frontend consumes. What the next agent needs — no more.)

**Addendum (selector first-paint flash, fixed)**
- New constants beside the task-panel ones in `schema.ts`: `THEME_LOCK_ATTRIBUTE = "data-theme-lock"`, `THEME_LOCK_VALUE = "locked"`, and `applyThemeLock(root, locked)`.
- Boot script: sets `data-theme-lock="locked"` on `<html>` when its `k` (valid-shaped stored id) is true, else removes it. Same computed value as the dark class, so it cannot drift.
- First paint (before hydration commit): CSS owns it. `ThemeControl`'s fieldset carries `[html[data-theme-lock=locked]_&]:hidden` (Tailwind arbitrary variant in the component; `app/globals.css` untouched). The fieldset IS in the served HTML but `display:none`.
- Settled (after hydration): React owns it. `ThemeControl` returns `null` per `useThemeLock`, so the fieldset is absent. `useThemeSync` also calls `applyThemeLock(html, hasCustomBackground)` every time the lock changes, so the attribute follows upload, remove and self-heal (without this, an unlock would leave the CSS rule hiding the returning selector). qa: assert the attribute on first paint and the fieldset's absence once settled; assert the attribute is removed after remove/self-heal.
- `HeaderNav` renders on `/` only, so criterion 22's `/settings` and `/stats` clauses hold by construction and criterion 25's header geometry is a `/`-only measurement.
- Criterion 37 tradeoff, for reviewer: the wordmark carries `focus:outline-none`, so a keyboard user who reaches that path gets focus with no visible indicator. Decision: accepted. The path needs a cross-route sequence (radio focused, background changed from another surface), the target is non-interactive, and the alternative (a visible ring on a heading) would imply it is a control.
- Gates re-run: lint 0 errors (15 warnings, pre-existing), typecheck pass, build pass.

**Addendum (stale settled result)**
- Defect: `settled` was keyed on id alone, so after A settled, id went null then A again, the revoked URL for A read as `present`.
- Fix: the load effect's cleanup now calls `setSettled(null)`, so a settled result never outlives its revoked URL; a returning id reads `pending` until its new load settles. Docstring reworded to match. That is the whole change: one line plus the comment, no restructure; the id check in render stays as the guard for an id swap within one render.

## QA Report

**Verdict: FAIL.** One adversarial unit test fails on a real defect (repro below, routed to frontend). Every other
behavioural criterion passes. Criterion 13 is covered by an automated proxy only, and criteria 40-43 are measured with
contrast results below the thresholds, which are routed to Review Findings per 43.

Date 2026-11-12, scratch port :3100 (static `out/` build), chromium. No application code was edited.

### Gates (real output)
- `npm run lint`: 0 errors, 15 warnings. None in a file added or changed by 018 (warnings are in `app/page.tsx`,
  `components/TaskChecklistRow.tsx`, `e2e/helpers/timer-hold.ts`, `e2e/sessions.spec.ts`, `e2e/stats.spec.ts`, and three
  existing `*.test.ts` files).
- `npm run typecheck`: exit 0.
- `npm run build`: exit 0 (`Generating route types`, static prerender). No application file has changed since this build.
- `npx vitest run`: 1339 passed, 1 failed, 1340 total (48 files). The failure is the race below. The 7 known failures are
  fixed: 6 in `hooks/use-background-image.test.tsx` (retargeted to `useBackgroundSource`) and 1 in
  `focus-cycle.guards.test.ts` (PINNED `components/ThemeLockAnnouncer.tsx: 2`, with a 018 comment).
- `git diff --stat -- components/BackgroundLayer.tsx app/globals.css`: empty. Neither file is modified.

### Tests added or changed
- `lib/preferences/theme-lock.test.ts` (new, 57 tests): criteria 1-3, 7-10, 30. Parity matrix runs the real script in jsdom.
- `components/theme-lock.ui.test.tsx` (new, 12 tests): criteria 4, 24 (unit), 31, 32, 34, 36, 37 (unit).
- `hooks/use-background-image.test.tsx` (retargeted): the task 010 criterion 5 assertions are kept against
  `useBackgroundSource()` with `status` added. Criterion 28 pending-window tests and one adversarial race test are added.
- `components/focus-cycle.guards.test.ts`: PINNED entry for the announcer.
- `e2e/task-018-theme-lock.spec.ts` (new, 32 tests): criteria 11-20, 22-27, 29, 31, 33-36, 38.
- `e2e/task-018-contrast.spec.ts` (new, 8 tests): criteria 40-42 measurement.
- `e2e/helpers/theme-lock-sampler.ts` (new): one screenshot, lowest-contrast ring pixel with coordinates.
- Selector fixes for 018's new `role=status` region, so existing specs keep testing what they meant to:
  `e2e/helpers/background.ts` (`statusLine` excludes the region; `chooseOnSettings` uses it),
  `e2e/focus-cycle.spec.ts` (announcer helper), `e2e/accessibility.spec.ts` (four live-region selectors),
  `e2e/uploaded-background.spec.ts` (accessible-name check excludes the non-interactive region).

### Criterion by criterion
| # | Status | Evidence |
|---|---|---|
| 1 | PASS | unit: `effectiveTheme` table. static: `effectiveTheme` in `lib/preferences/schema.ts` is one expression, with no `window` or store read. |
| 2 | PASS | unit: 6 combinations give `dark` when locked. |
| 3 | PASS | unit: 6 combinations equal `resolveTheme`. |
| 4 | PASS | unit: `isThemeSelectorShown(true)` is false, and `ThemeControl` renders nothing when locked. static: `ThemeControl.tsx` reads only `useThemeLock`, not `state.background`. |
| 5 | PASS | static grep of `components/ widgets/ hooks/ lib/preferences/`. Background-driven decisions: `hooks/use-theme-lock.ts` (rule input), `components/ThemeControl.tsx` (via `useThemeLock`), `components/ThemeLockAnnouncer.tsx` (announces a transition only), `components/BackgroundControl.tsx` (its own note and button label, which are not theme or visibility), `components/BackgroundLayer.tsx` (renders the image), `components/BackgroundProvider.tsx`. No `if (background) dark` anywhere. |
| 6 | PASS | static: `use-theme-sync.ts` uses `effectiveTheme` and `applyThemeLock`, `boot-script.ts` uses the shared constants, `ThemeControl.tsx` uses `useThemeLock`. Observation for reviewer: `ThemeControl`'s Tailwind arbitrary variant spells `data-theme-lock` and `locked` as literals, because a class string cannot reference a constant. |
| 7 | PASS | unit: 12-case matrix (theme x OS x background null/valid), plus 20-shape parity against `isBackgroundId`, with mismatches collected and asserted empty. Includes the valid-shaped dangling id, which locks the script while the runtime settles absent. Red-proof, unit level: a copy of the script with the length cap removed locks on a 65-character id. That is the case the shape-parity comparison catches. The scratch file was deleted. |
| 8 | PASS | unit: `getItem` called once, `JSON.parse` once, with and without a background. |
| 9 | PASS | unit: 7 malformed shapes, with stored light (light wins) and stored system with OS dark (OS wins), no lock. Parse error and throwing `getItem` fall through without throwing. |
| 10 | PASS | unit: running twice leaves one dark token and the same lock attribute. |
| 11 | PASS | e2e: an init-script MutationObserver records `<html>` from the first mutation. The boot script's write is the first record, and it is dark and locked. |
| 12 | PASS | e2e: light, dark and system, each under OS light and dark (6 cases). First paint and the settled state match the resolver, with no lock. |
| 13 | PROXY ONLY | e2e: 1280x800, preference light, 4x CPU throttle (CDP). The class timeline never takes a light state. The manual visual check was not done by hand. |
| 14 | PASS | e2e: upload on `/settings` gives dark with the same marker, so no reload, and the URL is unchanged. |
| 15 | PASS | e2e: remove gives light with no reload, and the selector returns on `/`. |
| 16 | PASS | e2e: stored `state.theme` is unchanged for light, dark and system. |
| 17 | PASS | e2e: round trip for light, dark and system. Checked radio and painted theme match. System is asserted with OS light. |
| 18 | PASS | e2e: system with a background, OS flipped light then dark: `<html>` stays dark, and the class history holds no non-dark state. |
| 19 | PASS | e2e: system after remove follows the OS flip (dark, light, dark). |
| 20 | PASS | e2e: second image chosen, with a `requestAnimationFrame` sampler across the change. Every frame is dark, and more than zero frames were sampled. |
| 21 | PASS | static: `grep ThemeControl` shows one render site, `widgets/HeaderNav.tsx:12`. |
| 22 | PASS | e2e: 0 `input[name=theme]` and 0 fieldsets holding them, on `/`, `/settings` and `/stats`. |
| 23 | PASS | e2e: dark on `/settings` and `/stats` with a real background stored. |
| 24 | PASS | unit: no fieldset, no legend, no radios when locked. e2e: no empty fieldset, no `Theme` legend, header box height > 0. |
| 25 | PASS | e2e, 4 pairs (see figures below). |
| 26 | PASS | e2e: dangling id ends with 3 radios, Light checked, and not dark. |
| 27 | PASS | e2e: a real row, with PNG signature and IEND bytes written to IndexedDB, ends unlocked. Unit: `canDecodeImage` false settles absent, URL revoked. The e2e run does not observe the decode branch directly. |
| 28 | PASS | unit: a deferred read stays `pending` across 5 ticks and never reports absent. A deferred decode stays `pending`. A settled missing ends absent. A rejected read ends absent. |
| 29 | PASS | e2e: after the self-heal, stored `state` equals `{theme:"dark", background:"dangling-..."}`. |
| 30 | PASS | unit: pending counts as locking (`isBackgroundLocking`), and absent does not. static: the `BackgroundStatus` docstring carries "a background is actually painting". |
| 31 | PASS | unit and e2e: exact string, visible while active, and also shown while pending. |
| 32 | PASS | unit: a `<p>` with no `title` or `aria-label`, inside the background fieldset, after the help text and before the picker. |
| 33 | PASS | e2e: note appears on upload and disappears on remove, with no reload. |
| 34 | PASS | unit and e2e: exact strings in the `role=status` `aria-live=polite` region, separate from `BackgroundControl`'s line. |
| 35 | PASS | e2e: the remove notice and the unlock announcement are both present, and the notice text is unchanged. |
| 36 | PASS | unit and e2e: the region is empty on mount, on hydration, and after a reload with a background active. |
| 37 | PASS (unit only) | unit: a focused radio, then a lock, leaves focus on `#pomotato-wordmark` (`tabindex=-1`, same header). Not reachable by an e2e path. The radios exist only in the header on `/`, and no UI action changes the background while `/` is open. The wordmark is chosen because it is the only non-interactive element in that header that can take focus. |
| 38 | PASS | e2e: after remove, focus lands on the picker (`input[type=file]`). On `/`, Tab reaches the checked radio, ArrowRight moves to System, and storage is updated. |
| 39 | PASS | lint 0 errors, typecheck pass, build pass. The `any` grep over changed files is empty. |
| 40 | PASS (recorded) | Two images, both generated in `e2e/task-018-contrast.spec.ts` with `makePng`. BRIGHT is flat rgb(250,250,246), 1280x800. BUSY is a deterministic per-pixel hash over the full 8-bit range, 1280x800. No external assets. |
| 41 | MEASURED, routed | Dark theme, overlay computed `opacity: 0.5` (unchanged `opacity-50`). Figures below, each with its ground pixel. |
| 42 | PASS (measured directly) | Measured at 320x720, not inferred from 1280. Bright wordmark ground is rgb(139,135,130) at both widths, ratio 1.73 at both. |
| 43 | ROUTED | Failures below go to Review Findings. The overlay was not changed. |
| 44 | PASS | `git diff` empty for `components/BackgroundLayer.tsx` and `app/globals.css`. |

### Criterion 25 header pairs (`/`, light, measured on the same page)
| Width | Selector | Header height | Content top (`main > div` index 1) | Wordmark-to-control overlap |
|---|---|---|---|---|
| 1280 | shown | 48 | 120 | none |
| 1280 | hidden | 48 | 120 | none |
| 320 | shown | 80 | 108 | 2 px box overlap, see note |
| 320 | hidden | 40 | 68 | none |

Note for reviewer: at 320 shown, the fieldset (`-my-0.5` negative margin) and its labels overlap the wordmark's line box by
2 px at bounding-box level. No glyph ink was measured. Hidden at 320 has no overlap, so criterion 25 holds for the
hidden state.

### Criteria 40-42 figures (dark, overlay opacity 0.5)
Ground = lowest-contrast pixel in a 4 px ring around the element, with its device coordinates. Gauge `glyph` means the
digits sit on the image. Gauge `vessel` means the digits sit on the vessel's liquid fill, so the ring's ground is the fill, not the image.

| Image | Viewport | Gauge | Element (fg) | Ground pixel (x,y) and colour | Ratio |
|---|---|---|---|---|---|
| bright | 1280 | glyph | digits (245,235,220) | (502,264) rgb(139,135,130) | 3.02 |
| bright | 1280 | vessel | digits (245,235,220) | (502,264) rgb(157,87,13), liquid fill | 4.68 |
| bright | 1280 | both | wordmark (240,165,80) | (60,48) rgb(139,135,130) | 1.73 |
| bright | 320 | glyph | digits | (72,282) rgb(139,135,130) | 3.02 |
| bright | 320 | vessel | digits | (72,282) rgb(157,87,13), liquid fill | 4.68 |
| bright | 320 | both | wordmark | (24,12) rgb(139,135,130) | 1.73 |
| busy | 1280 | glyph | digits | (659,267) rgb(135,138,106) | 3.03 |
| busy | 1280 | vessel | digits | (502,264) rgb(157,87,13), liquid fill | 4.68 |
| busy | 1280 | both | wordmark | (206,92) rgb(140,136,105) | 1.75 |
| busy | 320 | glyph | digits | (205,349) rgb(120,124,112) | 3.62 |
| busy | 320 | vessel | digits | (72,282) rgb(157,87,13), liquid fill | 4.68 |
| busy | 320 | both | wordmark | (195,16) rgb(126,134,97) | 1.87 |

Below 4.5:1 (text, criterion 43): digits on the image in glyph style are 3.02 to 3.62. The wordmark is 1.73 to 1.87, which
also fails the 3:1 large-text threshold. Vessel-style digits read 4.68 only because the ground is the gauge fill. Header
controls: none are rendered while locked, because the selector is absent, so no 3:1 control-boundary figure exists.
The overlay was not changed.

### FAIL: adversarial race in the retargeted task 010 criterion 5 (owner: frontend)
- Repro: `npx vitest run hooks/use-background-image.test.tsx -t "re-setting an id"`.
- Steps: `loadBackground` resolves `found(A)`, `canDecodeImage` resolves true, so A is `present`. Then `setPrefs(null)`
  in one `act`, and `setPrefs(A)` in a second `act`. The second A load is deferred.
- Expected: status `pending`, url `null` until the new load settles. This matches "never show a dead URL for a live id".
- Actual: status `present`, with the URL that the first cleanup already revoked. `revoked` contains it.
- Severity: low. The lock is unaffected, because `present` locks dark. A removed id is never set again through the UI, since
  uploads mint new ids, so the broken image is reachable only through the store API. Fix: in `useBackgroundSource`, drop the
  settled result when the id changes, or key `settled` on a load generation, not only on the id.

### Not 018: residual e2e failures (no HEAD baseline run)
A final run of the eight regression specs gave 91 passed and 35 failed. The live-region and accessible-name failures
were 018's (the new region), and they are fixed, and the fixes were re-run. The residual 34 failures are attributed by
mechanism, not by a HEAD run:
- `waitActive` expects layer opacity `1`, but HEAD's `BackgroundLayer.tsx` already has `opacity-50`. Stale helper, in `uploaded-background-layer`, `uploaded-background` and `focus-cycle`.
- Task-list title `fill` timeouts, from the 016 inline task list, in `accessibility` and `uploaded-background`.
- `dark-theme-control`: schema v3 keys (017) in criterion 3, wordmark y 33 px in criterion 38 at 320 and 1280, and reduced-motion transition in criterion 47.
- `focus-cycle` 012 surface counts (criteria 18, 21, 5/13/19/21).
- `uploaded-background` criterion 3: an extra `pomotato*` key from `lib/timer/carry-focus.ts`, not a preference write.
018 adds no storage write, no flow-layout element (the announcer is `sr-only`, the provider renders no DOM), and only attributes on the header.

### Observations for reviewer (not failures)
- Criterion 6: `ThemeControl`'s arbitrary variant spells the attribute and value as literals.
- Criterion 25: the 2 px box overlap at 320 shown comes from a pre-existing `-my-0.5` margin.
- Criterion 37 is accepted by the orchestrator, per the log. The e2e path is unreachable, and the unit test covers the mechanism. The wordmark has `focus:outline-none`, so it shows no focus ring when focused programmatically.
- `e2e/helpers/background.ts` `waitActive` expects opacity `1`, which is stale for the `opacity-50` layer. Not used by 018.

## Review Findings

### 2026-11-12 reviewer

**Verdict: APPROVE.** All 44 criteria are satisfied or honestly scoped (13 proxy, 37 unit-only, 41–43 measured and routed). No `any`, no unsound cast, no copied asset, no branding risk. Eight findings below, none blocking; 1–4 are worth a follow-up ticket, 5–7 are notes, 8 is pre-existing.

**The three writers cannot disagree — checked, holds.** The shape predicate is identical across all three readers of `state.background`: the boot script (`lib/preferences/boot-script.ts:36`), `isBackgroundId` (`lib/preferences/schema.ts:57`), and the store's rehydrate path, which nulls an invalid-shaped id through `sanitizePreferences` (`lib/preferences/schema.ts:149`) and `isPreferences` (`:170`). So a shape the script rejects can never reach the runtime as a pending read, and the "script unlocked, runtime pending" flash is unreachable by construction, not only by test. The CSS/React handover is also clean: pre-hydration both SSR and the first client render return `selectorShown === true` (context default `ABSENT`, `hooks/use-background-image.ts:38`) so the fieldset is in the markup and hydration matches, while CSS hides it; `useThemeSync` is gated on `hasHydrated` (`hooks/use-theme-sync.ts:35`) so it never clears the boot script's attribute before the store is read. `onRehydrateStorage` (`lib/preferences/store.ts:115`) sets `hasHydrated` even when rehydration fails, so the "store never hydrates, selector hidden forever" trap does not exist. The Tailwind arbitrary variant compiles: `html[data-theme-lock=locked] .\[html\[data-theme-lock\=locked\]_\&\]\:hidden{display:none}` is present in `out/_next/static/chunks/3kgur_7fi1xu-.css`.

**The race fix is sound.** `hooks/use-background-image.ts:71-74` — revoke and `setSettled(null)` happen in the same cleanup, during the commit of the update that changed `id`, and that same commit already rendered `pending` via the `settled?.id !== id` guard at `:79`. No commit can therefore observe `settled` pointing at a revoked URL, so both guards are needed and neither is redundant. No re-entrancy: the cleanup's `setSettled(null)` lands before the new effect's async read resolves, and on unmount it is a React 18 no-op. Object-URL lifecycle checked on all four paths: id change, unmount, route change (the provider lives in the root layout and never unmounts on a route change), and deferred load — `load` re-checks `cancelled` after `await loadBackground` and before `URL.createObjectURL` (`:52-55`), so no URL is minted after its cleanup ran, and a cancel during the decode await is revoked by the cleanup with the double-revoke being a spec no-op. Single-read invariant holds: `useBackgroundSource` has exactly one caller, `components/BackgroundProvider.tsx:8`; `BackgroundLayer.tsx:26` and `use-theme-lock.ts:8` are context consumers. Reads are one per *change* of the id, not one per id ever — consistent with ruling 1 and with the docstring.

**Performance.** `BackgroundProvider` takes `children` as props, so its re-renders on status change do not re-render the tree — only the three context consumers. Correct pattern, worth keeping. No timer logic touched; no interval counting introduced.

**Contrast measurement is sound, with one methodological caveat (finding 4).** I re-derived two figures from the reported pixels and they check out: digits (245,235,220) over rgb(139,135,130) → 2.97 (reported 3.02); wordmark (240,165,80) over the same ground → 1.71 (reported 1.73). The bright ground rgb(139,135,130) is also arithmetically consistent with rgb(250,250,246) at 0.5 over the dark ground, which independently confirms the overlay was not moved. Provenance is named per criterion 41. **Framing for the owner, since it is not obvious from the figures:** these sub-floor ratios are a pre-existing property of the `opacity-50` overlay, not something 018 introduced — 018 *raises* contrast over an image, because the state it replaces is light text-on-light over the same ground. The routing under criterion 43 stands; no opacity change was proposed.

**Licensing / branding: clear.** Both test images are generated in `e2e/task-018-contrast.spec.ts:14-22` (a flat fill and a deterministic integer hash — no external bytes, no licence to track). `git status` shows no binary or font added. All new copy is original: the note (`components/BackgroundControl.tsx:114-117`) and the two announcements (`components/ThemeLockAnnouncer.tsx:6-7`) are plain functional English with no resemblance to another product's wording. Criterion 31's string survives JSX line-wrapping as an exact match (the newline collapses to one space before "System").

#### Findings

1. **Stranded docstring — `lib/preferences/schema.ts:234-246`.** The task-015 block describing `TASK_PANEL_ATTRIBUTE` is now separated from its constant by the 018 insert, so it reads as documentation for `THEME_LOCK_ATTRIBUTE` and is immediately followed by a second `/** */`. `TASK_PANEL_ATTRIBUTE` (`:254`) is left undocumented. Consequence: the next reader attributes the task-panel contract to the theme lock. Fix: move the 018 block below `TASK_PANEL_HIDDEN_VALUE`, or the 015 block back onto its constant.

2. **The first-paint selector hide has no assertion — `components/ThemeControl.tsx:46`.** The entire pre-hydration behaviour rests on the arbitrary variant `[html[data-theme-lock=locked]_&]:hidden`. I confirmed it compiles today, but no criterion reads the fieldset's computed `display` in the pre-hydration window; criterion 13's throttled proxy tracks the `<html>` class, not the selector. Consequence: a class rename, a Tailwind content-scan change or a move of the fieldset markup regresses the selector flash silently, with every test still green. Fix: one assertion — either a source/CSS grep for the compiled `html[data-theme-lock=locked]` rule, or an early-evaluate read of the fieldset's computed `display` alongside criterion 11's init-script read.

3. **The boot-script shape duplicate has no back-pointer — `lib/preferences/schema.ts:57`.** Answering the question directly: criterion 7's guard **is sufficient today**, because it compares the script's `k` against `isBackgroundId` itself across 20 shapes rather than snapshotting an expected result, and both share `BACKGROUND_ID_MAX_LENGTH` and `BACKGROUND_ID_PATTERN`, so a constant change propagates and a predicate-shape change fails the test. The residual gap is narrow but real: a *new* rule in `isBackgroundId` that none of the 20 shapes discriminates (e.g. rejecting a leading `-`) would pass. Consequence: a dev editing `isBackgroundId` is reading `schema.ts`, where nothing says the predicate is duplicated in a string script. Fix: a one-line comment on `isBackgroundId` naming `boot-script.ts` and the parity test, so the obligation to add a shape row is visible at the edit site.

4. **The ring sampler measures around the box, never under the glyphs — `e2e/helpers/theme-lock-sampler.ts:43-44`.** For BRIGHT (a flat fill) ring == under-glyph ground, so those figures are exact. For BUSY the ring's worst adjacent pixel is a *conservative* stand-in for the ground under the ink, which is the defensible choice over a noise field and is labelled as such. I accept the busy figures as a lower bound, not as the ratio a user experiences. No round is owed here; recording the method in the report is what makes it usable, and qa did. One thing to carry forward if 43 ever returns as its own task: the digits' `fg` is taken from computed `color`, which is the painted ink only while the gauge is not filling the digits — qa's `vessel` rows correctly disclose that their 4.68 is digits-on-gauge-fill, not digits-on-image.

5. **Unreferenced id — `components/BackgroundControl.tsx:114`.** `id="background-theme-note"` is referenced nowhere (grep across the repo returns the declaration only). The picker's `aria-describedby` is still `background-help` alone (`:125`). Criterion 32 is satisfied by document order, so this is not a defect, but the dead id reads as an abandoned `aria-describedby`. Consequence: a screen-reader user focusing the picker is not told why the theme is locked at the point of interaction. Fix: either drop the id or compose `aria-describedby` conditionally — note the reference must not dangle while the note is unrendered.

6. **`hadFocus` survives a blur to nothing — `components/ThemeControl.tsx:52-54`.** `onBlur` clears the flag only when `relatedTarget !== null`, so clicking empty space after focusing a radio leaves it `true`; a later lock would then move focus to the wordmark even though the user was not on a radio. The `active === document.body` guard keeps it from stealing focus from a real element, and the path is unreachable on `/` (the background cannot change there), so this is the same accepted dead path as criterion 37. No action unless the background ever becomes settable from `/`.

7. **The announcer keys on the stored id, the lock keys on status — `components/ThemeLockAnnouncer.tsx:28-29` vs `hooks/use-theme-lock.ts:8`.** An uploaded image that stores its id and then fails to decode would announce "Dark theme applied for your custom background." and then silently unlock when the read settles `absent`. Unreachable through the UI: `canDecodeFile` gates the upload before `setBackground`. Noted only so the divergence is on the record if a future path writes an id without pre-validating bytes. Related and equally bounded: a URL orphaned by a rejection inside `canDecodeImage` stays alive until the next id change or unmount while status reads `absent` (`hooks/use-background-image.ts:57-62`) — one blob, not a leak.

8. **Pre-existing, not 018's to fix.** (a) Criterion 25's 2 px box overlap at 320 shown — **I accept qa's attribution.** I verified it from the diff rather than the claim: the fieldset's layout classes (`-my-0.5 -ml-2`) are unchanged, the added variant is inert while unlocked, and the `h1` gained only `id`, `tabIndex` and `focus:outline-none`, none of which affect layout — so the shown-state geometry at 320 is bit-identical to HEAD. It is a 2 px line-box overlap with no glyph ink measured, i.e. ordinary leading, and the state the criterion actually governs (hidden) has none. Worth its own small ticket, not a gate on this task. (b) `e2e/helpers/background.ts` `waitActive` still expects layer opacity `1`, stale since `opacity-50` landed in `06404a4`; it is the mechanism behind most of the 34 residual e2e failures and will keep costing future tasks a triage until it is re-pointed.

Criterion 44 independently confirmed: `components/BackgroundLayer.tsx` and `app/globals.css` are absent from `git status`.

## Orchestrator close-out, 2026-11-12

**Verdict: done, with the contrast question routed to the owner and not absorbed here.** reviewer APPROVE,
no blocking findings. Findings 1, 2 and 3 are fixed below; 4 and 8 are accepted as written; 5, 6 and 7 are
recorded as bounded notes and carried to PLAN.md.

**Fixed by the orchestrator (trivial tier — doc and one test assertion, no app behaviour changed):**
- **Finding 1**, stranded docstring: the task-015 block sat above `THEME_LOCK_ATTRIBUTE` and read as its
  documentation, leaving `TASK_PANEL_ATTRIBUTE` undocumented. Reordered so each block sits on its own
  constant (`lib/preferences/schema.ts`). The 018 block also now names the `ThemeControl.tsx` class string
  as the other half of the contract, since that is the thing a rename breaks.
- **Finding 3**, no back-pointer: `isBackgroundId` now says in a comment that the predicate is duplicated
  as a string in `boot-script.ts`, that the two share both constants, and that **adding a rule the shape
  table does not discriminate passes the parity test while the script disagrees** — so the obligation to
  add a table row is visible at the edit site, which was reviewer's point.
- **Finding 2**, the first-paint hide had no assertion: added
  `task 018 criterion 6: the first-paint hide is spelled from the lock constants` to
  `lib/preferences/theme-lock.test.ts` (2 tests, suite 57 → 59). It builds the expected variant from
  `THEME_LOCK_ATTRIBUTE` and `THEME_LOCK_VALUE` and asserts it appears on the fieldset element, not merely
  somewhere in the file. **Red-proofed:** renaming the value to `engaged` in the class fails both tests;
  restoring passes 59/59. **What it does not cover, stated so nobody over-reads it:** it pins the class to
  the constants and so closes the *rename* hole. It does not prove Tailwind compiled the rule, so a
  content-scan change still regresses the hide silently. That residual is on PLAN.md.

**Gates after those edits, measured not assumed:** lint 0 errors / 15 warnings (none in a file 018 added or
changed), typecheck 0, build compiled, `npx vitest run` **1342/1342 across 48 files**, and
`npx playwright test --config=e2e/scratch-3100.config.ts` on both 018 specs **40/40**. `git diff` on
`components/BackgroundLayer.tsx` and `app/globals.css` is still empty, so criterion 44 holds.

**Not absorbed, by owner ruling (criterion 43).** The contrast figures stand as measured and routed: digits
3.02-3.62 and wordmark 1.73-1.87 over the two test images in dark, both below floor. reviewer's framing is
the part that matters for the decision and is on the record above — these ratios are a property of the
`opacity-50` overlay, not of 018, and 018 *raises* contrast over an image rather than lowering it, because
the state it replaces is light ink on the same ground. The overlay was not touched. Whether the timer text
needs a ground under it again is a separate task and the owner's call.

**Two coverage gaps the owner should know are gaps, not passes:** criterion 13 (no flash) is an automated
proxy only — a 4x CPU-throttled class timeline, nobody looked at it by eye — and criterion 37 (focus on
lock) is unit-only because no e2e path reaches it. Both are honestly scoped by qa and accepted; neither is
a claim that a human verified the behaviour.
