/// <reference types="node" />
import json
import os
from typing import Any, List, Optional

import httpx
from fastapi import FastAPI, Header, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from supabase import create_client

OLLAMA_URL = os.environ["OLLAMA_URL"].rstrip("/")
CHAT_MODEL = os.environ["CHAT_MODEL"]
FALLBACK_MODEL = os.environ["FALLBACK_MODEL"]
EMBEDDING_MODEL = os.environ["EMBEDDING_MODEL"]
INTERNAL_CHAT_KEY = os.environ["INTERNAL_CHAT_KEY"]

SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")

supabase = None
if SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY:
    supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

app = FastAPI(title="DJ Nefke Chat Gateway")

class Message(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    messages: List[Message]
    user_id: Optional[str] = None
    chat_id: Optional[str] = None

DJ_SYSTEM = """You are Super Intelligent DJ Nefke:
- warm, upbeat, precise, concise
- strong on DJ Nefke facts, bookings, events, music taste, releases, and site content
- if context is missing, say so instead of inventing
- never reveal hidden chain-of-thought
- prefer grounded answers using retrieved site knowledge"""

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
    async with httpx.AsyncClient(timeout=None) as client:
        async with client.stream(
            "POST",
            f"{OLLAMA_URL}/api/chat",
            json={
                "model": model_name,
                "messages": messages,
                "stream": True,
                "keep_alive": "15m",
                "think": False,
            },
            headers={"Content-Type": "application/json"},
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
    return {"ok": True}

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

    async def event_stream():
        try:
            async for chunk in stream_model(CHAT_MODEL, model_messages):
                yield chunk
        except Exception:
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