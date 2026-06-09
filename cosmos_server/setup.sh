#!/usr/bin/env bash
# Run once on a fresh RunPod / AWS GPU instance.
# Tested on: RunPod A100 80GB, Ubuntu 22.04, CUDA 12.x

set -euo pipefail

echo "=== 1. System deps ==="
apt-get update -qq
apt-get install -y --no-install-recommends ffmpeg git curl

echo "=== 2. Python deps ==="
pip install -q --upgrade pip
pip install -q \
  fastapi "uvicorn[standard]" httpx pillow \
  "diffusers @ git+https://github.com/huggingface/diffusers.git" \
  accelerate av cosmos_guardrail \
  huggingface_hub imageio "imageio-ffmpeg" \
  torch torchvision transformers

echo "=== 3. Download Cosmos3-Nano weights (~32 GB, takes a few minutes) ==="
python - <<'EOF'
from huggingface_hub import snapshot_download
snapshot_download(
    "nvidia/Cosmos3-Nano",
    local_dir="./cosmos3-nano-weights",
    ignore_patterns=["*.pt"],   # skip raw torch checkpoints, use safetensors
)
print("Weights ready.")
EOF

echo "=== 4. Start inference server ==="
# Override model path so the server loads from the local cache.
# Run in background — redirect logs to server.log
COSMOS_MODEL="./cosmos3-nano-weights" \
  nohup uvicorn server:app --host 0.0.0.0 --port 8000 > server.log 2>&1 &

SERVER_PID=$!
echo "Server PID: $SERVER_PID"

# Wait for the model to finish loading (polls /health)
echo "Waiting for model to load (this takes ~2-3 min)..."
for i in $(seq 1 60); do
  sleep 5
  STATUS=$(curl -sf http://localhost:8000/health 2>/dev/null || true)
  if echo "$STATUS" | grep -q '"model_loaded":true'; then
    echo "Server ready at http://localhost:8000"
    exit 0
  fi
  echo "  still loading... (${i}/60)"
done

echo "ERROR: server did not become ready in 5 minutes. Check server.log"
exit 1
