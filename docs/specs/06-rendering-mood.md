# SIGNAL LOST — M4 Rendering &amp; Horror-Mood Spec (Haunted Corridor Vertical Slice)

> ⚠️ **REGISTER CHANGED (2026-06-27): the game is LOW-POLY / PS1-retro, not photoreal.** Photoreal-specific parts of this doc (SSGI, scene-wide SSR, 4K photoreal kits, Kitbash3D hero ship, the 'looks AAA' bar) are **superseded** — see [LOW-POLY-PIVOT.md](../LOW-POLY-PIVOT.md) for the authoritative reconciliation. The renderer *architecture* still holds; only the target image + heavy-GI reliance change.


SIGNAL LOST — Rendering & Horror-Mood Spec
================================================================

Scope: the M4 "Haunted Corridor" vertical slice only. WebGPU-primary (`three/webgpu` r185+), WebGL2 auto-fallback. Director-drivable TSL post stack, near-black baked-lightmap corridor, <150 draw calls / <12 ms GPU at 60 fps. This is a code-level build spec, not rationale.

API surface verified against Three.js r185 (`three/webgpu`, `three/tsl`): `WebGPURenderer` async `init()` + `forceWebGL`, `PostProcessing` with `outputNode`/`needsUpdate`/`renderAsync()`, `pass(scene,camera)` → `getTextureNode('output'|'depth'|'normal')` + `setMRT(mrt({...}))`, `uniform(v).value`, TSL nodes `bloom() / ao() / ssr() / smaa() / vignette / film / fog`, r185 PCF Vogel-disk shadows + `builtinAOContext`.

----------------------------------------------------------------

## 0. Package & Folder Layout

This spec owns `packages/engine` (rendering) and the render-relevant slices of `packages/audio` (beat bus) and `apps/client` (scene composition). Folders:

```
packages/engine/src/
  render/
    Renderer.ts            # async WebGPURenderer bootstrap + fallback
    Capabilities.ts        # capability detection + degrade matrix
    PostStack.ts           # TSL post-processing graph (the horror stack)
    PostUniforms.ts        # the director-driven uniform bank (single source of truth)
    profiling/
      GpuTimer.ts          # WebGPU timestamp-query GPU timer + WebGL EXT fallback
      BudgetMonitor.ts     # runtime draw-call/triangle/GPU-ms budget assertions
  lighting/
    FlashlightRig.ts       # player SpotLight + shadow config
    EmissivePanels.ts      # TSL noise+time flicker panels
    MuzzleFlash.ts         # pooled point-light pulse
    FlickerBus.ts          # subscribes to audio-director beats, drives light uniforms
    ShadowController.ts    # shadow.autoUpdate=false + needsUpdate orchestration
  vfx/
    Particles.ts           # three.quarks systems (muzzle/sparks/blood/smoke/motes)
    Decals.ts              # blood/scorch decal pool
    VolumetricCone.ts      # flashlight cone volumetric mesh
  scene/
    LevelData.ts           # level metadata schema (lighting/reverb/spawn/fog)
    CorridorScene.ts       # scene graph assembly for the slice
    CameraRig.ts           # first-person local + third-person remote
    InstancePool.ts        # InstancedMesh set-dressing manager
    Lod.ts                 # 3-tier LOD registration
  assets/
    Ktx2.ts                # KTX2Loader + meshopt + draco wiring
    GltfPipeline.ts        # GLB load → static lightmap/aomap apply

apps/client/src/scene/corridor.level.json   # authored level data (schema below)
packages/audio/src/director/BeatBus.ts       # emits {beatId, t, intensity} the render layer subscribes to
```

`pnpm`/Turborepo: `packages/engine` declares `peerDependencies: { three: ">=182" }` and `dependencies: { "three.quarks": "^0.x", "three": "^0.182" }`. `three/webgpu` and `three/tsl` are subpath exports of the `three` package — no separate install.

----------------------------------------------------------------

## 1. Renderer Bootstrap — async WebGPU + WebGL2 fallback + capability detection

### 1.1 Capability detection (`Capabilities.ts`)

Two-stage: a cheap **pre-flight** adapter probe (before constructing the renderer, so the lobby can recommend the strongest host and we can pre-pick a tier), then **post-init** truth (`renderer.backend.isWebGPUBackend`).

```ts
// Capabilities.ts
export type RenderTier = 'webgpu-high' | 'webgpu-mid' | 'webgl2';

export interface RenderCaps {
  hasWebGPU: boolean;
  backend: 'webgpu' | 'webgl2';
  tier: RenderTier;
  maxTextureSize: number;
  maxSamples: number;        // MSAA samples available
  timestampQuery: boolean;   // GPU timer available (WebGPU feature)
  adapterIsFallback: boolean; // navigator.gpu fallback adapter (software) → demote
  deviceMemoryGB: number;    // navigator.deviceMemory (coarse)
}

// Pre-flight: never throws, safe on non-WebGPU browsers (DOMException-safe).
export async function probeWebGPU(): Promise<{
  ok: boolean; isFallback: boolean; timestamp: boolean;
}> {
  if (!('gpu' in navigator) || !navigator.gpu) return { ok: false, isFallback: false, timestamp: false };
  try {
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
    if (!adapter) return { ok: false, isFallback: false, timestamp: false };
    const timestamp = adapter.features.has('timestamp-query');
    // @ts-expect-error isFallbackAdapter is in the spec
    const isFallback = adapter.isFallbackAdapter === true;
    return { ok: true, isFallback, timestamp };
  } catch {
    return { ok: false, isFallback: false, timestamp: false };
  }
}

export function classifyTier(p: Awaited<ReturnType<typeof probeWebGPU>>): RenderTier {
  if (!p.ok || p.isFallback) return 'webgl2';
  // mid vs high decided after init from limits + deviceMemory; default to high, BudgetMonitor demotes.
  return 'webgpu-high';
}
```

Force-fallback override for QA (URL `?gl=2` or env): consumed by the bootstrap so we can verify the WebGL2 path on demand — an M4 acceptance requirement.

### 1.2 Renderer bootstrap (`Renderer.ts`)

```ts
import { WebGPURenderer } from 'three/webgpu';
import { probeWebGPU, classifyTier, RenderCaps } from './Capabilities';

export interface BootResult { renderer: WebGPURenderer; caps: RenderCaps; }

export async function createRenderer(
  canvas: HTMLCanvasElement,
  opts: { forceWebGL?: boolean } = {},
): Promise<BootResult> {
  const probe = await probeWebGPU();
  const forceWebGL = opts.forceWebGL || new URLSearchParams(location.search).get('gl') === '2';

  const renderer = new WebGPURenderer({
    canvas,
    antialias: false,          // AA handled in post (SMAA/TRAA), cheaper + composites correctly
    forceWebGL: forceWebGL || !probe.ok || probe.isFallback,
    powerPreference: 'high-performance',
    // requiredFeatures requested when available; ignored on WebGL2:
    requiredFeatures: probe.timestamp ? ['timestamp-query'] : [],
  } as any);

  // Async init is mandatory for WebGPU device/adapter acquisition.
  await renderer.init();

  // Post-init truth: backend may have downgraded to WebGL2 internally.
  const isWebGPU = (renderer.backend as any)?.isWebGPUBackend === true;
  const tier = isWebGPU ? classifyTier(probe) : 'webgl2';

  const caps: RenderCaps = {
    hasWebGPU: probe.ok,
    backend: isWebGPU ? 'webgpu' : 'webgl2',
    tier,
    maxTextureSize: renderer.getMaxAnisotropy ? 16 : 8, // placeholder; read real limits below
    maxSamples: isWebGPU ? 4 : 4,
    timestampQuery: isWebGPU && probe.timestamp,
    adapterIsFallback: probe.isFallback,
    deviceMemoryGB: (navigator as any).deviceMemory ?? 4,
  };

  renderer.setPixelRatio(Math.min(devicePixelRatio, isWebGPU ? 1.5 : 1.0)); // cap DPR; WebGL2 = 1.0
  renderer.setSize(canvas.clientWidth, canvas.clientHeight, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = /* PCFSoftShadowMap equivalent */ 2;
  renderer.shadowMap.autoUpdate = false;          // §3.4 — we drive shadow updates manually
  renderer.toneMapping = /* set in post stack, see §2 */ 0;

  return { renderer, caps };
}
```

Render loop uses `renderer.setAnimationLoop(frame)`; the actual present is `await postProcessing.renderAsync()` (NOT `renderer.render`) — see §2.4. On WebGPU, `renderAsync` returns a promise that resolves when the frame is submitted; we do not `await` it inside `setAnimationLoop` synchronously — we fire-and-forget and let the next callback gate on `renderer.hasFeature`-style readiness (the engine keeps a `framePending` guard to avoid overlapping submissions).

### 1.3 Degrade matrix (the single table that drives everything)

`PostStack`, `lighting`, and `vfx` all read `caps.tier` and consult this constant:

```ts
// Capabilities.ts
export const DEGRADE = {
  'webgpu-high': {
    ssr: true, ssgi: false /* M5 */, gtao: true, gtaoRes: 1.0,
    volumetricFog: 'raymarch',  // god-rays via cone mesh + raymarch
    fogSteps: 24,
    bloom: true, motionBlur: false /* accessibility toggle */,
    shadowMapSize: 1024, shadowType: 'pcf-soft',
    flashlightShadow: true, panelShadows: false,
    dpr: 1.5, msaa: 4, decals: true, particleBudget: 4096,
  },
  'webgpu-mid': {
    ssr: false, ssgi: false, gtao: true, gtaoRes: 0.5,
    volumetricFog: 'raymarch', fogSteps: 12,
    bloom: true, motionBlur: false,
    shadowMapSize: 1024, shadowType: 'pcf-soft',
    flashlightShadow: true, panelShadows: false,
    dpr: 1.0, msaa: 2, decals: true, particleBudget: 2048,
  },
  'webgl2': {
    ssr: false, ssgi: false, gtao: true, gtaoRes: 0.5,
    volumetricFog: 'analytic', // exp2 height fog only, no raymarch god-rays
    fogSteps: 0,
    bloom: true /* emissive-only, lighter threshold */, motionBlur: false,
    shadowMapSize: 512, shadowType: 'pcf',  // half-res
    flashlightShadow: true, panelShadows: false,
    dpr: 1.0, msaa: 0 /* rely on SMAA post */, decals: true, particleBudget: 1024,
  },
} as const;
```

**WebGL2 drops:** SSR off, SSGI off (off everywhere in M4), volumetric raymarch → analytic exp2 height fog (no god-rays), shadow map 1024→512, GTAO at half res, DPR capped to 1.0, particle budget quartered, MSAA off (SMAA only). GTAO, restrained bloom, vignette, grain, CA, flashlight shadow all **stay on** in WebGL2 — they are the mood-critical, cheap effects.

----------------------------------------------------------------

## 2. Post-Processing Graph (TSL / `PostProcessing`)

### 2.1 Uniform bank (`PostUniforms.ts`) — the Director's control surface

Every director-animatable parameter is a single `uniform()` instance, created once, mutated by reference. The Scare Director never touches the node graph — it only writes `.value`. This is the **entire** public contract between the audio-fear layer and rendering.

```ts
import { uniform } from 'three/tsl';

export const postUniforms = {
  // --- tone / exposure ---
  exposure:        uniform(1.0),    // 0.6 .. 1.4  (Director dims on dread)
  // --- vignette ---
  vignetteAmount:  uniform(0.35),   // 0.0 .. 0.9  (closes in on PEAK / low Resolve)
  vignetteSmooth:  uniform(0.45),   // 0.2 .. 0.8
  // --- chromatic aberration ---
  caStrength:      uniform(0.0015), // 0.0 .. 0.012 (spikes on hit / stinger)
  // --- film grain ---
  grainAmount:     uniform(0.06),   // 0.02 .. 0.25 (rises as Resolve drops)
  grainScale:      uniform(1.0),    // 1.0 .. 3.0
  // --- desaturation ---
  saturation:      uniform(1.0),    // 0.25 .. 1.0  (drains to grey at low Resolve)
  // --- bloom ---
  bloomStrength:   uniform(0.35),   // 0.15 .. 0.8  (emissive-only; never blooms lit walls)
  bloomThreshold:  uniform(0.9),    // 0.8 .. 1.0
  // --- fog / volumetrics (also read by lighting) ---
  fogDensity:      uniform(0.06),   // 0.02 .. 0.18
  godrayIntensity: uniform(0.5),    // 0.0 .. 1.2 (flashlight cone scatter)
  // --- time (driven every frame, not by director) ---
  time:            uniform(0.0),
  // --- motion blur (accessibility toggle; off in M4 default) ---
  motionBlurAmount: uniform(0.0),
};
export type PostUniforms = typeof postUniforms;
```

### 2.2 Scene pass + MRT setup

GTAO and SSR need normals + depth; we request them via MRT on the scene pass so the post graph reads real G-buffer outputs.

```ts
import { pass, mrt, output, normalView, metalness, emissive } from 'three/tsl';

const scenePass = pass(scene, camera);
scenePass.setMRT(mrt({
  output,            // lit color
  normal: normalView,
  emissive,          // for emissive-only bloom mask
}));

const colorNode  = scenePass.getTextureNode('output');
const normalNode = scenePass.getTextureNode('normal');
const depthNode  = scenePass.getTextureNode('depth');     // built-in
const emissiveNode = scenePass.getTextureNode('emissive');
```

### 2.3 The graph (exact order, `PostStack.ts`)

Order is fixed and matches DESIGN §10: **tonemap → GTAO → SSR → bloom → volumetric fog/god-rays → vignette → grain → chromatic aberration → (optional) motion blur**. Tonemapping is applied as the renderer's output tone mapping after the linear effects, but desaturation/exposure are folded in just before vignette so the Director's color grade lands in display space. Concretely:

```ts
import {
  ao, ssr, bloom, smaa, film, vignette,           // post nodes (three/tsl)
  mul, add, mix, vec3, vec2, luminance, clamp,
  uv, sin, cos, fract, dot, length, smoothstep, time as tslTime,
} from 'three/tsl';
import { PostProcessing } from 'three/webgpu';
import { postUniforms as U } from './PostUniforms';
import { DEGRADE } from './Capabilities';

export function buildPostStack(renderer, scene, camera, tier) {
  const D = DEGRADE[tier];
  const post = new PostProcessing(renderer);

  const scenePass = pass(scene, camera);
  scenePass.setMRT(mrt({ output, normal: normalView, emissive }));
  let node = scenePass.getTextureNode('output');
  const normalNode = scenePass.getTextureNode('normal');
  const depthNode  = scenePass.getTextureNode('depth');
  const emissiveNode = scenePass.getTextureNode('emissive');

  // 1) GTAO — multiplied into ambient. (r185 ao() / builtinAOContext)
  //    Range: distance 0.2..0.5m, scale 1.0, thickness 1.0; res via D.gtaoRes.
  const aoNode = ao(depthNode, normalNode, camera);
  aoNode.resolutionScale = D.gtaoRes;     // 1.0 high, 0.5 mid/webgl2
  aoNode.distanceExponent.value = 1.0;
  aoNode.radius.value = 0.35;             // metres
  aoNode.scale.value = 1.1;
  aoNode.thickness.value = 1.0;
  node = mul(node, aoNode.getTextureNode()); // darken cavities; corridors read as deep

  // 2) SSR — WebGPU only; wet-floor / metal reflections of the flashlight.
  if (D.ssr) {
    const ssrNode = ssr(node, depthNode, normalNode, /*metalness*/ scenePass.getTextureNode('metalrough'), camera);
    ssrNode.maxDistance.value = 8.0;
    ssrNode.opacity.value = 0.5;          // restrained; floor sheen, not a mirror
    ssrNode.thickness.value = 0.2;
    node = mix(node, ssrNode, /*reflectivity mask from metalness*/ 0.5);
  }

  // 3) Bloom — EMISSIVE-ONLY. We bloom the emissive MRT, not the full frame,
  //    so lit walls never glow. Threshold high, radius small.
  const bloomNode = bloom(emissiveNode, U.bloomStrength, /*radius*/ 0.4, U.bloomThreshold);
  node = add(node, bloomNode);            // additive over color

  // 4) Volumetric fog / god-rays.
  if (D.volumetricFog === 'raymarch') {
    // Raymarched cone scatter authored in VolumetricCone (§5.3) as a mesh in-scene;
    // here we only apply analytic exp2 *height* fog blend in post for distance haze:
    node = applyHeightFog(node, depthNode, camera, U.fogDensity);
  } else {
    node = applyHeightFog(node, depthNode, camera, U.fogDensity); // WebGL2: analytic only
  }

  // 5) Exposure + desaturation grade (Director color grade lands here).
  node = mul(node, U.exposure);
  const grey = luminance(node);
  node = mix(vec3(grey), node, U.saturation);

  // 6) Vignette — radial darken, Director closes it in.
  node = applyVignette(node, U.vignetteAmount, U.vignetteSmooth);

  // 7) Film grain — animated, scales with low Resolve.
  node = applyGrain(node, U.grainAmount, U.grainScale, U.time);

  // 8) Chromatic aberration — radial RGB split, spikes on hit/stinger.
  node = applyChromaticAberration(scenePass, node, U.caStrength);

  // 9) Optional motion blur (accessibility; off by default in M4).
  //    velocity from TRAA/MRT motion vectors when enabled.

  // 10) Anti-alias last (SMAA — cheap, works on WebGL2).
  node = smaa(node);

  post.outputNode = node;
  post.needsUpdate = true;
  // Tone mapping: renderer.toneMapping = AgXToneMapping (preferred for horror — gentle
  // highlight rolloff, neutral shadows) applied by PostProcessing on output. ACES is the
  // fallback if AgX shadows read too milky in the corridor.
  renderer.toneMapping = /* AgXToneMapping */ 7;
  return { post, scenePass };
}
```

Helper TSL functions (`applyVignette`, `applyGrain`, `applyChromaticAberration`, `applyHeightFog`) are short pure-TSL node functions:

```ts
const applyVignette = (color, amount, smooth) => {
  const d = length(sub(uv(), vec2(0.5)));            // 0 at center .. ~0.707 at corner
  const v = smoothstep(0.8, sub(0.8, smooth), d);    // 1 center → 0 edge
  return mul(color, mix(sub(1.0, amount), 1.0, v));
};

const applyGrain = (color, amount, scale, t) => {
  // hash noise on uv*scale + time; monochrome grain added in luminance-preserving way
  const n = fract(mul(sin(dot(add(mul(uv(), mul(800.0, scale)), t), vec2(12.9898, 78.233))), 43758.5453));
  return add(color, mul(sub(n, 0.5), amount));
};

const applyChromaticAberration = (scenePass, color, strength) => {
  const dir = sub(uv(), vec2(0.5));
  const tex = scenePass.getTextureNode('output');
  const r = tex.sample(add(uv(), mul(dir, strength))).r;
  const b = tex.sample(sub(uv(), mul(dir, strength))).b;
  return vec3(r, color.g, b);
};

const applyHeightFog = (color, depthNode, camera, density) => {
  const viewZ = depthToViewZ(depthNode, camera);     // linearize
  const f = sub(1.0, exp(mul(-1.0, mul(density, mul(viewZ, viewZ))))); // exp2 distance fog
  return mix(color, vec3(0.02, 0.025, 0.03), clamp(f, 0.0, 0.85));     // cold near-black haze
};
```

### 2.4 Per-frame + Director hooks

```ts
// render loop
postUniforms.time.value = clock.elapsedTime;
shadowController.tick();         // §3.4
flickerBus.tick();               // §3.3 / §3.5
post.renderAsync();              // present (do NOT call renderer.render)
```

**Director-animated uniforms by beat** (the Scare Director writes these via `tween(uniform, target, ms)` on the host's *local* render only — these are presentation, not networked state; remote peers each run their own Director-mirror that reacts to the same reliable audio-event ids so the grade stays in sync):

| Beat / trigger | Uniforms animated | Target → over |
|---|---|---|
| BUILD (dread rising) | `vignetteAmount` 0.35→0.55, `saturation` 1.0→0.7, `grainAmount` 0.06→0.12, `fogDensity` 0.06→0.10 | 4–8 s ease-in |
| PEAK / spike trigger | `caStrength` →0.010, `vignetteAmount`→0.7, `exposure`→0.8, `bloomStrength`→0.6 | 150–300 ms snap |
| Player hit | `caStrength` pulse →0.012→back, `vignetteAmount` pulse | 80 ms in / 400 ms out |
| Low Resolve (<30%) | `saturation`→0.3, `grainAmount`→0.22, `vignetteAmount`→0.6 (sustained) | continuous map from Resolve |
| RELAX / safe room | all → baseline | 3 s ease-out |
| Stinger / screech | `caStrength` + `godrayIntensity` flash, synced to `FlickerBus` panel drop | 1 frame attack |

Tweening lives in `packages/audio/src/director/PostBeatDriver.ts` and only ever calls `uniform.value = lerp(...)` — never rebuilds the graph.

----------------------------------------------------------------

## 3. Lighting — Near-Black Corridor

Philosophy: **baked GI + AO carry the room; the realtime budget is the flashlight, 2–4 emissive flicker panels, and the muzzle flash.** Total realtime shadow casters that update per frame: **1** (the local player flashlight). Everything else is baked or shadowless emissive.

### 3.1 Baked lightmap workflow (Blender → GLB → `GltfPipeline.ts`)

1. **In Blender:** corridor + safe-room assembled from the trim-sheet kit. Add a second UV channel `UVMap.001` (non-overlapping lightmap unwrap, 0–1, ~10% margin). Place the *baked* lights (dim cold practicals, the ambient bounce) as area lights. Bake **Combined (diffuse indirect + AO)** to a 2048² float → tonemapped EXR, plus a separate **AO-only** 1024² pass.
2. Export GLB with both UV sets. The lightmap/AO textures are baked into the **KTX2 audio-pack-equivalent** (UASTC for the lightmap to preserve gradients; ETC1S fine for AO).
3. **Apply at load (`GltfPipeline.ts`):** for every static mesh, set `material.lightMap = lightmapTex; material.lightMapIntensity = 1.0; material.aoMap = aoTex; material.aoMapIntensity = 1.0;` and ensure `geometry.attributes.uv1` carries the lightmap UVs (Three reads `uv2`/`uv1` for lightMap/aoMap). Static meshes get `matrixAutoUpdate = false` and `frustumCulled = true`.

```ts
export function applyBakedLighting(gltf, lightmapTex, aoTex) {
  lightmapTex.flipY = false; lightmapTex.channel = 1; // uv1
  aoTex.flipY = false; aoTex.channel = 1;
  gltf.scene.traverse((o) => {
    if (!o.isMesh) return;
    o.matrixAutoUpdate = false; o.updateMatrix();
    const m = o.material;
    m.lightMap = lightmapTex; m.lightMapIntensity = 1.0;
    m.aoMap = aoTex; m.aoMapIntensity = 0.9;
    m.envMapIntensity = 0.15;   // tiny — keep it black
  });
}
```

Ambient floor: a single `Scene.environment` from a near-black HDRI at `envMapIntensity 0.15`, plus a very dim `HemisphereLight(0x0a0e14, 0x000000, 0.04)` so absolute-black normals aren't pure void.

### 3.2 Realtime shadow budget — flashlight SpotLight (`FlashlightRig.ts`)

```ts
import { SpotLight } from 'three/webgpu';

export function makeFlashlight(tier) {
  const D = DEGRADE[tier];
  const light = new SpotLight(0xfff2e0, /*intensity*/ 6.0);
  light.angle = Math.PI / 7;          // ~25° cone
  light.penumbra = 0.35;
  light.decay = 2.0;
  light.distance = 18;                // hard falloff — darkness beyond
  light.castShadow = D.flashlightShadow;
  light.shadow.mapSize.set(D.shadowMapSize, D.shadowMapSize); // 1024 / 512
  light.shadow.camera.near = 0.2;
  light.shadow.camera.far = 18;
  light.shadow.bias = -0.0008;
  light.shadow.normalBias = 0.02;
  light.shadow.focus = 1.0;
  // r185 PCF Vogel-disk soft filtering is automatic for PCFSoftShadowMap.
  return light;
}
```

The flashlight is parented to the first-person camera rig (§6) with a small lag spring so the cone trails head turns (more menacing). Its `castShadow` is the **only** shadow that updates every frame.

### 3.3 Emissive flicker panels (`EmissivePanels.ts`) — TSL noise + time

2–4 panels per corridor. They are **emissive, shadowless** quads (no light cost) whose emissive intensity is driven by a TSL node combining value noise + the audio beat uniform. They read as failing fluorescents and are the primary "the ship is dying" tell.

```ts
import { MeshStandardNodeMaterial } from 'three/webgpu';
import { uniform, mul, add, mix, fract, sin, dot, vec2, vec3, float, step, smoothstep } from 'three/tsl';
import { postUniforms as U } from '../render/PostUniforms';

export const panelFlicker = uniform(1.0); // 0..1, FlickerBus writes this on beats

export function makePanelMaterial(baseColor = 0x9fd0ff) {
  const m = new MeshStandardNodeMaterial({ color: 0x05070a });
  const t = U.time;
  // layered hash noise → nervous fluorescent buzz
  const n1 = fract(mul(sin(mul(t, 23.3)), 91.7));
  const n2 = fract(mul(sin(mul(t, 7.1)), 41.3));
  const buzz = mix(0.6, 1.0, mul(n1, n2));
  // rare blackout dropouts (panel cuts out for a few frames)
  const dropout = step(0.04, fract(mul(sin(mul(t, 0.9)), 13.1)));
  const flick = mul(mul(buzz, dropout), panelFlicker); // panelFlicker = director gate
  m.emissiveNode = mul(vec3(0.62, 0.81, 1.0), mul(flick, float(2.4))); // cold blue-white
  return m;
}
```

The light *contribution* of panels to the room is **baked into the lightmap** (panels were emissive area lights at bake time), so flicker is purely a visual/emissive effect — it doesn't have to relight the scene in realtime. This is the key cheat that makes "flickering lights in a black corridor" free.

### 3.4 `shadow.autoUpdate=false` orchestration (`ShadowController.ts`)

```ts
renderer.shadowMap.autoUpdate = false;
// Force one update when: flashlight moved > epsilon, OR a dynamic shadow caster
// (Stalker/Swarmer) crossed the flashlight frustum, OR muzzle flash fired.
export class ShadowController {
  private last = new Vector3();
  tick() {
    const moved = flashlight.getWorldPosition(_v).distanceToSquared(this.last) > 1e-4;
    const enemyInCone = /* broadphase: any enemy AABB ∩ spotlight frustum */;
    if (moved || enemyInCone || muzzle.firedThisFrame) {
      renderer.shadowMap.needsUpdate = true;
      this.last.copy(_v);
    }
  }
}
```

Effect: when the player stands still looking down a corridor, **zero** shadow re-renders happen — the GPU spends nothing on shadows until something moves through the cone. This is the single biggest realtime lighting saving.

### 3.5 Flicker ↔ audio-director beat sync (`FlickerBus.ts`)

`packages/audio/src/director/BeatBus.ts` emits `{ beatId, t, intensity }` events (the same reliable audio-event ids the Scare Director broadcasts). `FlickerBus` subscribes and writes light uniforms so **light and sound hit the same frame**:

```ts
beatBus.on('stinger', (e) => {
  // panels black out 1 frame BEFORE the screech sample's transient, then snap back
  schedule(e.t - 0.016, () => { panelFlicker.value = 0.0; });
  schedule(e.t + 0.05,  () => { panelFlicker.value = 1.0; });
  schedule(e.t, () => { U.caStrength.value = 0.010; }); // post + light coupled
});
beatBus.on('powerDrop', (e) => tween(flashlight, 'intensity', 6→2, 600)); // objective spike
beatBus.on('relax', () => tween(panelFlicker, 1.0, 1500));
```

Because audio is fully pre-baked and the beat timestamps come from the Director's schedule, the flicker is **frame-accurate to the sample** — no runtime audio analysis. Muzzle flash is fired by the weapon system directly (not the Director) and triggers its own one-frame shadow update.

----------------------------------------------------------------

## 4. Performance Budget Enforcement

Targets (M4 hard gate): **<150 draw calls, <12 ms GPU/frame, 60 fps, 1–2 players, WebGL2 verified.**

### 4.1 Levers

- **InstancedMesh** for all repeated set-dressing (pipes, cables, floor grates, wall greebles, vent covers) and the Swarmer wave — one draw call per instanced type. `InstancePool.ts` allocates a fixed-capacity `InstancedMesh` per kit-piece-type and writes per-instance matrices once at level load (static) or per-frame for swarmers (dynamic, capacity-pooled).
- **3-tier LOD** (`Lod.ts`): each hero/medium asset registered with `THREE.LOD` levels at e.g. 0 m / 8 m / 18 m; tier thresholds tightened on WebGL2.
- **Frustum culling** on (`frustumCulled=true`, default). **Occlusion culling**: WebGPU path uses the renderer's built-in occlusion query support (enabled via `renderer.occlusionQueryCount`-style, scene objects flagged); corridors are linear so a simple **portal/sector visibility** pass (only render the current sector + the one ahead, gated by the door trigger) is the primary occlusion mechanism and works identically on WebGL2.
- **KTX2 textures** (`Ktx2.ts`): `KTX2Loader` + meshopt decoder; UASTC for normals/hero, ETC1S for filler; trim-sheet kit shares 2–4 atlas materials → tiny material count, few state changes.
- **Object pools** (no GC hitch can break a scare): muzzle flashes, decals, particle bursts, blood, audio voices, snapshot buffers all pre-allocated. Zero `new` in the hot loop.

### 4.2 Profiling (`profiling/`)

```ts
// GpuTimer.ts — WebGPU timestamp-query when available, else WebGL EXT_disjoint_timer_query, else CPU est.
export class GpuTimer {
  begin(label: string): void;
  end(label: string): void;
  lastMs(label: string): number;  // rolling 30-frame median
}
```

- WebGPU: use `timestamp-query` feature (requested in §1.2) → write begin/end timestamps around the post `renderAsync`.
- WebGL2: `EXT_disjoint_timer_query_webgl2`.
- Always also track `renderer.info`: `render.calls`, `render.triangles`, `memory.textures`, `memory.geometries`.
- `stats.js`-style overlay in the **netcode debug HUD** (already in M4 scope) shows: fps, GPU ms, draw calls, triangles, texture MB, current render tier.

### 4.3 Budget assertions (CI + runtime)

**Runtime (`BudgetMonitor.ts`)** — checked each frame, drives auto-degrade:

```ts
export class BudgetMonitor {
  tick(info: RendererInfo, gpuMs: number) {
    if (info.render.calls > 150) warnOnce('DRAWCALLS', info.render.calls);
    if (gpuMs > 12 && this.sustained(gpuMs, 12, 90 /*frames*/)) this.demoteTier(); // high→mid→…
    if (info.memory.textures > TEX_MB_CAP) error('TEXMEM');
  }
}
```

Auto-degrade ladder on sustained >12 ms: drop DPR → drop SSR → halve GTAO res → reduce fog steps → reduce particle budget. Logged + surfaced in HUD.

**CI** — `gltf-transform inspect` gate on every level/asset GLB (DESIGN §11):

```jsonc
// budgets.json — asserted in CI
{
  "corridor.glb":   { "maxDrawCalls": 60, "maxTriangles": 350000, "maxTextureMB": 96 },
  "safe-room.glb":  { "maxDrawCalls": 30, "maxTriangles": 150000, "maxTextureMB": 48 },
  "stalker.glb":    { "maxTriangles": 45000, "maxTextureMB": 24 },
  "global":         { "maxDrawCallsRuntime": 150, "maxGpuMs": 12 }
}
```

CI script parses `gltf-transform inspect --format json`, asserts triangle counts and **texture VRAM** (computed from KTX2 dims × format bpp × mip chain — NOT disk size, per DESIGN §11), fails the build on breach. A **runtime smoke test** (Playwright + the WebGL2-forced path `?gl=2`) loads the corridor, spins the camera, and asserts `renderer.info.render.calls < 150` and median GPU ms < 12 over 300 frames.

----------------------------------------------------------------

## 5. VFX (`vfx/`)

### 5.1 three.quarks particle systems (`Particles.ts`)

One `BatchedParticleRenderer` shared by all systems (batches into few draw calls). Pre-instantiated, pooled emitters:

| System | Trigger | Config |
|---|---|---|
| **Muzzle flash** | weapon fire | 6–10 particles, additive, 60 ms life, billboard, bright `0xffd9a0`, paired with `MuzzleFlash` point light |
| **Sparks** | bullet impact on metal | 12 particles, gravity, 200–400 ms, stretched billboard, ricochet velocity along surface normal |
| **Blood** | hit on enemy / dismember | 20–40 particles, dark `0x4a0c0c`, gravity, spawns a blood **decal** on first floor contact |
| **Smoke** | impact / ambient vents | soft alpha, slow rise, low opacity, lit by flashlight only (receives no shadow) |
| **Fog motes** | ambient, per fog zone | GPU-cheap drifting dust in the flashlight cone — additive, very low alpha, density from `U.fogDensity` |

Particle budget read from `DEGRADE[tier].particleBudget` (4096/2048/1024). All emitters allocated at scene load; bursts `emit(n)` from the pool, never construct at runtime.

### 5.2 Decals (`Decals.ts`)

Fixed-capacity decal pool (e.g. 64) using `DecalGeometry` projected onto static hull. Blood (on Swarmer/Stalker death) and scorch (on muzzle/impact). Oldest decal recycled when pool exhausted (FIFO). Decals share one atlas material (1 draw call via instancing where projection allows; otherwise merged geometry rebuilt off the hot path). Off on nothing — kept on WebGL2 (cheap).

### 5.3 Flashlight cone volumetric (`VolumetricCone.ts`)

A cone mesh parented to the flashlight, `MeshBasicNodeMaterial`, additive, depth-write off, rendered after opaque. TSL fragment raymarches (WebGPU `fogSteps` 24/12) or uses a single analytic gradient (WebGL2):

```ts
// god-ray scatter: sample density along view ray inside cone, modulate by fog motes + dust
m.colorNode = mul(
  vec3(0.55, 0.62, 0.75),                    // cold scatter tint
  mul(U.godrayIntensity, coneFalloff(/*radial*/, /*axial*/, fogSteps))
);
m.transparent = true; m.depthWrite = false; m.blending = AdditiveBlending;
```

`godrayIntensity` is a Director uniform (§2.1) — dust catches the beam harder during dread, the beam fattens. On WebGL2, `coneFalloff` collapses to a precomputed radial gradient texture (no raymarch).

----------------------------------------------------------------

## 6. Corridor Scene Composition (`scene/`)

### 6.1 Camera rig (`CameraRig.ts`)

- **Local player: first-person.** `PerspectiveCamera(70, aspect, 0.1, 60)`. Rig = `yawObject(position) → pitchObject → camera`; pointer-lock drives yaw/pitch. Flashlight + view weapon parented to `pitchObject`. View model rendered on a tiny separate near-plane camera layer (no clipping into walls).
- **Remote players: third-person** skinned avatars, interpolated from snapshots (~100 ms render delay), rendered into the same scene; they cast **no realtime shadow** in M4 (baked-only) — only the local flashlight casts.
- **Death/spectator cam:** detached free-look following teammates (downed-player view).

### 6.2 Scene graph

```
Scene (environment = near-black HDRI, envIntensity 0.15)
├─ HemisphereLight (0.04)                         // ambient floor
├─ StaticHull [Group, matrixAutoUpdate=false]
│   ├─ corridor.glb meshes  (lightMap+aoMap applied)
│   └─ safeRoom.glb meshes  (lightMap+aoMap applied)
├─ Instances [Group]
│   ├─ InstancedMesh: pipes / cables / grates / greebles
│   └─ InstancedMesh: swarmer pool (dynamic)
├─ EmissivePanels [4× quads, panelFlicker material]
├─ DynamicLights
│   ├─ Flashlight (SpotLight, castShadow=true) [parented to local rig]
│   └─ MuzzleFlash (PointLight, pooled, off by default)
├─ VolumetricCone [parented to flashlight]
├─ Enemies [Stalker, Swarmers — replicated transforms]
├─ Players [local rig (FP) + remote avatars (TP)]
└─ VFX [BatchedParticleRenderer, DecalPool]
```

### 6.3 Fog / reverb zone authoring

Zones are authored as AABB volumes in level data. On the render side a zone carries `fogDensity` + `fogColor` (blended into `U.fogDensity` as the camera enters, lerped over the zone boundary). On the audio side the **same zone** carries a `reverbImpulse` id (the `ConvolverNode` IR from the audio pack, DESIGN §7) — so a single authored volume drives both the visual haze and the acoustic space. Crossing a zone boundary cross-fades both over ~0.5 s.

### 6.4 Level data schema (`LevelData.ts` + `corridor.level.json`)

Level data is the single authored artifact that carries lighting, reverb, spawn, and fog metadata alongside the GLB references. The renderer, audio engine, and host AI/Director all read from it.

```ts
export interface LevelData {
  id: string;
  geometry: { glb: string; lightmap: string; aoMap: string }[];  // static hull
  sectors: Sector[];          // for portal/occlusion visibility (§4.1)
  zones: Zone[];              // fog + reverb volumes (§6.3)
  panels: PanelDef[];         // emissive flicker panel placements
  spawns: SpawnNode[];        // enemy spawn points (host-only)
  objective: ObjectiveNode;   // the one power/door node that triggers the spike
  reverbDefault: string;      // fallback IR id
}
export interface Sector { id: string; aabb: AABB; portals: { to: string; aabb: AABB }[]; }
export interface Zone {
  id: string; aabb: AABB;
  fogDensity: number; fogColor: [number,number,number];
  reverbImpulse: string;      // audio-pack IR id
}
export interface PanelDef { pos: [number,number,number]; rot: [number,number,number]; color: number; }
export interface SpawnNode { id: string; type: 'stalker'|'swarmer'; pos: [number,number,number]; ventLink?: string; }
export interface ObjectiveNode {
  id: 'power-coupling'; pos: [number,number,number];
  triggersBeat: 'powerDrop';   // → BeatBus (§3.5) → flashlight dim + panel blackout + swarm spawn
}
```

Example slice fragment:

```jsonc
{
  "id": "m4-haunted-corridor",
  "geometry": [{ "glb": "corridor.glb", "lightmap": "corridor_lm.ktx2", "aoMap": "corridor_ao.ktx2" }],
  "sectors": [
    { "id": "airlock", "aabb": {...}, "portals": [{ "to": "corridor", "aabb": {...} }] },
    { "id": "corridor", "aabb": {...}, "portals": [{ "to": "saferoom", "aabb": {...} }] }
  ],
  "zones": [
    { "id": "corridor-fog", "aabb": {...}, "fogDensity": 0.09, "fogColor": [0.02,0.025,0.03], "reverbImpulse": "ir_metal_corridor" }
  ],
  "panels": [
    { "pos": [0,2.6,-4], "rot": [0,0,0], "color": 10545407 },
    { "pos": [0,2.6,-12], "rot": [0,0,0], "color": 10545407 }
  ],
  "spawns": [
    { "id": "stalker-0", "type": "stalker", "pos": [0,0,-30] },
    { "id": "swarm-vent-0", "type": "swarmer", "pos": [3,2.4,-18], "ventLink": "vent-a" }
  ],
  "objective": { "id": "power-coupling", "pos": [0,1,-24], "triggersBeat": "powerDrop" }
}
```

----------------------------------------------------------------

## 7. Integration Notes / Caveats

- **AgX vs ACES:** start AgX (gentler highlight rolloff keeps the corridor moody); keep an `?tone=aces` switch. Tonemap is the renderer's `toneMapping` applied by `PostProcessing` on the final node, so the Director's `exposure`/`saturation` grade is authored in *linear* before it.
- **API drift risk:** SSR/GTAO node constructor signatures are the least stable surface in r185 (`ao()` ergonomics changed across r180→r185, and `ssr()` is example-grade). Pin `three@0.185.x` exactly, wrap each post node behind a thin adapter in `PostStack.ts` so a signature change is a one-file fix, and keep the WebGL2 path (which doesn't use SSR) as the always-working floor.
- **renderAsync overlap guard:** never `await` inside `setAnimationLoop`; keep a `framePending` boolean so a slow GPU submit can't stack frames and tank pacing during a scare.
- **No per-frame React:** all post uniform writes go through `PostUniforms`/Zustand-outside-render; the React HUD never re-renders from render-loop state (DESIGN §8).


## Tasks (toward M4 vertical slice)

- **[M1] Renderer bootstrap: async WebGPURenderer + WebGL2 fallback + capability probe** — _done when:_ createRenderer() returns a live renderer on a WebGPU browser and on a forced-WebGL2 browser (?gl=2). caps.backend correctly reports 'webgpu'/'webgl2'. No DOMException on a non-WebGPU browser. Renders a clear-color frame at 60fps both paths.
- **[M1] Capability detection + DEGRADE matrix wired into all render subsystems** — _done when:_ probeWebGPU()/classifyTier() pick a tier; DEGRADE constant consumed by PostStack, lighting, vfx. Forcing webgl2 verifiably disables SSR, halves shadow map to 512, sets DPR 1.0, switches fog to analytic — confirmed via debug HUD readout. _(deps: Renderer bootstrap)_
- **[M1] PostUniforms bank + PostStack TSL graph in locked order** — _done when:_ PostProcessing.outputNode assembles tonemap→GTAO→SSR(webgpu)→emissive-only bloom→fog→exposure/desat→vignette→grain→CA→SMAA. renderAsync() presents. Each uniform in PostUniforms visibly changes the image when mutated. Bloom affects only emissive panels, not lit walls. _(deps: Capability/DEGRADE matrix)_
- **[M1] MRT scene pass providing normal + emissive + depth to post** — _done when:_ scenePass.setMRT exposes normal/emissive; GTAO and emissive bloom read real G-buffer textures (visible AO darkening in cavities, bloom masked to emissive). Falls back cleanly on WebGL2. _(deps: PostStack graph)_
- **[M1] Baked-lightmap GLB pipeline (Blender bake → KTX2 → lightMap/aoMap apply)** — _done when:_ corridor.glb loads with uv1 lightmap; applyBakedLighting sets lightMap+aoMap; corridor renders near-black with baked GI/AO and zero realtime room lights. Texture VRAM under CI cap. _(deps: Renderer bootstrap)_
- **[M1] Flashlight SpotLight rig with shadow config + shadow.autoUpdate=false controller** — _done when:_ Single SpotLight parented to FP rig casts a soft (PCF Vogel) shadow at 1024/512 per tier. ShadowController only forces needsUpdate when flashlight moves, an enemy enters the cone, or muzzle fires — verified by renderer.info showing zero shadow re-renders while static. _(deps: Baked-lightmap pipeline)_
- **[M1] Emissive flicker panels (TSL noise+time) baked-light-decoupled** — _done when:_ 2-4 panels flicker via TSL emissiveNode (buzz+dropout) gated by panelFlicker uniform; their steady illumination is in the lightmap so flicker costs no realtime relighting. Reads as failing fluorescents. _(deps: Baked-lightmap pipeline)_
- **[M3] FlickerBus: light + post uniforms synced to audio-director beats** — _done when:_ BeatBus 'stinger'/'powerDrop'/'relax' events drive panelFlicker, flashlight.intensity, and post CA frame-accurately to the pre-baked sample timestamps. Power-drop objective dims flashlight + blacks panels on the same frame as the screech. _(deps: Emissive panels, PostUniforms, BeatBus)_
- **[M3] PostBeatDriver: Director-animated grade per beat (tween uniforms only)** — _done when:_ BUILD/PEAK/hit/low-Resolve/RELAX beats tween the documented uniform targets over the documented durations via uniform.value writes only (graph never rebuilt). Grade visibly tracks the tension curve in a scripted playthrough. _(deps: PostUniforms, FlickerBus)_
- **[M2] VFX: three.quarks pooled systems + decal pool + volumetric flashlight cone** — _done when:_ Muzzle flash, sparks, blood, smoke, fog motes fire from pre-allocated pools (no runtime new). Blood spawns floor decals (FIFO pool). Flashlight cone volumetric raymarches on WebGPU, analytic gradient on WebGL2, modulated by godrayIntensity. _(deps: Flashlight rig, Capability matrix)_
- **[M1] Performance enforcement: InstancedMesh set-dressing, sector occlusion, 3-tier LOD, pools** — _done when:_ All repeated set-dressing + swarm via InstancedMesh; portal/sector culling renders only current+next sector; LOD swaps at thresholds. Corridor holds <150 draw calls. _(deps: Baked-lightmap pipeline)_
- **[M1] Profiling + runtime BudgetMonitor + CI budget assertions** — _done when:_ GpuTimer reports GPU ms (timestamp-query/EXT/CPU est). Debug HUD shows fps/GPU ms/draw calls/tris/tex MB/tier. BudgetMonitor auto-degrades on sustained >12ms. CI gltf-transform job fails on triangle/texture-VRAM breach. Playwright ?gl=2 smoke test asserts <150 calls and <12ms median over 300 frames. _(deps: PostStack, Instancing/LOD)_
- **[M4] Corridor scene composition: FP/TP camera rig, scene graph, fog/reverb zones, level data schema** — _done when:_ corridor.level.json loads via LevelData; FP local rig + TP remote avatars render in one scene; fog+reverb zones cross-fade on boundary crossing; objective node triggers powerDrop beat. Full slice runs 5-8 min at 60fps on a mid laptop, WebGL2 fallback verified. _(deps: All M1-M3 render tasks)_

