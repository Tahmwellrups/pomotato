import React from 'react'
import { TaskListDialog } from '@/components/TaskListDialog'
import { SoundscapeDialog } from '@/components/SoundscapeDialog'
import { StatsButton } from '@/components/StatsButton'
import { SettingsButton } from '@/components/SettingsButton'

// Pinned to the viewport, so it floats over the page instead of sitting in
// flow. app/page.tsx reserves matching bottom padding on <main> — the two have
// to move together or this cluster covers the end of the content.
export function BottomControls() {
  return (
    <div className="fixed right-0 bottom-0 z-10 flex items-center gap-2 p-4 lg:pb-12 sm:pr-12">
      <TaskListDialog />
      <SoundscapeDialog />
      <StatsButton />
      <SettingsButton />
    </div>
  )
}
