"use client";

import { useEffect, useState } from "react";
import { loadBackground } from "@/lib/db";
import { canDecodeImage } from "@/lib/image-decode";
import { usePreferencesStore } from "@/lib/preferences/store";

interface ReadyImage {
  id: string;
  url: string;
}

/**
 * The object URL of the stored background once it has loaded and decoded, else
 * `null`. Every failure path is `null`: no preference, a dangling reference, an
 * unavailable database, bytes that pass the structural check but will not decode.
 *
 * One read per change of the preference id. The URL is revoked when the id
 * changes and on unmount.
 *
 * A reference whose row is missing is not cleared here. Another tab may have
 * replaced the image since this tab read its preference, and writing `null`
 * back would delete that tab's valid choice. A dangling id costs one read.
 */
export function useBackgroundImage(): string | null {
  const hasHydrated = usePreferencesStore((state) => state.hasHydrated);
  const id = usePreferencesStore((state) => state.background);
  const [ready, setReady] = useState<ReadyImage | null>(null);

  useEffect(() => {
    if (!hasHydrated || id === null) return;
    let cancelled = false;
    let objectUrl: string | null = null;

    async function load(backgroundId: string) {
      const result = await loadBackground(backgroundId);
      if (cancelled || result.status !== "found") return;
      const url = URL.createObjectURL(result.background.blob);
      objectUrl = url;
      if (!(await canDecodeImage(url))) {
        URL.revokeObjectURL(url);
        objectUrl = null;
        return;
      }
      if (!cancelled) setReady({ id: backgroundId, url });
    }
    void load(id);

    return () => {
      cancelled = true;
      if (objectUrl !== null) URL.revokeObjectURL(objectUrl);
    };
  }, [hasHydrated, id]);

  return hasHydrated && id !== null && ready?.id === id ? ready.url : null;
}
