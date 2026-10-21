"use client";

import { useEffect, useRef } from "react";

/*
 * Throwaway spring for the glyph-slosh prototype. Same model and constants as
 * components/SloshGauge.tsx (which this deliberately does not import), reduced
 * to: level in, (surface height, lean in degrees) out through a paint callback.
 */
const STEP = 1 / 120;
const DT_MAX = 0.05;
const TILT_GAIN = 0.07;
const TILT_MAX = 30;
const REST_POS = 0.05;
const REST_VEL = 2;
const VISCOSITY = 0.15;
const TILT = 0.2;
const SPLASH = 0.2;

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

export interface Slosh {
  jolt: () => void;
}

export function useLocalSlosh(
  level: number,
  reduceMotion: boolean,
  paint: (surface: number, leanDeg: number) => void,
): Slosh {
  const sim = useRef({ x: level, v: 0, target: level, raf: 0, last: 0 });
  const reduce = useRef(reduceMotion);
  const paintRef = useRef(paint);
  const loop = useRef<(now: number) => void>(() => {});

  useEffect(() => {
    reduce.current = reduceMotion;
    paintRef.current = paint;
  });

  useEffect(() => {
    const s = sim.current;
    loop.current = (now: number) => {
      const dt = s.last ? Math.min((now - s.last) / 1000, DT_MAX) : STEP;
      s.last = now;
      const k = 1224 - 1044 * VISCOSITY;
      const zeta = reduce.current ? 1 : 0.26 - 0.17 * VISCOSITY;
      const c = 2 * zeta * Math.sqrt(k);
      const rest = reduce.current ? 0 : SPLASH;
      for (let n = Math.ceil(dt / STEP), h = dt / n; n > 0; n -= 1) {
        s.v = s.v * Math.exp(-c * h) + k * (s.target - s.x) * h;
        s.x += s.v * h;
        if (s.x > 100) {
          s.x = 100;
          s.v = -s.v * rest;
        } else if (s.x < 0) {
          s.x = 0;
          s.v = -s.v * rest;
        }
      }
      if (Math.abs(s.target - s.x) < REST_POS && Math.abs(s.v) < REST_VEL) {
        s.x = s.target;
        s.v = 0;
      }
      const lean = reduce.current ? 0 : clamp(TILT * s.v * TILT_GAIN, -TILT_MAX, TILT_MAX);
      paintRef.current(s.x, lean);
      if (s.x === s.target && s.v === 0) {
        s.raf = 0;
        s.last = 0;
      } else {
        s.raf = requestAnimationFrame(loop.current);
      }
    };
    return () => {
      cancelAnimationFrame(s.raf);
      s.raf = 0;
      s.last = 0;
    };
  }, []);

  useEffect(() => {
    const s = sim.current;
    s.target = clamp(level, 0, 100);
    if (!s.raf) s.raf = requestAnimationFrame(loop.current);
  }, [level]);

  return {
    jolt: () => {
      const s = sim.current;
      if (reduce.current) return;
      s.v += 700;
      if (!s.raf) s.raf = requestAnimationFrame(loop.current);
    },
  };
}
