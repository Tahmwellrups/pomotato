# Decision Log

Short entries, newest first. One decision per entry: what was decided, and why.

---

### 2026-11-06 — Two agents measured the task panel and disagreed by 64 px, and both were right
Task 015 criterion 34 caps the empty panel at 240 px tall. Frontend recorded **352 x 234** and QA measured
**298** tall and **416 x 544** for three tasks. That looked like the 2026-10-29 sampler disagreement, so it
was re-measured rather than resolved by picking a side.

**Both figures are correct. They are different elements.** Measured at 1280x800, DPR 1, default theme, no
background stored:

| element | empty | three tasks | share of viewport |
|---|---|---|---|
| outer `<section>` (carries `xl:p-4 xl:pb-12 xl:pl-12`) | 416 x **298** | 416 x 544 | 22.1 % |
| inner `<Surface kind="solid">` | 352 x **234** | 352 x 480 | 16.5 % |

The delta is exactly **64 px in both dimensions**: 16 top + 48 bottom, and 48 left + 16 right. Frontend read
the Surface, QA read the section. Nothing was flaky and no sampler was at fault.

**Ruling: criterion 34 means the `Surface`, so it PASSES at 234 px (6 px of slack).** The outer padding is
the gap that holds the panel off the viewport edge, not panel. Counting it as panel height would make the
criterion penalise the very spacing that stops the panel touching the screen edge, which is backwards. The
criterion's stated purpose is to stop the add form shipping as a permanently-expanded multi-field block —
that is about visual bulk, and padding is not bulk. The 25 % area cap passes on either reading (16.5 % and
22.1 %), so only the height cap ever turned on this.

**The reusable rule, which the 2026-10-26 entry did not go far enough on.** That entry says a criterion
naming a figure must say *where the figure came from* — viewport, theme, ground. This adds the obvious
missing one: **it must name the element**, by selector, when a component has an outer layout box and an
inner painted box. "The panel" is not a selector. Every nested-box criterion is a disagreement waiting to
happen, and this one cost a measurement round to discover rather than a failure to fix. The 2026-11-06
"recorded figure said the timer fit on a phone" entry adds scroll position to the same list.

**Criterion 24 resolved from the same run, not re-measured later.** QA reported the "entire timer Surface
above the fold" clause unverified, having only checked the Start button. The figure already existed from the
phone-layout verification: at 320x568, `scrollTo(0,0)`, the timer Surface is **y 108-542** with an empty list
and **y 108-550** with three tasks, both inside 568; at 375x667 it is y 108-490 and y 108-498. **Criterion 24
passes in full.** QA's note that frontend's 152-710 figure "predates the layout pass" is right, which is
exactly why that figure now carries an in-place correction rather than having been deleted.

### 2026-11-06 — A recorded figure said the timer fit on a phone, and it never did
Task 015's frontend reported that criterion 24 (timer above the fold at 320x568) could not be met, and that
its reading disagreed with a figure task 014 had recorded. It could not find what moved. Nothing had: **014's
figure was wrong**, and the disagreement was the only reason anyone looked.

**What is true.** At 320x568, DPR 1, empty task list, `scrollTo(0,0)`: the timer `Surface` spans **y 152-710**
and the Start/Pause/Reset row is **top 657, bottom 701**. The 484 px inner stack is current-task card 40,
chips plus cycle dots 116, gauge wrapper (`min-h-40`) 160, focus-length field 68, controls 44, and three
`gap-8` gaps at 96. `main`'s `pt-12` and `gap-6` put the surface top at 152.

**What was recorded.** 014's Implementation Notes say "320x568 Start's bottom edge is y 341 before any
scroll". That is impossible given the stack above — Start is the last row of a 558 px surface starting at
152. The likely cause is a measurement taken after a scroll, which is exactly why **a figure must record its
scroll position along with its viewport, theme and ground.** The 2026-10-26 rule already said a criterion
naming a figure must say where the figure came from; this adds scroll position to that list for any
above-the-fold claim. The figure is annotated wrong in place rather than deleted, so the next reader sees
the correction instead of re-deriving it.

**Whose fault it is not.** This is a **task 013 consequence, not 014's or 015's.** `CycleDots` and the
always-mounted focus-length field are both 013 additions — before 013 the field only rendered in Custom
mode, so the stack was shorter. 014 added the panel *after* the timer in flow, where nothing it does can
move the timer, and 015 touched none of these components. It is false at 375x667 as well, so it affects
ordinary phones and not merely the smallest one.

**Not a blocker, and worth being precise about why.** Nothing *covers* Start: `BottomControls` is in page
flow below `lg` (the 2026-10-28 ruling), so Start is reachable by scrolling and is not trapped under
floating chrome. That earlier ruling was about chrome covering Start, which is a different and worse
failure. This is "you must scroll", not "you cannot press it".

**Owner ruling: shrink the stack on phones** rather than accept the scroll or defer it, because a focus
timer is glanced at and scrolling to reach Start defeats that. Scoped to phone widths only — `sm` and up
keeps its measured geometry byte-identical, since 012, 013 and 015 figures all read against it. Removing the
focus-length field on small screens was explicitly ruled out: 013 made the Focus length editable on purpose
and it is the only editable duration, so it may be shrunk or re-arranged but not dropped from the DOM.
Landing it **before** 015's sweep is deliberate — a layout change after a sweep means sweeping twice.

### 2026-11-06 — A `liveQuery` that races any repository call silently subscribes to nothing
Found while verifying task 014's frontend pass, fixed in `lib/db/database.ts`. **Pre-existing, and it
predates 014** — on HEAD it showed as pinning a task leaving `CurrentTaskCard` on its old copy.

**Symptom.** On `/` with a background image stored, adding or ticking a task did not update the card or the
task panel until a reload. With no image stored, everything updated live. A subscription mounted *later* —
the dialog's own list — worked fine, which is the clue that this was about mount timing, not the querier.

**The symptom's description was wrong, and that matters more than the fix.** It is not about background
images and not about any particular table. Measured, control 1 re-fire against 0:
a background row merely existing is harmless; a concurrent `loadBackground` breaks it; **a concurrent
`listTasks()` — the same table the query reads — breaks it identically.** The background image is only the
thing that reliably causes a concurrent repository call at mount on `/`. So the task list could go stale in
other situations too, and anything that adds a read at mount can resurrect this.

**Mechanism, confirmed with a probe reading `Dexie.Promise.PSD.subscr` either side of the await.** Inside a
liveQuery querier, Dexie makes the global `Promise` its own zone-aware one, so a promise *constructed there*
carries the zone. `openDatabase()` shared one attempt across callers (`if (pendingOpen) return pendingOpen`).
Dexie defers a querier's first run, so a concurrent repository call gets there first, **outside** any Dexie
zone, where `Promise` is native — and it is that native promise the querier then awaits. The zone does not
survive the await, Dexie's echo does not cover it, the reads afterwards are attributed to no subscription,
and the observability set comes out empty. The query then never re-fires. **Which zone resolved the promise
is not the cause**; the cause is a shared *native* promise created outside the awaiter's zone.

**Two hypotheses were disproved on the way, recorded so nobody pays for them twice.**
1. *"Awaiting a native promise before the Dexie read loses the zone."* False as stated. A querier awaiting
   `Promise.resolve(db)`, a `setTimeout(0)` macrotask, and a `new Promise` wrapper around `db.open()` all
   re-fire normally. The native promise only matters when it was **created in another zone and shared**.
2. *"The orchestrator confirmed the mechanism by reading the source."* It had not. Reading `openDatabase()`
   confirmed only that every path returns a native promise, which turns out to be irrelevant on its own.
   The shape was visible in the source; the cause was not, and only a probe settled it.

**Fix.** The old body is a private `openShared()`, unchanged — it keeps the single `pendingOpen`, the
blocked timer, `DatabaseBlockedError`, `DatabaseUnavailableError` and retry-after-reject. `openDatabase()`
now hands every caller `new Promise((resolve, reject) => shared.then(resolve, reject))`, **constructed in
the caller's own zone**, so inside a liveQuery it is a zone-aware promise and the awaiter resumes in its own
zone. Every repository read already awaits `openDatabase()`, so one wrapper covers every current and future
repository, and no repository or hook has to know zones exist. Call-order sharing is preserved: each wrapper
subscribes to `shared` in call order and every caller takes the same extra hop.

**For whoever writes the permanent test:** `liveQuery` silently does nothing if no `PomotatoDatabase` has
ever been constructed, because Dexie checks `domDeps` at query time. Call `getDatabase()` first or the test
passes for the wrong reason. A red-proof is cheap here and was taken at unit level — no browser needed,
which is why this was worth chasing before shipping rather than after.

### 2026-11-06 — The task dialog is deleted, the panel absorbs everything, and two of task 014's rulings are overridden
Owner ruling, given while task 014's frontend pass was still running. Three changes, each of which
**supersedes a ruling task 014 had settled**. Recorded in full because 014's task file argues the opposite
case at length, and a later reader finding that file alone would conclude this was a mistake.

**1. `components/TaskListDialog.tsx` is deleted. The panel is the only task surface.** This overrides 014
ruling 4 ("The panel and the dialog split the work; the dialog survives, scoped down"). What ruling 4
argued, so the cost is on the record rather than rediscovered: the dialog carries Escape ownership across
its inner layers and an `onOpenAutoFocus` that lands on Close, both of which took task 004 a full round to
get right, plus 37 e2e tests in `e2e/task-list-dialog.spec.ts`. All of that goes. The second half of ruling
4's argument — that an always-visible panel holding an add form, an inline edit form *and* a delete
confirmation becomes the dominant element on `/`, against DESIGN.md's "no clutter of widgets competing for
attention" and antislop's one-focal-point rule — is **not** answered by this ruling; it is accepted as a
cost. The timer is still meant to be the focal point, so the panel's visual weight is now a thing to watch
rather than a thing that was designed out.

**Add, edit, delete and `+1`/`-1` all move inline into the panel row**, owner's choice between three
options. This reverses ruling 4's structural answer to sharp edge 8 (row density): the panel row was
specified to carry **four** controls precisely so it would not carry the eight `TaskRow.tsx` renders today,
and it now carries roughly eight again. **Tap-target and reflow checking is therefore mandatory, not
optional**, and it is the one thing most likely to fail on a phone — see the 2026-10-28 ruling about Start
not being pressable, which is the same mistake in a different corner.

**2. The panel gets a hide/show control, and the state persists.** This overrides 014 ruling 7 ("Nothing new
is persisted outside Dexie… no panel collapse state"), which had kept `PREFERENCES_VERSION` at **1**. It
now needs one new `lib/preferences/` key and a bump to **2**, with the sanitising path that every
preferences rehydration already runs (`store.ts:62-65` forces any payload failing `isPreferences` through
`sanitizePreferences`, which is why 011 could leave the version alone and this cannot). Session-only state
was offered and rejected: a panel that reappears on every reload reads as a bug rather than a choice.

**3. `emoji` and `colorId` leave the `Task` model.** The owner considers both unnecessary. Checked before
ruling, so it is not re-checked later: **`/stats` uses neither** — its per-task breakdown keys on `taskId`
and `taskTitle` only — and neither field is indexed (`tasks: "id, position"`), so no index changes. The
fields are **stripped from stored rows by a `.version(5)` upgrade** rather than left in place, for the same
reason v4 deleted the retired pin row instead of leaving it dormant: data nothing reads is data the next
reader has to investigate. `components/TaskColorDot.tsx`, `components/task-palette-colors.ts` and
`lib/db/palette.ts` lose their only consumers.

**Why this is a new task and not an amendment to 014.** It is a schema change, a newly persisted
preference, and the deletion of a surface, across many files — "major" by CLAUDE.md's own test, so it takes
a `pm` task file and the full pipeline. Folding it into 014 would also leave 014's Implementation Notes and
QA Report describing a dialog that no longer exists.

### 2026-11-06 — The header keeps no panel, which means the wordmark needs a different defence
Owner ruling, taken after task 012's review found that `surface-solid` has **zero appliers**: dropping the
solid header panel in `bc5f4d2` was **deliberate**. The owner does not want a panel behind the header. The
review read it as residue — the commit left a dead `Surface` import and the Surface-shaped padding behind,
which is what residue looks like — and was wrong about the intent. Recorded here because four criteria were
measured against a surface that is not shipping, and a later task would otherwise "fix" this back.

**What the ruling costs, stated plainly.** Task 012 criteria 4, 9, 14 and 15 are now wrong **as recorded**,
not failing: their figures were read against a `--popover` header fill that no longer paints.
- Criterion 15's wordmark 4.835:1 and criterion 9's "solid header centre, delta 0 per channel" measured a
  ground that does not exist. Do not quote either figure.
- Criterion 14's round-3 fix is nullified. `peer-focus-visible:-outline-offset-5` on the theme chip
  (`components/ThemeControl.tsx`) was chosen *specifically* to pull the focus ring inside the header's own
  fill; with no fill, the ring's ground is the photograph again and the 2.058:1 (dark, white image, 1280)
  reading returns. The negative offset now buys nothing and costs clarity.
- Criterion 4 / ruling 3 is violated by construction: the wordmark (`--primary`) and the three theme chips
  (flat text, no fill, no border by design, `components/ui/mode-chip.tsx`) sit directly on a full-opacity
  photograph.

**The ruling is about the panel, not about the floor.** A rejected panel is not a rejected contrast
requirement, and the project has already solved this exact problem once without a panel: the four
bottom-cluster triggers carry a **two-tone edge** (1 px `--foreground` border plus a 1 px `--popover` halo)
precisely because, per this log's 2026-10-29 entry, one colour cannot win against a photograph. The header's
text wants the same two-tone logic applied to glyphs rather than to borders — a halo of the opposite
luminance behind the letterforms — not a return of the panel.

**Settled the same day: the two-tone glyph halo.** The owner chose it over a bare header and over a
directional drop shadow. A drop shadow was rejected for the reason the two-tone edge exists at all: it
defends one side only, so light text on a light photo still reads poorly, which is the exact case the
treatment is for. The halo is tight to the letterforms — **no box, no fill, no panel** — and, like every
other surface in 012, paints **only while an image is active**, so the no-image default is unchanged from
HEAD and needs no re-measurement. It covers the wordmark (`--primary`) **and the three theme chips**, which
are flat text with no fill or border of their own (`components/ui/mode-chip.tsx`) and are therefore exposed
by the same ruling; the chips also carry an interactive control, so their floor matters more, not less.

The measurement inherits the two-tone edge's bound and does not need an adversarial image sweep: where the
halo fully surrounds the glyph, the pass condition is the edge's own two-part rule — **one of the two
clears 3:1 against the ground, and the two clear 3:1 against each other** — and the glyph-vs-halo figure is
image-independent by construction. Note that 012 review finding 3 records that the *second* half of that
rule is asserted nowhere in the suite, only in prose; whatever test covers the halo should assert both
halves, or it inherits the same gap.

**`surface-solid` stays.** The utility is not withdrawn: task 014's always-visible checklist panel is still
specified to use `<Surface kind="solid">`. The consequence is that the `solid` path has **never rendered**,
so criteria 5 and 7 pass vacuously for it and 014 is the first task to exercise it. 014's measurement pass
is therefore the `solid` kind's first real measurement, not a re-measurement.

**Fallout routed, not absorbed.** The dead `Surface` import in `widgets/HeaderNav.tsx` is removed as
mechanical cleanup (it was the 21st lint warning, against QA round 3's baseline of 20).
`e2e/control-edge-measure.spec.ts:126` and `e2e/focus-surface-sweep.spec.ts:235` both resolve
`[data-surface="solid"]` and cannot pass on this tree; re-pointing them is `qa`'s, since `qa` owns test
files. **That no one noticed for two days is the reusable lesson**: the commit landed after the round-3
sweep, so nothing re-ran the specs that would have caught it. A change to a measured surface taken after
its sweep needs the sweep again, which is the 2026-10-26 "Measurement ordering" rule pointing the other way
down the pipeline.

### 2026-10-29 — Two rings of opposite luminance, because one colour cannot win against a photograph
Task 012 let an uploaded photo paint at full opacity, which left the bottom-cluster controls
(Settings, Stats, Soundscape, Tasks) sitting on an unknown ground. A single border colour cannot hold
3:1 there: tune it for a light photo and it vanishes on a dark one. Measured, the old single grey edge
read **1.140:1** over 50% grey. A cluster-wide surface was tried first and **measured to collide** with
the timer panel below `lg` (218x62 px at 320x568), so that route stayed closed.

**The edge is now two rings: a 1 px `--foreground` border with a 1 px `--popover` halo outside it**,
drawn with `box-shadow` so it costs no layout, and painting only while `body:has([data-background="active"])`.
Whichever way the photograph goes, one of the two rings contrasts against it.

The pass condition is therefore **`max(border, halo) >= 3`**, not "every ring clears 3:1". By design the
outer ring alone reads 1.04:1 (light over white) and 1.18:1 (dark over black). Swept across all 256
greys, the larger ring never drops below **3.91** (light, at grey 126) or **3.90** (dark, at grey 117);
the two rings are 15.3:1 (light) and 15.1:1 (dark) against each other, so the pair always reads as an
edge. **A sampler that reads only the outer row will report a false failure** — that trap is why the
figures live here.

Both ring colours are existing tokens that flip with the theme, so no new token and no criterion 6 churn.
On `:focus-visible` the halo widens to 5 px, which is what fixed the focus ring that used to extend past
its surface onto the bare photo (2.058:1 -> 8.665:1 dark, 4.835:1 light).

**The cost, accepted:** while an image shows, the control borders read as ink or cream rather than soft
grey, which is more assertive than the calm direction `DESIGN.md` asks for. `DESIGN.md` settles that
trade in advance — "accessibility is not negotiable against aesthetics" — and the alternative was
controls that disappear on half the photographs a user might upload.

Related: under `forced-colors: active` a fill-only control has no edge at all once the fill is removed
(the Tasks trigger measured **1.000:1**, Canvas on Canvas). Fixed in the same rule with
`border: 1px solid ButtonBorder`. **A literal colour would have been ignored in that mode** — forced
colours only honours system colour keywords.

---

### 2026-10-29 — A screenshot taken with `animations: "disabled"` lies about an animated element
Tasks 012 and 013 disagreed with themselves: two pixel samplers returned different colours for the
same rect, and the number that survived into 012's criterion 14 was wrong. Settled by probing one
element with a **known opaque** fill, rather than carrying the disagreement into another sweep.

On a `span.cycle-dot` computing to `rgb(121, 84, 61)`: `groundPixels` read `121,82,58`;
`paintedColours` read `120,53,15`. That second value is `#78350f` — the dot's *pending* base colour,
which is to say the animation's initial keyframe.

**Playwright's `animations: "disabled"` cancels an infinite animation to its initial state.** It does
not freeze it where it is. The two helpers are otherwise line-for-line identical; the flag at
`e2e/helpers/background.ts:146` is the whole difference. So any element carrying an infinite animation
— the cycle dots, anything that pulses — screenshots as its *first* frame, and a contrast figure taken
that way describes a colour the user never sees at that moment.

**`groundPixels` is the sampler of record for painted figures.** If a measurement needs motion held
still, pause the animations in the page (`el.getAnimations().forEach(a => a.pause())`) and screenshot
without the flag: a paused animation keeps painting its current value, so the pixel and the computed
style describe the same instant. A cancelled one does not.

The same class of error produced 012's other bad number, from a different cause: a 6 px ring sampled
around the wordmark overflowed its 50 px surface by 1 px and reported the photograph behind it as the
wordmark's ground (2.925:1, where the real ground is 4.835:1). **A probe that samples near an edge
must be clipped to the surface under test and must fail loudly when nothing in-surface is left** — a
sampler reading the wrong pixel is worse than one that errors, because it is believed.

Both are the measurement-ordering lesson again (2026-10-26): a figure must name the painted pixel,
the theme and the ground it came from, or it cannot be checked.

---

### 2026-10-28 — Task 014: the pin is retired, and "current" is derived rather than stored
Settled while scoping 014 so the implementation does not re-ask any of it.

**The current task is the first task whose `done` is false.** Not the first row outright, and not a
stored flag. Auto-sorting finished tasks to the bottom was considered and **rejected**: it rewrites
`position` behind the user's back, so a list the user arranged by hand silently rearranges itself the
moment a box is ticked. Finished tasks stay where they are and the marker moves past them.

**`done` is a new independent field, not a reuse of the pin.** The pin answered "which one is current",
which is now derived, so the pin has no remaining job and is retired. The v3 -> v4 `.upgrade()` moves the
last pinned task to position 0, so the one thing the pin was expressing survives the migration.

**The dialog survives, scoped down.** The panel owns the checkbox, the current marker, drag and the
keyboard move; the dialog owns add, edit, delete and the +/-1 controls. Exactly one `DndContext` exists
across both, because two would fight over the same ids. `CurrentTaskCard` stays: it is the only surface
that shows the current task at the size the timer needs it.

**Placement:** fixed lower-left from `lg` up, ordinary page flow below, which is the same ruling already
recorded for the floating bottom cluster and for the same measured reason.

---

### 2026-10-28 — A fixed colour cannot win against a photograph, so the dialog's ground had to stop being one
Task 012 let the uploaded image paint at 100% and removed the page's 97% scrim. That moved the ground
behind an open task dialog from a near-opaque page colour to the photograph itself, dimmed only by
`--scrim`. Dark `--dialog-edge` `#80705d` fell from a recorded 3.98:1 to **1.232:1** against that ground
over a white image. QA raised it as the blocker criterion 12 told it to raise.

The obvious fix, letting the dialog's opaque fill carry the delineation instead of the edge, **was
measured and rejected**: over a white image the dark fill `#1e1610` is 3.028:1 against its scrimmed
ground, but over a black image it is **1.154:1**. The dark fill's luminance sits *inside* the band of
grounds the image can produce, so there is no scrim alpha that rescues it. Raising the alpha improves
the edge over white while making the fill worse over white, and changes nothing at all over black. This
is the same trap recorded on 2026-10-28 under the luminance-vs-contrast correction: for a fixed
foreground the worst ground is interior to the band, so bounding the image by black and white does not
bound the contrast.

**Decided: dark `--scrim` goes 0.62 -> 0.90, and `--dialog-edge` is the delineator.** The only
image-independent figure in the system is edge vs dialog fill, 3.731:1, so the edge is the only candidate;
making it work means making the ground predictable rather than making the stroke louder. At 0.90 the edge
clears 3:1 on both sides at both extremes: 3.469:1 against the ground over a white image, 4.266:1 over a
black one, 3.731:1 against the fill. 0.86 is the arithmetic minimum; 0.90 was chosen for margin against
sampler rounding. This does not contradict the owner's "full image visible" decision, because `--scrim`
paints only while a modal dialog is open.

The generalisable rule: **when a surface must sit over arbitrary user imagery, fix the ground, do not
re-tune the foreground.** Re-pointing a token against one sampled image buys a figure that the next image
invalidates.

Also found: the `--dialog-edge` comment still cited the pre-012 figures. Criterion 11 rewrote the
`--control-border` comments for exactly this reason and this file was missed, so the lesson from
2026-10-26 ("a criterion that names a figure must name where the figure came from") now has a corollary:
when a ground moves, grep for *every* comment that cites a figure against it, not just the ones a
criterion happens to name.

---

### 2026-10-28 — Two QA criteria were read literally and ruled out of scope, rather than widened
QA correctly reported two literal failures and asked for rulings instead of guessing. Both were ruled
PASS, because both criteria were aimed at something narrower than their wording.

- **012 criterion 6** requires "any new custom property" to carry a painted figure per theme.
  `--surface-blur` is a filter length, identical in both themes, with no painted figure to carry. The
  criterion is about colours, whose legibility is theme-dependent. Out of scope.
- **013 criterion 46** bans timers in the files the task touches. `components/PomotatoTimer.tsx` has a
  one-shot `setTimeout` that clears a spent aria-live sentence. The criterion exists to enforce the
  project rule that the remaining time is derived from a stored end timestamp and never counted by
  ticks. This timeout counts no time and feeds nothing back into the store. Out of scope, and the guard
  was deliberately **not** widened to ban every `setTimeout`, which would ban correct accessibility code.

The pattern worth keeping: a guard written to stop one specific defect will eventually catch something
innocent that matches its wording. Rule on the defect the guard was built for; do not widen the guard to
make the literal reading true, and do not weaken it either.

---

### 2026-10-28 — A `git ls-files` test broke on an unstaged rename, and the fix is to trust the disk
Renaming `CustomDurationInput.tsx` to `FocusLengthInput.tsx` without staging left the index naming a file
the working tree no longer has. `lib/audio/no-audio-asset.test.ts` builds its scan list from
`git ls-files -co`, so it handed `readFileSync` a path that does not exist and three guards died with
ENOENT. QA's reported "0 failing" predated its own rename and so was stale.

`listFiles` now drops paths that are not on disk: a file deleted in the working tree does not ship, so it
is not in scope for a "what ships" scan, whatever state anyone's index is in. The guard still
discriminates (red-proofed: a `decodeAudioData` probe in an untracked source file turns it red), and a
tracked file that genuinely vanished is still caught by the decode exemption's own `toContain`.

This is the same family as the HEAD-diff anti-pattern already recorded: **a test whose result depends on
git bookkeeping rather than on the tree will invert or crash for reasons that have nothing to do with the
code.** `components/background.guards.test.ts` still holds three such assertions from 010; they pass
today and are filed in `docs/PLAN.md`.

---

### 2026-10-28 — One round of owner feedback, split into tasks 012, 013 and 014, and built in that order
The owner gave three pieces of feedback and named the focus timer the highest priority. The work is
sequenced **012 (surfaces) then 013 (focus cycle) then 014 (task list)** anyway, which is the reverse of
the stated priority for the first item. The reason is this log's own 2026-10-26 "Measurement ordering"
ruling: taking the page scrim out moves the ground every contrast figure in `app/globals.css` was read
against, and 013 and 014 both add UI that sits on that ground. Measured in priority order, 013 and 014
each get measured twice. **Priority decided what shipped, not what was measured first.**

Six owner decisions were taken up front so no task re-asks them:
1. **Auto-advance switches the mode and auto-starts the next timer.** "Switch, then wait for Start" was
   shown and rejected.
2. **Only the Focus length is editable** (1 to 180 whole minutes, the old custom range). Short break stays
   5, long break stays 15. Making all three editable was shown and rejected.
3. **The pin is dropped; position 0 is the current task.** Reordering is how the current task changes. This
   supersedes the reasoning in `lib/db/types.ts`'s `Task` comment, which argues the pin is deliberately not
   a field so "exactly one task pinned" stays structural. A dense, unique `position` gives the same
   guarantee at position 0, so the property is kept by different means.
4. **Full-opacity background with frosted panels, no page scrim.** A lighter full-page scrim was shown and
   rejected: text would still sit on arbitrary photo pixels.
5. **Exactly one blurred surface, the timer panel.** See the R-10 entry below.
6. **The panels paint only while a background image is active.** With no image, `/` is unchanged from HEAD:
   open cream, no panel fills, borders or shadows. Panels defend text against a photograph, so permanent
   panel chrome is cost without purpose (R-31), and DESIGN.md asks for "minimalist, no clutter of widgets
   competing for attention". **Geometry is identical in both states and only the paint is conditional**, so
   adding an image never reflows the page. This is also a measurement saving worth keeping visible: the
   no-image state is layout- and paint-identical to HEAD, so its figures are already proven by 007, 009 and
   010 and need no re-measurement. Only the with-image state is swept.

### 2026-10-28 — The focus cycle: what `cyclePosition` means, and the two types that stopped being one
Task 013. `cyclePosition` counts **Focus runs completed in the current cycle**, 0 to 4. Only completing the
**long break** zeroes it (`lib/timer/cycle.ts`); a short break leaves it alone, and neither `reset()` nor
`selectMode` touches it. `reset()` clearing only the current run is deliberate: a mis-held hold-to-confirm
must not be able to destroy four Focus runs with no undo. The cost of that choice is that **no manual cycle
reset ships**, so a position stuck at 3 brings the long break one run early.

**`cyclePosition` can be 4 while the mode is `focus`, and it is defined, not undefined.** Skip an owed long
break by picking Focus from the chip row and all four dots are already solid with no index left to mark
active. `Math.min(position + 1, CYCLE_LENGTH)` pins it there, so every subsequent Focus earns another long
break until one is actually completed, which then resets to 0. It renders as four done dots with nothing
active and nothing animating, and reads as "Focus, 4 of 4 runs done, long break owed". Found by tracing the
transition function during orchestrator verification, before frontend reached it; left as-is because it is
self-limiting and self-healing.

**Drift.** Each next run's `endTimestamp` is the **completed run's own stored end** plus the next mode's
duration, never the wall clock at the moment completion was noticed, so noticing-latency cannot accumulate
across a cycle. One step only: if that computed end is already in the past, the timer lands idle rather
than chaining, which is what stops a tab closed for hours from replaying history on reload. A full cycle at
a 1-minute Focus therefore ends exactly 2,040,000 ms after the first start (1+5+1+5+1+5+1+15 minutes), and
the criterion asserting it carries **no tolerance**, because a correct implementation has no rounding to
forgive.

**`SessionMode` and `TimerMode` stopped being an alias.** `lib/db/types.ts` had `export type SessionMode =
TimerMode`, so narrowing the selectable modes to three would have silently narrowed the **stored** union and
dropped existing `mode: "custom"` rows out of stats. It is now `SessionMode = TimerMode |
LegacySessionMode`, a superset by construction: a new selectable mode becomes loggable automatically, and
shrinking `TimerMode` cannot remove `"custom"` because it is named explicitly. Both lists are derived from
exhaustive `Record` types (`lib/db/session-modes.ts`, `lib/timer/modes.ts`), so dropping a value or adding
an unlisted one fails **typecheck** rather than failing quietly. `custom` stays focus-type in
`isFocusTypeMode` forever; no new row ever gets it.

**The chip row stays, and the dots are a read-out rather than a control.** Two shape decisions that a
later task would otherwise re-ask. The mode chip row was **not** replaced by a single active-mode label:
it is the only manual escape hatch out of a cycle that now advances and starts on its own, so being able
to say "give me the long break now" matters more than it did when every run was started by hand, and the
chips are native radios with a legend, keyboard operation and a measured non-colour selected cue that a
label plus some other control would re-open. The dot group is a **sibling row immediately below** the whole
chip row, not hung under the Focus chip, because the cycle outlives any one mode and the dots stay
meaningful during a break. **Nothing in the dot group is focusable, clickable or keyboard-reachable**; the
group is `aria-hidden` and the position reaches assistive tech through one visually hidden sentence naming
the mode and the position. **No live region was added** — `PomotatoTimer.tsx` and `TimerControls.tsx`
already hold one polite announcer each, and a third firing on every cycle step is noise.

**Renames**, for anything reading older task files: `customMinutes` to `focusMinutes`, `setCustomMinutes` to
`setFocusMinutes`, `parseCustomMinutes` to `parseFocusMinutes`, `CUSTOM_MINUTES_*` to `FOCUS_MINUTES_*`, and
the input id `custom-duration` to `focus-length`. The old fixed `FOCUS_MINUTES` constant is gone, since the
Focus length is now stored state.

### 2026-10-28 — Two task-013 criteria were wrong, and both were caught by looking at the painted page
Recorded because of *how* they were caught, which is the reusable part.

**Criterion 25 contradicted criterion 27.** 25 said the active dot shows the static ring "in a break mode of
any status"; 27's step-by-step sequence said "nothing animating, no dot active" during a break. **27 was
right** and is now the spec: the dots count Focus runs, so during a break none is active and there is
nothing for a ring to mark. The ring exists only because R-19 forbids an endless pulse on an idle timer,
which is a Focus-mode problem. **Frontend implemented 27 and raised the conflict instead of picking
silently**, which is the behaviour that stopped QA measuring a state the spec disagreed with itself about.

**Criterion 7 said the duration field is "absent in both break modes".** Built exactly as written, it left a
conspicuous empty gap for 5 or 15 minutes of every cycle. Frontend had reserved the slot so the controls
would not jump under the cursor during an unattended auto-advance, which was the right call given the
wording. The defect only became visible in a screenshot: an empty reserved slot is **leftover space, not
structural whitespace**. The owner ruled the field present in every mode, interactive except while a *Focus*
run is running or paused. That also recovered a real loss nobody had noticed: **a break is the natural
moment to decide the next Focus length**, and hiding the field removed the control exactly when it was most
usable.
**How to apply:** a criterion that passes code review can still be the wrong criterion. Both of these were
satisfiable as written and both were wrong, and neither would have surfaced from a diff. Render the states
and look at them before QA spends a round measuring them.

### 2026-10-28 — Floating chrome goes into page flow below `lg`, because Start was not pressable on a phone
Found in orchestrator verification of task 012, not by QA. The fixed control cluster sits over the timer at
phone sizes, so **Start needed a scroll before it could be pressed**, on an app whose whole job is that
button. Probed with `elementFromPoint` at each control's own centre rather than rect maths, and attributed
by neutralising only the padding and border 012 added, which reproduces HEAD's vertical geometry:

| viewport | at HEAD | with 012 before the fix |
|---|---|---|
| 320x568 | Start 55% covered | Start below the fold (y 571 in a 568 viewport) |
| 375x667 | reachable | Start 43% / Reset 55% covered (y 524 to 571) |
| 320x700 | reachable | reachable |

**375x667 was a 012 regression** (27 px, exactly `p-4` plus a 1 px border on the panel and `py-1` plus 1 px
on the header); **320x568 was already broken at HEAD**. Recorded split like this on purpose: PLAN.md's
convention is that a task which merely *finds* a gap should not be credited with causing it.

**Why padding cannot fix this, which is the generalisable part.** `pb-28` reserves space at the **document**
end, while a fixed element occupies the bottom of the **viewport** at every scroll position. When the
document is only a little taller than the viewport, the at-rest position therefore puts content under the
overlay no matter how much bottom padding the page reserves. **Reserved padding is not a substitute for not
overlaying.**

**The ruling:** below `lg`, floating chrome stops floating and sits in normal page flow; at `lg` and up it
stays fixed. This covers `widgets/BottomControls.tsx` and, by the same rule, task 014's task-list panel, so
the two widgets follow one rule rather than two. The owner was shown shrinking the panel instead (fixes
375x667 only partly, leaves 320x568 broken, since the panel is taller than that viewport regardless) and
accepting it as a floating action bar, and chose flow.

### 2026-10-28 — Two antislop collisions resolved inside the rules, with no override
antislop ran in `during` mode. Two owner requests collided with named rules; per R-37 each was raised with
the element and the rule named, rather than followed or overridden silently. **Both resolved without an
override**, which is worth recording because the resolutions are now constraints, not preferences.

**R-10 (glassmorphism dose cap) vs "frosted panels".** Blur on the timer, the task list and the bottom
controls is three or more surfaces; R-10 caps it at one or two, and `antislop-ui` states the reason as
"when every surface is glass, nothing is foreground". Resolved by frosting **only the timer panel**, which
makes it the page's single focal point (core Part 3), with every other surface opaque. This is a
strengthening rather than a compromise: an opaque ground is a fully provable contrast ground, so those
surfaces need flat token figures and no adversarial-image sweep at all. **A later task proposing glass on a
second surface is reopening an owner ruling, not making a style choice.**

**R-19 and "Decorative Status Dot" vs the pulsing cycle dot.** The guidance is that a dot marking a real
state should "drop the endless pulse", and task 010 pinned that nothing animates while the timer is idle.
Resolved by scoping the pulse to `status === "running"` and giving the active dot a **static outlined ring**
when idle, paused or complete. So there are four painted treatments, not three, and `prefers-reduced-motion`
collapses the pulse into the ring rather than into nothing, which leaves reduced-motion users a real cue.

### 2026-10-28 — Bounding an image-dependent ground by black and white bounds luminance, not contrast
Found by `pm` while scoping 012, correcting an instruction from the orchestrator's own brief. This log's
qa cost rule 3 says to bound an adversarial image set by the extremes. That is sound for a *ground's
luminance* and wrong for a *contrast ratio*: for a fixed foreground, the worst ground is the one nearest it
in luminance, which is **interior to the band**. The wordmark's `--primary` `#b45309` (relative luminance
about 0.168) measures about 4.83:1 on pure white and about 4.35:1 on pure black, both clearing its 3:1
large-text floor, while a mid-tone photo at the same luminance gives about 1:1. **Measuring the extremes
would have reported a comfortable pass on unreadable text.**
**How to apply:** the extremes bound an image-dependent ground only when the band does not contain the
foreground's own luminance. A band that straddles a foreground it carries is a failure, not a figure. 012
carries this as a straddle clause QA must state per foreground, and it is why the header wordmark got a
solid surface: arithmetic, not taste. The extremes bound still holds behind the frosted panel, because the
fill keeps the band narrow.

### 2026-10-27 — `npm run typecheck` generates route types first, because `tsc` alone cannot pass a clean tree
`tsc --noEmit` on a fresh checkout fails with `app/layout.tsx: error TS2304: Cannot find name 'LayoutProps'`. Next 16 generates `LayoutProps`/`PageProps` into `.next/types` during `dev` or `build`; `.next/` is gitignored, so **the gate only ever passed here because a build had already run on this machine**. CI runs `typecheck` before `build` on an empty runner and fails every time. Caught in a dress rehearsal (`git archive HEAD` into a scratch dir, `npx npm@10 ci`, then each gate) rather than by a third red deploy.
**The script is now `next typegen && tsc --noEmit`.** `next typegen` is a real Next 16 subcommand that emits those types without a full build. Putting it in the script rather than adding a workflow step is the same call as the `.npmrc` one entry below: a clean clone running the command CLAUDE.md documents has to work, and a workflow-only step leaves that broken while hiding the reason.
**Worth knowing for anything that diffs against HEAD.** This change trips task 010's `components/background.guards.test.ts` guard "package.json and package-lock.json are unchanged against HEAD" for as long as it sits uncommitted, because that guard is a working-tree-vs-`HEAD` diff. It goes green on commit and is green in CI, where the tree *is* HEAD. The same mechanism made four guards in that file fail in the first rehearsal for a dumber reason — the scratch directory had no commit, so there was no `HEAD` at all. **A guard written against `HEAD` reports the harness as much as the code; give it a committed tree before believing it.**

### 2026-10-27 — `.npmrc` pins `legacy-peer-deps`, because the flag was load-bearing and invisible
The Pages deploy failed at `npm ci` on the `vitest@5.0.3` / `@types/node@^20` peer conflict this log first recorded on 2026-10-02. The flag had been passed by hand at each install since; the **lockfile was resolved under it and nothing in the repo said so**, so any clean install was a coin flip on the npm version.
**Why it never failed locally.** The dev machine runs **npm 11**, which no longer hard-fails `npm ci` on an unsatisfiable *optional* peer; CI's Node 22 ships **npm 10**, which does. `legacy-peer-deps` was `false` in both. Reproduced by running `npx npm@10 ci` against a copy of `package.json` + `package-lock.json` in a scratch directory — identical `ERESOLVE`, down to the `Conflicting peer dependency: @types/node@26.6.5` line — then re-run with the `.npmrc` in place: 813 packages, `@types/node@20.19.43`, `vitest@5.0.3`, exactly the lockfile's versions. **The flag changes peer resolution, not a single installed version.**
**Why `.npmrc` and not `npm ci --legacy-peer-deps` in the workflow.** The flag belongs wherever the lockfile is read, not in one caller. A workflow flag leaves the next contributor's clean `npm install` broken and silently re-teaches the by-hand habit that caused this. It is also npm-version-proof, so a future runner image moving to npm 11 or back changes nothing.
**The real fix is still open**, and the `.npmrc` comment names it: `@types/node` is pinned to `^20` while the dev machine runs Node 24 and CI runs Node 22, and `vitest@5` wants `^22 || >=24`. Moving it off `^20` would retire the flag outright — deferred here only because it is a typecheck-surface change, not a deploy fix, and the deploy was the thing that was broken.

### 2026-10-27 — Deployment: GitHub Pages via static export, not a branch-served Jekyll build
Pages was set to "Deploy from a branch", so GitHub's default `pages-build-deployment` ran Jekyll over the whole repo and published `docs/`, never the app. It died on `docs/tasks/007-token-foundation-completion.md:797`, where `style={{ backgroundColor: TASK_COLOR_HEX[colorId] }}` sits inside an inline code span: **Liquid runs before Markdown and does not respect backticks**, so it read the braces as a variable expression. Escaping them per file was rejected — `{% raw %}` is visible noise in the GitHub Markdown view that every reader of these docs actually uses, and the next task file would reintroduce the break.
**What ships instead.** `.github/workflows/deploy.yml` builds a static export and publishes it through `actions/upload-pages-artifact` + `actions/deploy-pages`. Jekyll never runs, `docs/` is never published, and task files may contain whatever braces they like. **This needs the Pages source set to "GitHub Actions" in repo settings** — until that is flipped the old branch build keeps running and keeps failing. `.nojekyll` at the repo root is kept as insurance for that window, and against anyone reverting to branch deploy later.
**`output: "export"` is honest here**: no route handlers, no server functions, no `next/image`, and every byte of state is IndexedDB on the client. It applies to a local `npm run build` too, deliberately — the artifact you deploy is the artifact you build. It does break `npm run start`, since `next start` refuses an exported app; serve `out/` instead. Playwright is untouched, as its `webServer` runs `next dev`.
**The sub-path is an env var, not a literal.** Pages serves this repo from `/pomotato`, and `basePath` is inlined into the client bundle at build time. `NEXT_PUBLIC_BASE_PATH` is set in the workflow only, so dev and local builds stay at the root and no `toHaveURL(/\/stats$/)` assertion has to move. Next applies the prefix to `next/link` and to its own assets; **it does not touch a bare `fetch`**, so `RAIN_FILE_PATH` in `lib/audio/files.ts` spells the prefix out itself or the rain asset 404s in production. That line is the thing to copy when any other hand-fetched asset is added.
**No `trailingSlash`.** The export writes `settings.html`, not `settings/index.html`, and Pages resolves `/settings` to it. Turning it on would be more portable across hosts but would move every URL to `/settings/` and break four `toHaveURL` assertions in `e2e/`. If a direct link to a sub-route ever does 404, that is the one-line fix — and those four assertions move with it.

### 2026-10-27 — Rain ships as a recording; the synthesis ruling is superseded for one layer only
Two synthesis attempts failed the owner's ear: the first was continuous filtered noise and read as static; the second added genuine droplet transients but gave each an upward pitch sweep, which is the laser gesture, and read as "game projectiles shooting". The owner then chose a recording. **The 2026-10-27 "Milestone 5 scoping" ruling that "no audio file ships, in any format" is superseded for `rain` and still holds for `wind`, `waves` and `hum`**, which remain synthesized and unchanged. One file, three procedural layers.
**How it is wired.** `lib/audio/files.ts` fetches and decodes the file at page load through a one-frame `OfflineAudioContext`, memoised by path, because `LayerSource.create()` is synchronous while `decodeAudioData` is not, and the real `AudioContext` does not exist until the first gesture. **Eager loading is forced by the e2e assertion that audio still works with the network blocked after load**; a lazy fetch on first gesture would fail it. A buffer that has not arrived, or a failed fetch or decode, yields a shared silent voice with `nodeCount` 0 that disposes cleanly, so the layer degrades to silence and never throws. The loop crossfade is baked into the buffer at decode time: a 4 s equal-power sin/cos blend of tail into head, capped at a quarter of the file, so the last sample runs into the first with no butt loop, no extra nodes and no timer. `apply()` still does all graph mutation before its only `await`, so the re-entrancy property the task 011 reviewer cleared is preserved. `RAIN_FILE_PATH` is the one constant; nothing else reads the file's length, channel count or format.
**Transcoding is part of shipping an asset here.** The owner's source was 41 MB of 24-bit stereo WAV at 155 s. It ships as mono AAC at 96 kbps, trimmed to 60 s, at 723 KB: a 58x reduction. Rain carries no stereo information worth the bytes and nothing above ~10 kHz that matters, and 60 s crossfaded has no audible period because rain is dense and stationary. **Avoid any recording with a transient event** (thunder, a passing car, a bird): on a loop it becomes a metronome, and that is worse in a focus timer than thin rain. An earlier candidate was rejected for exactly this, being an interior ambience with thunder and a fireplace.
**The guards were amended, not deleted.** `lib/audio/no-audio-asset.test.ts` asserted zero audio assets; it now asserts **exactly one, named**, so a second asset or an unlicensed leftover still fails, plus a separate test pinning the `decodeAudioData` exemption to `lib/audio/files.ts` alone. Task 011 criterion 10's e2e assertion now pins the one allowed same-origin path instead of banning media outright, and its offline half was **strengthened**: it waits for the asset to arrive before going offline, then asserts the node count (37 with four layers, versus 35 if rain's buffer were missing), because the snapshot's own `on` flag cannot distinguish "rain is sounding" from "rain is reported on and silent".
**Copy.** The dialog said "Sounds generated in your browser, nothing downloaded." That is false with any file-backed layer, CC0 or not, and criterion 15 requires such a claim to be true, so it was removed. Its e2e assertion pinned that exact phrase and was inverted to guard the falsehood instead; the blanket ban on the word "recording" was dropped for the same reason, and the fictional-source ban now applies to the layer labels rather than the whole dialog so a future credit line cannot trip it.

### 2026-10-27 — Asset provenance: the rain recording (CC0)
`public/sounds/rain-865572.m4a` is the **only** audio asset in the repo.
- **Source:** "Rain_Balcony_Ambiance_2" by **SMKoski02**, https://freesound.org/people/SMKoski02/sounds/865572/
- **Licence:** **Creative Commons 0 (CC0)**, a public-domain dedication. Verified by reading the Freesound page directly, not taken from the filename or the owner's report: the page states the sound may be copied, modified, distributed and performed, including commercially, without permission. **No attribution is required**, which is why no credit surface was built.
- **Original:** 80.25 s, 24-bit stereo WAV at 44.1 kHz, 21.3 MB. **As shipped:** mono AAC at 96 kbps, full length, 964,671 bytes. A 22x reduction; rain carries no stereo information worth the bytes and nothing above ~10 kHz that matters. The source WAV is not kept in the repo, since re-downloading it from the URL above costs a minute.
- **Filename carries the Freesound id** so the asset traces back to its licence without reading this file.
- **Replaced a CC-BY candidate.** An earlier pick ("Gentle Rain" by carlopatrao, freesound.org/s/632087/) was Attribution 4.0, which permits the use but requires visible credit the build did not render. Rather than add an attribution surface to a dialog DESIGN.md asks to keep uncluttered, the owner chose to find a CC0 source. **The lesson worth keeping: check the licence field before transcoding, not after.** Two files were processed and discarded before this one, one for licence and one for content (an interior ambience with thunder and a fireplace, which would have become a metronome on loop).
- **If this asset is ever swapped:** `RAIN_FILE_PATH` in `lib/audio/files.ts`, `ALLOWED_AUDIO_ASSETS` in `lib/audio/no-audio-asset.test.ts`, and `ALLOWED_AUDIO_PATH` in `e2e/soundscape-mixer.spec.ts` all name the file and all three must move together, or the guards fail. That is deliberate: it is what stops an unlicensed asset being dropped in quietly.

### 2026-10-27 — Rain is rebuilt from droplet transients, not cut and not sampled (owner ruling, after listening)
The owner listened to the shipped mixer and reported that rain "sounds like a TV static". Correct, and the cause is specific: `lib/audio/sources.ts:89-100` built rain from two **continuous noise beds** (highpassed white hiss at 3.2 kHz, plus bandpassed pink at 1.8 kHz with a 0.17 Hz level wobble) and **no transients at all**. Rain is a dense field of discrete impacts, and those impacts are what identifies it; a shaped noise bed has none, so it can only ever read as tuned static. Synthesis had not actually been tried for rain: what shipped was noise with an EQ on it.
**Ruled: rebuild it with droplets, keeping the zero-asset property.** Generate a few seconds of droplet-dense audio at runtime with `OfflineAudioContext` (many short enveloped impacts at randomised times, pitches and pans, over a much quieter bed), looped at two decorrelated rates so no loop period is audible. This reuses the buffer approach `lib/audio/noise.ts` already uses, needs no JS timer, and ships nothing.
**Why not the file route, which was ready:** the `LayerSource` interface exists precisely so a file-backed source can drop in without touching the mixer UI or the persisted shape, and that hatch stays open. It was not taken because the fair test of synthesis had not been run yet. A CC0 recording costs per-file provenance the owner must approve, several MB in the repo and the milestone-7 PWA cache budget, and crossfading to hide the loop seam. If droplets still do not convince, that route is unchanged and still available.
**Why not cut to three**, which is what `docs/tasks/011-ambient-soundscape-mixer.md` said to do for an unconvincing layer: the task file's instruction assumed the layer had been synthesized properly and still failed. It had not been.
**Scope:** rain only. The owner judged wind, waves and hum acceptable. They share the filtered-noise-bed approach, so if they are ever reported the same way the fix generalises rather than being rain-specific.
**Track size:** small/self-contained per CLAUDE.md. One layer's source implementation behind an existing interface, no new data shape, no new surface, no persisted state. Frontend implements, the orchestrator verifies. No new task file.

### 2026-10-27 — A stroke's contrast is measured at its fully-covered pixel, not its antialiasing fringe (owner ruling)
Task 011's QA sweep measured border contrast across the half-covered rows an antialiased stroke paints above and below itself, and reported sub-3:1 figures (fader track 1.913 light / 1.990 dark, unchecked checkbox 1.919 light / 1.959 dark, light focus ring 2.084) while the same strokes' fully-covered pixels passed (unchecked checkbox 4.394 light, focus ring 4.835 light / 3.120 dark).
**Ruled: the measured value of a stroke is its fully-covered pixel.** Fringe rows are a rendering artifact of a stroke landing on a half-pixel boundary (at 1280x800 DPR 1 the slider sat at y 206.5 and the checkbox at y 170.5), not the edge a person sees; the perceived edge is the composite of the covered row and its fringe, and it is the covered row that carries it.
**Why this and not the stricter reading:** it is the method tasks 006, 009 and 010 already used. 010's approved `--control-border` figures (light 3.363, dark 3.546) are full-coverage readings, so adopting the fringe-row method would retroactively fail work already shipped and reviewed, and would reopen milestone 4's palette rather than settling milestone 5.
**The part that was a real defect, not an artifact:** a **1 px** stroke at a half-pixel offset has *no* fully-covered row at all, so for the fader track the thin reading was genuine and not resolvable by a ruling. The track's border was taken from 1 px to 2 px, matching the checkbox and thumb, which gives it a covered row to measure in the first place. A 1 px border is therefore not an acceptable way to carry a 3:1 boundary on a surface whose position is not pixel-aligned.
**How to apply:** record every figure as a full-coverage painted pixel, naming the theme and the pixel (CLAUDE.md "Measurement ordering" already requires the provenance). If a boundary has no covered row, thicken the stroke rather than arguing the measurement.

### 2026-10-27 — Ambient soundscape mixer (task 011)
Four layers ship, ids `rain`, `wind`, `waves`, `hum`, declared once in `lib/audio/layers.ts`; a fifth is a registry entry plus a source behind the `LayerSource` interface. Persisted as one `lib/preferences/` key, `mix`: `{ [layerId]: { on: boolean, level: integer 0 to 100 } }`, about 140 bytes inside a ~210-character `pomotato-preferences` entry (QA, criterion 6), validated per layer and per field. `PREFERENCES_VERSION` stays 1 because `sanitizePreferences` falls back per key, the same reason `gaugeStyle` and `background` needed no bump. Levels persist independently of on/off.
Playback state is deliberately **not** persisted: autoplay policy requires a user gesture before audio can start, so a reload starts silent with the mix intact, and the `AudioContext` is not constructed until the first click that asks for sound. Closing the dialog and client-side navigation do not stop the sound (the engine is a module-level singleton); a reload does. Playback is **per-tab**: two tabs are two graphs and doubled sound, accepted and not solved.
Gain changes ramp via `setTargetAtTime` with a 40 ms time constant, and an idle context is suspended on the audio clock, with no JS timer and no `requestAnimationFrame` anywhere in the feature.
**Provenance:** no *asset* provenance entry is needed, because no asset is sourced. Every sample is synthesized in the browser from `Math.random()` through filters written in this repo, and no audio file ships, which is the whole point of the 2026-10-27 scoping ruling below.
The one piece of third-party material is not an asset but a formula: the pink-noise filter uses **Paul Kellett's economy pink coefficients** (published on musicdsp.org, placed in the public domain), credited at `lib/audio/noise.ts:14`. A set of filter coefficients is almost certainly uncopyrightable and carries no licensing risk, but CLAUDE.md asks for provenance on anything not original, so it is recorded here rather than left to imply the DSP was invented in-house (task 011 review, R-4).
**Known cost, measured not estimated:** a full fader drag writes to `localStorage` on every value step, 100 writes for a 0-to-100 drag (QA, criterion 6). The entry stays ~210 characters, so each write is small, but the level commits per step rather than on pointer release. Recorded as a Maintenance item rather than fixed in 011.

### 2026-10-27 — Milestone 5 scoping: the soundscape is synthesized, not sampled; mixer is a dialog; playback is manual
Three owner rulings taken before task 011 was written, so pm scopes against them rather than re-asking.

**1. Every layer is generated in the browser with the Web Audio API — no audio file ships, in any format.**
Filtered noise and oscillators, built at runtime from a seeded generator.
**Why:** CLAUDE.md requires CC0-or-equivalent audio with provenance recorded here, and DESIGN.md already set the
precedent for exactly this trade when it deferred the paper grain: "produce it procedurally (SVG/CSS noise) rather
than shipping a texture asset, which sidesteps the licensing question entirely." The same reasoning holds harder for
audio — a sourced loop needs per-file provenance the owner has to approve, seam-hiding at the loop point, and several
MB entering the repo and the milestone-7 PWA cache budget. Synthesis has no loop point to hide and no license to
record, and the output is original by construction.
**The cost, accepted knowingly:** synthesized sound is convincing for rain, wind, waves and low hum, and unconvincing
for anything with recognizable detail — a café, birdsong, a keyboard. Those layers are out of scope for this
milestone, not deferred-and-forgotten; adding one means revisiting this decision, not working around it.
**Kept open:** the layer source is an interface, so a file-backed source can be added later without touching the
mixer UI or the persisted shape. That is what makes this reversible.
**Provenance:** no asset provenance entry needed, for the same reason as the uploaded background — nothing ships.

**2. The mixer is a dialog opened from the bottom-right control cluster**, a fourth control in
`widgets/BottomControls.tsx` beside the task list, stats and settings.
**Why:** it follows the pattern task 004 established for the task list, and keeps a per-layer adjustment one click
from the running timer. `/settings` was rejected for the same reason the theme control stayed in the header
(DECISIONS 2026-10-26): changing a level mid-session is a frequent action and should not sit behind navigation.
A dedicated `/sounds` route was rejected as more chrome than the feature needs today.

**3. Playback is manual only.** Sound starts when she turns it on and stops when she turns it off; it does not
follow timer state.
**Why:** browser autoplay policy requires a user gesture before any audio can start, so a timer-linked mode is
inconsistent in precisely the moment it would matter — the first focus run after a page load could not make a sound.
Manual playback is one state machine instead of two coupled ones. A "pause on break" preference remains addable
later as one key, which is why this is not a door closing.

### 2026-10-26 — Uploaded background: bytes in Dexie, a reference in preferences; 5 MiB; PNG, JPEG, WebP
Task 010. The image bytes live in a new Dexie table `backgrounds`; the `background` preference (`lib/preferences/`) holds only the row's id, or `null`.
**Why:** localStorage is ~5 MB per origin, string-encoded, and shared with `pomotato-timer`. A data URL costs ~1.33x the file, so a 4 MB photo is ~5.3 MB and does not fit, and a quota throw fails the whole `pomotato-preferences` write, losing `theme` and `gaugeStyle` too. IndexedDB stores binary natively with no per-key cap. The reference is ~55 bytes serialised.
**Versions:** `CURRENT_SCHEMA_VERSION` 2 -> 3, as a new `.version(3)` block beside the frozen ones (additive, no upgrade callback). `PREFERENCES_VERSION` stays 1: no existing key changed meaning, and a v1 payload gains `background: null` through the per-key sanitiser.
**Limits:** max 5 MiB (5,242,880 bytes), rejected not downscaled (resizing needs canvas re-encoding, a separate task). Accepted PNG, JPEG, WebP, still only, identified from the file's bytes rather than its name or declared MIME, and truncated files are rejected. SVG is excluded because it is a script-capable XML document rather than a bitmap, so it cannot be bounded or checked by signature; GIF, APNG and animated WebP are excluded because nothing may animate (criterion 24); AVIF/HEIC for uneven browser support. The owner can veto the number after the fact.
**Degradation:** a reference that does not resolve (no row, wrong id, bytes that no longer validate, IndexedDB unavailable or blocked) reads as no background and never throws.
**Provenance:** no asset provenance entry is needed; the image is the user's own file, held on her device, and none ships in the repo.

### 2026-10-26 — `--control-border` has no contrast headroom left, and the grain is why
Found by task 008's reviewer (R-2) after the paper grain shipped the same day. Recorded because it is a **standing constraint on the palette**, not a task.

`--control-border` (`#88837e`) is the edge on every fill-less control — the unchecked mode chips, the custom-duration input, the unchecked `/settings` radio cards. It measures **3.44:1 against the flat `--background` token**, which is the figure 009 recorded and which 008's notes inherited. But the grain darkens the *painted* light ground, so against what actually renders it is **~3.26:1**, and **~3.01:1 against a worst-case full-mask grain pixel**. Dark moves 3.80 → ~3.66.

**Nothing breaks: the 3:1 floor still clears.** The point is that it clears by roughly 60% less than the recorded figure suggests, which makes this the one token in the palette with nothing left to spend. The reviewer reproduced QA's painted sample (245,237,227) to within a unit by compositing `--grain-ink` at `--grain-opacity` over `--background`, so the arithmetic is independently confirmed from two directions.

**How to apply.** Three things are now unsafe without re-measuring: darkening any ground this edge sits on, raising `--grain-opacity`, and reusing `--control-border` on a new fill-less control. Any of those needs a painted measurement first, not a token-level one — and `--popover` was already capped for a different reason (the dark task swatches clear it by ~1.3%). Between them, the light ground and dark `--popover` are now both pinned.

**Second-order lesson, worth more than the figure.** 009's whole token foundation was measured against flat token values; the grain changed what paints without changing a single token, and every one of those figures became nominally stale at once. Only the pairs with real headroom survived unexamined. **A contrast figure is a property of what paints, not of the token** — so record the ground a figure was taken against, and re-measure when anything beneath it changes.

**Amended 2026-10-26 (task 010, owner ruling 8): light `--control-border` is re-pointed, `#88837e` to `#7a756f`. The "no headroom" finding above is superseded for light; its reasoning stands as the provenance.** Task 010 was the first to actually hit the constraint: the darkest painted pixel of the grained light ground (236,229,218, real screenshot) measures **3.0005:1** against `#88837e`, so the floor was fully spent before any image existed, and one 8-bit level darker is 2.9728:1. The owner fixed the token rather than the feature. `.dark`'s `#80705d` is untouched.

Painted figures for `#7a756f` (floor 3.00), reproduced from real screenshots and from Chromium's resolved colours: grained `--background` darkest pixel **3.648**, `--card` **4.179**, `--popover` **4.394**, `--muted` **4.183**, delete-confirm tint (247,231,222) **3.790**. Only `--background` is grained; `body::before` sits behind every opaque surface, so the other four are flat. Over the 010 adversarial images under the 97% scrim (`bg-background/97`), the grained ground's worst light figure is **3.363** (black or split image), 1 px checker **3.363**, white **3.619**. *(Checker corrected 2026-10-27 from 3.428, twice-measured by QA: 3.428 came from pixel `230,222,213`, but the worst painted pixel in that region is a dimmed black cell at `228,220,211`, which is the same figure as the black image. Worst-pixel scan of a 1280x800 screenshot, light theme, strips x 0-40 and x 1230-1260.)* Headroom now: about **0.65 points** on the bare light ground (it was 0.00), 0.36 at the worst dimmed case.

Dark was never the 3.80 the earlier comment said: painted on its lightest grained pixel (40,31,25) `#80705d` is **3.379**, not 3.80 (3.80 is `--card`, flat). With a white or split image under the 97% scrim it is **3.107**, the thinnest pair left in either theme, headroom about 0.11 points. The comments on both tokens in `app/globals.css` now carry painted figures.

**Amended 2026-10-26 (task 010, owner ruling 9): dark `--control-border` is re-pointed too, `#80705d` to `#8a7968`.** Ruling 8 made light's edge better and flipped the "dark not worse than light" direction assertion in `e2e/dark-sweep.spec.ts` (disabled custom-duration field; no floor broke, dark 3.80 against light 4.18). The owner chose to lighten dark rather than soften the assertion, because after ruling 8 dark held the thinnest pair in the app (3.107:1, grained ground under a white or split image). She studies at night.

Painted figures for `#8a7968` (floor 3.00), real screenshots, lightest pixel of the grained dark ground: no image **3.857** (40,31,25), white or split **3.546** (46,38,32; was 3.107), black 3.912, grey 3.729, amber 3.655, 1 px checker 3.593. *(Amber and checker are the two figures QA's independent pass contradicted, reading 3.777 and 3.546 with a 6 px ring sampler against these worst-pixel numbers; both are non-binding and the gap is about one 8-bit grain level. Where the two methods disagree the ring sampler is the conservative one. The binding dark figure, white or split at 3.546, agreed to three decimals.)* Flat grounds: `--card` **4.339**, `--popover` **4.260**, `--muted` **3.997**, `--secondary` **3.761**, delete-confirm tint (41,27,20) **3.977**. `--dialog-edge` is a separate token and stays `#80705d`.

**How to apply, final.** Neither theme is the constraint now. Headroom over 3.00 at each theme's worst painted case: light **0.36** (3.363, black or split image), dark **0.55** (3.546, white or split image). Dark's recorded worst is now above light's, which is what the direction assertion needs. The caveats are unchanged: raising `--grain-opacity`, darkening a light ground, lightening a dark ground, or letting more image through the 97% scrim (a white image at 96% measured 3.03 in dark before this change) each need a painted measurement first. Dark `--popover` stays capped by the task swatches. Reusing `--control-border` on a new fill-less control needs a painted measurement on its actual ground. The original lesson holds: record the ground a figure was taken against.

### 2026-10-26 — Paper grain ships as a masked noise layer behind content, and one first-paint test changed shape because of it
Milestone 4's paper grain (DESIGN.md: "at low opacity", "procedurally (SVG/CSS noise) rather than shipping a texture asset, which sidesteps the licensing question entirely"). Built on the small/self-contained track — frontend implemented, orchestrator verified, no task file.

**What it is:** `body::before`, fixed, `inset: 0`, `z-index: -1`, `pointer-events: none`. An inline SVG `feTurbulence` data URI (fractal noise, base frequency 0.8, 3 octaves, 240px tile) with the noise folded into alpha, used as a **mask** over a `--grain-ink` background. The mask-over-token approach is the load-bearing choice: a data-URI with a baked-in colour could not follow the theme, so the grain's colour comes from a token and themes with everything else. No asset file, no dependency.

| Theme | `--grain-ink` | `--grain-opacity` | Effect |
|---|---|---|---|
| Light | `#2b2017` (text brown) | 0.07 | darkens the cream, like pencil dust |
| Dark | `#f5ebdc` (cream) | 0.05 | lightens the ground |

Dark flips to light ink, because dark ink on `#1c140e` would vanish, and takes a lower opacity because noise reads louder on a dark ground.

**It sits behind all content, deliberately.** Only transparent areas — the page ground — show it, so it never composites over text, controls or the eight task swatches. That was a hard requirement: the dark swatches clear `--popover` by 1.3% (potato at 3.04:1), and grain over a swatch would have broken criterion 19 outright. Verified rather than assumed: every painted-pixel contrast spec and the dark swatch checks pass unchanged.

**The cost, stated:** the light page ground is now ~2.5% darker on average when painted (mean red 244.7 against the flat 251; measured spread 236-251 light, 28-40 dark). Every contrast figure recorded before today was computed against the *flat* token, so those figures are nominally a hair off for any pair measured against the page ground. No floor broke — the painted specs still pass — and for dark text on cream a slightly darker ground slightly *helps*. Recorded so nobody re-derives a figure and thinks it drifted.

**One test legitimately changed shape.** `e2e/dark-theme-control.spec.ts`'s criterion 8/48 check sampled the ground pixel at (4,4) and asserted **exact** equality with the `--background` token. With grain, no ground pixel equals the flat token any more, so the assertion was testing a fact that is no longer true — while the criterion's actual intent, *the first painted frame is the right theme and not a wrong-theme flash*, still holds completely. It now asserts that intent: the pixel is within a stated grain tolerance of the correct ground **and** nearer the correct ground than the other theme's. The two themes sit ~220 apart per channel against noise of ~15, so this is a far wider margin than exact equality gave. **Proven non-vacuous** by inverting the expected ground, which fails all three cases, then restoring. Frontend escalated this rather than tuning the grain to dodge the sampled pixel, which was the right call — moving the grain could not have fixed it, since the ground is noise everywhere.

**How to apply:** when a design change makes an exact-value assertion false, check whether the assertion was ever the criterion. Here the exact match was a proxy; replacing it with the intent made the test both grain-tolerant and stricter about what it was supposed to catch.

### 2026-10-26 — Four scoping decisions opening task 008 (the settings surface)
Taken after 009 closed, because 009 answered or invalidated several of 008's open questions. 008's task file predates 009 and is being refreshed by pm against these.

- **The theme control stays in `widgets/HeaderNav.tsx`; `/settings` does not take it over.** `docs/PLAN.md` described the settings surface as holding "the theme controls above", and 008's own text said the theme section "lands with milestone 4's token work" — both written before 009 existed. Overruled on use: flipping the theme is a frequent, low-commitment action (the owner studies at night), so putting it one navigation away makes the common case worse. This also preserves 009's decision 4 ("one instance only"), which keeps two controls from disagreeing. `/settings` holds the gauge style and later preferences. **PLAN.md's wording is amended to match.**
- **`react-icons` is the project's icon library.** The orchestrator recommended `lucide-react` on the grounds that shadcn/ui generates against it; **that recommendation was wrong on the facts and the owner overrode it correctly.** `lucide-react@^1.52.0` sits in `package.json` and is imported **nowhere**; all four icon usages (`TimerControls.tsx`, `StatsButton.tsx`, `TaskListDialog.tsx`) are already `react-icons`. So this ratifies what the codebase does and makes `lucide-react` an unused dependency. **Residual cost, accepted:** a future `shadcn add` may arrive with `lucide-react` imports that need translating to `react-icons` by hand. 008's criterion 18 still forbids a third library.
- **`app/prototype/glyph-slosh` is deleted as part of 008.** It is a real route, so it is reachable in a production build and renders a gauge variant that fails AA; `hooks/use-local-slosh.ts` becomes a duplicate of the shared spring the moment 008 lands. Its purpose was choosing a gauge variant, which is what 008 settles, so it has no life after this task. 009 had excluded it from contrast measurement while still asserting it renders — that exclusion ends with the route.
- **`widgets/` is added to CLAUDE.md's "Folder structure".** The folder exists, is committed, and now holds the theme control, but the documented structure never listed it — so the next agent adding app-level chrome had to guess between `components/` and `widgets/`. 008 flagged this when it was drafted; it is fixed now rather than asked a third time.

**Proceeding on 008's own stated defaults, not re-asked:** the gauge style defaults to the vessel (so no existing screen changes on next load), and only vessel + variant 4 ship. Criterion 5 makes adding variant 3 later an enum entry plus a renderer, not a redesign.

### 2026-10-26 — The drag-active row ring is exempted, not fixed (task 009 criterion 42)
QA pass 2 measured the dragged task row's `ring-2 ring-ring` at **2.47:1 against the page ground in light** (3:1 floor); dark passes at 3.92:1. **Exempted under criterion 42's own exemption clause**, which requires naming a carrier that is not the failing colour and that actually exists.

**The named carriers:** a dragging row is translated under the pointer by dnd-kit *and* dropped to `opacity-60`, both from the same conditional in `components/TaskRow.tsx:116`. Either alone identifies the dragged row, so the ring is a third, reinforcing signal rather than the carrier of the state.

**Why not fix it:** `--ring` is single-valued and colours every focus ring in the app, and criterion 27 pins it byte-identical, so a fix means introducing a `--drag-ring` token and a visible light-theme change — to strengthen a third cue for an already doubly-signalled state.

**Provenance, which is the part worth remembering:** the line read `ring-amber-700` until 007 tokenised it to `ring-ring` in `67ace13`, and `--ring` is that same `#b45309`. The ratio is unchanged and predates both 007 and 009. **How to apply:** a theme sweep that measures states nothing measured before will surface pre-existing gaps; triage them on provenance, and do not let a task that merely *found* a gap be the one blocked by it.

### 2026-10-26 — Three owner rulings on task 009's QA failures: two criteria narrowed, one override added
QA returned FAIL on task 009 with three substantive defects. All three were verified against the repo before being put to the owner, and all three are now settled. Recorded because two of them **relax acceptance criteria**, which is the kind of thing that looks like a cover-up a year later if the reasoning is not written down.

- **Criterion 28, the focus ring on primary-filled controls.** `--ring` and `--primary` are the same hex in both themes (`#b45309` light, `#f0a550` dark), so the ring on Start measures **1.00:1 against its own fill**. The criterion demanded ≥3:1 against the fill *and* the ground. **Narrowed to the ground, which passes** (4.60:1 light, 8.83:1 dark). The reason it is a drafting error and not a dodge: WCAG 1.4.11/2.4.13 evaluate a focus indicator **as a whole**, and the outline's outer edge meets the real page ground at 4.60:1 light / 8.83:1 dark. **Corrected 2026-10-26 after review (R-2):** the original wording here said the 2px gap "shows the ground", which is false on exactly the controls this ruling was written for. `buttonVariants`' base adds `focus-visible:ring-3 focus-visible:ring-ring/50`, a **zero-offset** 3px box-shadow that fills the gap with `--ring` at 50% over the ground (≈`#d8a47a` light, `#865c2f` dark; box-shadows paint under the outline, so 0-2px is that band and 2-4px is the solid outline). So a zero-offset indicator *does* exist on these controls, measuring ≈2.27:1 light / ≈2.85:1 dark against the fill. **That band is not relied on as a carrier** — the outline's outer edge against the ground is what satisfies 1.4.11, which is why the conclusion stands unchanged and no code change was asked for. The surviving own-fill clause should be read as governing an indicator that is *the only* indicator and is drawn at zero offset. **Rejected alternatives:** giving `--ring` its own hue breaks criterion 27, which pins the light ring byte-identical to the pre-existing `#b45309` outline; an inner halo would touch every button variant for no measured gain.
- **Criterion 47, reduced motion on the Reset button.** `components/HoldButton.tsx`'s own `prefers-reduced-motion` block strips `transform` but **keeps** a 160ms `background-color` transition and a `box-shadow` one. `--hb-bg` is themed, so a theme flip fades that button even under reduced motion (measured 0.16s and 0.2s). The file is vendored ReactBits and frozen by criterion 53, so the fix is an **override in `app/globals.css` at raised specificity** (`html .hb-root`) rather than an edit at source — the vendored rule carries `!important` inside a runtime-injected `<style>`, so source order cannot be relied on. **Rejected:** accepting it (cheap, and a 160ms colour fade carries little vestibular risk, but the criterion is satisfiable for three lines) and unfreezing the file (pushes a vendored component further from upstream, where `shadcn add` is already a conflict rather than an update).
- **Criterion 38, the 320px header wrap.** The theme control wraps the header 40→80px, pushing the gauge down 312→352px. The criterion permitted a deliberate wrap *and* forbade any main-column shift — **self-contradictory, because a taller header necessarily moves what sits beneath it.** The wrap is accepted and **352px is now the stated position**; the no-shift clause is read as applying to 1280px, which passes with nothing moving. Wordmark unchanged, no horizontal overflow in either theme.

**Also settled, as drafting errors rather than owner calls:** criterion 53 freezes `docs/PLAN.md` and `docs/DECISIONS.md` while criterion 1 *requires* a DECISIONS entry. The task file's own orchestrator section ("this task may not edit either file") shows the freeze was aimed at the task's implementing agents, not at the orchestrator who lands the docs; 53 is read that way. Criterion 11 does not list `--gauge-liquid` among the tokens permitted to change, but owner answer 4 re-pointed it `#f6c453`→`#d97706`; the criterion is amended to match the decision already recorded above.

### 2026-10-23 — Theme preference storage: localStorage via zustand `persist`, in a shared `lib/preferences/` module
Drafted by backend for task 009 criterion 1; **also answers task 008's criterion 1**, because 009 is the task that introduces the preference store.

The theme preference (`light` | `dark` | `system`, default `system`) is stored in **localStorage through zustand `persist`**, in a new shared module `lib/preferences/`, under the key **`pomotato-preferences`**, as **`{"state":{"theme":...},"version":1}`**. Only the enum is persisted — no colour value, no class name, no hex, no component reference.

**Why not Dexie, which is where every other persisted thing in this repo lives:** its reads are asynchronous, so the stored theme cannot be known when the first frame paints, and a dark-theme user would see the cream palette flash on every single load. localStorage is synchronous, so a small inline script in `app/layout.tsx` reads it and sets `.dark` on `<html>` before first paint. The script is generated from the same constants the store uses (`THEME_BOOT_SCRIPT`), so the key, the accepted values and the default cannot drift apart — a drift test pins this. The store rehydrates manually after mount (`skipHydration`) so server and first client render agree.

**Malformed stored values are rewritten, not left alone.** Backend's draft said a bad value "is not written back"; QA's probe disproved that for every malformed shape tested, raw or enveloped, including a same-version `"auto"`. `persist` rehydrates, falls back to `system`, and then writes `{"state":{"theme":"system"},"version":1}` back over the bad entry. This is recorded as the accepted behaviour, not a defect: the bad value is gone after rehydrate, the next read returns the documented default, the boot script and the store agree on the resolved value, and the rewrite only ever fires on a malformed read. If a future task needs the bytes left untouched, that is a change in behaviour and needs its own entry.

**The module is deliberately shared: 008 adds its gauge-style key to it** and does not create a second preference system. Costs accepted: `<html>` needs `suppressHydrationWarning`, and the painted theme is now a function of two inputs (the stored value and `prefers-color-scheme`), so any contrast sweep covers the cross-product.

### 2026-10-23 — Milestone 4 takes the dark toggle before the standalone contrast pass, and absorbs it
Task 007's reviewer recommended landing R-1 — the `outline` variant in `components/ui/button.tsx:13`, which hardcodes `border-border bg-background` and so births four interactive boundaries at 1.36:1 — as **its own small task ahead of the dark toggle**, on the grounds that folding it in forces the dark task to re-measure light as well as dark. `docs/PLAN.md`'s milestone-4 caveat said the same. The orchestrator recommended it too, and also offered task 008 (the settings surface the toggle will eventually live on) as a second alternative.

**The owner chose the toggle.** So [009](tasks/009-dark-mode-toggle.md) absorbs R-1, plus R-6 (`disabled:bg-border` on the TaskForm submit, which 007's reviewer flagged for the dark-toggle task by name), R-3 (`--control-border` is painted on five grounds, not the four its comment lists — `--muted` is the fifth), and the hardcoded `#b45309` in `globals.css`'s `:focus-visible` rule, which is the known gap recorded in the 2026-10-15 entry below under "fix when the dark theme lands".

**Why it matters beyond bookkeeping:** this makes 009 the largest task in the repo — a persistence layer, a palette, a new control, four absorbed findings, and every shipped surface measured in two themes. The accepted cost is re-measuring light, exactly as the reviewer predicted. The mitigation is pipeline order (backend finishes the preference shape before frontend writes a line) and requiring frontend to fill the measurement tables before QA starts. **How to apply:** if a future task is offered "fold this contrast fix into the theme work", this entry is the precedent for what that costs.

### 2026-10-23 — `.dark` is a three-state preference on `<html>`, and 009 owns the store 008 inherits
Four owner decisions taken before task 009's backend started.

- **Three states, not two:** `light` / `dark` / `system`, defaulting to `system`. `hooks/use-resolved-tokens.ts` and `hooks/use-media-query.ts` already subscribe to `prefers-color-scheme`, so a boolean would have stranded both, and it leaves no way back to the OS — one tap at 11pm pins the app to dark all the next morning. Cost accepted: the painted theme is a function of two inputs, so the contrast sweep covers a cross-product.
- **The preference store is 009's, and task 008 adds a key to it rather than inventing its own.** 008's own data-shape section already said the theme should drive the choice of storage home. The synchronous-before-first-paint requirement rules out Dexie for this preference, not backend ownership of the shape — so backend runs first and alone on `lib/`, and the class is applied by a pre-hydration script sharing a resolver with the store.
- **`--gauge-liquid` re-points from `#f6c453` to `#d97706`,** closing 006's Q1. The old value measured 1.56:1 liquid-vs-glass, under the 3:1 non-text threshold; the new one is 3.07:1 with 4.99:1 for the `mm:ss`. The cost is purely aesthetic — deeper amber instead of pale yellow — and the owner took it rather than choose the token's dark value against a failing light one.
- **The delete-confirm prompt goes back to a destructive token,** closing 007's R-4. `text-destructive` measures 5.373:1 on the peach tint 007 introduced, so the warning signal returns **without** reverting the tint to `bg-red-50`.

**Deliberately not asked:** the control's shape and labels (a three-option chip group matching the existing mode chips, labelled "Theme"). Lowest-stakes of the five, so it kept its default.

**Left open:** the dark palette's actual hues. The owner declined to supply anchors up front, so frontend derives a warm dark family against stated contrast floors and submits a measured table for approval — frontend's palette is a proposal, not an approved one. The eight task swatches constrain the dark ground **from below**: potato brown `#8a5a2b` needs a ground at or below ~0.010 relative luminance to clear 3:1, and a naive inversion making `--card` the current `--foreground` lands near 2.7:1. The swatches are owner data and may not be remapped, so if the warm-brown direction and the 3:1 floor genuinely conflict, that is raised, not resolved silently.

### 2026-10-23 — `components/ui/button.tsx` carries four `dark:` utilities that have never rendered
Found while scoping 009, not present in 007's review. `button.tsx` lines 7, 13, 17 and 19 are the **only** `dark:` classes anywhere in `app/`, `components/`, `hooks/` and `widgets/` (grep-verified). They are shadcn defaults written for shadcn's neutral dark palette, and because nothing has ever applied a `.dark` class they have never had any effect. **Adding the toggle activates all four at once.**

The sharpest instance: `components/TaskListDialog.tsx:41-44` takes `variant="outline"` and then overrides it with `border-none bg-primary text-primary-foreground`. `tailwind-merge` does not dedupe across variant prefixes, so the variant's `dark:bg-input/30` and the override's unprefixed `bg-primary` both survive the merge — and under `.dark` the prefixed one wins on specificity. Predicted result: the amber primary Tasks pill turns into a translucent input-coloured one the moment dark mode exists. (A prediction read off class strings, not yet a painted measurement; 009 requires it measured.)

**How to apply:** `dark:` utilities arriving from a generator are not inert just because no dark theme exists — they are deferred behaviour. Audit them when adding a theme, and remember that an override in a consumer's `className` does not necessarily beat a variant's prefixed class.

### 2026-10-19 - ReactBits SloshGauge and HoldButton vendored (MIT + Commons Clause)
Added `components/SloshGauge.tsx` and `components/HoldButton.tsx` via `npx shadcn@latest add @react-bits/SloshGauge-TS-TW` and `@react-bits/HoldButton-TS-TW`; the CLI registered the `@react-bits` namespace in `components.json` on its own. Licence: MIT plus Commons Clause (`LICENSE.md` in `DavidHDev/react-bits`), which permits use in Pomotato including commercially and forbids reselling the components themselves. Both are dependency-free: `package.json` and the lockfile did not change, and the CLI left `app/globals.css` alone. Both files are edited (their header comments list how), so a future `shadcn add` offering to overwrite them is a conflict, not a routine update. The vendored SloshGauge also fixes an upstream StrictMode bug (stale `sim.raf` after unmount).

**Rejected:** ReactBits' segmented control for `ModeSelector`, because it builds a `role="radiogroup"` out of ARIA where the existing native radio inputs already carry that semantics (CLAUDE.md: semantic HTML before ARIA). Radix's own `ToggleGroup type="single"` was checked and does the same thing, so the same reasoning applies to it.

**Correction worth recording:** task 005 was written around "canvas cannot resolve `var()`" as its main risk. That premise was wrong, caught by frontend: neither component paints to a canvas (SloshGauge animates a `clipPath` polygon on divs and already drives colour through CSS custom properties). Colours are still resolved from tokens and re-read on theme change via `hooks/use-resolved-tokens.ts`, so the behaviour is dark-ready, but the machinery is heavier than the real constraint required.

### 2026-10-15 — Task list moved behind a shadcn Dialog; `components/ui/` adapted, not pristine
The owner asked for the task list as "an on-click pop up task checklist but keep the current task card". Settled interpretations (the owner declined further clarifying questions, so these were orchestrator calls): shadcn **Dialog** as the most literal reading of "pop up"; "checklist" meaning the existing list relocated, **not** a new done/ticked state (that would be a new field plus Dexie v3 and belongs in its own task); `CurrentTaskCard` stays inline on `/`; frontend-only, no data-layer change.

First real `npx shadcn add` (dialog + button). It created only `components/ui/dialog.tsx` and `components/ui/button.tsx`, added no dependencies (init had already installed them), and this time left `app/globals.css` alone — verified against a pre-command copy.

**`components/ui/dialog.tsx` is deliberately adapted, not generated-and-untouched.** The stock `DialogContent` hardcodes `bg-black/10`, a backdrop blur, and a 28px icon-only close button with no way to override the overlay. Frontend first composed around it from Radix primitives to keep the generated file pristine; that was reversed, because shadcn's model is explicitly that generated code is yours to edit, and leaving an unused `DialogContent` in place is a loaded gun — the next person reaches for it and gets exactly what was avoided. It now uses the project's tokens and a 44px text close button, and carries a header comment saying a future `shadcn add` offering to overwrite it is a conflict, not a silent regression.

Two token changes in `app/globals.css`: `--popover` lightened from `#fbf4ea` (identical to `--background`, so a dialog read as no surface at all) to `#fffaf3`, and a new `--scrim` for the modal backdrop as a token rather than `bg-foreground/NN`, so milestone 4's dark block can pick its own rather than inheriting an inverted-foreground scrim.

### 2026-10-15 — `--muted-foreground` darkened to pass AA on cream
Changed from `#78716c` (stone-500) to `#57534e` (stone-600). The old value measured **4.39:1** on the page background and 4.40:1 on `--muted` — below the 4.5:1 floor — and only passed on `--popover` at 4.62:1. The new value is **6.99:1** on the page and 7.35:1 on `--popover`.
**Why:** task 003's review already flagged this, and milestone 4's first shadcn component hit it for real (`DialogDescription` ships `text-muted-foreground` and needed a per-component override). Fixing the token removes the trap for every future `shadcn add` instead of accumulating workarounds. Nothing in `app/` or `components/` referenced the token except the generated dialog, so this had **zero visual impact** on anything that existed at the time.
**How to apply:** milestone 4 must re-measure this value against the dark palette; passing on cream says nothing about passing on a dark surface.

### 2026-10-15 — Known gap: focus rings don't flow through `--ring`
QA found, while mutation-testing the focus indicator, that setting `--ring` to 25% alpha left the dialog's Close ring fully opaque. The colour comes from the hard-coded `#b45309` in `globals.css`'s unlayered `:focus-visible` rule, and milestone 1-2 controls use `outline-amber-700` directly. No acceptance criterion fails today (every measured ring clears 3:1), but **milestone 4's dark palette will not reach these rings through the token**. Fix when the dark theme lands.

### 2026-10-09 — Asset and dependency provenance for milestone 3
CLAUDE.md requires licensing provenance to live here, and the reviewer flagged that the milestone-3 additions had none.
- **Comfortaa** (header font, chosen by the owner in DESIGN.md): SIL Open Font License. Loaded via `next/font/google`, which self-hosts it at build time — no runtime request to Google, nothing hotlinked.
- **recharts** `^3.10.1` (the approved charting library): MIT.
- The milestone-3 session/stats code adds no images, audio, or other binary assets. The potato mascot and the paper-grain texture are deferred to milestone 4 and still have no artwork; DESIGN.md's open item records that whatever is used must be original and must not be Ghibli-derived.

### 2026-10-09 — Session writes are fire-and-forget; a lost completion is not retried
`logRunCompletion` does not await the session write, and the timer's persisted state flips to `complete` (clearing `runId` and the end timestamp) before the write resolves. A write that fails or is interrupted is logged to `console.warn` and never retried, so that run is silently absent from stats.
**Why:** keeping the timer responsive and never letting a storage failure break the countdown. The reviewer's correction to the original framing matters, though: this is not only a "tab killed within a few milliseconds" window — a `DatabaseBlockedError` takes ~5s to reject, so with another tab holding the old schema version a completed run is dropped silently.
**How to apply:** accepted for now. The cheap mitigation, if this ever matters: keep `runId`/`endedAt`/`plannedDurationMs` in the persisted state until the write resolves and replay on next load — the existing `&runId` dedup already makes replay safe. Revisit in milestone 7 alongside export/import, since that's when data completeness starts to matter to users.

### 2026-10-09 — Milestone 3 test-coverage debt, accepted deliberately
The reviewer mutation-tested milestone 3 (broke the implementation seven ways and checked whether the suite noticed) and found four behaviour-breaking mutations passing a green suite. Three fixes were applied — reading the `sessions` table directly in e2e instead of inferring from DOM counts, waiting for a positive completion signal before asserting a count did *not* change, and unit-testing the increment rules — and each was verified to actually catch its mutation. The following were consciously deferred rather than forgotten:
- **Two-tab race** is still not genuinely exercised: the existing test completes in tab 1 and only re-reads in tab 2, so no second write is ever attempted. A real race needs an expired running entry in `localStorage` with two tabs rehydrating it.
- **Blocked upgrade** (`DatabaseBlockedError`, the "close other Pomotato tabs" UI) has no test anywhere, despite being the case that resembled task 002's infinite-loading bug.
- **No axe-core run against `/stats`** — `e2e/accessibility.spec.ts` has no `/stats` block. Frontend's axe check was an uncommitted throwaway, which this log's 2026-10-07 entry says is not evidence.
- **Three remaining can't-fail tests** in `e2e/stats.spec.ts` (one with no assertion at all, one asserting only that a computed color is defined, one with its assertion inside a `try`/`catch`), plus a missing `MutationObserver`-based empty-state-flash test.
**Why:** the implementation itself was reviewed and approved, and the three fixes close every mutation that was actually proven to slip through. The rest is coverage completeness, not known-broken behaviour.
**How to apply:** treat these as the first candidates when milestone 3's area is touched again. Note also the generic lesson: `expect(locator).toBeVisible()` on a condition that is *already true* is a fourth distinct "test that cannot fail" shape in this project, after the `try`/`catch`, the assertion-inside-`if`, and the never-attached observer.

### 2026-10-07 — shadcn/ui added for milestone 3 onward only, not retrofitted onto milestones 1-2
Ran `npx shadcn@latest init` (Nova preset, Radix base, CSS variables) to get `components.json`, `lib/utils.ts` (the `cn()` helper, re-exported from the `cn` package — no collision with `lib/db/` or `lib/timer/`), and the `class-variance-authority` / `tw-animate-css` / `radix-ui` / `lucide-react` / `shadcn` dependencies in place. This is infrastructure only: no `npx shadcn add <component>` was run, and no existing component file (`PomotatoTimer.tsx`, `TaskList.tsx`, etc., or anything under `lib/`, `hooks/`) was touched — milestones 1-2 keep their current hand-built markup and their 91 passing e2e tests untouched. shadcn components start getting added once milestone 3 (session logging/stats) actually needs one, chosen for what that task needs rather than guessed in advance.

The CLI's install step (`npm install ... class-variance-authority tw-animate-css radix-ui lucide-react`, and later `cn`/`shadcn` itself) hit the same pre-existing `vitest@5.0.3` / `@types/node@^20` peer conflict noted in the 2026-10-02 dependency entry below. Worked around it the same way: ran the installs with `--legacy-peer-deps` (`npm_config_legacy_peer_deps=true` in the environment for the `shadcn init` invocation, since the CLI doesn't expose its own `--legacy-peer-deps` flag), rather than touching `@types/node` or `vitest` versions.

`shadcn init`'s default output overwrites `app/globals.css` with its own generic oklch-based blue/slate theme and drops the project's warm cream/brown palette entirely, plus a broken `--font-sans: var(--font-sans)` self-reference and a `html { @apply font-sans; }` rule that would have swapped the rendered body font from the approved Arial/Helvetica fallback to Geist Sans. Let the CLI write its default output once, then hand-reconciled it: kept the original `--background` (`#fbf4ea`), `--foreground` (`#2b2017`), the plain-CSS `body` rule, and the `:focus-visible` outline rule byte-for-byte, and mapped every shadcn semantic token (`--primary`, `--border`, `--ring`, `--accent`, `--destructive`, `--chart-*`, `--sidebar-*`, `--radius`) onto the literal colors milestones 1-2 already use via Tailwind utility classes (`--primary`/`--ring` → `#b45309` i.e. `amber-700`, matching the existing primary button and focus outline; `--accent` → `#fef3c7`/`amber-100`, matching the existing pinned/selected highlight; `--border`/`--input` → `#d6d3d1`/`stone-300`; `--destructive` → `#b91c1c`/`red-700`; `--chart-1..5` → the first five hues of the already contrast-checked `components/task-palette-colors.ts` swatches, reused rather than inventing a separate chart palette ahead of milestone 3 deciding it needs one; `--sidebar-*` aliased to the tokens above since no sidebar component exists yet). Dropped the `.dark` block entirely rather than fabricate unreviewed dark-mode colors — dark/theme toggling is explicitly out of scope until milestone 4 per the existing comment in `globals.css`, and nothing in the app ever applies a `.dark` class today. Verified the result is visually identical to before (screenshot comparison, plus all 170 Vitest + 91 Playwright tests, including the axe-core and focus-indicator checks, still pass unchanged) and that `npm run lint` / `typecheck` / `build` are clean.

---

### 2026-10-07 — Orchestrator independently re-runs test suites rather than trusting qa/reviewer self-reports
Task 002 (task list) went through qa claiming PASS multiple times while the actual suite had double-digit failures, dismissed as "flaky"/"environmental" when every one checked turned out to be a concrete, deterministic bug (wrong locator, invalid CSS syntax, a test that couldn't fail, an observer that silently never attached). Reviewer also caught cases where its own re-review needed to actually revert a fix and re-run a test to prove the test would catch a regression, rather than trusting that a test "looked" like it covered something.
**How to apply:** before accepting any PASS/APPROVE verdict from a subagent, re-run the relevant suite directly rather than relying on the reported numbers alone, and spot-check that new/changed tests would actually fail against the bug they claim to cover (e.g. temporarily revert the fix and confirm the test fails, then restore it). This is now standing practice for this project's pipeline, not just a one-off fix.

### 2026-10-07 — dnd-kit, `dexie-react-hooks` are in scope without separate approval
Milestone 2 needs `dexie`, `dexie-react-hooks`, and `@dnd-kit/*`. `dexie` and `@dnd-kit/*` are named directly in the approved stack. `dexie-react-hooks` isn't named individually, but it's Dexie's own official companion package for reactive queries in React (not a separate library choice) — approved as part of the already-approved Dexie dependency, not a stack change.

### 2026-10-02 — Who installs the stack's dependencies
Generalized: whichever role's code needs a runtime dependency installs it as part of implementing the task (e.g. `backend` installs `dexie`/`dexie-react-hooks`, `frontend` installs `zustand`/`@dnd-kit/*`). Test tooling (Vitest, Testing Library, `@playwright/test`, any IndexedDB fake, plus their config files) is test infrastructure, not application code, so `qa` installs and configures it as part of writing the first tests in that area — this doesn't violate qa's "test files only" boundary since none of it touches `app/`, `components/`, or `lib/`.

### 2026-10-02 — App code stays at repo root (`app/`, `components/`, `lib/`), not `src/`
Project was bootstrapped by create-next-app with a root-level `app/`. Moving it under `src/` was blocked by the session's permission classifier (treated as irreversible), so the agent-boundary rule in CLAUDE.md refers to `app/`, `components/`, `lib/`, `hooks/` directly instead of a `src/` wrapper.

### 2026-10-02 — Local-first, no server database in v1
All persistence is Dexie (IndexedDB) in the browser. "Backend" means the data layer (schema, repositories, migrations, export/import) and any Next.js route handlers, not a remote DB. Sync is deferred to a later milestone.

### 2026-10-02 — Agent team workflow adopted
PM/frontend/backend/QA/reviewer subagents communicate through files in `docs/`, not chat, so task state survives across sessions and is auditable. See [CLAUDE.md](../CLAUDE.md) "Team workflow".
