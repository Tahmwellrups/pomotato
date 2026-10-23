"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { TaskList } from "./TaskList";
import { FaTasks } from "react-icons/fa";


// The Button base already draws a 1px border + ring on focus; the app-wide
// pattern (see StatsDashboard) is a 2px outline, which is easier to see on
// cream, so swap one for the other here.
const focusClass =
  "focus-visible:border-border focus-visible:ring-0 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

// Escape belongs to the innermost thing that is "in progress", and only then
// to the dialog: a drag in flight (dnd-kit cancels it itself), an inline edit
// form, or the inline delete confirmation (each cancels itself via its own
// onKeyDown). Radix listens in the capture phase, ahead of all three, so it
// has to be told to stand down. The drag handle exposes the in-flight drag as
// aria-pressed="true" (dnd-kit's own attribute), so no extra state needs to
// be threaded up from TaskList.
const ESCAPE_OWNED_BY_ROW = 'li form, li [role="group"]';
const ACTIVE_DRAG_HANDLE = '[aria-roledescription="sortable"][aria-pressed="true"]';

function escapeIsOwnedByInnerLayer(event: KeyboardEvent): boolean {
  if (document.querySelector(ACTIVE_DRAG_HANDLE) !== null) return true;
  return event.target instanceof Element && event.target.closest(ESCAPE_OWNED_BY_ROW) !== null;
}

export function TaskListDialog() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          aria-label="Your tasks"
          className={`flex size-11 rounded-xl border-none bg-primary text-primary-foreground items-center text-base cursor-pointer hover:bg-primary/80 hover:text-primary-foreground motion-reduce:transition-none ${focusClass}`}
        >
          <FaTasks className="size-4.5 place-self-center-safe" />
        </Button>
      </DialogTrigger>
      <DialogContent
        showCloseButton
        onOpenAutoFocus={(event) => {
          // Focus starts on Close: it is never destructive, and focusing the
          // add form's title instead would pop the on-screen keyboard over the
          // list on phones. Close sits in the header visually but comes last
          // in the DOM (DialogContent renders it after children), so Tab from
          // here goes to the add form, and Radix's focus loop wraps the last
          // row back to Close. If the query misses, fall back to the content
          // node (Radix gives it tabIndex -1) so focus never lands on <body>.
          event.preventDefault()
          if (!(event.target instanceof HTMLElement)) return
          const close = event.target.querySelector<HTMLElement>(
            '[data-slot="dialog-close"]',
          )
          ;(close ?? event.target).focus()
        }}
        onEscapeKeyDown={(event) => {
          if (escapeIsOwnedByInnerLayer(event)) event.preventDefault()
        }}
        className="flex max-h-[calc(100dvh-1.5rem)] flex-col"
      >
        <DialogHeader className="gap-1 pr-20">
          <DialogTitle className="text-xl leading-tight font-semibold">
            Your tasks
          </DialogTitle>
          <DialogDescription>
            Pin the one you&apos;re working on to keep it in view.
          </DialogDescription>
        </DialogHeader>
        <div className="-mx-1.5 min-h-0 flex-1 overflow-y-auto overscroll-contain px-1.5 pb-1.5">
          <TaskList />
        </div>
      </DialogContent>
    </Dialog>
  )
}
