"use client";

import { RiAddLine, RiDeleteBinLine, RiFileCopyLine, RiMore2Fill } from "react-icons/ri";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { rowIconButtonClass } from "./task-row-styles";

interface TaskRowMenuProps {
  /** Names the task in the trigger, so a list of rows does not read as identical buttons. */
  name: string;
  /** False for a subtask: the surface never asks for a second level. */
  canAddSubtask: boolean;
  /** False until the row has text and is stored; Add subtask and Duplicate need a stored task. */
  isStored: boolean;
  onAddSubtask: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  /** Called when the menu closes; the row decides whether focus returns to the trigger. */
  onCloseAutoFocus: (event: Event) => void;
}

// Delete task is told apart from its neighbours by more than its hue: it is
// last, set off by a separator, and carries its own wording and a bin glyph.
export function TaskRowMenu({
  name,
  canAddSubtask,
  isStored,
  onAddSubtask,
  onDuplicate,
  onDelete,
  onCloseAutoFocus,
}: TaskRowMenuProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label={`Actions for ${name}`} className={rowIconButtonClass}>
          <RiMore2Fill aria-hidden="true" className="size-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onCloseAutoFocus={onCloseAutoFocus}>
        {canAddSubtask ? (
          <DropdownMenuItem disabled={!isStored} onSelect={onAddSubtask}>
            <RiAddLine aria-hidden="true" className="size-4" />
            Add subtask
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem disabled={!isStored} onSelect={onDuplicate}>
          <RiFileCopyLine aria-hidden="true" className="size-4" />
          Duplicate
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={onDelete}>
          <RiDeleteBinLine aria-hidden="true" className="size-4" />
          Delete task
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
