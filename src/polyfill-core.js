  // Polyfill core logic (embedded in auto.js IIFE)

  const cache = new Map();
  let stats = { imagesConverted: 0, cacheHits: 0 };

  function isJxlUrl(url) {
    if (!url) return false;
    const lower = url.toLowerCase();
    return lower.endsWith('.jxl') || lower.includes('.jxl?') || lower.includes('.jxl#');
  }

  async function decodeJxl(jxlBytes) {
    // This function interfaces with the WASM module
    // The exact implementation depends on how wasm-bindgen generates the bindings
    // For now, we'll use a simplified approach

    const wasm = window.__jxl_wasm;
    if (!wasm) throw new Error('WASM not initialized');

    // The actual decoding needs the wasm-bindgen glue code
    // For the embedded version, we include a minimal decoder
    throw new Error('Direct WASM decoding not yet implemented in auto.js - use npm package');
  }

  async function fetchAndDecode(url) {
    if (cache.has(url)) {
      stats.cacheHits++;
      return cache.get(url);
    }

    const response = await fetch(url);
    if (!response.ok) throw new Error(`Fetch failed: ${response.status}`);

    const jxlData = new Uint8Array(await response.arrayBuffer());

    // For the auto.js version, we need to call the WASM decoder
    // This requires the wasm-bindgen generated JS glue
    const pngData = await decodeJxl(jxlData);

    const blob = new Blob([pngData], { type: 'image/png' });
    const objectUrl = URL.createObjectURL(blob);

    cache.set(url, objectUrl);
    stats.imagesConverted++;

    return objectUrl;
  }

  async function processImg(img) {
    const src = img.getAttribute('src');
    if (!isJxlUrl(src) || img.dataset.jxlProcessed) return;

    img.dataset.jxlProcessed = 'true';

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
    getStats: () => ({ ...stats, cacheSize: cache.size }),
  };
