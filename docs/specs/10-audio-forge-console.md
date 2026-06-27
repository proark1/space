# Audio Forge — ElevenLabs Admin Console

**Verdict:** Build a thin operator UI ("Audio Forge") on top of the EXISTING source-of-truth — the `packages/audio-content` Zod manifest and the `tools/gen-audio` pipeline (T19) — NOT a parallel system. It is a local-only Vite/React app + a tiny Hono/Node sidecar server that holds `ELEVENLABS_API_KEY` and reuses the same provider client, prompt-hash cache, and emitter the build already uses. The console lists every prompt from the manifest, shows live status/size/date/cost, lets you generate one/batch/all-changed, previews audio inline, and writes results to `.audio-cache/` + `apps/game/public/audio/`. Confirmed against the 2026 API: generation responses are raw audio bytes and do NOT carry a per-call credit field — so cost is derived from the documented per-product billing rule plus a `GET /v1/user/subscription` before/after delta, and the `x-character-count` / `x-ratelimit-remaining` response headers are captured when present. A "generate all changed" mass action is gated behind a cost-estimate confirmation. Effort: ~1 small package; it is mostly UI over machinery that already exists.

## SIGNAL LOST — ElevenLabs Admin Console ("Audio Forge")

### 0. Guiding principle: ONE source of truth

The audio spec (`docs/specs/04-audio-elevenlabs.md`, backlog T19) already defines:
- `packages/audio-content/` — Zod source schemas (`SfxSource` / `VoiceSource` / `ZoneMusicSource`) + `MANIFEST`. **This is the only place prompts are authored.**
- `tools/gen-audio/` — provider client, token-bucket rate limiter, prompt-hash cache (`.audio-cache/`), encoder, and `emit.ts` (writes `apps/game/public/audio/manifest.json` + `audio-ids.ts`).

The console **does not** introduce a new prompt store or a second renderer. It is an operator front-end that calls the *same* render/cache/emit functions. Anything else risks two manifests drifting apart. The runtime game keeps consuming the emitted `manifest.json` unchanged.

So the console adds exactly two things:
1. `tools/gen-audio/state.ts` — a small **render-state ledger** (`audio-state.json`) that records per-job results: status, file path/url, `fileSizeBytes`, `createdAt`, `durationSec`, `contentHash`, `promptHash`, `creditsEstimate`, `approved`, `lastError`. The build pipeline already computes all of these — we just persist them.
2. `tools/audio-forge/` — the console package (Vite + React UI + Hono sidecar server).

---

### 1. Architecture & data flow

```
┌─────────────────────────────┐         ┌──────────────────────────────────────────┐
│  Browser: Audio Forge (UI)  │  HTTP   │  Sidecar server (Hono on Node, localhost) │
│  Vite + React, localhost    │ ───────►│  HOLDS ELEVENLABS_API_KEY (env, .env.local)│
│  table/grid, players, badges│ ◄─────  │  reuses tools/gen-audio code:              │
└─────────────────────────────┘  JSON   │   provider.ts · cache.ts · encode.ts ·    │
        ▲ audio <audio src>             │   emit.ts · state.ts                       │
        │ /audio/<hash>.opus            └───────────────┬───────────────────────────┘
        │ (served from public/audio)                    │ fetch (xi-api-key)
        │                                                ▼
        └──────────────── reads ──── apps/game/public/audio/   ElevenLabs API 2026
                                     .audio-cache/              v1/sound-generation
                                     audio-state.json           v1/music (+/plan,/stem)
                                     packages/audio-content/    v1/text-to-speech/{id}
                                                                v1/user/subscription
```

- **API key NEVER reaches the browser.** Only the sidecar reads `ELEVENLABS_API_KEY`. Browser talks only to `localhost:<port>` over plain JSON. The sidecar binds to `127.0.0.1` only.
- **Internal tool**: run via `pnpm audio:forge` (concurrently starts the Hono server + Vite dev UI). Not deployed; not in the shipped game bundle. Cloudflare/R2 only ever receives the emitted pack, not the console.
- The UI plays audio straight from the on-disk output dir (`apps/game/public/audio/<hash>.opus|.mp3`), which the Vite dev server serves statically — no audio bytes travel through JSON.

---

### 2. Data model — the render-state ledger

`tools/gen-audio/state.ts` owns `audio-state.json` (gitignored alongside `.audio-cache/`; the *prompts* live in versioned `audio-content`, the *render results* are a build artifact). One entry per **render job** (a source expands into N jobs: variant clips, stems, stingers).

```ts
type JobStatus =
  | "pending"      // in manifest, never rendered
  | "stale"        // prompt/params changed since last render (promptHash mismatch)
  | "generating"   // in flight
  | "generated"    // rendered, not yet human-approved
  | "approved"     // signed off for the build
  | "error";       // last attempt failed (see lastError)

interface AudioJobState {
  jobId: string;            // `${sourceId}#${variantIndex}` or `${zoneId}#stem:pad`
  sourceId: string;         // AudioId from manifest, e.g. "sfx.footstep.metal"
  category: "sfx" | "ambient" | "creature" | "music_stem" | "music_stinger" | "voice_ai" | "voice_log";
  provider: "sfx" | "music" | "tts";
  variantIndex: number;

  // ── the prompt + params (denormalized snapshot from audio-content, for the UI/diff) ──
  promptText: string;       // SFX `text` / music chunk text / TTS `text`
  params: {                 // exactly what gets hashed + sent
    model: string;          // eleven_text_to_sound_v2 | music_v2 | eleven_flash_v2_5
    voiceId?: string;       // TTS
    durationSeconds?: number | null;
    promptInfluence?: number;
    loop?: boolean;
    voiceSettings?: { stability:number; similarityBoost:number; style:number; useSpeakerBoost:boolean; speed:number };
    musicLengthMs?: number;
    seed?: number;
    outputFormat: string;   // e.g. "opus_48000_128"
  };

  status: JobStatus;
  approved: boolean;

  // ── render result (THE fields the user explicitly asked for) ──
  promptHash: string;       // sha256 of {provider,model,params,variantIndex} — cache key
  contentHash: string;      // sha256 of the encoded opus bytes (== output filename stem)
  outputPath?: string;      // "apps/game/public/audio/9f3a..a1.opus"
  outputUrl?: string;       // "/audio/9f3a..a1.opus" (UI <audio> src)
  mp3Url?: string;
  fileSizeBytes?: number;   // ← SHOWN in UI
  createdAt?: string;       // ISO8601 ← SHOWN in UI
  durationSec?: number;     // ← measured from decoded clip

  // ── cost / accounting ──
  creditsEstimate?: number; // derived (see §4) — NOT returned by the API per call
  charCount?: number;       // from x-character-count header when present (TTS)
  cacheHit?: boolean;       // last run served from .audio-cache (0 credits)

  // ── provenance / which build ──
  buildTag?: string;        // manifest version this asset shipped in, e.g. "2026.06.27-a1b2c3"
  lastError?: string;
  updatedAt: string;
}
```

**Why a separate ledger and not extra fields in the manifest?** The runtime `manifest.json` is a lean, hashed, deterministic build output consumed by the game — it must not carry operator metadata (cost, approval, timestamps, errors). The ledger is the operator view; the manifest is the runtime view. `emit.ts` produces the manifest from approved jobs, so the two never diverge: **the manifest is a projection of approved ledger rows.**

Storage summary:
- **Prompts (authored, versioned):** `packages/audio-content/manifest/*.ts` — git.
- **Render ledger (build artifact):** `tools/gen-audio/audio-state.json` — gitignored.
- **Cache (raw WAV by promptHash):** `.audio-cache/` — gitignored.
- **Output pack (opus+mp3+manifest.json):** `apps/game/public/audio/` → uploaded to R2.

---

### 3. Generate flow (per job)

```
UI "Generate" on row sfx.footstep.metal#2
 → POST /api/jobs/generate  { jobIds:["sfx.footstep.metal#2"] }
 → sidecar:
     1. Load MANIFEST + Zod-validate the source (fail row, not whole run).
     2. Build RenderJob; promptHash = sha256(canonical params).
     3. CACHE CHECK: .audio-cache/<promptHash>.wav exists?
          hit  → cacheHit:true, creditsEstimate:0, skip API.
          miss → call ElevenLabs via shared provider + rateLimiter
                 (token bucket, 4 concurrent, honors 429 Retry-After).
                 Capture x-character-count / x-ratelimit-remaining headers.
     4. ENCODE wav → opus_48000_128 + mp3_44100_128 (+ loop-trim at zero-crossing
        for loops; comms/distorted_log post-FX for voice). contentHash = sha256(opus).
     5. WRITE apps/game/public/audio/<contentHash>.opus|.mp3.
     6. Measure fileSizeBytes (fs.stat), durationSec (decode), createdAt (now).
     7. Update audio-state.json row → status:"generated".
 → SSE/stream progress back to UI; UI refetches the row → shows size/date/preview.
```

- **Caching by prompt-hash** means re-clicking generate on an unchanged prompt is a 0-credit no-op (status flips to `generated` from cache). Editing the prompt in `audio-content` changes `promptHash` → the ledger marks the row `stale` and the UI surfaces a **diff** (old prompt/params vs new).
- **Determinism:** seed derived from `promptHash` (per existing spec) → regenerating yields identical audio.
- `emit.ts` is invoked after generation (or via a "Rebuild manifest" button) to refresh `manifest.json` + `audio-ids.ts` from **approved** rows.

---

### 4. Cost / credits handling (important API reality)

Confirmed from the 2026 docs: **the generation endpoints return raw audio bytes with no per-call credit field in the body.** So the console derives cost three ways, in priority order:

1. **TTS:** `x-character-count` response header (when present) × model rate (Flash v2.5 = 0.5 credits/char) → exact-ish `creditsEstimate` + `charCount`.
2. **SFX / Music (billed per generation, not per char):** use a configurable `creditCostTable` (credits per SFX generation, per second of music) maintained in `audio-forge.config.json`, multiplied by `durationSeconds` where relevant. This is an **estimate**, labeled as such in the UI.
3. **Ground-truth reconciliation:** the sidecar calls `GET /v1/user/subscription` (returns `character_count`, `character_limit`, reset date) **before and after a batch** and shows the real delta as "credits actually consumed this batch" + remaining quota — the authoritative number, even when per-job estimates are fuzzy.

**Cost guardrails:** any action touching > `N` jobs (default 5) or estimated > `C` credits returns a **confirmation payload** (`{ jobCount, estCredits, remainingQuota }`); the UI shows a modal "This will generate 42 clips, ~18,400 credits (you have 91k left). Confirm?" before the sidecar actually fires. Cache-hit jobs are excluded from the estimate (they're free).

---

### 5. The UI

A React table, grouped by category, virtualized. Top bar: global stats + filters + bulk actions. Each row is a prompt with an inline `<audio>` player and status/size/date/cost badges.

```
┌─ AUDIO FORGE ───────────────────────────────────────── manifest 2026.06.27-a1b2c3 ─┐
│ Quota: 91,240 / 100,000 credits   Last batch: −18,402   ⟳ Refresh   ▶ Rebuild manifest│
│ Filter: [category ▾ all] [status ▾ all] [🔍 search prompt/id]   [■ Generate all CHANGED (12)]│
├─────────────────────────────────────────────────────────────────────────────────────┤
│ ▾ SFX (15 prompts · 31 jobs · 12 stale · 2.1 MB)                                       │
│ ┌────┬──────────────────────┬─────────────────┬────────┬───────┬─────────┬──────┬────┐│
│ │ ▶  │ id / variant         │ prompt (trunc.) │ status │ size  │ created │ cost │ ⋯  ││
│ ├────┼──────────────────────┼─────────────────┼────────┼───────┼─────────┼──────┼────┤│
│ │ ▶▮ │ sfx.footstep.metal #1│ "Single heavy…" │ 🟢 appr│ 38 KB │ 06-27   │  ~40 │ ↻⤓ ││
│ │ ▶▮ │ sfx.footstep.metal #2│ "Single heavy…" │ 🟢 gen │ 41 KB │ 06-27   │  ~40 │ ↻⤓ ││
│ │ ⏸  │ sfx.gun.fire        #1│ "Punchy futur…" │ 🟠 STALE│ 35 KB │ 06-19   │  est │ ⟁↻ ││  ← diff avail
│ │ —  │ sfx.door.open       #1│ "Heavy pneuma…" │ ⚪ pend │  —    │   —     │  ~80 │ ⚡  ││
│ │ ✖  │ sfx.vent.rattle     #1│ "Sudden sharp…" │ 🔴 err │  —    │   —     │   —  │ ⚡  ││  ← hover=error
│ └────┴──────────────────────┴─────────────────┴────────┴───────┴─────────┴──────┴────┘│
│ ▸ AMBIENT (5 · loop)      ▸ MUSIC stems (per-zone, expands to stems+stingers)          │
│ ▸ CREATURE (6)            ▸ VOICE ai/log (TTS, shows voiceId + bake)                    │
└───────────────────────────────────────────────────────────────────────────────────────┘
Status legend: ⚪ pending  🟠 stale(prompt changed)  ⏳ generating  🟢 generated  🟢appr approved  🔴 error
Row actions: ⚡ generate · ↻ regenerate(force, bypass cache) · ⤓ download · ⟁ view diff · ✓ approve · 🔊 player
```

UI specifics:
- **Per-row audio player**: native `<audio controls>` pointing at `outputUrl` (waveform optional later). Music rows expand to show each **stem** and **stinger** as its own sub-row/player.
- **Badges**: status pill, file size (human-readable), created date, cost (`~` prefix = estimate, no prefix = header-exact). Stale rows show an amber `⟁ diff` affordance opening an old-vs-new prompt/param diff.
- **Bulk actions**: "Generate all CHANGED" (only `pending`+`stale`, cache-aware, cost-confirmed); per-category "Generate group"; "Approve all generated".
- **Voice rows** additionally show `voiceId`, `model`, and `bake` (clean/comms/distorted_log) since those drive the render.
- **Filters**: by category, status, free-text over id + prompt; "which build" column (`buildTag`) filterable so you can see what shipped in `2026.06.27-a1b2c3`.
- **Commercial-license note** pinned in the footer: "All renders are royalty-free commercial under our ElevenLabs Scale plan; Music v2 requires the additional games/distribution license — confirm before ship." (per the licensing facts in the audio spec).

---

### 6. Sidecar API (Hono on Node, localhost only)

```
GET  /api/jobs                 → AudioJobState[]  (joins MANIFEST × audio-state.json; recomputes promptHash → stale flags live)
GET  /api/jobs/:jobId          → one row (+ diff payload if stale)
POST /api/jobs/generate        → { jobIds[] | category | onlyChanged:true, force?:bool }
                                  if estimate exceeds guardrail → 409 { needsConfirm, jobCount, estCredits, remainingQuota }
                                  with ?confirm=token → runs; streams progress (SSE)
POST /api/jobs/:jobId/approve  → flips approved/status
POST /api/manifest/rebuild     → runs emit.ts → manifest.json + audio-ids.ts from approved rows
GET  /api/quota                → GET /v1/user/subscription passthrough (server-side key)
GET  /audio/*                  → static (handled by Vite dev server, not the API)
```

The sidecar is the ONLY holder of the key, binds `127.0.0.1`, and never echoes the key or raw audio through JSON.

---

### 7. How it feeds the runtime pack (one source of truth, restated)

```
authored prompts            operator console            build output (shipped)
packages/audio-content  ──►  Audio Forge generates  ──►  emit.ts  ──►  manifest.json + audio-ids.ts
   (git, versioned)          + approves (ledger)          (approved      + <hash>.opus/.mp3
                                                           rows only)     → R2 / game runtime
```

`pnpm gen:audio` (the CI/build path, T19) and the console call the **same** render+cache+emit code. CI remains the gate: it regenerates from the manifest, and because the cache is content-addressed, an unchanged, already-approved pack makes **0 API calls** and produces identical hashes — exactly the existing M-acceptance. The console is a convenience layer for authoring/iterating; CI is the deterministic re-bake. They cannot diverge because there is only one manifest and one emitter.

---

### 8. Security checklist
- `ELEVENLABS_API_KEY` only in the sidecar's env (`.env.local`, gitignored); never bundled, never sent to browser.
- Sidecar binds `127.0.0.1`; no CORS to public origins; internal-only.
- Mass-generate behind cost-estimate confirmation + a hard per-batch credit ceiling (configurable) that aborts overruns.
- Commercial-license note surfaced in UI; Music-v2 games license flagged.
- Console excluded from the shipped game build and from any Cloudflare deploy.

## Tasks

- **Add render-state ledger to gen-audio (state.ts + audio-state.json)** — _done when:_ tools/gen-audio/state.ts reads/writes audio-state.json with one AudioJobState row per render job; the existing pipeline populates promptHash, contentHash, outputPath/url, fileSizeBytes, createdAt, durationSec, creditsEstimate, status; running pnpm gen:audio updates the ledger and a unit test asserts a generated row carries non-null size+date+hashes; ledger is gitignored.
- **Capture cost signals + subscription reconciliation in the provider client** — _done when:_ The shared ElevenLabs client records x-character-count and x-ratelimit-remaining headers when present; a creditCostTable in audio-forge.config.json yields per-job estimates for SFX/music; GET /v1/user/subscription before/after a batch produces an authoritative consumed-credits delta + remaining quota; cache-hit jobs report 0 credits.
- **Scaffold tools/audio-forge Hono sidecar server (key-holding, localhost)** — _done when:_ pnpm audio:forge starts a Hono server bound to 127.0.0.1 that reads ELEVENLABS_API_KEY from env only; implements GET /api/jobs, GET/POST /api/jobs/:id, POST /api/jobs/generate (with onlyChanged + force), POST /api/jobs/:id/approve, POST /api/manifest/rebuild, GET /api/quota; reuses gen-audio provider/cache/encode/emit; no key or audio bytes ever returned in JSON; a smoke test hits each route.
- **Implement generate flow with prompt-hash cache + stale/diff detection** — _done when:_ POST /api/jobs/generate validates the source (Zod), checks .audio-cache by promptHash (hit=0 credits), else renders via rate-limited provider, encodes opus+mp3, writes <contentHash> files, updates ledger to generated; editing a prompt in audio-content flips the row to stale and GET /api/jobs/:id returns an old-vs-new diff payload; force bypasses cache.
- **Cost guardrail + confirmation on batch/all-changed** — _done when:_ Any generate touching > configurable N jobs or > C estimated credits returns 409 {needsConfirm, jobCount, estCredits, remainingQuota} and only runs with a confirm token; a hard per-batch credit ceiling aborts overruns; cache-hit jobs are excluded from the estimate.
- **Build the Audio Forge React UI (grouped table, players, badges, filters, bulk)** — _done when:_ Vite/React app renders rows grouped by category with native audio players sourced from outputUrl; each row shows status pill, file size, created date, and cost badge (~ = estimate); filters by category/status/text and by buildTag; bulk 'Generate all CHANGED' and per-category generate with the confirmation modal; music rows expand to per-stem/stinger sub-rows; commercial-license note in footer.
- **Wire manifest rebuild from approved rows (one source of truth)** — _done when:_ POST /api/manifest/rebuild runs emit.ts using only approved ledger rows to write apps/game/public/audio/manifest.json + audio-core generated audio-ids.ts; a test asserts the emitted manifest contains exactly the approved jobs and that re-running pnpm gen:audio on the same approved pack makes 0 API calls and produces identical hashes.