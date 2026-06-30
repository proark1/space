// @sl/render — renderer + GPU subsystems (M1).
export { detectBackend, detectBackendSync } from './capabilities';
export type { RenderBackend, RenderCapabilities } from './capabilities';
export { resolveRenderProfile } from './RenderProfile';
export type { RenderProfile, QualityTier } from './RenderProfile';
export { createRenderer } from './Renderer';
export type { SLRenderer, CreateRendererOptions } from './Renderer';
export { createGLTFLoaderSetup } from './GLTFLoaderSetup';
export type { CreateGLTFLoaderOptions, GLTFLoaderSetup } from './GLTFLoaderSetup';
export { createPostStack } from './PostStack';
export type { PostStack, PostUniformsBank } from './PostStack';
export { BudgetMonitor } from './BudgetMonitor';
export type { RenderBudget, RenderBudgetSample, RenderBudgetView } from './BudgetMonitor';
export { GpuTimer } from './GpuTimer';
export type { GpuTimerSample, GpuTimerSource } from './GpuTimer';
export { RenderRegistry, syncObject3DFromTransform, syncRenderableObjects } from './syncSystem';
export { createFlashlight } from './lighting/flashlight';
export type { Flashlight } from './lighting/flashlight';
