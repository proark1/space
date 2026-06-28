/**
 * Host fixed-timestep clock (spec / backlog T11). Steps the sim at a fixed 60 Hz from an
 * injected monotonic time source (no Date.now() inside — keeps it deterministic + testable)
 * and fires a snapshot broadcast every 3rd tick (20 Hz). The accumulator is clamped so a long
 * stall (tab backgrounded, GC pause) can't trigger a spiral-of-death catch-up.
 */

export const TICK_HZ = 60;
export const FIXED_DT_MS = 1000 / TICK_HZ; // 16.667 ms
export const SNAPSHOT_EVERY = 3; // 60 / 3 = 20 Hz
export const SNAPSHOT_HZ = TICK_HZ / SNAPSHOT_EVERY;
export const MAX_ACCUM_MS = 250; // 0.25 s catch-up cap

export class FixedClock {
  private accum = 0;
  private _tick = 0;
  private lastMs: number | null = null;

  constructor(
    private readonly onTick: (tick: number) => void,
    private readonly onBroadcast: (tick: number) => void,
  ) {}

  get tick(): number {
    return this._tick;
  }

  /** Advance to absolute monotonic time `nowMs`. Returns the number of fixed steps taken. */
  advance(nowMs: number): number {
    if (this.lastMs === null) {
      this.lastMs = nowMs;
      return 0;
    }
    let delta = nowMs - this.lastMs;
    this.lastMs = nowMs;
    if (delta < 0) delta = 0;
    this.accum += delta;
    if (this.accum > MAX_ACCUM_MS) this.accum = MAX_ACCUM_MS;

    let stepped = 0;
    while (this.accum >= FIXED_DT_MS) {
      this.accum -= FIXED_DT_MS;
      this._tick = (this._tick + 1) >>> 0; // uint32 monotonic
      this.onTick(this._tick);
      if (this._tick % SNAPSHOT_EVERY === 0) this.onBroadcast(this._tick);
      stepped++;
    }
    return stepped;
  }

  reset(): void {
    this.accum = 0;
    this._tick = 0;
    this.lastMs = null;
  }
}
