# Contextual / Location-Aware Physics & Behaviour — Zones

**Signature mechanic:** ZERO-G HULL-BREACH DECOMPRESSION SEQUENCE — a dark zero-G zone where players thrust between handholds and a Stalker corkscrews through the air at them; the Director (or a Brute) blows a hull breach, flipping the zone PRESSURIZED→VACUUM over a few-second venting ramp: a roaring vent-rush of air that FADES TO TOTAL SILENCE as the zone empties (the iconic Dead Space/Alien sensory cut — airborne sound collapses, you hear only your own panicked breathing and a suit-air countdown), while a suck-force toward the breach drags players, loose props, ragdolls, and your own severed-limb debris toward the hole. Counterplay is the zero-G grab system: anchor to a handhold to resist the pull, or seal/re-pressurize the breach (objective) to get a WHUMP of returning sound and gravity. It is the convergence of all four pillars — zero-G physics, vacuum silence, decompression force, suit-air scarcity — emergent from ONE zone-state mutation, host-authoritative and migration-safe, and it is exactly the 'broken gravity, near-total dark' the Alien-Infested Wreck final ship already promises in the ships-as-maps doc.


## Zone types

- GRAVITY: NORMAL (9.81 down) — standard grounded character controller, walk/sprint/crouch
- GRAVITY: LOW-G (~1.6 m/s², gravityScale~0.16) — floaty jumps, slow falls, momentum-y movement (reactor/lunar-deck sections)
- GRAVITY: ZERO-G (gravityScale 0) — float/drift movement: thrust+momentum, grab handholds, push-off; enemies corkscrew-hunt; the signature wow/horror space
- GRAVITY: DIRECTIONAL (gravityScale 0 + per-frame force along gravityDir) — spin-gravity rings / magnetic-boot wall-floors where 'down' is sideways
- ATMOSPHERE: PRESSURIZED — normal: sound carries, no suit-air drain, no suck forces
- ATMOSPHERE: THIN — partial: suit-air drains slowly, attenuated sound, mild hazard
- ATMOSPHERE: VACUUM — no airborne sound (silence!), suit-air drains fast (suffocation clock), sound-detection blinded, projectiles fly drag-free; the iconic sensory-cut zone
- DECOMPRESSION (transient zone event) — breach entity: ramped pressurized→vacuum, suck-force toward breach on all dynamic bodies, players/props/gibs pulled out the hull; grab/seal to survive
- MEDIUM: WATER/COOLANT (flooding) — buoyancy + swim mode + high drag; rising fluidLevelY = vertical timer horror; coolant adds toxic/cold hazard tick
- HAZARD: FIRE — DoT + heat + spreadable + acts as a light source for AI vision
- HAZARD: ELECTRICAL — timed arcing damage + flashlight EMP-flicker
- HAZARD: RADIATION — silent DoT + Geiger audio cue, a 'cross fast' zone
- HAZARD: DARK — ambientLux~0: max Resolve drain, max Stalker/sound-hunter advantage, flashlight self-reveal most lethal
- TEMPERATURE — drives suit-heat/cold drain, metal-creak ambience, frost/heat-haze VFX
- SOUND PROFILE: NORMAL / MUFFLED / VACUUM — selects reverb IR, occlusion lowpass, and (vacuum) full airborne-sound collapse; keyed to listener's zone

## Design

# SIGNAL LOST — Contextual / Location-Aware Physics + Behaviour

**Verdict: fully feasible** in the locked stack, host-authoritative, and it slots into systems that already exist — it is an *extension of the zone/section concept the codebase already has*, not a new parallel engine. The codebase already ships per-section reverb (`ConvolverNode`), occlusion (`BiquadFilter` lowpass), per-section fog/lightmap, a `director.zone_enter` event, portal/sector visibility, a `LevelData.ts` schema (`lighting/reverb/spawn/fog`), and navmesh area flags reserved for `DARK`/`VENT`/`HAZARD`. The single missing primitive is a **first-class `Zone` (Region) abstraction** that those scattered facts hang off, plus a **per-zone gravity/atmosphere physics driver**. Rapier (JS/WASM) confirms every primitive we need: runtime `setGravityScale(scale, true)` per body, per-frame `addForce`/`applyImpulse`/`resetForces`, sensor colliders + `intersectionPairsWith`/intersection-graph for zone membership, and the kinematic character controller for swappable movement modes. All host-only and deterministic given fixed step order — consistent with the host-authoritative + warm-standby-migration design.

---

## 1. The Zone / Region abstraction (the spine)

A **Zone** is an authored convex (or box-decomposed) volume inside a ship, tagged in level data, that carries a property bundle read by **physics, AI, and audio** identically. Zones are the level's *contexts*. A ship's 4–5 named areas (docking bay, habitation, engineering…) are each composed of one or more zones; a single decompressing airlock is its own zone.

### 1.1 Authoring/level data — extend `LevelData.ts`

```ts
// packages/engine/src/level/LevelData.ts  (extends existing lighting/reverb/spawn/fog schema)
export interface ZoneDef {
  id: number;                       // stable per-ship zone id (protocol-stable, never reorder)
  name: string;                     // 'eng.coolant_bay'
  bounds: AABB | ConvexHull[];      // sensor collider(s) authored in Blender, exported in GLB
  // --- PHYSICS ---
  gravity: number;                  // m/s² along -Y; 9.81 normal, 1.6 low-g, 0.0 zero-G
  gravityDir?: [number,number,number]; // optional non-down vector (spin-gravity ring, mag-floor)
  atmosphere: Atmo;                 // PRESSURIZED | THIN | VACUUM
  medium: Medium;                   // AIR | WATER | COOLANT (buoyancy + drag)
  fluidLevelY?: number;            // world-Y of liquid surface for flooding buoyancy
  drag: number;                     // linear damping applied to bodies (zero-G=low, water=high)
  // --- HAZARD ---
  hazards: HazardFlags;             // bitmask: FIRE|ELECTRICAL|RADIATION|COOLANT|DARK|DECOMP
  hazardDps?: Partial<Record<Hazard, number>>; // damage/sec per active hazard
  temperature: number;              // °C; drives suit-heat drain + audio (creaks) + VFX
  // --- AUDIO ---
  reverbIR: AudioId;                // ConvolverNode IR id (already exists)
  soundProfile: SoundProfile;       // NORMAL | MUFFLED | VACUUM (vacuum => no airborne sound)
  ambientBed: AudioId;              // looped room tone (silent in vacuum)
  // --- AI / LEVEL ---
  navAreaFlags: number;             // DARK|VENT|HAZARD navmesh area mask (already reserved)
  ambientLux: number;              // coarse baseAmbient for vision (already used by AI sensing)
  portalTo: number[];              // adjacent zone ids (door/breach edges) for occlusion + crossfade
}
export enum Atmo { PRESSURIZED=0, THIN=1, VACUUM=2 }
export enum Medium { AIR=0, WATER=1, COOLANT=2 }
```

Zones are **authored as sensor colliders in the level GLB** (a tagged empty/box per zone) and baked into `LevelData`. The bounds double as: (a) the membership sensor in Rapier, (b) the audio crossfade trigger (reuses the existing 600 ms reverb crossfade on boundary cross), (c) the fog/lightmap region selector, (d) the portal-visibility cell.

### 1.2 Runtime zone state — ECS singleton + per-entity tag

The static `ZoneDef[]` is immutable level data. A small **mutable** `ZoneState` sidecar holds what *changes during play* (this is the serializable migration payload, §6):

```ts
// packages/ecs/src/components/zone.ts
export const ZoneRuntime = defineComponent({         // SoA indexed by zoneId (small fixed array)
  gravityScale: Types.f32,   // current (a breach can flip a zone PRESSURIZED→VACUUM, grav unchanged;
  atmo: Types.ui8,           //   a reactor breach can drop gravity to 0)
  medium: Types.ui8,
  hazardBits: Types.ui16,    // live hazard mask (fire spreading, flood rising)
  fluidLevelY: Types.f32,    // rises during flooding
  breachId: Types.i32,       // -1, or eid of an active decompression breach in this zone
  flags: Types.ui8,          // SEALED|VENTING|FLOODED|...
});

// Per-entity: which zone am I in right now (host writes from the sensor query each tick)
export const InZone = defineComponent({ zoneId: Types.i16, prevZoneId: Types.i16 });
```

`ZoneRuntime` is the *signature win*: a zone is not static — the Director / scripted events **mutate** it (blow a door → atmo flips to VACUUM, a breach entity spawns, gravity may drop), and every consumer (physics, AI, audio, HUD) reacts the next tick with no special-casing.

---

## 2. Zone-membership: which entity is in which zone (host-only)

Each `ZoneDef.bounds` becomes a **fixed Rapier sensor collider** (one per zone, created at level load). Every dynamic body of interest (players, enemies, props, debris) is tested for membership:

- Primary: on the host's `zoneMembershipSystem` (runs at **10 Hz**, staggered like AI sensing — cheap, zones are coarse), query `world.intersectionPairsWith(zoneSensor, cb)` **OR** the cheaper inverse: for each tracked body, point-test its position against the (few, convex) zone AABBs. For a ship with ~20–40 zones and ~30 bodies, a broadphase point-in-AABB scan is trivial; sensor events are the fallback for concave zones.
- Write `InZone.zoneId`. On change (`zoneId != prevZoneId`) emit a host event `ZONE_ENTER{eid, zoneId}` → drives audio crossfade (existing `director.zone_enter`), per-body physics reconfigure (§3), and AI re-evaluation (§4).
- **Hysteresis** on boundaries (small overlap band) so a player straddling a doorway doesn't thrash zones (and thrash reverb crossfades).

The *player's local camera* zone is also mirrored to the client (1 byte in the player snapshot) so the **client audio engine** knows which reverb/occlusion/soundProfile to apply without re-deriving it — clients never own zone logic, they just render the host's verdict.

---

## 3. How LOCATION changes PHYSICS (Rapier, host-only)

The host runs the only Rapier world (`physicsStepSystem`). A `zonePhysicsSystem` (runs right before `physicsStepSystem`, after membership) reconfigures bodies from the zone they're in. **Confirmed Rapier APIs:** `setGravityScale(scale, true)`, `addForce`, `applyImpulse`, `resetForces`, per-body `setLinearDamping`, character-controller modes.

### 3.1 Gravity (the headline)
Rapier world gravity stays a baseline (e.g. 9.81 down). **Per-zone gravity is per-body gravity scale**: on zone-enter, set `body.setGravityScale(zone.gravity / 9.81, true)`.
- **Normal** = scale 1.0. **Low-g** (`1.6 m/s²` lunar-ish reactor section) = scale ~0.16. **Zero-G** = scale 0.0.
- Non-down gravity (a spinning ring section, or magnetic-boot floors on a wall) uses `gravityScale=0` + a per-frame `addForce(gravityDir * mass * g)` in `zonePhysicsSystem`, giving arbitrary "down."

### 3.2 ZERO-G movement (signature mechanic)
When a player's `InZone` is `gravity≈0`, the **character controller swaps modes**:
- **Grounded mode** (normal): Rapier KinematicCharacterController, gravity, snap-to-ground, walk/sprint/crouch.
- **Float mode** (zero-G): switch the avatar to a **dynamic-ish drift model** — input is *thrust* not *velocity*. `moveX/moveZ/jump/crouch` map to small impulses along camera axes (`applyImpulse`), capped to a max speed; **momentum persists** (low `linearDamping`, e.g. 0.1) so you *drift* and must counter-thrust to stop. No ground = no friction.
- **Grab surfaces:** an INTERACT raycast within arm's reach to a grabbable surface/handhold (tagged colliders) **anchors** the player (zero velocity, kinematic) — the core zero-G tension: release to drift, grab to stop. Pushing off a surface applies an opposite impulse (Newton's third law) — a deliberate, momentum-committing traversal.
- Enemies in zero-G get the analogous treatment (§4).

This is **the wow/horror set-piece enabler**: a dark zero-G section where you thrust between handholds, a Stalker corkscrews through the air, and your light cone is the only thing tethering you to orientation.

### 3.3 Atmosphere & DECOMPRESSION events (the signature horror beat)
A **breach** is a host entity: a position + direction + radius + strength, spawned when a hull door is blown / a window cracks (scripted PEAK beat or a Brute slamming a bulkhead).
- On breach: the zone's `ZoneRuntime.atmo` flips `PRESSURIZED→VACUUM` over a short **venting** ramp (a few seconds — air doesn't leave instantly; this is the dramatic window).
- **Sucking force:** during venting, `zoneDecompSystem` applies `addForce` to every dynamic body in the zone, directed toward the breach, magnitude ∝ `breach.strength * falloff(distToBreach) * remainingPressure`. Players get pulled toward the breach; **loose props, ragdolls, gibs, the detached limb props from dismemberment** all get sucked out the hole (great spectacle, reuses pooled dynamic debris bodies that already exist for severed limbs §7 of AI spec).
- **Player counterplay:** grab a handhold (the same zero-G grab system) to resist the pull; mag-boots (a later tool) anchor you; or seal the breach (an objective interaction). Get pulled into the breach = severe damage / instadeath out the hull (a fairness-gated, telegraphed death).
- **Suit-air:** in `VACUUM`/`THIN`, `PlayerState` drains a **suit-air** reserve (add a field) — a second scarcity clock alongside battery; running out = suffocation damage. Vacuum is a *timed* zone you must cross or re-pressurize, not a place to camp.
- **Pressure-equalization slam:** when a vacuum zone is re-pressurized (door reseals, atmo restored), a one-shot reverse impulse + an audio "WHUMP" as sound returns (§5).

### 3.4 Medium: WATER / COOLANT flooding (buoyancy)
A flooding zone has `medium=WATER|COOLANT`, a rising `fluidLevelY`.
- Bodies below the surface get **buoyancy**: `addForce(up * displacedVolume * fluidDensity)` minus high `linearDamping` (water drag). Above surface = normal. Cheap analytic buoyancy (sample body's submerged fraction vs `fluidLevelY`), no real fluid sim.
- Player movement below surface = a **swim mode** (slow, drifting, drag-heavy — a third character-controller mode). Coolant adds a hazard tick (toxic/cold).
- Rising flood = a **vertical timer** horror (water creeps up while you solve an objective).

### 3.5 Hazards (forces & damage)
Hazards are zone flags that the host applies per-tick to bodies inside:
- **FIRE** — damage-over-time + a heat field; can spread (a zone flag the Director toggles). Light source for AI vision.
- **ELECTRICAL** — arcing damage zones (toggle on/off — a hazard you time your crossing through); EMP-flicker the player's flashlight (ties to the light/dark pillar).
- **RADIATION** — silent DoT, drives the Geiger audio cue; a "cross fast" zone.
- **COOLANT/flood** — §3.4.
- **DARK** — not damage, but `ambientLux≈0`: max Resolve drain, max Stalker advantage (vision), the existing flashlight-vs-safety tension cranked to 11.

### 3.6 Debris & ragdolls
All of the above operate on the **existing pooled dynamic-body system** (severed-limb props, thrown objects). Zone forces (gravity scale, decomp suck, buoyancy) apply to them with zero extra code because they're just dynamic bodies the per-zone driver iterates. A decompression that yanks a floating corpse and a cloud of debris out a hull breach is *emergent from the same system*, not bespoke.

---

## 4. How LOCATION changes ENEMY BEHAVIOUR (host-only AI)

The AI spec's HFSM/sensing reads the zone via `InZone.zoneId → ZoneDef/ZoneRuntime`. This is a **modifier layer over the existing Stalker HFSM + Swarmer FSM + Director**, not a rewrite — exactly the spot where the AI spec already reads `baseAmbient`/`navAreaFlags`.

### 4.1 Zone-aware sensing (slot into the existing model)
- **Light/vision:** `baseAmbient` already comes from a per-cell lux value → now sourced from `ZoneDef.ambientLux`. DARK zones → enemies that hunt by sound dominate; the flashlight's self-reveal (already +0.6) is *even more* lethal-to-you in pitch black.
- **Sound in VACUUM = silence:** the noise grid is gated by zone `soundProfile`. In a `VACUUM` zone, **footsteps/gunshots emit ~zero airborne noise** — sound-based detection is blinded. This flips the whole stealth model: in vacuum you're *invisible to hearing* but the gunshot muzzle flash + flashlight make you *visible*. A signature inversion of the two pillars (Light=threat, Sound=monster) per-zone.
- **MUFFLED zones** attenuate emitted noise (the existing occlusion concept, now zone-level).

### 4.2 Zone-aware behaviour trees / HFSM modifiers
Add a per-archetype **zone affinity table** + capability flags read by the FSM:

| Enemy | Dark zone | Zero-G zone | Vacuum zone | Vent/crawl | Flood |
|---|---|---|---|---|---|
| **Stalker** | thrives (sees by little light, prefers shadow; stays out of beam) | **corkscrew float-hunt**: pushes off surfaces, drifts at you, terrifying off-axis approach; uses ceiling off-mesh links already specced | tolerant (no breathing tell) | uses ceiling links | avoids deep water (slowed) |
| **Swarmer** | normal | clings/scuttles along surfaces (no free-float; uses geometry) | dies/avoids (fragile, needs pressure) — **gates them out of vacuum naturally** | **vent-native** (their spawn) | drowns fast |
| **Wall-Crawler** | thrives | **best in zero-G** — surface-locomotion is its whole identity | tolerant | native | clings above water |
| **Spitter** | normal | poor (needs a brace to spit) | projectile flies straight (no drag) — *deadlier* sightlines | no | normal |
| **Brute** | normal | clumsy but can **breach hulls** (causes the decomp event) | tolerant | no | wades |
| **Maw (boss)** | — | a zero-G arena is a natural boss space | — | — | — |

Implementation: a `ZoneAffinity` lookup `(enemyKind, zoneTraits) → { speedMul, canEnter, locomotionMode, senseMods }`. The FSM consults it at zone-enter:
- **`canEnter=false`** → the navmesh `navAreaFlags` + a pathing cost makes the enemy *avoid* that zone (Swarmers won't path into vacuum). This is mostly **free via navmesh area costs** the AI spec already reserved.
- **`locomotionMode`** swaps the crowd-agent steering for a float/cling/swim integrator (mirrors the player's character-controller mode swap §3.2).
- The Stalker's "flee to dark/vent" (already in the HFSM) now generalizes to "flee to its **affinity** zone."

### 4.3 Director hooks (the fear instrument reads zones)
The two-layer Director already owns pacing. Zones give it **set-piece levers**:
- The Director can **arm a zone event** at PEAK: "blow the breach in `eng.coolant_bay`" → decompression horror beat, telegraphed (the existing telegraph system). Zone events *cost scare-debt* like spawns.
- **Spawn selection** filters by zone affinity (don't spawn Swarmers where they'd suffocate; *do* pour them from vents into a pressurized choke).
- The Director can **mutate `ZoneRuntime`** (toggle DARK by killing power, start a flood, ignite a fire) as a paced scare — all replicated as zone-state deltas (§6).

---

## 5. How LOCATION changes AUDIO (ties to the existing Web Audio engine)

The audio engine already has per-section `ConvolverNode` reverb zones, `BiquadFilter` occlusion, HRTF panners, and a 600 ms reverb crossfade on section boundary. Zone audio is **driving those existing knobs from `ZoneDef`** + adding the vacuum case:

- **Reverb per zone:** `ZoneDef.reverbIR` selects the `ConvolverNode` IR; crossfade on zone-enter (existing mechanism). A cramped vent = tiny tight IR; a cavernous cargo bay = long metallic tail.
- **VACUUM = silence (signature):** when the *listener's* zone `soundProfile=VACUUM`, the audio engine **collapses airborne sound** — duck/zero the SFX bus & reverb send, kill the ambient bed; the player hears only **suit-internal** sound (their own breathing — louder, panicked as suit-air drops — heartbeat, muffled bone-conducted thuds via a heavy lowpass). This is the iconic *Dead Space / Alien* vacuum effect, and it's nearly free: it's a bus-gain + global lowpass toggled by the listener's zone, which the client already knows (§2).
- **Muffling / occlusion:** `MUFFLED` zones and cross-zone sound (hearing a monster through a sealed door / a thin wall) ramp the existing occlusion `BiquadFilter` lowpass (700 Hz) — now also keyed by *zone adjacency* (`portalTo`), not just raycast.
- **Pressure transitions as audio drama:** decompression = a roaring vent rush that *fades to silence* as the zone empties (atmo ramp drives a bus gain + lowpass automation); re-pressurization = the "WHUMP" as sound floods back. The atmo ramp value (§3.3) is the single automation source.
- **Temperature/hazard ambience:** cold zones add metal-creak one-shots; fire adds a roar; radiation adds the Geiger tick — all existing one-shot/ambient infrastructure, gated by `hazardBits`/`temperature`.
- **Director's "fear instrument":** because the Director can mutate zones, it can compose with *silence itself* — drop a player into vacuum right after a loud spike for a gut-punch sensory cut, which the adaptive-tension music layer respects (vacuum ducks music too).

---

## 6. NETCODE — host-authoritative + fully serializable (migration-safe)

Consistent with the warm-standby migration design ("no gameplay state in closures/renderer objects"):

- **Static `ZoneDef[]`** is level data, identical on every peer from the `mapId` load — **never serialized in snapshots** (it's content, not state).
- **Mutable `ZoneRuntime[]`** (per-zone: `gravityScale, atmo, medium, hazardBits, fluidLevelY, breachId, flags`) **is** part of the serializable sim-state sidecar — it's tiny (a handful of fields × ~20–40 zones = low hundreds of bytes) and goes in the **keyframe** (the migration payload already carries "Director state / objective / door state"; zone state sits right beside door state). Zone deltas (a breach opens, flood rises, power dies) replicate on the **reliable** channel as discrete `ZONE_STATE{zoneId, fields}` events — same pattern as door/objective state, so a late-joiner or migrated host reconstructs the world exactly.
- **Per-entity `InZone.zoneId`** is host-derived; it can be **recomputed** from position on the new host (cheap point-in-AABB), so it need *not* be serialized — but the *player's* zoneId is mirrored 1 byte in the player snapshot so clients drive local audio without owning zone logic.
- **Breach entities** are normal pooled networked entities (position/strength/ttl) → replicate via the existing spawn/despawn event path; the suck-forces are recomputed host-side each tick, deterministic given the breach's serialized state.
- **Determinism:** all zone forces are pure functions of (body position, serialized `ZoneRuntime`, breach state) applied in fixed step order *before* `physicsStepSystem`. After migration, the new host re-instantiates `ZoneRuntime` + breaches from the keyframe and **resumes** (not bit-replays) — debris settles slightly differently (acceptable, per the migration spec's "cosmetic physics drift is fine"). The migration spec's invuln seam covers the one risk: a decompression suck mid-migration won't kill you because the resume seam discards in-flight damage.
- **Fairness at the seam:** if a player was being sucked toward a breach at freeze, the resume re-anchors them at their last safe position (zone forces don't accumulate across the freeze) — migration never decompresses you to death.

---

## 7. WHAT TO BAKE IN NOW (so it's not a retrofit)

These are cheap now, ruinous to retrofit (the migration spec's core warning applies):

1. **The `Zone`/`Region` abstraction as a first-class level + ECS concept** — author zones as sensor volumes in the GLB, define `ZoneDef`/`ZoneRuntime`/`InZone`, and route the *existing* per-section reverb/fog/lightmap/ambient-lux off `ZoneDef` instead of ad-hoc section ids. (Unifies five scattered "per-section" facts into one spine.)
2. **Per-zone gravity + atmosphere fields in `ZoneRuntime` from M0**, even if Ship 1 ships everything at `gravity=9.81, atmo=PRESSURIZED`. The *field* and the `zonePhysicsSystem` that reads it must exist so a later zero-G zone is a data change, not a system.
3. **`InZone` membership system (host, 10 Hz)** + the `ZONE_ENTER` event — wire it to audio crossfade now (it already wants to crossfade on section change).
4. **`ZoneRuntime` in the serializable sim-state sidecar** from the first ship (migration discipline) — zone state lives beside door/objective state, never in closures.
5. **Listener-zone byte in the player snapshot** so client audio (vacuum/reverb/occlusion) is host-driven from day one.
6. **Character-controller mode enum (grounded / float / swim) with only `grounded` implemented** — leave the switch point in so zero-G/flood are additive modes, not a controller rewrite.
7. **`ZoneAffinity` table + navmesh area-cost hook** stubbed (Ship 1 can be all-pressurized normal-g) so enemy zone-avoidance/locomotion-swap is a table entry later.
8. **Breach as a pooled networked entity type** reserved in the archetype enum (append-only protocol rule) so decompression spawns through the existing path.

Doing 1–8 means **Ship 1 (Cargo Hauler) can be 100% normal-gravity pressurized and still be built on the full contextual spine** — then Ship 2+ (Research Vessel flood/quarantine, the Alien Wreck's "broken gravity, near-total dark" already in the ship-archetype doc) unlock zero-G/vacuum/flood as *content*, not engineering. The Wreck's "broken gravity" is already promised in `09-ships-as-maps.md` §6 — this system is what makes that promise buildable.

---

## 8. Concrete Rapier approach (summary, all verified)

| Need | Rapier mechanism (verified JS/WASM) |
|---|---|
| Per-zone gravity | `body.setGravityScale(zone.gravity/9.81, true)` on zone-enter |
| Non-down / spin gravity | `gravityScale=0` + per-frame `addForce(dir * m * g)` |
| Decompression suck | per-frame `addForce(toBreach * strength * falloff)` on bodies in zone |
| Zero-G drift movement | character-controller → impulse-thrust + low `linearDamping`; `applyImpulse` on input |
| Grab/anchor | INTERACT raycast → set kinematic/zero-vel while held; push-off = opposite `applyImpulse` |
| Buoyancy (flood) | analytic `addForce(up * submergedVol * density)` + high `linearDamping` below `fluidLevelY` |
| Zone membership | fixed sensor colliders + `world.intersectionPairsWith` / point-in-AABB scan @10 Hz |
| Hazard damage fields | host per-tick DoT on bodies whose `InZone.hazardBits` set |
| Debris/ragdoll reaction | same dynamic bodies the per-zone force loop already iterates (free) |

All host-only inside the single authoritative Rapier world, in `zonePhysicsSystem` ordered **after** membership and **before** `physicsStepSystem` — fits the locked 60 Hz fixed-step host pipeline.


## Bake in now (avoid retrofit)

- First-class Zone/Region abstraction: author zones as sensor volumes in the GLB; define ZoneDef (static level data) + ZoneRuntime (mutable) + InZone (per-entity) in the ECS; re-route the EXISTING per-section reverb/fog/lightmap/ambient-lux to read off ZoneDef instead of ad-hoc section ids (unifies 5 scattered 'per-section' facts)
- Per-zone gravity + atmosphere fields in ZoneRuntime from M0 even if Ship 1 is 100% gravity=9.81/PRESSURIZED — the FIELDS and a zonePhysicsSystem that reads them must exist so zero-G/vacuum become a data change, not a new system
- Host-only zoneMembershipSystem @10Hz (Rapier sensor colliders or point-in-AABB scan) writing InZone.zoneId + emitting ZONE_ENTER events, wired to the existing 600ms audio reverb crossfade
- Put ZoneRuntime in the serializable sim-state sidecar beside door/objective state from the first ship (host-migration discipline: no zone state in closures/renderer objects)
- Mirror the local player's listener-zoneId as 1 byte in the player snapshot so client audio (vacuum/reverb/occlusion) is host-driven from day one
- Character-controller mode enum (grounded | float | swim) with only 'grounded' implemented — leave the switch in so zero-G and flooding are additive modes, not a controller rewrite
- ZoneAffinity table (enemyKind × zoneTraits → speedMul/canEnter/locomotionMode/senseMods) + a navmesh area-cost hook, stubbed; Ship 1 all-pressurized-normal-g, so enemy zone-avoidance/locomotion-swap is later just a table entry
- Reserve a 'breach' pooled networked-entity archetype (append-only protocol enum) so decompression events spawn through the existing spawn/despawn replication path
- Gate the noise grid by zone soundProfile (VACUUM => ~zero airborne noise) and source vision baseAmbient from ZoneDef.ambientLux — both are tiny hooks into the AI sensing model that already reads per-cell lux

## Open questions

- Suit-air as a new scarcity clock: add a `suitAir` field to PlayerState (a second meter beside battery), or fold vacuum-survival into the existing Resolve meter? A separate clock is clearer horror but adds HUD + a third resource to balance against ammo/battery.
- Ship 1 (Cargo Hauler) scope: keep it 100% normal-gravity/pressurized to prove fun cheaply (recommended — build the spine, ship no exotic zones), or include ONE small zero-G or one decompression beat in Ship 1 as a marketing/wow proof before Ship 2? Trades build risk vs. early differentiation.
- Zone-membership method: per-frame point-in-AABB scan (simple, needs convex/box zones) vs. Rapier sensor intersection events (handles concave zones but couples membership to the physics step and adds event bookkeeping) — pick one before authoring tooling locks the zone-bounds format.
- Zero-G character controller: keep Rapier's KinematicCharacterController and hand-integrate thrust/drift (deterministic, host-authoritative, but we reimplement momentum), or switch the avatar to a true dynamic rigid body in float mode (simpler physics, but mixes kinematic/dynamic control and complicates prediction/reconciliation for the client). Affects the netcode prediction model.
- How aggressively can the Director MUTATE zones (start fires, floods, kill power, blow breaches) vs. only scripted/authored zone events? Fully Director-driven zone mutation is the richest 'fear instrument' but widens the serialized zone-state surface and the playtest-balance space; authored-only is safer for Ship 1.
- Decompression fairness vs. lethality: is being sucked out a breach an instant death (telegraphed) or heavy damage + a rescue window (a teammate grabs you)? The co-op rescue version is more fun/less punishing but needs a grab-a-falling-teammate mechanic and tuning.