import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'edge'

const VALID_VOICES = new Set([
  'alloy', 'ash', 'ballad', 'coral', 'echo', 'fable', 'nova', 'onyx', 'sage', 'shimmer', 'verse',
])

const MODEL = 'gpt-4o-mini-tts'

async function openaiSpeech(text: string, voice: string, speed: number) {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) throw new Error('OPENAI_API_KEY not configured')

  return fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      input: text.slice(0, 4096),
      voice,
      speed,
      response_format: 'mp3',
    }),
  })
}

const streamHeaders = {
  'Content-Type': 'audio/mpeg',
  'Cache-Control': 'public, max-age=604800, immutable',
  'X-Model': MODEL,
}

export async function GET(request: NextRequest) {
  try {
    const u = new URL(request.url)
    const text = u.searchParams.get('text') || ''
    const voice = (u.searchParams.get('voice') || 'ash').toLowerCase()
    const speed = Math.max(0.25, Math.min(4, parseFloat(u.searchParams.get('speed') || '1')))

    if (!text) return NextResponse.json({ error: 'text is required' }, { status: 400 })
    if (!VALID_VOICES.has(voice)) return NextResponse.json({ error: 'invalid voice' }, { status: 400 })

    const r = await openaiSpeech(text, voice, speed)
    if (!r.ok) {
      const msg = await r.text()
      return NextResponse.json({ error: msg }, { status: r.status })
    }

    // 스트리밍 바디를 그대로 파이프 → 브라우저가 도착하는 즉시 재생 가능
    return new NextResponse(r.body, { headers: streamHeaders })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const { text, voice = 'ash', speed = 1 } = await request.json()
    if (!text || typeof text !== 'string') {
      return NextResponse.json({ error: 'text is required' }, { status: 400 })
    }
    const v = String(voice).toLowerCase()
    if (!VALID_VOICES.has(v)) {
      return NextResponse.json({ error: 'invalid voice' }, { status: 400 })
    }
    const r = await openaiSpeech(text, v, Number(speed))
    if (!r.ok) {
      const msg = await r.text()
      return NextResponse.json({ error: msg }, { status: r.status })
    }
    return new NextResponse(r.body, { headers: streamHeaders })
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
