# SIGNAL LOST — Implementation Status

> Current audit: 2026-06-30. This file reconciles the original M0→M4 backlog with the code that
> exists now. It is intentionally practical: green means implemented and tested in repo; partial
> means a useful piece exists but the backlog acceptance gate is not yet satisfied.

## Current Verification

- `pnpm test` passes after rebuilding changed packages.
- `pnpm typecheck` passes.
- `pnpm build` passes.
- `pnpm smoke:net` passes: local WebSocket signaling + two browser pages + WebRTC gameplay movement.
- `pnpm smoke:net:room` passes: local WebSocket signaling + host + 3 clients + 5s fixed-step room soak.
- `pnpm smoke:net:turn` passes: local signaling `/turn` credential fetch path + two browser pages.
- Verification above was run after the local browser smoke harness, peer-spawn spacing, TURN CORS,
  and relay-control updates.

## Where We Are

The repo is in **M0 / early M1 infrastructure**, with a useful playable greybox in `apps/lookdev`.
It is **not yet** the M4 Haunted Corridor vertical slice.

The strongest implemented surface is the lookdev walk scene: first-person controls, Rapier KCC
movement, ECS transforms, flashlight, PS1-style internal-resolution crunch, basic HUD, chaos physics
probe, and room-code net controls.

## Done

- **T01 monorepo scaffold:** pnpm workspace, Turborepo, project refs, app/package layout.
- **T02 shared types:** net/entity/audio/FSM contracts and replicated registry exist.
- **T04 netcode primitives:** byte buffers, quantization, headers, snapshot/input/ping codecs.
- **T09 snapshot full/delta codec:** pure codec + fuzz tests exist.
- **T10 snapshot ring:** host-side `SnapshotHistory` exists and is now used by the live gameplay
  net driver for ACK-based deltas.
- **T18 ECS:** bitECS 0.4 component catalog, world roles, queries, pools, prefabs, tests.
- **T19 audio-content scaffold:** Zod schemas, ElevenLabs request builders, rate limiter, tests.
- **T20 asset-pipeline scaffold:** config schema + CLI validation.
- **T21 GameLoop:** fixed-step accumulator, clamp, tests.
- **T22 ECS world/query layer:** implemented and tested.
- **T23 physics foundation:** Rapier wrapper, KCC capsule, deterministic tests.
- **T24/T25 renderer bootstrap/profile:** WebGPU-first renderer, WebGL2 force path, degrade matrix.
- **T29 render sync/loader adapter:** ECS Object3D sync and GLTF/KTX2 loader setup exist.
- **T30 flashlight:** camera-riding SpotLight with profile shadow size and `autoUpdate=false`.
- **T32 game FSM:** hand-rolled state machine matching the planned top-level flow.
- **T33 HUD store:** throttled HUD store/sync and basic HUD display.

## Partial

- **T05/T07/T08 live room networking:** WebRTC `PeerLink`, `Session`, room codes, connection state,
  ping/stats and HUD shell exist. Trystero/Nostr remains the default signaling path; the Cloudflare
  Durable Object WebSocket path is selectable with `VITE_SIGNALING_URL`. The signaling Worker `/turn`
  credential endpoint can now feed lookdev ICE config with `VITE_TURN_FROM_SIGNALING=1` or
  `VITE_REQUIRE_TURN=1`; `VITE_FORCE_RELAY=1` / `VITE_ICE_TRANSPORT_POLICY=relay` can force relay-only
  ICE once real TURN credentials exist. Deployed TURN relay verification is still open.
- **T11/T12/T48 live gameplay networking:** client input, host application, ACKs, host-assigned
  lobby owner slots, full/delta ECS snapshots, input-ack metadata, 20 Hz snapshot cadence,
  render-path remote interpolation, and lookdev client local reconciliation are wired in
  `GameplayNetDriver`/`apps/lookdev`. Local browser smoke now covers host + 1 client movement and
  host + 3 clients with a short fixed-step soak. Still missing: longer soak metrics, snapshot byte
  budget enforcement, and cross-network/TURN relay verification.
- **T13/T14 prediction/interp:** pure Predictor and InterpBuffer exist and are tested. Remote entity
  interpolation is integrated into the lookdev client render path. Local-player reconcile now uses
  authoritative owner-slot snapshots plus unacked input replay in the browser lookdev path, with a
  100 ms simulated latency + unreliable-loss driver test. Live browser latency verification and
  dynamic-client-physics rewind are still open.
- **T15 net debug:** stats and debug HUD primitives exist, and `Session` records snapshot/input
  rates plus snapshot bytes from wire headers. Full relay/srflx verification is not complete.
- **T16 host loss:** host-loss watcher exists; final product UI flow and run-end handling need a live
  browser verification pass.
- **T26/T27/T28 render mood:** simplified TSL post stack exists: fog, grade, vignette, posterize,
  Bayer dither. MRT, emissive-only bloom, GTAO, volumetric cone, CA/SMAA, vertex snap, affine/CRT,
  and baked-lightmap application are still open.
- **T34/T35 performance:** chaos physics harness exists; real BudgetMonitor/GpuTimer, Playwright
  render smoke, draw-call/frametime gates, and WebGPU/WebGL2 visual capture gates are open.
- **Client app:** landing, lobby shell, admin asset UI exist. The playable game is currently in
  `apps/lookdev`, not the main client flow.

## Open

- **T06/T17 M0 green-light:** deploy/select the final signaling strategy, configure TURN, verify two
  browsers on different networks including relay path for 10+ minutes. Local WebSocket browser smoke
  exists for two-browser and 4-player same-machine regression coverage.
- **T26/T38/T39/T40 real content:** no committed GLB/KTX2 modular kit, trim sheets, sockets, colliders,
  LevelDoc exporter, or baked-lightmap corridor yet.
- **T31 flicker panels:** no TSL emissive flicker panel system yet.
- **T36/T37/T42 asset pipeline proper:** no gltf-transform optimize, KTX2 encode, budget-check, or
  immutable content manifest/R2 upload pipeline yet.
- **T41/T50-T58 AI foundation:** no AI package, navmesh, sensing, Stalker/Swarmer systems, crowd/nav
  integration, combat validation, or dismemberment systems yet.
- **T43/T44/T45/T46 audio runtime:** no generated audio pack, AudioId union, stems, Web Audio bus graph,
  scheduler, panner pool, reverb/occlusion, or runtime audio system yet.
- **T49 reliable event protocol:** no hit/door/objective/audio/chat event codecs/routing yet.
- **T60+ combat/VFX:** no weapon, melee, hit validation, VFX pools, decals, or ammo/battery/Resolve
  gameplay systems yet.
- **T82-T86 vertical slice:** launch/dock/corridor/objective/win flow and M4 green-light are not built.

## Recommended Next Order

1. Finish M0 networking green-light: final signaling path, TURN config, cross-network relay diagnostics,
   10+ minute soak, and live 100 ms latency/prediction verification.
2. Finish the M-LOOK/M1 render gate: real low-poly corridor assets, baked lightmaps, full post stack,
   WebGPU/WebGL2 screenshots, BudgetMonitor/GpuTimer.
3. Build the content pipeline before enemy work: optimized kit assets, LevelDoc, collision/navmesh.
4. Build audio pack generation and the runtime bus/scheduler before Scare Director integration.
5. Then implement AI/combat/Director against stable level, net, render, and audio contracts.
