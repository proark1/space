/**
 * SoA storage for the ECS component catalog (bitECS 0.4).
 *
 * bitECS 0.4 is bring-your-own-storage: components are plain objects used as identity keys, and the
 * data lives in module-global typed arrays indexed by entity id. Entity ids under the default
 * `createWorld()` are dense and recycled with versioning OFF, so `Comp.field[eid]` is a safe direct
 * index (the same access shape the 0.3 `defineComponent` produced — the migration keeps call sites
 * identical apart from the `addComponent(world, eid, Comp)` argument order).
 */

/**
 * Per-world entity ceiling. Sized for the game's concurrent-entity high-water mark — players +
 * enemies + projectile/noise pools + the M-LOOK chaos-stress load (300+ loose bodies) — with
 * generous headroom. Raise if a world ever needs more simultaneous entities.
 */
export const MAX_ENTITIES = 16384;

export const f32 = (): Float32Array => new Float32Array(MAX_ENTITIES);
export const f64 = (): Float64Array => new Float64Array(MAX_ENTITIES);
export const i32 = (): Int32Array => new Int32Array(MAX_ENTITIES);
export const ui32 = (): Uint32Array => new Uint32Array(MAX_ENTITIES);
export const ui16 = (): Uint16Array => new Uint16Array(MAX_ENTITIES);
export const ui8 = (): Uint8Array => new Uint8Array(MAX_ENTITIES);
/** Entity-reference field (0 = none); dense eids fit in uint32. */
export const eid = (): Uint32Array => new Uint32Array(MAX_ENTITIES);

/**
 * Strided per-entity array (e.g. `Limb.hp` over LIMB_SLOTS). Backed by ONE flat Float32Array so
 * there are zero per-entity allocations; `field[eid]` is that entity's subarray view, so
 * `field[eid][slot]` reads/writes the flat buffer — preserving the 0.3 2D access shape exactly.
 */
export const strided = (stride: number): Float32Array[] => {
  const buf = new Float32Array(MAX_ENTITIES * stride);
  const rows = new Array<Float32Array>(MAX_ENTITIES);
  for (let e = 0; e < MAX_ENTITIES; e++) rows[e] = buf.subarray(e * stride, e * stride + stride);
  return rows;
};
