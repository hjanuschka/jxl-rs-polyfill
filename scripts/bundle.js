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

// Build auto.js - self-contained bundle for CDN with Web Worker support
const wasmBytes = readFileSync(join(distDir, 'jxl_wasm_bg.wasm'));
const wasmBase64 = wasmBytes.toString('base64');
let wasmJs = readFileSync(join(distDir, 'jxl_wasm.js'), 'utf-8');

// Patch the generated JS to be embeddable
wasmJs = wasmJs.replace(/export class/, 'class');
wasmJs = wasmJs.replace(/export function/g, 'function');
wasmJs = wasmJs.replace(/export \{.*\};/, '');
wasmJs = wasmJs.replace(/import\.meta\.url/g, '""');

// Create the worker code as a string (will be used to create Blob URL)
const workerCode = `
// JXL Decode Worker - runs decoding off the main thread
(function() {
  'use strict';
  
  const WASM_BASE64 = "${wasmBase64}";
  
  function base64ToBytes(base64) {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }
  
  // WASM glue code
  const JxlWasm = (function() {
    ${wasmJs}
    return {
      init: __wbg_init,
      decode_jxl_to_png,
      get_jxl_info
    };
  })();
  
  let wasmReady = false;
  let initPromise = null;
  
  async function initWasm() {
    if (wasmReady) return;
    if (initPromise) return initPromise;
    
    initPromise = (async () => {
      const wasmBytes = base64ToBytes(WASM_BASE64);
      await JxlWasm.init({ module_or_path: wasmBytes });
      wasmReady = true;
    })();
    
    return initPromise;
  }
  
  self.onmessage = async function(e) {
    const { type, id, data } = e.data;
    
    if (type === 'decode') {
      try {
        await initWasm();
        const pngData = JxlWasm.decode_jxl_to_png(new Uint8Array(data));
        // Transfer buffer for zero-copy
        self.postMessage({ id, pngData: pngData.buffer }, [pngData.buffer]);
      } catch (error) {
        self.postMessage({ id, error: error.message || String(error) });
      }
    }
  };
  
  self.postMessage({ type: 'ready' });
})();
`;

const autoLoaderSrc = `
// Auto-initializing JXL polyfill for CDN usage with Web Worker support
// Include via: <script src="https://cdn.jsdelivr.net/npm/jxl-rs-polyfill/dist/auto.js"></script>

(function() {
  'use strict';

  // Embedded WASM module (base64 encoded) - used for fallback if Worker fails
  const WASM_BASE64 = "${wasmBase64}";

  // Worker code as string for Blob URL
  const WORKER_CODE = ${JSON.stringify(workerCode)};

  // Decode base64 to bytes
  function base64ToBytes(base64) {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  // Web Worker management
  let worker = null;
  let workerReady = false;
  let pendingRequests = new Map();
  let useWorker = true; // Will be set to false if Worker fails

  function createWorker() {
    try {
      const blob = new Blob([WORKER_CODE], { type: 'application/javascript' });
      const workerUrl = URL.createObjectURL(blob);
      worker = new Worker(workerUrl);
      
      worker.onmessage = function(e) {
        if (e.data.type === 'ready') {
          workerReady = true;
          console.log('[JXL Polyfill] Web Worker ready');
          return;
        }
        
        const { id, pngData, error } = e.data;
        const pending = pendingRequests.get(id);
        if (pending) {
          pendingRequests.delete(id);
          if (error) {
            pending.reject(new Error(error));
          } else {
            pending.resolve(new Uint8Array(pngData));
          }
        }
      };
      
      worker.onerror = function(e) {
        console.warn('[JXL Polyfill] Worker error, falling back to main thread:', e.message);
        useWorker = false;
        worker = null;
      };
      
      return true;
    } catch (e) {
      console.warn('[JXL Polyfill] Failed to create Worker, using main thread:', e.message);
      useWorker = false;
      return false;
    }
  }

  // Decode using Worker (off main thread)
  function decodeWithWorker(jxlBytes) {
    return new Promise((resolve, reject) => {
      const id = Math.random().toString(36).slice(2) + Date.now().toString(36);
      pendingRequests.set(id, { resolve, reject });
      
      // Transfer the buffer to avoid copying
      const buffer = jxlBytes.buffer.slice(jxlBytes.byteOffset, jxlBytes.byteOffset + jxlBytes.byteLength);
      worker.postMessage({ type: 'decode', id, data: buffer }, [buffer]);
    });
  }

  // Fallback: Main thread WASM glue (only used if Worker fails)
  const JxlWasm = (function() {
    ${wasmJs}
    return {
      init: __wbg_init,
      decode_jxl_to_png,
      get_jxl_info,
      JxlInfo
    };
  })();

  let mainThreadWasmReady = false;
  let mainThreadInitPromise = null;

  async function initMainThreadWasm() {
    if (mainThreadWasmReady) return;
    if (mainThreadInitPromise) return mainThreadInitPromise;
    
    mainThreadInitPromise = (async () => {
      const wasmBytes = base64ToBytes(WASM_BASE64);
      await JxlWasm.init({ module_or_path: wasmBytes });
      mainThreadWasmReady = true;
      
      window.__jxl_wasm = {
        decode_jxl_to_png: JxlWasm.decode_jxl_to_png,
        get_jxl_info: JxlWasm.get_jxl_info
      };
    })();
    
    return mainThreadInitPromise;
  }

  // Global state
  let initPromise = null;

  // Initialize - try Worker first, fallback to main thread
  async function initWasm() {
    if (initPromise) return initPromise;

    initPromise = (async () => {
      // Try to create Worker
      if (typeof Worker !== 'undefined') {
        createWorker();
        
        // Wait a bit for worker to be ready
        await new Promise(resolve => setTimeout(resolve, 100));
        
        if (workerReady) {
          console.log('[JXL Polyfill] Using Web Worker for decoding (non-blocking)');
          // Set global flag for polyfill-core to use
          window.JXL_WORKER = {
            decode: decodeWithWorker
          };
          return;
        }
      }
      
      // Fallback to main thread
      console.log('[JXL Polyfill] Using main thread for decoding');
      await initMainThreadWasm();
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
console.log('  - dist/auto.js (self-contained CDN bundle with Web Worker)');
