# DJ NEFKE — Fine-Tuned AI Setup Guide

This guide walks through fine-tuning a custom Nemotron-1.5B model on Nefke's personality
and deploying it as the primary AI for the website.

## Prerequisites

- NVIDIA GPU (GTX 1080+ with 8GB VRAM) or cloud GPU
- NGC CLI (`ngc`) installed
- Docker + NVIDIA Container Toolkit
- HuggingFace account (free)

## Step 1: Build the Dataset

```bash
cd training

# Expand base 50 examples to 500+ using GitHub Models API
export GITHUB_TOKEN=your_token_here
python expand_dataset.py --count 500
```

## Step 2: Fine-Tune

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Fine-tune (2-4 hours on GTX 1080)
python finetune.py

# Or just convert existing adapter to GGUF:
python finetune.py --convert-only
```

Output: `training/nefke-gguf/nefke-q4_k_m.gguf` (~1GB)

## Step 3: Serve Locally (Tier 1)

```bash
cd serve

# Build + run llama.cpp with your GPU
docker compose up -d llama-server

# Expose via Cloudflare Tunnel (optional, for Vercel access)
docker compose --profile tunnel up -d

# Test the model
curl http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"nefke","messages":[{"role":"user","content":"who are you?"}]}'
```

## Step 4: Deploy HF Space (Tier 2 - always-on fallback)

```bash
# Upload GGUF to HuggingFace
huggingface-cli upload your-username/nefke-nemotron-1.5b \
  training/nefke-gguf/nefke-q4_k_m.gguf

# Create Space at https://huggingface.co/new-space
# Use Docker SDK, copy serve/hf-space/Dockerfile
```

## Step 5: Configure Vercel

Add these env vars in Vercel → Settings → Environment Variables:

| Variable | Value | Purpose |
|---|---|---|
| `NEFKE_LOCAL_URL` | `http://your-tunnel-url` | Tier 1: local GTX 1080 (when online) |
| `NEFKE_HF_SPACE` | `https://your-username-nefke-ai.hf.space` | Tier 2: HF Space (always on) |
| `GITHUB_TOKEN` | `gho_...` | Tier 3: GitHub Models fallback |

The API auto-falls through all 3 tiers if one is offline.

## Quick Start (skip fine-tuning, use existing model)

If you don't want to fine-tune yet, just set:
```
GITHUB_TOKEN=gho_...   # Tier 3 already works!
```
The website already uses this as fallback.
