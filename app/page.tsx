import { BackgroundLayer } from '@/components/BackgroundLayer'
import { CurrentTaskCard } from '@/components/CurrentTaskCard'
import { PomotatoTimer } from '@/components/PomotatoTimer'
import { Surface } from '@/components/Surface'
import { BottomControls } from '@/widgets/BottomControls'
import { HeaderNav } from '@/widgets/HeaderNav'
import { TaskPanel } from '@/widgets/TaskPanel'

export default function Home() {
  return (
    <>
      <BackgroundLayer />
      <main className="flex flex-1 flex-col items-center gap-3 px-4 pt-4 pb-12 sm:gap-6 sm:pt-12 lg:pb-28 sm:px-12">
        <HeaderNav />
        <div className='flex flex-col w-full h-full items-center justify-center gap-4'>
          <CurrentTaskCard />
          <PomotatoTimer />
        </div>
        <TaskPanel />
        <BottomControls />
      </main>
    </>
  )
}
