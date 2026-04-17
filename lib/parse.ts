import type { LearnItem, LearnKind } from './types'

const uid = () => Math.random().toString(36).slice(2, 10)

const stripQuotes = (s: string) => s.replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').trim()

export const inferKind = (en: string): LearnKind => {
  const t = en.trim()
  // 문장 판정: 공백 포함 OR 종결부호 OR 20자 초과
  if (/\s/.test(t) || /[.!?]$/.test(t) || t.length > 20) return 'sentence'
  return 'word'
}

/**
 * forcedKind가 'word' | 'sentence' 이면 모든 라인을 해당 종류로.
 * 생략하거나 'auto'면 라인별 자동 감지.
 *
 * 지원 구분자: 쉼표(,) 탭(\t) 파이프(|) 등호(=) — 마지막 구분자 기준 분할
 */
export function parseList(
  text: string,
  forcedKind?: LearnKind | 'auto'
): LearnItem[] {
  return text
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0)
    .map((line): LearnItem | null => {
      // 마지막 구분자를 기준으로 en / ko 분리
      const match = line.match(/^(.+?)\s*[,\t|=]\s*(?!.*[,\t|=])(.+)$/)
      if (!match) return null
      const en = stripQuotes(match[1])
      const ko = stripQuotes(match[2])
      if (!en || !ko) return null
      const kind: LearnKind =
        !forcedKind || forcedKind === 'auto' ? inferKind(en) : forcedKind
      return { id: uid(), kind, en, ko }
    })
    .filter((x): x is LearnItem => x !== null)
}

export function serializeList(items: LearnItem[]): string {
  return items.map(i => `${i.en}, ${i.ko}`).join('\n')
}

/** 같은 kind+en(대소문자 무시)이면 뒤에 나온 것이 우선으로 남는 중복 제거 */
export function dedupe(items: LearnItem[]): LearnItem[] {
  const map = new Map<string, LearnItem>()
  for (const it of items) {
    map.set(`${it.kind}::${it.en.toLowerCase()}`, it)
  }
  return Array.from(map.values())
}
