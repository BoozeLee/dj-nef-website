/// <reference types="node" />

const MAX_MESSAGES = 20
const MAX_USER_CHARS = 2000

async function streamFromGateway(messages: Array<{role: string, content: string}>): Promise<Response> {
  const gatewayUrl = process.env.NEFKE_GATEWAY_URL || 'https://api.djnefke.com'
  const apiKey = process.env.NEFKE_API_KEY || ''

  const res = await fetch(`${gatewayUrl}/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
    body: JSON.stringify({ messages }),
  })

  if (!res.ok) {
    throw new Error(`Gateway error: ${res.status}`)
  }

  return new Response(res.body, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'X-Accel-Buffering': 'no',
    },
  })
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 })
  }

  let body: { messages?: Array<{role: string, content: string}> }
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

  try {
    const stream = await streamFromGateway(trimmed)
    console.log('[chat] using Nefke Gateway')
    return stream
  } catch (e) {
    console.error('[chat] gateway failed:', e)
    return new Response('AI service unavailable', { status:503 })
  }
}