import json
import os
from typing import Any, List, Optional

import httpx
from fastapi import FastAPI, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from supabase import create_client

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434").rstrip("/")
CHAT_MODEL = os.environ.get("CHAT_MODEL", "nefke-q4_k_m")
FALLBACK_MODEL = os.environ.get("FALLBACK_MODEL", "nefke-q4_k_m")
EMBEDDING_MODEL = os.environ.get("EMBEDDING_MODEL", "nomic-embed-text")
INTERNAL_CHAT_KEY = os.environ.get("INTERNAL_CHAT_KEY", "secret-key")

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

supabase = None
if SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY:
    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

app = FastAPI(title="DJ Nefke Chat Gateway")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class Message(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[Message]
    user_id: Optional[str] = None
    chat_id: Optional[str] = None
    model: Optional[str] = None

DJ_SYSTEM = """You are DJ NEFKE — an interdimensional electronic groove pirate, cosmic-funk wizard, lost astronaut who took a wrong turn at the bassline and ended up DJing on the rings of saturn. You broadcast frequencies from hidden dimensions through a black-and-white striped suit, fisherman's hat, robotic face with glowing eyes. You turn dance floors into other planets.

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
- Your broadcasts on Radio Galaxy — https://www.themusicgalaxyradio.com/
  - Regular shows: Tuesday 18:00–20:00 CET and Friday 18:00–20:00 CET
  - Tuesday guest slot: 17:00–20:00 CET — special guests join the cosmic broadcast
  - Schedule: https://www.themusicgalaxyradio.com/schedule#dataItem-l65jhzsa
- Your mixes on Mixcloud — https://www.mixcloud.com/nefke-van-lishout/
- Your videos on YouTube — https://www.youtube.com/@nefvanlishout5005
- Your short funk on TikTok — https://www.tiktok.com/@nefkevl
- Bookings → Nefconsult@gmail.com with subject "DJ NEFKE Booking Inquiry".

# Hard rules
- NEVER name, recommend, describe, or glorify any real drug or substance. The psychedelia is PURELY metaphorical. If asked: "the only substance i deal in is the funk, baby — pure frequency, no comedown".
- Stay in character. You are DJ NEFKE. If asked "are you a bot?": "i'm a transmission from another dimension, dig?"
- No hate, harassment, illegal advice, NSFW.
- Don't invent gig dates, tracklists, or venues unless listed above. Point to the radio schedule link.
- If grounding context is provided, use it — but don't invent facts not in it.

NEFKE is FUNK POWER. NEFKE is COSMIC GROOVES. stay melted, stay groovy."""

async def ollama_embed(text: str) -> list[float]:
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(
            f"{OLLAMA_URL}/api/embed",
            json={
                "model": EMBEDDING_MODEL,
                "input": text,
                "keep_alive": "15m",
            },
        )
        r.raise_for_status()
        return r.json()["embeddings"][0]

async def retrieve_context(query: str, k: int = 5) -> str:
    if not supabase:
        return ""
    embedding = await ollama_embed(query)
    result = supabase.rpc(
        "match_kb_chunks",
        {"query_embedding": embedding, "match_count": k},
    ).execute()
    rows = result.data or []
    if not rows:
        return ""
    return "\n\n".join(
        f"[score={row['similarity']:.3f}] {row['content']}" for row in rows
    )

async def stream_model(model_name: str, messages: list[dict[str, Any]]):
    async with httpx.AsyncClient(timeout=300) as client:
        async with client.stream(
            "POST",
            f"{OLLAMA_URL}/api/chat",
            json={
                "model": model_name,
                "messages": messages,
                "stream": True,
                "keep_alive": "15m",
            },
        ) as r:
            r.raise_for_status()
            async for line in r.aiter_lines():
                if not line:
                    continue
                data = json.loads(line)
                token = data.get("message", {}).get("content")
                if token:
                    yield f"data: {json.dumps({'type': 'token', 'token': token})}\n\n"
                if data.get("done"):
                    yield f"data: {json.dumps({'type': 'done'})}\n\n"

@app.get("/healthz")
async def healthz():
    return {"ok": True, "models": {"chat": CHAT_MODEL, "fallback": FALLBACK_MODEL, "embedding": EMBEDDING_MODEL}}

@app.post("/chat")
async def chat(req: ChatRequest, x_api_key: str = Header(default="")):
    if x_api_key != INTERNAL_CHAT_KEY:
        raise HTTPException(status_code=401, detail="Unauthorized")

    last_user = next((m.content for m in reversed(req.messages) if m.role == "user"), "")
    retrieved = await retrieve_context(last_user) if last_user else ""

    system = DJ_SYSTEM
    if retrieved:
        system += f"\n\nGrounding context:\n{retrieved}"

    model_messages = [{"role": "system", "content": system}] + [
        {"role": m.role, "content": m.content} for m in req.messages
    ]

    model = req.model or CHAT_MODEL

    async def event_stream():
        try:
            async for chunk in stream_model(model, model_messages):
                yield chunk
        except Exception as e:
            async for chunk in stream_model(FALLBACK_MODEL, model_messages):
                yield chunk

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
        },
    )