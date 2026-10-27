"use client";

import { useState } from "react";
import { useBackgroundImage } from "@/hooks/use-background-image";

// The uploaded image, painted behind the timer page and nowhere else. It is
// mounted by app/page.tsx, so leaving "/" unmounts it and /settings and /stats
// keep the plain ground (owner ruling 4).
//
// Paint order, back to front: canvas (--background), this layer's image, this
// layer's scrim, body::before (the paper grain, z -1), then all content. The
// layer sits at z -20 so the grain stays on top of it.
//
// The scrim is the page's own --background at 97%, so it is themed with no new
// token and the image reads as a faint tint of the ground, never a photograph.
// Image and scrim live in one element that fades in as a group, so no frame
// shows the dim without the image, and every intermediate frame is a blend of
// two in-band grounds.
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
      className={`pointer-events-none fixed inset-0 -z-20 overflow-hidden transition-opacity duration-500 motion-reduce:transition-none forced-colors:hidden ${shown ? "opacity-100" : "opacity-0"}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- a blob: URL from IndexedDB, nothing for next/image to optimise */}
      <img src={url} alt="" onLoad={() => setLoadedUrl(url)} className="absolute inset-0 size-full object-cover" />
      <div className="absolute inset-0 bg-background/97" />
    </div>
  );
}
