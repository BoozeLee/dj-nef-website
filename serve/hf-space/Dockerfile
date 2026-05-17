FROM ghcr.io/ggerganov/llama.cpp:server

COPY nefke-q4_k_m.gguf /models/nefke-q4_k_m.gguf

EXPOSE 8080

CMD ["--host", "0.0.0.0", "--port", "8080", "--model", "/models/nefke-q4_k_m.gguf", "--ctx-size", "4096", "--chat-template", "chatml"]
