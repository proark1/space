import type * as RAPIER from '@dimforge/rapier3d-compat';
import { Transform } from '@sl/ecs';

/**
 * Write a Rapier body's world transform into the entity's ECS Transform component (T23). Called on
 * the host after `world.step()` so the authoritative physics state becomes the replicated Transform
 * the snapshot codec reads.
 */
export function syncBodyToTransform(eid: number, body: RAPIER.RigidBody): void {
  const t = body.translation();
  const r = body.rotation();
  Transform.x[eid] = t.x;
  Transform.y[eid] = t.y;
  Transform.z[eid] = t.z;
  Transform.qx[eid] = r.x;
  Transform.qy[eid] = r.y;
  Transform.qz[eid] = r.z;
  Transform.qw[eid] = r.w;
}

/** Sync many (eid, body) pairs in one pass (call after step()). */
export function syncBodiesToTransforms(pairs: Iterable<readonly [number, RAPIER.RigidBody]>): void {
  for (const [eid, body] of pairs) syncBodyToTransform(eid, body);
}
