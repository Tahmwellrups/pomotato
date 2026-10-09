"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { useMediaQuery } from "@/hooks/use-media-query";
import type { StatsResult } from "@/lib/stats";
import { formatFocusTime } from "./format-focus-time";

const MS_PER_MINUTE = 60_000;
const MS_PER_HOUR = 3_600_000;
const DESKTOP_HEIGHT = 240;
const ROW_HEIGHT = 22;
const NARROW_QUERY = "(max-width: 639px)";
// A vertical bar chart gets unreadable past this many bars on a phone, so
// those views lay the bars out as horizontal rows instead.
const MAX_COLUMNS_ON_NARROW = 12;

interface StatsChartProps {
  result: StatsResult;
  /** Text for the screen-reader label, e.g. "Focus time per hour today". */
  description: string;
}

// The chart is a visual summary only. Every number it shows is also in the
// bucket table, so there is deliberately no tooltip and no hover-only value.
export function StatsChart({ result, description }: StatsChartProps) {
  const narrow = useMediaQuery(NARROW_QUERY);
  const horizontal = narrow && result.buckets.length > MAX_COLUMNS_ON_NARROW;

  const maxFocusMs = Math.max(...result.buckets.map((bucket) => bucket.focusMs));
  const useHours = maxFocusMs >= 2 * MS_PER_HOUR;
  const unitMs = useHours ? MS_PER_HOUR : MS_PER_MINUTE;
  const unitSuffix = useHours ? "h" : "m";
  const data = result.buckets.map((bucket) => ({ label: bucket.label, value: bucket.focusMs / unitMs }));

  const height = horizontal ? result.buckets.length * ROW_HEIGHT + 32 : DESKTOP_HEIGHT;
  const tickStyle = { fill: "var(--secondary-foreground)", fontSize: 12 };
  const axisLine = { stroke: "var(--border)" };
  const formatTick = (value: number) => `${Math.round(value * 10) / 10}${unitSuffix}`;

  return (
    <div role="img" aria-label={`${description}. Total ${formatFocusTime(result.totalFocusMs)}. The same numbers are in the table below.`}>
      <ResponsiveContainer width="100%" height={height} initialDimension={{ width: 320, height }}>
        <BarChart
          data={data}
          layout={horizontal ? "vertical" : "horizontal"}
          margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
          accessibilityLayer={false}
        >
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={horizontal} horizontal={!horizontal} />
          {horizontal ? (
            <>
              <XAxis type="number" tick={tickStyle} tickLine={false} axisLine={axisLine} tickFormatter={formatTick} />
              <YAxis type="category" dataKey="label" tick={tickStyle} tickLine={false} axisLine={axisLine} width={40} interval={0} />
            </>
          ) : (
            <>
              <XAxis dataKey="label" tick={tickStyle} tickLine={false} axisLine={axisLine} interval="preserveStartEnd" />
              <YAxis type="number" tick={tickStyle} tickLine={false} axisLine={axisLine} tickFormatter={formatTick} width={44} />
            </>
          )}
          <Bar dataKey="value" fill="var(--chart-1)" radius={horizontal ? [0, 3, 3, 0] : [3, 3, 0, 0]} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
