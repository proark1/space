export type GpuTimerSource = 'cpu';

export interface GpuTimerSample {
  readonly gpuMs: number;
  readonly source: GpuTimerSource;
}

function defaultNow(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

/**
 * Minimal timing facade for the render gate. It currently reports a CPU wall-time estimate around the
 * render call; WebGPU timestamp-query and EXT_disjoint_timer_query can slot behind this same API.
 */
export class GpuTimer {
  measure<T>(fn: () => T, now: () => number = defaultNow): { readonly value: T; readonly sample: GpuTimerSample } {
    const start = now();
    const value = fn();
    return { value, sample: { gpuMs: Math.max(0, now() - start), source: 'cpu' } };
  }
}
