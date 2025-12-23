/**
 * Auto-initializing JXL Polyfill
 *
 * This module automatically starts the polyfill when loaded.
 * No configuration needed - just include the script.
 *
 * @example
 * <script src="https://cdn.jsdelivr.net/npm/jxl-rs-polyfill/dist/auto.js"></script>
 */

declare global {
  interface Window {
    JXLPolyfill: {
      /**
       * Manually start the polyfill (automatically called on load)
       */
      start(): Promise<void>;

      /**
       * Process all current elements
       */
      processAll(): void;

      /**
       * Get polyfill statistics
       */
      getStats(): {
        imagesConverted: number;
        cacheHits: number;
        cacheSize: number;
      };
    };
  }
}

export {};
