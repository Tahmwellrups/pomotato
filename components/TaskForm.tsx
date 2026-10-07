"use client";

import { useEffect, useRef, useState } from "react";
import { DEFAULT_PALETTE_COLOR_ID, PALETTE, TaskValidationError, type PaletteColorId } from "@/lib/db";
import { isEmojiGraphemeCluster } from "@/lib/db/validation";
import { TaskColorDot } from "./TaskColorDot";

export interface TaskFormValues {
  title: string;
  emoji: string;
  colorId: PaletteColorId;
  eta: number;
}

const DEFAULT_EMOJI = "\u{1F954}"; // matches lib/db/task-repository.ts's own create default

const DEFAULT_VALUES: TaskFormValues = {
  title: "",
  emoji: DEFAULT_EMOJI,
  colorId: DEFAULT_PALETTE_COLOR_ID,
  eta: 1,
};

type FieldErrors = Partial<Record<keyof TaskFormValues, string>>;

function codePointLength(value: string): number {
  return Array.from(value).length;
}

/** Mirrors `validateEta` in `lib/db/validation.ts` for same-page feedback; the repository call below still re-validates and is the authority. */
function parseEta(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const value = Number(trimmed);
  if (!Number.isInteger(value) || value < 1 || value > 20) return null;
  return value;
}

interface TaskFormProps {
  /** Unique per rendered instance (the add form, or one per editing row), so field ids never collide across rows. */
  idPrefix: string;
  /** Omitted for the add form; provided for an edit so the fields start at the task's current values. */
  initialValues?: TaskFormValues;
  submitLabel: string;
  onSubmit: (values: TaskFormValues) => Promise<void>;
  /** Present only for an edit form; its absence is what makes this the add form (no Cancel control, and a successful submit resets to defaults instead of staying put). */
  onCancel?: () => void;
  /** Lets a caller (the add form's owner) refocus the title field from outside, for example after deleting the last task in the list. */
  titleInputRef?: React.RefObject<HTMLInputElement | null>;
}

export function TaskForm({ idPrefix, initialValues, submitLabel, onSubmit, onCancel, titleInputRef }: TaskFormProps) {
  const isAddForm = initialValues === undefined;
  const [title, setTitle] = useState(initialValues?.title ?? DEFAULT_VALUES.title);
  const [emoji, setEmoji] = useState(initialValues?.emoji ?? DEFAULT_VALUES.emoji);
  const [colorId, setColorId] = useState<PaletteColorId>(initialValues?.colorId ?? DEFAULT_VALUES.colorId);
  const [etaRaw, setEtaRaw] = useState(String(initialValues?.eta ?? DEFAULT_VALUES.eta));
  const [errors, setErrors] = useState<FieldErrors>({});
  // Guards against a second submit firing mid-request and disables the
  // submit/cancel buttons. Deliberately not applied to the fields
  // themselves: a disabled input blurs itself, which would undo the add
  // form's "title field keeps focus after submit" behavior below.
  const [submitting, setSubmitting] = useState(false);
  const localTitleInputRef = useRef<HTMLInputElement | null>(null);

  const titleFieldId = `${idPrefix}-title`;
  const emojiFieldId = `${idPrefix}-emoji`;
  const colorFieldId = `${idPrefix}-color`;
  const etaFieldId = `${idPrefix}-eta`;

  // An edit form mounts fresh every time a row switches into edit mode (see
  // TaskRow), replacing its Edit button in the DOM, so focus would
  // otherwise fall back to <body>. Moving it onto the title field keeps
  // focus inside the form and lets a plain Escape keypress reach this
  // form's own onKeyDown below. The add form stays mounted for the page's
  // whole lifetime, so this only ever fires once per edit, never on load.
  useEffect(() => {
    if (!isAddForm) {
      localTitleInputRef.current?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally mount-only: this is "did this form just appear", not "did isAddForm change".
  }, []);

  function handleCancel() {
    if (!onCancel) return;
    setErrors({});
    onCancel();
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    const trimmedTitle = title.trim();
    const nextErrors: FieldErrors = {};

    const titleLength = codePointLength(trimmedTitle);
    if (titleLength < 1 || titleLength > 100) {
      nextErrors.title = "Title must be 1-100 characters after trimming.";
    }
    if (!isEmojiGraphemeCluster(emoji)) {
      nextErrors.emoji = "Emoji must be exactly one emoji.";
    }
    const etaValue = parseEta(etaRaw);
    if (etaValue === null) {
      nextErrors.eta = "Estimate must be a whole number from 1 to 20.";
    }

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    if (etaValue === null) {
      // Unreachable (the check above already returned), only here so
      // `eta: etaValue` below doesn't need a non-null assertion.
      return;
    }

    setErrors({});
    setSubmitting(true);
    try {
      await onSubmit({ title: trimmedTitle, emoji, colorId, eta: etaValue });
      if (isAddForm) {
        setTitle("");
        setEmoji(DEFAULT_VALUES.emoji);
        setColorId(DEFAULT_VALUES.colorId);
        setEtaRaw(String(DEFAULT_VALUES.eta));
        localTitleInputRef.current?.focus();
      }
    } catch (error) {
      if (error instanceof TaskValidationError) {
        const mapped: FieldErrors = {};
        for (const issue of error.issues) {
          mapped[issue.field] = issue.message;
        }
        setErrors(mapped);
      } else {
        setErrors({ title: "Couldn't save this task. Try again." });
      }
    } finally {
      setSubmitting(false);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLFormElement>) {
    if (event.key === "Escape" && onCancel) {
      event.preventDefault();
      handleCancel();
    }
  }

  return (
    <form onSubmit={handleSubmit} onKeyDown={handleKeyDown} className="flex w-full flex-col gap-4" noValidate>
      <div className="flex flex-col gap-1">
        <label htmlFor={titleFieldId} className="text-sm font-medium text-stone-600">
          Title
        </label>
        <input
          id={titleFieldId}
          type="text"
          value={title}
          aria-invalid={errors.title !== undefined}
          aria-describedby={errors.title !== undefined ? `${titleFieldId}-error` : undefined}
          onChange={(event) => setTitle(event.target.value)}
          ref={(node) => {
            localTitleInputRef.current = node;
            if (titleInputRef) titleInputRef.current = node;
          }}
          className="min-h-11 rounded-lg border border-stone-300 bg-white px-3 py-2 text-stone-900 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-400"
        />
        {errors.title !== undefined ? (
          <p id={`${titleFieldId}-error`} role="alert" className="text-sm text-red-700">
            {errors.title}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor={emojiFieldId} className="text-sm font-medium text-stone-600">
          Emoji
        </label>
        <input
          id={emojiFieldId}
          type="text"
          value={emoji}
          aria-invalid={errors.emoji !== undefined}
          aria-describedby={errors.emoji !== undefined ? `${emojiFieldId}-error` : undefined}
          onChange={(event) => setEmoji(event.target.value)}
          className="min-h-11 w-20 rounded-lg border border-stone-300 bg-white px-3 py-2 text-center text-xl outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-400"
        />
        {errors.emoji !== undefined ? (
          <p id={`${emojiFieldId}-error`} role="alert" className="text-sm text-red-700">
            {errors.emoji}
          </p>
        ) : null}
      </div>

      <fieldset
        className="flex flex-col gap-1"
        aria-describedby={errors.colorId !== undefined ? `${colorFieldId}-error` : undefined}
      >
        <legend className="text-sm font-medium text-stone-600">Color</legend>
        <div className="flex flex-wrap gap-2">
          {PALETTE.map((entry) => {
            const checked = colorId === entry.id;
            return (
              <label key={entry.id} className="cursor-pointer rounded-full">
                <input
                  type="radio"
                  name={colorFieldId}
                  value={entry.id}
                  checked={checked}
                  onChange={() => setColorId(entry.id)}
                  className="peer sr-only"
                />
                <span className="sr-only">{entry.name}</span>
                <span
                  className={[
                    "flex h-9 w-9 items-center justify-center rounded-full ring-offset-2 ring-offset-white transition-shadow",
                    "peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-amber-700",
                    checked ? "ring-2 ring-stone-900" : "ring-1 ring-stone-300",
                  ].join(" ")}
                >
                  <TaskColorDot colorId={entry.id} className="h-6 w-6" />
                </span>
              </label>
            );
          })}
        </div>
        {errors.colorId !== undefined ? (
          <p id={`${colorFieldId}-error`} role="alert" className="text-sm text-red-700">
            {errors.colorId}
          </p>
        ) : null}
      </fieldset>

      <div className="flex flex-col gap-1">
        <label htmlFor={etaFieldId} className="text-sm font-medium text-stone-600">
          Estimated pomodoros
        </label>
        <input
          id={etaFieldId}
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          value={etaRaw}
          aria-invalid={errors.eta !== undefined}
          aria-describedby={errors.eta !== undefined ? `${etaFieldId}-error` : undefined}
          onChange={(event) => setEtaRaw(event.target.value)}
          className="min-h-11 w-24 rounded-lg border border-stone-300 bg-white px-3 py-2 text-stone-900 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-400"
        />
        {errors.eta !== undefined ? (
          <p id={`${etaFieldId}-error`} role="alert" className="text-sm text-red-700">
            {errors.eta}
          </p>
        ) : null}
      </div>

      <div className="flex gap-3">
        <button
          type="submit"
          disabled={submitting}
          className="min-h-11 rounded-lg bg-amber-700 px-5 py-2 font-medium text-white outline-none hover:bg-amber-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700 disabled:cursor-not-allowed disabled:bg-stone-300"
        >
          {submitLabel}
        </button>
        {onCancel ? (
          <button
            type="button"
            onClick={handleCancel}
            disabled={submitting}
            className="min-h-11 rounded-lg border border-stone-300 bg-white px-5 py-2 font-medium text-stone-700 outline-none hover:border-stone-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-700 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
        ) : null}
      </div>
    </form>
  );
}
