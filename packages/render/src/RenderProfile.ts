import type { RenderBackend } from './capabilities';

export type QualityTier = 'low' | 'mid' | 'high' | 'ultra';

/**
 * The frozen, single-source-of-truth render configuration every GPU subsystem reads (T25). Resolved
 * once from (backend × quality tier); the shadow rig, post stack, fog and flashlight consult it
 * rather than re-deciding capabilities, so the WebGL2 floor is enforced in exactly one place.
 */
export interface RenderProfile {
  readonly backend: RenderBackend;
  readonly tier: QualityTier;
  /** Device-pixel-ratio cap. */
  readonly pixelRatio: number;
  /** Flashlight shadow-map resolution (the only realtime shadow caster). */
  readonly shadowMapSize: number;
  /** Screen-space reflections (post-pivot: monster-local only; capability-gated, off on the floor). */
  readonly ssr: boolean;
  /** Ground-truth ambient occlusion (contact-darkening seasoning). */
  readonly gtao: boolean;
  /** Emissive-only bloom. */
  readonly bloom: boolean;
  /** Distance/height fog — analytic exp2 vs raymarched volumetric. */
  readonly fog: 'analytic' | 'volumetric';
  /** Volumetric godray cone on the flashlight (WebGPU ceiling only). */
  readonly volumetricFlashlight: boolean;
  /** Anti-aliasing strategy. */
  readonly antialias: 'none' | 'smaa' | 'traa';
}

type TierBaseline = Omit<RenderProfile, 'backend' | 'tier'>;

/** Per-tier baselines assuming the WebGPU ceiling; the WebGL2 floor is layered on top. */
const TIER_BASELINES: Record<QualityTier, TierBaseline> = {
  low:   { pixelRatio: 1.0, shadowMapSize: 512,  ssr: false, gtao: false, bloom: true, fog: 'analytic',   volumetricFlashlight: false, antialias: 'smaa' },
  mid:   { pixelRatio: 1.5, shadowMapSize: 1024, ssr: false, gtao: true,  bloom: true, fog: 'analytic',   volumetricFlashlight: true,  antialias: 'smaa' },
  high:  { pixelRatio: 2.0, shadowMapSize: 1024, ssr: true,  gtao: true,  bloom: true, fog: 'volumetric', volumetricFlashlight: true,  antialias: 'smaa' },
  ultra: { pixelRatio: 2.0, shadowMapSize: 2048, ssr: true,  gtao: true,  bloom: true, fog: 'volumetric', volumetricFlashlight: true,  antialias: 'traa' },
};

/**
 * The WebGL2 DEGRADE floor: no SSR, shadow map ≤512, DPR ≤1.0, analytic fog, no volumetric
 * flashlight, no temporal AA. Layered over any tier baseline so the WebGL2 path stays playable.
 */
function applyWebGL2Floor(b: TierBaseline): TierBaseline {
  return {
    ...b,
    ssr: false,
    shadowMapSize: Math.min(b.shadowMapSize, 512),
    pixelRatio: Math.min(b.pixelRatio, 1.0),
    fog: 'analytic',
    volumetricFlashlight: false,
    antialias: b.antialias === 'traa' ? 'smaa' : b.antialias,
  };
}

/** Resolve the frozen RenderProfile for a backend + quality tier, enforcing the WebGL2 floor. */
export function resolveRenderProfile(backend: RenderBackend, tier: QualityTier): RenderProfile {
  const base = TIER_BASELINES[tier];
  const resolved = backend === 'webgl2' ? applyWebGL2Floor(base) : base;
  return Object.freeze({ backend, tier, ...resolved });
}
