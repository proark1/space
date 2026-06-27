# M-LOOK — Visual Quality Proof (the new first milestone)

> ⚠️ **REGISTER CHANGED (2026-06-27): the game is LOW-POLY / PS1-retro, not photoreal.** Photoreal-specific parts of this doc (SSGI, scene-wide SSR, 4K photoreal kits, Kitbash3D hero ship, the 'looks AAA' bar) are **superseded** — see [LOW-POLY-PIVOT.md](LOW-POLY-PIVOT.md) for the authoritative reconciliation. The renderer *architecture* still holds; only the target image + heavy-GI reliance change.


_The fastest credible path to seeing whether browser 3D is AAA-good-enough: the ship from outside + one walkable interior section. Renderer + post + assets only — zero netcode/ECS/AI/audio-engine._

## M-LOOK — Visual Quality Proof (the new milestone BEFORE everything)

**One-line:** the smallest, fastest build that lets the user SEE two captures at target fidelity — (A) the derelict capital ship from the OUTSIDE, and (B) one WALKABLE interior corridor section — purely to judge whether browser 3D is good enough to commit. It is a look-dev / quality-bar GATE, not the game. It exercises ONLY the renderer + post + asset pipeline. It deliberately contains **zero netcode, zero ECS, zero Rapier, zero AI/Director, zero audio engine** (placeholder OGGs only).

This is inserted as **M-LOOK, before the current M0 (Netcode)**. It does not replace M0/M1 — it de-risks the single biggest "is this even worth building" question (visual ambition) cheaply, before the expensive netcode-first work. The real renderer foundation (Renderer bootstrap, DEGRADE matrix, PostStack, baked-lightmap pipeline) is pulled FORWARD out of M1 and proven here on throwaway-friendly scenes; M1 then promotes that same code to production discipline (CI budgets, instancing, profiling, MRT G-buffer) rather than starting cold.

### What's in it — ONE throwaway app `apps/lookdev` (Vite + TS, lil-gui/tweakpane debug panel, NO React HUD), two scenes:

**Scene A — Exterior hero shot (non-interactive cinematic, ~20–30s loop):**
- Space HDRI (mostly-dark, soft nebula) as `scene.environment` (IBL) AND background, via `PMREMGenerator`.
- Earth backdrop: one textured sphere (8k NASA Blue Marble + night-lights emissive + cloud + atmosphere fresnel shell), far, bottom-third of frame — the scale anchor + launch fiction.
- Distant warm sun: one `DirectionalLight` key + small emissive sun disc to motivate the flare. One dim rim directional from behind to separate the silhouette from black space.
- Hero derelict capital ship GLB (PBR hull, emissive window-grid + engine masks, derelict grime/scorch, a few dead/flickering light sections, subtle nebula-tinted distance fog for scale).
- Tiny capsule pod in foreground (scale cue, parallax).
- Scripted camera dolly (lerp/spline of 2–3 keyframes, ease-in-out, tiny perlin handheld noise) approaching a lit docking bay, ending framed on the bay mouth (sets up Scene B).

**Scene B — Walkable interior corridor (first-person, ~60–90s walkthrough):**
- L-shaped corridor (~25m, 2 straights + 1 corner) opening into one small room (med-bay/junction) with a hero story prop (slumped corpse or sparking severed conduit).
- Built from 6–10 modular kit pieces (Quaternius MegaKit, CC0).
- Lighting = **baked lightmap (Blender Cycles → uv1 lightMap/aoMap)** + ONE realtime shadow-casting light: the flashlight `SpotLight` parented to camera (tight cone, soft penumbra, cookie/projection map, 1024 PCF shadow), with a volumetric beam in fog.
- 4–6 emissive panels, 2 flickering (TSL noise+time), bloom only on hotspots.
- Wet/metal floor with SSR; GTAO darkening corners; low cyan-tinted scene fog.
- Trim-sheet PBR materials (Poly Haven/ambientCG) + detail normal/roughness so surfaces hold up with the flashlight pressed to the wall; 6–10 storytelling decals (blood/scorch/grime/labels).
- First-person rig: pointer-lock mouse-look + WASD, kinematic capsule vs hand-placed AABB walls (NO Rapier), headbob + breathing sway, flashlight spring-lag.
- Two atmosphere beats: mid-corridor panel flicker+buzz, distant positional audio cue (2–3 placeholder OGGs through `PositionalAudio`) drawing the player toward the room.

### What's FAKED/STATIC vs REAL
- **REAL (the things we are actually proving):** Three.js r185 `WebGPURenderer` (three/webgpu), WebGL2 auto-fallback, the full TSL `RenderPipeline` post stack in locked order (tonemap/AgX → GTAO → SSR → emissive-only bloom → volumetric fog/god-rays → vignette → grain → CA → SMAA), MRT G-buffer (normal/emissive/depth), baked-lightmap GLB pipeline + KTX2/meshopt via gltf-transform, IBL/PMREM, real flashlight shadow + volumetric beam, hero ship + corridor materials at shipping budgets, the DEGRADE matrix proving the WebGL2 fallback still looks good.
- **FAKED/STATIC (deliberately):** camera move is a hardcoded scripted lerp/spline (no gameplay camera), no networked state, geometry/lights/collision are hardcoded (no ECS, no LevelDoc loader yet, no Rapier — a tiny custom collide-and-slide), no AI/Director (the flicker beat is a hardcoded timer, not BeatBus), audio is placeholder OGGs not the ElevenLabs/Web Audio engine, the ship "drift" and any enemy are absent. Earth/sun/capsule are pure set-dressing meshes.

### Tech it exercises (and explicitly does NOT)
- Exercises: renderer bootstrap + capability probe, DEGRADE matrix, PostStack TSL graph, PostUniforms bank (live-tunable via debug GUI), MRT scene pass, baked-lightmap apply, flashlight rig + ShadowController (autoUpdate=false), emissive flicker panels, volumetric cone, KTX2/meshopt asset pipeline, AgX tonemapping, the look itself (cold desaturated horror grade).
- Does NOT exercise: netcode/PeerLink/signaling/TURN, snapshot codec, bitECS, Rapier, AI/sensing/Director, the audio bus graph/scheduler, host migration, room codes, the React HUD. (These are all M0+ and must stay out so M-LOOK ships fast.)

### How it slots before netcode/gameplay
M-LOOK is a **standalone gate that answers one question — "does it look AAA?" — with a thumbs-up/down decision** before any netcode capital is spent. On GREEN, its renderer code (Renderer.ts, Capabilities.ts/DEGRADE, PostStack.ts, PostUniforms.ts, the KTX2/lightmap loaders) is promoted into `packages/engine` and becomes the M1 foundation, so M-LOOK is NOT throwaway in the parts that matter — only the `apps/lookdev` harness, hardcoded camera/collision, and placeholder audio are discarded. On RED, we replan the visual ambition before sinking months into multiplayer.

### Build order (realistic, ~2.5–3 weeks for both shots; the two tracks run in parallel where art allows)

**Day 0–1 — Foundation (shared by both scenes):**
1. Scaffold `apps/lookdev` (Vite + TS, tweakpane). Boot async `WebGPURenderer` + WebGL2 fallback + capability probe + `?gl=2` force. Clear-color frame 60fps both paths.
2. Stand up the KTX2/meshopt GLTF loader and a gltf-transform CLI step (KTX2 + meshopt) so every asset goes through the real pipeline from day one.

**Day 1–6 — EXTERIOR (Scene A) [art-gated on the hero ship]:**
3. (Day 0, in parallel) ACQUIRE + kitbash the hero derelict capital ship — this is THE gate. Stand up the bare scene meanwhile: HDRI env+background via PMREM, Earth sphere, sun + rim light, OrbitControls for framing.
4. Drop in ship GLB, scale it, place capsule for the size jump, basic key+rim+IBL reading.
5. Materials pass: emissive window/engine masks, derelict grime, detail-normal greebles, nebula distance fog.
6. Post stack: bloom (thresholded, emissive-only) → volumetrics/god-rays → AgX → lens dirt/flare → vignette/grain/CA → cold grade. **This is where it goes from "good 3D" to "AAA."**
7. Scripted camera dolly + handheld noise; perf pass; capture the hero frame + screen-record clip.

**Day 1–12 — INTERIOR (Scene B), two-track to de-risk fast:**
8. (Day 1–2) Pointer-lock FP walk + collide-and-slide, drop in Quaternius corridor pieces (CC0), Poly Haven trim textures. Grey-but-correct.
9. (Day 3–4) Flashlight spot + cookie + shadow + headbob; scene fog; AgX + vignette + grain. **Should already look moody.**
10. (Day 5–6) Bake lightmap in Blender, wire lightMap/aoMap; emissive panels + TSL flicker; thresholded bloom.
11. (Day 7–8) GTAO + SSR wet floor + volumetric beam.
12. (Day 9–10) Decals, hero corpse/conduit prop, the two atmosphere beats + placeholder positional audio, debug-GUI polish.
13. (Day 11–12, OPTIONAL Track B) swap corridor base for a higher-fidelity mesh only if the kit reads "gamey"; re-bake; capture the interior hero frame.

**Day ~12–15 — Decision gate:** both hero captures (one exterior frame/clip + one interior frame) produced cold, reviewed against the M-LOOK acceptance bar, GREEN/RED decision recorded. On GREEN, promote the renderer code into `packages/engine` for M1.


---

## Combined asset shopping list

| Item | Recommended source | License |
|---|---|---|
| Hero derelict capital ship (exterior, the make-or-break asset) | Kitbash3D 'Spaceships: Legacy' / 'Spaceships Armada' kit (kitbash3d.com) — PERPETUAL license; export FBX/OBJ, kitbash a derelict capital ship in Blender, bake to GLB + KTX2. Backup if you find a strong single ship: Fab.com (Standard/Professional license). | Kitbash3D Perpetual license — commercial + browser distribution OK once kitbashed/baked to your own GLB. Verify the per-kit EULA permits redistribution in a real-time/web build (it does under Perpetual). Avoid raw Sketchfab grabs. |
| Modular sci-fi corridor/interior kit (interior walkable base geometry) | Quaternius 'Modular Sci-Fi MegaKit' (quaternius.com) — 270+ grid-snapping GLB pieces. This is the Track-A base. | CC0 — zero legal risk, commercial + browser distribution fully OK. Safest possible choice. |
| Higher-fidelity hero corridor mesh (OPTIONAL Track-B interior upgrade, only if kit reads gamey) | Sketchfab Store paid GLB, e.g. 'Modular Sci-Fi Corridors and Hallways' (Azure Moon Games) — ships GLB + 2K–4K PBR. Buy ONE only after Track-A proves the pipeline. | Per-item Sketchfab Store EULA — MUST verify it permits embedding/redistribution in a shipped real-time build before purchase. Not all do. |
| Space starfield/nebula HDRI (exterior background + IBL reflections) | Poly Haven space/dark HDRIs (polyhaven.com/hdris); backup Spacespheremaps (spacespheremaps.com). Pick mostly-dark with soft nebula glow. | Poly Haven = CC0 (no attribution, commercial + redistribution OK). Spacespheremaps = free for commercial use (verify terms per map). |
| Earth backdrop (scale anchor + launch fiction) | NASA Visible Earth / Blue Marble (visibleearth.nasa.gov) — 8k day + night-lights + clouds + normal/specular. | Public domain (NASA) — fully clear for commercial + browser distribution. Trivial to integrate. |
| PBR trim sheets + grime/metal/decal textures (interior surfaces + storytelling decals) | Poly Haven (polyhaven.com) for trim/metal + ambientCG (ambientcg.com) for grime/blood/scorch/hazard decal bases. | Both CC0 — commercial + browser distribution + redistribution OK, no attribution required. File LICENSES.md rows per source as a habit. |
| Capsule/approaching pod (exterior scale cue) + lens-dirt/flare textures | Capsule: Quaternius or a Fab simple pod GLB, or model a primitive in Blender in 5 min. Lens dirt/flare: ambientCG/Poly Haven utility textures or author in Photoshop. | Quaternius CC0 / ambientCG CC0 / self-authored — all clear. Cheap, high scale-cue payoff. |
| Cinematic mood-target kit (OFFLINE concept renders only — NEVER shipped in the browser GLB) | Kitbash3D 'Sci-Fi Industrial' for art-direction targets to render in Blender and aim toward. | Kitbash3D Perpetual — but use ONLY for offline mood boards/concept renders, do NOT embed in the shipped browser build. |

## Acceptance bar — "is it good enough?"

- [ ] GUT REACTION: a first-time viewer shown either capture cold says 'that looks like a real game / AAA', not 'that's a nice three.js demo.' Both captures are produced and reviewed cold.
- [ ] EXTERIOR SCALE: the ship unmistakably reads as km-scale — the foreground capsule and tiny hull running-lights give a clear size jump; greeble/panel density holds up as the camera pushes in close; distance fog/parallax reinforce length.
- [ ] EMISSIVE DISCIPLINE: emissive window grid + engine glow bloom tastefully — ONLY emissives bloom, the hull/lit walls never glow. No blown-out amateur bloom in either scene.
- [ ] HORROR TONE: cold desaturated grade, crushed-but-not-muddy blacks, a few dead/flickering light sections, visible damage/scorch, deep moody shadow side. Earth + sun are in frame and sell scale/launch fiction without stealing focus.
- [ ] TONEMAP/BANDING: AgX (ACES as toggle/fallback) with clean highlight rolloff; no banding in the dark nebula/black-space gradients or the near-black corridor (animated film grain/dither present).
- [ ] INTERIOR WALKABLE: pointer-lock + WASD walk the full L-corridor into the room in first person; the corridor is genuinely near-black with the flashlight as the dominant source, casting a real MOVING shadow with a soft cookie cone and a volumetric beam visible in the fog.
- [ ] INTERIOR DETAIL: at least 2 emissive panels flicker convincingly (broken-fluorescent stutter); the wet/metal floor shows SSR (flashlight beam + panels smear into the reflection); GTAO visibly darkens corners; surfaces hold up with the flashlight pressed to a wall (detail normal/roughness, no stretching or low-poly silhouette).
- [ ] LIVED-IN: at least 6 decals (blood/scorch/grime/labels) + one story prop (corpse/severed conduit) make the space read as a derelict, not an empty kit. The two atmosphere beats fire (mid-corridor flicker+buzz, distant positional audio cue).
- [ ] PERFORMANCE: locked 60fps on a desktop/mid-range discrete GPU under WebGPU for BOTH scenes; a working WebGL2 fallback (forced via ?gl=2) still looks good with post degrading gracefully per the DEGRADE matrix.
- [ ] LICENSE-CLEAN: every asset in both scenes has a documented, commercial-safe, browser-distribution-OK license (CC0 / public-domain / Kitbash3D-Perpetual-kitbashed / per-item-verified) — no CC-BY redistribution trap, no unlicensed Sketchfab grab. A LICENSES.md records each source.
- [ ] DEBUG GUI: a live debug panel (tweakpane/lil-gui) lets the user dial exposure, bloom, fog density, and flashlight intensity to find the look during review.
- [ ] PROMOTABILITY: the renderer/post/asset-pipeline code is structured so it can be lifted into packages/engine for M1 without a rewrite (PostUniforms bank, DEGRADE matrix, KTX2/lightmap loaders are real, not hacks).

## M-LOOK risks

- HERO SHIP ASSET IS THE GATE: the entire exterior shot's credibility rests on one kitbashed derelict capital ship. If acquisition/kitbash slips, Scene A slips. MITIGATION: start asset acquisition on Day 0 in parallel with engine boot; have the Quaternius/CC0 blockout ready to prove the PIPELINE while the real hero is licensed/kitbashed; treat a strong single Fab GLB as the fast backup.
- r185 WebGPU post-node API maturity: SSR/GTAO/volumetric/bloom node signatures are the least stable surface (changed across r180→r185, ssr() is example-grade). A signature change could stall the look. MITIGATION: pin three@0.185.x exactly, base each effect on the official r185 WebGPU example, wrap each post node behind a thin one-file adapter, and keep the WebGL2 path (no SSR) as the always-working floor.
- WebGL2 fallback losing the mood: if the degraded path (no SSR, analytic fog, 512 shadow) reads notably worse, the 'looks good everywhere' acceptance criterion fails. MITIGATION: lean on baked lightmaps + dark + grain + flashlight (all cheap and cross-backend); tune the DEGRADE matrix so only seasoning (god-rays/SSR) drops, not the core look; capture a ?gl=2 frame in review.
- Bloom/grade overshoot ('amateur tell'): overdone bloom or a muddy AgX shadow is the #1 thing that makes browser 3D look like a demo. MITIGATION: emissive-ONLY thresholded bloom (bloom the emissive MRT, not the frame), live debug-GUI tuning during review, AgX-with-ACES-toggle to dodge milky shadows.
- Baked-lightmap pipeline friction: the Blender bake → uv1 → KTX2 → lightMap/aoMap round-trip (correct UV channel, flipY, KTX2 UASTC for gradients) is fiddly and is the single biggest interior quality lever; a botched bake reads flat. MITIGATION: prove the bake on the simplest corridor segment first (Day 5), validate uv1/channel wiring before dressing the whole scene.
- Scope creep turning a quality PROOF into a level: temptation to add gameplay, more rooms, real audio, or netcode into apps/lookdev. That defeats the 'fastest credible path to wow' purpose and delays the decision. MITIGATION: hard-fence M-LOOK to the two scenes + debug GUI; everything else is explicitly M0+; placeholder OGGs only; hardcoded camera/collision.
- Scale illusion failing on the exterior: if greeble density, the capsule cue, or distance fog are weak, the ship reads 'toy' not 'km-scale' — a primary acceptance failure. MITIGATION: stack ALL the cues (capsule + running-lights + greeble panel-density + nebula distance fog + foreground occlusion + slow long camera travel + emissive window grid); a too-clean hull is the trap, so favor the kitbash-grade greebled asset over a clean single mesh.
- Promotability assumption: M-LOOK is sold as 'renderer code promotes into packages/engine for M1.' If the lookdev harness is built too hacky (gameplay state in closures, no PostUniforms bank, hardcoded tiers), that promise breaks and M1 restarts. MITIGATION: build PostUniforms bank, DEGRADE matrix, and KTX2/lightmap loaders as real reusable modules from the start, even inside the throwaway app.


---

## Exterior look-dev detail (hero shot #1)

## Goal & framing

One self-contained "look-dev" scene whose only job is to make the user say "this looks AAA in a browser." It is a **non-interactive cinematic**: a slow camera move as the tiny capsule drifts toward a massive derelict capital ship, Earth + distant sun in frame. No gameplay, no netcode, no ECS — just Three.js r185 `WebGPURenderer`, one hero GLB, an HDRI, and a tuned post stack. Target: **looks finished in ~1 week of focused look-dev** once the hero asset is in hand.

The single biggest lever on perceived quality is **the hero ship asset + the post/tonemap stack**, not clever code. So the plan front-loads asset acquisition and spends the rest of the time on lighting and post.

## The smallest scene that proves it

A `<canvas>`, one async loader, one `requestAnimationFrame` loop. Contents:

1. **Environment** — equirectangular space HDRI as `scene.environment` (IBL) AND as background. This single asset gives you free reflections on the hull and the starfield/nebula backdrop in one move. Drop in via `PMREMGenerator` (works under WebGPU). Pick a HDRI that is *mostly dark* with a soft nebula glow so the ship reads as the bright hero, not the background.
2. **Earth backdrop** — a single textured sphere (8k NASA Blue Marble + night-lights emissive + cloud layer + atmosphere fresnel shell). Earth is the scale anchor and the launch fiction. Keep it **far and partially in frame** (bottom third), heavily so the ship dominates.
3. **Distant sun** — a `DirectionalLight` as the single strong key, plus a small emissive sun disc/sprite far away to motivate the lens flare. Color it slightly warm (~5600–6500K).
4. **The hero ship** — the GLB (see asset options). PBR hull, emissive window/engine masks, derelict damage.
5. **The capsule** — a tiny low-poly pod (can be a kitbash primitive or a free GLB). Its only purpose is **scale**: a 3-meter pod next to a 1.5km ship sells the Star-Wars opening-shot feeling. Put it close to camera in the foreground so the eye gets the size jump.
6. **Camera** — a single scripted dolly: capsule POV / over-the-shoulder, slow translation toward a docking bay, slight parallax. ~20–30s loop. This is what makes a static scene feel cinematic.

That's the whole scene graph. Everything else is lighting and post.

## Conveying capital-ship SCALE (the make-or-break)

Scale is an *illusion built from cues*, stack several:
- **Relative-size cue**: the tiny capsule + a couple of even-tinier running lights/antennae on the hull. The brain reads scale from the smallest recognizable detail.
- **Greebles / panel density**: the hull must have small repeated detail (panel lines, pipes, sensor arrays, hangar doors). Surface that is *too clean* reads as small/toy. This is exactly why a Kitbash3D-grade asset wins — the greebles are already there. If using a single solid mesh, add a **tiling sci-fi panel detail-normal map** over the hull to fake greeble density cheaply.
- **Atmospheric/depth perspective**: a subtle exponential **distance fog tinted to the nebula color** so the far end of the ship desaturates and loses contrast. Even in vacuum this "haze" cue massively amplifies perceived length. Keep it very subtle (vacuum, not soup).
- **Foreground occlusion**: let a piece of the ship (a fin, a strut) pass close to camera and clip the frame edge. Near/far contrast = size.
- **Slow camera + long travel**: the camera taking a long time to traverse the hull tells the viewer it's huge. Parallax between the foreground capsule and the distant hull reinforces it.
- **Emissive windows as a grid**: hundreds of tiny lit windows is an instant scale and "this is inhabited/was inhabited" cue. Drive from an emissive texture mask; flicker a few for the derelict feel.

## Materials — hull, derelict, emissive

- **PBR metal/rough** hull via `MeshStandardNodeMaterial` (or physical for clearcoat on painted panels). Albedo + metalness + roughness + normal + AO. Roughness variation is what makes metal read as real — break it up with a tiling grime/roughness-detail map.
- **Emissive masks**: separate emissive map for (a) window grid, (b) engine bells, (c) warning strips. Engines = saturated cool/teal or warm orange glow, pushed above 1.0 so bloom catches them.
- **Derelict/damage**: dark scorch + rust decals via the albedo/roughness maps, a few hull breaches (geometry holes or just dark emissive-off patches), one or two **flickering/dead** light sections, sparks (small additive particle bursts). Tint the whole thing slightly desaturated and cold for the horror tone; reserve warm only for the few alive emissives.
- Use **AgX** tonemapping (better highlight rolloff for bright emissives against black space than ACES; ACES is the fallback if AgX clips the nebula oddly). r185 supports AgX neutral in the node pipeline.

## Lighting + post for "wow"

Single strong key + rim + emissive is the whole recipe; restraint is everything:
- **Key**: one `DirectionalLight` (sun), warm, casting the dominant shadows across the hull greebles (shadows are what make greebles read). Soft PCF/contact shadows.
- **Fill**: the HDRI environment IBL is the fill — near-black so the shadow side goes deep and moody (horror), with just a faint nebula bounce.
- **Rim**: a second dim directional from behind/opposite to separate the silhouette from the black background. This single rim light is disproportionately responsible for the "cinematic" read.
- **Post stack (TSL `RenderPipeline` / node post in r185, automatic WebGL2 fallback)**, in order:
  1. **Bloom** — *restrained*, thresholded so only emissives/sun bloom, not the whole hull. Overdone bloom is the #1 amateur tell. r185 specifically improved WebGPU bloom + anamorphic.
  2. **Subtle volumetric / god rays** — light shafts from the sun grazing the hull and through a hull breach. Use the official Three.js WebGPU volumetric-lighting example as the base (post-process pass, native lights/shadows). Keep density low — it's seasoning.
  3. **AgX tonemapping** (handled in the pipeline output node; no manual OutputPass needed in r185).
  4. **Lens dirt + tasteful flare** — a lens-dirt texture multiplied into bloom + an anamorphic streak on the sun. Subtle. This is the "expensive camera" cue.
  5. **Vignette + slight chromatic aberration at edges + film grain** — tie it together, hide banding. Grain also helps the horror mood.
  6. Optional **DOF** — slight focus on the ship, foreground capsule slightly soft, to fake a large sensor / cinematic lens.
- **Color grade** last: cold shadows, slightly green/teal midtones (Alien/horror), crushed blacks.

## Camera move

One scripted spline (or lerp of two keyframes) over ~20–30s, ease-in-out. Capsule-approach: start wide showing Earth + full ship silhouette, push slowly toward a lit docking bay, end framed on the bay mouth (sets up the future interior shot). A touch of handheld noise (tiny perlin on rotation) sells "this is a real capsule, not a tripod." Loop or hold on the final frame.

## Build order (fastest credible path)

1. **Day 0–1**: Acquire the hero ship asset (the gate — see options). In parallel, stand up the bare WebGPU scene: renderer, HDRI env+background, Earth sphere, sun light, OrbitControls for framing.
2. **Day 1–2**: Drop in ship GLB, scale it, place capsule for size, get the basic key+rim+IBL lighting reading.
3. **Day 2–4**: Materials pass — emissive window/engine masks, derelict grime, detail-normal greebles, fog.
4. **Day 4–6**: Post stack — bloom → volumetrics → AgX → lens dirt/flare → grade. This is where it goes from "good 3D" to "AAA."
5. **Day 6–7**: Camera move, perf pass (see budgets), capture the hero frame + a screen-record clip for the user to judge.

## Browser perf budgets (desktop, WebGPU)

- Hero ship: **target ~150k–500k tris** after decimation; up to ~1M is fine for one hero object on desktop WebGPU but decimate distant detail. Use **Draco/Meshopt** compression on the GLB.
- Textures: hull set at **2k–4k**, KTX2/Basis compressed; Earth 8k is fine as one sphere. Total VRAM budget for the look-dev scene comfortably under ~1.5GB.
- One hero object + Earth + a few lights + post is trivial for WebGPU at 60fps on a desktop GPU; the cost is almost entirely post (volumetrics) and shadow res — both tunable.

### Exterior asset options

| What | Source | License | Quality | Verdict |
|---|---|---|---|---|
| Hero derelict capital ship (the make-or-break asset) — kitbash-grade greebled hull | Kitbash3D — 'Spaceships: Legacy' / 'Spaceships Armada' kits (kitbash3d.com/collections/sci-fi). Buy the PERPETUAL license. Export FBX/OBJ from the kit, kitbash a derelict capital ship in Blender (combine hull + greeble pieces), bake/convert to GLB + KTX2. | Kitbash3D Perpetual or Subscription license both permit commercial use in games/films incl. revenue-generating products; tiered by company size (indie/sole-prop, <=50 employees, 51+ custom). It is a license to USE the assets in a built product — the standard concern is not redistributing the raw kit files as standalone assets, which a compiled/packed game GLB does not do. SAFE for a commercial browser build provided you ship a processed/packed mesh, not the original kit source. Confirm exact terms for a web build with their licensing page before purchase. | Highest realistic ceiling for speed. Film/AAA-game grade greebles and panel detail already modeled — exactly the scale-selling detail you cannot fake quickly. This is what makes browser output look AAA. | recommended — best quality-vs-speed-vs-license balance; the single asset that most determines whether the shot lands. |
| Hero ship (alternative / backup) — ready-made single capital/derelict ship GLB | Fab (fab.com, Epic's unified marketplace, successor to Unreal Marketplace + Sketchfab Store + Quixel). Search sci-fi capital/derelict ship; filter for GLB/FBX with PBR. Buy under the Standard (Professional tier) license. | Fab 'Standard' license (Personal under $100k rev / Professional over $100k) is designed for shipping assets inside final products including games. Generally permits use in a distributed product; the asset-as-standalone-file concern is weaker than CC-BY because you are not relying on attribution-redistribution terms. MUST read the specific listing's license + Fab EULA (fab.com/eula) to confirm web/browser distribution where the packed asset is client-delivered — verify per-listing before buying. | High and FAST (drop-in, often game-ready PBR). Quality varies by listing — vet the specific model's greeble density and texel density. | backup — fastest path if you find a strong single ship; less art-directable than a kitbash but zero modeling time. |
| Hero ship (cost-free prototype) — CC0 / permissive blockout | Quaternius (quaternius.com, CC0 sci-fi packs) for blockout; Poly Haven for CC0 materials. Use only to prove the PIPELINE while licensing the real hero. | CC0 — no restrictions, fully safe for commercial browser builds, no attribution required. Cleanest possible license. | Low/stylized — NOT enough greeble density to sell capital-ship scale on its own. Fine as a stand-in while the real asset is acquired. | backup — pipeline placeholder only; do not ship the hero shot on this. |
| Hero ship (custom / art-directed) — AI-gen base then hand-finish | Meshy-6 (meshy.ai) or Tripo v3.1 (tripo3d.ai) image/text-to-3D, export GLB with PBR (albedo/normal/rough/metal/AO), then retopo + kitbash greebles + emissive masks in Blender. Meshy is stronger for game-ready PBR + retexturing; Tripo is faster (~10s) with 4K PBR. | Both grant commercial rights to YOUR generated models on paid plans (Meshy private license; Tripo commercial tied to paid tier). You own/are licensed for the output — clean for a commercial build. No third-party redistribution issue since the mesh is generated for you. | Medium-high but inconsistent — AI hulls often lack believable greeble logic and clean topology; needs meaningful Blender cleanup to reach AAA. Good for bespoke silhouette you can't find on a marketplace. | backup — use only if you need a unique ship and have Blender time; not the fastest path to 'wow.' |
| Space environment — starfield/nebula HDRI (background + IBL) | Poly Haven space/dark HDRIs (polyhaven.com/hdris, CC0) and Spacespheremaps (spacespheremaps.com) equirectangular space maps free for commercial use. Pick mostly-dark with soft nebula glow. | Poly Haven CC0 — fully unrestricted commercial. Spacespheremaps free for personal+commercial (verify their terms). SAFE. | High — gives free hull reflections (IBL) + backdrop in one asset. The IBL is a big chunk of the realism. | recommended — CC0, dual-purpose (background + reflections), zero cost. |
| Earth backdrop (scale anchor + launch fiction) | NASA Visible Earth / Blue Marble (visibleearth.nasa.gov) — 8k day, night-lights, clouds, plus a normal/specular map. Public domain. | NASA imagery is public domain (no copyright) — fully safe commercially. Cleanest possible. | Photoreal Earth from one textured sphere + atmosphere fresnel shell. High impact for near-zero effort. | recommended — public domain, trivial to integrate, huge scale payoff. |
| Capsule / approaching pod (scale cue) + lens-dirt textures | Capsule: Quaternius/Fab simple pod GLB, or model a primitive in 5 min. Lens dirt/flare textures: free PBR/utility texture sites or author in Photoshop. | Use CC0 (Quaternius/Poly Haven) or Fab Standard. Safe. | Low-poly pod is fine — it only needs to read as 'tiny human-scale thing' next to the ship. Lens dirt sells the camera. | recommended — cheap, high scale-cue payoff. |

## Interior look-dev detail (hero shot #2)

## Goal & framing
Build the **smallest walkable interior scene that proves the quality bar**: an L-shaped corridor (~25m) opening into one small room (a med-bay or junction with a dead body and a flickering panel). First-person, mouse-look + WASD, a real-time flashlight, near-black ambience, one scripted flicker beat and one distant audio hook. This is **look-dev only** — no ECS, no netcode, no Rapier. Hardcode geometry, lights, and a kinematic capsule walk. Target: a 60–90s walkthrough that makes the user say "this looks AAA."

**Two-track strategy to de-risk quality fast:** Track A (grey-box, week 1) proves the *rendering* is AAA using free/CC0 kit + Poly Haven textures — this is the credible fast path. Track B (optional polish, week 2) swaps in a higher-fidelity hero mesh once the lighting/post pipeline is proven. Do NOT block on perfect assets; the **lighting + post stack is 70% of the "AAA" perception**, the mesh is 30%.

## Stack decisions (locked to project stack)
- **Three.js r185, `WebGPURenderer` (three/webgpu)**, WebGL2 auto-fallback. TSL nodes throughout.
- **Post = `RenderPipeline`** (renamed from PostProcessing in r183). Pull directly from the official r185 WebGPU examples — they exist for *every* effect we need, which collapses risk.
- Vite + TS, single `look-dev` app in the Turborepo (`apps/lookdev`). No React HUD yet — a plain canvas + a tiny debug GUI (lil-gui/tweakpane) so the user can tune bloom/fog/exposure live and find the look.

## The horror look — concrete pipeline (front-to-back)

**1. Lighting model = baked GI + one real-time light.** Near-black corridor means almost no dynamic lighting cost.
- **Static GI via baked lightmaps.** Author lighting in Blender (Cycles) → bake lightmap UV2 → load as `aoMap`/lightMap on the GLB. This gives soft bounce, colored emissive spill, and ambient occlusion contact darkening *for free at runtime*. This is the single biggest "pre-rendered film" quality lever and is the standard 2026 approach (three.js best-practices explicitly recommend baking lightmaps/shadows/AO).
- **Emissive panels** (strip lights, screen glow) are emissive materials that (a) feed the baked lightmap and (b) drive bloom. A few **flicker** via a TSL emissive-intensity node animated by a noise/step function on `time` — the classic broken-fluorescent stutter.
- **The flashlight = the ONLY shadow-casting real-time light.** A `SpotLight` parented to the camera with: tight cone (~22° outer, soft penumbra), a **cookie/projection texture** (`SpotLight.map`) of a subtle reflector pattern + slight dirt so the beam isn't a clean cone, `castShadow=true` with a modest shadow map (1024, PCF soft). One shadow-casting light keeps us cheap and is the horror centerpiece — the moving pool of light is what makes it scary.
- **Volumetric beam.** Add god-ray/volumetric scattering on the flashlight. Two options: (a) r185's `VolumetricLightingModel` / volumetric fog scattering example (preferred, integrates with the spot), or (b) a cheap additive cone mesh with a soft radial+noise TSL material as fallback. Volumetric dust in the beam sells "thick derelict air."

**2. Volumetric fog (atmosphere).** Low-lying scene fog + the beam scattering. Use the r185 `webgpu_custom_fog_scattering` approach (TSL fog node) for height/depth fog so distance fades to black and the flashlight beam reads. Tint very slightly cyan/green for sickly derelict mood.

**3. GTAO contact shadows.** `GTAONode` in the RenderPipeline (official `webgpu_postprocessing_ao` example). Grounds props, darkens crevices, adds the "dirty corners" depth that baked AO alone misses on dynamic/placed props. Higher sample count under WebGPU at good cost.

**4. SSR on wet/metal floor.** `webgpu_postprocessing_ssr` (official r185). Floor is a metal/wet PBR material (high metalness in puddle-masked areas, low roughness streaks) so the flashlight beam and emissive panels smear into reflections — huge "AAA wet sci-fi floor" payoff. Mask SSR to the floor plane to keep it cheap and artifact-free.

**5. TSL post stack (RenderPipeline, order matters):**
`scene → GTAO → SSR → bloom → tone map (AgX or ACESFilmic) → vignette → chromatic aberration (edges only) → film grain → output`.
- **Tone map: AgX** (available as TSL function in r185) for filmic near-black roll-off that doesn't crush to mud — better than ACES for deep shadows; keep ACES as a toggle.
- **Bloom: restrained**, thresholded so only emissive panels/flashlight hotspot bloom — not a haze. r185 improved WebGPU bloom.
- **Vignette** pulls focus to the beam. **Chromatic aberration** subtle, radial, edges only. **Film grain** animated, low — kills the "clean CG" tell and adds analog dread. All as small TSL nodes.

## Materials — lived-in derelict surface storytelling
- **Trim-sheet workflow.** One or two 2K–4K PBR trim sheets (albedo/normal/roughness/metalness/emissive) cover 80% of corridor surfaces (panels, pipes, bolts, vents) at low texture-memory cost. Reuse across all modular pieces.
- **Detail normal + detail roughness** tiled at high frequency via TSL (blend a fine detail-normal over the base normal) so surfaces hold up close to the camera/flashlight — critical because the flashlight pushes the player's face right up to walls.
- **Decals for storytelling:** scorch marks, dried blood smears, hazard stencils, grime streaks, warning labels. Implement as **decal planes / projected decals** (simple polygon-offset quads with alpha for the milestone, not full deferred decals). 6–10 placed decals turn a clean kit into a derelict. This is the Dead Space/Alien "something happened here" beat.
- **Wet/puddle mask** on the floor driving roughness + SSR strength.
- One **hero prop with a story**: a slumped corpse or a sparking severed conduit at the corridor bend, lit only when the flashlight sweeps it.

## First-person rig + walk (minimal)
- `PerspectiveCamera`, FOV ~70–75. Pointer-lock mouse-look, WASD move, kinematic capsule against simple hand-placed collision (AABB/box walls — no Rapier needed for look-dev; a tiny custom collide-and-slide is enough).
- **Headbob + breathing sway** (subtle sine on camera Y/roll) — massively increases "feel." Flashlight inherits a slight lag/spring behind the camera so the beam swings naturally.
- **Atmosphere beats:** (1) trigger a panel **flicker + buzz** when the player reaches the corridor mid-point (a TSL emissive flicker + a positional audio cue); (2) a **distant metallic clang / vent skitter** positional audio at the far room so the player wants to walk toward it. Audio for the milestone can be 2–3 placeholder OGGs through a basic `PositionalAudio` — full ElevenLabs pipeline is a separate area; just reserve the hook.

## Scope of the smallest proving scene
- L-corridor (2 straight segments + 1 corner) + 1 small room. ~6–10 modular kit pieces instanced.
- 1 flashlight (shadow), 4–6 emissive panels (2 flickering), baked lightmap, scene fog.
- 1 metal/wet floor material, 1–2 trim sheets, 6–10 decals, 1 hero corpse/conduit prop.
- 1 HDRI for the tiny bit of fill/IBL (Poly Haven, very dim).
- Debug GUI to dial the look. That's it.

## Build order (fastest credible path, ~2 weeks)
1. **Day 1–2:** Vite + WebGPURenderer boot, pointer-lock FP walk, drop in Quaternius MegaKit corridor pieces (CC0, zero license risk), Poly Haven trim textures. Grey-but-correct.
2. **Day 3–4:** Flashlight spot + cookie + shadow + headbob. Scene fog. AgX tone map + vignette + grain. **This alone should already look moody.**
3. **Day 5–6:** Bake lightmap in Blender, wire lightMap/aoMap. Emissive panels + flicker TSL node. Bloom (thresholded).
4. **Day 7–8:** GTAO + SSR wet floor. Volumetric beam.
5. **Day 9–10:** Decals, hero corpse prop, the two atmosphere beats + placeholder positional audio. Debug GUI polish.
6. **Day 11+:** (Optional Track B) swap corridor base for a higher-fidelity mesh (Sketchfab Store / Fab GLB-native) if the kit reads too "gamey," re-bake, capture the two hero shots.

## Performance / memory budget (browser, desktop, max-fidelity)
- **Draw calls < 100** (target 30–60 here). Use `InstancedMesh`/merged geometry for repeated kit pieces; the corner + straight segments instance cleanly.
- **Textures: KTX2/Basis** (UASTC for normals, ETC1S for albedo/roughness) — 4–8× less GPU memory than PNG. Process the GLB through **gltf-transform** (KTX2 + meshopt) as a build step. Keep total VRAM for textures under ~256MB for the scene.
- **Meshopt** for geometry (faster decode than Draco, matches ratios with gzip).
- Shadow map 1024 single light. GTAO/SSR at half-res where acceptable. One HDRI at 1–2K.
- Lock to 60fps on a mid-range discrete GPU; this scene should sit comfortably under budget — headroom is the point so later gameplay fits.

### Interior asset options

| What | Source | License | Quality | Verdict |
|---|---|---|---|---|
| Modular sci-fi corridor/interior kit (the base hero geometry you walk through) | Quaternius 'Modular Sci-Fi MegaKit' — quaternius.com/packs/modularscifimegakit.html (also itch.io). 270+ modular grid-snapping pieces, native glTF/GLB. | CC0 (public domain). Zero restriction — safe for commercial, Steam, browser-extractable build. No attribution required. | Clean, stylized-realistic. Geometry/topology is good; comes UNtextured/lightly textured, so YOU author the trim-sheet PBR + bake — which is exactly what produces the AAA look anyway. Quality ceiling is high once you light/texture it. | RECOMMENDED as the Track-A base. Fastest path with zero legal risk; the look comes from your lighting/material/post work, not the kit. Start here. |
| PBR textures, trim sheets, HDRI for IBL/fill | Poly Haven — polyhaven.com (textures + HDRIs). Plus ambientCG (ambientcg.com) for metal/grime/decal textures. | CC0. Fully safe commercial + extractable. | Photoscan-grade 2K–8K PBR. Excellent for the wet-metal floor, grime, scorch, blood decals, and a dim derelict HDRI. This is your primary surface-quality source. | RECOMMENDED. Pair with Quaternius for the whole Track-A look. Industry-standard, no-risk. |
| Higher-fidelity hero corridor mesh (optional Track-B upgrade if kit reads too 'gamey') | Sketchfab Store paid GLB models, e.g. 'Modular Sci-Fi Corridors and Hallways' (Azure Moon Games) or 'Asset Pack Vol 7 Modular Sci-Fi Corridor' (RenderHub/JuanChee) — both ship GLB + 2K–4K textures. | Sketchfab Store 'Royalty Free' / standard model license — generally permits commercial use embedded in a product. MUST read each item's license; confirm it allows distribution inside an interactive app (most do; you're not reselling the model standalone). | Higher baked detail and game-ready texturing than Quaternius out of the box. GLB-native = drops straight into three.js. | BACKUP / polish pass. Buy ONE only after Track-A proves the pipeline, and only if needed. Verify per-asset EULA permits embedding. |
| Cinematic-grade sci-fi kit (highest fidelity ceiling) | KitBash3D 'Sci-Fi Industrial' / sci-fi kits — kitbash3d.com. | BLOCKER. EULA prohibits distributing editable 3D scenes and 'removal of an asset from the original work'; subscription assets can't move between works. A three.js build ships the raw GLB client-side = effectively redistributing extractable editable geometry. High risk for a browser/Steam-extractable build. | Top-tier film/AAA fidelity — the best-looking option on paper. | AVOID for the shipped browser build. Acceptable only for OFFLINE concept renders / mood targets to art-direct toward, never shipped in the GLB. |
| Fab (ex-Unreal Marketplace) sci-fi environment as source to export to GLB | fab.com — large sci-fi interior catalog. | CAUTION. Fab 'Standard License' generally allows embedding in a product, but many assets are UE-asset format and exporting/converting to GLB for a non-UE web runtime is a grey area; 'Reference-Only' tier grants NO source. Must confirm the specific item is Standard License AND format-portable. | Very high (UE-grade). But conversion friction (UE → GLB → KTX2) and license ambiguity add risk/time. | BACKUP, lower priority than Sketchfab Store. Only if you find a Standard-License item explicitly distributable in glTF; verify EULA before buying. |
| Decals (blood, scorch, grime, hazard stencils) | Poly Haven / ambientCG (CC0) for base textures; or hand-paint alpha decals in Substance/Photoshop from those. | CC0 base. Safe. | Sufficient — decals are small alpha quads; quality comes from placement/storytelling, not source. | RECOMMENDED. Cheap, high narrative payoff, no risk. |