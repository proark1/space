import {
  Health,
  NetworkId,
  PlayerState,
  Transform,
  despawnGameEntity,
  queryReplicated,
  spawnRemotePlayer,
  type GameWorld,
} from '@sl/ecs';
import { EntityType } from '@sl/shared-types';
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

function writeEntitySnapshot(entity: EntitySnapshot, eid: number): void {
  NetworkId.id[eid] = entity.id;
  NetworkId.archetype[eid] = entity.type;
  Transform.x[eid] = entity.x;
  Transform.y[eid] = entity.y;
  Transform.z[eid] = entity.z;
  writeYawQuat(eid, entity.yaw);
  Health.hp[eid] = entity.hp;
  PlayerState.status[eid] = entity.anim;
}

/** Client-side bridge for already-bound entities. */
export function applySnapshotToMappedEcs(
  snapshot: WorldSnapshot,
  netIdToEid: ReadonlyMap<number, number>,
): number[] {
  const updated: number[] = [];
  for (const entity of snapshot.entities) {
    const eid = netIdToEid.get(entity.id);
    if (eid === undefined) continue;
    writeEntitySnapshot(entity, eid);
    updated.push(eid);
  }
  return updated;
}

export interface SnapshotApplyResult {
  readonly updated: number[];
  readonly spawned: number[];
  readonly despawned: number[];
}

export interface SnapshotApplyOptions {
  /**
   * Treat this full snapshot as authoritative for the provided map: mapped net ids absent from the
   * snapshot are removed from the world and map. Keep false for partial/delta-derived updates.
   */
  readonly despawnMissing?: boolean;
}

/**
 * Client-side replicated lifecycle bridge. Unknown player net ids spawn RemotePlayer entities, mapped
 * ids update in-place, and optionally missing mapped ids despawn on authoritative full snapshots.
 */
export function applySnapshotToEcs(
  world: GameWorld,
  snapshot: WorldSnapshot,
  netIdToEid: Map<number, number>,
  opts: SnapshotApplyOptions = {},
): SnapshotApplyResult {
  const updated: number[] = [];
  const spawned: number[] = [];
  const despawned: number[] = [];
  const seen = new Set<number>();

  for (const entity of snapshot.entities) {
    seen.add(entity.id);
    let eid = netIdToEid.get(entity.id);
    if (eid === undefined) {
      if (entity.type !== EntityType.Player) continue;
      eid = spawnRemotePlayer(world);
      netIdToEid.set(entity.id, eid);
      spawned.push(eid);
    }
    writeEntitySnapshot(entity, eid);
    updated.push(eid);
  }

  if (opts.despawnMissing) {
    for (const [netId, eid] of [...netIdToEid.entries()]) {
      if (seen.has(netId)) continue;
      netIdToEid.delete(netId);
      despawnGameEntity(world, eid);
      despawned.push(eid);
    }
  }

  return { updated, spawned, despawned };
}
