import { describe, it, expect } from 'vitest';
import { addEntity, hasComponent } from 'bitecs';
import { EntityType } from '@sl/shared-types';
import { createGameWorld } from './world';
import { buildStalker, buildPlayer, buildProjectile, despawnGameEntity, spawnRemotePlayer } from './prefabs';
import {
  Transform, Stalker, AIState, NavAgent, Health, Limb, NetworkId, EnemyTag,
  PlayerInput, PlayerState, LocalPlayer, Projectile, RemotePlayer,
} from './components';
import { LimbSlot, FsmState, PlayerStatus } from './enums';

describe('prefabs', () => {
  it('buildStalker attaches the stalker component set with the right initial values', () => {
    const w = createGameWorld();
    const e = addEntity(w);
    buildStalker(w, e);
    for (const c of [Transform, Stalker, AIState, NavAgent, Health, Limb, NetworkId, EnemyTag]) {
      expect(hasComponent(w, e, c)).toBe(true);
    }
    expect(Health.hp[e]).toBe(120);
    expect(Health.max[e]).toBe(120);
    expect(Limb.hp[e][LimbSlot.LLeg]).toBe(30);
    expect(AIState.fsm[e]).toBe(FsmState.Idle);
    expect(NavAgent.agentId[e]).toBe(-1);
    expect(NetworkId.archetype[e]).toBe(EntityType.Stalker);
  });

  it('buildPlayer sets the player loadout + health', () => {
    const w = createGameWorld();
    const e = addEntity(w);
    buildPlayer(w, e);
    expect(hasComponent(w, e, LocalPlayer)).toBe(true);
    expect(PlayerState.health[e]).toBe(100);
    expect(PlayerState.ammoMag[e]).toBe(30);
    expect(PlayerState.status[e]).toBe(PlayerStatus.Alive);
    expect(NetworkId.ownerPeer[e]).toBe(0);
    expect(PlayerInput.seq[e]).toBe(0);
    expect(NetworkId.archetype[e]).toBe(EntityType.Player);
  });

  it('spawnRemotePlayer marks a player as remote without the local tag', () => {
    const w = createGameWorld();
    const e = spawnRemotePlayer(w);
    expect(hasComponent(w, e, RemotePlayer)).toBe(true);
    expect(hasComponent(w, e, LocalPlayer)).toBe(false);
    expect(PlayerState.health[e]).toBe(100);
    expect(NetworkId.archetype[e]).toBe(EntityType.Player);

    despawnGameEntity(w, e);
    expect(hasComponent(w, e, RemotePlayer)).toBe(false);
  });

  it('buildProjectile is zero-initialized', () => {
    const w = createGameWorld();
    const e = addEntity(w);
    buildProjectile(w, e);
    expect(hasComponent(w, e, Projectile)).toBe(true);
    expect(Projectile.damage[e]).toBe(0);
    expect(NetworkId.archetype[e]).toBe(EntityType.Projectile);
  });
});
