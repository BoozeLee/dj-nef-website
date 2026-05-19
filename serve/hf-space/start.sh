#!/bin/sh
# Download model if not cached, then start llama.cpp server.
set -e

if [ ! -f "$MODEL_PATH" ]; then
  if [ -z "$HF_MODEL_URL" ]; then
    echo "ERROR: HF_MODEL_URL env var not set. Set it in HF Space → Settings → Variables."
    echo "Example: https://huggingface.co/BoozeLee/nefke-nemotron-1.5b/resolve/main/nefke-q4_k_m.gguf"
    exit 1
  fi
  echo "Downloading model from $HF_MODEL_URL ..."
  wget -q --show-progress -O "$MODEL_PATH" "$HF_MODEL_URL"
  echo "Download complete."
fi

echo "Starting llama.cpp server on port 7860..."
exec /server \
  --host 0.0.0.0 \
  --port 7860 \
  --model "$MODEL_PATH" \
  --ctx-size 2048 \
  --threads 4 \
  --chat-template chatml \
  --alias nefke
