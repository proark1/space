/** Replicated entity archetypes. Wire values per spec 02 §5.1 — append-only, never renumber. */
export const EntityType = {
  Player: 1,
  Stalker: 2,
  Swarmer: 3,
  Projectile: 4,
  Door: 5,
  Pickup: 6,
} as const;
export type EntityType = (typeof EntityType)[keyof typeof EntityType];
