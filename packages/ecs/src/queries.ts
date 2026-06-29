import { query } from 'bitecs';
import type { GameWorld } from './world';
import { Transform, Replicated, LocalPlayer, RemotePlayer, EnemyTag, AIState, RenderRef } from './components';

/**
 * Cached core queries (T22). bitECS 0.4 caches each query in the world by the structural hash of its
 * term set, so the first call builds the query and every subsequent call reuses it — cheap to call
 * each tick. Each helper's component list is the term set; compose operators (Not/Or/…) inline where
 * a system needs them. Results are a live view of matching entity ids (Uint32Array or eid array).
 */

/** Everything with a Transform — the render-sync / interpolation set. */
export const queryTransforms = (world: GameWorld) => query(world, [Transform]);

/** Host snapshot set: entities that replicate over the wire. */
export const queryReplicated = (world: GameWorld) => query(world, [Replicated, Transform]);

/** The local (predicted) player. */
export const queryLocalPlayers = (world: GameWorld) => query(world, [LocalPlayer, Transform]);

/** Remote players (interpolated). */
export const queryRemotePlayers = (world: GameWorld) => query(world, [RemotePlayer, Transform]);

/** Host-side enemies (sensing / FSM / nav consume this). */
export const queryEnemies = (world: GameWorld) => query(world, [EnemyTag, AIState, Transform]);

/** Client-side renderable entities bound to an Object3D handle. */
export const queryRenderable = (world: GameWorld) => query(world, [RenderRef, Transform]);
