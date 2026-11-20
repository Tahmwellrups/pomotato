'use client'

import Link from 'next/link'
import { BackgroundControl } from '@/components/BackgroundControl'
import { ChimeSettings } from '@/components/ChimeSettings'
import { GaugeSettings } from '@/components/GaugeSettings'
import { SessionLengths } from '@/components/SessionLengths'
import { Button } from './ui/button'

const linkClass =
  'inline-flex min-h-11 items-center text-sm font-medium text-primary underline underline-offset-4 outline-none transition-colors hover:text-accent-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring motion-reduce:transition-none'

export function SettingsPanel() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-8 px-4 py-8 sm:px-8 sm:py-12">
      <header className="flex flex-col items-start gap-1">
        <Button asChild variant="link" size="sm">
          <Link href="/">
            Back to the timer
          </Link>
        </Button>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">
          Settings
        </h1>
      </header>

      <SessionLengths />

      <ChimeSettings />

      <GaugeSettings />

      <BackgroundControl />
    </main>
  )
}
