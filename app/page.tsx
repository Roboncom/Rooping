'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { Passage, Settings, Voice } from '@/lib/types'
import { SAMPLE_PASSAGES } from '@/lib/sample'
import { Logo } from '@/components/Logo'
import { Equalizer } from '@/components/Equalizer'
import { TimerRing } from '@/components/TimerRing'

const STORAGE_KEYS = {
  passages: 'rooping.passages.v2',
  currentId: 'rooping.currentId.v2',
  settings: 'rooping.settings.v3',
}

const DEFAULT_SETTINGS: Settings = {
  repeatCount: 300,
  speed: 1.0,
  voice: 'ash',
}

const REPEAT_OPTIONS = [1, 2, 3, 5, 10, 20, 50, 100, 300, 500, 1000]
const SPEED_OPTIONS = [0.7, 0.85, 1.0, 1.15, 1.3, 1.5]
const VOICE_OPTIONS: Voice[] = [
  'alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer', 'verse',
]

const uid = () => Math.random().toString(36).slice(2, 10)

const truncateTitle = (content: string, max = 40) => {
  const t = content.trim().replace(/\s+/g, ' ')
  return t.length > max ? t.slice(0, max) + '…' : t
}

const ttsUrl = (text: string, voice: Voice, speed: number) => {
  const u = new URL('/api/tts', window.location.origin)
  u.searchParams.set('text', text)
  u.searchParams.set('voice', voice)
  u.searchParams.set('speed', String(speed))
  return u.toString()
}

export default function Home() {
  const [passages, setPassages] = useState<Passage[]>(SAMPLE_PASSAGES)
  const [currentId, setCurrentId] = useState<string>(SAMPLE_PASSAGES[0]?.id ?? '')
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)

  const [isPlaying, setIsPlaying] = useState(false)
  const [currentRepeat, setCurrentRepeat] = useState(0)

  // 기본 화면 = 입력 에디터 열림
  const [editTargetId, setEditTargetId] = useState<string | null>('')
  const [editText, setEditText] = useState('')

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const cancelRef = useRef(false)

  const currentPassage =
    passages.find(p => p.id === currentId) ?? passages[0] ?? null
  const currentIndex = passages.findIndex(p => p.id === currentId)

  // ===== localStorage =====
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEYS.passages)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) setPassages(parsed)
      }
      const savedId = localStorage.getItem(STORAGE_KEYS.currentId)
      if (savedId) setCurrentId(savedId)
      const s = localStorage.getItem(STORAGE_KEYS.settings)
      if (s) {
        const parsed = JSON.parse(s)
        setSettings(x => ({ ...x, ...parsed }))
      }
    } catch {}
  }, [])
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEYS.passages, JSON.stringify(passages)) } catch {}
  }, [passages])
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEYS.currentId, currentId) } catch {}
  }, [currentId])
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings)) } catch {}
  }, [settings])

  useEffect(() => {
    if (passages.length === 0) { setCurrentId(''); return }
    if (!passages.some(p => p.id === currentId)) setCurrentId(passages[0].id)
  }, [passages, currentId])

  // ===== 재생 =====
  const stopAudio = useCallback(() => {
    cancelRef.current = true
    if (audioRef.current) {
      audioRef.current.onended = null
      audioRef.current.onerror = null
      audioRef.current.pause()
      audioRef.current.src = ''
      audioRef.current = null
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }
    setIsPlaying(false)
    setCurrentRepeat(0)
  }, [])

  const speakOnce = useCallback(
    (text: string, voice: Voice, speed: number): Promise<void> => {
      return new Promise(resolve => {
        if (cancelRef.current) { resolve(); return }
        try {
          const url = ttsUrl(text, voice, speed)
          const audio = new Audio(url)
          audio.preload = 'auto'
          audioRef.current = audio
          setIsPlaying(true)
          audio.onended = () => { setIsPlaying(false); resolve() }
          audio.onerror = () => {
            // 네트워크/API 실패 → Web Speech 폴백
            setIsPlaying(false)
            if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
              const u = new SpeechSynthesisUtterance(text)
              u.lang = /[\uAC00-\uD7AF]/.test(text) ? 'ko-KR' : 'en-US'
              u.rate = speed
              u.onend = () => resolve()
              u.onerror = () => resolve()
              window.speechSynthesis.speak(u)
              return
            }
            resolve()
          }
          audio.play().catch(() => { setIsPlaying(false); resolve() })
        } catch {
          setIsPlaying(false)
          resolve()
        }
      })
    },
    []
  )

  const playCurrent = useCallback(async (passage?: Passage) => {
    const p = passage ?? currentPassage
    if (!p || !p.content.trim()) return
    cancelRef.current = false
    for (let i = 0; i < settings.repeatCount; i++) {
      if (cancelRef.current) break
      setCurrentRepeat(i + 1)
      await speakOnce(p.content, settings.voice, settings.speed)
      if (cancelRef.current) break
      if (i < settings.repeatCount - 1) {
        await new Promise(r => setTimeout(r, 300))
      }
    }
    setCurrentRepeat(0)
  }, [currentPassage, settings.repeatCount, settings.speed, settings.voice, speakOnce])

  // ===== Navigation =====
  const goNext = () => {
    if (passages.length === 0) return
    stopAudio()
    const nextIdx = (currentIndex + 1) % passages.length
    setCurrentId(passages[nextIdx].id)
  }
  const goPrev = () => {
    if (passages.length === 0) return
    stopAudio()
    const prevIdx = (currentIndex - 1 + passages.length) % passages.length
    setCurrentId(passages[prevIdx].id)
  }
  const selectPassage = (id: string) => {
    stopAudio()
    setEditTargetId(null)
    setCurrentId(id)
  }

  // ===== Keyboard =====
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (editTargetId !== null) return
      const t = e.target as HTMLElement
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT')) return
      if (e.code === 'Space') {
        e.preventDefault()
        if (isPlaying) stopAudio(); else playCurrent()
      } else if (e.code === 'ArrowLeft') goPrev()
      else if (e.code === 'ArrowRight') goNext()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editTargetId, isPlaying, playCurrent, currentId, passages.length])

  // ===== 편집/입력 =====
  const openNew = () => {
    stopAudio()
    setEditTargetId('')
    setEditText('')
  }
  const openEdit = (id: string) => {
    stopAudio()
    setEditTargetId(id)
    setEditText(passages.find(p => p.id === id)?.content ?? '')
  }
  const closeEditor = () => {
    setEditTargetId(null)
    setEditText('')
  }

  const handlePaste = async () => {
    try {
      const txt = await navigator.clipboard.readText()
      if (txt) setEditText(prev => (prev ? prev + '\n' : '') + txt)
    } catch {
      // 권한 거부나 HTTPS가 아닌 경우 — 조용히 무시, 사용자가 수동 붙여넣기
    }
  }

  const handlePlay = () => {
    const content = editText.trim()
    if (!content) return
    const now = Date.now()
    let targetId: string
    let saved: Passage
    if (editTargetId) {
      saved = {
        ...(passages.find(p => p.id === editTargetId) as Passage),
        content,
        updatedAt: now,
      }
      setPassages(prev => prev.map(p => (p.id === editTargetId ? saved! : p)))
      targetId = editTargetId
    } else {
      targetId = uid()
      saved = { id: targetId, content, createdAt: now, updatedAt: now }
      setPassages(prev => [saved!, ...prev])
    }
    setCurrentId(targetId)
    closeEditor()
    // 저장 직후 자동 재생
    setTimeout(() => playCurrent(saved!), 60)
  }

  const handleDelete = (id: string) => {
    if (!confirm('이 글을 삭제할까요?')) return
    setPassages(prev => prev.filter(p => p.id !== id))
    if (currentId === id) setCurrentId('')
  }

  const hasNoPassages = passages.length === 0

  return (
    <main className="min-h-[100dvh] text-[var(--color-text)] relative noise-overlay overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-0 opacity-60"
        style={{
          background:
            'radial-gradient(600px circle at 15% 0%, rgba(52,211,153,0.10), transparent 60%), radial-gradient(500px circle at 90% 100%, rgba(134,239,172,0.06), transparent 60%)',
        }}
      />

      <div className="relative z-10 max-w-xl mx-auto px-3 sm:px-4 py-4 sm:py-8 min-h-[100dvh] flex flex-col safe-top safe-bottom">
        {/* Header */}
        <header className="flex items-center justify-between mb-5">
          <Logo />
          <div className="flex items-center gap-2">
            {editTargetId === null && passages.length > 0 && (
              <button
                onClick={openNew}
                className="flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold
                  text-[var(--color-accent)] border border-dashed border-[var(--color-border-hover)]
                  hover:bg-[var(--color-accent-soft)] transition-all active:scale-95 no-select"
                title="새 글 입력"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                입력
              </button>
            )}
          </div>
        </header>

        {/* Editor */}
        {editTargetId !== null && (
          <div className="mb-4 animate-fade-in-up">
            <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 sm:p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold">
                    {editTargetId ? '수정' : '입력'}
                  </h3>
                  <span className="text-[10px] font-mono text-[var(--color-text-muted)]">
                    {editText.trim().length}
                  </span>
                </div>
                <button
                  onClick={handlePaste}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs
                    border border-[var(--color-border)] text-[var(--color-text-muted)]
                    hover:text-[var(--color-accent)] hover:border-[var(--color-accent)]
                    hover:bg-[var(--color-accent-soft)] transition-all active:scale-95 no-select"
                  title="클립보드에서 붙여넣기"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
                    <rect x="8" y="2" width="8" height="4" rx="1" />
                  </svg>
                  복붙
                </button>
              </div>
              <textarea
                value={editText}
                onChange={e => setEditText(e.target.value)}
                rows={9}
                autoFocus
                className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl p-3 text-base
                  focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]
                  resize-none leading-relaxed"
              />
              <div className="flex gap-2 mt-3">
                <button
                  onClick={handlePlay}
                  disabled={!editText.trim()}
                  className="flex-1 px-4 py-3 rounded-xl text-base font-semibold
                    bg-[var(--color-accent)] text-[var(--color-bg)] hover:bg-[var(--color-accent-hover)]
                    active:scale-[0.98] transition-all shadow-[var(--shadow-glow)]
                    disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  플레이
                </button>
                <button
                  onClick={closeEditor}
                  className="px-4 py-3 rounded-xl text-sm border border-[var(--color-border)]
                    hover:bg-[var(--color-surface-hover)] transition-colors"
                >
                  취소
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Card */}
        {editTargetId !== null ? (
          <div className="flex-1 min-h-0" />
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center min-h-0">
            {hasNoPassages ? (
              <div className="w-full rounded-2xl border border-dashed border-[var(--color-border)] p-10 text-center text-[var(--color-text-muted)]">
                <p className="text-sm mb-3">저장된 글이 없어요.</p>
                <button
                  onClick={openNew}
                  className="text-[var(--color-accent)] text-sm underline underline-offset-4"
                >
                  새 글 입력하기
                </button>
              </div>
            ) : currentPassage ? (
              <div
                key={currentPassage.id}
                className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]
                  p-5 sm:p-7 relative overflow-hidden
                  hover:border-[var(--color-border-hover)] hover:shadow-[var(--shadow-glow)]
                  transition-all duration-300 animate-fade-in-up"
              >
                <div className="absolute top-3 right-3 flex items-center gap-1.5">
                  {currentRepeat > 0 && (
                    <div className="relative w-10 h-10">
                      <TimerRing progress={currentRepeat / settings.repeatCount} size={40} stroke={2.5} />
                      <span className="absolute inset-0 flex items-center justify-center text-[11px] font-mono text-[var(--color-accent)]">
                        {currentRepeat}
                      </span>
                    </div>
                  )}
                  <button
                    onClick={() => openEdit(currentPassage.id)}
                    aria-label="수정"
                    title="수정"
                    className="p-1.5 rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-surface-hover)] transition-colors"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                    </svg>
                  </button>
                  <button
                    onClick={() => handleDelete(currentPassage.id)}
                    aria-label="삭제"
                    title="삭제"
                    className="p-1.5 rounded-md text-[var(--color-text-muted)] hover:text-[var(--color-error)] hover:bg-[var(--color-surface-hover)] transition-colors"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6" />
                      <path d="M10 11v6M14 11v6" />
                    </svg>
                  </button>
                </div>

                <div className="pt-10 pb-2">
                  <div className="max-h-[40dvh] sm:max-h-[48dvh] overflow-y-auto pr-1 -mr-1">
                    <p className="font-[var(--font-display)] text-lg sm:text-2xl leading-relaxed whitespace-pre-wrap break-words">
                      {currentPassage.content}
                    </p>
                  </div>
                  <div className="my-4 sm:my-5">
                    <Equalizer isPlaying={isPlaying} />
                  </div>
                </div>
              </div>
            ) : null}

            {/* Controls */}
            <div className="flex items-center justify-center gap-4 sm:gap-5 mt-5 sm:mt-7 no-select">
              <button
                onClick={goPrev}
                aria-label="이전"
                disabled={passages.length < 2}
                className="w-14 h-14 sm:w-12 sm:h-12 flex items-center justify-center rounded-2xl border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)]
                  hover:border-[var(--color-border-hover)] transition-all active:scale-95 disabled:opacity-25 disabled:cursor-not-allowed"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>
              <button
                onClick={() => { if (isPlaying) stopAudio(); else playCurrent() }}
                disabled={!currentPassage}
                aria-label={isPlaying ? '정지' : '재생'}
                className="w-20 h-20 sm:w-[68px] sm:h-[68px] flex items-center justify-center rounded-full bg-[var(--color-accent)] text-[var(--color-bg)] hover:bg-[var(--color-accent-hover)]
                  active:scale-95 transition-all shadow-[var(--shadow-glow)]
                  hover:shadow-[var(--shadow-glow-lg)] disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isPlaying ? (
                  <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="6" y="5" width="4" height="14" rx="1.5" />
                    <rect x="14" y="5" width="4" height="14" rx="1.5" />
                  </svg>
                ) : (
                  <svg width="30" height="30" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </button>
              <button
                onClick={goNext}
                aria-label="다음"
                disabled={passages.length < 2}
                className="w-14 h-14 sm:w-12 sm:h-12 flex items-center justify-center rounded-2xl border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)]
                  hover:border-[var(--color-border-hover)] transition-all active:scale-95 disabled:opacity-25 disabled:cursor-not-allowed"
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 18l6-6-6-6" />
                </svg>
              </button>
            </div>
          </div>
        )}

        {/* Settings bar: 반복 / 배속 / 목소리 */}
        <div className="mt-5 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/80 backdrop-blur-sm p-3 sm:p-4">
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {/* 반복 */}
            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] font-mono">반복</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setSettings(s => {
                    const i = REPEAT_OPTIONS.indexOf(s.repeatCount)
                    return { ...s, repeatCount: REPEAT_OPTIONS[Math.max(0, i - 1)] ?? s.repeatCount }
                  })}
                  className="w-7 h-9 flex items-center justify-center rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] active:scale-95 transition-all"
                >−</button>
                <div className="flex-1 h-9 flex items-center justify-center rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] text-sm font-semibold text-[var(--color-accent)]">
                  {settings.repeatCount}
                </div>
                <button
                  onClick={() => setSettings(s => {
                    const i = REPEAT_OPTIONS.indexOf(s.repeatCount)
                    return { ...s, repeatCount: REPEAT_OPTIONS[Math.min(REPEAT_OPTIONS.length - 1, i + 1)] ?? s.repeatCount }
                  })}
                  className="w-7 h-9 flex items-center justify-center rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] active:scale-95 transition-all"
                >+</button>
              </div>
            </div>
            {/* 배속 */}
            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] font-mono">배속</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setSettings(s => {
                    const i = SPEED_OPTIONS.indexOf(s.speed)
                    return { ...s, speed: SPEED_OPTIONS[Math.max(0, i - 1)] ?? s.speed }
                  })}
                  className="w-7 h-9 flex items-center justify-center rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] active:scale-95 transition-all"
                >−</button>
                <div className="flex-1 h-9 flex items-center justify-center rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] text-sm font-semibold text-[var(--color-accent)]">
                  {settings.speed}x
                </div>
                <button
                  onClick={() => setSettings(s => {
                    const i = SPEED_OPTIONS.indexOf(s.speed)
                    return { ...s, speed: SPEED_OPTIONS[Math.min(SPEED_OPTIONS.length - 1, i + 1)] ?? s.speed }
                  })}
                  className="w-7 h-9 flex items-center justify-center rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] active:scale-95 transition-all"
                >+</button>
              </div>
            </div>
            {/* 목소리 */}
            <div className="flex flex-col gap-1">
              <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] font-mono">목소리</span>
              <div className="relative h-9">
                <select
                  value={settings.voice}
                  onChange={e => setSettings(s => ({ ...s, voice: e.target.value as Voice }))}
                  className="w-full h-9 appearance-none bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-3 text-sm font-semibold text-[var(--color-accent)] focus:border-[var(--color-accent)] focus:outline-none capitalize"
                >
                  {VOICE_OPTIONS.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
                <svg className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </div>
            </div>
          </div>
        </div>

        {/* 반복이력 */}
        {passages.length > 0 && (
          <section className="mt-5">
            <div className="flex items-center justify-between mb-2 px-1">
              <h3 className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] font-mono">반복이력</h3>
              <span className="text-[10px] text-[var(--color-text-muted)] font-mono">{passages.length}개</span>
            </div>
            <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1 -mr-1">
              {passages.map(p => {
                const isActive = currentId === p.id && editTargetId === null
                return (
                  <div
                    key={p.id}
                    className={`group relative flex items-center gap-2 rounded-xl transition-all ${
                      isActive
                        ? 'bg-[var(--color-accent-muted)] border border-[var(--color-accent)]'
                        : 'bg-[var(--color-surface)]/60 border border-[var(--color-border)] hover:border-[var(--color-border-hover)]'
                    }`}
                  >
                    <button
                      onClick={() => selectPassage(p.id)}
                      className="flex-1 text-left px-3 py-2.5 text-xs min-w-0 no-select"
                      title={p.content}
                    >
                      <span className={`block truncate leading-snug ${isActive ? 'text-[var(--color-accent)] font-medium' : 'text-[var(--color-text)]'}`}>
                        {truncateTitle(p.content, 48)}
                      </span>
                    </button>
                    <button
                      onClick={() => handleDelete(p.id)}
                      aria-label="삭제"
                      className="flex-shrink-0 p-2 text-[var(--color-text-muted)] hover:text-[var(--color-error)] transition-colors"
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6" />
                      </svg>
                    </button>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        <footer className="mt-4 text-center text-[10px] text-[var(--color-text-muted)] font-mono">
          Rooping · Re-loop your English
        </footer>
      </div>
    </main>
  )
}
