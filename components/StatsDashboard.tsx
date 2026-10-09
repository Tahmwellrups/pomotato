"use client";

import { useState } from "react";
import Link from "next/link";
import { useStats } from "@/hooks/use-stats";
import type { StatsResult, StatsView } from "@/lib/stats";
import { formatFocusTime } from "./format-focus-time";
import { StatsChart } from "./StatsChart";
import { StatsViewSwitcher } from "./StatsViewSwitcher";
import { BreakdownTable, BucketTable } from "./StatsTables";

const VIEW_COPY: Record<StatsView, { heading: string; rangeName: string; bucketNoun: string; chartLabel: string }> = {
  day: { heading: "Today", rangeName: "today", bucketNoun: "hour", chartLabel: "Focus time per hour today" },
  week: { heading: "This week", rangeName: "this week", bucketNoun: "day", chartLabel: "Focus time per day this week, Monday to Sunday" },
  month: { heading: "This month", rangeName: "this month", bucketNoun: "day", chartLabel: "Focus time per day this month" },
};

const linkClass =
  "inline-flex min-h-11 items-center text-sm font-medium text-primary underline underline-offset-4 outline-none transition-colors hover:text-accent-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none";

export function StatsDashboard() {
  const [view, setView] = useState<StatsView>("day");
  const query = useStats();

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-8 sm:px-8 sm:py-12">
      <header className="flex flex-col items-start gap-1">
        <Link href="/" className={linkClass}>
          Back to the timer
        </Link>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Focus stats</h1>
      </header>

      {query.status === "loading" ? (
        <p role="status" className="text-secondary-foreground">
          Loading your focus time...
        </p>
      ) : query.status === "error" ? (
        <ErrorNotice blocked={query.blocked} />
      ) : (
        <>
          <StatsViewSwitcher value={view} onChange={setView} />
          <StatsPanel result={query.views[view]} view={view} />
        </>
      )}
    </main>
  );
}

function ErrorNotice({ blocked }: { blocked: boolean }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-lg border border-destructive bg-card p-4">
      <p>
        {blocked
          ? "Pomotato can't open its data because another Pomotato tab is still using an older version. Close other Pomotato tabs, then try again."
          : "Pomotato couldn't read your sessions. They live in this browser's storage, so check that private browsing or a storage setting isn't blocking it, then try again."}
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="min-h-11 rounded-lg bg-primary px-5 py-2 font-medium text-primary-foreground outline-none transition-colors hover:bg-accent-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none"
      >
        Try again
      </button>
    </div>
  );
}

function StatsPanel({ result, view }: { result: StatsResult; view: StatsView }) {
  const copy = VIEW_COPY[view];
  const sessionLabel = result.totalSessionCount === 1 ? "focus session" : "focus sessions";

  return (
    <section aria-labelledby="stats-range-heading" className="flex flex-col gap-8">
      <div>
        <h2 id="stats-range-heading" className="font-heading text-lg font-semibold">
          {copy.heading}
        </h2>
        <p className="mt-2 text-4xl font-semibold tabular-nums">
          {formatFocusTime(result.totalFocusMs)}
          <span className="ml-2 text-base font-normal text-secondary-foreground">focus time</span>
        </p>
        <p className="mt-1 text-secondary-foreground">
          <span className="tabular-nums">{result.totalSessionCount}</span> {sessionLabel}
        </p>
      </div>

      {result.isEmpty ? (
        <p className="rounded-lg border border-border bg-card p-4">
          Nothing logged {copy.rangeName} yet. The next focus session you finish on the timer will show up here, whenever you get to it.
        </p>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            <StatsChart result={result} description={copy.chartLabel} />
            <BucketTable result={result} bucketNoun={copy.bucketNoun} rangeName={copy.rangeName} />
          </div>
          <div className="flex flex-col gap-3">
            <h3 className="font-heading text-lg font-semibold">By task</h3>
            <BreakdownTable result={result} rangeName={copy.rangeName} />
          </div>
        </>
      )}
    </section>
  );
}
