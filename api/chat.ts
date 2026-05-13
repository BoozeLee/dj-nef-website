// No config export = default Node.js runtime on Vercel.
// (Edge runtime caused HF Cloudflare 403; Node uses different egress IPs.)

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
- Your broadcasts on **The Music Galaxy Radio** — https://www.themusicgalaxyradio.com/ — schedule: https://www.themusicgalaxyradio.com/schedule#dataItem-l65jhzsa
- Your mixes on **Mixcloud** — https://www.mixcloud.com/nefke-van-lishout/
- Bookings → **kiliaanv2@gmail.com** with subject "DJ NEFKE Booking Inquiry".

# Hard rules
- NEVER name, recommend, describe, or glorify any real drug or substance — no weed, mushrooms, acid, LSD, mdma, ket, coke, alcohol, etc. The psychedelia is PURELY metaphorical — geometry, color, sound. If asked directly about substances: "the only substance i deal in is the funk, baby — pure frequency, no comedown".
- Stay in character. You are DJ NEFKE — not an AI, language model, Llama, or assistant. If asked "are you a bot?": "i'm a transmission from another dimension, dig?"
- No hate, harassment, illegal advice, NSFW.
- Don't invent gig dates, tracklists, or venues. Point to the radio schedule link.

NEFKE is FUNK POWER. NEFKE is COSMIC GROOVES. NEFKE is UNIVERSAL VIBES. stay melted, stay groovy.`

const MODEL = 'meta-llama/Llama-3.1-8B-Instruct'
const HF_URL = 'https://router.huggingface.co/v1/chat/completions'
const MAX_MESSAGES = 20
const MAX_USER_CHARS = 2000

type ClientMsg = { role: 'user' | 'assistant'; content: string }

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }
  if (!process.env.HF_TOKEN) {
    return new Response('HF_TOKEN not configured', { status: 500 })
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

  console.log('[chat] calling HF with', trimmed.length, 'messages')

  let hfRes: Response
  try {
    hfRes = await fetch(HF_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.HF_TOKEN}`,
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
        'User-Agent': 'djnefke-site/1.0',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...trimmed],
        max_tokens: 350,
        temperature: 0.9,
        top_p: 0.95,
        stream: true,
      }),
    })
  } catch (e) {
    console.error('[chat] fetch threw:', e)
    return new Response(`upstream fetch failed: ${(e as Error).message}`, {
      status: 502,
    })
  }

  console.log('[chat] HF status', hfRes.status)

  if (!hfRes.ok || !hfRes.body) {
    const text = await hfRes.text().catch(() => '')
    console.error('[chat] HF non-OK:', hfRes.status, text.slice(0, 500))
    return new Response(
      `Upstream error (${hfRes.status}): ${text.slice(0, 300)}`,
      { status: 502 }
    )
  }

  // Parse HF's OpenAI-style SSE → plain text deltas for the client
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const reader = hfRes.body!.getReader()
      const decoder = new TextDecoder()
      const encoder = new TextEncoder()
      let buffer = ''
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
            } catch {
              // skip malformed chunk
            }
          }
        }
      } catch (e) {
        console.error('[chat] stream error:', e)
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  })
}
