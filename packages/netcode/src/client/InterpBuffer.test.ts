import { describe, it, expect } from 'vitest';
import { TAU } from '@sl/shared-types';
import { InterpBuffer } from './InterpBuffer';
import { ClockEstimator } from './ClockEstimator';

describe('InterpBuffer', () => {
  it('renders 100ms behind, interpolating between bracketing snapshots', () => {
    const buf = new InterpBuffer(100);
    buf.push(0, { x: 0, z: 0, yaw: 0 });
    buf.push(100, { x: 10, z: 0, yaw: 0 });
    buf.push(200, { x: 20, z: 0, yaw: 0 });
    expect(buf.sample(200)!.x).toBeCloseTo(10, 6); // renderTime 100 → the exact sample
    expect(buf.sample(250)!.x).toBeCloseTo(15, 6); // renderTime 150 → halfway
  });

  it('freezes (never extrapolates) past the newest snapshot', () => {
    const buf = new InterpBuffer(100);
    buf.push(0, { x: 0, z: 0, yaw: 0 });
    buf.push(100, { x: 10, z: 0, yaw: 0 });
    expect(buf.sample(400)!.x).toBeCloseTo(10, 6); // renderTime 300 past last(100) → hold 10, not 30
  });

  it('freezes rather than sliding across a >300ms gap', () => {
    const buf = new InterpBuffer(100);
    buf.push(0, { x: 0, z: 0, yaw: 0 });
    buf.push(500, { x: 50, z: 0, yaw: 0 });
    expect(buf.sample(300)!.x).toBeCloseTo(0, 6); // renderTime 200, span 500>300 → hold 0
  });

  it('slerps yaw the short way around the wrap', () => {
    const buf = new InterpBuffer(100);
    buf.push(0, { x: 0, z: 0, yaw: 0.1 });
    buf.push(100, { x: 0, z: 0, yaw: TAU - 0.1 });
    expect(buf.sample(150)!.yaw).toBeCloseTo(0, 4); // shortest arc passes through 0, not π
  });
});

describe('ClockEstimator', () => {
  it('EWMA-converges to the true offset and damps jitter', () => {
    const est = new ClockEstimator(0.1);
    const TRUE = 1000;
    const errs: number[] = [];
    for (let i = 0; i < 250; i++) {
      const local = i * 16;
      const noise = (Math.random() - 0.5) * 40; // ±20 ms per-packet jitter
      est.observe(local, local + TRUE + noise);
      if (i > 150) errs.push(Math.abs(est.value - TRUE));
    }
    const meanAbs = errs.reduce((s, e) => s + e, 0) / errs.length;
    expect(meanAbs).toBeLessThan(10); // smoothed offset stays well inside the ±20ms input jitter
  });
});
