# SIGNAL LOST — Audio Engine + ElevenLabs Content-Pack Spec (Pre-baked)

## SIGNAL LOST — Audio Engine + ElevenLabs Content-Pack Spec

All audio is pre-baked from ElevenLabs at **build time** into a hashed CDN pack. The runtime is a custom Web Audio engine that never touches ElevenLabs on a scare's critical path. One optional runtime path exists (Flash v2.5 ship-AI barks) and always has a pre-baked fallback.

> **Verified ElevenLabs 2026 API surface** (used throughout, see Sources at end):
> - **Sound Effects:** `POST https://api.elevenlabs.io/v1/sound-generation` — `{ text, model_id:"eleven_text_to_sound_v2", duration_seconds(0.5–30|null), prompt_influence(0–1, def 0.3), loop(bool, v2 only), output_format }`.
> - **Music (compose):** `POST https://api.elevenlabs.io/v1/music` — `{ prompt|composition_plan, music_length_ms(3000–600000), model_id:"music_v2", seed, force_instrumental }`.
> - **Composition plan (no credit cost, rate-limited):** `POST https://api.elevenlabs.io/v1/music/plan` — returns a `CompositionPlan` of `chunks[]` (`GenerationChunk`: `text, duration_ms(3000–120000), positive_styles, negative_styles, context_adherence, conditioning_ref, condition_strength` / `AudioRefChunk`: `song_id, range{start_ms,end_ms}`).
> - **Stem separation:** `POST https://api.elevenlabs.io/v1/music/stem-separation` (high latency; build-time only).
> - **TTS:** `POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}` — `model_id:"eleven_flash_v2_5"` (~75 ms, 32 langs), `voice_settings{stability,similarity_boost,style,use_speaker_boost,speed}`, `seed(0–4294967295)`, `output_format`.
> - **Licensing:** all paid plans → royalty-free commercial, no attribution; Music v2 trained on licensed/cleared data; **Scale ($99/mo)** unifies voice+music+SFX under one API key. Use Scale+ for the project.

---

### 1. Monorepo placement

```
signal-lost/
├─ packages/
│  ├─ audio-core/                 # runtime Web Audio engine (browser, no ElevenLabs)
│  │  ├─ src/
│  │  │  ├─ AudioEngine.ts        # AudioContext graph, buses, lifecycle
│  │  │  ├─ Scheduler.ts          # lookahead clock (25ms), bar-accurate stem sync
│  │  │  ├─ MusicSystem.ts        # vertical layering + horizontal re-sequencing
│  │  │  ├─ SfxSystem.ts          # one-shots, variant pools, HRTF panners
│  │  │  ├─ VoiceSystem.ts        # ship-AI/log playback + optional Flash path
│  │  │  ├─ ReverbZones.ts        # per-section ConvolverNode zones
│  │  │  ├─ Occlusion.ts          # BiquadFilter lowpass occlusion
│  │  │  ├─ TensionModel.ts       # 0..1 tension float + band mapping
│  │  │  ├─ AudioBus.ts           # bus helper (gain + compressor)
│  │  │  ├─ loader.ts             # fetch+decode pack, ring of AudioBuffers
│  │  │  ├─ rng.ts                # seeded mulberry32 for variant selection
│  │  │  └─ generated/
│  │  │     ├─ audio-ids.ts       # EMITTED typed AudioId union (do not edit)
│  │  │     └─ manifest.d.ts      # EMITTED manifest type
│  │  └─ package.json
│  ├─ audio-content/              # SOURCE of truth for the content pack
│  │  ├─ manifest/
│  │  │  ├─ ambient.ts            # AudioClipSource[]
│  │  │  ├─ music.ts              # ZoneMusicSource[] (one plan per zone)
│  │  │  ├─ sfx.ts                # AudioClipSource[]
│  │  │  ├─ creature.ts           # AudioClipSource[]
│  │  │  ├─ voice.ts              # VoiceClipSource[]
│  │  │  └─ index.ts              # export const MANIFEST = [...all]
│  │  ├─ schema.ts                # Zod schemas + TS types (below)
│  │  └─ package.json
│  └─ protocol/                   # shared net types incl. AudioEvent ids
│     └─ src/audio-events.ts
├─ tools/
│  └─ gen-audio/
│     ├─ gen-audio.ts             # build-time pipeline (entry)
│     ├─ providers/
│     │  ├─ elevenlabs.ts         # thin typed client (sfx/music/plan/tts/stems)
│     │  └─ rateLimiter.ts        # token-bucket, respects 429 Retry-After
│     ├─ cache.ts                 # prompt-hash cache (.audio-cache/)
│     ├─ hash.ts                  # sha256 helpers
│     ├─ emit.ts                  # writes manifest.json + audio-ids.ts
│     └─ encode.ts                # ffmpeg-wasm/native → opus + mp3 + loop trim
├─ .audio-cache/                  # gitignored; keyed by promptHash
└─ apps/
   └─ game/public/audio/          # gen output: <hash>.opus|.mp3 + manifest.json (→ R2)
```

`pnpm gen:audio` runs `tsx tools/gen-audio/gen-audio.ts`. Turborepo task `gen-audio` is an input to the `game#build` task so the manifest + `audio-ids.ts` exist before typecheck.

```jsonc
// turbo.json (excerpt)
{ "tasks": {
  "gen-audio": {
    "inputs": ["packages/audio-content/**", "tools/gen-audio/**"],
    "outputs": ["apps/game/public/audio/**", "packages/audio-core/src/generated/**"],
    "cache": true, "env": ["ELEVENLABS_API_KEY"] },
  "game#build": { "dependsOn": ["^build", "gen-audio"] }
}}
```

---

### 2. Manifest schema (`packages/audio-content/schema.ts`)

```ts
import { z } from "zod";

export const Category = z.enum([
  "ambient", "music_stem", "music_stinger",
  "sfx", "creature", "voice_ai", "voice_log",
]);
export type Category = z.infer<typeof Category>;

export const OutputFormat = z.enum(["opus_48000_128", "mp3_44100_128"]); // pack ships opus, mp3 fallback

/** Common fields every clip shares. */
const Base = z.object({
  id: z.string().regex(/^[a-z0-9]+(\.[a-z0-9_]+)+$/), // dot-namespaced AudioId, e.g. "sfx.footstep.metal"
  category: Category,
  loop: z.boolean().default(false),
  gain: z.number().min(0).max(4).default(1),          // linear, applied at decode→manifest
  /** Number of variant renders to bake. >1 ⇒ variant set; runtime picks by seed. */
  variants: z.number().int().min(1).max(8).default(1),
  /** Optional explicit loop window (ms) for ambient/music; gen trims to zero-crossing. */
  loopWindowMs: z.tuple([z.number(), z.number()]).optional(),
});

/** SFX / ambient / creature → Sound Effects API. */
export const SfxSource = Base.extend({
  category: z.enum(["sfx", "ambient", "creature"]),
  provider: z.literal("sfx"),
  prompt: z.string().min(3),
  durationSeconds: z.number().min(0.5).max(30).nullable().default(null),
  promptInfluence: z.number().min(0).max(1).default(0.3),
});

/** Voice (ship-AI lines, distress logs) → TTS Flash v2.5. */
export const VoiceSource = Base.extend({
  category: z.enum(["voice_ai", "voice_log"]),
  provider: z.literal("tts"),
  text: z.string().min(1),
  voiceId: z.string(),                 // ElevenLabs voice id (Voice-Designed, see §3.6)
  voiceSettings: z.object({
    stability: z.number().min(0).max(1).default(0.5),
    similarityBoost: z.number().min(0).max(1).default(0.75),
    style: z.number().min(0).default(0),
    useSpeakerBoost: z.boolean().default(true),
    speed: z.number().min(0.7).max(1.2).default(1),
  }).default({}),
  /** Post-FX chain applied at build time (bitcrush/ringmod for distorted logs). */
  bake: z.enum(["clean", "comms", "distorted_log"]).default("clean"),
});

/** Music → ONE composition plan per zone; stems separated at build time. */
export const ZoneMusicSource = z.object({
  id: z.string(),                      // e.g. "music.zone.docking_bay"
  category: z.literal("music_stem"),
  zone: z.string(),
  bpm: z.number(),                     // authored tempo (drives Scheduler bar math)
  bars: z.number().int(),             // loop length in bars
  key: z.string(),                     // e.g. "Dm" — locks all stems same key
  /** Single plan → render full piece → stem-separate → assign stems to layers. */
  plan: z.object({
    musicLengthMs: z.number().min(3000).max(600000),
    seed: z.number().int(),
    chunks: z.array(z.object({
      text: z.string(),
      durationMs: z.number().min(3000).max(120000),
      positiveStyles: z.array(z.string()),
      negativeStyles: z.array(z.string()).default([]),
      contextAdherence: z.enum(["low", "medium", "high"]).default("high"),
    })),
  }),
  /** Which separated stems map to which tension layer. */
  layers: z.array(z.object({
    layer: z.enum(["pad", "pulse", "perc", "lead", "dissonance"]),
    stem: z.enum(["other", "bass", "drums", "vocals"]), // stem-separation outputs
    tensionBand: z.tuple([z.number(), z.number()]),     // [enterAt, fullAt] in 0..1
  })),
  stingers: z.array(z.object({
    id: z.string(), prompt: z.string(), durationMs: z.number(),
  })).default([]),
});

export type AudioClipSource = z.infer<typeof SfxSource> | z.infer<typeof VoiceSource>;
export type ManifestSource = AudioClipSource | z.infer<typeof ZoneMusicSource>;
```

**Emitted `manifest.json`** (id → entry), consumed at runtime:

```jsonc
{
  "version": "2026.06.27-a1b2c3",
  "format": "opus_48000_128",
  "entries": {
    "sfx.footstep.metal": {
      "category": "sfx", "loop": false, "gain": 0.9,
      "variants": [
        { "url": "/audio/9f3a..a1.opus", "mp3": "/audio/9f3a..a1.mp3", "hash": "9f3a..a1", "durationMs": 410 },
        { "url": "/audio/7c2b..e0.opus", "mp3": "/audio/7c2b..e0.mp3", "hash": "7c2b..e0", "durationMs": 388 }
      ]
    },
    "music.zone.docking_bay": {
      "category": "music_stem", "loop": true, "bpm": 72, "bars": 16, "key": "Dm",
      "stems": {
        "pad":        { "url": "/audio/..pad.opus",  "tensionBand": [0.0, 0.3] },
        "pulse":      { "url": "/audio/..pulse.opus", "tensionBand": [0.25, 0.55] },
        "perc":       { "url": "/audio/..perc.opus",  "tensionBand": [0.5, 0.8] },
        "lead":       { "url": "/audio/..lead.opus",  "tensionBand": [0.6, 0.9] },
        "dissonance": { "url": "/audio/..dis.opus",   "tensionBand": [0.8, 1.0] }
      },
      "loopWindowMs": [0, 53333]
    }
  }
}
```

**Emitted `audio-ids.ts`** (typed union for compile-time safety):

```ts
// AUTO-GENERATED. Do not edit.
export type AudioId =
  | "sfx.footstep.metal" | "sfx.footstep.grate" | "sfx.flashlight.click"
  | "music.zone.docking_bay" | "voice.ai.dock_complete" | /* ...all ids... */ ;
export const AUDIO_IDS = [/* ...all... */] as const;
export type MusicZoneId = Extract<AudioId, `music.zone.${string}`>;
```

---

### 3. Build pipeline `tools/gen-audio/gen-audio.ts`

#### 3.1 Algorithm

```
1. Load MANIFEST (all sources) → validate each with Zod. Fail build on error.
2. Assert id uniqueness; assert AudioId chars; assert one ZoneMusicSource per zone.
3. For each source, expand into render JOBS:
     - SfxSource/VoiceSource → `variants` jobs, each with variantIndex.
     - ZoneMusicSource → 1 "plan+compose" job + N "stem-separate" sub-jobs + stinger jobs.
4. For each job compute promptHash = sha256(canonicalize({provider, model, allParams, variantIndex})).
5. CACHE: if .audio-cache/<promptHash>.wav exists → reuse (no API call). Else call API
     through rateLimiter (token bucket; on 429 honor Retry-After; max 4 concurrent).
6. ENCODE each rendered wav → opus_48000_128 + mp3_44100_128. Loop clips: trim to nearest
     zero-crossing inside loopWindowMs and apply 5ms equal-power crossfade head↔tail.
     Voice "comms"/"distorted_log": apply bitcrush+bandpass+ringmod post-FX (ffmpeg).
7. outputHash = sha256(encoded opus bytes). Write apps/game/public/audio/<outputHash>.opus|.mp3.
8. Build manifest entry (id→{variants|stems, url, hash, category, loop, gain, ...}).
9. emit.ts writes manifest.json + audio-ids.ts (sorted, deterministic).
10. Print summary: N jobs, M cache hits, K API calls, total credits estimate.
```

Determinism: every API call passes a fixed `seed` (derived from `promptHash`) so regenerating produces identical audio; the prompt-hash cache means unchanged clips never re-bill.

#### 3.2 Cache (`cache.ts`)

```ts
export function promptHash(job: RenderJob): string {
  return sha256(stableStringify({
    provider: job.provider, model: job.model,
    params: job.params, variantIndex: job.variantIndex,
    // NOT included: output filename, run timestamp
  }));
}
// hit ⇒ read .audio-cache/<hash>.wav ; miss ⇒ call API, then write wav to cache.
```

#### 3.3 SFX / ambient / creature call

```ts
async function renderSfx(j: SfxJob): Promise<Buffer> {
  const res = await fetch("https://api.elevenlabs.io/v1/sound-generation", {
    method: "POST",
    headers: { "xi-api-key": KEY, "content-type": "application/json", "accept": "audio/wav" },
    body: JSON.stringify({
      text: j.prompt,
      model_id: "eleven_text_to_sound_v2",
      duration_seconds: j.durationSeconds,      // null ⇒ auto
      prompt_influence: j.promptInfluence,      // 0.3 default; lower for ambient variance
      loop: j.loop,                             // seamless loop, v2 only
      output_format: "pcm_44100",               // decode to wav locally
    }),
  });
  return wavFromPcm(await res.arrayBuffer());
}
```

#### 3.4 Music — ONE plan per zone → compose → stem-separate

```ts
async function renderZoneMusic(z: ZoneMusicJob) {
  // (a) Optionally refine the authored plan via /v1/music/plan (free, rate-limited).
  // (b) Compose the full tempo/key-locked piece:
  const song = await fetch("https://api.elevenlabs.io/v1/music", {
    method: "POST", headers: H,
    body: JSON.stringify({
      composition_plan: { chunks: z.plan.chunks.map(toGenerationChunk) },
      music_length_ms: z.plan.musicLengthMs,
      model_id: "music_v2",
      seed: z.plan.seed,
      force_instrumental: true,
      output_format: "pcm_44100",
    }),
  });
  // (c) Separate into stems so layers are guaranteed same tempo+key (single source piece):
  const stems = await fetch("https://api.elevenlabs.io/v1/music/stem-separation", {
    method: "POST", headers: H, body: songWav, // returns {drums, bass, vocals, other}
  });
  // (d) Map stems→layers per z.layers; loop-trim each to bars@bpm; encode.
}
```

Because all stems derive from a **single composed piece**, vertical layers are inherently bar/tempo/key-locked — the engine only needs to start them in phase.

#### 3.5 Voice — Flash v2.5

```ts
await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${j.voiceId}`, {
  method: "POST", headers: H,
  body: JSON.stringify({
    text: j.text,
    model_id: "eleven_flash_v2_5",
    voice_settings: { stability: j.s.stability, similarity_boost: j.s.similarityBoost,
                      style: j.s.style, use_speaker_boost: j.s.useSpeakerBoost, speed: j.s.speed },
    seed: seedFrom(j.promptHash),
    output_format: "pcm_44100",
  }),
});
```

#### 3.6 Voices (one-time, checked into config, not regenerated per build)
- `voice.ship_ai` — Voice Design: *"calm androgynous synthetic ship intelligence, neutral mid-Atlantic, slight digital sibilance, unhurried."* Persist the returned `voice_id` in `voice.ts`.
- `voice.distress_crew` — *"exhausted male astronaut, late 40s, dry throat, suppressed panic."* Used for distress logs with `bake:"distorted_log"`.

---

### 4. AUDIO ASSET CATEGORY breakdown (slice + campaign) with example prompts

Legend: **[L]** loop · **[1]** one-shot · **[V×n]** variant set of n.

#### 4.1 Ambient beds (Sound Effects API, `loop:true`, `prompt_influence:0.2`, 20–30 s)
| id | type | prompt |
|---|---|---|
| `ambient.docking_bay` | [L] | "Vast cold metal docking bay, distant deep hull resonance, faint air handling hum, occasional far-off structural creak, no music, seamless." |
| `ambient.corridor` | [L] | "Tight derelict spaceship corridor, low electrical hum, intermittent failing fluorescent buzz, faint dripping, oppressive dead air, seamless loop." |
| `ambient.safe_room` | [L] | "Small powered safe room aboard a ship, warm steady console hum, soft fan, faint reassuring beeps, calmer tone, seamless." |
| `ambient.vents` | [L] | "Inside cramped ventilation ducts, hollow metallic airflow, distant rattles, claustrophobic, seamless." |
| `ambient.command_centre` | [L] | "Derelict command centre, large room reverb, dying terminals ticking, deep sub-bass dread drone, seamless." (campaign) |

#### 4.2 Music stems — ONE composition plan per zone (Music v2 → stem-separation)
Slice zone `music.zone.docking_bay` (Dm, 72 bpm, 16 bars). Plan chunk prompt:
> "Slow dread-horror sci-fi underscore in D minor at 72 BPM. Sparse evolving synth pad, low pulsing bass throb on the root, sparse metallic percussion hits, distant detuned lead motif, layer of dissonant cluster tension. Cinematic, claustrophobic, no melody resolution. Instrumental." `negative_styles: ["upbeat","major key","drums-forward","pop"]`.

Separated → layers: `pad←other`, `pulse←bass`, `perc←drums`, `lead/dissonance←other` (high-passed copies). Each zone (`corridor`, `command_centre`, `escape`) is its own plan/key so re-sequencing between zones swaps the whole bed at a bar boundary.

**Stingers** (Sound Effects API one-shots, key-matched by prompt):
| id | type | prompt |
|---|---|---|
| `music.stinger.scare` | [1] | "Sudden orchestral horror stinger, sharp dissonant brass cluster and metallic screech, in D minor, 2 seconds, hard transient." |
| `music.stinger.reveal` | [1] | "Low rising dread swell resolving into a single ominous piano-string hit, D minor, 3 seconds." |
| `music.stinger.relief` | [1] | "Soft warm resolving pad chord, exhale of tension, D minor to D, 3 seconds." |

#### 4.3 SFX (Sound Effects API, mostly [1], `prompt_influence:0.4–0.6`)
| id | type | prompt |
|---|---|---|
| `sfx.footstep.metal` | [V×4] | "Single heavy boot footstep on solid metal floor, dry, no reverb, close mic." |
| `sfx.footstep.grate` | [V×4] | "Single boot footstep on metal grating, slight rattle, close." |
| `sfx.flashlight.click` | [V×2] | "Small tactical flashlight toggle click, mechanical, close." |
| `sfx.gun.fire` | [V×3] | "Punchy futuristic rifle shot, tight transient, metallic tail, close." |
| `sfx.gun.reload` | [1] | "Sci-fi rifle magazine eject, insert, and bolt charge, mechanical sequence." |
| `sfx.gun.dryfire` | [1] | "Empty weapon click, dry, mechanical." |
| `sfx.melee.impact` | [V×3] | "Heavy melee impact into wet alien flesh, meaty thud." |
| `sfx.metal.groan` | [V×3] | "Long low stressed-metal hull groan, deep creak, eerie, 4 seconds." |
| `sfx.vent.rattle` | [V×3] | "Sudden sharp metallic vent rattle and bang, startling, close." |
| `sfx.gore.dismember` | [V×3] | "Visceral dismemberment, tearing flesh and snapping bone, wet splatter." |
| `sfx.battery.insert` | [1] | "Battery cartridge slotting into device, click and electrical whine-up." |
| `sfx.door.open` | [1] | "Heavy pneumatic blast door grinding open, hiss release." |
| `sfx.ui.confirm` | [1] | "Soft sci-fi UI confirm blip, clean, two-tone." |
| `sfx.ui.deny` | [1] | "Sci-fi UI error buzz, low, short." |
| `sfx.ui.objective` | [1] | "Objective-complete chime, hopeful but restrained, sci-fi." |

#### 4.4 Creature vocals (Sound Effects API; Stalker + Swarmer)
| id | type | prompt |
|---|---|---|
| `creature.stalker.mimic` | [V×4] | "Distorted creature imitating a human voice calling for help, slightly wrong, uncanny, wet undertone." |
| `creature.stalker.screech` | [V×3] | "Piercing alien predator screech, layered inhuman shriek, aggressive, terrifying." |
| `creature.stalker.pounce` | [1] | "Alien creature lunging attack roar, sudden close burst, guttural." |
| `creature.stalker.idle` | [V×3] | "Low wet guttural creature breathing and clicking, lurking, distant." |
| `creature.swarmer.skitter` | [V×4] | "Fast skittering of many small chitinous legs on metal, swarming, close." |
| `creature.swarmer.death` | [V×3] | "Small insectoid alien shriek and wet pop as it dies." |

#### 4.5 Ship-AI / computer voice + distress logs (TTS Flash v2.5)
| id | type | voice / bake | text |
|---|---|---|---|
| `voice.ai.dock_complete` | [1] | ship_ai / comms | "Docking seal confirmed. Atmosphere on the other side is... breathable. Proceed when ready." |
| `voice.ai.power_warning` | [1] | ship_ai / comms | "Warning. Auxiliary power is failing on this deck. I cannot guarantee the lights." |
| `voice.ai.objective_node` | [1] | ship_ai / comms | "I've found a route to the command centre. Reach the relay node and I can open the bulkhead." |
| `voice.ai.spike_telegraph` | [1] | ship_ai / distorted | "Movement. A lot of it. It knows you're here. RUN—" (cuts to static) |
| `voice.log.distress_01` | [1] | distress_crew / distorted_log | "If anyone's receiving this — don't open the bay doors. It learns your voice. It calls you by name—" |
| `voice.ai.bark.*` | [V×n] | ship_ai / comms | dynamic reactions (see §8 optional path) |

---

### 5. Runtime Web Audio engine architecture

#### 5.1 Graph (text diagram)

```
                         ┌──────────── per-stem GainNodes (5) ──────────┐
   [music stems] ──► sourceBufferNodes ──► stemGain[i] ──┐              │
                                                          ▼              │
   [music stingers] ─────────────────────► oneShotGain ─►  musicBus(Gain)──► musicComp(Compressor) ─┐
                                                                                                     │
   [positional SFX] ─► bufferSource ─► PannerNode(HRTF) ─► occlusionLP(Biquad) ─► reverbSend ─┐      │
                                                              │                                ▼      ▼
                                                              └──────────────► sfxBus(Gain) ─► sfxComp ─► masterBus(Gain)
   [UI / non-positional SFX] ─► bufferSource ───────────────────────────────► sfxBus           ▲       │
                                                                                                │       ▼
   [voice: ai lines/logs] ─► bufferSource ─► voiceDuckSend ─────► voiceBus(Gain) ─► voiceComp ──┘   masterLimiter
                                                                                                        │
   ReverbZones: reverbSend ─► ConvolverNode(zoneIR, crossfaded) ─► reverbReturn(Gain) ─► masterBus     ▼
                                                                                                  AudioDestination
```

- **Buses:** `masterBus → masterLimiter(DynamicsCompressor, ratio 20, fast) → destination`. Children: `musicBus`, `sfxBus`, `voiceBus`, each with its own `DynamicsCompressor` for glue. User volume sliders set bus gains (Zustand → engine, never per-frame).
- **Voice ducking:** when a `voiceBus` clip plays, `musicBus.gain` and `sfxBus.gain` ramp −6 dB over 120 ms and back over 400 ms (sidechain via scheduled `setTargetAtTime`).
- **Positional SFX:** `PannerNode` `panningModel:"HRTF"`, `distanceModel:"inverse"`, `refDistance:2`, `maxDistance:60`, `rolloffFactor:1.4`. Listener pose updated once per frame from the local player camera (`setPosition`/`setOrientation` or `positionX.value` ramps).
- **Occlusion:** per active positional voice, a `BiquadFilter` `type:"lowpass"`; host/raycast occlusion flag (or local wall test) sets cutoff: clear = 20 kHz, occluded = 700 Hz, ramped 80 ms.
- **Reverb zones:** one `ConvolverNode` per ship section IR (`docking_bay`, `corridor`, `safe_room`, `command_centre`). Active zone determined by player's section id; crossfade `reverbReturn` between two convolvers over 600 ms when crossing a section boundary. IRs are themselves pre-baked SFX renders ("large metal hall impulse, sharp transient, long metallic tail").

#### 5.2 Loader
- On load: `fetch(manifest.json)`; feature-detect Opus support, else use `mp3` urls. Decode core clips (slice set) eagerly into `Map<AudioId, AudioBuffer[]>`; lazy-decode campaign-only assets on zone enter. All buffers held; no streaming for SFX (clips are short).

#### 5.3 Lookahead scheduler (`Scheduler.ts`)
```ts
const LOOKAHEAD_MS = 25;     // setInterval tick
const SCHEDULE_AHEAD = 0.1;  // seconds of audio scheduled ahead
// Web Audio clock is the master timeline. Music is scheduled on bar boundaries.
tick() {
  while (nextBarTime < ctx.currentTime + SCHEDULE_AHEAD) {
    scheduleBar(nextBarIndex, nextBarTime);   // (re)start any stem sources due this bar
    nextBarTime += secondsPerBar;             // secondsPerBar = (60/bpm)*beatsPerBar
    nextBarIndex++;
  }
}
```
All stem `AudioBufferSourceNode`s for a zone are started with the **same `start(t0)`** anchored to a bar boundary, guaranteeing sample-accurate phase. Layer entry/exit and zone swaps are quantized to the next bar inside `scheduleBar`.

---

### 6. Tension model (`TensionModel.ts`)

A single normalized `tension ∈ [0,1]`, recomputed ~10 Hz on each client from local + replicated state, smoothed.

**Inputs (each normalized 0..1):**
- `mProx` = monster proximity: `clamp(1 - nearestEnemyDist / 30, 0, 1)` (host-replicated enemy positions).
- `hpLow` = `1 - playerHealth01`.
- `resLow` = `1 - resolve01`.
- `objNear` = objective pressure: `clamp(1 - objectiveDistance / 50, 0, 1)`.
- `recentScare` = `clamp(1 - timeSinceLastScare / 12, 0, 1)` (decays over 12 s).

**Formula (weighted soft-max blend, then smoothed):**
```ts
const raw =
    0.45 * mProx +
    0.20 * recentScare +
    0.15 * hpLow +
    0.12 * resLow +
    0.08 * objNear;
// dread bias: low-end gets pulled up so silence is never fully "safe"
const shaped = 0.06 + 0.94 * Math.pow(raw, 0.85);
// asymmetric smoothing: tension rises fast, falls slow
tension += (shaped - tension) * (shaped > tension ? 0.35 : 0.05);
```

**Bands → music section + per-stem gains:**
| band | tension | section | active stems (gain via `tensionBand` crossfade) |
|---|---|---|---|
| Calm | 0.00–0.30 | exploration | pad |
| Unease | 0.30–0.55 | exploration+ | pad, pulse |
| Tension | 0.55–0.80 | tension | pad, pulse, perc |
| Combat | 0.80–0.95 | combat | pulse, perc, lead |
| Terror | 0.95–1.00 | combat+ | all + dissonance |

Each stem gain = `smoothstep(band[0], band[1], tension)` (vertical layering). Section changes (horizontal re-sequencing) are applied at the next bar boundary by the scheduler; section swaps that imply a key/zone change crossfade the whole bed over 1 bar.

---

### 7. Director → audio protocol (`packages/protocol/src/audio-events.ts`)

Host is authoritative. Host emits **reliable** ordered `AudioEvent`s over the DataChannel; each client plays the pre-baked clip locally. A **shared seed** (room seed XOR tick) picks the variant so every client hears the same render without syncing audio bytes.

```ts
export interface AudioEvent {
  e: AudioEventId;            // taxonomy below
  audioId?: AudioId;          // explicit clip (else derived from e)
  tick: number;               // host sim tick — used as variant seed + dedupe
  pos?: [number, number, number]; // world pos for positional SFX
  entityId?: number;          // emitter (footstep source, creature)
  params?: Record<string, number>; // e.g. { tension: 0.82 } for stinger gating
}

export type AudioEventId =
  // World / combat (synced, positional)
  | "world.metal_groan" | "world.vent_rattle" | "world.door_open"
  | "combat.gun_fire" | "combat.reload" | "combat.melee" | "combat.dismember"
  // Creature (synced, positional)
  | "creature.stalker_screech" | "creature.stalker_mimic" | "creature.stalker_pounce"
  | "creature.swarmer_skitter" | "creature.swarmer_death"
  // Director cues (synced, mostly non-positional)
  | "director.stinger_scare" | "director.stinger_reveal" | "director.stinger_relief"
  | "director.spike_telegraph" | "director.zone_enter" | "director.objective_complete"
  // Voice (synced)
  | "voice.ai_line" | "voice.distress_log";

// Variant selection (identical on all clients):
function pickVariant(audioId: AudioId, tick: number, roomSeed: number, n: number) {
  return mulberry32((roomSeed ^ (tick * 2654435761)) >>> 0)() * n | 0;
}
```

**Local / unsynced audio (never sent over the wire):** own `heartbeat` (driven by local HP/tension), low-resolve `audio distortion` (per-player resolve filter on master), all `UI` SFX, footsteps of the *local* player (predicted locally for responsiveness; remote players' footsteps come via `combat`/`world`-style positional events tied to their `entityId`). The tension model itself runs locally on each client.

**Dedupe/ordering:** events are reliable+ordered; client keeps `lastTickFor[entityId]` to drop duplicates after a brief disconnect. Late joiners get a `director.zone_enter` resync but no replay of past one-shots.

---

### 8. Offline fallback + the ONE optional runtime path

**Offline guarantee:** the game ships and runs entirely from the hashed pack on R2. The runtime imports **zero** ElevenLabs SDK. If the network drops mid-session, all gameplay audio (ambient, music, SFX, creature, baked voice) continues from decoded buffers. CI gate: a test boots the engine with `fetch` stubbed to only serve `/audio/*` and asserts every `AudioId` resolves to a decoded buffer.

**Optional runtime path — Flash v2.5 ship-AI barks:** for *flavor only* (never a scare's critical path), the ship-AI may speak short reactive lines (e.g. naming a downed player). Flow:
```ts
async function aiBark(line: BarkSpec): Promise<AudioBuffer> {
  // 1. Pre-baked fallback exists for every bark template id.
  const fallback = pack.get(`voice.ai.bark.${line.templateId}`); // baked generic version
  if (!ELEVEN_RUNTIME_ENABLED || navigator.onLine === false) return fallback;
  try {
    const buf = await Promise.race([
      ttsFlash(line, /* eleven_flash_v2_5, voice.ship_ai */),  // ~75ms model, but network-bound
      timeout(900),                                            // hard budget
    ]);
    return await ctx.decodeAudioData(buf);
  } catch { return fallback; }              // any error/timeout ⇒ baked clip
}
```
Rules: runs only off the critical path (cosmetic), behind a `ELEVEN_RUNTIME_ENABLED` flag (default off in v1), host-only call relayed to clients as a normal `voice.ai_line` event with the *fallback* id if generation fails. The default v1 build uses **only** pre-baked barks.

---

### 9. Acceptance for the slice
- `pnpm gen:audio` produces `manifest.json` + `audio-ids.ts`; re-running with no source change makes **0** API calls (full cache hit) and identical hashes.
- Two players in the corridor hear bit-identical variant selections for every synced event (verify by logging `pickVariant`).
- Stem layers stay phase-locked across a 5-minute session (no drift; bar scheduler).
- WebGL2 fallback path verified: audio engine is renderer-independent, runs identically.
- Network kill at any point leaves all baked audio working.

---

### Sources
- [Create sound effect — ElevenLabs](https://elevenlabs.io/docs/api-reference/text-to-sound-effects/convert)
- [Sound effects capability — ElevenLabs](https://elevenlabs.io/docs/overview/capabilities/sound-effects)
- [Compose music — ElevenLabs](https://elevenlabs.io/docs/api-reference/music/compose)
- [Create composition plan — ElevenLabs](https://elevenlabs.io/docs/api-reference/music/create-composition-plan)
- [Stem separation — ElevenLabs](https://elevenlabs.io/docs/api-reference/music/separate-stems)
- [Eleven Music capability — ElevenLabs](https://elevenlabs.io/docs/overview/capabilities/music)
- [Create speech (TTS) — ElevenLabs](https://elevenlabs.io/docs/api-reference/text-to-speech/convert)
- [Models (Flash v2.5) — ElevenLabs](https://elevenlabs.io/docs/overview/models)
- [Meet Flash — ElevenLabs](https://elevenlabs.io/blog/meet-flash)
- [ElevenLabs API pricing / Scale tier](https://elevenlabs.io/pricing/api)
- [ElevenLabs Pricing 2026: commercial rights — BIGVU](https://bigvu.tv/blog/elevenlabs-pricing-2026-plans-credits-commercial-rights-api-costs/)
- [Music v2 commercial licensing — MindStudio](https://www.mindstudio.ai/blog/elevenlabs-music-v2-commercial-content-licensed-ai-music)

## Tasks (toward M4 vertical slice)

- **[M0] Scaffold audio-content package with Zod manifest schema + typed sources** — _done when:_ packages/audio-content/schema.ts exports SfxSource/VoiceSource/ZoneMusicSource Zod schemas; manifest/index.ts exports MANIFEST; pnpm typecheck passes and every entry validates.
- **[M0] Implement ElevenLabs typed provider client (sfx/music/plan/tts/stem) + rate limiter** — _done when:_ providers/elevenlabs.ts calls the four verified endpoints with correct params; rateLimiter honors 429 Retry-After and caps concurrency at 4; unit test mocks fetch and asserts request bodies. _(deps: audio-content schema)_
- **[M1] Build gen-audio.ts pipeline with prompt-hash cache and encoder** — _done when:_ pnpm gen:audio renders all slice clips, encodes opus+mp3, loop-trims at zero-crossing; second run with no source change makes 0 API calls and emits identical hashes. _(deps: provider client; encode.ts ffmpeg)_
- **[M1] Emit manifest.json + typed AudioId union** — _done when:_ emit.ts writes deterministic manifest.json (id→{variants/stems,url,hash,...}) and audio-core/src/generated/audio-ids.ts; importing AudioId compiles and covers all manifest ids. _(deps: gen-audio pipeline)_
- **[M1] Author one composition plan per slice zone + stem-separation mapping** — _done when:_ docking_bay/corridor plans compose via music_v2, stem-separate, and map to 5 layers tempo/key-locked; stems load and start in phase. _(deps: gen-audio pipeline)_
- **[M2] Implement AudioEngine bus graph (master/music/sfx/voice + limiter, ducking)** — _done when:_ AudioContext graph matches §5.1; bus gain sliders work from Zustand without per-frame React; voice ducks music/sfx by -6dB. _(deps: manifest+loader)_
- **[M2] Implement lookahead Scheduler with bar-accurate stem sync** — _done when:_ 25ms tick schedules stems on bar boundaries; 5-min run shows no measurable phase drift between stems. _(deps: AudioEngine)_
- **[M3] Implement MusicSystem vertical layering + horizontal re-sequencing** — _done when:_ per-stem gains crossfade via smoothstep on tension; section/zone swaps occur at next bar boundary with 1-bar crossfade. _(deps: Scheduler; TensionModel)_
- **[M3] Implement SfxSystem with HRTF panners, reverb zones, occlusion lowpass** — _done when:_ positional SFX pan via HRTF PannerNode; convolver reverb crossfades on section change; occluded sources ramp lowpass to 700Hz. _(deps: AudioEngine)_
- **[M3] Implement TensionModel and wire inputs** — _done when:_ tension computed at 10Hz from monster proximity/HP/resolve/objective/recent-scare per §6 formula; asymmetric smoothing verified (fast rise, slow fall). _(deps: replicated enemy/player state)_
- **[M4] Implement Director->audio event protocol with seeded variant selection** — _done when:_ host emits reliable ordered AudioEvents; two clients pick bit-identical variants via mulberry32(roomSeed^tick); local audio (heartbeat/UI/resolve distortion) stays unsynced. _(deps: AudioEngine; netcode DataChannel)_
- **[M4] Implement optional Flash v2.5 bark path with pre-baked fallback + offline CI gate** — _done when:_ ELEVEN_RUNTIME_ENABLED flag (default off); bark times out at 900ms to baked fallback; CI test boots engine with network stubbed to /audio/* only and resolves every AudioId. _(deps: VoiceSystem; manifest)_

