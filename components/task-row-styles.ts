// The two icon-only controls on a task row (drag handle, kebab). One class
// string so they cannot drift apart: both are 44 px squares, borderless on the
// panel's ground, and both draw their focus ring inside the box because the row
// packs its controls flush and an outer ring would be painted over by the
// neighbour. Under forced colours the border appears, since a borderless
// button there reads as bare text.
export const rowIconButtonClass =
  "inline-grid size-11 shrink-0 cursor-pointer place-items-center rounded-lg text-secondary-foreground outline-none focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-40 forced-colors:border";
