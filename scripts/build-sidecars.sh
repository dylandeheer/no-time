#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC_DIR="$ROOT/assets/swift-src"
OUT_DIR="$ROOT/assets/bin"
LLM_DIR="$ROOT/sidecars/llm"

mkdir -p "$OUT_DIR"

echo "Building no-time-calendar..."
swiftc \
  -O \
  -parse-as-library \
  -target arm64-apple-macosx13.0 \
  -framework EventKit \
  -framework Foundation \
  -o "$OUT_DIR/no-time-calendar" \
  "$SRC_DIR/no-time-calendar.swift"

echo "Built: $OUT_DIR/no-time-calendar"

if [ "${SKIP_LLM_SIDECAR:-}" = "1" ]; then
  echo "SKIP_LLM_SIDECAR=1 set, skipping LLM sidecar build."
  exit 0
fi

echo "Building no-time-llm (MLX Swift, may take a while the first time)..."
if ! (cd "$LLM_DIR" && swift build -c release --arch arm64); then
  echo "LLM sidecar build failed. Set SKIP_LLM_SIDECAR=1 to skip, or rerun with network access."
  exit 1
fi

LLM_ARTIFACT="$LLM_DIR/.build/arm64-apple-macosx/release/no-time-llm"
if [ ! -f "$LLM_ARTIFACT" ]; then
  LLM_ARTIFACT="$LLM_DIR/.build/release/no-time-llm"
fi

if [ ! -f "$LLM_ARTIFACT" ]; then
  echo "LLM sidecar artifact not found. Aborting."
  exit 1
fi

cp "$LLM_ARTIFACT" "$OUT_DIR/no-time-llm"
chmod +x "$OUT_DIR/no-time-llm"
echo "Built: $OUT_DIR/no-time-llm"
