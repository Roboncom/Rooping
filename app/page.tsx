'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import type { Passage, Settings } from '@/lib/types'
import { SAMPLE_PASSAGES } from '@/lib/sample'
import { Logo } from '@/components/Logo'
import { Equalizer } from '@/components/Equalizer'
import { TimerRing } from '@/components/TimerRing'

const STORAGE_KEYS = {
  passages: 'rooping.passages.v2',
  currentId: 'rooping.currentId.v2',
  settings: 'rooping.settings.v2',
}

const DEFAULT_SETTINGS: Settings = {
  repeatCount: 3,
  speed: 1.0,
}

const SPEED_OPTIONS = [0.7, 0.85, 1.0, 1.15, 1.3, 1.5]
const REPEAT_OPTIONS = [1, 2, 3, 5, 7, 10, 20]

const uid = () => Math.random().toString(36).slice(2, 10)

const truncateTitle = (content: string, max = 24) => {
  const t = content.trim().replace(/\s+/g, ' ')
  return t.length > max ? t.slice(0, max) + '…' : t
}

export default function Home() {
  const [passages, setPassages] = useState<Passage[]>(SAMPLE_PASSAGES)
  const [currentId, setCurrentId] = useState<string>(SAMPLE_PASSAGES[0]?.id ?? '')
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)

  const [isPlaying, setIsPlaying] = useState(false)
  const [currentRepeat, setCurrentRepeat] = useState(0)

  // 편집/입력 모드: null=닫힘, 문자열=편집 대상 ID, ''=새 글
  // 기본 화면 = 새 글 입력 (빈 문자열로 시작)
  const [editTargetId, setEditTargetId] = useState<string | null>('')
  const [editText, setEditText] = useState('')

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioCacheRef = useRef<Map<string, string>>(new Map())
  const cancelRef = useRef(false)

  const currentPassage =
    passages.find(p => p.id === currentId) ?? passages[0] ?? null

  // ===== localStorage 로드 =====
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

  // currentId가 목록에 없으면 첫 번째로
  useEffect(() => {
    if (passages.length === 0) {
      setCurrentId('')
      return
    }
    if (!passages.some(p => p.id === currentId)) {
      setCurrentId(passages[0].id)
    }
  }, [passages, currentId])

  // ===== 재생 =====
  const stopAudio = useCallback(() => {
    cancelRef.current = true
    if (audioRef.current) {
      audioRef.current.onended = null
      audioRef.current.onerror = null
      audioRef.current.pause()
      audioRef.current = null
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }
    setIsPlaying(false)
    setCurrentRepeat(0)
  }, [])

  const speak = useCallback(
    (text: string, speed: number): Promise<void> => {
      return new Promise(async resolve => {
        if (cancelRef.current) { resolve(); return }
        try {
          setIsPlaying(true)
          const cacheKey = `${speed}::${text}`
          let audioUrl = audioCacheRef.current.get(cacheKey)

          if (!audioUrl) {
            const res = await fetch('/api/tts', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text, voice: 'alloy', speed }),
            })

            if (!res.ok) {
              // fallback Web Speech
              if ('speechSynthesis' in window) {
                const u = new SpeechSynthesisUtterance(text)
                u.lang = /[\uAC00-\uD7AF]/.test(text) ? 'ko-KR' : 'en-US'
                u.rate = speed
                u.onend = () => { setIsPlaying(false); resolve() }
                u.onerror = () => { setIsPlaying(false); resolve() }
                window.speechSynthesis.speak(u)
                return
              }
              setIsPlaying(false)
              resolve()
              return
            }

            const blob = await res.blob()
            audioUrl = URL.createObjectURL(blob)
            audioCacheRef.current.set(cacheKey, audioUrl)
          }

          if (cancelRef.current) { setIsPlaying(false); resolve(); return }

          if (audioRef.current) audioRef.current.pause()
          const audio = new Audio(audioUrl)
          audioRef.current = audio
          audio.onended = () => { setIsPlaying(false); resolve() }
          audio.onerror = () => { setIsPlaying(false); resolve() }
          audio.play().catch(() => { setIsPlaying(false); resolve() })
        } catch {
          setIsPlaying(false)
          resolve()
        }
      })
    },
    []
  )

  const playCurrent = useCallback(async () => {
    if (!currentPassage || !currentPassage.content.trim()) return
    cancelRef.current = false
    for (let i = 0; i < settings.repeatCount; i++) {
      if (cancelRef.current) break
      setCurrentRepeat(i + 1)
      await speak(currentPassage.content, settings.speed)
      if (cancelRef.current) break
      if (i < settings.repeatCount - 1) {
        await new Promise(r => setTimeout(r, 400))
      }
    }
    setCurrentRepeat(0)
  }, [currentPassage, settings.repeatCount, settings.speed, speak])

  // ===== Navigation =====
  const currentIndex = passages.findIndex(p => p.id === currentId)
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

  // ===== 키보드 단축키 =====
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (editTargetId !== null) return
      const target = e.target as HTMLElement
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return

      if (e.code === 'Space') {
        e.preventDefault()
        if (isPlaying) stopAudio()
        else playCurrent()
      } else if (e.code === 'ArrowLeft') {
        goPrev()
      } else if (e.code === 'ArrowRight') {
        goNext()
      }
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

  const handleSave = () => {
    const content = editText.trim()
    if (!content) return
    const now = Date.now()
    if (editTargetId) {
      // 수정
      setPassages(prev =>
        prev.map(p => (p.id === editTargetId ? { ...p, content, updatedAt: now } : p))
      )
      setCurrentId(editTargetId)
    } else {
      // 새로 추가
      const id = uid()
      const newPassage: Passage = { id, content, createdAt: now, updatedAt: now }
      setPassages(prev => [...prev, newPassage])
      setCurrentId(id)
    }
    closeEditor()
  }

  const handleDelete = (id: string) => {
    if (!confirm('이 글을 삭제할까요?')) return
    setPassages(prev => prev.filter(p => p.id !== id))
    if (currentId === id) {
      // current will be reassigned by effect
      setCurrentId('')
    }
  }

  // ===== 렌더 =====
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
        <header className="flex items-center justify-between mb-6">
          <Logo />
          <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)] font-mono">
            {passages.length > 0 && (
              <span>{Math.max(1, currentIndex + 1)} / {passages.length}</span>
            )}
          </div>
        </header>

        {/* Passage tabs */}
        <div className="mb-4 -mx-3 px-3 sm:mx-0 sm:px-0">
          <div className="tabs-scroll flex items-center gap-2 pb-1">
            {passages.map(p => (
              <button
                key={p.id}
                onClick={() => { stopAudio(); setCurrentId(p.id) }}
                className={`flex-shrink-0 px-3.5 py-2 rounded-lg text-xs font-medium transition-all border no-select ${
                  currentId === p.id && editTargetId === null
                    ? 'bg-[var(--color-accent-muted)] text-[var(--color-accent)] border-[var(--color-accent)]'
                    : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:border-[var(--color-border-hover)]'
                }`}
                title={p.content}
              >
                {truncateTitle(p.content)}
              </button>
            ))}
            <button
              onClick={openNew}
              className={`flex-shrink-0 px-3.5 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-1 border no-select ${
                editTargetId !== null
                  ? 'bg-[var(--color-accent)] text-[var(--color-bg)] border-[var(--color-accent)] shadow-[0_0_16px_rgba(52,211,153,0.4)]'
                  : 'text-[var(--color-accent)] border-dashed border-[var(--color-border-hover)] hover:bg-[var(--color-accent-soft)]'
              }`}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
              입력
            </button>
          </div>
        </div>

        {/* Editor */}
        {editTargetId !== null && (
          <div className="mb-5 animate-fade-in-up">
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold">
                  {editTargetId ? '글 수정' : '새 글 입력'}
                </h3>
                <span className="text-[10px] font-mono text-[var(--color-text-muted)]">
                  {editText.trim().length} chars
                </span>
              </div>
              <p className="text-xs text-[var(--color-text-muted)] leading-relaxed mb-3">
                반복 학습할 글을 자유롭게 붙여넣으세요. 단어·문장·문단 모두 OK. 한·영 섞여도 그대로 읽어줍니다.
              </p>
              <textarea
                value={editText}
                onChange={e => setEditText(e.target.value)}
                rows={8}
                autoFocus
                className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3 text-sm
                  focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]
                  placeholder:text-[var(--color-text-muted)] resize-none leading-relaxed"
                placeholder={`여기에 반복 학습할 내용을 붙여넣으세요.
예를 들면 긴 문장, 문단, 단락 전체를 한 번에 넣어도 됩니다.

The quick brown fox jumps over the lazy dog.
또는 한국어도 되고, 섞여도 괜찮습니다.`}
              />
              <div className="flex gap-2 mt-3">
                <button
                  onClick={handleSave}
                  disabled={!editText.trim()}
                  className="flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold
                    bg-[var(--color-accent)] text-[#080c0a] hover:bg-[var(--color-accent-hover)]
                    active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {editTargetId ? '수정 저장' : '저장하고 학습 시작'}
                </button>
                <button
                  onClick={closeEditor}
                  className="px-4 py-2.5 rounded-lg text-sm border border-[var(--color-border)]
                    hover:bg-[var(--color-surface-hover)] transition-colors"
                >
                  취소
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Card — 에디터 열린 상태에서는 숨김 (공간만 유지해 settings를 바닥에) */}
        {editTargetId !== null ? (
          <div className="flex-1" />
        ) : (
        <div className="flex-1 flex flex-col items-center justify-center">
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
                p-6 sm:p-8 relative overflow-hidden
                hover:border-[var(--color-border-hover)] hover:shadow-[var(--shadow-glow)]
                transition-all duration-300 animate-fade-in-up"
            >
              {/* Top-right actions */}
              <div className="absolute top-4 right-4 flex items-center gap-2">
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
          <div className="flex items-center justify-center gap-4 sm:gap-5 mt-6 sm:mt-8 no-select">
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

        {/* Settings bar: 반복 횟수 + 배속 */}
        <div className="mt-6 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]/80 backdrop-blur-sm p-3 sm:p-4">
          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] font-mono">반복</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setSettings(s => {
                    const i = REPEAT_OPTIONS.indexOf(s.repeatCount)
                    return { ...s, repeatCount: REPEAT_OPTIONS[Math.max(0, i - 1)] }
                  })}
                  className="w-8 h-9 flex items-center justify-center rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] active:scale-95 transition-all"
                  aria-label="반복 줄이기"
                >−</button>
                <div className="flex-1 h-9 flex items-center justify-center rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] text-sm font-semibold text-[var(--color-accent)]">
                  {settings.repeatCount}회
                </div>
                <button
                  onClick={() => setSettings(s => {
                    const i = REPEAT_OPTIONS.indexOf(s.repeatCount)
                    return { ...s, repeatCount: REPEAT_OPTIONS[Math.min(REPEAT_OPTIONS.length - 1, i + 1)] }
                  })}
                  className="w-8 h-9 flex items-center justify-center rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] active:scale-95 transition-all"
                  aria-label="반복 늘리기"
                >+</button>
              </div>
            </label>
            <label className="flex flex-col gap-1.5">
              <span className="text-[10px] uppercase tracking-wider text-[var(--color-text-muted)] font-mono">배속</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setSettings(s => {
                    const i = SPEED_OPTIONS.indexOf(s.speed)
                    return { ...s, speed: SPEED_OPTIONS[Math.max(0, i - 1)] }
                  })}
                  className="w-8 h-9 flex items-center justify-center rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] active:scale-95 transition-all"
                  aria-label="배속 낮추기"
                >−</button>
                <div className="flex-1 h-9 flex items-center justify-center rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] text-sm font-semibold text-[var(--color-accent)]">
                  {settings.speed}x
                </div>
                <button
                  onClick={() => setSettings(s => {
                    const i = SPEED_OPTIONS.indexOf(s.speed)
                    return { ...s, speed: SPEED_OPTIONS[Math.min(SPEED_OPTIONS.length - 1, i + 1)] }
                  })}
                  className="w-8 h-9 flex items-center justify-center rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] active:scale-95 transition-all"
                  aria-label="배속 올리기"
                >+</button>
              </div>
            </label>
          </div>
          <p className="mt-3 text-[10px] text-[var(--color-text-muted)] text-center font-mono hidden sm:block">
            Space 재생/정지 · ← → 이전/다음 글
          </p>
        </div>

        <footer className="mt-4 text-center text-[10px] text-[var(--color-text-muted)] font-mono">
          Rooping · Re-loop your English
        </footer>
      </div>
    </main>
  )
}
