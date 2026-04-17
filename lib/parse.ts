import type { LearnItem, LearnKind } from './types'

const uid = () => Math.random().toString(36).slice(2, 10)

const stripQuotes = (s: string) =>
  s.replace(/^["'“”‘’]+|["'“”‘’]+$/g, '').trim()

const hasHangul = (s: string) => /[\uAC00-\uD7AF\u3131-\u318E]/.test(s)
const hasLatin = (s: string) => /[A-Za-z]/.test(s)

export const inferKind = (text: string): LearnKind => {
  const t = text.trim()
  // 문장 판정: 공백 포함 OR 종결부호 OR 20자 초과
  if (/\s/.test(t) || /[.!?]$/.test(t) || t.length > 20) return 'sentence'
  return 'word'
}

/**
 * 한 줄 = 한 개 학습 항목.
 * 줄 안에 쉼표/탭/|/= 로 분리된 '영-한' 또는 '한-영' 쌍이 명확하면
 * 자동으로 뜻으로 묶어서 기록. 그 외엔 줄 전체를 en 필드에 넣고 ko는 비움.
 * TTS는 en 필드를 읽으므로 영어든 한국어든 그대로 재생됨.
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
      const lhsRhs = line.match(
        /^(.+?)\s*[,\t|=]\s*(?!.*[,\t|=])(.+)$/
      )
      if (lhsRhs) {
        const lhs = stripQuotes(lhsRhs[1])
        const rhs = stripQuotes(lhsRhs[2])
        const isPair =
          (hasLatin(lhs) && hasHangul(rhs)) ||
          (hasHangul(lhs) && hasLatin(rhs))
        if (isPair && lhs && rhs) {
          // 라틴 쪽을 en, 한글 쪽을 ko로 일관성 있게 배치
          const en = hasLatin(lhs) ? lhs : rhs
          const ko = hasLatin(lhs) ? rhs : lhs
          const kind: LearnKind =
            !forcedKind || forcedKind === 'auto' ? inferKind(en) : forcedKind
          return { id: uid(), kind, en, ko }
        }
      }
      // 쌍이 아니면 줄 전체를 그대로 학습 대상으로
      const content = stripQuotes(line)
      if (!content) return null
      const kind: LearnKind =
        !forcedKind || forcedKind === 'auto' ? inferKind(content) : forcedKind
      return { id: uid(), kind, en: content, ko: '' }
    })
    .filter((x): x is LearnItem => x !== null)
}

export function serializeList(items: LearnItem[]): string {
  return items
    .map(i => (i.ko ? `${i.en}, ${i.ko}` : i.en))
    .join('\n')
}

/** 같은 kind+en(대소문자 무시)이면 뒤에 나온 것이 우선으로 남는 중복 제거 */
export function dedupe(items: LearnItem[]): LearnItem[] {
  const map = new Map<string, LearnItem>()
  for (const it of items) {
    map.set(`${it.kind}::${it.en.toLowerCase()}`, it)
  }
  return Array.from(map.values())
}
