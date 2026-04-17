import type { LearnItem, LearnKind } from './types'

const uid = () => Math.random().toString(36).slice(2, 10)

const inferKind = (en: string): LearnKind => {
  const trimmed = en.trim()
  if (trimmed.includes(' ') || /[.!?]$/.test(trimmed) || trimmed.length > 20) {
    return 'sentence'
  }
  return 'word'
}

export function parseList(text: string, forcedKind?: LearnKind): LearnItem[] {
  return text
    .split('\n')
    .map(l => l.trim())
    .filter(l => l.length > 0)
    .map((line): LearnItem | null => {
      const parts = line.split(/\s*[,\t|]\s*(?=[^,\t|]*$)/)
      if (parts.length < 2) {
        const sep = line.search(/[,\t|]/)
        if (sep === -1) return null
        const en = line.slice(0, sep).trim()
        const ko = line.slice(sep + 1).trim()
        if (!en || !ko) return null
        return { id: uid(), kind: forcedKind ?? inferKind(en), en, ko }
      }
      const en = parts[0].trim()
      const ko = parts.slice(1).join(',').trim()
      if (!en || !ko) return null
      return { id: uid(), kind: forcedKind ?? inferKind(en), en, ko }
    })
    .filter((x): x is LearnItem => x !== null)
}

export function serializeList(items: LearnItem[]): string {
  return items.map(i => `${i.en}, ${i.ko}`).join('\n')
}
