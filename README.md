# jxl-rs-polyfill

JPEG XL (JXL) polyfill for browsers without native support. Decodes JXL images to PNG using WebAssembly, powered by [jxl-rs](https://github.com/libjxl/jxl-rs).

## Features

- **Zero-config CDN usage** - Just add a script tag
- **npm package** - Full control with TypeScript support
- **Automatic detection** - Skips polyfill if browser has native JXL support
- **Comprehensive coverage** - Handles `<img>`, CSS backgrounds, `<picture>`, SVG images
- **Small footprint** - ~540KB gzipped WASM module
- **Caching** - Decoded images are cached for performance

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

Browsers with native JXL support (the polyfill auto-detects and skips):
- Safari 17+ (macOS/iOS)
- Chrome 116+ (with flag, 117+ by default planned)

## License

BSD-3-Clause (same as jxl-rs)

## Credits

- [jxl-rs](https://github.com/libjxl/jxl-rs) - The Rust JXL decoder
- [libjxl](https://github.com/libjxl/libjxl) - Reference JXL implementation
