"use client";

import { useRef, useState, type ChangeEvent } from "react";
import {
  BACKGROUND_ACCEPT_ATTRIBUTE,
  BACKGROUND_MAX_MEGABYTES_LABEL,
  BACKGROUND_TYPES_LABEL,
  removeBackground,
  storeBackground,
  validateBackgroundBytes,
  validateBackgroundSize,
} from "@/lib/db";
import { canDecodeFile } from "@/lib/image-decode";
import { usePreferencesStore } from "@/lib/preferences/store";

const buttonClass =
  "inline-flex min-h-11 min-w-11 cursor-pointer items-center rounded-lg border border-control-border px-4 py-2 text-sm font-medium transition-colors hover:bg-accent hover:text-accent-foreground peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none";

const STORAGE_FAILED =
  "Could not save the image on this device. Close any other Pomotato tab and try again.";

const UNREADABLE = "That file could not be read as an image. Pick a different PNG, JPEG or WebP.";

// The data layer checks a file's structure, not its pixels. Size and type go
// first so their messages name the limit; the decode check comes last and
// runs before anything is written, so a bad pick leaves the old background alone.
async function findProblem(file: File): Promise<string | null> {
  const sized = validateBackgroundSize(file.size);
  if (sized.issue) return sized.issue.message;
  const checked = validateBackgroundBytes(new Uint8Array(await file.arrayBuffer()));
  if (checked.issue) return checked.issue.message;
  return (await canDecodeFile(file)) ? null : UNREADABLE;
}

interface Notice {
  text: string;
  isError: boolean;
}

// One image, kept in this browser only. The native file input is visually
// hidden but stays the control: the <label> names it and operates it, and the
// label's span carries the focus ring through `peer`, the shape the gauge
// radios use. Messages go through a single role="status" line that is always
// mounted, so a change is announced and focus never moves.
export function BackgroundControl() {
  const hasHydrated = usePreferencesStore((state) => state.hasHydrated);
  const background = usePreferencesStore((state) => state.background);
  const setBackground = usePreferencesStore((state) => state.setBackground);
  const inputRef = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  const isSet = hasHydrated && background !== null;
  const stateText = !hasHydrated ? "" : isSet ? "A background image is set." : "No background image.";

  async function handlePick(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    // Cleared so picking the same file again still fires change.
    input.value = "";
    if (!file || busy.current) return;
    busy.current = true;
    try {
      const problem = await findProblem(file);
      if (problem !== null) {
        setNotice({ text: problem, isError: true });
        return;
      }
      const result = await storeBackground(file);
      if (result.ok) {
        setBackground(result.background.id);
        const name = result.background.fileName;
        setNotice({
          text: `${name === "" ? "Background" : name} is now your background. It shows on the timer page.`,
          isError: false,
        });
      } else {
        setNotice({ text: result.issue.message, isError: true });
      }
    } catch {
      setNotice({ text: STORAGE_FAILED, isError: true });
    } finally {
      busy.current = false;
    }
  }

  async function handleRemove() {
    if (busy.current) return;
    busy.current = true;
    try {
      await removeBackground();
      setBackground(null);
      setNotice({ text: "Background removed. The timer page is back to the plain ground.", isError: false });
      // The remove button leaves the page now, so hand focus to the picker.
      inputRef.current?.focus();
    } catch {
      setNotice({ text: STORAGE_FAILED, isError: true });
    } finally {
      busy.current = false;
    }
  }

  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-1 font-heading text-lg font-semibold">Background image</legend>
      <p id="background-help" className="text-sm text-secondary-foreground">
        {BACKGROUND_TYPES_LABEL}, up to {BACKGROUND_MAX_MEGABYTES_LABEL}. The image stays on this device and is never
        uploaded anywhere. It shows behind the timer page only, dimmed heavily so the text stays readable, so expect a
        soft tint rather than a photo.
      </p>
      <div className="flex flex-wrap items-center gap-3">
        <label className="block cursor-pointer">
          <input
            ref={inputRef}
            type="file"
            accept={BACKGROUND_ACCEPT_ATTRIBUTE}
            onChange={handlePick}
            aria-describedby="background-help"
            className="peer sr-only"
          />
          <span className={buttonClass}>{isSet ? "Choose a different image" : "Choose an image"}</span>
        </label>
        {isSet ? (
          <button type="button" onClick={handleRemove} className={buttonClass}>
            Remove background
          </button>
        ) : null}
      </div>
      <p role="status" className={`min-h-6 text-sm ${notice?.isError ? "text-destructive" : "text-secondary-foreground"}`}>
        {notice?.text ?? stateText}
      </p>
    </fieldset>
  );
}
