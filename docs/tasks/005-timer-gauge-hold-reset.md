---
id: 005
slug: timer-gauge-hold-reset
status: draft # draft | in-progress | qa | review | done | blocked
---

# Liquid gauge behind the timer, hold-to-confirm Reset

## Goal
Adopt exactly two ReactBits components on `/`, each because it carries function rather than decoration:

1. **SloshGauge**, a liquid-fill gauge wrapped around or behind the timer, whose liquid level encodes the remaining time of the current session. It adds a glanceable reading of "how much is left" without putting a second number on screen.
2. **HoldButton**, replacing the plain Reset button in `components/TimerControls.tsx` with hold-to-confirm. Today a single click on Reset destroys a running session with no confirmation and no undo.

Nothing about timer logic, durations, persisted timer shape, task data, sessions, or `/stats` changes. This is a presentation change plus one interaction change on a destructive control.

## Provenance of this task
This is a **direct owner ask**, not a `docs/PLAN.md` milestone item. `docs/PLAN.md` is not edited by this task and no milestone is renumbered or reordered. Milestone 4 (themes) is still the next planned milestone and this task must not start any part of it beyond the dark-ready token discipline that DESIGN.md already requires of every new surface.

## Given facts (verified by the owner, do not re-research)
These were checked against the ReactBits repository before this task was written. Treat them as settled inputs.

- **Install:** ReactBits publishes a shadcn registry. The two components come from `npx shadcn@latest add @react-bits/SloshGauge-TS-TW` and `npx shadcn@latest add @react-bits/HoldButton-TS-TW`. Files land in this repo as source the project owns. The `shadcn` CLI is already a project dependency.
- **Licence:** MIT plus Commons Clause (`LICENSE.md` in `DavidHDev/react-bits`). It permits use in Pomotato, including commercially, and forbids reselling the components themselves. This needs a provenance entry in `docs/DECISIONS.md` (acceptance criterion below).
- **Both components have zero external dependencies.** Pure React plus canvas/CSS. No `motion`, no `gsap`, no `three`, no `ogl`, no `@hugeicons/*`. This is the reason these two were picked over the rest of the catalog.
- **SloshGauge props include:** `value`, `interactive`, `showValue`, `disabled`, `liquidColor`, `glassColor`, `width`, `height`, `radius`, `ticks`, `viscosity`, `tilt`, `splash`, `unit`, `ariaLabel`, `className`. It reads `window.matchMedia('(prefers-reduced-motion: reduce)')` internally.
- **HoldButton props include:** `children`, `doneLabel`, `icon`, `doneIcon`, `backgroundColor`, `fillColor`, `textColor`, `fillTextColor`, `size`, `radius`, `fillDirection`, `holdTime`, `releaseTime`, `pressScale`, `wave`, `glow`, `resetAfter`, `disabled`, `onHold`, `onTap`, `className`. It handles Space and Enter to hold and Escape to cancel, and ships a `@media (prefers-reduced-motion: reduce)` block.

## Data shape
**Already decided, and unchanged.** This task needs no Dexie schema version, no new table, no new field, and no new type in `lib/db/**`. The gauge consumes values that `components/PomotatoTimer.tsx` already derives from the stored end timestamp via `lib/timer/time.ts`.

Therefore **backend does not run on this task**. Order is: frontend, then qa, then reviewer. If anything here appears to require a change under `lib/db/**` or `lib/timer/**`, this task's scope was wrong: stop and report instead of editing those directories.

## Motion purpose, stated up front (antislop R-19 and R-31)
Written here so frontend has it in writing rather than inventing a justification later:

- **Gauge level:** the liquid height encodes remaining time, so the session's progress is readable without parsing digits.
- **Gauge slosh:** the slosh marks a state change (start, pause, resume, reset, completion). It is a transition cue, not an idle ornament.
- **HoldButton fill sweep:** the fill communicates how much longer to keep holding, and makes a destructive action deliberate rather than accidental.

Dials for this surface, read from DESIGN.md ("calm and cute", "minimalist overall", "some animation is welcome"): **ENERGY 1 / RHYTHM 1 / MOTION 1**. One focal point on `/` stays the `mm:ss` readout; the gauge supports it and must not compete with it.

## Scope

**In:**
- Running the two `npx shadcn@latest add @react-bits/...` commands, including whatever `components.json` registry configuration the `@react-bits` namespace needs, and reconciling anything the CLI tries to do to `app/globals.css`.
- Placing SloshGauge around or behind the existing `mm:ss` readout and feeding it the already-derived remaining-time ratio.
- Replacing the Reset `<button>` in `components/TimerControls.tsx` with HoldButton, wired to the existing `reset()` action from `lib/timer/store`.
- Resolving the canvas colour props from the existing CSS custom properties at runtime, and re-reading them on a theme change.
- Verifying both components under `prefers-reduced-motion: reduce` in a real browser.
- A provenance entry in `docs/DECISIONS.md` for the ReactBits licence, plus the rejected-`ModeSelector` note.

**Out (deferred, do not do here):**
- The paper grain texture and the ReactBits `Noise` component. DESIGN.md defers grain to milestone 4 (themes).
- The dark-mode toggle itself. Milestone 4. This task only has to be dark-ready.
- Any other ReactBits component. `SpringCheck`, `StatusMark`, `RubberSegment`, `CountUp`, `TearTicket` and `SwipeRow` were all considered and deferred.
- **Changing `components/ModeSelector.tsx`.** ReactBits' segmented controls use a `role="radiogroup"` ARIA construction instead of native radio inputs, which collides with CLAUDE.md's "semantic HTML before ARIA". The native radios stay. This is a **rejected option**, recorded so it is not revisited.
- Adding `motion`, `gsap`, `three`, `ogl`, `@hugeicons/*`, or any other new runtime dependency. Both chosen components need none; adding one is a stack change and needs owner sign-off per CLAUDE.md.
- Any change to timer logic, durations, mode behaviour, the persisted timer shape, `lib/timer/**`, `hooks/use-timer-clock.ts`, `hooks/use-hydrate-timer-store.ts`, `lib/db/**`, `lib/stats/**`, `/stats`, the task list, or the task-list dialog.
- Confirmation on any control other than Reset. Start, Pause and Resume stay single-activation.
- A new disabled state for Reset. It stays available in exactly the statuses it is available in today.
- An undo for Reset. Hold-to-confirm is the chosen protection; undo would need stored pre-reset state.

## Acceptance Criteria

### Install, licence, provenance
- [ ] Both components were added with `npx shadcn@latest add @react-bits/SloshGauge-TS-TW` and `npx shadcn@latest add @react-bits/HoldButton-TS-TW`. Implementation Notes record the exact commands run, any `components.json` change the `@react-bits` registry required, and how the pre-existing `vitest` / `@types/node` peer conflict was handled (the recorded workaround is `--legacy-peer-deps`, or `npm_config_legacy_peer_deps=true` in the environment; do not "fix" it by bumping `vitest` or `@types/node`).
- [ ] `git diff package.json package-lock.json` shows **no new runtime dependency**. If the CLI tries to install one, stop and report instead of accepting it.
- [ ] `git diff app/globals.css` contains only intentional changes. If the CLI overwrites the palette (it did exactly this during `shadcn init`, see the 2026-10-07 entry in `docs/DECISIONS.md`), the cream/brown token values, the plain-CSS `body` rule and the `:focus-visible` rule are restored byte for byte. Implementation Notes state whether the CLI touched the file at all.
- [ ] `docs/DECISIONS.md` has a new entry recording: the ReactBits licence (MIT plus Commons Clause, `LICENSE.md` in `DavidHDev/react-bits`), that it permits use here and forbids reselling the components, the two components vendored and where their files live, that they added no dependencies, and the rejected `ModeSelector` option with its one-line reason. If frontend is not permitted to edit `docs/DECISIONS.md`, it drafts the wording in Implementation Notes and the orchestrator lands it; the task is not `done` until the entry exists in the file.
- [ ] No ReactBits file carries an upstream licence header that is stripped. If the generated source includes attribution, it stays.

### Gauge value comes from derived time, never from ticks
- [ ] The gauge's `value` is computed from the `remainingMs` and `fullMs` that `components/PomotatoTimer.tsx` already derives (`getRemainingMs` / `fullDurationMs` from `lib/timer/time.ts`), which come from the stored end timestamp. The same numbers that produce the `mm:ss` string produce the gauge level, in the same render.
- [ ] **No new time source.** The diff adds no `setInterval`, no `setTimeout` chain, no `requestAnimationFrame` loop, and no counter that decrements remaining time. The only clock remains `hooks/use-timer-clock.ts`. Reviewer verifies this by diff; QA additionally asserts the behaviour below.
- [ ] The level the gauge renders is observable to an automated test **without sampling canvas pixels for the value**. Frontend picks the mechanism (for example a `data-*` attribute on the gauge wrapper carrying the rounded percentage) and records it in Implementation Notes so QA can assert it by name.
- [ ] At a focus session's start the level reads full (100 within 1 point) and at completion it reads empty (0 within 1 point). At a point where `mm:ss` reads half of the session length, the level reads 50 within 2 points. QA asserts at least three sampled points per mode, using the same clock control the existing timer e2e tests use.
- [ ] Pause freezes the level: with the timer paused for 3 seconds the observed level does not change. Resume continues from the same level.
- [ ] Switching mode, or changing the custom duration, re-bases the level against the new full duration (a fresh custom session reads full, not the old mode's fraction).
- [ ] A session that expired while the tab was closed renders at empty on load, not at its pre-close level, and does not animate down from full.
- [ ] **No perpetual idle loop.** With the timer `idle`, `paused` or `complete`, and after any slosh from the last state change has settled, the gauge schedules no further animation frames: QA stubs or counts `requestAnimationFrame` after a 1 second settle window and asserts zero further callbacks from the gauge over the next 1 second. The same check with the timer `running` is allowed to be non-zero.

### Canvas colours resolved from tokens (main implementation risk)
- [ ] Every colour handed to a canvas-painted prop (`liquidColor`, `glassColor`, `fillColor`, `backgroundColor`, `textColor`, `fillTextColor`) is a resolved colour string read at runtime from the computed value of an existing CSS custom property (`--primary`, `--border`, `--background`, or another token already in `app/globals.css`). Passing `var(--primary)` is a failure: canvas cannot resolve it.
- [ ] **No hardcoded hex and no raw palette utility** (`amber-*`, `stone-*`, `red-*`, `#rrggbb`, `rgb(...)` literals) in any line this task adds, in either generated file or in the components that use them. QA adds a guard test in the shape of the existing `components/TaskListDialog.tokens.test.ts`.
- [ ] If a token is genuinely missing for one of these roles, it is added to `app/globals.css` as a **semantic token** with a one-line reason in the comment block, never inlined at the call site. Prefer an existing token; Implementation Notes justify any new one.
- [ ] **Colours are re-read when the theme changes.** They must not be read once at mount and cached for the life of the page. Milestone 4 adds the dark-mode toggle next, and DESIGN.md requires new surfaces to be dark-ready from the start. Frontend states in Implementation Notes which signal triggers the re-read and confirms that signal is something a future `.dark` class toggle can fire.
- [ ] QA proves the re-read: it changes a token at runtime (for example `document.documentElement.style.setProperty('--primary', ...)`, or whatever signal frontend documented), triggers that signal, and asserts the gauge repaints with the new colour. A canvas pixel sample or a recorded resolved-colour attribute is acceptable evidence; frontend records which one QA should use. A test that only checks the prop value in React state does not satisfy this.
- [ ] QA spot-checks this criterion by breaking it: pin the colour to a mount-time constant, confirm the test fails, restore. Recorded in the QA Report, per the 2026-10-07 standing-practice entry in `docs/DECISIONS.md`.

### Gauge accessibility and visual integration
- [ ] The `mm:ss` text in `components/TimerDisplay.tsx` remains the accessible source of truth for remaining time. The gauge adds **no second rendered number**: `showValue` is off.
- [ ] The gauge is not a control: `interactive={false}`, it is not in the tab order, pointer and keyboard interaction with it cannot change `value` or any timer state, and it is not announced as a control by assistive tech.
- [ ] The gauge does not duplicate the remaining time for screen readers (no second announcement of the same value). Frontend chooses between hiding it from assistive tech and giving it a label that adds information the `mm:ss` does not, and records the choice with a one-line reason.
- [ ] The existing completion announcement in `components/PomotatoTimer.tsx` (the `aria-live="polite"` `role="status"` paragraph and its `prevStatusRef` guard) is unchanged and still announces exactly once per genuine completion, with no announcement on a reload that is already complete. The gauge must not reuse that live region for anything.
- [ ] **Contrast of the `mm:ss` over the gauge.** Text over a liquid fill passes over different colours as the level moves. The readout meets WCAG AA (3:1 for large text at its rendered size, 4.5:1 if any part of it renders below the large-text threshold) against the liquid, against the glass, and at the waterline, measured at a minimum of the full, half and empty levels. QA records the measured ratios. If this cannot hold at some level, the gauge goes behind or around the text rather than under it; it is not solved with a text shadow.
- [ ] No axe-core violation of serious or critical impact on `/` with the gauge present, in each timer status: idle, running, paused, complete.
- [ ] At 320 px and at 1280 px the gauge fits with no horizontal page scroll (`document.documentElement.scrollWidth <= clientWidth`), does not clip or overlap the `mm:ss`, the mode selector, the custom duration input, or the controls, and leaves every control at least 44 px in both dimensions. The timer stays the single focal point of the screen.
- [ ] No React hydration mismatch error or warning in the console on reload of `/`, with the timer idle, running and paused. The gauge reads `window.matchMedia` internally, so it must not render differently on the server than on the client.
- [ ] Zero console errors or warnings across: load, start, pause, resume, reset, completion, mode switch, and reload, at both viewports.

### Hold-to-confirm Reset
- [ ] The Reset control on `/` is HoldButton. Its visible text still names the action in product terms ("Reset", or wording that says the same thing) and its visible text is contained in its accessible name (WCAG 2.5.3).
- [ ] **A short tap does not reset.** Pressing and releasing quickly leaves `status`, the stored end timestamp, `pausedRemainingMs` and the rendered `mm:ss` exactly as they were. QA asserts the timer keeps counting after a tap on a running timer.
- [ ] **A tap is not a dead control.** It surfaces a hint that the control must be held (visible text, and announced politely to assistive tech), without writing into the existing completion live region in `PomotatoTimer.tsx` and without shifting layout around the controls.
- [ ] **A completed hold resets exactly once.** After holding for the configured duration, `reset()` runs one time: the timer returns to its idle full duration for the current mode, the stored end timestamp is cleared, and the state survives a reload. Holding longer does not fire it twice.
- [ ] **Releasing early cancels.** Releasing before the hold completes leaves the timer untouched and returns the button to its resting appearance with no residual fill.
- [ ] The hold duration is between **500 ms and 1200 ms**. Frontend records the exact value in Implementation Notes and QA asserts both sides: a press shorter than the configured duration does not reset, a press longer than it does.
- [ ] **Keyboard operation holds.** The button is reachable by Tab in an order matching visual order. Holding Space resets. Holding Enter resets. Escape during a hold cancels it with no state change. Releasing the key early cancels. Keyboard and pointer paths produce identical outcomes.
- [ ] The focus indicator matches the app's existing pattern: a 2 px amber outline with a 2 px offset, the same shape used by the other timer controls, at 3:1 or better against both the button surface and the page behind it. QA measures it.
- [ ] The control keeps `min-h-11` (at least 44 px tall) and is at least 44 px wide, at 320 px and 1280 px.
- [ ] `glow={false}`. DESIGN.md's direction is calm and minimalist, and app-wide glow is an antislop violation (R-13). No glow, and no new shadow beyond what the other controls already use.
- [ ] Reset remains available in every status it is available in today. No new disabled state, and no state in which the user can see a Reset control that cannot act (antislop R-26).
- [ ] The Start / Pause / Resume button is unchanged: same single-activation behaviour, same labels, same styling, same focus ring.

### Reduced motion (verified, not assumed)
- [ ] With `prefers-reduced-motion: reduce` emulated, **the gauge still renders the correct level** and still updates as time passes, with its slosh and any continuous motion suppressed. QA asserts the level is still correct in this mode, not just that nothing moves.
- [ ] With `prefers-reduced-motion: reduce` emulated, **HoldButton still works**: hold still resets, early release still cancels, Escape still cancels, and the user can still tell the hold is in progress. A control whose only progress feedback disappears under reduced motion is a failure.
  - **Amended 2026-10-19 by the orchestrator, on the owner's decision.** This criterion originally required a *non-animated* cue, and QA failed it because the cue is an opacity transition on `.hb-fill` over the 800 ms hold. The original wording was too strict: `prefers-reduced-motion` asks for the suppression of *movement*, not of all change, and an opacity fade involves no motion. An 800 ms hold-to-confirm also has to communicate elapsed progress somehow, so forbidding animation of any kind leaves no good option. The requirement is now that progress remains perceivable, which the fade satisfies. **Recorded deviation:** the cue is animated; this is deliberate, not an oversight.
- [ ] QA verifies reduced motion with Playwright's `emulateMedia({ reducedMotion: "reduce" })` against the real components, and pairs each check with a default-motion equivalent so the reduced-motion assertion cannot pass vacuously.
- [ ] Both components are exercised in a real browser under both motion settings, not inferred from reading their source. Implementation Notes record what was observed.

### Regression (must keep working, unchanged)
- [ ] Remaining time is still derived from the stored end timestamp. `lib/timer/**`, `hooks/use-timer-clock.ts`, `hooks/use-hydrate-timer-store.ts`, `lib/db/**` and `lib/stats/**` are byte for byte unchanged (reviewer verifies by diff).
- [ ] `e2e/timer.spec.ts` passes unchanged in substance: start, pause, resume, reset, mode switching, custom duration, completion, retroactive completion after a closed tab, and persistence across reload all behave as before. Any test touched by this task changed only in how it drives the Reset control (a hold instead of a click), and the QA Report says which tests those are.
- [ ] Milestone 3 session logging is unaffected: completing a focus run still writes exactly one session row and still takes a pinned task's `completed` up by exactly one, with no double counting. A **reset** run still logs nothing.
- [ ] The task-list dialog, `CurrentTaskCard`, the "Focus stats" link and `/stats` are untouched in behaviour and appearance.
- [ ] The full existing suites pass: `lib/timer/*.test.ts`, `lib/db/*.test.ts`, `lib/stats/aggregate.test.ts`, `components/TaskForm.test.tsx`, `components/TaskListDialog.tokens.test.ts`, `e2e/timer.spec.ts`, `e2e/task-list.spec.ts`, `e2e/task-list-dialog.spec.ts`, `e2e/sessions.spec.ts`, `e2e/stats.spec.ts`, `e2e/accessibility.spec.ts`.

### Tooling and quality gates
- [ ] `npm run lint`, `npm run typecheck`, `npm run build`, `npm run test` and `npm run test:e2e` all succeed.
- [ ] No `any` in new or changed code (TypeScript strict).
- [ ] New tests cannot pass vacuously: no assertion inside `try`/`catch` or `if`, no observer that may never attach, no `toBeVisible()` on something already true when asserted, no test with zero assertions. The four known vacuous shapes are recorded in the 2026-10-09 and 2026-10-15 entries in `docs/DECISIONS.md`.
- [ ] QA breaks the implementation and confirms the test fails, then restores it, for at least three criteria: the resolved-token colour re-read, the short tap not resetting, and the gauge level matching the derived remaining time. Recorded in the QA Report.
- [ ] Implementation Notes record, before QA starts: the two commands run and any `components.json` change; whether the CLI touched `app/globals.css`; whether either generated file was edited and why (per the 2026-10-15 precedent, editing generated source is allowed but must be recorded in a header comment in the file); the configured `holdTime`; the signal that triggers the colour re-read; how QA observes the gauge level; and where the gauge sits relative to the `mm:ss`.

## Files likely touched
- `components/ui/SloshGauge.tsx` and `components/ui/HoldButton.tsx` (frontend, generated): wherever the `@react-bits` registry places them per `components.json`. If it writes outside `components/`, say so in Implementation Notes.
- `components/PomotatoTimer.tsx` (frontend): pass the already-derived remaining-time ratio down. The completion live region and `prevStatusRef` logic stay as they are.
- `components/TimerDisplay.tsx` (frontend): where the gauge sits relative to the `mm:ss` readout.
- `components/TimerControls.tsx` (frontend): Reset becomes HoldButton; the primary button is untouched.
- `app/globals.css` (frontend): only if a token is genuinely missing, plus restoring anything the CLI overwrites.
- `components.json` (frontend): only if the `@react-bits` registry namespace has to be declared.
- `docs/DECISIONS.md`: ReactBits licence and provenance, plus the rejected-`ModeSelector` note.
- `e2e/timer.spec.ts` and any new spec (qa only).
- **Not touched:** `lib/**`, `hooks/**`, `app/stats/**`, `components/ModeSelector.tsx`, `components/CustomDurationInput.tsx`, `components/TaskList*.tsx`, `components/TaskRow.tsx`, `components/CurrentTaskCard.tsx`, `components/Stats*.tsx`, `docs/PLAN.md`.

## Risks
- **Canvas cannot resolve CSS variables. This is the main implementation risk.** `liquidColor`, `glassColor` and `fillColor` are painted to a canvas, so `var(--primary)` paints nothing or paints wrong. The colours have to come from the resolved computed value of the custom properties and have to be re-read on a theme change. Milestone 4's dark toggle is next, and DESIGN.md requires new surfaces to be dark-ready from the start with semantic tokens only, so a mount-time snapshot of the light palette is a defect that will surface in the next milestone rather than this one. Related trap from the 2026-10-15 entry in `docs/DECISIONS.md`: focus-ring colour does not currently flow through `--ring`, so do not assume a token is live just because it exists.
- **Text contrast over a moving fill.** The liquid level crosses the `mm:ss` readout as the session drains, so the text sits over liquid, glass and the waterline at different times. This is exactly the "white text on a gradient that is light in some areas" failure (antislop R-25). Measuring at one level proves nothing.
- **Hydration.** SloshGauge reads `window.matchMedia` internally, and canvas has no server rendering. Getting the client boundary wrong shows up as a hydration warning or a first-paint flash of the wrong level.
- **A hold is a timing requirement on a destructive control.** Users with motor impairments, tremor, or switch access can find a sustained press hard. The keyboard path (Space, Enter, Escape) and an early-release cancel are the mitigations required above, and the duration is capped at 1200 ms so it does not become a chore. If the owner later wants a confirmation dialog instead, that is a separate task.
- **The hold hint must not be a dead tap.** A tap that silently does nothing reads as a broken button (antislop R-26). The hint has to be visible and announced without hijacking the completion live region.
- **The gauge becoming decoration.** If it is tuned so the level is hard to read, or so it draws attention away from the `mm:ss`, it has failed its purpose test and should be reworked or dropped rather than kept as ornament (antislop R-31). DESIGN.md asks for minimalist and not overbearingly cute; the dials above are ENERGY 1 / RHYTHM 1 / MOTION 1.
- **Idle animation loops.** A canvas component that repaints forever burns battery on a page a user keeps open for hours of study. The zero-frames-when-idle criterion exists because this is easy to ship without noticing.
- **Registry configuration.** The `@react-bits` namespace may need a `components.json` entry before `shadcn add` resolves it. If the CLI wants to install a dependency or rewrite `app/globals.css`, stop and report rather than accepting it.
- **Generated source is owned, which cuts both ways.** Per the 2026-10-15 entry in `docs/DECISIONS.md`, editing a generated component is allowed, but the file must carry a header comment saying so, otherwise a future `add` offering to overwrite it looks like a routine update rather than a conflict.
- **Licensing:** MIT plus Commons Clause is fine for this use and is the reason the `docs/DECISIONS.md` entry is an acceptance criterion rather than a nicety. No audio, fonts or images are added by this task. Anything binary that appears must be original or CC0 with provenance in the log.
- **Next.js version.** Per `AGENTS.md`, frontend reads the relevant guide in `node_modules/next/dist/docs/` before writing component code. Both components are client-only.
- **antislop mode is `during` for this session** (session override, supplied by the owner through the orchestrator). Frontend announces `antislop active: during (session override).` before its first UI edit and runs the Delivery Gate before handing over.

## Implementation Notes
(Filled in by frontend as they build. Decisions, tradeoffs, anything the next agent needs to know. The last item in "Tooling and quality gates" lists the seven records that must be here before qa starts.)

### Step 0: TimerDisplay dead-code cleanup (separate from the gauge diff)
- Removed the two commented-out `<p>` elements (mode label, status label) and the unused `STATUS_LABELS` import in `components/TimerDisplay.tsx`. Did not bring either label back.
- After removal `modeLabel` and `status` are no longer read by `TimerDisplay`. The prop interface keeps both and `PomotatoTimer`'s call site still passes them, as instructed. `status` is still passed but the gauge does not need it (the gauge level comes from `remainingMs`/`fullMs`), so `modeLabel` and `status` are now both unused props. Dropping them is a one-line follow-up for whoever owns it.
- Baseline after step 0, before any feature work: `npm run lint` 0 errors (21 pre-existing warnings, all in test files plus `CurrentTaskCard.tsx`), `npm run typecheck` clean.

### The seven records QA needs
1. **Commands run** (both with `npm_config_legacy_peer_deps=true` exported, per the vitest/@types/node precedent; nothing was installed so it did not matter):
   - `npx shadcn@latest add @react-bits/SloshGauge-TS-TW --yes`
   - `npx shadcn@latest add @react-bits/HoldButton-TS-TW --yes`
   - `components.json`: the CLI added `"registries": {"@react-bits": "https://reactbits.dev/r/{name}.json"}` by itself. No manual edit. Files landed flat in `components/SloshGauge.tsx` and `components/HoldButton.tsx` (default export), not `components/ui/`. Nothing wrote outside `components/`.
   - `package.json` and `package-lock.json`: byte-identical before and after. No new dependency.
2. **`app/globals.css`**: the CLI did not touch it (diffed against a pre-command copy). My only change is one new token, `--gauge-liquid: #f6c453` (mid amber), with its reason in the comment. Existing tokens could not do the job: `--accent` is 1.1:1 against `--popover` so no level is visible, `--primary` leaves the mm:ss at about 3.5:1. Milestone 4 needs a dark value for it.
3. **Generated files were edited**, each carries a header comment listing the edits.
   - `SloshGauge.tsx`: removed the numeric readout (`showValue`, `unit`, `onColor`, both text spans; `onColor` held hex literals); `width`/`height` made optional so the vessel fills its parent and stays responsive; colour defaults `transparent`; `live` ref synced in a layout effect (lint `react-hooks/refs`); **fixed an upstream bug**: unmount cleanup did not zero `sim.raf`, so under React StrictMode (dev) the liquid never moved because `wake()` believed a frame was pending. This only shows in dev; production would have been fine, but QA runs against `npm run dev`.
   - `HoldButton.tsx`: removed every hex/rgba literal and the base inset shadow; hover tint mixes with `--hb-text` instead of `#fff`; focus outline now 2px at 2px offset (was 3px); dropped `border-0` so a border can be passed; `md` size is `text-base px-6`; hint span `aria-hidden` so the button's accessible name is exactly "Reset" (it stays as `aria-describedby`); `releaseRef` synced in a layout effect; two `performance.now()` calls carry `eslint-disable react-hooks/purity` (they only run from handlers).
4. **`holdTime` = 800 ms** (`RESET_HOLD_MS` in `components/TimerControls.tsx`). `resetAfter` 600 ms, `wave={false}`, `glow={false}`, `radius={8}`, `className="min-h-11 border border-border"`.
5. **Colour re-read signal**: `hooks/use-resolved-tokens.ts` (`useResolvedTokens`, built on `useSyncExternalStore`). It reads `getComputedStyle(document.documentElement).getPropertyValue("--token")` and subscribes to a `MutationObserver` on `<html>` for attribute changes to `class`, `style` and `data-theme`, plus `prefers-color-scheme` changes. A future `.dark` class (or `data-theme`) toggle on `<html>` fires it; so does `document.documentElement.style.setProperty('--gauge-liquid', ...)`, which is what QA should use. Server and hydration snapshots return empty strings so markup matches, then the client snapshot applies. Tokens used: gauge `--gauge-liquid`, `--popover`; Reset `--popover` (bg), `--primary` (fill and focus ring), `--secondary-foreground` (text), `--primary-foreground` (fill text). Not cached at mount.
6. **How QA observes the level**: `data-testid="timer-gauge"` wrapper in `components/TimerGauge.tsx` carries `data-gauge-level` (integer 0-100, rounded, computed in the same render as the mm:ss from the same `remainingMs`/`fullMs`; attribute absent until the timer store has hydrated), `data-gauge-ready` ("true"/"false"), and `data-liquid-color` / `data-glass-color` holding the currently resolved colour strings (use these for the re-read test; they are set from the hook's output, so a mount-time constant makes them fail). The inner `role="meter"` also exposes `aria-valuenow`, but the wrapper is `aria-hidden`.
7. **Gauge position**: behind the mm:ss, as an absolutely positioned vessel (`inset-0`, rounded-2xl, 1px `border-border`) in the `relative` container in `components/TimerDisplay.tsx`; mm:ss is a `relative` sibling after it, so it paints above. Container is `w-full`, `min-h-40 sm:min-h-44 lg:min-h-52`. Level drains from the bottom.

### Decisions and observations
- **Neither component paints to a canvas.** Both use divs, `clip-path` and CSS custom properties, so `var(--primary)` would in fact work. I still resolve every colour to a computed string as the criteria require, but the "canvas cannot resolve var()" premise in the task is wrong for these two files. The re-read still matters for the AC and costs little.
- **Contrast** (mm:ss is `text-stone-900` = `#1c1917`, unchanged): 10.78:1 on the liquid `#f6c453`, 16.84:1 on the glass `#fffaf3`. The waterline is a hard edge between those two, so no mixed colour exists. Text passes 4.5:1 everywhere, so no text-shadow and no need to move the gauge. Non-text: liquid vs glass is only 1.56:1, so the level is legible by shape but would not pass 1.4.11 as a sole carrier; mm:ss is the truth and the vessel has a border. Flagging for reviewer.
- **Assistive tech**: wrapper is `aria-hidden="true"`, `pointer-events-none`, no tabindex. Reason: it would just repeat mm:ss. The completion live region and `prevStatusRef` guard in `PomotatoTimer.tsx` are untouched; I only added three props to the `TimerDisplay` call.
- **Reload while complete or expired**: the gauge is not rendered until `hasHydrated`, so it mounts at its real level instead of animating down from the pre-hydration idle full level. A reload on a completed timer read level 0 with no animation.
- **Slosh**: only value changes move the liquid (reset from mid-session, mode switch). Start from idle moves nothing because the level does not change; I did not add a synthetic kick. Tuned `tilt` 0.2, `splash` 0.2, `ticks` 0 for MOTION 1.
- **Tap hint**: a separate `role="status" aria-live="polite"` paragraph in `TimerControls.tsx` (not the completion region), absolutely positioned under the controls so nothing shifts. Text "Press and hold Reset to confirm." It clears when a hold completes or the timer status changes. There is deliberately no timeout to dismiss it (no new timers in the diff); it persists until then.
- **doneLabel** is "Reset", so the button text does not flip to different wording for the 600 ms after a completed hold.
- **Reduced motion under HoldButton**: the sweep becomes an opacity fade of the full fill over the hold time (upstream CSS). Observed in Chromium with `reducedMotion: reduce`: at 50% of the hold the fill opacity was about 0.48 (default motion 1 with clip sweep), so progress is still visible and not purely animated movement. Early release and Escape both cancel.
- **No new time source**: the diff adds no `setInterval`, `setTimeout` chain or rAF in my files. The only rAF/timeout use is inside the vendored components (gauge spring settle, hold sweep), which park when idle.
- Vendored files import nothing outside React.

### Browser verification (my own throwaway scripts against `npm run dev`, Chromium, not committed)
Both motion settings and viewports 1280 and 320: no console errors or warnings, `scrollWidth == clientWidth` at 320, Reset 92.6 x 44 px. Level read 100 at start, 50 at 12:30 and 26 at 06:37 (using a `Date.now` offset), 0 at 00:00 and after reloading on a complete timer. Paused for 3 s: level unchanged. Tap on running timer: time kept counting, hint appeared. 400 ms hold: no reset. 1000 ms hold: reset to 25:00. Keyboard: Space held then Escape cancelled and the timer kept running; Enter held 1000 ms reset it. Focus outline on Reset: solid 2px, 2px offset, `rgb(180, 83, 9)`. Zero rAF callbacks in the 1 s after the idle gauge settled. Not run: `npm run build`, vitest, Playwright suites (the dev server on :3000 was the owner's; I did not rebuild `.next`). Existing e2e tests that click Reset (`e2e/timer.spec.ts` lines 93, 258, 297, `e2e/sessions.spec.ts` 206, 617) will now need a hold instead of a click; that is QA's edit. Note the Reset button's markup contains its label three times (main plus two aria-hidden fill layers), so `getByText("Reset")` can match more than one node; `getByRole("button", { name: "Reset", exact: true })` is fine.

### Drafted `docs/DECISIONS.md` entry (frontend may not edit that file; orchestrator to land it)
> ### 2026-10-19 - ReactBits SloshGauge and HoldButton vendored (MIT + Commons Clause)
> Added `components/SloshGauge.tsx` and `components/HoldButton.tsx` with `npx shadcn@latest add @react-bits/SloshGauge-TS-TW` and `@react-bits/HoldButton-TS-TW`; the CLI registered the `@react-bits` namespace in `components.json`. Licence: MIT plus Commons Clause (`LICENSE.md` in `DavidHDev/react-bits`), which permits use in Pomotato including commercially and forbids reselling the components themselves. Both are dependency-free; `package.json` and the lockfile did not change. `app/globals.css` was not touched by the CLI. Both files are edited (header comments list how), so a future `shadcn add` offering to overwrite them is a conflict. SloshGauge fixes an upstream StrictMode bug (stale `sim.raf` after unmount). Rejected: ReactBits' segmented control for `ModeSelector`, because it builds a `role="radiogroup"` out of ARIA where the native radio inputs already give that semantics (CLAUDE.md: semantic HTML before ARIA). Also noted: neither component paints to a canvas, so the "canvas can't resolve var()" concern in task 005 did not apply, but colours are resolved from tokens anyway and re-read on theme change.

### Fix loop 1 (frontend)
- `components/CurrentTaskCard.tsx`: every `text-stone-500` became `text-muted-foreground` (4 sites). `text-red-700` became `text-destructive`; `text-stone-900` became `text-foreground`. `bg-white`, border, `TaskColorDot` and the count stay removed.
- Contrast on cream `--background` (#fbf4ea): `text-muted-foreground` 6.99:1, `text-destructive` 5.92:1, `text-foreground` 14.55:1. All pass AA, so both optional swaps were kept.
- `components/ModeSelector.tsx`: restored `<legend className="sr-only">Timer mode</legend>` as the first child of the fieldset. No margin or visible change.
- `components/TimerDisplay.tsx`: only `text-stone-900` became `text-foreground`; `font-space-grotesk font-extrabold` untouched. Re-measured `mm:ss` (#2b2017): over `--gauge-liquid` (#f6c453) 9.79:1 (was 10.78), over glass `--popover` (#fffaf3) 15.30:1 (was 16.84). Fill levels 100, 50 and 0 only change which of these two backgrounds sits under the text (liquid, a mix of both, glass), so the worst case is 9.79:1 at every level.
- For QA: e2e contrast assertions that hard-code 10.78 or 16.84 (or a #1c1917 text colour) need updating to 9.79 and 15.30 / #2b2017. I did not touch any test.
- Left alone: HoldButton reduced-motion cue (owner amended criterion 42), `app/globals.css`, `app/layout.tsx`, `app/page.tsx`, `DESIGN.md`, `docs/DECISIONS.md`.
- `npm run lint` and `npm run typecheck`: see orchestrator report for results.

### Fix loop 2 (frontend)
- **R-1, reduced-motion fill.** In `components/HoldButton.tsx` the `@media (prefers-reduced-motion: reduce)` block no longer fades `.hb-fill` opacity. It keeps the hard-edge `clip-path` reveal and quantises progress with CSS `round()`: `.hb-root{--hb-q:round(up,calc(var(--hb-p) * 4),1)}`, and the clip-path formula uses `--hb-q / 4` where default motion uses `--hb-p` (right and up directions both). `--hb-p` is still driven by the rAF loop; only the clip reads the quantised value, so the edge jumps to 25, 50, 75, 100% (`up` rounding, so the first step appears as soon as the press starts). `.hb-fill` transition is `none`, `.hb-crest` stays hidden, `glow={false}` and the `aria-hidden` hint are unchanged. Release steps back down the same way over `releaseTime`. Default motion CSS is untouched. Requires CSS `round()` (Chrome 125+, Safari 15.4+, Firefox 118+). **[CORRECTED in fix loop 3, see below: the fallback claim originally written here was wrong. It said a browser without `round()` drops the declaration and falls back to the default continuous reveal.]**
- **Label contrast at 0/25/50/75/100% of the hold, both settings.** A hard edge means each pixel is fully one state. Inside the swept region: `--primary-foreground` #fff on `--primary` #b45309 = 5.02:1. Outside: `--secondary-foreground` #44403c on `--popover` #fffaf3 = 9.89:1. Default motion (continuous clip): every point 5.02 / 9.89. Reduced motion (stepped clip, same two states): 0% 9.89, 25% 5.02 / 9.89, 50% 5.02 / 9.89, 75% 5.02 / 9.89, 100% 5.02. All >= 4.5:1. Computed from the token values, not measured in a browser (see below).
- **R-3.** `components/SloshGauge.tsx`: `live` ref initialised with `{ viscosity, tilt, splash, value, onChange }`, cast removed, header lists the edit.
- **R-4.** `components/TimerDisplay.tsx`: `modeLabel` and `status` removed from the interface (and the unused `TimerStatus` import); `components/PomotatoTimer.tsx` no longer passes them.
- Not done: R-2 (owner's call). Not verified in a real browser under reduced motion (no Playwright per instructions); the stepped reveal is by reading and contrast arithmetic only. `npm run lint`: 0 errors, 21 warnings (baseline). `npm run typecheck`: clean.

## QA Report
- Verdict: **FAIL**
- Why: 7 of 54 criteria fail and 1 is not verifiable from the repo. Three of the seven (25, 48, 49) are caused by the owner's uncommitted edit to `components/CurrentTaskCard.tsx`, not by this task: the `/` axe checks and 12 existing accessibility and dialog e2e tests fail on it. Task 005's own code passes those checks in isolation. Criterion 50 fails because of those e2e failures plus the non-animated cue check. The task-005 gaps are: the reduced-motion hold cue is an animated opacity fade, not the non-animated cue required (42); the DECISIONS entry is not yet in the file (4); and a strict reading of the palette rule on the mm:ss line (15). `npm run test:e2e` cannot be green until the owner's CurrentTaskCard edit is resolved and criterion 42 is met or the criterion is changed by the owner.

### Gate results (final run, current working tree)
- `npx vitest run`: 11 files, **271/271 pass** (baseline 235; +36 new unit tests in 4 files).
- `npm run typecheck`: exit 0.
- `npm run lint`: **0 errors**, 21 warnings, all pre-existing; none in files added by this task.
- `npm run build`: exit 0. Run in an identical copy of the working tree (rsync to a scratch dir), not in the main tree, so the owner's `next dev` on :3000 shares no `.next` with it. Result is the same source.
- `npx playwright test`: **245 total, 228 pass, 17 fail**. The 17 are listed under F1-F3 below.

### Acceptance criteria (54, in file order)
Status key: PASS, FAIL, N/V (not verifiable from the repo). "Evidence" names the test or check that decided it.

Install, licence, provenance
1. Commands recorded (line 67): PASS. Implementation Notes record both commands and the `components.json` registry entry; I checked the `components.json` diff matches. I did not re-run the CLI.
2. No new runtime dependency (68): PASS. `git diff -- package.json package-lock.json` is empty.
3. `app/globals.css` intentional changes only (69): PASS for this task. The only task-005 change is `--gauge-liquid`; cream/brown values, plain `body` rule and `:focus-visible` rule are unchanged in the diff. Note: the file also carries the owner's uncommitted font edits (`@theme inline` font variables, `--font-sans`/`--font-mono` pointed at Comfortaa). Those are not from this task.
4. DECISIONS.md entry (70): **FAIL**. `docs/DECISIONS.md` is unmodified and has no ReactBits entry. The draft is only in Implementation Notes. Outstanding for the orchestrator.
5. No stripped upstream licence header (71): **N/V**. Both generated files have a Pomotato header citing MIT + Commons Clause, but there is no upstream copy in the repo to compare against.

Gauge value from derived time
6. Value from `remainingMs`/`fullMs` (74): PASS. e2e checks level against mm:ss at several points per mode, within 2 points.
7. No new time source (75): PASS with note. Static guard test (`TimerGauge.tokens.test.ts`) finds no timer call in `TimerGauge.tsx`, `TimerDisplay.tsx`, `TimerControls.tsx`, or `use-resolved-tokens.ts`. The vendored `SloshGauge` and `HoldButton` do use rAF and setTimeout, but they stop when idle (criterion 13). Reviewer should confirm by diff.
8. Level observable without canvas sampling (76): PASS. `data-gauge-level` on `[data-testid="timer-gauge"]`.
9. Full at start, 50 at half, 0 at completion, for three modes (77): PASS. Focus, Short break and Custom 10 min, each at start, half and completion.
10. Pause freezes for 3 s, resume continues (78): PASS.
11. Mode switch and custom duration re-base (79): PASS.
12. Expired while closed loads empty, no slide from full (80): PASS. Recorded every `data-gauge-level` value across the reload; the only non-absent value was `"0"`.
13. No perpetual idle loop (81): PASS. Counted every `requestAnimationFrame` call on the page: 0 in each 1 s window after a 1 s settle, for idle, paused and complete. Positive control: running gives more than 0.
Canvas colours from tokens
14. Resolved strings, no `var()` (84): PASS. `data-liquid-color="#f6c453"`, `data-glass-color="#fffaf3"`.
15. No hex or raw palette in added lines (85): **FAIL on strict reading**. Guard tests pass for every new file. One line this task edited still carries a raw palette utility: the mm:ss readout in `TimerDisplay.tsx` keeps `text-stone-900`, and the line was re-written to add `relative`. Pinned in the guard test as the only allowed utility there.
16. Missing token added as semantic, with reason (86): PASS. `--gauge-liquid` has a reason comment and Implementation Notes justify it.
17. Re-read on theme change (87): PASS. Signals are `class`, `style` and `data-theme` on `<html>`, plus `prefers-color-scheme`.
18. QA proves the re-read at runtime (88): PASS. e2e changes `--gauge-liquid`, `--popover` and `--primary`, and adds a `.dark` class with an override, and checks the computed background of the repainted element.
19. Break-and-restore for the colour re-read (89): PASS. See Break A.
Gauge accessibility and visual integration
20. mm:ss is the only number, `showValue` off (92): PASS. Exactly one `mm:ss` text node on the page.
21. Gauge is not a control (93): PASS. `aria-hidden`, no tabindex, `data-interactive="false"`, and a pointer click on the gauge leaves the timer state and level unchanged.
22. No second announcement (94): PASS. Wrapper is `aria-hidden`; frontend's one-line reason recorded.
23. Completion announcement unchanged, once, not on reload (95): PASS. Observer records `"Focus complete"` once; a reload of a complete timer adds nothing. `PomotatoTimer.tsx` diff only adds props.
24. Contrast of mm:ss over the gauge (96): PASS. Numbers under "Contrast measured" below.
25. Axe, serious and critical, on `/` in each status (97): **FAIL** in the current tree. All four status checks fail on the same `color-contrast` violation: "Current task" and "Pin a task..." labels in `CurrentTaskCard.tsx`, 4.38:1 on cream. At HEAD the same label sits on a white card at 4.79:1. With the owner's `CurrentTaskCard.tsx` and `ModeSelector.tsx` reverted to HEAD in a copy, all four pass. The gauge adds no violation.
26. 320 px and 1280 px: no horizontal scroll, no overlap, controls at least 44 px (98): PASS for the measurable parts. The clause "the timer stays the single focal point" is a judgement and is N/V by automation.
27. No hydration mismatch on reload, idle/running/paused (99): PASS.
28. Zero console errors or warnings across the full flow, both viewports (100): PASS. The flow covers load, start, pause, resume, hold reset, completion, mode switch and reload.
Hold-to-confirm Reset
29. Reset is HoldButton; name and visible text match (103): PASS. Accessible name is exactly "Reset".
30. Short tap does not reset (104): PASS. Stored state is equal before and after; the readout keeps counting. Break-and-restore B also confirms this.
31. Tap is not a dead control (105): PASS. The hint is `role="status"`, `aria-live="polite"`, sits outside the completion region (which stays empty), and offsets of Start and Reset do not change.
32. Completed hold resets exactly once and survives reload (106): PASS. Counted persisted idle writes: exactly 1 for a 1.2 s hold, and exactly 1 for a 2.5 s hold.
33. Early release cancels with no residual fill (107): PASS. Fill progress is above 0.2 mid-hold and below 0.01 after release.
34. Hold duration 500-1200 ms, both sides asserted (108): PASS. 800 ms (`RESET_HOLD_MS`). e2e: 600 ms does not reset, 1100 ms does. Unit: 500 ms does not, 1200 ms does.
35. Keyboard: Tab order, Space and Enter hold, Escape and early key release cancel (109): PASS.
36. Focus indicator matches Start, 3:1 on surface and page (110): PASS. Reset: solid, 2 px, 2 px offset, `rgb(180, 83, 9)`, identical to Start while focused. Contrast of the ring: 4.84:1 vs the button surface, 4.60:1 vs the page.
37. `min-h-11` and at least 44 px wide, at 320 and 1280 (111): PASS.
38. `glow={false}`, no shadow (112): PASS.
39. Reset enabled and visible in every status (113): PASS.
40. Start, Pause, Resume unchanged (114): PASS. Primary button lines are identical to HEAD. Single activation per click verified.
Reduced motion
41. Gauge still shows the correct level under reduced motion (117): PASS. Paired with default motion; both track the readout.
42. HoldButton still works under reduced motion, with a non-animated progress cue (118): **FAIL**. Reset, early-release cancel and Escape all pass under `reducedMotion: reduce`. The in-progress cue is an opacity transition on `.hb-fill`, `transition-duration: 0.8s`, so it is animated. The criterion requires a non-animated cue. Repro F3.
43. Paired with `emulateMedia` (119): PASS.
44. Both components exercised in a real browser under both motion settings (120): PASS.
Regression
45. Derived time; protected paths byte-identical (123): PASS. `git diff --stat` on `lib/`, `hooks/use-timer-clock.ts`, `hooks/use-hydrate-timer-store.ts`, `lib/db/`, `lib/stats/` is empty. SHA-256 of both hooks matches HEAD.
46. `e2e/timer.spec.ts` passes with only hold changes (124): PASS. Changed: line 93 (click to 1200 ms hold) and line 297 (Enter press to 1200 ms key hold). Line 258 only locates Reset and does not click, so it needed no change, contrary to Implementation Notes. All timer.spec tests pass.
47. Milestone 3 logging unaffected (125): PASS. `sessions.spec.ts` passes, including the edited reset tests at 206 and 617. One row per completion, and reset logs nothing. Caveat: `task-list-dialog.spec.ts` "logs exactly one session" fails on the card count text, which the owner's `CurrentTaskCard.tsx` edit removed (F2).
48. Task-list dialog, `CurrentTaskCard`, stats untouched in behaviour and appearance (126): **FAIL** in the current tree. The task does not touch `CurrentTaskCard.tsx`, but the working tree does: the owner's edit removed the emoji, colour dot and count `span.font-mono`, and changed the card to transparent. With HEAD's `CurrentTaskCard.tsx`, the 54 dialog and accessibility tests pass.
49. Full existing suites pass (127): **FAIL** in the current tree: 12 failures in `accessibility.spec.ts` (10) and `task-list-dialog.spec.ts` (2), all from the owner's uncommitted edits (F2). The same 54 tests pass on HEAD and in the copy with `CurrentTaskCard.tsx` and `ModeSelector.tsx` reverted.
Tooling and quality gates
50. lint, typecheck, build, test, test:e2e all succeed (130): **FAIL**. Lint 0 errors, typecheck, vitest and build pass. `test:e2e` fails with 17 (F1-F3).
51. No `any` (131): PASS. Grep finds none in new or changed code.
52. Tests cannot pass vacuously (132): PASS, after QA's own fixes (see Tests added). No assertion inside `try`, `if` or `else` in the new specs; the observers are proven attached by a positive assertion; every test has at least one assertion.
53. Break-and-restore for at least three criteria (133): PASS. Breaks A, B and C, plus D as an extra. See below.
54. Implementation Notes record the seven items before QA (134): PASS.

Totals: 46 PASS, 7 FAIL (4, 15, 25, 42, 48, 49, 50), 1 N/V (5). Criterion 26 is counted PASS for its measurable parts; its "single focal point" clause is judgement.

### Break-and-restore (each file backed up, SHA-256 checked before and after)
- **A, colour re-read (criterion 19).** Broke `hooks/use-resolved-tokens.ts` so the first resolved value is cached for the page's life. Result: 2 unit tests fail (`use-resolved-tokens`, `TimerGauge` colour test). 4 e2e tests fail: runtime `--gauge-liquid`, runtime `--popover`, `.dark` class, runtime `--primary`. Only the at-load test passes, as it should. Restored; hash verified.
- **B, short tap does not reset (criterion 30).** Broke `components/TimerControls.tsx` so `onTap` also calls `reset()`. Result: 1 unit test fails; 2 e2e tests fail ("short tap leaves state..." and "tap shows the hint..."). Restored; hash verified.
- **C, gauge level matches derived time (criterion 6).** Broke `gaugeLevel` in `components/TimerGauge.tsx` to return `100 - level`. Result: 4 unit tests fail; 6 e2e tests fail. Restored; hash verified.
- **D, StrictMode fix (extra; checks frontend's upstream-bug claim).** Removed `s.raf = 0` from the unmount cleanup in `components/SloshGauge.tsx`. Result: the drawn-liquid test fails (top edge stays out of 48-52% at half), and the slosh-lean control fails. The `data-gauge-level` tests still pass, so the attribute alone would not have caught this. The bug is real in dev. Restored; hash verified.

### Contrast measured (computed styles, Chromium)
mm:ss colour `rgb(28, 25, 23)` (`#1c1917`), 96 px at 1280 px and 60 px at 320 px (both at least 24 px, large-text AA applies).
- Liquid `rgb(246, 196, 83)` (`#f6c453`): **10.78:1**.
- Glass `rgb(255, 250, 243)` (`#fffaf3`): **16.84:1**.
- Waterline: a hard edge between liquid and glass, so the worst pair is the liquid side at **10.78:1**.
- Same values at full (level 100), half (50) and empty (0), at both viewports. Everything is at least 4.5:1, so no text shadow is needed.
- Non-text, liquid against glass: **1.56:1**. Recorded and flagged for reviewer; not gated.

### Files added or changed by QA
Added:
- `components/TimerGauge.test.tsx` (7 tests: `gaugeLevel`, wrapper attributes, derived-level re-derivation, colour resolution).
- `components/TimerGauge.tokens.test.ts` (16 static guards: no hex/rgb/palette in new files; exact pinned palette lists for `TimerControls.tsx` and `TimerDisplay.tsx`; no timer calls in the new files).
- `components/TimerControls.test.tsx` (11 tests: hold timing both sides, tap hint, keyboard paths, single reset call, Reset enabled in every status).
- `hooks/use-resolved-tokens.test.tsx` (2 tests: resolves a token; re-reads after runtime change).
- `e2e/timer-gauge.spec.ts` (gauge levels, colour re-read, reduced-motion pairs, idle frames, layout, contrast, console, axe).
- `e2e/hold-reset.spec.ts` (hold behaviour, keyboard, focus ring, sizes, glow, availability, reduced-motion pairs, non-animated cue).
- `e2e/helpers/timer-hold.ts` (shared helpers: `resetControl`, `holdPointer`, `holdKey`, `readTimerState`, `seedTimerState`).

Changed (Reset-click to hold only; no assertion touched):
- `e2e/timer.spec.ts`: import added; line 93 click to `holdPointer(…, 1200)`; line 297 `press("Enter")` to `holdKey("Enter", 1200)`. Line 258 is locator-only, left alone.
- `e2e/sessions.spec.ts`: import added; line 206 click to `holdPointer(…, 1200)`; line 617 click to `holdPointer(…, 1200), and its locator tightened from `{ name: "Reset" }` to `{ name: "Reset", exact: true }`. This tightening is the only non-hold change.

QA's own corrections while building the tests (none are app changes): a hold helper that did not await the hold (made the short-tap tests vacuous); a jsdom class-signal test that jsdom cannot evaluate (moved to e2e); a tautological palette assertion (replaced with an exact pin); a `.catch` that swallowed an assertion; an `if/else` holding an assertion; a click guarded by `if`; a drawn-liquid check added so the attribute is not the only evidence.

### Repro steps for failures
- **F1, criterion 25 and 49 (axe on `/`, 4 new + 10 accessibility.spec):** `npx playwright test e2e/timer-gauge.spec.ts -g "Axe on"` and `npx playwright test e2e/accessibility.spec.ts`. Expected: 0 serious or critical violations. Actual: `color-contrast`, 4.38:1, on `<p class="text-sm font-medium tracking-wide text-stone-500">Current task</p>` and `<p class="text-center text-sm text-stone-500">Pin a task…</p>`. Cause: uncommitted `components/CurrentTaskCard.tsx` edit (`bg-white` removed, card now on cream). HEAD gives 4.79:1. Checked: same tests pass on HEAD (port 3100 copy) and with that file reverted (port 3101 copy).
- **F2, criterion 47, 48, 49 (task-list-dialog, 2 tests):** `npx playwright test e2e/task-list-dialog.spec.ts -g "counts while the dialog is open"`. Expected: a `0 / 1` or `1 / 1` count inside `span.font-mono`. Actual: element not found. Cause: uncommitted `CurrentTaskCard.tsx` edit removed that span. Passes on HEAD and with the file reverted.
- **F3, criterion 42 (non-animated cue):** `npx playwright test e2e/hold-reset.spec.ts -g "non-animated"`. Expected: `transition-duration` of `.hb-fill` under `reducedMotion: reduce` while holding is `0s`. Actual: `0.8s`. Cause: the vendored `HoldButton` reduced-motion rule (`.hb-root[data-phase=holding] .hb-fill { transition: opacity var(--hb-hold) linear }`) fades the fill over the hold time.
- **F4, criterion 4 (DECISIONS entry):** `grep -n "ReactBits" docs/DECISIONS.md`. Expected: a 2026-10-19 entry. Actual: no match. Orchestrator to land the Implementation Notes draft.
- **F5, criterion 15 (strict palette rule):** `grep -n "text-stone-900" components/TimerDisplay.tsx`. Expected: no raw palette on a line this task changed. Actual: the mm:ss readout, a line the task re-wrote to add `relative`. Owner to rule whether to keep it as pre-existing.
- **F6, criterion 50:** `npx playwright test` totals: 228 passed, 17 failed. This is the sum of F1, F2 and F3.
- **F7, criterion 48:** `git diff -- components/CurrentTaskCard.tsx components/ModeSelector.tsx`. Owner's uncommitted edits, outside this task; `ModeSelector.tsx` also drops the "Timer mode" legend, which the task lists as not touched.

### Verified claims from Implementation Notes
- Zero rAF callbacks from the idle gauge after settling: confirmed (criterion 13).
- Upstream StrictMode bug: confirmed by break D.
- Contrast 10.78 and 16.84; liquid vs glass 1.56: confirmed.
- Focus ring 2 px, 2 px offset, `rgb(180, 83, 9)`: confirmed.
- Reset size 44 px and hold of 800 ms: confirmed.
- "No slosh on start": the derived level moves by about 0.05% in the first second. That is not visible, and I added a test documenting it (`starting from idle does not slosh…`). This is not an acceptance criterion.
- Reduced-motion hold cue: not as claimed. It is an animated opacity fade, so criterion 42 fails.
- "Ran no suites": now run; results above.

### Observations outside the criteria (for reviewer)
- `components/TimerDisplay.tsx` no longer renders the mode label or the status label, which HEAD renders. Not a criterion; reviewer to weigh.
- The mm:ss readout classes differ from HEAD (`font-mono font-semibold` at HEAD, `font-space-grotesk font-extrabold` now). Contrast was measured on the current rendering.

### Not verified
- Criterion 5 (upstream licence headers): N/V, no upstream copy in the repo.
- Criterion 26's "single focal point": N/V, judgement.
- Criterion 1 (install commands): recorded and the registry change confirmed, but the CLI was not re-run.
- Build ran on an identical copy of the tree, not in the main tree (see Gate results).


## QA Report — fix loop 1 re-verification

The first QA Report above is kept unchanged for comparison. This section supersedes its verdict and its FAIL rows for criteria 4, 15, 25 and 42.

- Verdict: **FAIL**
- Why: 3 of 54 criteria fail (48, 49, 50), all caused by the same two tests in `e2e/task-list-dialog.spec.ts` ("counts while the dialog is open", at lines 952 and 974). They assert the pomodoro count in `span.font-mono`, which the owner's `CurrentTaskCard.tsx` edit removed. Left failing on purpose, pending the owner's answer: not skipped, not edited, not deleted. Criteria 4, 15, 25 and 42 now pass. Criterion 5 stays N/V. No other criterion moved.
- Tally: 50 PASS, 3 FAIL (48, 49, 50), 1 N/V (5). The first report was 46 PASS, 7 FAIL, 1 N/V.

### Gate results (fix loop 1, current working tree)
- `npx vitest run`: 11 files, **271/271 pass**. Before my edit one test failed (the `TimerDisplay.tsx` palette pin, see Test changes).
- `npm run typecheck`: exit 0.
- `npm run lint`: **0 errors**, 21 warnings (same count as before, none in files added by this task).
- `npm run build`: exit 0. Run on a copy in the scratchpad (`build-copy`), so the owner's `.next` was not touched. The copy needed `node_modules` as a real APFS clone (`cp -cR`); a symlink made Turbopack fail with "Symlink [project]/node_modules is invalid".
- `npx playwright test`: 258 total, **256 pass, 2 fail**, 1.2 min. First report: 245 total, 228 pass, 17 fail. The 17 went to 2: 4 axe tests in `timer-gauge.spec.ts`, 10 in `accessibility.spec.ts`, and 1 retired non-animated test. The 2 that remain are the blocked dialog tests. Total moved by +13: 12 new legend tests and 2 paired progress tests, minus the retired test.

### Per-criterion deltas against the first QA Report
Flipped FAIL to PASS:
- **4, DECISIONS entry (line 70).** PASS. `docs/DECISIONS.md` line 7 holds the 2026-10-19 entry. It records MIT plus Commons Clause, cites `LICENSE.md` in `DavidHDev/react-bits`, says use is permitted (including commercially) and reselling is forbidden, names both vendored files and their location, says no dependency was added, and gives the rejected `ModeSelector` option with a one-line reason (line 10).
- **15, no raw palette (line 85).** PASS. `TimerDisplay.tsx` has no raw palette utility left. The guard pins it to an empty list, so any reintroduction fails.
- **25, axe on `/` in each status (line 97).** PASS. The four `Axe on` tests in `timer-gauge.spec.ts` and the 10 `accessibility.spec.ts` tests all pass.
- **42, reduced motion and hold progress (line 118, amended wording).** PASS. Under `reducedMotion: reduce`, Reset still resets, early release and Escape still cancel, and progress is perceivable: it is above 0.2 mid-hold and grows across the hold. The default-motion control passes the same checks.

Still FAIL:
- **48** (task-list dialog, `CurrentTaskCard`, stats untouched): unchanged. Two dialog count assertions fail. `CurrentTaskCard.tsx` also still differs from HEAD (the owner's edits plus fix-loop 1 token swaps), and the criterion says untouched.
- **49** (existing suites pass): 12 failures went to 2, both dialog tests.
- **50** (`test:e2e` green): 17 failures went to 2.

Unchanged: all other criteria. The full suite covers them and only the 2 blocked tests fail.

### Re-measured contrast (Chromium, computed styles, from the `contrast of the mm:ss readout` test run)
- mm:ss colour `rgb(43, 32, 23)` (`#2b2017`), 96 px at 1280 px and 60 px at 320 px. Both are at least 24 px, so the large-text AA threshold (3:1) applies.
- Liquid `rgb(246, 196, 83)` (`#f6c453`): **9.79:1** (first report: 10.78).
- Glass `rgb(255, 250, 243)` (`#fffaf3`): **15.30:1** (first report: 16.84).
- Same at full (100), half (50) and empty (0), at both viewports. Waterline is a hard edge, so the worst case is 9.79:1. Still at least 4.5:1, so no text shadow.
- Non-text, liquid against glass: 1.56:1 (unchanged, recorded only).
- No test hard-coded 10.78, 16.84 or `#1c1917`. The contrast test computes its ratios from computed colours, so nothing needed updating there.

### Mode selector legend (regression check for the restored `sr-only` legend)
- Accessible name: `getByRole("group", { name: "Timer mode", exact: true })` finds exactly one element. It is a FIELDSET whose first child is a LEGEND reading "Timer mode". PASS at 320 px and 1280 px.
- Visible text: no test referenced "Timer mode" before this pass. A grep of `e2e/`, `components/`, `hooks/`, `lib/` and `app/` finds it only in `ModeSelector.tsx`. Nothing relied on the visible text or its absence.
- sr-only geometry: legend is not `display: none`, is `position: absolute`, `overflow: hidden`, and at most 1 px in each dimension. PASS.
- No layout shift: the group's top edge equals the first mode button's top within 1 px, and the buttons stay centred in the group within 2 px (subpixel tolerance). No horizontal page scroll at 320 px or 1280 px. PASS.
- Limitation: the legend tests were not proven to fail without the legend. That needs an app edit, which is outside QA's scope.

### Test changes made in this pass (test files only, no application code)
1. `components/TimerGauge.tokens.test.ts`: the `./TimerDisplay.tsx` pin changed from `["stone-900"]` to `[]`, with a comment explaining the change. The utility was removed in fix loop 1.
2. `e2e/hold-reset.spec.ts`:
   a. Removed the test "reduced motion: the in-progress cue is non-animated" (it asserted `transition-duration: 0s` on `.hb-fill`). Criterion 42 no longer requires that.
   b. Added helper `perceivedHoldProgress`. Under default motion it reads the revealed clip-path width. Under reduced motion it reads fill opacity. It throws on an unreadable value, so a parse failure cannot pass silently.
   c. The paired "the hold is visibly in progress mid-hold" test now uses that helper. The first-pass metric was `max(fillOpacity, --hb-p)`. Under default motion `.hb-fill` opacity is always 1, so that metric was always above 0.2 and passed without measuring anything. That was a flaw in my first pass, now corrected.
   d. Added paired test "the hold progress keeps growing across the hold": early > 0, and later (about 600 ms) > early (about 200 ms), under both motion settings.
   e. Added `type Locator` to the Playwright import.
3. `e2e/mode-selector-legend.spec.ts` (new): 6 tests at each of 320 px and 1280 px, 12 in total.

Not touched: `e2e/task-list-dialog.spec.ts`, `e2e/timer.spec.ts`, `e2e/sessions.spec.ts`, `e2e/accessibility.spec.ts`, and all assertions in them.

### Still failing, full output (`npx playwright test`, final lines)
```
  2 failed
    [chromium] › e2e/task-list-dialog.spec.ts:974:7 › Task list dialog: counts while the dialog is open › incrementing the pinned task inside the open dialog updates the inline card while the dialog stays open
    [chromium] › e2e/task-list-dialog.spec.ts:952:7 › Task list dialog: counts while the dialog is open › a focus run that completes while the dialog is open updates the open row and the card, and logs exactly one session
  256 passed (1.2m)
```
Assertion detail:
- Line 974 test: `Locator: getByRole('main').locator('span.font-mono').filter({ hasText: '/' })`, `Expected: "0 / 1"`, `Error: element(s) not found`.
- Line 952 test: same locator, `Expected: "1 / 1"`, `Error: element(s) not found`.
Repro: `npx playwright test e2e/task-list-dialog.spec.ts -g "counts while the dialog is open"`. Expected: the count span is present with the value. Actual: the span is absent, because of the owner's `CurrentTaskCard.tsx` edit. Blocked on the owner's answer.

### Not verified
- Criterion 5 (upstream licence headers): N/V, unchanged.
- Criterion 26's "single focal point" clause: judgement, N/V, unchanged.
- The legend's sr-only fix was not shown to fail when the legend is removed (see Limitation above).

## Review Findings
- Reviewed: 2026-10-19, against the working tree (`git status` as of this date), the amended criterion 42, both QA Reports, and fix loop 1.
- Gates re-run independently by the reviewer: `npx tsc --noEmit` exit 0; `npx vitest run` 271/271; `npm run lint` 0 errors / 21 pre-existing warnings, none in task-005 files. Playwright not re-run (orchestrator's run: 258 total, 256 pass, 2 fail, both owner-blocked).
- Verdict: **CHANGES REQUESTED** — one blocking item (R-1). Everything else is approved. The two outstanding `e2e/task-list-dialog.spec.ts` failures (952, 974) are owner-blocked and must not hold this task.

### Blocking
- **R-1. `components/HoldButton.tsx:93-100` — under `prefers-reduced-motion: reduce` the "Reset" label becomes unreadable for ~300 ms of the 800 ms hold.** The reduced-motion block fades `.hb-fill` from opacity 0 to 1 over the full hold, and `.hb-fill` carries its own copy of the label in `--primary-foreground` (white) composited over the base `--secondary-foreground` label. Computed against the shipped tokens (`--primary #b45309` over `--popover #fffaf3`): 6.42:1 at 10% of the hold, 3.37:1 at 25%, **1.81:1 at 40%, 1.22:1 at 50%, 1.21:1 at 60%**, 2.11:1 at 75%, 5.02:1 at 100%. Default motion has no dip (the clip-path sweep is a hard edge: every pixel is 5.02:1 or ~10:1). This was never measured — QA's reduced-motion checks sampled fill opacity, not label contrast — so criterion 42's amendment blessed a cue whose side effect nobody checked. The amendment itself is sound; this is a verification gap, on a destructive control, for the cohort the setting exists to protect. **Do:** inside the existing reduced-motion block, hide the fill layer's duplicate label (it is `aria-hidden` already), e.g. `@media(prefers-reduced-motion:reduce){.hb-fill .hb-label{display:none}}`. The base label over the 50%-faded tint measures 4.77:1, so progress stays perceivable and the label stays legible. Verify visually with devtools reduced-motion emulation (the ratios above are computed, not sampled), and add a paired mid-hold label-contrast assertion to `e2e/hold-reset.spec.ts` under both motion settings.

### Strongly recommended, not blocking
- **R-2. `app/globals.css:44-47` — `--gauge-liquid: #f6c453` is the wrong value, and it is the root of both the 1.56:1 non-text question and the fifth-colour question.** It was picked against a 4.5:1 bar for the `mm:ss`, but criterion 96 and WCAG both apply the 3:1 large-text threshold at the measured 60-96 px. Using that headroom, `#d97706` (amber-600, same hue family as the existing accent) measures **3.07:1 liquid-vs-glass** — clearing 1.4.11 on its own — while still giving the readout **4.99:1** over the liquid. It is strictly better on both axes, not a trade. (`--primary #b45309` gives 4.84:1 non-text but only 3.16:1 for the readout: passes large-text AA, tighter than worth shipping.) **Do:** re-point the token to `#d97706`, or `color-mix(in srgb, var(--primary) 85%, var(--popover))` to anchor it to the accent; keep the existing reason comment and add "milestone 4 must give this a dark value" to it, since that obligation currently lives only in this task file.
- **R-3. `components/SloshGauge.tsx:110` — `useRef<Live>({} as Live)` is an unsound cast with a live failure mode.** `paint()` reads `live.current.tilt` (117). Today the sync effect at 111-113 is declared before anything that calls `paint`, so it wins — but the type lies. Reorder the hooks, or call `paint` from an effect declared earlier, and `tilt` is `undefined`, `lean` is `NaN`, the `clipPath` string is invalid, and the liquid renders unclipped (full) rather than throwing. **Do:** initialise the ref with the first-render values instead of casting.

### Notes (no action required)
- **R-4. `components/TimerDisplay.tsx:5-13` — `modeLabel` and `status` are dead props**, still declared and still passed by `PomotatoTimer.tsx:67-69` but destructured by neither. Two-line cleanup. Related, for the record: `/` no longer renders the mode or status labels that HEAD rendered. No information is lost inaccessibly (mode is in the checked radio, status in the Start/Pause/Resume label), but the removal shipped on this diff under a "dead-code cleanup" heading rather than as a stated UI decision.
- **R-5. `hooks/use-resolved-tokens.ts:34-37` calls `getComputedStyle(document.documentElement)` on every `getSnapshot`** — React calls it during render and on the post-render consistency check, so ~8 forced style reads per second while a timer runs. Small, and the joined-string snapshot is the right design (keeps `useSyncExternalStore` value-comparable, avoids the new-object-identity loop). Cache the last string and invalidate from `subscribe` if it ever matters.
- **R-6. Smaller things, checked and accepted:** both vendored files use `export default` against CLAUDE.md's named-export rule (upstream parity; the wrappers export named); they landed flat in `components/` rather than `components/ui/` (the DECISIONS entry names the location); `HoldButton.tsx:337` interpolates its glow classes so Tailwind can never generate them (harmless with `glow={false}`, but the prop is dead rather than off); `<style>` inside `<button>` (354) is non-conforming HTML that browsers and axe accept; `data-phase="done"` makes Reset visible-but-inert for the 600 ms `resetAfter` window; the tap hint never auto-dismisses and a repeat tap in the same status will not re-announce (both are consequences of "no new timers", and the right trade).
- **R-7. Owner-scope, not reviewed:** `app/globals.css:81-82` now points both `--font-sans` and `--font-mono` at Comfortaa, so every pre-existing `font-mono` surface renders proportional. `tabular-nums` holds the timer's digits; the other `font-mono` sites do not all carry it. `font-space-grotesk font-extrabold` on the `mm:ss` diverges from DESIGN.md's "Comfortaa for headers, plain sans for body" — confirmed by the owner as deliberate and recorded here only.

### Checked and clean
- **Acceptance criteria:** QA's final tally (50 PASS, 3 FAIL, 1 N/V) matches what the reviewer can verify. The 3 FAILs (48, 49, 50) all reduce to the two `task-list-dialog.spec.ts` count assertions blocked on the owner's `CurrentTaskCard.tsx` edit. Criterion 5 stays N/V, with nothing suspicious: the generated sources carry no upstream copyright block, and the Pomotato headers plus the DECISIONS entry exceed the intent.
- **Derived time:** `gaugeLevel` (`TimerGauge.tsx:19-22`) is total for every status because `getRemainingMs` already clamps. idle → 100, complete → 0, paused freezes and resumes continuous, `selectMode` forces idle so a mode switch re-bases against the new `fullMs`, `setCustomMinutes` is refused mid-session so no stale denominator exists, and expired-while-closed cannot animate because `SloshGauge` mounts only once `ready`.
- **No new clock:** `hooks/use-timer-clock.ts` remains the only one; `lib/**`, both timer hooks, `lib/db/**` and `lib/stats/**` are untouched in the diff.
- **Idle parking is genuine:** `SloshGauge.tsx:163-169` stops requesting frames once the spring reaches `x === L, v === 0`, reached via the rest snap at 157-160; the StrictMode fix at 205 is a real upstream bug (a cancelled id read as pending by `wake()` at 171-172). While running, the per-tick delta sits inside `REST_POS`, so the gauge costs ~4 frames/sec and parks between ticks.
- **Accessibility:** native `<button>` in visual order, Space/Enter held with `e.repeat` guarded and keydown `preventDefault()` suppressing the native activation (no double fire), Escape cancels a key hold, 2px/2px amber-700 focus ring matching the Start button. Gauge is `aria-hidden`, `pointer-events-none`, untabbable, with no second number and no second announcement. The completion live region and `prevStatusRef` in `PomotatoTimer.tsx` are byte-identical; the tap hint is a separate `role="status"`.
- **Licensing and branding:** both headers present and accurate across all nine claimed edits; the 2026-10-19 DECISIONS entry has landed; `package.json` and the lockfile unchanged; no fonts, audio, images or binaries added by this task; no third-party branding or copy (the only upstream strings left are defaults that are always overridden).
- **Non-text contrast of the gauge:** "supplementary, not informational" is a sound reading of 1.4.11 — the fill duplicates the `mm:ss` in the same place at 9.79:1 worst case. Do not cite the vessel border as a mitigation: `--border` on cream measures 1.36:1 and is effectively invisible. The live concern is the task's own purpose gate in Risks, which R-2 resolves outright.

## QA Report — fix loop 2 re-verification

The first and fix-loop-1 QA Reports above are kept unchanged. This section supersedes their verdicts and FAIL rows for criteria 42, 48, 49 and 50.

- Verdict: **PASS**
- Why: 53 of 54 criteria pass and 1 is not verifiable from the repo (criterion 5, unchanged). The two owner-parked tests in `e2e/task-list-dialog.spec.ts` are skipped with a reason, not failed. Criteria 48, 49 and 50 are re-evaluated on that basis. The R-1 reduced-motion label defect is verified in a real browser under both motion settings.
- Tally: **53 PASS, 0 FAIL, 1 N/V** (fix loop 1: 50 PASS, 3 FAIL, 1 N/V). Deltas: 48, 49 and 50 FAIL to PASS. 42 stays PASS, now with pixel-level evidence. No other criterion moved.
- Caveat on 48: the criterion reads "untouched in behaviour and appearance". The dialog, card and stats behaviour tests all pass. The remaining appearance differences are the owner's parked count and colour-dot removal in `CurrentTaskCard.tsx`, plus the fix-loop-1 text-token swaps in that file. Those swaps were made for criterion 25 (axe). If the owner reads 48 literally, it still does not hold, and that is the owner's call.

### Gate results (fix loop 2 re-run, current working tree)
- `npx vitest run`: 11 files, **271/271 pass** (unchanged from fix loop 1).
- `npm run typecheck`: exit 0 (re-run after the last QA edit).
- `npm run lint`: **0 errors, 21 warnings**, all pre-existing (baseline 21). The first pass of the new spec added one unused-constant warning, which I removed, so the count is back to 21. Frontend's own run reported the same.
- `npm run build`: exit 0, run on an identical copy (`build-copy` in the scratchpad, APFS clone of `node_modules`).
- `npx playwright test`: **265 total, 263 pass, 0 fail, 2 skipped**, exit 0. Fix loop 1 was 258 total, 256 pass, 2 fail. The +7 are the new `e2e/hold-label-contrast.spec.ts` tests.

### Skipped tests (owner decision)
- `e2e/task-list-dialog.spec.ts`, line 952 ("a focus run that completes while the dialog is open...") and line 974 ("incrementing the pinned task inside the open dialog..."). Each has one new line as the first statement of the test body: `test.skip(true, "blocked on owner decision: CurrentTaskCard count parked, see task 005 QA");`
- No assertion was changed or deleted. `git diff -- e2e/task-list-dialog.spec.ts` shows exactly two inserted lines. The assertions must come back unchanged when the count returns, and the skip line should then be removed.

### R-1 in a real browser: label contrast from painted pixels
- Method: `e2e/hold-label-contrast.spec.ts`. A Playwright fake clock holds Reset and pauses at each sample time (0, 100, 200, 300, 400, 450, 500, 550, 600, 650, 700, 750, 790 ms). At each point it takes two element screenshots, one with the label visible and one with the label text hidden by a test-only style. For each pixel that is part of the label, the background is read from the text-hidden image. Label pixels are those within 12/255 of the label's computed colour (full-strength pixels). Contrast is taken from those two painted colours.
- Measured on the shipped code, Chromium 153 (Playwright 1.63), reduced motion. Lowest ratio per layer, per sample:
  - 0–200 ms: label is outside the sweep. Dark label on painted glass **7.18:1** (n=77).
  - 300–400 ms: white label on fill **4.72:1** (n=40). Dark on glass **7.18:1**.
  - 450–790 ms: white label on fill **4.72:1** (n=70). The label is fully inside the sweep, so there are no dark pixels.
- Measured on the shipped code, default motion (paired control):
  - 0–200 ms: dark on glass **7.18:1**.
  - 300–450 ms: white on fill **4.72–4.80:1**. Dark on glass **7.18:1**.
  - 500–550 ms: white on fill **4.72:1**. Dark on glass **7.61–8.66:1**.
  - 600–790 ms: white on fill **4.72:1** (n=50). The label is fully inside the sweep.
- Every sample is at or above 4.5:1 under both settings. Nothing falls in the old 55%–90% band. The reduced-motion band is clear.
- With a tighter core tolerance (2/255) the figures move up slightly: white on fill **4.95–4.99**, dark on glass **8.40–8.66**.
- The reviewer's and frontend's figures (5.02 and 9.89) were computed from token values. Pixels show the painted glass behind the label during a press is about `rgb(240,235,228)`, not `#fffaf3`, so the dark-on-glass figure is 7.18 in practice. The result is still a pass, but the token-arithmetic figure should not be quoted as the measured one.
- Label opacity: the base and fill label spans are opacity 1 at every sampled point under both settings. The `.hb-label>span{transition:opacity 200ms ease!important}` rule in `components/HoldButton.tsx:102` therefore never produces a partial-opacity label mid-hold. Its only effect is the done-phase swap, which begins after 800 ms.
- Negative control (in the spec): restoring the old opacity fade in the page makes the same check fail. Under reduced motion there are no full-strength label pixels from about 450 ms to 750 ms, and the test asserts that this is caught. Note that the detector flags this band by absence of full-strength label pixels, not by a numeric ratio dip.

### Stepped clip: did it step, or fall back?
- **It stepped.** Chromium 153 reports `CSS.supports("width","round(up, 1.5px, 1px)") === true`, so the fallback path was not exercised. Under reduced motion the computed `clip-path` took exactly four non-zero states over the hold: revealed 25%, 50%, 75%, 100% (`inset(0px 75% 0px 0px)` to `inset(0px 0% 0px 0px)`). Steps fell at about 200, 400 and 600 ms, consistent with the `up` rounding. `transition` on `.hb-fill` was `none`.
- Default motion, paired: about 50 distinct clip positions over one hold in a real-timer probe (continuous, no transition). The spec asserts more than 8.
- The spec asserts `CSS.supports` first, so the stepped test cannot pass against a browser without `round()`.
- **New finding, not a criterion failure in this environment.** The fix-loop-2 note says a browser without `round()` "falls back to the default continuous reveal". That is not what happens. I simulated an unparseable `--hb-q` in the page (`.hb-root{--hb-q:not-a-function(1)!important}`). The reduced-motion `clip-path` then computed to `none`, so the whole fill shows at once on press. This is still contrast-safe (white on primary, about 4.7 to 5.0:1), but it loses the progress cue in those browsers. Frontend should either correct the note or add a fallback clip. This is a judgement for the owner and frontend, and I have not written a test for it.

### SloshGauge (`components/SloshGauge.tsx:112`) and StrictMode
- The `{} as Live` cast is gone. The ref is now initialised with real values (`viscosity`, `tilt`, `splash`, `value`, `onChange`), and the layout effect keeps it current. No behavioural change is visible.
- Existing tests still cover the requirements: the zero-rAF-after-settle check for idle, paused and complete (criterion 13), the level checks (criteria 6, 9 and 41), and the pause and resume checks (criterion 10). All pass in the full run.
- The StrictMode fix (`s.raf = 0` and `s.last = 0` in the mount-effect cleanup) is still present. I did not re-run break D this pass, since that would mean editing application code. Break D from an earlier pass showed this line matters. This pass did not re-prove it.

### Removed props (`modeLabel`, `status`, `TimerStatus` import)
- Grep across `app`, `components`, `hooks`, `lib` and `e2e`: no test references the `modeLabel` or `status` props on `TimerDisplay`.
- No test depends on the removed visible mode or status text. `STATUS_LABELS` ("Ready", "Running", "Paused", "Complete") is now unreferenced, which is harmless. The mode-name strings ("Focus", "Short break") appear in tests only as radio names or accessibility-announcement text, not as the removed readout labels.

### Changes made in this pass (test files only, no application code)
1. `e2e/task-list-dialog.spec.ts`: two `test.skip(true, reason)` lines, described above.
2. `e2e/hold-label-contrast.spec.ts` (new, 7 tests): pixel-level label contrast at 13 sample points, under both motion settings (paired). Also checks that label opacity stays 1, that the edge steps 25/50/75/100% under reduced motion and slides under default motion (paired), and a negative control with the old fade restored.
3. `e2e/hold-reset.spec.ts`: the helper `perceivedHoldProgress` read fill opacity under reduced motion. Opacity is now always 1 there, so the "keeps growing" test failed after fix loop 2. The helper now reads the clip under both settings, which is the progress carrier in both. Without this change the test would have passed against the wrong quantity (the same kind of error as R-1), or failed for the wrong reason. No assertion was loosened.

### Not verified
- Criterion 5 (upstream licence headers): N/V, unchanged.
- Break-and-restore (criterion 53): the earlier breaks A to D stand. No new break was run this pass, to avoid editing application code.
- R-2 (`--gauge-liquid`): not applied, per the owner's instruction. No test hard-codes either colour. The contrast checks compute from computed styles.
- Fallback behaviour in browsers without `round()`: simulated only, not run in an old browser.

### Fix loop 3 (frontend)
- **Correction to the fix-loop-2 fallback claim.** Fix loop 2 stated that a browser without CSS `round()` would drop the `--hb-q` declaration and fall back to the continuous reveal. That was wrong. QA found it by substituting an invalid `--hb-q` in the page. A custom property is not dropped at parse time; an unsupported `round()` becomes the guaranteed-invalid value when `var(--hb-q)` is substituted, which makes the whole `clip-path` declaration compute to its initial value, `none`. The entire fill appeared the moment the press started and the progress cue on the destructive Reset control was lost (still contrast-safe, since the label sits on solid `--primary`).
- **Fix.** The three `round()`-dependent rules (the `--hb-q` definition and the two stepped `clip-path` rules, right and up) now sit inside `@supports (width:round(up,1px,1px))`, nested inside the existing `@media (prefers-reduced-motion:reduce)` block. Everything that does not need `round()` (`transform:none`, `.hb-crest` hidden, `.hb-pulse` animation off, the label rule) stays directly in the media block. Unsupported browsers now keep the default-motion continuous hard-edge reveal. The `!important` flags are unchanged and `@supports` adds no specificity, so the stepped rules still beat the default `.hb-fill` clip.
- **Verified in Chromium 153 with a scratch Playwright script (reduced motion, 2.3 s hold on Reset).** Supported: clip took exactly the steps 75, 50, 25, 0% inset (revealed 25/50/75/100%), `transition` 0s. Unsupported, forced by rewriting the style's `@supports` test to an invalid function so the real gate evaluates false: 23 distinct continuous values from 100% down to 0%, never `none`. Not run in a real browser lacking `round()`.
