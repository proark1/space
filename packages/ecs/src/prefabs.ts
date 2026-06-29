import { addComponent, addEntity, removeEntity } from 'bitecs';
import { EntityType } from '@sl/shared-types';
import type { GameWorld } from './world';
import {
  Transform, PrevTransform, Velocity, EnemyTag, Stalker, Swarmer, AIState, NavAgent,
  Health, Limb, NetworkId, Replicated, Pooled, Projectile, Lifetime, Noise,
  PlayerState, PlayerInput, Flashlight, LocalPlayer, RemotePlayer,
} from './components';
import { LimbSlot, FsmState, PlayerStatus } from './enums';

export function buildStalker(world: GameWorld, e: number): void {
  addComponent(world, e, Transform);
  addComponent(world, e, PrevTransform);
  addComponent(world, e, Velocity);
  addComponent(world, e, EnemyTag);
  addComponent(world, e, Stalker);
  addComponent(world, e, AIState);
  addComponent(world, e, NavAgent);
  addComponent(world, e, Health);
  addComponent(world, e, Limb);
  addComponent(world, e, NetworkId);
  addComponent(world, e, Replicated);
  addComponent(world, e, Pooled);
  Health.max[e] = 120;
  Health.hp[e] = 120;
  Limb.max[e][LimbSlot.LLeg] = 30;
  Limb.hp[e][LimbSlot.LLeg] = 30;
  Limb.max[e][LimbSlot.RLeg] = 30;
  Limb.hp[e][LimbSlot.RLeg] = 30;
  NavAgent.agentId[e] = -1;
  AIState.fsm[e] = FsmState.Idle;
  NetworkId.archetype[e] = EntityType.Stalker;
}

export function buildSwarmer(world: GameWorld, e: number): void {
  addComponent(world, e, Transform);
  addComponent(world, e, PrevTransform);
  addComponent(world, e, Velocity);
  addComponent(world, e, EnemyTag);
  addComponent(world, e, Swarmer);
  addComponent(world, e, AIState);
  addComponent(world, e, NavAgent);
  addComponent(world, e, Health);
  addComponent(world, e, Limb);
  addComponent(world, e, NetworkId);
  addComponent(world, e, Replicated);
  addComponent(world, e, Pooled);
  Health.max[e] = 40;
  Health.hp[e] = 40;
  NavAgent.agentId[e] = -1;
  AIState.fsm[e] = FsmState.Idle;
  NetworkId.archetype[e] = EntityType.Swarmer;
}

export function buildProjectile(world: GameWorld, e: number): void {
  addComponent(world, e, Transform);
  addComponent(world, e, PrevTransform);
  addComponent(world, e, Velocity);
  addComponent(world, e, Projectile);
  addComponent(world, e, NetworkId);
  addComponent(world, e, Replicated);
  addComponent(world, e, Lifetime);
  addComponent(world, e, Pooled);
  Projectile.damage[e] = 0;
  Projectile.speed[e] = 0;
  Projectile.ttl[e] = 0;
  Projectile.hitscan[e] = 0;
  Lifetime.remaining[e] = 0;
  NetworkId.archetype[e] = EntityType.Projectile;
}

export function buildNoise(world: GameWorld, e: number): void {
  addComponent(world, e, Noise);
  addComponent(world, e, Transform);
  addComponent(world, e, Lifetime);
  addComponent(world, e, Pooled);
  Noise.loudness[e] = 0;
  Noise.radius[e] = 0;
  Noise.ttl[e] = 0;
  Lifetime.remaining[e] = 0;
}

function buildPlayerBase(world: GameWorld, e: number): void {
  addComponent(world, e, Transform);
  addComponent(world, e, PrevTransform);
  addComponent(world, e, Velocity);
  addComponent(world, e, PlayerInput);
  addComponent(world, e, PlayerState);
  addComponent(world, e, Flashlight);
  addComponent(world, e, Health);
  addComponent(world, e, NetworkId);
  addComponent(world, e, Replicated);
  PlayerState.health[e] = 100;
  PlayerState.resolve[e] = 100;
  PlayerState.battery[e] = 100;
  PlayerState.ammoMag[e] = 30;
  PlayerState.ammoReserve[e] = 120;
  PlayerState.status[e] = PlayerStatus.Alive;
  Health.max[e] = 100;
  Health.hp[e] = 100;
  Flashlight.on[e] = 1;
  Flashlight.intensity[e] = 1;
  Flashlight.range[e] = 14;
  NetworkId.id[e] = 0;
  NetworkId.ownerPeer[e] = 0;
  NetworkId.archetype[e] = EntityType.Player;
  PlayerInput.seq[e] = 0;
  PlayerInput.moveX[e] = 0;
  PlayerInput.moveZ[e] = 0;
  PlayerInput.yaw[e] = 0;
  PlayerInput.pitch[e] = 0;
  PlayerInput.buttons[e] = 0;
  PlayerInput.dt[e] = 0;
}

export function buildPlayer(world: GameWorld, e: number): void {
  buildPlayerBase(world, e);
  addComponent(world, e, LocalPlayer);
}

export function buildRemotePlayer(world: GameWorld, e: number): void {
  buildPlayerBase(world, e);
  addComponent(world, e, RemotePlayer);
}

/** Create a fresh entity and build it into the local player (the non-pooled singleton). */
export function spawnPlayer(world: GameWorld): number {
  const e = addEntity(world);
  buildPlayer(world, e);
  return e;
}

/** Create a fresh replicated remote-player entity for client-side snapshot application. */
export function spawnRemotePlayer(world: GameWorld): number {
  const e = addEntity(world);
  buildRemotePlayer(world, e);
  return e;
}

export function despawnGameEntity(world: GameWorld, eid: number): void {
  removeEntity(world, eid);
}

// — reclaim: zero a recycled entity's fields on pool release —

export function reclaimProjectile(e: number): void {
  Transform.x[e] = 0; Transform.y[e] = 0; Transform.z[e] = 0;
  Velocity.x[e] = 0; Velocity.y[e] = 0; Velocity.z[e] = 0;
  Projectile.damage[e] = 0; Projectile.speed[e] = 0; Projectile.ttl[e] = 0;
  Projectile.ownerEid[e] = 0; Projectile.ownerPeer[e] = 0; Projectile.hitscan[e] = 0;
  Lifetime.remaining[e] = 0;
}

export function reclaimNoise(e: number): void {
  Noise.loudness[e] = 0; Noise.radius[e] = 0; Noise.ttl[e] = 0; Noise.sourcePeer[e] = 0;
  Transform.x[e] = 0; Transform.y[e] = 0; Transform.z[e] = 0;
  Lifetime.remaining[e] = 0;
}
