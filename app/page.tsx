import { BackgroundLayer } from "@/components/BackgroundLayer";
import { CurrentTaskCard } from "@/components/CurrentTaskCard";
import { PomotatoTimer } from "@/components/PomotatoTimer";
import { BottomControls } from "@/widgets/BottomControls";
import { HeaderNav } from "@/widgets/HeaderNav";

export default function Home() {
  return (
    <>
      <BackgroundLayer />
      <main className="flex flex-1 flex-col items-center gap-10 px-4 pt-12 pb-28 sm:px-12">
        <HeaderNav />
        <div className="flex w-full max-w-md flex-col items-center gap-4">
          <CurrentTaskCard />
          <PomotatoTimer />
        </div>
        <BottomControls />
      </main>
    </>
  )
}
