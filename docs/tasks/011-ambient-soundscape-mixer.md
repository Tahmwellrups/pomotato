---
id: 011
slug: ambient-soundscape-mixer
status: qa # draft | in-progress | qa | review | done | blocked
---

# Ambient soundscape mixer — four synthesized layers, per-layer level, no audio file anywhere

## Goal
Give her a small set of ambient sounds she can layer and balance while the timer runs — rain under a
low room hum, say — opened from a fourth control in the bottom cluster, with every sample generated in
the browser so no audio asset ships and nothing is licensed. Done means: four layers, an independent
level per layer, the mix remembered across reloads, playback never starting without her asking, and
zero audio bytes in the repo or on the wire.

## Provenance
`docs/PLAN.md` milestone 5: "**Ambient soundscape mixer** — layered loops, per-layer volume.
CC0/properly licensed audio only." The next unchecked milestone. `DESIGN.md` has no audio section at
all, so the direction it supplies is indirect: Personality ("calm and cute", "not overbearingly cute —
no clutter of widgets competing for attention"), "Mood & motion" (minimalist; "some animation is
welcome"), and Boundaries ("Original assets only"; "accessibility is not negotiable against
aesthetics"). The licensing route taken here is DESIGN.md's own precedent, transplanted: it deferred
the paper grain with the instruction to "produce it procedurally (SVG/CSS noise) rather than shipping a
texture asset, which sidesteps the licensing question entirely."

## Pipeline — **frontend → qa → reviewer. No backend step.**
**The data shape is decided, so backend does not run.** See "Data shape" below for the verification;
the short version is that there are no bytes and no rows, so the persisted value is one
`lib/preferences/` key by the recipe in `lib/preferences/schema.ts:6-13`, not a Dexie table. Frontend
adds that key itself, as the recipe is written to be followed without a data-layer design pass.

**The one escape hatch, named so frontend does not improvise:** if frontend judges the validator for
this key to be more than the recipe's "validator instead of a value-set entry, plus the same one `pick`
line and one line in `isPreferences`" — i.e. if it starts wanting a migration, a second storage key, or
a version bump — it **stops and says so in Implementation Notes** rather than inventing a shape. The
orchestrator inserts a backend step at that point. Reaching for Dexie is never the answer here on its
own (criterion 5).

**The build-order gate is already satisfied** (orchestrator, verified 2026-10-27). `docs/PLAN.md` says
"Don't start a milestone until the previous one is PASS + reviewed", and milestone 4 clears it: task 010
is QA PASS, reviewer APPROVE (its Review Findings section carries the verdict plus four rulings), and the
whole diff is committed as `f3f5869`. The task file's frontmatter still read `status: qa` when this file
was drafted, which is what made the gate look open; the frontmatter was stale, not the work, and it has
been advanced to `done`. **Implementation may start immediately.** Criterion 1 records the check rather
than holding the task.

## Settled, do not reopen
`docs/DECISIONS.md` 2026-10-27, "Milestone 5 scoping", carries three owner rulings taken before this
file was written. They are not re-askable, and the first one is the whole licensing answer.

### 1. Every layer is synthesized in the browser. No audio file ships, in any format.
Filtered noise and oscillators via the Web Audio API. **Nothing is sourced, so nothing needs
provenance** — `docs/DECISIONS.md` gains no asset entry for this task, and criterion 2's entry says so
in one line so the next reader does not go looking for one. No `.wav`, `.mp3`, `.ogg`, `.flac`,
`.webm`, `.m4a` or `.opus` anywhere in the repo, including under `public/`; no base64 audio literal in
source; no fetch of audio from anywhere. Criteria 7-10.

**The accepted cost, stated so nobody tries to work around it:** synthesis is convincing for rain,
wind, waves and low hum, and unconvincing for anything with recognizable detail. **A café, birdsong, a
keyboard, a fireplace crackle and a train are out of scope for this milestone** — adding one means
revisiting the owner ruling, not finding a clever synthesis for it.

**Kept open, and this is what makes the ruling reversible:** the layer source is an interface, so a
file-backed source could be added later **without touching the mixer UI or the persisted shape**.
Criterion 9 is how that is checked, and it is checked structurally, not by promise.

### 2. The mixer is a dialog, opened from a fourth control in `widgets/BottomControls.tsx`.
Beside the task list, stats and settings. **Not `/settings`, not a new route.** It follows the pattern
task 004 established for the task list and keeps a level adjustment one click from the running timer,
for the same reason the theme control stayed in the header (DECISIONS 2026-10-26): changing a level
mid-session is a frequent action and must not sit behind navigation.

### 3. Playback is manual only. It does not follow timer state.
Sound starts when she turns it on and stops when she turns it off. **No coupling to focus/break/idle,
no autostart, no fade-on-complete, no completion chime.** Browser autoplay policy requires a user
gesture before any audio can start, so a timer-linked mode would be silent in precisely the moment it
would matter. A "pause on break" preference stays addable later as one key; it is not in this task.

### 4. One preference system.
`lib/preferences/` is the only preference module (DECISIONS 2026-10-23; the recipe is at
`schema.ts:6-13`). No second store, no second storage key, no second version constant, no second boot
script. `lib/preferences/boot-script.ts` and its drift test stay byte-identical — nothing here paints
before first paint, and nothing here may start before a gesture, so there is nothing for a boot script
to do.

### 5. The timer is untouchable.
Remaining time is derived from a stored end timestamp (CLAUDE.md). `lib/timer/`, `lib/stats/`,
`hooks/use-timer-clock.ts` and `hooks/use-hydrate-timer-store.ts` are pinned to an empty diff. The
audio clock and the timer clock never meet: the timer does not read audio state and the audio does not
read timer state (ruling 3).

### 6. No new runtime dependency.
No tone/synth/audio library, no `howler`, no `tone.js`, no visualizer package. `react-icons` is the
project's icon library (DECISIONS 2026-10-26); `lucide-react` is installed, imported nowhere, and
**must not gain its first import here** — removing it is the PLAN.md Maintenance line, not this task.
`package.json` and `package-lock.json` are pinned to an empty diff. QA's own test tooling is exempt by
DECISIONS 2026-10-02 ("whichever role's code needs a runtime dependency installs it… test tooling is
test infrastructure"), and if QA needs an `AudioContext` mock it installs one as a dev dependency and
says so — but see criterion 12, which is designed so it should not have to.

## The layer set — four layers: **rain, wind, waves, hum**

Decided here, not left open. Four, with these four, for four reasons:

1. **The owner ruling already enumerated them.** DECISIONS 2026-10-27 names the convincing cases
   verbatim: "convincing for rain, wind, waves and low hum". Choosing anything else means arguing with
   the ruling that scoped the task.
2. **They are four different filters on the same broadband material**, which is why they are all
   reachable without a sample and without a per-layer research problem.
3. **They occupy different bands, so they mix instead of masking each other** — hum at the bottom,
   waves as a slow low-mid swell, rain in the mid-highs, wind sweeping through the middle. "Layered
   loops" in PLAN.md is only a real feature if the layers can be on together and still be told apart.
   Four distinguishable layers is a mixer; one is a toggle, and eight is a catalogue nobody balances.
4. **Four faders fit one dialog at 320 px** without a scroll region or a second screen.

**Stable identifiers** — the same discipline as `GAUGE_STYLE_VALUES` (`schema.ts:22-29`: "Stable
identifiers, never colours or component names"): `rain`, `wind`, `waves`, `hum`. The persisted shape
and the test suite key off these; they are not the visible labels.

**Visible labels are copy work** (criterion 15, via `antislop-copywriting`), with one hard constraint:
**a label may not name a source the synthesis does not produce.** "Rain" is honest. "Rainforest",
"Café", "Campfire", "Morning birds" are not, and shipping one of those would be the ruling's accepted
cost quietly reintroduced as a lie in the UI.

**A fifth layer is a registry entry plus a source**, nothing else (criterion 9). That is the test of
whether this shipped as a mixer or as four hardcoded toggles.

## Data shape — **DECIDED. Verified against the repo. No Dexie table, no backend step.**

The persisted value is **which layers are on, and each layer's level** — four identifiers, four
booleans, four small integers. Added to `lib/preferences/` by the documented recipe as **one new key**.

**Verification, so nobody re-derives it:**
- **There are no bytes.** DECISIONS 2026-10-26 sent the uploaded background's image to Dexie for one
  reason: "localStorage is ~5 MB per origin, string-encoded… a 4 MB photo is ~5.3 MB and does not fit."
  The entire mix serialises to well under 1 KB. None of that entry's reasoning transfers.
- **There are no rows.** No ordering, no naming, no per-item delete, no index, no range query, no
  blob — the four things that made `backgrounds` a table. Four fixed keys is a record, not a
  collection.
- **Nothing has to be known before first paint**, so localStorage's one real advantage over Dexie is
  not even needed here — and ruling 3 means nothing may *start* before a gesture anyway. Async would
  have been acceptable; it simply is not required.
- **A Dexie table would cost `CURRENT_SCHEMA_VERSION` 3 → 4** — a real migration, with every existing
  user's `tasks`/`sessions`/`appMeta` rows at risk from a block added in the wrong place (010's
  criterion 6, and the PLAN.md Maintenance line about the newest version block still pinned to a moving
  constant) — in exchange for storing about a hundred bytes. That is the whole argument against it.
- **`PREFERENCES_VERSION` stays 1.** No existing key changes meaning, and `schema.ts:112-117` states
  the precedent in its own words: "A v1 payload written before `gaugeStyle` existed keeps its theme and
  gains the default, because `sanitizePreferences` falls back per key. That is why adding `gaugeStyle`
  and then `background` needed no version bump." This key is the third instance of that pattern. If
  frontend believes a bump is needed, that is the escape hatch in "Pipeline", not a judgement call.

**Pinned, and not frontend's to re-ask:**
- **Levels persist independently of on/off.** Turning a layer off and back on returns it to the level
  it had. A level is not reset by being muted. Criterion 4.
- **Playback state does not persist.** The mix persists; whether sound is *currently coming out* does
  not. A reload or a new tab starts silent with the mix intact, because autoplay policy forbids
  anything else — this is not a bug to work around and not a "resume where you left off" to add later
  without a gesture. Criterion 17.
- **Per-key fallback, never a throw.** A malformed stored mix falls back to the default mix and must
  not take `theme`, `gaugeStyle` or `background` down with it (`schema.ts:87-100`). Unknown layer ids
  are dropped, not kept; out-of-range levels do not survive as out-of-range. Criterion 5.
- **Playback is per-tab and uncoordinated.** Two tabs open means two independent audio graphs and, if
  she starts both, doubled sound. Accepted, stated, not solved — leader election across tabs is its own
  task, and `persist` does not sync across tabs today either. Criterion 21 records the observed
  behaviour rather than asserting a fix.

## Why this task's measurement trap is different from 010's
010's trap was a per-image contrast sweep. This one is **per-layer audio assertions**, and it is worse,
because QA cannot assert "sounds like rain" at all. Three rules govern every criterion below:

1. **Audio claims are stated as something observable or they are not stated.** An `AudioContext` state,
   a gain value read through one named accessor, a `data-*` attribute, a node or handle count, the
   absence of a request. Never a timbre, never a "feels calm", never a listening test.
2. **Per-layer assertions are loops over the registry, never an enumerated list.** QA asserts the
   mixer renders exactly `LAYERS.length` faders and then iterates. A criterion that names `rain` four
   times is a criterion that gets rewritten when a fifth layer lands. The only place layer names are
   enumerated is the registry itself (criterion 9).
3. **Measurement criteria are in their own group (F).** A palette token change re-runs group F and
   nothing else. Per CLAUDE.md "Measurement ordering": if a token is going to move, it moves before
   group F is measured, not after.

## Scope

**In:**
- Four synthesized layers (`rain`, `wind`, `waves`, `hum`) behind an interface, with a registry a fifth
  entry could join.
- A fourth control in `widgets/BottomControls.tsx` opening a mixer dialog, in the `TaskListDialog`
  pattern.
- Per-layer on/off and per-layer level, plus one control that stops everything without discarding the
  mix.
- One `lib/preferences/` key holding the mix, by the `schema.ts` recipe.
- The playback lifecycle: first gesture, survival across client-side navigation, teardown, no leak.
- Copy for the dialog, through `antislop-copywriting`.
- Contrast measurement for the new surface, in both themes, at 320 px and 1280 px (group F only).

**Out — deferred deliberately, each with its reason:**
- **Any layer with recognisable detail** — café, birdsong, keyboard, fireplace, traffic, train. Owner
  ruling 1's accepted cost. Not "later", not "approximate it": it needs the ruling revisited.
- **Any file-backed layer.** The interface exists so one *can* be added; adding one is not this task.
- **Timer coupling of any kind** — pause on break, autostart on focus, duck on completion, a completion
  chime or any alert sound. Owner ruling 3.
- **A master volume fader.** One stop-everything control is in; a master *level* is out. Per-layer
  volume is what PLAN.md asks for, and a master multiplier makes every level figure a product of two
  inputs for no new capability.
- **Saved mixes, presets, named scenes, a randomise button.** A second data shape (names, ordering, a
  chosen-one pointer) and a second surface, which is exactly cut 1 of task 010 repeated.
- **Any live meter, VU, waveform, spectrum or pulsing icon.** Three reasons, and the third is the
  binding one: it is pure decoration on a surface DESIGN.md asks to keep uncluttered; it is the one
  thing here that would need `prefers-reduced-motion` handling at all; and a continuously animating
  element **contradicts an assertion already in the suite** — 010's criterion 28 pins zero
  `requestAnimationFrame` callbacks over a settled second with the timer idle. The fader's own value is
  the indicator. Criterion 26.
- **Keyboard shortcuts, a global hotkey, media-session integration, OS media keys.**
- **Cross-tab coordination** of playback. Stated as a known limitation (criterion 21), not fixed.
- **Per-layer pan, EQ, reverb, stereo width, randomised variation over time.**
- **Export/import of the mix.** Milestone 7 owns export/import, and the mix rides along in the
  preferences payload for free when it gets there.
- **Music embeds.** Milestone 6, and a different thing entirely: this feature makes no network request
  at all, which is what criterion 10 pins.
- **Any palette change.** No existing token value in `:root` or `.dark` changes. A new token only if a
  role genuinely has none (criterion 25). If a floor cannot be met without re-pointing an existing
  token, that is raised, not done silently — and per CLAUDE.md "Measurement ordering" it is raised
  **before** group F is measured, not after.
- **The light dialog-edge separation gap.** `--dialog-edge` measures 2.00:1 against the scrimmed light
  page and the dialog fill is 2.87:1 against the scrim — a PLAN.md Maintenance item the owner deferred
  out of 010 on 2026-10-27, needing a palette move and a re-measure. This task's dialog **inherits** the
  existing `DialogContent` and is explicitly not the one to fix it. Criterion 24 guards the direction:
  do not make it worse, and do not flip `e2e/uploaded-background-dialog-edge.spec.ts`'s `test.fail` —
  a `test.fail` that starts passing fails the suite.
- Any change to `lib/timer/**`, `lib/stats/**`, `lib/db/**`, `lib/preferences/boot-script.ts`,
  `hooks/use-timer-clock.ts`, `hooks/use-hydrate-timer-store.ts`, the timer surface, the gauge, the
  task list or its dialog, `/stats`, `/settings`, `widgets/HeaderNav.tsx` or `components/ThemeControl.tsx`.

## Maintenance findings: what 011 absorbs
Same rule 008 and 010 used — a finding is this task's only if it touches a file this task already
changes. Ruled here so frontend never has to ask.

| Finding | 011 touches it? | Ruling |
|---|---|---|
| **`widgets/HeaderNav.tsx` is a `<div>`, not a `<header>`, inside `<main>`** | No | **Out as a fix. In as a constraint on new markup:** the new control and dialog do not copy the defect (criterion 13). |
| **Dead `disabled:` utilities on the task-form fields** | No | **Out.** Different file. But the *class* of defect is in scope as a constraint: no conditional styling that can never render (criterion 30 greps the new files for it). |
| **Light dialogs do not separate from the scrimmed page at 3:1** | **The file, yes; the fix, no** | **Out as a fix, in as a direction guard.** See Scope/Out. Criterion 24. |
| **`/settings` announces its idle state on arrival** (010 R-1) | No | **Out as a fix. In as a constraint:** the mixer's live region starts empty and announces only what an action produced (criterion 16). |
| **Drop the unused `lucide-react` dependency** | **No, deliberately** | **Out.** §6 and criterion 3's empty `package.json` diff. |
| **Newest Dexie version block pinned to a moving constant** | No | **Out.** No schema change here at all. |
| **320 px header density** | No | **Out as a fix. In as a viewport:** criterion 29 re-checks 320 px, because the bottom cluster gains a fourth control. |
| **Constraint: dark `--popover` cannot be lifted for elevation** | **Yes, indirectly** | **In as a constraint, not a task.** The mixer dialog paints on `--popover`; separation comes from edges, not a lifted fill. `components/token-dark.test.ts` passes unchanged (criterion 31). |

## Acceptance Criteria
32 criteria, in eight groups. Group F is the only measurement group.

### A. Gate, order and the record
- [ ] 1. **010 closed first (satisfied before this task opened, recorded not re-litigated).** Task 010
      is PASS, reviewer APPROVE, committed as `f3f5869`, and `docs/PLAN.md`'s milestone-4 line and the
      milestone itself are ticked. QA states which commit 011 was built on top of, so the baseline in
      criterion 32 is attributable. QA does **not** re-verify 010's own criteria.
- [ ] 2. **A dated `docs/DECISIONS.md` entry lands with the work** (frontend drafts, orchestrator
      lands) stating: the four layer ids that shipped and that a fifth is a registry entry; the exact
      persisted value shape and the value of `PREFERENCES_VERSION` (unchanged, with the per-key-fallback
      reason); that playback state is deliberately not persisted and why autoplay policy makes that the
      only option; what stops the audio and what does not (dialog close, route change, reload); the
      per-tab limitation; and **one line saying no asset provenance entry is needed, because nothing is
      sourced.** No new provenance table row.
- [ ] 3. **Nothing outside this feature moved.** `git diff --stat` is empty for `lib/timer/`,
      `lib/stats/`, `lib/db/`, `lib/preferences/boot-script.ts`, `hooks/use-timer-clock.ts`,
      `hooks/use-hydrate-timer-store.ts`, `package.json` and `package-lock.json`.
      `lib/preferences/boot-script.test.ts` passes with no assertion changed. No new runtime dependency
      and no first import of `lucide-react`.

### B. The persisted mix
- [ ] 4. **One key, by the recipe, and levels outlive mute.** The mix is added to
      `lib/preferences/schema.ts` as the recipe at `schema.ts:6-13` describes — field on `Preferences`,
      default in `PREFERENCE_DEFAULTS`, a validator (the value is not a closed set), one `pick` line in
      `sanitizePreferences`, one line in `isPreferences`, one `partialize` entry and one setter in
      `store.ts`. No second store, storage key or version constant exists anywhere in the repo.
      Setting a layer's level, muting it and unmuting it returns the stored level unchanged, across a
      reload. QA asserts this generically over the registry, not per layer.
- [ ] 5. **Every malformed state degrades to the default mix, never to a throw, a silent app-breaking
      error or a lost preference.** Table-driven unit tests cover: key absent; `null`; a non-object; a
      string; an unknown layer id present; a known layer id missing; a level above the maximum; a level
      below zero; a non-numeric level; a non-boolean on/off; a fractional level if integers are the
      stated shape; unparseable JSON in the storage entry; a newer `PREFERENCES_VERSION`; an older one.
      Each yields a valid mix **and** leaves `theme`, `gaugeStyle` and `background` intact. Asserted
      against the literal shipped payload
      `{"state":{"theme":"dark","gaugeStyle":"glyph","background":null},"version":1}`, which must keep
      all three keys and gain the default mix. Per DECISIONS 2026-10-23, `persist` **writes the
      sanitised payload back** — a test asserting the stored bytes are left untouched is wrong.
- [ ] 6. **The entry stays small, and a drag does not write per frame.** With every layer on at a
      non-default level, `localStorage` holds exactly one `pomotato-preferences` entry, its envelope is
      still `{"state":{…},"version":1}`, and its serialised length grows by **under 1 KB** versus a
      default mix. QA reports the byte length before and after and enumerates the keys inside `state`.
      QA also instruments `localStorage.setItem`, drags one fader across its full range, and reports the
      call count: writes are bounded by **committed value changes, not by pointer events**, and the
      final stored level equals the control's final value.

### C. Synthesis, the licensing floor, and the interface
- [ ] 7. **No audio asset exists, anywhere.** `git status` and a repo walk show no file with an audio
      extension (`.wav .mp3 .ogg .oga .flac .webm .m4a .aac .opus .aiff .mid`) in the repo, including
      under `public/`; no base64 or data-URI audio literal in source; no `<audio>` element, no
      `new Audio(`, no `createMediaElementSource`, no `decodeAudioData` fed from a fetched response.
      QA states how it searched and proves the search is live by adding a dummy match in a scratch path
      and seeing it caught, then removing it.
- [ ] 8. **Every layer is generated at runtime.** With the mixer playing, exactly one `AudioContext`
      exists for the document (QA counts, rather than trusting), its state is `running`, and the audible
      graph was constructed from oscillator and noise sources — observable as the absence of any media
      element or media-element source node in the graph, plus criterion 7's repo evidence. No
      `ScriptProcessorNode` (deprecated, and it runs per-sample work on the main thread).
- [ ] 9. **A fifth layer would be a registry entry plus a source, and nothing else.** The layers are
      declared once, in one exported registry; every consumer — the dialog, the preference validator,
      the persisted shape, the tests — derives from it rather than hardcoding four names. Proven, not
      asserted: QA adds a throwaway fifth entry in a test, and the mixer renders five faders, the
      validator accepts and round-trips the fifth level, and nothing else needs editing; then removes
      it. The source itself is reached through one interface, so a file-backed source would implement
      the same interface — QA states the interface's exported type name and confirms the four shipped
      sources are the only implementations of it today.
- [ ] 10. **Nothing is fetched.** Across the whole flow — load `/`, open the mixer, turn layers on,
      move faders, close, navigate to `/stats` and `/settings` and back, stop, reload — Playwright
      observes **zero requests whose response is a media type** (nothing `audio/*`, no media range
      request) and **zero requests to any origin other than the app's own**. The whole flow works with
      the network blocked after load. *Precision, so this criterion is honest rather than
      unsatisfiable:* the app's own same-origin JS chunks are how Next.js loads at all and are not a
      violation — if an `AudioWorklet` module is used, its `addModule` request is a same-origin
      JavaScript file, which QA records by name in the report and which is permitted. An audio
      **payload** of any kind, from any origin, is not.

### D. The control, the dialog and its copy
- [ ] 11. **A fourth control in `widgets/BottomControls.tsx`**, beside the task list, stats and
      settings — not on `/settings`, not a new route (`npm run build` lists routes still exactly `/`,
      `/_not-found`, `/settings`, `/stats`). It opens a dialog in the `components/TaskListDialog.tsx`
      pattern: the trigger and the dialog live in one component under `components/`, using the
      project's existing `components/ui/dialog.tsx`.
- [ ] 12. **One fader per registry layer, native-first, keyboard-complete.** The mixer renders exactly
      `registry.length` level controls. Every one of them is reachable by Tab in visual order, has a
      programmatic accessible name QA asserts **by value**, carries the app's focus indicator (2 px
      outline at 2 px offset resolving to `--ring`, `app/globals.css:234-237`), is operable by keyboard
      alone to both extremes and to an intermediate value, and **announces its current value to
      assistive technology** — a name, a current value and a range, with the value changing as the
      control changes. CLAUDE.md's "semantic HTML before ARIA" applies with full force here and a native
      `<input type="range">` is the obvious way to get all of the above for free, **but the choice is
      frontend's**: a custom widget is permitted only if it satisfies every clause of this criterion,
      and QA checks the clauses, not the element name. Same for the on/off controls and the
      stop-everything control.
- [ ] 13. **Semantic markup, no dead controls.** The new markup does not copy `HeaderNav`'s
      `<div>`-instead-of-a-landmark defect. QA enumerates every interactive element in the dialog and
      confirms each one acts: no disabled control, no empty section, no "coming soon", no control whose
      only effect is to look available.
- [ ] 14. **A control that stops everything without discarding the mix.** Activating it leaves the
      graph silent (criterion 19's definition of silent) while the stored mix — which layers are on,
      and every level — is unchanged; activating it again, or turning a layer on again, restores the
      same mix. Its label and state are announced, not carried by colour alone.
- [ ] 15. **The copy says what the thing is.** The dialog's title, its one-line description and every
      control label go through `antislop-copywriting`. Three content requirements: no label names a
      source the synthesis does not produce (no "Café", "Campfire", "Birdsong" — see "The layer set");
      the copy does not claim the sounds are recordings; and no control is described only by a cosmetic
      adjective. If the copy mentions that nothing is downloaded or uploaded, it must be true, and
      criterion 10 is what makes it true.
- [ ] 16. **State changes are announced, and nothing is announced on arrival.** Any message the mixer
      surfaces (a layer turned on, everything stopped, audio unavailable) appears as text in a live
      region that is **empty until an action produces it** — the 010 R-1 defect is not copied. Keyboard
      focus is never lost or thrown to the top of the page by a state change. If the browser refuses to
      start audio, the user is told in text, not left with a control that silently does nothing.

### E. Playback lifecycle
- [ ] 17. **Silent until she asks, every load.** On a fresh load of `/` with a non-default mix stored
      and layers marked on, **nothing is audible before a user gesture**: either no `AudioContext` has
      been constructed, or the one that exists is `suspended`. QA asserts this after a full reload and
      in a fresh context, and states which of the two it observed. The stored mix is still intact and
      the dialog shows it. This is the autoplay-policy consequence of ruling 3, and it is the correct
      behaviour, not a bug.
- [ ] 18. **A level change reaches the audio, and only that layer's.** The mapping from a control's
      value to an audible gain is a **pure exported function**, unit-tested with no `AudioContext`:
      monotonic, 0 at the minimum, its stated maximum at the maximum, and defined for every value the
      control can take. The live graph is observable through **one named, documented accessor** — a
      `data-*` attribute in the shape of `data-gauge-style` / `data-background`, or an exported
      read-only snapshot — reporting per layer its on/off and its current gain, plus the context state.
      Frontend names it in Implementation Notes **before QA starts**. Moving one layer's level leaves
      every other layer's reported gain byte-identical (asserted generically over the registry).
      **No test-only branch in shipped code**: no `if (window.__TEST__)`, no env check, no dead export
      that exists only for the suite — the accessor is a real part of the feature or it is a `data-*`
      attribute, and QA confirms which.
- [ ] 19. **Off means silent, not quiet-and-still-running.** With every layer off, or after the
      stop-everything control, the feature holds the audio hardware idle: the context is `suspended` or
      `closed`, or the master gain is exactly 0 with no source scheduled. QA states which, read through
      criterion 18's accessor. And **a level or on/off change does not produce a discontinuity**: gain
      is never assigned instantaneously on an audible node (frontend states the ramp it uses and its
      duration in Implementation Notes; QA greps the diff for a bare instantaneous gain assignment
      outside construction-at-zero and reports any it finds).
- [ ] 20. **Closing the dialog does not stop the sound. Client-side navigation does not stop the
      sound. A reload does.** Decided, not left to the implementation:
      - Closing the mixer **keeps playing.** The dialog is an adjustment surface, like the task list; a
        mixer that stops when you stop looking at it is not usable for a 25-minute run.
      - Navigating `/` → `/stats` → `/settings` → `/` **keeps playing**, with the mix unchanged and
        **without a second gesture** — the context count stays at exactly one across the round trip.
        She opens `/stats` mid-session; killing her rain for it is the wrong answer.
      - A full reload or a new tab **starts silent**, by criterion 17.
      - **The reachability consequence, asserted:** `/stats` and `/settings` carry no mixer control, so
        with audio playing QA confirms each of them offers a keyboard-reachable link back to `/`
        (`components/StatsDashboard.tsx:28`, `components/SettingsPanel.tsx:39`), putting a stop control
        **one navigation away**. If a future change removes those links, this criterion is what catches
        it.
- [ ] 21. **No leak, no growth, no orphan.** Across **five** open/close cycles of the dialog and
      **five** `/` ⇄ `/stats` round trips with audio playing, the number of `AudioContext`s stays at
      exactly one and the reported node/source count does not grow. Unmounting `/` for a real page
      unload releases the context. No `setInterval`, no `setTimeout` chain and no
      `requestAnimationFrame` loop is introduced by this feature — modulation is scheduled on the audio
      clock, not on a JS timer. QA also opens a second tab, starts audio in both, and **reports what it
      observes** (expected: two independent graphs, doubled sound) against the stated per-tab
      limitation — this one is a recorded observation, not a pass/fail on a fix.

### F. Measurement — contrast, both themes. *The only group a token change re-runs.*
Read CLAUDE.md "Measurement ordering" before starting this group. If anything in the palette is going
to move for this task, it moves first and this group is measured once.

- [ ] 22. **The bound, not a list: the mixer's ground is opaque, so the image sweep does not re-run.**
      The dialog paints on `--popover`, which is opaque in both themes — so neither the paper grain
      (`body::before`, behind all content) nor an uploaded background (010) composites under the faders.
      QA **proves** that rather than assuming it: with the most adversarial uploaded background from
      010's set active (pure white in light, pure black in dark — the two extremes that bounded 010's
      own band), the interior painted pixels of the dialog fill are identical to the no-background case
      in both themes. Once that holds, every figure in criterion 23 is taken against the flat
      `--popover` ground, once per theme, and **010's adversarial image set is not re-run for this
      feature.**
- [ ] 23. **The new pairs, measured from painted pixels, both themes.** Worst sampled pixel from a real
      browser screenshot — never a token-value calculation, never a mean (provenance: 005 quoted
      10.78:1 where painted pixels gave 9.79:1; 010 carried three wrong figures from the wrong pixel or
      the wrong ground, each costing a round). Each figure records **which theme and which pixel** it
      came from. The pairs:
      - every text label and value read-out in the dialog, against the dialog fill — **≥ 4.5:1**;
      - the fader's track edge and its thumb, against whatever each sits on — **≥ 3:1**;
      - the on/off control's edge in both its states, against the dialog fill — **≥ 3:1**;
      - the focus indicator's outer edge against the ground it meets — **≥ 3:1**, per the clause
        DECISIONS 2026-10-26 narrowed (against the ground, not against its own fill).
      Figures go in a table shaped like 009's, with the ground named for each row.
- [ ] 24. **The bottom-cluster trigger is measured by sameness, not by a second sweep.** The new
      trigger paints on the page ground, which *is* grained and image-backed — the expensive case. So
      the criterion is identity: QA asserts the trigger's **resolved** border, fill and glyph colours
      are identical to an already-measured control in the same cluster on the same ground
      (`components/SettingsButton.tsx`'s `variant="secondary"` with `border-control-border`, or
      `TaskListDialog`'s primary pill). Identical resolved colours on the same ground is the same
      ratio, by construction — so the recorded figures carry over and nothing is re-measured. **The
      escape hatch, stated so it is not a loophole:** if frontend gives the trigger any colour the three
      existing cluster controls do not already use, that pair **is** measured, against the worst painted
      ground recorded in DECISIONS 2026-10-26 (light 3.363, dark 3.546 for `--control-border` under the
      adversarial set), and the task says so in Implementation Notes.
- [ ] 25. **No palette change; a new token only with both values and its reason.** No existing token
      value in `:root` or `.dark` changes. If a role genuinely has no token, the new custom property
      carries 006 criterion 8's three-part reason comment (its role, why no existing token fits) and
      ships with **both** a `:root` and a `.dark` value, each with measured figures for every ground it
      is painted on, in the shape of `--control-border` and `--dialog-edge`. The `app/globals.css` diff
      contains nothing else: no edit to the unlayered `:focus-visible` rule, the `@layer base` block,
      the `@media (prefers-reduced-motion)` block, or any `@theme inline` mapping beyond a new token's
      own.
      **Direction guard for the deferred dialog-edge gap:** `e2e/uploaded-background-dialog-edge.spec.ts`
      records light's 2.00:1 `--dialog-edge` as a `test.fail`. It must still be a `test.fail` that still
      fails — if this task accidentally fixes or changes it, that spec passes and the suite goes red for
      the wrong reason. QA states its status.

### G. Motion, forced colours, accessibility
- [ ] 26. **`prefers-reduced-motion` is not a mute instruction, and nothing here animates anyway.**
      Decided explicitly, because this is the one place the question has a wrong-but-tempting answer:
      - **Audio is not motion. Reduced motion does not change whether sound plays, which layers play, or
        at what level.** Asserted both ways: under `emulateMedia({ reducedMotion: "reduce" })` the mixer
        plays with the identical reported gains as under `no-preference`, and silencing it still
        requires the user's control.
      - **Any animated level indicator *would* be covered by reduced motion — so none ships.** No
        meter, waveform, spectrum, pulsing icon or looping transition exists in this feature under any
        motion preference. Asserted the way 010's criterion 28 does: with audio playing and the timer
        **idle**, two frames sampled 1 s apart are identical and **zero** `requestAnimationFrame`
        callbacks fire over that second (timer running is the positive control, so the assertion cannot
        pass vacuously). At most a single opacity transition on the dialog, inherited from the existing
        `DialogContent`, suppressed under reduce by the existing block.
- [ ] 27. **Forced colours.** Under `emulateMedia({ forcedColors: "active" })` every control in the
      mixer keeps a visible edge and a visible state, and **on/off and level are not carried by colour
      or by font weight alone** — the 008 R-1 defect (`box-shadow` goes to `none` and every border
      collapses to one system colour under forced colours, CSS Color Adjust 1 §3.2) is not reproduced on
      a new surface. Each assertion is paired with a default-mode equivalent so it cannot pass
      vacuously.
- [ ] 28. **Axe, two themes, two viewports.** No axe-core violation of serious or critical impact on
      `/` with the mixer open, in light and dark, at 320 px and 1280 px, with audio playing and with it
      stopped.
- [ ] 29. **320 px survives a fourth control.** The bottom cluster now holds four controls: at 320 px
      and 1280 px, in both themes, every one of them is still at least 44 × 44 px, none overlaps
      another, and `document.documentElement.scrollWidth <= clientWidth` holds on `/` and with the
      dialog open. The mixer dialog itself fits at 320 px with every fader reachable, and does not
      exceed the viewport height without its own scroll region. QA reports the cluster's measured width
      at 320 px.

### H. Guards and gates
- [ ] 30. **The token guards pass, including the trap in them.** Every file this task adds or changes
      carries zero raw palette utilities and zero colour literals per
      `components/palette.tokens.test.ts`; QA asserts each new file is picked up by that test's
      directory walk, that `ALLOWED_RAW_UTILITIES` is still `{}` and `ALLOWED_LITERALS` still has its
      single entry, and proves the guard live by break-and-restore.
      **Three traps, named so nobody discovers them in review:**
      (a) that test's `INLINE_STYLE_COLOR` regex (`palette.tokens.test.ts:53`) flags **any**
      `style={{ … background … }}` — and painting a range input's filled track via an inline
      `linear-gradient` background, or a custom property whose *name* contains `background`, is the
      single most likely implementation of a fader. `INLINE_STYLE_EXEMPTION` (lines 72-76) is a single
      object, **not a map**, so a second exemption means restructuring that test. Either avoid the
      inline style or land the restructured exemption, with an exact expression and a reason, in the
      same diff.
      (b) that file's `SCANNED_DIRS` guard asserts `SCANNED_DIRS` equals exactly the top-level
      directories containing `.tsx` files — so a `.tsx` file placed in a new top-level directory fails
      it. Components go in `components/`; the synthesis and registry go under `lib/` as `.ts`.
      (c) `components/TimerGauge.tokens.test.ts`'s "no new time source" guard is extended to every
      component file this task adds, and passes — criterion 21 is the same rule stated behaviourally.
- [ ] 31. **The existing suites pass with nothing weakened.** `components/token-dark.test.ts` and
      `components/token-foundation.test.ts` pass **unchanged** (no token moved, criterion 25). Every
      existing spec in `e2e/` passes with **no assertion weakened and none removed**; QA lists any
      changed assertion with its reason.
- [ ] 32. **Gates and non-vacuity.** `npm run lint` (0 errors, warnings no higher than the baseline on
      the tree QA was handed), `npm run typecheck`, `npm run build`, `npm run test` and
      `npm run test:e2e` all succeed. **The baseline is `f3f5869`, measured by the orchestrator on
      2026-10-27 after 010 was committed: 871 unit tests in 26 files, `typecheck` exit 0, `lint` 0 errors
      and 21 warnings, e2e ~587 (010's recorded run, not re-measured).** 010's reports say 872 unit; one
      of those was a guard that diffed `app/globals.css` against `HEAD` and so inverted the moment 010 was
      committed, failing because the work had shipped. It was removed (its durable twin is
      `components/token-foundation.test.ts:85`), which is why the floor is 871 and not 872.
      Zero console errors or warnings in both themes across the whole flow:
      load `/`, open the mixer, turn each layer on, move each fader, stop, close, navigate away and
      back, reload, start/pause/resume/complete the timer with audio playing. No `any`; functional
      components; named exports. New tests cannot pass vacuously — none of the four shapes in the
      2026-10-09 DECISIONS entry (assertion inside `try`/`catch`, assertion inside `if`/`else`, an
      observer that may never attach, a `toBeVisible()` on something already true), and none with zero
      assertions. **Break-and-restore (hash-verified) for four criteria:** silent-before-gesture (17),
      the malformed-mix degradation (5), survival across client-side navigation (20), and the
      level-to-gain mapping (18).

## Files likely touched

**Frontend:**
- `widgets/BottomControls.tsx` — a fourth control in the cluster.
- A mixer component under `components/` (trigger + dialog in one file, the `TaskListDialog.tsx`
  pattern), plus a fader component if the four faders share one.
- A new module under `lib/` — e.g. `lib/audio/` — holding the layer registry, the source interface, the
  four sources and the pure level→gain mapping. `.ts` only, per criterion 30(b).
- `hooks/use-*.ts` for the React binding to the graph, if one is needed.
- `lib/preferences/schema.ts` — field on `Preferences`, default in `PREFERENCE_DEFAULTS`, a validator,
  one `pick` line, one line in `isPreferences`. `PREFERENCES_VERSION` unchanged.
- `lib/preferences/store.ts` — one `partialize` entry, one setter.
- `app/globals.css` — **only** if a role genuinely has no token (criterion 25).
- `docs/DECISIONS.md` as a draft for the orchestrator (criterion 2).

**QA only:** `lib/audio/*.test.ts`, `lib/preferences/preferences.test.ts`, `components/*.test.tsx`,
`components/*.tokens.test.ts`, `e2e/**` (a new spec, likely `e2e/soundscape-mixer.spec.ts`).

**Not touched:** `lib/timer/**`, `lib/stats/**`, `lib/db/**`, `lib/preferences/boot-script.ts`,
`hooks/use-timer-clock.ts`, `hooks/use-hydrate-timer-store.ts`, `widgets/HeaderNav.tsx`,
`components/ThemeControl.tsx`, `components/ThemeSync.tsx`, `components/SettingsPanel.tsx`,
`components/BackgroundControl.tsx`, `components/BackgroundLayer.tsx`, `components/Timer*.tsx`,
`components/SloshGauge.tsx`, `components/HoldButton.tsx`, `components/ModeSelector.tsx`,
`components/Task*.tsx`, `components/Stats*.tsx`, `app/stats/**`, `app/settings/**`, `package.json`.

## Risks
- **The headline risk is that it sounds bad, and no acceptance criterion can catch that.** Every
  criterion here is structural: a gain value, a context state, a request count. None of them fails if
  the rain is a hiss. The owner ruling accepts synthesis knowing this; the mitigation is that the four
  layers are the four the ruling itself called convincing, and that **the owner listens before this is
  called done** — that judgement is hers, it is not QA's, and no agent should record a verdict on
  timbre. If a layer is unconvincing, the answer is to cut it to three, not to reach for a file.
- **Clicks and zipper noise on level changes.** Assigning a gain instantaneously on a running source
  produces an audible click, and a fader dragged in steps produces zipper noise. Inaudible to the test
  suite, obvious to the user. Criterion 19 is the structural proxy; it is a proxy, not a proof.
- **A browser that refuses to start audio.** Autoplay policy, an OS-level mute, a context that starts
  `suspended` and never resumes, Safari's stricter gesture rules. A control that silently does nothing
  is the failure mode. Criterion 16.
- **The `AudioContext` leak.** One context per dialog open is the classic bug, and Chromium has
  historically capped contexts per document — so the sixth open stops working, which a single-open test
  never catches. Criterion 21 opens it five times for that reason.
- **CPU and battery on a page open for hours.** Four noise sources and their modulation running through
  a three-hour study session, on a laptop. `ScriptProcessorNode` is banned by criterion 8 because it
  does per-sample work on the main thread; criterion 19 requires the hardware actually idle when
  everything is off.
- **The fader is the single most likely place to trip the inline-style palette guard.** Criterion
  30(a). Worth reading before writing the component, not after the test goes red.
- **A native `<input type="range">` is hard to style consistently and easy to style badly.** The
  temptation is a custom div-based slider, which then has to re-earn keyboard operation, the value
  announcement, the focus ring and forced-colours survival — four things the native element gives for
  free. Criterion 12 deliberately states the requirements rather than the element, so the choice is
  frontend's; the risk is that the custom route costs three criteria to recover what one element
  already had.
- **"Zero network requests" is easy to state and easy to fail dishonestly.** Next.js loads its own JS
  over the network continuously; an `AudioWorklet` module is a same-origin JS fetch. Criterion 10 is
  worded around that on purpose — read its precision clause before writing the assertion, or QA will
  either fail a correct implementation or pass a wrong one.
- **Two tabs double the sound.** Stated and accepted (criterion 21), but it will look like a bug the
  first time it happens.
- **`persist` rewrites malformed bytes.** DECISIONS 2026-10-23: a test asserting the stored entry is
  left untouched after a bad read is testing the opposite of the documented behaviour. Criterion 5.
- **Next.js version.** Per `AGENTS.md`, read the relevant guide in `node_modules/next/dist/docs/`
  before adding a client boundary or touching anything in `app/`. App Router conventions in training
  data may not match this version. The audio graph is browser-only, so the client/server boundary is a
  real consideration: nothing here may run during a server render, and `lib/preferences/schema.ts`'s
  header comment ("no React, no DOM access at import time, so it is safe to import from a server
  component") is the constraint that the registry must also satisfy if the schema imports it.
- **Scope gravity.** Presets, a master fader, a visualizer and a timer-linked mode are each one small
  step from what ships here, and each is explicitly out. The visualizer in particular would break an
  assertion already in the suite (Scope/Out, criterion 26).

## Process note — antislop
**antislop mode for this task is `during`, chosen by the owner in this session.** Any agent picking
this up applies the antislop rules while building and **does not re-ask the mode question**. Announce
`antislop active: during (session override).` before the first UI edit and run the Delivery Gate. The
relevant skill files are listed in CLAUDE.md; `antislop-ui`, `antislop-human` and `antislop-code` all
apply here, and criterion 15's copy goes through `antislop-copywriting`. (005, 006, 007, 008, 009 and
010 all record the same mode and the same source.)

## Implementation Notes
(Filled in by frontend as it builds. Decisions, tradeoffs, anything the next agent needs to know.)

**Required before QA starts** — criteria 18, 19 and 24 each depend on one of these:
- the four layer ids as shipped, and the exported name of the registry and of the source interface;
- the exact persisted value shape, and confirmation that `PREFERENCES_VERSION` is unchanged;
- **how QA observes the live mix** — the named `data-*` attribute or exported read-only snapshot, in
  the shape of `data-gauge-style` / `data-background`;
- the context lifecycle: when it is constructed, when it is resumed, when it is suspended or closed;
- the ramp used for level and on/off changes, and its duration;
- whether the bottom-cluster trigger reuses an existing control's resolved colours (criterion 24) or
  introduces a new one, in which case the measured figures.

**Frontend notes (011).**

- **Layer ids, registry, interface.** Ids `rain`, `wind`, `waves`, `hum`. The registry is `LAYERS` in `lib/audio/layers.ts` (`{id, label, source}`); the interface is `LayerSource` in `lib/audio/types.ts` (`create(ctx, noise, output): LayerVoice`). The four implementations (`rainSource`, `windSource`, `wavesSource`, `humSource`) in `lib/audio/sources.ts` are the only ones. A fifth layer is one `LAYERS` entry plus a source. The validator, the default mix, the dialog and the engine all iterate `LAYERS` at call time.
- **Persisted shape.** One new `Preferences` key, `mix`: `{ [layerId]: { on: boolean, level: integer 0..100 } }`, about 150 bytes. `PREFERENCES_VERSION` is unchanged at 1 (per-key fallback, the `gaugeStyle` precedent). No second key, store or Dexie table; the escape hatch was not needed. `sanitizeMix` falls back per layer and per field: unknown ids dropped, missing layers and fields take `{on:false, level:50}`, and an out-of-range, fractional or non-numeric level takes the default (not clamped, so a corrupt value never turns loud). A non-object mix becomes the default mix. Setter is `setMix` in `lib/preferences/store.ts`; `isMix` is the `isPreferences` line.
- **Observability accessor (criterion 18).** A real part of the feature, not a test branch: the dialog trigger (`Ambient sound`, bottom cluster, always mounted on `/`) carries `data-soundscape` (JSON of `SoundscapeSnapshot`) and `data-soundscape-context` (`none | suspended | running | closed`). Shape: `{context, playing, contexts, nodes, layers: {<id>: {on, gain}}}`. `on` means audible (playing and the layer is on); `gain` is the ramp target, rounded to 4 places (0 when not audible), so it is deterministic. The same snapshot is the exported read-only `soundscape.getSnapshot()` from `lib/audio/engine.ts`, which the trigger and dialog read through `useSoundscapeSnapshot` in `hooks/use-soundscape.ts`. Note: with the dialog open Radix aria-hides the trigger, so read the attribute with a CSS selector (`[data-soundscape]`), not `getByRole`.
- **Level to gain (18).** `levelToGain` in `lib/audio/gain.ts`: `MAX_LAYER_GAIN (0.5) * (level/100)^2`, clamped, 0 for non-finite. Monotonic, 0 at 0, 0.5 at 100. Constants `LEVEL_MIN`, `LEVEL_MAX`, `DEFAULT_LEVEL`.
- **Ramp (19).** Every audible change goes through `ramp()` in `lib/audio/engine.ts`: `cancelScheduledValues(now)` then `setTargetAtTime(target, now, 0.04)`, an exponential approach with a 40 ms time constant (about 95% at 120 ms). Exported as `RAMP_TIME_CONSTANT_SECONDS`. The only direct `gain.value =` assignments are at construction (to 0 on the per-layer level node and on each voice's fade node) and on non-audible-at-that-moment constants inside a voice before it is connected (filter frequencies, LFO depths, partial levels).
- **Context lifecycle.** The engine is a module-level singleton, so closing the dialog and client-side navigation do not touch it. The context is created (never before) inside the click handler that first asks for sound, with `latencyHint: "playback"`, and `resume()` is called synchronously in the same handler. Turning a layer on sets playing true. Everything off, or "Stop all sound": voices fade out and stop at +0.4 s on the audio clock, and a `ConstantSourceNode` scheduled to end at +0.5 s suspends the context in its `onended`, unless a later `apply` has overtaken it (generation counter). No `setInterval`, `setTimeout` or `requestAnimationFrame` anywhere in `lib/audio`, the hook or the dialog; modulation is oscillator LFOs wired to AudioParams. There is no `close()`: one context for the page lifetime, released by the browser on unload. Reload starts with `context: "none"`, 0 contexts, and the stored mix intact in the dialog.
- **Failure text (16).** If `resume()` rejects or the state is not `running` afterwards, the dialog says "Your browser did not start the sound. Press Start sound to try again."; no `AudioContext` gives "This browser cannot play generated audio." The status `<p role="status">` is always in the DOM and empty until an action sets it. Level drags set no message (the slider announces its own value via `aria-valuetext`, "50 percent").
- **Controls.** Native `<input type="checkbox">` per layer (visible label, "On, 50%" text beside it, `aria-hidden` because the checkbox already announces state) and native `<input type="range">` per layer (`aria-label` "Rain level", 0 to 100, step 1, 44 px tall). "Stop all sound" / "Start sound" is a plain button whose text is the state; with nothing switched on, Start says "No layer is on yet. Turn one on to hear it." instead of doing nothing silently. Closing the dialog keeps playing; navigation keeps playing; `/stats` and `/settings` are untouched.
- **Inline-style trap (30a).** Avoided: the fader has no painted fill and no inline style. Track and thumb are styled with Tailwind pseudo-element variants on tokens (`bg-muted`, `border-control-border`, `bg-primary`, `border-popover`); the percentage text is the value indicator. `INLINE_STYLE_EXEMPTION` untouched. Forced colours: track and thumb have real borders, and the thumb and checked checkbox use the `Highlight` system colour under `forced-colors:`.
- **Criterion 24.** The trigger reuses `SettingsButton`'s class set (`variant="secondary"`, `border-control-border`, same focus classes), so its resolved colours are the same. No new colour. No change to `app/globals.css`, no new token.
- **Noise.** Buffers are generated sample by sample in JS (`lib/audio/noise.ts`, 6 s white/pink/brown per context) and looped; no decode, no fetch, no media element. Each voice starts its noise at a random offset.
- **Gate results and the 53 failing tests (needs QA).** `typecheck` 0, `lint` 0 errors / 21 warnings (baseline), `build` routes still `/ /_not-found /settings /stats`. `npm run test`: 826 passed, **53 failed**, all in `lib/preferences/preferences.test.ts` (30) and `lib/preferences/gauge-style.test.ts` (23). Every one is an exact-shape assertion on the three-key `Preferences` (`toEqual({theme, gaugeStyle, background})`, `isPreferences({...})` without `mix`, the stored `state` keys) that cannot hold once a fourth key exists. I did not edit tests. QA should extend each expectation to include `mix` (the default mix `defaultMix()`), which strengthens rather than weakens them. Nothing else failed (the palette and token guards pass with the new files). A manual Chromium smoke at 320 px (scratch script, not committed): context `none` before the first click, `running` with one context after it, "Stop all sound" gives `suspended`, Start returns `running`, reload gives `none` with 0 contexts, no console errors or warnings, `scrollWidth <= clientWidth`.
- **Not done / for the owner.** Timbre is unjudged by design; the owner listens. Cross-tab doubling is as stated in criterion 21. Not measured by me: groups F, G (axe, forced colours) and the 44 px cluster check at 320 px beyond the overflow check.

**Drafted `docs/DECISIONS.md` entry (criterion 2), for the orchestrator to land:**

> ### 2026-10-27, Ambient soundscape mixer (task 011)
> Four layers ship, ids `rain`, `wind`, `waves`, `hum`, declared once in `lib/audio/layers.ts`; a fifth is a registry entry plus a source behind the `LayerSource` interface. Persisted as one `lib/preferences/` key, `mix`: `{ [layerId]: { on: boolean, level: integer 0 to 100 } }`, about 150 bytes, validated per layer and per field. `PREFERENCES_VERSION` stays 1 because `sanitizePreferences` falls back per key, the same reason `gaugeStyle` and `background` needed no bump. Levels persist independently of on/off. Playback state is deliberately not persisted: autoplay policy requires a user gesture before audio can start, so a reload starts silent with the mix intact, and the AudioContext is not even constructed until the first click that asks for sound. Closing the dialog and client-side navigation do not stop the sound (the engine is a module-level singleton); a reload does. Playback is per-tab: two tabs are two graphs and double the sound, accepted and not solved. Gain changes ramp (`setTargetAtTime`, 40 ms time constant) and an idle context is suspended on the audio clock, no JS timer. No asset provenance entry is needed because nothing is sourced: every sample is synthesized in the browser and no audio file ships.


### Fix round 1 (criteria 16 and 23)

- **Message ordering (16).** `hooks/use-soundscape.ts` holds a `latestAction` ref. `commit()` takes `++latestAction.current` before calling `apply`, and the `.then` returns early unless its id is still the newest. The "No layer is on yet" message also bumps the id, so a late settle from an earlier action cannot overwrite it. Level drags announce nothing and do not bump. The live region still starts empty and nothing moves focus.
- **Interleavings checked by reasoning (the ref compares ids, so order of settling is irrelevant):** start then stop (the pinned test, now green), stop then start, two rapid layer toggles (only the second announces), a layer toggle during a pending stop-all (the toggle announces), and a pending start followed by the no-layer-on message. A failure result (blocked or unsupported) from a superseded action is dropped as well, which is intended.
- **Track border (23).** Both track borders are now `border-2` with the reason in a comment above `trackClass`. No inline style, colour literal, token or `globals.css` change; `--control-border` still colours the track.
- **Thumb offset.** Measured in Chromium by painting the thumb over a track with a 2 px border. The track pseudo-element is content-box (preflight's `box-sizing` does not reach slider pseudo-elements), so the track is 12 px tall now, 10 px before. `-mt-2` centres the thumb exactly on a 12 px track (rows 10 to 33 in a 44 px input), so it stays. With the old 1 px border it sat 1 px off. Firefox positions its thumb itself.

### Fix round 2 (review findings R-1 and R-2)

- **R-1, structural.** `build()` in `lib/audio/engine.ts` now derives a layer's `on` as `playing && entry.on && ctx !== null && (ctx.state === "running" || resumesInFlight > 0)`, and `gain` follows `on`. `resumesInFlight` counts resumes asked for and not yet settled, and is decremented before the settle's `publish()`. So `on` cannot stay true once a resume is refused or fails: the invariant holds by construction in `build()`, not by two `return "blocked"` sites agreeing. The pending-resume clause is deliberate: a strict `state === "running"` version failed three existing criterion 16 interleaving tests that press Stop while a start is still pending, because the button read "Start sound" in the 50 to 200 ms first-open window. Wording of the invariant is therefore "on is never true unless running or starting". `playing` keeps its meaning (sound was asked for) and stays true after a refusal, so a retry is one press: the button reads "Start sound", `toggleAll` calls `commit(mix, true)`, and `apply` calls `resume()` again. "All sound stopped" can no longer announce for a start that never happened. The `SoundscapeSnapshot.layers` doc comment states the rule.
- **R-2.** After `await resuming` settles (fulfilled or rejected), `apply` re-reads `soundWanted()` (live `playing` and `mix`, a new helper that `apply` also uses for its own `wanted`) and calls `suspendWhenSilent(context)` when nothing is wanted. This is generation-safe because it reads current state, not a captured value. If a later `apply` wants sound, no marker is scheduled; if it also scheduled one, two markers are harmless. It composes with R-1: the rejected path now shares the same tail, and the returned result is `blocked` unless the promise fulfilled and the state is `running`. No timer added.
- **Unchanged.** No `gain.value` assignment added, no `globals.css` or token change, nothing under `lib/timer`, `lib/stats`, `lib/db`, `boot-script.ts` or the timer hooks. Criterion 20 lifecycle untouched.
- **Suggested e2e assertion for R-1 (for QA).** In a spec that stubs `AudioContext.prototype.resume` to reject (the criterion 16 refusal case): after the failure message appears, assert `getByRole("button", { name: "Start sound" })` is visible and `"Stop all sound"` is not, and that `[data-soundscape]` parses to every `layers.<id>.on === false` while `context === "suspended"`.

## QA Report
(Filled in by qa. Run 2026-10-27 on baseline `f3f5869` plus the uncommitted 011 tree.)

- Verdict: **FAIL**
- Failing criteria: **2** (DECISIONS entry not landed), **16** (a stale layer message overwrites the stop-all announcement, unit-red), **23** (fader track edge, checkbox edges and focus ring sit below 3:1 as painted, both themes), **32** (aggregate: one unit test red, so the unit gate is not green).
- Passing: 1, 3, 4, 5, 6 (with a finding), 7, 8, 9, 10, 11, 12, 13, 14, 15, 17, 18, 19 (with a grep note), 20, 21, 22, 24, 25 (with a note), 26, 27, 28, 29, 30, 31.
- Suite totals: unit **958 passed, 1 failed of 959** (was 826/53 of 879 at handover). Official `npm run test:e2e`: **627 passed, 2 failed, 2 skipped** (both failures are criterion 23's measurement spec, expected red; the 2 skips are pre-existing `task-list-dialog` cases). `typecheck` 0. `lint` 0 errors, 21 warnings (baseline 21). `build` passes (routes `/`, `/_not-found`, `/settings`, `/stats`).

### Method and cost
- Build used for the browser runs: a verbatim copy of the tree (diff-verified app code) built once and served on **:3100** (`npx next start -p 3100`, scratch config `e2e/qa-011.config.ts`), never :3000. The real-tree `npm run build` was not run, because it would rewrite `.next` under the live :3000 dev server. The official `npm run test:e2e` ran against :3000 as configured.
- Break-and-restore was done in a scratch copy of the tree, not the real tree. The real files were hash-checked (sha256) before each break and after each restore: unchanged in every case, and the scratch copy restored to the real hash every time.
- Group F was taken once per theme from one screenshot each (the 010 sampler `paintedColours` in `e2e/helpers/background.ts`, reused). Two earlier passes of the measurement spec failed on harness bugs (a bad locator, a bad probe), not on palette values; no token moved between passes.

### Criterion by criterion

| # | Verdict | Evidence (proof level) |
|---|---|---|
| 1 | PASS | Built on `f3f5869`. 010 frontmatter `status: done`; `docs/PLAN.md` line 22 ticked. 010 criteria not re-verified. |
| 2 | **FAIL** | `grep "Ambient soundscape" docs/DECISIONS.md` finds nothing: the drafted entry in Implementation Notes has not been landed. Draft content matches the wording (ids, shape, `PREFERENCES_VERSION` 1, playback not persisted, stop/no-stop cases, per-tab, no provenance line). Blocking only on landing. |
| 3 | PASS | `git diff f3f5869 --stat` empty for `lib/timer`, `lib/stats`, `lib/db`, `boot-script.ts`, both hooks, `package.json`, `package-lock.json`. No `lucide-react` import (grep). `boot-script.test.ts` unchanged and green. |
| 4 | PASS | One key, `pomotato-preferences` (only in `schema.ts`). `setMix` setter, `partialize` entry, validator and `isMix` line present; `PREFERENCES_VERSION` still 1. Level survives mute/unmute/reload for every `LAYERS` id (`lib/audio/mix.test.ts`, unit). |
| 5 | PASS | Table of 13 malformed mix shapes, 4 malformed envelopes (unparseable, newer version, older version, mix absent), and the literal shipped payload; each keeps theme, gaugeStyle, background; the shipped payload gains the default mix (unit). Break-restore: 8 red. Proof: unit. |
| 6 | PASS by wording, **finding** | Default entry 211 chars; all four on at level 80: 207 chars (growth −4, under 1 KB); one `pomotato-preferences` key; state keys `background, gaugeStyle, mix, theme`; envelope `version: 1`. Drag 0→100 (300 mouse steps past both ends): pointer moves 301, range input events 100 (second run 99), `setItem` on the prefs key 100 (second run 99), final control 100, final stored level 100. Writes track value changes, not pointer events. **Finding:** each value step is one synchronous `localStorage.setItem`, so a full drag writes about 100 times; there is no commit on release. Not failed (criterion states no release rule). |
| 7 | PASS | `git ls-files -co --exclude-standard` (tracked and untracked, minus ignored) plus a source scan of shipped `.ts/.tsx/.js/.jsx/.mjs/.html`: no audio extension, no `<audio`, `new Audio(`, `createMediaElementSource`, `decodeAudioData`, `data:audio/`, base64 audio literal. Liveness: the test writes one dummy per rule into a scratch dir and requires each to be caught (all 7). Unit. |
| 8 | PASS | Mixer on: one context, `running`, `contexts` 1; no `audio`/`video` element in the DOM (e2e). Unit fake shows node kinds buffer and oscillator; no `createScriptProcessor` (grep). |
| 9 | PASS | `LAYERS` is the only list. Throwaway fifth entry via a module mock: dialog renders 5 sliders (`components/SoundscapeDialog.registry.test.tsx`), validator accepts and store round-trips level 33. Interface `LayerSource` (`lib/audio/types.ts`); exactly four implementations (`rainSource`, `windSource`, `wavesSource`, `humSource`). Unit. |
| 10 | PASS | Whole flow (load, open, layers on, faders, stop, close, `/stats`, `/settings`, back, reload): 0 responses with an `audio/` or `video/` type, 0 requests to an origin other than the app's. Audio segment with `setOffline(true)` after load: Start gives playing, Stop gives not playing. Same-origin JS is not counted, as the criterion allows; no `AudioWorklet` is used. e2e. |
| 11 | PASS | `widgets/BottomControls.tsx` order: TaskList, Ambient sound, Stats, Settings. Trigger and dialog in one file, `components/SoundscapeDialog.tsx`, on `components/ui/dialog`. Routes unchanged (scratch build; see Method). |
| 12 | PASS | e2e: Tab order checkbox then fader, per layer, in DOM (visual) order; focus outline `solid`, `2px`, offset `2px`, colour equal to the resolved `--ring` (computed probe), on every fader; Home/End/ArrowRight reach 0, 100 and 37 with `aria-valuetext` following; Space toggles each checkbox. Native `input[type=range]`. Unit: `LAYERS.length` sliders, each named `"<label> level"`, announced as `"N percent"`. |
| 13 | PASS | e2e enumerates every `input` and `button` in the dialog: all enabled. Unit: each checkbox, slider and the stop control changes state. Markup has no landmark `<div>` (the divs are layout only). |
| 14 | PASS | e2e: Stop gives `playing` false, every layer `on: false, gain: 0`, context `suspended` within 3 s (audio clock, not a JS timer), stored mix byte-identical; Start restores the same mix (rain gain reported equal). Unit: "All sound stopped. Your mix is kept." (see 16 for the stale-message case). |
| 15 | PASS | Dialog text contains "generated in your browser", and none of Caf, Campfire, Birdsong, Morning birds, Rainforest, recording(ed), sample. Layer labels are exactly Rain, Wind, Waves, Hum. "Nothing downloaded" is true by 10. Wording review under antislop-copywriting is process, not tested here. e2e. |
| 16 | **FAIL** | Empty status on open, "Wind on." after a checkbox, focus kept on the checkbox, and "Your browser did not start the sound. Press Start sound to try again." when `resume()` is refused: all pass (e2e). **FAIL:** when a stop follows a layer's first gesture before that gesture's `resume()` settles, the earlier "Rain on." message lands last and overwrites "All sound stopped. Your mix is kept." Deterministic in jsdom (unit). See repro. |
| 17 | PASS | Fresh load with rain stored on, and a fresh browser context with the same storage: `context` `none`, `contexts` 0, `playing` false; dialog shows rain checked at 80; stored mix intact. QA observed the **"no AudioContext constructed"** state (not `suspended`). Break-restore (unit): red, restored. |
| 18 | PASS | `levelToGain` is pure: 0 at 0, 0.5 at 100, strictly increasing over every integer 0..100, finite for NaN and ±Infinity (`lib/audio/gain.test.ts`). Accessor is the trigger's `data-soundscape` (and `soundscape.getSnapshot()`), a real feature attribute, no test-only branch (grep: none). e2e: moving one layer leaves every other layer's `gain` byte-identical, looped over `LAYERS`. Break-restore (unit, monotonic break): 3 red, restored. |
| 19 | PASS, grep note | Four direct `gain.value =` assignments: `engine.ts:128` and `engine.ts:190` (level and fade nodes constructed at 0, before any voice connects); `sources.ts:48` (LFO depth on a modulation node, not an audible output); `sources.ts:84` (a voice's internal base level, 0.06 to 0.6, set at construction while the voice's fade is 0, so inaudible at that moment). A strict reading would list `sources.ts:84` as a non-zero construction assignment; it is not an instantaneous change on an audible node. Unit: after a voice exists, a level change or a layer switch makes 0 direct writes and ramps via `setTargetAtTime`. Off: suspended after 0.5 s of audio clock (e2e). |
| 20 | PASS | e2e: Escape keeps playing (context `running`, `playing` true after 300 ms); `/` to `/stats` to `/settings` to `/` keeps playing, `contexts` 1, rain level unchanged, a `window` marker survives (no reload); `a[href="/"]` visible and focusable on `/stats` and `/settings`. Break-restore (unit, unmount-stops): red, restored. |
| 21 | PASS | e2e: 5 open/close cycles plus 5 round trips: `contexts` 1 throughout; node count 13 at every checkpoint (`10 cycles: 13, 13, ..., 13`). Unit: the same across 5 cycles, and repeated applies do not grow the graph. Reload gives 0 contexts in the new document; the old context's release is by the browser and is not directly observable. **Observed, not a pass/fail:** two tabs started both: tab 1 `running`/playing, tab 2 `running`/playing, two independent graphs (per-tab limitation as stated). |
| 22 | PASS | Adversarial bound: white (light) and black (dark) as the uploaded background, against the no-background case. Fill strip (8 by 40 px inside the dialog padding), one screenshot each: light `(255,250,243)` x 320 px in both cases, histograms identical; dark `(30,22,16)` x 320 px, identical. 010's six-image set not re-run. |
| 23 | **FAIL** | See the table below. Text, thumbs, the dark checked checkbox and the dark focus ring pass. The track edge (both themes), the unchecked checkbox edge (both themes), the light checked checkbox edge and the light focus ring fail. |
| 24 | PASS | Trigger and `SettingsButton` (`a[href="/settings"]`) resolve identically in both themes: light border `rgb(122,117,111)` 1 px, fill `rgb(245,245,244)`, glyph `rgb(68,64,60)`, radius 11.2 px, 44 by 44; dark border `rgb(138,121,104)`, fill `rgb(43,33,24)`, glyph `rgb(226,213,194)`. Same class set, no new colour. Carried-over figures (DECISIONS 2026-10-26, page ground under the adversarial set): light `--control-border` 3.363 (black or split), dark 3.546 (white or split). Not re-measured. |
| 25 | PASS, note | `git diff f3f5869 -- app/globals.css`: 0 lines, no new token, no palette change. Direction guard: 010's `e2e/uploaded-background-dialog-edge.spec.ts` no longer contains `test.fail` (its comment at line 115 says 010 replaced it with pinned bounds). Its light test asserts the edge sits between 1.5 and 3:1 and passes in the official run; it goes red if the edge is lifted. Intent held, mechanism differs from the criterion's wording. |
| 26 | PASS | Gains with rain 50 and wind 80 under `reducedMotion: reduce` and `no-preference` are identical (JSON compared); Stop still needs the control in both. With audio playing and the timer idle, `requestAnimationFrame` count over a settled second is **0**, DOM and snapshot identical at both ends. Positive control, timer running: **5** frames in one second. Static: no `setInterval`, `setTimeout` or `requestAnimationFrame` in `lib/audio`, the hook or the dialog. |
| 27 | PASS | Forced colours `active` and `none`, paired. Checkbox border 2 px in both modes. Track edge row against its interior and fill, one screenshot: forced `active` edge `(128,128,128)` vs interior and fill `(255,255,255)`; default `(189,183,177)` vs `(245,245,244)` and `(255,250,243)`. State carried by text ("On, 60%") and the checked property, not colour alone. Stop control keeps a border. |
| 28 | PASS | axe-core, `wcag2a/wcag2aa/wcag21a/wcag21aa`, serious and critical: 8 cases (light and dark, 320 and 1280, playing and stopped), 0 violations. A first attempt flagged `color-contrast` on the stopped runs; the cause was sampling during the dialog's 0.2 s fade. It passes once the animations settle, and the test now waits for them. |
| 29 | PASS | At 320 by 720 and 1280 by 800, both themes: four cluster controls, each at least 44 by 44, no overlaps; **cluster width 200 px at 320 px**; `scrollWidth <= clientWidth` on `/` and with the dialog open; dialog height within the viewport; each fader in view or inside the dialog's own scroll region. |
| 30 | PASS | `components/palette.tokens.test.ts` walks `components/`, `hooks/`, `widgets/` and `app/`, so `SoundscapeDialog.tsx`, `hooks/use-soundscape.ts` and `widgets/BottomControls.tsx` are covered; `ALLOWED_RAW_UTILITIES` still `{}`; `ALLOWED_LITERALS` still one entry. Break-restore (scratch, palette level): `bg-red-500` added to the dialog turns the guard red, restored. Traps: (a) no `style={{` in the new files (grep); (b) `SCANNED_DIRS` unchanged, no `.tsx` in `lib/`; (c) `components/TimerGauge.tokens.test.ts` extended to the dialog, the hook and every `lib/audio/*.ts`, and passes. Note: `lib/audio/*.ts` sit outside the palette walk by design (criterion 30(b)); they contain no colour literal (grep). |
| 31 | PASS, with listed changes | `components/token-dark.test.ts` and `components/token-foundation.test.ts` unchanged. Official e2e: no existing spec failed except the pinned-shape cases fixed below. Changed existing assertions, each extended with the default `mix` key and none removed or weakened: `lib/preferences/preferences.test.ts` (exact-shape expectations, key list, `setState` default), `lib/preferences/gauge-style.test.ts` (same), `e2e/dark-theme-control.spec.ts` (exact envelope string and key list, line 178-179), `e2e/settings-gauge-style.spec.ts` (key list, line 387), `e2e/uploaded-background.spec.ts` (key list, line 53). `components/TimerGauge.tokens.test.ts`: file lists extended only. |
| 32 | **FAIL** | `typecheck` 0; `lint` 0 errors, 21 warnings (baseline); `build` passes (scratch copy). Unit: 958 pass, 1 fail (criterion 16). Official e2e: 627 pass, 2 fail (criterion 23 measurement, expected). Zero console errors or warnings in both themes across load, open, each layer on, each fader moved, stop, close, navigate, reload, timer start/pause/resume (`soundscape-mixer.spec.ts`, criterion 32 block). No `any`; components are function components with named exports. Non-vacuity: no assertion inside `try`/`catch`, `if`/`else` or `.catch`; a `finally` cleanup only, in the registry test. |

### Criterion 23 table (Group F, both themes, one screenshot each)

Capture: 1280 by 800, `devicePixelRatio` 1, dialog open, Rain on at 60, Rain focused by keyboard. Ground for every row: the flat `--popover` fill (light `(255,250,243)`, dark `(30,22,16)`), taken from the dialog's padding strip in the same capture. Text rows: the glyph core (the most contrasting painted pixel in the text box; the fill pixels of the box cannot be the figure). Edge and ring rows: the least-contrasting painted pixel of that edge (the blend pixel), with the strongest edge pixel alongside.

| Theme | Element | Ground | Worst painted pixel | Ratio | Floor | Verdict | Strongest edge pixel |
|---|---|---|---|---|---|---|---|
| light | Title | fill | (43,32,23) | 15.299 | 4.5 | PASS | |
| light | Description | fill | (87,83,78) | 7.346 | 4.5 | PASS | |
| light | Each layer label (4) | fill | (43,32,23) | 15.299 | 4.5 | PASS | |
| light | Each value read-out (4) | fill | (87,83,78) | 7.346 | 4.5 | PASS | |
| light | Stop/Start text | button fill (251,244,234) | (43,32,23) | 14.550 | 4.5 | PASS | |
| light | Track edge (each of 4 faders) | fill | (189,183,177) | **1.913** | 3 | **FAIL** | (183,180,177) 1.987 |
| light | Thumb vs track (each) | track (245,245,244) | (180,83,9) | 4.603 | 3 | PASS | |
| light | Thumb vs fill (each) | fill | (180,83,9) | 4.835 | 3 | PASS | |
| light | Checkbox edge, checked (Rain) | fill | (217,166,125) | **2.084** | 3 | **FAIL** | (180,82,8) 4.871 |
| light | Checkbox edge, unchecked (Wind) | fill | (188,183,176) | **1.919** | 3 | **FAIL** | (122,117,111) 4.394 |
| light | Focus ring outer edge (Rain) | fill | (217,166,125) | **2.084** | 3 | **FAIL** | (180,83,9) 4.835 |
| dark | Title, description, each label and value (all) | fill (30,22,16) | (245,235,220), (194,177,155) | 15.117, 8.541 | 4.5 | PASS | |
| dark | Stop/Start text | button fill (28,20,14) | (245,235,220) | 15.400 | 4.5 | PASS | |
| dark | Track edge (each of 4) | fill | (84,71,60) | **1.990** | 3 | **FAIL** | (87,74,62) 2.084 |
| dark | Thumb vs track (each) | track (37,28,20) | (240,165,80) | 8.131 | 3 | PASS | |
| dark | Thumb vs fill (each) | fill | (240,165,80) | 8.665 | 3 | PASS | |
| dark | Checkbox edge, checked (Rain) | fill | (135,94,48) | 3.120 | 3 | PASS | (240,165,80) 8.665 |
| dark | Checkbox edge, unchecked (Wind) | fill | (83,70,59) | **1.959** | 3 | **FAIL** | (138,121,104) 4.260 |
| dark | Focus ring outer edge (Rain) | fill | (135,94,48) | 3.120 | 3 | PASS | (240,165,80) 8.665 |

Mechanism, measured in the same capture: the slider sits at y 206.5 and the checkbox at y 170.5, both half-pixel. A 1 px track border therefore paints as two rows at about 50% coverage each, and no row reaches the token colour (`#7a756f` light, `#8a7968` dark). The unchecked 2 px checkbox border and the 2 px focus ring do reach full coverage on one row, and that row passes (light unchecked 4.394, light ring 4.835). The failing figures are the half-coverage rows. Whether criterion 23's "worst sampled pixel" should be read against a 1 px stroke that paints at half coverage is an owner or orchestrator ruling. QA applied the wording as written.

### Measurement sweep: what was not re-derived
010's group-F figures for `--control-border` (light 3.363, dark 3.546) are carried over by criterion 24's identity, not re-measured. 010's adversarial set was not re-run (criterion 22's bound was proven with white and black only).

### Repro for each failure

**Criterion 2.** Command: `grep -n "Ambient soundscape" docs/DECISIONS.md`. Expected: a dated 2026-10-27 entry for task 011. Actual: no match. Fix: the orchestrator lands the drafted entry from Implementation Notes.

**Criterion 16 (and the unit half of 32).** Command: `npx vitest run components/SoundscapeDialog.test.tsx -t "last action wins"`. Expected: status text `All sound stopped. Your mix is kept.` after a layer's first click and an immediate Stop all. Actual: `Rain on.` Cause: `useSoundscape`'s `commit` sets the message in promise-resolution order. A first gesture awaits `resume()`; the Stop resolves at once and is set first; the earlier message lands last. Suggested owner of the fix: frontend (stamp each action and drop results from superseded actions). QA did not change application code.

**Criterion 23.** Command: `npx playwright test -c e2e/qa-011.config.ts soundscape-measure.spec.ts -g "criterion 23"` on a build of this tree (or `npx playwright test e2e/soundscape-measure.spec.ts -g "criterion 23"` on :3000). Expected: every row at or above its floor. Actual: the 11 FAIL rows above, both themes (light: 2 FAIL tests of 2, dark: same). Suggested owner: orchestrator ruling first (the method question above), then frontend if the ruling holds (sub-pixel placement of the dialog's translate, or whole-pixel alignment of the fader and checkbox geometry).

**Criterion 32 (e2e half, expected).** The two FAIL rows in `npm run test:e2e` are the two criterion 23 tests above.

### Finding (not a criterion failure)
- **Drag writes.** One full drag 0 to 100 writes the preference entry about 100 times (99 or 100), one synchronous `localStorage.setItem` per value step, with 301 pointer moves. The criterion's wording (writes bounded by value changes, not pointer events; final stored equals control) holds. If the owner wants writes on release only, that is a new criterion, not a QA failure.
- **Flake, not 011.** `e2e/task-list.spec.ts` "persists tasks after reload" failed once in a full parallel run while the measurement spec ran alongside. It passed alone and in the official run.
- **Scratch-port artefact, not a defect.** 010's `uploaded-background.spec.ts` criterion 29 hardcodes `http://localhost:3000` as the app origin; it fails only when the suite runs on another port. It passes on :3000.

### Tests added and changed
Unit (Vitest):
- `lib/audio/gain.test.ts`: criterion 18, the pure mapping.
- `lib/audio/mix.test.ts`: criteria 4, 5, 9; malformed table; store rehydrate; per-layer loops over `LAYERS`.
- `lib/audio/engine.test.ts`: criteria 8, 17, 18, 19, 21, 26; fake `AudioContext` with a manual audio clock.
- `lib/audio/no-audio-asset.test.ts`: criterion 7; repo scan with a live dummy-per-rule proof.
- `components/SoundscapeDialog.test.tsx`: criteria 12, 13, 14, 16, 17, 20 (unit break target).
- `components/SoundscapeDialog.registry.test.tsx`: criterion 9, fifth layer.
- Changed: `components/TimerGauge.tokens.test.ts` (criterion 30c), `lib/preferences/preferences.test.ts` and `gauge-style.test.ts` (mix in exact-shape expectations; 53 red became green).

E2E (Playwright):
- `e2e/helpers/soundscape.ts`: shared accessor, counters and instrumentation (reusable).
- `e2e/soundscape-mixer.spec.ts`: criteria 6, 8, 10, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 26, 32 (console).
- `e2e/soundscape-layout.spec.ts`: criteria 27, 28, 29.
- `e2e/soundscape-measure.spec.ts`: criteria 22, 23, 24 (group F).
- `e2e/qa-011.config.ts`: scratch config for :3100; not used by the official gate.
- Changed (pinned shape only): `e2e/dark-theme-control.spec.ts`, `e2e/settings-gauge-style.spec.ts`, `e2e/uploaded-background.spec.ts`.

### Break-and-restore (hash-verified, scratch copy, unit level)
| Criterion | Break | Result | Level |
|---|---|---|---|
| 5 | `sanitizeMix` returns its input unchanged | 8 red | unit |
| 17 | dialog starts the engine on mount with the stored mix | 2 red (17 and 16) | unit |
| 18 | `levelToGain` non-monotonic above 50 | 3 red | unit |
| 20 | hook unmount stops the engine | 2 red (20 and 16) | unit |
| 30 | `bg-red-500` added to the dialog | 1 red (palette guard) | palette unit |
Each restore matched the real file's sha256. The e2e level was not used for these breaks: the unit guard discriminates, so the e2e positive case is the non-break proof only.

### Verdict reasoning
FAIL: criteria 2, 16 and 23 fail as written, and 32 is not green because of the criterion 16 unit failure. Everything else passes with the evidence above. The minimum set to move to PASS: land the DECISIONS entry (2); fix the stale-message ordering (16); decide the 23 method and fix the sub-pixel geometry or the ruling (23).

### QA Report, pass 2

- Verdict: **PASS** for the 011 acceptance criteria, with two stated scope limits (criterion 32's full e2e run and the criterion 25 wording). Pass 1's FAIL causes (2, 16, 23) are all resolved and re-proven below.
- Scope: as requested, narrow. Unit and typecheck and lint re-run in full. Criterion 23 re-measured once. Criterion 16 extended and proven red on the pre-fix behaviour. Criterion 19 re-checked for new `gain.value` assignments. Soundscape e2e specs re-run on the official config. The 627-test suite was not re-run.

#### Gates (current tree)
- Unit: **964 passed, 0 failed** (32 files). Pass 1 was 958 pass plus 1 red; the 5 new interleaving tests make 959 + 5 = 964.
- `npm run typecheck`: exit 0.
- `npm run lint`: 0 errors, 21 warnings (baseline).
- `npm run build`: the coordinator's real-tree run, not repeated here. The scratch build of the same tree also passed.
- E2E: `e2e/soundscape-mixer.spec.ts`, `e2e/soundscape-layout.spec.ts`, `e2e/soundscape-measure.spec.ts` on the official config (:3000): **42 passed, 0 failed**. The two pass-1 failures (criterion 23 measurement) now pass. No other spec opens the mixer (grep), so the 2 px track cannot reach another spec. The rest of the official suite is carried from pass 1 (627 passed, 2 skipped pre-existing), as requested.

#### Criterion 2: DECISIONS entry verified
`docs/DECISIONS.md` has the 2026-10-27 "Ambient soundscape mixer (task 011)" entry. It names the four ids and the `LayerSource` interface, the `mix` shape and `PREFERENCES_VERSION` 1 with the per-key-fallback reason, that playback is not persisted and why (autoplay policy), what stops the audio (and what does not: dialog close, route change, reload stops it), the per-tab limitation, and the line "no asset provenance entry is needed, because nothing is sourced". It also carries the 100-writes-per-drag known cost. Criterion 2: **PASS**.

#### Criterion 16: fixed, with the interleavings pinned
Five new tests in `components/SoundscapeDialog.test.tsx` (describe "criterion 16: the last action the user took is the message that stays, under interleaving"). The fake `resume()` is gated, so each test releases the older action's promise after the newer one. Each assertion names the last action's message.
1. Stop after a pending start: the start settles last and must not overwrite "All sound stopped. Your mix is kept."
2. Two rapid layer toggles (Rain, then Wind): Wind settles first, Rain settles last; the message must stay "Wind on."
3. A layer toggle (Wind) then stop-all while the toggle is still pending: stop is last.
4. Stop, then start, with both starts pending (Rain, stop, start): the newer start settles first and the older one must not win; the message is "Sound started.".
5. The no-layer message wins over pending toggles that settle after it (Rain on, Rain off, then Start with nothing on).
The original "last action wins" test (pass 1's red) is green.

**Pre-fix proof.** The real tree was synced into the scratch copy and only the stale-message guard (`if (action !== latestAction.current) return;`) was removed there. Real file unchanged (sha256 `69fdbc24c03e` before and after). Result: **6 of 16 dialog tests fail on the pre-fix behaviour**, namely the original "last action wins" test and all five new interleaving tests. The other 10 pass either way. So every new criterion 16 test discriminates; none passes vacuously.

#### Criterion 23: re-measured once, ruling applied
One screenshot per theme (scratch build of the current tree, 1280x800, DPR 1, dialog open, Rain on at 60, Rain focused by keyboard). Verdict on the **fully-covered** (most-contrasting non-ground) pixel of each stroke, per DECISIONS 2026-10-27. The fringe figure is shown for information only. Ground for each row: the flat `--popover` fill, from the dialog padding strip in the same capture. Text rows use the glyph core (see pass 1).

| Theme (ground) | Element | Judged pixel (full coverage) | Ratio | Floor | Verdict | Fringe, info |
|---|---|---|---|---|---|---|
| light (255,250,243) | Title | (43,32,23) | 15.299 | 4.5 | PASS | |
| light | Description | (87,83,78) | 7.346 | 4.5 | PASS | |
| light | Each layer label (4) | (43,32,23) | 15.299 | 4.5 | PASS | |
| light | Each value read-out (4) | (87,83,78) | 7.346 | 4.5 | PASS | |
| light (stop button fill 251,244,234) | Stop/Start text | (43,32,23) | 14.550 | 4.5 | PASS | |
| light | Track edge, 2 px (each of 4) | (122,117,111) = `#7a756f` | 4.394 | 3 | PASS | (188,183,176) 1.919 |
| light (track interior 245,245,244) | Thumb vs track (each) | (180,83,9) | 4.603 | 3 | PASS | |
| light | Thumb vs fill (each) | (180,83,9) | 4.835 | 3 | PASS | |
| light | Checkbox edge, checked (Rain) | (180,82,8) | 4.871 | 3 | PASS | (217,166,125) 2.084 |
| light | Checkbox edge, unchecked (Wind) | (122,117,111) | 4.394 | 3 | PASS | (188,183,176) 1.919 |
| light | Focus ring outer edge (Rain) | (180,83,9) | 4.835 | 3 | PASS | (217,166,125) 2.084 |
| dark (30,22,16) | Title | (245,235,220) | 15.117 | 4.5 | PASS | |
| dark | Description | (194,177,155) | 8.541 | 4.5 | PASS | |
| dark | Each layer label (4) | (245,235,220) | 15.117 | 4.5 | PASS | |
| dark | Each value read-out (4) | (194,177,155) | 8.541 | 4.5 | PASS | |
| dark (button fill 28,20,14) | Stop/Start text | (245,235,220) | 15.400 | 4.5 | PASS | |
| dark | Track edge, 2 px (each of 4) | (138,121,104) = `#8a7968` | 4.260 | 3 | PASS | (84,71,60) 1.990 |
| dark (track interior 37,28,20) | Thumb vs track (each) | (240,165,80) | 8.131 | 3 | PASS | |
| dark | Thumb vs fill (each) | (240,165,80) | 8.665 | 3 | PASS | |
| dark | Checkbox edge, checked (Rain) | (240,165,80) | 8.665 | 3 | PASS | (135,94,48) 3.120 |
| dark | Checkbox edge, unchecked (Wind) | (138,121,104) | 4.260 | 3 | PASS | (83,70,59) 1.959 |
| dark | Focus ring outer edge (Rain) | (240,165,80) | 8.665 | 3 | PASS | (135,94,48) 3.120 |

The 2 px track's judged pixel equals the token exactly in both themes, which is direct evidence that the stroke now paints at full coverage. Identical values across the four faders are in the run log (`e2e` output, `criterion 23 |` lines). **Criterion 23: PASS.** The text, thumb and checkbox figures were unchanged by the 2 px change.

#### Criterion 19: one re-check
`grep gain.value` over `lib/audio`, the hook and the dialog returns the same four construction-time lines as pass 1 (`engine.ts:128`, `engine.ts:190`, `sources.ts:48`, `sources.ts:84`). No new direct assignment. The thumb `-mt-2` geometry was not part of this check and was not verified. **Criterion 19: PASS.**

#### Criteria 22, 24 and 25: carried forward, not re-derived
- 22: the fill is the flat `--popover` and nothing that could move it changed (the track class changed, not any fill). Carried from pass 1 (identical strip with white light / black dark).
- 24: the trigger still shares `SettingsButton`'s resolved colours; the track change does not touch the trigger. Carried from pass 1.
- 25: `app/globals.css` unchanged (no token moved; the track change uses existing `border-control-border`, `bg-muted`). Carried from pass 1.
- Criterion 25 wording is stale, not violated. `e2e/uploaded-background-dialog-edge.spec.ts` has no `test.fail`; 010 replaced it with pinned bounds (light edge between 1.5 and 3:1, with a comment to restore the floor when fixed). That is a superseding mechanism: it is still red if the edge is lifted, and it is passing. Recorded as satisfied by the superseding mechanism. The task file's criterion text is what is out of date.

#### Criterion 32
Gates as listed above. The aggregate is green for everything re-run in pass 2. The criterion 32 e2e run is the pass-1 official run (627 passed, 2 failed, 2 skipped), whose two failures are the criterion 23 tests that now pass. Reading the criterion in full would call for a fresh full `npm run test:e2e`; the coordinator asked for narrow coverage, so I carry the rest of the suite from pass 1 with that caveat.

#### Repro for the pass-2 scope (if needed)
- Criterion 16 interleavings: `npx vitest run components/SoundscapeDialog.test.tsx -t "criterion 16"` (expect 6 tests, all passing on the current code).
- Criterion 23: `npx playwright test e2e/soundscape-measure.spec.ts -g "criterion 23"` (expect 2 passed).

### QA Report, pass 3 (R-1, R-2)

- Verdict: **PASS** for the R-1 and R-2 fixes. Scope: the refusal case and R-2 only, plus `npm run test` and the three soundscape specs. Group F not re-measured, and the full e2e suite not re-run, as requested.
- **R-1 (refusal, `e2e/soundscape-mixer.spec.ts`, "a browser that refuses to start audio is told in text").** Added after the status-line assertion, read through `[data-soundscape]` (not `getByRole`):
  1. "Start sound" (exact) is visible and "Stop all sound" (exact) has count 0.
  2. The snapshot has `context === "suspended"`, and `layers.<id>.on === false` for every id in `LAYER_IDS` (a loop over the registry).
  Both pass on the current code.
  **Pre-fix proof** (scratch copy only; the engine's `on` derivation reverted to `playing && entry.on`, real `lib/audio/engine.ts` sha256 `16c2a7c28e69` before and after): each assertion was isolated by a variant spec in the scratch copy.
  - Variant "button visible" only: fails, "Start sound" not found (pre-fix shows Stop instead).
  - Variant "Stop count 0" only: fails, expected 0, received 1.
  - Variant "snapshot" only: fails, `hum is not on after a refused start`, received `true`.
  All three red, so both assertions discriminate. The fixed code is green.
- **R-2 (new test, "R-2: a stop that lands inside a pending resume leaves the context suspended").** Reachable from Playwright only by stubbing the browser. Headless Chromium starts contexts running, so the resume window never opens on its own. The test wraps `AudioContext.prototype`: `state` reads `suspended` until a `resume()` settles 600 ms later, and `suspend()` sticks. The sequence is: tick Rain (start pending), click Stop all sound inside the window, then wait for the late resume to reach `running`, then wait for `suspended`. The first wait matters: while the resume is pending the stub already reads `suspended`, so a bare suspended poll passed vacuously on the pre-fix build. With the wait, the pre-fix build reads `running` and never suspends (red, `Expected "suspended", Received "running"`), and the fixed build suspends on the audio clock (green).
- **Gates.** Unit 964/964. Typecheck 0. Lint 0 errors, 21 warnings. Soundscape e2e on the official config: 43 passed, 0 failed.
- **Criterion 19.** Not re-checked this pass; the `on` derivation change adds no `gain.value` assignment.

## Review Findings
Reviewed 2026-10-27 (read-only) against the whole uncommitted tree at `f3f5869`, all 32 criteria, both
owner rulings of 2026-10-27, and the five review dimensions. Gate figures were taken from the
orchestrator's verification, not re-derived.

**Reviewer could not write this section itself** (read-only by hard rule, no edit tools). The
orchestrator landed it verbatim from the reviewer's hand-back and appended the "Orchestrator
disposition" block at the end; everything above that block is the reviewer's own text.

- Verdict: **APPROVE**. No blocking findings. Nine non-blocking, two recommended for immediate fix.

### What the reviewer checked and found clean, so it is not re-litigated later

- **Criteria.** All 32 hold as written, with the two supersessions already recorded (criterion 23 by the
  full-coverage ruling, criterion 25 by 010's pinned bounds replacing its `test.fail`). Criterion 4's
  recipe was followed exactly. **`PREFERENCES_VERSION` staying 1 is genuinely correct, not convenient** —
  `store.ts:62-65` sanitises on *every* rehydration when `isPreferences` is false, and `isPreferences` now
  requires `isMix`, so every pre-011 payload is forced through `sanitizePreferences` and gains the default
  mix. `mix` can therefore never reach a component as `undefined`.
- **Licensing and branding, verified independently.** `git ls-files -co --exclude-standard` filtered on
  eleven audio extensions: nothing. No `<audio`, `new Audio(`, `createMediaElementSource`,
  `decodeAudioData`, `data:audio/`, base64 audio literal, `fetch(`, `XMLHttpRequest`, `addModule` or any
  absolute URL in `lib/audio/**`, the hook or the dialog. Every sample comes from `Math.random()` through
  filters written in-repo. The icon is `react-icons`' generic speaker; no first `lucide-react` import
  anywhere. One provenance nuance in R-4.
- **TypeScript.** No `any`, no `@ts-expect-error`, no non-null assertion. One cast in the whole diff:
  `engine.ts:62`, the narrowest way to reach a vendor-prefixed global, immediately guarded.
- **Server/client boundary.** `schema.ts` now imports `../audio/mix` → `layers` → `sources`, and none of
  that chain touches the DOM or an `AudioContext` at import time, so `schema.ts`'s "safe to import from a
  server component" header still holds. `getServerSnapshot` returns the *same object* as the first
  `getSnapshot`, so hydration cannot mismatch.
- **Timer discipline.** Zero `setInterval`/`setTimeout`/`requestAnimationFrame`/`performance.now` in
  `lib/audio/**`, the hook and the dialog. Node accounting is internally consistent: 4 level nodes + one
  rain voice (8) + its fade = 13, exactly the figure QA observed at every checkpoint.
- **Re-entrancy, the file flagged as riskiest.** `engine.ts`'s `apply()` does all graph mutation *before*
  its only `await`, and nothing after the await touches the graph, so two overlapping applies cannot
  double-create a context, double-start a voice, or double-decrement `liveNodes`. Turning a layer off and
  on inside the 0.4 s fade yields one new voice plus one old self-disposing voice, which is correct. One
  hole, in R-2.
- **The `latestAction` counter.** Sound, and not narrower than the bug. Nothing but the *message* is
  dropped: the mix is written synchronously by `setMix(next)` before `apply`, and the engine's
  `mix`/`playing` are assigned at the top of `apply` before any await. A dropped `blocked`/`unsupported`
  message from a superseded action is re-derived by the newer action. `setLayerLevel` deliberately not
  bumping the counter is right and does not interact badly with a pending `commit`.
- **Accessibility beyond QA's sweep (markup read, not just measured).** The `<ul>`/`<li>` list is correct
  semantics for four peer layers. The value is announced **once, not twice**: the `aria-hidden` "On, 50%"
  read-out is the sighted indicator, while the state lives on the native checkbox and the value on the
  native range. `aria-valuetext="50 percent"` is honoured by NVDA, JAWS and VoiceOver and sits beside an
  implicit `valuenow`. `role="status"` is in the DOM from mount and empty until an action writes it, which
  is both why announcements work and why the 010 R-1 defect is not copied. `onOpenAutoFocus` → Close is
  the right call (the first focusable child is a checkbox an accidental Space would toggle into audio).
  Radix gives the trigger `aria-haspopup="dialog"` and `aria-expanded`. The 24 px checkbox is wrapped by a
  44 px-high `<label>`, so the effective target clears 2.5.8 with room.
- **`data-soundscape={JSON.stringify(snapshot)}` — assessed, and it is the right trade.** It leaks
  nothing: context state, a boolean, two counts and four `{on, gain}` pairs, with no user content, no
  filename and no storage contents. It re-serialises on *publishes*, not frames. The honest costs are that
  the whole `SoundscapeDialog` subtree subscribes to the engine purely so the trigger can carry the
  attribute, and that `data-soundscape` duplicates `data-soundscape-context`. Neither is worth a change;
  criterion 18's alternative is unreachable from Playwright without putting it on `window`, which is worse.
- **Group F's credibility.** Pass 2's judged pixels *equal the token hexes exactly*, independent evidence
  that the probes read the intended strokes and that the 2 px track now paints a fully-covered row. The
  focus-ring probe is non-vacuous despite `--ring` and `--primary` sharing a hex, because its rect stops
  one row above the checkbox border box. One fragility, in R-7.
- **Test changes.** Every changed assertion is a *widening* of a pinned exact shape to include `mix`, which
  strengthens it. The one deletion is the orchestrator's pre-011 trivial-track removal of a guard that
  inverted at commit time. The registry test's assertions sit in a `try`/`finally` with no `catch`, so a
  failure still propagates.

### Findings

- **R-1. A refused start leaves the button labelled "Stop all sound" while the message tells her to press
  "Start sound". Non-blocking, fix now.** `lib/audio/engine.ts:100-101` computes a layer's reported `on` as
  `playing && entry.on`, with no regard to the context state, and `apply` leaves `playing === true` on both
  `return "blocked"` paths (`engine.ts:209`, `engine.ts:212`). So when `resume()` is refused,
  `hooks/use-soundscape.ts:65` sets `audible === true` and `components/SoundscapeDialog.tsx:82` renders
  "Stop all sound", at the same moment `role="status"` reads "Your browser did not start the sound. **Press
  Start sound** to try again." The instruction names a label that is not on screen, and recovery takes two
  presses. Same root cause makes the criterion 18 accessor self-contradictory in that state: it reports
  `{on: true, gain: 0.125}` while `context` reads `suspended`, against its documented meaning at
  `engine.ts:30`. QA's blocked-path test (`e2e/soundscape-mixer.spec.ts:269-282`) asserts only the status
  text, so nothing catches this. Criterion 16 exists for exactly this path. Fix: set `playing = false`
  before each `return "blocked"` (or derive `on` from `ctx.state === "running"` as well), and add one
  `toHaveText("Start sound")` assertion to the existing e2e test.
- **R-2. The idle suspend is lost if a stop lands while the first `resume()` is still in flight.
  Non-blocking, fix now (cheap).** `lib/audio/engine.ts:150-152` early-returns when
  `context.state !== "running"`. Turn a layer on and stop within the resume window (first-ever context
  creation can take 50-200 ms), and the stop's `suspendWhenSilent` sees `suspended`, schedules no marker,
  and then the in-flight resume settles and flips the context to `running` — with every fade ramped to 0
  and no source scheduled, but the hardware clock awake for the rest of the page's life. Silent, leaks no
  nodes, self-heals on the next on→off cycle, so no criterion catches it; it is the CPU/battery case
  criterion 19 was written for. Fix shape, generation-safe because it re-reads live intent: after
  `await resuming`, recompute `playing && LAYERS.some((l) => entryFor(l.id).on)` and call
  `suspendWhenSilent(context)` if false.
- **R-3. The first click that asks for sound generates ~3.5 MB of noise synchronously inside the gesture
  handler, including colours the chosen layer does not use. Non-blocking, Maintenance.**
  `lib/audio/noise.ts:47-52` fills all three buffers eagerly: 3 × 6 s × 48 kHz ≈ 864k samples of per-sample
  JS, ~3.5 MB of `Float32`, on the main thread inside the click. Turning on **Hum alone pays the whole bill
  and uses none of it**. Tens of ms on a laptop, plausibly 150-300 ms on a low-end phone. Fix shape: make
  the bank lazy per colour (three getters memoised on the context).
- **R-4. The DECISIONS entry's "nothing is sourced" is one clause too absolute. Non-blocking, fix now
  (docs only).** `lib/audio/noise.ts:14` correctly credits "Paul Kellet's economy pink filter" — a
  published third-party coefficient set from musicdsp.org, free to use and almost certainly
  uncopyrightable as a formula, so there is **no licensing risk**. But CLAUDE.md's standing rule is
  provenance for anything not original, and the 011 entry says flatly "no asset provenance entry is needed,
  because nothing is sourced", which invites a later reader to conclude every line of DSP was invented
  in-house. Add a half-sentence, and fix the spelling (Kellett).
- **R-5. The full-coverage ruling logically implies a sweep that 011 did not do, and should not have.
  Non-blocking, Maintenance.** The ruling now says "a 1 px border is not an acceptable way to carry a 3:1
  boundary on a surface whose position is not pixel-aligned". 011 thickened the one stroke it had measured.
  But the dialog's own Stop/Start control (`SoundscapeDialog.tsx:76-81`, `variant="outline"` → 1 px at the
  cva base) sits on the same non-pixel-aligned dialog, as do `SettingsButton`, `StatsButton` and the dialog
  Close. None was in criterion 23's list, and 010's carried-over figures are full-coverage readings on the
  page ground, so nothing shipped is known-bad. The open question is whether the ruling generalises: one
  measurement pass, then a decision, not a change.
- **R-6. With the dialog closed, nothing indicates that sound is playing. Non-blocking, pm's call.** Sound
  deliberately survives dialog close and navigation, so she can be on `/stats` with rain running and no
  visible cue anywhere. **Not a request for a meter** — VU, waveform, spectrum and pulsing icons are out of
  scope and would break 010's criterion 28. A *static* state on the trigger (a struck-through speaker when
  `playing`) is not motion, needs no `prefers-reduced-motion` handling, and the hook already exists.
- **R-7. Group F's track-edge probe can silently measure the thumb. Non-blocking, Maintenance.**
  `e2e/soundscape-measure.spec.ts:130` samples a 1 px column at `sb.x + 10`, and the 24 px thumb spans
  `thumbX ± 12`, so at any level below roughly 5 the thumb covers that column. Since pass 2 judges the
  **most**-contrasting non-ground pixel, a future run with a different fixture would report the thumb's
  4.8:1 as the track's and pass regardless of the track. Today's fixture keeps them apart, but that is the
  fixture's doing, not the harness's. Two lines to fix.
- **R-8. A fifth `LayerSource` with no scheduled source would throw in `stop()` and never dispose.
  Non-blocking, Maintenance.** `lib/audio/sources.ts:57` reads `sources[sources.length - 1]`. The project
  does not enable `noUncheckedIndexedAccess`, so TS types it as non-optional; all four shipped sources push
  at least one scheduled node. A fifth source built only from constant/filter nodes would make `stop()`
  throw inside `fadeOutAndStop`, leaving `liveNodes` permanently inflated. Criterion 9's promise is that a
  fifth layer is "a registry entry plus a source", so this is the one sharp edge on that path.
- **R-9. Three documentation and formatting nits.** (a) The DECISIONS 011 entry says the `mix` key is
  "about 210 bytes serialised" — 210/211 is QA's measurement of the **whole** `pomotato-preferences` entry;
  the `mix` key itself is ~140. (b) Indentation slips at `lib/preferences/gauge-style.test.ts:72` and
  `lib/preferences/preferences.test.ts:237`. (c) `components/background.guards.test.ts:82-84`'s "no first
  `lucide-react` import" guard iterates 010's `NEW_FILES` only, so 011's files are outside it; nothing is
  wrong today, the guard just does not extend itself.
