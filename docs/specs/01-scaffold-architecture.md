# SIGNAL LOST — Monorepo Scaffold + Runtime Architecture Spec (M4 Vertical Slice)

## 0. Verified dependency versions (June 2026, latest stable)

Pin these exact versions in package.json (caret allowed where noted). Verified via npm/GitHub June 2026.

| Package | Version | Notes |
|---|---|---|
| `three` | `^0.185.0` | r185. Use `three/webgpu` + `three/tsl` subpaths. r182+ requirement satisfied. |
| `bitecs` | `^0.4.0` | New 0.4 API (`createWorld`, `addComponent(world, eid, Comp)` signature changed from 0.3). |
| `@dimforge/rapier3d-compat` | `^0.19.3` | WASM `await RAPIER.init()`. Use compat (inlined wasm, no bundler wasm config needed) for host. |
| `simple-peer` | `9.11.1` | Transport. Stale upstream — wrap behind our own interface, pin exact. Needs `Buffer`/`process` polyfill in browser. |
| `trystero` | `^0.23.0` | Used ONLY for its WebRTC/peer plumbing helpers; we drive signaling via our PartyServer room. |
| `partyserver` | `^0.5.8` | CF Durable Objects signaling server (replaces legacy `partykit`). |
| `@recast-navigation/core` | `^0.43.1` | Navmesh build + crowd. |
| `@recast-navigation/three` | `^0.43.1` | Three.js geometry → navmesh helpers, debug draw. |
| `three.quarks` | `^0.17.0` | Particle/VFX (sparks, vent fog, muzzle, blood mist). |
| `zustand` | `^5.0.14` | HUD store (vanilla + react bindings). |
| `xstate` | `^5.x` (latest 5) | Top-level game FSM. `@xstate/react ^6.1.0` for menu/HUD machine hooks. |
| `vite` | `^7.3.0` | Client bundler (stay on 7.3 LTS line; 8 is bleeding edge). |
| `vitest` | `^4.1.9` | Tests. Uses installed vite. |
| `@gltf-transform/core` | `^4.3.0` | + `@gltf-transform/functions`, `@gltf-transform/extensions`, `@gltf-transform/cli` for content pipeline. |
| `turbo` | `^2.10.0` | Monorepo task runner. |
| `wrangler` | `^4.x` | Deploy signaling Worker / DO. |
| `typescript` | `^5.7.x` | |
| `pnpm` | `9.x` (packageManager field) | |

WASM packages requiring asset handling at build: `@dimforge/rapier3d-compat` (inlined, OK), `@recast-navigation/*` (wasm fetched — needs `vite-plugin-wasm` + `vite-plugin-top-level-await`), `recast` wasm. KTX2 transcoder wasm from `three/examples/jsm/libs/basis/`.

---

## 1. Folder tree (pnpm + Turborepo)

```
signal-lost/
├─ package.json                 # root, private, workspaces via pnpm
├─ pnpm-workspace.yaml
├─ turbo.json
├─ tsconfig.base.json           # shared compiler opts, path aliases
├─ tsconfig.json                # solution file, references all packages
├─ .npmrc                       # shamefully-hoist=false, strict-peer
├─ .nvmrc
├─ vitest.workspace.ts
│
├─ packages/
│  ├─ shared-types/             # zero-dep contracts shared everywhere
│  │  ├─ src/
│  │  │  ├─ net/messages.ts     # NetMessage union (input, snapshot, event, lobby)
│  │  │  ├─ net/snapshot.ts     # WireSnapshot, EntitySnap, schema versions
│  │  │  ├─ ecs/components.ts    # component name enum + field layouts (doc-of-record)
│  │  │  ├─ game/objectives.ts   # ObjectiveId, DirectorState enums
│  │  │  ├─ game/loadout.ts      # WeaponId, meta-progression types
│  │  │  ├─ audio/manifest.ts    # AudioPackManifest, CueId, BusId types
│  │  │  └─ index.ts
│  │  ├─ package.json
│  │  └─ tsconfig.json
│  │
│  ├─ ecs/                      # bitECS world, components, systems (engine-agnostic)
│  │  ├─ src/
│  │  │  ├─ world.ts            # createGameWorld(), World type, singleton resources
│  │  │  ├─ components/         # Transform, Velocity, Health, Enemy, Player, Flashlight,
│  │  │  │                      #   RigidBodyRef, NavAgent, Dismemberable, AudioEmitter...
│  │  │  ├─ systems/            # movement, combat, dismemberment, flashlight/battery,
│  │  │  │                      #   resolve(sanity), enemyAI, navAgent, lifecycle, audioEmit
│  │  │  ├─ queries.ts          # cached bitECS queries
│  │  │  ├─ prefabs.ts          # spawnStalker, spawnSwarmer, spawnPlayer, spawnPickup
│  │  │  └─ index.ts
│  │  └─ package.json / tsconfig.json
│  │
│  ├─ physics/                  # Rapier wrapper, host-only stepping
│  │  ├─ src/
│  │  │  ├─ PhysicsWorld.ts     # init RAPIER, fixed-step, enhanced-determinism config
│  │  │  ├─ colliders.ts        # build colliders from level GLB / character controllers
│  │  │  ├─ characterController.ts # KinematicCharacterController per player/enemy
│  │  │  ├─ raycast.ts          # hitscan for weapon + flashlight occlusion
│  │  │  └─ sync.ts             # write Rapier transforms back into ECS Transform/Velocity
│  │  └─ package.json / tsconfig.json
│  │
│  ├─ netcode/                  # host-authoritative transport, snapshot/interp/predict
│  │  ├─ src/
│  │  │  ├─ transport/
│  │  │  │  ├─ Transport.ts     # interface: send, onMessage, peers, reliability channels
│  │  │  │  ├─ SimplePeerTransport.ts
│  │  │  │  └─ signalingClient.ts # talks to PartyServer room, ICE w/ STUN+TURN
│  │  │  ├─ host/
│  │  │  │  ├─ HostSession.ts   # authoritative: ingest inputs, run sim, emit snapshots
│  │  │  │  └─ snapshotEncoder.ts # delta + quantization, 20Hz
│  │  │  ├─ client/
│  │  │  │  ├─ ClientSession.ts # send input, recv snapshot
│  │  │  │  ├─ interpolation.ts # remote entity buffer interp (100ms delay)
│  │  │  │  └─ prediction.ts    # local player reconciliation ring buffer
│  │  │  ├─ ringbuffer.ts
│  │  │  └─ index.ts
│  │  └─ package.json / tsconfig.json
│  │
│  ├─ render/                   # Three.js WebGPU renderer, scene graph, post, VFX
│  │  ├─ src/
│  │  │  ├─ Renderer.ts         # WebGPURenderer w/ WebGL2 fallback detect
│  │  │  ├─ capabilities.ts     # detectBackend(): 'webgpu' | 'webgl2'
│  │  │  ├─ postFX.ts           # TSL PostProcessing: bloom, vignette, grain, CA, fog
│  │  │  ├─ lighting/flashlight.ts # spotlight + cookie + volumetric (quality-gated)
│  │  │  ├─ assets/
│  │  │  │  ├─ GLTFLoaderSetup.ts # KTX2 + meshopt + draco
│  │  │  │  └─ assetCache.ts
│  │  │  ├─ vfx/quarks.ts       # three.quarks emitters
│  │  │  ├─ syncSystem.ts       # ECS Transform -> Object3D (interpolated)
│  │  │  └─ index.ts
│  │  └─ package.json / tsconfig.json
│  │
│  ├─ audio/                    # Web Audio runtime engine (consumes pre-baked pack)
│  │  ├─ src/
│  │  │  ├─ AudioEngine.ts      # AudioContext, buses, master limiter
│  │  │  ├─ AudioPack.ts        # load hashed manifest, fetch+decode buffers
│  │  │  ├─ scheduler.ts        # lookahead scheduler (25ms tick / 100ms horizon)
│  │  │  ├─ buses.ts            # ambient, sfx, vox, music, stinger; ducking
│  │  │  ├─ spatial.ts          # PannerNode pool, listener from camera
│  │  │  ├─ fearSystem.ts       # Director cue -> audio mapping, dynamic mix
│  │  │  └─ index.ts
│  │  └─ package.json / tsconfig.json
│  │
│  ├─ engine/                   # the glue: game loop, FSM, director, bridge orchestration
│  │  ├─ src/
│  │  │  ├─ GameLoop.ts         # fixed-timestep accumulator + rAF render
│  │  │  ├─ HostLoop.ts         # extends loop: physics+sim+AI+snapshot
│  │  │  ├─ ClientLoop.ts       # extends loop: input send + interp + predict + render
│  │  │  ├─ fsm/gameMachine.ts  # XState top-level FSM
│  │  │  ├─ director/AIDirector.ts # host-only pacing/intensity controller
│  │  │  ├─ director/spawnTables.ts
│  │  │  ├─ bridge/hudStore.ts  # Zustand vanilla store (state bridge)
│  │  │  ├─ bridge/hudSync.ts   # throttled ECS->store writer
│  │  │  ├─ Game.ts             # composition root, wires all packages
│  │  │  └─ index.ts
│  │  └─ package.json / tsconfig.json
│  │
│  └─ ui/                       # React DOM HUD overlay (decoupled)
│     ├─ src/
│     │  ├─ HudRoot.tsx
│     │  ├─ components/ (Flashlight, Health, Resolve, Objective, Reticle, Damage)
│     │  ├─ menus/ (MainMenu, Lobby, Debrief)
│     │  ├─ hooks/useHud.ts     # zustand selectors, shallow
│     │  └─ index.ts
│     └─ package.json / tsconfig.json
│
└─ apps/
   ├─ client/                   # Vite app — the actual game
   │  ├─ index.html
   │  ├─ vite.config.ts
   │  ├─ src/
   │  │  ├─ main.tsx            # bootstrap: mount canvas + React HUD, start Game
   │  │  ├─ bootstrap.ts        # await RAPIER.init(), recast init, audio pack preload
   │  │  └─ env.d.ts
   │  ├─ public/                # static (favicons, no audio here)
   │  └─ package.json / tsconfig.json
   │
   ├─ signaling/                # PartyServer on Cloudflare Worker + Durable Object
   │  ├─ src/
   │  │  ├─ server.ts           # Room DO: room-code create/join, relay SDP+ICE
   │  │  └─ ice.ts              # TURN credential issuance (HMAC time-limited)
   │  ├─ wrangler.toml
   │  └─ package.json / tsconfig.json
   │
   └─ content-pipeline/         # build-time: gen audio from ElevenLabs + optimize GLB
      ├─ src/
      │  ├─ gen-audio.ts        # read cue spec -> ElevenLabs -> wav -> normalize -> opus/ogg
      │  ├─ build-pack.ts       # hash buffers, write AudioPackManifest, upload to R2
      │  ├─ optimize-gltf.ts    # gltf-transform: draco/meshopt + KTX2 + prune
      │  ├─ cues/cue-spec.json  # authored cue list (id, prompt, voice, bus, variants)
      │  └─ build-navmesh.ts    # bake navmesh from level GLB -> .bin
      ├─ package.json / tsconfig.json
      └─ .env.example           # ELEVENLABS_API_KEY, R2 creds (never committed)
```

Dependency direction (enforced via tsconfig references, no cycles):
`shared-types` ← everything. `ecs` ← `physics`,`netcode`,`render`,`engine`. `render`,`audio`,`physics`,`netcode` ← `engine`. `engine`+`ui` ← `apps/client`. `apps/signaling` and `apps/content-pipeline` depend only on `shared-types`.

---

## 2. Root configs

### pnpm-workspace.yaml
```yaml
packages:
  - "packages/*"
  - "apps/*"
```

### .npmrc
```ini
auto-install-peers=true
strict-peer-dependencies=false
shamefully-hoist=false
prefer-workspace-packages=true
```

### root package.json
```json
{
  "name": "signal-lost",
  "private": true,
  "packageManager": "pnpm@9.15.0",
  "scripts": {
    "dev": "turbo run dev --filter=@sl/client",
    "dev:signaling": "turbo run dev --filter=@sl/signaling",
    "build": "turbo run build",
    "content": "turbo run content --filter=@sl/content-pipeline",
    "content:audio": "pnpm --filter @sl/content-pipeline gen-audio",
    "content:gltf": "pnpm --filter @sl/content-pipeline optimize-gltf",
    "content:navmesh": "pnpm --filter @sl/content-pipeline build-navmesh",
    "typecheck": "turbo run typecheck",
    "test": "turbo run test",
    "lint": "turbo run lint"
  },
  "devDependencies": {
    "turbo": "^2.10.0",
    "typescript": "^5.7.3",
    "vitest": "^4.1.9"
  }
}
```

### turbo.json
```json
{
  "$schema": "https://turborepo.dev/schema.json",
  "ui": "tui",
  "globalDependencies": ["tsconfig.base.json", ".env"],
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "content": {
      "cache": false,
      "outputs": ["dist-content/**"],
      "env": ["ELEVENLABS_API_KEY", "R2_*"]
    },
    "gen-audio": { "cache": false, "outputs": ["dist-content/audio/**"], "env": ["ELEVENLABS_API_KEY"] },
    "optimize-gltf": { "outputs": ["dist-content/models/**"], "inputs": ["assets-src/**"] },
    "build-navmesh": { "outputs": ["dist-content/nav/**"], "inputs": ["assets-src/levels/**"] },
    "dev": { "cache": false, "persistent": true },
    "typecheck": { "dependsOn": ["^build"], "outputs": [] },
    "lint": { "outputs": [] },
    "test": { "dependsOn": ["^build"], "outputs": ["coverage/**"] }
  }
}
```

Build ordering: `content` (audio + gltf + navmesh, content-pipeline) is NOT in `^build` of the client by default to keep client iteration fast. CI runs `turbo run content` first, publishes the hashed pack to R2, writes `audio-pack.manifest.json` into `apps/client/src/generated/`, then `turbo run build`. Locally devs run `pnpm content` once, then `pnpm dev`.

### tsconfig.base.json
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2023", "DOM", "DOM.Iterable", "WebWorker"],
    "types": ["@webgpu/types"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "composite": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "incremental": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "paths": {
      "@sl/shared-types": ["./packages/shared-types/src"],
      "@sl/ecs": ["./packages/ecs/src"],
      "@sl/physics": ["./packages/physics/src"],
      "@sl/netcode": ["./packages/netcode/src"],
      "@sl/render": ["./packages/render/src"],
      "@sl/audio": ["./packages/audio/src"],
      "@sl/engine": ["./packages/engine/src"],
      "@sl/ui": ["./packages/ui/src"]
    }
  }
}
```

### Per-package tsconfig.json (e.g. packages/ecs)
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist",
    "tsBuildInfoFile": "dist/.tsbuildinfo"
  },
  "include": ["src"],
  "references": [{ "path": "../shared-types" }]
}
```
`ui/tsconfig.json` adds `"jsx": "react-jsx"`. `apps/signaling` adds `"types": ["@cloudflare/workers-types"]`.

### apps/client/vite.config.ts
```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";
import { nodePolyfills } from "vite-plugin-node-polyfills"; // for simple-peer Buffer/process

export default defineConfig({
  plugins: [
    react({ include: /ui\/.*\.tsx?$/ }), // React only compiles HUD/menu files
    wasm(),
    topLevelAwait(),
    nodePolyfills({ include: ["buffer", "process", "events", "util", "stream"] }),
  ],
  worker: { format: "es", plugins: () => [wasm(), topLevelAwait()] },
  optimizeDeps: {
    exclude: ["@dimforge/rapier3d-compat", "@recast-navigation/core"],
    esbuildOptions: { target: "es2022", supported: { "top-level-await": true } },
  },
  build: {
    target: "es2022",
    sourcemap: true,
    assetsInlineLimit: 0, // never inline GLB/KTX2/audio
    rollupOptions: {
      output: {
        manualChunks: {
          three: ["three", "three/webgpu", "three/tsl"],
          rapier: ["@dimforge/rapier3d-compat"],
          recast: ["@recast-navigation/core", "@recast-navigation/three"],
          ecs: ["bitecs"],
        },
      },
    },
  },
  assetsInclude: ["**/*.glb", "**/*.ktx2", "**/*.bin", "**/*.ogg", "**/*.opus"],
  server: { headers: {
    // required for WASM threads / SharedArrayBuffer if rapier-simd ever used
    "Cross-Origin-Opener-Policy": "same-origin",
    "Cross-Origin-Embedder-Policy": "require-corp",
  } },
});
```

---

## 3. Game loop architecture

Two clocks, decoupled:
- **Simulation clock**: fixed 60 Hz (`FIXED_DT = 1/60`), advanced by an accumulator. Deterministic, Rapier-stepped, host-authoritative.
- **Render clock**: `requestAnimationFrame`, variable. Interpolates between the two latest sim states with `alpha`.

### Constants
```ts
export const SIM_HZ = 60;
export const FIXED_DT = 1 / SIM_HZ;          // 16.667ms
export const SNAPSHOT_HZ = 20;               // host -> clients
export const SNAPSHOT_INTERVAL = SIM_HZ / SNAPSHOT_HZ; // every 3rd sim tick
export const INTERP_DELAY_MS = 100;          // remote entity render delay
export const MAX_FRAME_DT = 0.25;            // clamp spiral-of-death
export const AUDIO_LOOKAHEAD = 0.1;          // 100ms scheduler horizon
export const AUDIO_SCHED_TICK = 0.025;       // 25ms
```

### Core loop (shared)
```ts
class GameLoop {
  private acc = 0;
  private last = performance.now();
  private tick = 0;

  frame = (now: number) => {
    let dt = (now - this.last) / 1000;
    this.last = now;
    if (dt > MAX_FRAME_DT) dt = MAX_FRAME_DT; // avoid spiral after tab stall
    this.acc += dt;

    while (this.acc >= FIXED_DT) {
      this.fixedUpdate(this.tick, FIXED_DT); // <-- subclass: sim
      this.tick++;
      this.acc -= FIXED_DT;
    }
    const alpha = this.acc / FIXED_DT;
    this.variableUpdate(alpha);              // <-- subclass: render/interp
    requestAnimationFrame(this.frame);
  };
  protected fixedUpdate(_tick: number, _dt: number) {}
  protected variableUpdate(_alpha: number) {}
}
```

### HOST loop (`HostLoop`)
`fixedUpdate(tick, dt)` runs the full authoritative sim, in order:
1. **Ingest** buffered remote player inputs for this tick (from netcode receive queue) + sample local input.
2. **AI Director** (`director.update(tick, world)`) — only every N ticks (e.g. 10 Hz) — picks intensity, schedules spawns, requests audio cues. Cheap; runs on host only.
3. **Enemy AI systems** — perception, navAgent target selection (recast crowd `update(dt)`), state machines (Stalker/Swarmer).
4. **Gameplay systems** — movement intent → character controllers, combat/hitscan, dismemberment, flashlight/battery drain, Resolve/sanity.
5. **`physics.step(dt)`** — Rapier fixed step (enhanced determinism). Then `physics.sync()` writes bodies back to ECS `Transform`.
6. **Lifecycle** — spawn/despawn, objective triggers, win/lose checks → FSM events.
7. **Snapshot**: if `tick % SNAPSHOT_INTERVAL === 0`, encode delta snapshot (20 Hz) and broadcast to all clients over the **unreliable** channel; reliable channel for events (deaths, objective complete, audio-cue triggers).

`variableUpdate(alpha)` on host: host is also a player → interpolate its own render from last two sim states, run render sync + post + audio scheduler tick.

### CLIENT loop (`ClientLoop`)
`fixedUpdate(tick, dt)`:
1. Sample local input → push to prediction ring buffer (tagged with `tick`), send to host over unreliable channel (input redundancy: send last 3 inputs per packet).
2. **Local prediction**: simulate ONLY the local player (movement + controller, no enemies, no authoritative physics) forward using same movement code → immediate responsiveness.
3. On snapshot receipt (async, in receive handler not in fixedUpdate): **reconciliation** — snap local player to authoritative state at `snapshot.tick`, replay buffered inputs after that tick. Remote entities pushed into interpolation buffers (no prediction).

`variableUpdate(alpha)`:
1. **Remote entities**: render at `now - INTERP_DELAY_MS`, interpolating between two buffered snapshots (`interpolation.ts`).
2. **Local player**: render at predicted state with `alpha` smoothing.
3. `render.syncSystem()` ECS→Object3D, `render.postFX`, camera update.
4. `audio.scheduler.tick()` (lookahead), `audio.spatial` listener = camera.

Key difference table:

| Concern | Host | Client |
|---|---|---|
| Rapier physics | Steps authoritative world | None (or local-player-only kinematic) |
| Enemy AI / Director | Yes (only here) | No — receives via snapshot |
| Snapshots | Produces @20Hz | Consumes |
| Local player | Direct sim | Predicts + reconciles |
| Remote players | Direct sim | Interpolates (100ms) |
| Audio scheduler | Runs (host is a player) | Runs |

The **audio scheduler** is independent of net role — every machine schedules its own cues from local Director events (host) or networked cue-trigger events (clients). Cue triggers are sent on the reliable channel with a target audio-clock offset so all clients fire the scare within the same window without ElevenLabs ever being on the path.

---

## 4. Top-level game FSM (XState 5)

```ts
// engine/src/fsm/gameMachine.ts
import { setup, assign } from "xstate";

type Ctx = {
  roomCode: string | null;
  isHost: boolean;
  players: PlayerSlot[];      // up to 4
  netReady: boolean;
  result: "win" | "lose" | null;
};
type Ev =
  | { type: "BOOT_DONE" }
  | { type: "HOST_GAME" } | { type: "JOIN_GAME"; code: string }
  | { type: "LOBBY_READY" }            // all players ready + host start
  | { type: "PEERS_CONNECTED" }
  | { type: "CINEMATIC_DONE" }
  | { type: "DOCKED" }
  | { type: "OBJECTIVE_COMPLETE" }     // reaching Command Centre / M4 spike survived
  | { type: "ALL_PLAYERS_DOWN" }
  | { type: "RETURN_MENU" }
  | { type: "DISCONNECTED" };

export const gameMachine = setup({
  types: { context: {} as Ctx, events: {} as Ev },
  guards: {
    isHost: ({ context }) => context.isHost,
    allConnected: ({ context }) => context.netReady,
  },
}).createMachine({
  id: "signalLost",
  initial: "boot",
  context: { roomCode: null, isHost: false, players: [], netReady: false, result: null },
  states: {
    boot: { // OWNS: load core wasm (rapier/recast init), audio pack preload, capability detect
      on: { BOOT_DONE: "mainMenu" },
    },
    mainMenu: { // OWNS: main menu React tree, loadout/cosmetics meta screens
      on: {
        HOST_GAME: { target: "lobby", actions: assign({ isHost: true }) },
        JOIN_GAME: { target: "lobby",
          actions: assign({ isHost: false, roomCode: ({ event }) => event.code }) },
      },
    },
    lobby: { // OWNS: room code create/join via signaling, peer connection, ready states
      on: {
        PEERS_CONNECTED: { actions: assign({ netReady: true }) },
        LOBBY_READY: { target: "launchCinematic", guard: "allConnected" },
        DISCONNECTED: "mainMenu",
        RETURN_MENU: "mainMenu",
      },
    },
    launchCinematic: { // OWNS: capsule-launch-from-Earth non-interactive sequence + music
      on: { CINEMATIC_DONE: "docking" },
    },
    docking: { // OWNS: pilot capsule into derelict airlock (light interactivity / scripted)
      on: { DOCKED: "inShip", DISCONNECTED: "lobby" },
    },
    inShip: { // OWNS: the actual gameplay — game loop active, director running (host)
      on: {
        OBJECTIVE_COMPLETE: { target: "win", actions: assign({ result: () => "win" }) },
        ALL_PLAYERS_DOWN:   { target: "lose", actions: assign({ result: () => "lose" }) },
        DISCONNECTED: "lose",
      },
    },
    win:  { on: { RETURN_MENU: "debrief" }, after: { 4000: "debrief" } },
    lose: { on: { RETURN_MENU: "debrief" }, after: { 4000: "debrief" } },
    debrief: { // OWNS: stats, lore unlock, meta-progression grant
      on: { RETURN_MENU: "mainMenu" },
    },
  },
});
```

The machine is the single source of truth for "what screen + what subsystems are live". `engine/src/Game.ts` subscribes: entering `inShip` starts the appropriate loop (`HostLoop` or `ClientLoop`); leaving it tears down physics/world. Only host evaluates `OBJECTIVE_COMPLETE` / `ALL_PLAYERS_DOWN` and broadcasts a reliable `FSM_TRANSITION` event so clients' machines follow deterministically (clients receive the event, don't compute it).

---

## 5. State bridge: ECS / game loop → React HUD

Rule: **React never runs per frame.** ECS writes into a vanilla Zustand store at a throttled rate; HUD components subscribe to narrow slices with `useShallow`.

```ts
// engine/src/bridge/hudStore.ts
import { createStore } from "zustand/vanilla";

export interface HudState {
  health: number;            // 0..100
  resolve: number;           // 0..100 (sanity)
  battery: number;           // 0..1
  flashlightOn: boolean;
  ammo: { mag: number; reserve: number };
  objective: { id: string; label: string; progress: number };
  teammates: { id: number; name: string; health: number; down: boolean }[];
  damageFlash: number;       // 0..1 decays
  net: { rttMs: number; role: "host" | "client"; peers: number };
  // setters (called by hudSync, never by React):
  apply(patch: Partial<HudState>): void;
}

export const hudStore = createStore<HudState>((set) => ({
  health: 100, resolve: 100, battery: 1, flashlightOn: true,
  ammo: { mag: 0, reserve: 0 },
  objective: { id: "", label: "", progress: 0 },
  teammates: [], damageFlash: 0,
  net: { rttMs: 0, role: "host", peers: 0 },
  apply: (patch) => set(patch),
}));
```

```ts
// engine/src/bridge/hudSync.ts — called from variableUpdate, but rate-limited
const HUD_HZ = 15;                 // HUD refresh, not 60
let lastHud = 0;
export function syncHud(world: World, now: number) {
  if (now - lastHud < 1000 / HUD_HZ) return;
  lastHud = now;
  const p = localPlayer(world);
  // build a plain patch; shallow-compare done by zustand subscribers
  hudStore.getState().apply({
    health: Health.value[p],
    resolve: Resolve.value[p],
    battery: Flashlight.battery[p],
    flashlightOn: Flashlight.on[p] === 1,
    ammo: { mag: Weapon.mag[p], reserve: Weapon.reserve[p] },
    objective: currentObjectiveView(world),
    teammates: teammateView(world),
    net: netStats(),
  });
}
```

```ts
// ui/src/hooks/useHud.ts
import { useStore } from "zustand";
import { useShallow } from "zustand/react/shallow";
import { hudStore } from "@sl/engine/bridge/hudStore";

export const useHealth = () => useStore(hudStore, (s) => s.health);
export const useAmmo = () =>
  useStore(hudStore, useShallow((s) => s.ammo));
```

Transient high-frequency visuals (damage vignette pulse, flashlight flicker) that need 60 Hz do NOT go through React — they are driven directly in the render package (post FX uniforms), with only their coarse magnitude mirrored into the store for any HUD element. React re-renders are bounded to ~15/s and only when a slice actually changes.

---

## 6. Netcode wire schemas (`shared-types`)

```ts
export const PROTO_VERSION = 1;

export type NetMessage =
  | { t: "input";   tick: number; seq: number; inputs: PlayerInput[] }   // client->host, unreliable
  | { t: "snap";    tick: number; baseline: number; ents: EntitySnap[] } // host->client, unreliable
  | { t: "event";   tick: number; ev: GameEvent }                        // reliable both ways
  | { t: "cue";     tick: number; cueId: CueId; atAudioOffset: number }  // host->client, reliable
  | { t: "lobby";   payload: LobbyMsg };                                 // reliable

export interface PlayerInput {
  tick: number;
  move: [number, number];     // -1..1 quantized to int8
  look: [number, number];     // yaw/pitch delta
  buttons: number;            // bitflags: fire, melee, flashlight, interact, sprint
}

export interface EntitySnap {
  id: number;
  flags: number;              // bit: pos|rot|health|state changed (delta)
  pos?: [number, number, number]; // quantized fixed-point (mm)
  rot?: [number, number, number]; // smallest-three or yaw-only for enemies
  state?: number;             // enemy FSM state / anim id
  health?: number;
}

export type GameEvent =
  | { k: "spawn"; id: number; kind: EntityKind; pos: [number,number,number] }
  | { k: "despawn"; id: number }
  | { k: "death"; id: number; cause: number }
  | { k: "dismember"; id: number; part: number }
  | { k: "objective"; id: ObjectiveId; progress: number }
  | { k: "fsm"; state: GameStateName };
```

Snapshot encoding (`snapshotEncoder.ts`): delta vs last acked baseline tick per client; positions quantized to int16 mm relative to level origin; rotations yaw-only (uint16) for ground enemies, smallest-three quat for players; bit flags mark present fields. Unreliable channel, redundant resend handled by next snapshot (no per-snap reliability).

---

## 7. AI Director (host-only) algorithm

```ts
// engine/src/director/AIDirector.ts
type Phase = "buildup" | "peak" | "relief";
interface DirectorCtx {
  intensity: number;      // 0..1 current
  target: number;         // desired
  phase: Phase;
  threatBudget: number;   // active enemy "cost" cap
  lastSpawn: number; lastScare: number;
}
const TUNE = {
  updateHz: 10,
  reliefIntensity: 0.15, peakIntensity: 0.9,
  buildupRate: 0.04, decayRate: 0.08,
  stalkerCost: 3, swarmerCost: 1, maxBudget: 6, // M4 slice caps
};
```
Per update (10 Hz): read aggregate player stress proxies (recent damage, time-since-last-encounter, Resolve avg, distance to objective node). Drive `intensity` toward `target` by phase. When `phase==="peak"` and budget available and cooldown elapsed → emit spawn from `spawnTables` (vent Swarmer wave + Stalker) and a reliable `cue` (telegraph stinger) timed ~1.2s before the spike. Relief phase suppresses spawns and lowers ambient bus. For M4: the single objective node, when interacted, forces `phase="peak"`, spends full budget once (1 Stalker + Swarmer wave), fires the telegraphed audio spike, then transitions to relief on clear → `OBJECTIVE_COMPLETE`.

---

## 8. Audio runtime (consumes pre-baked pack)

`AudioPackManifest` (built by content-pipeline):
```ts
export interface AudioPackManifest {
  version: number;
  baseUrl: string;                 // R2/CDN hashed path
  cues: Record<CueId, {
    file: string;                  // "stalker_roar.a1b2c3.opus" (content hash)
    bus: BusId;                    // "ambient"|"sfx"|"vox"|"music"|"stinger"
    gain: number; loop?: boolean;
    variants?: string[];           // round-robin/random anti-repetition
    spatial?: boolean;
  }>;
}
```
Runtime: `AudioEngine` builds bus graph (each bus = GainNode → compressor → master limiter → destination). `scheduler.ts` runs a lookahead loop (`setInterval` 25 ms, schedule anything due within 100 ms via `source.start(when)` on the AudioContext clock) so scares are sample-accurate and never blocked. `fearSystem.ts` maps Director intensity to ambient bed gain + low-frequency rumble + ducking of music under stingers. ElevenLabs is invoked ONLY in `content-pipeline/gen-audio.ts` at build time.

### gen-audio cue spec + example prompts
```json
// content-pipeline/src/cues/cue-spec.json
{
  "voice": { "ship_ai": "VOICE_ID_CALM_FEMALE", "comms": "VOICE_ID_GRUFF_MALE" },
  "cues": [
    { "id": "ai_dock_confirm", "voice": "ship_ai", "bus": "vox",
      "prompt": "[calm, slightly distorted radio] Docking clamps engaged. Atmosphere reads... breathable. I'm reading no crew life signs. Stay together." },
    { "id": "ai_objective_command_centre", "voice": "ship_ai", "bus": "vox",
      "prompt": "[urgent whisper] The Command Centre is two bulkheads ahead. Something moved in the vents. Keep your light on it." },
    { "id": "stalker_telegraph", "bus": "stinger", "synthesis": "sfx",
      "prompt": "Sudden low metallic groan rising to a sharp dissonant string stab, deep sub-bass impact, 2 seconds, horror sting." },
    { "id": "swarmer_skitter", "bus": "sfx", "spatial": true, "variants": 4,
      "prompt": "Wet chitinous skittering of small clawed creatures across metal grating, close, frantic." }
  ]
}
```
`gen-audio.ts`: for each cue call ElevenLabs (TTS for `voice` cues, SFX endpoint for `synthesis:"sfx"`), receive wav, normalize to -16 LUFS, encode to opus + ogg fallback, content-hash filename, write into `dist-content/audio/`. `build-pack.ts` assembles the manifest, uploads to R2, emits `apps/client/src/generated/audio-pack.manifest.json`. Cached by Turbo on cue-spec hash → no re-billing ElevenLabs unless a prompt changes.

---

## 9. Content pipeline: GLTF + navmesh

`optimize-gltf.ts` (gltf-transform 4.3): load source GLB → `dedup`, `prune`, `weld`, `simplify` (optional LOD), `meshopt` compression, `textureCompress` to KTX2 (UASTC for normal/ORM, ETC1S for albedo) → write to `dist-content/models/<name>.<hash>.glb`. Trim-sheet kit pieces optimized once, instanced in level assembly.

`build-navmesh.ts`: load level GLB collision layer, feed triangle soup to `@recast-navigation/core` `generateSoloNavMesh` (cellSize 0.2, agentRadius 0.4, agentHeight 1.8, maxSlope 45), serialize to `dist-content/nav/corridor.<hash>.bin`. Loaded host-side only; clients never need the navmesh.

---

## 10. Dev / build scripts summary

- `pnpm dev` → Turbo runs `@sl/client` Vite dev server (HMR for HUD via React Fast Refresh; engine code HMR-safe by re-creating `Game`).
- `pnpm dev:signaling` → `wrangler dev` for PartyServer DO locally.
- `pnpm content` → audio + gltf + navmesh (cached). Run once after pulling new assets/cues.
- CI: `content` → upload R2 + write generated manifest → `build` → `wrangler pages deploy` (client to CF Pages, signaling Worker via `wrangler deploy`).
- `pnpm test` → vitest workspace; deterministic sim tests (fixed-tick replay), snapshot encode/decode round-trip, reconciliation property tests.

---

## 11. Bootstrap order (apps/client/src/bootstrap.ts)
```ts
export async function bootstrap() {
  const backend = detectBackend();                 // 'webgpu' | 'webgl2'
  await RAPIER.init();                              // rapier3d-compat wasm
  await RecastInit();                               // recast wasm
  const pack = await AudioPack.load(MANIFEST_URL);  // fetch+decode on user gesture
  const renderer = await createRenderer(backend);   // WebGPURenderer or WebGL2 fallback
  const game = new Game({ renderer, pack });
  mountHud(document.getElementById("hud")!);        // React root over canvas
  game.fsm.send({ type: "BOOT_DONE" });
}
```
WebGL2 fallback is a hard M4 gate: `detectBackend()` returns `'webgl2'` when `navigator.gpu` absent; `createRenderer` swaps `WebGPURenderer` backend and post pipeline degrades (drop volumetric flashlight, simpler grain) while staying 60 fps on the slice corridor.

## Tasks (toward M4 vertical slice)

- **[M0] Scaffold pnpm + Turborepo monorepo skeleton** — _done when:_ `pnpm install` succeeds; `turbo run typecheck` passes across empty packages/apps; pnpm-workspace.yaml, turbo.json, tsconfig.base + per-package references resolve with no cycles.
- **[M0] Define shared-types contracts (net messages, snapshot, ECS component layouts, audio manifest)** — _done when:_ @sl/shared-types builds with zero runtime deps; NetMessage union, EntitySnap, AudioPackManifest, FSM state names exported and imported by ecs/netcode/audio without type errors. _(deps: monorepo skeleton)_
- **[M0] Wire Vite client config (WASM, top-level await, node polyfills, GLB/KTX2/audio assets, manualChunks)** — _done when:_ `pnpm dev` serves a blank canvas; rapier3d-compat and recast wasm load; simple-peer imports without Buffer crash; GLB/KTX2 served uncompressed (not inlined). _(deps: monorepo skeleton)_
- **[M1] Implement bitECS world + core components and queries** — _done when:_ createGameWorld() returns a world; Transform/Velocity/Health/Player/Enemy/Flashlight/Resolve/Weapon/NavAgent/RigidBodyRef components defined with bitECS 0.4 API; cached queries return spawned entities in a unit test. _(deps: shared-types)_
- **[M1] Implement fixed-timestep GameLoop with accumulator + rAF render** — _done when:_ GameLoop runs fixedUpdate at 60Hz (verified by tick count over wall time), variableUpdate per rAF with correct alpha; clamps MAX_FRAME_DT after an artificial stall (no spiral of death). _(deps: monorepo skeleton)_
- **[M1] Integrate Rapier physics (host-only, enhanced determinism) + ECS sync** — _done when:_ PhysicsWorld steps at FIXED_DT; KinematicCharacterController moves a player capsule against a static corridor collider; sync() writes Rapier transforms into ECS Transform; two runs with identical inputs produce identical transforms (determinism test). _(deps: ecs world; GameLoop)_
- **[M1] Render package: WebGPURenderer with WebGL2 fallback + GLTF/KTX2 loader + ECS→Object3D sync** — _done when:_ detectBackend() picks webgpu when navigator.gpu present, webgl2 otherwise; optimized corridor GLB loads with KTX2 textures; ECS Transform drives Object3D each frame at 60fps; both backends render the corridor. _(deps: ecs world; GameLoop)_
- **[M1] Top-level XState game FSM with all states/events/guards** — _done when:_ gameMachine transitions boot→mainMenu→lobby→launchCinematic→docking→inShip→win/lose→debrief on the specified events; isHost/allConnected guards enforced; entering/leaving inShip starts/stops the loop in Game.ts. _(deps: GameLoop)_
- **[M1] Zustand HUD store + throttled hudSync + React HUD reading via useShallow** — _done when:_ hudSync writes at <=15Hz from variableUpdate; React HUD shows health/battery/ammo/objective; profiling shows React re-renders bounded to slice changes (no per-frame re-render) while sim runs 60fps. _(deps: ecs world; GameLoop)_
- **[M2] Netcode: simple-peer transport + PartyServer signaling + room codes + STUN/TURN** — _done when:_ Two browsers connect via a 6-char room code through the PartyServer DO; reliable + unreliable DataChannels open; ICE uses configured STUN and time-limited TURN creds; connection survives symmetric-NAT test via TURN. _(deps: shared-types; Vite client config)_
- **[M2] Host-authoritative snapshot pipeline: input ingest, 20Hz delta snapshots, client interpolation** — _done when:_ Host broadcasts delta+quantized snapshots at 20Hz; client decodes and interpolates remote entities at 100ms delay smoothly; round-trip encode/decode unit test is lossless within quantization tolerance. _(deps: netcode transport; ecs world; physics)_
- **[M2] Client-side prediction + reconciliation for local player** — _done when:_ Local player responds to input with zero perceived latency; on snapshot the client snaps to authoritative state at snapshot.tick and replays buffered inputs; no visible rubber-banding under 100ms simulated latency. _(deps: snapshot pipeline)_
- **[M2] Audio engine: pack loader, bus graph, lookahead scheduler, spatial panner pool** — _done when:_ AudioPack loads hashed manifest and decodes buffers; scheduler fires a cue sample-accurately within the 100ms horizon; spatial cue pans relative to camera listener; master limiter prevents clipping on overlapping stingers. _(deps: shared-types; Vite client config)_
- **[M2] Content pipeline: gen-audio (ElevenLabs build-time) + build-pack manifest + R2 upload** — _done when:_ gen-audio produces normalized opus+ogg from cue-spec prompts; build-pack writes content-hashed AudioPackManifest consumed by the client; Turbo caches on cue-spec hash so unchanged prompts skip ElevenLabs calls. _(deps: shared-types)_
- **[M2] Content pipeline: gltf-transform optimization + recast navmesh bake** — _done when:_ optimize-gltf outputs meshopt+KTX2 GLB consumed by render; build-navmesh produces a serialized .bin loaded host-side; navmesh covers the M4 corridor with correct agent radius/height. _(deps: shared-types; render package)_
- **[M3] Enemy AI (Stalker + Swarmer) on host with recast crowd navigation** — _done when:_ Stalker pathfinds toward nearest player along navmesh and attacks; Swarmer vent wave skitters in and swarms; both run only on host and replicate via snapshot state field; clients show correct enemy positions/anim states. _(deps: snapshot pipeline; navmesh bake; physics)_
- **[M3] Combat: one ranged weapon (hitscan) + melee + dismemberment** — _done when:_ Hitscan ray damages enemies host-side; melee works at range; killing/hitting a limb fires a dismember event replicated to clients with VFX (three.quarks) and audio; ammo/battery/Resolve update in HUD. _(deps: enemy AI; audio engine)_
- **[M3] AI Director (host-only) pacing + telegraphed spike at objective node** — _done when:_ Director drives buildup/peak/relief intensity at 10Hz; interacting with the single objective node forces a peak, spawns 1 Stalker + 1 Swarmer wave, fires a telegraphed stinger ~1.2s before the spike via reliable cue, then resolves to OBJECTIVE_COMPLETE on clear. _(deps: enemy AI; combat; audio engine)_
- **[M3] Flashlight/battery + Resolve (sanity) systems with render + audio coupling** — _done when:_ Flashlight spotlight (volumetric on WebGPU, degraded on WebGL2) drains battery; low Resolve increases ambient dread mix and post FX; toggling/refilling reflected in HUD at 15Hz; 60fps maintained. _(deps: render package; audio engine; HUD store)_
- **[M4] Assemble M4 'Haunted Corridor' level from trim-sheet kit + safe room + scripted launch/dock** — _done when:_ One handcrafted corridor + safe room built from optimized kit pieces; launch cinematic and docking sequences play and transition the FSM; objective node placed and wired to the Director spike. _(deps: render package; FSM; content pipeline gltf)_
- **[M4] M4 vertical slice integration + performance + WebGL2 fallback green-light** — _done when:_ 2 players via room code complete a 5-8 min run: launch→dock→corridor→objective spike (1 Stalker + 1 Swarmer wave)→win; full pre-baked audio + host Director active; sustained 60fps on WebGPU; WebGL2 fallback verified playable at 60fps on the slice. _(deps: all M3 tasks; level assembly)_

