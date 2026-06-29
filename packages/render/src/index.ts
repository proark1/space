// @sl/render — renderer + GPU subsystems (M1). Scaffolded in M1-A0; the Renderer (T24),
// DEGRADE matrix (T25), MRT (T27), TSL post stack (T28), ECS→Object3D sync (T29),
// flashlight (T30) and flicker panels (T31) land in subsequent M1 tasks.
export { detectBackend, detectBackendSync } from './capabilities';
export type { RenderBackend, RenderCapabilities } from './capabilities';
