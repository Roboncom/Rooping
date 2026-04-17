'use client'

import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import type { LearnItem, DeckMode, Settings } from '@/lib/types'
import { SAMPLE_ITEMS } from '@/lib/sample'
import { parseList, serializeList, dedupe } from '@/lib/parse'
import { Logo } from '@/components/Logo'
import { Equalizer } from '@/components/Equalizer'
import { TimerRing } from '@/components/TimerRing'

const STORAGE_KEYS = {
  items: 'rooping.items.v1',
  settings: 'rooping.settings.v1',
  progress: 'rooping.progress.v1',
}

const DEFAULT_SETTINGS: Settings = {
  repeatCount: 3,
  intervalMs: 1500,
  voice: 'alloy',
  speed: 0.95,
  shuffle: false,
  autoAdvanceMs: 2000,
  showKoreanFirst: false,
}

const MODES: { id: DeckMode; label: string }[] = [
  { id: 'word', label: '단어' },
  { id: 'sentence', label: '문장' },
  { id: 'all', label: '전체' },
]

export default function Home() {
  const [allItems, setAllItems] = useState<LearnItem[]>(SAMPLE_ITEMS)
  const [mode, setMode] = useState<DeckMode>('word')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [showMeaning, setShowMeaning] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isAutoMode, setIsAutoMode] = useState(false)
  const [currentRepeat, setCurrentRepeat] = useState(0)
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [editText, setEditText] = useState('')
  const [editKind, setEditKind] = useState<'word' | 'sentence' | 'auto'>('auto')
  const [editStrategy, setEditStrategy] = useState<'append' | 'replace'>('append')
  const [learnedIds, setLearnedIds] = useState<Set<string>>(new Set())
  const [cancelRequested, setCancelRequested] = useState(false)

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioCacheRef = useRef<Map<string, string>>(new Map())
  const cancelRef = useRef(false)
  const skipModeResetRef = useRef(false)

  const filteredItems = useMemo(() => {
    const base = mode === 'all' ? allItems : allItems.filter(i => i.kind === mode)
    if (!settings.shuffle) return base
    const arr = [...base]
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
    }
    return arr
  }, [allItems, mode, settings.shuffle])

  const safeIndex = filteredItems.length > 0 ? currentIndex % filteredItems.length : 0
  const currentItem = filteredItems[safeIndex] ?? { id: '', kind: 'word' as const, en: '', ko: '' }
  const totalCount = filteredItems.length

  // Load from localStorage
  useEffect(() => {
    try {
      const savedItems = localStorage.getItem(STORAGE_KEYS.items)
      if (savedItems) {
        const parsed = JSON.parse(savedItems)
        if (Array.isArray(parsed) && parsed.length > 0) setAllItems(parsed)
      }
      const savedSettings = localStorage.getItem(STORAGE_KEYS.settings)
      if (savedSettings) {
        const parsed = JSON.parse(savedSettings)
        setSettings(s => ({ ...s, ...parsed }))
      }
      const savedProgress = localStorage.getItem(STORAGE_KEYS.progress)
      if (savedProgress) {
        const parsed = JSON.parse(savedProgress)
        if (Array.isArray(parsed)) setLearnedIds(new Set(parsed))
      }
    } catch {}
  }, [])

  // Persist items
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEYS.items, JSON.stringify(allItems)) } catch {}
  }, [allItems])

  // Persist settings
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEYS.settings, JSON.stringify(settings)) } catch {}
  }, [settings])

  // Persist learned
  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEYS.progress, JSON.stringify(Array.from(learnedIds))) } catch {}
  }, [learnedIds])

  // Reset index when mode/filter changes (but not when saveEdit navigates us there)
  useEffect(() => {
    if (skipModeResetRef.current) {
      skipModeResetRef.current = false
      return
    }
    setCurrentIndex(0)
    setShowMeaning(false)
  }, [mode, settings.shuffle])

  const stopAudio = useCallback(() => {
    cancelRef.current = true
    setCancelRequested(true)
    if (audioRef.current) {
      audioRef.current.onended = null
      audioRef.current.onerror = null
      audioRef.current.pause()
      audioRef.current = null
    }
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    setIsPlaying(false)
    setCurrentRepeat(0)
  }, [])

  const speak = useCallback(
    (text: string): Promise<void> => {
      return new Promise(async resolve => {
        if (cancelRef.current) { resolve(); return }
        try {
          setIsPlaying(true)

          let audioUrl = audioCacheRef.current.get(`${settings.voice}:${settings.speed}:${text}`)

          if (!audioUrl) {
            const res = await fetch('/api/tts', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ text, voice: settings.voice, speed: settings.speed }),
            })

            if (!res.ok) {
              if ('speechSynthesis' in window) {
                const u = new SpeechSynthesisUtterance(text)
                u.lang = 'en-US'
                u.rate = settings.speed
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
            audioCacheRef.current.set(`${settings.voice}:${settings.speed}:${text}`, audioUrl)
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
    [settings.voice, settings.speed]
  )

  const playCurrent = useCallback(async () => {
    if (!currentItem.en) return
    cancelRef.current = false
    setCancelRequested(false)
    for (let i = 0; i < settings.repeatCount; i++) {
      if (cancelRef.current) break
      setCurrentRepeat(i + 1)
      await speak(currentItem.en)
      if (cancelRef.current) break
      if (i < settings.repeatCount - 1) {
        await new Promise(r => setTimeout(r, settings.intervalMs))
      }
    }
    setCurrentRepeat(0)
    if (!cancelRef.current) setShowMeaning(true)
  }, [currentItem.en, settings.repeatCount, settings.intervalMs, speak])

  // Auto mode
  useEffect(() => {
    if (!isAutoMode) {
      if (timerRef.current) clearTimeout(timerRef.current)
      return
    }
    if (totalCount === 0) return

    let cancelled = false
    const run = async () => {
      await playCurrent()
      if (cancelled || cancelRef.current) return
      timerRef.current = setTimeout(() => {
        if (cancelled) return
        setShowMeaning(false)
        setCurrentIndex(i => (i + 1) % Math.max(1, totalCount))
      }, settings.autoAdvanceMs)
    }
    run()

    return () => {
      cancelled = true
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [isAutoMode, safeIndex, mode, playCurrent, settings.autoAdvanceMs, totalCount])

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (editMode || settingsOpen) return
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
      } else if (e.key === 'm' || e.key === 'M') {
        setShowMeaning(s => !s)
      } else if (e.key === 'l' || e.key === 'L') {
        toggleLearned()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editMode, settingsOpen, isPlaying, playCurrent, currentItem.id])

  const goNext = () => {
    if (totalCount === 0) return
    stopAudio()
    setShowMeaning(false)
    setCurrentIndex(i => (i + 1) % totalCount)
  }
  const goPrev = () => {
    if (totalCount === 0) return
    stopAudio()
    setShowMeaning(false)
    setCurrentIndex(i => (i - 1 + totalCount) % totalCount)
  }

  const toggleLearned = () => {
    if (!currentItem.id) return
    setLearnedIds(prev => {
      const next = new Set(prev)
      if (next.has(currentItem.id)) next.delete(currentItem.id)
      else next.add(currentItem.id)
      return next
    })
  }

  const openEditor = (kind: 'word' | 'sentence' | 'auto' = 'auto') => {
    setEditKind(kind)
    setEditStrategy('append')
    setEditText('') // 기본은 빈 상태에서 붙여넣기 (기존 목록 보기 원하면 '현재 목록 불러오기' 버튼)
    setEditMode(true)
  }

  const handleLoadCurrent = () => {
    // 현재 필터된 종류의 기존 항목을 textarea에 채움 (편집용)
    const source =
      editKind === 'auto'
        ? allItems
        : allItems.filter(i => i.kind === editKind)
    setEditText(serializeList(source))
    setEditStrategy('replace')
  }

  const handleSaveEdit = () => {
    const parsed = parseList(editText, editKind)
    if (parsed.length === 0) return

    let next: LearnItem[]
    if (editStrategy === 'replace') {
      if (editKind === 'auto') {
        next = dedupe(parsed)
      } else {
        const other = allItems.filter(i => i.kind !== editKind)
        next = dedupe([...other, ...parsed])
      }
    } else {
      next = dedupe([...allItems, ...parsed])
    }

    // 붙여넣은 항목들로 학습 가능하도록 적절한 모드로 자동 전환
    const hasWord = parsed.some(i => i.kind === 'word')
    const hasSent = parsed.some(i => i.kind === 'sentence')
    const targetMode: DeckMode = hasWord && hasSent ? 'all' : hasSent ? 'sentence' : 'word'

    // 방금 붙여넣은 첫 항목의 위치 찾기 (셔플 시에는 0번으로)
    const firstParsed = parsed[0]
    const filtered = targetMode === 'all' ? next : next.filter(i => i.kind === targetMode)
    const targetIdx = settings.shuffle
      ? 0
      : Math.max(0, filtered.findIndex(i => i.id === firstParsed.id))

    skipModeResetRef.current = true
    setAllItems(next)
    setMode(targetMode)
    setShowMeaning(false)
    setEditMode(false)
    setCurrentIndex(targetIdx)
  }

  const progressPct = totalCount > 0 ? ((safeIndex + 1) / totalCount) * 100 : 0
  const isLearned = learnedIds.has(currentItem.id)
  const learnedInMode = filteredItems.filter(i => learnedIds.has(i.id)).length

  return (
    <main className="min-h-screen text-[var(--color-text)] relative noise-overlay overflow-hidden">
      {/* Ambient glow */}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 -z-0 opacity-40"
        style={{
          background:
            'radial-gradient(500px circle at 20% 10%, rgba(52,211,153,0.12), transparent 60%), radial-gradient(400px circle at 85% 90%, rgba(110,231,183,0.08), transparent 60%)',
        }}
      />

      <div className="relative z-10 max-w-xl mx-auto px-4 py-6 sm:py-8 min-h-screen flex flex-col">
        {/* Header */}
        <header className="flex items-center justify-between mb-6">
          <Logo />
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSettingsOpen(s => !s)}
              aria-label="설정"
              className="p-2 rounded-lg hover:bg-[var(--color-surface-hover)] transition-colors text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
            <button
              onClick={() => openEditor('auto')}
              aria-label="목록 편집"
              title="단어·문장 붙여넣기"
              className="p-2 rounded-lg hover:bg-[var(--color-surface-hover)] transition-colors text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </button>
          </div>
        </header>

        {/* Mode tabs + 입력 */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] mb-4">
          {MODES.map(m => (
            <button
              key={m.id}
              onClick={() => { setMode(m.id); setEditMode(false) }}
              className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                mode === m.id && !editMode
                  ? 'bg-[var(--color-accent-muted)] text-[var(--color-accent)] shadow-[inset_0_0_0_1px_var(--color-accent-muted)]'
                  : 'text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
              }`}
            >
              {m.label}
              <span className="ml-1.5 text-xs opacity-70 font-mono">
                {m.id === 'all' ? allItems.length : allItems.filter(i => i.kind === m.id).length}
              </span>
            </button>
          ))}
          <button
            onClick={() => { if (editMode) setEditMode(false); else openEditor('auto') }}
            title="단어·문장 복붙해서 저장 + 반복학습"
            className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-1 ${
              editMode
                ? 'bg-[var(--color-accent)] text-[#080c0a] shadow-[0_0_16px_rgba(52,211,153,0.35)]'
                : 'text-[var(--color-accent)] border border-dashed border-[var(--color-border-hover)] hover:bg-[var(--color-accent-soft)]'
            }`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 5v14M5 12h14" />
            </svg>
            입력
          </button>
        </div>

        {/* Progress */}
        <div className="mb-5">
          <div className="flex items-center justify-between text-xs text-[var(--color-text-muted)] font-mono mb-1.5">
            <span>
              {totalCount > 0 ? safeIndex + 1 : 0} / {totalCount}
            </span>
            <span>
              학습 완료 {learnedInMode}/{totalCount}
            </span>
          </div>
          <div className="h-1 rounded-full bg-[var(--color-surface)] overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[var(--color-accent)] to-[var(--color-accent-hover)] transition-all duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>

        {/* Edit panel — 붙여넣기 · 저장 · 반복학습 */}
        {editMode && (() => {
          const parsed = parseList(editText, editKind)
          const wordCnt = parsed.filter(i => i.kind === 'word').length
          const sentCnt = parsed.filter(i => i.kind === 'sentence').length
          return (
            <div className="mb-5 animate-fade-in-up">
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
                <div className="mb-3">
                  <h3 className="text-sm font-semibold mb-1">단어·문장 붙여넣기</h3>
                  <p className="text-xs text-[var(--color-text-muted)] leading-relaxed">
                    한 줄에 하나씩 <span className="font-mono text-[var(--color-accent)]">영어, 한국어</span> 형식으로 붙여넣으세요.<br />
                    구분자는 <span className="font-mono">, / Tab / | / =</span> 중 무엇이든 OK — 마지막 구분자 기준으로 분리됩니다.
                  </p>
                </div>

                {/* 분류 선택 */}
                <div className="flex items-center gap-1 mb-2 text-xs">
                  <span className="text-[var(--color-text-muted)] mr-1">분류</span>
                  {([
                    { id: 'auto', label: '자동 감지' },
                    { id: 'word', label: '단어로' },
                    { id: 'sentence', label: '문장으로' },
                  ] as const).map(o => (
                    <button
                      key={o.id}
                      onClick={() => setEditKind(o.id)}
                      className={`px-2.5 py-1 rounded-md border transition-all ${
                        editKind === o.id
                          ? 'bg-[var(--color-accent-muted)] border-[var(--color-accent)] text-[var(--color-accent)]'
                          : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>

                {/* 저장 방식 */}
                <div className="flex items-center gap-1 mb-3 text-xs">
                  <span className="text-[var(--color-text-muted)] mr-1">방식</span>
                  {([
                    { id: 'append', label: '기존에 추가', hint: '중복은 자동 제거' },
                    { id: 'replace', label: '전체 교체', hint: '기존 목록을 지우고 새로 만듦' },
                  ] as const).map(o => (
                    <button
                      key={o.id}
                      onClick={() => setEditStrategy(o.id)}
                      title={o.hint}
                      className={`px-2.5 py-1 rounded-md border transition-all ${
                        editStrategy === o.id
                          ? 'bg-[var(--color-accent-muted)] border-[var(--color-accent)] text-[var(--color-accent)]'
                          : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                      }`}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>

                <textarea
                  value={editText}
                  onChange={e => setEditText(e.target.value)}
                  rows={10}
                  autoFocus
                  className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3 text-sm font-mono
                    focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]
                    placeholder:text-[var(--color-text-muted)] resize-none"
                  placeholder={`ubiquitous, 어디에나 있는
ephemeral, 일시적인
Could you say that again?, 다시 말씀해 주시겠어요?
Let me think about it, 생각해 볼게요`}
                />

                {/* 미리보기 요약 */}
                <div className="flex items-center justify-between mt-2 text-[11px] font-mono text-[var(--color-text-muted)]">
                  <span>
                    총 <span className="text-[var(--color-accent)]">{parsed.length}</span>개 ·
                    단어 {wordCnt} · 문장 {sentCnt}
                  </span>
                  <button
                    onClick={handleLoadCurrent}
                    className="hover:text-[var(--color-text)] underline underline-offset-2"
                    title="기존 목록을 textarea에 불러와 편집 모드로 전환"
                  >
                    현재 목록 불러오기
                  </button>
                </div>

                <div className="flex gap-2 mt-3">
                  <button
                    onClick={handleSaveEdit}
                    disabled={parsed.length === 0}
                    className="flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold
                      bg-[var(--color-accent)] text-[#080c0a] hover:bg-[var(--color-accent-hover)]
                      active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    저장하고 학습 시작 · {parsed.length}개
                    {editStrategy === 'append' ? ' 추가' : ' 로 교체'}
                  </button>
                  <button
                    onClick={() => setEditMode(false)}
                    className="px-4 py-2.5 rounded-lg text-sm border border-[var(--color-border)]
                      hover:bg-[var(--color-surface-hover)] transition-colors"
                  >
                    취소
                  </button>
                </div>
              </div>
            </div>
          )
        })()}

        {/* Settings panel */}
        {settingsOpen && (
          <div className="mb-5 animate-fade-in-up">
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-[var(--color-text-muted)]">반복 횟수</span>
                  <select
                    value={settings.repeatCount}
                    onChange={e => setSettings(s => ({ ...s, repeatCount: Number(e.target.value) }))}
                    className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-2 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none"
                  >
                    {[1, 2, 3, 5, 7, 10].map(n => <option key={n} value={n}>{n}회</option>)}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-[var(--color-text-muted)]">반복 간격</span>
                  <select
                    value={settings.intervalMs}
                    onChange={e => setSettings(s => ({ ...s, intervalMs: Number(e.target.value) }))}
                    className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-2 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none"
                  >
                    {[500, 1000, 1500, 2000, 3000, 5000].map(ms => (
                      <option key={ms} value={ms}>{ms / 1000}초</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-[var(--color-text-muted)]">음성</span>
                  <select
                    value={settings.voice}
                    onChange={e => setSettings(s => ({ ...s, voice: e.target.value as Settings['voice'] }))}
                    className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-2 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none"
                  >
                    {(['alloy', 'echo', 'fable', 'nova', 'onyx', 'shimmer'] as const).map(v => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-[var(--color-text-muted)]">재생 속도</span>
                  <select
                    value={settings.speed}
                    onChange={e => setSettings(s => ({ ...s, speed: Number(e.target.value) }))}
                    className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-2 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none"
                  >
                    {[0.7, 0.8, 0.9, 0.95, 1.0, 1.15, 1.3].map(s => (
                      <option key={s} value={s}>{s}x</option>
                    ))}
                  </select>
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-[var(--color-text-muted)]">자동 넘김 대기</span>
                  <select
                    value={settings.autoAdvanceMs}
                    onChange={e => setSettings(s => ({ ...s, autoAdvanceMs: Number(e.target.value) }))}
                    className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-2 py-2 text-sm focus:border-[var(--color-accent)] focus:outline-none"
                  >
                    {[1000, 2000, 3000, 5000, 8000].map(ms => (
                      <option key={ms} value={ms}>{ms / 1000}초</option>
                    ))}
                  </select>
                </label>
                <div className="flex flex-col gap-1 text-xs">
                  <span className="text-[var(--color-text-muted)]">셔플</span>
                  <button
                    onClick={() => setSettings(s => ({ ...s, shuffle: !s.shuffle }))}
                    className={`px-2 py-2 rounded-lg border text-sm transition-all ${
                      settings.shuffle
                        ? 'bg-[var(--color-accent-muted)] border-[var(--color-accent)] text-[var(--color-accent)]'
                        : 'border-[var(--color-border)] text-[var(--color-text-muted)]'
                    }`}
                  >
                    {settings.shuffle ? 'ON' : 'OFF'}
                  </button>
                </div>
              </div>

              <div className="flex gap-2 pt-2 border-t border-[var(--color-border)]">
                <button
                  onClick={() => {
                    if (confirm('학습 완료 기록을 모두 초기화할까요?')) setLearnedIds(new Set())
                  }}
                  className="flex-1 px-3 py-2 rounded-lg text-xs border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] transition-colors"
                >
                  학습 기록 초기화
                </button>
                <button
                  onClick={() => {
                    if (confirm('모든 단어·문장을 샘플로 되돌릴까요?')) {
                      setAllItems(SAMPLE_ITEMS)
                      setLearnedIds(new Set())
                      setCurrentIndex(0)
                    }
                  }}
                  className="flex-1 px-3 py-2 rounded-lg text-xs border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)] transition-colors"
                >
                  샘플로 복원
                </button>
              </div>
              <p className="text-[10px] text-[var(--color-text-muted)] text-center pt-1">
                단축키 · Space 재생/정지 · ← → 이전/다음 · M 뜻 · L 학습완료
              </p>
            </div>
          </div>
        )}

        {/* Card */}
        <div className="flex-1 flex flex-col items-center justify-center">
          {totalCount === 0 ? (
            <div className="w-full rounded-2xl border border-dashed border-[var(--color-border)] p-10 text-center text-[var(--color-text-muted)]">
              <p className="text-sm mb-2">이 모드에 항목이 없어요.</p>
              <button
                onClick={() => openEditor(mode === 'sentence' ? 'sentence' : mode === 'word' ? 'word' : 'auto')}
                className="text-[var(--color-accent)] text-sm underline underline-offset-4"
              >
                {mode === 'sentence' ? '문장' : mode === 'word' ? '단어' : '목록'} 붙여넣기
              </button>
            </div>
          ) : (
            <div
              key={currentItem.id}
              className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]
                p-6 sm:p-8 relative overflow-hidden
                hover:border-[var(--color-border-hover)] hover:shadow-[var(--shadow-glow)]
                transition-all duration-300 animate-fade-in-up"
            >
              {/* Learned badge */}
              <button
                onClick={toggleLearned}
                aria-label="학습 완료 표시"
                className={`absolute top-4 left-4 flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-mono uppercase tracking-wider transition-colors ${
                  isLearned
                    ? 'bg-[var(--color-accent-muted)] text-[var(--color-accent)] border border-[var(--color-accent)]'
                    : 'border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                }`}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                {isLearned ? '학습완료' : '학습표시'}
              </button>

              {/* Kind chip */}
              <div className="absolute top-4 right-4 flex items-center gap-2">
                {currentRepeat > 0 && (
                  <div className="relative w-10 h-10">
                    <TimerRing progress={currentRepeat / settings.repeatCount} size={40} stroke={2.5} />
                    <span className="absolute inset-0 flex items-center justify-center text-[11px] font-mono text-[var(--color-accent)]">
                      {currentRepeat}
                    </span>
                  </div>
                )}
                <span className="px-2 py-1 rounded-md text-[10px] font-mono uppercase tracking-wider border border-[var(--color-border)] text-[var(--color-text-muted)]">
                  {currentItem.kind === 'word' ? 'WORD' : 'SENTENCE'}
                </span>
              </div>

              <div className="pt-10 pb-2 text-center">
                <h2
                  className={`font-[var(--font-display)] font-bold tracking-tight leading-tight ${
                    currentItem.kind === 'sentence'
                      ? 'text-2xl sm:text-3xl'
                      : 'text-4xl sm:text-5xl'
                  }`}
                >
                  {currentItem.en}
                </h2>

                <div className="my-5">
                  <Equalizer isPlaying={isPlaying} />
                </div>

                <div
                  className={`text-lg sm:text-xl transition-all duration-300 ${
                    showMeaning ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'
                  }`}
                >
                  <span className="text-[var(--color-text-secondary)]">{currentItem.ko}</span>
                </div>
              </div>
            </div>
          )}

          {/* Controls */}
          <div className="flex items-center justify-center gap-3 sm:gap-4 mt-6 sm:mt-8">
            <button
              onClick={goPrev}
              aria-label="이전"
              className="p-3 rounded-xl border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)]
                hover:border-[var(--color-border-hover)] transition-all active:scale-95"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>

            <button
              onClick={() => { if (isPlaying) stopAudio(); else playCurrent() }}
              disabled={totalCount === 0}
              aria-label={isPlaying ? '정지' : '재생'}
              className="p-4 rounded-xl bg-[var(--color-accent)] text-[#080c0a] hover:bg-[var(--color-accent-hover)]
                active:scale-95 transition-all shadow-[0_0_20px_rgba(52,211,153,0.25)]
                hover:shadow-[0_0_30px_rgba(52,211,153,0.4)] disabled:opacity-40"
            >
              {isPlaying ? (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="6" y="5" width="4" height="14" rx="1" />
                  <rect x="14" y="5" width="4" height="14" rx="1" />
                </svg>
              ) : (
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>

            <button
              onClick={goNext}
              aria-label="다음"
              className="p-3 rounded-xl border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)]
                hover:border-[var(--color-border-hover)] transition-all active:scale-95"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          </div>

          <button
            onClick={() => setShowMeaning(s => !s)}
            className="mt-3 text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors font-mono"
          >
            {showMeaning ? '뜻 숨기기 (M)' : '뜻 보기 (M)'}
          </button>
        </div>

        {/* Bottom bar: auto + quick settings */}
        <div className="mt-6 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
          <div className="flex items-center justify-between gap-2 text-sm">
            <button
              onClick={() => setIsAutoMode(a => !a)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg font-medium transition-all ${
                isAutoMode
                  ? 'bg-[var(--color-accent-muted)] text-[var(--color-accent)] border border-[var(--color-accent)] animate-pulse-glow'
                  : 'border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
              }`}
            >
              <div className={`w-2 h-2 rounded-full ${isAutoMode ? 'bg-[var(--color-accent)] animate-pulse' : 'bg-[var(--color-text-muted)]'}`} />
              자동 루프
            </button>

            <div className="flex items-center gap-2 text-xs text-[var(--color-text-muted)]">
              <div className="flex items-center gap-1">
                <span>반복</span>
                <span className="text-[var(--color-text)] font-mono">{settings.repeatCount}×</span>
              </div>
              <span className="opacity-40">·</span>
              <div className="flex items-center gap-1">
                <span>간격</span>
                <span className="text-[var(--color-text)] font-mono">{settings.intervalMs / 1000}s</span>
              </div>
              <span className="opacity-40">·</span>
              <div className="flex items-center gap-1">
                <span>속도</span>
                <span className="text-[var(--color-text)] font-mono">{settings.speed}x</span>
              </div>
            </div>
          </div>
        </div>

        <footer className="mt-4 text-center text-[10px] text-[var(--color-text-muted)] font-mono">
          Rooping · Re-loop your English
        </footer>
      </div>
    </main>
  )
}
