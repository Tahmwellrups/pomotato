"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { RiDraggable } from "react-icons/ri";
import { useInlineTitle } from "@/hooks/use-inline-title";
import { rowIconButtonClass } from "./task-row-styles";
import { TaskRowMenu } from "./TaskRowMenu";
import { Checkbox } from '@/components/ui/checkbox'
import { Button } from "./ui/button";

/**
 * One row as the list sees it. `key` is the React key, the drag id and the
 * focus handle, and it outlives the row's first write: a row typed into as a
 * placeholder keeps its key when it becomes a stored task, so the input never
 * remounts under the caret. `taskId` is null until the row has been stored.
 */
export interface RowModel {
  key: string;
  taskId: string | null;
  parentKey: string | null;
  /** Stored id of the parent, which a subtask draft needs for its first write. */
  parentTaskId: string | null;
  title: string;
  completed: boolean;
}

export type NavigateDirection = "up" | "down";

interface TaskChecklistRowProps {
  row: RowModel;
  /** "Task 2" or "Subtask 1 of task 2": what the row is called until it has a title. */
  ordinalName: string;
  isCurrent: boolean;
  registerInput: (key: string, element: HTMLInputElement | null) => void;
  /** Resolves true once the title is stored, false if the write failed. */
  onSaveTitle: (row: RowModel, title: string) => Promise<boolean>;
  /** Resolves true once the tick is stored, false if the write failed. */
  onToggle: (row: RowModel, completed: boolean) => Promise<boolean>;
  onEnter: (row: RowModel) => void;
  onBackspaceEmpty: (row: RowModel) => void;
  onNavigate: (row: RowModel, direction: NavigateDirection) => void;
  onAddSubtask: (row: RowModel) => void;
  onDuplicate: (row: RowModel) => void;
  onDelete: (row: RowModel) => void;
  /** A parent's nested list of subtasks, rendered inside the same <li> so a drag moves them together. */
  children?: ReactNode;
}

export const TASK_TITLE_MAX_LENGTH = 100;
export const TASK_TITLE_PLACEHOLDER = "What’s your priority?";

// A task row: drag handle, checkbox, a borderless input that is the title, and
// a kebab. The same input is present and editable in every state; clicking the
// text puts the caret there and nothing else opens.
export function TaskChecklistRow({
  row,
  ordinalName,
  isCurrent,
  registerInput,
  onSaveTitle,
  onToggle,
  onEnter,
  onBackspaceEmpty,
  onNavigate,
  onAddSubtask,
  onDuplicate,
  onDelete,
  children,
}: TaskChecklistRowProps) {
  const isStored = row.taskId !== null;
  const isSubtask = row.parentKey !== null;
  const name = row.title !== "" ? row.title : ordinalName;

  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: row.key,
    data: { parentKey: row.parentKey },
    // A blank row is not stored, so there is no position to drop onto.
    disabled: isStored ? false : { droppable: true },
  });

  const title = useInlineTitle({
    storedTitle: row.title,
    save: (next) => onSaveTitle(row, next),
  });

  // The box shows the tick the moment it is clicked, then follows the stored
  // value. `base` is what was stored when it was clicked: once the stored value
  // moves off it the write has landed and the stored value takes over, and a
  // failed write drops the pending tick so the box shows what is stored.
  const [pending, setPending] = useState<{ base: boolean; value: boolean } | null>(null);
  const checked = pending !== null && pending.base === row.completed ? pending.value : row.completed;

  // The menu returns focus to its trigger when it closes. Add subtask and
  // Delete place focus themselves, so they raise this flag to stop the return.
  const skipMenuFocusReturnRef = useRef(false);

  function handleToggle(next: boolean) {
    setPending({ base: row.completed, value: next });
    void onToggle(row, next).then((stored) => {
      if (!stored) setPending(null);
    });
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    const input = event.currentTarget;
    const plain = !event.shiftKey && !event.altKey && !event.ctrlKey && !event.metaKey;

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (input.value.trim() === "") return;
      title.flush();
      onEnter(row);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      title.cancelEdit();
    } else if (event.key === "Backspace" && plain && input.value === "") {
      event.preventDefault();
      // Holding Backspace through a title must not carry on into deleting the
      // row once the last character is gone.
      if (!event.repeat) onBackspaceEmpty(row);
    } else if (event.key === "ArrowUp" && plain && input.selectionStart === 0 && input.selectionEnd === 0) {
      event.preventDefault();
      onNavigate(row, "up");
    } else if (
      event.key === "ArrowDown" &&
      plain &&
      input.selectionStart === input.value.length &&
      input.selectionEnd === input.value.length
    ) {
      event.preventDefault();
      onNavigate(row, "down");
    }
  }

  function handleMenuCloseAutoFocus(event: Event) {
    if (!skipMenuFocusReturnRef.current) return;
    skipMenuFocusReturnRef.current = false;
    event.preventDefault();
  }

  const style: React.CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition: transition ?? undefined,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      aria-current={isCurrent ? 'true' : undefined}
      className={
        isDragging
          ? 'relative z-10 rounded-xl bg-card opacity-70 ring-2 ring-ring'
          : undefined
      }
    >
      <div
        className={`flex items-center rounded-xl border ${isCurrent ? 'border-primary' : 'border-transparent'}`}
      >
        {isStored ? (
          <button
            ref={setActivatorNodeRef}
            type="button"
            {...attributes}
            {...listeners}
            aria-label={`Reorder ${name}`}
            className={`${rowIconButtonClass} cursor-grab! active:cursor-grabbing!`}
          >
            <RiDraggable aria-hidden="true" className="size-4" />
          </button>
        ) : (
          <button
            type="button"
            disabled
            aria-label={`Reorder ${name}`}
            className={rowIconButtonClass}
          >
            <RiDraggable aria-hidden="true" className="size-4" />
          </button>
        )}

        <label className="grid size-11 shrink-0 cursor-pointer place-items-center">
          <Checkbox
            checked={checked}
            disabled={!isStored}
            aria-label={`Mark ${name} as completed`}
            onCheckedChange={(state) => handleToggle(state === true)}
            className="size-5  cursor-pointer accent-primary outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed"
          />
        </label>

        <input
          ref={(element) => registerInput(row.key, element)}
          type="text"
          value={title.value}
          maxLength={TASK_TITLE_MAX_LENGTH}
          placeholder={TASK_TITLE_PLACEHOLDER}
          aria-label={ordinalName}
          autoComplete="off"
          enterKeyHint="next"
          onChange={(event) => title.onChange(event.target.value)}
          onFocus={title.onFocus}
          onBlur={title.onBlur}
          onKeyDown={handleKeyDown}
          className={`min-h-11 min-w-0 flex-1 rounded-lg border-0 bg-transparent px-2 text-base text-ellipsis outline-none! placeholder:text-base placeholder:text-muted-foreground ${
            checked ? 'text-muted-foreground line-through' : 'text-foreground'
          } ${isCurrent ? 'font-semibold' : 'font-medium'}`}
        />

        <TaskRowMenu
          name={name}
          canAddSubtask={!isSubtask}
          isStored={isStored}
          onAddSubtask={() => {
            skipMenuFocusReturnRef.current = true
            onAddSubtask(row)
          }}
          onDuplicate={() => onDuplicate(row)}
          onDelete={() => {
            skipMenuFocusReturnRef.current = true
            onDelete(row)
          }}
          onCloseAutoFocus={handleMenuCloseAutoFocus}
        />
      </div>
      {children}
    </li>
  )
}
