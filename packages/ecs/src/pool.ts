import { addEntity, addComponent, removeComponent } from 'bitecs';
import type { GameWorld } from './world';
import { Pooled, Spawned } from './components';

export type BuildFn = (world: GameWorld, eid: number) => void;
export type ReclaimFn = (eid: number) => void;

/**
 * Fixed-size pool of pre-allocated entities (spec 03 §pool). Every entity is created once at
 * construction — zero allocations after warm-up — and acquire/release are O(1) free-list ops.
 * Release zeroes the reclaimed entity's fields so a recycled id never leaks stale state.
 */
export class EntityPool {
  private readonly freeList: number[] = [];
  private readonly entities: number[] = [];

  constructor(
    private readonly world: GameWorld,
    readonly poolId: number,
    count: number,
    private readonly build: BuildFn,
    private readonly reclaim?: ReclaimFn,
  ) {
    for (let i = 0; i < count; i++) {
      const e = addEntity(world);
      build(world, e);
      Pooled.poolId[e] = poolId;
      Pooled.active[e] = 0;
      this.entities.push(e);
      this.freeList.push(e);
    }
  }

  /** Take a free entity (active=1), or -1 if the pool is exhausted. */
  acquire(): number {
    const e = this.freeList.pop();
    if (e === undefined) return -1;
    Pooled.active[e] = 1;
    addComponent(this.world, e, Spawned);
    return e;
  }

  /** Return an entity to the pool, zeroing its fields. No-op if already free. */
  release(eid: number): void {
    if (Pooled.active[eid] === 0) return;
    Pooled.active[eid] = 0;
    removeComponent(this.world, eid, Spawned);
    this.reclaim?.(eid);
    this.freeList.push(eid);
  }

  get capacity(): number {
    return this.entities.length;
  }

  get available(): number {
    return this.freeList.length;
  }

  get activeCount(): number {
    return this.entities.length - this.freeList.length;
  }
}
