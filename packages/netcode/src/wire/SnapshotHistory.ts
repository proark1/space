import { encodeFull, encodeDelta } from './snapshot';
import type { WorldSnapshot } from './snapshot';

/**
 * Host-side ring of the last N full snapshots it built, keyed by tick (spec 02 §5.4). Each
 * client ACKs the last tick it applied; the host deltas the current snapshot against that
 * acked base. If the base is too old (evicted) or the client needs a full, it sends a full.
 * Bounded memory: at most `capacity` snapshots retained, regardless of soak time.
 */
export class SnapshotHistory {
  private readonly ring: Array<WorldSnapshot | undefined>;
  private readonly byTick = new Map<number, WorldSnapshot>();

  constructor(private readonly capacity = 32) {
    this.ring = new Array<WorldSnapshot | undefined>(capacity);
  }

  add(snap: WorldSnapshot): void {
    const slot = ((snap.tick % this.capacity) + this.capacity) % this.capacity;
    const evicted = this.ring[slot];
    if (evicted && evicted.tick !== snap.tick) this.byTick.delete(evicted.tick);
    this.ring[slot] = snap;
    this.byTick.set(snap.tick, snap);
  }

  get(tick: number): WorldSnapshot | undefined {
    return this.byTick.get(tick);
  }

  get size(): number {
    return this.byTick.size;
  }

  /**
   * Build the smallest packet for a client whose last-acked tick is `baseTick`. Falls back to a
   * full snapshot when `baseTick` is null (needs-full) or the base has aged out of the ring.
   */
  buildFor(current: WorldSnapshot, baseTick: number | null): Uint8Array<ArrayBuffer> {
    if (baseTick === null) return encodeFull(current);
    const base = this.get(baseTick);
    if (!base) return encodeFull(current);
    return encodeDelta(current, base);
  }
}
