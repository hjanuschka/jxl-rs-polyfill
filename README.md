# jxl-rs-polyfill

JPEG XL (JXL) polyfill for browsers without native support. Decodes JXL images to PNG/APNG using WebAssembly, powered by [jxl-rs](https://github.com/libjxl/jxl-rs).

## Features

- **Zero-config CDN usage** - Just add a script tag
- **Animation support** - Animated JXL → APNG conversion
- **Color managed** - sRGB tagging and ICC profile embedding (Display P3 and other wide-gamut images render correctly)
- **npm package** - Full control with TypeScript support
- **Automatic detection** - Skips polyfill if browser has native JXL support
- **Comprehensive coverage** - Handles `<img>`, CSS backgrounds, `<picture>`, SVG images
- **Web Worker ready** - Non-blocking decode architecture
- **Two-tier caching** - In-memory LRU plus persistent Cache API storage across page loads
- **No broken image flash** - Images stay hidden until the decoded replacement is ready

## Quick Start

### CDN (Zero Config)

Add this single line to your HTML - that's it!

```html
<script src="https://cdn.jsdelivr.net/npm/jxl-rs-polyfill/dist/auto.js"></script>
```

Then use JXL images normally:

```html
<img src="photo.jxl" alt="My photo">
```

### npm Package

```bash
npm install jxl-rs-polyfill
```

```javascript
import { JXLPolyfill } from 'jxl-rs-polyfill';

const polyfill = new JXLPolyfill();
await polyfill.start();
```

## Usage Examples

### Basic HTML

```html
<!DOCTYPE html>
<html>
<head>
  <script src="https://cdn.jsdelivr.net/npm/jxl-rs-polyfill/dist/auto.js"></script>
</head>
<body>
  <!-- These just work! -->
  <img src="photo.jxl" alt="Photo">

  <div style="background-image: url('background.jxl')"></div>

  <picture>
    <source srcset="image.jxl" type="image/jxl">
    <img src="fallback.png" alt="Fallback">
  </picture>

  <svg>
    <image href="graphic.jxl" width="200" height="150" />
  </svg>
</body>
</html>
```

### npm with Configuration

```javascript
import { JXLPolyfill } from 'jxl-rs-polyfill';

const polyfill = new JXLPolyfill({
  patchImageConstructor: true,   // Intercept new Image()
  handleCSSBackgrounds: true,    // Convert background-image
  handleSourceElements: true,    // Convert <source srcset>
  handleSVGElements: true,       // Convert SVG <image>/<feImage>
  cacheDecoded: true,            // Cache converted images
  showLoadingState: false,       // Show loading indicator
  hideWhileDecoding: true,       // Hide <img> until decode finishes (no broken icon flash)
  wasmUrl: undefined,            // Custom WASM location (see Vite section)
  verbose: false,                // Debug logging
});

await polyfill.start();

// Get statistics
console.log(polyfill.getStats());
// { imagesConverted: 5, cacheHits: 2, cacheSize: 5 }
```

### Manual Decoding

```javascript
import { decodeJxlToPng, getJxlInfo } from 'jxl-rs-polyfill';

// Decode JXL bytes to PNG
const jxlData = new Uint8Array(await file.arrayBuffer());
const pngData = await decodeJxlToPng(jxlData);

// Create blob URL for use in img.src
const blob = new Blob([pngData], { type: 'image/png' });
const url = URL.createObjectURL(blob);
document.getElementById('myImage').src = url;

// Get image info without full decode
const info = await getJxlInfo(jxlData);
console.log(info); // { width: 1920, height: 1080, numFrames: 1, hasAlpha: false }
```

### React

```jsx
import { useEffect } from 'react';
import { JXLPolyfill } from 'jxl-rs-polyfill';

function App() {
  useEffect(() => {
    const polyfill = new JXLPolyfill();
    polyfill.start();

    return () => polyfill.stop();
  }, []);

  return <img src="photo.jxl" alt="Photo" />;
}
```

### Vite

Vite's dependency pre-bundling moves the JS glue into `.vite/deps/` in dev
mode, so the relative `jxl_wasm_bg.wasm` fetch can 404. The polyfill falls
back to loading the same version from jsDelivr automatically, but for a fully
local setup use one of these:

```javascript
// Option A: pass the wasm URL explicitly
import wasmUrl from 'jxl-rs-polyfill/jxl_wasm_bg.wasm?url';
import { JXLPolyfill } from 'jxl-rs-polyfill';

new JXLPolyfill({ wasmUrl }).start();
```

```javascript
// Option B: exclude the package from pre-bundling (vite.config.js)
export default {
  optimizeDeps: {
    exclude: ['jxl-rs-polyfill'],
  },
};
```

### Next.js

```javascript
// pages/_app.js
import { useEffect } from 'react';

export default function App({ Component, pageProps }) {
  useEffect(() => {
    // Only run on client
    if (typeof window !== 'undefined') {
      import('jxl-rs-polyfill').then(({ JXLPolyfill }) => {
        const polyfill = new JXLPolyfill();
        polyfill.start();
      });
    }
  }, []);

  return <Component {...pageProps} />;
}
```

## API Reference

### `JXLPolyfill` Class

| Method | Description |
|--------|-------------|
| `start()` | Start the polyfill (async) |
| `stop()` | Stop observing DOM changes |
| `getStats()` | Get conversion statistics |

The CDN build (`auto.js`) additionally exposes `window.JXLPolyfill.clearCache()`
to clear both the in-memory cache and the persistent Cache API storage.

### Standalone Functions

| Function | Description |
|----------|-------------|
| `initWasm()` | Initialize the WASM module |
| `checkNativeJxlSupport()` | Check if browser has native JXL support |
| `decodeJxlToPng(data)` | Decode JXL Uint8Array to PNG Uint8Array |
| `getJxlInfo(data)` | Get image dimensions and metadata |
| `decodeJxlFromUrl(url)` | Fetch and decode JXL, returns PNG Blob |

## CDN Links

| File | Description | Size |
|------|-------------|------|
| `auto.js` | Self-contained, auto-starting | ~1.4MB |
| `auto-lite.js` | Requires separate WASM file | ~5KB |
| `jxl-polyfill.js` | ESM module | ~8KB |
| `jxl_wasm.js` | WASM bindings | ~15KB |
| `jxl_wasm_bg.wasm` | WASM binary | ~1.4MB |

```html
<!-- Recommended: All-in-one -->
<script src="https://cdn.jsdelivr.net/npm/jxl-rs-polyfill/dist/auto.js"></script>

<!-- Alternative: Separate files (better caching) -->
<script type="module">
  import { JXLPolyfill } from 'https://cdn.jsdelivr.net/npm/jxl-rs-polyfill/dist/jxl-polyfill.js';
  new JXLPolyfill().start();
</script>
```

## Building from Source

### Prerequisites

- [Rust](https://rustup.rs/)
- [wasm-pack](https://rustwasm.github.io/wasm-pack/installer/)
- Node.js 16+

### Build

```bash
# Clone this repo
git clone https://github.com/hjanuschka/jxl-rs-polyfill
cd jxl-rs-polyfill

# Install dependencies
npm install

# Build WASM from latest jxl-rs
npm run build:wasm

# Or build from local jxl-rs checkout
JXL_RS_DIR=~/jxl-rs bash scripts/build-wasm-local.sh

# Bundle everything
npm run build:bundle

# Full build (wasm + bundle)
npm run build
```

### Publish

```bash
# Update version
npm version patch  # or minor, major

# Build and publish
npm publish
```

## Browser Support

Works in all browsers with WebAssembly support:

| Browser | Version |
|---------|---------|
| Chrome | 57+ |
| Firefox | 52+ |
| Safari | 11+ |
| Edge | 79+ |

Native JXL support is rolling out across engines (see
[JPEG XL: When?](https://www.januschka.com/jxl-when/) for a live status page).
The polyfill auto-detects native support and disables itself:

| Browser | Native JXL |
|---------|------------|
| Safari 26+ | Available now (animated JXL still missing, the polyfill only kicks in when native decode fails) |
| Chrome / Chromium | Planned for 155 |
| Firefox | Planned for 158 |
| Ladybird | Available in development builds |

Until those releases reach your users, this polyfill bridges the gap - and it
automatically gets out of the way once native support arrives.

## License

BSD-3-Clause (same as jxl-rs)

## Credits

- [jxl-rs](https://github.com/libjxl/jxl-rs) - The Rust JXL decoder
- [libjxl](https://github.com/libjxl/libjxl) - Reference JXL implementation
