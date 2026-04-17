'use client'

import { useCallback, useRef } from 'react'

/**
 * 단일 AudioContext + AnalyserNode를 lazy 생성하고,
 * HTMLAudioElement를 AnalyserNode에 연결한다.
 * MediaElementSource는 요소당 한 번만 만들 수 있으므로 WeakSet으로 중복 방지.
 */
export function useAudioAnalyser() {
  const ctxRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const connectedRef = useRef<WeakSet<HTMLAudioElement>>(new WeakSet())

  const ensure = useCallback(() => {
    if (typeof window === 'undefined') return null
    if (!ctxRef.current) {
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return null
      const ctx = new Ctor()
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 256
      analyser.smoothingTimeConstant = 0.78
      analyser.connect(ctx.destination)
      ctxRef.current = ctx
      analyserRef.current = analyser
    }
    return { ctx: ctxRef.current, analyser: analyserRef.current! }
  }, [])

  /**
   * audio 엘리먼트를 analyser 그래프에 연결.
   * 반드시 user gesture 흐름 안에서 호출 (iOS Safari 정책).
   */
  const connect = useCallback(
    (audio: HTMLAudioElement) => {
      const pair = ensure()
      if (!pair) return
      const { ctx, analyser } = pair
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {})
      }
      if (!connectedRef.current.has(audio)) {
        try {
          const src = ctx.createMediaElementSource(audio)
          src.connect(analyser)
          connectedRef.current.add(audio)
        } catch {
          // 이미 연결돼 있거나 CORS taint 등으로 실패 — 무시 (시각화만 정적이 됨)
        }
      }
    },
    [ensure]
  )

  /** user gesture에서 즉시 호출해 AudioContext를 깨움 (iOS Safari) */
  const unlock = useCallback(() => {
    const pair = ensure()
    if (!pair) return
    if (pair.ctx.state === 'suspended') {
      pair.ctx.resume().catch(() => {})
    }
  }, [ensure])

  return { analyserRef, connect, unlock }
}
