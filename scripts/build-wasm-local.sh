#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DIST_DIR="$PROJECT_DIR/dist"

# Use local jxl-rs or specify via environment variable
JXL_RS_DIR="${JXL_RS_DIR:-$HOME/jxl-rs}"

echo "=== JXL-RS WASM Build Script (Local) ==="
echo "Building from: $JXL_RS_DIR"

if [ ! -d "$JXL_RS_DIR" ]; then
    echo "Error: jxl-rs directory not found at $JXL_RS_DIR"
    echo "Set JXL_RS_DIR environment variable to point to your jxl-rs checkout"
    exit 1
fi

# Check for wasm-pack
if ! command -v wasm-pack &> /dev/null; then
    echo "Error: wasm-pack is not installed"
    echo "Install it with: cargo install wasm-pack"
    exit 1
fi

mkdir -p "$DIST_DIR"

cd "$JXL_RS_DIR"

# Get the commit hash for versioning
COMMIT_HASH=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "unknown")
echo "Building from commit: $COMMIT_HASH (branch: $BRANCH)"

# Build WASM module
echo "Building WASM module..."
cd "$JXL_RS_DIR/jxl_wasm"

BUILD_OUTPUT="$PROJECT_DIR/.build/pkg"
mkdir -p "$BUILD_OUTPUT"

wasm-pack build --target web --release --out-dir "$BUILD_OUTPUT"

# Copy WASM artifacts to dist
echo "Copying WASM artifacts..."
cp "$BUILD_OUTPUT/jxl_wasm_bg.wasm" "$DIST_DIR/"
cp "$BUILD_OUTPUT/jxl_wasm.js" "$DIST_DIR/"
cp "$BUILD_OUTPUT/jxl_wasm.d.ts" "$DIST_DIR/"

# Copy polyfill from jxl-rs
if [ -f "$JXL_RS_DIR/jxl_wasm/demo/polyfill.js" ]; then
    cp "$JXL_RS_DIR/jxl_wasm/demo/polyfill.js" "$DIST_DIR/polyfill-original.js"
fi

# Write build info
cat > "$DIST_DIR/build-info.json" << EOF
{
  "builtAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "jxlRsCommit": "$COMMIT_HASH",
  "jxlRsBranch": "$BRANCH",
  "localBuild": true
}
EOF

echo "=== Build complete ==="
echo "WASM artifacts in: $DIST_DIR"
