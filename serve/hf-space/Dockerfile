FROM ghcr.io/ggerganov/llama.cpp:server

RUN apt-get update && apt-get install -y --no-install-recommends wget ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY start.sh /start.sh
RUN chmod +x /start.sh

RUN mkdir -p /models

# Set via HF Space → Settings → Variables (not a secret — public model repo URL)
ENV HF_MODEL_URL=""
ENV MODEL_PATH="/models/nefke.gguf"

EXPOSE 7860

ENTRYPOINT ["/start.sh"]
