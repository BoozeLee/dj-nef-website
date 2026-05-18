# DJ NEFKE — Super Intelligent Chatbot

A 24/7 AI chatbot for DJ NEFKE with local inference, RAG, and multi-tier fallback — all without paid APIs.

## Architecture

```
User → Vercel (Next.js) → FastAPI Gateway → Ollama (local GPU)
                                  │
                                  └── Supabase (pgvector RAG)
```

## Quick Start

### 1. Create Supabase Project

```bash
# Install Supabase CLI
npm install -g supabase

# Link to existing project or create new
supabase init
supabase link --project-ref YOUR_PROJECT_REF

# Run schema
supabase db schema push ./inference/schema.sql
```

### 2. Provision VPS

**Recommended specs:**
- GPU: RunPod L4 (24GB) $0.39/hr or Scaleway H100 $2.73/hr
- CPU: 4+ cores, 16GB RAM minimum
- Storage: 50GB+ for models

### 3. Install and Configure Inference Stack

```bash
# Clone and enter
cd dj-nef-website

# Create .env
cat > inference/.env << EOF
INTERNAL_CHAT_KEY=$(openssl rand -hex 32)
SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
EOF

# Pull models
docker run --gpus all -v ollama-data:/root/.ollama -p 11434 ollama/ollama
docker exec -it ollama-container ollama pull bartowski/Marco-o1-GGUF:Q4_K_M
docker exec -it ollama-container ollama pull Vikhrmodels/Vikhr-Gemma-2B-instruct-GGUF:Q4_K_M
docker exec -it ollama-container ollama pull nomic-embed-text

# Start stack
cd inference
docker compose up -d
```

### 4. Ingest Knowledge Base

```bash
pip install -r inference/requirements.txt
python inference/ingest.py
```

### 5. Configure Vercel

Update `vercel.json` with your VPS IP:
```json
{
  "routes": [
    {
      "src": "/api/chat",
      "dest": "https://YOUR_VPS_IP:8000/chat"
    }
  ]
}
```

## Cost Breakdown

| Tier | Monthly Cost | Features |
|------|-------------|----------|
| CPU-only (1B model) | ~$22 | Vikhr-Gemma-2B, acceptable quality |
| GPU L4 (7B model) | ~$315 | Marco-o1-GGUF, strong public UX |
| GPU 4090 (7B model) | ~$548 | Fastest quality |

## Models

| Model | Role | Size | VRAM |
|-------|------|------|------|
| Marco-o1-GGUF:Q4_K_M | Main | 4.5GB | 12GB+ |
| Vikhr-Gemma-2B:Q4_K_M | Fallback | 1.5GB | 6GB+ |
| nomic-embed-text | Embeddings | 274MB | CPU |

## API Endpoints

### POST /chat
Stream SSE responses with RAG context.

**Headers:**
```
x-api-key: <INTERNAL_CHAT_KEY>
content-type: application/json
```

**Body:**
```json
{
  "messages": [{"role": "user", "content": "Who is DJ Nefke?"}],
  "user_id": "optional-user-uuid"
}
```

### GET /healthz
Health check endpoint.

## Environment Variables

| Variable | Required | Description |
|----------|------------|-------------|
| `OLLAMA_URL` | Yes | Ollama API URL |
| `CHAT_MODEL` | Yes | Main model name |
| `FALLBACK_MODEL` | Yes | Fallback model name |
| `EMBEDDING_MODEL` | Yes | Embedding model name |
| `INTERNAL_CHAT_KEY` | Yes | Auth key for API |
| `SUPABASE_URL` | No | For RAG |
| `SUPABASE_SERVICE_ROLE_KEY` | No | For RAG |