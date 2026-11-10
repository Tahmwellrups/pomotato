"use client"

// Adapted to Pomotato's tokens: the surface is --popover with a --control-border
// edge (the same 3:1 edge the row controls use, so the menu reads against the
// panel), a highlighted item is --accent, and every item is a 44px target.
// Under forced colours the accent is overridden, so a highlighted item takes the
// system Highlight pair, the only thing that tells the items apart there. If a
// future `shadcn add dropdown-menu` offers to overwrite this file, treat it as a
// conflict and merge by hand, not accept.
//
// Behaviour that differs from the stock file, each for a reason:
// - Non-modal, with an invisible click-catcher behind the menu. Radix's modal
//   mode hides the rest of the page with aria-hidden while leaving it
//   focusable, which axe reports as serious (aria-hidden-focus). The catcher
//   keeps the modal rule that matters: a click outside closes the menu and
//   activates nothing underneath it.
// - Focus lands on the first enabled item however the menu was opened. Radix
//   only does that for the keyboard and focuses the bare container on a click.
// - Arrow keys wrap, so ArrowUp on the first item reaches the last.
//
// Only the parts the task row's kebab uses are kept: Root, Trigger, Content,
// Item and Separator. Checkbox, radio, sub-menu and label parts were deleted
// rather than adapted; re-add them with `shadcn add dropdown-menu` if a menu
// ever needs one.

import * as React from "react"
import { cn } from "cn"
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui"

function DropdownMenu({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  return (
    <DropdownMenuPrimitive.Root data-slot="dropdown-menu" modal={false} {...props} />
  )
}

function DropdownMenuTrigger({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>) {
  return (
    <DropdownMenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />
  )
}

// Radix focuses the bare menu container when a click opens the menu. The first
// time the container takes focus, move it on to the first enabled item. Once
// only, and a stable function, so React does not re-attach it on every render:
// Radix also refocuses the container when the pointer leaves, and that must not
// snap focus back to the top.
function focusFirstItemOnOpen(element: HTMLDivElement | null) {
  element?.addEventListener(
    "focus",
    () => {
      element
        .querySelector<HTMLElement>('[role="menuitem"]:not([data-disabled])')
        ?.focus({ preventScroll: true })
    },
    { once: true }
  )
}

function DropdownMenuContent({
  className,
  sideOffset = 4,
  collisionPadding = 8,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPrimitive.Portal>
      <div data-slot="dropdown-menu-layer">
        <div data-slot="dropdown-menu-catcher" aria-hidden="true" className="fixed inset-0 z-40" />
        <DropdownMenuPrimitive.Content
          data-slot="dropdown-menu-content"
          loop
          sideOffset={sideOffset}
          collisionPadding={collisionPadding}
          ref={focusFirstItemOnOpen}
          className={cn(
            "z-50 min-w-44 max-w-[calc(100vw-1rem)] origin-(--radix-dropdown-menu-content-transform-origin) overflow-hidden rounded-xl border border-control-border bg-popover p-1 text-popover-foreground shadow-md duration-100 data-open:animate-in data-open:fade-in-0 motion-reduce:animate-none motion-reduce:duration-0",
            className
          )}
          {...props}
        />
      </div>
    </DropdownMenuPrimitive.Portal>
  )
}

function DropdownMenuItem({
  className,
  variant = "default",
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item> & {
  variant?: "default" | "destructive"
}) {
  return (
    <DropdownMenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-variant={variant}
      className={cn(
        "relative flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-lg px-3 text-sm font-medium outline-none select-none data-disabled:pointer-events-none data-disabled:opacity-50 data-highlighted:bg-accent data-highlighted:text-accent-foreground forced-colors:data-highlighted:bg-[Highlight] forced-colors:data-highlighted:text-[HighlightText] data-[variant=destructive]:text-destructive data-[variant=destructive]:data-highlighted:text-destructive [&_svg]:size-4 [&_svg]:shrink-0",
        className
      )}
      {...props}
    />
  )
}

function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn("-mx-1 my-1 h-0 border-t border-border", className)}
      {...props}
    />
  )
}

export {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
}
