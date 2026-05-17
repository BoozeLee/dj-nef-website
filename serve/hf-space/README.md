# Nefke AI - HuggingFace Space Deployment

Deploy the fine-tuned Nefke model as a free HuggingFace Space for always-on fallback inference.

## Deploy

1. **Upload the GGUF model** to HuggingFace:
   ```bash
   huggingface-cli upload your-username/nefke-nemotron-1.5b ../training/nefke-gguf/nefke-q4_k_m.gguf
   ```

2. **Create a new Space** at https://huggingface.co/new-space:
   - Name: `nefke-ai`
   - Space SDK: Docker
   - Hardware: CPU free tier

3. **Clone the Space and copy files**:
   ```bash
   git clone https://huggingface.co/spaces/your-username/nefke-ai
   cp Dockerfile nefke-ai/
   cd nefke-ai
   git add . && git commit -m "Initial deploy" && git push
   ```

4. **Update `NEFKE_HF_SPACE` env var** on Vercel:
   ```
   NEFKE_HF_SPACE=https://your-username-nefke-ai.hf.space
   ```

## How It Works

- The Space runs llama.cpp server (CPU mode)
- Exposes OpenAI-compatible `/v1/chat/completions`
- Vercel API tries this endpoint as Tier 2 fallback (after local tunnel, before GitHub Models)
- Free CPU inference is slow (~5-10 tokens/sec) but always-on

## Notes

- Free Spaces have ~30s cold start
- CPU inference on a 1.5B Q4 model is usable for chat
- Upgrade to a paid GPU Space if you need speed
