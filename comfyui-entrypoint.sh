#!/bin/sh
set -e

CKPT_PATH="/ComfyUI/models/VFI/rife/rife47.pth"
COMFY_PORT="${PORT:-8188}"

if [ ! -f "$CKPT_PATH" ]; then
  echo "[comfyui] Downloading rife47.pth checkpoint (~170 MB)…"
  mkdir -p "$(dirname "$CKPT_PATH")"
  curl -fL \
    "https://github.com/hzwer/Practical-RIFE/releases/download/v4.7/rife47.pth" \
    -o "$CKPT_PATH" \
    && echo "[comfyui] Checkpoint downloaded." \
    || echo "[comfyui] WARNING: checkpoint download failed. RIFE will not work."
else
  echo "[comfyui] Checkpoint already present, skipping download."
fi

exec python /ComfyUI/main.py \
  --listen 0.0.0.0 \
  --port "$COMFY_PORT" \
  --cpu \
  --disable-auto-launch \
  --preview-method none
