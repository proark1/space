import { createWorld } from 'bitecs';

/** The bitECS world. T22 (M1) extends this with cached queries + host/client singletons. */
export type GameWorld = ReturnType<typeof createWorld>;

export function createGameWorld(): GameWorld {
  return createWorld();
}
