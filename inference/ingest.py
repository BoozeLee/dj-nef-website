#!/usr/bin/env python3
"""
Ingest DJ Nefke knowledge base into Supabase pgvector.
"""
import os
import json
import asyncio
from pathlib import Path
from supabase import create_client
import httpx

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")
OLLAMA_EMBEDDING_MODEL = os.environ.get("OLLAMA_EMBEDDING_MODEL", "nomic-embed-text")

supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

async def embed_text(text: str) -> list[float]:
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(
            f"{OLLAMA_URL}/api/embed",
            json={"model": OLLAMA_EMBEDDING_MODEL, "input": text},
        )
        r.raise_for_status()
        return r.json()["embeddings"][0]

def chunk_text(text: str, chunk_size: int = 500, overlap: int = 100) -> list[str]:
    words = text.split()
    chunks = []
    for i in range(0, len(words), chunk_size - overlap):
        chunk = " ".join(words[i:i + chunk_size])
        if chunk:
            chunks.append(chunk)
    return chunks

async def ingest_file(filepath: Path, metadata: dict = None):
    text = filepath.read_text(encoding="utf-8")
    chunks = chunk_text(text)
    
    for i, chunk in enumerate(chunks):
        embedding = await embed_text(chunk)
        data = {
            "content": chunk,
            "metadata": {
                "source": str(filepath.name),
                "chunk": i,
                **(metadata or {}),
            },
            "embedding": embedding,
        }
        supabase.table("kb_chunks").insert(data).execute()
        print(f"Ingested chunk {i+1}/{len(chunks)} from {filepath.name}")

async def main():
    kb_dir = Path("/home/kilisan/dj-nef-website")
    files = [
        kb_dir / "about.md",
        kb_dir / "NGC_SETUP.md",
    ]
    
    for f in files:
        if f.exists():
            print(f"Processing {f.name}...")
            await ingest_file(f, {"type": "knowledge_base"})
    
    print("Knowledge base ingestion complete!")

if __name__ == "__main__":
    asyncio.run(main())