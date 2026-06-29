import { f32, f64, i32, ui32, ui16, ui8, eid, strided } from './storage';
import { LIMB_SLOTS } from './enums';

/**
 * The replicated + simulation component catalog (spec 03). bitECS 0.4 SoA components: each field is
 * a module-global typed array indexed by entity id; strided fields (`Limb.hp`) are 2D views, so
 * `Limb.hp[eid][slot]`. Tags are empty objects (membership only). APPEND-ONLY where it feeds the
 * wire (see REPLICATED_REGISTRY). `addComponent`/`hasComponent` use the 0.4 order: (world, eid, Comp).
 */

// — transform —
export const Transform = {
  x: f32(), y: f32(), z: f32(),
  qx: f32(), qy: f32(), qz: f32(), qw: f32(),
};
export const PrevTransform = {
  x: f32(), y: f32(), z: f32(),
  qx: f32(), qy: f32(), qz: f32(), qw: f32(),
};
export const Velocity = {
  x: f32(), y: f32(), z: f32(),
  ax: f32(), ay: f32(), az: f32(),
};

// — network —
export const NetworkId = { id: ui32(), ownerPeer: ui8(), archetype: ui8() };
export const Replicated = { dirty: ui8(), lastSentTick: ui32() };
export const Predicted = {
  lastAckedInput: ui32(), lastAckedX: f32(), lastAckedY: f32(), lastAckedZ: f32(),
};
export const Interpolated = { bufHead: ui8() };
export const SnapshotBuffer = {
  t0: f64(), x0: f32(), y0: f32(), z0: f32(), qx0: f32(), qy0: f32(), qz0: f32(), qw0: f32(),
  t1: f64(), x1: f32(), y1: f32(), z1: f32(), qx1: f32(), qy1: f32(), qz1: f32(), qw1: f32(),
};

// — player —
export const LocalPlayer = {};
export const RemotePlayer = {};
export const PlayerInput = {
  seq: ui32(), moveX: f32(), moveZ: f32(), yaw: f32(), pitch: f32(), buttons: ui16(), dt: f32(),
};
export const PlayerState = {
  health: f32(), resolve: f32(), battery: f32(), ammoMag: ui16(), ammoReserve: ui16(), status: ui8(), downedTimer: f32(),
};
export const Flashlight = {
  on: ui8(), intensity: f32(), range: f32(), coneCos: f32(), drainRate: f32(), noiseRadius: f32(),
};

// — enemy / AI —
export const EnemyTag = {};
export const Stalker = { pounceCooldown: f32(), aggression: f32(), legsSevered: ui8() };
export const Swarmer = { swarmGroup: ui16() };
export const AIState = {
  fsm: ui8(), target: eid(), lastKnownX: f32(), lastKnownY: f32(), lastKnownZ: f32(),
  noiseHeard: f32(), noiseX: f32(), noiseY: f32(), noiseZ: f32(), alertness: f32(), stateTimer: f32(), fsmReplicated: ui8(),
};
export const NavAgent = {
  agentId: i32(), destX: f32(), destY: f32(), destZ: f32(), speed: f32(), radius: f32(), flags: ui8(), repathTimer: f32(),
};
export const Noise = { loudness: f32(), radius: f32(), ttl: f32(), sourcePeer: ui8() };

// — combat —
export const Weapon = {
  kind: ui8(), damage: f32(), fireRate: f32(), cooldown: f32(), range: f32(), spread: f32(), magSize: ui16(), reloadTime: f32(), reloadTimer: f32(), muzzleNoise: f32(),
};
export const Projectile = {
  damage: f32(), speed: f32(), ownerEid: eid(), ownerPeer: ui8(), ttl: f32(), hitscan: ui8(),
};
export const Health = { hp: f32(), max: f32(), dead: ui8() };
export const Limb = { hp: strided(LIMB_SLOTS), max: strided(LIMB_SLOTS), severed: ui8() };
export const Hitbox = { parent: eid(), slot: ui8(), multiplier: f32() };
export const DamageEvent = {
  victim: eid(), attackerPeer: ui8(), amount: f32(), slot: ui8(), killed: ui8(), severed: ui8(),
};

// — presentation (client-only) —
export const RenderRef = { handle: ui32(), visible: ui8() };
export const AudioEmitter = { emitterId: ui32(), clipBank: ui16(), flags: ui8() };
export const Light = { handle: ui32(), color: ui32(), intensity: f32(), flicker: f32(), kind: ui8() };
export const LODState = { lod: ui8(), distSq: f32(), hysteresisTimer: f32() };
export const AnimState = { clip: ui8(), time: f32(), blend: f32() };

// — lifecycle / pooling —
export const Lifetime = { remaining: f32() };
export const Pooled = { poolId: ui8(), active: ui8() };
export const Spawned = {};
export const Despawn = {};
