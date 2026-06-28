import { describe, it, expect } from 'vitest';
import { POS_MAX, TAU, MTU } from '@sl/shared-types';
import {
  encodeFull,
  decodeFull,
  encodeDelta,
  decodeDelta,
  applyDelta,
  type WorldSnapshot,
  type EntitySnapshot,
} from './snapshot';
import { readHeader } from './header';
import { ByteReader } from '../byte';
import { SnapshotHistory } from './SnapshotHistory';

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randEntity(id: number): EntitySnapshot {
  return {
    id,
    type: 1 + (id % 6),
    x: rand(-POS_MAX, POS_MAX),
    y: rand(-POS_MAX, POS_MAX),
    z: rand(-POS_MAX, POS_MAX),
    yaw: rand(-Math.PI, Math.PI),
    anim: Math.floor(rand(0, 16)),
    hp: Math.floor(rand(0, 256)),
  };
}

function randWorld(tick: number, n: number): WorldSnapshot {
  const entities: EntitySnapshot[] = [];
  for (let i = 0; i < n; i++) entities.push(randEntity(i + 1));
  return { tick, entities };
}

/** Round-trip a world through a full snapshot → the canonical quantized form. */
function quantized(world: WorldSnapshot): WorldSnapshot {
  return decodeFull(encodeFull(world));
}

function sortById(w: WorldSnapshot): EntitySnapshot[] {
  return [...w.entities].sort((a, b) => a.id - b.id);
}

describe('full snapshot', () => {
  it('round-trips every entity within quantization tolerance', () => {
    const world = randWorld(1234, 50);
    const back = decodeFull(encodeFull(world));
    expect(back.tick).toBe(1234);
    expect(back.entities.length).toBe(50);
    for (const e of world.entities) {
      const d = back.entities.find((b) => b.id === e.id)!;
      expect(d.type).toBe(e.type);
      expect(Math.abs(d.x - e.x)).toBeLessThanOrEqual(0.01);
      expect(Math.abs(d.y - e.y)).toBeLessThanOrEqual(0.01);
      expect(Math.abs(d.z - e.z)).toBeLessThanOrEqual(0.01);
      let dy = Math.abs(((d.yaw - e.yaw) % TAU) + TAU) % TAU;
      if (dy > Math.PI) dy = TAU - dy;
      expect(dy).toBeLessThanOrEqual(TAU / 0xffff);
      expect(d.anim).toBe(e.anim);
      expect(d.hp).toBe(e.hp);
    }
  });

  it('keeps a 24-entity full snapshot well under the MTU', () => {
    const bytes = encodeFull(randWorld(1, 24));
    expect(bytes.length).toBeLessThan(1200);
    expect(bytes.length).toBeLessThan(MTU);
  });
});

describe('delta snapshot', () => {
  it('reconstructs the current world exactly from base + delta', () => {
    const base = quantized(randWorld(10, 30));
    const current = quantized({ tick: 11, entities: base.entities.map((e) => ({ ...e })) });
    // mutate a few entities + remove one + add one
    current.entities[0]!.x += 5;
    current.entities[1]!.hp = (current.entities[1]!.hp + 7) % 256;
    current.entities[2]!.anim = (current.entities[2]!.anim + 1) % 16;
    current.entities.splice(5, 1); // removed
    current.entities.push({ id: 999, type: 4, x: 1, y: 2, z: 3, yaw: 0.5, anim: 2, hp: 80 });

    const canonical = quantized(current);
    const delta = decodeDelta(encodeDelta(current, base));
    const applied = applyDelta(base, delta);

    expect(delta.baseTick).toBe(10);
    expect(delta.removed).toContain(6); // entity id 6 was at index 5
    expect(applied.tick).toBe(11);
    expect(sortById(applied)).toEqual(sortById(canonical));
  });

  it('omits unchanged entities entirely (small delta)', () => {
    const base = quantized(randWorld(20, 40));
    const current = quantized({ tick: 21, entities: base.entities.map((e) => ({ ...e })) });
    current.entities[0]!.x += 3; // only one changed
    const delta = decodeDelta(encodeDelta(current, base));
    expect(delta.changed.length).toBe(1);
    expect(delta.removed.length).toBe(0);
  });

  it('survives a 1000-iteration fuzz of random base→current transitions', () => {
    for (let iter = 0; iter < 1000; iter++) {
      const base = quantized(randWorld(iter, 1 + Math.floor(rand(0, 20))));
      // derive current: keep some, drop some, mutate some, add some
      const kept = base.entities.filter(() => Math.random() > 0.2).map((e) => ({ ...e }));
      for (const e of kept) {
        if (Math.random() > 0.5) e.x += rand(-2, 2);
        if (Math.random() > 0.7) e.hp = (e.hp + 1) % 256;
      }
      if (Math.random() > 0.5) kept.push(randEntity(1000 + iter));
      const current: WorldSnapshot = { tick: iter + 1, entities: kept };

      const canonical = quantized(current);
      const applied = applyDelta(base, decodeDelta(encodeDelta(current, base)));
      expect(sortById(applied)).toEqual(sortById(canonical));
    }
  });
});

describe('SnapshotHistory', () => {
  it('deltas against an acked base but falls back to full when the base is missing', () => {
    const hist = new SnapshotHistory(32);
    const base = quantized(randWorld(100, 10));
    hist.add(base);
    const current = quantized(randWorld(101, 10));

    const deltaPacket = hist.buildFor(current, 100);
    expect(readHeader(new ByteReader(deltaPacket)).isDelta).toBe(true);

    const fullPacket = hist.buildFor(current, 9999); // base never stored
    expect(readHeader(new ByteReader(fullPacket)).isDelta).toBe(false);

    const needFull = hist.buildFor(current, null);
    expect(readHeader(new ByteReader(needFull)).isDelta).toBe(false);
  });

  it('keeps memory bounded to capacity as ticks advance', () => {
    const hist = new SnapshotHistory(32);
    for (let tick = 0; tick < 200; tick++) hist.add(quantized(randWorld(tick, 4)));
    expect(hist.size).toBeLessThanOrEqual(32);
    expect(hist.get(0)).toBeUndefined(); // long-evicted
    expect(hist.get(199)).toBeDefined(); // most recent
  });
});
