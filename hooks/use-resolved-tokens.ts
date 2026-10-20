"use client";

import { useMemo, useSyncExternalStore } from "react";

const SEPARATOR = "|";

function subscribe(onChange: () => void): () => void {
  // Any of these can change what a token resolves to: a `.dark` class or
  // `data-theme` attribute on <html>, an inline custom-property override, or
  // the OS colour scheme.
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["class", "style", "data-theme"],
  });
  const scheme = window.matchMedia("(prefers-color-scheme: dark)");
  scheme.addEventListener("change", onChange);
  return () => {
    observer.disconnect();
    scheme.removeEventListener("change", onChange);
  };
}

/**
 * Resolves CSS custom properties (e.g. "--primary") to the concrete colour
 * strings they currently compute to, for props that cannot take `var(...)`.
 * Re-reads on every theme signal in `subscribe`, never cached across them.
 * Server and hydration render return empty strings, so markup matches.
 *
 * Pass a module-level `tokens` object; its keys name the returned values.
 */
export function useResolvedTokens<K extends string>(tokens: Record<K, string>): Record<K, string> {
  const keys = Object.keys(tokens) as K[];
  const getSnapshot = (): string => {
    const style = getComputedStyle(document.documentElement);
    return keys.map((key) => style.getPropertyValue(tokens[key]).trim()).join(SEPARATOR);
  };
  const getServerSnapshot = (): string => keys.map(() => "").join(SEPARATOR);
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  return useMemo(() => {
    const values = snapshot.split(SEPARATOR);
    const resolved = {} as Record<K, string>;
    keys.forEach((key, index) => {
      resolved[key] = values[index] ?? "";
    });
    return resolved;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot]);
}
