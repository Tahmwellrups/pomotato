import { BackgroundLayer } from "@/components/BackgroundLayer";
import { CurrentTaskCard } from "@/components/CurrentTaskCard";
import { PomotatoTimer } from "@/components/PomotatoTimer";
import { Surface } from "@/components/Surface";
import { BottomControls } from "@/widgets/BottomControls";
import { HeaderNav } from "@/widgets/HeaderNav";
import { TaskPanel } from "@/widgets/TaskPanel";

export default function Home() {
  return (
    <>
      <BackgroundLayer />
      <main className="flex flex-1 flex-col items-center gap-3 px-4 pt-4 pb-12 sm:gap-6 sm:pt-12 lg:pb-28 sm:px-12">
        <HeaderNav />
        <Surface kind="frosted" className="flex w-full max-w-md flex-col items-center gap-2 p-2 sm:gap-4 sm:p-6">
          <CurrentTaskCard />
          <PomotatoTimer />
        </Surface>
        <TaskPanel />
        <BottomControls />
      </main>
    </>
  )
}
