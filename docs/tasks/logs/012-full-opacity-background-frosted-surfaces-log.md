# Full-opacity background, one frosted surface — the photo shows, the text sits on a known ground — history log

Appended by frontend/backend/qa/reviewer/orchestrator after implementation began.
The task's goal, scope and acceptance criteria are in [../012-full-opacity-background-frosted-surfaces.md](../012-full-opacity-background-frosted-surfaces.md).

## Implementation Notes
(Filled in by frontend as it builds. Decisions, tradeoffs, anything the next agent needs to know.
Criterion 1 lists what must be here **before QA starts group D**.)

### Frontend, 2026-10-28 (antislop during, session override)
Design Read: single-person focus dashboard for board-exam revision, cream paper-planner language per
DESIGN.md, ENERGY 1 / RHYTHM 1 / MOTION 2. The panels are the planner page on the desk, not chrome.

**Criterion 1 inventory (final before group D):**
- **Tokens added:** one, `--surface-glass`. `:root` `rgb(255 250 243 / 0.9)` (--popover at 90%), `.dark`
  `rgb(30 22 16 / 0.9)` (--popover at 90%). Declared once per block, with role / why-no-existing-token
  comments and computed figures beside it in `app/globals.css`. No existing token value moved;
  `--control-border` hexes are unchanged and `components/token-foundation.test.ts` passes unchanged.
  The solid surface adds **no** token: it is `--popover`.
- **Why 0.90:** it is the lowest alpha at which `--control-border` (the tightest pair) holds 3:1 over the
  worst flat end: light 3.51 over black, dark 3.23 over white. 0.88 leaves dark at 3.01, 0.85 fails dark
  (2.71). The per-channel white-vs-black delta at 0.90 is 25 (light) and 25-26 (dark), so criterion 9's
  8-per-channel bar has room. Every other foreground is further from its floor than the border.
- **Grain ruling (criterion 13): suppressed while an uploaded image shows.** `body:has([data-background="active"])::before { opacity: 0 }`
  inside `@media not (forced-colors: active)`. Reason: 7% / 5% ink over a photograph is dirt on the
  owner's picture, and the grain's R-07 job (make flat cream read as paper) does not exist where the
  ground is a photograph. It still paints on plain ground, on `/settings`, `/stats`, with no background
  stored, and under forced colours. **The grain tolerance for criterion 3 is therefore 0** on an exposed
  ground pixel with the image `active`. Token values `--grain-ink` / `--grain-opacity` are unchanged.
  `body::before` gained `transition: opacity 500ms` (none under reduced motion) so the grain fades with the
  image's own 500 ms arrival instead of popping; that is one arrival split over two elements, not a second
  animation, but qa should read criterion 24 with it in mind. Where `:has()` is unsupported the grain keeps
  painting, which costs texture, not contrast.
- **No-blur fallback (criterion 18):** the fill. The panel's fill is `--surface-glass` at 0.90 whether or
  not `backdrop-filter` exists; the blur is only the look. A browser without it paints the same fill over
  the image, so every foreground stays on a ground bounded by that fill over flat white and flat black.
  No `@supports` boundary exists, so there is no unsupported branch that differs. QA disables the blur
  rather than finding an old browser.
- **`prefers-reduced-transparency: reduce` (criterion 19):** the frosted panel's background becomes opaque
  `--popover` and its blur is `none`, so it becomes the solid surface. The solid surfaces carry no
  transparency and have no such rule. `forced-colors: active`: no rule written. The image layer is
  `forced-colors:hidden`, the UA drops blur and shadow and forces the 1 px border to a system colour, so
  each surface keeps a visible outline and its text; nothing depended on the shadow or blur.
- **How QA observes the surfaces:** `data-surface="frosted" | "solid"`, set by `components/Surface.tsx`.
  Frosted: one element (the timer panel in `app/page.tsx`). Solid: the header row and the bottom cluster.
- **Blur radius and count (criterion 25):** `blur(10px)`, one element. `backdrop-filter` occurs once in
  source, `app/globals.css`, in `.surface-frosted` (the build output adds the `-webkit-` twin itself). I
  kept the literal string out of comments so a source scan counts 1.

**Where each definition lives (criterion 7):** `@utility surface-solid` and `@utility surface-frosted`
in `app/globals.css`, each once. `components/Surface.tsx` is the only applier (`<Surface kind="solid" |
"frosted">`) and maps kind to the utility name once. **Task 014: use `<Surface kind="solid">` for the task
list.** No colour to add, no utility string to copy, and do not reach for `frosted`.

**Criterion 4 mapping (nine rows):**
1 wordmark, 2 theme control: header row, `<Surface kind="solid">` in `widgets/HeaderNav.tsx` (one surface
for the row). 3 task title / placeholder / error + Reload, 4 mode chips, 5 mm:ss, 6 custom-duration input,
7 Start/Pause, 8 Reset: the frosted timer panel in `app/page.tsx`. 9 bottom cluster: one solid surface
inside `widgets/BottomControls.tsx` (the outer fixed div is only the viewport offset). No exemptions. The
input (`bg-popover`), the Reload button (`bg-background`) and Reset (`--popover` hold-button fill) already
carry their own opaque fills, so their 1 px borders have a solid ground on the inside and the frosted one
only outside; the Start/Pause fill is opaque `--primary`.
With the vessel style the readout sits on an opaque `--popover` vessel; with glyph it sits directly on the
frosted fill. Group D (criterion 16) is where glyph is measured.

**What each surface looks like with no image (criterion 21), superseded by the owner ruling below:** nothing.
Fill, border colour, shadow and blur all paint only while an image is active, so the no-image page is
paint-identical to HEAD: open cream, no panel fills, borders or shadows.

**R-12, R-11 reasons:** shadow is one `0 1px 2px` at 8% black on both kinds, reason in the CSS comment (a
hairline at 1.4:1 does not hold an edge against a photograph). It is not on any control. Radius steps up
the existing scale: panel `--radius-2xl`, bars `--radius-xl`, controls inside stay `rounded-lg`. No glow,
no gradient.

**Layout changes:** `app/page.tsx` `pb-28` to `pb-32` (the cluster now carries 16 px of surface padding).
Panel padding `p-4 sm:p-6`. The header row at 320 px is 90 px tall (was 80 px wrapped, plus padding and
border), no horizontal overflow at 320 or 1280, no `button/a/label` under 43.5 px in a quick check of the
built page. `CurrentTaskCard`'s dead `border border-none bg-none rounded-2xl px-6` became `px-2`: it is
not a card any more, the panel is. `components/BackgroundLayer.tsx` lost the `bg-background/97` scrim div and
its comment was rewritten.

**Existing tests this breaks, for qa (not edited by me).** Measured on my tree: 967 passing, 2 failing of
969. (1) `components/BackgroundLayer.test.tsx` "the scrim is the page's own --background at 97 percent"
(criterion 26). (2) `components/background.guards.test.ts` "the set of declared custom property names is
identical to HEAD" fails on the one new token (criterion 27; the new name is `--surface-glass`).
Also for qa, not failing today: `e2e/uploaded-background-legibility.spec.ts` carries 97%-scrim figures;
`e2e/dark-contrast.spec.ts`, `e2e/uploaded-background-dialog-edge.spec.ts` and `e2e/dark-sweep.spec.ts`
read grounds I did not run. `token-foundation.test.ts:104` pins the phrase "FIVE grounds" and "The .dark
value carries its own five figures" in the `--control-border` comment, so the rewritten comment keeps both.

**Criterion 11 honesty:** both `--control-border` comments are rewritten, the stale over-a-dimmed-background
figures (3.36, 3.55) removed, and replaced with flat figures (solid and outline-button grounds) plus
computed frosted figures (light 3.51 black / 4.40 white, dark 3.23 white / 4.35 black). The frosted figures
and all of `--surface-glass`'s are computed from the fill composite, **not read from painted pixels**;
group D owns the painted readings. Dark `--dialog-edge` is untouched and not re-measured by me.

**Owner ruling after hand-back: surfaces paint only while a background image is active.**
- **Mechanism:** CSS only, `body:has([data-background="active"]) .surface-*` in the two `@utility` blocks, the same
  link the grain uses. No React state, so nothing renders on the server and unpaints after hydration, and `pending`
  (opacity 0 image) paints no surface either. I used `:has()` and nothing else.
- **Geometry is identical in both states (constraint 1):** padding, gaps, radius, `pb-32` and a **1 px border that is
  kept transparent, not removed**. Verified in Chromium against the built page at 320x700 and 1280x800, light and dark:
  `getBoundingClientRect` of every `[data-surface]` element before and after injecting a
  `data-background="active"` node is equal in all four runs, and computed paint flips from transparent / `none` /
  `none` to fill / 1 px `--border` / shadow / `blur(10px)` (frosted only) as expected.
- **Correction to the ruling's wording, for qa and the orchestrator:** the no-image state is **paint-identical** to
  HEAD, but **not layout-identical** to it. The panel padding, the header and cluster padding, the 1 px border box and
  `pb-32` are still there with no image and move content by a few pixels against HEAD. They are identical *between* the
  two states of this task, which is what avoids reflow on add and remove.
- **What that saves qa:** with no image, every pixel painted on a surface's footprint is what HEAD painted (the ground
  and the grain), so tasks 007, 009 and 010 already measured it and it needs **no re-measurement**. That is why
  criterion 15's flat-token measurements stand: they are taken on the solid surface, which now only exists with an
  image, where it is opaque `--popover` and image-independent. Criterion 9's zero-delta proof on the solid surfaces
  still applies in the with-image state. **Only the with-image state needs the sweep.** Criterion 21's no-image check
  reduces to "looks like HEAD", plus the geometry-equality above.
- **forced-colors:** a transparent border is forced visible by the UA, which would have been a new no-image
  behaviour, so the base rule sets `border-color: Canvas` under `forced-colors: active` (system colours are honoured),
  where it disappears into the ground. With an image active under forced colours the image layer is hidden and the
  surface paints, so it keeps a visible system-colour outline and its text.
- **reduced-transparency:** unchanged in the with-image state (opaque `--popover`, blur `none`); the no-image state has
  no rule and nothing to see through.
- **`<Surface>` is unchanged:** still the only applier, still renders the `div` with `data-surface` in both states.
- **`backdrop-filter` count is now literally 1** in `app/globals.css` (and 0 elsewhere in `app/`, `components/`,
  `widgets/`). The reduced-transparency override moved to a `--surface-blur` custom property (`blur(10px)`, set to
  `none` under the media query) so the property is declared once. The build output still adds its own `-webkit-`
  twin, which is not source.

**Bottom cluster: surface given, then removed (do not re-add as an oversight).** I first wrapped the four buttons
in a solid surface (criterion 4 row 9). Orchestrator verification found the fixed cluster overlaps the timer panel
on short viewports (218 x 62 px at 320x568, 218 x 43 at 375x667, 218 x 10 at 320x700; none at 768x1024 or
1280x800), so two stacked cards collided, which R-03 forbids, and no amount of page bottom padding fixes a
viewport-pinned element. Owner-side decision: `widgets/BottomControls.tsx` is back to bare buttons (reverted to
HEAD). Each button already paints its own opaque fill and boundary (task list `bg-primary`; soundscape, stats,
settings `variant="secondary"`, the last two with `border-control-border`), so the panel carried no contrast and had
no one-line reason (R-31). Consequences: row 9 is now "explicit exemption: opaque buttons carry their own ground", not
a surface, and it is not on the bare image as text (icons only on opaque fills). Surface count is two, the header
(solid) and the timer panel (frosted). Criterion 15's solid measurements cover the **header only**; the four outline/
secondary trigger borders keep their own fills' figures. `pb-32` went back to `pb-28`: the cluster is 44 px again,
exactly as at HEAD, so the original reservation is right. The bare cluster still sits over the panel at 320x568 /
375x667 / 320x700, as it did over the page at HEAD; its buttons are opaque so this is legible, but it is a stacking
the surfaces did not cause. Re-verified on the built page: zero `[data-surface]` x `[data-surface]` intersections at
320x568, 375x667, 320x700, 768x1024 and 1280x800, and no horizontal scroll.

**Bottom cluster placement (owner ruling, final): flow below `lg`, fixed bottom-right from `lg`.**
- `widgets/BottomControls.tsx`: `flex items-center justify-center gap-2 lg:fixed lg:right-0 lg:bottom-0 lg:z-10 lg:p-4
  lg:pr-12 lg:pb-12`. Below `lg` it is plain content at the end of `<main>`, centred; at `lg` and up it is exactly the
  old pinned geometry (the old `sm:pr-12` now applies from `lg`, since 640-1023 px is flow). Its comment is rewritten
  to state the breakpoint rule. No surface on it in either mode.
- `app/page.tsx` `<main>`: `pb-28` became `pb-12 lg:pb-28`. The reservation only earns its place while the cluster is
  fixed, so it applies from `lg`; below it, `pb-12` mirrors the existing `pt-12` so the page has no dead tail.
- **For task 014:** pick the same pattern up here. The rule is "page flow below `lg`, `lg:fixed` plus the matching
  `lg:` bottom/left padding on `<main>` from `lg`", the one `BottomControls` uses. Do not invent a second breakpoint.
- **Tab order unchanged:** `BottomControls` is the last child of `<main>` in the DOM and flow placement does not
  reorder it; only its CSS position changed.
- **Credit:** the 320x568 case, where the pinned cluster covered 55% of Start, was **already broken at HEAD**; this
  fix closes it as well as the 375x667 regression (Start 43% / Reset 55% covered) this task introduced with its
  panel and header padding.
- **Probe on the built page (`elementFromPoint` on a 10x10 grid per control, plus its centre), at rest, no scroll:**
  375x667 Start 99% / Reset 100% reachable, centres reachable; 320x700 100% / 99%, reachable; 768x1024 100% / 99%,
  reachable; 1280x800 100% / 99%, reachable (the 1% is a corner of the rounded border). **320x568 is NOT
  reachable at rest: Start and Reset sit at y 571..615 in a 568 px viewport, 0% on screen, centre OFFSCREEN.** The
  cluster no longer covers them (the cluster is at y 672 after them in flow), but they are 3 px below the fold, so
  Start needs a scroll. Closing that needs about 47 px of vertical room (smaller panel, header or `gap-10`/`pt-12`),
  which is the "shrink the panel" option the owner declined, so I did not take it. Orchestrator's call.
- Surface x surface intersection is 0 at all five viewports, no horizontal scroll, no `button/a/label` under 43.5 px.

**Vertical budget below `sm` (320x568), as numbers.**
- 012 added **27 px** above the controls: panel `p-4` top 16 + 1 px border, header `py-1` 4+4 + 2 px border
  (HEAD: Start top y 544; with 012: 571).
- Gave back **16 px** below `sm` only: header `py-0 sm:py-1` (-8), panel `p-2 sm:p-6` (-8, from `p-4`). `sm` and up is
  exactly as built (`p-4`/`sm:p-6` is now `p-2`/`sm:p-6`; header `sm:px-4 sm:py-1`), borders kept (transparent
  box unchanged), `pt-12`/`gap-10`/timer spacing untouched. 8 px is the inset I chose: it is the smallest that
  keeps text off the edge of the blur (the panel's own text rows carry `px-2` too) and still reads as a panel, and
  below it the horizontal inset would also vanish on a 288 px column.
- Net: Start/Reset top now **y 555** at 320x568 versus HEAD's **544** and 571 before this trim. **Residual known
  gap: 11 px lower than HEAD.** The top 13 px of the controls (30% of area) are on screen and uncovered; their centre
  (y 577) is 9 px below the 568 fold, where at HEAD the centre (566) was on screen but 55% covered. PLAN.md
  candidate: closing it fully needs 11 more px from `pt-12` / `gap-10` / timer spacing, which are pre-012 and not
  this task's to spend. At 375x667 and 320x700 the controls are fully reachable (y 555).
- Probe after the trim, grid coverage Start / Reset and centre verdict: 320x568 30% / 30% OFFSCREEN (y 555);
  375x667 99% / 100% reachable (y 555); 320x700 100% / 99% reachable (y 555); 768x1024 100% / 99% reachable (y 535);
  1280x800 100% / 99% reachable (y 487). Surface intersections 0, no horizontal scroll, no target under 43.5 px.

**Checks I ran:** `npm run typecheck` clean; `npm run lint` 0 errors, 21 warnings (baseline); `npm run
build` clean, routes `/`, `/_not-found`, `/settings`, `/stats`; built CSS shows one `backdrop-filter` rule
(plus the generated `-webkit-` twin) and the reduced-transparency override. Screenshots at 320 and 1280, both
themes, over a half-white half-black stand-in. I did not run the Delivery Gate, e2e, or a painted-pixel sweep.
Persisted state: nothing touched (`lib/**` and `hooks/**` unchanged).

**Criteria I believe satisfied by implementation (pending qa measurement):** 2, 3, 4, 5, 6, 7, 8, 9, 10,
13 (ruling and reason; the asserting test is qa's), 18, 19, 20, 21, 25 (statement; timer untouched). 11 is
done except painted re-measurement. 14-17, 22-24, 26-31 are qa's to measure or replace.

## QA Report
(Filled in by qa, 2026-10-28. One measurement pass shared with 013: see 013's QA Report for the group H rows.)
- Verdict: **FAIL**
- Verdict basis: FAIL on criteria 2 (literal HEAD diff), 4 (row 9 exemption leaves control edges on the bare image), 6 (literal, `--surface-blur`), 12 (dark dialog edge, blocker), 14 (chip clause and focus edge unmeasured), 15 (theme-control edges unmeasured), 30 (console clause); NOT MEASURED in this pass: 16, 17, 20, 22, 23. Passing with figures: 3, 5, 7, 8, 9, 11, 13, 18, 19, 21, 24, 25, 26, 27, 28.
- Tree measured: the tree as handed (uncommitted; it also carries 013's `lib/timer` and `lib/db` work, which is why criterion 2's HEAD diff is not empty). Scratch e2e ran on :3100 against one `npm run build` (`out/`) served by `e2e/helpers/serve-out.mjs`. `next dev` was not used: one dev server per project directory, and :3000 is the orchestrator's.

### Gates (this tree)
- `npm run test`: 36 files, **1065 passing, 0 failing** (orchestrator baseline 949 passing / 24 failing of 973). The 24 were the four suites repaired by QA (see "Tests changed").
- `npm run typecheck`: **0 errors** (baseline 23, all in test files, now repaired).
- `npm run lint`: **0 errors, 20 warnings** (baseline 21 warnings).
- `npm run build`: exit 0, routes exactly `/`, `/_not-found`, `/settings`, `/stats`. No app file changed after this build.
- `npm run test:e2e` (scratch :3100, 658 tests): **569 passed, 87 failed, 2 skipped**. Failures by file: settings-gauge-style 36, sessions 10, dark-a11y-console 8, uploaded-background-legibility 4, timer-gauge 4, soundscape-layout 4, uploaded-background-layer 3, focus-surface-sweep 3, uploaded-background 2, timer-surface-tokens 2, task-list 2, dark-theme-control 2, dark-contrast 2, and 1 each in uploaded-background-dialog-edge, token-chip-cue, mode-selector-legend, dark-sweep, accessibility. Triage is under "Unresolved".

### Criteria
Figures are full-coverage painted pixels from one ground capture per (image, theme, viewport), text hidden for the capture. Source: `e2e/focus-surface-sweep.spec.ts`, 134 readings, all floors met where measured. Images: white, black, split white/black. Viewports: 1280x800 and 320x700.

A. Gate and order
1. **PASS.** The inventory was recorded before QA (Implementation Notes, "Criterion 1 inventory"). No token was re-pointed during the sweep, and the Start-row method change moved no token value.
2. **FAIL (literal).** `git diff --name-only HEAD` is not empty for `lib/db/`, `lib/timer/`: 013 changed them on the same tree, so a HEAD diff cannot be empty and this is the anti-pattern (013 criterion 57). By value: `CURRENT_SCHEMA_VERSION` = **3** (`lib/db/database.ts:17`), `PREFERENCES_VERSION` = **1** (`lib/preferences/schema.ts:69`). `package.json`/`package-lock.json` unchanged; no `lucide-react` import added (guard passes). The 012-owned claim (no 012 edit to persisted state) holds by inspection; the literal criterion does not.
3. **PASS.** Exposed ground pixel (2,2): **255,255,255** under the white image and **0,0,0** under the black image, both themes and both viewports, asserted exact (grain suppressed while the image is active; tolerance 0). `components/BackgroundLayer.tsx` has no scrim element (test).
4. **FAIL.** Mapping is complete, but row 9's exemption leaves control edges on the bare image: the Settings, Stats and Soundscape triggers carry `border-control-border` and sit directly on the photograph (`widgets/BottomControls.tsx`). Criterion 4 says that exemption is invalid. Not measured; the finding is structural.
5. **PASS.** `backdrop-filter` applied once in `app/globals.css` (`.surface-frosted` via `--surface-blur`); zero `backdrop-filter`/`backdrop-blur` in `app/`, `components/`, `widgets/` (guard). `<Surface kind="frosted">` only in `app/page.tsx`.
6. **FAIL (literal) for `--surface-blur`.** `--surface-glass` has a `:root` value `rgb(255 250 243 / 0.9)` and a `.dark` value `rgb(30 22 16 / 0.9)`, each with its reason comment (guard: exactly two declarations, pass). `--surface-blur` is declared inside `@utility surface-frosted` (`blur(10px)`, `none` under reduced transparency), with no `:root`/`.dark` value and no painted figure. A blur is not a colour, so it has no painted figure, but criterion 6 says "any new custom property". Raised for a ruling; not fixed.
7. **PASS.** Each kind defined once (`@utility surface-solid` and `surface-frosted`, one `{` each). `data-surface` and the class names appear only in `components/Surface.tsx` (guard, `app/globals.css` excluded as the definition site).
8. **PASS (design + test).** The frosted floors do not depend on the blur: criterion 18's test removes `backdrop-filter` and the readout still meets 4.5:1 on the white and black images (`e2e/focus-cycle.spec.ts`, passes). The fill, not the blur, carries the contrast.
9. **PASS.** Frosted interior pixel (12 px inset): white 255,250,244 / black 230,225,219 / split 255,250,244 in light, a delta of **25,25,25** (>= 8). Dark: white 52,45,39 / black 27,20,14, delta **25,25,25**. Solid header centre: **255,250,243** in all three images, light and dark, delta **0,0,0** at both viewports.
10. **PASS (behaviour).** `/settings` and `/stats` carry no `[data-surface]` and no `[data-background="active"]` with an image stored (`e2e/focus-cycle.spec.ts`, passes). Ground pixel equality against the plain token was not separately sampled.

B. Surfaces and the token set
11. **PASS (confirmed as a diff).** The rewritten `--control-border` comments re-scope the 3.36/3.55 figures to the frosted and solid grounds. Re-measured frosted worst cases match the comments: light **3.511** over black (comment 3.51), dark **3.234** over white (comment 3.23). `components/token-foundation.test.ts` passes unchanged.
12. **FAIL (blocker, raise to orchestrator).** Dark `--dialog-edge` under the new composite: **1.25:1** over the scrimmed page with a white image (`e2e/uploaded-background-dialog-edge.spec.ts:106`, expected >= 3). Criterion 12 says a sub-3:1 dark result is a blocker to raise, not a fix to take. Light: the `test.fail` for the light dialog edge **still fails as expected** under the new composite (it is not in the failure list, so no unexpected pass), so no flip is needed.
13. **PASS (ruling stated and asserted).** Grain is suppressed while an image is active (`body:has([data-background="active"])::before { opacity: 0 }`). Asserted in `e2e/focus-cycle.spec.ts` ("grain steps aside", passes). `--grain-ink` and `--grain-opacity` values unchanged (guard).
14. **FAIL (incomplete).** Measured and passing:
   - mm:ss readout (text `#2b2017` light / `#f5ebdc` dark) worst ground: light **4.987** (black, 1280), dark **4.681** (black, 320) vs 4.5.
   - Start/Pause `--primary-foreground` on its fill: light **5.022** (`#ffffff` on `#b45309`), dark **8.828**, vs 4.5. The fill is read from computed style (opaque, alpha checked): the pixel sample of that rect disagreed with the saved screenshot, unresolved (see Unresolved).
   - current-task title: light **7.350** (white image), dark **6.485**, vs 4.5.
   - `--control-border` on Reset and the custom-duration input: light **3.511**, dark **3.234**, vs 3.
   Straddle clause, stated per foreground: the frosted composite's luminance band across the three images is about 0.79 to 0.95 in light and 0.01 to 0.03 in dark (fill over the image, 0.9 alpha). Readout fg (`#2b2017`, L ~0.02) and title fg light (`#57534e`, L ~0.09) sit below the band; the light control border (`#7a756f`, L ~0.18) sits below it too. Dark: readout fg (`#f5ebdc`, L ~0.83) and title fg (`#c2b19b`, L ~0.45) sit above the band, the dark border (`#8a7968`, L ~0.20) above it. **No foreground straddles its band.**
   NOT MEASURED: the mode chips (`#44403c` unchecked, `#78350f` checked, >= 4.5). The chip label's computed colour is `rgb(43,32,23)` for both states, and the ground sample read the checked text (`120,53,15`). Method failure: the glyph carrier is a child element. Not resolved, so the chip clause is open. NOT MEASURED: the focus indicator's outer edge (>= 3).
15. **FAIL (incomplete).** Solid header, flat (image-independent, criterion 9 zero delta holds): wordmark `--primary` **4.835** light / **8.665** dark vs 3 (large text); theme control text **15.299** light / **15.117** dark vs 4.5. NOT MEASURED: the theme control's edges (>= 3). The four outline triggers' `--control-border` are measured only as part of row 9, which 4 already marks invalid. Observation for the orchestrator: at 320x700 the theme control's 44 px hit box runs to y 131 and the header ends at y 130, so one pixel of the hit box sits on the bare image. The glyph ink is inside the header.
16. **NOT MEASURED.** The glyph and vessel matrix at 100/50/0 was not implemented in this pass. Only the vessel at full (level 100) is measured as the readout row above (4.987 light, 4.681 dark).
17. **NOT MEASURED.** The 1 px border coverage pass over `/` was not run.

E. Fallbacks
18. **PASS (behaviour).** `[data-surface="frosted"]{backdrop-filter:none}` injected; readout >= 4.5 on white and black (`e2e/focus-cycle.spec.ts`, "criterion 18", passes). Red-proof level: e2e only (CSS has no unit level); not separately broken and restored.
19. **PASS (assertion), figures not tabled.** With `prefers-reduced-transparency: reduce` (CDP emulation) the frosted panel's blur is `none` and its fill is opaque `rgb(...)`; default mode has `blur(10px)` and an alpha 0.9 fill (same test, passes). Thin-pair figures under this emulation were not recorded separately. The solid surfaces carry no transparency, so they are unaffected.
20. **NOT MEASURED.** Forced colours not exercised in this pass.
21. **PASS.** No image: no surface paints a fill, border, shadow or blur (`e2e/focus-cycle.spec.ts`, passes). Geometry equality was verified by the implementer, not re-run.
22. **NOT MEASURED.** Arrival geometry not re-run in this pass.
23. **NOT MEASURED.** Paint-order sequence across the arrival not sampled.

F. Layout, motion and cost
24. **PASS.** Idle: two frames 1 s apart byte-identical, 0 rAF callbacks (013 criterion 45 test, passes). No new `setInterval`/`setTimeout` in the surfaces (guard).
25. **PASS for the readout tick (after a test fix; see Tests changed).** With a 1-minute-plus running Focus run and a black image the readout changes after a 1 s clock advance and the stored end is unchanged. Persisted-state byte identity across a theme flip and a `/` to `/settings` round trip: NOT tested in this pass.
26. **PASS (replaced, not deleted).** See "Tests changed".
27. **PASS (red-proof, unit).** The pinned token set is `background.guards.test.ts` "the declared custom property names are exactly the pinned set (criterion 27)". Break: a probe `--qa-probe` added to `:root` in a scratch copy, test went red. Restored, green. Level: unit.
28. **PASS (suite).** `palette.tokens.test.ts` and `token-foundation.test.ts` pass with the renamed `FocusLengthInput.tsx`. No raw palette classes or colour literals added (guard suite).
29. **PARTIAL.** axe on `/` with no image in the 013 states (criterion 48) passes in both themes. The axe sweep with a background stored on `/`, `/settings`, `/stats` and the dialog is in the full e2e run; 8 `dark-a11y-console` tests failed (see Unresolved), so this is not green.
30. Gates: see "Gates". Console: the flow-level zero-console test (`dark-a11y-console`, `timer-gauge` 320/1280, `uploaded-background-legibility` 469) is among the failures, so criterion 30's console clause is **not met**.
31. **PARTIAL.** Red-proof levels: criterion 27 at unit (done, above). Criterion 18 at e2e (its test is the guard; not broken and restored). Criterion 14 has no unit level; its e2e guard is the sweep. Not broken and restored, so not proven to discriminate.

### Tests changed (criteria 26 and 55; none weakened, none removed to make a failure go away)
- `components/BackgroundLayer.test.tsx`: "the scrim is the page's own --background at 97 percent" replaced by "the image paints with no overlay" (only child is the `<img>`, no `bg-background`, no `/97` tint). Reason: the scrim is gone.
- `components/background.guards.test.ts`: "the set of declared custom property names is identical to HEAD" replaced by the by-value pin of 92 names (027). "lib/timer, lib/stats, the two timer hooks and the boot script have an empty diff" (010 c2) replaced by by-value checks (one `setInterval` in the clock hook with `setNow(Date.now())`; boot script present). Reason: both were HEAD diffs and went red because the work shipped (013 criterion 57).
- `components/CustomDurationInput.tsx` renamed to `components/FocusLengthInput.tsx`; imports and paths updated in `components/PomotatoTimer.tsx`, `components/TimerSurface.tokens.test.ts` (40, 94), `components/token-foundation.test.ts` (122), `components/palette.tokens.test.ts` (85).
- `e2e/helpers/timer-hold.ts` seeds version 3 with `focusMinutes` and `cyclePosition`. `e2e/sessions.spec.ts` keeps its version-2 fixture with `customMinutes` (it is a migration fixture).
- `e2e/timer.spec.ts` "reload after end time passed shows 00:00 and complete state" rewritten to the auto-advance contract (a 1-minute overrun lands running on a break at 04:xx). Reason: 013 criteria 13 and 15.
- `e2e/timer-gauge.spec.ts`: completion step expects the break to start (level >= 90), not 00:00; expired-while-closed uses a 2-hour stale run and expects an idle break at 05:00 and level 100 (013 criterion 36); completion announcement expects "Focus complete. Short break started."; the "empty" contrast step is dropped here, and level 0 is not yet measured anywhere (criterion 16 gap).
- Other e2e files: `input#custom-duration` to `input#focus-length`, `mode: "custom"` to `"focus"`, `customMinutes` to `focusMinutes`, Custom-chip clicks to Focus, `token-chip-cue` comparisons to Short break.
- `components/background.guards.test.ts` is the only file still holding HEAD-diff assertions from 010: "package.json and package-lock.json are unchanged against HEAD", "no image file added against HEAD", and the route-handler check (`git ls-files`). These are the same anti-pattern family as criterion 57 and PLAN.md's record. They pass today. Found, not fixed.

### Unresolved (for the orchestrator; not fixed)
- **Criterion 12 blocker**: dark dialog edge 1.25:1 over the scrimmed page with a white image.
- **Start-button pixel sample disagrees with the screenshot.** `paintedColours` on the Start rect returns cream and peach, while the saved screenshot and the decoded PNG are amber at the same coordinates (`e2e/helpers/surface-sampler.ts` also did not fix it). Not resolved. Fill figures use computed style, which is sound for an opaque flat fill, but the pixel-sampler method needs its own investigation before any other control is sampled the same way.
- **Discrepancy with the legibility spec.** `e2e/uploaded-background-legibility.spec.ts` reports the light wordmark at **2.894:1** over black (its own floor 3). This sweep reads **4.835:1** (`--primary` over the popover, `255,250,243`), which is the arithmetic value. One of the two reads the wrong ground. Not resolved; the legibility spec still carries the 97% figures (criterion 26 says re-measure).
- The 40-plus failing `settings-gauge-style` tests assert the bottom cluster as one fixed row (`cluster` not found after 012's `lg` flow change) and the Custom-to-Focus gauge switch. Not re-routed in this pass.
- Sessions, dark-a11y-console and timer-gauge failures: stale "complete at zero" and Custom assertions, plus pin-flow selectors. Not re-routed in this pass.
- `e2e/uploaded-background-layer.spec.ts` 309 asserts the 010 grain identity, which 012 deliberately changed (criterion 13). Needs re-pointing to the ruling. Not done in this pass.

## Review Findings
(Filled in by reviewer, 2026-11-06. Scope: 012's surface/background hunks of `git diff 7e04b4a..bc5f4d2`. Task 013's files reviewed separately and already APPROVEd; shared files reviewed only for 012's hunks. **The reviewer is read-only by hard rule and has no edit tools — the orchestrator landed this section verbatim from the reviewer's hand-back.**)

- Verdict: **CHANGES REQUESTED**
- Blocking: **finding 1 only.** 012 is already committed, so "blocking" means it must be fixed before 014 builds on this surface system.
- Gates re-run by the reviewer on this tree (bc5f4d2 plus the one uncommitted `app/page.tsx` `gap-10` → `gap-6`): `npm run typecheck` exit 0 / 0 errors; `npm run lint` exit 0 / **0 errors, 21 warnings** (QA round 3 recorded 20 — the extra one is finding 1); `npx vitest run` over the seven 012-owned unit files (`BackgroundLayer.test.tsx`, `background.guards.test.ts`, `palette.tokens.test.ts`, `token-foundation.test.ts`, `token-dark.test.ts`, `clip-to-surface.test.ts`, `focus-cycle.guards.test.ts`) = **393 passing, exit 0**. `npm run build` and `npm run test:e2e` not re-run (orchestrator's, and the e2e sweep is the expensive one). No pixel was re-measured; QA's figures are taken as given.

### Findings

1. **BLOCKER — the solid header Surface is not in the committed tree.** `widgets/HeaderNav.tsx:2` imports `Surface` and never uses it; the header is a bare `div` with `px-3 py-0 sm:px-4 sm:py-1` (line 7). `surface-solid` has **zero appliers** in `app/`, `components/` or `widgets/`.
   Consequences against criteria recorded as PASS:
   - **Ruling 3 / criterion 4 is violated.** The `pomotato` wordmark (`--primary` `#b45309`, `widgets/HeaderNav.tsx:9`) and the three theme chips — which are flat text with no fill and no border by design (`components/ui/mode-chip.tsx:8-12`) — now sit directly on the full-opacity photograph. Ruling 3's straddle arithmetic says that exemption cannot be satisfied for any photograph.
   - **Criterion 15 and criterion 9 figures are stale.** Wordmark 4.835:1, theme label 8.735:1 and "solid header centre 255,250,243 / 30,22,16, delta 0" were all read against a `--popover` surface that no longer paints.
   - **Criterion 14's round-3 fix is nullified.** `peer-focus-visible:-outline-offset-5` (`components/ThemeControl.tsx:20`) was chosen to pull the ring onto "the header's own fill" — see the reason comment at lines 8-19. With no fill, the ring's ground is the photograph again and the 2.058:1 (dark, white image, 1280) figure returns.
   - **Criteria 5 and 7 pass vacuously for `solid`.** Task 014 is told to use `<Surface kind="solid">` and that path has never rendered.
   Evidence that this is residue rather than a recorded decision: the orchestrator's `out/index.html` contains exactly one `data-surface` and it is `frosted`; the dead import is the 21st lint warning where QA measured 20; `e2e/control-edge-measure.spec.ts:126`, `e2e/focus-surface-sweep.spec.ts:235` and `e2e/focus-surface-behaviour.spec.ts` all resolve `[data-surface="solid"]` and cannot pass here; and no ruling in this file removes the header surface — unlike the bottom cluster, which got an explicit "do not re-add as an oversight" paragraph. The Implementation Notes' criterion 4 mapping still assigns rows 1 and 2 to a solid header.
   Note on the uncommitted owner tweak: `gap-10` → `gap-6` on `<main>` frees 32 px (two gaps × 16 px) and re-adding the header Surface costs about 10 px of header height, so the repair fits inside what the tweak just gave back — including the 11 px residual 320×568 gap filed to PLAN.md.

2. **MEDIUM — the surfaces have no `:has()` fallback, and that is a different hole from criterion 18's.** Every surface fill, border, shadow and blur, and the whole two-tone control edge, is gated on `body:has([data-background="active"])` (`app/globals.css:355`, `372`, `425`); there is no `@supports selector(:has(*))` anywhere in the file. In a browser without `:has()` — Firefox before 121, which includes the 115 ESR line, and Safari before 15.4 — the image still paints at 100% and **no surface paints at all**, which is exactly ruling 3's invalid state and criterion 18's named trap ("a fallback that leaves text on a transparent ground, which is strictly worse than today"). The Implementation Notes state the `:has()` cost for the grain ("costs texture, not contrast") and for `.control-edge` ("keeps the grey `--control-border` edge"), but not for the surface fill, which is criterion 8's legibility carrier. This wants the same treatment `backdrop-filter` got: a stated, measured fallback, or a recorded owner deferral. (The sibling `@media not (forced-colors: active)` wrappers at lines 323 and 424 also fail closed where `forced-colors` is unsupported, but every browser that evaluates the `:has()` selector supports `forced-colors`, so that one is not reachable.)

3. **MEDIUM — the two-tone edge's pass condition is only half in a test.** `e2e/control-edge-measure.spec.ts:213` asserts `max(border, halo) >= 3`. The second half of the rule — "and the two clear 3:1 against each other" — exists only as a `note:` string at line 211 and as prose in the CSS comment (`app/globals.css:420-424`) and in the frontend note. A later re-point of `--popover` or `--foreground` that collapses border-vs-halo (15.299 light / 15.117 dark today) while one ring still clears the ground leaves the suite green and the edge invisible. Add `expect(contrastRatio(border, halo)).toBeGreaterThanOrEqual(3)` alongside line 213 so the rule lives where a future change trips over it.

4. **MEDIUM — `.control-edge` has no applier guard and no single owner.** The class string is hand-copied into four files (`components/TaskListDialog.tsx:44`, `components/SoundscapeDialog.tsx:102`, `components/StatsButton.tsx:12`, `components/SettingsButton.tsx:11`). Compare the surfaces, which criterion 7 confined to one applier and which `components/focus-cycle.guards.test.ts:159-163` pins by scanning every source file. `.control-edge`'s only pin is `expect(count).toBe(4)` in an e2e spec (`e2e/control-edge-measure.spec.ts:123`), which a later task satisfies by *moving* the class rather than adding one — e.g. onto a control inside the frosted panel, where a `--popover` halo is the wrong colour. 014's always-visible lower-left checklist is the next thing that will sit on the photograph; the escape hatch deserves the same "one applier, guarded" treatment the surfaces got, before it is reused.

5. **MEDIUM — the frosted cap is not enforceable at the API and its guard is evadable.** `components/Surface.tsx:19-21` exposes `kind` as a plain required union prop, so ruling 2's one-frosted-surface cap rests entirely on `components/focus-cycle.guards.test.ts:146-149`. That guard matches `/<Surface\s+kind="frosted"/` and asserts the **file list** equals `["app/page.tsx"]`, so two frosted surfaces inside `app/page.tsx` still pass, and `<Surface className="…" kind="frosted">` written anywhere evades it entirely because the regex requires `kind` to be the first attribute. Criterion 5's wording is "the count is 1". Counting occurrences of `kind="frosted"` across `APP_SOURCE` and asserting 1, order-independently, closes both. (The related `data-surface` override through the JSX spread is already blocked by the `data-surface=` arm of the same guard — that part is sound.)

6. **LOW — the unlayered `.control-edge` rule is contained today, but it silently kills declarations.** `app/globals.css:425-428` sets `border: 1px solid var(--foreground)`, which overrides `border-control-border` and the `focus-visible:border-control-border` / `focus-visible:border-border` in all four className strings, and `box-shadow: 0 0 0 1px var(--popover)` (line 427), which replaces the whole `box-shadow` property including Tailwind's `--tw-ring-shadow`. It is harmless *only* because all four triggers already carry `focus-visible:ring-0` and paint focus with `outline`. The dead utilities are still in the four strings with no note at either end, and the next variant that reaches for `shadow-*` or `ring-*` on one of these controls will get no effect and no error. Worth one line at the rule: do not add a `box-shadow` or `ring` utility to a `.control-edge` control.

7. **LOW — an untokenised shadow colour, written twice, that no guard reaches.** `box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.08)` appears at `app/globals.css:362` and `:383`, once per `@utility`. The 007/palette guard scans `.ts`/`.tsx` only, so criterion 28's "a new surface treatment means new tokens, not new raw colours" never sees it. It is also not themed: 8% black over the dark panel's `#1e1610` is invisible, so in dark the surface's stated elevation marker — "they sit on a photograph, where a 1.4:1 `--border` hairline alone does not hold an edge" (lines 345-348) — is carried by nothing. Not re-raising criterion 17's owner-deferred hairlines; the point is that the comment's reason does not hold in dark, and a third surface kind would copy the literal.

8. **LOW — a rewritten comment that describes the superseded design.** `components/BackgroundLayer.tsx:18-20` still says "a frame never shows a half-painted image over a missing surface: the surfaces are markup and are already there." After the owner's "surfaces paint only while a background is active" ruling, the surfaces are markup but **unpainted** until `data-background` flips, and that flip happens on the same render as `opacity-100` (lines 35-36). QA already filed this as criterion 23 finding 6. No frame is actually wrong, but this is the one file criterion 11 rewrote to stop a comment from carrying a ground that no longer exists, and it now carries a sequence that no longer ships.

9. **NIT — `cn()` drops one chip utility, verified harmless.** Routing `modeChipVariants` through `cn()` at `components/ThemeControl.tsx:57` makes tailwind-merge fold `peer-focus-visible:outline` into `peer-focus-visible:outline-2`, so the rendered chip in `out/index.html` has no `outline` utility. Tailwind v4 registers `@property --tw-outline-style` with `initial-value: solid`, so `outline-2` alone still paints a solid ring, and `e2e/control-edge-measure.spec.ts` asserts `outlineStyle === "solid"`. Recorded only so nobody re-derives it.

### By dimension

- **Correctness against the acceptance criteria.** Finding 1 breaks criteria 4, 9, 14 and 15 as recorded, and leaves 5 and 7 unexercised for the `solid` kind. Everything else in 012's behaviour set holds on inspection: the scrim element is gone with no opacity, filter or blend on the image (`components/BackgroundLayer.tsx`); the grain ruling ships as described; `--surface-glass` is declared once per block with its three-part reason; the stale 3.36 / 3.55 "over a dimmed uploaded background" figures are removed and re-scoped in both `--control-border` comments; dark `--scrim` moved 0.62 → 0.90 exactly as ruled; the replaced token-name guard is a by-value pin of 91 names with `--surface-glass` and `--surface-blur` in it; `--surface-blur` resolves correctly under `prefers-reduced-transparency` (declared and consumed in the same block, overridden in the nested media query).
- **TypeScript strictness.** Clean. No `any` and no casts in any added line across `app/`, `components/`, `widgets/`, `e2e/`. `components/Surface.tsx` uses `as const` + `keyof typeof` to derive the kind union from the class map, `ComponentPropsWithoutRef<"div">` for the rest, named export, functional component, no client boundary needed. `npm run typecheck` 0 errors.
- **Accessibility.** Sound apart from findings 1 and 2. The forced-colors path is honest: `.control-edge`'s `1px solid ButtonBorder` applies with or without an image, and the surfaces' invisible boundary under forced colours is a documented, ruled consequence that nothing depends on. Focus geometry checks out — the 5 px halo plus a 2 px outline at 2 px offset leaves the outline flanked by `--popover` on both sides and does not collide with the 8 px `gap-2` between triggers (worst case 5 + 1 = 6 px). Keyboard reachability, tab order and semantics are unchanged by the `lg:fixed` flow change (`widgets/BottomControls.tsx` is still the last child of `<main>`).
- **Performance.** No new `setInterval`/`setTimeout`, no `requestAnimationFrame`, no animation on either surface, one `backdrop-filter` on one element. No 012 change touches `lib/timer/**` or `hooks/use-timer-clock.ts`, so remaining time still derives from the stored end timestamp. The `body:has()` link is an invalidation cost, but it is driven by one attribute flip per image load, not by the per-second readout, and it buys the no-React-state property the owner ruling asked for. Acceptable.
- **Licensing / branding.** Clean, and the task predicted correctly that this is the trap. No asset, bitmap texture, font or audio added; the frost is a CSS `backdrop-filter`; the grain mask is the pre-existing inline SVG data URL; `rgb(0 0 0 / 0.08)` is a shadow, not an asset. Nothing resembles another product's branding. `docs/DECISIONS.md` correctly gains no asset-provenance entry for 012.

### Settled items I deliberately did not reopen
Criterion 6 (`--surface-blur` needs no per-theme value), criterion 46, criterion 2 (satisfied by value), criterion 17 (the 60 sub-3:1 hairlines) and criterion 25 (persisted-state identity across a theme flip) — all ruled or owner-deferred. Finding 7 touches criterion 17's territory only to flag that a CSS comment's stated reason does not hold in dark; it re-raises no figure.

## QA Report — round 2 (2026-10-29)
- Verdict: **FAIL**
- Failing: **4** (bare-photograph control edges; owner-deferred, recorded as a `test.fail`, not fixed here), **14** (theme control focus outline over the photograph at dark / white / 1280x800: **2.058:1**, floor 3), **20** (the "Your tasks" trigger keeps no edge under forced colours: **1.000:1**, floor 3).
- Open, not measured this round: **25** (the persisted-state byte-identity clause across a theme flip and a `/` ⇄ `/settings` round trip; outside this round's brief, still untested from round 1).
- Reported as findings, not decided by QA (criterion 17's own wording): **17** (2 boundaries with no fully covered pixel; 60 covered boundaries below 3:1, detailed below).
- Measured passes this round: 3, 8, 9, 11, 12 (dark), 16, 18, 19, 22, 23, 27, 29, 30. Round-1 passes stand unchanged for 1, 2 (by value, ruled), 5, 6 (ruled), 7, 10, 13, 21, 24, 26 (see the replaced assertions below), 28.
- Shared figure table, provenance and the 013 criteria: see `docs/tasks/013-focus-cycle.md`, "QA Report — round 2", which holds the group H and greyscale/forced-colour figures.

### Gates (tree as handed plus QA's test-file changes; app/ not edited by QA)
- `npm run test`: 38 files, **1073 passing, 0 failing** (round 1: 36 files, 1065). The +8 are the two new unit guards below.
- `npm run typecheck`: exit 0.
- `npm run lint`: **0 errors, 20 warnings** (orchestrator baseline 21). QA introduced four warnings in its sweep spec and removed them; the remaining 20 are in files QA did not touch this round.
- `npm run test:e2e` (scratch :3100, `e2e/scratch-3100.config.ts`, one `out/` build, not rebuilt): **670 expected, 2 skipped, 0 unexpected, 0 flaky, exit 0**. Five of the 670 are `test.fail` blocks that fail as expected (the three findings below plus the two bare-photograph blocks in `uploaded-background-legibility.spec.ts`).
- `npm run build`: not re-run by QA (no app file changed by QA; the orchestrator's `out/` from this tree stands).

### Phase 1: the e2e baseline and what changed
- Baseline on this tree, before QA's edits: 661 tests, **648 passed, 2 skipped, 11 failed**. Round 1 recorded 87 failures; they do not reproduce on this tree. The named repairs (accessibility `modeCount`, dark-contrast/dark-sweep focus-length, task-list 1170, mode-selector-legend) were already passing here.
- No app defect was found in Phase 1. Causes and repairs (test files only):
  1. `uploaded-background-legibility.spec.ts`: the wordmark ring overflowed its Surface. Rings are now clipped to the padding box of the surface they sit in (`clipToSurface`, `e2e/helpers/surface-sampler.ts`), and the wordmark reads **4.835:1** light (ruling confirmed). The padding box, not the border box, because the surface's own 1 px `--border` is paint, not ground.
  2. `uploaded-background.spec.ts`: the same-origin check hardcoded `localhost:3000`. Now uses the page's origin (3100 under scratch).
  3. `token-chip-cue.spec.ts`: radio count 4 → 3 (Custom removed, 013 criterion 2).
  4. `timer-surface-tokens.spec.ts` (x2): the seeded run expired one second ago. Per 013 criterion 19 its derived break end is still in the future, so the break correctly resumes running. The test expected idle. Re-seeded two hours stale (013 criterion 36).
  5. `stats.spec.ts`: the seed put every session in the month, and the default Day view had no rows. Half the sessions now end within the last 17 minutes.
  6. `dark-theme-control.spec.ts` (x2, criterion 38): see "Tests changed" (a HEAD-pinned layout, now re-pointed and flagged).
  7. `task-list-dialog.spec.ts` (overlay) and `task-list.spec.ts` (persistence): failed under five-worker load, passed alone 3/3. They now wait for the dialog's entry transition and for the IndexedDB commit respectively.
  8. Three tests exposed by the sampler change (below): `soundscape-measure.spec.ts` (x2) now settle the dialog transition before reading; `token-task-surface.spec.ts` drag ring now polls for the box-shadow.
  9. `focus-surface-behaviour.spec.ts` (new): the early geometry read was taken mid-shift; it now waits for the page-load shift to finish.
- **Sampler decision (rule 1).** `paintedColours` (`e2e/helpers/background.ts`) now delegates to `groundPixels`, so the `animations: "disabled"` trap cannot be re-entered from either name. Consequence: a static read taken mid-transition now sees the live paint, which is why the callers above now settle first. `e2e/sampler-agreement.spec.ts` is kept as the permanent guard: it pauses a live pulse mid-cycle, requires the base keyframe and the mid-cycle paint to differ by more than 6 (non-vacuous), and requires the sampler to read the paint within 3 per channel.

### Phase 2: the measurement (`e2e/focus-surface-sweep.spec.ts`, one capture per state)
- One `groundPixels` capture per state (image × theme × viewport × state). Images: white, black, split (the bound; flat and forced colours on the plain ground; the 50% grey is in the legibility spec). Raw readings: `/private/tmp/claude-501/-Users-ramwelltupas-pomotato/52379638-e509-40b8-ac59-80f4452e8fbf/scratchpad/sweep-parts/merged.json` (1080 unique rows; each row names theme, image, viewport, state, element, raw colour where it matters, painted pixel, ground pixel and coordinates).
- Corrections made to the method during this round. Each changed some earlier figure, so a reader should know them:
  1. Transitions are switched off on the measurement page. A colour still transitioning reads as an alpha blend: the same light chip read alpha 0.31 to 0.60 across repeat captures.
  2. Text inks with alpha are blended over the ground pixel they sit on, not composited over black.
  3. Glyph-style digits are painted through a background clip, so hiding text does not hide them (confirmed with a saved crop). They are read as the fill against a 6 px ring of the panel. Vessel digits sit over the liquid and keep the text-hidden read.
  4. Forced colours override the text-hide style, so forced reads are unhidden (ink against a ring of canvas; Start label against a corner of its fill).
  5. Dot fills are read at the centre; the active-idle ring on its top stroke row.
  6. Outline rings are read on the outer row, top side only, across the element's own width. A two-side band picked up neighbouring paint.
  7. A rect outside the capture throws instead of being clamped. Clamping had silently read the wrong rows.
- Round 1's figures for the chips, the theme label and the glyph were wrong for these reasons and are superseded. The dot figures and the readout, Start, title and control-border figures match round 1 exactly.

#### Figures, by criterion (min over every state of the cell; full table in 013)
- **3** (exposed ground, 2,2): **PASS**. 255,255,255 under white and 0,0,0 under black, both themes, both viewports, default / blur off / reduced transparency. Split and flat recorded.
- **9** (frosted interior vs solid centre): **PASS**. Frosted interior light: white 255,250,244, black 230,225,219 (delta 25 per channel); dark: white 52,45,39, black 27,20,14 (delta 25). Solid header centre: light 255,250,243 and dark 30,22,16 under white, black and split (delta 0).
- **14** (text and control floors, frosted ground, white/black/split, both themes, both viewports): **FAIL on the theme focus ring only**. Min readout 4.681 (dark); Start label 5.022 (light) / 8.828 (dark); title 5.870 (light) / 6.485 (dark); chips 6.980 (light) / 9.370 (dark); Reset and focus-length `--control-border` 3.234 (dark, white). Focus outline outer edge: chip 3.864 and Start 3.864 (light, black, the lowest cell) / 6.580 (dark). **Theme control focus outline 2.058:1** (dark, white, 1280): its outer row (y=47) lies above the solid header's top edge (y=48), so the ground is the photograph (255,255,255). The 320 px cell and every other image pass (4.182 and up).
- **15** (solid surfaces, flat and image-active): **PASS for the text, with the edges clause N/A at rest**. Wordmark 4.835 (light) / 8.665 (dark) under every image (zero delta, criterion 9). Theme control text 8.735 (light) / 12.769 (dark). The theme chips have **no border or fill** (`components/ui/mode-chip.tsx`), so their only edge is the focus outline (reported under 14). Outline triggers, flat with no image in the loop: 3.648 (light) and above. *Round 1 recorded 15.299 for the theme control text; it does not reproduce. The checked label now reads 8.735 (raw `rgb(120,53,15)` over the header fill). Both labels pass 4.5; the difference is unexplained and not investigated.*
- **16** (readout at 100 / 50 / 0, vessel and glyph, white / black / split, both themes, both viewports): **PASS**. Vessel: light 4.987, dark 4.681. Glyph: light 5.870, dark 6.485. Level 0 vessel 15.117 (dark).
- **17** (1 px borders over `/`, 1280x800): **MEASURED, findings reported (orchestrator's decision)**. 32 sides per capture; 30 have a fully covered pixel. The two Reset vertical sides sit at x 646.69 and 694.30 (half-pixel), so neither has one. Below 3:1, per capture: the 1 px `--border` edge of the solid header and the frosted timer panel, all four sides, **1.32 to 1.48:1** (stroke 214,211,209 against 250 to 254) in light, every image; the timer readout group wrapper's 1 px border, **1.19 to 1.44** (light) and **1.03 to 1.04** (dark: stroke 59,47,37 against 52,45,39). All other sides pass: triggers, Reset top and bottom, the focus-length field, and the Settings/Stats/Ambient/Tasks controls (3.2 and up on the photograph).
- **18** (no-blur fallback): **PASS**. Blur-off captures of the text rows and gauge rows all clear their floors (lowest: 3.234 on the dark Reset edge). Proof that the floor is carried by the fill, not the blur: see red-proofs.
- **19** (reduced transparency, thin pairs, 1280, white/black/split, both themes): **PASS**. Identical to the default figures: readout 4.987 / 4.681, title 7.346 / 8.541, chips 8.735 and up, Reset edge 4.394 / 4.260. Solid surfaces are unaffected by this query (no transparency to remove).
- **20** (forced colours, `emulateMedia({forcedColors:"active"})`, both themes, both viewports): **FAIL on the Tasks trigger**. Text and fills pass at 21.0:1: readout, wordmark, Start label, Reset and focus-length edges (21.0), and triggers 1 to 3 (13.9 to 20.6). **"Your tasks" (the first cluster button) has `border-width 0px`, `background` Canvas on Canvas, and its fill is removed**: its only edge is lost, measured 1.000:1. Its default-mode fill is amber `rgb(180,83,9)` with no border. Surface boundaries under forced colours are not painted (`border` = Canvas on Canvas, 1.000:1). No text or control measured depends on them.
- **22** (arrival): **PASS**. Every box (readout, chips, wordmark, surfaces, cluster, dots) is identical with no image and after arrival, at 320 and 1280. Layout shift with the image equals layout shift with no image, to six decimals. That shift is 0.00058 at 1280 and **0.08323 at 320 px, present with no image at all**: a page-load shift on `/` at 320 px, reported here, not fixed (it is not the arrival). No horizontal scroll.
- **23** (paint order, sampled every animation frame from the first script): **PASS**. Observed sequence: `img off | surfaces 2 not painted => img on | surfaces 2 painted`. No frame has the image on with a surface missing or unpainted. **Note for the orchestrator:** the surface fill is conditional on the image being active (`body:has([data-background="active"])`), so surfaces do not paint *before* the image as the criterion's own rationale describes. They appear with it, in the same frame. The testable clause holds; the described sequence does not ship.
- **25**: **OPEN.** Persisted-state identity across theme flip and round trip not measured this round.

#### Criterion 4, criterion 12 and criterion 11
- **4** (bare-photograph controls): **FAIL, deferred, recorded**. Owner-deferred per the round-1 ruling; not fixed. Measured: the Settings edge over the 50% grey image is **1.140:1** (light, `uploaded-background-legibility.spec.ts`, a `test.fail`), and the Stats focus ring over white in dark is **2.058:1** (same spec). The same triggers pass over pure white and pure black, which is why the bounded set alone does not show the gap; the grey image does.
- **12** (dark dialog edge): **PASS, with confirmation**. Dark `--dialog-edge` edge vs scrimmed ground over a white image **3.476** (predicted 3.469); over black **4.131** (predicted 4.266, the worst ground pixel is 13,10,7 not the composite; 0.135 low, both ends clear 3:1, not material); edge vs fill **3.731** (exact). Light is unchanged: edge vs ground 1.894 (white) and 1.932 (black), edge vs fill 1.434, and its `test.fail` still fails as expected. The light deferral is untouched.
- **11** (`--control-border` comments): **PASS (diff confirmed)**. Light: Reset and focus-length on black or split **3.511** (comment 3.51). Dark: on white **3.234** (comment 3.23). `components/token-foundation.test.ts` unchanged and green.

### Tests changed (criterion 26: every changed or replaced assertion, with the reason)
None weakened, none removed to make a failure go away. A `test.fail` keeps each assertion asserting the floor; it fails only as expected.
1. `uploaded-background-legibility.spec.ts`: rings clipped to their surface's padding box. The wordmark now reads 4.835 light (was 2.894 with the overflowing ring). The Settings and Stats edges and the Stats focus ring are no longer in the floors test; they are asserted at the same 3:1 floor in a `test.fail` labelled as criterion 4 (deferred). Reason: the floors test was red for a known, owner-deferred gap; the gap stays recorded and flips when it heals.
2. `dark-theme-control.spec.ts`, criterion 38: HEAD-pinned figures replaced by the post-012 layout. Reason: 012's solid header Surface moved the wordmark (1280: x 48→65, y 48→53), the header (40→50) and the gauge top (240→295). **The original "1280 px: nothing moves" claim is no longer true. Flagged to the orchestrator as a ruling, not silently accepted.** 320: wordmark (29,49), header 82, gauge top 383.
3. `sampler-agreement.spec.ts`: rewritten from a probe into a guard with a real expectation (see the sampler decision).
4. `helpers/background.ts`: `paintedColours` delegates to `groundPixels` (flag removed; see decision).
5. `uploaded-background.spec.ts`: origin derived from the page.
6. `token-chip-cue.spec.ts`: radio count 4 → 3.
7. `timer-surface-tokens.spec.ts`: expired-reload seed two hours stale (013 criterion 36).
8. `stats.spec.ts`: seed covers the Day view.
9. `soundscape-measure.spec.ts`, `token-task-surface.spec.ts`, `task-list.spec.ts`, `task-list-dialog.spec.ts`, `focus-surface-behaviour.spec.ts`: waits on real state (settled transitions, IndexedDB commit, polled box-shadow, settled layout). Reason: the first three were exposed by the sampler change and the last two were load flakes.
10. `focus-surface-sweep.spec.ts`: round 1's sweep replaced by the round-2 measurement spec. Round 1's readings are superseded (the method corrections above).

### Red-proofs (qa cost rule 1; level named)
- **Criterion 14 floor, carried by the frosted fill: e2e (CSS break, no app edit).** Title over a black image, light, 1280, `e2e` probe: fill restored **5.870:1** (pass); fill removed (`[data-surface=frosted]{background-color: transparent}`) **2.753:1** (red). Discriminates. The same fill carries criterion 18's no-blur floor (the blur is not what carries it). The 18 test itself (`focus-cycle.spec.ts`, "criterion 18") was **not** broken directly; 18's proof is this one.
- **Criterion 27, token-name guard: unit (scratch copy of the repo, probe token in `app/globals.css` of the copy only).** Copy red: `92 names` vs pinned `91`. Real tree: green. The real tree was never edited.
- **Sampler trap guard (`sampler-agreement.spec.ts`): e2e (the only level where the screenshot exists).** `animations: "disabled"` added back to `groundPixels`: read **120,53,15** (base keyframe) against computed **121,85,63**, red. Restored: green.
- **`clipToSurface` (ring confinement): unit (`components/clip-to-surface.test.ts`).** Helper body replaced with `return sides`: **4 of 5 red**. Restored: 5 of 5 green.

### Findings for the orchestrator (not fixed; QA edits no app code)
1. Theme control focus outline over the photograph at dark / white / 1280 (2.058). The outline sits 1 px above the header.
2. "Your tasks" trigger loses its edge under forced colours (border 0, fill removed). Criterion 20.
3. 1 px `--border` hairlines on the solid header and frosted panel: 1.32 to 1.48:1 in light; the timer readout group's border 1.03 to 1.04:1 in dark. Criterion 17 findings.
4. Reset vertical sides at half-pixel x: no covered pixel (criterion 17).
5. Criterion 4 (owner-deferred): grey 50% image, Settings edge 1.140:1.
6. Surfaces paint with the image, not before it (criterion 23 design note).
7. Forced colours: the pending dot paints `rgb(96,0,0)`, which is not a system colour. Observed, not a failure: done and the ring are both black and differ by shape.
8. 320 px page-load layout shift on `/` (0.08323, with no image).
9. Criterion 12 light is unchanged and still deferred.

### Not measured or not re-run this round
- 25 (persisted identity). 10's ground equality (round-1 behaviour pass stands). 21 and 24 (round-1 passes stand, not re-sampled this round).
- One intermittent unexpected failure appeared once, in a combined run of the three round-2 specs under heavier load (sweep + behaviour + sampler, 2.5 min). It did not reproduce in the full suite (670 with 0 unexpected), in a JSON re-run of the same specs (16 expected, 0 unexpected), or in three repeats of the behaviour and sampler specs (27 expected, 0 unexpected). Not attributed to a test; flagged so it is watched.
- **Process miss:** CLAUDE.md requires the antislop mode notice before the first edit of code comments. QA edited test comments without it. The mode is unresolved: the brief gives no session override and no global preference is available to QA. The orchestrator should resolve it.

## QA Report — round 3 (2026-10-29)
Scope, as briefed: criteria 4, 14 and 20 re-measured; the load flake fixed; the `:focus-visible` guard anchored. Criteria 17 and 25 not measured (owner-deferred). Criteria 2, 6, 12, 15, 46 not reopened. `app/` not edited by QA.

- Verdict for criteria 4, 14, 20: **PASS**.
- Full e2e suite (scratch :3100, `e2e/scratch-3100.config.ts`, one `npm run build` taken for this round, `serve-out.mjs` reads `out/` per request and is the same tree): **674 passed, 2 skipped, 0 failed, exit 0** (676 tests). The count after the flake fix is the final run.
- `npm run test`: 38 files, **1073 passing, 0 failing**. `npm run typecheck`: exit 0. `npm run lint`: **0 errors, 20 warnings** (round 2: 20).
- Measurement spec: `e2e/control-edge-measure.spec.ts` (new). One page load per (image, theme, viewport), with a second screenshot in the same load for the Stats focus. Images: white, black, flat 50% grey (128,128,128). Every figure is a `groundPixels` read of one screenshot. The rule is `max(border, halo) >= 3` for criterion 4, against the ground three pixels above the border. The ground must equal the flat image exactly (grain suppressed, tolerance 0), and that is asserted per read.

### Criterion 4: two-tone edge on the four triggers (PASS)
Diff against round 2 and the brief's arithmetic, painted pixels, top edge, centre column. Identical at 1280x800 and 320x720, and the figures match to two decimals.

| image | theme | border ink / halo / ground (painted) | border ratio | halo ratio | max | brief |
|---|---|---|---|---|---|---|
| white | light | 43,32,23 / 255,250,243 / 255,255,255 | 15.889 | 1.039 | **15.889** | 15.89 / 1.04 |
| black | light | 43,32,23 / 255,250,243 / 0,0,0 | 1.322 | 20.220 | **20.220** | 1.32 / 20.22 |
| 50% grey | light | 43,32,23 / 255,250,243 / 128,128,128 | 4.023 | 3.803 | **4.023** | 4.02 / 3.80 |
| white | dark | 245,235,220 / 30,22,16 / 255,255,255 | 1.180 | 17.835 | **17.835** | 1.18 / 17.84 |
| black | dark | 245,235,220 / 30,22,16 / 0,0,0 | 17.799 | 1.177 | **17.799** | 17.80 / 1.18 |
| 50% grey | dark | 245,235,220 / 30,22,16 / 128,128,128 | 3.347 | 4.516 | **4.516** | 3.35 / 4.52 |

- Border vs halo (neighbour): light 15.299, dark 15.117 (brief 15.30 / 15.12). All four triggers read the same figures.
- Lowest max across the three images: 4.023 light, 4.516 dark. Both clear 3:1 by the expected margin. The brief's grey-sweep bound (3.914 / 3.905) is arithmetic and was not re-swept; this pass samples 128 only.
- The Stats and Settings legacy reads (`uploaded-background-legibility.spec.ts`) are covered below.

### Criterion 14: theme control focus ring inside the header, and the Stats ring (PASS)
- Theme chip ring, painted, ground = the pixel just inside the ring, which is the header fill:
  - light: ring 180,83,9 on 255,250,243, **4.835:1** (brief 4.84), 1280 and 320.
  - dark: ring 240,165,80 on 30,22,16, **8.665:1** (brief 8.67), 1280 and 320.
  - Same figures under white, black and 50% grey, because the ground is the header fill and not the photograph. Asserted exact equality of ground to header fill in every read.
- Containment, from the computed outline (outline geometry is exact, so this is the paint):
  - 1280x800: ring box 1019,54 56x38 inside the header 48..98 (border box and padding box).
  - 320x720: ring box 24,90 56x38, y 90..128, inside the header border box 48..130 and inside the padding box 49..129. The chip's hit box overhangs to y 131, but no ring pixel lands outside. The overhang is not paint.
- Stats focus ring (2 px, offset 2 px, halo 5 px under it), ground = halo: light **4.835**, dark **8.665** (brief 4.84 / 8.67). The round-2 figure of 2.058:1 over white in dark is gone; this is the same ring on `--popover`.

### Criterion 20: forced colours (PASS)
- `emulateMedia({ forcedColors: "active" })`, one load per (theme, viewport), with a white image stored (the image layer is hidden under forced colours). Each of the four triggers: computed `1px solid` `rgb(0,0,0)` border, painted 0,0,0 on Canvas 255,255,255, **21.000:1** in both themes at both viewports (brief 21:1). Round 2's Tasks trigger at 1.000:1 is healed.
- Default-mode pair: the same four triggers at rest in criterion 4 above.

### Flake fix: `e2e/token-task-surface.spec.ts` drag-active (PROVEN)
- Symptom in full runs: first at the opacity poll (orchestrator run), then, after my first repair, at the Escape step (`aria-pressed` still `"true"` after Escape, 5 s).
- Cause, confirmed in `node_modules/@dnd-kit/core/dist/core.esm.js`: `KeyboardSensor.attach()` sets the in-flight state first and registers its keydown listener (Escape included) in a `setTimeout(0)`. A key pressed in that gap is ignored. Reproduced without load: Escape right after `aria-pressed="true"` was lost 8 of 8 with one worker, and 26 of 32 with eight workers.
- Repair (wait on state, not time): wait for the handle to hold focus; wait for `aria-pressed="true"` after Space; wait for the same `setTimeout(0)` to run before Escape (a task-boundary wait, not a delay); after Escape, assert `aria-pressed` is no longer `"true"` (dnd-kit omits the attribute when idle; it does not set `"false"`). The same three assertions (0.6 opacity, box-shadow ring, opacity back to 1) are kept. No retry, no timeout bump, no `test.slow()`.
- Proof: the task-boundary probe cancelled 32 of 32 under eight workers (26 of 32 lost without it). The final full suite passed the drag test.
- Observation for the orchestrator, not an app defect: a human cannot press inside that task-sized window. No app change was made.

### Criterion 27 guard: `:focus-visible` anchored (PASS)
- `components/token-dark.test.ts:120` now `blockBody(css, /^:focus-visible\s*\{/m)`, matching line 132. Checked on the real CSS (global rule, line 454) and on a planted `button:focus-visible {` rule: the old pattern picked up the planted rule; the anchored pattern still returns the global one. Red-proof level: regex-level check on a planted copy (the test itself is unit).
- The four criterion 27 assertions pass against the real global rule (`token-dark.test.ts`, 90 of 90 in that file).

### Tests changed this round (criterion 26 style: none weakened, none removed)
1. `components/token-dark.test.ts:120`: regex anchored (above). Reason: robustness of the guard.
2. `e2e/token-task-surface.spec.ts` drag-active: state waits added (above). Reason: load flake. Same assertions.
3. `e2e/dark-sweep.spec.ts` and `e2e/dark-contrast.spec.ts` (criterion 28, focus rings): the theme chip's offset is pinned to `-5px` by value; every other control stays at `2px`. Reason: criterion 14's fix pulls the theme chip ring inside the header on purpose, so the old `2px` pin was stale. Width (2px), colour (`--ring`) and the 3:1 ground floor are still asserted for every control, theme chips included.
4. `e2e/uploaded-background-legibility.spec.ts` criterion 4 block: `test.fail` flipped to `test`. The Settings and Stats edges are now measured with the two-tone rule (max of border and halo ring, 3:1 floor), not with the worst pixel of the whole ring. The worst-of-ring rule reads the outer halo (1.035) by design, so it was measuring the wrong thing. The Stats focus ring's ground is now the centre pixel of the 5 px halo, not the photograph beyond it. A full-width row picked up the rounded corners of the halo, which is why my first attempt read 1.13. The floors test's `BARE_PHOTO_CONTROLS` exclusion is removed, so Settings and Stats are asserted at 3:1 there too (stricter).
5. `e2e/focus-surface-sweep.spec.ts`: `test.fail` flipped to `test` for criterion 14 (theme focus, dark, white, 1280) and criterion 20 (Tasks forced). Their `KNOWN` entries are removed. The describe title is updated. Criterion 17's `test.fail` remains (owner-deferred).
6. New `e2e/control-edge-measure.spec.ts`: the criterion 4, 14 and 20 measurement (above).

### Red-proofs (qa cost rule 1)
- Criteria 4, 14, 20: the same assertions were red on this surface in round 2 (theme focus ring 2.058 dark/white; Tasks forced edge 1.000 light), so they discriminate. Level: e2e (pixel measurement has no unit level). The legacy worst-of-ring rule read 1.035 on the same outer halo, which shows the two-tone rule is the one that discriminates here.
- Criterion 27 anchor: regex-level, on real and planted CSS (above).

### Figures against round 2 (rule 6)
- Matched to two decimals: all six criterion 4 rows, the border-vs-halo pair, the 4.84 / 8.67 chip and Stats rings, the 21:1 forced edges. No material disagreement, so no further investigation.
- Round 2's 2.058:1 (theme focus and Stats focus, dark over white) is superseded by 8.665:1.

### Not measured this round
- Criterion 17 (owner-deferred) and criterion 25 (owner-deferred). Criteria 2, 6, 12, 15 and 46 not reopened.
