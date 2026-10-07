import { CurrentTaskCard } from "@/components/CurrentTaskCard";
import { PomotatoTimer } from "@/components/PomotatoTimer";
import { TaskList } from "@/components/TaskList";

export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center gap-10 px-4 py-12 sm:px-8">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight text-stone-900">Pomotato</h1>
        <p className="mt-1 text-sm text-stone-600">A cozy focus timer.</p>
      </div>
      <div className="flex w-full max-w-5xl flex-col items-center gap-10 lg:flex-row lg:items-start lg:justify-center">
        <div className="flex w-full max-w-md shrink-0 flex-col items-center gap-8">
          <PomotatoTimer />
          <CurrentTaskCard />
        </div>
        <div className="w-full max-w-xl">
          <TaskList />
        </div>
      </div>
    </main>
  );
}
