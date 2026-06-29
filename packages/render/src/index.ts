// @sl/render — renderer + GPU subsystems (M1). The MRT pass (T27), TSL post stack (T28),
// ECS→Object3D sync (T29), flashlight (T30) and flicker panels (T31) land next; each reads the
// RenderProfile (T25) for its per-backend DEGRADE decisions.
export { detectBackend, detectBackendSync } from './capabilities';
export type { RenderBackend, RenderCapabilities } from './capabilities';
export { resolveRenderProfile } from './RenderProfile';
export type { RenderProfile, QualityTier } from './RenderProfile';
export { createRenderer } from './Renderer';
export type { SLRenderer, CreateRendererOptions } from './Renderer';
export { createPostStack } from './PostStack';
export type { PostStack, PostUniformsBank } from './PostStack';
export { createFlashlight } from './lighting/flashlight';
export type { Flashlight } from './lighting/flashlight';
