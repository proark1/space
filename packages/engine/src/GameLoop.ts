/**
 * Fixed-timestep game loop (T21). Decouples a deterministic 60 Hz simulation from a variable render
 * rate via an accumulator: each animation frame folds the real elapsed time into an accumulator and
 * runs as many fixed `fixedUpdate(dt)` steps as fit, then renders once with an interpolation `alpha`
 * (how far render time sits between the last and next simulated tick). A `maxFrameDt` clamp prevents
 * the spiral of death after a long stall (hidden tab, GC pause).
 *
 * The clock and frame scheduler are injectable so the loop is fully deterministic under test — drive
 * {@link GameLoop.advance} with explicit deltas; in the browser, start()/stop() drive it from rAF.
 */

export interface GameLoopOptions {
  /** Simulation frequency in Hz (fixed timestep). Default 60. */
  readonly fixedHz?: number;
  /** Max real frame delta (seconds) folded in per frame — the spiral-of-death clamp. Default 0.25. */
  readonly maxFrameDt?: number;
  /** Deterministic fixed-step simulation. Receives the fixed dt (seconds) and the NEW tick index. */
  readonly fixedUpdate: (dt: number, tick: number) => void;
  /** Per-frame render. `alpha` ∈ [0, 1): fraction between the last and next simulated tick. */
  readonly render: (alpha: number) => void;
  /** Monotonic clock in ms (injectable for tests). Default performance.now → Date.now. */
  readonly now?: () => number;
  /** Frame scheduler (injectable). Default requestAnimationFrame. */
  readonly requestFrame?: (cb: (timeMs: number) => void) => number;
  /** Frame canceller (injectable). Default cancelAnimationFrame. */
  readonly cancelFrame?: (handle: number) => void;
}

const defaultNow = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());

export class GameLoop {
  /** The fixed simulation step in seconds (1 / fixedHz). */
  readonly fixedDt: number;

  private readonly maxFrameDt: number;
  private readonly fixedUpdate: (dt: number, tick: number) => void;
  private readonly render: (alpha: number) => void;
  private readonly now: () => number;
  private readonly requestFrame: (cb: (timeMs: number) => void) => number;
  private readonly cancelFrame: (handle: number) => void;

  private accumulator = 0;
  private tick = 0;
  private lastTimeMs = 0;
  private frameHandle: number | null = null;
  private running = false;

  constructor(opts: GameLoopOptions) {
    this.fixedDt = 1 / (opts.fixedHz ?? 60);
    this.maxFrameDt = opts.maxFrameDt ?? 0.25;
    this.fixedUpdate = opts.fixedUpdate;
    this.render = opts.render;
    this.now = opts.now ?? defaultNow;
    this.requestFrame =
      opts.requestFrame ??
      ((cb) => (typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame(cb) : 0));
    this.cancelFrame =
      opts.cancelFrame ??
      ((handle) => {
        if (typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(handle);
      });
  }

  /** Number of fixed simulation steps run since construction (or the last reset). */
  get currentTick(): number {
    return this.tick;
  }

  get isRunning(): boolean {
    return this.running;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastTimeMs = this.now();
    this.scheduleFrame();
  }

  stop(): void {
    this.running = false;
    if (this.frameHandle !== null) {
      this.cancelFrame(this.frameHandle);
      this.frameHandle = null;
    }
  }

  /** Reset the accumulator + tick — e.g. when entering a fresh level. */
  reset(): void {
    this.accumulator = 0;
    this.tick = 0;
    this.lastTimeMs = this.now();
  }

  /**
   * Drive one frame's simulation given an explicit real-frame delta (seconds), then render once.
   * Public for deterministic testing; start()/stop() call it from rAF with measured deltas.
   * Returns the number of fixed steps executed this frame.
   */
  advance(frameDt: number): number {
    // Clamp the real delta: negatives (clock skew) floor to 0, long stalls cap at maxFrameDt.
    const clamped = Math.min(Math.max(frameDt, 0), this.maxFrameDt);
    this.accumulator += clamped;
    let steps = 0;
    while (this.accumulator >= this.fixedDt) {
      this.fixedUpdate(this.fixedDt, this.tick);
      this.tick++;
      this.accumulator -= this.fixedDt;
      steps++;
    }
    this.render(this.accumulator / this.fixedDt);
    return steps;
  }

  private scheduleFrame(): void {
    this.frameHandle = this.requestFrame((timeMs) => this.onFrame(timeMs));
  }

  private onFrame(timeMs: number): void {
    const frameDt = (timeMs - this.lastTimeMs) / 1000;
    this.lastTimeMs = timeMs;
    this.advance(frameDt);
    if (this.running) this.scheduleFrame();
  }
}
