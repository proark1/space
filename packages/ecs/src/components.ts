import { defineComponent, Types } from 'bitecs';
import { LIMB_SLOTS } from './enums';

/**
 * The replicated + simulation component catalog (spec 03). bitECS 0.3.x SoA components: each
 * field is a typed array indexed by entity id; strided fields (Limb.hp) are accessed as
 * `Limb.hp[eid * LIMB_SLOTS + slot]`. APPEND-ONLY where it feeds the wire (see REPLICATED_REGISTRY).
 */

// — transform —
export const Transform = defineComponent({
  x: Types.f32, y: Types.f32, z: Types.f32,
  qx: Types.f32, qy: Types.f32, qz: Types.f32, qw: Types.f32,
});
export const PrevTransform = defineComponent({
  x: Types.f32, y: Types.f32, z: Types.f32,
  qx: Types.f32, qy: Types.f32, qz: Types.f32, qw: Types.f32,
});
export const Velocity = defineComponent({
  x: Types.f32, y: Types.f32, z: Types.f32,
  ax: Types.f32, ay: Types.f32, az: Types.f32,
});

// — network —
export const NetworkId = defineComponent({ id: Types.ui32, ownerPeer: Types.ui8, archetype: Types.ui8 });
export const Replicated = defineComponent({ dirty: Types.ui8, lastSentTick: Types.ui32 });
export const Predicted = defineComponent({
  lastAckedInput: Types.ui32, lastAckedX: Types.f32, lastAckedY: Types.f32, lastAckedZ: Types.f32,
});
export const Interpolated = defineComponent({ bufHead: Types.ui8 });
export const SnapshotBuffer = defineComponent({
  t0: Types.f64, x0: Types.f32, y0: Types.f32, z0: Types.f32, qx0: Types.f32, qy0: Types.f32, qz0: Types.f32, qw0: Types.f32,
  t1: Types.f64, x1: Types.f32, y1: Types.f32, z1: Types.f32, qx1: Types.f32, qy1: Types.f32, qz1: Types.f32, qw1: Types.f32,
});

// — player —
export const LocalPlayer = defineComponent();
export const RemotePlayer = defineComponent();
export const PlayerInput = defineComponent({
  seq: Types.ui32, moveX: Types.f32, moveZ: Types.f32, yaw: Types.f32, pitch: Types.f32, buttons: Types.ui16, dt: Types.f32,
});
export const PlayerState = defineComponent({
  health: Types.f32, resolve: Types.f32, battery: Types.f32, ammoMag: Types.ui16, ammoReserve: Types.ui16, status: Types.ui8, downedTimer: Types.f32,
});
export const Flashlight = defineComponent({
  on: Types.ui8, intensity: Types.f32, range: Types.f32, coneCos: Types.f32, drainRate: Types.f32, noiseRadius: Types.f32,
});

// — enemy / AI —
export const EnemyTag = defineComponent();
export const Stalker = defineComponent({ pounceCooldown: Types.f32, aggression: Types.f32, legsSevered: Types.ui8 });
export const Swarmer = defineComponent({ swarmGroup: Types.ui16 });
export const AIState = defineComponent({
  fsm: Types.ui8, target: Types.eid, lastKnownX: Types.f32, lastKnownY: Types.f32, lastKnownZ: Types.f32,
  noiseHeard: Types.f32, noiseX: Types.f32, noiseY: Types.f32, noiseZ: Types.f32, alertness: Types.f32, stateTimer: Types.f32, fsmReplicated: Types.ui8,
});
export const NavAgent = defineComponent({
  agentId: Types.i32, destX: Types.f32, destY: Types.f32, destZ: Types.f32, speed: Types.f32, radius: Types.f32, flags: Types.ui8, repathTimer: Types.f32,
});
export const Noise = defineComponent({ loudness: Types.f32, radius: Types.f32, ttl: Types.f32, sourcePeer: Types.ui8 });

// — combat —
export const Weapon = defineComponent({
  kind: Types.ui8, damage: Types.f32, fireRate: Types.f32, cooldown: Types.f32, range: Types.f32, spread: Types.f32, magSize: Types.ui16, reloadTime: Types.f32, reloadTimer: Types.f32, muzzleNoise: Types.f32,
});
export const Projectile = defineComponent({
  damage: Types.f32, speed: Types.f32, ownerEid: Types.eid, ownerPeer: Types.ui8, ttl: Types.f32, hitscan: Types.ui8,
});
export const Health = defineComponent({ hp: Types.f32, max: Types.f32, dead: Types.ui8 });
export const Limb = defineComponent({ hp: [Types.f32, LIMB_SLOTS], max: [Types.f32, LIMB_SLOTS], severed: Types.ui8 });
export const Hitbox = defineComponent({ parent: Types.eid, slot: Types.ui8, multiplier: Types.f32 });
export const DamageEvent = defineComponent({
  victim: Types.eid, attackerPeer: Types.ui8, amount: Types.f32, slot: Types.ui8, killed: Types.ui8, severed: Types.ui8,
});

// — presentation (client-only) —
export const RenderRef = defineComponent({ handle: Types.ui32, visible: Types.ui8 });
export const AudioEmitter = defineComponent({ emitterId: Types.ui32, clipBank: Types.ui16, flags: Types.ui8 });
export const Light = defineComponent({ handle: Types.ui32, color: Types.ui32, intensity: Types.f32, flicker: Types.f32, kind: Types.ui8 });
export const LODState = defineComponent({ lod: Types.ui8, distSq: Types.f32, hysteresisTimer: Types.f32 });
export const AnimState = defineComponent({ clip: Types.ui8, time: Types.f32, blend: Types.f32 });

// — lifecycle / pooling —
export const Lifetime = defineComponent({ remaining: Types.f32 });
export const Pooled = defineComponent({ poolId: Types.ui8, active: Types.ui8 });
export const Spawned = defineComponent();
export const Despawn = defineComponent();
