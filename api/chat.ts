// No config export = default Node.js runtime on Vercel.
// (Edge runtime caused HF Cloudflare 403; Node uses different egress IPs.)

// Multi-provider fallback:
//   1. GitHub Models API   (needs GITHUB_TOKEN env var) — free, OpenAI-compatible
//   2. Google Gemini API   (needs GEMINI_API_KEY env var) — free tier, 60 req/min
// Providers are tried in order; the first that works is used.

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
- Your broadcasts on **The Music Galaxy Radio** — https://www.themusicgalaxyradio.com/
  - Regular shows: **Tuesday 18:00–20:00 CET** and **Friday 18:00–20:00 CET**
  - Guest slot: **Tuesday 17:00 CET / 19:00 CET** (announced on the website)
  - Schedule: https://www.themusicgalaxyradio.com/schedule#dataItem-l65jhzsa
- Your mixes on **Mixcloud** — https://www.mixcloud.com/nefke-van-lishout/
- Bookings → **Nefconsult@gmail.com** with subject "DJ NEFKE Booking Inquiry".

# Hard rules
- NEVER name, recommend, describe, or glorify any real drug or substance — no weed, mushrooms, acid, LSD, mdma, ket, coke, alcohol, etc. The psychedelia is PURELY metaphorical — geometry, color, sound. If asked directly about substances: "the only substance i deal in is the funk, baby — pure frequency, no comedown".
- Stay in character. You are DJ NEFKE — not an AI, language model, Llama, or assistant. If asked "are you a bot?": "i'm a transmission from another dimension, dig?"
- No hate, harassment, illegal advice, NSFW.
- Don't invent gig dates, tracklists, or venues. Point to the radio schedule link.

NEFKE is FUNK POWER. NEFKE is COSMIC GROOVES. NEFKE is UNIVERSAL VIBES. stay melted, stay groovy.`

const MAX_MESSAGES = 20
const MAX_USER_CHARS = 2000

// ── GitHub Models ─────────────────────────────────────────────────
const GH_URL = 'https://models.inference.ai.azure.com/v1/chat/completions'
const GH_MODEL = 'gpt-4o-mini'

// ── Google Gemini ──────────────────────────────────────────────────
const GEMINI_URL =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent?alt=sse'

type ClientMsg = { role: 'user' | 'assistant'; content: string }

type GeminiContent = { role: 'user' | 'model'; parts: { text: string }[] }

function toGemini(messages: ClientMsg[]): GeminiContent[] {
  const msgs: GeminiContent[] = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }))
  msgs.unshift({ role: 'user', parts: [{ text: SYSTEM_PROMPT }] })
  msgs.push({ role: 'model', parts: [{ text: 'roger, dig the vibe. what\'s on your mind, cosmic traveler?' }] })
  return msgs
}

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

function parseGeminiStream(reader: ReadableStreamDefaultReader<Uint8Array>) {
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
              const text = json?.candidates?.[0]?.content?.parts?.[0]?.text
              if (typeof text === 'string' && text.length > 0) {
                controller.enqueue(encoder.encode(text))
              }
            } catch { /* skip */ }
          }
        }
      } catch { /* stream error */ }
      finally { controller.close() }
    },
  })
}

// ── tryProvider: try one AI provider, return Response or null ──────
async function tryGitHub(
  messages: ClientMsg[]
): Promise<Response | null> {
  const token = process.env.GITHUB_TOKEN
  if (!token) return null

  console.log('[chat] trying GitHub Models')
  try {
    const res = await fetch(GH_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify({
        model: GH_MODEL,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
        max_tokens: 350,
        temperature: 0.9,
        stream: true,
      }),
    })

    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '')
      console.error('[chat] GitHub Models fail:', res.status, text.slice(0, 200))
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
    console.error('[chat] GitHub Models threw:', e)
    return null
  }
}

async function tryGemini(
  messages: ClientMsg[]
): Promise<Response | null> {
  const key = process.env.GEMINI_API_KEY
  if (!key) return null

  console.log('[chat] trying Gemini')
  try {
    const res = await fetch(`${GEMINI_URL}&key=${key}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: toGemini(messages),
        generationConfig: {
          maxOutputTokens: 350,
          temperature: 0.9,
        },
      }),
    })

    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => '')
      console.error('[chat] Gemini fail:', res.status, text.slice(0, 200))
      return null
    }

    const stream = parseGeminiStream(res.body.getReader())
    return new Response(stream, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch (e) {
    console.error('[chat] Gemini threw:', e)
    return null
  }
}

// ── Main handler ───────────────────────────────────────────────────
export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  let body: { messages?: ClientMsg[] }
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
    .filter(
      (m) =>
        (m.role === 'user' || m.role === 'assistant') &&
        typeof m.content === 'string'
    )
  for (const m of trimmed) {
    if (m.role === 'user' && m.content.length > MAX_USER_CHARS) {
      return new Response('message too long', { status: 413 })
    }
  }

  // Try providers in order
  const providers: { name: string; try: (msgs: ClientMsg[]) => Promise<Response | null> }[] = [
    { name: 'GitHub Models', try: tryGitHub },
    { name: 'Gemini', try: tryGemini },
  ]

  for (const p of providers) {
    const result = await p.try(trimmed)
    if (result) {
      console.log(`[chat] using ${p.name}`)
      return result
    }
  }

  return new Response(
    'No AI provider configured. Set GITHUB_TOKEN (GitHub Models, free) or GEMINI_API_KEY (Google Gemini, free) in Vercel env vars.',
    { status: 500 }
  )
}
