import { LoadingManager } from 'three';
import type { WebGPURenderer } from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';

export interface GLTFLoaderSetup {
  readonly loader: GLTFLoader;
  readonly ktx2: KTX2Loader | null;
  dispose(): void;
}

export interface CreateGLTFLoaderOptions {
  readonly manager?: LoadingManager;
  /** Path to Basis/KTX2 transcoder files, e.g. `/basis/`. Omit for non-KTX2 greybox assets. */
  readonly ktx2TranscoderPath?: string;
  /** Renderer used by KTX2Loader.detectSupport. */
  readonly renderer?: WebGPURenderer;
}

/**
 * Shared GLTF loader setup (T29/T26). The production asset pipeline will provide optimized GLB/KTX2;
 * this factory keeps the loader path consistent across lookdev and the game shell.
 */
export function createGLTFLoaderSetup(opts: CreateGLTFLoaderOptions = {}): GLTFLoaderSetup {
  const manager = opts.manager ?? new LoadingManager();
  const loader = new GLTFLoader(manager);
  let ktx2: KTX2Loader | null = null;

  if (opts.ktx2TranscoderPath && opts.renderer) {
    ktx2 = new KTX2Loader(manager).setTranscoderPath(opts.ktx2TranscoderPath);
    // three's KTX2Loader type is WebGLRenderer-oriented, but the capability probe works against the
    // unified renderer backend at runtime. Keep the cast contained in this setup adapter.
    ktx2.detectSupport(opts.renderer as never);
    loader.setKTX2Loader(ktx2);
  }

  return {
    loader,
    ktx2,
    dispose: () => ktx2?.dispose(),
  };
}
