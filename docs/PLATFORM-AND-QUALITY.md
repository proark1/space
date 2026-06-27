# SIGNAL LOST — Multi-Platform & Quality-Tier Plan

> ⚠️ **REGISTER CHANGED (2026-06-27): the game is LOW-POLY / PS1-retro, not photoreal.** Photoreal-specific parts of this doc (SSGI, scene-wide SSR, 4K photoreal kits, Kitbash3D hero ship, the 'looks AAA' bar) are **superseded** — see [LOW-POLY-PIVOT.md](LOW-POLY-PIVOT.md) for the authoritative reconciliation. The renderer *architecture* still holds; only the target image + heavy-GI reliance change.


_Browser (fast iteration + free demo) + PC/Mac Steam desktop client (premium), from one engine. Low/Mid/High/Ultra quality ladder. Architecture to bake in from M-LOOK. Compiled 2026-06-27._


## Headline strategy

SIGNAL LOST is ONE app — a single Three.js r185 WebGPU engine that runs in the browser (free web demo, fast iteration) and ships wrapped as a PC + Mac desktop Steam client (the paid "real product"), with no second renderer and no second netcode. We wrap desktop in Electron (bundled Chromium = guaranteed, consistent WebGPU on Win + Mac) rather than Tauri, whose macOS WKWebView does not enable WebGPU by default. Quality scales on a four-tier ladder — LOW (WebGL2/compat safety floor), MID (WebGPU baseline), HIGH (WebGPU good-GPU, the realistic browser ceiling), ULTRA (desktop-only: top GPU + bundled 4K asset pack) — with a live render-scale governor holding 60fps inside whichever tier you land on. Cross-play is unified for everyone: browser and desktop run identical host-authoritative WebRTC + room-code netcode, so a browser player and a Steam player share a room with zero special-casing (no Steam Datagram Relay, which would fork the netcode and break cross-play). To be clear for the user: "browser = lower quality" is FALSE as a rule — browser and desktop run the identical renderer; the browser is merely capped at HIGH by the player's GPU and the web download budget, while the desktop client unlocks ULTRA, guarantees a consistent HIGH via bundled WebGPU, and ships a bigger local 4K asset pack. Desktop's only legitimate advantages are bundled-consistent WebGPU, more VRAM/memory headroom, a local-filesystem high-res asset pack with no download limit, and Steam integration — all data/capability flags, never engine forks.


## Wrapper decision

Electron (electron-forge) + ceifa/steamworks.js — bundled Chromium gives identical, guaranteed WebGPU (Dawn) on Win + Mac and the most mature Steam bindings; runner-up is Tauri v2, revisit only if/when macOS WKWebView ships WebGPU on-by-default AND install size becomes a real KPI (cheap to swap because everything codes against the Platform interface).


## Quality-tier ladder

| Tier | Platform | Headline settings |
|---|---|---|
| **LOW** | Browser + Desktop (safety floor) | WebGL2 / WebGPU compat-mode; SMAA, no SSR/SSGI, 512 shadows + 1 cascade, analytic fog, 1K ETC1S textures, render-scale 0.6-0.85, target 60fps (degrade floor 45) |
| **MID** | Browser + Desktop (WebGPU baseline) | WebGPU core; SMAA+optional TAA, 2x MSAA, 1024 shadows + 2 cascades, raymarch fog 12 steps, no SSR/SSGI, 2K web-pack textures, render-scale 0.7-1.0 |
| **HIGH** | Browser ceiling + Desktop | WebGPU core; TRAA, 4x MSAA, 1024-2048 shadows + 3 cascades, SSR on (half-res), full-res GTAO, fog 24 steps, 2K-4K web-pack textures, render-scale 0.8-1.0 — the realistic browser max |
| **ULTRA** | Desktop Steam client ONLY (platform-gated) | WebGPU core; TRAA+TAAU, 4x MSAA, 2048 shadows + 4 cascades, SSR full-res, SSGI ON (the one Ultra-exclusive effect), fog 32-48 steps, 4K UASTC desktop pack, render-scale 0.9-1.0, optional 90/120 unlock |

## Architecture to bake in NOW (avoid expensive retrofit)

- Create packages/platform NOW with a Platform + Capabilities + SteamService interface and BOTH BrowserPlatform and a DesktopPlatform stub (even before Electron exists); every package codes against @sl/platform from the first commit and asks platform.caps, never `if (electron)`.
- Add a lint rule forbidding any package except apps/desktop/preload from importing electron, process.versions, window.__TAURI__, or steamworks.js — the single typed contextBridge surface (window.__SL_NATIVE__) with contextIsolation:true + nodeIntegration:false is the only native boundary.
- Replace the 3-value RenderTier with a 4-tier QualityTier ('low'|'mid'|'high'|'ultra') and turn DEGRADE[tier] into one frozen RenderProfile/QualityProfile object that EVERY render subsystem reads (Renderer, PostStack, GltfPipeline/Ktx2, lighting/shadows, particles, decals, sector streamer, LOD) — no subsystem re-detects the GPU or platform.
- Keep the asset axis and the visual axis orthogonal and agree the resolver signature now: resolveTier(caps: Capabilities, gpu: GpuProbe) => QualityTier, where maxAssetTier/memoryClass/bundledWebGPU are platform inputs and effects/shadow-res are GPU inputs; effectiveTier = clamp(gpuTier, byAssetTier, byMemory).
- Build the tiered asset pipeline with TWO orthogonal axes in variant identity from day one — TIER (low/mid/high) x PLATFORM (web/desktop) plus LOD — emitted by one deterministic gltf-transform build from a single git-LFS source tree authored at max (4K) fidelity; assets-dist is gitignored and CI-regenerated.
- Ship a variant-keyed manifest (schemaVersion:2) indexing variants[platform][tier][lod] with BOTH `bytes` (download) and `gpuBytes` (VRAM) per variant, plus sector + critical fields; a selectVariant(id, platform, tier, lod) loader resolves it (R2 over HTTP/2 on web, local FS on desktop) — never hardcode asset paths.
- Route all asset loading through platform.assetBaseUrl() so the web-CDN vs desktop-file:// HD-pack split is a config flip, not a refactor; codec routing lives as data in pipeline.config.json keyed by (tier, slot): ETC1S for web basecolor/filler, UASTC always for normals/ORM/emissive and all desktop-high.
- Build the AdaptiveGovernor (evolve BudgetMonitor) as render-scale-first DRS with hysteresis, holding 60fps WITHIN the active profile, publishing live nudges on a separate RuntimeQuality channel; wire TRAA/TAAU as the Mid+ AA path early so DRS can drop render-scale without looking bad.
- Add a PlatformBridge/SteamService with a shared achievement/stat ID enum and a single joinRoom(code) entry function; Steam Cloud, achievements, Rich Presence, Invite-to-Lobby (carries only the room code) and Steam Input are no-ops on web and real on desktop — serialize settings + meta-progression through bridge.saveMeta/loadMeta once, platform-agnostic.
- Tag every quality setting as live-changeable vs restart-required (backend, MSAA, texture-pack, cascades = restart) in profile metadata now, and split the CI budget gate (web asserts download bytes first-load <=180MB / per-sector <=55MB AND VRAM; desktop asserts VRAM + install-size only) from the start.

## Impact on M-LOOK (keep it small, but make it tier- and platform-aware)

- Make M-LOOK consume the RenderProfile object (not hardcoded constants) with ?tier=low|mid|high and ?gl=2 force flags, proving the WebGL2/Low render AND a Mid/High WebGPU render in the same harness; Ultra fields exist but are stubbed (no wrapper yet) so the matrix is complete and promotes verbatim into packages/engine.
- M-LOOK's KTX2/meshopt step must emit at least two cells of the variant matrix for the corridor trim + hero ship — web/mid (web-lite: ETC1S basecolor, UASTC normals, 1024) AND desktop/high (desktop-full: UASTC, 2048-4096) — and the lookdev loader must resolve them via a real mini-manifest through selectVariant, proving the schema and loader, not two loose files on disk.
- Capture both web-lite and desktop-full interior frames cold; the visible delta (sharper normals/larger textures, identical lighting+post) is the day-one proof that desktop's win is asset-driven, not a second renderer.
- Stand up the zero-dep packages/platform interface + BrowserPlatform + DesktopPlatform stub and route M-LOOK's asset loading through platform.assetBaseUrl() and the RenderProfile — but do NOT build the Electron app, Steam bindings, governor tuning, or full 4-pack matrix yet; M-LOOK stays small (interfaces + 2 variant cells + tier-driven lookdev).
- Optionally add a thin desktop-wrapper smoke test only as a stretch: a stub DesktopPlatform that returns hd/high caps so the Ultra code path is exercised in dev — defer the real Electron shell, signing, and steamworks.js to M-LOOK+1 to keep the harness throwaway-small.

## Roadmap impact

- M-LOOK: bake in packages/platform interfaces (+ Browser/Desktop-stub), the 4-tier QualityTier + frozen RenderProfile read by all lookdev subsystems, the dual-axis asset pipeline emitting web/mid + desktop/high cells via a mini variant-keyed manifest, and platform.assetBaseUrl() loading — all proving the fork without building the Electron shell.
- M0-M1 (engine promotion): the RenderProfile, AssetLoader/selectVariant, manifest schema (schemaVersion:2), and PlatformBridge move verbatim from M-LOOK harness into packages/engine + packages/platform; content-pipeline gains the full 3-axis (tier x platform x lod) variant matrix and split CI budget gates.
- M2-M4: AdaptiveGovernor (render-scale DRS + secondary degrade ladder) and the 3-stage auto-detect (platform gate -> adapter/compat probe -> cached 3s micro-benchmark) land alongside the post stack; TRAA/TAAU wired into the post graph; per-sector streaming masked behind airlock/sector-boundary cinematics as Ship 1 content fills in.
- Mid roadmap (around M4-M5, before paid launch): stand up apps/desktop (Electron + electron-forge), the preload contextBridge, and steamworks.js — first signed Windows + notarized Mac universal builds and a Steam depot upload (~1.5-2.5 weeks, mostly one-time signing/CI plumbing); add the desktop/hd asset pack as a build-config flip; verify the Windows build under Proton for Steam Deck/Linux (no native Linux depot).
- Day-one/parallel (not gated on engine): Steam store page + Wishlist enabled, the AI-content disclosure survey (Tier-1 Pre-Generated, Audio category) filled and legal-reviewed, and a free Steam Demo app mirroring the web demo content cap — these are launch-blockers to set up early.
- M5-M7: SSGI (the single Ultra-exclusive effect) and the desktop 4K UASTC pack finalize the Ultra tier; v1 Steam feature set (Cloud saves, ~10-15 achievements, Rich Presence, Invite-to-Lobby carrying the room code, Steam Input) ships with the paid desktop product; defer leaderboards/cards/workshop to post-launch.

## Open decisions

- **Is the web build a permanently-free capped demo only, or can it unlock the full paid experience in-browser?**
  - _Recommendation (advisory):_ Keep the FULL paid experience desktop-only on Steam; web stays a permanently-free capped demo.
  - ✅ **USER DECISION (2026-06-27): FULL game free in the browser.** Web plays the entire campaign free (≤High tier, web-lite assets — the 4K pack is never served to a browser, so no 4K piracy + per-ship streaming keeps the first-load budget sane). The Steam PC/Mac client is the **premium paid** version (Ultra + 4K, native perf/consistency, achievements/Cloud/friends, offline, support-the-devs). ⚠️ Maximizes reach + streamer virality but weakens direct sales — make the Steam premium visibly worth it; revisit secondary monetization (cosmetics / supporter edition / DLC ships). Cross-play keeps free-web and paid-Steam players in the same rooms.
- **Does the desktop client default to ULTRA or auto-detect down from a HIGH/ULTRA candidate?**
  - _Recommendation:_ Default to Auto: desktop unlocks ULTRA in the candidate set but the 3s micro-benchmark + governor still demote to HIGH/MID if the actual silicon can't hold 60fps. Never force ULTRA on a weak desktop GPU; expose a manual ULTRA override with a 'may not hold 60fps' warning.
- **When should the real Electron wrapper + Steam integration land relative to engine milestones?**
  - _Recommendation:_ Reserve apps/desktop and pin an Electron version early, but build the real shell around M4-M5 (before paid launch), NOT in M-LOOK. The Platform interface lets all earlier work proceed against a stub, so the wrapper is ~2 weeks of mostly one-time signing/CI plumbing slotted in late without blocking gameplay.
- **Web meta-progression/save backend: IndexedDB-only, or IndexedDB + Cloudflare R2/KV per-account to mirror Steam Cloud?**
  - _Recommendation:_ Design the save schema once, platform-agnostic, behind bridge.saveMeta/loadMeta. Ship IndexedDB-only for the web demo (no accounts needed); add the R2/KV per-account sync only if/when the web build needs cross-device continuity — the bridge makes it a backend swap, not a schema change.
- **Provision and budget TURN egress now, or rely on STUN/P2P and add TURN reactively?**
  - _Recommendation:_ Provision TURN (Cloudflare/coturn) from the start and budget its egress at launch. NAT-restricted players need relay regardless of platform, and TURN replaces the SDR relay capability we are deliberately not adopting; treating it as launch infrastructure avoids a cross-play reliability gap.

## Risks / unknowns

- Steam Overlay over the WebGPU canvas in Electron is a known historical pain point — SteamAPI_Init must run in main.ts before the GPU context exists for the overlay to hook; verify it composites over the WebGPU surface on both Win and Mac early, or invites/overlay silently fail.
- macOS notarization is the biggest time sink: needs a paid Apple Developer account, Developer ID cert, hardened runtime with JIT/unsigned-executable-memory entitlements (Chromium/V8 requires them), and a notarization round-trip — procurement lead time on Apple + Windows code-signing certs can block the first CI build if not started early.
- steamworks.js is a native N-API addon that must be rebuilt against the exact Electron ABI AND exist for BOTH arm64 and x64 inside the Mac universal binary — a classic CI breakage point on every Electron upgrade, and a one-arch-missing slice crashes those Mac players.
- WebGPU 'guaranteed on desktop' still needs proof per release: headless GPU runners are flaky, so the navigator.gpu + real Dawn-device smoke test on win64 and mac arm64/x64 needs a GPU-enabled/self-hosted runner or a manual gate; a silent WebGL2 fallback on the Mac desktop tier would defeat the entire premium-tier premise.
- adapter.info is deliberately coarse and varies per browser (fingerprinting mitigation), so tier auto-detection cannot hard-gate on it — the 3s micro-benchmark must be the source of truth, and that benchmark itself must be validated to not stall first-load or mis-classify on thermally throttled laptops.
- Dual-axis asset matrix (tier x platform x lod) plus dual budget gates multiplies QA and authoring surface; the web first-load <=180MB and per-sector <=55MB gates must be enforced in CI from the first content or 'ships are the maps' content growth will silently blow the web download budget and break the demo.
- Cross-play correctness under the unified WebRTC path: a browser HIGH client and a desktop ULTRA host must see an identical world at different fidelity with zero netcode special-casing — any divergence (e.g. asset-tier-dependent collision or gameplay state) would break the host-authoritative model; keep all tier differences strictly cosmetic/asset-resolution.
- ElevenLabs commercial/usage licensing for shipped audio must be confirmed and the Tier-1 AI disclosure wording legal-reviewed before Steam page review; misclassification (e.g. accidental runtime generation pushing into Tier-2) or a licensing gap is a launch blocker, not a cosmetic risk.


---

## Detailed designs


### Desktop packaging + platform abstraction

**Recommendation:** Ship the desktop client as ELECTRON (bundled Chromium = identical, guaranteed WebGPU on Win+Mac), wrapped via electron-forge, with Steam integration through the maintained ceifa/steamworks.js native addon. Reject Tauri v2 as the primary wrapper for ONE decisive reason: on macOS Tauri uses WKWebView, and WKWebView does NOT ship WebGPU enabled by default even on macOS 26 — a WebGPU-heavy game cannot rely on it. From day one, code against a tiny Platform interface (capability flags: hasLocalFS, maxAssetTier, hasSteam, bundledWebGPU, memoryClass) with a BrowserPlatform and a DesktopPlatform implementation, so the same game branches on capabilities, never on `if (electron)`. One Turborepo produces both the Cloudflare Pages web build and the Steam depots (win64 + mac universal) from the same client bundle. Tauri is the runner-up — revisit only if/when WKWebView ships WebGPU-by-default AND macOS is a minor share of desktop sales; switching is cheap precisely because the Platform interface isolates the wrapper.

## 1. Wrapper choice — Electron, decisively

### 1.1 The decision driver: WebGPU consistency

This is a WebGPU-primary game with a WebGL2 *fallback*. On desktop we want the WebGPU path **guaranteed**, identical on every customer machine. That single requirement settles the wrapper.

| Wrapper | macOS WebGPU | Windows WebGPU | Consistency | Verdict |
|---|---|---|---|---|
| **Electron** | Bundled Chromium → Dawn WebGPU, **on by default**, same version for every user | Bundled Chromium → Dawn, on by default | **Identical everywhere**; we pin the Chromium/Dawn version per build | ✅ Pick |
| **Tauri v2** | WKWebView. WebGPU exists in Safari 26 / macOS Tahoe 26 but **WKWebView does NOT ship it on by default** (confirmed 2026 — iOS/macOS embedded WebKit gates it; no public, stable WKPreferences switch a sandboxed/notarized app can rely on). | WebView2 (Edge/Chromium) → WebGPU works | **Inconsistent across OS**: Win OK, Mac unreliable + tied to the user's installed system WebKit | ❌ Reject as primary |
| **NW.js** | Bundled Chromium (same engine story as Electron) | Bundled Chromium | Consistent, but smaller ecosystem, weaker Steam/CI tooling than Electron in 2026 | ➖ No upside over Electron |
| **Custom CEF / Chromium embed** | Full control, can pin Dawn | Full control | Most consistent in theory | ❌ Months of native C++ plumbing, signing, updater, Steam hooks — we are NOT building an engine team |

The killer fact: **WKWebView does not enable WebGPU by default, even on macOS 26.** Apple's own guidance to hybrid apps is "feature-detect `navigator.gpu` and ship a WebGL2 fallback." For a game whose entire premise is "highest browser 3D fidelity," shipping the Mac *desktop* build on a webview that silently drops to WebGL2 defeats the point of having a desktop tier at all. Electron's bundled Chromium gives us the exact same Dawn/WebGPU on a 2019 Intel MacBook and a 2026 Windows tower — and lets us pin and test ONE renderer.

### 1.2 The honest costs of Electron (and why they're acceptable here)

| Concern | Electron reality (2026) | Mitigation / why OK |
|---|---|---|
| Binary size | ~150–250 MB base (Chromium + Node + V8) | Irrelevant on Steam — players already download multi-GB games; our high-res asset pack dwarfs the runtime. This cost would matter for a web download (which is why the *web* build is NOT Electron) but not for a Steam depot. |
| Memory overhead | Extra ~100–200 MB for the Chromium/Node shell vs raw browser | We have *more* memory headroom on desktop, not less; `memoryClass: 'high'` budgets account for it. |
| Perf overhead | Negligible for GPU-bound rendering — WebGPU talks to the same Dawn→D3D12/Metal path as Chrome | We are GPU-bound, not shell-bound. |
| Steam Linux | Electron historically can't launch under the Steam Linux Runtime (libcups) | We are **not** shipping a native Linux depot. Steam Deck / Linux players run the **Windows depot under Proton**, which is the recommended 2026 path and inherits all our Windows testing for free. |

### 1.3 Steamworks integration maturity (the second deciding factor)

- **Electron → `ceifa/steamworks.js`**: a maintained N-API native addon (TypeScript defs shipped, prebuilt binaries, active 2025–2026 CI). Covers achievements, Steam Cloud, rich presence, overlay, invites/lobbies, input. This is the de-facto standard for HTML5/Electron games on Steam today. Greenworks is dead (unmaintained for years) — do not use it.
- **Tauri → `steamworks-rs` / `tauri-plugin-hal-steamworks`**: works, but is lower-maturity (early `0.0.x` plugin versions), and there are **known, documented problems getting the Steam overlay to hook** because `SteamAPI_Init` must run before the GPU device is created — awkward across Tauri's Rust/WebView process split. With Electron + steamworks.js the addon initializes in the main process at the right time and is a solved problem.

**Net:** Electron wins on BOTH the WebGPU-consistency axis and the Steamworks-maturity axis. There is no axis on which Tauri's advantages (smaller binary, lower memory) matter for a Steam-distributed GPU-bound game.

### 1.4 When I'd switch to Tauri (the runner-up)
Switch only if ALL of these become true: (a) WKWebView ships WebGPU **on by default** and stable on shipping macOS, (b) `steamworks-rs` overlay hooking is a non-issue, (c) install size becomes a real KPI. Because the game codes against the Platform interface (§2), swapping Electron→Tauri is a wrapper-package change, not a game rewrite. We design for that escape hatch but ship Electron.

---

## 2. The Platform abstraction layer (bake in from M-LOOK / day one)

One small interface the entire game codes against. No package outside the wrapper boundary may reference `process.versions.electron`, `window.electron`, `__TAURI__`, Steam, or Node. They ask `platform.caps`.

### 2.1 Location & dependency direction
New zero-dep package `packages/platform` (mirrors how `shared-types` sits under everything). It exports the interface + capability types; concrete implementations live behind it. It depends only on `@sl/shared-types`. `engine`, `render`, `audio`, `ui` consume `@sl/platform`; none of them import a wrapper SDK directly.

```
packages/platform/src/
  Platform.ts          # the interface + Capabilities type (the contract)
  caps.ts              # MemoryClass, AssetTier enums, capability helpers
  detect.ts            # createPlatform(): picks Browser vs Desktop at boot
  browser/
    BrowserPlatform.ts # web: no FS, no Steam, asset tier from download budget
  desktop/
    DesktopPlatform.ts # talks to preload bridge (window.__SL_NATIVE__), Steam stubbed→real
  steam/
    SteamService.ts    # interface: achievements, cloud, presence, invites (no-op in browser)
  index.ts
```

The Electron app lives in `apps/desktop/` (see §3). The **preload script** is the ONLY code allowed to touch Node/Electron/Steam APIs; it exposes a minimal, typed `window.__SL_NATIVE__` bridge via `contextBridge`. `DesktopPlatform` wraps that bridge. This keeps `nodeIntegration: false`, `contextIsolation: true` (mandatory for security + Steam later).

### 2.2 The interface

```ts
// packages/platform/src/Platform.ts
export type PlatformKind = 'browser' | 'desktop';
export type MemoryClass = 'low' | 'mid' | 'high';   // budget bucket, NOT the visual tier
export type AssetTier   = 'web' | 'hd';              // which asset pack is reachable

export interface Capabilities {
  kind: PlatformKind;
  hasLocalFS: boolean;     // desktop: read big packs off disk, no download cap
  maxAssetTier: AssetTier; // 'web' (size-budgeted) vs 'hd' (bundled high-res)
  hasSteam: boolean;       // achievements/cloud/presence/invites available
  bundledWebGPU: boolean;  // true on desktop (Chromium) → WebGPU guaranteed
  memoryClass: MemoryClass;// feeds render budgets / texture residency
  persistRoot: string | null; // FS path (desktop) or null (browser → IndexedDB/OPFS)
}

export interface Platform {
  readonly caps: Capabilities;
  readonly steam: SteamService;          // real on desktop, no-op shim in browser
  // storage abstraction — save games, settings, downloaded packs
  readBlob(key: string): Promise<Uint8Array | null>;
  writeBlob(key: string, data: Uint8Array): Promise<void>;
  // where to fetch the asset pack manifest from (R2 CDN vs bundled file://)
  assetBaseUrl(): string;
  openExternal(url: string): void;       // browser: window.open; desktop: shell.openExternal
}

export interface SteamService {
  readonly available: boolean;
  unlockAchievement(id: string): void;
  setRichPresence(key: string, value: string): void;
  // cloud save hooks, lobby/invite hooks added as needed; all no-op when !available
}
```

### 2.3 Detection (`createPlatform`)

```ts
export function createPlatform(): Platform {
  if (typeof window !== 'undefined' && (window as any).__SL_NATIVE__) {
    return new DesktopPlatform((window as any).__SL_NATIVE__);
  }
  return new BrowserPlatform();
}
```

### 2.4 Capability values per platform

| Capability | BrowserPlatform | DesktopPlatform (Electron) |
|---|---|---|
| `kind` | `browser` | `desktop` |
| `hasLocalFS` | false (IndexedDB/OPFS only) | true |
| `maxAssetTier` | `web` (download-size budgeted pack) | `hd` (bundled high-res pack, no web limit) |
| `hasSteam` | false | true (if Steam running; else graceful false) |
| `bundledWebGPU` | false — must feature-detect `navigator.gpu`, may fall to WebGL2 | true — Chromium WebGPU guaranteed |
| `memoryClass` | inferred (`deviceMemory`, GPU heuristics) → low/mid | `high` (default) |
| `persistRoot` | null | userData path |
| `assetBaseUrl()` | R2/CDN https URL (hashed pack) | `file://` bundled HD pack, fallback to CDN |

### 2.5 How this feeds quality tiers (the boundary with the QUALITY-TIER worker)

This layer does **not** own LOW/MID/HIGH visual tiers — that's `render/Capabilities.ts` + the DEGRADE matrix the rendering spec already defines. This layer **feeds inputs** into it:
- `bundledWebGPU` → desktop skips the WebGL2-fallback uncertainty; tier ceiling can assume WebGPU.
- `maxAssetTier` → which texture/mesh LOD pack is even loadable (web pack caps at, say, 2K KTX2; HD pack ships 4K + denser meshes). Asset tier is a **platform** fact; visual tier (effects on/off, shadow res) is a **GPU** fact. Keep them orthogonal: `effectiveTier = clamp(gpuTier, byAssetTier(caps.maxAssetTier), byMemory(caps.memoryClass))`.
- `memoryClass` → texture residency / streaming budget the render package reads.

So the contract with the tier system is one struct: the tier resolver takes `(Capabilities, GpuProbe)` and returns a `QualityTier`. Both workers agree on that signature now.

### 2.6 Feature-gating examples (same code, both platforms)
```ts
platform.steam.unlockAchievement('first_dock'); // real on desktop, no-op in browser
const pack = await loadAudioPack(platform.assetBaseUrl()); // CDN vs file://
if (platform.caps.maxAssetTier === 'hd') usePack('hd'); else usePack('web');
// invites: lobby code always works (WebRTC); Steam invite is an *additional* path on desktop
if (platform.caps.hasSteam) steam.inviteToLobby(roomCode);
```
Note: P2P netcode (room codes, WebRTC, TURN) is **platform-agnostic and unchanged** — Steam invites are a convenience overlay that *also* hands off the same room code, never a second transport.

---

## 3. Repo layout + Build/CI

### 3.1 Where the wrapper lives
```
apps/
  client/        # existing Vite app — the game (web build target, CF Pages)
  desktop/       # NEW: Electron wrapper
    package.json
    forge.config.ts        # electron-forge: makers + Steam-friendly output
    src/
      main.ts              # BrowserWindow, loads built client, init steamworks.js
      preload.ts           # contextBridge → window.__SL_NATIVE__ (the ONLY native surface)
      steam.ts             # ceifa/steamworks.js init + typed wrappers
    entitlements.mac.plist # hardened-runtime entitlements for notarization
  signaling/     # unchanged
  content-pipeline/  # gains an `hd` asset-pack variant target (see §3.3)
packages/
  platform/      # NEW (§2)
```
`apps/desktop` depends on the **built output** of `apps/client` (it loads `apps/client/dist/index.html` into a `BrowserWindow`). The client bundle is identical for web and desktop — only the asset base URL and the presence of `window.__SL_NATIVE__` differ at runtime. **One bundle, two shells.**

### 3.2 Turbo tasks
- `build:web` → `turbo run build --filter=@sl/client` → `wrangler pages deploy` (unchanged).
- `build:desktop` → depends on `@sl/client#build`, then `electron-forge make` in `apps/desktop`. Produces win64 + mac artifacts.
- `package:steam` → arranges Forge output into the Steam depot folder structure and runs `steamcmd` upload (CI only, gated on a tag).

### 3.3 Asset packs (web vs hd)
content-pipeline emits TWO packs from the SAME sources:
- `web` pack: aggressive KTX2 (ETC1S albedo / 2K cap), meshopt, size-budgeted → R2/CDN, fetched by the browser build.
- `hd` pack: UASTC 4K, denser LODs, lossless audio variants → **bundled into the Electron app as a Steam depot file**, loaded via `file://`. No web download-size limit applies. This is the *concrete* meaning of "desktop = higher quality": same renderer, bigger inputs + guaranteed WebGPU + more VRAM headroom.

### 3.4 CI matrix (GitHub Actions, 3 jobs)
| Job | Runner | Produces |
|---|---|---|
| web | linux | CF Pages deploy (client) + R2 `web` pack |
| desktop-win | windows-latest | signed `.exe`/app dir, win64 Steam depot |
| desktop-mac | macos-latest (Apple Silicon) | **universal** (build arm64 + x64 natively, merge), code-signed + **notarized** + stapled, mac Steam depot |
| upload-steam | linux | `steamcmd` → depots win64 + macuniversal → Steam, on git tag `v*` |

`@electron/osx-sign` + `@electron/notarize` (used by Forge) handle Mac signing/notarization. Universal builds are most reliable when arm64 and x64 are each built natively then lipo-merged — do that on the macOS runner. Auto-update: on Steam, **disable Electron's own auto-updater** — Steam IS the updater (depot diffs). Keep a Squirrel/electron-updater path only if we ever sell a non-Steam direct download; for the Steam product, Steam owns updates.

---

## 4. Realistic effort + gotchas

- **Mac notarization** (biggest time sink): needs a paid Apple Developer account, Developer ID Application cert, hardened runtime + correct entitlements (allow JIT / unsigned-executable-memory — Chromium/V8 needs these), and a notarization round-trip (minutes, occasionally long). Budget a full day to get the first green notarized build; trivial thereafter in CI. Steam can launch un-notarized in some flows but Gatekeeper will block direct/first-run launches — notarize from day one.
- **Windows signing**: needs an EV or OV code-signing cert (or accept SmartScreen warnings early). Steam tolerates unsigned more gracefully than macOS, but sign for trust.
- **WebGPU "flags"**: Electron exposes the same `app.commandLine.appendSwitch` knobs as Chrome. WebGPU is on by default in current Electron Chromium, but pin the Electron version per release and smoke-test `navigator.gpu` + an actual Dawn device on both win64 and mac arm64/x64 in CI (headless GPU is flaky — use a self-hosted or GPU-enabled runner for the device smoke test, or a manual gate).
- **steamworks.js**: native addon must be rebuilt against the exact Electron ABI; Forge's rebuild step handles it but it's a classic CI breakage point on Electron upgrades. Ship `steam_appid.txt` for local dev; ensure `SteamAPI_Init` runs in `main.ts` before the window's GPU context exists so the overlay hooks.
- **Steam depot upload**: `steamcmd` + a depot/app build VDF; first setup is fiddly (app IDs, depot IDs, branches). One-time ~half-day, then scripted.
- **Mac universal binary**: the native steamworks.js addon must exist for BOTH arm64 and x64 inside the universal app, or Mac players on one arch crash. Verify both slices.

**Overall effort:** Electron shell + Platform abstraction + first signed/notarized win+mac builds and a Steam depot upload = roughly 1.5–2.5 weeks of focused work, most of it one-time signing/CI plumbing. The *game* code change is tiny because everything routes through `Platform`.

**Bake in now:**
- Create packages/platform NOW (during M-LOOK) with the Platform + Capabilities + SteamService interfaces and BOTH BrowserPlatform and DesktopPlatform implementations — even before Electron exists, ship a DesktopPlatform stub. Every package codes against @sl/platform from the first commit.
- Forbid wrapper/Node/Steam leakage by lint rule: no package except apps/desktop/preload may import electron, process.versions, window.__TAURI__, or steamworks.js. The game asks platform.caps, never 'if (electron)'.
- Make asset loading go through platform.assetBaseUrl() from day one (M-LOOK already loads a KTX2/lightmap pack) so the web-CDN vs desktop-file:// HD-pack split is free later, not a refactor.
- Agree the tier-resolver signature with the quality-tier worker now: resolveTier(caps: Capabilities, gpu: GpuProbe) => QualityTier. maxAssetTier + memoryClass + bundledWebGPU are platform inputs; effects/shadow-res are GPU inputs. Keep asset tier and visual tier orthogonal.
- content-pipeline emits TWO packs (web + hd) from the same sources from the start — wire the 'hd' target now even if it initially equals 'web', so 'desktop = higher quality' is a build-config flip, not new pipeline work.
- Reserve apps/desktop/ in the repo and pin an Electron version in its package.json early; keep contextIsolation:true + nodeIntegration:false + a single typed contextBridge surface (window.__SL_NATIVE__) as the only native boundary.
- Do NOT build a Linux depot — plan for Steam Deck/Linux via Proton running the Windows depot; verify the Windows build under Proton in CI/QA instead.
- Stand up Apple Developer + Windows code-signing accounts/certs early (lead time) so the first notarized/signed build in CI isn't blocked on procurement.

**Open questions:**
- Does the desktop build ALSO sell direct (itch/own-site) or Steam-only? Steam-only lets Steam own auto-update; direct sales require an Electron auto-updater path (electron-updater + signed feeds) and changes the CI surface.
- Is Steam Deck a first-class target? If yes, we must actively QA the Windows-depot-under-Proton path (controller input mapping, 1280x800, 15W TDP perf) — that affects the LOW tier definition the quality worker owns.
- How big is the bundled HD asset pack allowed to get? This sets whether mac universal (which doubles native binary slices, not assets) and depot sizes are a concern, and informs the web pack's quality ceiling by contrast.
- Do we want Steam Cloud saves, achievements, and Steam-invite lobby handoff in v1, or stub SteamService and light it up post-launch? The interface supports either; this scopes the steamworks.js work.
- Acceptable minimum macOS / Windows versions? (Electron's bundled Chromium sets a floor; e.g. dropping very old macOS simplifies notarization/entitlements.) Confirm the supported-OS matrix before pinning the Electron version.
- Who owns the Apple Developer + Windows cert accounts and the Steamworks partner account (app/depot IDs)? CI needs these secrets; procurement lead time can block the first signed build.


### Quality-tier system

**Recommendation:** Yes — but design it as FOUR tiers, not three. Adopt LOW (WebGL2 / compat-mode / weak-GPU safety floor) · MID (WebGPU baseline) · HIGH (WebGPU good GPU — the realistic browser ceiling) · ULTRA (desktop Steam client only — top GPU + bundled high-res asset pack). One immutable `RenderProfile` object, derived from a `QualityTier` enum, is read by renderer + post + asset loader + particles + lighting. Layer a live dynamic-resolution governor (DRS) on top that nudges render-scale to hold 60fps WITHIN the chosen tier, so the discrete tier sets the feature/asset envelope and the governor handles per-frame variance. This SUPERSEDES the existing 3-value `RenderTier` ('webgpu-high'|'webgpu-mid'|'webgl2') and the M4 `DEGRADE` map: keep that exact structure, rename to the 4-tier QualityProfile, and add Ultra + the desktop/asset-pack axis. "Browser = lower quality" is FALSE as a rule — browser and desktop run the identical renderer; browser is merely capped at High by the user's GPU + the web download budget, while the desktop client unlocks Ultra and guarantees a consistent High.

## 1. Why 4 tiers (not 3, not 5)

The repo already ships a 3-value tier (`webgpu-high|webgpu-mid|webgl2` in `Capabilities.ts`). That conflates two independent axes — **GPU power** and **platform/asset-budget** — into one. Split them cleanly:

- **Axis A — capability/power** gives you the gradient: weak → strong GPU.
- **Axis B — platform** gives you the asset + VRAM + consistency ceiling: browser (download-capped, sandboxed VRAM) vs desktop client (local filesystem big-pack, more headroom, Steam).

Four tiers is the minimum that covers both without combinatorial explosion:

| Tier | Backend | Who gets it | The one-line reason it exists |
|---|---|---|---|
| **LOW** | WebGL2, or WebGPU compatibility-mode / `isFallbackAdapter` | iGPUs, old laptops, software adapters, the safety floor | Guarantees the game *runs and looks intentional* on weak HW — this is M-LOOK's DEGRADE/WebGL2 path, promoted. |
| **MID** | WebGPU (core) | Baseline discrete / strong modern iGPU | The "WebGPU is on, but be frugal" default for most browser players. |
| **HIGH** | WebGPU (core) | Good discrete GPU (RTX 3060+/RX 6600+/Apple M-Pro class) | The realistic **browser ceiling** — full post stack, web-budget assets. |
| **ULTRA** | WebGPU (core) | **Desktop Steam client only**, top GPU + full asset pack present | Unlocks SSGI, higher internal res, 4K textures, longer streaming radius — things the web download budget and browser VRAM can't justify. |

Why not 5+: each extra tier multiplies QA, asset-variant authoring, and tuning surface. Four maps 1:1 onto the four meaningful regimes (no-WebGPU floor / frugal-WebGPU / full-WebGPU-web / desktop-unlocked). Finer granularity is delivered by the **continuous DRS governor inside each tier**, not by more enum values.

Key rule: **ULTRA is platform-gated, not just GPU-gated.** A browser on a 4090 still tops out at HIGH (it lacks the bundled 4K pack and consistent-VRAM guarantee). Run the desktop client on that same machine → ULTRA. This is the honest articulation of "desktop is the real product."

---

## 2. The full tier matrix (concrete, target 60fps everywhere)

All "internal resolution" values are the *post-DRS floor/cap*; the governor moves render-scale between the floor and the cap live. Target framerate is 60 for all tiers (horror pacing needs stable 60, not unstable 120); Ultra exposes an optional 90/120 unlock for high-refresh desktop.

| Parameter | LOW (WebGL2/compat) | MID (WebGPU) | HIGH (WebGPU, browser ceiling) | ULTRA (desktop only) |
|---|---|---|---|---|
| **Backend** | WebGL2 / WGPU-compat | WebGPU core | WebGPU core | WebGPU core |
| **Render-scale / DRS range** | 0.6–0.85 (DPR clamp 1.0) | 0.7–1.0 (DPR ≤1.25) | 0.8–1.0 (DPR ≤1.5) | 0.9–1.0 (DPR ≤2.0) |
| **Internal-res hard cap** | 1080p | 1440p | 1440p (4K w/ DRS down) | native up to 4K |
| **Anti-alias** | SMAA (post) | SMAA + optional TAA | TRAA (temporal) | TRAA + TAAU upscale option |
| **MSAA** | off (post AA only) | 2× (forward bits) | 4× | 4× |
| **Shadow map res** | 512 | 1024 | 1024–2048 | 2048 |
| **Shadow cascades (sun, exterior)** | 1 | 2 | 3 | 4 |
| **Shadow filter** | PCF | PCF-soft | PCF-soft (Vogel) | PCF-soft (Vogel) |
| **SSR** | off (cubemap/analytic floor sheen) | off | **on** (masked, half-res) | on (full-res) |
| **SSGI** | off | off | off (HIGH = no SSGI on web) | **on** (low samples + temporal) |
| **GTAO** | half-res, 8 samples | half-res, 12 | full-res, 16 | full-res, 24 |
| **Volumetric fog/god-rays** | analytic exp2 height fog (no raymarch) | raymarch 12 steps | raymarch 24 steps | raymarch 32–48 steps |
| **Bloom** | emissive-only, 3 mips | emissive-only, 5 mips | emissive-only, 5 mips + lens dirt | + anamorphic streaks |
| **Particle budget (three.quarks)** | 1024 | 2048 | 4096 | 8192 |
| **Decals** | on (FIFO 32) | on (48) | on (64) | on (96) |
| **Draw-distance / sector radius** | current sector only | current + 1 ahead | current + 2 | current + 2 (+ larger exterior far-plane) |
| **LOD bias** | +2 (swap early/aggressive) | +1 | 0 (authored thresholds) | -1 (hold detail longer) |
| **Texture tier** | 1K (web pack, ETC1S) | 2K (web pack) | 2K–4K (web pack) | **4K (desktop high-res pack)** |
| **Anisotropic filtering** | 2× | 4× | 8× | 16× |
| **Motion blur** | off | off (a11y toggle) | off (a11y toggle) | off (a11y toggle) |
| **Target FPS** | 60 (floor 45 before degrade) | 60 | 60 | 60 (opt 90/120 unlock) |
| **VRAM texture cap** | ~256 MB | ~512 MB | ~1 GB | ~3 GB+ |

Notes that matter:
- **SSGI is the single Ultra-exclusive renderer feature.** It is the most expensive screen-space effect and the realism-effects/SSGINode path is the least stable; gating it to desktop+top-GPU keeps the web build safe. (Matches the existing spec's `ssgi: false /* M5 */`.)
- **SSR is the High-tier dividing line on web** — it's the "AAA wet floor" payoff M-LOOK relies on, affordable on a good GPU but dropped on Mid/Low.
- **Texture tier is where the desktop asset pack actually shows up**: same GLB meshes, but Ultra binds 4K KTX2 from the locally-shipped pack instead of the 2K web-download set. This is the concrete meaning of "bigger assets on desktop."

---

## 3. Auto-detection: how a player lands on a starting tier

Three-stage funnel, all in `Capabilities.ts` (generalizing the existing `probeWebGPU`/`classifyTier`):

**Stage 1 — Platform gate (synchronous).** Is this the desktop client? Detect via the wrapper bridge (`window.__SIGNAL_LOST_NATIVE__` injected by Electron/Tauri) + presence of the local high-res asset pack manifest. If not native → **Ultra is removed from the candidate set entirely.** Browser max = High, full stop.

**Stage 2 — Adapter probe (async, pre-renderer).** Already exists; extend it:
- No `navigator.gpu` / `requestAdapter()` null / `isFallbackAdapter === true` → **LOW** (WebGL2). 
- Request a `featureLevel:'compatibility'` adapter first; if the device only satisfies compatibility limits (no core-features-and-limits) → **LOW**, because ~45% of compat-only devices lack storage-buffers-in-vertex-shader and other core paths the post stack assumes.
- Read `adapter.info` (vendor/architecture/device) + `adapter.limits` + `navigator.deviceMemory` + `navigator.hardwareConcurrency` to seed a coarse class: integrated/old → MID-leaning, modern discrete → HIGH-leaning. Use `adapter.info.architecture` against a small maintained allow/deny map (e.g. known Apple/NVIDIA/AMD/Intel families), not GPU name string-matching alone.
- **Privacy/robustness caveat:** `adapter.info` is deliberately coarse and varies per browser (fingerprinting mitigation). Treat it as a *hint*, never a hard gate — the benchmark and governor are the source of truth.

**Stage 3 — 3-second first-load micro-benchmark (the tiebreaker).** On first ever launch (result cached in `localStorage`/save), render an off-screen stress probe: the worst-case corridor post stack (GTAO+SSR+volumetric) + a particle burst at the candidate tier for ~180 frames. Measure median GPU-ms via the existing `GpuTimer` (timestamp-query / EXT fallback). 
- < 8 ms → confirm or promote one tier (cap at platform max). 
- 8–14 ms → hold candidate. 
- > 14 ms sustained → demote one tier and re-probe. 
Cache `{ tier, benchmarkMs, gpuId }`; re-run only if the detected GPU id changes.

This means: **browser caps at High; desktop unlocks Ultra; both still benchmark down if the actual silicon can't hold 60.**

---

## 4. Adaptive governor: holding 60fps live (DRS) — separate from the tier

The discrete tier sets *features + assets*. A continuous **AdaptiveGovernor** (evolve the existing `BudgetMonitor`) holds the frame budget by moving render-scale, NOT by toggling features mid-scene (toggling SSR on/off mid-corridor is visually jarring in a horror game).

- **Primary lever = render-scale (DRS).** A PID-ish controller reads rolling median GPU-ms (30-frame). Over ~13.5 ms (60fps w/ headroom) for 90 sustained frames → step render-scale down 0.05 toward the tier floor. Under ~11 ms with headroom for 180 frames → step up 0.05 toward the tier cap. Hysteresis band prevents ping-pong (the drei PerformanceMonitor incline/decline pattern, generalized).
- **Secondary ladder (only if render-scale floor is hit and still over budget):** drop volumetric fog steps → drop GTAO to half-res → drop particle budget → finally drop one tier (with a subtle 0.5s grade dip to mask it). This is the existing `BudgetMonitor.demoteTier()` ladder, reordered so render-scale absorbs variance first.
- **Temporal AA pairs with DRS:** TRAA/TAAU on Mid+ lets render-scale drop further while staying clean — render at 0.8, temporally upscale, looks like ~0.95. This is why TAAU lives in the Ultra/High path.
- **Governor never crosses the platform ceiling upward** and never exceeds the tier's feature set — it only moves *within* the active profile.

**Manual override (settings):**
- A `Quality` dropdown: Auto (default) · Low · Mid · High · Ultra(desktop). Selecting a tier above the benchmarked one shows a non-blocking "may not hold 60fps" warning; selecting Ultra in browser is disabled with tooltip "Available in the desktop version."
- **Restart-needed flags:** backend switch (WebGL2↔WebGPU), MSAA level, texture-pack tier, shadow-cascade count → these reallocate GPU resources/reload assets, so mark them "Restart required." Live-changeable without restart: render-scale cap, SSR on/off, GTAO quality, fog steps, bloom, particle budget, DRS on/off (these just re-read the profile / rebuild post graph, which the `PostStack` adapter pattern already supports).

---

## 5. RenderProfile architecture — one object the whole engine reads

This is the bake-in. Generalize the existing `RenderTier` + `DEGRADE[tier]` into a single immutable, tier-derived **`RenderProfile`** (a.k.a. QualityProfile). It is the ONLY thing any subsystem reads for quality decisions — no subsystem ever inspects the raw GPU or platform again.

```
type QualityTier = 'low' | 'mid' | 'high' | 'ultra';

interface RenderProfile {              // frozen, derived from tier + platform
  tier: QualityTier;
  backend: 'webgl2' | 'webgpu';
  platform: 'browser' | 'desktop';
  // render
  renderScale: { min: number; max: number };   // DRS band
  dprCap: number; internalResCap: [number, number];
  // AA / post
  aa: 'smaa' | 'taa' | 'traa'; msaa: 0|2|4; taau: boolean;
  ssr: boolean; ssrResScale: number;
  ssgi: boolean;
  gtao: { resScale: number; samples: number };
  volumetric: 'analytic' | 'raymarch'; fogSteps: number;
  bloom: { mips: number; lensDirt: boolean; anamorphic: boolean };
  // shadows
  shadow: { mapSize: number; cascades: number; filter: 'pcf'|'pcf-soft' };
  // world / assets
  particleBudget: number; decalCap: number;
  sectorRadius: number; lodBias: number;
  textureTier: 1024|2048|4096; assetPack: 'web' | 'desktop-hi';
  anisotropy: number;
  // targets
  targetFps: number;
}
```

- **Single source of truth + observable.** Built once at boot (`buildProfile(tier, platform)`), exposed read-only. The AdaptiveGovernor publishes *live deltas* (current render-scale, any secondary-ladder drops) on a separate `RuntimeQuality` channel so consumers distinguish the static profile from live nudges.
- **Consumers (each reads only the fields it needs):**
  - `Renderer.ts` → DPR cap, internal-res cap, MSAA, render-scale (from governor).
  - `PostStack.ts` → aa/ssr/ssgi/gtao/volumetric/bloom (the post graph is rebuilt only on the rare restart-flag change; live uniforms via the existing `PostUniforms` bank handle the rest).
  - `GltfPipeline.ts` / `Ktx2.ts` → `textureTier` + `assetPack` choose which KTX2 set to fetch (web 2K vs desktop 4K) and `anisotropy`.
  - lighting (`FlashlightRig`, shadows) → shadow map size, cascades, filter.
  - `vfx/Particles.ts`, `Decals.ts` → budgets.
  - `scene/` sector streamer + `Lod.ts` → `sectorRadius`, `lodBias`.
- **M-LOOK from day one:** M-LOOK's DEGRADE matrix IS the Low/Mid path of this profile. Build `apps/lookdev` to consume `RenderProfile` (not hardcoded constants), with `?tier=low|mid|high` and `?gl=2` force flags, and prove the WebGL2/Low render *and* a Mid/High WebGPU render in the same harness. When promoted to `packages/engine`, the profile object moves verbatim — no rewrite. Ultra is stubbed in M-LOOK (no desktop wrapper yet) but its fields exist so the matrix is complete.

---

## 6. Is "browser = lower quality"? — the honest answer to bake into messaging

**No, not inherently.** The browser and the wrapped desktop client run the **same Three.js WebGPU renderer and the same TSL post stack** — there is no second/native renderer. What actually differs:

| Factor | Browser | Desktop client (Electron/Tauri) |
|---|---|---|
| Renderer | Three.js WebGPU (identical) | Three.js WebGPU (identical) |
| Max tier | **High** | **Ultra** |
| WebGPU availability | varies by user's browser/driver | **bundled, consistent** WebGPU runtime → guaranteed High |
| VRAM / memory headroom | sandboxed, conservative | more headroom → bigger textures, longer streaming |
| Assets | download-budget-capped (2K web pack) | local filesystem → ship a big 4K hi-res pack, no download limit |
| Integration | none | Steam (achievements, friends, cloud saves) |

So the precise framing: *browser isn't lower-quality by nature — it's capped at High by (a) whatever GPU/WebGPU the player's browser exposes and (b) the web download budget. The desktop client doesn't render "better"; it unlocks the top tier, ships bigger assets, and guarantees a consistent High.* A good-GPU browser player gets a genuinely excellent High; the desktop client is the "max settings + guaranteed consistency" edition. This is exactly aligned with the locked decision (web demo first + desktop as the "real" product).

**Bake in now:**
- Replace the 3-value RenderTier with the 4-tier QualityTier ('low'|'mid'|'high'|'ultra') and turn the existing DEGRADE[tier] map into a single frozen RenderProfile/QualityProfile object — done now in M-LOOK so the whole engine is tier-driven from the first line of renderer code.
- Make EVERY render subsystem read the RenderProfile, never the raw GPU/platform: Renderer, PostStack, GltfPipeline/Ktx2 asset loader, lighting/shadows, particles, decals, sector streamer, LOD. No subsystem re-detects capabilities.
- Add the PLATFORM axis from day one (browser|desktop) separate from the power axis, with a native-bridge detector stub (window.__SIGNAL_LOST_NATIVE__) so Ultra is platform-gated. Browser candidate set must exclude Ultra even before the desktop wrapper exists.
- Architect the asset pipeline for a texture-tier / asset-pack split from the start: author/emit a 2K 'web' KTX2 set and reserve the 4K 'desktop-hi' pack path. Same GLB meshes, profile-selected texture set. Retrofitting dual asset packs later is expensive.
- Build the AdaptiveGovernor (evolve BudgetMonitor) as render-scale-first DRS with hysteresis, separate from the discrete tier, holding 60fps WITHIN the active profile — and a RuntimeQuality channel that distinguishes live nudges from the static profile.
- Wire TRAA/TAAU as the Mid+ AA path now (not just SMAA), because temporal upscaling is what lets DRS drop render-scale without looking bad — it must be in the post graph architecture early, not bolted on.
- Implement the 3-stage auto-detect (platform gate → adapter+compat-mode probe → cached 3s micro-benchmark) using the existing GpuTimer, and persist {tier, benchmarkMs, gpuId} so it re-runs only on GPU change.
- Tag every quality setting as live-changeable vs restart-required (backend, MSAA, texture-pack, cascades = restart) in the profile metadata now, so the Settings UI and PostStack rebuild logic are correct from the first implementation.

**Open questions:**
- High-refresh on desktop: do we offer an Ultra 90/120fps unlock, or hard-lock 60 everywhere for consistent horror pacing and simpler frame-budget math? (Recommendation leans 60-locked with an opt-in unlock.)
- Desktop hi-res asset pack size budget: how big is the 4K pack allowed to get (download/install size on Steam), and is it a separate optional 'HD texture pack' DLC-style download or always bundled?
- Do we author a true 1K texture variant for LOW, or just runtime-downsample the 2K web set? (Authoring a third set costs pipeline time; downsampling is cheaper but slightly worse.)
- WebGPU compatibility-mode devices: treat them strictly as LOW (safest, given ~45% lack storage-buffers-in-vertex-shader), or attempt a constrained MID-compat path? Recommendation: LOW for shipping safety.
- Should the first-load micro-benchmark be mandatory (adds ~3s to first launch) or opt-in/skippable with adapter-heuristic-only fallback? Affects first-impression latency for the web demo.
- Manual tier above benchmark: do we hard-cap the user at their benchmarked tier, or let them force a higher tier with only a warning (risking a bad-perf first impression in the demo)?


### Tiered asset pipeline

**Recommendation:** Adopt ONE source-art tree (`assets-src/`, git-LFS) and a single deterministic gltf-transform v4.3 build that emits a 3-axis variant matrix: TIER (low/mid/high) × PLATFORM (web/desktop) × LOD (0/1/2), driven entirely by `pipeline.config.json`. Web ships a small streamed pack (target ≤180 MB first-load + per-sector streams, ETC1S-heavy, 512–2048 textures) gated in CI by `gltf-transform inspect`; desktop ships one multi-GB local pack (UASTC heroes, up to 4096, full-detail audio) with no download bound. The same manifest carries every variant with hash+bytes+(decoded GPU MB); a platform/tier-aware loader picks the pack and streams sector packs along the critical path on web while loading from local FS on desktop. M-LOOK must produce at minimum a `web-lite` (mid, ETC1S basecolor / UASTC normal, 1024) AND a `desktop-full` (high, UASTC, 2048+) variant of the corridor trim set to prove the fork end-to-end before any gameplay. Bake the tier/platform AXES, the variant-keyed manifest, the GPU-memory (not file-size) budget gate, and the audio-variant fork into the schema on day one — retrofitting a second axis later is the expensive part.

## 0. The problem, stated precisely

Two delivery realities from ONE source art set:

| | **Web (browser demo + fast iteration)** | **Desktop (Steam, the "real" product)** |
|---|---|---|
| Delivery | HTTP/2 from R2, download-bounded, first-load matters | bundled on local disk, install-size-bounded only |
| First-load target | **≤180 MB** to "playable in dock" (was 25 MB for the M4 micro-slice; ~150–200 MB is the realistic Ship-1 web budget) | n/a — splash loads the full pack from local FS |
| Per-sector stream | **≤40–60 MB** per ship sector, masked behind cinematics/airlock transitions | preloaded; no stream stalls |
| Total install | ~700 MB–1.2 GB streamed over a session | **3–6 GB** local pack, no download bounce |
| Texture ceiling | 2048 (heroes), 1024/512 filler | 4096 heroes, 2048 filler |
| Dominant codec | **ETC1S** (small) for basecolor/filler; UASTC only on hero normals | **UASTC** broadly (normals, ORM, hero basecolor) |
| Audio | Opus 48k **96 kbps** | Opus 48k **160–192 kbps** |

Same source GLB/textures/audio → different *outputs*. We never author twice and never build two engines. The renderer is identical (Three.js r185 WebGPU); desktop's "higher quality" is purely **bigger assets + more VRAM headroom + local FS + no download bound**, exactly as the brief states.

## 1. Where this snaps onto existing specs

The repo already defines the runtime quality ladder; the asset pipeline must *feed* it, not invent a parallel one:
- `06-rendering-mood.md` → `RenderTier = 'webgpu-high' | 'webgpu-mid' | 'webgl2'` + `DEGRADE` matrix + `BudgetMonitor` auto-degrade.
- `07-content-asset-pipeline.md` → `tools/asset-pipeline/`, `pipeline.config.json`, `optimize.mjs`, `budget-check.mjs`, `build-manifest.mjs`, ETC1S/UASTC routing, meshopt/draco, LOD0/1/2.
- `04-audio-elevenlabs.md` → `OutputFormat` enum, hashed pack, `manifest.json`, variant/stem entries.

**The single alignment decision:** map the runtime `RenderTier` and the new user-facing **LOW/MID/HIGH** to one **asset TIER** axis, and add an orthogonal **PLATFORM** axis. The quality agent owns the runtime knobs (post/shadows/SSR); the asset pipeline owns which *bytes* arrive.

### 1.1 The tier matrix (asset side, the contract with the quality agent)

| Asset TIER | Picks for runtime RenderTier | Hero tex | Filler tex | Normal codec | Basecolor codec | ORM/emissive | Geom LOD bias | Default platform |
|---|---|---|---|---|---|---|---|---|
| **LOW** | `webgl2` fallback / low VRAM | 1024 | 512 | UASTC L2 | **ETC1S q160** | ETC1S | LOD start at 1 | web-lite |
| **MID** | `webgpu-mid` | 2048 | 1024 | UASTC L3 | ETC1S q200 | UASTC L3 | LOD0 near, 1 mid | web default |
| **HIGH** | `webgpu-high` | 2048–**4096** | 2048 | **UASTC L4 rdo** | **UASTC L4** (heroes) / ETC1S filler | UASTC L4 | LOD0 full | desktop default |

PLATFORM gates the *availability ceiling*, not the runtime choice:
- **web** pack is built for LOW+MID, and a *capped* HIGH (2048 ceiling, no 4096, ETC1S basecolor kept to protect download budget). A strong desktop-class browser still streams MID/HIGH-capped — it just never pulls the 4096 UASTC heroes that only exist in the desktop pack.
- **desktop** pack is built for MID+HIGH including 4096 UASTC heroes. Local FS = no per-asset download budget, so HIGH is uncapped.

This means a powerful machine in a browser gets MID/HIGH-capped; the same machine on Steam gets true HIGH. That is the entire, honest difference — and it falls out of the pack the loader is allowed to read, not a second renderer.

## 2. The pipeline — source → variant matrix

### 2.1 Source tree (one source of truth)
```
assets-src/                # git-LFS, NEVER shipped
  kit/  weapons/  props/  creatures/  hdri/  player/
  <asset>.glb              # authored at MAX res (4K textures, full-tri LOD0)
  LICENSES.md
```
Author once at the **highest** fidelity. Every output is a *down-derivation*; nothing upsamples. Hero textures live at 4096 in source so HIGH/desktop has real data to ship — never invent detail at build time.

### 2.2 Build = matrix expansion (gltf-transform v4.3 JS API, CI-deterministic)
For each source asset × each `(tier, platform)` cell the config marks `enabled`, run the deterministic chain:
```
read → dedup → prune → weld
     → simplify (per LOD: ratio/error from tier.lodLadder)         # geometry LODs
     → resize textures to tier.texCeiling per slot                  # KTX2 resolution ladder
     → textureCompress KTX2:
         baseColor   → tier.basecolorCodec  (ETC1S q | UASTC L)
         normal      → UASTC (always; ETC1S wrecks normals)
         ORM/emissive→ tier.ormCodec
     → meshopt(level:high)  [draco only if post-meshopt bytes > 1.5MB]
     → write  assets-dist/<platform>/<tier>/<asset>.<lod>.glb
```
Key codec facts driving the routing (verified June 2026):
- **ETC1S** = far smaller, great for flat/low-variation **basecolor**, bad for high-frequency/packed data → web-lite filler.
- **UASTC** = larger but high quality for **normals, ORM, emissive, hero basecolor** → desktop & hero slots. Disable RDO on desktop-high for max quality; enable RDO+zstd on web to shrink.
- KTX2 transcodes to **BC7 (desktop GPU) / ASTC (Apple) / ETC2 (Android)** at load and stays compressed in VRAM (~10× smaller than RGBA). So the *same* `.ktx2` is GPU-portable; we vary it by tier only for **resolution + codec**, not per-GPU.
- **meshopt** default (cheap decode, plays well with WebGPU); **draco** only for size-dominated meshes (command-centre shell). gltf-transform v4.3 provides both via `@gltf-transform/functions`.

### 2.3 Output tree (what gets uploaded / bundled)
```
assets-dist/
  web/      low/  mid/  high-capped/    <asset>.<hash>.<lod>.glb + .ktx2
  desktop/  mid/  high/                 <asset>.<hash>.<lod>.glb + .ktx2
  manifest.json                         # the single index over BOTH platforms
```
- `web/**` → R2, `Cache-Control: immutable, max-age=1y`, content-hashed.
- `desktop/**` → bundled into the Electron/Tauri app's resources (or a Steam depot), read from local FS. Same hashing so the manifest is shared.

## 3. The asset manifest + loader

### 3.1 Manifest schema (one index, variant-keyed) — `packages/content-schemas/src/asset-manifest.ts`
```ts
export const AssetVariant = z.object({
  url: z.string(),            // hashed: web → R2 path; desktop → app:// or file path
  hash: z.string(),
  bytes: z.number(),          // wire/disk size — drives DOWNLOAD budget
  gpuBytes: z.number(),       // decoded VRAM footprint — drives MEMORY budget
  lod: z.number().int(),      // 0|1|2
});
export const AssetEntry = z.object({
  id: z.string(),                          // logical "KIT_corridor_straight_4m"
  kind: z.enum(['kit_piece','weapon','creature','prop','hdri','env']),
  sector: z.string().optional(),           // streaming group, e.g. "ship1.sector.dock"
  critical: z.boolean().default(false),    // first-load bucket member
  variants: z.record(                      // platform → tier → LOD[]
    z.enum(['web','desktop']),
    z.record(z.enum(['low','mid','high']), z.array(AssetVariant))
  ),
});
export const AssetManifest = z.object({
  schemaVersion: z.literal(2),
  generatedAt: z.string(),
  assets: z.array(AssetEntry),
  sectors: z.array(z.object({ id: z.string(), critical: z.boolean(),
    webBytes: z.record(z.enum(['low','mid','high']), z.number()) })), // per-sector roll-up for budget gate
});
```
One manifest, both platforms. The loader never guesses paths — it resolves `(id, platform, tier, lod) → AssetVariant`.

### 3.2 Loader (`packages/engine/src/assets/AssetLoader.ts`)
```
selectVariant(id, lod):
  platform = BUILD_PLATFORM            // 'web' | 'desktop' (Vite define / Electron flag)
  tier     = caps.assetTier            // from RenderTier + BudgetMonitor (quality agent)
  entry    = manifest.byId[id]
  return entry.variants[platform][tier] ?? fallback(platform, tier)  // mid→low→whatever exists
```
- **Web path:** `selectVariant` → fetch hashed `.glb`/`.ktx2` over HTTP/2 from R2. Sectors stream on a **priority queue**: (a) dock + arms/weapon + critical audio, (b) current sector + adjacent + creature, (c) far sectors + LOD1/2 + ambience tails. Loads are **masked behind cinematics / airlock transitions** ("ships are the maps": each sector boundary = a door/airlock = a natural stream-in mask). Warm immutable cache makes revisits ~free.
- **Desktop path:** `selectVariant` → read from local FS (`app://` or fs). No priority queue needed for download; still respects LOD for VRAM. Whole pack is resident-eligible.
- **Shared:** `KTX2Loader` (WebGPU + WebGL2 fallback) transcodes to BC7/ASTC/ETC2 per GPU. The loader is identical code; only the *source* (R2 vs FS) and the *tier ceiling* differ — one engine.
- `BudgetMonitor` (already in 06) can demote `caps.assetTier` at runtime (high→mid) → loader starts serving lower-res variants for *newly* streamed sectors, matching the post-stack auto-degrade.

### 3.3 Host-authoritative P2P note
Host streams the tiny **level JSON** over DataChannel; joiners resolve the SAME hashed asset URLs from CDN/local pack themselves (assets are never relayed peer-to-peer). Each peer independently picks its own `(platform, tier)` — a web joiner and a desktop host see the same world at different fidelity with zero extra netcode.

## 4. Audio tiering (one source of truth, same fork)

Extend the existing `04-audio-elevenlabs` manifest rather than forking it:
```ts
// OutputFormat enum (extend):
export const OutputFormat = z.enum([
  "opus_48000_96",   // WEB         (small)
  "opus_48000_160",  // DESKTOP     (hero quality)
  "mp3_44100_128",   // fallback (no-Opus browsers)
]);
// each variant/stem entry gains a per-platform url map:
variant: { web: "/audio/<h>.96.opus", desktop: "/audio/<h>.160.opus", mp3: "/audio/<h>.mp3", hash, durationMs }
```
- ElevenLabs renders **once** (the WAV is the source of truth). `encode.ts` emits **two Opus bitrates + one mp3** from that single WAV — never re-call ElevenLabs per platform.
- Bake step (`bake-audio.mjs` hook already reserved in 07) runs the same matrix logic: web pack = 96 kbps, desktop = 160 kbps.
- **Critical-audio rule preserved:** all Beat one-shots + entry ambience stay in the first-load bucket (web) / resident (desktop) before reachable triggers. Lower web bitrate must NOT push a scare clip off the critical path — it's smaller, so it helps.
- Music stems carry the same `web`/`desktop` urls; the Audio Forge console's manifest is the one source — the encode just multiplies bitrates.

## 5. Budgets + CI gates (the thing that keeps web honest)

`pipeline.config.json` (extended with platform×tier budgets):
```json
{
  "budgets": {
    "web": {
      "first_load_mb": 180,
      "per_sector_mb": 55,
      "session_total_mb": 1200,
      "per_glb": { "kit_piece": { "maxBytesMB": 6, "maxGpuMB": 8 },
                   "creature":  { "maxBytesMB": 14, "maxGpuMB": 18 } }
    },
    "desktop": {
      "install_gb": 6,
      "per_glb": { "creature": { "maxGpuMB": 40 } }   // VRAM-only; no download gate
    }
  }
}
```
CI gate (`budget-check.mjs`, Turborepo `asset:budget`, on PRs touching `assets-src/**`):
1. `gltf-transform inspect --format json` per output `.glb`.
2. **Two separate asserts:** `bytes` (wire/disk) vs **download** budget; `gpuBytes` (w·h·bpp·1.333) vs **VRAM** budget. ETC1S=0.5 bpp, UASTC=1 bpp, RGBA=4 bpp. (The existing 07 spec already computes this — keep it, split web/desktop.)
3. **Sector roll-up:** sum each sector's web variants → assert ≤ `per_sector_mb`; sum all `critical:true` web assets + JS/WASM + critical audio → assert ≤ `first_load_mb`. **This is the gate that stops web ever blowing its download budget.**
4. Desktop only asserts VRAM (`maxGpuMB`) and total `install_gb` — never download bytes.
5. Fail loud with which asset/sector/tier overran and by how much.

### 5.1 Concrete budget targets (Ship 1, both platforms)
| Bucket | Web | Desktop |
|---|---|---|
| First-load / boot | ≤180 MB (JS+WASM ~8, dock sector geo+tex ~110, arms/weapon ~12, creature LOD0 ~16, HDRI ~6, critical audio ~10, headroom) | full local read; splash only |
| Per ship sector (stream / resident) | ≤55 MB | resident, no cap |
| Audio pack total | ~60 MB (96 kbps) | ~110 MB (160 kbps) |
| Total install / session | ~0.9–1.2 GB streamed | 3–6 GB local |

## 6. What M-LOOK must already prove (the day-one fork test)

M-LOOK's KTX2/meshopt step (already in scope) must emit **at least two cells of the matrix** for the corridor trim set + hero ship, end-to-end:
1. **`web/mid` (web-lite):** ETC1S basecolor q200, UASTC normals L3, 1024 hero / 512 filler, meshopt, LOD0+1. This is the demo build.
2. **`desktop/high` (desktop-full):** UASTC basecolor+normals L4, 2048–4096 hero, LOD0. This is the Steam build.
3. The lookdev loader reads `BUILD_PLATFORM` + a `?tier=` override and **resolves the right variant from a real (mini) manifest** — proving `selectVariant` and the manifest schema, not just two files on disk.
4. Capture BOTH the web-lite and desktop-full interior frames cold; the visible delta (sharper normals/larger textures on desktop, identical lighting/post) is the proof the fork works and that desktop's win is asset-driven, not a second renderer.

This makes the tier/platform axes real in the throwaway harness so they promote into `packages/engine` with M1 instead of being retrofitted.

**Bake in now:**
- TWO orthogonal axes in the variant identity from day one: TIER (low/mid/high) AND PLATFORM (web/desktop), plus the existing LOD axis. Adding the platform axis later means re-keying every manifest entry, every output path, and the loader — do it now.
- Variant-keyed manifest schema (schemaVersion:2): one manifest indexing variants[platform][tier][lod] with BOTH `bytes` (download) and `gpuBytes` (VRAM) per variant. The dual size fields are load-bearing for the split budget gate.
- `selectVariant(id, platform, tier, lod)` indirection in the loader — NEVER hardcode asset paths. Same loader code reads R2 (web) or local FS (desktop); only source + tier-ceiling differ. Prove it in M-LOOK with a mini manifest, not two loose files.
- Map asset TIER to the quality agent's RenderTier ('webgpu-high/mid/webgl2') and the user-facing LOW/MID/HIGH as ONE shared enum — do not let asset tiers and runtime tiers drift into two vocabularies.
- Codec routing as data in pipeline.config.json keyed by (tier, slot): ETC1S for web basecolor/filler, UASTC always for normals/ORM/emissive and all desktop-high. Author source textures at 4096 so HIGH has real data to ship (never upsample at build).
- Split CI budget gate: web asserts download bytes (first-load ≤~180MB, per-sector ≤~55MB) AND VRAM; desktop asserts VRAM + install-size ONLY, never download. Sector roll-up in the manifest so the first-load/per-sector gate exists before content piles up.
- Sector + `critical` fields on every asset entry from the start (ships-are-maps): streaming priority and the first-load bucket are derived from these. Mask web streams behind airlock/sector-boundary cinematics.
- Audio: extend OutputFormat to per-platform Opus bitrates (web 96k / desktop 160k) + mp3 fallback, emitted from ONE ElevenLabs WAV render. Never re-call ElevenLabs per platform; one source of truth, encode multiplies bitrates.
- Single source-art tree in git-LFS authored at max fidelity; assets-dist is gitignored and CI-regenerated. Every output is a down-derivation — no parallel hand-authored web vs desktop art.

**Open questions:**
- Web first-load budget number: is ≤180 MB the right target for the Ship-1 demo, or should the demo be a deliberately trimmed 'vertical slice' pack with a tighter cap (e.g. ~120 MB) and the full web campaign streamed only in the desktop/returning-player flow?
- Desktop delivery mechanism for the big pack: bundle assets inside the Electron/Tauri app resources, ship as a separate Steam depot downloaded on first run, or a hybrid (base pack bundled + HD pack as optional Steam DLC depot)? Affects install-size budget and patch granularity.
- Should a high-end *browser* be allowed to stream the true desktop-high 4096 UASTC heroes (blurring the web/desktop line for capable machines), or do we hard-cap web at 2048/ETC1S-basecolor to protect the download budget and keep desktop a clear upsell? Recommendation leans hard-cap.
- HDRI/IBL and baked lightmaps: do these follow the same tier ladder (1K web / 2K desktop) or get their own budget line? They are big and shared across sectors, so they may warrant a separate 'shared/env' budget bucket rather than per-sector accounting.
- LOD packaging: separate per-LOD .glb files (recommended in 07 for simpler streaming priority) vs a single multi-LOD glb via KHR/MSFT_lod — the streaming loader design assumes separate files; confirm before the manifest schema hardens.
- Texture mip-streaming within a tier (stream 512 mip first, upgrade to 2048 in place) — worth it for web to cut first-load further, or is per-sector LOD streaming enough? Adds loader complexity; defer unless the 180 MB gate proves too tight.


### Steam integration + cross-play

**Recommendation:** Ship ONE web app everywhere. Keep cross-play unified on your existing host-authoritative WebRTC + room-code netcode for ALL players (browser and Steam desktop) — do NOT adopt Steam Datagram Relay, because the wrapped desktop build runs the same browser WebRTC stack and SDR requires the native Steamworks UDP socket layer that browsers cannot use; forking to SDR would split your netcode and break browser<->desktop play. Layer Steam features (Cloud, achievements, Rich Presence, Invite-to-lobby) on top via a thin "PlatformBridge" abstraction that is a no-op on web and is backed by steamworks.js inside the Electron desktop wrapper. For v1: Cloud saves + ~10-15 achievements + Rich Presence + "Invite to Lobby" that just carries your room code + Steam Input. For AI disclosure: your all-ElevenLabs audio is Tier-1 "Pre-Generated AI Content" — fill the survey, check the audio category, use the recommended wording below. Wishlist-from-day-one on the Steam page; free web demo drives wishlists; the wrapped desktop build is the paid product.

## 0. Core principle — one app, one renderer, one netcode

The wrapped Electron/Tauri desktop build runs the **same Three.js WebGPU app** as the browser. It does NOT get a native renderer or native netcode. Therefore:

- **Cross-play is feasible and basically free** — browser players and Steam-desktop players run identical WebRTC code, identical signaling (Cloudflare/PartyServer), identical room-code join. A desktop player and a browser player in the same room are indistinguishable at the netcode layer.
- The desktop build diverges from web **only in packaging + capability flags**, never in engine. The single point of divergence is a `Platform` capability object (see §5).

---

## 1. The PlatformBridge abstraction (bake this in now)

One interface, two implementations, injected at boot. Everything Steam-specific lives behind it so the engine, HUD, and netcode never `import` Steamworks.

```
interface PlatformBridge {
  kind: 'web' | 'steam';
  // identity
  getDisplayName(): string;
  // cloud / persistence
  saveMeta(key, blob): Promise<void>;
  loadMeta(key): Promise<blob | null>;
  // achievements
  unlock(achievementId): void;
  setStat(id, value): void;
  // presence + invites
  setRichPresence(state): void;          // "In Ship 1 — room ABCD" etc.
  onJoinRequest(cb: (roomCode) => void); // Steam friend clicked "Join"
  inviteOverlay(): void;                  // open Steam invite overlay
  // input
  getInputProfile(): InputProfile;
}
```

- **WebPlatformBridge** — `saveMeta`/`loadMeta` -> IndexedDB + optional Cloudflare R2/KV per-account; `unlock`/`setRichPresence` are no-ops or local toast; `getDisplayName` from your account system.
- **SteamPlatformBridge** — wraps **steamworks.js** in the Electron main process; exposed to the renderer over a typed IPC contract. Cloud -> Steam Cloud; unlock -> Steam achievements; presence -> Steam Rich Presence; join -> Steam lobby `rich_presence` connect string carrying the room code.

This is the single most important thing to architect on day one: the rest of the codebase only sees `PlatformBridge`.

---

## 2. SDK binding choice (desktop wrapper)

| Binding | Verdict |
|---|---|
| **steamworks.js** (ceifa, Rust+napi) | **RECOMMENDED.** npm-installable prebuilt binaries, TypeScript types, promise-based API, actively the de-facto choice for Electron in 2026. Covers achievements, stats, Cloud, Rich Presence, lobbies, Steam Input, overlay. |
| greenworks (Greenheart) | Avoid. Best-effort maintenance, you build native binaries yourself, no TS types, NW.js-centric, missing newer APIs. |
| steamworks-ffi-node | Newer FFI-based, pure-TS, no compile step — promising but younger; keep as a fallback only if steamworks.js prebuilts lag an Electron major. |
| steamworks-rs (Rust) | Only relevant **if** you pick **Tauri** instead of Electron. Tauri's renderer is the OS WebView (WKWebView on macOS / WebView2 on Windows), whose **WebGPU support is inconsistent in 2026** — a real risk for "highest fidelity." For a WebGPU-first game, **Electron (bundled Chromium = predictable WebGPU) + steamworks.js** is the safer pairing. |

**Decision: Electron + steamworks.js.** It guarantees a consistent bundled WebGPU/Chromium across PC + Mac and gives the cleanest TS Steam bindings. (Tauri's smaller binary isn't worth gambling your renderer.)

---

## 3. Steamworks features — v1 vs later

| Feature | When | Notes |
|---|---|---|
| **Steam Cloud** (auto-cloud or remote-storage) | **v1** | Persist the "light" meta-progression, loadout, lore unlocks, settings. Tiny JSON/binary blobs. Use auto-cloud file globs for simplicity; settings should sync so a player's quality tier + bindings follow them. Web uses IndexedDB+R2 equivalent. |
| **Achievements** (~10-15) | **v1** | Friends co-op horror: "Complete Ship 1", "Survive a full run solo", "4-player clear", "no deaths", lore-collectible milestones, the mic-permission climax beat. Define IDs in a shared TS enum so web can fire local toasts AND desktop fires real unlocks via the same call site. |
| **Stats** | v1 (light) | Back achievements (runs completed, lore found). |
| **Friends + Rich Presence** | **v1** | Set presence to current ship + room code so Steam friends see "In Ship 1 — joinable". |
| **"Invite to Lobby" / Join** | **v1** | Use a Steam **lobby as a thin carrier for the room code only** — NOT for game traffic. Friend clicks Join -> Steam launches/foregrounds your app with the room code -> you feed it into the EXISTING WebRTC join flow. Netcode untouched. |
| **Steam Input** | **v1 (config-only)** | Register a default controller config / action set. Cheap, big QoL for a horror game played on a couch; gamepad also helps the desktop-on-TV story. |
| **Steam Overlay** | v1 | Comes free with the SDK; verify it composites over the WebGPU canvas in Electron (known historical pain point — test early). |
| **Wishlist / store page** | **day one** | Page up before demo launch (see §6). |
| **Trading cards, Workshop, Steam Achievements showcase art, Steam Leaderboards** | **later** | Workshop is irrelevant for a linear friends-co-op campaign. Leaderboards only if you add score/speedrun framing. Cards are a post-launch marketing lever. |
| **Steam Voice / Steam P2P networking / SDR** | **never (for cross-play)** | See §4 — would fork netcode and exclude browser players. |

---

## 4. Cross-play & networking — STAY UNIFIED ON WebRTC

**Confirmed feasible.** Both browser and wrapped-desktop run the same web app, same `simple-peer` WebRTC, same Cloudflare/PartyServer signaling, same room codes, same host-authoritative model. A desktop host can serve browser guests and vice-versa with zero special-casing.

**Do desktop players gain anything from Steam Datagram Relay?** Technically SDR offers DoS-protected, authenticated, relayed UDP transport — but:

- SDR is delivered through the **native Steamworks GameNetworkingSockets** UDP layer. A **browser cannot link that** (no native sockets, no Steamworks SDK in a tab). So SDR could only ever serve desktop<->desktop, which would **fork your netcode into two transports** and **break browser<->desktop cross-play** — exactly what we must avoid.
- You already solve NAT traversal with **TURN**; that covers the same "relay when P2P fails" need SDR provides, and it works identically for every client.

**Recommendation: one transport — WebRTC + STUN/TURN — for everyone.** Keep TURN provisioned (Cloudflare/Twilio/coturn) since NAT/relay needs don't disappear; budget for TURN egress at launch. Do **not** adopt SDR. The only "Steam networking" you touch is the lobby-as-room-code-carrier in §3, which never moves game packets.

**Room codes + Steam invites without forking netcode:** Steam lobby stores a single key (e.g. `roomCode=ABCD`). Invite/Join flow resolves that key and hands it to your normal `joinRoom(code)`. Browser players still join by typing/pasting the same code or clicking a web invite link. One join path, two entry points.

---

## 5. The single legitimate web↔desktop divergence: quality + capability flags

Engine identical; what differs is a **capability/profile object** the desktop bridge populates:

- **Asset pack**: web loads streamed/size-capped assets from R2; desktop loads a **bundled high-res pack from local filesystem** (no download-size limit). Same asset *pipeline*, different manifest + source.
- **Quality tier default**: desktop may default to HIGH (more VRAM/memory headroom, bundled WebGPU); web may default LOW/MID and detect up. (Tier system owned by the engine team — this plan just consumes it.)
- **Steam capabilities on**: Cloud/achievements/presence/input active.

These are **data/flags, not code branches in the engine**. No second build target beyond Electron packaging + the desktop asset manifest.

---

## 6. AI content disclosure (Steam, 2026)

**Classification:** All your audio is **ElevenLabs**, generated at build time and shipped as static files -> this is **Tier 1: Pre-Generated AI Content** (NOT Tier 2 Live-Generated, since nothing is synthesized at runtime). Tier 2's heavier requirements (model list, runtime guardrails, output-variance acknowledgment) do **not** apply — keep it that way by never doing on-device/runtime generation.

**Exemptions you can ignore in the form:** AI coding assistants (Copilot/Claude Code/Cursor), MCP servers, build tooling, and classic non-AI procedural generation are explicitly exempt — do not disclose those.

**What the form needs (Content Survey -> AI section):**
1. Confirm your game contains AI-generated content (Pre-Generated).
2. Check the affected content **categories** — for you: **Audio** (voice/VO, ambience, SFX, music — whichever ElevenLabs produces). Leave Art/Code/Text unchecked unless AI touched shipped assets there.
3. A **brief free-text description** of what's AI-made and that it's human-reviewed/edited.

**Recommended wording (paste into the description field):**
> "All in-game audio in Signal Lost — character voice/dialogue, ambient soundscapes, and certain sound effects — is generated using ElevenLabs AI voice and audio tools during development, then curated, edited, mixed, and reviewed by our team before shipping. No audio or other content is generated by AI at runtime; all AI-assisted content is pre-generated and human-approved. AI coding/editor assistants used purely for development are not included in shipped content."

This both satisfies the survey and pre-empts the public store-page "AI Generated Content Disclosure" box. **Get the wording legal-reviewed and ensure you hold the appropriate ElevenLabs commercial/usage license for shipped output.**

---

## 7. Store + launch mechanics (ties to "web demo first + Steam page")

| Lever | Plan |
|---|---|
| **Steam page** | Live from **day one** with **Wishlist** enabled. Trailer + screenshots from the WebGPU build. AI disclosure filled before page review. |
| **Free demo** | **Web demo is the top-of-funnel** (instant, no install, shareable link) — Ship 1 vertical slice. Also publish a **Steam Demo** (free) app linked to the main page so Steam's "Next Fest"/demo discovery + wishlist-from-demo mechanics work. Same app, demo = capped content flag. |
| **Paid product** | The **wrapped desktop build** (Electron, PC + Mac) is the paid SKU: bundled high-res asset pack, Steam Cloud/achievements, best fidelity. |
| **Pricing / split** | Demo free (web + Steam demo). Paid desktop game premium indie-co-op price point (decide later, see open questions). Consider the web build as **permanently-free demo / paid-unlock** vs desktop-only-paid — recommend keeping the *full* paid experience desktop-only on Steam to preserve the "real product" framing and avoid web piracy of the full asset pack. |
| **Streamer / coordinated launch** | Friends-co-op horror is streamer fuel. Coordinate a launch beat with the **mic-permission climax** (the scripted moment that asks for mic) — instruct streamers to enable mic; it's the shareable highlight. Web demo link lowers the barrier for streamer pickup pre-launch; Steam keys for the paid build at launch. |
| **Mic permission** | Web: browser prompt at the climax. Desktop: Electron permission handler / Steam — pre-warm the permission so the dramatic beat isn't broken by an OS dialog; design the moment to gracefully degrade if denied. |

---

## 8. Why the desktop build must NOT diverge beyond packaging

Same renderer, same netcode, same gameplay code. Divergence is confined to: (1) Electron shell + auto-update, (2) steamworks.js bridge, (3) local high-res asset manifest, (4) default quality tier. Any deeper fork (native renderer, SDR netcode, separate gameplay) multiplies QA, breaks cross-play, and contradicts the locked "one app" truth. Hold the line.

**Bake in now:**
- PlatformBridge interface (web no-op impl + Steam impl) injected at boot — engine/HUD/netcode must NEVER import Steamworks directly; this is the keystone that keeps it one app.
- Shared achievement/stat ID enum in a common TS package, with unlock() call sites that work identically on web (local toast/no-op) and desktop (real Steam unlock).
- Settings + meta-progression serialized through bridge.saveMeta/loadMeta so the SAME blobs route to IndexedDB/R2 (web) or Steam Cloud (desktop) — design the save schema once, platform-agnostic.
- Keep ALL networking on WebRTC + STUN/TURN; explicitly forbid Steam Datagram Relay / Steam P2P in the netcode to preserve browser<->desktop cross-play. Provision TURN from the start and budget its egress.
- Room-code join must have a single entry function joinRoom(code); Steam lobby + web invite link are just two callers of it — never a second netcode path.
- Capability/quality-profile object (asset manifest source, default tier, steam-features-on) is the ONLY sanctioned web-vs-desktop divergence point — flags/data, not engine code branches.
- Choose Electron (bundled Chromium = predictable WebGPU) over Tauri (OS WebView WebGPU is inconsistent in 2026); pin steamworks.js as the binding.
- Asset pipeline must support two manifests from day one: size-capped streamed (web/R2) and bundled-local high-res (desktop) — same pipeline, different manifest.
- Mark all ElevenLabs audio as Tier-1 Pre-Generated in the build pipeline and NEVER add runtime AI generation, to stay out of Steam's heavier Tier-2 disclosure regime.
- Steam page + Wishlist + AI-disclosure survey are launch-blockers to set up early, not late; a free Steam Demo app should mirror the web demo content cap.

**Open questions:**
- Final pricing for the paid desktop build, and the web/desktop split: is the web build a permanent free demo only, or a paid-unlockable full experience? (Recommend desktop-only for the full paid product.)
- Electron vs Tauri must be confirmed by the engine/renderer team's WebGPU testing on macOS WKWebView and Windows WebView2 — if Tauri's WebGPU proves solid in 2026, the binding flips to steamworks-rs; this plan assumes Electron.
- Do we ship a separate Steam Demo app (for Next Fest/demo discovery) in addition to the web demo, accepting the extra store-listing + build-flag maintenance?
- macOS distribution specifics on Steam: notarization/codesigning of the Electron build, and whether Apple-silicon-native (arm64) + Intel universal binary is required for the Mac SKU.
- Steam Overlay compositing over the WebGPU canvas in Electron needs early validation — is there a fallback if the overlay can't draw over the WebGPU surface?
- TURN provider + cost model at expected concurrency (Cloudflare TURN vs coturn self-host vs Twilio) — relay egress is the main recurring netcode cost.
- Confirm the exact ElevenLabs commercial license terms permit shipping generated audio in a paid product, and get the AI-disclosure wording legal-reviewed.
- Mic-permission UX at the climax on desktop: pre-warm via Electron permission API early in the session so the OS prompt doesn't break the scripted scare — needs a designed graceful-degrade path if denied.
