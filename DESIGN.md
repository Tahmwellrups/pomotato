# Pomotato — Design Direction

Authored by the project owner (answers transcribed 2026-10-09). Agents apply this; they
don't rewrite it. Anything an agent wants to add goes in "Open items" as a question, not
as a decision.

## Why this exists

Pomotato was made for the owner's girlfriend, to help her review for her board exams. The
name is meant to be playful and cute — the point is to cheer her up during a challenging
stretch.

That origin sets the tone: the app should feel **encouraging**, never pressuring. It's a
companion for long study sessions, not a productivity enforcer.

## Personality

- **Calm and cute.** Good aesthetic, minimalist.
- **Not overbearingly cute** — no clutter of widgets competing for attention.
- Mood reference: **Ghibli-type cute**. Warmth, softness, hand-made feeling.
- In the owner's words: "just a good aesthetic."

## Palette

- **Keep the cream direction** — it suits the potato name.
- **Dark mode is required**, not optional: she studies at night too.

**How dark mode lands** (decided 2026-10-09): new surfaces are built **dark-ready from the
start** — semantic color tokens only, never hardcoded hex — so milestone 4 can theme them
by adding a single dark block instead of restyling them a second time. The visible toggle
itself ships with milestone 4.

Current light values already in the codebase (factual anchor, not direction):
cream background `#fbf4ea`, dark brown text `#2b2017`, amber-700 `#b45309` as the single
accent, stone greys for borders and secondary text, red-700 `#b91c1c` for destructive
actions. Task swatches: potato brown, tomato, mint, sky, lavender, sunflower, blush, slate.

## Typography

- **Sans-first for body text** — normal, readable, no character required.
- **Comfortaa for headers** (chosen 2026-10-09; SIL OFL). Headers only — body text stays
  the plain sans, which is what keeps the cuteness contained rather than everywhere.

## Mood & motion

- Minimalist overall.
- **Some animation is welcome** — button hovers, sidebars, and similar.
- **Paper grain texture**, at low opacity.

## Mascot

- **Not in the logo mark** — the owner finds that corny.
- The potato shows up as **animated reactions** instead.

## Boundaries

Carried over from CLAUDE.md, and they constrain this direction:

- Original assets only. Ghibli is a **mood reference for warmth and softness, not a style
  to reproduce** — no Ghibli imagery, characters, names, or copied art.
- Fonts must be properly licensed (the existing Geist faces are SIL OFL).
- Accessibility is not negotiable against aesthetics: text contrast holds at WCAG AA in
  both light and dark, every control stays keyboard-operable with a visible focus state,
  and motion respects `prefers-reduced-motion`.

## Deferred to milestone 4 (themes)

Both are wanted, neither belongs in milestone 3:

- **Paper grain.** It's a global background texture, so it belongs with the palette and
  background work rather than being applied to one new page in isolation. Produce it
  procedurally (SVG/CSS noise) rather than shipping a texture asset, which sidesteps the
  licensing question entirely.
- **The visible dark-mode toggle** — see Palette above.

## Open items

Questions for the owner — agents must not answer these themselves:

1. **Where does the mascot artwork come from?** Animated reactions need actual original
   illustration; no agent should generate or approximate it, and nothing Ghibli-derived.
