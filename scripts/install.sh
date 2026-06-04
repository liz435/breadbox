#!/usr/bin/env bash
# ── Breadbox CLI installer ──────────────────────────────────────────────
#
# Downloads the latest prebuilt `breadbox` binary from GitHub Releases
# for the current platform and installs it to a directory on PATH.
#
# Usage:
#   curl -fsSL https://breadbox.dev/install.sh | bash
#   curl -fsSL https://breadbox.dev/install.sh | bash -s -- --version v0.2.0
#   curl -fsSL https://breadbox.dev/install.sh | BREADBOX_INSTALL_DIR=~/bin bash
#
# Exit codes:
#   0  success
#   1  platform unsupported
#   2  network / checksum failure
#   3  install failure (permissions, etc)

set -euo pipefail

REPO="${BREADBOX_REPO:-liz435/breadbox}"
VERSION="${BREADBOX_VERSION:-latest}"

# Parse flags
while [[ $# -gt 0 ]]; do
  case "$1" in
    --version) VERSION="$2"; shift 2 ;;
    --repo)    REPO="$2"; shift 2 ;;
    -h|--help) sed -n '2,15p' "$0"; exit 0 ;;
    *) echo "Unknown flag: $1" >&2; exit 1 ;;
  esac
done

# ── Platform detection ─────────────────────────────────────────────────
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"

case "$OS" in
  linux)  OS=linux ;;
  darwin) OS=darwin ;;
  *) echo "Unsupported OS: $OS (use install.ps1 on Windows)" >&2; exit 1 ;;
esac

case "$ARCH" in
  x86_64|amd64) ARCH=x64 ;;
  arm64|aarch64) ARCH=arm64 ;;
  *) echo "Unsupported arch: $ARCH" >&2; exit 1 ;;
esac

ASSET="breadbox-${OS}-${ARCH}"

# ── Version resolution ────────────────────────────────────────────────
if [[ "$VERSION" == "latest" ]]; then
  TAG=$(curl -fsSL "https://api.github.com/repos/${REPO}/releases/latest" \
    | grep -Eo '"tag_name":\s*"[^"]+"' \
    | head -1 \
    | sed -E 's/.*"([^"]+)".*/\1/') || { echo "Could not fetch latest release" >&2; exit 2; }
  [[ -z "$TAG" ]] && { echo "No tagged releases on ${REPO}" >&2; exit 2; }
else
  TAG="$VERSION"
fi

URL="https://github.com/${REPO}/releases/download/${TAG}/${ASSET}.tar.gz"
SHA_URL="https://github.com/${REPO}/releases/download/${TAG}/${ASSET}.tar.gz.sha256"

# ── Download + verify ─────────────────────────────────────────────────
TMPDIR="$(mktemp -d)"
trap 'rm -rf "$TMPDIR"' EXIT

echo "Downloading $ASSET @ $TAG ..."
curl -fsSL "$URL" -o "$TMPDIR/breadbox.tar.gz" \
  || { echo "Download failed: $URL" >&2; exit 2; }

# Verify checksum if sidecar exists (best-effort; skip if not published)
if curl -fsSL "$SHA_URL" -o "$TMPDIR/breadbox.tar.gz.sha256" 2>/dev/null; then
  EXPECTED="$(awk '{print $1}' "$TMPDIR/breadbox.tar.gz.sha256")"
  ACTUAL="$(shasum -a 256 "$TMPDIR/breadbox.tar.gz" | awk '{print $1}')"
  if [[ "$EXPECTED" != "$ACTUAL" ]]; then
    echo "Checksum mismatch! expected=$EXPECTED actual=$ACTUAL" >&2
    exit 2
  fi
fi

tar -xzf "$TMPDIR/breadbox.tar.gz" -C "$TMPDIR"

# ── Install destination ───────────────────────────────────────────────
INSTALL_DIR="${BREADBOX_INSTALL_DIR:-}"
if [[ -z "$INSTALL_DIR" ]]; then
  if [[ -w "/usr/local/bin" ]]; then
    INSTALL_DIR="/usr/local/bin"
  else
    INSTALL_DIR="$HOME/.local/bin"
    mkdir -p "$INSTALL_DIR"
  fi
fi

BINARY="$TMPDIR/$ASSET"
[[ -f "$BINARY" ]] || BINARY="$TMPDIR/breadbox"  # fallback if tarball top-level is named plainly
[[ -f "$BINARY" ]] || { echo "Binary not found inside tarball" >&2; exit 3; }

chmod +x "$BINARY"
install -m 755 "$BINARY" "$INSTALL_DIR/breadbox" \
  || { echo "Install to $INSTALL_DIR failed (try with sudo or set BREADBOX_INSTALL_DIR)" >&2; exit 3; }

echo ""
echo "✓ breadbox $TAG installed to $INSTALL_DIR/breadbox"
case ":$PATH:" in
  *":$INSTALL_DIR:"*) : ;;
  *) echo "⚠  $INSTALL_DIR is not on your PATH. Add this to your shell rc:"
     echo "   export PATH=\"$INSTALL_DIR:\$PATH\"" ;;
esac
echo ""
echo "Next steps:"
echo "  breadbox help                  # see commands"
echo "  breadbox setup                 # install arduino-cli + AVR core"
echo "  breadbox run \"add an LED\"      # your first circuit"
