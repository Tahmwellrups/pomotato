/*
 * Vendored from ReactBits (DavidHDev/react-bits, MIT + Commons Clause), added with
 * `npx shadcn@latest add @react-bits/SloshGauge-TS-TW`. Edited by Pomotato; a future
 * `shadcn add` offering to overwrite this file is a conflict, not a routine update.
 * Local edits:
 *  - Removed the built-in numeric readout (showValue, unit, onColor and the two text
 *    spans). Pomotato shows remaining time only as mm:ss, and onColor carried hex literals.
 *  - width/height are optional; when omitted the gauge fills its parent via CSS, so the
 *    vessel can be responsive. Lean and marker maths read offsetWidth/offsetHeight.
 *  - The unmount cleanup also zeroes sim.raf. Without it React StrictMode's dev-only
 *    mount/unmount/mount leaves a cancelled frame id behind, wake() sees it as pending,
 *    and the liquid never moves.
 *  - live props are synced in a layout effect instead of during render (react-hooks/refs).
 *  - The live ref is initialised with the first-render props instead of `{} as Live`, so
 *    paint() can never read an undefined tilt regardless of effect order.
 *  - Colour defaults are `transparent` instead of hex literals. Callers pass colours
 *    resolved from CSS custom properties (see hooks/use-resolved-tokens.ts).
 */
'use client';

import React, {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent
} from 'react';
export interface SloshGaugeProps {
  value?: number;
  defaultValue?: number;
  onChange?: (value: number) => void;
  interactive?: boolean;
  disabled?: boolean;
  liquidColor?: string;
  glassColor?: string;
  width?: number;
  height?: number;
  radius?: number;
  ticks?: number;
  viscosity?: number;
  tilt?: number;
  splash?: number;
  ariaLabel?: string;
  className?: string;
}

interface Sim {
  x: number;
  v: number;
  L: number;
  raf: number;
  last: number;
}

interface Grip {
  id: number;
  rect: DOMRect;
  scale: number;
  band: boolean;
  grab: number | null;
  at: number;
  sent: number;
}

interface Live {
  viscosity: number;
  tilt: number;
  splash: number;
  value: number | undefined;
  onChange: ((value: number) => void) | undefined;
}

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const H = 1 / 120;
const DT_MAX = 0.05;
const TILT_GAIN = 0.07;
const TILT_MAX = 30;
const REST_POS = 0.05;
const REST_VEL = 2;
const STEP = 2;
const BIG = 10;
const BAND = 10;

const SloshGauge: React.FC<SloshGaugeProps> = ({
  value,
  defaultValue = 60,
  onChange,
  interactive = false,
  disabled = false,
  liquidColor = 'transparent',
  glassColor = 'transparent',
  width,
  height,
  radius = 20,
  ticks = 4,
  viscosity = 0.15,
  tilt = 0.45,
  splash = 0.42,
  ariaLabel = 'Level',
  className = ''
}) => {
  const root = useRef<HTMLDivElement>(null);
  const liquid = useRef<HTMLDivElement>(null);
  const marker = useRef<HTMLDivElement>(null);
  const start = clamp(value ?? defaultValue, 0, 100);
  const sim = useRef<Sim>({ x: start, v: 0, L: start, raf: 0, last: 0 });
  const grip = useRef<Grip | null>(null);
  const reduce = useRef(false);
  const [held, setHeld] = useState(false);
  const live = useRef<Live>({ viscosity, tilt, splash, value, onChange });
  useLayoutEffect(() => {
    live.current = { viscosity, tilt, splash, value, onChange };
  });

  const paint = () => {
    const { x, v, L } = sim.current;
    const { tilt: t } = live.current;
    const W = root.current?.offsetWidth ?? 0;
    const Hh = root.current?.offsetHeight ?? 0;
    const th = reduce.current ? 0 : clamp(t * v * TILT_GAIN, -TILT_MAX, TILT_MAX);
    const lean = (Math.tan((th * Math.PI) / 180) * W) / 2;
    const top = 100 - x;
    if (liquid.current) {
      liquid.current.style.clipPath = `polygon(0 calc(${top}% + ${lean}px), 100% calc(${top}% - ${lean}px), 100% 100%, 0 100%)`;
    }
    if (marker.current) marker.current.style.transform = `translateY(${((100 - L) * Hh) / 100}px)`;
  };

  const say = () => {
    root.current?.setAttribute('aria-valuenow', String(Math.round(sim.current.L)));
  };

  const tick = (now: number) => {
    const s = sim.current;
    const { viscosity: vis, splash: give } = live.current;
    const dt = s.last ? Math.min((now - s.last) / 1000, DT_MAX) : H;
    s.last = now;
    if (vis <= 0) {
      s.x = s.L;
      s.v = 0;
    } else {
      const k = 1224 - 1044 * vis;
      const zeta = reduce.current ? 1 : 0.26 - 0.17 * vis;
      const c = 2 * zeta * Math.sqrt(k);
      const rest = reduce.current ? 0 : give;
      for (let n = Math.ceil(dt / H), h = dt / n; n > 0; n -= 1) {
        s.v = s.v * Math.exp(-c * h) + k * (s.L - s.x) * h;
        s.x += s.v * h;
        if (s.x > 100) {
          s.x = 100;
          s.v = -s.v * rest;
        } else if (s.x < 0) {
          s.x = 0;
          s.v = -s.v * rest;
        }
      }
      if (!grip.current && Math.abs(s.L - s.x) < REST_POS && Math.abs(s.v) < REST_VEL) {
        s.x = s.L;
        s.v = 0;
      }
    }
    paint();
    const parked = !grip.current && s.x === s.L && s.v === 0;
    if (parked) {
      s.raf = 0;
      s.last = 0;
    } else {
      s.raf = requestAnimationFrame(tick);
    }
  };
  const wake = () => {
    if (!sim.current.raf) sim.current.raf = requestAnimationFrame(tick);
  };
  const setLevel = (L: number, instant?: boolean) => {
    const s = sim.current;
    s.L = clamp(L, 0, 100);
    if (instant) {
      s.x = s.L;
      s.v = 0;
    }
    say();
    wake();
  };

  useLayoutEffect(() => {
    if (value === undefined) return;
    if (grip.current && Math.round(sim.current.L) === value) return;
    setLevel(value, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  useLayoutEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => {
      reduce.current = mq.matches;
    };
    sync();
    mq.addEventListener('change', sync);
    say();
    paint();
    const s = sim.current;
    return () => {
      mq.removeEventListener('change', sync);
      cancelAnimationFrame(s.raf);
      s.raf = 0;
      s.last = 0;
    };
  }, []);

  useEffect(() => {
    paint();
  }, [tilt, interactive, disabled]);

  const levelAt = (clientY: number, g: Grip) =>
    clamp(((g.rect.bottom - clientY) / g.scale / (root.current?.offsetHeight || g.rect.height)) * 100, 0, 100);
  const report = () => {
    const g = grip.current;
    const n = Math.round(sim.current.L);
    if (g && n !== g.sent) {
      g.sent = n;
      live.current.onChange?.(n);
    }
  };

  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (!interactive || disabled || grip.current || e.button !== 0) return;
    const el = root.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const scale = rect.height / (el.offsetHeight || rect.height) || 1;
    const markerY = rect.top + ((100 - sim.current.L) / 100) * rect.height;
    const g: Grip = {
      id: e.pointerId,
      rect,
      scale,
      band: Math.abs(e.clientY - markerY) <= BAND * scale,
      grab: null,
      at: sim.current.L,
      sent: NaN
    };
    grip.current = g;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {}
    setHeld(true);
    if (g.band) {
      wake();
    } else {
      setLevel(levelAt(e.clientY, g));
      report();
    }
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const g = grip.current;
    if (!g || g.id !== e.pointerId) return;
    const at = levelAt(e.clientY, g);
    if (g.band && g.grab === null) {
      g.grab = sim.current.L - at;
      return;
    }
    setLevel(at + (g.grab ?? 0));
    report();
  };
  const up = (e: { pointerId: number }, reason?: 'cancel' | 'escape') => {
    const g = grip.current;
    if (!g || g.id !== e.pointerId) return;
    grip.current = null;
    try {
      root.current?.releasePointerCapture(e.pointerId);
    } catch {}
    setHeld(false);
    if (reason === 'escape') {
      setLevel(g.at);
      live.current.onChange?.(Math.round(g.at));
    } else if (live.current.value !== undefined && Math.round(sim.current.L) !== live.current.value) {
      setLevel(live.current.value);
    }
    wake();
  };
  const key = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!interactive || disabled) return;
    if (e.key === 'Escape') {
      if (grip.current) up({ pointerId: grip.current.id }, 'escape');
      return;
    }
    const L = sim.current.L;
    const d = e.shiftKey ? BIG : STEP;
    const next: number | undefined = (
      {
        ArrowUp: L + d,
        ArrowRight: L + d,
        ArrowDown: L - d,
        ArrowLeft: L - d,
        PageUp: L + BIG,
        PageDown: L - BIG,
        Home: 0,
        End: 100
      } as Record<string, number>
    )[e.key];
    if (next === undefined) return;
    e.preventDefault();
    setLevel(next, true);
    live.current.onChange?.(Math.round(sim.current.L));
  };


  return (
    <div
      ref={root}
      className={`group relative isolate box-border inline-block overflow-clip leading-none font-semibold tabular-nums outline-none select-none [width:var(--sg-w,100%)] [height:var(--sg-h,100%)] [border-radius:var(--sg-r)] [background:var(--sg-glass)] [-webkit-tap-highlight-color:transparent] data-[interactive=true]:cursor-ns-resize data-[interactive=true]:touch-none data-[interactive=true]:[-webkit-touch-callout:none] data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-50${className ? ` ${className}` : ''}`}
      role={interactive ? 'slider' : 'meter'}
      tabIndex={interactive && !disabled ? 0 : undefined}
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(start)}
      aria-orientation={interactive ? 'vertical' : undefined}
      aria-disabled={disabled || undefined}
      data-interactive={interactive ? 'true' : 'false'}
      data-held={held ? 'true' : 'false'}
      data-disabled={disabled ? 'true' : 'false'}
      style={
        {
          ...(width === undefined ? {} : { '--sg-w': `${width}px` }),
          ...(height === undefined ? {} : { '--sg-h': `${height}px` }),
          '--sg-r': `${radius}px`,
          '--sg-glass': glassColor,
          '--sg-liquid': liquidColor,
          '--sg-ticks': ticks
        } as CSSProperties
      }
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={e => up(e)}
      onPointerCancel={e => up(e, 'cancel')}
      onLostPointerCapture={e => up(e, 'cancel')}
      onKeyDown={key}
    >
      <div
        ref={liquid}
        className="absolute inset-0 [background:var(--sg-liquid)] [clip-path:polygon(0_100%,100%_100%,100%_100%,0_100%)]"
        aria-hidden="true"
      >
      </div>
      {ticks > 0 ? (
        <div
          className="pointer-events-none absolute right-0 bottom-0 h-full w-[22%] bg-bottom bg-repeat-y [background-image:linear-gradient(to_top,color-mix(in_srgb,currentColor_22%,transparent)_0_1px,transparent_1px)] [background-size:100%_calc(100%/var(--sg-ticks))]"
          aria-hidden="true"
        />
      ) : null}
      {interactive && !disabled ? (
        <div
          ref={marker}
          className="pointer-events-none absolute inset-x-[10%] top-0 -mt-px h-0.5 rounded-[1px] bg-current opacity-0 [transition:opacity_150ms_ease] group-data-[held=true]:opacity-100"
          aria-hidden="true"
        />
      ) : null}
    </div>
  );
};

export default SloshGauge;
