// JXL Decode Worker
// This worker handles JXL decoding off the main thread

let wasmModule = null;
let wasmReady = false;

// Will be replaced by bundle.js with actual base64 WASM
const WASM_BASE64 = "%%WASM_BASE64%%";

function base64ToBytes(base64) {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

// Initialize WASM in worker context
async function initWasm() {
  if (wasmReady) return;
  
  // The WASM glue code will be injected here by bundle.js
  // %%WASM_GLUE%%
  
  const wasmBytes = base64ToBytes(WASM_BASE64);
  await JxlWasm.init({ module_or_path: wasmBytes });
  wasmReady = true;
}

// Handle messages from main thread
self.onmessage = async function(e) {
  const { type, id, data } = e.data;
  
  if (type === 'decode') {
    try {
      await initWasm();
      
      // Decode JXL to PNG/APNG
      const pngData = JxlWasm.decode_jxl_to_png(new Uint8Array(data));
      
      // Transfer the buffer back to main thread
      self.postMessage(
        { id, pngData: pngData.buffer },
        [pngData.buffer]
      );
    } catch (error) {
      self.postMessage({ id, error: error.message || String(error) });
    }
  }
};

// Signal ready
self.postMessage({ type: 'ready' });
