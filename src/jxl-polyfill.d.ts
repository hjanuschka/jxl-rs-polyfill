/**
 * JXL Polyfill TypeScript Definitions
 */

/**
 * Initialize the WASM module
 */
export function initWasm(): Promise<void>;

/**
 * Check if the current browser natively supports JXL
 */
export function checkNativeJxlSupport(): Promise<boolean>;

/**
 * Decode a JXL image to PNG
 * @param jxlData - The JXL image bytes
 * @returns The PNG image bytes
 */
export function decodeJxlToPng(jxlData: Uint8Array): Promise<Uint8Array>;

/**
 * Get information about a JXL image
 * @param jxlData - The JXL image bytes
 */
export function getJxlInfo(jxlData: Uint8Array): Promise<{
  width: number;
  height: number;
  numFrames: number;
  hasAlpha: boolean;
}>;

/**
 * Decode a JXL image from a URL
 * @param url - URL to the JXL image
 * @returns PNG blob
 */
export function decodeJxlFromUrl(url: string): Promise<Blob>;

export interface JXLPolyfillOptions {
  /** Intercept new Image() constructor (default: true) */
  patchImageConstructor?: boolean;
  /** Convert CSS background-image (default: true) */
  handleCSSBackgrounds?: boolean;
  /** Convert <source srcset> (default: true) */
  handleSourceElements?: boolean;
  /** Convert SVG <image>/<feImage> (default: true) */
  handleSVGElements?: boolean;
  /** Cache decoded images (default: true) */
  cacheDecoded?: boolean;
  /** Show loading indicator during decode (default: false) */
  showLoadingState?: boolean;
  /** Enable debug logging (default: false) */
  verbose?: boolean;
}

export interface JXLPolyfillStats {
  imagesConverted: number;
  bytesSaved: number;
  cacheHits: number;
  cacheSize: number;
}

/**
 * JXL Polyfill class for automatic image conversion
 */
export class JXLPolyfill {
  constructor(options?: JXLPolyfillOptions);

  /**
   * Start the polyfill
   */
  start(): Promise<void>;

  /**
   * Stop the polyfill
   */
  stop(): void;

  /**
   * Get polyfill statistics
   */
  getStats(): JXLPolyfillStats;
}

export default JXLPolyfill;
