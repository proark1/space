# SIGNAL LOST — M1 (Render Production) Implementation Plan

> **Status:** PARTIALLY IMPLEMENTED — originally authored 2026-06-29 as a plan-only doc. Since then,
> `packages/render`, `packages/engine`, `packages/ui`, and `apps/lookdev` have been scaffolded with
> tested M0/early-M1 infrastructure. See [IMPLEMENTATION-STATUS.md](IMPLEMENTATION-STATUS.md) for the
> current done/partial/open split.
> **Reads with:** [00-BUILD-BACKLOG.md](specs/00-BUILD-BACKLOG.md) (T21–T44), [01-scaffold-architecture.md](specs/01-scaffold-architecture.md) (package layout), [06-rendering-mood.md](specs/06-rendering-mood.md) + [LOW-POLY-PIVOT.md](LOW-POLY-PIVOT.md) (post-pivot render stack), [M-LOOK.md](M-LOOK.md) (the GREEN gate).

================================================================

## 0. The reframe — what "start M1" actually means

M-LOOK **gates** M1, and M-LOOK's real deliverable — the renderer as *engine code* — was never built. What exists (`lookdev/index.html`) is a **CDN-Three GLSL prototype of the target image**, not `packages/render`. So M1 does not start "after" M-LOOK; **the first phase of M1 *is* executing M-LOOK properly as real code, then promoting it.**

Consequence for risk: the *look* is already de-risked (the PS1 corridor — flashlight, fog, vertex-snap, dither, post grade, the CHORUS reveal — is user-validated). The real, still-unproven M1 risks are narrower:

1. **WebGPU/TSL port** — rebuild the proven GLSL stack as WebGPU-first + TSL node materials, WebGL2 fallback first-class.
2. **Perf-under-chaos (M-LOOK B3)** — 60fps on a mid GPU under **300+ Rapier bodies + ragdolls + enemies**. Spec flags this as *currently unbacked* (no harness exists).
3. **The bespoke CHORUS monster** — the make-or-break art gate (Meshy/Tripo → heavy Blender), *not started*.

================================================================

## 1. Locked decisions (this plan)

| # | Decision | Choice | Rationale |
|---|---|---|---|
| D1 | **bitECS version** | **Migrate `@sl/ecs` 0.3.40-classic → 0.4 new API** (`createWorld`, `addComponent(world, eid, Comp)`, `query(world, [...])`) | Spec/T22 mandate 0.4; the existing package was built on 0.3.x classic (the 2D strided-field code). Only 4 files today — cheapest to migrate now, before `packages/render`/`packages/engine` are written against it. **This contradicts the earlier M0 build choice and must be done first in Phase A.** |
| D2 | **Render backend** | **WebGPU-first + TSL post + WebGL2 fallback (first-class)** | Per spec 01/06, three `^0.185` (`three/webgpu` + `three/tsl`). The lookdev chose WebGL-only GLSL "for demo reliability"; the real engine follows the spec because the Ultra tier and future-proofing depend on WebGPU/TSL. Caveat: the WebGPU path is **not headlessly verifiable here** (SwiftShader is software-GL) — only the WebGL2 fallback is. |

================================================================

## 2. Target package structure (all three are NEW — none exist yet)

| New package | Holds | Key files |
|---|---|---|
| `packages/render` | renderer & GPU subsystems | `Renderer.ts` (WebGPU + WebGL2 fallback), `capabilities.ts` (`detectBackend`), `postFX.ts` (TSL post stack + retro block), `lighting/flashlight.ts`, `syncSystem.ts` (ECS Transform→Object3D), `GLTFLoaderSetup.ts`, `assetCache.ts`, `quarks.ts` |
| `packages/engine` | orchestration | `GameLoop.ts` (fixed-step accumulator), `fsm/gameMachine.ts` (XState), `Game.ts` (composition root) |
| `packages/ui` | React HUD | `HudRoot.tsx` + components, throttled Zustand store |
| `apps/lookdev` *(new, throwaway)* | M-LOOK harness | exterior cinematic + walkable-interior scenes that exercise `packages/render`; discarded on GREEN **except** the package code |

**tsconfig aliases:** `@sl/render`, `@sl/engine`, `@sl/ui`.
**Bootstrap (spec 01):** `apps/client/src/bootstrap.ts` → `detectBackend()` → `RAPIER.init()` + `RecastInit()` → `AudioPack.load()` → `createRenderer()` → `new Game()` → `mountHud()` → `fsm.send(BOOT_DONE)`.

================================================================

## 3. The locked post-processing stack (T28)

TSL graph, in order:

`GTAO → SSR(off) → bloom(emissive-only) → fog(exp2 + optional volumetric cone) → exposure/desaturate → vignette → grain → chromatic aberration → [RETRO REGISTER BLOCK] → SMAA`

**Retro register block** (inserted before AA, all Director-ramped via `PostUniforms`): internal-res crunch + NearestFilter upscale · vertex-snap (`floor(clipXY/grid)*grid`) · posterize (3–6 levels) · ordered Bayer dither (replaces animated grain as the near-black anti-banding tool) · affine warp (subtle, tier-gated) · CRT/scanline (PEAK only, default off).

- **Dropped (photoreal):** SSGI (baked lightmaps carry GI), scene-wide SSR (monster-local wet material only).
- **MRT (T27):** `output / normal / depth / emissive` (no metalness — SSR is gone).
- **Director degradation:** `PostUniforms` bank holds `exposure, saturation, vignetteAmount, caStrength, godrayIntensity, vertexSnapAmount, internalResScale, posterizeLevels, ditherAmount, affineAmount, crtAmount`. BUILD raises grit → PEAK crunches internal-res hard → RELAX snaps clean. **CHORUS is exempt** from vertex-snap/affine (stays solid as the world decays; optionally *sharpens* at PEAK).
- **Lighting (T26/T30):** baked `lightMap` + `aoMap` carry the room; the flashlight `SpotLight` (6.0 / 25° / 18m, PCF Vogel 1024/512, `shadow.autoUpdate=false`) is the **only** realtime shadow caster. Emissive flicker panels (T31) are baked-light-decoupled (TSL `emissiveNode` buzz+dropout).

================================================================

## 4. The sequence — 4 phases + a parallel audio track

Split by M1's real fault line: **art-direction-independent infra** (build now) vs **art-gated content** (blocked on picking 1 of 4 directions + the monster).

### Phase A — Engine infra (art-independent — START NOW, greybox/CC0 placeholder)

| Task | Done when |
|---|---|
| **A0 Scaffold** | `packages/render` + `packages/engine` + `packages/ui` + `apps/lookdev` exist; typecheck passes across the workspace; aliases resolve. |
| **A1 bitECS 0.4 migration** (D1) | `@sl/ecs` components/world/pool/prefabs rewritten to 0.4 API; existing tests green; no 0.3.x classic API left. |
| **T21 GameLoop** | 60Hz fixed accumulator from injected clock; rAF render with alpha; MAX_FRAME_DT clamp after a stall. |
| **T24 Renderer** | async `WebGPURenderer`; forced-WebGL2 path clears at 60fps with no DOMException; `caps.backend` reports `webgpu`/`webgl2`. |
| **T25 DEGRADE** | WebGL2 → no SSR, 512 shadow, DPR 1.0, analytic fog — confirmed in debug HUD. |
| **T22 ECS world** | `createGameWorld()` + cached queries return spawned entities (0.4 API). |
| **T23 Rapier** | host-only enhanced-determinism step at FIXED_DT; KCC capsule vs static collider; two identical-input runs ⇒ identical transforms. |
| **T27 MRT** | GTAO darkens cavities, emissive bloom masks to emissive via real MRT; clean WebGL2 fallback. |
| **T28 PostStack** | locked order assembles + presents; each `PostUniforms` uniform visibly changes the image; bloom affects only emissive. |
| **T29 ECS→Object3D** | corridor GLB+KTX2 loads; ECS Transform drives Object3D every frame at 60fps; both backends render. |
| **T30 Flashlight** | soft shadow at per-tier res; `renderer.info` shows zero shadow re-renders while static; updates on the 3 triggers only. |
| **T31 Flicker** | panels flicker via `emissiveNode` with no realtime relighting cost. |
| **T32 FSM** | XState `gameMachine` transitions fire on events; entering/leaving `inShip` starts/stops the loop. |
| **T33 HUD** | `hudSync` ≤15Hz; React HUD via `useShallow`; React re-renders bounded to slice changes while sim runs 60fps. |

Phase A is ~80% of M1's code and is identical across all 4 art directions. Much of it is **porting the proven lookdev PS1 stack to real TSL/WebGPU**.

### Phase B — Chaos-stress harness (de-risk B3 EARLY, right after T23)

Stand up a Rapier scene with **300+ loose bodies + several ragdolls** in `apps/lookdev`; measure frame time on the user's GPU **before** content work. This is the single highest-risk unproven claim in the whole pivot — a RED reshapes the chaos-density caps, the Ultra upsell, and the GREEN bar. *Not a numbered backlog task; implied by M-LOOK B3.*

### Phase C — Art-gated content (BLOCKED on the art-direction pick + monster)

| Task | Blocked on |
|---|---|
| **T38** 2 trim sheets (hull/greeble) + decal atlas (CC0) | art direction |
| **T39** 8 modular kit meshes + sockets + `_COL` colliders | T38 |
| **T40** Blender `kit_snap` add-on → LevelDoc JSON | T39 |
| **T26** baked-lightmap GLB pipeline (Blender bake Combined+AO → KTX2 → `lightMap`/`aoMap`) | art direction |
| **Monster** bespoke CHORUS (Meshy/Tripo base → heavy Blender) | own make-or-break sub-gate (B2) |

### Phase D — M-LOOK GREEN gate + promote + perf enforcement (= GREEN-LIGHT GATE 2)

Assemble the two M-LOOK scenes (exterior cinematic + walkable interior) with real art; judge the post-pivot bar — **B1** craft/cohesion + mood-over-mesh · **B2** monster reads "one notch grounded" + scares in motion · **B3** 60fps-under-chaos + WebGL2 floor holds. On GREEN: promote `packages/render` into the engine foundation, then:

| Task | Done when |
|---|---|
| **T34** | InstancedMesh dressing + sector/portal occlusion + 3-tier LOD + pools; corridor < 150 draw calls. |
| **T35** | GpuTimer GPU-ms + BudgetMonitor auto-degrade on sustained >12ms + Playwright `?gl=2` smoke (<150 calls, <12ms median over 300 frames). **GREEN-LIGHT GATE 2.** |

### Parallel — Audio (semi-independent, builds on the Audio Forge + `@sl/audio-content`)

- **T43** gen-audio pipeline: prompt-hash cache + ffmpeg opus/mp3 encode + loop-trim at zero-crossing + `manifest.json` + `AudioId` union; second run with no change = 0 API calls.
- **T44** per-zone composition plans + stem-separation mapping (5 tempo/key-locked layers).

================================================================

## 5. Verifiable here vs. needs the user

| Where | What |
|---|---|
| **Headless unit tests (in-sandbox)** | GameLoop accumulator, DEGRADE logic, bitECS 0.4 migration + queries, Rapier two-run determinism, ECS→Object3D sync math, FSM transitions, HUD throttle, the whole audio pipeline. |
| **Headless SwiftShader render (in-sandbox)** | the **WebGL2 fallback** path renders + no-pageerror + screenshots (per `verifying-browser-scenes`). |
| **Needs the user's real GPU / hands** | the **WebGPU path** itself, **B3 perf** (60fps under chaos on a mid laptop), and the **B1/B2 aesthetic judgment** at the GREEN gate. |

================================================================

## 6. Open dependencies (not blocking Phase A/B)

- **Art direction** — 1 of 4 themes (IRON LUNG / ANALOG GHOST / STERILE WOUND / LEVIATHAN BLOOM), rendered low-poly. Blocks Phase C/D. Resolve in parallel via a Gemini M-ART session (concept frames).
- **Monster** — start the AI-base→Blender pipeline early; longest-pole art item + the B2 gate.

================================================================

## 7. Recommended first move

**Phase A0 scaffold + A1 bitECS-0.4 migration + T21 + T24**, then stand up `apps/lookdev` and **port the proven lookdev PS1 stack to TSL** — followed immediately by the **Phase B chaos harness** to settle the 60fps-headroom question before any content work. Front-loads the two real risks (WebGPU/TSL port, perf-under-chaos) and stays art-direction-independent until a direction is picked.
