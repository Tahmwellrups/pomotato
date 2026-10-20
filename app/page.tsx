import Link from "next/link";
import { CurrentTaskCard } from "@/components/CurrentTaskCard";
import { PomotatoTimer } from "@/components/PomotatoTimer";
import { TaskListDialog } from "@/components/TaskListDialog";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center gap-10 px-4 py-12 sm:px-8">
      {/* <div className="text-center">
        <h1 className="font-heading text-2xl font-semibold tracking-tight text-stone-900">Pomotato</h1>
        <p className="mt-1 text-sm text-stone-600">A cozy focus timer.</p>
      </div> */}
      <div className="flex w-full max-w-md flex-col items-center gap-8">
        <CurrentTaskCard />
        <PomotatoTimer />
        <div className="flex w-full flex-col items-center gap-4">
          <TaskListDialog />
        </div>
      </div>
      <Link
        href="/stats"
        className="inline-flex min-h-11 items-center px-2 text-sm font-medium text-primary underline underline-offset-4 outline-none transition-colors hover:text-accent-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none"
      >
        Focus stats
      </Link>
    </main>
  )
}
