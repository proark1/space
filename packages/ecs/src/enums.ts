/** Per-entity limb slots; Limb.hp/max are strided arrays of LIMB_SLOTS (spec 03). */
export const LIMB_SLOTS = 8;
export const LimbSlot = {
  Head: 0,
  Torso: 1,
  LArm: 2,
  RArm: 3,
  LLeg: 4,
  RLeg: 5,
  Tail: 6,
  Jaw: 7,
} as const;

/** AIState.fsm values. */
export const FsmState = {
  Idle: 0,
  Patrol: 1,
  Investigate: 2,
  Chase: 3,
  Attack: 4,
  Pounce: 5,
  Flee: 6,
  Dead: 7,
} as const;

export const WeaponKind = {
  None: 0,
  PulseRifle: 1,
  Melee: 2,
} as const;

export const PlayerStatus = {
  Alive: 0,
  Downed: 1,
  Dead: 2,
} as const;

/** Pre-allocated entity pools (spec 03 §pool). */
export const PoolId = {
  Stalker: 1,
  Swarmer: 2,
  Projectile: 3,
  Noise: 4,
  DamageEvent: 5,
} as const;
