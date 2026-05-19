#!/usr/bin/env bash
# Start the full DJ NEFKE inference stack.
# Usage:
#   ./run.sh               — start Ollama + FastAPI (no tunnel)
#   ./run.sh tunnel        — also start Cloudflare Tunnel (prints public URL)
#   ./run.sh stop          — stop all services
#   ./run.sh logs          — follow logs
#   ./run.sh pull-models   — pull Ollama models (run after start)
#   ./run.sh build-kb      — ingest KB into Supabase (run after pull-models)
#   ./run.sh status        — show healthcheck

set -e
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

GGUF="$SCRIPT_DIR/../training/nefke-gguf/nefke-q4_k_m.gguf"

case "${1:-start}" in
  stop)
    docker compose --profile tunnel down
    exit 0
    ;;
  logs)
    docker compose logs -f
    exit 0
    ;;
  status)
    echo "=== Container status ==="
    docker compose ps
    echo ""
    echo "=== Gateway healthcheck ==="
    curl -sf http://localhost:8000/healthz | python3 -m json.tool 2>/dev/null || echo "(not reachable)"
    exit 0
    ;;
  pull-models)
    echo "Pulling nomic-embed-text embedding model..."
    docker exec djnefke-ollama ollama pull nomic-embed-text
    if [ -f "$GGUF" ]; then
      echo "Registering nefke-q4_k_m with Ollama..."
      docker exec djnefke-ollama ollama create nefke-q4_k_m -f /models/Modelfile
    else
      echo "GGUF not found — pulling llama3.2:1b as quick-test fallback..."
      docker exec djnefke-ollama ollama pull llama3.2:1b
      echo "Setting CHAT_MODEL=llama3.2:1b in .env..."
      sed -i 's/^CHAT_MODEL=.*/CHAT_MODEL=llama3.2:1b/' .env
      sed -i 's/^FALLBACK_MODEL=.*/FALLBACK_MODEL=llama3.2:1b/' .env
      echo "Restart to apply: ./run.sh stop && ./run.sh start"
    fi
    exit 0
    ;;
  build-kb)
    if ! grep -q 'SUPABASE_URL=https' .env 2>/dev/null; then
      echo "ERROR: Set SUPABASE_URL in .env before running build-kb."
      exit 1
    fi
    echo "Ingesting training dataset into Supabase pgvector..."
    docker compose --profile kb run --rm build-kb \
      python /app/build_kb.py /app/../training/nefke_dataset_full.jsonl
    echo "Ingesting about.md..."
    docker compose run --rm api python /app/../ingest.py
    echo "Knowledge base populated."
    exit 0
    ;;
esac

# --- start / tunnel ---
if [ ! -f ".env" ]; then
  echo "No .env found — generating one..."
  cat > .env <<EOF
INTERNAL_CHAT_KEY=$(openssl rand -hex 32)
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
OLLAMA_URL=http://ollama:11434
CHAT_MODEL=nefke-q4_k_m
FALLBACK_MODEL=nefke-q4_k_m
EMBEDDING_MODEL=nomic-embed-text
EOF
  echo ".env created. Fill in SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY for RAG, then rerun."
  echo ""
fi

if [ ! -f "$GGUF" ]; then
  echo "NOTE: Fine-tuned GGUF not found at training/nefke-gguf/nefke-q4_k_m.gguf"
  echo "      Run './run.sh pull-models' after start to pull llama3.2:1b as a test fallback."
  echo "      To train the real model: cd training && python expand_dataset.py && python finetune.py"
  echo ""
fi

echo "Starting inference stack..."
if [ "${1:-start}" = "tunnel" ]; then
  docker compose --profile tunnel up -d --build
  echo ""
  echo "Waiting for tunnel URL..."
  sleep 6
  TUNNEL_URL=$(docker compose logs cloudflared 2>&1 | grep -o 'https://[^ ]*\.trycloudflare\.com' | tail -1)
  if [ -n "$TUNNEL_URL" ]; then
    echo ""
    echo "=== Tunnel URL ==="
    echo "$TUNNEL_URL"
    echo ""
    echo "Set on Vercel:"
    echo "  NEFKE_GATEWAY_URL=${TUNNEL_URL}"
    echo "  NEFKE_API_KEY=$(grep INTERNAL_CHAT_KEY .env | cut -d= -f2)"
  else
    echo "Tunnel starting — check URL with: ./run.sh logs"
  fi
else
  docker compose up -d --build
fi

echo ""
echo "Stack is up."
echo "  FastAPI gateway : http://localhost:8000"
echo "  Ollama          : http://localhost:11434"
echo ""
echo "Next steps:"
echo "  ./run.sh pull-models    — pull Ollama models"
echo "  ./run.sh build-kb       — populate RAG knowledge base"
echo "  ./run.sh tunnel         — restart with Cloudflare tunnel exposed"
echo ""
echo "Smoke test:"
echo "  curl -X POST http://localhost:8000/chat \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -H \"X-API-Key: \$(grep INTERNAL_CHAT_KEY .env | cut -d= -f2)\" \\"
echo "    -d '{\"messages\":[{\"role\":\"user\",\"content\":\"who are you?\"}]}'"
