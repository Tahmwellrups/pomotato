import React from 'react'
import Link from 'next/link'
import { Button } from './ui/button'
import { RiBarChart2Fill } from 'react-icons/ri'

const StatsButton = () => {
  return (
    <div>
      <Button asChild>
        <Link
          href="/stats"
          className={`flex h-9 w-9 rounded-xl border-none bg-neutral-200 items-center text-base cursor-pointer hover:bg-muted motion-reduce:transition-none`}
        >
          <RiBarChart2Fill className="size-4.5" />
        </Link>
      </Button>
    </div>
  )
}

export default StatsButton
