import { addComponent } from 'bitecs';
import { EntityType } from '@sl/shared-types';
import type { GameWorld } from './world';
import {
  Transform, PrevTransform, Velocity, EnemyTag, Stalker, Swarmer, AIState, NavAgent,
  Health, Limb, NetworkId, Replicated, Pooled, Projectile, Lifetime, Noise,
  PlayerState, PlayerInput, Flashlight, LocalPlayer,
} from './components';
import { LimbSlot, FsmState, PlayerStatus } from './enums';

export function buildStalker(world: GameWorld, e: number): void {
  addComponent(world, Transform, e);
  addComponent(world, PrevTransform, e);
  addComponent(world, Velocity, e);
  addComponent(world, EnemyTag, e);
  addComponent(world, Stalker, e);
  addComponent(world, AIState, e);
  addComponent(world, NavAgent, e);
  addComponent(world, Health, e);
  addComponent(world, Limb, e);
  addComponent(world, NetworkId, e);
  addComponent(world, Replicated, e);
  addComponent(world, Pooled, e);
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
  addComponent(world, Transform, e);
  addComponent(world, PrevTransform, e);
  addComponent(world, Velocity, e);
  addComponent(world, EnemyTag, e);
  addComponent(world, Swarmer, e);
  addComponent(world, AIState, e);
  addComponent(world, NavAgent, e);
  addComponent(world, Health, e);
  addComponent(world, Limb, e);
  addComponent(world, NetworkId, e);
  addComponent(world, Replicated, e);
  addComponent(world, Pooled, e);
  Health.max[e] = 40;
  Health.hp[e] = 40;
  NavAgent.agentId[e] = -1;
  AIState.fsm[e] = FsmState.Idle;
  NetworkId.archetype[e] = EntityType.Swarmer;
}

export function buildProjectile(world: GameWorld, e: number): void {
  addComponent(world, Transform, e);
  addComponent(world, PrevTransform, e);
  addComponent(world, Velocity, e);
  addComponent(world, Projectile, e);
  addComponent(world, NetworkId, e);
  addComponent(world, Replicated, e);
  addComponent(world, Lifetime, e);
  addComponent(world, Pooled, e);
  Projectile.damage[e] = 0;
  Projectile.speed[e] = 0;
  Projectile.ttl[e] = 0;
  Projectile.hitscan[e] = 0;
  Lifetime.remaining[e] = 0;
  NetworkId.archetype[e] = EntityType.Projectile;
}

export function buildNoise(world: GameWorld, e: number): void {
  addComponent(world, Noise, e);
  addComponent(world, Transform, e);
  addComponent(world, Lifetime, e);
  addComponent(world, Pooled, e);
  Noise.loudness[e] = 0;
  Noise.radius[e] = 0;
  Noise.ttl[e] = 0;
  Lifetime.remaining[e] = 0;
}

export function buildPlayer(world: GameWorld, e: number): void {
  addComponent(world, Transform, e);
  addComponent(world, PrevTransform, e);
  addComponent(world, Velocity, e);
  addComponent(world, LocalPlayer, e);
  addComponent(world, PlayerInput, e);
  addComponent(world, PlayerState, e);
  addComponent(world, Flashlight, e);
  addComponent(world, Health, e);
  addComponent(world, NetworkId, e);
  addComponent(world, Replicated, e);
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
  NetworkId.archetype[e] = EntityType.Player;
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
