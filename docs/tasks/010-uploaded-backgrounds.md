---
id: 010
slug: uploaded-backgrounds
status: done # draft | in-progress | qa | review | done | blocked
---

# Uploaded backgrounds — a local image behind the app, without breaking legibility

> **History for this task** — implementation notes, QA reports, review findings and
> orchestrator rulings live in [logs/010-uploaded-backgrounds-log.md](logs/010-uploaded-backgrounds-log.md). Read it only when a
> criterion below is disputed; it is not an input to implementing them.

## Goal
Let the owner pick an image from her own device and have it paint behind Pomotato, stored only
in this browser, with every existing contrast floor still holding over whatever image she picks.
Closing this closes milestone 4: it is the fifth and last of its five parts, and the other four
(`006`/`007` tokens, `009` dark toggle, the paper grain, `008` settings surface) are done.

## Provenance
`docs/PLAN.md` milestone 4: "**Themes** — CSS-variable palettes plus uploaded backgrounds." The last
unchecked sub-item. `DESIGN.md` does not mention backgrounds at all — it defers only the grain and the
dark toggle here — so there is no design direction to inherit beyond its Palette, "Mood & motion"
(minimalist, "some animation is welcome", paper grain) and Boundaries ("accessibility is not negotiable
against aesthetics") sections.

## Pipeline — **backend → frontend → qa → reviewer**
**Backend runs first and alone.** The data shape is genuinely undecided (see below) and it is the kind
of undecided that cannot be worked around: frontend cannot write a line until it knows whether it reads
a `Blob` from Dexie or a string from the preference store. Not parallel.

## Settled, do not reopen
Plus the six owner rulings near the bottom of this file, which are equally not reopenable — read those
first if you are backend or frontend, because ruling 4 narrows the surface this whole file describes.

### 1. "Upload" means a local file picker. Nothing leaves the device.
`docs/DECISIONS.md` 2026-10-02, "Local-first, no server database in v1". There is **no route handler,
no `fetch`, no form `action`, no network of any kind** in this feature. The word "upload" in PLAN.md
describes the gesture (a file picker), not a destination. Criterion 29.

### 2. One preference system, whatever the storage home turns out to be.
`lib/preferences/` is the only preference module (DECISIONS 2026-10-23, and `schema.ts:6-10` carries the
recipe). No second store, no second storage key, no second version constant, no second boot script.
This holds even if the image bytes live in Dexie: the *preference* part still goes in
`lib/preferences/` by the documented recipe.

### 3. A stored reference that no longer resolves degrades to no background.
`sanitizePreferences` falls back **per key** and never throws (`schema.ts:58-70`); a dangling reference
is the same class of problem and gets the same answer. It must not throw, must not blank the page, must
not leave a dimming layer with nothing behind it, and must not take the rest of the preferences down
with it. Criterion 5.

### 4. Nothing is licensed here, and no asset ships.
The image is the owner's own file, held on her own device, so there is no provenance to record —
`docs/DECISIONS.md` gains **no** asset entry for this task, and criterion 1's entry says so in one line
so the next reader does not go looking for one. **No sample image, no default background, no
placeholder, no image file anywhere in the repo**, including under `public/`. Criterion 28.

### 5. The timer is untouchable.
Remaining time is derived from a stored end timestamp (CLAUDE.md). `lib/timer/`, `lib/stats/`,
`hooks/use-timer-clock.ts` and `hooks/use-hydrate-timer-store.ts` are pinned to an empty diff
(criterion 2).

### 6. No new dependency.
No image library, no cropper, no canvas helper. `react-icons` is the project's icon library (DECISIONS
2026-10-26); `lucide-react` is installed and imported nowhere and **must not gain its first import
here** — removing it is the PLAN.md Maintenance line, not this task. `package.json` and
`package-lock.json` are pinned to an empty diff (criterion 2).

## Data shape — **UNDECIDED. This is backend's question, not a decided answer.**

### The tension, stated so backend does not have to rediscover it
Every persisted preference today is a `zustand persist` store in **localStorage** under
`pomotato-preferences`, envelope `{"state":{"theme":…,"gaugeStyle":…},"version":1}`. localStorage is
roughly a **5 MB per-origin quota, string-encoded** — a photo encoded as a data URL costs about 1.33×
its byte size and competes with `pomotato-timer` for the same quota. A multi-megabyte image does not
fit, and a quota overflow is not a graceful failure: it throws on write and can take the theme and
gauge preferences down with it.

Dexie (IndexedDB) stores `Blob`s natively, has no 5 MB cap, and is where every other persisted thing in
this repo lives. So the expected answer is **a new Dexie table plus a schema version bump, with the
preference key holding only a reference plus display settings** — but backend decides and records it,
with the quota arithmetic, rather than inheriting it from this file.

**If it is Dexie**, `lib/db/database.ts:7-17` already states the house rule for the bump: the
`.version(1)` and `.version(2)` blocks are **frozen** and a new `.version(3)` block goes *beside* them,
never inside, so existing rows upgrade in place. `lib/db/validation.ts` is the shape for the validation
functions (typed issue returned, never a bare throw) and `lib/db/task-repository.ts` for the repository.

### Pinned either way — these follow from existing decisions and are not backend's to re-ask
- One preference system (§2 above). The preference value is a **stable reference plus display
  settings** — never a colour, class name, data URL, base64 string or raw blob.
- Per-key fallback, never throws. Dangling reference → no background (§3).
- The preference is **not read during render in a way that makes server and first client render
  disagree**: the existing `skipHydration` / `hasHydrated` gate, as `SettingsPanel.tsx:27-31` does it.
  **No second boot script.** `lib/preferences/boot-script.ts` and its drift test stay byte-identical.
- Dexie reads are asynchronous, so the image **cannot** be on the first painted frame. That is accepted,
  not worked around — the alternative (putting enough in localStorage for the boot script to paint from)
  is exactly what the quota rules out. See criterion 22 and open question 7.

### Also backend's to decide and record (criterion 7)
The maximum accepted byte size, the accepted type set, and what a rejected file does. Two constraints on
that decision: **SVG is excluded** (an uploaded SVG is a vector document, not a bitmap, and the reason
belongs in the record), and **animated formats either are excluded or must be shown not to animate**
(criterion 24). Oversize files are **rejected with a message, not downscaled** — downscaling means
canvas re-encoding, which is its own task (see "Not in this task").

## Scope judgement — what this task deliberately is not

A photo behind the UI can touch every surface in the app. Three cuts keep it one task:

**Cut 1 — one image, not a library.** Exactly one background is stored at a time. A library is a
different data shape (ordering, names, a chosen-one pointer) and a different surface (a grid, delete per
item, which-is-active). Open question 2, because retrofitting it is close to a rebuild of both halves.

**Cut 2 — one image shared by both themes.** The dimming layer is themed, so the composite already
adapts. Per-theme images double the storage shape, the picker and the measurement surface. Open
question 3.

**Cut 3 — the measurement is bounded once, not re-run per pair.** This is the cut that makes the task
tractable at all. `/` has **no opaque card**: the wordmark, the mode chips, the `mm:ss` readout, the
current-task card (`CurrentTaskCard.tsx:6` is literally `border-none bg-none`) and the control cluster
all paint directly on the page ground. So "re-measure every pair that sits on the ground" is the whole
app. Instead, criterion 16 bounds the **composited ground** itself against a fixed adversarial image
set; while the composite stays inside the band already measured for the grained ground, every figure
009 recorded carries over unchanged, and only where an image pushes outside the band does a pair get
re-measured. One measurement, not forty.

## Why contrast is the hard part, and the number that makes it hard
`docs/DECISIONS.md` 2026-10-26, "`--control-border` has no contrast headroom left, and the grain is
why": `--control-border` (`#88837e`) is the edge on every fill-less control — the unchecked mode chips,
the custom-duration input, the unchecked `/settings` radio cards — and measures **3.44:1 against the
flat token, ~3.26:1 against the mean grained ground, and ~3.01:1 against a worst-case full-mask grain
pixel**, over a 3:1 floor. Dark is 3.80 → ~3.66. That entry's own "how to apply" names **darkening any
ground this edge sits on** as one of three now-unsafe moves. An image behind the page is exactly that
move, and the edge has roughly 0.3 points of room in light.

That same entry's second-order lesson is this task's operating rule: **a contrast figure is a property
of what paints, not of the token.** Every ratio in the repo was taken against a flat token ground or the
grained one. An image invalidates the page-ground figures until criterion 16 re-bounds them.

## Scope

**In:**
- Backend: the storage decision, its DECISIONS entry, the storage home (table + additive schema version
  bump if Dexie), validation (size, type), the preference key(s) via the `lib/preferences/` recipe,
  store/replace/remove/read, and the degrade-to-nothing path.
- Frontend: a file-picker control and a remove control on `/settings`, their copy, their reject
  feedback, and the layer that paints the image behind all content **on `/` only** (owner ruling 4),
  with whatever mechanism preserves the contrast floors. `/settings` and `/stats` keep the plain ground,
  so the control that sets the image is on a surface that does not show it.
- The interaction with the paper grain layer, stated and asserted.
- Measurement over a procedurally generated adversarial image set, in both themes, at 320 and 1280.
- 008's review finding **R-1** (`/settings` selected option is thin under forced colours), because this
  task edits `components/SettingsPanel.tsx` and the new control would otherwise copy the defect. See
  the findings table.

**Out:**
- **A library of backgrounds, switching between several, naming or reordering them.** Cut 1.
- **Per-theme images.** Cut 2.
- **A user-facing dim/opacity/blur slider.** A user-adjustable dim multiplies the measurement by every
  value it can take and makes a floor-failing value reachable. The dim is fixed at whatever the floors
  require. Open question 5.
- **Cropping, panning, zooming, repositioning, rotation, focal point.**
- **Downscaling, re-encoding, thumbnail generation, EXIF orientation handling.** All need either a
  dependency (forbidden) or canvas work that is its own task. Oversize is rejected, not resized.
- **Export/import of the image.** Milestone 7 (PWA + export/import) owns that, and it is where the
  question "does a JSON export carry a 4 MB blob" belongs.
- **Any motion on the background** — parallax, pan, Ken Burns, slideshow, cross-fade between images.
  Criterion 24.
- **Any new or changed preference other than the background's.** Theme, gauge style, and the boot
  script are untouched.
- **Changing the palette.** No existing token value in `:root` or `.dark` changes. If the floors cannot
  be met without re-pointing `--control-border`, that is raised (open question 1), not done silently.
- **Removing `lucide-react`.** PLAN.md Maintenance line; criterion 2's empty `package.json` diff is the
  guard here.
- Any change to `lib/timer/**`, `lib/stats/**`, `hooks/use-timer-clock.ts`,
  `hooks/use-hydrate-timer-store.ts`, `lib/preferences/boot-script.ts`, the timer surface, the gauge,
  the task list or its dialog, `/stats`'s contents, `widgets/HeaderNav.tsx` or `components/ThemeControl.tsx`.

## Maintenance findings: what 010 absorbs
Same rule 008 used: a finding is this task's only if it touches a file this task already changes. Ruled
in writing so frontend never has to ask.

| Finding | 010 touches it? | Ruling |
|---|---|---|
| **008 R-1** — `/settings` selected option thin under forced colours, `SettingsPanel.tsx:52-55`, plus the wrong comment at `SettingsPanel.tsx:22-25` | **Yes** — this task adds a group to that file | **In.** One `forced-colors:` utility and a corrected comment, in a file already open, on the one screen whose job is choosing — and criterion 19 means the new control must not copy the defect. Criterion 11. |
| **008 R-3** — glyph waterline assumes the webfont painted | No | **Out.** `TimerDisplay.tsx` is not touched. |
| **008 R-4** — no level cue below the `background-clip: text` boundary | No | **Out.** Same file. |
| Dead `disabled:` utilities, `components/TaskForm.tsx:169,189,251` | No | **Out.** |
| 320 px header density, `widgets/HeaderNav.tsx` | No | **Out as a fix. In as a viewport:** criterion 20 re-checks 320 px, since `/settings` gains a second group. |
| Drag-active row ring 2.47:1 light | No | **Out.** Exempted with provenance in DECISIONS. |
| `HeaderNav` is a `<div>` inside `<main>`, not a `<header>` | No | **Out as a fix. In as a constraint on new markup:** do not copy the defect (criterion 9). |
| Dragging row's title below 4.5:1 via `opacity-60` | No | **Out.** |
| Unused `lucide-react` | **No, deliberately** | **Out.** §6 and criterion 2. |
| Constraint: dark `--popover` cannot be lifted for elevation | **Yes, indirectly** | **In as a constraint, not a task.** If a surface needs to separate itself from an image-backed page, separation comes from edges (`--control-border`, `--dialog-edge`), not a lifted fill: the eight task swatches clear dark `--popover` by ~1.3 % and are owner data. `components/token-dark.test.ts` passes unchanged (criterion 21). |

## Acceptance Criteria
33 criteria.

### A. Gate and order
- [ ] 1. **The storage decision is recorded before frontend starts.** A dated `docs/DECISIONS.md` entry
      (backend drafts, orchestrator lands) states: where the image bytes live and why; the localStorage
      quota arithmetic that ruled it in or out; the exact preference value shape; the Dexie
      `CURRENT_SCHEMA_VERSION` before and after, and that any new block was added *beside* the frozen
      ones; the accepted type set and size limit with their reasons, including why SVG is excluded; and
      one line saying **no asset provenance entry is needed** because the image is the user's own file.
      QA states the value of `PREFERENCES_VERSION` and of `CURRENT_SCHEMA_VERSION`.
- [ ] 2. **Backend landed before frontend touched a component**, recorded in Implementation Notes with
      the exact symbols frontend consumed. `git diff --stat` is empty for `lib/timer/`, `lib/stats/`,
      `hooks/use-timer-clock.ts`, `hooks/use-hydrate-timer-store.ts`, `lib/preferences/boot-script.ts`,
      `package.json` and `package-lock.json`; `lib/preferences/boot-script.test.ts` passes with no
      assertion changed. No new dependency and no first import of `lucide-react`.

### B. The data layer (backend)
- [ ] 3. **The bytes are not in `localStorage`.** With a background stored, `localStorage` holds exactly
      one `pomotato-preferences` entry, its envelope is still
      `{"state":{…},"version":<PREFERENCES_VERSION>}`, and its serialised length grows by **under 1 KB**
      versus before. No data URL, no base64, no blob in it. QA reports the byte length before and after
      and enumerates the keys inside `state`.
- [ ] 4. **One preference system.** The background's preference key(s) are added by `schema.ts`'s
      documented recipe — field on `Preferences`, default in `PREFERENCE_DEFAULTS`, value set or
      validator, one `pick` line in `sanitizePreferences`, one `partialize` entry and one setter in
      `store.ts`. No second store, storage key or version constant exists anywhere in the repo.
      `PREFERENCES_VERSION` moves only if an existing key's meaning changed, and criterion 1 says which.
- [ ] 5. **Every malformed or dangling state degrades to the plain token ground, never to a throw, a
      blank page or a lost preference.** Table-driven unit tests cover: no stored reference; a reference
      whose row does not exist; a row whose bytes are not a decodable image; a wrong-typed preference
      value; a newer `PREFERENCES_VERSION`; an older one; a non-object payload; unparseable JSON;
      `DatabaseUnavailableError` (no IndexedDB); `DatabaseBlockedError` (another tab on the old schema).
      Each yields the plain ground **and** leaves `theme` and `gaugeStyle` intact. The real migration
      case is asserted against the literal shipped payload
      `{"state":{"theme":"dark","gaugeStyle":"glyph"},"version":1}`, which must keep both keys and gain
      the background default. Per DECISIONS 2026-10-23, persist **writes the sanitised payload back** —
      a test asserting the bytes are left untouched is wrong.
- [ ] 6. **The schema change is additive and loses nothing.** The existing `.version(1)` and
      `.version(2)` blocks in `lib/db/database.ts` keep an **identical stores string** and any new block
      sits beside them. *(Amended 2026-10-26, orchestrator, resolving QA FAIL item 4: as originally
      worded this asked for a byte-identical diff, and backend changed `.version(CURRENT_SCHEMA_VERSION)`
      to a literal `.version(2)` when it added version 3. **The change is correct and is accepted.** A
      historical version block pinned to a moving constant silently renumbers itself the next time the
      constant bumps, which is a latent data-loss bug; history belongs at literals. QA proved the
      behaviour with seeded v2 rows surviving the upgrade — `lib/db/background-migration.test.ts`.)* QA seeds `tasks`, `appMeta` and `sessions` rows on the pre-change version, opens the
      new version, and re-reads them unchanged. `lib/db/task-repository.test.ts` and
      `lib/db/session-repository.test.ts` pass with no assertion changed.
- [ ] 7. **Validation lives at the data layer, not in the picker's `accept` attribute.** A stated
      maximum byte size and a stated accepted type set are enforced by a function in `lib/db/` shaped
      like `lib/db/validation.ts` — returning a typed issue, never throwing a bare error — so a file
      that bypasses the `accept` hint (drag-drop, a renamed extension, a wrong MIME type) is still
      rejected. Type is checked from the bytes, not from the filename alone. Oversize, wrong-type and
      undecodable files each leave the previously stored background, or no background, **exactly** as it
      was: QA asserts the row count and the preference value are unchanged after each rejection.
- [ ] 8. **Replace and remove are clean.** Storing a second background leaves exactly one row; removing
      leaves zero rows **and** no dangling reference in the preference; both survive a reload and are
      visible to a second tab in the same browser. QA counts rows directly, not via the DOM.

### C. The control and its copy
- [ ] 9. **One background control on `/settings`**, in the `<fieldset>`/`<legend>` shape
      `components/SettingsPanel.tsx:42-60` already uses, backed by a real `<input type="file">` (not a
      div with a click handler). It is Tab-reachable in visual order, has a programmatic accessible name
      QA asserts **by value**, is at least 44 × 44 px at 320 px and 1280 px, and carries the app's focus
      indicator — 2 px outline at 2 px offset resolving to `--ring` (`app/globals.css:234-237`). The
      native input may be visually hidden only if a `<label>` keeps it operable and named. The new
      markup is semantic (`HeaderNav`'s `<div>`-instead-of-`<header>` defect is not copied).
- [ ] 10. **The copy says what actually happens.** The visible label and a one-line description state:
      the accepted types, the size limit, that the image **stays on this device and is never uploaded
      anywhere**, and that it is dimmed behind the interface so text stays readable. No option described
      only by a cosmetic adjective. If a preview ships it composites the image the way the page does
      (same dim, same fit) or it ships no preview at all — QA compares preview pixels against page
      pixels. Copy goes through `antislop-copywriting`.
- [ ] 11. **Rejections and state changes are announced, not just coloured.** An oversize, wrong-type or
      undecodable pick shows a text message naming what was wrong **and** the limit, in a live region,
      and keyboard focus is not lost or moved to the top of the page. A remove control appears only when
      a background is set, and removing returns the page to the plain token ground. Checked/active state
      on this surface survives `forced-colors: active` by something other than font weight — which fixes
      008 R-1 for the gauge group in the same pass and corrects the now-wrong comment at
      `SettingsPanel.tsx:22-25` ("so it holds in greyscale and forced colours": greyscale holds, forced
      colours does not).
- [ ] 12. **`/settings` holds no theme control and no dead control.** `document.querySelectorAll('input[name="theme"]')`
      is empty on `/settings` (009's "one instance ships" rule, preserved). QA enumerates every
      interactive element on the surface and confirms each one acts: no disabled control, no empty
      section, no "coming soon".

### D. Legibility over an arbitrary image — the hard part
- [ ] 13. **The adversarial image set.** Every measurement in this section is taken over a fixed set of
      images **generated procedurally by the test** (no committed asset, nothing licensed, reproducible):
      pure white, pure black, 50 % mid-grey, saturated `--primary` amber, a 1 px black/white checker,
      and a half-white/half-black split. QA lists the set and how each was generated.
- [ ] 14. **The image never composites over text, controls or the eight task swatches** — the same hard
      requirement the paper grain holds (DECISIONS 2026-10-26). It paints behind all content; only the
      page ground shows it. Proven, not assumed: with and without each adversarial background, in both
      themes, the **interior** painted pixels of a task swatch, of a filled control and of a glyph are
      identical (sampling glyph interiors, not anti-aliased edges).
- [ ] 15. **Worst pixel, painted, never arithmetic.** Every ratio in this section is computed from the
      worst sampled pixel in the region, read from a real browser screenshot — not from token values, not
      from the mean composited ground. The 1 px checker is the case that makes a mean lie, and is
      included for exactly that reason. (Provenance: 005 quoted 10.78:1 where painted pixels gave 9.79:1.)
- [ ] 16. **The composited page ground stays inside a measured band, per theme, over the whole set.** QA
      reports the darkest and lightest composited ground pixel for each image in each theme. In light the
      composite is **no darker** than the worst-case grained ground already recorded (the pixel that puts
      `--control-border` at ~3.01:1); in dark it is **no lighter** than that theme's equivalent. Where any
      image pushes the composite outside the band, **every** foreground painted on the page ground is
      re-measured against the actual composited pixel and still meets its floor, and QA lists each.
- [ ] 17. **The floors hold over the set, in both themes.** With each adversarial background active,
      every foreground/ground pair 009 measured against the page ground still meets the floor 009 held it
      to. Three are named because they are the thin ones, and each is measured explicitly: body and
      `mm:ss` text on the page ground **≥ 4.5:1**; `--control-border` on every fill-less control it edges
      — the custom-duration input, the unchecked `/settings` radio cards, the row action buttons, Reset,
      the Stats and Settings buttons — **≥ 3:1**; and the focus indicator's outer edge against the ground
      **≥ 3:1** (the clause narrowed by DECISIONS 2026-10-26 — against the ground, not against its own
      fill). Figures go in a table shaped like 009's.
      - *Corrected 2026-10-26 (orchestrator): this criterion originally listed the **unchecked mode
        chips** among the `--control-border` elements. Wrong — `components/ui/mode-chip.tsx` paints no
        border at all and carries its state in font weight, so the token never touches it. Measure the
        chips' **text** instead.*
      - *Figure corrected again after QA pass 1 (item 3): frontend recorded the chip text at ≥ 11.6:1,
        but that is the body colour `#2b2017`. The chips are `#44403c` unchecked and `#78350f` checked,
        which QA measured at **7.70:1** and **6.75:1** at the worst light pixel under a black image, and
        ≥ 10.40:1 in dark. The 4.5:1 floor holds; the record was simply wrong.*
- [ ] 18. **The timer readout survives the worst case.** At levels 100, 50 and 0, for **both** gauge
      styles (`vessel` and `glyph`), over the white and black adversarial images in both themes, the
      digits measure ≥ 4.5:1 against what they are painted on. The glyph style is the risk: its fill is
      *inside* the accessible text and its solid layer sits on the page ground.
- [ ] 19. **Forced colours and images-off.** Under `emulateMedia({ forcedColors: "active" })`, and
      separately with background images unavailable, the page is legible with a background set: no text
      becomes invisible, no control loses its edge, and nothing is announced that is not painted. **A
      foreground whose legibility depends on the image being there fails.** Each assertion is paired with
      a default-mode equivalent so it cannot pass vacuously.
- [ ] 20. **Four surfaces, two themes, two viewports.** With a background stored: no axe-core violation
      of serious or critical impact on `/`, `/settings`, `/stats` or the task dialog, in light and dark,
      at 320 px and 1280 px. All four are checked even though only `/` paints the image (owner ruling 4),
      because a stored background must not change the other three — and the task dialog opens *over* the
      image, so it is the one place a non-`/` surface meets it. No horizontal page scroll
      (`document.documentElement.scrollWidth <= clientWidth`) anywhere, every control still at least
      44 px in both dimensions, and `/settings` — now a two-group surface — still fits at 320 px.

### E. The ground layer and the grain
- [ ] 21. **The grain survives, and the palette moves in exactly one place.** With a background set,
      `body::before` still renders in both themes and `--grain-ink` / `--grain-opacity` keep their
      values. The diff to `app/globals.css` contains nothing but the ground-layer change, any new token,
      and **`:root`'s `--control-border`, which owner ruling 8 re-points** (see that ruling for the
      measured figures and why): **no** edit to the unlayered `:focus-visible` rule, the `@layer base`
      block, the `@media (prefers-reduced-motion)` block, any `@theme inline` mapping, or any other
      existing token value in `:root` or `.dark`. **`.dark`'s `--control-border` is not touched** — dark
      carries its own value (`#80705d`) and already clears every floor, so the re-point is light-only.
      `components/token-dark.test.ts` passes unchanged. `components/token-foundation.test.ts:85-87` pins
      the old light hex and is **qa's to update** to the new one — it is the only test that needs to
      change for the re-point, and it must still assert the token is defined exactly once per block.
- [ ] 22. **The layer order is stated and asserted.** Implementation Notes name where the image layer
      sits relative to `body::before` (`z-index: -1`) and relative to content; a test asserts content
      paints above both and the two ground layers are in the stated order. The image layer is inert
      (`pointer-events: none`), adds no height, no overflow and no scrollable area at 320 px or 1280 px,
      and does not move when the page scrolls in a way that creates one.
- [ ] 23. **Any new custom property** in `app/globals.css` carries 006 criterion 8's three-part reason
      comment (its role, why no existing token fits) **and ships with both a `:root` and a `.dark` value,
      each with measured figures for every ground it is painted on**, in the shape of `--control-border`
      and `--dialog-edge`.
- [ ] 24. **The first-paint theme assertion is not weakened.** `e2e/dark-theme-control.spec.ts`'s
      criterion 8/48 ground-pixel check — the one reshaped when the grain shipped, which asserts the
      sampled pixel is within a grain tolerance of the correct ground and nearer it than the other
      theme's — passes **unchanged** with no background set, which is the default and every current
      user's state. With a background set, QA **states what that assertion observes and whether it still
      holds**; if an image makes the sampled pixel unrepresentative, QA reports it rather than relaxing
      the assertion, and the fix is the orchestrator's call.

### F. Motion, layout and performance
- [ ] 25. **The image's arrival moves nothing.** The bytes are async, so every load paints the plain
      ground first. Across the arrival, the bounding boxes of the `mm:ss` readout, the mode chips, the
      wordmark and the bottom control cluster are identical, at 320 px and 1280 px; layout shift
      attributable to the arrival is **0**. Nothing reflows, nothing resizes, no scrollbar appears.
- [ ] 26. **No intermediate state that is less legible than either end.** There is never a frame where a
      dimming layer paints with no image behind it, nor one where the image paints with no dim. QA
      samples the ground across the arrival and reports the sequence of states it observed.
- [ ] 27. **The image fills the viewport without distorting.** At 320 px and 1280 px, with a portrait
      source and a landscape source, the image covers the viewport, keeps its aspect ratio, and
      introduces no letterbox band of raw token ground that reads as a rendering bug.
- [ ] 28. **Nothing animates, and nothing loops forever.** No pan, zoom, parallax, slideshow or
      cross-fade under any motion preference; at most a single opacity transition on arrival, suppressed
      under `prefers-reduced-motion: reduce`. After a 1 s settle with the timer **idle**: two frames
      sampled 1 s apart are identical, and zero `requestAnimationFrame` callbacks fire over that second
      (timer running is the positive control). No new `setInterval` or `setTimeout` chain. The image is
      read from storage **once per load**, not once per render, and any object URL or equivalent handle
      is released — QA asserts the live handle count does not grow across repeated `/` ⇄ `/settings`
      navigation.
- [ ] 29. **Nothing leaves the device, and the timer does not notice.** No route handler, no `fetch`, no
      `<form action>`: QA asserts **zero** network requests carrying image data during pick, store,
      reload and remove, and that the whole flow works with the network blocked after load. With a
      maximum-size background set, the `mm:ss` readout still updates every second and the remaining time
      still matches the value derived from the stored end timestamp at three sampled points; the
      persisted timer state (`status`, `endTimestamp`, `pausedRemainingMs`, `runId`) is byte-identical
      across picking, storing and removing a background, with the timer running and again paused.

### G. Assets, guards and gates
- [ ] 30. **No asset ships.** `git status` shows no new binary file anywhere in the repo, nothing under
      `public/`, no sample or default background, no placeholder, and no base64 image literal in source.
      The adversarial set is generated in-test. `docs/DECISIONS.md` gains no provenance entry for an
      asset, and criterion 1's entry says why in one line.
- [ ] 31. **The token guards pass, including the trap in them.** Every file this task adds or changes
      carries zero raw palette utilities and zero colour literals per `components/palette.tokens.test.ts`;
      QA asserts each new file appears in its `FILES` set, that `ALLOWED_RAW_UTILITIES` is still `{}` and
      `ALLOWED_LITERALS` still has its single entry, and proves the guard live by break-and-restore.
      **The trap, named so nobody discovers it in review:** that guard's `INLINE_STYLE_COLOR` regex
      (`palette.tokens.test.ts:53`) flags **any** `style={{ … background … }}`, so handing the image URL
      to an inline style trips it — as does a custom property whose *name* contains `background`. And
      `INLINE_STYLE_EXEMPTION` (lines 72-76) is a single object, not a map, so a second exemption means
      restructuring that test. Either avoid the inline style or land the exemption, with an exact
      expression and a reason, in the same diff.
      `components/TimerGauge.tokens.test.ts`'s "no new time source" guard is extended to every component
      file this task adds, and passes.
- [ ] 32. `npm run lint` (0 errors, warnings no higher than the **21-warning** baseline),
      `npm run typecheck`, `npm run build` (routes still exactly `/`, `/_not-found`, `/settings`,
      `/stats`), `npm run test` (baseline **732** passing) and `npm run test:e2e` all succeed, and every
      existing spec in `e2e/` passes **with no assertion weakened and none removed**. QA states its
      counts and the baselines it compared against, measured on the tree it was handed rather than
      `HEAD`, and lists any changed assertion with its reason. Zero console errors or warnings in both
      themes across the whole flow: load `/`, open `/settings`, pick a background, return, reload,
      start / pause / resume / complete, remove it, reload. No `any`; functional components, named
      exports. New tests cannot pass vacuously — none of the four shapes in the 2026-10-09 DECISIONS
      entry (assertion inside `try`/`catch`, assertion inside `if`/`else`, an observer that may never
      attach, a `toBeVisible()` on something already true), and none with zero assertions.
- [ ] 33. **Break-and-restore (hash-verified) for four criteria**, plus the record. QA breaks the
      implementation, confirms the test fails, and restores it, for: the dangling-reference degradation
      (5), the bytes staying out of `localStorage` (3), legibility over the adversarial set (17), and
      no-layout-shift-on-arrival (25). Implementation Notes record, **before QA starts**: where the bytes
      live and the final preference value shape; `CURRENT_SCHEMA_VERSION` before and after; the accepted
      type set and size limit with their reasons; the layer order; **how QA observes an active
      background** (a named `data-*` attribute, in the shape of `data-gauge-style`); and the measured
      composited-ground band per theme over the adversarial set.

## Files likely touched

**Backend:** `lib/db/database.ts` (a new `.version(n)` block beside the frozen ones, if Dexie),
`lib/db/types.ts`, `lib/db/validation.ts`, a new repository under `lib/db/` shaped like
`task-repository.ts`, `lib/db/index.ts`, `lib/preferences/schema.ts` (field, default, value set or
validator, one `pick` line), `lib/preferences/store.ts` (one `partialize` entry, one setter).
`docs/DECISIONS.md` as a draft for the orchestrator (criterion 1).

**Frontend:** `components/SettingsPanel.tsx` (a second group, plus 008 R-1), a background-control
component under `components/`, a ground-layer component or hook, `app/layout.tsx` only if the layer has
to mount there, `app/globals.css` (the ground layer, and a new token only if a role genuinely has none —
then with both values per criterion 23).

**QA only:** `lib/db/*.test.ts`, `lib/preferences/preferences.test.ts`, `components/*.tokens.test.ts`,
`components/*.test.tsx`, `e2e/**` (a new spec, likely `e2e/uploaded-background.spec.ts`).

**Not touched:** `lib/timer/**`, `lib/stats/**`, `lib/preferences/boot-script.ts`,
`hooks/use-timer-clock.ts`, `hooks/use-hydrate-timer-store.ts`, `widgets/HeaderNav.tsx`,
`components/ThemeControl.tsx`, `components/ThemeSync.tsx`, `components/TimerDisplay.tsx`,
`components/TimerGauge.tsx`, `components/SloshGauge.tsx`, `components/HoldButton.tsx`,
`components/TimerControls.tsx`, `components/ModeSelector.tsx`, `components/CustomDurationInput.tsx`,
`components/Task*.tsx`, `components/Stats*.tsx`, `components/ui/**`, `app/stats/**`, `package.json`.

## Risks
- **The feature and the floor may be in direct conflict, and that is the headline risk.** A dim strong
  enough to hold `--control-border` at 3:1 in light — where it already sits at ~3.01:1 worst case, with
  the grain — may mute the image to the point where it reads as a tint, not a picture. Open question 1
  is the fork; the alternatives (give the fill-less controls a fill when a background is active; or
  re-point `--control-border`) are each a different, larger build.
- **`/` has no opaque surface.** Wordmark, mode chips, `mm:ss`, current-task card
  (`CurrentTaskCard.tsx:6` is `border-none bg-none`) and the control cluster all paint on the page
  ground. "Put the image strictly behind opaque surfaces" is not available without inventing surfaces
  everywhere, which is a redesign, not this task. Criterion 16 is the chosen alternative.
- **Every page-ground figure in the repo goes nominally stale the moment an image is behind it**, the
  same way the grain staled them (DECISIONS 2026-10-26). Criterion 16 re-bounds them once rather than
  pretending they are unaffected.
- **Quota failure is not graceful.** A localStorage write that exceeds quota throws, and the preference
  store writes all keys together — so a too-big image stored the wrong way can take the theme and gauge
  preferences down with it. Criteria 3, 5, 7.
- **Dexie migration is real.** Every existing user has `tasks`, `appMeta` and `sessions` rows on
  version 2. A block added *inside* the frozen version blocks, rather than beside them, is a data-loss
  bug that passes a fresh-browser test. Criterion 6. Also note `DatabaseBlockedError` takes ~5 s to
  reject (DECISIONS 2026-10-09), so a second tab on the old schema is a real, slow failure path.
- **An untrusted file from the user's disk.** SVG is a document, not a bitmap; a corrupt or truncated
  file must fail closed; a renamed `.png` that is not a PNG must be caught from the bytes, not the
  extension. The `accept` attribute is a hint, not a check. Criterion 7.
- **The first frame never has the image** and cannot (Dexie is async, and the boot-script trick is
  exactly what the quota forbids). The failure mode is a visible pop or, worse, a dim that lands before
  its image. Criteria 25, 26; open question 7.
- **Memory and handle leaks.** An object URL created per render, or never revoked, on a page that stays
  open for hours. Criterion 28.
- **The grain and the image both want `body`.** The grain is `body::before` at `z-index: -1`; a second
  layer has to coexist with it without covering content, without being covered by the canvas background,
  and without changing the grain's tokens. Criteria 21, 22.
- **Licensing.** Nothing to license, and that is the risk — it makes it tempting to ship "just one nice
  default image". Criterion 30 forbids it outright.
- **Next.js version.** Per `AGENTS.md`, read the relevant guide in `node_modules/next/dist/docs/` before
  touching `app/layout.tsx` or adding a client boundary; App Router conventions in training data may not
  match this version.
- **antislop.** 005, 006, 007, 008 and 009 all record `during (session override)`, supplied by the owner
  through the orchestrator. Frontend confirms that still holds, announces
  `antislop active: during (session override).` before its first UI edit, and runs the Delivery Gate.
  Criterion 10's copy is copywriting work and goes through `antislop-copywriting`.

## Owner rulings, 2026-10-26 — questions 1-4, 6 and 7 answered, plus rulings 8 and 9
The orchestrator put pm's blocking questions to the owner before backend started. The answers are
binding; the questions are kept below the rulings so the reasoning that produced them is still readable.

1. **Dim the image hard.** Build (a): a themed scrim, strong enough that the composited page ground
   stays inside the band criterion 16 already describes. **No palette change and no control restyle** —
   builds (b) and (c) are refused, so §"Changing the palette" in Scope/Out stands as written and
   `--control-border` is not re-pointed. The accepted consequence, stated plainly: at full dim the image
   reads as a tint of the cream or dark ground, not as a photograph. If the floors cannot be met even at
   full dim, that is a blocker to raise, not a licence to reopen (b) or (c).
2. **Exactly one image.** Cut 1 confirmed. No library, no switching, no naming.
3. **One image, shared by both themes.** Cut 2 confirmed. The scrim is themed; the image is not.
4. **`/` only — overriding pm's assumption of a global layer.** The image paints on the timer page and
   nowhere else. Two consequences the owner accepted: the layer is route-aware rather than a sibling of
   the grain on `body`, and the background is absent on `/settings` and `/stats`, so it **disappears on
   navigation away from `/`** and the control that sets it sits on a surface that never shows it. This
   narrows the measurement surface (criteria 14-18 are `/` plus the task dialog over it), and it is the
   direction pm called the more expensive one to reverse — noted, and chosen anyway.
   - Frontend's call, not re-askable upward: whether a preview on `/settings` is worth it. Default is
     **no preview** — a faithful one would have to reproduce the scrim and the grain to be honest, and a
     dishonest one is worse than none. The filename or a "background set" state is enough.
5. **No dim or opacity slider.** Cut confirmed by silence — not put to the owner, because ruling 1 fixes
   the dim at whatever the floors require, which leaves a slider nothing to vary.
6. **Reject oversize and unsupported files with a message.** No downscaling, no re-encoding. **Backend
   states the cap and the accepted type list** in its DECISIONS entry (criterion 1); the owner holds a
   veto on the number after the fact rather than choosing it now.
7. **The first-frame gap is accepted.** Every load of `/` paints the plain ground before the image
   lands. Not put to the owner as a choice, because the only alternative is a storage home the
   localStorage quota forbids — ruling 1's dim makes the arrival a ground-tint change rather than a
   photograph appearing, which is the mildest form of this that is available. Criterion 25 still pins
   layout shift across the arrival to 0, and criterion 26 still forbids a dim-without-image frame.

8. **`--control-border` is re-pointed in `:root`, from `#88837e` to the value frontend verifies
   (`#7a756f` on the orchestrator's measurements).** Added 2026-10-26, **after** frontend hit the
   blocker ruling 1 created: the grained light page ground measures **3.0005:1** against `#88837e` on
   its darkest painted pixel, so the light floor was fully spent *before* any image existed, and no
   visible dim can hold it — one 8-bit level darker is 2.9728:1. This is the constraint DECISIONS
   recorded on 2026-10-26 ("`--control-border` has no contrast headroom left"); 010 is the first task to
   actually hit it. The owner was given four ways out and chose this one, because it fixes the cause
   rather than this feature's symptom.
   - **This overrides ruling 1's "no palette change" clause, and only that clause.** The scrim still
     dims hard, the fill-less controls are still not restyled (option b stays refused), and the scrim is
     still the page's own `--background` (option d stays refused).
   - **Light only.** `.dark`'s `#80705d` is untouched and keeps its recorded figures.
   - Orchestrator's measurements for `#7a756f`, floor 3.00, to be reproduced by frontend and measured
     independently by qa: grained page ground **3.648**, + black image **3.363**, + 1 px checker
     **3.363** (corrected after QA pass 1 item 2: the orchestrator and frontend both recorded 3.428 from
     the pixel `230,222,213`, but the worst pixel in that region is a dimmed black cell at
     `228,220,211` — the same as the black image, which is exactly why the checker is in the set),
     `--card` **4.179**, `--popover` **4.394**, `--muted` **4.183**, delete-confirm tint
     **3.790**. The thinnest is the black image at 3.363.
   - The two comments at `app/globals.css:65-76` and `:165-167` carry the old **token-level** figures
     (3.44:1 etc.), which DECISIONS' R-2 entry already corrected to ~3.26 painted / ~3.01 worst-case.
     The re-point must leave **painted** figures there, not flat-token ones, so the next task does not
     inherit the same wrong number a third time.

9. **`.dark`'s `--control-border` is lightened too, from `#80705d` to the value frontend verifies
   (`#8a7968` on the orchestrator's measurements).** Added 2026-10-26, resolving **QA FAIL item 1**.
   Ruling 8 improved the light edge, which flipped an existing direction assertion in
   `e2e/dark-sweep.spec.ts:516` — "dark not worse than light" for the disabled custom-duration field.
   **No floor broke** (dark 3.80 against light 4.18), and dark did not get worse; light got better.
   - The owner was offered the cheap fix — convert that assertion to a both-themes floor check and move
     on — and **chose to lighten dark instead**, because it fixes the real thinness rather than the
     test. After ruling 8, dark held the thinnest pair in the whole app: **3.107:1** on the grained
     ground under a white or split image, against a 3.00 floor.
   - Orchestrator's measurements for `#8a7968`, floor 3.00, to be reproduced by frontend and measured
     independently by qa: grained ground under a white image **3.546** (was 3.107), grained ground with
     no image **3.857** (was 3.379), `--card` **4.339**, `--popover` **4.260**, `--muted` **3.997**,
     `--secondary` **3.761**. Light's binding figure is 3.363, so the direction assertion is satisfied
     by the palette rather than by relaxing the test.
   - **The direction assertion in `e2e/dark-sweep.spec.ts` is therefore NOT to be changed.** It must go
     green on the palette alone. If it cannot, that is a blocker to report, not an assertion to soften.
   - Every dark control edge gets slightly lighter. That is the accepted visual cost.

### Orchestrator note on ruling 9's blast radius (for the reviewer)
`.dark`'s `--control-border` and `--dialog-edge` were **both** `#80705d` before ruling 9. Only
`--control-border` moved, so they now diverge (`#8a7968` vs `#80705d`). **That is deliberate, not an
oversight**, and it is recorded here so the reviewer rules on it rather than discovering it:

- They are different roles on different grounds. `--dialog-edge` separates a dialog from the *scrimmed*
  page, and `app/globals.css:95-96` records it at 4.12:1 against that scrim and 3.73:1 against the dialog
  fill — both comfortably clear, and neither is the pair ruling 9 was fixing.
- ~~A background image sits **behind** the dialog scrim, so the scrimmed page under a dialog gets darker
  with an image, not lighter, which moves `--dialog-edge`'s figure the safe way.~~ **Corrected by QA pass 2,
  which painted it instead of reasoning about it: the direction holds for a black image (dark 3.982 → 4.009)
  and is contradicted for white (3.982 → 3.921). The floor holds either way; the claim that an image can
  only move this figure the safe way was wrong.** The task dialog over an
  image is in QA's scope (criterion 20).
- The shared hex was a coincidence of two tokens needing a similar value, not a dependency. Moving
  `--dialog-edge` in sympathy would have been an unmeasured palette change outside the owner's ruling.

### The questions as pm put them
Numbers 1-3 are the ones where a wrong guess costs a rebuild. **1 blocks frontend, not backend** —
backend can decide the storage shape while 1 is answered.

1. **How visible is the image allowed to be, and how far may it spread?** This task says: a single layer
   behind all content on every route, dimmed as far as the floors require. The honest consequence is that
   `--control-border`'s ~3.01:1 worst case in light leaves almost no room, so the dim may be strong
   enough that the image reads as a tint. Three different builds answer this: **(a)** accept a muted
   image; **(b)** give the fill-less controls a fill while a background is active — changes the look of
   the mode chips, the duration input and the settings cards in both themes; **(c)** re-point
   `--control-border` for headroom — a palette change that re-measures everything. Which?
2. **One image, or a small library?** Assumed: exactly one. A library is a different table (ordering,
   names, a chosen-one pointer) and a different surface; retrofitting it later rebuilds both halves.
3. **One image for both themes, or one per theme?** Assumed: one shared, with the themed dim adapting.
   Per-theme doubles the storage shape, the picker and the measurement surface.
4. **Global, or only on `/`?** Assumed global, one layer like the grain. `/`-only is cheaper to measure
   but needs a route-aware layer and makes the background blink off on navigation. Chosen this way round
   because global → `/`-only later is cheap and the reverse costs the whole sweep. Confirmable, not
   blocking.
5. **A dim or opacity slider?** Cut deliberately — a user-adjustable dim multiplies the measurement by
   every value it can take and puts a floor-failing value within reach. If it is wanted, it needs a
   floor-clamped range and its own criteria.
6. **Max size and accepted types** are backend's to state and record (criterion 1), yours to veto.
   Oversize files are rejected with a message rather than downscaled, because downscaling means canvas
   re-encoding and no new dependency is allowed.
7. **Is the first-frame gap acceptable?** The image cannot be on the first painted frame — Dexie is
   async, and the localStorage trick that makes the theme pre-paint is exactly what the quota forbids for
   a photo. So every load shows the plain cream or dark ground for a moment before the image lands.
   Confirm, since the only alternative is a different storage home.
