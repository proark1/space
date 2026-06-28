/** Replicated entity archetypes. Wire-stable: append only, never renumber. */
export const EntityType = {
  Player: 0,
  Stalker: 1,
  Swarmer: 2,
  Projectile: 3,
  Prop: 4,
} as const;
export type EntityType = (typeof EntityType)[keyof typeof EntityType];
