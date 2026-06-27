# SIGNAL LOST — Design & Technical Plan

> Working titles: **SIGNAL LOST** / **DEADLINE**
> A 1–4 player, peer-to-peer, browser-based co-op space-horror descent.

---

## 1. Vision

A massive, Star-Wars-scale spaceship has gone dark. All comms lost. Nobody knows what
happened. 1–4 players each launch from **Earth** in a small escape capsule, get shot into
space, and **dock** into the derelict. From the docking bay they must fight their way on
foot through the ship to the **Command Centre** — the end point — while aliens and monsters
that have taken over the hull hunt them in the dark.

**Emotional target:** exciting, dopamine-driving, scary, horror — but **funny-scary co-op**
(Lethal-Company-style chaos with friends), not relentless grimness: real scares with emergent
slapstick as the release valve, while the *lore* stays dark and serious. Sound and music are a
**first-class system**, not decoration — all audio is generated via **ElevenLabs** and driven by
an AI "fear director." (Tone + the full contextual-physics suite locked 2026-06-27 — see §15.)

**Visual target — DECIDED (2026-06-27): low-poly / PS1-retro register** (the Lethal Company /
HauntedPS1 family) with a **mixed-hybrid monster** (the CHORUS pushed one notch more grounded so it
breaks the register and reads scary). This *deliberately redefines* the original "highest 3D quality
in a browser" goal as **highest art/craft quality within low-poly + a standout monster**, not highest
fidelity — chosen for tone-fit (funny-scary), browser performance, the full-physics-chaos budget, and
tiny-team feasibility. Mood comes from **lighting + fog + flashlight + audio**, which low-poly does
best (limited info → imagination fills the dark). The *direction* (which of the 4 themes) is still
picked from the M-ART board, now rendered low-poly. See [ART-DIRECTION.md](ART-DIRECTION.md).

**Reference vibes:** Dead Space, Alien: Isolation, GTFO, Lethal Company, Left 4 Dead.

---

## 2. The Run (flow)

A single ~25–40 min (target median ~28 min) **one-way descent**, authored end to end:

```
MAIN MENU → LOBBY (room code, 1–4 players)
   → EARTH LAUNCH (on-rails capsule launch cinematic — tutorial-by-fiction, masks first load)
   → DOCKING (capsule slams into the derelict's airlock)
   → SHIP INTERIOR: 5 escalating sections, quiet → loud → quiet → CLIMAX
   → COMMAND CENTRE: restore comms (the signature moment)
   → EXTRACTION / WIN  (or wipe / LOSE)
```

Pacing is a deliberate **tension curve** — earn the quiet, then break it. ~70/30 slow-burn
to spike. Forced lulls and a "silence budget" are non-negotiable so scares keep landing.

---

## 3. Design Pillars

1. **Sound is the monster.** The AI Director controls silence, music, stingers AND spawns
   as one coordinated "fear instrument." The audio *is* the gameplay tell.
2. **Light is resource and threat.** The flashlight is your safety and your liability —
   battery is scarce, and light attracts the apex enemy. Light-greed replaces Lethal
   Company's loot-greed as the core risk/reward knob.
3. **Together or dead.** A shared **Resolve** (sanity) meter decays faster when isolated and
   in darkness. Splitting up is sometimes necessary, always punished.
4. **Readable, weighty combat.** Ammo-scarce gunplay with Dead-Space-style **limb
   dismemberment** as the skill ceiling — sever the legs so the Stalker can't pounce.
5. **One authored climax worth the whole run.** See below.

---

## 4. Signature Moment — COMMS RESTORE

The win condition at the Command Centre: players restore the ship's transmitter, which
**broadcasts their own live, terrified voices and combat audio back to Earth.** The title
pays off — the signal, lost, is found. This is the memorable beat the whole game is built
around. (Depends on positional voice chat — see open decisions.)

---

## 5. Enemy Roster (6 archetypes)

Each enemy = exactly one **fear verb** + one **player counter-verb** (for 4-player readability).
Detection is **sound-based** (a per-player noise budget on a spatial grid) — cheap in-browser
and it turns the player's audio choices into gameplay.

| Enemy | Fear | Counter |
|---|---|---|
| **Stalker** | being hunted | face it / sever legs |
| **Swarmer / Hive** | being overwhelmed | crowd control, hold the choke |
| **Brute** | being cornered | kite, hit the weak point |
| **Wall-Crawler / Ambusher** | the ceiling | look up, watch vents |
| **Spitter** | ranged pressure | break line of sight |
| **The Maw** (boss, near Command Centre) | the climax | coordinated team play |

All AI runs **only on the host** (host-authoritative); peers render replicated, interpolated
enemy snapshots. Pathfinding via `recast-navigation-js` (WASM Recast/Detour) with off-mesh
links for vents/ceilings.

---

## 6. The AI Director (the headline system)

Two co-located layers on the host:

- **Population Director** — paces spawns to a `BUILD → PEAK → RELAX` tension curve (Left 4
  Dead style), scaled by player count, with hard spawn-suppression "lull" windows and a
  "scare debt" budget it refuses to overspend.
- **Scare Director** — owns all ElevenLabs audio cues, telegraphs danger ~1s ahead, places
  stingers, ducks the music. Emits compact **reliable audio-event ids** to all peers; each
  client plays the **pre-baked** clip locally (zero audio over the wire, zero scare latency).
  A shared seed picks which screech *variant* plays so it's consistent without extra data.

Solo / low-player runs get a "**mercy profile**" (more telegraph lead, a constant Stalker
presence) plus an AI mission-control voice for tone — not naive HP inflation.

---

## 7. Audio System (all ElevenLabs)

**Principle: pre-bake everything that fires on a game event.** Treat ElevenLabs as a
*build-time content pipeline*, not a runtime service. The game must be 100% playable and
scary with zero API calls at runtime.

- **Build-time `gen-audio.ts`** calls ElevenLabs (Sound Effects, **Music v2** composition-plan,
  Voice Design, TTS) → versioned, hashed, CDN-hosted **audio pack** (manifest + files).
- **Runtime: custom Web Audio API engine** (not Howler/Wwise) for sample-accurate scheduling.
  - **Adaptive music** = horizontal re-sequencing (swap exploration↔combat at bar
    boundaries) + vertical layering (crossfade 4–6 stems by a single `tension` float).
    Author one Music-v2 composition plan per zone so all stems are tempo/harmony locked.
  - **Spatial audio** via `PannerNode` (HRTF), occlusion via lowpass+gain, per-section reverb
    zones (`ConvolverNode`) baked into level data.
- **Runtime ElevenLabs use is limited to ONE optional path:** Flash v2.5 streaming TTS for
  dynamic ship-AI barks, with a pre-baked line library as the always-on fallback. Never on
  the critical path of a scare.
- **Licensing:** assume Music-v2 needs an **additional games/distribution license** beyond
  SFX/voice (cheaper-to-be-wrong assumption). Confirm in writing before baking the library;
  keep a provenance manifest (prompts/seeds/receipts) for every generated asset.

---

## 8. Recommended Tech Stack (consensus)

| Layer | Choice | Notes |
|---|---|---|
| Language / build | **TypeScript + Vite**, pnpm + Turborepo monorepo | packages: `engine, ecs, netcode, audio, physics, ui`; apps: `client, signaling-worker, content-pipeline` |
| Rendering | **Three.js r185 `WebGPURenderer`** (`three/webgpu`), WebGL2 auto-fallback | RenderPipeline/TSL node post stack. Babylon.js 8 = documented backup |
| Entities | **bitECS** (data-oriented, SoA, serializes cleanly) | thin OOP facade only for singletons (audio director) |
| Physics | **Rapier** (Rust→WASM, enhanced-determinism), host-only | kinematic character controller for players + monsters |
| Netcode | **Host-authoritative WebRTC DataChannels**, star topology | `simple-peer` transport (reliable + unreliable channels); `Trystero`/PartyKit signaling |
| Pathfinding | **recast-navigation-js** (WASM Recast/Detour) | off-mesh links for vents/ceilings, Detour crowd manager |
| Audio | **Custom Web Audio engine** + build-time ElevenLabs pipeline | see §7 |
| UI / HUD | **React DOM overlay** above the canvas, decoupled via Zustand/Valtio | never re-render React per frame; combat HUD via refs/canvas |
| State machine | **XState** (or hand-rolled) top-level FSM | `boot→menu→lobby→launch→docking→in-ship→win/lose→debrief` |
| Backend | **Cloudflare Workers + Durable Objects (PartyKit)** | one DO per room; signaling + lobby only |
| TURN | Managed **Metered / Open Relay / Cloudflare** (self-host coturn later) | **mandatory** for ~8–20% symmetric-NAT players |
| Hosting | Cloudflare **Pages + R2** (web client + asset CDN) | static build, no per-player server cost |
| Desktop client | **Electron** (electron-forge) + `steamworks.js`, wrapping the same web app for **PC + Mac on Steam** | bundled Chromium = guaranteed/consistent WebGPU; Tauri rejected (macOS WKWebView ships no WebGPU by default). See [PLATFORM-AND-QUALITY.md](PLATFORM-AND-QUALITY.md) |
| Platform layer | `packages/platform` — `Platform`/`Capabilities`/`SteamService` interfaces | code branches on `platform.caps`, never `if(electron)`; one native boundary (preload `contextBridge`) |
| Quality tiers | **Low / Mid / High / Ultra** via one frozen `RenderProfile` every subsystem reads | **Low-poly reframe (2026-06-27):** visual *style is constant* across tiers; tiers ladder **simulation headroom** (physics objects/ragdolls/debris/enemy counts), framerate (120/144 on Ultra), draw/fog distance, and render crispness — *not* fidelity. SSGI dropped; SSR → optional stylized floor sheen. The freed GPU budget powers the physics-chaos suite. See [LOW-POLY-PIVOT.md](LOW-POLY-PIVOT.md) |
| VFX | `three.quarks` particles, decals (blood/scorch), GPU fog motes | |
| Asset pipeline | `gltf-transform` → **meshopt** + **KTX2/Basis**, **dual-axis variants (tier × platform × LOD)** | web-lite (ETC1S, ≤180MB first-load budget) vs desktop-HD (UASTC 4K, local FS); variant-keyed manifest + `selectVariant()` loader |

**Rejected:** pixel-streaming (Unreal/Unity) — needs a render server per player (~$0.50–1/stream-hr),
adds input latency, and violates the P2P / no-dedicated-server constraint.

---

## 9. Architecture — Host-Authoritative P2P

- **Star topology:** every peer connects to one **host**; the host fans out world snapshots.
  Not full mesh, not lockstep.
- **Host simulates everything:** fixed 60 Hz bitECS + Rapier sim — all physics, enemy AI,
  the Director, loot, doors, damage resolution. Broadcasts **snapshots at 20 Hz**.
- **Clients** interpolate remote entities (~100 ms render-delay buffer) and run **client-side
  prediction + reconciliation** only on their own avatar.
- **Two DataChannels per link:** `reliable` (ordered) for combat events/objectives/chat;
  `unreliable` (`maxRetransmits:0`) for high-rate transforms/snapshots. Binary, delta-compressed
  against last-acked snapshot, quantized floats.
- **Determinism is host-only** — for input-replay bug repro and warm-standby migration
  snapshots. Clients never assume bit-for-bit parity.
- **Host migration (staged):** MVP — host-loss ends the run. Pre-release (M6) — warm-standby
  snapshot every few seconds; on drop, lowest peer-id re-hosts and resumes from the last
  **safe-room checkpoint**, masked by a diegetic "comms reacquiring" freeze. Target
  checkpoint-resume, *not* seamless mid-fight migration.

---

## 10. Rendering Approach (the horror look)

- **WebGPU-first** (~82–85% native in 2026, ~95% with fallback). Fallback degrades *effects*,
  not coverage.
- **Hybrid lighting:** baked lightmaps + AO for static hull; tiny real-time shadow budget
  (the flashlight + ~2–4 flickering panels + muzzle flash). Emissive flicker driven by TSL
  noise, synced to the audio director's beats.
- **Horror post stack (TSL/RenderPipeline, director-drivable):** ACES/AgX tonemap → GTAO →
  SSR / SSGI (WebGPU only) → restrained bloom → volumetric fog / god-rays → dynamic vignette →
  film grain → chromatic aberration → optional motion blur (accessibility toggle).
- **Budget:** <150 draw calls, <12 ms GPU/frame, 60fps for 1–4 players. GPU-driven
  frustum+occlusion culling, `InstancedMesh` for set-dressing & swarms, 3-tier LOD, object
  pools (no GC hitch can break a scare).
- **Camera:** first-person (max fear + immersion + cheaper local render). Remote teammates
  rendered third-person; spectator/death-cam for downed players.
- **Level streaming:** ship split into per-deck sector GLBs, streamed along the critical path,
  loads masked by the launch/docking cinematic and airlock/elevator transitions.

---

## 11. Art Direction & Asset Pipeline

- **Lighting + audio first, geometry second.** Near-black corridors, one flashlight, baked GI,
  animated emissive panels, volumetric fog. Scariest *and* cheapest path.
- **Modular trim-sheet kit** (corridors, junctions, rooms, vents, doors, command centre)
  sharing 2–4 trim/atlas materials — the single biggest lever on both build speed and texture
  memory. **Levels are hand-assembled** from the kit (sockets used for authoring/validation,
  not runtime WFC — see open decisions).
- **Sourcing priority:** CC0 first (Poly Haven HDRIs/textures, Quaternius/Kenney models,
  AmbientCG materials) → targeted paid kits (Fab/ArtStation sci-fi trim) → AI gen (Meshy/Tripo)
  for filler → custom Blender for hero assets + the trim sheets.
- **Avoid Synty** as shipped browser assets (EULA forbids redistribution; GLBs are trivially
  extractable from a browser). CC0/owned/AI-Pro-tier only unless written authorization.
- **Characters:** Mixamo / AccuRIG+ActorCore for humanoids; Quaternius CC0 monster pack as the
  alien baseline, kitbashed in Blender. In-engine GLTF skinned meshes + small blend-tree/HFSM
  + runtime IK (foot/aim). Dismemberment via pre-segmented meshes + per-limb HP + mesh swap.
- **CI budgets** enforced via `gltf-transform inspect`: draw calls, triangles, and **texture
  memory** (not disk size — KTX2 is tiny on disk but balloons 10–100× in VRAM).

---

## 12. MVP — "Haunted Corridor" Vertical Slice

The smallest build that is genuinely *scary* and proves every load-bearing piece end-to-end.
**Target: 5–8 min of play, 2 players, 60fps on a mid laptop, WebGL2 fallback verified.**

**In scope**
- 2-player host-authoritative P2P (join by code, STUN + one TURN provider, snapshot interp +
  local prediction, netcode debug HUD).
- First-person, KB+M, pointer-lock, one weapon (pulse rifle) + melee, ammo scarcity, reload.
- ONE handcrafted corridor + safe-room from the modular kit; full WebGPU post stack with
  graceful WebGL2 degrade.
- Flashlight + battery + simplified Resolve drain.
- ONE Stalker (sound/light detection) + ONE Swarmer vent wave; dismemberment proof (legless
  Stalker can't pounce).
- Host-only AI (navmesh, noise sensing, one BUILD→PEAK→RELAX cycle); host-validated hits.
- Scare Director emitting reliable audio-event ids; full pre-baked ElevenLabs slice library
  played locally (ambient bed, 2–3 music stems, stingers, Stalker mimic SFX, one ship-AI line).
- One objective node (power/door) that triggers the telegraphed spike.
- The real build-time gen-audio + gltf-transform/KTX2 pipelines (proven, not stubbed).

**Out of scope:** players 3–4, host migration/reconnect, the full 5 sections + Maw boss +
COMMS-RESTORE climax, the other 4 enemies, positional voice chat, runtime ElevenLabs,
meta-progression, procedural generation, mobile/gamepad, full accessibility suite.

---

## 13. Roadmap (decide the look + sound first, then prove it, then build)

> **Reordered (2026-06-27, art-first):** you decide the **art direction** and **audio feel** from
> examples *before* any 3D is built. **M-ART** (concept board → pick a style; [ART-DIRECTION.md](ART-DIRECTION.md))
> and **M-SOUND** (audio aesthetic proof; [M-SOUND.md](M-SOUND.md)) run first and in parallel;
> **M-LOOK** then proves the *chosen* style in 3D. Campaign = **ships-are-maps** (build **Ship 1**
> first; [specs/09-ships-as-maps.md](specs/09-ships-as-maps.md)). Lore now canonical in
> [LORE.md](LORE.md); contextual physics in [specs/11-contextual-physics-zones.md](specs/11-contextual-physics-zones.md).

| # | Milestone | Goal |
|---|---|---|
| **M-ART** ⭐ | **Art-Direction Decision Gate** (2D only) | A ~20-frame concept board across **4 directions** (Iron Lung / Analog Ghost / Sterile Wound / Leviathan Bloom) at 5 matched shots (exterior, docking bay, corridor, command centre, creature). **You pick one direction or a named blend.** Days, no code. *Nothing 3D starts until this is decided.* |
| **M-SOUND** ⭐ | **Audio Aesthetic Proof** (parallel) | A ~90 s "Docking Bay → first contact" scene you can *hear*: ambience bed, tension→near-silence, sub-bass dread, a ship-AI line + a creature vocal through the corrupted-AI FX chain, mastered to target loudness. **GREEN/RED feel gate.** |
| **M-LOOK** | **3D Quality Proof of the CHOSEN style** | Real-time WebGPU exterior hero ship + one walkable interior, built to the picked M-ART direction. GREEN = "looks AAA" **and** matches the concept board. **Adds a creature/character quality gate.** Renderer promotes into `packages/engine` on GREEN. |
| **M0** | Netcode spike + Zone/Physics + Voice foundations | Host-auth P2P + fully-serializable world; **the Zone/Region abstraction** (per-zone gravity + atmosphere fields, stubbed `zonePhysicsSystem`) so zero-G/vacuum are later a *data* change; **positional-voice WebRTC spike pulled forward**. |
| **M1** | Render production + Ship 1 art | Promote M-LOOK renderer; build Ship 1 (Cargo Hauler) to the chosen-style AAA bar; zone authoring tooling. *Decide zero-G ambition before this.* |
| **M2** | Host AI + combat + telemetry + narrative | AI Director + 6 enemy archetypes (the **CHORUS** acoustic roles) + dismemberment; **bespoke hero-enemy art**; **fear/pacing telemetry as a real system**; author lore logs + environmental storytelling. |
| **M3** | Audio production loop | Full ElevenLabs build pipeline (v3 + Audio Tags pre-baked, Flash v2.5 barks), Director fear-mix (silence budget + dreadBus), creature vocal grammar, COMMS-RESTORE climax pass — to the M-SOUND aesthetic + loudness gate. **Audio Forge** console here. |
| **M4** | **Vertical Slice + fun-AND-scare playtest gate** | The Haunted Corridor slice **incl. the signature ZERO-G HULL-BREACH DECOMPRESSION beat**; explicit playtest gate measuring **both fun and fear** via M2 telemetry; diegetic tutorial. **Green-light gate.** |
| **M5** | Scale to 4 Players + Perf Governor | 60 fps worst case; proximity voice in the loop; solo + mic-less fallback; Low/Mid/High/Ultra tiers. |
| **M6** | **Ship 1 Complete + COMMS-RESTORE + Host Migration** | Ship 1 as a self-contained 18–25 min product: lore-loaded escalating climax, successor host-migration (warm-standby + "comms reacquiring" freeze). **Ship 1 IS the first shippable product;** more ships = content cadence. |
| **M7** | Hardening / Replay / Steam / Launch | Replay layer (tiers/seed-modifiers/NG+), accessibility, reconnect, telemetry, Electron-wrapped paid Steam client, cross-play, free browser launch. |

---

## 14. Top Risks

> **Player-research update (2026-06-27):** the single biggest risk is the *combined* fragility
> of host-loss-ends-run **+** no mid-run saves **+** a one-and-done fixed campaign, all on
> perf/NAT-fragile browser P2P. That stack is the genre's #1 documented retention-killer
> ("host left = time theft") sitting on top of its #1 long-term death-cause (content drought).
> The three are now treated as **MVP must-fixes**, not "later" — see §17.

| Severity | Risk | Mitigation |
|---|---|---|
| **Critical** | Host is a single point of failure — a drop dumps the whole party mid-run | **Revised:** per-section checkpoints + grant all meta-progression the instant a section clears, so a drop never zeroes a session; architect host-authoritative state for between-section migration *now* (only designable early). Non-blaming "host disconnected — progress saved" screen. |
| **High** | ~8–20% symmetric-NAT players can't form a P2P link and silently fail | TURN mandatory from M0; surface connection state (direct/relayed/failed) in UI |
| **High** | Host hardware sets the experience for everyone | Host frame-budget governor (M5); detect capability at lobby, recommend strongest host; object pools |
| **High** | WebGPU/RenderPipeline experimental edges; fallback loses the mood | Prove mood first (M1); pin Three version; gate WebGPU-only passes; lean on baked light + dark + audio (cheap + scary) |
| **High** | "Audio-first horror" degrades into constant noise → fatigue, scares stop landing | Non-negotiable silence budget + forced lulls + scare-debt cap; build pacing telemetry early |
| **Medium** | Texture memory blows GPU budget; large first-load hurts bounce | Trim-sheet kit (2–4 materials); CI texture-memory budgets; stream sectors, mask behind cinematic |
| **Medium** | Asset & ElevenLabs-Music licensing in an extractable browser build | CC0/owned/AI-Pro only; confirm Music-v2 game license in writing; provenance manifest |

---

## 15. Decisions

### Locked (2026-06-27)
1. **Scope:** Small, serious indie — a few people over months. Full roadmap to a shippable
   game is the goal, staged carefully; the vertical slice (M0–M4) is the first hard gate.
2. **Platform:** **Desktop-class browsers + a PC/Mac Steam desktop client** (same engine,
   Electron-wrapped; see #6 and §18.5). No mobile/touch in v1. WebGPU primary
   (Chrome/Edge/Safari 26+), WebGL2 fallback. Quality scales **Low/Mid/High/Ultra** (Ultra =
   desktop-only); the full volumetric/SSR horror mood is a *requirement* at High/Ultra,
   gracefully degraded below.
3. **Multiplayer reach:** **Friends-only room codes.** Trust model is trivial → no anti-cheat
   or moderation needed in v1; P2P stays simple. (Public matchmaking is a possible later
   milestone — out of scope for now.)
4. **Run structure:** **Fixed authored campaign** + light meta-progression (cosmetics /
   loadout / lore), now with a **day-one replay layer** (see #7). Handcrafted route, scripted
   audio-fear pacing. No procedural/WFC level generation in v1.
5. **AI voice: full ElevenLabs voice everywhere** (narration, ship-AI, comms, creature vocals,
   hero lines) — consistent with the all-ElevenLabs vision. Risk *managed, not reduced:* a
   high quality bar (careful Voice Design + post-processing), **Steam AI-content disclosure
   from day one**, the audio pipeline architected so any line can be hot-swapped for human VO
   later (cheap insurance), and the real-human-voice **COMMS-RESTORE** climax as the emotional
   anchor. (§7)
6. **Distribution — the FULL game is free in the browser** (instant-play, maximal reach + streamer
   virality, the genre's #1 discovery channel), and the **Steam PC/Mac client is a premium *paid*
   product** built on the same engine. The browser plays the full campaign at up to **High** tier
   with web-lite assets; the paid Steam client adds **Ultra fidelity + the 4K asset pack**, native
   performance/consistency, achievements/Cloud/friends, offline play, and "support the devs."
   Steam page + Wishlist from day one. ⚠️ **Monetization caveat:** free-in-browser maximizes reach
   but weakens direct sales — the Steam premium must be *visibly* worth paying for, and we should
   revisit secondary monetization (cosmetic packs, supporter edition, paid DLC ships). (§17.8, §18.5)
7. **Longevity: day-one replay layer + committed post-launch content cadence.** Difficulty
   tiers, weekly-seed modifiers, NG+ recombining the 5 sections; the Director randomizes spawn
   mix / apex behavior / lighting / objective order / audio so a known map threatens
   differently. First-party content updates (no mod workshop to lean on). (§3, §6)
11. **Tone: comedic / chaotic "funny-scary" co-op** (user choice, 2026-06-27) — lean into the
    Lethal-Company / Content-Warning friend-group chaos: emergent slapstick (friendly-fire,
    voice-panic, light-greed disasters), high shareability/clip-virality, less punishing,
    jank-as-charm. **Reconciliation:** the *lore stays dark and serious* (the CHORUS, "title is a
    trap") — it's the *moment-to-moment play* that's chaotic-funny, exactly the Lethal-Company
    model (grim premise, hilarious deaths). Horror beats and scares remain real; the comedy is the
    *release valve* between them. Tunes mechanics toward readable, forgiving, physics-comedy-
    friendly (ragdolls, props, proximity voice). Steers away from oppressive Alien-Isolation grimness.
12. **Contextual physics: FULL SUITE** (user choice, 2026-06-27) — zero-G + low-G + directional
    gravity + vacuum/decompression + flooding/buoyancy as a rich, *recurring* system across ships,
    not a one-off beat. This is now a **signature differentiator** (and a perfect comedy+horror
    engine — zero-G chaos with friends). **Implication/scope:** the character controller must
    support `grounded | float | swim` modes and the navmesh must handle variable gravity — built
    progressively (grounded first) but designed-for from M0. Raises scope/risk; sequence carefully.
    See [specs/11-contextual-physics-zones.md](specs/11-contextual-physics-zones.md).

### Still open (recommended defaults — confirm or override)
8. **Positional voice chat — v1 or fast-follow?** *Recommendation: build it in v1.* The
   COMMS-RESTORE climax depends on it and it's a core differentiator; schedule it at M6 with
   the climax, but keep the noise-budget hook in mind from M2. A non-voice fallback ships too
   (so mic-less / 1–2-player groups still get the climax).
9. **Host-migration ambition — DECIDED:** successor takeover (next player in line becomes host)
   via warm-standby snapshots + a 2–6 s "comms reacquiring" freeze; guaranteed at checkpoints/
   between-ships, best-effort mid-level; fully-serializable world architected from M0. (§18.3)
10. **Art / IP tone.** *Recommendation: homage-adjacent but a distinct identity* — lean on the
    Dead Space/Alien lighting-and-dread *language* while designing original creatures and ship
    motifs to avoid derivative perception and IP proximity.

---

## 16. Gaps to Own Early (no brief covered these)

Input/control scheme & pointer-lock UX · positional voice-chat transport · accessibility &
photosensitivity (the design leans on strobing flicker) · anti-grief/moderation · mid-run
reconnect of a non-host player · pacing **telemetry/instrumentation** (the whole design rests
on a tuned curve you can't tune without data) · realistic **art content volume** vs team size ·
onboarding/tutorial for the deep light/Resolve/dismemberment systems · browser first-load
size budget & progressive download.

---

## 17. Player-Sentiment Reality-Check — Revisions (2026-06-27)

Cross-checked the plan against real community sentiment (Reddit, Steam reviews, YouTube,
forums) across Lethal Company, GTFO, Phasmophobia, Dead Space, Alien Isolation, L4D/Back 4
Blood, plus AI-audio backlash, P2P/browser, and retention. Full report: `docs/RESEARCH.md`.

### Validated — keep (the core bets are right)
Friends-only room-code instant browser join · audio-as-fear-system + L4D/Alien-Isolation
AI Director · sound-based detection ("too scared to speak") · scarce ammo **and** battery ·
limb dismemberment · the COMMS-RESTORE live-voice climax (weaponizes the genre's most-loved
feature, novel, viral, and it *inoculates* the AI-voice risk with real human performance) ·
all-ElevenLabs **music + SFX** (low backlash) · fixed 5-section authored arc as the pacing
backbone · light meta-progression · shared Resolve meter.

### Must-fix changes (folded into the plan)
1. **Defuse the run-fragility stack.** Per-section checkpoints; grant meta-progression the
   moment a section clears; non-blaming host-disconnect screen + quick-rejoin; architect
   host-migration-capable state now. (§14, M0/M6)
2. **Replay layer is day-one, not post-launch.** Fixed campaign is the backbone, but ship
   difficulty tiers, weekly-seed modifiers, and NG+ that recombines the 5 sections; lean the
   Director hard into randomizing spawn mix / apex behavior / lighting / objective order /
   audio so a *known* map sounds and threatens differently each run. Commit to a first-party
   content cadence (no mod workshop exists to do it for us). (§3, §6, roadmap)
3. **AI-voice handling — DECIDED: full ElevenLabs voice everywhere** (the one real
   reputational lightning rod; music/SFX are fine). Risk *managed, not reduced:* hold a high
   quality bar (deliberate Voice Design + post-processing so delivery doesn't read as flat),
   **disclose AI audio on the Steam storefront from day one** (required by Steam policy
   anyway) and lead the narrative with "a tiny team that never had a VO cast to replace,"
   architect the pipeline so any spoken line can be **hot-swapped for human VO** later (cheap
   insurance if a specific line draws heat), and foreground the real-human-voice
   **COMMS-RESTORE** climax in all marketing as the emotional anchor that inoculates the
   "soulless" framing. Where it *enhances* atmosphere, lean spoken lines diegetic/degraded
   (radio static, distorted distress logs) — by choice, not as a cap on usage. (§7)
4. **Solo + 1–2-player + mic-less path in v1.** Friends-only with no solo = no game when
   friends are offline. Tuned solo mode (Director eases, density scales), and a non-voice
   fallback so COMMS-RESTORE still lands mic-less. Default difficulty = casual friend-group;
   gate punishing scarcity behind opt-in tiers. (§4)
5. **Performance floor + NAT/TURN as launch gates, not polish.** Scalable fidelity ladder,
   hard frame-pacing targets, per-section streaming, <~100–200MB initial load + interactive
   loader, first-class TURN fallback + human-readable connection diagnostics, guest
   prediction/lag-comp for aiming & hit-reg. Max-fidelity-in-browser is acutely exposed to
   FPS review-bombs (lethal in horror) and load-screen bounce. (§9, §10, M5)

### Should / consider
6. **Diegetic 5-minute tutorial** (GTFO's #1 audience-killer was opacity, not difficulty) +
   a HUD that telegraphs resource and enemy-limb state legibly under low light.
7. **Director fairness rules:** guaranteed authored lulls between sections; cap continuous
   apex uptime; never punish competence (the Back 4 Blood feel-bad); **no spawns in cleared/
   visible space behind players**; protect ONE big crescendo (COMMS-RESTORE), no diluted
   mini-finales.
8. **Distribution — REVISED (2026-06-27):** the **full game is free in the browser** (maximal
   reach, instant-play, streamer virality) and the **Steam PC/Mac client is the premium paid
   product** (Ultra + 4K pack, native perf, Steam features, support-the-devs) — same engine,
   Electron-wrapped. Steam page + Wishlist from day one; coordinated streamer-seeded launch;
   request mic permission only at the climax via a diegetic prompt, behind HTTPS + clean domain +
   visible no-data statement. See the monetization caveat in §15.6 and §18.5.
9. **Leave tonal room for emergent comedy** (friendly-fire, voice-panic, light=bait) rather
   than relentless grimness — the comedy tail is where co-op horror retention lives — and bias
   budget toward the audio fear-system over raw polygon count.

---

## 18. Confirmed designs (2026-06-27) — quality-first, ships, migration, console

### 18.1 M-LOOK — see the quality before building the game ⭐
Full plan: [docs/M-LOOK.md](M-LOOK.md). The first milestone is a standalone look-dev build —
**ship exterior cinematic + one walkable interior corridor** at target fidelity — to answer
"is browser 3D AAA-good-enough?" with a GREEN/RED gate *before* any netcode. Fastest path to
"wow": buy quality (a kitbashed Kitbash3D hero ship + the CC0 Quaternius interior MegaKit +
Poly Haven/NASA backdrops) and spend the time on lighting + the TSL post stack. ~2.5–3 weeks.
Its renderer code promotes into `packages/engine` on GREEN, so it's not throwaway where it matters.

### 18.2 Ships are the maps
Full design: [docs/specs/09-ships-as-maps.md](specs/09-ships-as-maps.md). Each **ship = one
self-contained 18–25 min level** (own GLB set, biome, navmesh, music plan, Director arc,
command-centre objective). The campaign is a sequence of ships strung by short on-rails capsule
transits (reuse Earth-launch tech, no walkable hub). **Build Ship 1 (the Cargo Hauler) as the
whole first product** — 4–5 zones on one critical path — and make it fun before any second ship.
The **COMMS-RESTORE climax lives in every ship's command centre, escalating** (Ship 1 = its own
transmitter → … → final ship = the deep-space master relay), exactly one crescendo per ship.
Persistence = campaign-progress + light account-meta (granted on ship-clear, never zeroed by a
wipe/host-drop); gear carries across transits. New ships are the content-cadence + NG+/seed unit.

### 18.3 Host migration — successor takeover
Full design: [docs/specs/08-host-migration.md](specs/08-host-migration.md). **Yes — build it.**
When the host drops, the next player in line (deterministic successor: lowest join-order that has
ACKed a recent keyframe + passes a capability/RTT floor) **self-promotes**, re-brokers the same
room code via the signaling worker, peers re-handshake, and the run resumes from the last
warm-standby snapshot behind a 2–6 s diegetic **"comms reacquiring" freeze**. Enemy AI/physics
*resume* (not bit-for-bit) — fine for co-op horror; migration must never kill you (brief invuln on
resume). v1: **guaranteed at checkpoints/between-ships, best-effort mid-level.** The one thing to
architect **now** (post-M-LOOK): a **fully serializable world** (all state in bitECS components +
a small sim-state sidecar — nothing gameplay-relevant in closures/renderer objects).

### 18.5 Multi-platform + quality tiers
Full plan: [docs/PLATFORM-AND-QUALITY.md](PLATFORM-AND-QUALITY.md). **One engine**, two delivery
targets: the **browser** (fast iteration + the **full game, free**) and a **premium paid PC/Mac Steam client**
that is the *same web app wrapped in Electron* (bundled Chromium → guaranteed, consistent WebGPU on
both OSes; Tauri rejected because macOS WKWebView doesn't enable WebGPU by default). No second
renderer, no second netcode — **browser↔desktop cross-play** works because both run the identical
host-authoritative WebRTC + room-code stack (no Steam Datagram Relay, which would fork it).

**Quality ladder (Low / Mid / High / Ultra):** "browser = lower quality" is *false as a rule* —
same renderer everywhere; the browser is merely capped at **High** by the player's GPU + the web
download budget, while the desktop client unlocks **Ultra** (SSGI + a bundled 4K UASTC asset pack)
and guarantees a consistent High. Auto-detect on first load (platform gate → adapter probe → a 3 s
micro-benchmark) + an **adaptive render-scale governor** that holds 60 fps within the chosen tier,
with a manual override. Two orthogonal axes — **visual tier** (effects/shadows) and **asset tier**
(web-lite vs desktop-HD) — resolved by `effectiveTier = clamp(gpuTier, byAssetTier, byMemory)`.

**Bake into M-LOOK now** (without building the Electron shell): the `packages/platform` interfaces
(+ Browser real / Desktop stub), the 4-tier `RenderProfile` read by every lookdev subsystem (its
WebGL2 path *is* the Low tier), and the dual-axis asset pipeline emitting **two variant cells**
(web/mid + desktop/high) for the corridor + ship through a real mini-manifest + `selectVariant()`
loader — so capturing the web-lite vs desktop-full interior frames side by side proves desktop's
edge is *asset-driven, not a second renderer*. The real Electron app + Steamworks land around
**M4–M5** (before paid launch; ~2 weeks of mostly one-time signing/notarization/CI). Steam store
page + Wishlist + the **AI-content disclosure survey** (Tier-1 pre-generated audio) are early
launch-blockers to set up in parallel.

**Monetization model (user choice, 2026-06-27): the full game is free in the browser**; Steam is a
**premium paid client** of the same engine. The browser runs the full campaign at ≤High tier with
web-lite assets (so the 4K pack is never shipped to a browser → no 4K piracy + keeps the web
first-load budget sane via per-ship streaming); the paid Steam client is the "max edition" — Ultra
(SSGI + 4K), guaranteed-consistent native performance, achievements/Cloud/friends, offline play, and
supporting the devs. ⚠️ This maximizes reach and viral discovery (the genre's #1 channel) but
**weakens direct sales** — the Steam premium must feel *visibly* worth paying for, and secondary
monetization (cosmetic packs, a supporter/deluxe edition, paid DLC ships) should be revisited before
launch. Cross-play means free browser players and paying Steam players share rooms seamlessly.

### 18.4 Audio Forge — the ElevenLabs admin console
Full design: [docs/specs/10-audio-forge-console.md](specs/10-audio-forge-console.md). A
**local-only** Vite/React console + tiny Node/Hono sidecar (holds the API key, binds 127.0.0.1)
that is a *thin operator UI over the existing gen-audio pipeline + manifest* — one source of
truth, never a parallel system, never shipped in the game bundle. Lists every prompt grouped by
category; **generate one / batch / all-changed**; inline audio preview; per-row badges for
**status, file size, creation date, duration, and derived credit cost**; prompt-hash caching
(unchanged prompts = 0 API calls); a cost-confirmation modal before mass generation. The runtime
audio pack is a projection of *approved* rows, so the console and CI can never diverge.

---

## 19. Coverage scorecard — the 7 priorities (audited 2026-06-27)

| # | Priority | Status | Resolution |
|---|---|---|---|
| 1 | **See art direction FIRST, with examples, to choose a style** | ✅ now addressed | New **M-ART** is the literal first step — 4-direction concept board, you pick before any 3D. [ART-DIRECTION.md](ART-DIRECTION.md) |
| 2 | **Perfect scary audio / sound / voices** | ✅ now addressed | New **M-SOUND** early audio proof + deepened quality bar (dread sub-bass, silence budget, loudness gate, ElevenLabs v3 craft). [M-SOUND.md](M-SOUND.md) |
| 3 | **High-quality polished 3D** | ↑ improved | M-LOOK now builds the *chosen* style + a **creature/character quality gate**; bespoke hero-enemy art budgeted; Three.js pinned to r185. [M-LOOK.md](M-LOOK.md) |
| 4 | **Good lore/story that pulls people in** | ✅ now addressed | Was the biggest hole — now a canonical **Story Bible**: the "title is a trap" thesis, the **CHORUS** single-antagonist, the mimic reveal, the final choice. [LORE.md](LORE.md) |
| 5 | **Game design works well** | ↑ improved | Fear/pacing telemetry promoted to a real system (M2–M3); explicit **fun-AND-scare playtest gate** at M4; diegetic tutorial owned. |
| 6 | **A lot of fun AND scared** | ↑ improved | Fun engineered, not asserted: proximity voice pulled forward to M0/M2, "toy-feel" movement/weapons a first-class lever, tonal room for emergent comedy. |
| 7 | **Physics & behaviour based on where they are** | ✅ now addressed | First-class **Zone/Region** architecture (per-zone gravity/atmosphere/hazard fields) + the signature **zero-G hull-breach decompression** beat. [specs/11-contextual-physics-zones.md](specs/11-contextual-physics-zones.md) |

---

*Generated from a 7-specialist design pass + producer integration + an 8-front player-sentiment
reality-check + a quality-proof/systems planning pass + a 7-priority audit & gap-fill. Current as
of 2026-06-27.*
