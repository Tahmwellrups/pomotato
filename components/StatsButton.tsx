import React from 'react'
import Link from 'next/link'
import { Button } from './ui/button'
import { RiBarChart2Fill } from 'react-icons/ri'

export function StatsButton() {
  return (
    <div>
      <Button
        asChild
        variant="secondary"
        className="size-11 rounded-xl border-control-border text-base cursor-pointer motion-reduce:transition-none focus-visible:transition-none focus-visible:ring-0 focus-visible:border-control-border focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      >
        <Link
          href="/stats"
          aria-label="Focus stats"
          className="flex items-center"
        >
          <RiBarChart2Fill className="size-4.5" />
        </Link>
      </Button>
    </div>
  )
}
