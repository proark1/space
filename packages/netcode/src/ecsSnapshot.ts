import {
  Health,
  NetworkId,
  PlayerState,
  Transform,
  queryReplicated,
  type GameWorld,
} from '@sl/ecs';
import type { EntitySnapshot, WorldSnapshot } from './wire/snapshot';

function yawFromQuat(eid: number): number {
  const x = Transform.qx[eid] ?? 0;
  const y = Transform.qy[eid] ?? 0;
  const z = Transform.qz[eid] ?? 0;
  const w = Transform.qw[eid] ?? 1;
  return Math.atan2(2 * (w * y + x * z), 1 - 2 * (y * y + z * z));
}

function writeYawQuat(eid: number, yaw: number): void {
  const half = yaw / 2;
  Transform.qx[eid] = 0;
  Transform.qy[eid] = Math.sin(half);
  Transform.qz[eid] = 0;
  Transform.qw[eid] = Math.cos(half);
}

function byte(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.max(0, Math.min(255, Math.round(v)));
}

/** Host-side bridge: copy replicated ECS entities into the existing compact snapshot DTO. */
export function buildSnapshotFromEcs(world: GameWorld, tick: number): WorldSnapshot {
  const entities: EntitySnapshot[] = [];
  for (const eid of queryReplicated(world)) {
    entities.push({
      id: NetworkId.id[eid] || eid,
      type: NetworkId.archetype[eid] ?? 0,
      x: Transform.x[eid] ?? 0,
      y: Transform.y[eid] ?? 0,
      z: Transform.z[eid] ?? 0,
      yaw: yawFromQuat(eid),
      anim: byte(PlayerState.status[eid] ?? 0),
      hp: byte(Health.hp[eid] ?? 0),
    });
  }
  return { tick, entities };
}

/**
 * Client-side bridge for already-bound entities. Spawn/despawn/id-map ownership lands in the later
 * replication task; this function updates the ECS rows for netIds the caller has already mapped.
 */
export function applySnapshotToMappedEcs(
  snapshot: WorldSnapshot,
  netIdToEid: ReadonlyMap<number, number>,
): number[] {
  const updated: number[] = [];
  for (const entity of snapshot.entities) {
    const eid = netIdToEid.get(entity.id);
    if (eid === undefined) continue;
    NetworkId.id[eid] = entity.id;
    NetworkId.archetype[eid] = entity.type;
    Transform.x[eid] = entity.x;
    Transform.y[eid] = entity.y;
    Transform.z[eid] = entity.z;
    writeYawQuat(eid, entity.yaw);
    Health.hp[eid] = entity.hp;
    PlayerState.status[eid] = entity.anim;
    updated.push(eid);
  }
  return updated;
}
