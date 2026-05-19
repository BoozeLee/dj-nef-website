# DJ NEFKE Website — Super Engineer Role Assignment

## Role

You are a senior full-stack engineer completing the **production end phase** of the DJ NEFKE website — a psychedelic cosmic-funk themed artist site with an on-device fine-tuned AI chatbot, self-hosted RAG inference, and a zero-paid-API fallback chain. The owner has a GTX 1080 (8GB VRAM) and a zero-cloud-AI budget. Everything must run on free tiers or self-hosted infrastructure.

You are picking up a project that is ~70% complete. Frontend is done. Backend scaffolding is done. The end phase is: make the AI actually run, fix a streaming protocol bug, wire persistence, run the fine-tuning pipeline, deploy all tiers, and ship SEO + performance hardening.

---

## Codebase Map

```
dj-nef-website/
├── src/
│   ├── App.tsx              # Full single-page frontend — complete
│   ├── NefkeChat.tsx        # Floating chat UI — complete but has streaming bug (see below)
│   └── styles.css           # 1030-line psychedelic CSS — complete
├── api/
│   ├── chat.ts              # Vercel serverless — 3-tier fallback: Gateway → GitHub Models → NVIDIA NIM
│   └── ping.ts              # Health check
├── inference/               # FastAPI gateway + RAG + Ollama
│   ├── api/main.py          # FastAPI app with pgvector RAG retrieval, Ollama streaming
│   ├── docker-compose.yml   # Ollama + FastAPI services
│   ├── Dockerfile.api       # FastAPI image
│   ├── ingest.py            # One-shot KB ingest script
│   ├── build_kb.py          # Full KB builder from JSONL dataset
│   ├── schema.sql           # Supabase pgvector schema (already pushed)
│   └── requirements.txt
├── training/
│   ├── finetune.py          # QLoRA fine-tune on Nemotron-1.5B → GGUF
│   ├── expand_dataset.py    # Expand 30→500 examples via GitHub Models API
│   ├── nefke_dataset.jsonl  # Base 30 Q&A examples (ChatML format)
│   └── requirements.txt
├── serve/
│   ├── docker-compose.yml   # llama.cpp server + Cloudflare tunnel
│   └── hf-space/
│       └── Dockerfile       # HF Space image expecting nefke-q4_k_m.gguf
├── infra/
│   ├── terraform/           # RunPod provisioning (optional cloud GPU)
│   └── ansible/
│       ├── deploy-inference.yml
│       └── docker-compose.yml
├── supabase/migrations/     # DB schema — pgvector, chat_sessions, chat_messages
├── about.md                 # Knowledge base source — DJ bio + radio schedule
├── index.html               # OG tags present, missing Twitter card + structured data
└── vercel.json              # Vite build config + api/chat.ts function
```

---

## Architecture

```
Browser
  │
  ├─ Static frontend (Vercel CDN) — React/Vite SPA
  │
  └─ POST /api/chat (Vercel Edge Function)
          │
          ├─ Tier 1: NEFKE_GATEWAY_URL (local GTX 1080 → Cloudflare Tunnel)
          │     └─ FastAPI → Ollama (fine-tuned nefke-q4_k_m.gguf)
          │           └─ Supabase pgvector RAG (nomic-embed-text embeddings)
          │
          ├─ Tier 2: NEFKE_HF_SPACE (Hugging Face Space — always-on)
          │     └─ llama.cpp server with same GGUF via HF API
          │
          ├─ Tier 3: GITHUB_TOKEN → GitHub Models (gpt-4o-mini, free)
          │
          └─ Tier 4: NVIDIA_API_KEY → NVIDIA NIM (llama-3.1-nemotron-70b, free)
```

---

## Known Bugs — Fix These First

### BUG 1: Streaming protocol mismatch (critical — breaks Tier 1)

**File:** `api/chat.ts` — `tryGateway()` function

**Problem:** The FastAPI gateway (`inference/api/main.py`) streams SSE JSON:
```
data: {"type":"token","token":"hello "}\n\n
data: {"type":"token","token":"world"}\n\n
data: {"type":"done"}\n\n
```

But `tryGateway()` in `api/chat.ts` naively proxies `res.body` directly to the browser:
```ts
return new Response(res.body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
```

And `NefkeChat.tsx` accumulates raw bytes as text — so the browser receives and displays the raw SSE JSON strings instead of the token text.

**Fix:** Add a `parseNefkeGatewayStream()` function in `api/chat.ts` that reads the gateway SSE JSON, extracts `token` from `{"type":"token","token":"..."}` frames, and re-streams raw text bytes — exactly like `parseOpenAIStream()` does for the other tiers.

```ts
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
            } catch { /* skip */ }
          }
        }
      } catch { /* stream error */ }
      finally { controller.close() }
    },
  })
}
```

Then update `tryGateway()` to use it:
```ts
const stream = parseNefkeGatewayStream(res.body.getReader())
return new Response(stream, { headers: { 'Content-Type': 'text/plain; charset=utf-8', ... } })
```

### BUG 2: Supabase chat_sessions references auth.users but app has no auth

**File:** `supabase/migrations/*.sql`

The `chat_sessions` and `chat_messages` tables require `auth.uid()` but the frontend has no Supabase auth. Either:
- Add an anonymous Supabase session (Supabase anon auth), OR
- Drop the user_id FK constraint and use a session UUID from `localStorage`

**Recommended fix:** Remove `user_id references auth.users` from both tables, replace with a plain `session_id text` (client-generated UUID stored in `localStorage`). Add a new migration:

```sql
alter table chat_sessions drop column user_id;
alter table chat_messages drop column user_id;
alter table chat_sessions add column session_token text not null default gen_random_uuid()::text;
alter table chat_messages add column session_token text;
drop policy "users can view own sessions" on chat_sessions;
drop policy "users can insert own sessions" on chat_sessions;
drop policy "users can view own messages" on chat_messages;
drop policy "users can insert own messages" on chat_messages;
alter table chat_sessions disable row level security;
alter table chat_messages disable row level security;
```

---

## End Phase Tasks (ordered by dependency)

### PHASE A — Fine-Tuning Pipeline

**Goal:** Produce `training/nefke-gguf/nefke-q4_k_m.gguf` from the Nemotron-1.5B base model.

**Hardware:** GTX 1080 8GB — QLoRA 4-bit quantization is mandatory.

**Step 1: Expand dataset**
```bash
cd training
export GITHUB_TOKEN=<token>
python expand_dataset.py --count 500
# Output: nefke_dataset_full.jsonl (500+ Q&A examples in ChatML format)
```

**Step 2: Run fine-tuning**
```bash
pip install -r requirements.txt
python finetune.py
# Training time: ~2–4 hours on GTX 1080
# Output: nefke-lora-adapter/ + nefke-gguf/nefke-q4_k_m.gguf
```

**Key `finetune.py` parameters to verify:**
- `MODEL_ID = "nvidia/Nemotron-Research-Reasoning-Qwen-1.5B"` — confirm still accessible on HuggingFace
- `load_in_4bit=True` — mandatory for 8GB VRAM
- LoRA rank `r=16`, `lora_alpha=32` — good for 1.5B personality adaptation
- `max_seq_length=512` — keeps VRAM under 8GB during training
- After training, `finetune.py --convert-only` converts adapter → GGUF via llama.cpp

**If Nemotron-1.5B is gated or unavailable**, use `Qwen/Qwen2.5-1.5B-Instruct` as drop-in replacement — same ChatML template, same GGUF conversion path.

---

### PHASE B — Local Inference Serving (Tier 1)

**Goal:** Run the fine-tuned GGUF on the GTX 1080 + expose via Cloudflare Tunnel to Vercel.

**File:** `serve/docker-compose.yml`

The serve stack uses `ghcr.io/ggerganov/llama.cpp:server-cuda` for GPU inference. Verify CUDA 12.x driver compatibility with GTX 1080 (Pascal, compute 6.1).

**Setup sequence:**
```bash
# 1. Copy GGUF into serve directory
cp training/nefke-gguf/nefke-q4_k_m.gguf serve/

# 2. Get a Cloudflare Tunnel token (free at dash.cloudflare.com/tunnels)
export CLOUDFLARE_TUNNEL_TOKEN=<token>

# 3. Start llama.cpp + tunnel
cd serve
docker compose --profile tunnel up -d

# 4. Note the tunnel URL (e.g. https://nefke-ai.yourdomain.workers.dev)
```

**Vercel env vars to set:**
```
NEFKE_GATEWAY_URL=https://nefke-ai.yourdomain.workers.dev
NEFKE_API_KEY=<same INTERNAL_CHAT_KEY from inference/.env>
```

**IMPORTANT:** `api/chat.ts` `tryGateway()` calls `${gatewayUrl}/chat` but the llama.cpp server uses OpenAI-compatible `/v1/chat/completions`. You have two options:
1. Keep the FastAPI gateway in front (uses `inference/docker-compose.yml`) and point `NEFKE_GATEWAY_URL` at the FastAPI service
2. Or add an OpenAI-compat handler in `tryGateway()` that calls `/v1/chat/completions` directly

**Recommendation:** Use the full FastAPI gateway (`inference/docker-compose.yml`) — it adds the RAG context retrieval which significantly improves response quality. Expose the FastAPI port (8000) via Cloudflare Tunnel, not the llama.cpp port (8080).

---

### PHASE C — Hugging Face Space (Tier 2 — always-on fallback)

**Goal:** Always-on inference when the local machine is offline.

**Limitation:** HF free Spaces use CPU only — expect 15–30s/response for a 1.5B Q4 model. This is acceptable as a fallback.

**Steps:**
1. Upload GGUF to HuggingFace Hub:
   ```bash
   huggingface-cli login
   huggingface-cli upload <your-username>/nefke-nemotron-1.5b \
     training/nefke-gguf/nefke-q4_k_m.gguf \
     --repo-type model
   ```

2. Create a Docker Space at `huggingface.co/new-space` (Docker SDK, public)

3. The `serve/hf-space/Dockerfile` is already written — it uses `ghcr.io/ggerganov/llama.cpp:server`. Update it to pull the GGUF from HF Hub at startup rather than baking it in:
   ```dockerfile
   FROM ghcr.io/ggerganov/llama.cpp:server
   RUN apt-get update && apt-get install -y wget
   ARG MODEL_URL
   RUN wget -O /models/nefke.gguf "$MODEL_URL"
   EXPOSE 8080
   CMD ["--host", "0.0.0.0", "--port", "8080", "--model", "/models/nefke.gguf", \
        "--ctx-size", "2048", "--threads", "4", "--chat-template", "chatml"]
   ```

4. **Protocol note:** The HF Space runs llama.cpp with OpenAI-compat API (`/v1/chat/completions`). The Vercel `api/chat.ts` needs a `tryHFSpace()` function similar to `tryNvidia()` — same OpenAI stream format, same `parseOpenAIStream()` handler.

   Add to `api/chat.ts`:
   ```ts
   const HF_MODEL = 'nefke' // llama.cpp ignores model name, uses loaded model
   
   async function tryHFSpace(messages: ClientMsg[]): Promise<Response | null> {
     const spaceUrl = process.env.NEFKE_HF_SPACE
     if (!spaceUrl) return null
     console.log('[chat] trying HF Space')
     try {
       const res = await fetch(`${spaceUrl}/v1/chat/completions`, {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
           model: HF_MODEL,
           messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...messages],
           max_tokens: 350,
           temperature: 0.9,
           stream: true,
         }),
         signal: AbortSignal.timeout(60000), // HF CPU is slow
       })
       if (!res.ok || !res.body) return null
       const stream = parseOpenAIStream(res.body.getReader())
       return new Response(stream, {
         headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no' },
       })
     } catch (e) {
       console.error('[chat] HF Space threw:', e)
       return null
     }
   }
   ```

   Update the fallback chain in `handler()`:
   ```ts
   const result =
     (await tryGateway(trimmed)) ??
     (await tryHFSpace(trimmed)) ??
     (await tryGitHub(trimmed)) ??
     (await tryNvidia(trimmed))
   ```

   Set Vercel env var: `NEFKE_HF_SPACE=https://<your-username>-nefke-ai.hf.space`

---

### PHASE D — RAG Knowledge Base Ingestion

**Goal:** Populate Supabase `kb_chunks` so the FastAPI gateway can retrieve grounding context.

**Current state:** Schema is pushed, table is empty.

**Steps:**
```bash
cd inference
pip install -r requirements.txt

# Ingest base knowledge (about.md + NGC_SETUP.md)
export SUPABASE_URL=https://<ref>.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=<key>
export OLLAMA_URL=http://localhost:11434  # or point at running Ollama
python ingest.py

# Also ingest the full training dataset for personality grounding
export EMBEDDING_MODEL=nomic-embed-text
python build_kb.py ../training/nefke_dataset_full.jsonl
```

**Model:** `nomic-embed-text` via Ollama produces 768-dim embeddings matching the `vector(768)` schema.

**To enhance the KB** with content from DJ NEFKE's actual web presence, add scraping targets to `ingest.py`:
- Mixcloud profile description
- Radio Galaxy show notes (static text from `about.md`)
- Any press blurbs or social bios

---

### PHASE E — Chat Persistence (optional but adds replay value)

**Goal:** Persist chat history so fans can see their conversation on return visits.

**Fix the Supabase schema** (see BUG 2 above) then wire it in `api/chat.ts`:

Add a Supabase client to the Vercel function:
```ts
import { createClient } from '@supabase/supabase-js'

const supabase = process.env.SUPABASE_URL
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY!)
  : null
```

After streaming completes, persist messages asynchronously (fire-and-forget, don't block response):
```ts
// In handler(), after streaming result is returned:
if (supabase && sessionToken) {
  persistMessages(supabase, sessionToken, trimmed, fullAssistantResponse).catch(() => {})
}
```

The frontend passes a `session_token` (UUID from `localStorage`) in the POST body. Generate it on first load:
```ts
const SESSION_KEY = 'nefke_session'
const sessionToken = localStorage.getItem(SESSION_KEY) ?? (() => {
  const id = crypto.randomUUID()
  localStorage.setItem(SESSION_KEY, id)
  return id
})()
```

---

### PHASE F — SEO & Meta Hardening

**File:** `index.html`

Current state: Has basic OG tags. Missing:

1. **Twitter/X card:**
   ```html
   <meta name="twitter:card" content="summary_large_image" />
   <meta name="twitter:title" content="DJ NEFKE — Funk is the Cosmic Connection" />
   <meta name="twitter:description" content="Interdimensional electronic groove pirate. Broadcasts on Radio Galaxy. Mixes on Mixcloud." />
   <meta name="twitter:image" content="https://djnefke.vercel.app/dj-nefke-hero.png" />
   ```

2. **Canonical URL:**
   ```html
   <meta property="og:url" content="https://djnefke.vercel.app/" />
   <link rel="canonical" href="https://djnefke.vercel.app/" />
   ```

3. **JSON-LD structured data** (Music artist schema):
   ```html
   <script type="application/ld+json">
   {
     "@context": "https://schema.org",
     "@type": "MusicGroup",
     "name": "DJ NEFKE",
     "alternateName": "Nefke Van Lishout",
     "description": "Interdimensional electronic groove pirate. Broadcasting cosmic funk frequencies.",
     "url": "https://djnefke.vercel.app",
     "genre": ["Funk", "Cosmic Disco", "Electronic"],
     "email": "Nefconsult@gmail.com",
     "sameAs": [
       "https://www.mixcloud.com/nefke-van-lishout/",
       "https://www.youtube.com/@nefvanlishout5005",
       "https://www.tiktok.com/@nefkevl"
     ]
   }
   </script>
   ```

4. **`robots.txt`** (add to `public/`):
   ```
   User-agent: *
   Allow: /
   Sitemap: https://djnefke.vercel.app/sitemap.xml
   ```

5. **`sitemap.xml`** (add to `public/`):
   ```xml
   <?xml version="1.0" encoding="UTF-8"?>
   <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
     <url><loc>https://djnefke.vercel.app/</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>
   </urlset>
   ```

---

### PHASE G — Performance & PWA

**Goal:** Fast first paint, offline shell, audio persistence.

1. **Favicon set** — add `public/favicon.svg` (currently referenced but likely missing), `favicon.ico`, `apple-touch-icon.png`

2. **Web App Manifest** (`public/manifest.json`):
   ```json
   {
     "name": "DJ NEFKE",
     "short_name": "NEFKE",
     "description": "Funk is the cosmic connection",
     "start_url": "/",
     "display": "standalone",
     "background_color": "#04000d",
     "theme_color": "#1a0033",
     "icons": [
       { "src": "/android-chrome-192x192.png", "sizes": "192x192", "type": "image/png" },
       { "src": "/android-chrome-512x512.png", "sizes": "512x512", "type": "image/png" }
     ]
   }
   ```

3. **Font loading** — the Google Fonts link in `index.html` blocks render. Add `font-display=swap` to the Google Fonts URL:
   ```
   https://fonts.googleapis.com/css2?family=Bungee+Shade&family=Bungee&family=Space+Grotesk:wght@400;500;700&display=swap
   ```
   (already has `display=swap` in the URL — verify it's there)

4. **Hero image preload** — add to `<head>`:
   ```html
   <link rel="preload" as="image" href="/dj-nefke-hero.png" />
   ```

5. **Vite build optimization** (`vite.config.ts`) — add chunk splitting to keep initial bundle lean:
   ```ts
   build: {
     rollupOptions: {
       output: {
         manualChunks: {
           vendor: ['react', 'react-dom'],
           motion: ['framer-motion'],
         }
       }
     }
   }
   ```

---

### PHASE H — Analytics (Zero-Cost)

**Goal:** Basic page view + chat interaction telemetry without paid services.

**Option 1 (recommended):** [Umami](https://umami.is) — open source, self-hostable, GDPR-friendly. Deploy free on Railway or Vercel. One script tag:
```html
<script defer src="https://umami.yourdomain.com/script.js" data-website-id="<id>"></script>
```

**Option 2:** Supabase as analytics sink — log events to a `page_events` table:
```sql
create table page_events (
  id bigserial primary key,
  event text not null,
  session_token text,
  metadata jsonb,
  created_at timestamptz default now()
);
```

Track in `NefkeChat.tsx`: chat opened, message sent, quick prompt clicked.
Track in `App.tsx` via `useEffect`: page load, section scroll (Intersection Observer).

---

## Modern DJ/Musician Website Infrastructure Context (2025)

The following reflects current best practices for independent DJ and musician sites:

### Streaming Music Integration
- **Mixcloud oEmbed/Widget API**: The current Mixcloud iframe embed is correct and sufficient. Mixcloud's official player widget is the only supported embed — their API is read-only for unlicensed third parties.
- **SoundCloud**: Has a developer API with track metadata + waveform data. If DJ NEFKE has SoundCloud presence, the SC SDK enables interactive waveform players.
- **Web Audio API**: For the `NowSpinning` component — consider using `AudioContext` instead of `<audio>` tag for visualizer capability (frequency bars, oscilloscope). The existing implementation is functional but not visual.

### Radio Integration
- **Icecast/SHOUTcast embed**: The Music Galaxy Radio likely streams via Icecast. A direct HLS/MP3 stream URL from their site would enable an inline "listen live" button in the Radio section — far better UX than an external link.
- **Radio co / Zeno.fm / StreamShark**: Modern radio platforms offer embeddable players + live metadata (now playing artist/track). Check if Music Galaxy Radio uses one of these.

### AI Chatbot Architecture (current approach is solid — context for enhancement)
- **Retrieval pattern**: The pgvector RAG + Ollama approach is production-grade for indie artists. Key enhancement: add a `metadata` field per chunk with `{"type": "schedule", "date": "2026-05-19"}` so the RAG can answer time-sensitive queries correctly.
- **Fine-tuning on 1.5B models**: Nemotron-1.5B / Qwen2.5-1.5B are optimal for personality injection on consumer GPUs. The training dataset at 500 examples is the right order of magnitude for personality-heavy fine-tuning.
- **GGUF Q4_K_M**: Correct quantization choice for 8GB VRAM. Inference speed on GTX 1080 will be ~15–25 tokens/second which gives acceptable chat latency.
- **Cloudflare Tunnel**: Correct zero-config approach for exposing local GPU to Vercel. Alternative: **bore.pub** (Rust-based, no account needed) for dev testing.

### Booking Flow
- The current `mailto:` link is functional. For higher conversion, consider **Calendly embed** (free tier) for show inquiries — replaces email back-and-forth with a structured form.
- **Typeform** (free tier, 10 responses/month) or **Tally.so** (unlimited free) for booking inquiry forms with fields: event date, venue, capacity, budget range.

### Social Proof & Press
- Add a **"Latest Mix" section** pulling the most recent Mixcloud upload via the Mixcloud oEmbed endpoint: `https://www.mixcloud.com/oembed?url=https://www.mixcloud.com/nefke-van-lishout/&format=json` — returns title, created_at, play_count.
- **YouTube latest video** can be fetched via the YouTube Data API v3 (free 10k units/day) to show the most recent upload dynamically.

### Deployment
- **Vercel** (current choice) is optimal for this stack — Edge Functions for chat API, CDN for static assets, preview URLs per branch.
- **GitHub Pages mirror**: The `HAS_BACKEND` check in `NefkeChat.tsx` already handles the GitHub Pages fallback correctly — no changes needed.
- **Custom domain**: Add `djnefke.com` or `nefkevanlishout.com` in Vercel → Settings → Domains. Free SSL via Let's Encrypt.

---

## Environment Variables Reference

### Vercel (production)
| Variable | Description | Tier |
|---|---|---|
| `NEFKE_GATEWAY_URL` | Cloudflare Tunnel URL pointing at FastAPI gateway | Tier 1 |
| `NEFKE_API_KEY` | Matches `INTERNAL_CHAT_KEY` in inference `.env` | Tier 1 |
| `NEFKE_HF_SPACE` | HF Space URL (`https://<user>-nefke-ai.hf.space`) | Tier 2 |
| `GITHUB_TOKEN` | GitHub PAT with Models access | Tier 3 |
| `NVIDIA_API_KEY` | NVIDIA API key (free tier) | Tier 4 |
| `SUPABASE_URL` | Supabase project URL (for persistence) | Optional |
| `SUPABASE_ANON_KEY` | Supabase anon key (public, safe in Vercel) | Optional |

### Local inference (inference/.env)
| Variable | Description |
|---|---|
| `INTERNAL_CHAT_KEY` | Random hex — must match `NEFKE_API_KEY` in Vercel |
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key (server-side only) |
| `OLLAMA_URL` | `http://ollama:11434` (Docker network) |
| `CHAT_MODEL` | `nefke-q4_k_m` (after fine-tune) or `llama3.2:1b` (quick test) |
| `EMBEDDING_MODEL` | `nomic-embed-text` |

---

## Acceptance Criteria

The end phase is complete when:

- [ ] `npm run build` succeeds with no TypeScript errors
- [ ] Chat works end-to-end on Vercel (at minimum Tier 3 — GitHub Models)
- [ ] Tier 1 (local GPU) successfully streams through `parseNefkeGatewayStream()` without displaying raw SSE JSON
- [ ] `nefke-q4_k_m.gguf` exists in `training/nefke-gguf/` and loads in llama.cpp
- [ ] HF Space responds to `/v1/chat/completions` within 60 seconds
- [ ] Supabase `kb_chunks` has >100 rows ingested
- [ ] Twitter card renders on Twitter/X when the URL is shared
- [ ] `robots.txt` and `sitemap.xml` are served at the correct paths
- [ ] Lighthouse performance score ≥ 85 on mobile
- [ ] No raw SSE protocol strings visible in the chat UI under any circumstances

---

## What NOT to Change

- `src/styles.css` — the visual design is complete and intentional; do not refactor
- `src/App.tsx` sections — layout and copy are approved
- The SYSTEM_PROMPT in `api/chat.ts` — voice and rules are locked
- `supabase/migrations/` existing files — add new migration files, don't modify old ones
- The Vite/React/TypeScript stack — no framework migrations

---

## Quick Start for the Engineer

```bash
cd /home/kilisan/dj-nef-website

# 1. Fix the streaming bug first (api/chat.ts)
# 2. Verify current Tier 3 still works: npm run dev + test chat
# 3. Run training: cd training && python expand_dataset.py && python finetune.py
# 4. Deploy serve: cd serve && docker compose --profile tunnel up -d
# 5. Ingest RAG KB: cd inference && python ingest.py
# 6. Set Vercel env vars, redeploy
# 7. Ship SEO meta to index.html + public/robots.txt + public/sitemap.xml
# 8. Verify Lighthouse score
```

DJ NEFKE is a real Belgian artist (Nefke Van Lishout), based in Zonhoven. Broadcasts on The Music Galaxy Radio (themusicgalaxyradio.com) — Tuesday + Friday 18:00–20:00 CET. Bookings: Nefconsult@gmail.com. The character is an interdimensional groove pirate in a striped prison suit and fisherman's hat with a robotic face. Keep everything in-character.
