export type LearnKind = 'word' | 'sentence'

export interface LearnItem {
  id: string
  kind: LearnKind
  en: string
  ko: string
}

export type DeckMode = 'word' | 'sentence' | 'all'

export interface Deck {
  id: string
  name: string
  items: LearnItem[]
  createdAt: number
  updatedAt: number
}

export interface Settings {
  repeatCount: number
  intervalMs: number
  voice: 'alloy' | 'echo' | 'fable' | 'nova' | 'onyx' | 'shimmer'
  speed: number
  shuffle: boolean
  autoAdvanceMs: number
  showKoreanFirst: boolean
}
