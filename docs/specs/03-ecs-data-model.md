# SIGNAL LOST — ECS Data Model Spec (bitECS) for packages/ecs

## SIGNAL LOST — ECS Data Model (bitECS)

Concrete, buildable spec for `packages/ecs`. Targets bitECS **0.3.x classic API** (`defineComponent`, `defineQuery`, `addEntity`, `Types`), which is what the locked stack (Three r185 era) pairs with. If the team adopts bitECS 0.4 (function-based `addComponent(world, eid, Component)`), the schemas below are unchanged; only the call sites differ — noted where relevant.

Fixed sim: **host 60 Hz**, **snapshot 20 Hz**, client render-delay ~100 ms. SoA arrays are the wire format source of truth.

---

### 0. Package layout

```
packages/ecs/
  src/
    world.ts                # createWorld, World type, singleton facade wiring
    types.ts                # branded ids, enums, Fixed32 helpers
    components/
      index.ts              # re-export all + COMPONENT_REGISTRY
      transform.ts          # Transform, Velocity, PrevTransform
      net.ts                # NetworkId, Replicated, Predicted, Interpolated, SnapshotBuffer
      player.ts             # PlayerInput, PlayerState, Flashlight, LocalPlayer, RemotePlayer
      enemy.ts              # EnemyTag, Stalker, Swarmer, AIState, NavAgent, Noise
      combat.ts             # Weapon, Projectile, Health, Limb, Hitbox, DamageEvent
      presentation.ts       # RenderRef, AudioEmitter, Light, LODState, AnimState
      lifecycle.ts          # Lifetime, Pooled, Spawned, Despawn
    queries/
      index.ts              # all defineQuery() instances (defined once, reused)
    systems/
      shared/   host/   client/    # see §2
    prefabs/
      archetypes.ts         # addStalker(), addSwarmer(), addProjectile(), addPlayer()
    pool/
      pool.ts               # EntityPool<T>, free-list ring
    serialize/
      schema.ts             # replicated component → field manifest
      writer.ts  reader.ts  # delta snapshot codec (DataView)
      idmap.ts              # host eid <-> netId <-> client eid
    facade/
      singletons.ts         # AudioDirector / NetManager / PhysicsBridge thin OOP wrappers
  package.json   tsconfig.json
```

Constants:
```ts
export const FIXED_DT = 1 / 60;            // host sim step
export const SNAPSHOT_HZ = 20;             // 3 sim steps per snapshot
export const SNAPSHOT_DT = 1 / SNAPSHOT_HZ;
export const RENDER_DELAY_MS = 100;        // client interpolation buffer
export const MAX_ENTITIES = 8192;          // sizes every SoA TypedArray
export const MAX_PLAYERS = 4;
```

---

### 1. COMPONENT CATALOG

bitECS `Types`: `f32 f64 i8 ui8 i16 ui16 i32 ui32 eid`. Vectors via `[Types.f32, 3]`. All angles stored as quaternions (4×f32) to avoid gimbal issues over the wire. Replication uses **quantization at serialize time, not in storage** (storage stays f32 for sim accuracy; quantize only when writing the snapshot).

#### 1.1 Transform domain — `components/transform.ts`
```ts
import { defineComponent, Types } from 'bitecs';

export const Transform = defineComponent({
  x: Types.f32, y: Types.f32, z: Types.f32,         // world position (m)
  qx: Types.f32, qy: Types.f32, qz: Types.f32, qw: Types.f32, // rotation quat
});

export const PrevTransform = defineComponent({       // for render interpolation between sim steps
  x: Types.f32, y: Types.f32, z: Types.f32,
  qx: Types.f32, qy: Types.f32, qz: Types.f32, qw: Types.f32,
});

export const Velocity = defineComponent({            // m/s + angular (rad/s) — sim only, NOT replicated
  x: Types.f32, y: Types.f32, z: Types.f32,
  ax: Types.f32, ay: Types.f32, az: Types.f32,
});
```

#### 1.2 Network domain — `components/net.ts`
```ts
import { defineComponent, Types } from 'bitecs';

// Stable cross-peer identity. netId is assigned by host, identical on every peer.
export const NetworkId = defineComponent({
  id: Types.ui32,            // global network id (host-assigned, never reused within a run)
  ownerPeer: Types.ui8,      // 0=host..3; which player owns/authors this entity (255 = world)
  archetype: Types.ui8,      // Archetype enum — tells client which prefab to spawn
});

// Marker: host serializes this entity into snapshots; client applies snapshots to it.
export const Replicated = defineComponent({
  dirty: Types.ui8,          // host-side: per-entity dirty flag set by mutating systems
  lastSentTick: Types.ui32,  // host-side: last snapshot tick this eid was written
});

// Client-only: this entity is the local avatar — runs prediction + reconciliation.
export const Predicted = defineComponent({
  lastAckedInput: Types.ui32, // seq of last input the host confirmed
  lastAckedX: Types.f32, lastAckedY: Types.f32, lastAckedZ: Types.f32, // authoritative anchor
});

// Client-only: remote entity rendered from interpolated snapshots.
export const Interpolated = defineComponent({
  // ring buffer of 3 recent snapshot transforms for Hermite/linear interp at render time
  bufHead: Types.ui8,
});

// Client-only companion storage for Interpolated (kept out of the marker for cache locality).
export const SnapshotBuffer = defineComponent({
  t0: Types.f64, x0: Types.f32, y0: Types.f32, z0: Types.f32, qx0: Types.f32, qy0: Types.f32, qz0: Types.f32, qw0: Types.f32,
  t1: Types.f64, x1: Types.f32, y1: Types.f32, z1: Types.f32, qx1: Types.f32, qy1: Types.f32, qz1: Types.f32, qw1: Types.f32,
});
```

#### 1.3 Player domain — `components/player.ts`
```ts
import { defineComponent, Types } from 'bitecs';

export const LocalPlayer  = defineComponent();  // tag: this peer's avatar
export const RemotePlayer = defineComponent();  // tag: another peer's avatar

// Sampled each client frame, sent to host on reliable-ish unreliable channel, applied during host sim.
export const PlayerInput = defineComponent({
  seq: Types.ui32,        // monotonically increasing input sequence (for reconciliation)
  moveX: Types.f32,       // -1..1 strafe
  moveZ: Types.f32,       // -1..1 forward
  yaw: Types.f32,         // look yaw (rad) — mouse, authoritative for movement
  pitch: Types.f32,       // look pitch (rad) — clamped
  buttons: Types.ui16,    // bitmask: FIRE|ALT|RELOAD|MELEE|INTERACT|FLASHLIGHT|SPRINT|CROUCH|JUMP
  dt: Types.f32,          // client frame dt for this sample (host clamps)
});

export const PlayerState = defineComponent({
  health: Types.f32,       // 0..100
  resolve: Types.f32,      // 0..100 (sanity); decays in dark/isolation
  battery: Types.f32,      // 0..100 flashlight charge
  ammoMag: Types.ui16,     // rounds in current magazine
  ammoReserve: Types.ui16, // reserve rounds
  status: Types.ui8,       // bitmask: ALIVE|DOWNED|DEAD|RELOADING|SPRINTING|CROUCHED
  downedTimer: Types.f32,  // bleed-out countdown when DOWNED
});

export const Flashlight = defineComponent({
  on: Types.ui8,           // 0/1
  intensity: Types.f32,    // current lumens (flicker-modulated by presentation)
  range: Types.f32,        // m
  coneCos: Types.f32,      // cos(half-angle) for the spot
  drainRate: Types.f32,    // battery %/s while on
  noiseRadius: Types.f32,  // how far the beam "attracts" the Stalker (light-greed knob)
});
```
Button bitmask (single source of truth in `types.ts`):
```ts
export const enum Btn { FIRE=1, ALT=2, RELOAD=4, MELEE=8, INTERACT=16, FLASHLIGHT=32, SPRINT=64, CROUCH=128, JUMP=256 }
export const enum PStatus { ALIVE=1, DOWNED=2, DEAD=4, RELOADING=8, SPRINTING=16, CROUCHED=32 }
```

#### 1.4 Enemy / AI domain — `components/enemy.ts`
```ts
import { defineComponent, Types } from 'bitecs';

export const EnemyTag = defineComponent();   // generic enemy marker (all archetypes carry it)

// Per-archetype data (only the relevant one is attached). MVP ships Stalker + Swarmer.
export const Stalker = defineComponent({
  pounceCooldown: Types.f32,
  aggression: Types.f32,     // 0..1, Director-tuned
  legsSevered: Types.ui8,    // 1 => cannot pounce (dismemberment proof)
});
export const Swarmer = defineComponent({
  swarmGroup: Types.ui16,    // shared group id for flocking / wave bookkeeping
});

export const enum FsmState { Idle=0, Patrol=1, Investigate=2, Hunt=3, Attack=4, Flee=5, Stagger=6, Dead=7 }

// Host-only FSM + perception blackboard.
export const AIState = defineComponent({
  fsm: Types.ui8,            // FsmState
  target: Types.eid,         // current target entity (0 = none)
  lastKnownX: Types.f32, lastKnownY: Types.f32, lastKnownZ: Types.f32, // last seen/heard player pos
  noiseHeard: Types.f32,     // loudest noise stimulus this tick (0..1)
  noiseX: Types.f32, noiseY: Types.f32, noiseZ: Types.f32,            // its source
  alertness: Types.f32,      // 0..1 decaying suspicion
  stateTimer: Types.f32,     // time in current state (for timeouts)
  fsmReplicated: Types.ui8,  // host writes a coarse 'visible mood' enum here for clients (anim/audio)
});

// Detour crowd agent binding (recast-navigation-js), host-only.
export const NavAgent = defineComponent({
  agentId: Types.i32,        // index into Detour crowd (-1 = unbound)
  destX: Types.f32, destY: Types.f32, destZ: Types.f32,
  speed: Types.f32,
  radius: Types.f32,
  flags: Types.ui8,          // CAN_VENT|CAN_CEILING off-mesh capabilities
  repathTimer: Types.f32,
});

// Spatial noise stimulus emitted by player actions (gunfire, footsteps, flashlight). Host-only sensing.
export const Noise = defineComponent({
  loudness: Types.f32,       // 0..1 at source
  radius: Types.f32,         // falloff radius (m)
  ttl: Types.f32,            // seconds before this stimulus entity is reclaimed
  sourcePeer: Types.ui8,
});
```

#### 1.5 Combat domain — `components/combat.ts`
```ts
import { defineComponent, Types } from 'bitecs';

export const enum WeaponKind { PulseRifle=0, Melee=1 }

export const Weapon = defineComponent({
  kind: Types.ui8,           // WeaponKind
  damage: Types.f32,
  fireRate: Types.f32,       // rounds/s
  cooldown: Types.f32,       // time until next allowed shot
  range: Types.f32,
  spread: Types.f32,
  magSize: Types.ui16,
  reloadTime: Types.f32,
  reloadTimer: Types.f32,
  muzzleNoise: Types.f32,    // loudness emitted on fire (feeds Noise)
});

export const Projectile = defineComponent({
  damage: Types.f32,
  speed: Types.f32,
  ownerEid: Types.eid,       // who fired (for friendly-fire rules / scoring)
  ownerPeer: Types.ui8,
  ttl: Types.f32,            // seconds before pool reclaim
  hitscan: Types.ui8,        // 1 => resolved instantly host-side, no flight (pulse rifle MVP)
});

export const Health = defineComponent({
  hp: Types.f32,
  max: Types.f32,
  dead: Types.ui8,
});

// Per-limb HP for Dead-Space dismemberment. Up to 8 segments; index = LimbSlot enum.
export const enum LimbSlot { Head=0, Torso=1, LArm=2, RArm=3, LLeg=4, RLeg=5, Tail=6, Extra=7 }
export const Limb = defineComponent({
  hp:       [Types.f32, 8],  // per-slot HP
  max:      [Types.f32, 8],
  severed:  Types.ui8,       // bitmask of detached slots (drives mesh swap + gameplay effect)
});

// Attached to colliders that can take damage (limb hitboxes map to a parent + slot).
export const Hitbox = defineComponent({
  parent: Types.eid,         // owning enemy/player entity
  slot: Types.ui8,           // LimbSlot
  multiplier: Types.f32,     // damage multiplier (headshot etc.)
});

// Transient event entity produced by combat resolution, consumed by audio/vfx + replicated as event.
export const DamageEvent = defineComponent({
  victim: Types.eid,
  attackerPeer: Types.ui8,
  amount: Types.f32,
  slot: Types.ui8,
  killed: Types.ui8,
  severed: Types.ui8,        // slot bitmask newly severed this hit
});
```

#### 1.6 Presentation domain — `components/presentation.ts` (client-side; NOT replicated)
```ts
import { defineComponent, Types } from 'bitecs';

// Bridge to Three.js. The Object3D itself lives in a JS-side Map<eid, Object3D>, not in SoA.
export const RenderRef = defineComponent({
  handle: Types.ui32,        // index into RenderRegistry (JS-side array of Object3D)
  visible: Types.ui8,
});

export const AudioEmitter = defineComponent({
  emitterId: Types.ui32,     // index into AudioDirector's PannerNode pool
  clipBank: Types.ui16,      // which pre-baked clip bank this entity draws from
  flags: Types.ui8,          // LOOP|OCCLUDABLE|SPATIAL
});

export const Light = defineComponent({
  handle: Types.ui32,        // index into LightRegistry (Three light instances, scarce budget)
  color: Types.ui32,         // packed RGBA
  intensity: Types.f32,
  flicker: Types.f32,        // TSL-noise flicker amount, synced to audio beat
  kind: Types.ui8,           // SPOT(flashlight)|POINT(panel)|MUZZLE
};

export const enum Lod { High=0, Mid=1, Low=2, Culled=3 }
export const LODState = defineComponent({
  lod: Types.ui8,            // Lod
  distSq: Types.f32,         // cached camera distance²
  hysteresisTimer: Types.f32,
});

export const AnimState = defineComponent({
  clip: Types.ui8,           // current animation clip id (driven by AIState.fsmReplicated / PlayerState)
  time: Types.f32,
  blend: Types.f32,
});
```

#### 1.7 Lifecycle / pooling domain — `components/lifecycle.ts`
```ts
import { defineComponent, Types } from 'bitecs';

export const Lifetime = defineComponent({ remaining: Types.f32 }); // auto-despawn timer

export const Pooled = defineComponent({       // entity came from a pool; recycle instead of removeEntity
  poolId: Types.ui8,         // which pool (Stalker/Swarmer/Projectile/Noise...)
  active: Types.ui8,         // 1 live, 0 parked in free-list
});

export const Spawned  = defineComponent();    // event tag: created this tick (host → emit spawn msg)
export const Despawn  = defineComponent();    // event tag: marked for removal end of tick
```

#### 1.8 Component registry — `components/index.ts`
A single ordered array assigns each replicated component a stable **byte id** used by the wire codec. Order is locked; append-only (never reorder — breaks protocol).
```ts
export const REPLICATED_REGISTRY = [
  Transform,    // 0
  NetworkId,    // 1
  PlayerState,  // 2
  Flashlight,   // 3 (only the {on,intensity} subset — see serialize/schema.ts)
  Health,       // 4
  Limb,         // 5
  AIState,      // 6 (fsmReplicated + lastKnown subset only)
] as const;
```

---

### 2. SYSTEM CATALOG & EXECUTION ORDER

A system is `(world) => world`. Pipelines composed with bitECS `pipe()`. Three pipelines: **hostPipeline** (host only), **clientPipeline** (every peer, including host for its own avatar/render), and **sharedSystems** (pure, run on whichever side owns the data).

> Host is also a player, so on the host machine both `hostPipeline` (sim) and the render/audio half of `clientPipeline` run each frame; the host's own avatar uses direct input, not prediction.

#### 2.1 Host pipeline (fixed 60 Hz accumulator)
Order is load-bearing — perception before FSM before movement before combat before snapshot.
```
 1. ingestInputSystem        (shared)  apply buffered PlayerInput to host PlayerState/intent
 2. noiseDecaySystem         (host)    age Noise entities, reclaim ttl<=0
 3. aiSensingSystem          (host)    raycast LOS + noise grid → AIState.noiseHeard/lastKnown/alertness
 4. aiDirectorSystem         (host)    Population + Scare Director: spawn budget, tension float, audio-event ids
 5. aiFsmSystem              (host)    AIState transitions per FsmState; set NavAgent.dest
 6. navAgentSystem           (host)    push dests to Detour crowd, step crowd, read back velocities
 7. movementIntentSystem     (shared)  players + enemies → desired Velocity
 8. physicsStepSystem        (host)    Rapier fixedStep: integrate, character controllers, collisions
 9. syncPhysicsToTransform   (host)    copy Rapier bodies → Transform/Velocity
10. weaponSystem             (host)    fire cooldowns, reloads, spawn Projectile / hitscan resolve
11. projectileSystem         (host)    advance non-hitscan, broadphase hits
12. combatResolutionSystem   (host)    apply DamageEvent → Health/Limb, sever logic, kills
13. playerStateSystem        (host)    battery drain, resolve drain (dark/isolation), downed/bleed
14. lifetimeSystem           (shared)  decrement Lifetime/ttl → mark Despawn
15. snapshotSerializeSystem  (host)    write dirty Replicated entities → snapshot, fan out @20Hz (gated)
16. eventFlushSystem         (host)    flush DamageEvent/Spawned/Despawn over reliable channel
17. poolReclaimSystem        (shared)  recycle Despawn'd Pooled entities into free-lists
```
`snapshotSerializeSystem` only emits every 3rd sim tick (60→20 Hz); it always runs the dirty-scan but gates the network write.

#### 2.2 Client pipeline (per render frame, variable dt)
```
 1. sampleInputSystem        (client)  read KB+M/pointer-lock → PlayerInput(seq++), push to host + local ring
 2. predictionSystem         (client)  apply local input immediately to Predicted avatar (movement only)
 3. snapshotApplySystem      (client)  decode incoming snapshot → SnapshotBuffer / authoritative anchors
 4. reconciliationSystem     (client)  on new ack: snap Predicted to authoritative, replay unacked inputs
 5. interpolationSystem      (client)  Interpolated entities → Transform via render-delay buffer
 6. animationSystem          (client)  AnimState from PlayerState/AIState.fsmReplicated; advance clips
 7. audioDispatchSystem      (client)  consume audio-event ids + AudioEmitter → AudioDirector facade
 8. lodCullSystem            (client)  camera distance → LODState, frustum/occlusion cull, RenderRef.visible
 9. lightSyncSystem          (client)  Flashlight/Light → Three lights (flicker, budget cap)
10. renderSyncSystem         (client)  Transform/PrevTransform interp → Object3D; submit to WebGPURenderer
11. hudPublishSystem         (client)  push PlayerState deltas to Zustand store (throttled, NEVER per-component)
```

#### 2.3 Shared (pure) systems
`ingestInputSystem`, `movementIntentSystem`, `lifetimeSystem`, `poolReclaimSystem` are deterministic and side-effect-free w.r.t. rendering — same code both sides, so host-replay repro matches.

---

### 3. ECS ↔ NETCODE SNAPSHOT MAPPING

#### 3.1 What replicates
| Component | Replicated? | Fields on wire | Channel |
|---|---|---|---|
| Transform | yes | x,y,z (quantized), qx,qy,qz,qw (smallest-three) | unreliable (snapshot) |
| NetworkId | spawn only | id, ownerPeer, archetype | reliable (spawn msg) |
| PlayerState | yes | health,resolve,battery,ammoMag,ammoReserve,status | unreliable |
| Flashlight | yes | on, intensity | unreliable |
| Health / Limb | yes | hp, severed bitmask | unreliable (Limb on change) |
| AIState | partial | fsmReplicated, lastKnownX/Y/Z | unreliable |
| Velocity, NavAgent, Noise, Weapon, AIState(full), all presentation | **no** | host-local only | — |
| DamageEvent, Spawned, Despawn | events | discrete event msgs | reliable |

#### 3.2 SoA → bytes (clean serialization)
Because every replicated field is a flat `TypedArray` indexed by `eid`, serialization is a tight loop — no object walking. Per replicated component we declare a **field manifest** in `serialize/schema.ts`:
```ts
type FieldEnc = { arr: TypedArray; q?: { bits: number; min: number; max: number } };
type CompManifest = { compId: number; fields: (eid: number) => FieldEnc[]; };
```
Snapshot frame layout (delta vs last-acked baseline per receiver):
```
[u32 tick][u16 entityCount]
  repeat entityCount:
    [u32 netId][u8 compMask]          # which replicated comps changed for this entity
    for each set bit in compMask:
      <packed fields for that component>   # quantized per schema
```
Quantization: positions to **16-bit** over a per-sector AABB (`min..max → 0..65535`), quaternions via **smallest-three** (2-bit largest index + 3×10-bit ≈ 4 bytes), scalars (health/battery) to **u8** (0..100). Writer (`writer.ts`) walks `REPLICATED_REGISTRY` order; reader (`reader.ts`) mirrors it. Delta: host keeps a per-receiver acked baseline ring (last ~30 ticks); only entities with `Replicated.dirty` since the receiver's ack are written. Receiver ACKs `tick`; host advances that receiver's baseline.

#### 3.3 Entity-id mapping (host ↔ client) — `serialize/idmap.ts`
Local bitECS `eid`s differ per peer. The bridge is `NetworkId.id` (global, host-assigned).
```ts
class IdMap {
  private netToLocal = new Map<number, number>(); // netId -> local eid
  private localToNet = new Uint32Array(MAX_ENTITIES);
  resolveOrSpawn(netId: number, archetype: Archetype): number; // client: get or prefab-spawn
  bind(localEid: number, netId: number): void;
  release(netId: number): void;
}
```
- **Host**: `NetworkId.id` allocated from a monotonic counter at spawn; `localToNet` is identity-ish.
- **Client**: on first sight of a `netId` in a snapshot, `resolveOrSpawn` reads the archetype from the spawn event (or the snapshot's archetype field) and calls the matching prefab (`addStalker`, etc.), binding the new local eid. Despawn events call `release` → pool reclaim.

---

### 4. OBJECT POOLING & SPAWN/DESPAWN REPLICATION

#### 4.1 Pool — `pool/pool.ts`
No `removeEntity` during play (it would churn bitECS internals and risk GC). Pools pre-allocate a fixed count of entities per archetype with all components attached, parked via `Pooled.active=0`.
```ts
class EntityPool {
  private free: number[] = [];     // free-list of parked eids
  constructor(world, public poolId: number, count: number, private build: (w,eid)=>void) {
    for (let i=0;i<count;i++){ const e=addEntity(world); build(world,e); Pooled.poolId[e]=poolId; Pooled.active[e]=0; this.free.push(e); }
  }
  acquire(world): number {                  // O(1); returns -1 if exhausted (Director must cap spawns)
    const e = this.free.pop(); if (e===undefined) return -1;
    Pooled.active[e]=1; addComponent(world, Spawned, e); return e;
  }
  release(world, e: number){ Pooled.active[e]=0; this.free.push(e); /* reset comp fields in poolReclaim */ }
}
```
Pools (sized for MVP, headroom for M5): Stalker ×4, Swarmer ×32, Projectile ×128, Noise ×64, DamageEvent ×64. `poolReclaimSystem` zeroes the recycled entity's component fields (health, transform, FSM) so a reused eid never leaks stale state.

#### 4.2 Spawn/despawn over the wire
Creation/destruction is **host-authoritative and event-replicated** (reliable channel), never inferred:
- Host `acquire()` → `Spawned` tag → `eventFlushSystem` emits `SPAWN{netId, archetype, ownerPeer, initial Transform}`.
- Client receives `SPAWN` → `IdMap.resolveOrSpawn` → its own pool `acquire()` for that archetype → `bind`.
- Host `release()` (via `Despawn`) → emits `DESPAWN{netId}` → client pool `release()` + `IdMap.release`.
- Snapshots only ever address entities the client already spawned; an unknown `netId` in a snapshot is buffered one frame awaiting its (reliable) SPAWN, then dropped if it never arrives.

---

### 5. THIN OOP FACADE FOR SINGLETONS — `facade/singletons.ts`

ECS holds per-entity data; genuinely singleton, stateful services stay as plain classes referenced from the `World` object (not stored in SoA). Systems call them; they never iterate the world themselves.
```ts
export interface World extends IWorld {
  time: { tick: number; elapsed: number; dt: number };
  audio: AudioDirector;     // Web Audio engine + Scare Director cue scheduling
  net: NetManager;          // simple-peer channels, snapshot fan-out, ack tracking, IdMap
  physics: PhysicsBridge;   // Rapier world handle (host only; undefined on pure clients)
  render: RenderRegistry;   // eid -> Object3D / Light handles (client only)
  director: DirectorState;  // tension float, scare-debt, spawn budget (host only)
  pools: Record<number, EntityPool>;
  idmap: IdMap;
}
```
Rules: (1) singletons are created in `world.ts` bootstrap and attached to `world`; (2) systems read/write entity components and *call* singleton methods (`world.audio.playEvent(id)`, `world.net.queueSnapshot(buf)`) — keeping the data-oriented loop pure and the I/O behind a façade; (3) singletons hold zero per-entity arrays. This is the "thin OOP facade alongside ECS" pattern from the design doc.

---

### 6. CODE SKETCH — components, a system, bootstrap

`components/transform.ts` + `player.ts` shown in §1. A representative host system:
```ts
// systems/host/playerStateSystem.ts
import { defineQuery, pipe } from 'bitecs';
import { PlayerState, Flashlight, LocalPlayer, RemotePlayer } from '../../components';
import { FIXED_DT } from '../../types';
import { PStatus } from '../../types';

const players = defineQuery([PlayerState, Flashlight]);

export function playerStateSystem(world: World) {
  const ents = players(world);
  for (let i = 0; i < ents.length; i++) {
    const e = ents[i];
    // flashlight battery drain
    if (Flashlight.on[e]) {
      PlayerState.battery[e] = Math.max(0, PlayerState.battery[e] - Flashlight.drainRate[e] * FIXED_DT);
      if (PlayerState.battery[e] <= 0) Flashlight.on[e] = 0;
    }
    // resolve drain: faster in darkness (flashlight off) — light is safety
    const dark = Flashlight.on[e] ? 0.05 : 0.4;
    PlayerState.resolve[e] = Math.max(0, PlayerState.resolve[e] - dark * FIXED_DT);
    // downed bleed-out
    if (PlayerState.status[e] & PStatus.DOWNED) {
      PlayerState.downedTimer[e] -= FIXED_DT;
      if (PlayerState.downedTimer[e] <= 0) { PlayerState.status[e] = PStatus.DEAD; }
    }
    Replicated.dirty[e] = 1; // mark for next snapshot
  }
  return world;
}
```
World bootstrap:
```ts
// world.ts
import { createWorld } from 'bitecs';
import { AudioDirector, NetManager, PhysicsBridge, RenderRegistry, IdMap } from './facade/singletons';
import { EntityPool } from './pool/pool';
import { buildStalker, buildSwarmer, buildProjectile, buildNoise } from './prefabs/archetypes';
import { PoolId } from './types';

export function createGameWorld(role: 'host' | 'client'): World {
  const world = createWorld() as World;
  world.time = { tick: 0, elapsed: 0, dt: 0 };
  world.idmap = new IdMap();
  world.audio = new AudioDirector();
  world.net = new NetManager(world.idmap);
  world.render = role !== 'host-headless' ? new RenderRegistry() : undefined!;
  if (role === 'host') {
    world.physics = new PhysicsBridge();   // Rapier
    world.director = createDirectorState();
  }
  world.pools = {
    [PoolId.Stalker]:    new EntityPool(world, PoolId.Stalker, 4,   buildStalker),
    [PoolId.Swarmer]:    new EntityPool(world, PoolId.Swarmer, 32,  buildSwarmer),
    [PoolId.Projectile]: new EntityPool(world, PoolId.Projectile, 128, buildProjectile),
    [PoolId.Noise]:      new EntityPool(world, PoolId.Noise, 64,   buildNoise),
  };
  return world;
}

// main loop (host): fixed-step accumulator
let acc = 0;
function hostTick(rafDt: number) {
  acc += rafDt;
  while (acc >= FIXED_DT) {
    world.time.dt = FIXED_DT; world.time.tick++; world.time.elapsed += FIXED_DT;
    hostPipeline(world);     // §2.1
    acc -= FIXED_DT;
  }
  clientRenderPipeline(world); // §2.2 render half, variable dt
}
```
Prefab example (host + client both call this; client via `resolveOrSpawn`):
```ts
// prefabs/archetypes.ts
export function buildStalker(world: World, e: number) {
  addComponent(world, Transform, e);  addComponent(world, PrevTransform, e);
  addComponent(world, Velocity, e);   addComponent(world, EnemyTag, e);
  addComponent(world, Stalker, e);    addComponent(world, AIState, e);
  addComponent(world, NavAgent, e);   addComponent(world, Health, e);
  addComponent(world, Limb, e);       addComponent(world, NetworkId, e);
  addComponent(world, Replicated, e); addComponent(world, Pooled, e);
  Health.max[e] = 120; Health.hp[e] = 120;
  Limb.max[e * 8 + LimbSlot.LLeg] = 30; Limb.hp[e * 8 + LimbSlot.LLeg] = 30; // legs severable
  Limb.max[e * 8 + LimbSlot.RLeg] = 30; Limb.hp[e * 8 + LimbSlot.RLeg] = 30;
  NavAgent.agentId[e] = -1; AIState.fsm[e] = FsmState.Idle;
  // client side also adds RenderRef/AnimState/AudioEmitter via a presentation-attach pass
}
```
> Note on array components: bitECS stores `Limb.hp` as a flat strided array; index is `eid * arity + slot`. The `[e * 8 + slot]` form above is the correct access pattern (some bitECS versions expose `Limb.hp[e][slot]` proxies — pick one and lint for it).

---

### 7. Open protocol invariants (must hold across the codebase)
- `REPLICATED_REGISTRY` order = wire `compId`; **append-only**.
- `Archetype` enum values are protocol — never reorder.
- Storage f32; quantize only at serialize.
- No `addEntity`/`removeEntity` during play after warm-up — pools only.
- HUD updates via throttled store publish, never per-component per-frame (locked decision).

## Tasks (toward M4 vertical slice)

- **[M0] Scaffold packages/ecs with constants, types, enums and component registry** — _done when:_ packages/ecs builds under Turborepo; types.ts exports FIXED_DT/SNAPSHOT_HZ/MAX_ENTITIES/Btn/PStatus/FsmState/LimbSlot/Archetype/PoolId; REPLICATED_REGISTRY ordered array exists and is imported by serialize codec.
- **[M0] Implement full component catalog as bitECS SoA defineComponent modules** — _done when:_ All components in spec §1 compile and are re-exported from components/index.ts; a unit test attaches every component to an entity and reads/writes each field including array fields (Limb.hp strided access) without error. _(deps: types/enums scaffold)_
- **[M0] Build EntityPool + lifecycle (Pooled/Spawned/Despawn) and poolReclaimSystem** — _done when:_ Acquiring then releasing 1000x a Projectile pool causes zero new entity allocations after warm-up and zero GC-visible growth (heap snapshot stable); reclaimed entity has all component fields zeroed. _(deps: component catalog)_
- **[M0] Implement prefab archetypes (player, stalker, swarmer, projectile, noise)** — _done when:_ Each build* fn attaches the exact component set from spec and sets initial field values (e.g. Stalker legs severable HP, NavAgent.agentId=-1); pools wired to use them. _(deps: component catalog, pool)_
- **[M1] IdMap + serialize schema/writer/reader delta snapshot codec** — _done when:_ Round-trip test: host world with N replicated entities serializes a delta snapshot, a fresh client world deserializes it, and resolved Transform/PlayerState/Health match host within quantization tolerance; unknown netId path buffers then drops cleanly. _(deps: component catalog, registry)_
- **[M2] Implement host pipeline systems (sensing→director→fsm→nav→physics→combat→state→serialize) wired via pipe()** — _done when:_ Host fixed-step loop runs all §2.1 systems in order at 60Hz with a Stalker that senses noise, transitions FSM, paths via Detour, and applies dismemberment (legsSevered blocks pounce) in an integration test scene. _(deps: prefabs, codec, physics+nav bridges)_
- **[M2] Implement client pipeline (input→prediction→apply→reconcile→interp→render/audio/hud)** — _done when:_ Two local worlds (host+client) in-process: client predicts local avatar, reconciles to host anchor with replay (no visible snap under simulated 100ms delay), and renders remote enemy via interpolation buffer. _(deps: codec, host pipeline)_
- **[M3] Wire singleton facade (AudioDirector/NetManager/PhysicsBridge/RenderRegistry) onto World** — _done when:_ createGameWorld('host') and ('client') attach the correct singletons (physics/director host-only, render client-only); audioDispatchSystem calls world.audio.playEvent for emitted reliable audio-event ids with zero per-entity allocation. _(deps: client pipeline)_
- **[M4] Spawn/despawn event replication end-to-end through pools** — _done when:_ Host Director acquire() emits SPAWN over reliable channel; client resolveOrSpawn spawns matching prefab from its pool and binds netId; DESPAWN releases on both sides; verified in the 2-player Haunted Corridor slice with a Swarmer vent wave and no GC hitch at 60fps. _(deps: all prior ecs tasks, netcode transport)_

## Open questions

- bitECS version: target classic 0.3.x defineComponent API (assumed here) or migrate to 0.4 function-based addComponent(world,eid,Component)? Affects every call site and the array-field access pattern (strided index vs proxy).
- Quaternion wire encoding: smallest-three (4 bytes, lossy) vs raw 3×f16 — confirm acceptable rotation precision for first-person aim feel before locking the codec.
- Position quantization needs a per-sector AABB to map 16-bit ranges; does level/streaming data already expose sector bounds the serializer can read, or does ECS need its own SectorBounds component?
- Limb component arity fixed at 8 slots for all entities (wastes memory for Swarmers with fewer limbs) vs separate small/large limb components — confirm 8-slot uniform is fine for MVP memory budget.
- Does the host run a true headless sim branch, or always render its own view? Affects whether RenderRegistry/presentation systems must be fully optional on the host path.
