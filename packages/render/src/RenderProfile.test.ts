import { describe, it, expect } from 'vitest';
import { resolveRenderProfile } from './RenderProfile';

describe('resolveRenderProfile', () => {
  it('keeps the WebGPU ceiling features at high tier', () => {
    const p = resolveRenderProfile('webgpu', 'high');
    expect(p).toMatchObject({
      ssr: true,
      shadowMapSize: 1024,
      pixelRatio: 2.0,
      fog: 'volumetric',
      volumetricFlashlight: true,
    });
  });

  it('WebGL2 floor disables SSR, halves shadow to 512, caps DPR at 1.0, switches to analytic fog', () => {
    const p = resolveRenderProfile('webgl2', 'high');
    expect(p.ssr).toBe(false);
    expect(p.shadowMapSize).toBe(512);
    expect(p.pixelRatio).toBe(1.0);
    expect(p.fog).toBe('analytic');
    expect(p.volumetricFlashlight).toBe(false);
  });

  it('downgrades TRAA→SMAA on WebGL2 ultra but keeps TRAA on WebGPU ultra', () => {
    expect(resolveRenderProfile('webgl2', 'ultra').antialias).toBe('smaa');
    expect(resolveRenderProfile('webgpu', 'ultra').antialias).toBe('traa');
  });

  it('low tier already sits at the floor on both backends', () => {
    const wg = resolveRenderProfile('webgpu', 'low');
    const gl = resolveRenderProfile('webgl2', 'low');
    expect(wg.shadowMapSize).toBe(512);
    expect(gl.shadowMapSize).toBe(512);
    expect(gl.pixelRatio).toBe(1.0);
  });

  it('returns a frozen profile', () => {
    expect(Object.isFrozen(resolveRenderProfile('webgpu', 'mid'))).toBe(true);
  });
});
