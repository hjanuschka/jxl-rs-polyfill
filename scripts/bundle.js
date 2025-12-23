#!/usr/bin/env node
import * as esbuild from 'esbuild';
import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectDir = dirname(__dirname);
const srcDir = join(projectDir, 'src');
const distDir = join(projectDir, 'dist');

console.log('=== Bundling JXL Polyfill ===');

// Check that WASM artifacts exist
if (!existsSync(join(distDir, 'jxl_wasm_bg.wasm'))) {
  console.error('Error: WASM artifacts not found in dist/');
  console.error('Run "npm run build:wasm" first');
  process.exit(1);
}

// Build the main polyfill module (ESM)
await esbuild.build({
  entryPoints: [join(srcDir, 'jxl-polyfill.js')],
  bundle: true,
  format: 'esm',
  outfile: join(distDir, 'jxl-polyfill.js'),
  external: ['./jxl_wasm.js', './jxl_wasm_bg.wasm'],
  minify: false,
  sourcemap: true,
});

// Build the main polyfill module (CJS)
await esbuild.build({
  entryPoints: [join(srcDir, 'jxl-polyfill.js')],
  bundle: true,
  format: 'cjs',
  outfile: join(distDir, 'jxl-polyfill.cjs'),
  external: ['./jxl_wasm.js', './jxl_wasm_bg.wasm'],
  minify: false,
  sourcemap: true,
});

// Build auto.js - self-contained bundle for CDN
// This needs to inline the WASM as base64 for truly zero-config usage
const wasmBytes = readFileSync(join(distDir, 'jxl_wasm_bg.wasm'));
const wasmBase64 = wasmBytes.toString('base64');

// Create a version of the WASM loader that uses embedded base64
const autoLoaderSrc = `
// Auto-initializing JXL polyfill for CDN usage
// Include via: <script src="https://cdn.jsdelivr.net/npm/jxl-rs-polyfill/dist/auto.js"></script>

(function() {
  'use strict';

  // Embedded WASM module (base64 encoded)
  const WASM_BASE64 = "${wasmBase64}";

  // Decode base64 to bytes
  function base64ToBytes(base64) {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  // WASM module state
  let wasmModule = null;
  let wasmReady = false;
  let initPromise = null;

  // Initialize WASM module
  async function initWasm() {
    if (initPromise) return initPromise;

    initPromise = (async () => {
      try {
        const wasmBytes = base64ToBytes(WASM_BASE64);
        const wasmModule = await WebAssembly.instantiate(wasmBytes, {});

        // The WASM module exports
        const exports = wasmModule.instance.exports;

        // Initialize memory management
        const memory = exports.memory;

        // Store exports globally
        window.__jxl_wasm = {
          memory,
          decode_jxl_to_png: exports.decode_jxl_to_png,
          __wbindgen_malloc: exports.__wbindgen_malloc,
          __wbindgen_free: exports.__wbindgen_free,
          __wbindgen_add_to_stack_pointer: exports.__wbindgen_add_to_stack_pointer,
        };

        wasmReady = true;
        console.log('[JXL Polyfill] WASM module loaded');
      } catch (e) {
        console.error('[JXL Polyfill] Failed to load WASM:', e);
        throw e;
      }
    })();

    return initPromise;
  }

${readFileSync(join(srcDir, 'polyfill-core.js'), 'utf-8')}

  // Auto-start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      initWasm().then(() => startPolyfill());
    });
  } else {
    initWasm().then(() => startPolyfill());
  }
})();
`;

writeFileSync(join(distDir, 'auto.js'), autoLoaderSrc);

// Copy TypeScript definitions
copyFileSync(join(srcDir, 'jxl-polyfill.d.ts'), join(distDir, 'jxl-polyfill.d.ts'));
copyFileSync(join(srcDir, 'auto.d.ts'), join(distDir, 'auto.d.ts'));

console.log('=== Bundle complete ===');
console.log('Files generated:');
console.log('  - dist/jxl-polyfill.js (ESM module)');
console.log('  - dist/jxl-polyfill.cjs (CommonJS module)');
console.log('  - dist/auto.js (self-contained CDN bundle)');
