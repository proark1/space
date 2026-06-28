import { describe, it, expect } from 'vitest';
import { FixedClock, SNAPSHOT_EVERY } from './FixedClock';

describe('FixedClock', () => {
  it('steps ~60 Hz and broadcasts every 3rd tick (~20 Hz) across one second', () => {
    let ticks = 0;
    let broadcasts = 0;
    const c = new FixedClock(
      () => ticks++,
      () => broadcasts++,
    );
    c.advance(0); // prime the time base
    for (let i = 1; i <= 100; i++) c.advance(i * 10); // 100 × 10ms = 1000ms

    expect(ticks).toBeGreaterThanOrEqual(59);
    expect(ticks).toBeLessThanOrEqual(61);
    expect(broadcasts).toBe(Math.floor(ticks / SNAPSHOT_EVERY));
    expect(c.tick).toBe(ticks);
  });

  it('clamps a long stall so catch-up is bounded (no spiral of death)', () => {
    let ticks = 0;
    const c = new FixedClock(
      () => ticks++,
      () => {},
    );
    c.advance(0);
    c.advance(5000); // 5s jump in a single frame
    expect(ticks).toBeLessThan(20); // clamped to ~15, not ~300
    expect(ticks).toBeGreaterThan(10);
  });

  it('emits a strictly monotonic serverTick', () => {
    const seen: number[] = [];
    const c = new FixedClock(
      (t) => seen.push(t),
      () => {},
    );
    c.advance(0);
    for (let i = 1; i <= 12; i++) c.advance(i * 20);
    expect(seen.length).toBeGreaterThan(0);
    for (let i = 1; i < seen.length; i++) expect(seen[i]!).toBe(seen[i - 1]! + 1);
  });
});
