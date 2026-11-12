---
id: 020
slug: contrast-ground-over-backgrounds
status: draft # draft | in-progress | qa | review | done | blocked
---

# A ground under the timer and main controls, shaped to its content

> **History for this task** — implementation notes, QA reports, review findings and
> orchestrator rulings live in [logs/020-contrast-ground-over-backgrounds-log.md](logs/020-contrast-ground-over-backgrounds-log.md). Read it only when a
> criterion below is disputed; it is not an input to implementing them.
>
> **Written by the orchestrator, not `pm`.** Task 019 already measured the problem, built a working fix,
> and had it reverted on its look alone, so the brief below is a record of findings in hand rather than a
> fresh scoping pass. If a criterion reads thin, that is the place to send `pm`.

## Goal
Text and controls on the timer page keep legal contrast over a bright or busy uploaded background, without
the page gaining four rectangular panels. Task 019 proved the ratio problem is real and proved a scrim fixes
it; the owner rejected that scrim's **geometry**, not its purpose. This task is the geometry.

## Scope

**In:** a localized ground behind the mode chip row (including the cycle dots), the Start/Reset row and the
bottom-button cluster, shaped to its content and feathered at its edges rather than cut off at a hard rounded
rectangle; the tokens it needs; re-measuring every figure in the table below.

**Out, and this is the headline change: the timer digits.** Corrected measurement shows they sit on the
opaque gauge capsule and read 4.681:1 on every ground, image or not. They never had a contrast problem. The
019 attempt put a rounded rectangle behind the capsule — the frame-inside-a-frame the owner objected to most
— to fix a failure that did not exist. **Do not give the digits a ground.**

**Out (do not touch):** `components/BackgroundLayer.tsx`'s `opacity-50`, re-pointed 2026-11-12 and ruled
untouchable twice since. Darkening the whole image is not the lever. Also out: adding a theme, per-background
tinting, any timer/task/stats/settings behaviour, and the mascot.

**Data shape: no `backend`.** No stored preference, no schema change. The ground is always on and reads no
state.

## Closed questions (verified in 019, do not re-derive)

- **The failure is real and pre-existing.** It predates 019, which moved the dark palette into `:root`
  without changing a value and never touched the overlay. A white image at `opacity-50` over `#1c140e`
  composites to `#8e8a87`; the sampler read exactly that, so the figures are arithmetic, not an artefact.
- **The adversarial set is two-sided, not one image.** The first pass concluded a busy checker measured
  identically to white everywhere; the corrected pass disproved it. **Light text is worst over a bright
  ground; a dark boundary is worst over a dark ground.** The Tasks edge's outermost painted boundary is the
  `--popover` ring `#1e1610`, which reads 5.211 against white (passes) and **1.105 against the busy
  checker's black cells `#0e0a07`** (fails). So the sweep needs white *and* a dark-celled busy image, plus
  the no-image case. Three grounds, still not a gallery.
- **The alpha is near its floor.** `rgb(0 0 0 / 0.36)` cleared everything; `0.28` measured 4.08 on the
  unchecked chip and 2.87 on the edges, which fails. Do not start below 0.36 without a measurement.
- **`--surface-glass` is not the vehicle.** At 0.9 alpha it hides the photograph, and its blur would break
  the single-blur ruling. It and `--surface-blur` are held unused for this task; if this task does not use
  them, delete them here.
- **A `::before` is the right mechanism.** It adds no box, padding or margin, so layout does not shift and
  the absolutely positioned "Press to start" caption does not move. The host needs `position: relative`.
- **Always on, never conditional on a background being present.** Gating on `state.background` would
  re-couple the timer to background state that 019 deliberately decoupled. A dark ground is near-invisible
  against `#1c140e` anyway.

## The measurement to beat

Painted-pixel samples, 1280x800, dark (the only palette), taken 2026-11-12 with the **corrected** methods:
text is sampled from the pixels the glyphs sit on (text-run rectangles, hidden text excluded); a UI boundary
is sampled as the outermost painted column against the column immediately outside it. The superseded
element-box figures, and which of them were artifacts, are in the 019 log's QA Report third block.

| Surface | No image | White | Busy checker | Floor | Verdict |
|---|---|---|---|---|---|
| Timer digits `#f5ebdc` | 4.681 | 4.681 | 4.681 | 4.5 | **passes everywhere, out of scope** |
| Checked mode chip `#fbd592` | 11.477 | 2.354 | 2.354 | 4.5 | fails on both images |
| Unchecked mode chip `#e2d5c2` | 11.182 | 2.279 | 2.279 | 4.5 | fails on both images |
| Start/Pause edge | 8.318 | 1.663 | 1.663 | 3.0 | fails on both images |
| Tasks edge (outer `--popover` ring) | 8.234 | 5.211 | **1.105** | 3.0 | fails on the dark ground only |
| Focus ring `#f0a550` | 8.406 | 1.663 | 1.663 | 3.0 | fails on both images |

Four surfaces need a ground: the two mode chips, the Start/Pause edge and the focus ring. The Tasks edge
needs one only against a dark ground, and for the opposite reason to the others, so a ground that darkens
will make it worse, not better. That asymmetry is this task's real design problem and the 019 attempt never
saw it.

Full painted column profiles for both edges are in `test-results/task-019-measure-corrected-*.json`, so every
figure above can be checked against its pixels rather than retaken.

## Why the last attempt was rejected

All four grounds were hard-edged rounded rectangles inset uniformly by `0.5rem`. That shape read as *panels*,
which is the look the frosted-panel retirement was taken to remove. Three faults to fix by name:

1. **The digits ground framed the gauge.** A rounded rectangle behind an already-rounded capsule put a frame
   inside a frame; it read as a layout bug. A ground shaped like the capsule, slightly larger, would not.
2. **The chip-row ground orphaned the cycle dots.** Its bottom edge landed just above them. The dots belong
   inside that host.
3. **Only Start/Reset and the bottom cluster read correctly** — because those two hug their buttons closely.
   They are the reference for how close a ground should sit.

Before/after screenshots from that attempt are in the 019 log's QA Report section.

## Acceptance Criteria

Tags: `[unit]` vitest, `[e2e]` Playwright, `[static]` source/grep check, `[manual]` recorded by hand in the
QA Report. Criteria 1 to 7 are the measurement group and may be re-run alone.

### A. The ratios (re-measure, do not re-derive the method)
- [ ] 1. Every surface in the table above meets its floor against the worst pixel behind it on the white ground, measured from a painted-pixel sample with both hexes and coordinates recorded. Reuse `e2e/helpers/task-019-sampler.ts`; do not rebuild a sampler. `[e2e]` `[manual]`
- [ ] 2. The busy checker is sampled once to confirm it still measures identically to white, then dropped from the sweep. `[e2e]`
- [ ] 3. No plain-page figure falls below its 019 value listed above. A figure that rises passes; one that falls fails. `[e2e]`
- [ ] 4. The focus ring clears 3.0 against the pixel immediately outside it on both grounds, on every control it reaches. `[e2e]`
- [ ] 5. `components/BackgroundLayer.tsx` still reads `opacity-50`, byte-for-byte. `[static]`
- [ ] 6. The implementer records its own figures before handing to `qa`; `qa`'s run confirms them rather than discovering them. A hand-back without figures is incomplete. `[manual]`
- [ ] 7. Every colour the ground paints comes from a named CSS variable. `[static]`

### B. The geometry (what 019 failed)
- [ ] 8. The timer digits get **no** ground. Confirm by inspection that nothing paints behind the gauge capsule, and that the digits still measure 4.681:1 on all three grounds. `[static]` `[e2e]`
- [ ] 9. The four cycle dots sit inside the same ground as the mode chip row, not below its edge. `[e2e]` `[manual]`
- [ ] 10. Each ground's edge fades rather than terminating at a hard boundary, so it reads as shading and not as a panel. Name the technique and its reason in the log. `[static]` `[manual]`
- [ ] 11. No ground changes a pixel outside its own surface's area plus its feather. A feather is part of the surface's ground, not a violation of localization. `[e2e]`
- [ ] 12. Layout does not shift: no host gains a box, padding or margin, and the "Press to start" caption sits where it sat before. `[e2e]`
- [ ] 13. A before/after screenshot pair at 1280x800 goes to the owner for sign-off **before** the task is marked done. The owner rejected the last attempt at exactly this gate. `[manual]`

### C. Robustness
- [ ] 14. Under `forced-colors: active` the ground is dropped and the timer and controls stay visible and operable. `[e2e]` `[manual]`
- [ ] 15. Under `prefers-reduced-motion: reduce` nothing the ground adds animates or transitions. `[e2e]`
- [ ] 16. An axe scan on `/` reports zero serious or critical violations. `[e2e]`
- [ ] 17. `npm run lint`, `npm run typecheck` and `npm run build` pass with no new warning. `[static]`
- [ ] 18. If this task does not use `--surface-glass` and `--surface-blur`, both are deleted along with the dead `.surface-frosted` utility, and the QA Report says so. 019 held them only for this task. `[static]`

### D. Nothing else moved
- [ ] 19. Timer, task, stats and settings behaviour is unchanged, including the background upload and remove flow. `[e2e]`
- [ ] 20. `e2e/task-019-measure.spec.ts` and `e2e/helpers/task-019-sampler.ts` are either renamed into this task's coverage or kept working; neither is left asserting a ground that 019 reverted. `qa` owns the decision and states it. `[static]`

## Files likely touched
`app/globals.css` (the ground's tokens and utility), `components/TimerDisplay.tsx`,
`components/ModeSelector.tsx`, `components/TimerControls.tsx`, `widgets/BottomControls.tsx`. Tests:
`e2e/task-019-measure.spec.ts`, `e2e/helpers/task-019-sampler.ts`, plus whatever this task adds.

## Carried from task 019's review (non-blocking there, in scope here)

- **F1 — `components/TaskPanelToggle.tsx:37-42`'s active bar has no `forced-colors:` fallback.** It draws
  `bg-primary-foreground` inside a `bg-primary` button; under `forced-colors: active` both are system
  repainted and the bar likely vanishes. `components/SettingsPanel.tsx` solves the same problem with a 3px
  border fallback. `aria-expanded` still carries the state, so this is a sighted-user gap only.
- **F4 — `.glyph-halo` (`app/globals.css:360-371`) has no reader.** Its `input:focus-visible + .glyph-halo`
  selector could only ever match the deleted `ThemeControl` radios, and `HeaderNav.tsx`'s `h1` does not carry
  the class. Either give the wordmark a consumer or delete the rule; do not leave it documented as serving
  something it does not.
- **F5 — two collapsed values carry no measurement.** `components/ui/checkbox.tsx:16`'s
  `aria-invalid:border-destructive/50` and `ring-destructive/40` preserve what rendered under `.dark` but
  have no figure, while `components/ui/button.tsx`'s comment now asks for colours to be stated "unprefixed,
  with a measurement". `--muted-foreground`'s comment claims "all >= 4.5:1" with no figures. Measure or
  qualify.

## Risks
- **A second rejection at the sign-off gate.** The last attempt was measured, correct and still rejected.
  Show the owner the geometry early, before the measurement is re-run, not after.
- **Thin margins.** The edges and ring cleared 3.0 by only 0.43 at alpha 0.36. A feathered edge is lighter
  than a hard one at its boundary, so the feather can eat that margin exactly where the sample is taken.
  Measure the feathered edge, not the centre.
- **The Tasks edge pulls the opposite way.** Every other surface needs its ground *darker*; the Tasks edge's
  outer `--popover` ring fails against dark cells and needs its surround *lighter*. A single darkening scrim
  cannot fix both. Solve the ring by changing the ring, not by grounding harder.
- **Scope creep into the overlay.** `opacity-50` will look like the easy fix. It is ruled out twice.
- **Re-measuring with the old method.** Any figure taken from an element bounding box is suspect. Use the
  corrected methods in `e2e/task-019-measure.spec.ts`, and never compare a new figure to a superseded one.
