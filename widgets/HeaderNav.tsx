import React from 'react'
import { ThemeControl } from '@/components/ThemeControl'

export function HeaderNav() {
  return (
    <div className="flex w-full max-w-full flex-row flex-wrap items-center justify-between gap-x-4">
      <div className="flex max-w-full flex-row items-center gap-2">
        <h1 className="relative align-left font-space-grotesk text-4xl font-bold tracking-tight text-primary">
          pomotato
        </h1>
      </div>
      <ThemeControl />
    </div>
  )
}
