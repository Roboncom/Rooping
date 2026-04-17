'use client'

import { useState, useEffect, useCallback, useRef } from 'react'

// ===== Types =====
interface Word {
  en: string
  ko: string
}

// ===== Sample Data =====
const SAMPLE_WORDS: Word[] = [
  { en: 'ubiquitous', ko: '어디에나 있는' },
  { en: 'ephemeral', ko: '일시적인' },
  { en: 'pragmatic', ko: '실용적인' },
  { en: 'eloquent', ko: '유창한' },
  { en: 'meticulous', ko: '꼼꼼한' },
  { en: 'resilient', ko: '회복력 있는' },
  { en: 'ambiguous', ko: '모호한' },
  { en: 'profound', ko: '심오한' },
  { en: 'inevitable', ko: '불가피한' },
  { en: 'paradigm', ko: '패러다임' },
]

// ===== Equalizer Component =====
function Equalizer({ isPlaying }: { isPlaying: boolean }) {
  const bars = 12
  return (
    <div className="flex items-end justify-center gap-[3px] h-16 my-6">
      {Array.from({ length: bars }).map((_, i) => (
        <div
          key={i}
          className="w-[4px] rounded-full transition-all duration-150"
          style={{
            height: isPlaying ? `${20 + Math.random() * 80}%` : '12%',
            backgroundColor: `rgba(52, 211, 153, ${0.4 + (i / bars) * 0.6})`,
            animationDelay: `${i * 80}ms`,
            transition: isPlaying ? 'height 150ms ease' : 'height 400ms ease',
          }}
        />
      ))}
    </div>
  )
}

// ===== Timer Ring Component =====
function TimerRing({ progress, size = 48 }: { progress: number; size?: number }) {
  const r = (size - 4) / 2
  const circumference = 2 * Math.PI * r
  const offset = circumference * (1 - progress)

  return (
    <svg width={size} height={size} className="rotate-[-90deg]">
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke="var(--color-border)" strokeWidth={3}
      />
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none" stroke="var(--color-accent)" strokeWidth={3}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="transition-all duration-300"
      />
    </svg>
  )
}

// ===== Main App =====
export default function Home() {
  const [words, setWords] = useState<Word[]>(SAMPLE_WORDS)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [showMeaning, setShowMeaning] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isAutoMode, setIsAutoMode] = useState(false)
  const [repeatCount, setRepeatCount] = useState(3)
  const [interval, setIntervalTime] = useState(2000)
  const [currentRepeat, setCurrentRepeat] = useState(0)
  const [editMode, setEditMode] = useState(false)
  const [editText, setEditText] = useState('')
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const eqRef = useRef<NodeJS.Timeout | null>(null)
  const [eqKey, setEqKey] = useState(0)

  const currentWord = words[currentIndex] || { en: '', ko: '' }

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const audioCacheRef = useRef<Map<string, string>>(new Map())

  // Speak word using OpenAI TTS via API Route
  const speak = useCallback((text: string): Promise<void> => {
    return new Promise(async (resolve) => {
      try {
        setIsPlaying(true)
        if (eqRef.current) clearInterval(eqRef.current)
        eqRef.current = setInterval(() => setEqKey(k => k + 1), 120)

        // Check cache first
        let audioUrl = audioCacheRef.current.get(text)

        if (!audioUrl) {
          const res = await fetch('/api/tts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text, voice: 'alloy', speed: 0.9 }),
          })

          if (!res.ok) {
            // Fallback to Web Speech API
            if ('speechSynthesis' in window) {
              const u = new SpeechSynthesisUtterance(text)
              u.lang = 'en-US'; u.rate = 0.85
              u.onend = () => { setIsPlaying(false); if (eqRef.current) clearInterval(eqRef.current); resolve() }
              u.onerror = () => { setIsPlaying(false); if (eqRef.current) clearInterval(eqRef.current); resolve() }
              window.speechSynthesis.speak(u)
              return
            }
            setIsPlaying(false)
            if (eqRef.current) clearInterval(eqRef.current)
            resolve()
            return
          }

          const blob = await res.blob()
          audioUrl = URL.createObjectURL(blob)
          audioCacheRef.current.set(text, audioUrl)
        }

        // Play audio
        if (audioRef.current) {
          audioRef.current.pause()
        }
        const audio = new Audio(audioUrl)
        audioRef.current = audio
        audio.onended = () => {
          setIsPlaying(false)
          if (eqRef.current) clearInterval(eqRef.current)
          resolve()
        }
        audio.onerror = () => {
          setIsPlaying(false)
          if (eqRef.current) clearInterval(eqRef.current)
          resolve()
        }
        audio.play()
      } catch {
        setIsPlaying(false)
        if (eqRef.current) clearInterval(eqRef.current)
        resolve()
      }
    })
  }, [])

  // Play current word with repeat
  const playWord = useCallback(async () => {
    for (let i = 0; i < repeatCount; i++) {
      setCurrentRepeat(i + 1)
      await speak(currentWord.en)
      if (i < repeatCount - 1) {
        await new Promise(r => setTimeout(r, interval))
      }
    }
    setCurrentRepeat(0)
    setShowMeaning(true)
  }, [currentWord.en, repeatCount, interval, speak])

  // Auto mode
  useEffect(() => {
    if (!isAutoMode) {
      if (timerRef.current) clearTimeout(timerRef.current)
      return
    }

    const autoPlay = async () => {
      await playWord()
      timerRef.current = setTimeout(() => {
        setShowMeaning(false)
        setCurrentIndex(i => (i + 1) % words.length)
      }, 2000)
    }

    autoPlay()

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
      window.speechSynthesis.cancel()
    }
  }, [isAutoMode, currentIndex, playWord, words.length])

  // Navigation
  const goNext = () => {
    setShowMeaning(false)
    setCurrentIndex(i => (i + 1) % words.length)
  }
  const goPrev = () => {
    setShowMeaning(false)
    setCurrentIndex(i => (i - 1 + words.length) % words.length)
  }

  // Parse custom word list
  const parseWordList = (text: string): Word[] => {
    return text
      .split('\n')
      .filter(line => line.trim())
      .map(line => {
        const parts = line.split(/[,\t|]/)
        if (parts.length >= 2) {
          return { en: parts[0].trim(), ko: parts[1].trim() }
        }
        return null
      })
      .filter((w): w is Word => w !== null)
  }

  const handleSaveWords = () => {
    const parsed = parseWordList(editText)
    if (parsed.length > 0) {
      setWords(parsed)
      setCurrentIndex(0)
      setEditMode(false)
      localStorage.setItem('wordloop-words', JSON.stringify(parsed))
    }
  }

  // Load saved words
  useEffect(() => {
    const saved = localStorage.getItem('wordloop-words')
    if (saved) {
      try {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed) && parsed.length > 0) {
          setWords(parsed)
        }
      } catch {}
    }
  }, [])

  return (
    <main className="min-h-screen bg-[var(--color-bg)] text-[var(--color-text)] relative noise-overlay">
      <div className="relative z-10 max-w-lg mx-auto px-4 py-8 min-h-screen flex flex-col">
        {/* Header */}
        <header className="flex items-center justify-between mb-8">
          <h1 className="font-[var(--font-display)] text-xl font-bold tracking-tight">
            <span className="text-[var(--color-accent)]">Word</span>Loop
          </h1>
          <div className="flex items-center gap-3">
            <span className="text-xs text-[var(--color-text-muted)] font-mono">
              {currentIndex + 1}/{words.length}
            </span>
            <button
              onClick={() => { setEditMode(!editMode); setEditText(words.map(w => `${w.en}, ${w.ko}`).join('\n')) }}
              className="p-2 rounded-lg hover:bg-[var(--color-surface-hover)] transition-colors text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </button>
          </div>
        </header>

        {/* Edit Mode */}
        {editMode && (
          <div className="mb-6 animate-fade-in-up">
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
              <p className="text-xs text-[var(--color-text-muted)] mb-2">
                한 줄에 하나씩: 영어, 한국어 (쉼표/탭/| 구분)
              </p>
              <textarea
                value={editText}
                onChange={e => setEditText(e.target.value)}
                rows={8}
                className="w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg p-3 text-sm font-mono
                  focus:border-[var(--color-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--color-accent)]
                  placeholder:text-[var(--color-text-muted)] resize-none"
                placeholder="ubiquitous, 어디에나 있는&#10;ephemeral, 일시적인"
              />
              <div className="flex gap-2 mt-3">
                <button onClick={handleSaveWords}
                  className="flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold
                    bg-[var(--color-accent)] text-[#080c0a] hover:bg-[var(--color-accent-hover)]
                    active:scale-[0.98] transition-all">
                  저장 ({parseWordList(editText).length}개)
                </button>
                <button onClick={() => setEditMode(false)}
                  className="px-4 py-2.5 rounded-lg text-sm border border-[var(--color-border)]
                    hover:bg-[var(--color-surface-hover)] transition-colors">
                  취소
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Word Card */}
        <div className="flex-1 flex flex-col items-center justify-center">
          <div className="w-full rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)]
            p-8 text-center relative overflow-hidden
            hover:border-[var(--color-border-hover)] hover:shadow-[var(--shadow-glow)]
            transition-all duration-300">

            {/* Repeat counter */}
            {currentRepeat > 0 && (
              <div className="absolute top-4 right-4">
                <TimerRing progress={currentRepeat / repeatCount} />
                <span className="absolute inset-0 flex items-center justify-center text-xs font-mono text-[var(--color-accent)]">
                  {currentRepeat}
                </span>
              </div>
            )}

            {/* English word */}
            <h2 className="font-[var(--font-display)] text-4xl sm:text-5xl font-bold mb-2 tracking-tight animate-fade-in-up">
              {currentWord.en}
            </h2>

            {/* Equalizer */}
            <Equalizer key={eqKey} isPlaying={isPlaying} />

            {/* Korean meaning */}
            <div className={`text-xl transition-all duration-300 ${showMeaning ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2'}`}>
              <span className="text-[var(--color-text-secondary)]">{currentWord.ko}</span>
            </div>
          </div>

          {/* Controls */}
          <div className="flex items-center justify-center gap-4 mt-8">
            <button onClick={goPrev}
              className="p-3 rounded-xl border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)]
                hover:border-[var(--color-border-hover)] transition-all active:scale-95">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>

            <button onClick={() => { if (!isAutoMode) playWord() }}
              disabled={isPlaying}
              className="p-4 rounded-xl bg-[var(--color-accent)] text-[#080c0a] hover:bg-[var(--color-accent-hover)]
                active:scale-95 transition-all shadow-[0_0_20px_rgba(52,211,153,0.2)]
                hover:shadow-[0_0_30px_rgba(52,211,153,0.3)] disabled:opacity-50">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            </button>

            <button onClick={goNext}
              className="p-3 rounded-xl border border-[var(--color-border)] hover:bg-[var(--color-surface-hover)]
                hover:border-[var(--color-border-hover)] transition-all active:scale-95">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          </div>

          {/* Toggle meaning */}
          <button onClick={() => setShowMeaning(!showMeaning)}
            className="mt-4 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors">
            {showMeaning ? '뜻 숨기기' : '뜻 보기'}
          </button>
        </div>

        {/* Settings Bar */}
        <div className="mt-8 rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
          <div className="flex items-center justify-between gap-4">
            {/* Auto mode toggle */}
            <button onClick={() => setIsAutoMode(!isAutoMode)}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all
                ${isAutoMode
                  ? 'bg-[var(--color-accent-muted)] text-[var(--color-accent)] border border-[var(--color-accent)]'
                  : 'border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)]'
                }`}>
              <div className={`w-2 h-2 rounded-full ${isAutoMode ? 'bg-[var(--color-accent)] animate-pulse' : 'bg-[var(--color-text-muted)]'}`} />
              자동
            </button>

            {/* Repeat count */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--color-text-muted)]">반복</span>
              <select value={repeatCount} onChange={e => setRepeatCount(Number(e.target.value))}
                className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-2 py-1.5 text-sm
                  focus:border-[var(--color-accent)] focus:outline-none">
                {[1, 2, 3, 5, 7, 10].map(n => (
                  <option key={n} value={n}>{n}회</option>
                ))}
              </select>
            </div>

            {/* Interval */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-[var(--color-text-muted)]">간격</span>
              <select value={interval} onChange={e => setIntervalTime(Number(e.target.value))}
                className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-lg px-2 py-1.5 text-sm
                  focus:border-[var(--color-accent)] focus:outline-none">
                {[1000, 1500, 2000, 3000, 5000].map(ms => (
                  <option key={ms} value={ms}>{ms / 1000}초</option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>
    </main>
  )
}
