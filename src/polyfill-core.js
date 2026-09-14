  // Polyfill core logic (embedded in auto.js IIFE)

  const CACHE_NAME = 'jxl-polyfill-v1';
  const MAX_MEMORY_CACHE = 100;
  const memoryCache = new Map();
  const memoryCacheKeys = [];
  let persistentCache = null;
  let stats = { imagesConverted: 0, cacheHits: 0 };

  // Initialize persistent cache
  async function initPersistentCache() {
    if (persistentCache) return persistentCache;
    try {
      if (typeof caches !== 'undefined') {
        persistentCache = await caches.open(CACHE_NAME);
      }
    } catch (e) {
      // Cache API unavailable (e.g., insecure context)
    }
    return persistentCache;
  }

  // Add to memory cache with LRU eviction
  function addToMemoryCache(url, objectUrl) {
    // If already cached, remove old entry to refresh LRU position
    if (memoryCache.has(url)) {
      const idx = memoryCacheKeys.indexOf(url);
      if (idx !== -1) memoryCacheKeys.splice(idx, 1);
    }

    // Evict oldest if at capacity
    while (memoryCacheKeys.length >= MAX_MEMORY_CACHE) {
      const oldestKey = memoryCacheKeys.shift();
      const oldUrl = memoryCache.get(oldestKey);
      if (oldUrl) {
        URL.revokeObjectURL(oldUrl);
        memoryCache.delete(oldestKey);
      }
    }

    memoryCache.set(url, objectUrl);
    memoryCacheKeys.push(url);
  }

  function isJxlUrl(url) {
    if (!url) return false;
    const lower = url.toLowerCase();

    // Check for base64 data URI
    if (lower.startsWith('data:image/jxl;base64,')) return true;

    return lower.endsWith('.jxl') || lower.includes('.jxl?') || lower.includes('.jxl#');
  }

  async function decodeJxl(jxlBytes) {
    // Use Web Worker if available (non-blocking)
    if (window.JXL_WORKER && window.JXL_WORKER.decode) {
      try {
        return await window.JXL_WORKER.decode(jxlBytes);
      } catch (e) {
        console.warn('[JXL Polyfill] Worker decode failed, trying main thread:', e.message);
        // Fall through to main thread
      }
    }

    // Fallback to main thread (blocking but works everywhere)
    const wasm = window.__jxl_wasm;
    if (!wasm) throw new Error('WASM not initialized');

    try {
      return wasm.decode_jxl_to_png(jxlBytes);
    } catch (e) {
      throw new Error('WASM decode failed: ' + e.message);
    }
  }

  async function fetchAndDecode(url) {
    // Tier 1: In-memory cache
    if (memoryCache.has(url)) {
      stats.cacheHits++;
      return memoryCache.get(url);
    }

    // Tier 2: Persistent Cache API
    try {
      const pc = await initPersistentCache();
      if (pc) {
        const cached = await pc.match(url);
        if (cached) {
          const blob = await cached.blob();
          const objectUrl = URL.createObjectURL(blob);
          addToMemoryCache(url, objectUrl);
          stats.cacheHits++;
          return objectUrl;
        }
      }
    } catch (e) {
      // Cache API error, proceed to decode
    }

    // Tier 3: Fetch and decode
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);

    const jxlData = new Uint8Array(await response.arrayBuffer());
    const pngData = await decodeJxl(jxlData);

    const blob = new Blob([pngData], { type: 'image/png' });
    const objectUrl = URL.createObjectURL(blob);

    // Store in memory cache
    addToMemoryCache(url, objectUrl);

    // Store in persistent cache (non-blocking)
    try {
      const pc = await initPersistentCache();
      if (pc) {
        const pngResponse = new Response(blob.slice(), {
          headers: { 'Content-Type': 'image/png' }
        });
        pc.put(url, pngResponse).catch(() => {});
      }
    } catch (e) {
      // Cache API store failed, not critical
    }

    stats.imagesConverted++;

    return objectUrl;
  }

  async function processImg(img) {
    const src = img.getAttribute('src');
    if (!isJxlUrl(src) || img.dataset.jxlProcessed) return;

    img.dataset.jxlProcessed = 'true';

    if (src.startsWith('data:image/jxl;base64,')) {
      // Decode base64 directly
      try {
        const base64 = src.split(',')[1];
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        const pngData = await decodeJxl(bytes);
        const blob = new Blob([pngData], { type: 'image/png' });
        const pngUrl = URL.createObjectURL(blob);

        img.src = pngUrl;
        return;
      } catch (err) {
        console.error('[JXL Polyfill] Base64 decode failed:', err);
        return;
      }
    }

    try {
      const pngUrl = await fetchAndDecode(src);
      img.src = pngUrl;
    } catch (err) {
      console.error('[JXL Polyfill] Decode failed:', src, err);
    }
  }

  async function processSource(source) {
    const srcset = source.getAttribute('srcset');
    if (!isJxlUrl(srcset) || source.dataset.jxlProcessed) return;

    source.dataset.jxlProcessed = 'true';

    try {
      const pngUrl = await fetchAndDecode(srcset);
      source.srcset = pngUrl;
      source.type = 'image/png';
    } catch (err) {
      console.error('[JXL Polyfill] Decode failed:', srcset, err);
    }
  }

  async function processSvgImage(el) {
    const href = el.getAttribute('href') || el.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
    if (!isJxlUrl(href) || el.dataset.jxlProcessed) return;

    el.dataset.jxlProcessed = 'true';

    try {
      const pngUrl = await fetchAndDecode(href);
      el.setAttribute('href', pngUrl);
    } catch (err) {
      console.error('[JXL Polyfill] Decode failed:', href, err);
    }
  }

  function processBackground(el) {
    const style = getComputedStyle(el);
    const bg = style.backgroundImage;
    if (!bg || bg === 'none' || el.dataset.jxlBgProcessed) return;

    const match = bg.match(/url\\(['"]?([^'"()]+\\.jxl[^'"()]*)['"]?\\)/i);
    if (!match) return;

    el.dataset.jxlBgProcessed = 'true';

    fetchAndDecode(match[1]).then(pngUrl => {
      el.style.backgroundImage = bg.replace(match[0], `url("${pngUrl}")`);
    }).catch(err => {
      console.error('[JXL Polyfill] Background decode failed:', match[1], err);
    });
  }

  function processAll() {
    document.querySelectorAll('img').forEach(processImg);
    document.querySelectorAll('source[srcset]').forEach(processSource);
    document.querySelectorAll('image, feImage').forEach(processSvgImage);
    document.querySelectorAll('*').forEach(processBackground);
  }

  function startObserver() {
    const observer = new MutationObserver(mutations => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;

          if (node.tagName === 'IMG') processImg(node);
          else if (node.tagName === 'SOURCE') processSource(node);
          else if (node.tagName === 'IMAGE' || node.tagName === 'FEIMAGE') processSvgImage(node);

          node.querySelectorAll?.('img')?.forEach(processImg);
          node.querySelectorAll?.('source[srcset]')?.forEach(processSource);
          node.querySelectorAll?.('image, feImage')?.forEach(processSvgImage);
          processBackground(node);
        }

        if (mutation.type === 'attributes') {
          const t = mutation.target;
          if (mutation.attributeName === 'src' && t.tagName === 'IMG') {
            delete t.dataset.jxlProcessed;
            processImg(t);
          }
        }
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src', 'srcset', 'href', 'style'],
    });
  }

  function checkNativeSupport() {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => resolve(img.width === 1);
      img.onerror = () => resolve(false);
      img.src = 'data:image/jxl;base64,/woIAAAMABKIAgC4AF3lEgA=';
    });
  }

  async function clearCache() {
    // Clear memory cache and revoke all object URLs
    for (const [, objectUrl] of memoryCache) {
      URL.revokeObjectURL(objectUrl);
    }
    memoryCache.clear();
    memoryCacheKeys.length = 0;

    // Clear persistent cache
    try {
      if (typeof caches !== 'undefined') {
        await caches.delete(CACHE_NAME);
        persistentCache = null;
      }
    } catch (e) {
      // Cache API unavailable
    }
  }

  async function startPolyfill() {
    const hasNative = await checkNativeSupport();
    if (hasNative) {
      console.log('[JXL Polyfill] Native support detected, polyfill disabled');
      return;
    }

    console.log('[JXL Polyfill] Starting...');
    processAll();
    startObserver();
  }

  // Export for manual control
  window.JXLPolyfill = {
    start: startPolyfill,
    processAll,
    clearCache,
    getStats: () => ({ ...stats, cacheSize: memoryCache.size }),
  };
