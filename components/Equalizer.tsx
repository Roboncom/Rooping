'use client'

import { useEffect, useState } from 'react'

export function Equalizer({ isPlaying, bars = 14 }: { isPlaying: boolean; bars?: number }) {
  const [tick, setTick] = useState(0)

  useEffect(() => {
    if (!isPlaying) return
    const id = setInterval(() => setTick(t => t + 1), 110)
    return () => clearInterval(id)
  }, [isPlaying])

  return (
    <div className="flex items-end justify-center gap-[3px] h-14">
      {Array.from({ length: bars }).map((_, i) => {
        const rand = isPlaying
          ? 20 + Math.abs(Math.sin(tick * 0.9 + i * 0.7)) * 80
          : 12
        return (
          <div
            key={i}
            className="w-[3px] rounded-full"
            style={{
              height: `${rand}%`,
              backgroundColor: `rgba(52, 211, 153, ${0.35 + (i / bars) * 0.55})`,
              transition: isPlaying ? 'height 140ms ease' : 'height 400ms ease',
            }}
          />
        )
      })}
    </div>
  )
}
