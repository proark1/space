# SIGNAL LOST — deploys the Python look-dev server (look-dev scenes + Audio Forge + hero portrait).
# Explicit Docker build so the deploy is DETERMINISTIC: it never depends on NIXPACKS language
# auto-detection, so the in-progress TypeScript monorepo at the repo root (apps/ + packages/ +
# root package.json) can never hijack the build. Works identically for `railway up` and a future
# GitHub-source deploy. serve.py is standard-library only — no pip install needed.
FROM python:3.12-slim

WORKDIR /app
COPY lookdev/ ./lookdev/

# Railway injects $PORT and mounts the persistent volume; serve.py reads $PORT, $HOST
# (default 0.0.0.0) and $AUDIO_DIR (set to the volume path on the service).
CMD ["python3", "lookdev/serve.py"]
