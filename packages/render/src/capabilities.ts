/**
 * Render backend capability detection (T24/T25). Pure feature-detection — it does NOT create a
 * renderer. Prefers WebGPU, falls back to WebGL2. The async {@link detectBackend} additionally
 * confirms an adapter can actually be acquired (some browsers expose `navigator.gpu` but then
 * fail `requestAdapter()`), which is the only reliable signal that the WebGPU path will work.
 */

export type RenderBackend = 'webgpu' | 'webgl2';

export interface RenderCapabilities {
  backend: RenderBackend;
  /** True only when a WebGPU adapter was actually acquired (not just `navigator.gpu` present). */
  webgpuConfirmed: boolean;
}

/** Cheap synchronous guess: WebGPU if `navigator.gpu` exists, else WebGL2. */
export function detectBackendSync(): RenderBackend {
  return typeof navigator !== 'undefined' && 'gpu' in navigator ? 'webgpu' : 'webgl2';
}

/** Authoritative async probe: actually attempts to acquire a WebGPU adapter. */
export async function detectBackend(): Promise<RenderCapabilities> {
  const gpu =
    typeof navigator !== 'undefined'
      ? (navigator as unknown as { gpu?: { requestAdapter?: () => Promise<unknown> } }).gpu
      : undefined;
  if (gpu && typeof gpu.requestAdapter === 'function') {
    try {
      const adapter = await gpu.requestAdapter();
      if (adapter) return { backend: 'webgpu', webgpuConfirmed: true };
    } catch {
      // Adapter request threw — fall through to the WebGL2 floor.
    }
  }
  return { backend: 'webgl2', webgpuConfirmed: false };
}
