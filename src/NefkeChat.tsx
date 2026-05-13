import { useEffect, useRef, useState } from 'react'

type Msg = { role: 'user' | 'assistant'; content: string }

const QUICK_PROMPTS = [
  'who are you?',
  'where can I hear your sound?',
  'when are you on the radio?',
  'I want to book you',
]

const HAS_BACKEND =
  typeof window !== 'undefined' && !/github\.io$/.test(window.location.hostname)

export function NefkeChat() {
  const [open, setOpen] = useState(false)
  const [input, setInput] = useState('')
  const [messages, setMessages] = useState<Msg[]>([])
  const [streaming, setStreaming] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: 'smooth',
    })
  }, [messages, streaming])

  const send = async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || streaming || !HAS_BACKEND) return

    const nextHistory: Msg[] = [...messages, { role: 'user', content: trimmed }]
    setMessages([...nextHistory, { role: 'assistant', content: '' }])
    setInput('')
    setError(null)
    setStreaming(true)

    const ctrl = new AbortController()
    abortRef.current = ctrl

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: nextHistory }),
        signal: ctrl.signal,
      })

      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => '')
        throw new Error(errText || `request failed (${res.status})`)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let acc = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        acc += decoder.decode(value, { stream: true })
        setMessages((prev) => {
          const next = prev.slice()
          next[next.length - 1] = { role: 'assistant', content: acc }
          return next
        })
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return
      setError((e as Error).message || 'signal lost, try again')
      setMessages((prev) => prev.slice(0, -1))
    } finally {
      setStreaming(false)
      abortRef.current = null
    }
  }

  const stop = () => {
    abortRef.current?.abort()
  }

  return (
    <>
      <button
        type="button"
        className={`nefke-chat-fab ${open ? 'is-open' : ''}`}
        aria-label={open ? 'Close chat with DJ NEFKE' : 'Chat with DJ NEFKE'}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="fab-emoji" aria-hidden="true">{open ? '×' : '🪐'}</span>
        {!open && <span className="fab-label">Talk to NEFKE</span>}
      </button>

      {open && (
        <div className="nefke-chat-panel" role="dialog" aria-label="Chat with DJ NEFKE">
          <header className="nefke-chat-header">
            <div className="nefke-chat-title">
              <span className="nefke-chat-orb" aria-hidden="true" />
              <span>DJ NEFKE</span>
              <span className="nefke-chat-status">live transmission</span>
            </div>
            <button
              type="button"
              className="nefke-chat-close"
              aria-label="Close"
              onClick={() => setOpen(false)}
            >
              ×
            </button>
          </header>

          <div ref={scrollRef} className="nefke-chat-messages">
            {messages.length === 0 && (
              <div className="nefke-chat-welcome">
                <p>
                  ★ greetings cosmic traveler ★
                  <br />
                  the funk frequencies are open. ask me anything — vibes, gigs, bookings, the cosmic connection.
                </p>
                {!HAS_BACKEND && (
                  <p className="nefke-chat-warn">
                    you're on the github.io mirror — the chat lives on{' '}
                    <a href="https://djnefke.vercel.app/" target="_blank" rel="noreferrer">
                      djnefke.vercel.app
                    </a>
                    , beam over there to talk.
                  </p>
                )}
              </div>
            )}

            {messages.map((m, i) => (
              <div key={i} className={`nefke-chat-msg nefke-chat-msg-${m.role}`}>
                <div className="nefke-chat-msg-bubble">
                  {m.content || (
                    <span className="nefke-chat-typing">
                      <span /><span /><span />
                    </span>
                  )}
                </div>
              </div>
            ))}

            {error && (
              <div className="nefke-chat-error">signal lost · {error}</div>
            )}
          </div>

          {messages.length === 0 && (
            <div className="nefke-chat-quick">
              {QUICK_PROMPTS.map((q) => (
                <button
                  key={q}
                  type="button"
                  className="nefke-chat-chip"
                  onClick={() => send(q)}
                  disabled={streaming || !HAS_BACKEND}
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          <form
            className="nefke-chat-form"
            onSubmit={(e) => {
              e.preventDefault()
              if (streaming) stop()
              else send(input)
            }}
          >
            <input
              type="text"
              className="nefke-chat-input"
              placeholder={HAS_BACKEND ? 'transmit a message…' : 'chat lives on djnefke.vercel.app'}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={!HAS_BACKEND}
              maxLength={1500}
            />
            <button
              type="submit"
              className="nefke-chat-send"
              disabled={!HAS_BACKEND || (!streaming && !input.trim())}
              aria-label={streaming ? 'Stop' : 'Send'}
            >
              {streaming ? '◼' : '▶'}
            </button>
          </form>
        </div>
      )}
    </>
  )
}
