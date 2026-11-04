import type { ComponentPropsWithoutRef } from "react";
import { cn } from "@/lib/utils";

// The two surface kinds on "/", defined in app/globals.css (@utility
// surface-solid and surface-frosted) and applied only through here, so each
// treatment exists once and a new surface cannot restate one by copying a
// utility string. `data-surface` is what QA reads to tell the one frosted
// surface from the solid ones, in the shape of data-gauge-style.
//
// Reach for "solid" by default. "frosted" is the timer panel's and nothing
// else's: a second one reopens the owner's single-blur ruling.
const SURFACE_CLASS = {
  solid: "surface-solid",
  frosted: "surface-frosted",
} as const;

type SurfaceKind = keyof typeof SURFACE_CLASS;

interface SurfaceProps extends ComponentPropsWithoutRef<"div"> {
  kind: SurfaceKind;
}

export function Surface({ kind, className, ...rest }: SurfaceProps) {
  return <div data-surface={kind} className={cn(SURFACE_CLASS[kind], className)} {...rest} />;
}
