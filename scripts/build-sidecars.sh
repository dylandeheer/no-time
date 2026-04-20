#!/bin/bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC_DIR="$ROOT/assets/swift-src"
OUT_DIR="$ROOT/assets/bin"

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
