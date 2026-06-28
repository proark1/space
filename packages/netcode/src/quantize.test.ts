import { describe, it, expect } from 'vitest';
import { POS_MAX, TAU, YAW_QUANTUM, REPLICATED_REGISTRY } from '@sl/shared-types';
import { ByteWriter, ByteReader } from './byte';
import { writePos, readPos, writeYaw, readYaw } from './quantize';
import { encodeComponent, decodeComponent } from './codec';

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/** Smallest signed angular difference in [0, π]. */
function angleDelta(a: number, b: number): number {
  let d = Math.abs(((a - b) % TAU) + TAU) % TAU;
  if (d > Math.PI) d = TAU - d;
  return d;
}

describe('position quantization', () => {
  it('decodes within 0.01 m over 10k random values', () => {
    let maxErr = 0;
    for (let i = 0; i < 10_000; i++) {
      const x = rand(-POS_MAX, POS_MAX);
      const y = rand(-POS_MAX, POS_MAX);
      const z = rand(-POS_MAX, POS_MAX);
      const w = new ByteWriter(16);
      writePos(w, x, y, z);
      const p = readPos(new ByteReader(w.bytes()));
      maxErr = Math.max(maxErr, Math.abs(p.x - x), Math.abs(p.y - y), Math.abs(p.z - z));
    }
    expect(maxErr).toBeLessThanOrEqual(0.01);
  });

  it('clamps values outside the world sector', () => {
    const w = new ByteWriter(16);
    writePos(w, 9999, -9999, 0);
    const p = readPos(new ByteReader(w.bytes()));
    expect(p.x).toBeLessThanOrEqual(POS_MAX);
    expect(p.y).toBeGreaterThanOrEqual(-POS_MAX);
  });
});

describe('yaw quantization', () => {
  it('decodes within one quantum (2π/65535) over 10k random values', () => {
    let maxErr = 0;
    for (let i = 0; i < 10_000; i++) {
      const yaw = rand(-Math.PI, Math.PI);
      const w = new ByteWriter(8);
      writeYaw(w, yaw);
      const back = readYaw(new ByteReader(w.bytes()));
      maxErr = Math.max(maxErr, angleDelta(back, yaw));
    }
    expect(maxErr).toBeLessThanOrEqual(YAW_QUANTUM);
  });
});

describe('ByteWriter', () => {
  it('writes little-endian', () => {
    const w = new ByteWriter(4);
    w.u16(0x0102);
    const b = w.bytes();
    expect(b[0]).toBe(0x02);
    expect(b[1]).toBe(0x01);
  });

  it('auto-grows past the 1400-byte MTU without throwing', () => {
    const w = new ByteWriter(64); // starts far below the MTU
    const N = 1000; // 1000 × u16 = 2000 bytes > 1400
    for (let i = 0; i < N; i++) w.u16(i & 0xffff);
    expect(w.length).toBe(2000);
    const r = new ByteReader(w.bytes());
    for (let i = 0; i < N; i++) expect(r.u16()).toBe(i & 0xffff);
  });
});

describe('REPLICATED_REGISTRY codec', () => {
  it('round-trips a Transform through the registry-driven codec', () => {
    const transform = REPLICATED_REGISTRY.find((c) => c.name === 'Transform');
    expect(transform).toBeDefined();
    const values = { x: 12.34, y: -56.78, z: 90.12, yaw: 1.2345 };
    const w = new ByteWriter(16);
    encodeComponent(w, transform!, values);
    const out = decodeComponent(new ByteReader(w.bytes()), transform!);
    expect(Math.abs((out.x ?? 0) - values.x)).toBeLessThanOrEqual(0.01);
    expect(Math.abs((out.y ?? 0) - values.y)).toBeLessThanOrEqual(0.01);
    expect(Math.abs((out.z ?? 0) - values.z)).toBeLessThanOrEqual(0.01);
    expect(angleDelta(out.yaw ?? 0, values.yaw)).toBeLessThanOrEqual(YAW_QUANTUM);
  });
});
