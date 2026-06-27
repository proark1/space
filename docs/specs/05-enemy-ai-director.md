# SIGNAL LOST — Enemy AI + AI Director Spec (Host-Only): Stalker, Swarmer, Two-Layer Director

## SIGNAL LOST — Enemy AI + AI Director Spec (Host-Only)

Scope: the **host-only** AI systems for the M4 "Haunted Corridor" vertical slice — the **Stalker** FSM, the **Swarmer** vent wave, the **sensing/noise** model, **recast-navigation-js** pathing, and the **two-layer AI Director** (Population + Scare). The Director is specced generally (BUILD/PEAK/RELAX, 1–4 player scaling) even though M4 only exercises one cycle, 2 players, 1 Stalker + 1 Swarmer wave.

This spec coordinates with three sibling specs by contract only:
- **netcode spec** — owns the WebRTC transport, snapshot encode/decode, 20 Hz broadcast. This spec produces the entity/component data the snapshot serializer reads, and consumes hit-event messages.
- **ECS spec** — owns bitECS world, component store layout, the fixed 60 Hz step order. This spec adds AI components + systems and slots them into the documented system order.
- **audio spec** — owns the pre-baked pack + Web Audio runtime + audio-event-id registry. This spec only *emits* `AudioEventId`s and a `tension` float; it never touches Web Audio.

Everything below runs inside the host's authoritative fixed step. Clients run **none** of it.

---

### 0. Package layout

New package `packages/ai`, plus AI-owned components living in `packages/ecs` (so the snapshot serializer can see them without a cycle).

```
packages/ai/
  src/
    index.ts                     // registerAiSystems(world, ctx): wires systems into ecs step order
    context.ts                   // AiContext: shared host-only services (nav, sense grid, rng, clock, audioOut)
    sensing/
      noiseGrid.ts               // spatial hash of decaying noise samples
      noiseEmit.ts               // per-player noise emission system (reads input/movement/weapon state)
      vision.ts                  // LOS raycast + vision-cone + darkness/flashlight modifiers
      senseQuery.ts              // loudestRecentNoise(pos, radius), canSee(enemy, target)
      noise.config.ts            // NOISE_VALUES table, SENSE_HZ, falloff constants
    nav/
      navmesh.ts                 // load baked navmesh tile(s), wrap recast-navigation-js
      crowd.ts                   // Detour crowd manager wrapper, agent add/remove/lod
      offmesh.ts                 // vent/ceiling off-mesh link registration + traversal
      pathBudget.ts              // per-frame path-request scheduler (ring buffer, host frame budget)
      bake.config.ts             // rcConfig constants used by the offline bake tool
    enemies/
      stalker/
        stalker.fsm.ts           // HFSM definition + per-state update fns
        stalker.config.ts        // all tunables (timers, speeds, ranges, HP)
        stalker.behaviors.ts     // pounce, investigate, light-flee, crawl helpers
        stalker.dismember.ts     // per-limb HP, sever effects, capability flags
      swarmer/
        swarmer.fsm.ts           // tiny 3-state FSM (Token | Active | Dead)
        swarmer.config.ts
        swarmer.spawn.ts         // vent wave spawner + token virtualization
        swarmer.flock.ts         // boid-ish group steering on top of crowd agents
    director/
      population.ts              // BUILD/PEAK/RELAX SM, scare-debt, lull windows, spawn selection
      scare.ts                   // telegraph + stinger + music-duck, emits AudioEventIds
      director.config.ts         // tension curve, debt caps, per-player-count profiles
      spawnPoints.ts             // registry of authored spawn/vent nodes + visibility test
      tension.ts                 // tension float owner (single source of truth, read by audio)
    debug/
      aiDebugHud.ts              // host-only overlay: states, noise grid heatmap, paths
  package.json

packages/ecs/src/components/ai.ts   // AI components (see §6) — owned by ecs, used by ai
tools/nav-bake/bakeCorridor.ts      // offline navmesh bake (node script, recast-navigation-js)
```

`AiContext` (constructed once on the host, after nav load):

```ts
export interface AiContext {
  world: IWorld;                 // bitECS world (host)
  rng: () => number;             // seeded PRNG (shared seed w/ clients for variant selection)
  now: () => number;             // host sim clock, ms, monotonic
  fixedDtMs: number;             // 1000/60
  nav: NavMesh;                  // recast-navigation-js NavMesh
  crowd: CrowdManager;           // Detour crowd wrapper
  noise: NoiseGrid;
  sense: SenseQuery;
  spawnPoints: SpawnPointRegistry;
  audioOut: (ev: AudioEvent) => void;   // -> netcode reliable channel + local audio engine
  players: () => PlayerView[];   // host's view of all players (pos, flashlightOn, alive, resolve)
}
```

---

### 1. SENSING MODEL

Two independent channels feed every enemy: **hearing** (noise grid) and **sight** (vision cone + LOS). They are sampled on the **sense tick**, decoupled from the 60 Hz sim.

#### 1.1 Sense tick rate

- **`SENSE_HZ = 10`** (every 6th sim frame). Enemies re-query hearing + sight at 10 Hz; between ticks they act on cached `lastHeard` / `lastSeen` data. This keeps raycasts and grid scans off the hot path.
- Noise **emission** runs every sim frame (60 Hz) but writes are cheap (one grid cell add); noise **decay** runs on the sense tick.
- Stagger: enemies are bucketed by `eid % 6`; only one bucket re-senses per sim frame so the 10 Hz cost is spread, not spiky. With M4's 1 Stalker + ≤12 Swarmers this is trivial, but it's the pattern that scales to M5/M6.

#### 1.2 Noise grid

A 2D spatial hash over the corridor floor plane (Y collapsed — the slice is effectively single-deck; the cell stores a representative height for off-mesh checks).

- **Cell size `NOISE_CELL = 2.0 m`.** Corridor slice ~ 6 m × 80 m → ~120 cells. Stored as a flat `Map<number, NoiseCell>` keyed by `cellHash(ix, iz)`; only non-silent cells exist.
- Each `NoiseCell` accumulates **noise events**, not a single scalar, so an enemy can recover the *source*:

```ts
interface NoiseSample {
  pos: [number, number, number];
  loudness: number;     // post-falloff value at emit time (see table)
  srcPlayer: number;    // player eid (or -1 for world noise)
  bornMs: number;       // host time emitted
}
interface NoiseCell { samples: NoiseSample[]; } // capped at MAX_SAMPLES_PER_CELL = 6 (drop quietest)
```

- **Decay:** each sample's *effective* loudness at query time =
  `loudness * exp(-(now - bornMs) / NOISE_HALFLIFE_MS)`. `NOISE_HALFLIFE_MS = 1500`. Samples below `NOISE_EPSILON = 0.05` are pruned on the sense tick. So a footstep is essentially gone in ~4.5 s; a gunshot lingers ~8 s.
- **Emission writes to a disc, not a point.** When a player emits, we splat into all cells within `noiseRadius(value)` with **inverse-square-ish falloff**: `loudnessAtCell = value * clamp(1 - dist/radius, 0, 1)^2`. `noiseRadius` scales with the raw value (loud things travel further):

  `radius_m = BASE_RADIUS * sqrt(value)`, `BASE_RADIUS = 6 m`. (Gunshots want to carry the whole corridor, so gunshot uses an explicit `radiusOverride` — see table.)

#### 1.3 NOISE VALUES table

Raw emission values are normalized 0..1. Each row lists the trigger, raw value, emit cadence, and radius override (when the default `sqrt`-radius is wrong for game feel).

| Source | Trigger | Raw value | Cadence | Radius (m) | Notes |
|---|---|---|---|---|---|
| Idle / crouch-still | standing or crouched, no move | 0.00 | — | 0 | silence is a tactic |
| Crouch-walk | crouched + moving | 0.10 | per footstep (~0.55 s) | 4 | the "stealth" gait |
| Walk | normal move | 0.30 | per footstep (~0.45 s) | 7 | default locomotion |
| Sprint | sprint move | 0.65 | per footstep (~0.30 s) | 14 | fast but loud |
| Flashlight ON (steady) | beam active | 0.15 (continuous, re-emitted each sense tick at player pos) | 10 Hz | 9 | *audible* tell is small; the big effect is **vision attraction** (§1.5), not noise |
| Flashlight click on/off | toggle edge | 0.20 | on edge | 6 | the click itself |
| Melee swing (whiff) | swing, no hit | 0.40 | per swing | 8 | |
| Melee hit (impact) | swing connects | 0.55 | per hit | 9 | |
| Reload | reload start | 0.35 | per reload | 7 | punishes panic-reloads |
| Gunshot (pulse rifle) | per round fired | 1.00 | per shot | **22 (override)** | dominates the grid; carries whole corridor |
| Door / interact | objective node, doors | 0.45 | per use | 10 | objective interactions are loud by design |
| Resolve-break gasp | player Resolve crosses low threshold | 0.50 | on edge | 8 | sanity feeds the monster |
| World event (Director) | scripted prop/spark | 0.0–0.8 (authored) | scripted | authored | Director can *plant* a noise to bait/redirect |

Design intent baked into the numbers: a single **gunshot (1.0 @ 22 m)** outweighs a whole second of **sprinting (0.65)**, which outweighs **walking (0.30)**, which outweighs **crouch-walk (0.10)**. Flashlight noise is intentionally tiny — the flashlight's danger is **sight attraction**, not sound, so the two pillars (Light is threat / Sound is the monster) stay distinct.

#### 1.4 "Loudest recent noise source" query

The core hearing API enemies call on their sense tick:

```ts
// returns the single loudest *source* near `pos`, aggregating samples by srcPlayer
function loudestRecentNoise(pos, radius): { pos, loudness, srcPlayer } | null {
  best = null;
  for (cell of cellsWithin(pos, radius)) {
    for (s of cell.samples) {
      eff = s.loudness * exp(-(now - s.bornMs) / NOISE_HALFLIFE_MS);
      // distance attenuation from the *enemy* to the sample, on top of stored falloff
      eff *= clamp(1 - dist(pos, s.pos) / radius, 0, 1);
      if (eff < HEAR_THRESHOLD) continue;            // HEAR_THRESHOLD = 0.08
      if (!best || eff > best.loudness) best = { pos: s.pos, loudness: eff, srcPlayer: s.srcPlayer };
    }
  }
  return best;
}
```

Each enemy archetype has a **`hearingRadius`** (Stalker 24 m, Swarmer 10 m) and **`hearThreshold`** (Stalker 0.08, Swarmer 0.20 — swarmers are nearly deaf, they follow the Stalker / nearest player). A returned source above an archetype's **`alertThreshold`** drives a state transition (see FSM).

#### 1.5 Vision: cone + LOS + light modifiers

Vision is gated, in order: (1) within `visionRange`, (2) within `visionHalfAngle` of facing, (3) LOS raycast clear (Rapier, single ray to target chest, host-only), (4) **effective visibility ≥ archetype `seeThreshold`**.

Effective visibility couples darkness + flashlight:

```ts
// baseAmbient: how lit the corridor is at target (0 dark .. 1 lit), sampled from a coarse
// authored light grid baked into level data (NOT real-time GI — a cheap per-cell lux value).
let vis = baseAmbient;                         // 0.05 in dark corridor, ~0.4 near a panel
if (target.flashlightOn) {
  vis += FLASHLIGHT_SELF_REVEAL;               // +0.6 — holding the light paints YOU as a target
  if (enemyInBeamCone(enemy, target)) vis += FLASHLIGHT_BEAM_BONUS; // +0.3, enemy lit by the beam
}
vis *= distanceFalloff(dist, visionRange);     // linear to 0 at range
visible = vis >= seeThreshold;                 // Stalker seeThreshold = 0.35
```

Consequences (this is the whole light/dark risk-reward in two constants):
- Flashlight **off** in a dark corridor: `baseAmbient 0.05` → effectively invisible beyond a few metres. Safe but you can't see, Resolve drains.
- Flashlight **on**: `+0.6` self-reveal → the Stalker can pick you out across the corridor and is *attracted* (the Stalker's Patrol/Investigate bias moves toward the brightest visible player — `lightAttraction` weight in §2).

The Stalker additionally has a **light-attraction drive** independent of having LOS: even without seeing a player, if a flashlight beam is visible in its `hearingRadius` (a beam is registered as a `LightSource` in a tiny list the Director maintains), the Stalker biases Patrol/Investigate toward it.

---

### 2. STALKER — HFSM

**Recommendation: hierarchical finite state machine (HFSM), not a behavior tree.** Rationale, concretely: the Stalker has ~9 mutually-exclusive *modes* with sharp, timer-and-threshold-driven transitions and strong "I am hunting / I am fleeing light" global moods — exactly what an HFSM expresses cleanly. A BT shines for *layered, reactive task selection* with many optional sub-tasks; the Stalker doesn't have that shape, and a BT would scatter the pounce/cripple state across blackboard flags. Use a flat-ish HFSM with two super-states (`Unaware`, `Aware`) for shared transition logic (e.g. "take damage" / "legs severed" apply in any Aware state). One Swarmer gets a trivial 3-state FSM (§3). If M6 adds the Maw boss with many optional abilities, reconsider a BT *for the boss only*.

State stored per-enemy in ECS as a `uint8` enum (`StalkerState` component) + scalar timers; the FSM module is pure functions `(eid, ctx) -> void` dispatched by state. No allocation per frame.

#### 2.1 State enum

```ts
enum StalkerState {
  Dormant = 0,     // pre-spawn / clinging, fully inert, not in crowd
  Patrol,          // wandering authored patrol path, low alert
  Investigate,     // moving to a heard/seen point of interest
  Stalk,           // has a target, keeps distance, circles, stays out of beam
  Engage,          // closing for an attack
  Pounce,          // committed leap (windup -> airborne -> recover)
  Stunned,         // staggered (flashlight blind / heavy hit)
  Crippled,        // legs severed: cannot pounce, crawls, slow
  Fleeing,         // overwhelmed by sustained light -> retreat to dark/vent
  Dead,            // removed next cleanup
}
```

`Crippled` is a **capability modifier** that coexists with behavior states via a flags field (see §2.5). Implementation: `Crippled` is **not** a top-level state in the dispatch table; it's a flag `STK_LEGLESS` that (a) blocks the Pounce transition and (b) swaps the locomotion profile + mesh. We keep the enum value only for debug/anim readability and set it as the *reported* state when `STK_LEGLESS` is set and the enemy would otherwise be Stalk/Engage. This avoids duplicating Stalk/Engage logic.

#### 2.2 Full transition table

`P` = current player target (nearest qualifying). Distances in metres, timers in ms. All thresholds from `stalker.config.ts`.

| From | To | Condition | Side-effects on enter |
|---|---|---|---|
| Dormant | Patrol | Director spawns it (off-screen, §5) | add crowd agent, pick patrol path |
| Patrol | Investigate | `loudestRecentNoise(pos, 24).loudness ≥ 0.20` **OR** a `LightSource` visible within 24 m | set `poi = source.pos`; emit `sfx.stalker.alert_low` (rare) |
| Patrol | Stalk | `canSee(P)` true (vis ≥ 0.35) | set target=P; emit `STALKER_SPOTTED_STINGER` (Scare Dir gate) |
| Investigate | Stalk | `canSee(P)` true | set target=P |
| Investigate | Patrol | reached `poi` (`dist<1.5`) **AND** `timeInState > INVESTIGATE_MIN (2500)` with no new stimulus | clear poi |
| Investigate | Investigate | newer louder noise arrives → repoint `poi` | repoint, reset `INVESTIGATE_MIN` timer |
| Stalk | Engage | `dist(P) ≤ ENGAGE_RANGE (8)` **AND** `timeInState ≥ STALK_MIN (1800)` **AND** Director grants `engageToken` (§5.4) | face target |
| Stalk | Investigate | lost LOS for `LOSE_SIGHT_MS (3500)` **AND** no fresh noise from target | last-known pos → poi |
| Stalk | Fleeing | `sustainedBeamMs ≥ FLEE_LIGHT_MS (2200)` (target's beam held on it) | pick nearest dark cell / vent |
| Engage | Pounce | `dist(P) in [POUNCE_MIN 3, POUNCE_MAX 7]` **AND** clear LOS **AND** `!STK_LEGLESS` **AND** `pounceCooldownMs ≤ 0` | enter windup; emit `STALKER_POUNCE_TELEGRAPH` |
| Engage | Stalk | `dist(P) > ENGAGE_RANGE+2 (10)` (target broke away) | — |
| Engage | (melee) | `dist(P) ≤ MELEE_RANGE (2.2)` | apply melee hit event; stay Engage |
| Pounce | Engage | landed (recover done) **AND** still has target | apply pounce-hit if it connected; `pounceCooldown = 4000` |
| Pounce | Stalk | landed but target escaped LOS | — |
| any Aware | Stunned | took `heavyHit` OR `flashlightBlind` (beam held in eyes < 2 m for `BLIND_MS 800`) | freeze; emit `STALKER_STAGGER` |
| Stunned | Stalk | `timeInState ≥ STUN_MS (1500)` | resume |
| any Aware | Fleeing | `STK_LEGLESS` set **AND** `sustainedBeamMs ≥ FLEE_LIGHT_MS*0.6` (crippled stalkers are more skittish) | crawl to dark |
| Fleeing | Patrol | reached dark/vent (`dist<1.5`) **AND** no LOS to any player for `FLEE_SETTLE_MS (4000)` | despawn-eligible: Director may recycle |
| Fleeing | Stalk | cornered: player blocks path **AND** `dist(P) < 4` | turn and fight |
| any | Dead | `bodyHp ≤ 0` | ragdoll, drop, schedule removal; emit `STALKER_DEATH` |
| Patrol/Investigate | Dormant | Director despawn (out of sight, lull) | remove crowd agent |

**Light-attraction** is realized two ways: (1) in Patrol, the wander target is biased toward the brightest visible `LightSource` (weight `LIGHT_ATTRACT = 0.6` blended into the patrol waypoint pick); (2) the Patrol→Investigate edge fires on a visible beam even with no noise. **Sound-investigation** is the Patrol→Investigate noise edge plus Investigate's repoint-on-louder behavior.

#### 2.3 Per-state update bodies (essentials)

```ts
// dispatch on sense tick for sensing; movement every sim frame via crowd agent
Patrol(eid): if (atWaypoint) pickWaypoint(biasTowardLight=LIGHT_ATTRACT); steerCrowdTo(wp);
Investigate(eid): steerCrowdTo(poi); // crowd handles pathing; transitions checked on sense tick
Stalk(eid):
  // orbit at preferred radius, stay OUT of any beam cone
  desired = orbitPoint(target.pos, STALK_RADIUS=6, dir=circleDir);
  if (inAnyBeamCone(eid)) desired = nudgeOutOfBeam(desired);
  steerCrowdTo(desired); faceToward(target);
Engage(eid): steerCrowdTo(intercept(target)); // lead the target slightly
Pounce(eid): // 3 phases by timer: WINDUP(450) crouch+telegraph, AIR(ballistic via kinematic
             // controller toward predicted pos), RECOVER(600); damage applied on AIR contact.
Stunned(eid): // no steer; clear velocity
Fleeing(eid): steerCrowdTo(nearestDarkOrVent());
```

#### 2.4 Timers / tunables (`stalker.config.ts`)

```ts
export const STALKER = {
  hp: { body: 120, head: 40, legL: 30, legR: 30, armL: 25, armR: 25 },
  hearingRadius: 24, hearThreshold: 0.08, alertThreshold: 0.20,
  visionRange: 18, visionHalfAngleDeg: 70, seeThreshold: 0.35,
  speed: { patrol: 1.4, investigate: 2.2, stalk: 2.6, engage: 4.5, crawl: 1.1, flee: 4.0 },
  STALK_RADIUS: 6, ENGAGE_RANGE: 8, MELEE_RANGE: 2.2,
  POUNCE_MIN: 3, POUNCE_MAX: 7,
  timers: {
    INVESTIGATE_MIN: 2500, STALK_MIN: 1800, LOSE_SIGHT_MS: 3500,
    POUNCE_WINDUP: 450, POUNCE_AIR_MAX: 700, POUNCE_RECOVER: 600, POUNCE_COOLDOWN: 4000,
    STUN_MS: 1500, BLIND_MS: 800, FLEE_LIGHT_MS: 2200, FLEE_SETTLE_MS: 4000,
  },
  damage: { melee: 18, pounce: 45 },     // pounce also pins the player briefly (downed risk)
  LIGHT_ATTRACT: 0.6,
};
```

#### 2.5 Dismemberment counterplay (the slice's proof point)

Per-limb HP lives in the `LimbHp` component (one slot per segment). Hit resolution (host, on a validated hit event from netcode):

```ts
applyHit(eid, limb, dmg):
  LimbHp[eid][limb] -= dmg;
  if (LimbHp[eid][limb] <= 0 && !severed(eid, limb)) sever(eid, limb);
  // body HP only drops from torso/head hits (+ a bleed component from severs)
  if (limb == TORSO || limb == HEAD) bodyHp -= dmg * (limb==HEAD?2.0:1.0);

sever(eid, limb):
  setFlag(eid, SEVER_FLAGS[limb]);          // STK_LEGLESS set when a leg is gone
  swapMeshSegment(eid, limb, /*stumpVariant*/);   // mesh-swap, §7
  spawnGibVfx(limb); emit(AUDIO.STALKER_LIMB_SEVER);
  applyCapability(eid);

applyCapability(eid):
  legsGone = severed(legL) || severed(legR);  // SLICE RULE: losing EITHER leg disables pounce
  if (legsGone) { setFlag(STK_LEGLESS); speedProfile = crawl; blockTransitionsTo(Pounce); }
  armGone => weaken melee (reduce damage.melee by 50% per arm, only melee on the intact side reaches).
```

Slice-locked counterplay rule: **sever one leg → `STK_LEGLESS` → can never Pounce, locomotion becomes `crawl` (1.1 m/s), and it flees on light sooner.** This is the headline M4 dismemberment proof: a player who shoots the legs converts a lethal hunter into a slow crawler. (Full game may require *both* legs for the full crawl; the slice uses the cheaper, more readable single-leg rule.)

---

### 3. SWARMER — vent wave

Swarmers exist to prove **overwhelm + perf virtualization**, not deep AI. Tiny FSM, heavy LOD.

#### 3.1 The token / virtualized concept

A swarm is authored as a **wave budget** (e.g. 12 swarmers), but most live as **tokens** — a small struct with position + a coarse target, *not* a full ECS entity, *not* a crowd agent, *not* a skinned mesh. Tokens are simulated at low frequency with a cheap "march toward leader" integrator. A token is **promoted** to a full ECS entity (crowd agent + skinned InstancedMesh slot + HP) only when it enters the **activation radius** of a player (`ACTIVATE_R = 14 m`) or LOS. When it leaves (`DEACTIVATE_R = 20 m`, hysteresis) and is out of sight, it's **demoted** back to a token.

```ts
interface SwarmToken {
  id: number; pos: Vec3; vel: Vec3;
  target: Vec3;            // current goal (leader pos / nearest player / vent)
  hp: number;              // single scalar; swarmers have no limbs
  flags: number;           // ACTIVE | DYING
}
```

This caps the *active* (expensive) population regardless of wave size. M4 wave = 12 tokens, but ≤ ~8 ever active at once in the corridor choke — so we render/path/animate ~8, not 12, and far ones cost a vector add.

Budgets: `MAX_ACTIVE_SWARMERS = 16` (hard cap; M4 needs ≤12). If activation would exceed the cap, excess stays tokenized at the choke edge (reads as a writhing mass just out of the light).

#### 3.2 Spawn from a vent node

```ts
spawnSwarmWave(ventNode, count, ctx):
  for i in 0..count:
    t = newToken(pos = ventNode.mouth + jitter, target = ventNode.exitPoint);
    t.phase = EMERGING;                // play vent-crawl-out via off-mesh link traversal
  emit(AUDIO.SWARM_VENT_BURST @ ventNode.pos);   // the scuttling-from-the-walls tell
  // tokens traverse the vent off-mesh link (ceiling->floor) then switch target to nearest player
```

Vent emergence is staggered over `EMERGE_STAGGER = 180 ms` per token so they pour out, not teleport.

#### 3.3 Swarmer FSM (3 states)

```ts
enum SwarmerState { Token=0, Active, Dead }
```

| From | To | Condition |
|---|---|---|
| Token | Active | within `ACTIVATE_R` of any player OR has LOS to a player → promote |
| Active | Token | beyond `DEACTIVATE_R` AND no LOS for 1500 ms → demote |
| Active | Dead | hp ≤ 0 (any hit ≥ swarmerHp; they're fragile: `hp=20`, one rifle shot or melee kills) |
| Token | Dead | (rare) AoE/gunshot disc kill while tokenized → token resolves to Dead without promotion |

Active swarmers have no investigate/stalk nuance: they path to **nearest reachable player** via the crowd, with flocking offset (§3.4). They attack on contact (`MELEE_R = 1.4`, `dmg = 6`, `attackCooldown = 800`). They are the pressure enemy — individually trivial, collectively a problem at the choke.

#### 3.4 Group behavior (flocking on top of the crowd)

Detour crowd already gives **separation + obstacle avoidance**. We layer two cheap boid forces on the *desired velocity* the crowd computes, to make them read as a swarm not a queue:

```ts
desired = crowdDesiredVel(eid);
desired += COHESION  * (swarmCentroidNear(eid) - pos).norm();   // 0.15
desired += ALIGNMENT * avgNeighborVel(eid);                     // 0.10
// separation already handled by crowd; add a small extra at very close range
desired += SEPARATION_EXTRA * repelFromNearest(eid, r=0.6);     // 0.20
crowd.requestVelocity(eid, clampSpeed(desired, SWARM_SPEED=3.2));
```

Neighbor queries use the crowd's existing grid (no new spatial structure). The "leader" for cohesion is the **token centroid**, so even tokenized swarmers shape the active ones' motion — the mass stays coherent.

`swarmer.config.ts`:
```ts
export const SWARMER = {
  hp: 20, speed: 3.2, meleeRange: 1.4, meleeDmg: 6, attackCooldownMs: 800,
  ACTIVATE_R: 14, DEACTIVATE_R: 20, EMERGE_STAGGER: 180,
  MAX_ACTIVE: 16, hearingRadius: 10, hearThreshold: 0.20,
  flock: { COHESION: 0.15, ALIGNMENT: 0.10, SEPARATION_EXTRA: 0.20 },
};
```

---

### 4. PATHFINDING — recast-navigation-js

#### 4.1 Offline bake (tools/nav-bake)

The corridor navmesh is **baked at build time** from the level GLB collision proxy, *not* at runtime (runtime bake of a Star-Wars-scale ship is out of budget; the slice corridor is small but we establish the offline pipeline now). Output: a serialized navmesh tile blob shipped in the level data.

```ts
// tools/nav-bake/bakeCorridor.ts  (node, recast-navigation-js)
import { init, generateSoloNavMesh } from 'recast-navigation';
const cfg /* rcConfig */ = {
  cs: 0.20, ch: 0.20,                  // cell size / height — fine enough for 0.4 m vent ledges
  walkableSlopeAngle: 45,
  walkableHeight: Math.ceil(1.8 / 0.20),   // ~1.8 m agent
  walkableClimb:  Math.ceil(0.4 / 0.20),
  walkableRadius: Math.ceil(0.4 / 0.20),   // 0.4 m agent radius
  maxEdgeLen: 12 / 0.20, maxSimplificationError: 1.3,
  minRegionArea: 8, mergeRegionArea: 20,
  detailSampleDist: 6, detailSampleMaxError: 1,
};
const { navMesh } = generateSoloNavMesh(positions, indices, cfg);
writeFileSync('corridor.navmesh.bin', exportNavMesh(navMesh));
```

We use **single-area** for the slice (one walkable type) but reserve area flags for `DARK`/`VENT`/`HAZARD` so the Stalker's "flee to dark" and spawn-selection can query area-tagged polys later.

#### 4.2 Off-mesh links (vents/ceilings)

Vents and ceiling drops are **authored off-mesh connections** added to the navmesh after bake (they connect a ceiling/vent poly to a floor poly across a gap Recast won't bridge):

```ts
navMesh.addOffMeshConnection({
  start: ventMouth, end: ventFloorExit,
  radius: 0.4, bidirectional: false,    // swarmers come DOWN; stalker can use ceiling links both ways
  area: AREA_VENT, flags: FLAG_OFFMESH,
  userId: ventNode.id,                  // ties the link to a spawn node + a traversal animation
});
```

The crowd manager fires an event when an agent reaches an off-mesh link; we play the matching traversal anim (vent-crawl / ceiling-drop) and teleport-interpolate the agent across the link over its authored duration, then hand control back to the crowd. The Stalker uses ceiling off-mesh links to disappear/reappear (a key fear beat); Swarmers use vent links one-way on spawn.

#### 4.3 Detour crowd manager + AI LOD

One `Crowd` instance owns all **active** agents (Stalker + active Swarmers). Config: `maxAgents = MAX_ACTIVE_SWARMERS + STALKERS + slack = 24`, `maxAgentRadius = 0.5`. Per agent: `separationWeight`, `obstacleAvoidanceType` (0 = cheapest for swarmers, 2 = better for Stalker).

**AI LOD tiers:**

| Tier | Who | Path/steer cost | Sense | Anim/render |
|---|---|---|---|---|
| **Full** | Stalker always; Swarmers within `ACTIVATE_R`/LOS | full crowd agent, 60 Hz steer, real Detour path | 10 Hz, full LOS rays | skinned mesh, IK |
| **Token** | Swarmers far / out of sight | no crowd agent; "march toward target" integrator at `TOKEN_HZ = 5`; straight-line + corridor-spine snap (follow a precomputed polyline down the corridor, no per-frame pathfind) | none (deaf/blind) | none (or 1 instanced impostor if barely on-screen) |
| **Dormant** | unspawned / Director-suppressed | nothing | none | none |

Promotion/demotion (token↔full) happens on the sense tick with hysteresis radii. The Stalker is never tokenized (only one, and it's the star).

#### 4.4 Keeping pathing in the host frame budget

- **Path-request scheduler (`pathBudget.ts`):** full path *recomputes* (Detour `findPath`/`requestMoveTarget`) are **rate-limited to `MAX_PATHREQ_PER_FRAME = 2`** via a ring buffer of pending requests. Agents keep following their last path until their turn. `crowd.update(dt)` (the steering integrator) runs every frame for all active agents — it's cheap; it's `findPath` that's expensive, so only that is throttled.
- **Replan triggers, not polling:** an agent requests a new path only on (a) target moved > `REPLAN_DIST = 2 m` from path goal, or (b) off-path (corridor deviation), or (c) state change. No "replan every frame."
- **Token cost is a vector add** at 5 Hz, so the far swarm is ~free.
- **Budget ceiling:** AI total (sense + FSM + crowd.update + ≤2 findPath) target **≤ 2.5 ms** of the host's 16.6 ms fixed step. A dev-build assert logs if AI step exceeds 3 ms; M5 adds a governor that drops `MAX_PATHREQ_PER_FRAME`/`TOKEN_HZ` under load.

---

### 5. THE TWO-LAYER DIRECTOR

Two co-located host singletons, ticked at **2 Hz** (`DIRECTOR_HZ`) — the Director makes *coarse pacing* decisions; per-enemy reaction stays in the FSMs. The single shared `tension` float (0..1) is the seam to the audio engine (audio spec reads it for vertical music layering; this spec writes it).

#### 5.1 Layer 1 — Population Director

State machine over **macro tension phases**, driving spawns:

```
        ┌──────── RELAX ◄───────────┐
        ▼                           │
      BUILD ─────► PEAK ─────────────┘
   (rising)      (sustain)      (forced lull)
```

- **BUILD** — tension rising. Spawn pressure ramps; allowed to spend scare-debt up to the build cap. Plants noises, trickles enemies, lets the Stalker close.
- **PEAK** — the spike. Authored objective node (the door/power in M4) gates the *big* event: a Swarmer vent wave + Stalker engage window. Spends the most debt. Hard-capped duration.
- **RELAX** — **hard spawn-suppression lull.** No new spawns for `LULL_MS`. Existing enemies allowed to despawn (out of sight). Tension decays. This is the non-negotiable silence budget — scares only land if the lull happened.

**Scare-debt budget:** a running float `scareDebt`. Each spawn/scare *costs* debt; debt **recovers** during RELAX and slowly during low-intensity BUILD. The Director **refuses to act when `scareDebt > debtCap`** — this is the cap that stops audio-fatigue.

```ts
// cost table (per event)
SPAWN_STALKER: 30, SPAWN_SWARM_WAVE: 50, STINGER: 8, BIG_TELEGRAPH: 15
DEBT_CAP_BY_PHASE = { BUILD: 60, PEAK: 120, RELAX: 0 /*suppressed*/ }
DEBT_RECOVERY_PER_SEC = { BUILD: 4, PEAK: 0, RELAX: 14 }
```

**Per-player-count scaling (1–4)** via a profile multiplier table. Solo gets the **mercy profile**: longer telegraph lead, *fewer simultaneous* threats, but a **constant single Stalker presence** for dread (you're never fully safe, but never dogpiled), plus more frequent ship-AI VO for tone. 4-player ramps spawn caps and shortens lulls.

```ts
// director.config.ts
export const PLAYER_PROFILES = {
  1: { name:'mercy', spawnMul:0.6, maxActiveEnemies:5,  lullMul:1.3, telegraphLeadMs:1400, constantStalker:true,  voChatter:true  },
  2: { name:'duo',   spawnMul:1.0, maxActiveEnemies:9,  lullMul:1.0, telegraphLeadMs:1000, constantStalker:false, voChatter:false }, // M4
  3: { name:'trio',  spawnMul:1.3, maxActiveEnemies:13, lullMul:0.9, telegraphLeadMs:900,  constantStalker:false, voChatter:false },
  4: { name:'squad', spawnMul:1.6, maxActiveEnemies:16, lullMul:0.8, telegraphLeadMs:850,  constantStalker:false, voChatter:false },
};
export const DIRECTOR = {
  hz: 2,
  tension: { buildRate: 0.04, peakRate: 0.10, relaxRate: -0.06, peakEnter: 0.55, relaxEnter: 0.85 },
  phaseDur: { PEAK_MAX_MS: 25000, LULL_MS: 22000 }, // lull scaled by profile.lullMul
};
```

**Tension update loop (pseudocode, ticked at 2 Hz):**

```ts
function populationTick(dt, ctx) {
  const prof = PLAYER_PROFILES[clamp(ctx.players().filter(alive).length, 1, 4)];

  // 1) Recover/spend debt
  scareDebt = max(0, scareDebt - DEBT_RECOVERY_PER_SEC[phase] * dt);

  // 2) Drive tension toward phase
  const rate = phase==='PEAK' ? tension.peakRate
             : phase==='RELAX' ? tension.relaxRate : tension.buildRate;
  // proximity/los/recent-damage nudge tension up faster during BUILD
  const threat = aggregateThreatSignal(ctx);          // 0..1 from min dist to Stalker, LOS, low Resolve
  tension = clamp01(tension + (rate + 0.05*threat) * dt);
  ctx.setTension(tension);                            // audio reads this

  // 3) Phase transitions
  switch (phase) {
    case 'BUILD':
      if (tension >= tension.peakEnter && objectiveArmed) enterPhase('PEAK');
      break;
    case 'PEAK':
      if (timeInPhase >= phaseDur.PEAK_MAX_MS || peakObjectiveResolved) enterPhase('RELAX');
      break;
    case 'RELAX':
      if (timeInPhase >= phaseDur.LULL_MS * prof.lullMul && playersRecovered(ctx)) enterPhase('BUILD');
      break;
  }

  // 4) Spawn decisions (only when not suppressed and under debt cap)
  if (phase !== 'RELAX') maybeSpawn(ctx, prof);

  // 5) Constant-Stalker mercy guarantee
  if (prof.constantStalker && countAlive('stalker') === 0 && phase !== 'RELAX')
    requestSpawn('stalker', ctx, prof, /*urgent*/true);
}
```

**Spawn-decision pseudocode** (spawn **out of sight**, prefer **vents**, respect caps + debt):

```ts
function maybeSpawn(ctx, prof) {
  if (countActiveEnemies() >= prof.maxActiveEnemies) return;
  if (scareDebt > DEBT_CAP_BY_PHASE[phase]) return;
  if (now - lastSpawnMs < SPAWN_GAP_MS[phase]) return;     // BUILD:9000, PEAK:3000

  const want = pickWhatToSpawn(phase, prof);               // PEAK biases SWARM_WAVE at objective
  if (scareDebt + COST[want] > DEBT_CAP_BY_PHASE[phase]) return;

  const node = chooseSpawnPoint(ctx, want);                // see below
  if (!node) return;                                        // nothing valid out of sight -> skip

  spawn(want, node, ctx);
  scareDebt += COST[want];
  lastSpawnMs = now;
  if (want === 'swarm') scareDirector.telegraph('SWARM', node, prof.telegraphLeadMs);
}

function chooseSpawnPoint(ctx, want) {
  // candidate nodes: authored spawn + vent nodes for this corridor section
  const cands = ctx.spawnPoints.forSection(currentSection)
    .filter(n => want!=='swarm' || n.isVent)               // swarms only from vents
    .filter(n => !anyPlayerHasLOS(n.pos, ctx))             // OUT OF SIGHT, hard rule
    .filter(n => n.distToNearestPlayer(ctx) >= MIN_SPAWN_DIST &&
                 n.distToNearestPlayer(ctx) <= MAX_SPAWN_DIST); // 8..28 m
  if (cands.length === 0) return null;
  // prefer: vents > behind-the-party > nearest-of-remaining; weighted-random for variety
  return weightedPick(cands, n => n.spawnWeight(ctx), ctx.rng);
}
```

`anyPlayerHasLOS` reuses the vision LOS raycast (host). `MIN_SPAWN_DIST=8`, `MAX_SPAWN_DIST=28`, `SPAWN_GAP_MS={BUILD:9000,PEAK:3000}`.

#### 5.2 Layer 2 — Scare Director

Owns audio cues; **telegraphs danger ~1 s ahead** (profile `telegraphLeadMs`), picks stingers, ducks music. It does **not** decide spawns — it *reacts* to Population Director intents and FSM events, and emits compact `AudioEventId`s (defined in the audio spec) over the netcode **reliable** channel + locally.

```ts
interface AudioEvent { id: AudioEventId; pos?: Vec3; variantSeed?: number; duckMusic?: number; atMs?: number; }
```

- **Telegraph:** when Population Director schedules a PEAK event (e.g. swarm wave), Scare Director emits a *pre-event* cue `atMs = now + telegraphLeadMs` (distant scuttle, a vent rattle, a music swell) so the spike is *felt coming*. The actual `SWARM_VENT_BURST` fires at `atMs`. Lead time is profile-scaled (mercy = more warning).
- **Stinger selection:** event → stinger pool → variant chosen by **shared seed** (`variantSeed = hash(eventCount, runSeed)`) so all peers play the *same* screech variant without sending the clip choice. (`ctx.rng` is the shared seed stream.)
- **Music duck:** Scare Director writes `duckMusic` (0..1, e.g. 0.6) on stinger events; the audio engine ducks the music bus under the stinger and restores it. The continuous `tension` float (from Population Director) drives the *vertical* music layering separately.

```ts
function scareTick(dt, ctx) {
  // 1) drain scheduled telegraphs/stingers whose atMs <= now -> emit
  for (e of scheduledQueue.dueBy(now)) ctx.audioOut(e);
  // 2) react to FSM events queued this tick (host-local event bus)
  for (ev of fsmEventBus.drain()) {
    switch (ev.type) {
      case 'STALKER_SPOTTED': emit(STALKER_SPOTTED_STINGER, ev.pos, duck=0.5); break;
      case 'POUNCE_TELEGRAPH': emit(STALKER_POUNCE_TELEGRAPH, ev.pos, lead=200); break;
      case 'LIMB_SEVER':       emit(STALKER_LIMB_SEVER, ev.pos); break;
      case 'PLAYER_RESOLVE_LOW': if (prof.voChatter) emit(SHIP_AI_LINE_calm, undefined); break;
    }
  }
}
```

#### 5.3 Director ↔ FSM event bus

A host-local `fsmEventBus` (ring buffer, drained each Director tick) carries FSM→Scare events (spotted, pounce, sever, death). Enemy FSMs `push` events; the Scare Director consumes. No allocation; fixed-size ring.

#### 5.4 Engage token (anti-dogpile)

To keep combat readable with 1–4 players, the Population Director hands out **engage tokens**: only `maxConcurrentEngagers` enemies may be in Engage/Pounce against a given player at once (Stalker needs a token to enter Engage; the Stalk→Engage edge checks `Director.tryGrantEngage(eid, targetPlayer)`). Solo mercy: `maxConcurrentEngagers=1`. This is the L4D "only N attack the survivor" rule.

---

### 6. ECS components (owned by `packages/ecs/src/components/ai.ts`)

bitECS SoA components the host writes and the **snapshot serializer reads** (netcode spec consumes these for replication; clients deserialize into render-only mirrors).

```ts
export const Enemy      = defineComponent({ kind: Types.ui8 });        // 0 stalker, 1 swarmer
export const StalkerSt  = defineComponent({ state: Types.ui8, sinceMs: Types.f32 });
export const SwarmerSt  = defineComponent({ state: Types.ui8 });
export const AiFlags    = defineComponent({ bits: Types.ui16 });       // STK_LEGLESS, IN_BEAM, ...
export const BodyHp     = defineComponent({ hp: Types.f32 });
export const LimbHp     = defineComponent({ v: [Types.f32, 6] });      // HEAD,TORSO,ARM_L,ARM_R,LEG_L,LEG_R
export const Senses     = defineComponent({ lastHeardX:f32, lastHeardZ:f32, lastHeardLoud:f32,
                                            lastHeardMs:f32, lastSeenX:f32, lastSeenZ:f32,
                                            lastSeenMs:f32, targetEid:eid });
export const NavAgent   = defineComponent({ crowdId: Types.i32, lod: Types.ui8 }); // -1 = tokenized
export const Pounce     = defineComponent({ phase:ui8, phaseMs:f32, cooldownMs:f32,
                                            tx:f32, ty:f32, tz:f32 });
```

**Replication contract (what the snapshot includes per enemy):** `eid, kind, pos(quantized), yaw, state, flags(bits), bodyHp(coarse), severMask(bits)`. That's enough for clients to: interpolate position, pick the animation state, and **mesh-swap severed limbs** (severMask). Per-limb HP, senses, nav, pounce internals are **host-only, never serialized**. State + flags are the only AI fields on the wire — ~6–8 bytes/enemy. Swarmer tokens are **not** serialized at all (they have no eid); only **active** swarmers replicate.

---

### 7. COMBAT FEEL + DISMEMBERMENT (implementation)

#### 7.1 Pre-segmented meshes + per-limb HP

- Enemy GLB authored with **separate skinned segments** per dismemberable limb (HEAD, TORSO, ARM_L/R, LEG_L/R), all driven by one skeleton. Each limb segment is a child mesh referencing the shared armature; a hidden **stump cap** variant mesh exists per joint.
- Per-limb hitboxes are **Rapier colliders** parented to bones (host-only physics). A validated hit event from netcode carries `{shooterEid, targetEid, limbId, dmg, hitPoint}`; the host applies it (§2.5). **Hits are validated on the host** (lag-comp: the host rewinds the target's collider to the shooter's reported render-time using the snapshot history buffer the netcode spec maintains, raycasts, confirms the limb, then applies damage). Clients only *display* tracers/impact; they never decide damage.

#### 7.2 Mesh-swap on sever

```ts
sever(eid, limb):
  segment(eid, limb).visible = false;     // hide the limb segment
  stumpCap(eid, limb).visible = true;     // show stump
  spawn detached limb prop (small Rapier dynamic body, pooled) that ragdolls + despawns
  spawnGibVfx + bloodDecal (three.quarks, pooled)
  set severMask bit (replicated) -> clients do the SAME visible-toggle on their mirror
```

Mesh-swap is **state, not animation** — driven by the replicated `severMask`, so a late-joining client or a just-rendered remote enemy shows the right stumps deterministically.

#### 7.3 Hit feedback (game feel)

- **Hitstop:** 40–70 ms on a confirmed limb hit, 100 ms on a sever (host pauses the *target's* anim advance; local shooter gets camera/weapon kick).
- **Impact:** decal + spark VFX at `hitPoint`, directional blood, per-material impact `AudioEventId`.
- **Knockback:** small kinematic impulse on torso hits; sever applies a spin to the detached prop.
- **Stalker-specific:** a leg sever triggers a stagger + the `crawl` locomotion swap immediately (readable cause→effect, the M4 proof).

#### 7.4 Ammo scarcity numbers (M4 slice)

| Item | Value |
|---|---|
| Pulse rifle mag size | 24 |
| Reserve ammo at slice start | 48 (2 mags) |
| Ammo pickups in corridor | 2 × 16 = 32 (one pre-objective, one post) |
| Total rounds available | 24 + 48 + 32 = **104** |
| Stalker body HP / effective rounds to kill (torso) | 120 HP → ~10 torso shots (12 dmg/shot) |
| Stalker leg HP (to disable pounce) | 30 → ~3 leg shots |
| Swarmer HP | 20 → **1 shot or 1 melee** |
| Swarm wave size | 12 |
| Melee dmg | 25 (kills a swarmer; 5 hits to drop a Stalker body) |

Design tension: 104 rounds against 1 Stalker (needs ~10 torso, or ~3 legs + finish) **and** 12 swarmers (~12 rounds) means a player who body-shoots the Stalker and panic-sprays the swarm **runs dry** — but a player who **severs the Stalker's legs (3 shots)** and **melees the swarm at the choke** finishes with reserve to spare. The numbers *teach* dismemberment + melee discipline. (Pulse rifle damage 12/shot; values in `weapon.config.ts`, owned by the combat/ECS spec, listed here for AI balance coordination.)

---

### 8. System order on the host (slot into the ECS step)

Inside the host's 60 Hz fixed step, after input/movement, before snapshot encode:

```
1. inputSystem (own avatar)            [ecs spec]
2. playerMovement + flashlight         [ecs spec]
3. noiseEmitSystem                     [ai] every frame
4. (sense tick gate: frame % 6 == bucket)
5.   noiseDecaySystem                  [ai] sense tick
6.   visionSystem (LOS rays)           [ai] sense tick, staggered bucket
7.   senseUpdateSystem (writes Senses) [ai] sense tick
8. stalkerFsmSystem                    [ai]
9. swarmerTokenSystem (5 Hz) + swarmerFsmSystem [ai]
10. pathRequestScheduler (≤2 findPath) [ai]
11. crowd.update(dt)                    [ai] every frame
12. offMeshTraversalSystem              [ai]
13. (director tick gate: 2 Hz)
14.   populationTick / scareTick        [ai]
15. damageResolveSystem (apply hit events from netcode) [ai/combat]
16. physicsStep (Rapier)               [physics spec]
17. snapshotEncode (reads §6 comps)    [netcode spec]
```

Clients run **only** render-side: deserialize snapshots → interpolate (~100 ms buffer) → drive anim state from replicated `state`/`flags`, toggle severed segments from `severMask`. No FSM, no sensing, no nav, no Director on clients.

---

### 9. M4 acceptance (systems level)

- 1 Stalker spawns out of sight, investigates a gunshot, stalks, engages, pounces; **severing a leg disables pounce and switches it to a visible crawl**; it flees a held flashlight.
- 1 Swarmer vent wave (12) pours from a vent off-mesh link on the objective spike; tokenization keeps ≤16 active; they choke at the doorway.
- Director runs one BUILD→PEAK→RELAX cycle: the objective node arms PEAK (telegraphed ~1 s ahead), RELAX enforces a hard lull with no spawns; `tension` float drives music; scare-debt prevents a second spike inside the lull.
- All AI host-only; clients render interpolated snapshots; hits host-validated.
- AI host step ≤ 2.5 ms; 60 fps for 2 players; WebGL2 fallback path unaffected (AI is renderer-agnostic).

## Tasks (toward M4 vertical slice)

- **[M2] Scaffold packages/ai + AiContext + ECS AI components** — _done when:_ packages/ai builds in the Turborepo; AiContext constructs on host with nav/noise/sense/spawnPoints/audioOut wired; ai.ts components (Enemy, StalkerSt, SwarmerSt, AiFlags, BodyHp, LimbHp, Senses, NavAgent, Pounce) registered in the ecs world and visible to the snapshot serializer. _(deps: ecs world + system-order contract; netcode snapshot serializer interface)_
- **[M2] Noise grid + per-player noise emission + decay** — _done when:_ noiseEmitSystem writes splat samples per the NOISE_VALUES table (walk/sprint/shoot/flashlight/melee/reload) at correct cadences; samples decay by half-life and prune; debug heatmap overlay shows hot cells; gunshot dominates the grid corridor-wide. _(deps: player movement + weapon fire events)_
- **[M2] Vision cone + LOS + light/dark modifiers + senseQuery** — _done when:_ visionSystem gates by range/cone/LOS-ray/effective-visibility; flashlight-on raises self-reveal so the Stalker spots the player across a dark corridor while flashlight-off stays hidden; loudestRecentNoise() returns the correct aggregated source; runs at 10 Hz staggered. _(deps: Noise grid task; Rapier raycast host access; authored per-cell ambient light grid in level data)_
- **[M2] Bake corridor navmesh + off-mesh links (tools/nav-bake)** — _done when:_ bakeCorridor.ts produces corridor.navmesh.bin from the level collision proxy with documented rcConfig; vent + ceiling off-mesh links authored and loaded; navmesh + links round-trip load on the host. _(deps: corridor GLB collision proxy from art kit; recast-navigation-js)_
- **[M2] Detour crowd manager + path-request scheduler + AI LOD** — _done when:_ Crowd manages active agents; findPath throttled to <=2/frame via ring buffer with replan-on-trigger (not polling); off-mesh traversal plays anim + interpolates across the link; AI host step measured <=2.5 ms with 1 Stalker + 12 swarmers. _(deps: Navmesh bake task; crowd wrapper)_
- **[M2] Stalker HFSM (all states + transition table)** — _done when:_ Stalker traverses Dormant->Patrol->Investigate->Stalk->Engage->Pounce->Stunned->Fleeing per the spec table with documented timers/thresholds; pounce has windup/air/recover phases; light-attraction biases patrol; it investigates the loudest noise; observable in the debug HUD. _(deps: Sensing tasks; crowd/nav task; ECS components)_
- **[M2] Stalker dismemberment + per-limb HP + capability flags** — _done when:_ per-limb HP depletes from validated hits; severing a leg sets STK_LEGLESS, blocks the Pounce transition, swaps to crawl locomotion + crawl mesh, and lowers the flee-light threshold; severMask replicates; pre-segmented mesh + stump swap renders on clients. _(deps: Stalker HFSM task; host-validated hit events from netcode; segmented enemy GLB)_
- **[M2] Swarmer vent wave: spawn, token virtualization, FSM, flocking** — _done when:_ spawnSwarmWave emits 12 from a vent off-mesh link staggered; tokens promote/demote at activation/deactivation radii with hysteresis; MAX_ACTIVE cap enforced; active swarmers flock (cohesion/alignment/separation) toward the nearest player and choke at the doorway; only active swarmers replicate. _(deps: Crowd/nav + off-mesh task; vent spawn nodes in level data)_
- **[M3] Population Director: phase SM, scare-debt, lulls, spawn selection, player scaling** — _done when:_ BUILD/PEAK/RELAX transitions per config; scareDebt spend/recover blocks over-spawning; RELAX enforces a hard spawn-suppression lull (no spawns) scaled by profile.lullMul; chooseSpawnPoint only returns out-of-LOS vent/spawn nodes in 8-28 m; solo mercy profile (constant Stalker, fewer threats) and engage-token anti-dogpile work. _(deps: Stalker + Swarmer spawn tasks; authored spawn-point registry; vision LOS task)_
- **[M3] Scare Director: telegraph, stinger variant seeding, music duck, AudioEventId emit** — _done when:_ PEAK events telegraphed ~telegraphLeadMs ahead via a scheduled queue; the FSM event bus drives spotted/pounce/sever/death stingers; variant chosen by shared seed so all peers match without extra data; duckMusic + tension float emitted; AudioEventIds sent on the reliable channel + played locally, zero ElevenLabs at runtime. _(deps: Population Director task; audio spec AudioEventId registry + Web Audio engine; netcode reliable channel)_
- **[M3] Host-only replication of enemies as interpolated snapshots** — _done when:_ Snapshot carries only eid/kind/pos/yaw/state/flags/bodyHp/severMask per enemy (~6-8 bytes); clients interpolate position (~100ms buffer), pick anim from replicated state/flags, mesh-swap from severMask; no FSM/sensing/nav/Director runs on any client; verified with the netcode debug HUD. _(deps: ECS components task; netcode snapshot encode/decode; Stalker + Swarmer states)_
- **[M4] Combat feel + ammo scarcity tuning pass for the slice** — _done when:_ Hitstop (40-100ms) + impact decals/sparks/blood + per-material impact audio fire on confirmed hits; ammo numbers (104 rounds, Stalker 120 body / 30 leg, swarmer 20) produce the intended scarcity where leg-sever + melee-the-swarm leaves reserve but panic-spray runs dry, validated in a playtest. _(deps: Dismemberment task; weapon.config from combat spec; VFX/audio hooks)_
- **[M4] M4 integration: one BUILD->PEAK->RELAX cycle on the corridor** — _done when:_ 2-player slice: the objective node arms PEAK, the telegraphed swarm wave + Stalker engage fire, RELAX lull suppresses spawns, tension drives music, the leg-sever crawl proof and host-validated hits are all observable end-to-end at 60fps with WebGL2 fallback verified. _(deps: All M2/M3 AI tasks; level corridor + objective node; audio pack; netcode session)_

## Open questions

- Authored ambient-light grid: who owns the per-cell lux values that feed vision's baseAmbient (level/art pipeline vs a runtime sample of the baked lightmap)? The vision math assumes a cheap authored grid in level data, not a real-time GI read.
- Single-leg vs both-legs rule for STK_LEGLESS: the slice locks 'either leg disables pounce' for readability; confirm this is the desired full-game rule or whether the full game should require both legs (changes leg HP balance).
- Engage-token sharing across enemy types in the full roster: for M4 only the Stalker engages, but the anti-dogpile token pool needs a defined policy (per-player vs per-party) before M5 adds the Brute/Spitter.
- Director run-seed source: the shared variantSeed stream (ctx.rng) must be agreed with netcode — is it derived from the room/run seed exchanged at lobby, and is it advanced identically given host-only consumption? Clients only need the same seed to pick the same stinger variant.
- Lag-comp rewind buffer ownership: hit validation rewinds target colliders to shooter render-time using snapshot history — confirm the netcode spec exposes a host-side history buffer keyed by tick, and the retention window (>= max expected RTT + interp delay).
