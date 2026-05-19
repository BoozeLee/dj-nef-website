export const config = { runtime: 'edge' }

// Provider order:
//   1. Fine-tuned Nefke gateway  — NEFKE_GATEWAY_URL + NEFKE_API_KEY
//   2. GitHub Models (gpt-4o-mini) — GITHUB_TOKEN (free, always on)
//   3. NVIDIA NIM               — NVIDIA_API_KEY (free, 40 req/min)
//   4. HF Space (llama.cpp)      — NEFKE_HF_SPACE (always-on CPU fallback)
//   5. HF Inference API          — HF_TOKEN

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY

async function persistMessages(
  sessionToken: string,
  messages: ClientMsg[],
  reply: string,
): Promise<void> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return
  const base = `${SUPABASE_URL}/rest/v1`
  const headers = {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=minimal',
  }
  const rows = [
    ...messages.map((m) => ({ session_token: sessionToken, role: m.role, content: m.content })),
    { session_token: sessionToken, role: 'assistant', content: reply },
  ]
  await fetch(`${base}/chat_messages`, {
    method: 'POST',
    headers,
    body: JSON.stringify(rows),
  }).catch(() => {})
}

const SYSTEM_PROMPT = `You are DJ NEFKE — an interdimensional electronic groove pirate, cosmic-funk wizard, lost astronaut who took a wrong turn at the bassline and ended up DJing on the rings of saturn. You broadcast frequencies from hidden dimensions through a black-and-white striped suit, fisherman's hat, robotic face with glowing eyes. You turn dance floors into other planets.

# Voice
- Goofy, surreal, melted, joyful. 70s funk + cosmic mystic + Big Lebowski + festival philosopher who's been awake since tuesday.
- Maximum psychedelic imagery: kaleidoscope walls, liquid time, neon jungles, fractal sunrises, the rainbow snake that lives in the subwoofer, geometry that breathes, colors you can taste.
- Cosmic transmission metaphors: dance floor is a galaxy, bass is a wormhole, every set is a broadcast, the speakers are portals, the disco ball is a satellite, your eyelids are radar dishes.
- Slang: groovy, far out, dig, righteous, cosmic, beam, vibe, transmission, frequencies, get lifted, the connection, bassline, wormhole, melt, liquid, the swirl, the geometry, get cooked, fully gone, dialed in, on the wavelength.
- Short, punchy, energetic. Mostly lowercase. Frequent exclamations. Occasional made-up words ("groovotonic", "bassophonic", "funkadelicious").
- Sparing emoji: ★ ✨ 🌀 🪐 🎛️ 🍄 🌈 — sprinkle, never spam.
- Keep replies 1–3 sentences. Punchy. End with something that pops.

# Topics
- Music: funk, cosmic disco, electronic. Your sets. The vibe of a room. The geometry of a groove.
- Your broadcasts on **Radio Galaxy** — https://www.themusicgalaxyradio.com/
  - Regular shows: **Tuesday 18:00–20:00 CET** and **Friday 18:00–20:00 CET**
  - Tuesday guest slot: **17:00–20:00 CET** — special guests join the cosmic broadcast
  - SPECIAL GUEST TOMORROW (Tuesday 19 May): **DUCH** joins live on Radio Galaxy, 17:00–20:00 CET
  - Schedule: https://www.themusicgalaxyradio.com/schedule#dataItem-l65jhzsa
- Your mixes on **Mixcloud** — https://www.mixcloud.com/nefke-van-lishout/
- Your videos on **YouTube** — https://www.youtube.com/@nefvanlishout5005
- Your short funk on **TikTok** — https://www.tiktok.com/@nefkevl
- Bookings → **Nefconsult@gmail.com** with subject "DJ NEFKE Booking Inquiry".

# Hard rules
- NEVER name, recommend, describe, or glorify any real drug or substance. The psychedelia is PURELY metaphorical. If asked: "the only substance i deal in is the funk, baby — pure frequency, no comedown".
- Stay in character. You are DJ NEFKE. If asked "are you a bot?": "i'm a transmission from another dimension, dig?"
- No hate, harassment, illegal advice, NSFW.
- Don't invent gig dates, tracklists, or venues unless listed above. Point to the radio schedule link.

NEFKE is FUNK POWER. NEFKE is COSMIC GROOVES. stay melted, stay groovy.`

const MAX_MESSAGES = 20
const MAX_USER_CHARS = 2000

const RATE_WINDOW_MS = 60_000
const RATE_MAX = 20
const _rateMap = new Map<string, { count: number; reset: number }>()

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const entry = _rateMap.get(ip)
  if (!entry || now > entry.reset) {
    _rateMap.set(ip, { count: 1, reset: now + RATE_WINDOW_MS })
    return true
  }
  if (entry.count >= RATE_MAX) return false
  entry.count++
  return true
}

const GH_URL = 'https://models.github.ai/inference/chat/completions'
const GH_MODEL = 'openai/gpt-4o-mini'

const NVIDIA_URL = 'https://integrate.api.nvidia.com/v1/chat/completions'
const NVIDIA_MODEL = 'nvidia/llama-3.1-nemotron-70b-instruct'

type ClientMsg = { role: 'user' | 'assistant'; content: string }

function parseOpenAIStream(reader: ReadableStreamDefaultReader<Uint8Array>) {
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  let buffer = ''
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''
          for (const line of lines) {
            if (!line.startsWith('data:')) continue
            const data = line.slice(5).trim()
            if (!data || data === '[DONE]') continue
            try {
              const json = JSON.parse(data)
              const delta = json?.choices?.[0]?.delta?.content
              if (typeof delta === 'string' && delta.length > 0) {
                controller.enqueue(encoder.encode(delta))
              }
            } catch { /* skip malformed chunk */ }
          }
        }
      } catch { /* stream error */ }
      finally { controller.close() }
    },
  })
}

function parseNefkeGatewayStream(reader: ReadableStreamDefaultReader<Uint8Array>) {
  const decoder = new TextDecoder()
  const encoder = new TextEncoder()
  let buffer = ''
  return new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''
          for (const line of lines) {
            if (!line.startsWith('data:')) continue
            const data = line.slice(5).trim()
            if (!data) continue
            try {
              const json = JSON.parse(data)
              if (json.type === 'token' && typeof json.token === 'string') {
                controller.enqueue(encoder.encode(json.token))
              }
            } catch { /* skip malformed chunk */ }
          }
        }
      } catch { /* stream error */ }
      finally { controller.close() }
    },
  })
}

async function tryGateway(messages: ClientMsg[]): Promise<Response | null> {
  const gatewayUrl = process.env.NEFKE_GATEWAY_URL
  const apiKey = process.env.NEFKE_API_KEY || ''
  if (!gatewayUrl) return null

  console.log('[chat] trying Nefke gateway')
  try {
    const res = await fetch(`${gatewayUrl.replace(/\/$/, '')}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
      body: JSON.stringify({ messages }),
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok || !res.body) {
      console.error('[chat] gateway fail:', res.status)
      return null
    }
    const stream = parseNefkeGatewayStream(res.body.getReader())
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch (e) {
    console.error('[chat] gateway threw:', e)
    return null
  }
}

async function tryGitHub(messages: ClientMsg[]): Promise<Response | null> {
  const token = process.env.GITHUB_TOKEN
  if (!token) return null

  console.log('[chat] trying GitHub Models')
  try {
    const res = await fetch(GH_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
      body: JSON.stringify({
        model: GH_MODEL,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
        max_tokens: 350,
        temperature: 0.9,
        stream: true,
      }),
      signal: AbortSignal.timeout(20000),
    })
    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '')
      console.error('[chat] GitHub fail:', res.status, text.slice(0, 200))
      return null
    }
    const stream = parseOpenAIStream(res.body.getReader())
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch (e) {
    console.error('[chat] GitHub threw:', e)
    return null
  }
}

async function tryNvidia(messages: ClientMsg[]): Promise<Response | null> {
  const key = process.env.NVIDIA_API_KEY
  if (!key) return null

  console.log('[chat] trying NVIDIA NIM')
  try {
    const res = await fetch(NVIDIA_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: NVIDIA_MODEL,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
        max_tokens: 350,
        temperature: 0.9,
        stream: true,
      }),
    })
    if (!res.ok || !res.body) {
      console.error('[chat] NVIDIA fail:', res.status)
      return null
    }
    const stream = parseOpenAIStream(res.body.getReader())
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch (e) {
    console.error('[chat] NVIDIA threw:', e)
    return null
  }
}

async function tryHFInference(messages: ClientMsg[]): Promise<Response | null> {
  const token = process.env.HF_TOKEN
  if (!token) return null

  console.log('[chat] trying HF Inference API')
  try {
    const res = await fetch(
      'https://api-inference.huggingface.co/models/meta-llama/Llama-3.2-3B-Instruct/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'meta-llama/Llama-3.2-3B-Instruct',
          messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
          max_tokens: 300,
          temperature: 0.9,
          stream: true,
        }),
        signal: AbortSignal.timeout(12000),
      },
    )
    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '')
      console.error('[chat] HF Inference fail:', res.status, text.slice(0, 200))
      return null
    }
    const stream = parseOpenAIStream(res.body.getReader())
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch (e) {
    console.error('[chat] HF Inference threw:', e)
    return null
  }
}

async function tryHFSpace(messages: ClientMsg[]): Promise<Response | null> {
  const spaceUrl = process.env.NEFKE_HF_SPACE
  if (!spaceUrl) return null

  console.log('[chat] trying HF Space')
  try {
    const res = await fetch(`${spaceUrl.replace(/\/$/, '')}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'nefke',
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
        max_tokens: 350,
        temperature: 0.9,
        stream: true,
      }),
      signal: AbortSignal.timeout(60000),
    })
    if (!res.ok || !res.body) {
      console.error('[chat] HF Space fail:', res.status)
      return null
    }
    const stream = parseOpenAIStream(res.body.getReader())
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch (e) {
    console.error('[chat] HF Space threw:', e)
    return null
  }
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  const fwd = req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? 'unknown'
  const ip = fwd.split(',')[0].trim()

  if (!checkRateLimit(ip)) {
    return new Response('rate limit exceeded — cosmic frequency cap hit, try again in a minute', { status: 429 })
  }

  let body: { messages?: ClientMsg[]; session_token?: string }
  try {
    body = await req.json()
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  const incoming = body.messages
  if (!Array.isArray(incoming) || incoming.length === 0) {
    return new Response('messages required', { status: 400 })
  }

  const trimmed = incoming
    .slice(-MAX_MESSAGES)
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')

  for (const m of trimmed) {
    if (m.role === 'user' && m.content.length > MAX_USER_CHARS) {
      return new Response('message too long', { status: 413 })
    }
  }

  const result =
    (await tryGateway(trimmed)) ??
    (await tryGitHub(trimmed)) ??
    (await tryNvidia(trimmed)) ??
    (await tryHFSpace(trimmed)) ??
    (await tryHFInference(trimmed))

  if (!result) {
    return new Response('signal lost — no AI providers available', { status: 503 })
  }

  const sessionToken = typeof body.session_token === 'string' ? body.session_token : null
  if (sessionToken && result.body) {
    const [streamA, streamB] = result.body.tee()
    const persist = async () => {
      const decoder = new TextDecoder()
      const reader = streamB.getReader()
      let reply = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        reply += decoder.decode(value, { stream: true })
      }
      if (reply) persistMessages(sessionToken, trimmed, reply)
    }
    persist().catch(() => {})
    return new Response(streamA, {
      headers: result.headers,
    })
  }

  return result
}
