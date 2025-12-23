/**
 * Auto-lite JXL Polyfill
 * Lighter version that loads WASM from external file
 *
 * Usage:
 * <script src="https://cdn.jsdelivr.net/npm/jxl-rs-polyfill/dist/auto-lite.js"></script>
 * <script src="https://cdn.jsdelivr.net/npm/jxl-rs-polyfill/dist/jxl_wasm.js"></script>
 *
 * The WASM file will be loaded automatically from the same directory.
 */

import init, { decode_jxl_to_png } from './jxl_wasm.js';

const cache = new Map();
let wasmReady = false;

async function initWasm() {
  if (wasmReady) return;
  await init();
  wasmReady = true;
  console.log('[JXL Polyfill] WASM loaded');
}

function isJxlUrl(url) {
  if (!url) return false;
  const lower = url.toLowerCase();
  return lower.endsWith('.jxl') || lower.includes('.jxl?');
}

async function fetchAndDecode(url) {
  if (cache.has(url)) return cache.get(url);

  const response = await fetch(url);
  const jxlData = new Uint8Array(await response.arrayBuffer());
  const pngData = decode_jxl_to_png(jxlData);

  const blob = new Blob([pngData], { type: 'image/png' });
  const objectUrl = URL.createObjectURL(blob);
  cache.set(url, objectUrl);

  return objectUrl;
}

async function processImg(img) {
  const src = img.getAttribute('src');
  if (!isJxlUrl(src) || img.dataset.jxlProcessed) return;
  img.dataset.jxlProcessed = 'true';

  try {
    img.src = await fetchAndDecode(src);
  } catch (e) {
    console.error('[JXL] Failed:', src, e);
  }
}

function processAll() {
  document.querySelectorAll('img').forEach(processImg);
  document.querySelectorAll('source[srcset]').forEach(async (s) => {
    if (!isJxlUrl(s.srcset) || s.dataset.jxlProcessed) return;
    s.dataset.jxlProcessed = 'true';
    try {
      s.srcset = await fetchAndDecode(s.srcset);
    } catch (e) {
      console.error('[JXL] Failed:', s.srcset, e);
    }
  });
}

function startObserver() {
  new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        if (n.tagName === 'IMG') processImg(n);
        n.querySelectorAll?.('img')?.forEach(processImg);
      }
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
}

async function checkNativeSupport() {
  return new Promise((r) => {
    const img = new Image();
    img.onload = () => r(img.width === 1);
    img.onerror = () => r(false);
    img.src = 'data:image/jxl;base64,/woIAAAMABKIAgC4AF3lEgA=';
  });
}

async function start() {
  if (await checkNativeSupport()) {
    console.log('[JXL] Native support detected');
    return;
  }

  await initWasm();
  processAll();
  startObserver();
  console.log('[JXL Polyfill] Started');
}

// Auto-start
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start);
} else {
  start();
}

window.JXLPolyfill = { start, processAll, cache };
