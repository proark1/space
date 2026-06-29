import { WebGPURenderer } from 'three/webgpu';
import { PCFSoftShadowMap } from 'three';
import type { Camera, ColorRepresentation, Object3D } from 'three';
import { detectBackend, type RenderBackend } from './capabilities';
import { resolveRenderProfile, type QualityTier, type RenderProfile } from './RenderProfile';

export interface CreateRendererOptions {
  readonly canvas: HTMLCanvasElement;
  /** Force a backend, skipping detection. Use 'webgl2' to exercise the fallback path (e.g. ?gl=2). */
  readonly forceBackend?: RenderBackend;
  /** Quality tier (low|mid|high|ultra). Default 'high'. The WebGL2 floor is enforced regardless. */
  readonly tier?: QualityTier;
  /** Override the device-pixel-ratio (default: min(devicePixelRatio, profile cap)). */
  readonly pixelRatio?: number;
  /** Initial clear color. Default near-black 0x05070a. */
  readonly clearColor?: ColorRepresentation;
}

export interface SLRenderer {
  /** The underlying three renderer — one unified renderer drives both WebGPU and the WebGL2 fallback. */
  readonly three: WebGPURenderer;
  /** The backend actually in use after init (reflects any silent fallback). */
  readonly backend: RenderBackend;
  readonly isWebGPU: boolean;
  /** The frozen render profile for the active backend + tier (DEGRADE already applied). */
  readonly profile: RenderProfile;
  render(scene: Object3D, camera: Camera): void;
  setSize(width: number, height: number): void;
  dispose(): void;
}

/**
 * Create and asynchronously initialise the renderer (T24). Prefers WebGPU, falls back to WebGL2 —
 * both drive three's unified WebGPURenderer, so the scene / node-material / post graph stays
 * identical across backends. The resolved {@link RenderProfile} (T25) carries the per-backend DEGRADE
 * decisions every subsystem reads. Pass `forceBackend: 'webgl2'` to exercise the fallback path.
 */
export async function createRenderer(opts: CreateRendererOptions): Promise<SLRenderer> {
  const requested: RenderBackend = opts.forceBackend ?? (await detectBackend()).backend;
  const forceWebGL = requested === 'webgl2';

  // Guarantee a non-zero backing size before init so the WebGPU swapchain / depth buffer never
  // configures at 0×0 — a 0-size host viewport (e.g. headless) would otherwise emit validation
  // errors at setup. The real size is applied by setSize() below (and by the app's resize()).
  opts.canvas.width = opts.canvas.width || opts.canvas.clientWidth || 1;
  opts.canvas.height = opts.canvas.height || opts.canvas.clientHeight || 1;

  const three = new WebGPURenderer({ canvas: opts.canvas, antialias: false, forceWebGL });
  await three.init();

  // Soft shadows for the flashlight (the only realtime caster); the controller in createFlashlight
  // gates re-renders, and the RenderProfile sets per-backend shadow-map resolution.
  three.shadowMap.enabled = true;
  three.shadowMap.type = PCFSoftShadowMap;

  // three can silently fall back to WebGL2 even when a WebGPU adapter was confirmed, so read the
  // concrete backend — the reported value (and therefore the DEGRADE profile) must reflect reality.
  const isWebGPU = (three.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend === true;
  const backend: RenderBackend = isWebGPU ? 'webgpu' : 'webgl2';
  if (!forceWebGL && requested === 'webgpu' && !isWebGPU) {
    console.warn('[sl/render] WebGPU requested but the renderer fell back to WebGL2.');
  }

  const profile = resolveRenderProfile(backend, opts.tier ?? 'high');

  const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, profile.pixelRatio) : 1;
  three.setPixelRatio(opts.pixelRatio ?? dpr);
  three.setClearColor(opts.clearColor ?? 0x05070a, 1);
  three.setSize(opts.canvas.clientWidth || opts.canvas.width || 1, opts.canvas.clientHeight || opts.canvas.height || 1);

  return {
    three,
    backend,
    isWebGPU,
    profile,
    render: (scene, camera) => three.render(scene, camera),
    setSize: (width, height) => three.setSize(width, height),
    dispose: () => three.dispose(),
  };
}
