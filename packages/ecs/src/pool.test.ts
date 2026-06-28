import { describe, it, expect } from 'vitest';
import { createGameWorld } from './world';
import { EntityPool } from './pool';
import { buildProjectile, reclaimProjectile } from './prefabs';
import { Projectile, Transform, Pooled } from './components';
import { PoolId } from './enums';

describe('EntityPool', () => {
  it('acquires up to capacity, then returns -1 when exhausted', () => {
    const w = createGameWorld();
    const pool = new EntityPool(w, PoolId.Projectile, 8, buildProjectile, reclaimProjectile);
    const ids = new Set<number>();
    for (let i = 0; i < 8; i++) {
      const e = pool.acquire();
      expect(e).toBeGreaterThanOrEqual(0);
      ids.add(e);
    }
    expect(ids.size).toBe(8);
    expect(pool.acquire()).toBe(-1);
    expect(pool.activeCount).toBe(8);
  });

  it('recycles ids with zero new allocations over 1000 acquire/release cycles', () => {
    const w = createGameWorld();
    const pool = new EntityPool(w, PoolId.Projectile, 16, buildProjectile, reclaimProjectile);
    const seen = new Set<number>();
    for (let i = 0; i < 1000; i++) {
      const e = pool.acquire();
      seen.add(e);
      pool.release(e);
    }
    expect(seen.size).toBeLessThanOrEqual(16); // only the pre-allocated entities recur — no growth
    expect(pool.available).toBe(16);
  });

  it('zeroes reclaimed fields so a recycled entity carries no stale state', () => {
    const w = createGameWorld();
    const pool = new EntityPool(w, PoolId.Projectile, 4, buildProjectile, reclaimProjectile);
    const e = pool.acquire();
    Projectile.damage[e] = 50;
    Transform.x[e] = 99;
    pool.release(e);
    const e2 = pool.acquire();
    expect(e2).toBe(e); // same recycled id
    expect(Projectile.damage[e2]).toBe(0);
    expect(Transform.x[e2]).toBe(0);
    expect(Pooled.active[e2]).toBe(1);
  });
});
