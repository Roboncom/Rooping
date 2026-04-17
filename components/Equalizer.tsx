'use client'

import { RefObject, useEffect, useRef } from 'react'

/**
 * 실시간 주파수 스펙트럼 바 이퀄라이저.
 * analyserRef가 유효한 데이터를 주면 그걸 쓰고,
 * 모바일/CORS/iOS 등으로 0만 돌아오면 sin 기반 폴백 애니메이션.
 */
export function Equalizer({
  isPlaying,
  analyserRef,
  bars = 32,
}: {
  isPlaying: boolean
  analyserRef?: RefObject<AnalyserNode | null>
  bars?: number
}) {
  const barRefs = useRef<(HTMLDivElement | null)[]>([])
  const rafRef = useRef<number>(0)
  const dataRef = useRef<Uint8Array<ArrayBuffer>>(new Uint8Array(new ArrayBuffer(0)))

  useEffect(() => {
    const render = () => {
      const analyser = analyserRef?.current ?? null
      let haveRealData = false
      if (analyser) {
        if (dataRef.current.length !== analyser.frequencyBinCount) {
          dataRef.current = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount))
        }
        analyser.getByteFrequencyData(dataRef.current)
        // 무음 감지: 전구간 합이 미미하면 폴백으로
        let sum = 0
        for (let i = 0; i < dataRef.current.length; i++) sum += dataRef.current[i]
        haveRealData = sum > 8
      }

      if (haveRealData) {
        // 음성 대역 중심(bin 2 ~ 78% 구간)
        const binCount = dataRef.current.length
        const startBin = 2
        const endBin = Math.max(startBin + bars, Math.floor(binCount * 0.78))
        const usable = endBin - startBin
        for (let i = 0; i < bars; i++) {
          const el = barRefs.current[i]
          if (!el) continue
          if (isPlaying) {
            const bin = startBin + Math.floor((i * usable) / bars)
            const v = dataRef.current[bin] || 0
            const pct = Math.min(100, 8 + (v / 255) * 120)
            el.style.height = `${pct}%`
          } else {
            el.style.height = '7%'
          }
        }
      } else {
        // sin 기반 폴백 (분석기 무응답이거나 analyser 없음)
        const t = performance.now() / 1000
        for (let i = 0; i < bars; i++) {
          const el = barRefs.current[i]
          if (!el) continue
          if (isPlaying) {
            // 여러 주파수를 겹쳐 자연스러운 흔들림
            const v =
              30 +
              Math.abs(Math.sin(t * 2.4 + i * 0.42)) * 35 +
              Math.abs(Math.sin(t * 3.7 + i * 0.27)) * 25
            el.style.height = `${Math.min(100, v)}%`
          } else {
            el.style.height = '7%'
          }
        }
      }
      rafRef.current = requestAnimationFrame(render)
    }
    rafRef.current = requestAnimationFrame(render)
    return () => cancelAnimationFrame(rafRef.current)
  }, [isPlaying, analyserRef, bars])

  return (
    <div className="flex items-end justify-center gap-[3px] h-14">
      {Array.from({ length: bars }).map((_, i) => (
        <div
          key={i}
          ref={el => { barRefs.current[i] = el }}
          className="w-[3px] rounded-full"
          style={{
            height: '7%',
            backgroundColor: `rgba(156, 204, 101, ${0.4 + (i / bars) * 0.55})`,
            transition: 'height 50ms linear',
          }}
        />
      ))}
    </div>
  )
}
