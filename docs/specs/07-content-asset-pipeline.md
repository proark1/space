# SIGNAL LOST — Content, Modular Kit, Asset Pipeline & Stalker Creature Spec (M4 Slice)

> ⚠️ **REGISTER CHANGED (2026-06-27): the game is LOW-POLY / PS1-retro, not photoreal.** Photoreal-specific parts of this doc (SSGI, scene-wide SSR, 4K photoreal kits, Kitbash3D hero ship, the 'looks AAA' bar) are **superseded** — see [LOW-POLY-PIVOT.md](../LOW-POLY-PIVOT.md) for the authoritative reconciliation. The renderer *architecture* still holds; only the target image + heavy-GI reliance change.


2026-06-27. Tool/asset versions and source links verified via web search this date. Scope = M4 "Haunted Corridor" vertical slice only, but the kit/pipeline/naming are forward-compatible with the full authored campaign.

---

## 0. Repo layout for content & pipeline

This spec owns three new monorepo locations. Names assume the locked Turborepo layout.

```
signal-lost/
  apps/
    game/                      # the Vite/Three.js client (owned by other specs)
  packages/
    content-schemas/           # zod/TS schemas for levels, props, audio cues, creatures
      src/level.ts
      src/socket.ts
      src/creature.ts
  tools/
    asset-pipeline/            # THIS SPEC owns this
      package.json
      pipeline.config.json     # budgets + per-asset codec routing
      scripts/
        optimize.mjs           # gltf-transform driver (per-asset)
        budget-check.mjs       # CI gate (gltf-transform inspect parsing)
        bake-audio.mjs         # ElevenLabs build-time bake (other spec; hook only)
        build-manifest.mjs     # hashed CDN manifest writer
      kits/
        trimsheet-corridor/    # source .blend + exported .glb kit
  assets-src/                  # RAW, git-LFS, NOT shipped (DCC sources, hi-res textures)
    hdri/ kit/ weapons/ props/ creatures/ player/
  assets-dist/                 # build output -> uploaded to R2 (gitignored)
    kit/ weapons/ props/ creatures/ env/ manifest.json
```

`assets-src/**` is **git-LFS** (do not commit raw 4K PNGs / .blend to plain git). `assets-dist/**` is gitignored; CI regenerates it and pushes to R2.

---

## 1. MODULAR TRIM-SHEET KIT — corridor interior

### 1.1 Material budget (locked at 3 shared materials)

The entire ship interior renders from **3 atlas/trim materials**. This is the single most important constraint for draw-call batching (instanced kit pieces share a material → host can `InstancedMesh`/batch them).

| Mat ID | Name | Channels | Texel use | Codec route (see §4) |
|---|---|---|---|---|
| `MAT_TRIM_A` | Hull/structural trim sheet | BaseColor, Normal, ORM (occlusion-rough-metal packed) | Walls, floor, ceiling, structural ribs, doorframes | UASTC normal, ETC1S basecolor, UASTC ORM |
| `MAT_TRIM_B` | Greeble/tech trim sheet | BaseColor, Normal, ORM, Emissive | Panels, pipes, vents, consoles, light strips (emissive) | UASTC normal, ETC1S basecolor, UASTC emissive |
| `MAT_DECAL` | Shared decal/grime atlas (alpha-tested) | BaseColor+A, Normal | Warning stripes, scuffs, blood, signage | ETC1S basecolor, UASTC normal |

A 4th `MAT_GLASS` (thin transmissive) is **allowed but optional** for the command-centre shell only; not in the M4 slice.

Trim sheets authored at **2048×2048**, normals at 2048, basecolor allowed to drop to 1024 ETC1S in filler. All UVs for kit geometry must land on `MAT_TRIM_A`/`B` islands — **no per-piece unique UV unwraps.** Decals get their own UV2 channel.

### 1.2 Piece list

Grid unit: **`U = 1.0 m`**. Corridor cross-section: **3.0 m wide × 3.0 m tall** interior (1.5 m half-extents). All pieces snap on a `U`-grid; corridor segment length = **4U (4 m)** so two players abreast read as cramped.

| Piece file (`.glb` mesh name) | Footprint (W×L×H, m) | Tris (target, LOD0) | Sockets | Notes |
|---|---|---|---|---|
| `KIT_corridor_straight_4m` | 3×4×3 | ≤2,500 | `S_-Z`,`S_+Z` | Tiling backbone. Floor has UV2 wear pass. |
| `KIT_corridor_corner_L` | 3×3×3 | ≤2,800 | `S_-Z`,`S_-X` | 90° turn (4 rotations cover all corners). |
| `KIT_corridor_T` | 3×3×3 | ≤3,200 | `S_-Z`,`S_+Z`,`S_-X` | T-junction. |
| `KIT_corridor_X` | 3×3×3 | ≤3,600 | `S_-Z`,`S_+Z`,`S_-X`,`S_+X` | Crossroads. |
| `KIT_doorway_frame` | 3×0.6×3 | ≤900 | `S_-Z`,`S_+Z`,`S_DOOR` | Inline frame; holds the door. |
| `KIT_door_blast` | 2×0.15×2.4 | ≤700 | `S_DOOR` | Animated (slide-up). Pivot at frame `S_DOOR`. |
| `KIT_vent_grate` | 1×0.1×1 | ≤300 | `S_VENT` | Removable; swarmer spawn. Alpha-test on `MAT_DECAL`. |
| `KIT_vent_tube_2m` | 1×2×1 | ≤600 | `S_-Z`,`S_+Z` | Internal crawl tube (Stalker crawl path). |
| `KIT_room_small_shell` | 6×6×3.5 | ≤6,000 | `S_-Z`,`S_+Z`,`S_-X`,`S_+X` | Modular 4-wall room shell, openings cap with `KIT_doorway_frame`. |
| `KIT_saferoom_shell` | 6×8×3.5 | ≤8,000 | `S_-Z`,`S_DOOR` | Sealed room; one reinforced door, console socket, light socket. |
| `KIT_commandcentre_shell` | 16×16×6 | ≤24,000 | multiple `S_*` | Hero space (NOT in M4; spec'd for forward compat). |
| Greeble props (see §3) | — | — | `S_GREEBLE_*` | Pipes, consoles, cables — snap into wall greeble sockets. |

**Total unique kit meshes for M4 slice:** straight, corner_L, doorway_frame, door_blast, vent_grate, vent_tube_2m, room_small_shell, saferoom_shell = **8 meshes**, all on `MAT_TRIM_A/B/DECAL`.

### 1.3 Naming convention

```
KIT_<category>_<variant>[_<size>]      e.g. KIT_corridor_straight_4m
PROP_<category>_<variant>              e.g. PROP_console_wallA
SOCKET nodes (empties):  S_<dir|role>  e.g. S_+Z, S_DOOR, S_VENT, S_GREEBLE_01
LOD nodes:               <mesh>_LOD0 / _LOD1 / _LOD2
COLLIDER nodes:          <mesh>_COL   (convex/trimesh hint via custom prop)
```

### 1.4 Socket / snap convention

Sockets are **Blender Empties** (exported as glTF nodes) parented under the kit mesh root. Convention:

- **Position**: at the exact face-center where the next piece attaches, on the `U`-grid.
- **Orientation**: the empty's **-Z (forward)** points **out of** the piece, into the neighbour. Snapping rule: piece B's chosen socket is aligned so its forward is **anti-parallel** to piece A's socket forward, positions coincident. (Standard "plug faces socket" rule → no per-piece offset math.)
- **Naming the direction** (`S_+Z` etc.) is in the piece's **local** frame.
- **Custom glTF node extras** carried on each socket:
  ```json
  { "socket": true, "kind": "corridor" | "door" | "vent" | "greeble", "gridU": 1.0 }
  ```
  `kind` must match for a snap to be legal (`corridor`↔`corridor`, `door`↔`door`). The assembler refuses mismatched kinds.

**Assembly choice: Blender-first, JSON-authored.** Designers assemble in Blender using a small add-on (`tools/asset-pipeline/blender/kit_snap.py`, ~150 LOC) that:
1. On "place piece," instantiates a glTF-linked collection.
2. On "snap," picks nearest compatible socket pair within 0.5 m and applies the anti-parallel transform.
3. On export, writes a **level JSON** (not a baked mega-mesh) listing each placed piece + transform + which kit ref. This keeps pieces as `InstancedMesh` candidates at runtime.

Level JSON schema (`packages/content-schemas/src/level.ts`, zod):
```ts
export const PlacedPiece = z.object({
  kit: z.string(),                     // "KIT_corridor_straight_4m"
  transform: z.tuple([z.number()]).length(16), // mat4, column-major
  instanceGroup: z.string().optional() // batching key; defaults to `kit`
});
export const LevelDoc = z.object({
  id: z.string(),
  pieces: z.array(PlacedPiece),
  lights: z.array(LightDef),
  reverbZones: z.array(ReverbZone),
  spawns: z.array(SpawnPoint),
  triggers: z.array(TriggerVolume),    // scare beats / objective
  navmeshRef: z.string()               // "level_haunted.navmesh.bin"
});
```

---

## 2. VERTICAL-SLICE CORRIDOR BLOCKOUT

`signal_haunted_corridor` — dock entry → corridor (vent + flicker + objective node) → safe room. Target traversal 5–8 min with combat. Grid cells below = **4 m** (one corridor segment). North is +Z.

```
LEGEND
  ##  hull wall          ==  blast door (animated)      ░░  vent grate (swarmer spawn)
  D>  dock airlock       O   objective node (console)   ▓▓  reinforced safe-room door
  L+  bright light       L-  dim light    L~  FLICKER light (scripted)
  R:n reverb zone id     P:n player spawn (capsule dock) X:n enemy spawn
  ↑   intended player path / facing

                              +Z (north)
        col:  0     1     2     3     4     5
       ┌─────────────────────────────────────────┐
 row 6 │              ##  O  ##   <- OBJECTIVE BAY  │  R:3 (small room, dead reverb)
       │              ##  ↑  ##                     │
 row 5 │     ## == ## ##     ## ▓▓ ====== ▓▓ ##     │  ▓▓ = SAFE ROOM door (north exit)
       │     ##         L-      ##              ##   │  R:3
 row 4 │     ##  L~ FLICKER ZONE ##  X:2 Stalker   ##│  R:2 (long-tail metal reverb)
       │     ##         ░░ VENT  ##  (lurk start)   ││
 row 3 │     ##  L-     X:1 swarm ##                ##│  R:2
       │     ##                  ##  L-             ##│
 row 2 │     ##  CORRIDOR (4m wide here= 1.5 wall) ##│  R:1 (entry, wet/close reverb)
       │     ##         L+       ##                ##│
 row 1 │     ## == ##  AIRLOCK   ##                ##│  R:1
       │  P:1 D>  P:2 D>   (dock capsules)          │
 row 0 └─────────────────────────────────────────┘
                              -Z (south, Earth side)
```

### 2.1 Beat-by-beat annotations

| Zone | Lighting | Reverb (R:n) | Spawns | Scare beat |
|---|---|---|---|---|
| **Dock airlock (row 0–1)** | `L+` bright, stable. Safe-feeling. | R:1 wet/close (RT60 ~0.6s, small) | `P:1`,`P:2` capsule docks | None. Tutorial: flashlight toggle, weapon ready. Audio: hull groans, distant alarm (looping ambience bed). |
| **Entry corridor (row 2–3)** | `L+` → `L-` gradient as players move north. | R:1→R:2 transition volume | `X:1` swarmer (in vent ░░, dormant) | **Beat 1 (telegraph):** as the lead player crosses row 3 trigger, scripted *skittering* one-shot from the vent (`sfx_vent_skitter`), grate rattles. No enemy yet. Builds dread. |
| **Flicker zone (row 4)** | `L~` scripted flicker (see §2.2). Light fails to ~10% for 0.4–1.2s intervals. | R:2 long-tail metal (RT60 ~2.4s) | `X:2` Stalker lurk-start node (NOT visible; behind wall, in vent tube) | **Beat 2 (the spike, telegraphed):** Director arms when both players are in zone AND objective not yet started. Flicker intensifies → on a dark frame, swarmers burst from `░░` vent (`X:1` wave of 2). Combat. Stalker `X:2` begins `stalk-walk` approach from north but holds at LOS edge. |
| **Objective bay (row 6)** | `L-` dim, one console emissive `O`. | R:3 dead/small (RT60 ~0.4s, oppressive) | objective node `O` | **Beat 3 (objective + climax):** interacting with `O` starts a 12s "download." Director triggers Stalker `pounce` commit + 1 more swarmer from vent. Telegraphed by audio **2.5s pre-spike** (`sfx_director_warn` low sub-bass swell — the "tell"). |
| **Safe room (row 5–6 north, behind ▓▓)** | `L+` warm, stable. | R:3 but treated as "calm" bus (music stinger resolves) | — | Resolve recovery zone. Door `▓▓` seals on entry (animated), audio shifts to muffled (low-pass on ambience bus). Slice ends here. |

### 2.2 Flicker light script (data, not code)

`reverbZones`/`lights` in level JSON; flicker is a light with a `flickerProfile`:
```json
{ "id": "L~_flicker_main", "type": "spot", "intensity": 8.0,
  "flickerProfile": { "min": 0.08, "max": 1.0, "fps": 12,
    "pattern": "mmmaammma" } }   // Quake-style ramp string, m=mid a=bright
```
On Beat 2 the Director swaps `pattern` to an aggressive variant (`"aaaammmaaaa"`) for 3s, then to fully dark for 1 frame on the swarmer burst.

### 2.3 Reverb zones (audio engine consumes these)

```json
[{ "id": "R:1", "bounds": [...AABB...], "rt60": 0.6, "preset": "airlock_close", "bus": "ambience" },
 { "id": "R:2", "bounds": [...], "rt60": 2.4, "preset": "long_metal_hall", "bus": "ambience" },
 { "id": "R:3", "bounds": [...], "rt60": 0.4, "preset": "dead_room", "bus": "ambience" }]
```
Player listener interpolates convolver IR over a 0.5s crossfade when crossing AABB boundaries.

---

## 3. ASSET SHOPPING LIST (prioritized for M4)

Priority P0 = blocks the slice, P1 = needed for polish pass, P2 = nice-to-have. License column: **CC0** = redistributable in extractable browser build (safe), **AIGEN** = our generated (own it, license-clean if commercial tier), **CUSTOM** = our Blender work, **PAID** = must purchase + verify redistribution.

### P0 — blocks the slice

| Asset | Source / link | License | Notes |
|---|---|---|---|
| **Modular sci-fi kit base** (greyboxing + reference) | Kenney *Modular Space Kit* / *Space Station Kit* — https://kenney.nl/assets/modular-space-kit , https://kenney.nl/assets/space-station-kit | **CC0** | Use as blockout + to bootstrap our trim kit. Single-material/colormap style aligns with our 3-material rule. New (Feb 2026) Kenney modular sci-fi kit also CC0. **Ship our retopo'd derivative**, not Kenney files verbatim, for art consistency. |
| **Trim-sheet textures** (hull/greeble) | AmbientCG sci-fi/metal PBR — https://ambientcg.com/ (filter Metal/SciFi). Poly Haven textures — https://polyhaven.com/textures | **CC0** | Source PBR sets, then **author 2 custom trim sheets** in Substance/Blender atlasing AmbientCG metals. This is the main `MAT_TRIM_A/B` work. |
| **HDRI (env light + dock window)** | Poly Haven HDRIs — https://polyhaven.com/hdris (industrial/studio + a space/starfield); AmbientCG HDRIs — https://ambientcg.com/ | **CC0** | Use a dim industrial HDRI as fill IBL inside ship; starfield HDRI visible through dock airlock window. Ship at 1K/2K KTX2, not 8K. |
| **Stalker base mesh** | Quaternius *Ultimate Monsters* (50 animated, FBX/blend) — https://quaternius.com/packs/ultimatemonsters.html ; bundle https://poly.pizza/bundle/Ultimate-Monsters-Bundle-5oyGWAmOB6 | **CC0** | Pick a tall humanoid-ish biped as **proxy/base** for greybox + early anim retarget. Final Stalker is CUSTOM/AIGEN (see §5) — Quaternius unblocks M4 immediately. |
| **Player capsule (exterior) + FPS arms** | Quaternius *Ultimate Animated Character* — https://quaternius.com/packs/ultimatedanimatedcharacter.html | **CC0** | Capsule = simple custom Blender mesh (CUSTOM). Arms: Quaternius rigged char, hide body, keep arms; or AIGEN gloved-hand arms. |
| **Pulse rifle** | Sketchfab CC0/CC-BY game-ready rifles (verify per-model license!): https://sketchfab.com/tags/sci-fi-weapon — e.g. "Low-Poly Sci-fi Rifle" by Qubzy https://sketchfab.com/3d-models/low-poly-sci-fi-rifle-341f83e22a41423096ea6a3a2032c64e | **CC0/CC-BY (verify)** OR **AIGEN** | If only CC-BY available, prefer AIGEN (Meshy/Tripo, §below) to avoid attribution-in-binary friction. Must be <8k tris LOD0, separable muzzle for flash socket. |
| **Audio pack** | ElevenLabs, baked at build time (owned by audio spec) | n/a | Not in this asset list except as a manifest hook. |

### P1 — polish

| Asset | Source | License | Notes |
|---|---|---|---|
| Greeble props (consoles, pipes, cables, crates) | Kenney space kits (CC0) + custom kitbash | CC0/CUSTOM | `PROP_*`, snap to `S_GREEBLE_*`. |
| Vent grate / door SFX-driving meshes | Custom Blender | CUSTOM | Already in kit list. |
| Decal atlas (blood, warning stripes, signage) | AmbientCG decals + custom paint | CC0/CUSTOM | `MAT_DECAL`. |
| Muzzle flash / impact VFX sprites | Kenney particle packs (CC0) | CC0 | Sprite-sheet, additive. |

### P2 — AI-gen / generated where useful

| Asset | Source | License | Notes |
|---|---|---|---|
| Hero pulse rifle (final) | **Meshy 6** (text→3D, auto-rig, low-poly mode, commercial on Pro) — https://www.meshy.ai/features/text-to-3d ; or **Tripo v3.1** (fast base mesh, no native rig) — https://www.tripo3d.ai/ | **AIGEN (paid tier = commercial rights)** | Generate base → retopo in Blender → our trim materials. Verify the tier's commercial license before shipping; keep the receipt/license export in `assets-src/LICENSES.md`. |
| Stalker final mesh | Meshy/Tripo base → heavy custom rework (§5) | AIGEN+CUSTOM | See creature brief. |

**License hygiene rule:** every shipped asset gets a row in `assets-src/LICENSES.md` (source URL, license, date pulled, any required attribution). CI fails if a `.glb` in `assets-dist/` has no provenance entry (matched by basename). **No Synty** content anywhere unless a written license is filed. CC-BY is allowed only if attribution is rendered in an in-game credits screen AND noted in LICENSES.md — but **prefer CC0/AIGEN** to keep the extractable browser build clean.

---

## 4. ASSET OPTIMIZATION CI PIPELINE

Toolchain (versions current as of 2026-06): `@gltf-transform/cli` + `@gltf-transform/functions` (v4.x line), `meshoptimizer` ≥1.0.1 (provides meshopt + KTX2/Basis encode via `toktx`/`basisu`), `gltfpack` (optional fast path), KTX-Software `toktx`/`basisu`. Driver scripts in Node ESM call the **JS API** for determinism in CI (CLI shown for reference/dev).

### 4.1 Per-asset routing (`pipeline.config.json`)

```json
{
  "budgets": {
    "slice_first_load_mb": 25,
    "per_glb": {
      "kit_piece":   { "maxTris": 8000,  "maxDrawCalls": 4,  "maxTexMemMB": 6  },
      "weapon":      { "maxTris": 9000,  "maxDrawCalls": 3,  "maxTexMemMB": 8  },
      "creature":    { "maxTris": 25000, "maxDrawCalls": 6,  "maxTexMemMB": 16 },
      "prop":        { "maxTris": 3000,  "maxDrawCalls": 2,  "maxTexMemMB": 3  }
    },
    "scene_total": { "maxDrawCalls": 150, "maxTris": 600000, "maxTexMemMB": 256 }
  },
  "codec": {
    "default": "meshopt",
    "dracoWhenBytesOver": 1572864,
    "ktx2": {
      "uastcSlots": ["normalTexture", "emissiveTexture", "metallicRoughnessTexture", "occlusionTexture"],
      "etc1sSlots": ["baseColorTexture"],
      "uastc": { "level": 4, "rdo": 4.0, "zstd": 18 },
      "etc1s": { "quality": 200 }
    },
    "lods": [{ "ratio": 1.0, "error": 0.0 }, { "ratio": 0.5, "error": 0.01 }, { "ratio": 0.25, "error": 0.03 }]
  }
}
```

Routing logic: default geometry codec is **meshopt** (decode is cheaper, plays well with WebGPU). Switch to **Draco** only when a single `.glb`'s post-meshopt geometry exceeds `dracoWhenBytesOver` (size-dominated assets like the command-centre shell). Textures: **UASTC** for normals/ORM/emissive (the `uastcSlots`), **ETC1S** for basecolor filler.

### 4.2 CLI reference commands (dev / one-off)

```bash
# 0. Weld + dedupe + prune BEFORE simplify (required for clean LODs)
gltf-transform optimize in.glb step1.glb \
  --compress false --texture-compress false   # geometry cleanup only first

# 1. LOD generation via simplify (run 3x into a single multi-LOD glb or 3 files)
gltf-transform weld step1.glb welded.glb
gltf-transform simplify welded.glb lod1.glb --ratio 0.5 --error 0.01
gltf-transform simplify welded.glb lod2.glb --ratio 0.25 --error 0.03

# 2. Geometry compression (meshopt default)
gltf-transform meshopt welded.glb geo.glb --level high

#    (Draco branch — only when size-dominated)
# gltf-transform draco welded.glb geo.glb --method edgebreaker

# 3. Textures — UASTC for normals/ORM/emissive
gltf-transform uastc geo.glb tex1.glb \
  --slots "{normalTexture,metallicRoughnessTexture,occlusionTexture,emissiveTexture}" \
  --level 4 --rdo --rdo-lambda 4 --zstd 18 --mipmaps

#    ETC1S for basecolor filler
gltf-transform etc1s tex1.glb final.glb \
  --slots "{baseColorTexture}" --quality 200 --mipmaps
```

### 4.3 `scripts/optimize.mjs` (JS API, CI-deterministic — sketch)

```js
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { weld, dedup, prune, simplify, meshopt, draco, textureCompress } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import cfg from '../pipeline.config.json' assert { type: 'json' };

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS); // toktx/encoder deps wired here
export async function optimize(inPath, outPath, kind) {
  const doc = await io.read(inPath);
  await doc.transform(
    dedup(), prune(), weld(),
    // LODs are emitted as separate files in CI; here we keep LOD0 + attach KHR_materials_lod if used
    simplify({ simplifier: MeshoptSimplifier, ratio: 1.0, error: 0.0 }),
    textureCompress({ targetFormat: 'ktx2', slots: /baseColorTexture/, encoder: 'etc1s', quality: cfg.codec.ktx2.etc1s.quality }),
    textureCompress({ targetFormat: 'ktx2', slots: /(normal|metallicRoughness|occlusion|emissive)Texture/, encoder: 'uastc', level: cfg.codec.ktx2.uastc.level, rdo: cfg.codec.ktx2.uastc.rdo, zstd: cfg.codec.ktx2.uastc.zstd }),
  );
  const sizeBefore = (await io.writeBinary(doc)).byteLength;
  await doc.transform(sizeBefore > cfg.codec.dracoWhenBytesOver
    ? draco({ method: 'edgebreaker' })
    : meshopt({ level: 'high' }));
  await io.write(outPath, doc);
}
```

### 4.4 `scripts/budget-check.mjs` — the CI gate

Parses `gltf-transform inspect --format json` per asset, asserts budgets, exits non-zero on violation.

```bash
gltf-transform inspect assets-dist/kit/KIT_corridor_straight_4m.glb --format json > /tmp/inspect.json
node tools/asset-pipeline/scripts/budget-check.mjs --kind kit_piece --report /tmp/inspect.json
```

```js
// budget-check.mjs (core asserts)
const r = JSON.parse(fs.readFileSync(argv.report));
const b = cfg.budgets.per_glb[argv.kind];
const tris = r.meshes.properties.reduce((a,m)=>a + (m.glPrimitives ?? m.triangles ?? 0), 0);
const drawCalls = r.meshes.properties.reduce((a,m)=>a + m.instances * m.primitives, 0);
// texMem: sum decoded GPU footprint, NOT file size: w*h*bytesPerTexel*1.333 (mips)
const texMemMB = r.textures.properties.reduce((a,t)=>{
  const bpp = t.compression?.includes('UASTC') ? 1 : t.compression?.includes('ETC1S') ? 0.5 : 4;
  return a + (t.resolution[0]*t.resolution[1]*bpp*1.3333)/1048576;
}, 0);
assert(tris <= b.maxTris, `tris ${tris} > ${b.maxTris}`);
assert(drawCalls <= b.maxDrawCalls, `drawCalls ${drawCalls} > ${b.maxDrawCalls}`);
assert(texMemMB <= b.maxTexMemMB, `texMem ${texMemMB.toFixed(1)}MB > ${b.maxTexMemMB}MB`);
```

CI step (Turborepo task `asset:build` then `asset:budget`), runs on PRs touching `assets-src/**` or `tools/asset-pipeline/**`. Also asserts **scene total** by summing all slice `.glb`s + the first-load 25 MB target.

### 4.5 Manifest + hashing

`build-manifest.mjs` content-hashes each `assets-dist/**.glb`/`.ktx2`, rewrites to `name.<hash>.glb`, writes `manifest.json` (`{ logicalName -> hashedUrl, bytes, kind }`). Uploaded to R2 with `Cache-Control: public, immutable, max-age=31536000`. Client fetches `manifest.json` (short cache) then content-addressed assets.

---

## 5. STALKER CREATURE DESIGN BRIEF

### 5.1 Silhouette & art direction (original, Alien-adjacent but IP-safe)

- **Read at distance:** tall (2.4 m standing, hunches to ~1.8 m), gaunt **digitigrade** biped; over-long forelimbs that let it drop to a **quadruped sprint**. Elongated eyeless cranium that tapers back (NO biomechanical tube-skull, NO inner second jaw — those are the H.R. Giger / Xenomorph tells to **avoid**).
- **Surface:** wet, translucent grey-violet dermis over visible cabling-musculature; bioluminescent pulse along the spine that **brightens when hunting** (doubles as the player's only "it's coming" visual tell in the dark, pairs with the audio Director). Emissive on `MAT_TRIM_B`-style channel.
- **Sensing:** echolocation flaps instead of eyes → justifies it reacting to player *noise/flashlight*, supports the audio fear system.
- **IP-safety note:** brief any AI-gen prompts and concept art to **avoid**: smooth black carapace, dorsal back-tubes, telescoping inner jaw, segmented tail blade, banana-head. **Lean toward**: pale translucent flesh, exposed muscle/cable, antennae/echolocation, asymmetric limb damage states. Keep a one-page "do/don't" reference in `assets-src/creatures/stalker/ARTDIR.md`.

### 5.2 Pre-segmented limb layout for dismemberment

Mesh is authored as **separate skinned submeshes per severable part**, each with its own cap geometry (the "stump" interior) so a cut reveals geometry, not a hole. Parts and their sever joints:

| Part submesh | Sever at joint | Cap mesh | Gameplay effect on loss |
|---|---|---|---|
| `STK_head` | `neck_01` | `cap_neck` | Death (decapitation). |
| `STK_arm_L` / `STK_arm_R` | `shoulder_L/R` | `cap_shoulder_L/R` | Loses pounce; switches to swipe-only. |
| `STK_leg_L` / `STK_leg_R` | `hip_L/R` | `cap_hip_L/R` | One leg → limp/stagger gait; **both** → `crawl-when-legless`. |
| `STK_torso` (core) | — | — | Hosts spine emissive; high-damage zone. |
| `STK_jaw` | `jaw_01` | `cap_jaw` | Cosmetic gore; disables bite SFX. |

Severing = host-authoritative: on lethal hit to a part's collider, host hides that submesh, spawns the matching `cap_*`, spawns a detached physics chunk (Rapier, host-only), and broadcasts the part-state bitmask to clients. Limb colliders are separate Rapier compound children so hit detection is per-part.

### 5.3 Rig

- **Base:** humanoid-compatible skeleton so we can retarget standard humanoid clips, BUT with **added digitigrade leg roll bones** and a **3-bone tail/spine-extension** that standard humanoid retargeting ignores (hand-animated/procedural). 
- **Toolchain:** **AccuRIG 2.0** (free, ActorCore) — https://actorcore.reallusion.com/auto-rig — for the 19-joint humanoid base + finger rig auto-fit on the AIGEN/custom mesh; export FBX. Then in Blender add the extra digitigrade + spine-tip + jaw bones and skin the severable submeshes. **Mixamo** (https://www.mixamo.com) as a fallback/secondary source for placeholder humanoid clips during M4. Final unique clips hand-animated in Blender.
- For M4 placeholder speed, retarget a Quaternius *Ultimate Monsters* biped's clips onto the rig to greybox before custom animation lands.

### 5.4 Animation set (M4 minimum)

| Clip | Use | Loop | Notes |
|---|---|---|---|
| `idle_lurk` | Hidden/waiting in vent or shadow | yes | Subtle breathing, spine glow low. |
| `stalk_walk` | Slow hunting approach (Beat 2) | yes | Digitigrade, hunched, head-tracks loudest player. |
| `sprint_quad` | Commit / charge | yes | Drops to all-fours; fast. |
| `investigate` | Reacts to noise/flashlight, no LOS | yes | Head sweep, echolocation flaps. |
| `pounce` | Climax attack (Beat 3) | no | Anticipation→leap→land; 2.5s telegraph window owned by Director audio. |
| `swipe` | Arm-loss fallback melee | no | Used when one/both arms intact but pounce disabled. |
| `stagger` | Hit reaction / dismember flinch | no | Plays on part sever. |
| `crawl_legless` | Both legs gone | yes | Drags torso with arms; slow, still lethal. |
| `death` | Core/head kill | no | Collapse; spine glow fades out. |

Animation events (glTF `extras` markers): `ev_pounce_commit`, `ev_swipe_hit`, `ev_footstep_L/R` (drive audio + Director), `ev_glow_peak`.

### 5.5 Creature data schema (`packages/content-schemas/src/creature.ts`)

```ts
export const PartState = z.enum(['intact','severed']);
export const StalkerState = z.object({
  head: PartState, armL: PartState, armR: PartState,
  legL: PartState, legR: PartState, jaw: PartState
}); // serialized as a 6-bit mask over the wire
export const CreatureDef = z.object({
  id: z.literal('stalker'),
  hpCore: z.number(), partHp: z.record(z.number()),
  speed: z.object({ stalk: z.number(), sprintQuad: z.number(), crawl: z.number() }),
  clips: z.array(z.string()),
  navAgent: z.object({ radius: z.number(), height: z.number() }) // recast agent
});
```

---

## 6. FIRST-LOAD BUDGET & STREAMING

### 6.1 First-load target (M4 slice)

**Hard cap: ≤ 25 MB compressed over the wire** for "playable in the dock" (gate = `slice_first_load_mb`). Rough allocation:

| Bucket | Budget | Streamed in first load? |
|---|---|---|
| JS/WASM (engine, Rapier, recast, basis/draco decoders) | ~6 MB | yes (cached after first visit) |
| Kit meshes (8 pieces, meshopt+KTX2) | ~4 MB | yes |
| Trim/decal textures (3 mats, KTX2) | ~7 MB | yes |
| Stalker + weapon + arms (KTX2, LOD0 only at load) | ~4 MB | yes |
| HDRI (1–2K KTX2) | ~1.5 MB | yes |
| Critical audio (Beat 1–3 one-shots + entry ambience, from audio pack) | ~2.5 MB | yes (scares must never await network) |
| **Total first-load** | **~25 MB** | |

### 6.2 Streaming approach

1. **Manifest-first:** fetch `manifest.json`, then parallel-fetch only **first-load bucket** assets (the dock + corridor LOD0 + Beat 1–3 audio). Show capsule-launch loading sequence as cover.
2. **Tiered priority:** (a) airlock/dock + arms/weapon, (b) corridor + flicker zone + Stalker, (c) safe room + objective + LOD1/2 + non-critical ambience tails. Fetched on a priority queue as the host signals "all players docked."
3. **Audio is never on a scare's critical path** (locked): all Beat audio in bucket (a)/(b), fully decoded and resident before the player can reach the trigger. Director only *plays* resident buffers.
4. **HTTP/2 multiplexed** from R2/Cloudflare; content-addressed immutable URLs → warm cache on revisit reduces effective first-load to JS/WASM + manifest.
5. **Host streams level JSON** (tiny) over DataChannel to joiners; joiners fetch the same hashed assets from CDN (not relayed peer-to-peer).
6. **LOD streaming:** load LOD0 for in-view kit pieces; LOD1/2 lazy. Creature loads LOD0 immediately (it gets close).

---

## Open decisions surfaced

- Final pulse-rifle source: confirm a specific **CC0** Sketchfab model's license per-file, else commit to AIGEN (Meshy Pro) — affects LICENSES.md and whether a credits screen is required.
- Whether to emit multi-LOD in a single `.glb` via `KHR_materials_lod`/`MSFT_lod` vs. separate files + runtime swap (recommend separate files for simpler streaming priority).

## Sources
- [glTF Transform](https://gltf-transform.dev/), [@gltf-transform/cli](https://www.npmjs.com/package/@gltf-transform/cli), [simplify fn](https://gltf-transform.dev/modules/functions/functions/simplify), [CHANGELOG](https://github.com/donmccurdy/glTF-Transform/blob/main/CHANGELOG.md)
- [gltfpack / meshoptimizer](https://meshoptimizer.org/gltf/), [gltfpack npm](https://www.npmjs.com/package/gltfpack)
- [Kenney Modular Space Kit](https://kenney.nl/assets/modular-space-kit), [Space Station Kit](https://kenney.nl/assets/space-station-kit)
- [AmbientCG](https://ambientcg.com/), [Poly Haven HDRIs](https://polyhaven.com/hdris), [Poly Haven Textures](https://polyhaven.com/textures), [Poly Haven License](https://polyhaven.com/license)
- [Quaternius Ultimate Monsters](https://quaternius.com/packs/ultimatemonsters.html), [Ultimate Animated Character](https://quaternius.com/packs/ultimatedanimatedcharacter.html), [poly.pizza bundle](https://poly.pizza/bundle/Ultimate-Monsters-Bundle-5oyGWAmOB6)
- [Meshy Text-to-3D](https://www.meshy.ai/features/text-to-3d), [Tripo3D](https://www.tripo3d.ai/)
- [AccuRIG auto-rig](https://actorcore.reallusion.com/auto-rig), [AccuRig 2.0 (CG Channel)](https://www.cgchannel.com/2025/07/rig-and-animate-3d-characters-for-free-with-accurig-2-0/)
- [Sketchfab sci-fi weapon tag](https://sketchfab.com/tags/sci-fi-weapon), [Low-Poly Sci-fi Rifle (Qubzy)](https://sketchfab.com/3d-models/low-poly-sci-fi-rifle-341f83e22a41423096ea6a3a2032c64e)

## Tasks (toward M4 vertical slice)

- **[M0] Scaffold tools/asset-pipeline package + pipeline.config.json with budgets & codec routing** — _done when:_ pnpm i installs @gltf-transform/cli+functions, meshoptimizer, KTX-Software; `pnpm asset:build --help` runs; pipeline.config.json validates against a zod schema.
- **[M1] Author 2 trim sheets (MAT_TRIM_A hull, MAT_TRIM_B greeble) + MAT_DECAL atlas from AmbientCG/Poly Haven CC0 sources** — _done when:_ 3 PBR material sets (BaseColor/Normal/ORM[+Emissive]) at 2K; every kit UV island lands on these; LICENSES.md rows filed for each source. _(deps: CC0 PBR sources pulled into assets-src)_
- **[M1] Build 8 modular kit meshes (straight/corner/doorway/door/vent_grate/vent_tube/room_small/saferoom) on shared materials** — _done when:_ Each .glb under per-piece tri budget, uses only MAT_TRIM_A/B/DECAL, has named S_* socket empties with correct extras, and a _COL collider node. _(deps: trim sheets)_
- **[M1] Blender kit_snap add-on: place/snap/export-to-level-JSON** — _done when:_ Designer can snap two pieces by compatible socket kind within 0.5m; export writes LevelDoc JSON validating against content-schemas/level.ts. _(deps: kit meshes + sockets)_
- **[M2] Assemble signal_haunted_corridor level (dock->corridor->safe room) per blockout with lights, reverb zones, spawns, triggers** — _done when:_ LevelDoc validates; contains R:1-3 reverb zones, L~ flicker light, P:1/P:2 + X:1/X:2 spawns, 3 scare-beat trigger volumes, navmeshRef; loads in engine greybox. _(deps: kit_snap add-on)_
- **[M2] Implement optimize.mjs (weld/dedup/prune/simplify/meshopt|draco/KTX2 UASTC+ETC1S) + LOD0/1/2 emission** — _done when:_ Running it on a kit piece outputs LOD0/1/2 .glb with KTX2 textures (UASTC normals/ORM, ETC1S basecolor) and meshopt geometry; Draco branch triggers above 1.5MB. _(deps: asset-pipeline scaffold)_
- **[M2] Implement budget-check.mjs CI gate parsing gltf-transform inspect (tris/draw-calls/tex-mem) + scene total + first-load 25MB** — _done when:_ CI fails with a clear message when any per-glb or scene budget is exceeded; passes on the compliant slice; runs in Turborepo asset:budget task on PRs touching assets-src. _(deps: optimize.mjs)_
- **[M2] Build/manifest: content-hash assets-dist, write manifest.json, wire R2 upload with immutable cache headers** — _done when:_ manifest.json maps logicalName->hashedUrl+bytes+kind; hashed assets uploaded to R2; client can resolve+fetch via manifest. _(deps: optimize.mjs)_
- **[M3] Stalker mesh: generate base (Meshy/Tripo or Quaternius proxy) -> retopo -> pre-segmented severable submeshes + cap meshes** — _done when:_ head/armL/armR/legL/legR/jaw/torso are separate skinned submeshes each with a cap_* mesh; under 25k tri creature budget; provenance/license filed. _(deps: ARTDIR.md do/dont brief)_
- **[M3] Rig Stalker via AccuRIG 2.0 humanoid base + Blender digitigrade/spine-tip/jaw bones; skin severable parts** — _done when:_ Humanoid clips retarget cleanly; extra bones drive digitigrade legs/tail/jaw; each severable submesh skinned to its parent chain so caps appear on sever. _(deps: Stalker mesh)_
- **[M3] Produce M4 animation set (idle_lurk, stalk_walk, sprint_quad, investigate, pounce, swipe, stagger, crawl_legless, death) with anim events** — _done when:_ All 9 clips export in the creature .glb with ev_pounce_commit/ev_swipe_hit/ev_footstep/ev_glow_peak markers; greybox retarget acceptable for M4. _(deps: Stalker rig)_
- **[M3] Source/finalize pulse rifle, FPS arms, player capsule, HDRI, weapon muzzle socket; run through pipeline** — _done when:_ All assets CC0/AIGEN with LICENSES.md rows; rifle has muzzle flash socket + LOD0 under budget; arms+capsule load; HDRI shipped as 1-2K KTX2. _(deps: asset pipeline)_
- **[M4] Wire streaming tiers + first-load budget enforcement (dock/arms/weapon -> corridor/Stalker -> safe room/LODs) with audio resident before triggers** — _done when:_ First-load <=25MB measured; Beat 1-3 audio buffers resident before reachable triggers; LOD1/2 lazy-load; verified on WebGL2 fallback at 60fps in the slice. _(deps: manifest, level, creature, audio pack)_

