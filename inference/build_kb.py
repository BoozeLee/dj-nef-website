import asyncio
import json
import os
import re
from typing import Any

import httpx
from supabase import create_client
from tqdm import tqdm

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")
EMBEDDING_MODEL = os.environ.get("EMBEDDING_MODEL", "nomic-embed-text")
CHUNK_SIZE = int(os.environ.get("CHUNK_SIZE", "200"))

supabase = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)

def chunk_text(text: str, chunk_size: int = CHUNK_SIZE) -> list[str]:
    words = text.split()
    chunks = []
    for i in range(0, len(words), chunk_size):
        chunks.append(" ".join(words[i:i + chunk_size]))
    return chunks

async def embed_text(text: str) -> list[float]:
    async with httpx.AsyncClient(timeout=60) as client:
        r = await client.post(
            f"{OLLAMA_URL}/api/embed",
            json={"model": EMBEDDING_MODEL, "input": text},
        )
        r.raise_for_status()
        return r.json()["embeddings"][0]

def extract_knowledge_from_dataset(filepath: str) -> list[dict[str, Any]]:
    items = []
    with open(filepath) as f:
        for line in f:
            record = json.loads(line)
            messages = record.get("messages", [])
            for msg in messages:
                if msg.get("role") == "user":
                    items.append({"type": "qa", "data": msg["content"]})
                elif msg.get("role") == "assistant":
                    items.append({"type": "qa", "data": msg["content"]})
    return items

async def process_and_upsert(items: list[dict[str, Any]]):
    for item in tqdm(items, desc="Processing"):
        content = item.get("data", "")
        if not content:
            continue
        chunks = chunk_text(content)
        for chunk in chunks:
            embedding = await embed_text(chunk)
            embedding_str = "[" + ",".join(str(x) for x in embedding) + "]"
            supabase.table("kb_chunks").insert({
                "content": chunk,
                "embedding": embedding_str,
                "metadata": item.get("metadata", {}),
            }).execute()

async def main():
    import sys
    dataset_path = sys.argv[1] if len(sys.argv) > 1 else "/app/training/nefke_dataset.jsonl"
    items = extract_knowledge_from_dataset(dataset_path)
    await process_and_upsert(items)
    print(f"Processed {len(items)} items into knowledge base")

if __name__ == "__main__":
    asyncio.run(main())