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
        className="size-11 rounded-xl border-control-border text-base cursor-pointer motion-reduce:transition-none"
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
