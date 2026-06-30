import { describe, expect, it } from 'vitest';
import { GpuTimer } from './GpuTimer';

describe('GpuTimer', () => {
  it('measures a render callback with the CPU fallback source', () => {
    let now = 10;
    const timer = new GpuTimer();
    const { value, sample } = timer.measure(() => {
      now = 14.5;
      return 'frame';
    }, () => now);
    expect(value).toBe('frame');
    expect(sample).toEqual({ gpuMs: 4.5, source: 'cpu' });
  });
});
