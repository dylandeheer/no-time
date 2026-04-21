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

echo "Building no-time-llm (MLX Swift via xcodebuild, may take a while the first time)..."
# xcodebuild is required (not `swift build`) because SwiftPM cannot
# compile Metal shaders. MLX needs a default.metallib alongside the binary.
if ! (cd "$LLM_DIR" && rm -rf build && xcodebuild \
  -scheme no-time-llm \
  -configuration Release \
  -derivedDataPath build \
  -destination "platform=macOS,arch=arm64" \
  -skipMacroValidation \
  build >/dev/null); then
  echo "LLM sidecar build failed. Set SKIP_LLM_SIDECAR=1 to skip."
  exit 1
fi

LLM_BIN="$LLM_DIR/build/Build/Products/Release/no-time-llm"
METALLIB_BUNDLE="$LLM_DIR/build/Build/Products/Release/mlx-swift_Cmlx.bundle"

if [ ! -f "$LLM_BIN" ]; then
  echo "LLM sidecar artifact not found at $LLM_BIN. Aborting."
  exit 1
fi

if [ ! -d "$METALLIB_BUNDLE" ]; then
  echo "mlx-swift_Cmlx.bundle (metallib) not found. Aborting."
  exit 1
fi

cp "$LLM_BIN" "$OUT_DIR/no-time-llm"
chmod +x "$OUT_DIR/no-time-llm"
rm -rf "$OUT_DIR/mlx-swift_Cmlx.bundle"
cp -R "$METALLIB_BUNDLE" "$OUT_DIR/mlx-swift_Cmlx.bundle"
echo "Built: $OUT_DIR/no-time-llm (+ mlx-swift_Cmlx.bundle)"
