"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { contrast, resolveToken, type Rgb } from "./contrast";
import { useLocalSlosh } from "./use-local-slosh";

const FAKE_TIME = "25:00";
const RUN_SECONDS = 40;
const AA = 4.5;
const INITIAL_LEVEL = 70;
/* Where the digit ink sits inside the 1em line box, as percent from the bottom edge. */
const INK_BOTTOM = 14;
const INK_HEIGHT = 70;

type Variant = {
  id: string;
  title: string;
  blurb: string;
  mode: "vessel" | "glyph";
  filled: string;
  unfilled: string;
  filledLabel: string;
  unfilledLabel: string;
  /** What the digit is painted against. Vessel: liquid / glass. Glyph panels: the page. */
  filledBackdrop: string;
  unfilledBackdrop: string;
};

const VARIANTS: readonly Variant[] = [
  {
    id: "control",
    title: "1. Control: vessel behind",
    blurb: "What ships today. Solid foreground digits over a liquid box.",
    mode: "vessel",
    filled: "--foreground",
    unfilled: "--foreground",
    filledLabel: "digit on liquid",
    unfilledLabel: "digit on glass",
    filledBackdrop: "--gauge-liquid",
    unfilledBackdrop: "--popover",
  },
  {
    id: "pale",
    title: "2. Pale liquid inside the glyphs",
    blurb: "Fill --gauge-liquid, unfilled --foreground. Built as asked, not tuned.",
    mode: "glyph",
    filled: "--gauge-liquid",
    unfilled: "--foreground",
    filledLabel: "filled digit",
    unfilledLabel: "unfilled digit",
    filledBackdrop: "--background",
    unfilledBackdrop: "--background",
  },
  {
    id: "dark",
    title: "3. Dark liquid inside the glyphs",
    blurb: "Fill --primary, unfilled --foreground.",
    mode: "glyph",
    filled: "--primary",
    unfilled: "--foreground",
    filledLabel: "filled digit",
    unfilledLabel: "unfilled digit",
    filledBackdrop: "--background",
    unfilledBackdrop: "--background",
  },
  {
    id: "both",
    title: "4. Both tones legible",
    blurb: "Fill --accent-foreground, unfilled --muted-foreground.",
    mode: "glyph",
    filled: "--accent-foreground",
    unfilled: "--muted-foreground",
    filledLabel: "filled digit",
    unfilledLabel: "unfilled digit",
    filledBackdrop: "--background",
    unfilledBackdrop: "--background",
  },
];

const DIGITS_CLASS = "font-space-grotesk text-6xl font-extrabold tabular-nums sm:text-7xl lg:text-8xl";

function useReducedMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduce(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);
  return reduce;
}

function Digits({ variant }: { variant: Variant }) {
  if (variant.mode === "vessel") {
    return (
      <div className="relative flex min-h-40 w-full items-center justify-center px-6 py-4 sm:min-h-44 lg:min-h-52">
        <div
          aria-hidden="true"
          className="absolute inset-0 overflow-clip rounded-2xl border border-border bg-popover [container-type:inline-size]"
        >
          <div
            className="absolute inset-0 bg-[var(--gauge-liquid)]"
            style={{
              clipPath:
                "polygon(0 calc((100 - var(--x)) * 1% + tan(var(--th)) * 50cqw), 100% calc((100 - var(--x)) * 1% - tan(var(--th)) * 50cqw), 100% 100%, 0 100%)",
            }}
          />
        </div>
        <p className={`relative text-foreground ${DIGITS_CLASS}`}>{FAKE_TIME}</p>
      </div>
    );
  }
  const stop = `calc(${INK_BOTTOM} * 1% + var(--x) * ${INK_HEIGHT / 100} * 1%)`;
  return (
    <div className="relative flex min-h-40 w-full items-center justify-center px-6 py-4 sm:min-h-44 lg:min-h-52">
      <p
        className={DIGITS_CLASS}
        style={
          {
            color: "transparent",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            backgroundImage: `linear-gradient(calc(var(--th) * -1), var(${variant.filled}) ${stop}, var(${variant.unfilled}) ${stop})`,
          } as CSSProperties
        }
      >
        {FAKE_TIME}
      </p>
    </div>
  );
}

function Ratio({ label, ratio, absent }: { label: string; ratio: number | null; absent: boolean }) {
  if (absent) {
    return (
      <li className="flex justify-between gap-3">
        <span>{label}</span>
        <span className="text-muted-foreground">not on screen at this level</span>
      </li>
    );
  }
  if (ratio === null) {
    return (
      <li className="flex justify-between gap-3">
        <span>{label}</span>
        <span className="text-muted-foreground">measuring</span>
      </li>
    );
  }
  const pass = ratio >= AA;
  return (
    <li className="flex justify-between gap-3">
      <span>{label}</span>
      <span className="font-semibold tabular-nums">
        {ratio.toFixed(2)}:1 {pass ? "PASS" : "FAIL"} <span aria-hidden="true">{pass ? "✓" : "✗"}</span>
      </span>
    </li>
  );
}

export function GlyphSloshLab() {
  const reduce = useReducedMotion();
  const [level, setLevel] = useState(INITIAL_LEVEL);
  const [running, setRunning] = useState(false);
  const [ratios, setRatios] = useState<Record<string, { filled: number; unfilled: number }> | null>(null);
  const grid = useRef<HTMLDivElement>(null);
  const level$ = useRef(level);
  useEffect(() => {
    level$.current = level;
  });

  const paint = useCallback((surface: number, lean: number) => {
    const el = grid.current;
    if (!el) return;
    el.style.setProperty("--x", surface.toFixed(3));
    el.style.setProperty("--th", `${lean.toFixed(3)}deg`);
  }, []);
  const slosh = useLocalSlosh(level, reduce, paint);

  /* Run: level is derived from a stored end timestamp each frame, not counted. */
  useEffect(() => {
    if (!running) return;
    const startLevel = level$.current;
    const endAt = performance.now() + (startLevel / 100) * RUN_SECONDS * 1000;
    let raf = 0;
    const frame = (now: number) => {
      const left = Math.max(0, endAt - now);
      const next = (left / (RUN_SECONDS * 1000)) * 100;
      setLevel(next);
      if (left > 0) raf = requestAnimationFrame(frame);
      else setRunning(false);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [running]);

  useEffect(() => {
    const out: Record<string, { filled: number; unfilled: number }> = {};
    for (const v of VARIANTS) {
      const px = (name: string): Rgb => resolveToken(name);
      out[v.id] = {
        filled: contrast(px(v.filled), px(v.filledBackdrop)),
        unfilled: contrast(px(v.unfilled), px(v.unfilledBackdrop)),
      };
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-off browser measurement, prototype only
    setRatios(out);
  }, []);

  const shown = Math.round(level);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          Prototype, pending owner decision. Not linked from the app.
        </p>
        <h1 className="text-3xl font-extrabold">Slosh inside the digits?</h1>
        <p className="max-w-3xl text-muted-foreground">
          Every value on this page is fake. The time is a fixed {FAKE_TIME} and the level comes from the slider or the
          run toggle, not from a real timer. Panel 2 is built exactly as asked and is expected to look bad. Contrast
          figures are measured in your browser from the live token colours, against the 4.5:1 AA line for text.
        </p>
      </header>

      <section
        aria-label="Prototype controls"
        className="sticky top-0 z-10 flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-background/95 p-4 backdrop-blur"
      >
        <label className="flex min-w-60 flex-1 items-center gap-3 text-sm font-semibold">
          <span className="whitespace-nowrap">Level {shown}</span>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={shown}
            onChange={(e) => {
              setRunning(false);
              setLevel(Number(e.target.value));
            }}
            className="h-6 flex-1 cursor-pointer accent-[var(--primary)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
          />
        </label>
        <button
          type="button"
          aria-pressed={running}
          onClick={() => {
            if (running) setRunning(false);
            else {
              if (level$.current <= 0) setLevel(100);
              setRunning(true);
            }
          }}
          className="min-h-11 rounded-xl border border-border bg-primary px-5 text-sm font-semibold text-primary-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring aria-pressed:bg-accent-foreground"
        >
          {running ? "Stop run" : "Run (drain over 40s)"}
        </button>
        <button
          type="button"
          onClick={() => slosh.jolt()}
          disabled={reduce}
          className="min-h-11 rounded-xl border border-border bg-card px-5 text-sm font-semibold text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
        >
          Jolt
        </button>
        <p className="w-full text-sm text-muted-foreground">
          A slow drain barely sloshes, same as the real timer. Jolt kicks the spring so you can see the lean.
          {reduce ? " Reduced motion is on: the surface moves without lean or bounce, and Jolt is off." : ""}
        </p>
      </section>

      <div
        ref={grid}
        className="grid grid-cols-1 gap-6 lg:grid-cols-2"
        style={{ "--x": INITIAL_LEVEL, "--th": "0deg" } as CSSProperties}
      >
        {VARIANTS.map((v) => {
          const r = ratios?.[v.id];
          return (
            <figure key={v.id} className="flex flex-col gap-3 rounded-2xl border border-border bg-background p-4">
              <figcaption>
                <h2 className="text-lg font-bold">{v.title}</h2>
                <p className="text-sm text-muted-foreground">{v.blurb}</p>
              </figcaption>
              <Digits variant={v} />
              <ul className="flex flex-col gap-1 border-t border-border pt-3 text-sm">
                <Ratio label={v.filledLabel} ratio={r?.filled ?? null} absent={shown <= 0} />
                <Ratio label={v.unfilledLabel} ratio={r?.unfilled ?? null} absent={shown >= 100} />
              </ul>
            </figure>
          );
        })}
      </div>
    </div>
  );
}
