'use client'

import { RefObject, useEffect, useRef } from 'react'

/**
 * 실시간 주파수 스펙트럼 바 이퀄라이저.
 * analyserRef가 연결돼 있으면 AnalyserNode의 getByteFrequencyData를 RAF로 읽어
 * 각 바의 높이를 실제 음파 데이터로 갱신한다.
 * analyser 없으면 아이들 상태(바닥 ambient)만 표시.
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
      if (analyser) {
        if (dataRef.current.length !== analyser.frequencyBinCount) {
          dataRef.current = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount))
        }
        analyser.getByteFrequencyData(dataRef.current)

        // 음성 대역(대략 80~4kHz)에 해당하는 bin 위주로 골라 시각화
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
            // 0~255 → 8~100% (감도 약간 부스트)
            const pct = Math.min(100, 8 + (v / 255) * 120)
            el.style.height = `${pct}%`
          } else {
            // 멈춤 상태 — 바닥 ambient로 서서히 복귀
            el.style.height = '7%'
          }
        }
      } else {
        // Analyser 없을 때 폴백 애니메이션
        const t = performance.now() / 1000
        for (let i = 0; i < bars; i++) {
          const el = barRefs.current[i]
          if (!el) continue
          if (isPlaying) {
            const v = 28 + Math.abs(Math.sin(t * 2.2 + i * 0.45)) * 60
            el.style.height = `${v}%`
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
            transition: 'height 30ms linear',
          }}
        />
      ))}
    </div>
  )
}
