import { cva, type VariantProps } from "class-variance-authority"

// Hand-written, not shadcn-generated: the one place the timer's mode-chip
// classes live. ModeSelector applies them to the <span> that follows a native
// radio with className "peer sr-only", so the focus ring comes from the
// peer-focus-visible classes below. Colour comes from semantic tokens only; a
// hover mix is a color-mix() of tokens so a future .dark block carries it.
const modeChipVariants = cva(
  "font-comfortaa uppercase inline-flex min-h-11 items-center px-2 py-2 text-sm transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring",
  {
    variants: {
      checked: {
        true: "text-accent-foreground",
        false:
          "text-secondary-foreground hover:border-[color-mix(in_srgb,var(--border),var(--foreground)_30%)]",
      },
    },
    defaultVariants: {
      checked: false,
    },
  }
)

type ModeChipVariantProps = VariantProps<typeof modeChipVariants>

export { modeChipVariants, type ModeChipVariantProps }
