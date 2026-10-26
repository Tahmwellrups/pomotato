import { cva, type VariantProps } from "class-variance-authority"

// Hand-written, not shadcn-generated: the one place the timer's mode-chip
// classes live. ModeSelector applies them to the <span> that follows a native
// radio with className "peer sr-only", so the focus ring comes from the
// peer-focus-visible classes below. Colour comes from semantic tokens only.
//
// The chips are flat text with no fill, border or radius. The selected and
// unselected label colours differ by only 1.13:1, so colour alone cannot say
// which mode is active (WCAG 1.4.1). Weight carries it: bold when checked,
// normal when not. Weight survives greyscale and forced-colors, and unlike an
// underline it needs no extra mark; its cost is a small change in chip width.
//
// motion-reduce:transition-none (task 009): a theme switch repaints every chip,
// and without this the colour change would fade over 150ms for a person who
// asked for no motion. Nothing else about the chip changed.
const modeChipVariants = cva(
  "font-comfortaa uppercase inline-flex min-h-11 items-center px-2 py-2 text-sm transition-colors motion-reduce:transition-none motion-reduce:duration-0 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring",
  {
    variants: {
      checked: {
        true: "font-bold text-accent-foreground",
        false: "font-normal text-secondary-foreground",
      },
    },
    defaultVariants: {
      checked: false,
    },
  }
)

type ModeChipVariantProps = VariantProps<typeof modeChipVariants>

export { modeChipVariants, type ModeChipVariantProps }
