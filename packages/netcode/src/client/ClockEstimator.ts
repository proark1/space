/**
 * EWMA estimate of the offset between the host's clock and ours (serverTime − localTime), used
 * to place incoming snapshots on a stable local timeline for the InterpBuffer. Exponential
 * smoothing keeps the estimate steady under per-packet jitter so the remote view doesn't stutter
 * (backlog T14: "EWMA clock offset stable, no jitter").
 */
export class ClockEstimator {
  private offset = 0;
  private initialized = false;

  constructor(private readonly alpha = 0.05) {}

  /** Feed one (localTime, serverTime) observation; returns the smoothed offset. */
  observe(localTime: number, serverTime: number): number {
    const sample = serverTime - localTime;
    if (!this.initialized) {
      this.offset = sample;
      this.initialized = true;
    } else {
      this.offset += (sample - this.offset) * this.alpha;
    }
    return this.offset;
  }

  get value(): number {
    return this.offset;
  }

  /** Map a host serverTime onto our local timeline. */
  toLocal(serverTime: number): number {
    return serverTime - this.offset;
  }
}
