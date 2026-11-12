"use client";

import { useState } from "react";
import { useBackgroundImage } from "@/hooks/use-background-image";

// The uploaded image, painted behind the timer page and nowhere else. It is
// mounted by app/page.tsx, so leaving "/" unmounts it and /settings and /stats
// keep the plain ground (owner ruling 4).
//
// Paint order, back to front: canvas (--background), this layer's image,
// body::before (the paper grain, z -1, switched off while this layer is
// "active"; see app/globals.css), then all content. The layer sits at z -20 so
// it is under everything.
//
// The image paints at full opacity with no scrim, filter or blend (task 012,
// superseding 010's 97% dim). Nothing textual sits on it: text sits on the
// surfaces in components/Surface.tsx, which is what keeps the contrast figures
// off the photograph. The one fade is the layer's own arrival, so a frame never
// shows a half-painted image over a missing surface: the surfaces are markup
// and are already there.
//
// The image is an <img> with object-cover, not a CSS background: it needs no
// inline style (the 007 palette guard flags an inline background) and it keeps
// its aspect ratio while covering the viewport.
export function BackgroundLayer() {
  const url = useBackgroundImage();
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);

  if (url === null) return null;
  const shown = loadedUrl === url;

  return (
    <div
      aria-hidden="true"
      data-background={shown ? "active" : "pending"}
      className={`pointer-events-none fixed inset-0 -z-20 overflow-hidden transition-opacity duration-500 motion-reduce:transition-none forced-colors:hidden ${shown ? "opacity-50" : "opacity-0"}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- a blob: URL from IndexedDB, nothing for next/image to optimise */}
      <img src={url} alt="" onLoad={() => setLoadedUrl(url)} className="absolute inset-0 size-full object-cover" />
    </div>
  );
}
