#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BUILD_DIR="$PROJECT_DIR/.build"
DIST_DIR="$PROJECT_DIR/dist"

# Configuration
JXL_RS_REPO="https://github.com/libjxl/jxl-rs.git"
JXL_RS_BRANCH="${JXL_RS_BRANCH:-main}"

echo "=== JXL-RS WASM Build Script ==="
echo "Building from: $JXL_RS_REPO (branch: $JXL_RS_BRANCH)"

# Check for wasm-pack
if ! command -v wasm-pack &> /dev/null; then
    echo "Error: wasm-pack is not installed"
    echo "Install it with: cargo install wasm-pack"
    echo "Or: curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh"
    exit 1
fi

# Create build directory
mkdir -p "$BUILD_DIR"
mkdir -p "$DIST_DIR"

# Clone or update jxl-rs
if [ -d "$BUILD_DIR/jxl-rs" ]; then
    echo "Updating existing jxl-rs checkout..."
    cd "$BUILD_DIR/jxl-rs"
    git fetch origin
    git checkout "$JXL_RS_BRANCH"
    git pull origin "$JXL_RS_BRANCH"
else
    echo "Cloning jxl-rs..."
    git clone --depth 1 --branch "$JXL_RS_BRANCH" "$JXL_RS_REPO" "$BUILD_DIR/jxl-rs"
    cd "$BUILD_DIR/jxl-rs"
fi

# Get the commit hash for versioning
COMMIT_HASH=$(git rev-parse --short HEAD)
echo "Building from commit: $COMMIT_HASH"

# Build WASM module
echo "Building WASM module..."
cd "$BUILD_DIR/jxl-rs/jxl_wasm"

wasm-pack build --target web --release --out-dir "$BUILD_DIR/pkg"

# Copy WASM artifacts to dist
echo "Copying WASM artifacts..."
cp "$BUILD_DIR/pkg/jxl_wasm_bg.wasm" "$DIST_DIR/"
cp "$BUILD_DIR/pkg/jxl_wasm.js" "$DIST_DIR/"
cp "$BUILD_DIR/pkg/jxl_wasm.d.ts" "$DIST_DIR/"

# Copy polyfill from jxl-rs
if [ -f "$BUILD_DIR/jxl-rs/jxl_wasm/demo/polyfill.js" ]; then
    cp "$BUILD_DIR/jxl-rs/jxl_wasm/demo/polyfill.js" "$DIST_DIR/polyfill-original.js"
fi

# Write build info
cat > "$DIST_DIR/build-info.json" << EOF
{
  "builtAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "jxlRsCommit": "$COMMIT_HASH",
  "jxlRsBranch": "$JXL_RS_BRANCH"
}
EOF

echo "=== Build complete ==="
echo "WASM artifacts in: $DIST_DIR"
echo "Commit: $COMMIT_HASH"
