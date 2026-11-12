---
id: 011
slug: ambient-soundscape-mixer
status: done # draft | in-progress | qa | review | done | blocked
---

# Ambient soundscape mixer — four synthesized layers, per-layer level, no audio file anywhere

> **History for this task** — implementation notes, QA reports, review findings and
> orchestrator rulings live in [logs/011-ambient-soundscape-mixer-log.md](logs/011-ambient-soundscape-mixer-log.md). Read it only when a
> criterion below is disputed; it is not an input to implementing them.

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
