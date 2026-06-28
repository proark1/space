# SIGNAL LOST — Cold Open / Launch Sequence Spec (Scene 0)

> **Decisions locked 2026-06-28.** This is the player's first scene and the co-op lobby: ground launch from a grim, militarized Earth → ride the capsule up → coast to the derelict → dock.
> Reads with: [LORE.md](../LORE.md) (the title is a trap; THE CHORUS), [ART-DIRECTION.md](../ART-DIRECTION.md), [LOW-POLY-PIVOT.md](../LOW-POLY-PIVOT.md) (PS1 register), [06-rendering-mood.md](06-rendering-mood.md) (post stack), [04-audio-elevenlabs.md](04-audio-elevenlabs.md) + [10-audio-forge-console.md](10-audio-forge-console.md) (VO/SFX), [02-netcode-protocol.md](02-netcode-protocol.md) (lobby).

================================================================

## 0. What this is & where it sits

Scene 0 — the **cold open** — and simultaneously the **multiplayer lobby**. The player journey:

```
title → LOBBY/COLD OPEN (this) ──launch──▶ TRANSIT (capsule ride) ──approach──▶ DOCK (/exterior) ──▶ ABOARD (corridor game, "/")
```

It is the one calm-ish, human moment before the horror, so it has to *earn* the dread that follows. It is also where we plant the mission framing that the whole game subverts: **"re-establish contact with the derelict, restore her comms."** Per LORE that order is the trap — restoring comms is THE CHORUS's win condition. The cold open delivers that order straight-faced.

### Locked decisions (this session)

| Decision | Choice | Consequence |
|---|---|---|
| **Capsule POV** | **Free-look cockpit** | Strapped-in first-person; free head-look at crew + window; diegetic clicks only (strap-in, LAUNCH). Vehicle motion is on rails. |
| **Launch staging** | **Full ground spectacle** | We render the rocket on the pad from *outside* — ignition + ascent through atmosphere as a cinematic — then cut into the cockpit. Biggest new-art item: a whole grim Earth launch-site scene. |
| **Tone** | **Grim from the start** | Overcast night, floodlights, klaxons, steam, rust, military Earth Control. Desperate last-ditch mission. Cold, desaturated — consistent with the derelict's used-future grime. |

================================================================

## 1. Beat sheet (authored sequence)

`CAM` = camera mode. `cinematic` = on-rails, no player control. `free-look` = pointer-look from a fixed seat. Durations are first-run; whole sequence is **skippable after first completion** (per-player flag in localStorage, host can force-skip for the room).

| # | Beat | CAM | You see | You hear | You do | ~t |
|---|---|---|---|---|---|---|
| 1 | **Board & strap in** | free-look (cockpit) | Dark cabin, amber panels; crew seats (1–4 player avatars); through the window: rain-streaked gantry, floodlit pad, low orange cloud ceiling | Rain, distant klaxon, Earth Control briefing (grim, clipped) | Look around; click **STRAP IN**; host arms **LAUNCH** | 0–20s |
| 2 | **Ignition** (exterior) | cinematic | Cut outside: the patched industrial rocket on the pad, floodlights, venting steam → engines light, the pad floods with glare | Earth Control countdown; ignition roar building | watch | 20–30s |
| 3 | **Liftoff & ascent** (exterior, intercut) | cinematic | Rocket climbs off the gantry, clears the tower; intercut tight shots of the crew shaking in their seats; clouds rip past; sky darkens blue→black | Sustained low rumble (felt), structural groan, comms chatter | watch (seat shake) | 30–48s |
| 4 | **Separation → space** | cinematic→free-look | Booster sep flash + clunk; sudden silence; control returns to the cockpit. Earth fills the window, then starts to shrink | Bang, then near-silence + tinnitus ring; breathing | look-control returns | 48–55s |
| 5 | **The long quiet (transit)** | free-look | Weightless cabin; Earth a shrinking marble; a speck ahead grows | Crew chatter, a joke that misses; Earth Control thins with distance… then **says one word wrong** (the seed) | free-look; optional glance-at-comms | 55–80s |
| 6 | **Approach → dock** | free-look→handoff | The speck becomes the derelict — vast, dark, dead (the exact `/exterior` ship). It fills the window | Hull groan; a carrier tone that shouldn't be there | hand off to the docking sequence | 80–90s |

> Even in the **grim** register we keep one *wrong note* (beat 5/6): not hope-turned-sour, but a crack in the procedure — a mis-spoken word, or a second voice faint under Earth Control's static. It's the first whisper of THE CHORUS.

================================================================

## 2. Player control & camera

- **Free-look cockpit:** `PerspectiveCamera` fixed at the seat anchor; pointer-lock (or drag) drives yaw/pitch clamped to a human neck cone (~±100° yaw, ±70° pitch) so you can look at crew, the window, and the dash but never clip through the seat. No translation.
- **Cinematic beats (2–4):** control is taken; a keyframed camera rig flies the exterior shots and the intercuts. A single `skip` affordance (hold-to-skip) appears after first completion.
- **Diegetic interactions only:** `STRAP IN` (raycast click on the harness) and, for the host, `LAUNCH` (click the guarded switch). When all present players are strapped, the switch arms; host throws it → beat 2. Solo play auto-arms.
- **Seat shake** during ascent: additive camera-anchor noise (Perlin) scaled by a `thrust` value; subtle, never nauseating; respects a reduce-motion toggle.

================================================================

## 3. The "look outside from inside" technique

The crux of *look outside from inside the capsule*:

1. **Cockpit around the camera.** The capsule interior (seats, dash, window frame) is built as a small rig centred on the seat anchor. The **window is just an opening** in that geometry — through it you see the actual 3D world (pad, Earth, stars, derelict). No render-to-texture; the world is simply visible through the hole.
2. **Move the world, not the capsule.** We never translate the capsule across kilometres (float precision dies). The cockpit stays near origin; the **world moves/scales past it**: the pad rig descends and recedes at ignition, Earth scales down and drifts, the star parallax shifts, the derelict approaches from a far anchor. Launch "thrust" = camera shake + exhaust bloom + the pad scrolling away under you.
3. **Two world states, one cut.** The *ground* world (pad, gantry, sky dome, low cloud) and the *space* world (stars, Earth-from-orbit, derelict) are distinct sets. The separation flash (beat 4) hides the swap: ground set out, space set in. Beats 2–3 (exterior cinematic) live in the ground set with a free camera.

================================================================

## 4. Scenes & assets

### 4.1 Launch site — the grim ground spectacle (new, the big one)

Art direction: **overcast industrial night.** Low orange-lit cloud ceiling, rain, floodlight pools, deep shadow, rust and concrete, warning klaxons, venting steam. Militarized — blast walls, a fortified gantry, hazard chevrons, a dark skyline or base behind. Desaturated cold grade with amber practicals. Matches the derelict's lived-in grime so the worlds feel continuous.

New low-poly assets:
- **Rocket stack** — tall, patched, industrial (not sleek): booster body, banded tanks, greebled engine bell cluster, the capsule mated on top, fairing/escape tower.
- **Pad & gantry** — concrete pad, service tower/umbilicals, blast deflector, floodlight masts, hazard markings, steam vents.
- **Environment** — ground plane + horizon, low cloud-deck dome (lit from below by the pad), rain particles, distant silhouette skyline.
- **VFX** — engine plume (additive cone + particles), ground smoke roll, floodlight volumetrics, sparks.
- **Camera rig** — keyframed paths for ignition (low hero angle), liftoff (track up the tower), ascent (clouds ripping past).

### 4.2 Capsule interior — cockpit (new)

- Cramped cabin shell, ribbed/greebled, amber + cyan emissive readouts on the dash (reuse the material language from `exterior.html` `M.amber`/`M.cyan`).
- **Up to 4 crew seats** with 5-point harnesses; occupied seats show the player avatars (placeholder capsules now; rigged avatars later).
- The **window frame** (the opening), with a faint reflective tint and grime so it reads as glass.
- Strap-in harness as a clickable diegetic control; guarded LAUNCH switch (host).

### 4.3 Space transit (mostly reuse)

- **Star field, Earth (re-skin of the `exterior.html` planet), the derelict, and the whole PS1 grade stack** are reused from `lookdev/exterior.html`.
- Earth scales/drifts away; the derelict grows from a far anchor; on approach, **hand off to the existing `/exterior` docking sequence** (capsule→collar, clamps go green) rather than re-implementing it.

### 4.4 Reuse table

| From | Asset | Use in cold open |
|---|---|---|
| `exterior.html` | capsule mesh (nose/body/window/thrusters) | the vehicle exterior in beats 2–4; the thing that docks |
| `exterior.html` | star field + sun disc | transit backdrop |
| `exterior.html` | planet (procedural texture) | **Earth** (re-skinned: more ocean/cloud, grimmer) |
| `exterior.html` | the derelict + **the whole docking sequence** | beat 6 approach + hand-off |
| `exterior.html` / game | PS1 stack: vertex-snap, dither, bloom, Grade pass | identical render register across the whole intro |
| game (`index.html`) | audio clip system (procedural + ElevenLabs, positional) | rumble, VO, chatter, the seed |
| `admin.html` VOICE_DESIGN | **Earth Control** voice (already speced) | the briefing/countdown/wrong-note |

================================================================

## 5. Audio (ElevenLabs — showcase moment)

All generated in the **Audio Forge** (`/admin`) and catalogued; mixed via the engine bus (spec 04 §5). New catalog entries:

**Voice — Earth Control** (re-purpose the speced voice toward *military, stressed, clipped*; v3 emotion tags):
- Briefing: *"[clipped] Capsule, this is Control. Mission is contact and recovery. The derelict's gone dark — you put her comms back online. That's the whole job. [beat] Bring her voice back."* (← the trap, said plainly)
- Countdown: *"[tense] Ignition in three… two…"*
- The wrong note (beat 5): one mis-spoken/duplicated word, or a second faint voice under the static saying the same line a half-beat late.

**SFX/music:** rain + klaxon ambience; ignition roar; sustained ascent rumble (sub-bass, felt); structural groan; separation bang/clunk; the silence-of-space + tinnitus ring; hull groan + the wrong carrier tone on approach. Transit music bed: cold, sparse, dread-tinged.

Positional once the cockpit is the listener frame (crew voices from their seats). VO ducks the bed (spec 04 ducking).

================================================================

## 6. Multiplayer / lobby

The capsule **is** the lobby (ties to netcode spec 02):
- Room opens in beat 1; up to **4 seats** fill as peers join; empty seats show open harnesses.
- **Host arms LAUNCH** when all present players are strapped (or a ready-timer elapses); throwing it starts the on-rails sequence, which is **host-timed and broadcast** (reliable EVENT with a start tick) so all clients play it in lockstep.
- **Lobby locks at ignition** — late joiners wait for the next run / spectate.
- The cinematic is presentation: each client runs it locally off the shared start tick; only the *state* (who's strapped, launch fired) is networked.

================================================================

## 7. Quality tiers (Low→Ultra, per PLATFORM-AND-QUALITY)

| Tier | Cuts |
|---|---|
| **Low** | No rain/volumetrics; static cloud card; simplified rocket (no greeble); plume = sprite; no seat-shake blur; skip intercuts |
| **Mid** | Light rain; baked floodlight glow; plume particles capped; intercuts kept |
| **High** | Full rain + floodlight volumetrics; full plume; cloud-deck dome |
| **Ultra** | + denser particles, sharper internal res, longer hero shots |

================================================================

## 8. Build plan — look-dev first

The cold open ships as a growing **look-dev** (same approach as `lookdev/exterior.html`: single self-contained HTML, three r160 via CDN, the shared PS1 stack), served at a new **`/launch`** route, then folded into the real flow once it feels right. Recommended order — biggest reuse first, so there's a playable result fast:

- **Stage A — Cockpit + transit (`/launch`).** Build the capsule interior + window, free-look, and the move-the-world transit using the **already-built** star field / Earth / derelict. This is the core "look outside from inside" and gets us a playable ride immediately. *(Smallest lift — mostly assembly + the new cockpit mesh.)*
- **Stage B — Grim launch spectacle (`/pad` or prepended to `/launch`).** The marquee new art: the Earth launch site, the rocket, ignition, liftoff, ascent, the exterior cinematic + intercuts. *(Biggest lift.)*
- **Stage C — Stitch + interactions + audio.** Boarding → strap-in → host LAUNCH → spectacle → cockpit transit → hand off to `/exterior`. Wire Earth Control VO + SFX from the Audio Forge.
- **Stage D — Polish.** Skip flow, quality tiers, seat-shake/reduce-motion, multiplayer seats, the wrong-note seed timing.

> Trade-off to flag: you picked the **full ground spectacle**, which is the most new art. Stage A still comes first because it reuses the most and proves the POV — but if you'd rather *see the launch* first, we start at Stage B instead.

================================================================

## Tasks (done-when)

- **[A] `/launch` route + cockpit interior mesh** — _done when:_ serve.py serves `/launch`; a low-poly cockpit (seats×4, dash with amber/cyan emissive readouts, window frame) renders in the shared PS1 stack; camera fixed at the seat anchor.
- **[A] Free-look + neck-cone clamp** — _done when:_ pointer-lock/drag yaws/pitches within the human cone; you can look at each seat, the dash, and out the window; no clipping through the shell.
- **[A] Move-the-world transit** — _done when:_ reusing the exterior star field/Earth/derelict, Earth scales+drifts away and the derelict grows from a far anchor while the cockpit stays at origin; ends framed on the derelict.
- **[A] Hand-off to `/exterior` docking** — _done when:_ approach transitions cleanly into the existing capsule→collar docking (clamps go green) with no visible seam.
- **[B] Grim launch-site scene** — _done when:_ overcast-night pad renders — rocket stack, gantry, floodlights, low cloud deck, rain, steam, klaxon ambience — in the desaturated cold grade, reading continuous with the derelict's grime.
- **[B] Ignition + liftoff + ascent cinematic** — _done when:_ keyframed exterior rig plays ignition (glare/plume), liftoff up the tower, and ascent (clouds ripping, sky→black), intercut with cockpit seat-shake shots; separation flash hides the ground→space set swap.
- **[C] Boarding → strap-in → LAUNCH interaction** — _done when:_ clicking the harness straps in; host throws the guarded switch once all present are strapped (auto in solo); throwing it starts the on-rails sequence.
- **[C] Earth Control VO + SFX wired from Audio Forge** — _done when:_ briefing/countdown/wrong-note VO + ignition/rumble/separation/silence/approach SFX play on their beats, ducked correctly, positional in the cockpit; the wrong-note lands in beat 5/6.
- **[C] Skippable on replay** — _done when:_ a completed run sets a flag; subsequent loads offer hold-to-skip straight to dock; host can force-skip the room.
- **[D] Multiplayer seats (lobby)** — _done when:_ up to 4 peers occupy seats; strap state replicates; host-timed start broadcasts a shared tick so all clients play the cinematic in lockstep; lobby locks at ignition.
- **[D] Quality tiers + reduce-motion** — _done when:_ Low→Ultra apply the §7 cuts; reduce-motion disables seat-shake; runs 60fps on a mid laptop with WebGL fallback.
