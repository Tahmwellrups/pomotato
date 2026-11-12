---
id: 005
slug: timer-gauge-hold-reset
status: done # draft | in-progress | qa | review | done | blocked
---

# Liquid gauge behind the timer, hold-to-confirm Reset

> **History for this task** — implementation notes, QA reports, review findings and
> orchestrator rulings live in [logs/005-timer-gauge-hold-reset-log.md](logs/005-timer-gauge-hold-reset-log.md). Read it only when a
> criterion below is disputed; it is not an input to implementing them.

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
