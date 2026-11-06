import React from 'react'
import { TaskPanelToggle } from '@/components/TaskPanelToggle'
import { SoundscapeDialog } from '@/components/SoundscapeDialog'
import { StatsButton } from '@/components/StatsButton'
import { SettingsButton } from '@/components/SettingsButton'

// Below lg it is ordinary content at the end of <main>: a viewport-pinned
// cluster covers the timer controls on a phone, and padding cannot help
// because it reserves room at the end of the document while the cluster sits
// at the bottom of the viewport at every scroll position. From lg up there is
// room beside the column, so it is pinned bottom-right and app/page.tsx
// reserves matching bottom padding on <main> at that same breakpoint; the two
// have to move together or the cluster covers the end of the content. It is
// last in <main> in the DOM, so flow placement leaves the tab order alone.
export function BottomControls() {
  return (
    <div className="flex items-center justify-center gap-2 lg:fixed lg:right-0 lg:bottom-0 lg:z-10 lg:p-4 lg:pr-12 lg:pb-12">
      <TaskPanelToggle />
      <SoundscapeDialog />
      <StatsButton />
      <SettingsButton />
    </div>
  )
}
