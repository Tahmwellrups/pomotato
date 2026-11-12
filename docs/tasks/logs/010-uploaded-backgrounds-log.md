# Uploaded backgrounds — a local image behind the app, without breaking legibility — history log

Appended by frontend/backend/qa/reviewer/orchestrator after implementation began.
The task's goal, scope and acceptance criteria are in [../010-uploaded-backgrounds.md](../010-uploaded-backgrounds.md).

## Stopped here — 2026-10-26, owner asked to pause and finalize
State of the task at the pause, so the next session does not re-derive it.

**Done:** backend (data layer), frontend passes 1-3 (layer, control, ruling 8, ruling 9), QA pass 1
(FAIL, four items, all four now resolved — three in this file, one by ruling 9), and the two stale hex
pins QA had already updated before the pause.

**Gates, re-run by the orchestrator on the final tree:**
- `npm run typecheck` — exit 0.
- `npm run test` — **872 passed / 0 failed, 26 files.**
- `npm run lint` — 0 errors, 21 warnings (baseline).
- `npm run build` — succeeds; routes `/`, `/_not-found`, `/settings`, `/stats`.
- `npm run test:e2e` — **not re-run after ruling 9.** The last full run (QA pass 1, before ruling 9) was
  584 passed / 1 failed / 2 skipped of 587, and the one failure was the dark-sweep direction assertion
  that ruling 9 fixed. Frontend then ran 6 specs (196 tests) green, and QA pass 2 confirmed
  `e2e/dark-sweep.spec.ts` at **15/15 green and unedited** before it was stopped. So the suite is
  expected green, but **nobody has observed a full green e2e run on this tree.** That is the one open
  factual gap.

**Not done, in resume order:**
1. **QA pass 2**, stopped mid-run. Its brief: re-measure dark independently (frontend reports the
   thinnest pair moved 3.107 → 3.546), measure `--dialog-edge` against the scrimmed page under an image
   rather than reasoning about it, rule on the **decode-before-paint red-proof that does not
   discriminate end to end** (pass 1 found it green at E9; caught only by the unit break), and re-run the
   full suite. Append a "QA Report, pass 2" section; leave pass 1 intact.
2. **reviewer** — has never run on this task.
3. **Commit.** Nothing in this task is committed. The working tree holds all of 010 plus the two
   `--control-border` re-points.
4. **`docs/PLAN.md`** — tick milestone 4's "Uploaded backgrounds" and the milestone itself once the
   above closes. Milestone 4's other four parts are already done and ticked.

**Fix loops used: 1 of the 3 CLAUDE.md allows.**

## Implementation Notes
(Backend, then frontend. Criterion 33 lists what must be here before qa starts.)

### Backend (landed before any component was touched)

**Storage decision.** The image bytes live in a new Dexie table `backgrounds` (IndexedDB); localStorage holds only a reference. Quota arithmetic: localStorage is ~5 MB per origin, string-encoded, shared with `pomotato-timer`; a data URL costs ~1.33x the file, so a 3 MB photo is ~4 MB of the 5 MB and a 4 MB one does not fit, and a quota throw on write fails the whole `pomotato-preferences` envelope, taking `theme` and `gaugeStyle` with it. IndexedDB has no such per-key cap and stores binary natively. The preference grows by one key holding a ~36-char UUID, about 55 bytes serialised, well under criterion 3's 1 KB.

**Preference value shape.** `Preferences.background: string | null` (`BackgroundPreference`). `null` = no background (the default). A string is the `id` of the single row in `backgrounds`. Validated by `isBackgroundId` (non-empty, <= 64 chars, `[A-Za-z0-9-]`); anything else sanitises to `null` per key. `PREFERENCES_VERSION` stays **1**: no existing key changed meaning, and a v1 payload `{"state":{"theme":"dark","gaugeStyle":"glyph"},"version":1}` keeps both keys and gains `background: null` (persist writes the sanitised payload back). No display settings exist (no slider, fixed fit), so none are stored. Recipe followed in `lib/preferences/schema.ts` (field, default, one `pick`-style line, validator in place of a value set, `isPreferences` line) and `store.ts` (one `partialize` entry, one setter). `PREFERENCE_VALUES` is now typed over the two enum keys only.

**Schema.** `CURRENT_SCHEMA_VERSION` 2 -> **3**. `.version(1)` untouched; the former `.version(CURRENT_SCHEMA_VERSION)` block became a literal `.version(2)` with identical stores string (same bytes otherwise), and a new `.version(3).stores({ backgrounds: "id" })` sits beside them. No `.upgrade()` callback, no existing table restated. Table typed `EntityTable<BackgroundRecord, "id">`.

**Row.** `BackgroundRecord { id, mimeType, bytes: ArrayBuffer, fileName, size, storedAt }`. Bytes are an `ArrayBuffer` rather than a `Blob` so they can be re-validated on read and to avoid Blob-in-IndexedDB quirks. At most one row ever.

**Cap and types (owner holds a veto).** Max **5 MiB (5,242,880 bytes)**; reason: covers a typical phone JPEG, and because nothing is downscaled the cap is the only bound on how much the browser must hold and decode. Accepted: **PNG, JPEG, WebP**, still only, decided from the bytes (magic numbers), never the filename or declared MIME. Excluded: **SVG** (a script-capable XML document, not a bitmap: the browser would parse and lay it out rather than decode pixels, it cannot be checked by signature or bounded in decode cost, and its appearance can depend on external references and fonts), **GIF** (animation, criterion 24), **APNG and animated WebP** (detected and rejected: `acTL` chunk, VP8X animation flag), AVIF/HEIC (uneven browser support). Also rejected: empty files and truncated files (PNG without `IEND`, JPEG without a trailing `FFD9`, WebP shorter than its RIFF size). This is a structural check, not a decode; see "frontend must" below.

**API (all from `@/lib/db`).**
- `storeBackground(file: Blob & { name?: string }): Promise<StoreBackgroundResult>` where `StoreBackgroundResult = { ok: true; background: BackgroundInfo } | { ok: false; issue: BackgroundValidationIssue }`. Size is checked before the file is read. A rejection writes nothing. Success replaces the previous row atomically (one transaction, exactly one row after). Rejects (throws) only on storage failure: `DatabaseUnavailableError`, `DatabaseBlockedError` (takes ~5 s), or Dexie's own.
- `removeBackground(): Promise<void>`. Idempotent.
- `loadBackground(id: string | null): Promise<LoadBackgroundResult>`, never rejects: `{ status: "found", background: LoadedBackground }` (info plus a `Blob` with the right `type`), `{ status: "missing" }` (null/malformed id, no row, different id, bytes no longer valid), `{ status: "unavailable" }` (IndexedDB absent, blocked, or any Dexie failure).
- `BackgroundValidationIssue { code: "empty" | "too-large" | "unsupported-type" | "animated" | "corrupt"; message: string }`. `message` is complete user-facing text and names the limit when one applies; the frontend may show it verbatim or switch on `code`.
- Constants for copy and the picker: `BACKGROUND_MAX_BYTES`, `BACKGROUND_MAX_MEGABYTES_LABEL` ("5 MB"), `BACKGROUND_TYPES_LABEL` ("PNG, JPEG or WebP"), `BACKGROUND_ACCEPT_ATTRIBUTE` (`image/png,image/jpeg,image/webp`), `BACKGROUND_ACCEPTED_TYPES`.
- Preferences: `usePreferencesStore().background`, `.setBackground(id | null)`, `isBackgroundId`.

**Frontend must (not otherwise stated in this file).**
1. Pick flow: `storeBackground(file)`; on `ok`, `setBackground(result.background.id)`; on `!ok`, show `issue.message` and touch nothing. Remove flow: `removeBackground()` then `setBackground(null)`. The two writes are not one transaction; a crash between them leaves an orphan row or a dangling id, both of which degrade to no background.
2. Gate the read on `hasHydrated` (skipHydration), call `loadBackground(background)` once per change of the id, and treat `missing` and `unavailable` identically: no background, no dim layer. On `missing` with a non-null id you may `setBackground(null)` to heal; do not do that on `unavailable` (a blocked upgrade is transient and the row is fine).
3. Structure is checked, pixels are not. A file that passes can still fail to decode. Decode it (an `Image` `onerror`/`decode()`) before committing the dim layer, and on failure paint nothing. Never show the dim without the image (criterion 26).
4. Object URL: create from `found.background.blob`, revoke on id change and unmount.
5. Preferences are not synced across tabs by zustand persist; a second tab sees a change on reload (criterion 8's "visible to a second tab" is a reload read, unless frontend adds a `storage` listener).
6. `loadBackground` is the only reader; do not open `db.backgrounds` from components.

**Existing tests that now fail, for qa (backend does not edit tests).** Adding the `background` key makes every exact-equality assertion on a whole `Preferences` object or the whole persisted `state` fail (41 tests in `lib/preferences/preferences.test.ts` and `lib/preferences/gauge-style.test.ts`; expected value needs `background: null`). This is the same fallout 008 had when `gaugeStyle` arrived, and is the intended "gains the background default". `boot-script.test.ts`, `task-repository.test.ts` and `session-repository.test.ts` pass untouched. New tests added: `lib/db/background-repository.test.ts` and a `task 010` block at the end of `lib/preferences/preferences.test.ts`.

**Still for frontend to fill in (criterion 33):** the layer order, the `data-*` attribute QA observes, and the composited-ground band.

### Frontend (antislop: during, session override)

**BLOCKER for the owner: the light-theme floor cannot be met by any visible dim.** Ruling 1 says to report this instead of working around it. The tree is left at scrim 97% (below) and is **not shippable in light** until the owner rules. Dark passes.

The cause is that the light ground has no headroom before any image is involved. Painted worst pixel of the plain grained ground (no background, 1280 px, left and right margin strips, real screenshot): `[236,229,218]`, which puts `--control-border` at **3.000:1**. Any layer that makes that pixel darker by one 8-bit level fails the 3:1 floor (criterion 17), and the scrim is `--background` blended over the image, so a dark image darkens it by `(1 - alpha) * (ground - image)`.

Painted worst-pixel `--control-border` ratio on the binding side (light: darkest pixel; dark: lightest pixel), by scrim alpha. Floor 3.00. "Image share" is `1 - alpha`, the most the image can move a channel.

| Image | none | 0.96 | 0.97 (tree) | 0.99 | 0.998 |
|---|---|---|---|---|---|
| light white | 3.000 | 2.977 | 2.977 | 2.975 | 2.975 |
| light black | 3.000 | 2.734 | 2.766 | 2.893 | 2.947 |
| light 1 px checker | 3.000 | 2.766 | 2.819 | 2.893 | 2.947 |
| dark white | 3.379 | 3.028 | 3.107 | 3.269 | 3.349 |
| dark black | 3.379 | 3.429 | 3.427 | 3.389 | 3.389 |
| dark 1 px checker | 3.379 | 3.068 | 3.147 | 3.309 | 3.352 |

Two things to read off it. (1) Light black never reaches 3.00 below an image share under about 0.25%, which is less than half an 8-bit level, so the image is gone. (2) Even **white** in light misses by 0.025 at every alpha, which is 1-level rounding in the scrim's colour path on a ground that sits exactly on the floor; no alpha fixes that either. Dark is fine from about 0.96 up: at 0.97 the worst is 3.107.

Body and `mm:ss` text are not the problem: foreground `#2b2017` on the darkest painted ground is 11.6:1 (light, black image, 0.97: 11.71) and `#f5ebdc` on the lightest is 12.3:1 (dark, white image: 12.59). The only pair that fails is `--control-border`.

Options for the owner (none taken by frontend): (b) give the fill-less controls a fill while a background is active; (c) re-point `--control-border` in `:root` to buy headroom (the entry in DECISIONS 2026-10-26 says it has 0.3 points; it measures 3.000 painted, so headroom is gone); (d) a scrim colour lighter than `--background` in light, which holds the floor at about 98.5% scrim but turns the cream page near-white for every image, which is a palette change by another route; (e) light theme shows no image. The dim is one class, `bg-background/97` in `components/BackgroundLayer.tsx`, so any of these is a small edit.

**What was built.**
- `hooks/use-background-image.ts`: `useBackgroundImage()` returns an object URL or `null`. Gated on `hasHydrated`; calls `loadBackground(id)` once per change of the id; `found` only; creates the URL, decodes it (`lib/image-decode.ts`), and only then returns it, so there is never a dim without an image (26). Revokes the URL on id change, on unmount and on decode failure. `missing` and `unavailable` both return `null`.
- `components/BackgroundLayer.tsx`: the layer, mounted by `app/page.tsx` only, so it unmounts on leaving `/` (ruling 4). No `app/layout.tsx` change.
- `components/BackgroundControl.tsx`: the `/settings` group. `components/SettingsPanel.tsx` mounts it after the gauge group.
- `lib/image-decode.ts`: `canDecodeImage(url)` and `canDecodeFile(blob)`, never reject.
- `components/SettingsPanel.tsx`: 008 R-1 fixed (`peer-checked:forced-colors:border-[3px]` with padding reduced by 2 px so the card does not move) and the comment at lines 22-25 corrected.
- `app/globals.css`: **no diff.** No new token (21, 23).

**Layer order (22), back to front:** canvas (`--background`, propagated from `body`) < the layer's `<img>` < the layer's scrim < `body::before` grain (z -1) < all content. The layer is `position: fixed; inset: 0; z-index: -20; pointer-events: none; aria-hidden`, a sibling of `<main>` inside `<body>`. It sits at -20 so the grain stays on top at -1. Measured computed styles: position fixed, z -20, pointer-events none, `object-fit: cover`, image box = viewport (1280x700 and 320x700), grain z -1, `elementFromPoint` at the centre is content, not the layer. The scrim is `bg-background/97`, i.e. the page's own token, so it is themed with no new token. Image and scrim fade as one group (`transition-opacity`, `motion-reduce:transition-none`), so every intermediate frame is a blend of two grounds that are each in band. `forced-colors:hidden` removes the whole layer under forced colours, and an image that fails to load never leaves `opacity-0`, so the page is the plain ground in both cases.

**How QA observes an active background (33):** `[data-background]` on the layer. Absent when there is no background or it will not decode; `data-background="pending"` while mounted but not yet loaded (opacity 0); `data-background="active"` once the `<img>` fires `load` (opacity 1 after the 500 ms fade; wait for the fade before sampling pixels). Gauge-style shape.

**No inline style, no palette guard exemption.** The image is an `<img>` with `object-cover`, not a CSS background, so `palette.tokens.test.ts` needed nothing. Trap found on the way: a **comment** containing `style={{ background` trips `INLINE_STYLE_COLOR`, because the regex scans source text; the comment now says "inline background". `palette.tokens.test.ts` passes untouched. One `eslint-disable-next-line @next/next/no-img-element` with a reason (a `blob:` URL has nothing for `next/image` to optimise); warnings stay at 21.

**Composited-ground band per theme (my numbers, 1280 x 800, strips x 0-40 and x W-50..W-20, y 0..H-140, scrim 0.97; qa measures independently).** Darkest / lightest painted ground pixel:

| Image | light darkest | light lightest | dark darkest | dark lightest |
|---|---|---|---|---|
| none | 236,229,218 | 251,244,234 | 28,20,14 | 40,31,25 |
| white | 235,228,219 | 251,244,235 | 35,27,22 | 46,38,32 |
| black | 228,220,211 | 243,236,227 | 27,19,14 | 38,30,25 |
| grey 50% | n/a at 0.97 | n/a | n/a | n/a |
| checker | 230,222,213 | 250,243,234 | 27,19,14 | 45,37,31 |

(Grey, amber and split were measured at 0.96 only: light darkest 230,223,214 / 232,221,210 / 226,219,210, ratio 2.84 / 2.81 / 2.73; dark lightest 43,35,29 / 48,37,27 / 48,40,33, ratio 3.23 / 3.13 / 3.03.) Light is outside the band (darker than the plain-ground worst pixel) for every dark image; dark is inside it for white from alpha 0.96. Per criterion 16 each foreground on the page ground should be re-measured where outside: I measured text only (11.6:1 and up); the fill-less control edges are the failing pair above.

**Cross-tab (backend caveat 4): no `storage` listener, a second tab sees changes on reload.** A listener would have to `rehydrate()` the whole preferences store, which also live-syncs theme and gauge across tabs, a behaviour change outside this task and into `ThemeSync`'s territory, or hand-parse the `pomotato-preferences` envelope, which is a second reader of the format (criterion 4). And I deliberately **do not heal `missing`** (backend caveat 2 says I may): tab A holding an old id would, on its next visit to `/`, see `missing` because tab B replaced the row, and `setBackground(null)` would write `null` over B's valid choice. A dangling id costs one IndexedDB read per visit to `/` and nothing else.

**Pick flow (11).** `findProblem` runs before anything is written: size, then magic-number type (both from `@/lib/db`, so the messages name the limit), then a real decode of the file. Only then `storeBackground`, then `setBackground(id)`. So an undecodable file (valid structure, bad pixels) is rejected with "That file could not be read as an image..." and the previous background is untouched. Messages go to one always-mounted `role="status"` line; errors use `text-destructive` and also name the problem in words. The input is cleared after each pick so the same file can be chosen again. Remove: `removeBackground()`, `setBackground(null)`, then focus moves to the file input because the Remove button unmounts. The picker label reads "Choose an image" or "Choose a different image". The remove button renders only when `hasHydrated && background !== null`.

**No preview on `/settings`** (orchestrator's call; I agree with it). One consequence to know: the "background is set" line is the preference, not a read of the row, so a dangling id says "A background image is set." until it is removed. Remove is idempotent and clears it.

**Verified by hand (Playwright against `next dev`, light and dark where noted, 1280 and 320 px).** Picker is 143.75 x 44 px, Tab reaches it, focus ring settles to 2 px solid at 2 px offset in `rgb(180, 83, 9)` (`--ring`; reading mid-`transition-colors` shows the 50% base-layer colour, same as the radios); accessible name resolves via `getByLabel("Choose an image")`; no horizontal overflow on `/` or `/settings`; no `input[name=theme]` on `/settings`; rejections shown: text file named .png ("That file type is not supported. Use a still PNG, JPEG or WebP image."), 6 MB file ("That image is too large. The limit is 5 MB."), SVG, and a junk JPEG that passes structure ("could not be read as an image"); focus stayed on the input after each; the preferences envelope holds only the UUID; bounding boxes of `h1`, fieldset and buttons identical before and after arrival (0 shift); layer absent on `/settings`; client navigation `/` to `/settings` and back created 1 and revoked 1 object URL; forced-colours layer `display: none`; remove clears the preference to `null`, returns the plain ground and focus lands on the input. Zero console errors or warnings across all of it. A forced-colours screenshot at 320 px shows the checked gauge card with a visibly thicker border than the unchecked one.

**Not verified by me, for qa:** the task dialog over an image, axe on the four surfaces, the gauge-level matrix (18), the `requestAnimationFrame` count (28), the maximum-size timer-state invariance (29), the dark-theme first-paint spec with a background set, and the e2e suite. The fade (500 ms) is the only motion.

**Gates (frontend tree):** `npm run typecheck` clean; `npm run lint` 0 errors, 21 warnings (baseline); `npm run build` succeeds, routes exactly `/`, `/_not-found`, `/settings`, `/stats`; `npm run test` 747 passing, 41 failing, all in `lib/preferences/preferences.test.ts` (18) and `lib/preferences/gauge-style.test.ts` (23), backend's migration fallout, untouched. `git diff --stat` is empty for `lib/timer/`, `lib/stats/`, the two timer hooks, `boot-script.ts`, `package.json`, `package-lock.json` and `app/globals.css`. No new dependency, no `lucide-react` import, no image file added.

### Frontend, second pass: owner ruling 8 (light `--control-border` re-pointed)

**Landed:** `app/globals.css` `:root` `--control-border` `#88837e` -> **`#7a756f`**. Reproduced rather than taken on trust: of the candidates I computed (`#7f7a74`, `#7a756f`, `#777169`, `#747068`) `#7a756f` is the lightest that clears every painted ground with at least 0.3 points to spare (`#7f7a74` clears too, but its worst, the black image, is 3.13 which leaves only 0.13). `.dark`'s `#80705d` unchanged (value diff empty). Scrim unchanged at `bg-background/97`: with the token moved, light holds at every image I tried, dark's worst (3.107) is unchanged by the token, so no alpha change is justified.

**Painted figures, light, `#7a756f` (floor 3.00).** Real 1280x800 screenshots, strips x 0-40 and W-50..W-20, y 0..H-140, scrim 0.97:

| Ground | Darkest painted pixel | Ratio |
|---|---|---|
| `--background`, grained, no image | 236,229,218 | 3.648 |
| + white image | 235,228,219 | 3.619 |
| + black image | 228,220,211 | 3.363 (thinnest) |
| + grey 50% | 231,224,215 | 3.486 |
| + amber | 233,222,211 | 3.445 |
| + 1 px checker | 230,222,213 | 3.428 — *superseded: the worst painted pixel is `228,220,211` at **3.363**, see QA item 2* |
| + split white/black | 228,220,211 | 3.363 |
| `--card` (flat, opaque) | 251,244,234 | 4.179 |
| `--popover` (flat, opaque) | 255,250,243 | 4.394 |
| `--muted` (flat, opaque) | 245,245,244 | 4.183 |
| delete-confirm tint (flat) | 247,231,222 | 3.790 |

Only `--background` is grained, so only it has a worst pixel; the other four are the same at every pixel. Matches the orchestrator's figures to the third decimal. Text on the darkest light ground: 11.71:1 (black image), 12.7:1 none.

**Dark, token untouched.** Lightest painted pixel, `#80705d`: none 40,31,25 = 3.379; white 46,38,32 = **3.107**; black 3.427; grey 3.267; amber 3.201; checker 3.147; split 3.107. Flat: `--card` 3.801, `--popover` 3.731, `--muted` 3.501, tint 3.484 (`--secondary` 3.295). All identical to the pre-ruling run, as expected. The earlier comment's "3.80 on --background" was a flat-token figure; painted it is 3.379.

**Criterion 17 control-edge sweep, rerun** with the new token (real screenshots; edge pixel of each `--control-border` element's left border against the ground 6 px outside, and 6 px inside where the control is fill-less; `/` with the Custom mode selected so the duration input renders, plus `/settings`; images none, white, black, 1 px checker, split; both themes, 1280 px). Lowest ratio per cell:

| Surface | light | dark |
|---|---|---|
| `/` (custom-duration input, Reset, Stats and Settings buttons) | 3.421 (black, split) to 3.674 | 3.147 (white) to 3.466 |
| `/settings` (unchecked radio cards, picker, Remove) | 3.708 | 3.431 |

Edge pixels read exactly `122,117,111` (light) and `128,112,93` (dark), so the token is what paints. Nothing under 3.00 anywhere. Note for the criterion text: the timer's mode chips have **no border** (`components/ui/mode-chip.tsx`, weight carries the state), so they are not a `--control-border` element; the pair that applies to them is their text, measured earlier at 11.6:1 and up. The 320 px viewport has the same ground pixels (the layer is fixed), so I did not repeat the sweep there.

**Comments rewritten** at `:root` and `.dark` `--control-border` with painted figures, naming the grained pixel each was taken on. 006 criterion 8's three parts are still there (role, why not `--border`, the figures). I kept the sentence "The .dark value carries its own five figures." on one line because `components/token-foundation.test.ts` regex-matches it.

**DECISIONS** 2026-10-26 `--control-border` entry amended in place, not deleted; its "How to apply" is revised (dark is now the constraint).

**Gates.** `npm run typecheck` clean; `npm run lint` 0 errors, 21 warnings (baseline); `npm run build` succeeds, routes `/`, `/_not-found`, `/settings`, `/stats`; `npm run test` 746 pass, 42 fail: the 41 stale preference tests (qa's, backend fallout) plus one new: `components/token-foundation.test.ts` "defines --control-border once in :root (#88837e) and once in .dark (#80705d)". `token-dark.test.ts` and `palette.tokens.test.ts` pass untouched. `package.json` and `package-lock.json` diffs empty; `lib/timer/` and `lib/stats/` diffs empty.

**Required qa change (not made by me):** `components/token-foundation.test.ts` lines 85-87. Change the expected array to `["--control-border: #7a756f;", "--control-border: #80705d;"]` and the test name's `(#88837e)` to `(#7a756f)`. It must keep `toEqual` over `css().match(/--control-border:\s*[^;]+;/g)`, which asserts one declaration per block. The adjacent comment test ("carries the role...five-ground dark figures") passes as is.

### Frontend, third pass: owner ruling 9 (dark `--control-border` re-pointed)

**Landed:** `app/globals.css` `.dark` `--control-border` `#80705d` -> **`#8a7968`**. Orchestrator's value reproduced on real screenshots, so I kept it rather than searching for a neighbour. `:root` is untouched: its `--control-border: #7a756f` line and comment are unchanged, and the light figures below reproduce pass 2 to the third decimal. `--dialog-edge` is its own token (also `#80705d`) and I left it; ruling 9 names only `--control-border`. The `.dark` token comment is rewritten with painted figures and names the worst pixel (46,38,32).

**Painted figures, dark, `#8a7968` (floor 3.00).** Real 1280x800 screenshots, same strips and scrim (0.97) as pass 2. Method note: the worst pixel in dark is the lightest, and it is taken per image, not assumed from the plain ground.

| Ground | Lightest painted pixel | Ratio (was) |
|---|---|---|
| `--background`, grained, no image | 40,31,25 | 3.857 (3.379) |
| + white image | 46,38,32 | **3.546** (3.107) |
| + black image | 38,30,25 | 3.912 (3.427) |
| + grey 50% | 42,34,29 | 3.729 (3.267) |
| + amber | 46,35,27 | 3.655 (3.201) |
| + 1 px checker | 45,37,31 | 3.593 (3.147) |
| + split white/black | 46,38,32 | 3.546 (3.107) |
| `--card` (flat) | 28,20,14 | 4.339 (3.801) |
| `--popover` (flat) | 30,22,16 | 4.260 (3.731) |
| `--muted` (flat) | 37,28,20 | 3.997 (3.501) |
| `--secondary`, under the Stats button (flat) | 43,33,24 | 3.761 (3.295) |
| delete-confirm tint (flat, `color-mix(destructive 6%, card)`) | 41,27,20 | 3.977 (3.484) |

The thinnest dark pair is now 3.546 (white or split image); the thinnest light pair is 3.363 (black or split). Dark is above light, so the direction holds by 0.18 on the palette. The flat tint reading comes from Chromium's resolved `color(srgb ...)` rounded to 8 bit, not a screenshot crop; every other row is from a screenshot or an opaque computed fill.

**Criterion 17 edge sweep, dark, rerun** (edge pixel of each `--control-border` element's left border against the ground 6 px outside, and 6 px inside where fill-less; `/` with Custom selected, plus `/settings`; edge pixels read exactly `138,121,104`). Lowest ratio per image: `/`: none 3.905, white **3.593**, black 3.957, checker 3.778, split 3.732. `/settings`: none 3.948, white 3.917, black 3.917, checker 3.917, split 3.917. Previously the dark range was 3.147 to 3.466 on `/` and 3.431 on `/settings`. Light sweep rerun for the record, unchanged: `/` 3.421 (black, split) to 3.674, `/settings` 3.708. Nothing under 3.00.

**Dark-sweep spec.** `npx playwright test e2e/dark-sweep.spec.ts -g "disabled custom field"` passes (1 passed), file unedited.

**Other specs.** Ran `dark-sweep`, `dark-contrast`, `token-task-surface`, `uploaded-background-legibility`, `dark-native-ui`, `settings-gauge-style` in full: 196 passed. Nothing else's figures shifted enough to fail.

**Gates.** `npm run typecheck` clean; `npm run lint` 0 errors, 21 warnings (baseline); `npm run build` succeeds (`/`, `/_not-found`, `/settings`, `/stats`); `npm run test` 870 pass, 2 fail, both qa-owned pins of the old dark hex. `package.json` and `package-lock.json` diffs empty.

**Required qa change (not made by me), two unit tests pin the old dark value:**
1. `components/token-foundation.test.ts:85-87`: expected array should be `["--control-border: #7a756f;", "--control-border: #8a7968;"]`, and the test name's `(#80705d)` should be `(#8a7968)`.
2. `components/background.guards.test.ts:118-125`: "the only changed value in :root or .dark is --control-border, and it is the light one" now sees two changed lines. Expected `changed` becomes `["--control-border=#7a756f", "--control-border=#8a7968"]`, `removed` becomes `["--control-border=#88837e", "--control-border=#80705d"]`, and the test name should say both.

**DECISIONS** 2026-10-26 `--control-border` entry amended again: ruling 9 added, "How to apply" rewritten (neither theme is the constraint; headroom light 0.36, dark 0.55).

## QA Report
Run on 2026-10-26 against the tree as handed over, with qa's test edits. Measured by qa; the figures are not copied from frontend.

- Verdict: **FAIL**

Why FAIL, in four items. Each one is repro'd below and none is a product floor failing.

1. **Criterion 32, e2e not fully green.** `e2e/dark-sweep.spec.ts` ("disabled custom field (running), disabled submit, and the three task-form fields with the disabled a…") fails with `custom field (running) edge vs page: dark 3.80:1 is worse than light 4.18:1`. That spec asserts `dark >= light - 0.005` on every control edge ("Not worse than light"). Owner ruling 8 re-pointed light `--control-border` to `#7a756f`, so light now measures better than dark and the direction flipped. The 3:1 floor holds (dark 3.80:1). qa did not rewrite the assertion, because turning a direction check into a floor check is a weakening. **Needs an owner ruling**: retire the direction check (floor only) or keep it and re-point the dark edge.
   - Repro: `npx playwright test e2e/dark-sweep.spec.ts -g "disabled custom field"`. Expected: pass. Actual: the message above.
2. **Criterion 15, recorded figure is wrong.** The Implementation Notes give the 1 px checker, light, as 3.428:1 (`230,222,213`). The worst painted pixel in the same region is `228,220,211`, a dimmed black cell, which gives **3.363:1** against `#7a756f`. The floor holds. Correct the record, not the product.
   - Repro: `node` WCAG check of `#7a756f` against `228,220,211` and `230,222,213`; the in-browser scan of the checker strip (x 0-40, y 0-600) returns `228,220,211` as its darkest pixel.
3. **Criterion 17, recorded figure is wrong.** The Implementation Notes and the criterion's own correction say the mode chips' text measures at 11.6:1. That was the body colour (`#2b2017`). The chip text is `#44403c` (unchecked) and `#78350f` (checked). Measured at the worst light pixel under the black image: **unchecked 7.70:1, checked 6.75:1**. Dark chips measure 10.40:1 and up. The 4.5:1 floor holds.
4. **Criterion 6, literal wording not met (behaviour holds).** The clause "the `.version(1)` and `.version(2)` blocks are byte-identical in the diff" is not literally true: the `.version(2)` header line changed from `this.version(CURRENT_SCHEMA_VERSION)` to `this.version(2)` (`lib/db/database.ts:50`). The stores string is identical, and seeded v2 rows survive the upgrade (`lib/db/background-migration.test.ts`). The change is forced, since the constant now means 3. The orchestrator should accept the wording or amend the criterion.

### Gates (final tree)
| Gate | Result |
|---|---|
| `npm run typecheck` | exit 0 |
| `npm run lint` | 0 errors, **21 warnings** (baseline 21) |
| `npm run test` (Vitest) | **872 passed / 872**, 26 files. Hand-over was 746 pass / 42 fail, red only in the 41 stale preference assertions and `token-foundation.test.ts:85-87`; all now updated. |
| `npm run build` | `Compiled successfully`; routes exactly `/`, `/_not-found`, `/settings`, `/stats` |
| `npx playwright test` (the `test:e2e` script), 4 workers | **584 passed, 1 failed, 2 skipped** of 587. The failure is item 1 above. The 2 skips are pre-existing `test.skip` calls in `task-list-dialog.spec.ts`. |

Per-file e2e counts for the new and touched specs: `uploaded-background.spec.ts` 16/16, `uploaded-background-layer.spec.ts` 17/17, `uploaded-background-legibility.spec.ts` 18/18, `dark-theme-control.spec.ts` 41/41, `settings-gauge-style.spec.ts` 93/93, `dark-sweep.spec.ts` 14/15.

### Criteria
| # | Verdict | Evidence |
|---|---|---|
| 1 | PASS | DECISIONS 2026-10-26 entry present, with type set, cap, SVG reason, and the no-provenance line. `PREFERENCES_VERSION` = **1**, `CURRENT_SCHEMA_VERSION` = **3** (was 2). |
| 2 | PASS | Empty diff vs HEAD for `lib/timer`, `lib/stats`, both timer hooks, `boot-script.ts` and its test, `package.json`, `package-lock.json` (guard in `components/background.guards.test.ts`). No `lucide-react` import. |
| 3 | PASS | Storage: `pomotato-preferences` is the only `pomotato*` key. Entry 79 B before, 113 B after a pick: **growth 34 B**. No `data:`, `base64`, `blob:` or PNG magic in it. Keys: `background`, `gaugeStyle`, `theme`. Version 1. |
| 4 | PASS | One preference system. One storage key, one `PREFERENCES_VERSION`. `PREFERENCES_VERSION` unchanged. |
| 5 | PASS | Table-driven: `hooks/use-background-image.test.tsx` (no ref, not hydrated, missing, unavailable, undecodable, non-string, persisted payloads: object, bad id, newer and older version, non-object, unparseable). `lib/db/background-degrade.test.ts` (Unavailable, Blocked, bare error). Every case keeps `theme` and `gaugeStyle`. The shipped literal keeps both keys and gains `background: null`. |
| 6 | PASS on behaviour, **literal wording not met** | See item 4. Seeded v2 `tasks`, `appMeta`, `sessions` re-read unchanged at v3 (`lib/db/background-migration.test.ts`). Frozen v1 and v2 stores strings unchanged. `task-repository` and `session-repository` tests unchanged and passing. |
| 7 | PASS | Validation in `lib/db/background-validation.ts`, typed issues. Type from bytes: renamed text, renamed SVG, junk JPEG (passes structure, fails decode in the picker) are all refused. Row count and reference unchanged after each (e2e `criterion 7 and 11` rejections, 5/5 pass). |
| 8 | PASS | Row counts read from IndexedDB (`backgroundRowCount`). Replace leaves 1 row and a new id. Remove leaves 0 rows and `background: null`. Both survive reload; a second page in the same context shows the active layer after reload. |
| 9 | PASS | `fieldset` > `legend` "Background image"; real `input[type=file]`, `accept` = the three types, named by its label, described by the copy. Tab reaches it in DOM order after the gauge radios. Label box 44x44+ at 320 and 1280. Focus ring: `solid`, `2px`, offset `2px`, `rgb(180, 83, 9)` (`--ring`). |
| 10 | PASS | Copy names PNG/JPEG/WebP, 5 MB, "stays on this device and is never uploaded anywhere", "dimmed". No preview `img` in the control. |
| 11 | PASS | Rejections in `role=status` naming the limit; focus stays on the picker (asserted after each reject). Remove only when set; removal returns to plain ground. Forced colours: checked card border **3px**, unchecked **1px** (008 R-1 fixed, comment corrected). |
| 12 | PASS | `input[name="theme"]` count 0 on `/settings`. Interactive list: back link, 2 radios, file input, Remove button. None disabled, all named. |
| 13 | PASS | Six images generated in-test (`e2e/helpers/background.ts`, Node `zlib` PNG encoder): white, black, grey 50%, amber `#b45309`, 1 px checker, split white/black. Nothing committed; the guard asserts no image in git or `public/`. |
| 14 | PASS | Interiors with vs without each image, both themes: primary fill 1514 px, swatch 336 px, glyph ink 7476 px, **0 mismatches** for white, black, checker. Swatch measured inside the open task dialog (the current-task card renders no swatch). |
| 15 | **FAIL (record)** | Worst-pixel method, from screenshots, checker included. Product floors hold. The recorded 1 px checker figure (3.428) is wrong; worst is **3.363**. See item 2. |
| 16 | PASS | Darkest and lightest composited ground per image and theme reported (table below). Light: every image is darker than the grained plain pixel by up to 8 levels, so every image is outside the band and every foreground was re-measured (all pass). Dark: white, grey, amber, checker, split are lighter than the plain pixel; black is inside. |
| 17 | PASS on the floors, **FAIL (record)** on the chip figure | Body/readout >= 4.5 (vessel readout 4.68 dark, 4.99 light). Control edges >= 3 (min 3.107 dark, 3.363 light). Focus >= 3 (min 3.800 light, 7.398 dark). Wordmark is 36 px bold, large text, >= 3 (min 3.70). Chip text record is wrong: see item 3. |
| 18 | PASS | Vessel and glyph at levels 100, 50, 0 (read back from `data-gauge-level`, all within 3 of target), over white and black, both themes. Minimum digit ratio **4.681** (vessel, dark), glyph min 5.623. Glyph ratio is level-invariant by construction: both ink tokens are measured. |
| 19 | PASS | Forced colours: layer `display: none` (default `block`). Readout `rgb(0,0,0)` on canvas. Images-off (IndexedDB removed): no layer, and the margin pixels match the no-background page exactly. |
| 20 | PASS (scope note) | axe-core, serious/critical: **none** on `/`, `/settings`, `/stats` and the task dialog over the image, light and dark, 320 and 1280. No horizontal scroll. Tap targets >= 44 px at 320 on `/` and `/settings` (empty list). 1280 tap sizes were not re-run for this criterion. |
| 21 | PASS | `body::before` identical with and without a background (`background-color`, `opacity`, mask, z -1). `--grain-ink` and `--grain-opacity` unchanged. Declared custom-property names identical to HEAD; only changed value is `:root --control-border` (light). `token-dark.test.ts` passes. |
| 22 | PASS (scroll not exercised) | Layer `position: fixed; z-index: -20; pointer-events: none; aria-hidden`; box equals the viewport at 320x720 and 1280x800; grain at -1; centre hit-test is content. The scroll-stability clause was not exercised: the pages do not scroll at the tested sizes. |
| 23 | PASS | No new token. `--control-border` comments carry painted figures. |
| 24 | PASS (observed) | `dark-theme-control.spec.ts` test 8 (first-paint ground) passes **unchanged** with no background (all 41 tests in that file pass; only test 3 was edited, see below). With a white background stored, observed `(4,4)`: light early `245,237,228` (JS held, layer not mounted; 7 from ground), late `245,238,229` (6 from ground, 218 from the other ground). Dark early `32,25,18` (5), late `39,31,26` (12, 213 from light). The assertion would still hold; the pixel is representative. |
| 25 | PASS | Layer-sourced shift **0** at 320 and 1280 (LayoutShift sources name the layer or its img: none). Boxes of readout, wordmark, focus chip, Stats, Settings: identical with and without the image. Note: the page has its own task-card load shift (0.0633 at 320, 0.00058 at 1280), identical with and without the image, so it predates this feature. |
| 26 | PASS | Layer state sequence `none -> pending -> active` over 31 observed mutation records. Invariants: pending has opacity 0; active has a decoded image. |
| 27 | PASS | Portrait and landscape at 320x720 and 1280x800: `object-fit: cover`, image box = viewport exactly. |
| 28 | PASS | Idle 1 s: **0** rAF callbacks, two screenshots 1 s apart pixel-identical. Positive control, timer running: **4** callbacks. Object URLs alive over 5 round trips `/` to `/settings`: `1,0,1,0,...` (never more than one). One `backgrounds` read per load of `/`. |
| 29 | PASS (reload offline not exercised) | 0 non-local network requests and 0 request bodies during pick, reload and remove. `blob:` loads are in-page, excluded. Pick and remove succeed with `setOffline(true)`; a reload offline is not exercised. Running and paused timer: 4 persisted fields byte-identical across pick and remove of a **5 MiB** PNG. `mm:ss` ticks and matches `endTimestamp` at 3 samples (09:58, 09:57, 09:56); paused reads 07:00. |
| 30 | PASS | No new image file in `git` or untracked; `public/` has none; no `data:image` or base64 in new files. No asset provenance entry added to DECISIONS. |
| 31 | PASS | `BackgroundControl.tsx`, `BackgroundLayer.tsx`, `use-background-image.ts` are inside the palette guard `FILES`. `lib/` is not in `SCANNED_DIRS`, so the three `lib/` files are covered by `components/background.guards.test.ts` with the same regexes. `ALLOWED_RAW_UTILITIES` `{}`, `ALLOWED_LITERALS` one entry, one inline-style exemption, all unchanged. Break-and-restore in the scratch copy (below). |
| 32 | **FAIL** | Items 1 to 4. Lint 21 warnings (baseline). Typecheck, build and Vitest green. e2e red on one existing spec. |
| 33 | PASS | Four required break-and-restores red and restored (below). Implementation Notes record the storage home, `CURRENT_SCHEMA_VERSION` 2 to 3, type set and cap, layer order, `data-background`, and the band. |

### Independent contrast figures
Worst painted pixel from a real 1280x800 screenshot, strips x 0-40 and x 1230-1260 (`y` 0-600), scrim `bg-background/97`. Edges are the `--control-border` ring around each control, worst pixel, ring cleaned of neighbouring controls. Floor 3:1 edges, 4.5:1 text.

**Light (`#7a756f` edge):**
| Image | Darkest ground | Duration edge | Stats edge | Settings edge | Reset edge | Focus ring | Wordmark (large) | Readout |
|---|---|---|---|---|---|---|---|---|
| plain | 236,229,218 | (3.648 flat-ring) | — | — | — | — | — | — |
| white | 235,228,219 | 3.619 | 3.660 | 3.653 | 3.619 | 4.056 | 3.982 | 4.987 |
| black | 228,220,211 | 3.363 | 3.421 | 3.396 | 3.363 | 3.800 | 3.701 | 4.987 |
| grey 50% | 231,224,215 | 3.486 | 3.552 | 3.519 | 3.486 | 3.943 | 3.836 | 4.987 |
| amber | 233,222,211 | 3.445 | 3.511 | 3.478 | 3.445 | 3.900 | 3.791 | 4.987 |
| 1 px checker | 228,220,211 | 3.421 | 3.421 | 3.396 | 3.363 | 3.800 | 3.728 | 4.987 |
| split | 228,220,211 | 3.363 | 3.421 | 3.396 | 3.363 | 3.800 | 3.982 | 4.987 |

**Dark (`#80705d` edge):**
| Image | Lightest ground | Duration | Stats | Settings | Reset | Focus | Wordmark | Readout |
|---|---|---|---|---|---|---|---|---|
| plain | 40,31,25 | 3.379 (flat-ring) | — | — | — | — | — | — |
| white | 46,38,32 | 3.107 | 3.145 | 3.107 | 3.107 | 7.398 | 7.214 | 4.681 |
| black | 38,30,25 | 3.427 | 3.456 | 3.429 | 3.427 | 8.054 | 7.958 | 4.681 |
| grey 50% | 42,34,29 | 3.267 | 3.307 | 3.269 | 3.267 | 7.685 | 7.586 | 4.681 |
| amber | 44,32,25 | 3.309 | 3.349 | 3.311 | 3.309 | 7.782 | 7.684 | 4.681 |
| 1 px checker | 45,37,32 | 3.145 | 3.145 | 3.145 | 3.145 | 7.398 | 7.214 | 4.681 |
| split | 46,38,32 | 3.145 | 3.456 | 3.429 | 3.427 | 8.054 | 7.214 | 4.681 |

(Light "plain" edge is not a row in the scan; the flat recomputation below covers the plain case.)

**Independent WCAG recomputation (qa's formula, not frontend's numbers):** light `#7a756f` vs grained darkest `236,229,218` **3.648**; vs black `228,220,211` **3.363**; vs checker `230,222,213` **3.428**; vs white `235,228,219` 3.619; vs `--card` `251,244,234` **4.179**; vs `--popover` `255,250,243` **4.394**; vs `--muted` `245,245,244` **4.183**; vs delete tint `247,231,222` **3.790**. Dark `#80705d` vs grained lightest `40,31,25` **3.379**; vs white `46,38,32` **3.107**; vs black `38,30,25` **3.427**; vs checker `45,37,32` **3.145**. Text: light `#2b2017` on `228,220,211` 11.71; dark `#f5ebdc` on `46,38,32` 12.59. qa matches every orchestrator figure except the checker (3.428 vs the worst pixel's 3.363). qa did not re-measure the dark flat surfaces (`--card` 3.801, `--popover` 3.731, `--muted` 3.501 as frontend recorded).

**Band (criterion 16), darkest / lightest composited ground:** light darkest: plain 236,229,218; white 235,228,219; black 228,220,211; grey 231,224,215; amber 233,222,211; checker 228,220,211; split 228,220,211. Dark lightest: plain 40,31,25; white 46,38,32; black 38,30,25; grey 42,34,29; amber 44,32,25; checker 45,37,32; split 46,38,32.

**Gauge matrix (criterion 18), digit ratio over the readout ring:** vessel light 4.987 (100 and 50), 15.299 (0, liquid gone); vessel dark 4.681 (100 and 50), 15.117 (0); glyph light min 5.623 (black), glyph dark min 7.110 (white). Levels read back as 100/50/0. The vessel's worst ring pixel is the amber liquid (`157,87,13` dark), a known caveat of the ring method.

**Criterion 14, interiors:** identical across all 9 image-theme pairs with zero mismatches (primary 1514 px, swatch 336 px, glyph ink 7476 px).

### Red-proofs (break in a scratch copy, run, restore, hash-checked)
The scratch copy is `/private/tmp/claude-501/-Users-ramwelltupas-pomotato/8f832571-8930-40e7-aa0a-bd64ec384041/scratchpad/redproof`. The real application files are byte-identical before and after (`shasum`). A `next dev` from the real repo was already listening on :3000 (PID 84048), so the scratch e2e runs used their own config on port 3100; before that fix, several e2e breaks were served by the wrong tree and were discarded.

| Break (scratch only) | Guard | Result |
|---|---|---|
| U1 decode gate removed (`hooks/use-background-image.ts`) | decode before paint | **RED** `hooks/use-background-image.test.tsx` (1). e2e does not discriminate: a junk JPEG is refused at pick time (E9 green). |
| U2 object URL never revoked on unmount | revoke | **RED** 3 hook tests; E5 **RED** (handle count grows) |
| U3 `forced-colors:hidden` removed | forced colours | **RED** layer unit test; E2 **RED** (layer displayed under forced colours) |
| U4 scrim removed | scrim | **RED** layer unit test; E1 **RED** (2 criteria 13-17 tests) |
| U5 oversize accepted | size cap | **RED** repo and degrade tests (2); E8 **RED** |
| U6 unknown bytes accepted (renamed text) | magic number | **RED** 7 repo tests |
| U7 SVG accepted | SVG excluded | **RED** 3 repo tests |
| U8 undecodable JPEG accepted (picker decode check) | decode check | **RED** picker unit test; E7 **RED** |
| U9 dangling reference returns `found` | degrade to no background | **RED** 3 repo tests |
| U10 `DatabaseBlockedError` escapes the read path | never throws | **RED** 3 degrade tests |
| E3 layer mounted in `app/layout.tsx` | route scoping (ruling 4) | **RED** 3 e2e (layer on `/settings` and `/stats`) |
| E4 layer takes flow height (`relative h-[300px]`) | no layout shift (criterion 25) | **RED** 2 e2e tests |
| E6 bytes written to a second `localStorage` key | bytes out of localStorage (criterion 3) | **RED** e2e criterion 3 |
| U11 raw palette utility in a new component | palette guard | **RED** `palette.tokens.test.ts` |
| U12 inline `style={{ backgroundColor }}` in a new component | palette guard | **RED** `palette.tokens.test.ts` |
| U13 `fetch` in a new `lib/` file | no network | **RED** after fixing a guard regex (`\b` after `\(` could never match, so the first run was vacuously green) |
| U14 `setTimeout` in a new hook | no time source | **RED** `background.guards.test.ts` |

Criterion 33's four required breaks: dangling reference U9 (RED), bytes out of localStorage E6 (RED), legibility over the set E1 (RED), no layout shift on arrival E4 (RED).

### Tests added or changed by qa
- New unit: `lib/db/background-degrade.test.ts`, `lib/db/background-migration.test.ts`, `hooks/use-background-image.test.tsx`, `components/BackgroundControl.test.tsx`, `components/BackgroundLayer.test.tsx`, `components/background.guards.test.ts`.
- Extended unit: `components/palette.tokens.test.ts` (task 010 block), `components/TimerGauge.tokens.test.ts` (new files added to the no-time-source list).
- Stale fallout (expected values only): `lib/preferences/preferences.test.ts` (18), `lib/preferences/gauge-style.test.ts` (23), `components/token-foundation.test.ts` (pin to `#7a756f`, name, and `toEqual` kept).
- New e2e: `e2e/helpers/background.ts`, `e2e/uploaded-background.spec.ts`, `e2e/uploaded-background-layer.spec.ts`, `e2e/uploaded-background-legibility.spec.ts`.
- Changed existing e2e assertions (criterion 32 requires listing them). None weakened, none removed:
  - `e2e/dark-theme-control.spec.ts` test 3: exact envelope string and key list gain `background: null` / `"background"`.
  - `e2e/settings-gauge-style.spec.ts`: legend lookups scoped to the gauge legend by text (two legends now exist); the interactive-element list gains `input:file:`; the stored-entry key list gains `background`; two test names widened to match.
  - Untouched: the criterion 24 first-paint test (dark-theme-control test 8).

### Not tested, and why
- Criterion 22 scroll stability: the tested layouts do not scroll.
- Criterion 29 reload while offline: a reload needs the dev server; pick and remove offline were tested.
- Criterion 20 tap sizes at 1280 px: only 320 px was re-run.
- Criterion 8 "second tab" is a reload read, as backend recorded; no storage listener exists, by design.
- Complete (timer reaching complete) is not in criterion 32's flow; start, pause and resume are.
- Dark flat surfaces (`--card`, `--popover`, `--muted`) were not re-measured by qa.

### Flake fixed during the run (no product change)
Under four workers, the legibility spec hung for 240 s: an IndexedDB `open` issued before the app had created its database never settled, and the row-count helper created an empty v1 database as a side effect. Fixed in the helpers: seed after the first full load, 15 s guard on the seed, existence check before counting. Two `task-list-dialog.spec.ts` tests appear as "unexpected" in raw JSON; they are the pre-existing `test.skip` calls, not failures.

### Needed from the orchestrator
1. Owner ruling on `dark-sweep.spec.ts` (item 1). This is the only red test.
2. Frontend corrects two recorded figures: the 1 px checker light (3.428 becomes 3.363) and the mode-chip text (11.6 becomes 6.75 light, 10.40 dark).
3. Accept or amend criterion 6's "byte-identical" wording (item 4).

## Review Findings
Reviewed 2026-10-27 against the uncommitted working tree (`git status` plus `git diff` for the 20 modified
files, untracked files read directly). Gates re-run by the reviewer on this tree: `npm run typecheck` exit 0;
`npm run lint` 0 errors / **21** warnings (baseline); `npm run test` **872 passed / 872**, 26 files. The e2e
suite was **not** re-run (cost); QA pass 2's run 3 (587 passed, 0 unexpected, 2 pre-existing skips) is taken
as the record.

- **Verdict: APPROVE.** All 33 criteria hold on the evidence in both QA reports plus the independent checks
  below. Nine findings follow, none blocking; R-6 is the one worth fixing before the next palette task
  inherits it.

**Reviewer could not write this section itself** (read-only by hard rule, no edit tools). The orchestrator
pasted it verbatim from the reviewer's hand-back and appended the "Orchestrator disposition" block at the
end; everything above that block is the reviewer's own text.

### The four points the orchestrator asked for a ruling on

- **RULING A — `.dark`'s `--control-border` (`#8a7968`) diverging from `--dialog-edge` (`#80705d`) is
  correct.** `app/globals.css:182,186`. Two roles on two grounds, each measured: the control edge is painted
  on the grained page ground (binding dark figure 3.546 under a white or split image), the dialog edge on the
  *scrimmed* page (measured this pass at 3.92-4.01 across no image / white / black, QA pass 2 job 2). Ruling
  9's pair was the control edge; nothing in the measurement set asks `--dialog-edge` to move, and moving it in
  sympathy would have been an unmeasured palette change outside the ruling. The shared hex was coincidence,
  and the divergence is now guarded both ways: `components/background.guards.test.ts:118-126` pins the
  *complete* set of changed and removed values (so a future sympathetic edit to `--dialog-edge` fails), and
  `components/token-foundation.test.ts:85-88` pins one `--control-border` declaration per block. No action.
- **RULING B — light `--dialog-edge` at 2.00:1 / 1.43:1 is OUT of 010's blast radius.** `app/globals.css:97`
  is `--dialog-edge: var(--border)`, byte-identical to HEAD (HEAD's line 90), and `--border` / `--popover` in
  `:root` are unchanged; QA measured the figure moving by -0.001 under a white image and +0.11 under a black
  one, i.e. no image makes it worse, and criterion 20's axe sweep does not cover WCAG 1.4.11 border contrast,
  so nothing in 010 either caused or could have caught it. It is nonetheless a **real 1.4.11 defect on the
  light task dialog** and should be filed as a `docs/PLAN.md` Maintenance line with the painted figures, so
  the next task does not rediscover it from scratch.
  - **On the `test.fail` mechanism: right instinct, one weakness.**
    `e2e/uploaded-background-dialog-edge.spec.ts:113` marks the whole test expected-to-fail, so *any* failure
    — a timeout, the dialog not opening, a helper or theme-seeding regression — also reports as expected, and
    the suite stays green through a genuine break on that path. Tighter shape: drop `test.fail` and assert the
    known figure directly (`expect(m.ground.ratio).toBeLessThan(3)` with the recorded 2.00/2.11 and the reason
    in the message), which goes red if the edge is fixed *or* if the measurement path breaks. If `test.fail`
    is kept, narrow it to the single assertion.
- **RULING C — QA's reasoning on the decode-before-paint guard is sound.** `components/BackgroundLayer.tsx:28,37`:
  `shown = loadedUrl === url` and `loadedUrl` is written only by the `<img>`'s `onLoad`, so a blob that will
  not decode fires `error`, never `load`, and the layer cannot leave `opacity-0`. Criterion 26's failure mode
  ("a dim with nothing behind it") is therefore prevented by the layer's load gate *independently* of the
  hook's decode gate; both gates are unit-proven (`components/BackgroundLayer.test.tsx`,
  `hooks/use-background-image.test.tsx`), and the only route to a stored-but-undecodable row bypasses the
  picker, which decodes before writing (criterion 7, U8, E7). An e2e discriminator would need a directly
  seeded row, which is new scope. **One correction to the framing:** U1 does not only change "pending vs
  absent" — with the decode gate removed, `[data-background]` is *present* (`"pending"`) for a background that
  can never paint, and that attribute is the observation protocol criterion 33 hands QA. So the hook's gate
  also protects observability and handle hygiene (it revokes the URL for an undecodable row,
  `hooks/use-background-image.ts:40-44`), not just paint. No action.
- **RULING D — the migration is genuinely additive and loses nothing.** `lib/db/database.ts:37-58`: the v1
  stores string and the v2 stores string are both unchanged, the new block declares only `backgrounds: "id"`,
  there is no `.upgrade()` callback and no existing table is restated, so Dexie carries
  `tasks`/`appMeta`/`sessions` forward untouched. `lib/db/background-migration.test.ts` proves it rather than
  asserting it: real v2 database opened with the frozen store strings, rows seeded, shipped code opens it at
  `verno === 3`, all three tables re-read with `toEqual`, `backgrounds.count() === 0`. **The literalization
  was required, not cosmetic** — left as `.version(CURRENT_SCHEMA_VERSION)` that block would have declared the
  *sessions* schema as version 3 and no version-3 block would have existed for `backgrounds` at all. Criterion
  6's amendment is right. Residual hazard, non-blocking: `database.ts:56` still pins the newest block to the
  constant, so the next bump has to repeat the same hand-literalization; a one-line guard (highest declared
  literal equals `CURRENT_SCHEMA_VERSION`) or literalizing `.version(3)` now would retire the pattern.

### Findings

- **R-1 (minor, a11y) — the live region also carries the idle state, so it announces on load.**
  `components/BackgroundControl.tsx:129-131`. `role="status"` renders `notice?.text ?? stateText`, and
  `stateText` flips from `""` to "No background image." the moment `hasHydrated` turns true, so a
  screen-reader user hears a state read-out on every arrival at `/settings` with no action taken. Fix: render
  the idle text in a plain (non-live) element and keep the live region empty until an action produces a notice.
- **R-2 (minor, a11y) — focus after Remove lands on a visually hidden control.**
  `components/BackgroundControl.tsx:95` focuses the `sr-only` input. Chromium keeps `:focus-visible` through a
  programmatic focus that follows a keyboard activation, so the peer span does show the ring for keyboard
  users (QA observed this); after a pointer activation focus sits on an element with no visible indicator.
  Acceptable as shipped; if it is ever revisited, move focus to the label's span with `tabindex="-1"`.
- **R-3 (minor, copy accuracy) — one storage-failure message covers two different failures.**
  `components/BackgroundControl.tsx:19-20,80-81,96-97`. `STORAGE_FAILED` says "Close any other Pomotato tab
  and try again.", which is right for `DatabaseBlockedError` and wrong for `DatabaseUnavailableError` (private
  browsing, storage disabled) — the user is told to close a tab that does not exist. Both classes are exported
  (`lib/db/index.ts:4,26`), so this is one `instanceof`.
- **R-4 (minor, performance) — the picked file is read and decoded twice.**
  `components/BackgroundControl.tsx:30` (`findProblem` → `file.arrayBuffer()`) then
  `lib/db/background-repository.ts:45` (`readBytes` again), and `canDecodeFile` decodes once before
  `BackgroundLayer`'s `<img>` decodes again. Up to 5 MiB each, so harmless at today's cap and the ordering is
  deliberate (decode before write). If the cap ever rises, pass the already-read buffer into `storeBackground`.
- **R-5 (minor, robustness) — the layer has no `onError`.** `components/BackgroundLayer.tsx:37`. A blob that
  passes the hook's probe but fails in the layer leaves `data-background="pending"` indefinitely and keeps the
  object URL alive until the id changes or `/` unmounts. Nothing paints, so no contrast floor is at risk, but
  the state machine has no terminal failure state for an observer to read.
- **R-6 (minor, documentation — the exact defect class 010 was written to stop) — three recorded figures are
  stale or unsourced.** (a) `docs/DECISIONS.md:28` still records the light 1 px checker at **3.428**, which QA
  corrected to **3.363** at worst pixel `228,220,211` in pass 1 item 2 and confirmed in pass 2; it sits in the
  permanent record presented as current. (b) `app/globals.css:95` keeps `--dialog-edge` at "4.12:1 against the
  scrimmed page", which QA's 6 px ring sampler reproduces at **3.98**. (c) `docs/DECISIONS.md:34` keeps the
  dark checker at 3.593 where QA's ring sampler read 3.546. Each needs either the figure corrected or the
  sampler named — this is the "a figure must name where it came from" rule from the measurement-ordering
  decision, applied to the record 010 itself leaves behind.
- **R-7 (nit, layering) — the data layer now imports from the preference module.**
  `lib/db/background-repository.ts:13` pulls `isBackgroundId` from `../preferences/schema`. No cycle today,
  and the validator is genuinely shared, but the row-id shape belongs to `lib/db/`; as written, a later
  preference refactor can break a repository.
- **R-8 (nit, tests) — two shapes in a qa file that the repo's own rules name.**
  `lib/db/background-migration.test.ts:53` uses `mode: "focus" as never` where `SESSION_MODES` is exported (an
  unsound cast in a repo that bans `any`), and `:64` puts an assertion inside `if (stored.ok)`. The `if` cannot
  pass vacuously because `expect(stored.ok).toBe(true)` precedes it, but it is literally one of the four
  vacuity shapes DECISIONS 2026-10-09 lists; `if (!stored.ok) throw new Error(...)` narrows without using the
  banned shape.
- **R-9 (nit, coverage shape) — a structural assertion was dropped, not weakened.**
  `e2e/settings-gauge-style.spec.ts:300,350`: `page.locator("fieldset legend")` became
  `page.locator("legend", { hasText: "Timer gauge" })`. The change was forced (two legends now exist) and the
  gauge assertions are intact, but the surface no longer asserts *how many* fieldsets/legends it has; one
  `toHaveCount(2)` on `fieldset` restores it.
- **Accepted and documented, recorded so it is not rediscovered:** `/settings` reads "A background image is
  set." from the preference alone (`components/BackgroundControl.tsx:54`), so a dangling reference reads as set
  there while `/` paints nothing, until Remove clears it. Frontend recorded this under "No preview on
  `/settings`"; it follows from ruling 4 plus the no-preview call and is not a defect.

### Checks that came back clean
- **Criterion 2 pins:** `git diff HEAD` is empty for `lib/timer/`, `lib/stats/`, `hooks/use-timer-clock.ts`,
  `hooks/use-hydrate-timer-store.ts`, `lib/preferences/boot-script.ts`, `package.json` and `package-lock.json`
  (reviewer-verified, not taken from the report). No `lucide-react` import anywhere in app code. No new
  dependency.
- **Assets / licensing:** no binary file added, tracked or untracked; `public/` is empty; no `data:` URI or
  base64 literal in any 010 file. The two pre-existing procedural SVG data URIs (`app/globals.css:265-266`
  grain mask, `components/HoldButton.tsx:95-96` crest mask) are HEAD's and unchanged. The adversarial set is
  generated in-test from pixel functions with a hand-rolled `node:zlib` PNG encoder
  (`e2e/helpers/background.ts:24-72`). No font, no audio, nothing provenance-requiring entered the tree, and
  `docs/DECISIONS.md` correctly adds no asset entry while saying in one line why.
- **No network:** zero `fetch`/XHR/beacon/socket/`<form action>` in any 010 source file, no `app/api`, no
  `route.ts` anywhere (guarded live by `components/background.guards.test.ts:35-47`). The whole flow is a file
  picker plus IndexedDB plus `blob:` URLs.
- **TypeScript strictness:** no `any`, no `as unknown as`, no `@ts-ignore`/`@ts-expect-error` in any 010
  product file; named exports only, functional components; discriminated unions (`StoreBackgroundResult`,
  `LoadBackgroundResult`, `Checked`) carry the result shapes instead of casts. `PREFERENCE_VALUES`'s re-typing
  to `Exclude<keyof Preferences, "background">` is sound and keeps `pick` exhaustive over the closed-set keys.
  The `window as unknown as {...}` casts in `e2e/uploaded-background-layer.spec.ts` are the conventional
  browser-context probe shape and are test-only.
- **Validation hardening:** type decided from magic numbers (`lib/db/background-validation.ts:109-116`), APNG
  via `acTL` and animated WebP via the VP8X flag both rejected, truncation checked per format, and every
  `readUint32`/`DataView` call site is length-guarded so the "nothing here throws" contract actually holds.
  `loadBackground` re-validates the stored bytes and cross-checks the sniffed type against the stored
  `mimeType` before handing out a `Blob` (`lib/db/background-repository.ts:84-85`), so a tampered row degrades
  to `missing`. The `fileName` is rendered as React text (escaped) and stripped of C0/DEL, display-only.
- **Performance / timer discipline:** no `setInterval`, `setTimeout`, `requestAnimationFrame` or
  `performance.now` in any new file (guarded twice over), one `backgrounds` read per change of the preference
  id, object URL revoked on id change, unmount and decode failure, the layer is `position: fixed` at
  `z-index: -20` with `pointer-events: none` so it adds no height and no scroll area, and the only motion is
  one 500 ms opacity transition suppressed under `motion-reduce`. `app/page.tsx`'s change is the mount point
  and nothing else; the timer store, the end-timestamp derivation and the boot script are untouched.
- **Accessibility of the new surface:** real `<input type="file">` inside `<label>` inside
  `<fieldset>`/`<legend>`, named by its own label text, described by `aria-describedby="background-help"`,
  focus ring carried to the visible span through `peer-focus-visible` resolving to `--ring`, 44 px target, Tab
  order follows the DOM; the layer is `aria-hidden` with an empty `alt`, inert, and `forced-colors:hidden` so
  nothing depends on the image being painted. 008 R-1 is fixed with `peer-checked:forced-colors:border-[3px]`
  plus a 2 px padding compensation so the card does not move, and the stale comment at
  `components/SettingsPanel.tsx:23-27` is corrected.

### antislop
The reviewer reported the antislop mode as **unresolved** for its own run (no session selection in its brief,
no global preference file) and therefore did not run an antislop pass; its findings cover only the five
assigned dimensions. **This is not a gap in 010's UI**: frontend implemented the control and the layer under
`antislop: during (session override)`, recorded in the Implementation Notes heading. What has not happened is
an independent antislop re-read of the finished surface. Not required by any criterion; if the owner wants
one, the mode has to be chosen first.

### Orchestrator disposition, 2026-10-27
Written by the orchestrator, not the reviewer.

- **R-6 fixed, all three.** (a) `docs/DECISIONS.md` light checker 3.428 → **3.363**, with the reason the first
  figure was wrong (it came from pixel `230,222,213`; the worst painted pixel is `228,220,211`) and the method
  named. (b) `app/globals.css` dark `--dialog-edge` 4.12 → **3.98**, sampler named, the per-image figures
  added, and the light sub-floor noted with a pointer to PLAN.md. (c) `docs/DECISIONS.md` dark checker and
  amber now carry both methods' readings, note that the ring sampler is the conservative one, and state that
  the binding figure agreed to three decimals. R-6 was the one the reviewer flagged as worth fixing before the
  next palette task inherits it, and it is the defect class this task exists to stop, so it was not deferred.
- **Ruling B's `test.fail` weakness fixed.** `e2e/uploaded-background-dialog-edge.spec.ts` no longer marks the
  light test expected-to-fail. It pins the measured sub-floor between bounds instead (`> 1.5` and `< 3` on the
  ground, `> 1.1` and `< 3` on the fill), so the test goes red if the edge is ever lifted *or* if the sampler
  stops returning real numbers — the reviewer's point was that a whole-test `test.fail` would have reported a
  timeout or a broken helper as expected, leaving the one known-red path as the one path that can rot unseen.
- **Ruling B's PLAN.md line: filed before the review landed.** The owner ruled on the light `--dialog-edge`
  sub-floor on 2026-10-27 and chose to defer it out of 010; it is a Maintenance line in `docs/PLAN.md` with
  the painted figures, the note that the dialog *fill* is also short (2.87:1) so an edge-token re-point alone
  would not fix it, and the instruction to flip the test above to a floor assertion when it is fixed.
- **R-1 through R-5 and R-7 through R-9: deferred to `docs/PLAN.md` Maintenance**, the same disposition 008's
  review findings got. None blocks, none touches a floor. R-1 (live region announcing idle state) and R-3
  (one storage message for two different failures) are the two with user-visible consequences and are filed
  first.
- **Rulings A, C and D: accepted as written, no action.** Ruling C's correction to QA's framing (the hook's
  decode gate also protects the `data-background` observation protocol and handle hygiene, not only paint) is
  recorded here rather than in the QA report, which stays as QA wrote it. Ruling D's residual hazard — the
  newest `.version()` block still pinned to `CURRENT_SCHEMA_VERSION`, so the next bump repeats the
  hand-literalization — is filed to Maintenance as part of R-7's group.

## QA Report, pass 2

Run 2026-10-27 against the tree as it stands after owner ruling 9. Palette and token values were not
moved during the pass. Pass 1 above is left intact. qa edited one file: `e2e/uploaded-background-dialog-edge.spec.ts`
(new, two tests). No application file was touched.

- **Verdict: PASS** on task 010's acceptance criteria. Pass-1 FAIL items 1 to 4 are resolved (see "Pass-1 items" below).
- The full e2e suite was observed green on the final tree (run 3 below): **587 passed, 0 failed, 0 unexpected,
  2 skipped, 0 flaky**. The 2 skips are the pre-existing `test.skip` calls in `task-list-dialog.spec.ts`.
- Findings **outside** 010's acceptance criteria, reported for the orchestrator's ruling and not counted against
  this verdict: (a) light `--dialog-edge` is below 3:1, pre-existing and independent of any image; (b) the
  orchestrator's ruling-9 note says an image moves the dialog edge "the safe way"; that holds for a black image
  and not for a white one in dark (floor still holds). Both are detailed below.

### Gates (final tree)

| Gate | Result |
|---|---|
| `npm run typecheck` | exit 0 (re-run after the new spec was written) |
| `npm run lint` | 0 errors, **21 warnings** (baseline 21). `eslint` on the new spec: exit 0, no output. |
| `npm run test` (Vitest) | exit 0, **872 passed / 872**, 26 files |
| `npm run build` | exit 0, `Compiled successfully`; routes `/`, `/_not-found`, `/settings`, `/stats` |
| `npx playwright test` (default 4 workers, config's own `npm run dev` on :3000, no listener was present beforehand) | **Run 3 (final): 587 passed, 0 failed, 2 skipped, 0 flaky of 589. Exit 0.** |

The e2e runs in this pass, in order, so the record is complete:

1. **Run 1**, after ruling 9, before the new spec existed: 584 passed, **1 failed**, 2 skipped of 587. The failure was
   `e2e/token-task-surface.spec.ts:248` "drag-active" (a task 007 spec): `expect(...).toBe("1")` received `"0.6"`,
   Timeout 5000 ms on the predicate. It **passes in isolation** (`npx playwright test e2e/token-task-surface.spec.ts -g "drag-active"`,
   1 passed, 1.0 s) and passed in runs 2 and 3. It is a timing flake under 4 workers on a 007 drag assertion. Not
   investigated further, per cost rule 1; no 010 code is on that path.
2. **Run 2**, with the new spec's first version: 586 passed, 1 failed, 2 skipped. The failure was my light
   dialog-edge floor (see job 2). The drag test passed this run.
3. **Run 3**, final: 587 passed, 0 unexpected, 2 skipped. The light dialog-edge test is an **expected failure** (`test.fail`),
   so it counts in the 587 as passed. It is the only expected failure in the suite.

### Job 1: dark re-measured as a diff against pass 1's "Dark (`#80705d` edge)" table

One capture per theme per image, from the existing criterion 13-17 spec (`e2e/uploaded-background-legibility.spec.ts`,
run in run 3), which samples the same strips (x 0-40, x 1230-1260, y 0-600, scrim 0.97) and the same control-edge rings.
All seven images are in that spec's output; the set used for the dark binding figure is white, black and the checker,
see "Image set" below. Edge figures are the `--control-border` ring worst pixel. Ratios for the plain row and the
flat surfaces were recomputed from the measured pixels, not taken from frontend.

Dark, `--control-border: #8a7968` (ruling 9). Pass 1 was against `#80705d`.

| Image | Lightest ground (pass 1 = pass 2) | Duration (pass 1 -> pass 2) | Stats | Settings | Reset | Focus | Wordmark | Readout |
|---|---|---|---|---|---|---|---|---|
| plain | 40,31,25 (same) | 3.379 -> **3.857** (arithmetic on the measured pixel; plain edge was never a sampled row in pass 1) | n/a | n/a | n/a | n/a | n/a | n/a |
| white | 46,38,32 (same) | 3.107 -> **3.546** | 3.145 -> 3.590 | 3.107 -> 3.546 | 3.107 -> 3.546 | 7.398 (same) | 7.214 (same) | 4.681 (same) |
| black | 38,30,25 (same) | 3.427 -> **3.912** | 3.456 -> 3.945 | 3.429 -> 3.914 | 3.427 -> 3.912 | 8.054 (same) | 7.958 (same) | 4.681 (same) |
| grey 50% | 42,34,29 (same) | 3.267 -> 3.729 | 3.307 -> 3.775 | 3.269 -> 3.732 | 3.267 -> 3.729 | 7.685 (same) | 7.586 (same) | 4.681 (same) |
| amber | 44,32,25 (same) | 3.309 -> 3.777 | 3.349 -> 3.823 | 3.311 -> 3.780 | 3.309 -> 3.777 | 7.782 (same) | 7.684 (same) | 4.681 (same) |
| 1 px checker | 45,37,32 (same) | 3.145 -> 3.546 (worst ring pixel 46,38,32) | 3.145 -> 3.590 | 3.145 -> 3.590 | 3.145 -> 3.590 | 7.398 (same) | 7.214 (same) | 4.681 (same) |
| split white/black | 46,38,32 (same) | 3.145 -> 3.590 (ring at x 0-40 is the white half; the 3.546 is in the strip) | 3.456 -> 3.945 | 3.429 -> 3.914 | 3.427 -> 3.912 | 8.054 (same) | 7.214 (same) | 4.681 (same) |

Other dark rows confirmed unchanged: vessel readout 4.681 at 100 and 50, 15.117 at 0; glyph minimum 7.110 (white);
task swatch and glyph interiors 0 mismatches (criterion 14).

**Flat surfaces, dark, against `#8a7968`** (measured this pass in `e2e/uploaded-background-dialog-edge.spec.ts`, computed token fills composited):
`--card` **4.339**, `--popover` **4.260**, `--muted` **3.997**, `--secondary` **3.761**. Each matches frontend's figure to three decimals.
Not re-derived: the delete-confirm tint (frontend 3.977). It is a flat surface and not binding: the binding dark figure is the grained ground at 3.546.

**Confirmed or contradicted, dark:**
- **Confirmed, to three decimals:** white 3.546 (binding), black 3.912, grey 3.729, all four `--card`/`--popover`/`--muted`/`--secondary` flat figures, focus and wordmark rows, the readout and glyph figures.
- **Contradicted, not material:** amber. Frontend recorded 46,35,27 giving 3.655. The run's amber ring worst pixel is 44,32,25, giving 3.777. Amber is not binding (it sits between black and white in luminance). Recorded as a disagreement, not investigated further.
- **Contradicted, not material:** checker. Frontend 3.593 (45,37,31); qa 3.546 (46,38,32, the same pixel as the white binding figure). A one-level grain difference between the strip sampler and the ring sampler. The binding figure is unchanged.
- **Stated as the pass-1 figure, not reproducible:** none. The dark `#80705d` rows were all superseded by ruling 9 as expected.

**Light (`#7a756f`, not stale):** binding light figure confirmed at **3.363** (black, split, and the checker's reset edge, all worst pixel `228,220,211`).
Duration edge per image: white 3.619, grey 3.486, amber 3.445, black 3.363, split 3.363. Plain grained ground 236,229,218 gives 3.648 (arithmetic from the pixel). Checker 3.363 at its worst ring pixel (the 3.428 figure is the superseded record; see pass-1 item 2).

**Image set.** Black, white and the 1 px checker, for dark. Grey, amber and split were dropped *for the binding figure* on evidence:
their lightest pixels (42,34,29, 44,32,25, 46,38,32) fall between black (38,30,25) and white (46,38,32) in luminance, and split's lightest pixel is white's
(46,38,32). The checker is kept because it is the image that defeats a mean: its worst ring pixel is 46,38,32, the same as white. Pass 1's 1 px checker result matched black
for light. The existing spec measures all seven anyway, because criterion 13 requires six, so nothing was saved by dropping them from a run.

### Job 2: `--dialog-edge` painted against the scrimmed page under an image, both themes

Measured in `e2e/uploaded-background-dialog-edge.spec.ts` (one capture per image per theme, with the task dialog open on `/`).
Ground = the 6 px ring left and right of the dialog (the scrimmed page, including the dialog's own shadow). Fill = the popover strip inside the left padding.
Edge = the computed border.

| Theme (edge token) | Image | Edge | Scrimmed ground, worst pixel | Fill, worst | Floor 3:1 |
|---|---|---|---|---|---|
| dark (`#80705d`, unchanged by ruling 9) | none | 128,112,93 | **3.982** (20,15,12) | 3.731 (30,22,16) | ground holds; fill holds |
| dark | white | 128,112,93 | **3.921** (22,17,14) | 3.731 | holds |
| dark | black | 128,112,93 | **4.009** (19,14,12) | 3.731 | holds |
| light (`#d6d3d1` = `--border`) | none | 214,211,209 | **2.003** (157,148,138) | **1.434** (popover `#fffaf3`) | **FAILS, both** |
| light | white | 214,211,209 | **2.002** (157,148,139) | 1.434 | **FAILS, both** |
| light | black | 214,211,209 | **2.112** (152,144,135) | 1.434 | **FAILS, both** |

**Dark result:** the painted figure against the scrimmed page is **3.98 with no image** (not the 4.12 in the `--dialog-edge` comment at `app/globals.css:95-96`, which
this sampler does not reproduce), 3.92 under a white image and 4.01 under a black image. The fill figure, **3.73**, matches the comment. The floor holds with every image.

**Light result, a finding outside 010's criteria:** the light dialog edge is `--border` (`#d6d3d1`) and is below 3:1 both against the scrimmed page (2.00 with no image,
2.00 white, 2.11 black) and against its own fill (1.43). Its figure is **identical with and without an image** (white changes it by −0.001). This is pre-existing:
`--border` and `--popover` in `:root` are unchanged from HEAD (`git show HEAD:app/globals.css`, lines 41 and 63), and `--dialog-edge: var(--border)` is HEAD's line 90.
The `--dialog-edge` comment records the 1.4:1 `--border` hairline "by design", and no 010 criterion covers the dialog edge. So this is not a 010 FAIL. The light test is marked
`test.fail` with the reason, so the suite stays green while the figure stands, and it will report as an unexpected pass if the edge is lifted above 3:1. **Owner or orchestrator ruling
needed** on whether a dialog-edge floor applies to light at all.

**Ruling-9 note, the direction claim:** the orchestrator note says an image behind the scrim makes the scrimmed page darker, "which moves `--dialog-edge`'s figure the safe way".
Measured, this holds for a **black** image (dark +0.03, light +0.11) and **does not hold for a white** image in dark: the 0.62 scrim does not dim a white image
enough, so the dark ground goes from 3.982 to 3.921 (−0.06). The floor holds (3.92 is above 3.00). The note's reasoning should be corrected in the record; the value is not affected.

### Job 3: ruling on the decode-before-paint red-proof

**Ruling: the unit break (U1, decode gate removed from `hooks/use-background-image.ts`) is sufficient proof of the decode gate. An end-to-end discriminator is not needed for the criterion, and no e2e break was run.**

Why, from the code (not from a run):
- `components/BackgroundLayer.tsx` derives `shown = loadedUrl === url`, and `loadedUrl` is set only by the `<img>`'s `onLoad`. A blob that will not decode fires `error`, not `load`.
  So the layer stays `pending` (opacity 0) whether or not the hook decoded first. **The dim-without-image failure criterion 26 names is prevented by the layer's load gate**, not by the hook's decode gate.
- That layer gate is unit-proven: `components/BackgroundLayer.test.tsx` "is pending (opacity 0) from mount until the image has loaded" and "becomes active only once the `<img>` fires load".
  Criterion 26 is observed end to end (31 mutation records, run 3 green).
- What U1 changes is only the layer's state for a stored undecodable row: `pending` where it should be absent. That is not an acceptance criterion. The row is also unreachable through the UI,
  because the picker decodes before storing (criterion 7, E7 and U8). E9 staying green under U1 is therefore **correct product behaviour, not a missed guard**.
- The decode gate's contract is proven at unit level: `hooks/use-background-image.test.tsx` "bytes that pass the structural check but will not decode return null and revoke the URL" (U1 red).

Level that proved the guard: **unit**. No e2e break was run for this guard (cost rule 1). If the owner later wants the hook's decode gate visible end to end, that needs a
seeded-row test, which is a new criterion and not 010's.

### Pass-1 items

1. **Criterion 32 (e2e green).** Resolved by ruling 9. Run 3 is green: 587 passed, 0 unexpected. `e2e/dark-sweep.spec.ts` "disabled custom field" passes unedited.
2. **Criterion 15 (1 px checker, light, 3.428).** Corrected in substance: the record now carries 3.363 at `docs/tasks/010-uploaded-backgrounds.md` in the ruling-8 note and in this pass's job 1.
   **Not fully clean:** the frontend second-pass table row "+ 1 px checker | 230,222,213 | 3.428" (second-pass section, before the ruling-9 section) still reads 3.428. The orchestrator may want that row annotated; it is historical and the verdict does not depend on it.
3. **Criterion 17 (mode chips).** Corrected: the chip text figures are at the criterion-17 note (`6.75` light, `10.40` dark). Frontend's second-pass line at the body text (11.6 / 11.71) is body colour, not chips, and is correct.
4. **Criterion 6 wording.** Accepted by the orchestrator, and the reasoning is written into criterion 6 (`.version(2)` literal).

### Criteria

| # | Verdict (pass 2) | Evidence |
|---|---|---|
| 1-14 | PASS, unchanged | Pass-1 evidence stands; ruling 9 changed `.dark --control-border` only, and no criterion's pass depended on its value. Run 3 green. |
| 15 | PASS | Floors hold; the binding light figure is 3.363, dark 3.546 (job 1). |
| 16 | PASS | Dark lightest composited ground per image matches pass 1 except the edge figures (job 1). |
| 17 | PASS | Control-edge floors: dark min 3.546, light min 3.363, both above 3.00. Focus and wordmark unchanged. Chip figures as corrected. |
| 18-33 | PASS, unchanged | Run 3 green for the behaviour specs; no palette or behaviour change since pass 1 except ruling 9's single token. Pass 1's red-proofs were not re-run: the only change they could be affected by is the palette value, and the palette guard (`components/background.guards.test.ts`, `components/palette.tokens.test.ts`) is green in run 3's Vitest. |

Criterion 26 is covered by job 3's ruling; it remains PASS.

### Not re-derived, and the evidence that made it safe

- **Pass-1 red-proofs U1-U14 and E1-E8.** Not re-run. The code they break is unchanged since pass 1 (the only change was one CSS value). The guards they cover are green in run 3.
- **Light flat surfaces and the light sweep.** Not re-measured as a sweep. The binding light figure (3.363) and the light duration/reset rows match pass 1 by three decimals.
- **Delete-confirm tint (dark, 3.977 by frontend).** Not re-measured. Not binding: the binding dark figure is the grained ground at 3.546.
- **The `--dialog-edge` comment's 4.12 figure.** Not reproduced with the 6 px ring sampler (3.98). The comment is not an acceptance criterion; the fill figure 3.73 matches.
- **Criterion 22 scroll, criterion 29 offline reload, criterion 20 tap sizes at 1280.** Not exercised in pass 1 either; unchanged, and not in pass 2's scope.

### Tests added or changed by qa in pass 2

- New: `e2e/uploaded-background-dialog-edge.spec.ts`. Two tests: "dark: ... floor 3:1 ..." (asserts the floor, passes) and "light: ... KNOWN SUB-FLOOR ..." (`test.fail`, expected failure with the reason stated in the test).
- No other file was edited. Existing specs and the pass-1 changes are untouched.
