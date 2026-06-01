#!/usr/bin/env bash
# Regenerate the Tauri icon set from icon.svg using only macOS built-ins
# (qlmanage + sips + iconutil) plus a tiny Bun helper for the .ico.
#
# Canonical cross-platform alternative (higher quality, also writes the
# Windows Store logos): from packages/desktop run
#   bunx @tauri-apps/cli icon src-tauri/icons/icon.svg
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/../src-tauri/icons"

SVG="icon.svg"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

# 1. SVG -> 1024 base PNG via QuickLook (the only SVG rasterizer guaranteed
#    on a stock macOS box).
qlmanage -t -s 1024 -o "$TMP" "$SVG" >/dev/null 2>&1
BASE="$TMP/$SVG.png"
[ -f "$BASE" ] || { echo "qlmanage failed to render $SVG" >&2; exit 1; }

png() { sips -z "$2" "$2" "$BASE" --out "$1" >/dev/null; } # png <out> <size>

# 2. Flat PNGs referenced by tauri.conf.json's bundle.icon list.
png "32x32.png" 32
png "128x128.png" 128
png "128x128@2x.png" 256
png "icon.png" 512

# 3. macOS .icns assembled from a standard .iconset.
ICONSET="$TMP/icon.iconset"
mkdir -p "$ICONSET"
for s in 16 32 128 256 512; do
  sips -z "$s" "$s" "$BASE" --out "$ICONSET/icon_${s}x${s}.png" >/dev/null
  d=$((s * 2))
  sips -z "$d" "$d" "$BASE" --out "$ICONSET/icon_${s}x${s}@2x.png" >/dev/null
done
iconutil -c icns "$ICONSET" -o icon.icns

# 4. Windows .ico (PNG-embedded, 256x256).
sips -z 256 256 "$BASE" --out "$TMP/ico-256.png" >/dev/null
bun run "$SCRIPT_DIR/png-to-ico.ts" "$TMP/ico-256.png" icon.ico

echo "icons regenerated: 32x32.png 128x128.png 128x128@2x.png icon.png icon.icns icon.ico"
