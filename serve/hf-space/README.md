---
title: Nefke AI
emoji: 🪐
colorFrom: indigo
colorTo: purple
sdk: docker
pinned: false
license: mit
app_port: 7860
short_description: DJ NEFKE — interdimensional groove pirate chatbot
---

# Nefke AI — HuggingFace Space

Always-on CPU fallback inference for the DJ NEFKE chatbot. Runs the fine-tuned `nefke-q4_k_m.gguf` via llama.cpp, exposing an OpenAI-compatible `/v1/chat/completions` endpoint on port 7860.

## Deploy

1. **Upload the GGUF model** to HuggingFace Hub:
   ```bash
   huggingface-cli login
   huggingface-cli upload your-username/nefke-nemotron-1.5b \
     ../../training/nefke-gguf/nefke-q4_k_m.gguf \
     --repo-type model
   ```

2. **Create a new Space** at https://huggingface.co/new-space:
   - Name: `nefke-ai`
   - Space SDK: **Docker**
   - Hardware: **CPU free tier**

3. **Clone the Space and copy files**:
   ```bash
   git clone https://huggingface.co/spaces/your-username/nefke-ai
   cp Dockerfile start.sh README.md nefke-ai/
   cd nefke-ai
   git add . && git commit -m "Deploy Nefke AI" && git push
   ```

4. **Set the Space variable** (Settings → Variables, not secrets — model URL is public):
   ```
   HF_MODEL_URL = https://huggingface.co/your-username/nefke-nemotron-1.5b/resolve/main/nefke-q4_k_m.gguf
   ```

5. **Set the Vercel env var**:
   ```
   NEFKE_HF_SPACE = https://your-username-nefke-ai.hf.space
   ```

## How It Works

The Space downloads the GGUF on first boot (cached between restarts), then starts `llama-server` with the ChatML template on port 7860. The Vercel `api/chat.ts` calls `NEFKE_HF_SPACE + "/v1/chat/completions"` as Tier 2 fallback if the local GPU tunnel is unreachable.

## Performance

- Free CPU Space: ~5–10 tokens/sec for a 1.5B Q4_K_M model
- Cold start (model download + server init): ~60–90s on first request
- Subsequent requests: ~2–3s to first token
- Upgrade to a paid GPU Space for production-grade latency
