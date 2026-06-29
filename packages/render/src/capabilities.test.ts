import { describe, it, expect, afterEach, vi } from 'vitest';
import { detectBackend, detectBackendSync } from './capabilities';

afterEach(() => vi.unstubAllGlobals());

describe('capabilities', () => {
  it('sync probe reports webgpu when navigator.gpu is present', () => {
    vi.stubGlobal('navigator', { gpu: {} });
    expect(detectBackendSync()).toBe('webgpu');
  });

  it('sync probe reports webgl2 when navigator.gpu is absent', () => {
    vi.stubGlobal('navigator', {});
    expect(detectBackendSync()).toBe('webgl2');
  });

  it('async probe confirms webgpu when an adapter is acquired', async () => {
    vi.stubGlobal('navigator', { gpu: { requestAdapter: async () => ({}) } });
    expect(await detectBackend()).toEqual({ backend: 'webgpu', webgpuConfirmed: true });
  });

  it('async probe falls back to webgl2 when requestAdapter returns null', async () => {
    vi.stubGlobal('navigator', { gpu: { requestAdapter: async () => null } });
    expect(await detectBackend()).toEqual({ backend: 'webgl2', webgpuConfirmed: false });
  });

  it('async probe falls back to webgl2 when requestAdapter throws', async () => {
    vi.stubGlobal('navigator', {
      gpu: {
        requestAdapter: async () => {
          throw new Error('adapter unavailable');
        },
      },
    });
    expect((await detectBackend()).backend).toBe('webgl2');
  });
});
