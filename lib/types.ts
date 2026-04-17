export interface Passage {
  id: string
  content: string
  createdAt: number
  updatedAt: number
}

export type Voice =
  | 'alloy' | 'ash' | 'ballad' | 'coral' | 'echo'
  | 'fable' | 'nova' | 'onyx' | 'sage' | 'shimmer' | 'verse'

export interface Settings {
  repeatCount: number
  speed: number
  voice: Voice
}
