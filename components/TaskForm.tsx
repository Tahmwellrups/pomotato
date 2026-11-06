"use client";

import { useEffect, useRef, useState } from "react";
import { TaskValidationError } from "@/lib/db";

export interface TaskFormValues {
  title: string;
  eta: number;
}

const DEFAULT_VALUES: TaskFormValues = {
  title: "",
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
  const [etaRaw, setEtaRaw] = useState(String(initialValues?.eta ?? DEFAULT_VALUES.eta));
  const [errors, setErrors] = useState<FieldErrors>({});
  // Guards against a second submit firing mid-request and disables the
  // submit/cancel buttons. Deliberately not applied to the fields
  // themselves: a disabled input blurs itself, which would undo the add
  // form's "title field keeps focus after submit" behavior below.
  const [submitting, setSubmitting] = useState(false);
  const localTitleInputRef = useRef<HTMLInputElement | null>(null);

  const titleFieldId = `${idPrefix}-title`;
  const etaFieldId = `${idPrefix}-eta`;

  // An edit form mounts fresh every time a row switches into edit mode (see
  // TaskChecklistRow), replacing its Edit button in the DOM, so focus would
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
      await onSubmit({ title: trimmedTitle, eta: etaValue });
      if (isAddForm) {
        setTitle("");
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
      }
      // Any other failure is a write failure, not a field problem. The owning
      // panel reports it in its single alert line; the form stays as typed.
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
    <form onSubmit={handleSubmit} onKeyDown={handleKeyDown} className="flex w-full flex-col gap-2" noValidate>
      <div className="flex flex-col gap-1">
        <label htmlFor={titleFieldId} className="text-sm font-medium text-muted-foreground">
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
          className="min-h-11 rounded-lg border border-control-border bg-popover px-3 py-2 text-foreground outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:bg-muted disabled:text-[color-mix(in_srgb,var(--muted-foreground)_56%,var(--muted))]"
        />
        {errors.title !== undefined ? (
          <p id={`${titleFieldId}-error`} role="alert" className="text-sm text-destructive">
            {errors.title}
          </p>
        ) : null}
      </div>

      {/* The count field and the buttons share a line, so the add form is two rows tall and not four. */}
      <div className="flex flex-wrap items-end gap-x-3 gap-y-2">
        <div className="flex flex-col gap-1">
          <label htmlFor={etaFieldId} className="text-sm font-medium text-muted-foreground">
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
            className="min-h-11 w-24 rounded-lg border border-control-border bg-popover px-3 py-2 text-foreground outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:bg-muted disabled:text-[color-mix(in_srgb,var(--muted-foreground)_56%,var(--muted))]"
          />
          {errors.eta !== undefined ? (
            <p id={`${etaFieldId}-error`} role="alert" className="text-sm text-destructive">
              {errors.eta}
            </p>
          ) : null}
        </div>

        <div className="flex gap-2">
          <button
            type="submit"
            disabled={submitting}
            className="min-h-11 rounded-lg bg-primary px-5 py-2 font-medium text-primary-foreground outline-none hover:bg-[color-mix(in_srgb,var(--primary),var(--foreground)_20%)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:bg-disabled-surface"
          >
            {submitLabel}
          </button>
          {onCancel ? (
            <button
              type="button"
              onClick={handleCancel}
              disabled={submitting}
              className="min-h-11 rounded-lg border border-control-border bg-popover px-5 py-2 font-medium text-secondary-foreground outline-none hover:border-[color-mix(in_srgb,var(--control-border),var(--foreground)_40%)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-not-allowed"
            >
              Cancel
            </button>
          ) : null}
        </div>
      </div>
    </form>
  );
}
