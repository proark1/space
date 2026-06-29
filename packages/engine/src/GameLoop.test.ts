import { describe, it, expect } from 'vitest';
import { GameLoop } from './GameLoop';

describe('GameLoop', () => {
  it('runs a fixed number of 60Hz steps over wall time', () => {
    let ticks = 0;
    const loop = new GameLoop({ fixedHz: 60, fixedUpdate: () => ticks++, render: () => {} });
    // Ten 100ms frames = 1.0s of wall time → exactly 60 fixed steps at 60Hz.
    for (let i = 0; i < 10; i++) loop.advance(0.1);
    expect(ticks).toBe(60);
    expect(loop.currentTick).toBe(60);
  });

  it('clamps a long stall to maxFrameDt (no spiral of death)', () => {
    let ticks = 0;
    const loop = new GameLoop({
      fixedHz: 60,
      maxFrameDt: 0.25,
      fixedUpdate: () => ticks++,
      render: () => {},
    });
    // A 5s stall would be 300 steps unclamped; clamped to 0.25s → floor(0.25*60) = 15.
    const steps = loop.advance(5);
    expect(steps).toBe(15);
    expect(ticks).toBe(15);
  });

  it('reports the interpolation alpha between ticks', () => {
    let lastAlpha = -1;
    const loop = new GameLoop({ fixedHz: 60, fixedUpdate: () => {}, render: (a) => (lastAlpha = a) });
    // Advance 1.5 fixed steps → 1 step runs, half a step remains in the accumulator → alpha ≈ 0.5.
    loop.advance(loop.fixedDt * 1.5);
    expect(lastAlpha).toBeCloseTo(0.5, 5);
  });

  it('ignores negative frame deltas', () => {
    let ticks = 0;
    const loop = new GameLoop({ fixedHz: 60, fixedUpdate: () => ticks++, render: () => {} });
    expect(loop.advance(-1)).toBe(0);
    expect(ticks).toBe(0);
  });

  it('drives from an injected scheduler + clock via start()', () => {
    let ticks = 0;
    let clockMs = 0;
    let frameCb: ((t: number) => void) | null = null;
    const loop = new GameLoop({
      fixedHz: 60,
      fixedUpdate: () => ticks++,
      render: () => {},
      now: () => clockMs,
      requestFrame: (cb) => {
        frameCb = cb;
        return 1;
      },
      cancelFrame: () => {
        frameCb = null;
      },
    });
    loop.start();
    expect(loop.isRunning).toBe(true);
    clockMs = 100; // 0.1s later
    frameCb!(clockMs); // one rAF frame → 6 fixed steps, reschedules
    expect(ticks).toBe(6);
    loop.stop();
    expect(loop.isRunning).toBe(false);
    expect(frameCb).toBeNull();
  });
});
