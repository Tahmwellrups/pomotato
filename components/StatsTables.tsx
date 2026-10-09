import type { StatsResult } from "@/lib/stats";
import { formatFocusTime } from "./format-focus-time";

const cellBase = "px-3 py-2 text-left";
const headBase = "px-3 py-2 text-left font-semibold text-secondary-foreground";

interface StatsTableProps {
  result: StatsResult;
  /** Names what the buckets are, e.g. "hour", "day". */
  bucketNoun: string;
  /** Names the range, e.g. "today", "this week". */
  rangeName: string;
}

export function BucketTable({ result, bucketNoun, rangeName }: StatsTableProps) {
  return (
    <details className="group rounded-lg border border-border bg-card">
      <summary className="flex min-h-11 cursor-pointer items-center rounded-lg px-3 py-2 text-sm font-medium text-secondary-foreground outline-none hover:text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
        Show the numbers behind the chart
      </summary>
      <div className="overflow-x-auto px-1 pb-2">
        <table className="w-full text-sm">
          <caption className="sr-only">Focus time per {bucketNoun}, {rangeName}</caption>
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className={headBase}>{bucketNoun === "hour" ? "Hour" : "Day"}</th>
              <th scope="col" className={headBase}>Focus time</th>
              <th scope="col" className={headBase}>Sessions</th>
            </tr>
          </thead>
          <tbody>
            {result.buckets.map((bucket) => (
              <tr key={bucket.key} className="border-b border-border last:border-b-0">
                <th scope="row" className={`${cellBase} font-normal`}>{bucket.label}</th>
                <td className={`${cellBase} tabular-nums`}>{formatFocusTime(bucket.focusMs)}</td>
                <td className={`${cellBase} tabular-nums`}>{bucket.sessionCount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}

export function BreakdownTable({ result, rangeName }: Pick<StatsTableProps, "result" | "rangeName">) {
  return (
    <div className="overflow-x-auto rounded-lg border border-border bg-card">
      <table className="w-full text-sm">
        <caption className="sr-only">Focus time by task, {rangeName}</caption>
        <thead>
          <tr className="border-b border-border">
            <th scope="col" className={headBase}>Task</th>
            <th scope="col" className={headBase}>Focus time</th>
            <th scope="col" className={headBase}>Sessions</th>
          </tr>
        </thead>
        <tbody>
          {result.breakdown.map((entry) => (
            <tr key={entry.taskId ?? "none"} className="border-b border-border last:border-b-0">
              <th scope="row" className={`${cellBase} break-words font-normal`}>{entry.label}</th>
              <td className={`${cellBase} tabular-nums`}>{formatFocusTime(entry.focusMs)}</td>
              <td className={`${cellBase} tabular-nums`}>{entry.sessionCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
