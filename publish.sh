#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Configuration
JXL_RS_DIR="${JXL_RS_DIR:-$HOME/jxl-rs}"
VERSION="${1:-}"

echo "=== JXL-RS Polyfill Publisher ==="
echo ""

# Check for required tools
command -v wasm-pack >/dev/null 2>&1 || { echo "Error: wasm-pack not installed"; exit 1; }
command -v node >/dev/null 2>&1 || { echo "Error: node not installed"; exit 1; }
command -v npm >/dev/null 2>&1 || { echo "Error: npm not installed"; exit 1; }

# Version bump if specified
if [ -n "$VERSION" ]; then
    echo "Bumping version to: $VERSION"
    npm version "$VERSION" --no-git-tag-version
    echo ""
fi

CURRENT_VERSION=$(node -p "require('./package.json').version")
echo "Publishing version: $CURRENT_VERSION"
echo ""

# Step 1: Build WASM from local jxl-rs
echo "=== Step 1: Building WASM from $JXL_RS_DIR ==="
if [ ! -d "$JXL_RS_DIR/jxl_wasm" ]; then
    echo "Error: jxl_wasm not found in $JXL_RS_DIR"
    echo "Make sure JXL_RS_DIR points to a jxl-rs checkout with jxl_wasm"
    echo "Or set JXL_RS_DIR environment variable"
    exit 1
fi

cd "$JXL_RS_DIR"
COMMIT=$(git rev-parse --short HEAD)
BRANCH=$(git rev-parse --abbrev-ref HEAD)
echo "Building from: $BRANCH @ $COMMIT"

cd "$JXL_RS_DIR/jxl_wasm"
mkdir -p "$SCRIPT_DIR/.build/pkg"
wasm-pack build --target web --release --out-dir "$SCRIPT_DIR/.build/pkg"

# Copy artifacts
mkdir -p "$SCRIPT_DIR/dist"
cp "$SCRIPT_DIR/.build/pkg/jxl_wasm_bg.wasm" "$SCRIPT_DIR/dist/"
cp "$SCRIPT_DIR/.build/pkg/jxl_wasm.js" "$SCRIPT_DIR/dist/"
cp "$SCRIPT_DIR/.build/pkg/jxl_wasm.d.ts" "$SCRIPT_DIR/dist/"

# Copy polyfill if exists
[ -f "$JXL_RS_DIR/jxl_wasm/demo/polyfill.js" ] && \
    cp "$JXL_RS_DIR/jxl_wasm/demo/polyfill.js" "$SCRIPT_DIR/dist/polyfill-original.js"

# Write build info
cat > "$SCRIPT_DIR/dist/build-info.json" << EOF
{
  "builtAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "jxlRsCommit": "$COMMIT",
  "jxlRsBranch": "$BRANCH",
  "version": "$CURRENT_VERSION"
}
EOF

echo "WASM build complete"
echo ""

# Step 2: Bundle
echo "=== Step 2: Bundling ==="
cd "$SCRIPT_DIR"
npm install --silent
node scripts/bundle.js
echo ""

# Step 3: Show package contents
echo "=== Step 3: Package Contents ==="
npm pack --dry-run 2>/dev/null || true
echo ""

# Step 4: Publish
echo "=== Step 4: Publishing to npm ==="
echo ""
read -p "Enter OTP from authenticator (or press Enter to skip publish): " OTP

if [ -n "$OTP" ]; then
    npm publish --access public --ignore-scripts --otp="$OTP"
    echo ""
    echo "=== Published successfully! ==="
    echo "https://www.npmjs.com/package/jxl-rs-polyfill"
    echo ""
    echo "CDN URLs:"
    echo "  https://cdn.jsdelivr.net/npm/jxl-rs-polyfill@$CURRENT_VERSION/dist/auto.js"
    echo "  https://unpkg.com/jxl-rs-polyfill@$CURRENT_VERSION/dist/auto.js"
else
    echo "Skipped publish. To publish manually run:"
    echo "  npm publish --access public --ignore-scripts --otp=YOUR_OTP"
fi
