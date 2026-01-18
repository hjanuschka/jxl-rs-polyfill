/**
 * JXL Polyfill - JPEG XL support for browsers without native support
 *
 * @example
 * // ESM import
 * import { JXLPolyfill, decodeJxlToPng } from 'jxl-rs-polyfill';
 *
 * // Start automatic polyfill
 * const polyfill = new JXLPolyfill();
 * await polyfill.start();
 *
 * // Or decode manually
 * const pngBytes = await decodeJxlToPng(jxlBytes);
 */

import init, { decode_jxl_to_png, get_jxl_info } from './jxl_wasm.js';

let wasmInitialized = false;
let initPromise = null;

/**
 * Initialize the WASM module
 * @param {string | URL | Request | BufferSource | WebAssembly.Module} [moduleOrPath] - Custom WASM source
 * @returns {Promise<void>}
 */
export async function initWasm(moduleOrPath) {
  if (wasmInitialized) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    await init(moduleOrPath);
    wasmInitialized = true;
  })();

  return initPromise;
}

/**
 * Check if the current browser natively supports JXL
 * @returns {Promise<boolean>}
 */
export async function checkNativeJxlSupport() {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img.width === 1);
    img.onerror = () => resolve(false);
    // Minimal 1x1 JXL image
    img.src = 'data:image/jxl;base64,/woIAAAMABKIAgC4AF3lEgA=';
  });
}

/**
 * Decode a JXL image to PNG
 * @param {Uint8Array} jxlData - The JXL image bytes
 * @returns {Promise<Uint8Array>} - The PNG image bytes
 */
export async function decodeJxlToPng(jxlData) {
  await initWasm();
  return decode_jxl_to_png(jxlData);
}

/**
 * Get information about a JXL image
 * @param {Uint8Array} jxlData - The JXL image bytes
 * @returns {Promise<{width: number, height: number, numFrames: number, hasAlpha: boolean}>}
 */
export async function getJxlInfo(jxlData) {
  await initWasm();
  const info = get_jxl_info(jxlData);
  return {
    width: info.width,
    height: info.height,
    numFrames: info.num_frames,
    hasAlpha: info.has_alpha,
  };
}

/**
 * Decode a JXL image from a URL
 * @param {string} url - URL to the JXL image
 * @returns {Promise<Blob>} - PNG blob
 */
export async function decodeJxlFromUrl(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.status}`);
  }
  const jxlData = new Uint8Array(await response.arrayBuffer());
  const pngData = await decodeJxlToPng(jxlData);
  return new Blob([pngData], { type: 'image/png' });
}

/**
 * JXL Polyfill class for automatic image conversion
 */
export class JXLPolyfill {
  /**
   * @param {Object} options
   * @param {boolean} [options.patchImageConstructor=true] - Intercept new Image()
   * @param {boolean} [options.handleCSSBackgrounds=true] - Convert CSS background-image
   * @param {boolean} [options.handleSourceElements=true] - Convert <source srcset>
   * @param {boolean} [options.handleSVGElements=true] - Convert SVG <image>/<feImage>
   * @param {boolean} [options.cacheDecoded=true] - Cache decoded images
   * @param {boolean} [options.showLoadingState=false] - Show loading indicator
   * @param {boolean} [options.verbose=false] - Enable debug logging
   */
  constructor(options = {}) {
    this.options = {
      patchImageConstructor: true,
      handleCSSBackgrounds: true,
      handleSourceElements: true,
      handleSVGElements: true,
      cacheDecoded: true,
      showLoadingState: false,
      verbose: false,
      ...options,
    };

    this.cache = new Map();
    this.observer = null;
    this.started = false;
    this.hasNativeSupport = null;
    this.stats = {
      imagesConverted: 0,
      bytesSaved: 0,
      cacheHits: 0,
    };
  }

  log(...args) {
    if (this.options.verbose) {
      console.log('[JXL Polyfill]', ...args);
    }
  }

  /**
   * Start the polyfill
   * @returns {Promise<void>}
   */
  async start() {
    if (this.started) return;

    // Check for native support
    this.hasNativeSupport = await checkNativeJxlSupport();
    if (this.hasNativeSupport) {
      this.log('Native JXL support detected, polyfill not needed');
      return;
    }

    // Initialize WASM
    await initWasm();
    this.log('WASM module initialized');

    // Patch Image constructor
    if (this.options.patchImageConstructor) {
      this.patchImageConstructor();
    }

    // Process existing elements
    this.processExistingElements();

    // Start observing DOM changes
    this.startObserver();

    this.started = true;
    this.log('Polyfill started');
  }

  /**
   * Stop the polyfill
   */
  stop() {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
    this.started = false;
    this.log('Polyfill stopped');
  }

  /**
   * Get polyfill statistics
   * @returns {{imagesConverted: number, bytesSaved: number, cacheHits: number, cacheSize: number}}
   */
  getStats() {
    return {
      ...this.stats,
      cacheSize: this.cache.size,
    };
  }

  isJxlUrl(url) {
    if (!url) return false;
    const lower = url.toLowerCase();
    return lower.endsWith('.jxl') || lower.includes('.jxl?') || lower.includes('.jxl#');
  }

  async getCachedOrDecode(url) {
    if (this.options.cacheDecoded && this.cache.has(url)) {
      this.stats.cacheHits++;
      return this.cache.get(url);
    }

    const pngBlob = await decodeJxlFromUrl(url);
    const objectUrl = URL.createObjectURL(pngBlob);

    if (this.options.cacheDecoded) {
      this.cache.set(url, objectUrl);
    }

    this.stats.imagesConverted++;
    return objectUrl;
  }

  patchImageConstructor() {
    const polyfill = this;
    const OriginalImage = window.Image;

    window.Image = function(width, height) {
      const img = new OriginalImage(width, height);

      const originalSrcDescriptor = Object.getOwnPropertyDescriptor(
        HTMLImageElement.prototype,
        'src'
      );

      Object.defineProperty(img, 'src', {
        get() {
          return originalSrcDescriptor.get.call(this);
        },
        set(value) {
          if (polyfill.isJxlUrl(value)) {
            polyfill.log('Intercepted Image.src:', value);
            polyfill.getCachedOrDecode(value).then((pngUrl) => {
              originalSrcDescriptor.set.call(this, pngUrl);
            }).catch((err) => {
              console.error('[JXL Polyfill] Failed to decode:', err);
              originalSrcDescriptor.set.call(this, value);
            });
          } else {
            originalSrcDescriptor.set.call(this, value);
          }
        },
        configurable: true,
      });

      return img;
    };

    window.Image.prototype = OriginalImage.prototype;
  }

  async processImgElement(img) {
    const src = img.getAttribute('src');
    if (!this.isJxlUrl(src)) return;
    if (img.dataset.jxlProcessed) return;

    img.dataset.jxlProcessed = 'true';
    this.log('Processing <img>:', src);

    if (this.options.showLoadingState) {
      img.style.opacity = '0.5';
    }

    try {
      const pngUrl = await this.getCachedOrDecode(src);
      img.src = pngUrl;
    } catch (err) {
      console.error('[JXL Polyfill] Failed to decode:', src, err);
    } finally {
      if (this.options.showLoadingState) {
        img.style.opacity = '';
      }
    }
  }

  async processBackgroundImage(element) {
    const style = getComputedStyle(element);
    const bgImage = style.backgroundImage;

    if (!bgImage || bgImage === 'none') return;

    const urlMatch = bgImage.match(/url\(['"]?([^'"()]+\.jxl[^'"()]*)['"]?\)/i);
    if (!urlMatch) return;
    if (element.dataset.jxlBgProcessed) return;

    element.dataset.jxlBgProcessed = 'true';
    const jxlUrl = urlMatch[1];
    this.log('Processing background-image:', jxlUrl);

    try {
      const pngUrl = await this.getCachedOrDecode(jxlUrl);
      element.style.backgroundImage = bgImage.replace(urlMatch[0], `url("${pngUrl}")`);
    } catch (err) {
      console.error('[JXL Polyfill] Failed to decode background:', jxlUrl, err);
    }
  }

  async processSourceElement(source) {
    const srcset = source.getAttribute('srcset');
    if (!this.isJxlUrl(srcset)) return;
    if (source.dataset.jxlProcessed) return;

    source.dataset.jxlProcessed = 'true';
    this.log('Processing <source srcset>:', srcset);

    try {
      const pngUrl = await this.getCachedOrDecode(srcset);
      source.srcset = pngUrl;
      source.type = 'image/png';
    } catch (err) {
      console.error('[JXL Polyfill] Failed to decode source:', srcset, err);
    }
  }

  async processSVGImage(element) {
    const href = element.getAttribute('href') || element.getAttributeNS('http://www.w3.org/1999/xlink', 'href');
    if (!this.isJxlUrl(href)) return;
    if (element.dataset.jxlProcessed) return;

    element.dataset.jxlProcessed = 'true';
    this.log('Processing SVG image:', href);

    try {
      const pngUrl = await this.getCachedOrDecode(href);
      element.setAttribute('href', pngUrl);
    } catch (err) {
      console.error('[JXL Polyfill] Failed to decode SVG image:', href, err);
    }
  }

  processExistingElements() {
    // Process <img> elements
    document.querySelectorAll('img').forEach((img) => this.processImgElement(img));

    // Process CSS backgrounds
    if (this.options.handleCSSBackgrounds) {
      document.querySelectorAll('*').forEach((el) => this.processBackgroundImage(el));
    }

    // Process <source> elements
    if (this.options.handleSourceElements) {
      document.querySelectorAll('source[srcset]').forEach((source) =>
        this.processSourceElement(source)
      );
    }

    // Process SVG elements
    if (this.options.handleSVGElements) {
      document.querySelectorAll('image, feImage').forEach((el) =>
        this.processSVGImage(el)
      );
    }
  }

  startObserver() {
    this.observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        // Handle added nodes
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;

          if (node.tagName === 'IMG') {
            this.processImgElement(node);
          } else if (node.tagName === 'SOURCE') {
            this.processSourceElement(node);
          } else if (node.tagName === 'IMAGE' || node.tagName === 'FEIMAGE') {
            this.processSVGImage(node);
          }

          // Check descendants
          node.querySelectorAll?.('img')?.forEach((img) => this.processImgElement(img));

          if (this.options.handleSourceElements) {
            node.querySelectorAll?.('source[srcset]')?.forEach((source) =>
              this.processSourceElement(source)
            );
          }

          if (this.options.handleSVGElements) {
            node.querySelectorAll?.('image, feImage')?.forEach((el) =>
              this.processSVGImage(el)
            );
          }

          if (this.options.handleCSSBackgrounds) {
            this.processBackgroundImage(node);
          }
        }

        // Handle attribute changes
        if (mutation.type === 'attributes') {
          const target = mutation.target;
          if (mutation.attributeName === 'src' && target.tagName === 'IMG') {
            delete target.dataset.jxlProcessed;
            this.processImgElement(target);
          } else if (mutation.attributeName === 'srcset' && target.tagName === 'SOURCE') {
            delete target.dataset.jxlProcessed;
            this.processSourceElement(target);
          } else if (
            (mutation.attributeName === 'href' || mutation.attributeName === 'xlink:href') &&
            (target.tagName === 'IMAGE' || target.tagName === 'FEIMAGE')
          ) {
            delete target.dataset.jxlProcessed;
            this.processSVGImage(target);
          } else if (mutation.attributeName === 'style') {
            delete target.dataset.jxlBgProcessed;
            this.processBackgroundImage(target);
          }
        }
      }
    });

    this.observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src', 'srcset', 'href', 'xlink:href', 'style'],
    });
  }
}

// Default export
export default JXLPolyfill;
