#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BUILD_DIR="$PROJECT_DIR/crate" # Use our local crate dir
DIST_DIR="$PROJECT_DIR/dist"

echo "=== JXL-RS WASM Build Script ==="
echo "Building from local crate: $BUILD_DIR"

# Check for wasm-pack
if ! command -v wasm-pack &> /dev/null; then
    echo "Error: wasm-pack is not installed"
    exit 1
fi

mkdir -p "$DIST_DIR"

# Build WASM module
echo "Building WASM module..."
cd "$BUILD_DIR"

# Ensure we have the latest dependencies
# cargo update

wasm-pack build --target web --release --out-dir "$PROJECT_DIR/.build/pkg"

# Copy WASM artifacts to dist
echo "Copying WASM artifacts..."
cp "$PROJECT_DIR/.build/pkg/jxl_wasm_bg.wasm" "$DIST_DIR/"
cp "$PROJECT_DIR/.build/pkg/jxl_wasm.js" "$DIST_DIR/"
cp "$PROJECT_DIR/.build/pkg/jxl_wasm.d.ts" "$DIST_DIR/"

# Write build info
cat > "$DIST_DIR/build-info.json" << EOF
{
  "builtAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "source": "local-crate"
}
EOF

echo "=== Build complete ==="
echo "WASM artifacts in: $DIST_DIR"
