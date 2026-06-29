import { createWorld } from 'bitecs';

export type GameWorldRole = 'host' | 'client' | 'local';

export interface GameWorldMeta {
  readonly role: GameWorldRole;
}

const metaByWorld = new WeakMap<GameWorld, GameWorldMeta>();

/** The bitECS world. */
export type GameWorld = ReturnType<typeof createWorld>;

/**
 * Create a game ECS world with an explicit role tag. The tag is intentionally sidecar metadata:
 * bitECS owns the world shape, while systems can still ask whether this is host-authoritative,
 * client-presentation, or a local single-player/lookdev world.
 */
export function createGameWorld(role: GameWorldRole = 'local'): GameWorld {
  const world = createWorld();
  metaByWorld.set(world, Object.freeze({ role }));
  return world;
}

export function getGameWorldMeta(world: GameWorld): GameWorldMeta {
  return metaByWorld.get(world) ?? { role: 'local' };
}
