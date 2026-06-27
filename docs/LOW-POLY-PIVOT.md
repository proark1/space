# SIGNAL LOST — Low-Poly Pivot Reconciliation (authoritative)

_The visual register is LOW-POLY / PS1-retro + a grounded-hybrid monster (locked 2026-06-27). This doc reconciles the photoreal-assuming specs (06-rendering-mood, 07-content, M-LOOK, PLATFORM-AND-QUALITY) to it. Where those docs' photoreal-specific sections conflict, THIS doc wins._


## Summary

SIGNAL LOST locks to a LOW-POLY / PS1-retro visual register (Lethal Company / Content Warning / HauntedPS1 lineage) where "highest 3D quality" is redefined as highest art/craft within low-poly plus a standout monster, not photoreal fidelity — mood is carried by lighting, near-black draw-distance fog, the flashlight cone, the cold AgX grade, and the audio/Fear Director, not by GI or reflections. The recommended sub-style is the MIDDLE PATH: a CLEAN, readable modern-low-poly base (flat-shaded, fog-heavy, crisp enough for 4-player co-op legibility) with a SEPARATE, intensity-dialable PS1-retro degradation layer (internal-res crunch + nearest upscale, vertex snap, posterize, ordered Bayer dither, optional affine/CRT) that the Fear Director ramps as dread rises and snaps clean in safe rooms — so the retro grain literally becomes the CHORUS corrupting perception. The MIXED-HYBRID monster breaks the register by being one notch more grounded (denser mesh ~15-25k tris, smooth normals + real normal map, cheap Fresnel fake-SSS + wet/clearcoat sheen, spine bioluminescence) while being lit/fogged/graded/post-processed by the IDENTICAL stack as the world, and is optionally EXEMPT from the degradation layer so it stays solid as the world jitters — grounded, not pasted-in, and the contrast IS the horror. "Quality" tiers (Low/Mid/High/Ultra) no longer ladder fidelity — visual style is constant across all four; they ladder simulation headroom (physics objects, ragdolls, debris, on-screen enemies), framerate, draw distance, and render-res crispness, making the freed photoreal GPU/VRAM budget the enabler for the full contextual-physics chaos suite and the honest desktop upsell.

## Sub-decisions (recommended defaults — applied; override anytime)

- **BASELINE GRIT LEVEL + retro-layer mode: how aggressive is the default PS1 grit, and is the gritty layer always-on or Director-only? Clean-base/Director-ramped (crisp, co-op-readable default; jitter/dither/posterize/low-res-crunch ramp up with Director dread and snap clean in safe rooms — retro artifacts become a FEAR INSTRUMENT tied to the sound-organism lore) vs Always-gritty (Signalis/Murder-House constant heavy PS1 filter — stronger singular cult identity but worse 4-player legibility + motion comfort, and the retro layer can no longer ramp as a scare tool because it's already maxed).**
  - ✅ _Applied (recommended):_ CLEAN-BASE / DIRECTOR-RAMPED GRIT. Co-op legibility must win by default (four friends parsing threats/hazards; slapstick needs clear staging; scares need a parseable threat), and making the degradation the Director's instrument is the single best fit for the CHORUS fiction (the grain/jitter IS the organism corrupting your perception). It also de-risks the WebGL2 floor and keeps the standout-monster budget payable. Net register: 'Content-Warning-clean to play, Signalis-gritty when the Director wants you afraid.'
- **ULTRA/desktop paid upsell identity: confirm the upsell is redefined from 'more realism (SSGI + 4K photoreal pack)' to 'more CRAFT + headroom' — chaos-density caps, 120/144fps, longer draw/fog, supersampled clean render-res, densest/sharpest CHORUS + higher-res monster texture, higher-bitrate audio, Steam social, cosmetics, offline, support-the-devs.**
  - ✅ _Applied (recommended):_ CONFIRM the redefinition. In a low-poly game, low-poly Ultra looks ~identical to low-poly Low, so the fidelity pillar collapses as a SELLING POINT and 4K has almost nothing to be 4K about. 'Desktop = more chaos, smoother, further, offline, with friends and support' is the honest, defensible upsell, and it's literally what the game is about (the physics-chaos suite). This keeps a real free-web-HIGH vs paid-desktop-ULTRA delta without a dishonest photoreal tier.
- **Monster build path: how to produce the one bespoke grounded CHORUS — AI-gen base (Meshy 6 / Tripo v3.1) -> heavy Blender retopo/sculpt/bake, vs sculpt-from-scratch in Blender with creature brush packs, vs reworking a mid-poly creature pack.**
  - ✅ _Applied (recommended):_ AI-GEN BASE -> HEAVY BLENDER REWORK as primary (commercial rights to your output, clean license, fast silhouette iteration toward the IP-safe gaunt-digitigrade/eyeless/echolocation-flap brief), with sculpt-from-scratch + brush packs as the fallback if the AI base never reads right. Use Quaternius Ultimate Monsters (CC0) as proxy/greybox ONLY to unblock rig/animation on day one — never the shipped CHORUS (too in-register to break the world). This is the project's single largest art line item and the new make-or-break gate.
- **World sourcing & licensing: 100% CC0/CUSTOM vs allowing paid kits. Plus the question of whether to permit cheap itch.io PSX/HauntedPS1 paid flavor packs.**
  - ✅ _Applied (recommended):_ WORLD = 100% CC0/CUSTOM, zero paid-kit dependency (Quaternius MegaKit #1 interior, KayKit Space Base Bits #2 + exterior-ship kitbash source, Kenney for blockout/VFX, Poly Pizza long-tail) — all redistributable in an extractable browser build with no EULA verification. Synty stays a HARD NO in the shipped build (extractable client-side glTF = effective redistribution; reference-only). ALLOW cheap itch.io PSX/HauntedPS1 horror packs for register-defining flavor props (CRTs, gore, wires) that pure CC0 lacks — but verify each pack's commercial+redistribution terms and file in LICENSES.md.
- **Affine (perspective-incorrect) texture warp — how far to push the most nausea-inducing PS1 artifact: off, subtle/tier-gated, or part of the base.**
  - ✅ _Applied (recommended):_ SUBTLE + TIER-GATED (High/Ultra and Director-only). On large near-camera floor/wall trims affine swim is the most motion-sickness-inducing artifact and fights co-op readability, so it's seasoning, not the base. Keep vertex-snap + posterize + ordered dither + internal-res crunch as the dominant, always-available PS1 cues; reserve affine and CRT/scanline (default 0) as Director-flicked PEAK-dread flavor.

## What the pivot makes easier / cheaper / lower-risk

- HERO-SHIP GATE RETIRED: the photoreal Kitbash3D capital ship (former #1 risk, weeks of work + EULA/redistribution gymnastics) becomes a CC0 Blender kitbash buildable in an afternoon (KayKit Space Base Bits + Kenney Space Station + Quaternius hulls + emissive window-mask + vertex colors). Scale now comes from cue-stacking (capsule, running-lights, window grid, nebula fog, slow camera) + lighting/post, not modeled greeble density.
- ZERO PAID-KIT / ZERO REDISTRIBUTION RISK for the entire world: CC0 low-poly is abundant and good (Quaternius MegaKit #1 interior base, KayKit #2 voice, Kenney blockout/VFX, Poly Pizza long-tail). Ship the files directly in an extractable browser build with no EULA verification. Only paid/AIGEN spend is the monster + a few cheap itch.io flavor packs. No Synty (hard NO), no Kitbash3D, no Fab/Sketchfab-Store gymnastics.
- DOWNLOAD COLLAPSES: vertex-color/tiny-atlas meshes shrink first-load to ~15MB (from ~25MB target), full ship-1 well under 60MB — an order of magnitude under the 180MB ceiling. JS/WASM + audio now dominate the download; the art pipeline is no longer the size constraint.
- PIPELINE SIMPLIFIES & BUDGETS SHRINK: kit_piece 8000->2500 tris / 6->1MB tex; prop 3000->1500 / 3->0.5MB; scene_total 600k->150k / 256->64MB. Trim sheets 2048->512-1024, ETC1S-heavy (UASTC monster-only). Draco branch effectively never fires (safety net for command-centre shell only); LODs mostly LOD0-only for the flat world, real LODs reserved for the monster.
- PERF / WebGL2 FLOOR TRIVIALLY SAFE: clean flat-shaded base + baked lightmaps + fog needs no expensive effect to look intentional. The retro stack is net CHEAPER (low internal-res = fewer fragments; no SSGI/SSR/heavy GTAO).
- FREED GPU/VRAM BUDGET ENABLES THE GAME'S ACTUAL THESIS: the entire former Ultra fidelity stack (SSGI/full SSR/GTAO/4K VRAM/high-poly) redirects to CPU/physics + draw-count + enemy AI — several-fold more simultaneous rigid bodies, ragdolls, debris, and enemies at 60fps. This is what makes the full contextual-physics suite (zero-G, decompression, flooding, dismemberment) shippable in a browser.
- DISMEMBERMENT IS A PERFECT FIT: chunky pre-authored gibs with flat-shaded solid 'meat' caps + pooled Rapier rigidbodies are cheap, comedic-grotesque (funny-scary), and dodge the gore-uncanny-valley a photoreal pipeline would hit. Blood = existing decal FIFO + posterized particles, no fluid sim.
- RENDERER ARCHITECTURE SURVIVES VERBATIM: WebGPU bootstrap, TSL post graph, PostUniforms bank, MRT, baked lightmaps, flashlight rig, FlickerBus/BeatBus, instancing/pools, profiling, 4-tier RenderProfile all retained. Only the TARGET IMAGE and heavy-GI/reflection reliance change — a substitution, not a rewrite.

## New M-LOOK GREEN/RED acceptance bar (replaces the 'looks AAA' bar)

- [ ] B1 — CRAFT / COHESION ('a game I'd play with friends'): GREEN if a first-timer shown a cold capture says 'that's a real game with a strong look,' NOT 'that's an asset-flip / unfinished prototype.' The low-poly reads as a DELIBERATE art direction (one of the four M-ART directions, consistently applied), not a placeholder — style reads as chosen, not cheap.
- [ ] B1 — CHARACTER: the chosen direction (Iron Lung / Analog Ghost / Sterile Wound / Leviathan Bloom) is legible in the frame — palette, grade, fog, and post all pull one direction. The screenshot is memorable and screenshot-worthy (the streamer-thumbnail test).
- [ ] B1 — MOOD OVER MESH: lighting + fog + flashlight + grade + audio carry the dread. Cold near-black corridor, flashlight as dominant moving source casting a real shadow, volumetric beam in fog, a couple of flickering emissive panels — chunky geometry reads as atmospheric, not flat.
- [ ] B1 — TONEMAP/BANDING: clean near-black rolloff, ordered dither present (the retro register's anti-banding feature), no banding in dark gradients despite the limited/retro palette.
- [ ] B2 (THE MAKE-OR-BREAK) — THE HYBRID READS: the CHORUS, in the same corridor under the same flashlight/fog/post/grade, sits CONVINCINGLY in the world (identical illumination/fog/bloom/tonemap so it belongs) yet is VISIBLY one notch more grounded/detailed than the environment so it breaks the register and the eye snags on it as wrong. RED if it looks like (a) a higher-poly asset pasted into a different game, or (b) just another chunky prop.
- [ ] B2 — IT SCARES IN MOTION: in a short clip, the monster — partially obscured by fog/darkness, revealed by the flashlight sweep — produces a genuine flinch/dread from a cold viewer; sound-mimicry behaviour hinted even in the look-dev slice.
- [ ] B2 — CONTRAST IS INTENTIONAL: reviewers can articulate WHY it's scary ('everything else is blocky and safe-feeling, then THAT thing is shaped wrong / moves differently / is too detailed'). The funny-scary tonal whiplash works: world goofy-chunky, monster not. Bonus: under dread the world degrades (jitter/dither/low-res) while the monster stays solid or sharpens to 'emerge.'
- [ ] B3 — PERF WITH CHAOS: locked 60fps on a mid-range discrete GPU under WebGPU WHILE a representative chaos load runs — a decompression event with ~300+ loose objects, several active ragdolls, and multiple enemies on screen. (NOT 60fps on a static scene — the headroom is the product thesis.)
- [ ] B3 — WebGL2 FLOOR HOLDS THE LOOK: forced ?gl=2 still reads as the same cohesive game with the post degrading gracefully — the low-poly look is robust across backends.
- [ ] B3 — FEEL: flashlight swing, headbob/breathing, ragdoll flop, and a physics-chaos beat (an object/limb tumbling in zero-G or sucked toward a breach) make moment-to-moment feel good and a little funny — the Lethal-Company 'chaos is the comedy' read.
- [ ] B3 — PROMOTABILITY: renderer/post/asset code lifts into packages/engine for M1 without a rewrite.
- [ ] NET GREEN = 'a polished, characterful, funny-scary co-op horror game I want to play with friends; the monster genuinely unsettles me even though the world is chunky; it runs a smooth 60 while the room is full of flying debris and limbs.' NET RED = look is incoherent/asset-flippy, OR the monster doesn't break the register (just another prop, OR a pasted-in foreign asset), OR it can't hold 60 under chaos.

## The paid-Steam Ultra upsell, re-specced (fidelity is off the table)

- CHAOS DENSITY (the headline): higher caps on simultaneous physics objects (~1200+ vs ~600 browser-high), debris/gibs (600+), active ragdolls (8+), and on-screen Chorus instances (12+). A full vacuum-decompression event sucking 200+ loose objects + dismembered crew through a breach while multiple Chorus close in — desktop runs it without the sim throttling. The game's own chaos sells the upsell: the funniest/scariest moments are the densest.
- HIGHER FRAMERATE: 120/144Hz unlock (web/most tiers lock 60 for pacing + budget math). High-refresh makes the flashlight swing, ragdoll flail, and run-for-the-airlock tangibly better feel. Now a PRIMARY pillar, not a footnote, because feel is the product. (Resolves the prior 90/120 open question toward shipping 120/144 as a named premium feature.)
- LONGER DRAW DISTANCE + BIGGER FOG RADIUS: desktop renders further with a larger fog volume and far-plane, so the derelict reads as a bigger, more continuous space and you see the monster's silhouette emerge from fog sooner. Atmosphere, not texels.
- CRISPER PRESENTATION (reframed as 'clean,' not 'detailed'): higher internal render-res (native 1440p/4K downsample — low-poly BENEFITS from supersampling because hard vertex-edge aliasing is the main artifact), heavier post stack (better dithering, stronger CRT/analog grade options, sharper/anamorphic bloom, lens dirt), 16x AF. 'The chunky world rendered cleanly,' never 'more polygons.'
- NO DOWNLOAD / OFFLINE / CONSISTENCY: bundled, guaranteed WebGPU (Dawn) on Win+Mac; no first-load streaming budget; plays on a plane. The whole game is local.
- STEAM SOCIAL: achievements, Cloud saves, friends list, Invite-to-Lobby (hands off the room code), Rich Presence, Steam Input — real ongoing value for a friends-only co-op game.
- EXCLUSIVE COSMETICS + 'SUPPORT THE DEVS': purely-cosmetic supporter suit skins / flashlight charms / player-card flair, a visible supporter badge, and the honest 'you're funding the people who made the free game you already love.' Since the FULL game is free in-browser, this is the primary DIRECT-SALES lever — make it explicit.
- THE MONSTER, RICHER (the only surviving fidelity perk): densest CHORUS mesh + sharpest normal-mapped/wet materials + a higher-res monster texture, plus higher-bitrate/uncompressed audio (the ElevenLabs/Chorus mixing is the fidelity that survives) and uncompressed grade LUTs. The 4K WORLD pack is DEAD — meshes/textures are identical across tiers by design; desktop just renders them richer and feeds the monster more texture.
- POSITIONING: 'The full game is free in your browser. Steam is the smoother, bigger-chaos, offline, play-with-friends, support-the-devs edition' — and 'the definitive, most-crafted way to see the CHORUS.' Honest, with a real free-web-HIGH vs paid-desktop-ULTRA delta and zero photoreal pretense.

## Docs to re-spec (checklist)

- [ ] docs/specs/06-rendering-mood.md — Retitle/reframe from 'near-black photoreal post stack' to 'LOW-POLY / PS1-RETRO with Director-ramped retro register.' State the renderer ARCHITECTURE is retained verbatim; only the target image + heavy-GI/reflection reliance change.
- [ ] 06 §1.3 DEGRADE matrix — Remove SSGI entirely (delete the M5 SSGI/Ultra-upsell note); demote scene-wide SSR to OFF on all tiers (replace with monster-local wet material + cheap analytic/cubemap floor sheen); demote GTAO from 'realism' to optional contact-darkening seasoning. Add RenderProfile fields: internalResScale/pixelSize, vertexSnapAmount, affineWarp (High/Ultra+Director only), posterizeLevels, ditherAmount, flatShaded (bool), crtAmount (default 0). Replace the photoreal Ultra column upsell with denser CHORUS mesh + sharper wet/normal-mapped monster + finer dither + higher internal-res + longer gib persistence + anamorphic bloom.
- [ ] 06 §2.2/2.3 — Add a new 'RETRO REGISTER' stage near the end of the locked post chain (after grade, around vignette/grain): low-internal-res target + NearestFilter upscale, posterize, ordered Bayer 4x4/8x8 dither, optional affine/CRT. State ordered dither REPLACES film-grain as the primary near-black anti-banding tool (now a stylistic feature). Keep emissive-only bloom, fog, vignette, AgX grade. Remove the SSR node block from the mandatory graph (monster-material-local only).
- [ ] 06 §2.1 PostUniforms — Add Director-animatable uniforms vertexSnapAmount, internalResScale/pixelSize, posterizeLevels, ditherAmount, affineAmount, crtAmount with beat-table ramps (BUILD raises jitter/dither, PEAK crunches internal-res + inverts monster-sharpen, RELAX snaps clean). CHORUS material reads its OWN inverse uniforms to stay stable while the world degrades.
- [ ] 06 §3 Lighting — Keep baked-lightmap GI + AO + flashlight + emissive panels VERBATIM (now MORE central). Add flat-shaded/faceted world materials note; reframe fog as a HARD near-black draw-distance curtain (PS1 use: hides low draw distance + LOD pop). No SSGI/raymarch-GI dependency for atmosphere.
- [ ] 06 NEW SECTIONS — 'Mixed-Hybrid Monster Rendering' (CHORUS deltas: higher poly + sharper organic silhouette, smooth normals + fuller PBR specular, Fresnel fake-SSS + wet/clearcoat, EXEMPT from vertex-snap/affine, optionally inverts at PEAK to 'emerge', SAME flashlight/fog/post/grade; new make-or-break hero asset replacing the photoreal hero ship) and 'Dismemberment + Physics Debris (low-poly)' (pooled chunky gibs, flat-shaded meat caps, Rapier rigidbodies under physics context, blood = decal FIFO + posterized particles, debris budget as a tier field, CHORUS gibs use the smooth/wet cap).
- [ ] docs/specs/07-content-asset-pipeline.md — §1 trim sheets 2048->1024 (basecolor 512 ETC1S), note many kit pieces ship vertex-color with NO texture. §3 shopping list: keep Quaternius/KayKit/Kenney/Poly Pizza/ambientCG/Poly Haven CC0; add itch.io PSX/HauntedPS1 horror flavor packs (per-pack verify, file in LICENSES.md); reaffirm 'No Synty in the shipped build'; reframe the AIGEN Stalker row as the project's ONE primary art investment (Meshy/Tripo base -> heavy Blender/ZBrush sculpt+bake).
- [ ] 07 §4 pipeline.config.json — kit_piece maxTris 8000->2500 & maxTexMemMB 6->1; prop 3000->1500 & 3->0.5; creature STAYS 25000 tris / 16MB (deliberate detail exception); scene_total 600000->150000 & 256->64MB. Note Draco branch almost never fires (safety net for command-centre shell only); LODs mostly LOD0-only for the flat world, real LODs reserved for the monster.
- [ ] 07 §5 creature brief — Keep design/rig/dismemberment approach (it is correct); strengthen the 'one notch more grounded' CONTRAST BUDGET: ~15-25k tris vs <=2.5k kit, smooth normals + real tangent-space normal map vs hard-normal world, 1K-2K texture vs world vertex-color/tiny-atlas, wet/translucent fake-SSS + spine emissive that brightens when hunting, SAME flashlight/fog/post/grade (break register via shape/shading only). Build path: Meshy6/Tripo base -> Blender retopo/sculpt/bake -> AccuRIG 2.0 + Blender digitigrade/spine/jaw bones -> segmented severable submeshes + cap meshes.
- [ ] 07 §6 first-load — Restate ~15MB slice (was ~25MB); JS/WASM + audio now dominate the download; full ship-1 well under 60MB. Add reconciling sentence: 'desktop/Ultra adds richer RENDER (SSGI/SSR/volumetrics/MSAA) + a higher-res MONSTER texture + uncompressed audio, NOT a photoreal world asset pack — meshes are identical across tiers.'
- [ ] docs/M-LOOK.md — Demote 'HERO SHIP ASSET IS THE GATE' from #1 risk to a non-risk note (CC0 kitbash buildable in an afternoon; the only real art gate is the grounded monster reading scary). Rewrite Scene A ship line to CC0 low-poly kitbash + emissive window-mask + vertex colors. Replace ALL shopping/option tables wholesale (remove Kitbash3D/Fab/Sketchfab-Store/Synty rows; substitute the CC0 sources). Invert the two-track strategy: Track A (CC0 kit + lighting + post) IS the whole world; the only fidelity upgrade is the monster — delete the Track-B higher-fidelity world-mesh path.
- [ ] docs/M-LOOK.md — Replace the GREEN bar entirely: delete the 'looks AAA/photoreal' gut-reaction criterion; install the three new tests (B1 craft/cohesion, B2 hybrid-monster-unsettles-and-breaks-register, B3 60fps-under-chaos+feel). Update the PERFORMANCE criterion to require 60fps UNDER a representative physics chaos load (~300+ loose objects, several ragdolls, multiple enemies), not a static scene — flag that M-LOOK currently exercises zero Rapier, so a minimal chaos-stress harness or early-M-engine chaos gate is needed. Demote SSR-on-wet-metal and 'greeble holds up close' from pass/fail to optional desktop seasoning.
- [ ] docs/PLATFORM-AND-QUALITY.md — Re-spec the Ultra row and tier matrix from 'SSGI + 4K UASTC pack + full-res SSR' to chaos density (active bodies ~150/350/600/1200+, ragdolls 2/4/6/8+, debris 64/160/300/600+, enemies 3/5/8/12+) + 120/144fps unlock + longer draw/fog radius + supersampled clean render-res + Steam social + cosmetics + offline/support. Style constant across all four tiers. Drop SSGI everywhere (tier table, roadmap M5-M7, RenderProfile ssgi field, bake notes); downgrade SSR to optional cheap stylized floor sheen. Demote the 4K/hd desktop pack to a minor perk (real content = higher-bitrate audio + uncompressed grade LUTs). Add a 'Freed perf budget / headroom shift' subsection. Resolve the 90/120 open question toward shipping the 120/144 unlock as a named premium feature. Update marketing notes to 'best-feeling funny-scary co-op horror,' not 'best graphics.'
- [ ] Cross-doc consistency — Ensure 06, 07, PLATFORM-AND-QUALITY, and M-LOOK all agree on: SSGI dropped entirely; SSR off scene-wide / monster-local + optional desktop floor sheen only; meshes/textures identical across tiers (low-poly), only render richness + monster texture + audio bitrate scale on desktop; the monster is the single bespoke art investment and the new make-or-break gate replacing the photoreal hero ship.

## New risks

- THE HYBRID-MONSTER BALANCE IS THE WHOLE PROJECT'S MAKE-OR-BREAK and it's a narrow target: 'one notch more grounded' can easily fail as either (a) a higher-poly asset that looks PASTED IN from a different game (too divergent — divergent lighting/grade/fog would cause this, so lock it to the identical stack), or (b) just another chunky prop that doesn't read as wrong (too in-register). All the freed budget concentrates here; if the contrast doesn't land, the redefined 'quality' bet has no payoff.
- AI-GEN MONSTER BASE MAY NEVER READ RIGHT: Meshy/Tripo output often needs so much retopo/sculpt rework that the time saving evaporates, and AI creature topology can be unusable for clean skinning/dismemberment segmentation. Have the sculpt-from-scratch fallback genuinely resourced, not assumed.
- RETRO ARTIFACTS vs CO-OP LEGIBILITY: even with Clean-base/Director-ramped, if the Director ramps too hard the vertex jitter / low-res crunch / dither can make silhouettes and hazards ambiguous ('is that the monster or a texture wobble?'), undercutting both the funny (staging) and the scary (parseable threat) and degrading 4-player callouts. Needs tuned ramp ceilings + safe-room snap-back + the monster-exempt-from-degradation rule strictly enforced.
- MOTION SICKNESS / ACCESSIBILITY: affine warp, CRT/scanline, chromatic split, and heavy vertex jitter are known nausea triggers in a first-person co-op game played for long sessions. Need an accessibility/intensity slider (and a 'reduce retro effects' option) or risk player complaints and refunds on the paid client.
- PERF THESIS IS UNTESTED: the entire new product framing rests on '60fps under a representative physics chaos load' (300+ objects, ragdolls, enemies), but M-LOOK currently exercises ZERO Rapier — there's no harness to actually validate the headroom claim. If the freed GPU budget doesn't convert to the promised CPU/physics headroom (Rapier/bitECS bottlenecks, P2P netcode sync of mass debris), the chaos-density upsell AND the GREEN bar's B3 test are both unbacked. Needs a chaos-stress harness early in M-engine.
- PAID-CLIENT VALUE PERCEPTION: with the full game free in-browser and visual style identical across tiers, some players will perceive 'no graphics upgrade = nothing to pay for' despite the real chaos/framerate/social/support value. Marketing must sell feel/chaos/social/support honestly and well, or wishlist-to-purchase conversion suffers. Cosmetics + support-the-devs framing carries more weight than usual.
- TSL/THREE.JS r185 API DRIFT on the new RETRO REGISTER nodes (vertex-snap, affine, internal-res target + NearestFilter, Bayer dither): these are custom material/post nodes on a fast-moving WebGPU/TSL surface. Pin them behind the same thin one-file adapters as existing post nodes, or upgrades break the look.
- ITCH.IO FLAVOR-PACK LICENSE TRAPS: 'royalty-free, personal+commercial' does not always permit REDISTRIBUTION inside an extractable browser build (client-side glTF/textures are effectively redistributed). Each pack must be EULA-verified and filed in LICENSES.md; a missed clause is a takedown/legal risk on a shipped commercial product.
- MONSTER-AS-SINGLE-POINT-OF-FAILURE schedule risk: concentrating essentially all art time/spend on one bespoke creature (mesh+sculpt+bake, wet/SSS/emissive material, extra-bone rig, segmentation+caps, 9-clip animation set) means any slip on the CHORUS slips the whole look-dev gate — there's no longer a second hero asset to fall back on.
- DISMEMBERMENT-IN-LOW-POLY TONE CALIBRATION: chunky gibs aim for funny-scary, but pre-cut caps + over-scaled blood burst can tip either too cartoonish (kills horror) or, on the CHORUS's wet-material caps, too viscerally grotesque (breaks the funny). Needs tuning passes, and the gib/decal pools must hold their tier budgets or the chaos moments tank framerate.


---

## Detailed: Low-poly rendering & mood spec

# SIGNAL LOST — Low-Poly Rendering & Horror-Mood Spec

_Reconciliation of `06-rendering-mood.md` to the locked decision: VISUAL REGISTER = LOW-POLY / PS1-RETRO, with a MIXED-HYBRID monster pushed one notch more grounded. "Highest 3D quality" = highest art/craft within low-poly + a standout monster, NOT photoreal fidelity. Mood = lighting + fog + flashlight + audio. Opinionated, concrete, no code._

The renderer *architecture* from the existing spec survives almost entirely — async WebGPU bootstrap, the TSL `PostProcessing`/`RenderPipeline` graph in a locked order, the `PostUniforms` director-control bank, MRT scene pass, baked-lightmap GLB pipeline, the flashlight `SpotLight` + `shadow.autoUpdate=false` controller, emissive flicker panels, the `FlickerBus`/`BeatBus` sync, instancing/LOD/pools, the `BudgetMonitor`/profiling, the 4-tier `RenderProfile` from PLATFORM-AND-QUALITY. **What changes is the LOOK the graph produces and which heavy GI/reflection effects we rely on.** This is a substitution of the *target image*, not a rewrite of the pipeline.

---

## 1. Sub-style spectrum and the recommendation

Two poles, with a middle path:

- **CLEAN modern-low-poly** (Lethal Company / Content Warning / HauntedPS1's "tidy" end): flat/faceted shading, good *modern* lighting (real shadows, fog, AO), crisp full-res render, restrained palette, no deliberate degradation artifacts. Reads "stylised game," very legible, funny-friendly, holds up at any resolution. Cheap and robust on WebGL2.
- **GRITTY PS1-retro** (Murder House / Signalis / the HauntedPS1 family): vertex jitter/snapping, affine (perspective-incorrect) texture warping, ordered dithering, **low internal-resolution render + nearest upscale**, hard limited palette, fog-as-draw-distance, optional CRT/scanline. Reads "cursed artifact," maximally uncanny, but the artifacts can fight gameplay readability and co-op communication ("is that a monster or a texture wobble?").

**Recommendation: the MIDDLE PATH — "Clean-base, Gritty-dialable," a CLEAN modern-low-poly foundation with PS1-retro degradation as a SEPARATE, intensity-controllable post layer the Fear Director can push.**

Rationale for funny-scary co-op + the CHORUS lore:

1. **Co-op legibility must win by default.** Four friends shouting "behind you / left vent / I'm downed by the corner" need a readable world. A permanently heavy PS1 grime makes silhouettes and hazards ambiguous and undercuts the *funny* (slapstick needs clear staging) and the *scary* (a scare reads only if you parse the threat). So the **baseline grit is LOW** — flat-shaded, fog-heavy, dark, but crisp enough to play.
2. **The degradation belongs to the Director, not the whole game.** Vertex jitter, dither density, internal-res drop, palette crush, chromatic split and scanline are all wired as `PostUniforms`/material uniforms the Fear Director ramps with dread (BUILD/PEAK/low-Resolve). The world *decays toward gritty PS1* as fear rises and snaps back in safe rooms. The retro artifacts become a **fear instrument** (the ship is "going wrong"), not a fixed filter — which is exactly the CHORUS fiction (a sound organism corrupting perception). This is the single best fit for the lore: the grain/jitter is the CHORUS bleeding into your eyes.
3. **It de-risks the WebGL2 floor and the 4-tier ladder.** A clean flat-shaded base is trivially cheap everywhere; the retro layer is pure post and scales by tier. We never depend on expensive GI/SSR to look intentional.
4. **It keeps the standout-monster bet payable.** With the world deliberately humble, the budget freed from photoreal kits/SSGI/4K is spent on the CHORUS (the next section) — the contrast IS the art direction.

Net register: **Content-Warning-clean to play, Signalis-gritty when the Director wants you afraid.**

---

## 2. The techniques and how to do them in Three.js r185 / TSL

All of these are TSL node functions or small material/post nodes; each is gated by a `RenderProfile` field and driven (where animatable) by a `PostUniforms` uniform so the Director can ramp it. They slot into the existing locked post order; the retro block sits as a new **"register" stage** near the end of the chain.

**A. Low internal-resolution render + nearest upscale (the master lever).** Render the scene pass into an offscreen target at a fractional internal resolution (e.g. 480–600p-equivalent via `renderScale`), then composite to the canvas with `magFilter = NearestFilter` (point sampling) so pixels stay chunky instead of bilinear-mushy. This is the dominant PS1 cue and is *free performance* (fewer fragments). Wire it to the existing DRS `renderScale` band but with a **hard low floor and an explicit "retro pixel size" uniform** so the Director can crunch resolution on a scare. Nearest upscale is what makes dither and jitter read as authentic rather than blurry.

**B. Vertex snapping (the jitter).** In the vertex stage of the world material (`MeshStandardNodeMaterial.positionNode` / a custom vertex TSL node): after transforming to clip space, quantise the clip-space (or screen-space) XY to a coarse grid — `snapped = floor(clipXY / grid) * grid` — using a `vertexSnapAmount` uniform (grid resolution ~160–256 "virtual" pixels). This reproduces the PS1 integer-vertex wobble. **Apply per-object, intensity-scaled**, and crucially **exempt or soften it on the CHORUS** (see §3) so the monster doesn't wobble like the set. Director ramps `vertexSnapAmount` up under dread (the world destabilises).

**C. Affine (perspective-incorrect) texture mapping.** PS1 skipped the per-fragment perspective divide on UVs, causing the iconic texture "swim" on large near-camera polys. In TSL, interpolate UVs *without* perspective correction — pass UV multiplied by a non-perspective-corrected varying (or reconstruct affine UVs in the fragment node from a vertex-stage value flagged to skip the w-divide). Keep this **subtle and tier-gated** (High/Ultra only, or Director-only) because on large floor/wall trims it's the most nausea-inducing artifact; it's seasoning, not the base.

**D. Posterize / limited palette.** Post node: quantise each channel to N levels (`color = floor(color * levels) / levels`) with a `posterizeLevels` uniform (e.g. 5–6 normal, dropping to 3–4 on low Resolve). Optionally snap to a **fixed cold palette LUT** (a small 2–6 colour ramp) for the gritty extreme; default is plain posterize so we keep the cold desaturated grade rather than a hard fixed palette (a fixed palette fights the existing AgX/desat grade and the emissive bloom, so reserve it for the deepest dread tier).

**E. Ordered (Bayer) dithering.** Post node sampling a 4×4 (or 8×8) Bayer threshold matrix per output pixel *in internal-resolution space* (so the dither grid is pixel-locked, not screen-locked), added before/with posterize so the limited palette dithers gradients instead of banding. This is the existing spec's banding mitigation **upgraded into a stylistic feature** — it replaces (or augments) animated film grain as the near-black anti-banding tool and carries enormous mood. `ditherAmount` uniform; Director raises it as Resolve drops.

**F. Flat / vertex lighting vs baked.** Keep the existing **baked-lightmap GI + AO** workflow verbatim — it is *more* important now, because it lets the static world read as crafted without realtime GI. Add a **flat-shading option** (faceted normals / `flatShading` or normal-from-derivatives in TSL) for the low-poly world materials so faces read as facets (the Lethal Company look). The realtime budget stays the flashlight + emissive panels. Vertex-colour fake lighting is available for the cheapest props but baked lightmaps remain the primary GI lever.

**G. PS1 fog = draw distance.** Keep and *lean harder* on the existing exp2 height/distance fog, but author it as a **hard near-black draw-distance curtain**: geometry fades to fog colour well before the far plane and the far plane is pulled in. Fog is now load-bearing both for mood AND for hiding the low draw distance / popping LODs (the classic PS1 use). The flashlight cone cutting the fog is the centrepiece. No raymarched SSGI needed — analytic/cheap raymarch fog is the whole atmosphere.

**H. CRT / scanline (optional, top of chain).** A final optional post node: scanlines + slight barrel/chromatic-edge + vignette-rolloff, behind a `crtAmount` uniform, **default 0**. Reserve for menus, the "found-footage" framing, or PEAK dread spikes — leaving it always-on hurts readability and gives motion sickness in co-op. It's a flavour the Director flicks, not a base layer.

**What still carries the HORROR mood (unchanged and now doing MORE work):** the flashlight cone as the dominant light + moving shadow; the hard near-black fog curtain; deep darkness with emissive flicker panels as the only other source; emissive-only thresholded bloom on those panels (still gorgeous in low-poly — neon in fog is the look); the cold desaturated AgX grade; and above all the **audio Director + ElevenLabs + the CHORUS** doing the heavy scare lifting. Low-poly visuals + great audio + darkness is *exactly* the proven funny-scary horror formula (Lethal Company). The retro degradation stack becomes a new, ramping mood instrument on top.

---

## 3. The MIXED-HYBRID monster — making the CHORUS "break the register"

The CHORUS must look like it **doesn't belong to the world's rendering rules** while still being lit by the same scene, so it reads as *wrong* rather than *pasted in*. Same flashlight, same fog, same post chain, same grade — different geometry/material/treatment. The contrast IS the horror.

The exact deltas (the monster is "one notch more grounded"):

1. **Higher poly / smoother silhouette.** The world is faceted and chunky; the CHORUS is denser-meshed with a **sharper, more organic, asymmetrical silhouette** — the thing the eye snags on. Where the corridor reads as flat planes, the monster reads as a continuous form. It gets a higher LOD budget than any world prop.
2. **Smoother / grounded shading.** World materials are flat-shaded; CHORUS materials use **smooth normals + a fuller PBR-ish response** (real specular highlight, normal-mapped surface detail) so light *wraps* it believably. It reads "more real" against the cardboard set.
3. **Subsurface / wet materials.** A cheap fake-SSS (Fresnel-driven translucency / backlight wrap) + a **wet/clearcoat sheen** so the flashlight produces a slick, fleshy hotspot and a soft translucent rim. Glistening organic surface vs dry matte world = instant unease. This is the one place we keep a small targeted "wet" material — *not* scene-wide SSR, just on the monster.
4. **Exempt from (or inverted on) the degradation layer.** Reduce or kill **vertex snap** and **affine warp** on the CHORUS so it stays *stable* while the world jitters — the unsettling tell is that the monster is the only solid, certain thing as your perception decays. Optionally **invert the relationship at PEAK**: the world crushes to dither/low-res while the monster sharpens, so it "emerges" out of the corrupted image. (Tie this to the lore: the CHORUS is the realest thing; everything else is the corrupted signal.)
5. **Tighter, lagless contact with light.** It still casts/receives the flashlight shadow (it's one of the few dynamic shadow casters per the existing `ShadowController` enemy-in-cone path) and sits in the same fog depth — so it's *grounded* in the space. The deltas are all surface/geometry/stability, never lighting or grade. That's what stops it looking composited: identical illumination, fog absorption, bloom and tonemap; divergent form and material.

Subtle audio-coupling: because the CHORUS is sound-based, the Director can drive its **wet-sheen and silhouette sharpening** off the same `BeatBus` events that drive the post grade — it visibly "tightens" on a stinger. Same uniform bank, no new system.

Budget note: this is where the freed photoreal budget goes. One genuinely well-crafted hybrid creature + its materials is the project's hero asset (replacing the photoreal hero ship as the make-or-break), and it is cheap to render (one skinned mesh, smooth shading, small wet material) relative to scene-wide SSGI/SSR/4K.

---

## 4. Dismemberment + physics debris in low-poly (a perfect fit — spec it)

Low-poly + chunky gibs is the *ideal* register for the dismemberment/contextual-physics suite: it's cheap, comedic-grotesque (funny-scary), and avoids the gore-uncanny-valley a photoreal pipeline would hit.

- **Chunky pre-authored gibs.** Each dismemberable limb/segment is a **pre-cut low-poly chunk** with capped, flat-shaded interior faces (a solid colour "meat" cap — dark red core, no expensive cross-section sim). On a dismemberment event, hide the limb, spawn the matching gib mesh from a **pre-allocated pool** (zero runtime `new`, per the existing pooling discipline), hand it to Rapier as a convex/box rigidbody, and let zero-G/vacuum/flooding context carry it (ragdoll-adjacent but rigid-chunk, far cheaper than soft-body). Chunks tumble, bounce, and in zero-G drift — comedy and horror in one.
- **Comedic-grotesque tuning.** Slightly over-scaled blood burst (existing three.quarks dark-`0x4a0c0c` system) + a wet `pop` from the audio Director + a chunky silhouette spinning away sells the Lethal-Company laugh-then-cringe. Flat-shaded gib faces keep it cartoon-adjacent, not viscerally photoreal.
- **Debris budget by tier.** Active gib rigidbodies and persistence are a `RenderProfile` field: Low keeps few and despawns/sleeps fast; Ultra holds more, longer, with more blood decals. Gibs share one atlas material and instance where possible; FIFO-recycle into the existing decal/particle pools.
- **Blood is decals + posterized particles**, not fluid sim — reuses the existing `Decals.ts` FIFO pool and `Particles.ts`, now passing through the posterize/dither register so blood reads in-style.
- **CHORUS dismemberment** uses the same system but with the monster's smoother/wet material on the cap interior (a glistening severed cross-section), so even its gibs "break the register" — grounded gore from an ungrounded thing.

---

## 5. How the post stack changes (Low/Mid/High/Ultra for a low-poly game)

**Drop the photoreal load-bearers:** SSGI is gone as a goal (was the Ultra upsell); heavy scene-wide SSR reliance is gone (the "wet metal floor SSR" centrepiece is replaced by the **monster's** local wet material + cheap cubemap/analytic floor sheen). GTAO is demoted from "realism" to optional contact-darkening seasoning since baked AO + dark + fog already carry depth. The expensive realism stack is **not** what makes this game look good — craft, contrast, and the retro register are.

**Keep and now centre:** flashlight shadow (the one realtime caster), near-black draw-distance fog, emissive-only thresholded bloom, the cold AgX desaturated grade, and the **new retro register block** (internal-res crunch + nearest upscale, vertex snap, posterize, ordered dither, optional affine/CRT). Dither **replaces banding-grain as the primary near-black anti-banding tool** (and is a feature, not a mitigation).

Revised tier toggles (this is the new `06`/`PLATFORM-AND-QUALITY` intersection for low-poly — the asset axis and 4-tier ladder are unchanged; only what each tier renders changes):

| Parameter | LOW (WebGL2/compat) | MID (WebGPU) | HIGH (WebGPU, browser ceiling) | ULTRA (desktop only) |
|---|---|---|---|---|
| Internal-res / nearest upscale | aggressive crunch (low floor), nearest | moderate crunch, nearest | light crunch, nearest (Director can deepen) | near-native, nearest (retro is a *choice* not a perf crutch) |
| Vertex snap | on (cheap, on-style) | on | on, Director-ramped | on, Director-ramped |
| Affine texture warp | off | off | subtle / Director-only | subtle / Director-only |
| Posterize + ordered dither | on (carries near-black) | on | on | on (finer matrix) |
| Flat-shaded world | yes | yes | yes | yes |
| Baked lightmap + AO | yes (primary GI) | yes | yes | yes |
| GTAO (contact seasoning) | off | half-res, light | half-res | full-res |
| SSR (scene-wide) | off | off | off (monster wet-mat only) | off (monster wet-mat only) |
| SSGI | **off (removed entirely)** | off | off | **off — no longer the Ultra upsell** |
| Fog (draw-distance curtain) | analytic exp2 | raymarch 12 | raymarch 24 | raymarch 32 |
| Emissive-only bloom | on (3 mips) | on (5) | on (5 + lens dirt) | on (+ anamorphic) |
| CRT/scanline | off (Director spike only) | off (Director) | off (Director) | off (Director) |
| CHORUS smooth-shade + wet-mat + fake-SSS | **on (always — the monster never degrades)** | on | on (normal-mapped detail) | on (denser mesh, sharper) |
| Gib physics budget | few, sleep fast | moderate | more | most, longest persistence |

**What the Ultra/desktop paid tier now upsells** (since SSGI + 4K-photoreal is dead): NOT "more realism" but **more craft + headroom** — the densest CHORUS mesh + sharpest normal-mapped/wet monster materials, finer dither matrix and higher-res internal target (retro-by-choice instead of retro-by-perf-limit), longer gib persistence + more decals/particles, anamorphic bloom seasoning, and the existing desktop wins (bundled WebGPU consistency, bigger local asset pack of *hand-crafted low-poly* sets, 90/120 unlock). The desktop pitch becomes "the definitive, most-crafted way to see the CHORUS," which is honest and still a real delta over the free web HIGH.

---

## 6. Sub-decision for the user (one thing to confirm)

**How aggressive is the BASELINE retro grit, and is the gritty PS1 layer always-on or Director-only?** This spec recommends **Clean-base / Director-ramped grit** (crisp, readable default; jitter/dither/low-res crunch ramp up as the Fear Director raises dread and the CHORUS corrupts perception, snapping clean in safe rooms). The alternative is **Always-gritty** (Murder-House/Signalis constant heavy PS1 filter — more singular identity, more atmosphere, but worse 4-player legibility and motion comfort, and the retro layer can no longer function as a fear instrument because it's already maxed). Recommendation stands on Clean-base / Director-ramped; confirm, or pick always-gritty if you want the harder cult-artifact identity over co-op readability.

---

## Sources

- [PS1 style graphics in Three.js — Roman Liutikov](https://romanliutikov.com/blog/ps1-style-graphics-in-threejs)
- [Affine Texture Mapping in shader (PS1-style) — three.js forum](https://discourse.threejs.org/t/affine-texture-mapping-in-shader-ps1-style-graphics/5945)
- [Building a PS1 style retro 3D renderer — David Colson](https://www.david-colson.com/2021/11/30/ps1-style-renderer.html)
- [How to Create a PS1-Inspired Jitter Shader with R3F — Codrops](https://tympanus.net/codrops/2024/09/03/how-to-create-a-ps1-inspired-jitter-shader-with-react-three-fiber/)
- [TSL — three.js docs](https://threejs.org/docs/pages/TSL.html)
- [The Art of Dithering and Retro Shading for the Web — Maxime Heckel](https://blog.maximeheckel.com/posts/the-art-of-dithering-and-retro-shading-web/)
- [Building a Real-Time Dithering Shader — Codrops](https://tympanus.net/codrops/2025/06/04/building-a-real-time-dithering-shader/)
- [Efecto: Real-Time ASCII and Dithering with WebGL — Codrops](https://tympanus.net/codrops/2026/01/04/efecto-building-real-time-ascii-and-dithering-effects-with-webgl-shaders/)
- [Godot PSX Style Demo — MenacingMecha](https://github.com/MenacingMecha/godot-psx-style-demo)
- [The Haunted PS1 Aesthetic and Medium-Specific Noise — Intermittent Mechanism](https://intermittentmechanism.blog/2022/10/31/the-haunted-ps1-aesthetic-and-medium-specific-noise/)
- [Signalis — Wikipedia (mixed PS1 low-poly + detail)](https://en.wikipedia.org/wiki/Signalis)
- [Dithering on the GPU — Alex Charlton](https://alex-charlton.com/posts/Dithering_on_the_GPU/)


---

## Detailed: Low-poly asset pipeline & sourcing

## Reconciled plan — LOW-POLY ASSET PIPELINE + SOURCING

This replaces the photoreal sourcing/pipeline assumptions in `docs/specs/07-content-asset-pipeline.md` (§3 shopping list, §4 codec routing, §5 creature, §6 budget) and the entire `docs/M-LOOK.md` shopping list + ship-gate framing. The renderer/post specs (06) and PLATFORM-AND-QUALITY are reconciled in their own areas; here we only own **what we buy/build and how we process it**.

Governing principle from the decision: **the world is PS1-retro low-poly (flat/vertex-colored, tiny textures, hard normals), and the CHORUS/enemies are pushed ONE notch more grounded** — higher mesh density, a real normal map, subtle SSS-ish translucency, wet/emissive spec — but run through the *same* flashlight, fog, post stack, and grade so they break the register and read as wrong/scary. Money goes to the monster, not the kit.

---

### 1. WHERE to get low-poly assets — ranked, commercial-safe, browser-extractable

The killer fact that reframes everything: **CC0 low-poly is abundant and good.** Unlike the photoreal world (where the only AAA-grade greebled ship was a paid Kitbash3D kit with redistribution caveats), the low-poly look has *first-class CC0 sources for every category we need*. We can ship a fully license-clean game with **zero paid kit dependency and zero EULA-redistribution risk**.

**Tier S — CC0, ship the files directly, primary sources:**

| Source | Best for | License | Rank |
|---|---|---|---|
| **Quaternius** (quaternius.com) — Modular Sci-Fi MegaKit (270+ pieces), Sci-Fi Essentials Kit, Ultimate Monsters, Ultimate Animated Character, Space Vehicles | Ship **interior kit** (corridors/rooms/greebles), props, capsule, monster *proxy*, FPS arms | **CC0** (FBX/OBJ/glTF) | **#1 overall** — single largest coherent CC0 sci-fi set; one art voice across interior + props + proxy creature |
| **KayKit** (kaylousberg.itch.io) — **Space Base Bits**, Space Bits, "Complete KayKit" | Ship **interior kit alt/blend**, modular station bits, **exterior ship hull blocks** | **CC0** (glTF-native, grid-snapping) | **#2** — cleaner, more "designed" silhouettes than Quaternius; native glTF; pairs perfectly for kitbashing the exterior ship |
| **Kenney** (kenney.nl) — Space Station Kit (80+), Modular Space Kit, particle packs | Greybox, **exterior ship blocks**, muzzle/impact VFX sprites, UI | **CC0** | **#3** — blockiest/simplest; ideal first-pass blockout + VFX sprites; single-colormap style matches our atlas rule |
| **Poly Pizza** (poly.pizza) — CC0 filter + bundles (incl. Ultimate Monsters bundle) | One-off **props**, **capsule pod**, gap-filling single models | **CC0** (FBX/glTF, no login) | **#4** — search-and-grab for the long tail of single props; verify per-model CC0 (mixed licenses exist on-site) |

**Tier A — paid but cheap, or per-asset-verify, for the ONE place quality matters (the monster) or polish:**

| Source | Best for | License | Note |
|---|---|---|---|
| **itch.io PSX/HauntedPS1 low-poly horror packs** (e.g. Seb.cs "10 Retro Horror Props", PS1 horror texture/keycard/survival-gear packs, the Haunted PS1 community) | **Register-defining dressing** — CRT/wires/gore/retro props that *nail* the PS1-horror tone CC0 sets miss; PS1 texture sets for the grimy atlas | Per-pack "royalty-free, personal+commercial" — **verify the specific pack EULA permits redistribution inside a shipped build** (most do; many are explicitly commercial) | Cheap ($0–15), high tone payoff. File each in LICENSES.md. This is where the "horror" flavor that pure CC0 lacks comes from. |
| **Meshy 6 / Tripo v3.1** (AI gen, paid tier = commercial rights to *your* output) | **Monster base mesh**, bespoke hero props, the pulse rifle | AIGEN — you own/are licensed for the generated mesh; no third-party redistribution issue | Best for the *grounded monster* base (text/image→3D, then heavy Blender rework). Keep license export receipt in LICENSES.md. |
| **Synty POLYGON Sci-Fi** | Reference/mood ONLY | **DO NOT SHIP.** One-Time-Purchase EULA forbids sharing edited/unedited assets and has metaverse/game-creation-software redistribution restrictions; a browser build ships extractable glTF client-side = effectively redistribution. **Hard NO for the shipped build.** | Keep the existing "No Synty in the build" rule. Synty's value is as a *look reference* only. |

**Verdict on rank for each requested category:**
- **Sci-fi ship interior:** Quaternius Modular Sci-Fi MegaKit (#1 base) → retopo'd into our 8 trim-kit meshes; KayKit Space Base Bits as second voice / greebles. Both **CC0**.
- **Props:** Quaternius + KayKit + Poly Pizza for the long tail; itch.io PSX horror packs for the *flavor* props (CRTs, gore, wires). Mostly **CC0**, a few cheap paid.
- **Capsule (exterior pod):** model a 5-minute Blender primitive (CUSTOM) or grab a Quaternius/Poly Pizza pod. **CC0/CUSTOM.**
- **Exterior ship:** **kitbash from KayKit Space Base Bits + Kenney Space Station blocks + Quaternius hulls in Blender (hours, see §2), OR build from primitives.** **CC0.** No paid kit, no Kitbash3D.

---

### 2. The "hero ship is the gate" risk DISSOLVES (revise M-LOOK)

The old M-LOOK named the hero capital ship as **THE gate** — its credibility rested on a single paid, greebled, photoreal Kitbash3D hull, with a whole risk section about acquisition/kitbash slipping and the scale illusion failing on a "too-clean" hull. **Low-poly removes the gate entirely:**

- **A low-poly capital ship is a hours-not-weeks Blender job.** Greeble *density* was the photoreal scale trick precisely because clean surfaces read as toy. In PS1-retro, the register is *deliberately* low-detail — scale now comes from **silhouette + the same cheap cues (capsule, running-lights, emissive window grid, nebula distance fog, slow long camera travel)**, not from modeled greebles. So the single hardest, most-expensive, most-license-fraught asset becomes a kitbash of **CC0 blocks** (KayKit hull bits + Kenney station modules + a few extruded primitives), vertex-colored, with an emissive window-mask plane. One person, an afternoon.
- **No acquisition dependency, no EULA verification, no "is this redistributable in a web build" question** — it's CC0 or your own mesh.
- The scale illusion is now **lighting + fog + cue-stacking**, which the renderer/post spec already owns, not an asset-procurement problem.

**M-LOOK changes (concrete):**
- Demote "HERO SHIP ASSET IS THE GATE" from the #1 risk to a non-risk note: *"Exterior ship is a CC0 kitbash buildable in an afternoon; it is no longer a gate. The gate, if any, is the GROUNDED MONSTER reading as scary against the low-poly world."*
- Rewrite Scene A asset line: ship = **CC0 low-poly kitbash (KayKit/Kenney/Quaternius) + emissive window-mask + vertex colors**, not a Kitbash3D Perpetual hull.
- Drop the photoreal acceptance language: replace "looks AAA / not a three.js demo" with **"looks like a finished PS1-retro horror game (Lethal Company / Content Warning / HauntedPS1 grade), and the monster visibly out-classes the world."** Keep EMISSIVE DISCIPLINE, HORROR TONE, INTERIOR WALKABLE, PERFORMANCE, LICENSE-CLEAN bars. Drop SSR-on-wet-metal and "greeble density holds up as camera pushes in" as *pass/fail* bars (they become optional desktop seasoning).
- Replace the Kitbash3D/Fab/Sketchfab-Store rows in the M-LOOK shopping table wholesale with the §1 CC0 sources (see §5).
- Keep the two-track idea but invert it: **Track A is the whole game** now (CC0 kit + lighting + post = the look). There is no "Track B higher-fidelity hero mesh" for the *world*; the only fidelity upgrade in the project is **the monster** (§3).

---

### 3. The BESPOKE GROUNDED MONSTER — the ONE art investment that matters

This is now where essentially all the art budget and risk concentrate. The CHORUS (and lesser enemies) must be **one notch more grounded than the world** and read *wrong* against the flat low-poly kit — that contrast IS the scare.

**What "one notch more grounded" means concretely (the contrast budget):**
- **Mesh:** mid-poly, ~15–25k tris (vs ≤2.5k for a kit piece) — enough for believable organic curvature where the world is faceted.
- **Smooth/soft normals + a real tangent-space normal map** (the world is hard-normal/flat) so the creature catches the flashlight with rounded, fleshy gradients the kit can't.
- **One small grounded texture** (1K–2K albedo + normal + a packed ORM/emissive) vs the world's tiny shared atlases — but still tiny by photoreal standards.
- **Material gives it away:** wet translucent dermis (cheap fake-SSS via fresnel + warm backscatter tint), exposed cable/muscle, and the **spine bioluminescence emissive that brightens when hunting** (the player's only "it's coming" tell). It must bloom on the *same* emissive-only thresholded bloom as the world — same post, breaking register only via shape/shading, not a different render path.
- It uses the **same flashlight, fog, grade, grain** as everything else (per the decision) — never a special shader stack, or it stops feeling like it belongs in the same camera.

**Where to get / how to build it (ranked):**
1. **AI-gen base → heavy Blender rework (recommended primary):** Meshy 6 or Tripo v3.1 text/image→3D for the silhouette base (gaunt digitigrade biped, eyeless tapering cranium, echolocation flaps — per the existing ARTDIR do/don't to stay IP-safe vs Xenomorph). Then retopo, sculpt the fleshy detail pass in Blender (multires) or **ZBrush** if available, bake the normal map down to mid-poly, author the wet/translucent material. AIGEN tier = commercial rights to your output; clean license.
2. **Sculpt-from-scratch in Blender + creature brush packs:** Blender sculpt with a **ZBrush/Blender creature brush mega-pack** (CGTrader "100 Creature Brush" / undead packs — verify commercial license) for fast skin/muscle/horn detail, retopo, bake. Slower but fully art-directed and unique. Use if the AI base never reads right.
3. **Mid-poly creature pack as a base (fallback):** a Sketchfab/CGTrader mid-poly creature (per-model license verified) heavily reworked — only if 1–2 stall. Meshy's CC0 monster/creature tag gives clean-topology bases for *free*, usable as a starting block.
4. **Quaternius Ultimate Monsters (CC0):** **proxy/greybox only** — unblocks animation/rig retarget on day one; never the final shipped CHORUS (too in-register with the world; it would not break it).

**Rig + dismemberment (carry forward, unchanged in approach, this is the right design):**
- Author as **separate skinned submeshes per severable part** (head/armL/armR/legL/legR/jaw/torso) each with its own **cap (stump) mesh** so a cut reveals geometry. Per-part Rapier compound colliders for per-limb hit detection; host hides submesh + spawns cap + detached physics chunk on sever; 6-bit part-state mask over the wire.
- Rig via **AccuRIG 2.0** (free, ActorCore) for the humanoid base + finger fit, then add **digitigrade leg-roll bones, a 3-bone spine/tail extension, and jaw bone** in Blender (humanoid retarget ignores these → hand/procedural). **Mixamo** for placeholder clips during greybox.

**Budget to put here:** This is the **single largest line item** — plan for the bulk of art time/spend on the CHORUS: mesh+sculpt+bake, the wet/translucent+emissive material, the rig with extra bones, the segmentation+caps, and the 9-clip M4 animation set (`idle_lurk, stalk_walk, sprint_quad, investigate, pounce, swipe, stagger, crawl_legless, death`). Everything else in the project (the entire world) is near-free CC0. **Treat the monster as the product's one bespoke craft asset.**

---

### 4. REVISED asset/optimization pipeline (low-poly = tiny, draw-budget-trivial, far smaller download)

Low-poly collapses most of the photoreal pipeline cost. **gltf-transform is still the driver, but the work is simpler and the budgets shrink dramatically.**

**What changes:**
- **Textures become tiny or absent.** The world is **vertex colors + small shared atlases** (often 256²–512², not 2K–4K). Many kit pieces ship with *no texture at all* (pure vertex color), which is the cheapest possible asset — KTX2 is then only needed for the few atlases, the decal sheet, and the monster.
- **Trim sheets shrink:** the 3-material rule (MAT_TRIM_A/B/DECAL) stays, but author at **512²–1024²**, not 2048². ETC1S basecolor everywhere; UASTC only for the **monster's** normal map and any emissive masks that need gradient fidelity. The flat world barely needs UASTC.
- **Geometry is trivially small.** Kit pieces drop to **≤1–2.5k tris**; meshopt alone handles everything; **Draco is essentially never triggered** (the `dracoWhenBytesOver` 1.5MB branch will almost never fire — keep it as a safety net for the command-centre shell only).
- **LODs largely unnecessary for the world** (a 1.5k-tri corridor has nothing to decimate). Keep LOD generation in the pipeline but mostly emit LOD0-only for kit pieces; reserve real LODs for the monster and large hero spaces.
- **Per-asset budgets tighten** (revise `pipeline.config.json`): `kit_piece` maxTris **8000→2500**, maxTexMemMB **6→1**; `prop` maxTris **3000→1500**, maxTexMemMB **3→0.5**; `creature` *stays generous* at **maxTris 25000, maxTexMemMB 16** — the creature is the deliberate exception that carries the detail. `scene_total` maxTris **600000→150000**, maxTexMemMB **256→64**.

**Restated web first-load budget (now FAR under 180MB):**
The old M4 slice already targeted 25MB; with vertex-color/tiny-atlas low-poly the realistic **full first-load lands ~12–18MB**, and a fuller browser ship-1 experience stays **well under 60MB** — comfortably an order of magnitude under the 180MB ceiling. Revised slice allocation:

| Bucket | Photoreal-era | Low-poly revised |
|---|---|---|
| JS/WASM (engine, Rapier, recast, decoders) | ~6 MB | ~6 MB (unchanged — code, not art) |
| Kit meshes (8 pieces, meshopt, mostly vertex-color) | ~4 MB | **~1 MB** |
| Trim/decal atlases (KTX2, 512²–1K) | ~7 MB | **~1.5 MB** |
| **Monster** + weapon + arms (the detail exception) | ~4 MB | **~3 MB** (monster dominates this) |
| HDRI (1–2K KTX2) | ~1.5 MB | ~1 MB |
| Critical audio (Beat 1–3 + ambience) | ~2.5 MB | ~2.5 MB (unchanged — audio, not mesh) |
| **Total first-load** | ~25 MB | **~15 MB** |

The non-art buckets (JS/WASM, audio) now *dominate* the download — meaning the art pipeline is no longer the size constraint at all.

**What desktop (paid Steam/Electron) adds:** NOT a "photoreal 4K pack" anymore. Desktop "Ultra" becomes **higher-res monster normal/albedo, the full post seasoning (SSR on wet floors, SSGI/GTAO at full res, volumetrics at higher density), 4× MSAA/higher shadow res, and uncompressed audio** — i.e. *render quality and the monster*, not a fatter world asset pack. The web build ships the same low-poly meshes; desktop just renders them richer and feeds the monster a bigger texture. (This reconciles PLATFORM-AND-QUALITY's "Ultra = SSGI + 4K pack upsell" → "Ultra = SSGI + richer post + a higher-res MONSTER, not a photoreal world pack.")

**gltf-transform usage stays, simplified:** weld/dedup/prune/meshopt + KTX2 (ETC1S-heavy, UASTC only for monster) + manifest/hashing/R2 immutable caching all unchanged in *mechanism*; just smaller inputs, looser need for Draco/LODs.

---

### 5. Revised M-LOOK shopping list (low-poly ship + interior kit + the one grounded monster)

| Item | Source | License |
|---|---|---|
| **Exterior low-poly ship** (kitbash, no longer the gate) | KayKit Space Base Bits + Kenney Space Station Kit + Quaternius hull/vehicle pieces, kitbashed in Blender (hours) + emissive window-mask plane + vertex colors. Or pure Blender primitives. | **CC0 / CUSTOM** |
| **Interior modular kit** (walkable base) | Quaternius Modular Sci-Fi MegaKit (#1 base) → retopo to our 8-piece trim kit; KayKit Space Base Bits as 2nd voice/greebles | **CC0** |
| **Register-defining horror props** (CRTs, gore, wires, retro flavor) | itch.io PSX/HauntedPS1 packs (Seb.cs "10 Retro Horror Props", PS1 horror texture/survival-gear/keycard packs) | Per-pack royalty-free commercial — **verify each, file in LICENSES.md** |
| **Long-tail props + capsule pod** | Quaternius + KayKit + Poly Pizza (CC0 filter); capsule = 5-min Blender primitive | **CC0 / CUSTOM** |
| **THE grounded monster (CHORUS)** — the one investment | Meshy 6 / Tripo v3.1 base → heavy Blender retopo/sculpt/bake (ZBrush or Blender brush packs for flesh detail) → wet/translucent + spine-emissive material → AccuRIG 2.0 + Blender extra bones → segmented severable submeshes + caps | **AIGEN (paid=commercial) + CUSTOM**; receipts in LICENSES.md |
| **Monster proxy** (greybox/rig-retarget only, never shipped) | Quaternius Ultimate Monsters | **CC0** |
| **PBR/atlas textures** (small trim + decals + PS1 grime) | ambientCG + Poly Haven (downscaled to 512²–1K) + itch.io PS1 texture packs | **CC0 / per-pack verify** |
| **Space starfield HDRI + Earth backdrop** | Poly Haven dark/space HDRI; NASA Blue Marble | **CC0 / public domain** |
| **VFX sprites** (muzzle, sparks, impact) | Kenney particle packs | **CC0** |

**Net:** the entire shippable world is **CC0/CUSTOM with zero redistribution risk and zero paid-kit dependency**; the only paid/AIGEN spend is the **monster** and a handful of cheap itch.io flavor packs. No Kitbash3D, no Synty, no Fab/Sketchfab-Store EULA gymnastics in the shipped build.


---

## Detailed: Platform / Ultra upsell / M-LOOK

## Context & the core inversion

The locked decision moves the visual register to **LOW-POLY / PS1-retro** (Lethal Company / Content Warning / HauntedPS1 family), with a **mixed-hybrid monster** pushed one notch more grounded than the world. This breaks the previous foundation of two of my specs:

1. **The Ultra upsell used to be fidelity** (SSGI + 4K UASTC pack + full-res SSR). In a low-poly game, **low-poly Ultra looks ~identical to low-poly Low** — chunky meshes, vertex-lit/baked surfaces, and 256-color-feel grades do not get "better" with 4K textures or SSGI. The whole "desktop = bigger assets, sharper normals" pillar collapses as a *selling point*. The 4K pack has almost nothing to be 4K about.

2. **The M-LOOK GREEN bar was "a first-timer says AAA / photoreal."** That test is now a guaranteed RED for the wrong reason — a deliberately chunky game will never read photoreal, and shouldn't.

So both must be re-pivoted from **fidelity** to **feel, chaos density, and the monster**. The good news: low-poly slashes GPU cost so hard that it *enables* the thing the game is actually about (the full physics suite + big enemy/debris counts), and that headroom shift becomes the new upsell and the new bar.

---

## A. The new paid-Steam Ultra upsell (the ladder, re-spec'd)

**Old upsell axis (DEAD):** fidelity — SSGI, full-res SSR, 4K UASTC textures, sharper normals.
**New upsell axis (LIVE):** **chaos headroom + framerate + draw distance + ownership/social/support.** Desktop doesn't render *prettier*; it renders *more, smoother, further, offline, with friends and achievements*.

What the paid Steam client now actually buys (in priority order):

1. **CHAOS DENSITY (the headline).** Higher caps on simultaneous physics objects, debris/gibs, active ragdolls, and **on-screen enemies**. A full vacuum-decompression event sucking 200+ loose objects + 4 dismembered crew through a breach while 6 Chorus instances close in — desktop runs that without the simulation throttling. This is the upsell the *game's own chaos* sells for you: the funniest, scariest moments are the densest ones, and desktop is "the version where the chaos never gets capped."
2. **HIGHER FRAMERATE.** 120/144 Hz unlock (web/most-tiers lock 60 for pacing + budget math). High-refresh makes the moment-to-moment *feel* — the flashlight swing, the ragdoll flail, the run-for-the-airlock — tangibly better. This is now a primary, not a footnote, because feel is the product.
3. **LONGER DRAW DISTANCE + BIGGER FOG RADIUS.** Web/Low renders current sector (+0/1); desktop renders further with a larger fog volume and far-plane, so the derelict reads as a bigger, more continuous space and you see the monster's silhouette emerge from fog sooner. Atmosphere, not texels.
4. **CRISPER PRESENTATION.** Higher internal render-res (native 1440p/4K downsample for clean low-poly edges — low-poly *benefits* from supersampling because aliasing on hard vertex edges is the main artifact), crisper/heavier post stack (better dithering, stronger CRT/analog grade options, sharper bloom), 16x AF. This is "the chunky world rendered cleanly," not "more polygons."
5. **NO DOWNLOAD / OFFLINE / CONSISTENCY.** Bundled, guaranteed WebGPU (Dawn) on Win+Mac; no first-load streaming budget; plays on a plane. The whole game is local.
6. **STEAM SOCIAL.** Achievements, Cloud saves, friends list, **Invite-to-Lobby** (hands off the room code), Rich Presence, Steam Input. For a friends-only co-op game, frictionless invites + a shared achievement chase is a real, ongoing value driver.
7. **EXCLUSIVE COSMETICS + "SUPPORT THE DEVS."** Supporter cosmetics (suit skins, flashlight charms, player-card flair — purely cosmetic, no gameplay/competitive edge), a visible "supporter" badge, and the honest "you're funding the people who made the free game you already love." Given the FULL game is free in-browser, this is the primary direct-sales lever — make it explicit, not shy.

### The concrete revised LOW/MID/HIGH/ULTRA ladder (low-poly)

The four tiers no longer ladder *fidelity*; they ladder **simulation headroom + smoothness + range + presentation crispness**. Visual *style* is constant across all four — a Low player and an Ultra player see the same chunky, fog-lit, flashlight-driven world; Ultra just has more stuff in it, running smoother and visible further.

| Parameter | LOW (WebGL2/compat) | MID (WebGPU) | HIGH (WebGPU, browser ceiling) | ULTRA (desktop Steam only) |
|---|---|---|---|---|
| **Target FPS** | 60 (floor 45) | 60 | 60 | **60 default, 120/144 unlock** |
| **Physics objects (active rigid bodies)** | ~150 | ~350 | ~600 | **~1200+** |
| **Debris / gibs alive** | 64 | 160 | 300 | **600+** |
| **Simultaneous active ragdolls** | 2 | 4 | 6 | **8+ (full crew + crowd of limbs)** |
| **On-screen enemies (Chorus instances)** | 3 | 5 | 8 | **12+** |
| **Decompression flow particle/object budget** | capped, throttles early | moderate | high | **uncapped within sim** |
| **Draw distance / sector radius** | current only | +1 | +2 | **+2 with larger far-plane** |
| **Fog radius / volume** | small | medium | large | **largest (silhouette-from-fog range)** |
| **Internal render-res** | 1080p, DRS 0.6–0.85 | 1440p, DRS 0.7–1.0 | 1440p, DRS 0.8–1.0 | **native up to 4K, DRS 0.9–1.0 (supersample for clean edges)** |
| **Anti-alias** | SMAA | SMAA + opt TAA | TRAA | **TRAA + supersample/TAAU** |
| **Post crispness** | base grade + dither | + better dither | + lens/grade options | **full analog/CRT grade suite, anamorphic, lens dirt** |
| **Anisotropic filtering** | 2x | 4x | 8x | **16x** |
| **Shadows** | 512 / 1 cascade | 1024 / 2 | 1024 / 3 | 2048 / 4 |
| **Assets** | web pack | web pack | web pack | **desktop pack (audio at higher bitrate; meshes identical)** |
| **Steam / offline / social** | — | — | — | **achievements, Cloud, invites, offline, cosmetics** |

**Critical reframings baked in:**
- **The 4K texture pack is demoted from "the Ultra pillar" to a minor audio/presentation perk.** In low-poly the meshes are the same on every tier and textures are small/stylized by design; "desktop = bigger assets" is no longer a headline. The desktop pack's real content is **higher-bitrate audio** (the ElevenLabs/Chorus mixing is the fidelity that survives) and uncompressed grade LUTs — not 4K albedo.
- **SSGI is dropped as the Ultra-exclusive renderer feature.** Low-poly + baked lightmaps + flashlight + fog does not need realtime GI, and SSGI on flat-shaded chunky geometry buys almost nothing for high cost and instability. **Reallocate that entire budget and engineering attention to physics/enemy density.** (SSR is similarly downgraded from "the AAA wet-floor payoff" to an optional stylized floor sheen — keep it cheap/optional, not a tier divider.)
- **Ultra's identity is now "the chaos + smoothness + social + support edition,"** not "the graphics edition."

---

## B. The revised M-LOOK GREEN BAR (rewritten for low-poly)

**Old GREEN bar (DEAD):** "a first-time viewer says *that looks AAA / photoreal*, not *a nice three.js demo*." For a deliberately chunky game this is a false-negative machine.

**New GREEN bar (LIVE) — the gate now answers three questions, all testable:**

### B1. "Polished, cohesive, characterful — a game I'd play with friends" (the craft test)
- [ ] **COHESION:** a first-timer shown a cold capture says *"that's a real game with a strong look"* — NOT *"that's an asset-flip / unfinished prototype."* The low-poly is clearly **a deliberate art direction** (one of the four M-ART directions, consistently applied), not a placeholder. Style reads as *chosen*, not *cheap*.
- [ ] **CHARACTER:** the chosen art direction (Iron Lung / Analog Ghost / Sterile Wound / Leviathan Bloom) is legible in the frame — palette, grade, fog, and post all pull in one direction. The screenshot is *memorable* and *screenshot-worthy* (the streamer-thumbnail test).
- [ ] **MOOD OVER MESH:** lighting + fog + flashlight + grade + audio carry the dread. Cold near-black corridor, the flashlight as dominant moving source casting a real shadow, volumetric beam in fog, a couple of flickering panels — the chunky geometry is *atmospheric*, not *flat*.
- [ ] **TONEMAP/BANDING:** clean near-black rolloff, animated dither/grain present, no banding in the dark gradients despite the retro palette.

### B2. "The monster genuinely unsettles despite the chunky world" (the hybrid-monster test — the most important one)
- [ ] **THE HYBRID READS:** the Chorus, placed in the same corridor under the same flashlight/fog/post/grade, sits **convincingly in the world** — it is lit and graded by the identical stack, so it belongs — yet is **visibly one notch more grounded/detailed than the environment**, so it *breaks the register* and the eye snags on it as *wrong*. It must not look like (a) a higher-poly asset pasted into a different game, nor (b) just another chunky prop. The "uncanny tenant" balance is the make-or-break craft call of the whole project.
- [ ] **IT SCARES IN MOTION:** in a short clip, the monster — partially obscured by fog/darkness, revealed by the flashlight sweep — produces a genuine flinch/dread from a cold viewer. Sound-mimicry behaviour hinted (it's a sound-based organism) even in this look-dev slice.
- [ ] **CONTRAST IS INTENTIONAL:** reviewers can articulate *why* it's scary ("everything else is blocky and safe-feeling, then THAT thing moves differently / is shaped wrong / is too detailed"). The funny-scary tonal whiplash works: the world is goofy-chunky, the monster is not.

### B3. "Holds 60fps with heavy physics + the funny-scary feel lands" (the it-plays-great test)
- [ ] **PERF WITH CHAOS:** locked 60fps on a mid-range discrete GPU under WebGPU **while a representative chaos load runs** — a decompression event with ~300+ loose objects, several active ragdolls, and multiple enemies on screen. (The old bar only required 60fps on a static scene; the new bar requires 60fps *under the physics load the game is actually about*, because that headroom is now the whole product thesis.)
- [ ] **WebGL2 FLOOR HOLDS THE LOOK:** forced `?gl=2` still reads as the same cohesive game with the post degrading gracefully — the low-poly look is *robust* across backends (it always was cheap; now prove it).
- [ ] **FEEL:** flashlight swing, headbob/breathing, ragdoll flop, and a physics-chaos beat (an object/limb tumbling in zero-G or sucked toward a breach) make the moment-to-moment feel *good and a little funny* — the Lethal-Company "chaos is the comedy" read.
- [ ] **PROMOTABILITY:** renderer/post/asset code lifts into `packages/engine` for M1 without a rewrite (unchanged).

**Net:** GREEN = *"this is a polished, characterful, funny-scary co-op horror game I want to play with my friends, the monster genuinely unsettles me even though the world is chunky, and it runs at a smooth 60 while the room is full of flying debris and limbs."* RED = the look is incoherent/asset-flippy, OR the monster doesn't break the register (looks like just another prop OR like a pasted-in foreign asset), OR it can't hold 60 under chaos.

---

## C. The freed perf budget (the headroom shift — quantified)

Low-poly is not a constraint here; it is **the enabling decision** for the physics-suite game. The GPU cost that AAA-photoreal would have spent on SSGI/SSR/4K/GTAO/high-poly is **redirected to CPU/physics + draw-count + enemy AI**, which is exactly where a chaotic co-op horror game wants it.

**Where the GPU budget went before (photoreal) vs now (low-poly):**

| Cost center | Photoreal plan | Low-poly plan | Freed |
|---|---|---|---|
| Per-object shading | heavy PBR, multi-map | flat/vertex-lit or simple PBR, baked | **large** |
| SSGI | Ultra-exclusive, very expensive | **dropped** | **~all of it** |
| SSR | full-res "AAA wet floor" | optional cheap stylized sheen | most |
| GTAO | full-res 16–24 samples | half-res / baked AO leaning | much |
| Shadow res | up to 2048/4 cascades | same caps usable, but cheaper scenes | some |
| Geometry / overdraw | 150k–1M-tri heroes | chunky low-tri meshes | **large** |
| Texture VRAM | up to ~3GB (4K UASTC) | small stylized textures (~hundreds of MB) | **large** |

**The headroom shift, stated as the thesis:** the low-poly register roughly **frees the GPU/VRAM that the entire former Ultra fidelity stack consumed**, and the small per-object draw cost lets the engine push **several-fold more simultaneous rigid bodies, ragdolls, debris, and enemies** at the same framerate than the photoreal plan could have. Concretely, the ladder above asks for **~1200+ active physics objects, 8+ ragdolls, 600+ debris, and 12+ enemies at 60fps on Ultra** — numbers that would be implausible at photoreal fidelity but are reasonable when each object is cheap to draw. The previous "headroom is the point so later gameplay fits" note in M-LOOK becomes the *literal product*: that headroom IS the gameplay (decompression chaos, flooding, zero-G debris fields, mass dismemberment, swarming Chorus).

**This is what makes the full contextual-physics suite (zero-G, vacuum/decompression, flooding, ragdolls, dismemberment) shippable in a browser** — and what makes "desktop = MORE of it" the honest, defensible upsell instead of "desktop = prettier."

---

## D. Marketing reframe

Stop selling **"best graphics."** Sell **"the best-FEELING funny-scary co-op horror you can play with friends — free in your browser, premium on Steam."**

- Lead with **vibe + chaos + the monster**, never fidelity. Trailers show: the flashlight-and-fog dread, the funny-scary chaos (decompression yanking a screaming ragdoll crewmate out a breach), and the Chorus reveal — not texture detail.
- Lean *into* the low-poly as identity: it's the HauntedPS1 / Lethal Company / Content Warning lineage, a deliberate, beloved aesthetic — "characterful, not cheap."
- Position the Steam premium honestly: **"the full game is free in your browser. Steam is the smoother, bigger-chaos, offline, play-with-friends, support-the-devs edition."** Don't pretend it's a graphics upgrade — pretend nothing; the value is real (framerate, chaos caps, social, offline, cosmetics, funding).
- The monster is the marketing hero: "everything's blocky and a little silly — until you hear *it* copy your friend's voice." The hybrid-register monster IS the differentiating screenshot/clip.

---

## Sub-decisions (recorded)

1. **Ultra is no longer a fidelity tier — it is a chaos/smoothness/social tier.** Visual *style* is constant across LOW→ULTRA; only simulation headroom, framerate, draw distance, render-res crispness, and Steam/social/cosmetics scale.
2. **DROP SSGI entirely** (was the single Ultra-exclusive renderer feature); reallocate budget to physics/enemy density. **Downgrade SSR** from tier-divider to optional cheap stylized floor sheen.
3. **Demote the 4K UASTC desktop pack** from "the Ultra pillar" to a minor perk; its real surviving content is **higher-bitrate audio + uncompressed grade LUTs**, not 4K albedo. Meshes/textures are identical across tiers by design.
4. **Promote framerate (120/144) and chaos-density caps to PRIMARY upsell pillars,** with offline/social/cosmetics/support as the direct-sales drivers (since the full game is free in-browser).
5. **Internal render-res / supersampling stays meaningful** — low-poly hard edges alias badly, so clean supersampled edges are a genuine (if modest) desktop presentation win; keep it, reframed as "clean," not "detailed."
6. **The M-LOOK GREEN bar is rewritten to three tests** (craft/cohesion, the hybrid-monster-unsettles, 60fps-under-chaos+feel) and explicitly **deletes the "looks AAA/photoreal" gut-reaction criterion.** The monster-register test is the new make-or-break.
7. **The M-LOOK perf criterion now requires 60fps under a representative physics chaos load,** not on a static scene — because that headroom is the product thesis. (Note: M-LOOK currently exercises zero Rapier; a minimal chaos-load harness or a deferred chaos-stress gate in early M-engine is needed to actually test this — flag for the roadmap owner.)
8. **Marketing positioning is "best-feeling funny-scary co-op horror," not "best graphics."** Update store/wishlist copy accordingly when the Steam page is stood up.