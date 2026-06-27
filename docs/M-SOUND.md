# SIGNAL LOST — Audio Perfection & M-SOUND Proof

_Reaching a truly scary, polished audio bar — and hearing the atmosphere EARLY (paired with M-ART). Compiled 2026-06-27._


## M-SOUND — the early audio aesthetic proof

## M-SOUND — Early "Audio Aesthetic Proof" (pairs with M-ART / M-LOOK)

**Goal:** let the user HEAR whether the atmosphere is right — EARLY, before any full audio build — exactly as M-ART/M-LOOK lets them SEE the art direction before committing. A short, pre-baked, hand-assembled vertical slice of *feel*. It is a GREEN/RED aesthetic gate, not production code. It deliberately runs ahead of (or alongside) M0 netcode.

### What it produces (the deliverable the user listens to)
A single ~90-second playable/scrubbable audio scene — "Docking Bay -> first contact" — assembled in the minimal runtime engine (or even a temporary timeline player) so the user can hear the *transitions*, not just isolated clips:

1. **Ambience bed (layered, ~30s establishing)** — the 3-layer Docking Bay stack: tonal drone + mechanical hum + sparse random creaks/drips. Plus the **dread sub** at a low floor. Proves the "floor of dread" and the no-loop-tell goal.
2. **2-3 stingers** — `scare` (sharp dissonant hit), `reveal` (rising dread swell), and `relief` (the one warm resolving chord). Each demonstrated landing into a quieter mix so the user feels contrast.
3. **One ship-AI line — in TWO states** — the same line rendered (a) clean/trustworthy and (b) comms/degrading, so the user can judge the unreliable-narrator timbre. e.g. "Docking seal confirmed. Atmosphere on the other side is... breathable." Built with Eleven v3 + Audio Tags ([calm], slight [pause]) then comms post-FX.
4. **One creature vocal — the Stalker mimic** — the uncanny "calls your name" line: v3/Voice-Designed from a human voice, broken in post (formant + granular + wet undertone). This is the single most important clip — it proves whether "uncanny" lands or reads as cheesy.
5. **A tension build (the whole point)** — a scripted ~20s ramp from calm -> unease -> spike: ambience ducks under rising threat stem, sub swells, a designed **moment of near-silence** (silence budget), then the scare stinger + creature screech land into the void, then a short combat swell, then `relief`. This demonstrates the dread->spike->release fear-mix arc end to end.

### How it's built (cheap, throwaway-friendly)
- Reuses the REAL build pipeline (`tools/gen-audio`) for a tiny manifest subset (~12-15 clips) so M-SOUND doubles as a smoke test of the ElevenLabs pipeline, prompt craft, caching, and post-FX chain — de-risking real production. But the *scene assembly* (the timeline/transitions) can be a throwaway harness.
- Includes the new bits the full spec is still missing so they get validated early: **v3 + Audio Tags**, the **dread/infrasound bus**, the **comms/corrupted voice FX chain**, the **silence budget** moment, and a **loudness meter** readout (-23 LUFS target, -1 dBTP).
- Two delivery modes for the user: (a) a rendered stereo/binaural reference render they can play anywhere on headphones, and (b) the same in the engine with HRTF + occlusion so they can hear a threat move around them.

### GREEN/RED gate (what "pass" means)
- **GREEN** if, on headphones, the user agrees: the ambience is genuinely unsettling and doesn't sound "looped"; the sub-bass produces felt unease; the silence-then-stinger contrast makes them flinch; the ship-AI line reads "calm but off"; the creature mimic reads "uncanny," not "robot" or "stock monster"; the tension build delivers a real dread->spike->release.
- **RED** triggers a craft iteration (prompt rewrites, heavier/different post-FX, model/tag tweaks, mix rebalance) BEFORE committing to full audio production in M3.
- Output artifact: a short A/B reference doc pinning each beat to its north-star (Alien: Isolation / Dead Space) so "perfect" has a defined target.

### Where it slots in the roadmap
Insert **M-SOUND alongside M-ART/M-LOOK at the very front**, before M0. Rationale: the user's #1 priority is to SEE the art before building, and their #2 is PERFECT audio — front-loading both means they DECIDE the aesthetic (look AND feel) before production. M-SOUND's pipeline smoke-test also de-risks M3 (audio loop) months early. Re-run a scaled-up M-SOUND at the COMMS-RESTORE climax as a second aesthetic checkpoint, since that 60s is the campaign's most important audio.

## The audio quality bar ("perfect scary atmosphere")

## THE AUDIO QUALITY BAR — what "perfect scary atmosphere" actually requires

The existing spec (`docs/specs/04-audio-elevenlabs.md`) nails the *plumbing* (build pipeline, bus graph, tension model, Director protocol). "Perfect" is a craft bar on top of that. To clear it, SIGNAL LOST must deliver every item below — not as a wishlist but as gated, measurable targets.

### 1. Layered ambience beds (the floor of dread)
The atmosphere is never one loop — every space is a stack of independently-evolving layers so the bed never feels "looped":
- **Tonal bed** — slow detuned drone/pad, sits under everything (the room's "key").
- **Mechanical bed** — air-handling hum, electrical buzz, failing fluorescents (diegetic, ties to the fiction).
- **Structural/random layer** — sparse one-shots (distant creaks, drips, far-off impacts) scheduled by a Poisson-ish randomiser so no two minutes sound identical. This is the single biggest "AI-loop tell" killer.
- **Bar target:** at least 3 layers per zone, each on its own gain/pan/randomiser; a 5-minute listen must never expose an obvious loop seam.

### 2. Sub-bass dread + infrasound
- A dedicated **dread sub-channel** (a sine/rumble bed centred 25–45 Hz, plus a felt-not-heard component pushed toward ~19–20 Hz) modulated by tension. This is the physiological unease layer — players feel it before they notice it. *(Verified: infrasound <20 Hz produces unease without conscious perception.)*
- It must be a real engine bus (`dreadBus`) with its own ramp, not baked into music. Ducked/raised by tension and resolve, never spiking the limiter.
- **Bar target:** a metered low-end channel; on Ultra/desktop it reaches felt-bass territory; on laptop speakers it gracefully degrades (high-passed) without losing the mid-rumble.

### 3. Silence as a designed resource (a budget, not an accident)
The strongest scares come from *taking sound away*. Alien: Isolation's best moments were created by removing the music the moment the player started to rely on it.
- A **silence budget** managed by the Director: after a sustained loud/combat stretch, it can drop the bed to near-zero, holding only the sub and one fragile diegetic sound. Silence is *spent* deliberately and *refilled* over time.
- **Bar target:** the Director can produce genuine near-silence (music + most SFX pulled, sub at a floor) and a stinger/whisper landing into that silence is provably louder *in perceived terms* than into a full mix.

### 4. Diegetic creature vocals that read as "wrong"
- The Stalker mimic line ("calling your name") must sound *almost* human and subtly broken — uncanny-valley audio. Creature vocals get their own post-FX (formant shift + granular smear + wet undertone) so they never sound like a clean TTS line or a stock roar.
- Distinct vocal *grammar* per archetype: Stalker (mimic/idle-clicks/screech/pounce), Swarmer (skitter/chitter/death), plus reserved slots for Brute/Wall-Crawler/Spitter/Maw so the campaign escalates.
- **Bar target:** in a blind listen, the mimic line is rated "unsettling/uncanny," not "robotic" or "a monster sound."

### 5. The unreliable-narrator ship AI voice
- A calm synthetic ship intelligence that is *helpful then subtly not* — its reliability degrades as the ship/story does. Three voicing states: **clean** (early, trustworthy), **comms** (band-limited/coded, "over a failing channel"), **corrupted** (glitch/stutter/ring-mod creeping in as it lies or breaks down toward the COMMS-RESTORE climax).
- **Bar target:** the same voice, across a level, demonstrably shifts from reassuring to disturbing using delivery + post-FX, not just script.

### 6. Binaural / HRTF spatialization with occlusion + reverb zones
- Already specced: HRTF `PannerNode`, per-section convolver reverb crossfades, lowpass occlusion. The bar adds: **threats must be locatable by ear** (sound-based detection is a core mechanic, so spatial accuracy is gameplay, not polish), and **reverb tails must change believably** when crossing from a tight corridor into the command centre.
- **Bar target:** blindfolded, a player can point at a Stalker within ~30° and tell "behind a wall" vs "in the room" from filtering alone.

### 7. Dynamic mixing / ducking (the "fear instrument")
- The mix is one continuous performance driven by tension, not static levels. Voice ducks music+SFX (specced). The bar adds **tension-driven ducking of the ambience bed under creature proximity** (Dead-Space "fear emitter" behaviour: as the threat nears, ambient noises subside and the threat layer rises), plus **heartbeat** and **low-resolve master distortion** as per-player local layers.
- **Bar target:** crossing tension bands produces a smooth, intentional remix (no pops, no obvious layer toggles); a downed-player / low-resolve state audibly warps the local mix.

### 8. Mastering / loudness (currently MISSING from the spec)
- Horror lives on dynamic range — but it still needs a loudness target so quiet ≠ inaudible and stingers ≠ clipping.
- **Target:** integrated **≈ -23 to -24 LUFS** with true-peak **≤ -1 dBTP**, but with *wide* dynamic range preserved (horror wants the valleys quiet). Provide a **"Night Mode"** dynamic-range option (compress the range, lift footsteps/dialogue) like Mass Effect/many AAA titles, for headphone-at-night players.
- **Bar target:** master-bus loudness/true-peak metered in the engine and in a CI check on baked content; a documented LUFS/TP budget per bus.

### 9. Reference soundscapes to aim at (the "north star" list)
- **Alien: Isolation** — adaptive stealth/threat remix; silence-as-weapon; diegetic ship hum. *(Primary reference.)*
- **Dead Space** — fear-emitter proximity music; dismemberment/gore foley; the Ishimura's groaning hull.
- **GTFO / Lethal Company** — sound-based detection consequence; proximity voice paranoia.
- **Silent Hill (and its new dynamic-score work led by Alien:Isolation's sound director)** — evolving score, industrial dread, dissonance.
- **Bar target:** an A/B reference doc — for each beat (explore / unease / spike / combat / release / COMMS-RESTORE) name the reference track/scene we're matching.

### THE COMMS-RESTORE CLIMAX BAR (the payoff)
Every ship ends here, escalating across the campaign. Audio must deliver: building dissonance + rising sub → a moment of held silence/dread → the restore "crescendo" (a hopeful, *resolving* swell — the one place tonal release is allowed) → and, on the corrupted-AI beat, the narrator's mask finally slipping. This is the single most important ~60 seconds of audio per ship and gets its own authored pass, not a Director auto-mix.

## ElevenLabs + sound-design techniques

- MODEL UPGRADE — adopt Eleven v3 for all voice (ship AI, distress logs, creature mimic), not just Flash v2.5. v3 (GA Feb 2026) supports in-script Audio Tags like [whispers], [nervous], [stutters], [exhales], [static], 70+ languages, 68% fewer errors in complex text. Keep Flash v2.5 ONLY for the optional low-latency runtime bark path; pre-baked content (the 99% case) uses v3 for genuine emotional delivery. This is the biggest single 'AI-flat -> terrifying' lever and is currently unused in the spec.
- VOICE DESIGN for the ship AI: prompt a 'calm androgynous synthetic ship intelligence, neutral, faint digital sibilance, unhurried' and bake THREE delivery+FX states from the same voice: clean (trustworthy), comms (band-limited), corrupted (glitch/ring-mod) — so the narrator audibly decays across the level. Use low guidance-scale freedom on Voice Design for an uncanny, slightly-off timbre rather than a polished assistant.
- VOICE DESIGN for creatures: design the Stalker's mimic from a HUMAN voice prompt ('exhausted person calling for help') then break it in post — this is what makes 'it calls you by name' uncanny rather than a generic monster roar. Generate the screech/pounce/idle via the Sound Effects API and the MIMIC via TTS+heavy FX.
- v3 AUDIO TAGS for distress logs: script the crew distress log with embedded tags — e.g. '[whispers] don't open the bay doors [breathing shakily] it learns your voice [static] it calls you by—' so the emotional break is in the model output, then layer comms-distortion on top. Tags do the acting; FX does the texture.
- SOUND EFFECTS PROMPT CRAFT — be hyper-specific and include the negative space: 'long low stressed-metal hull groan, deep creak, eerie, NO music, NO reverb, dry, 4 seconds, seamless' beats 'metal groan'. For ambience use loop:true + low prompt_influence (0.2) for variance; for transient SFX use higher prompt_influence (0.4-0.6) for fidelity. Generate WHISPER beds ('distant indistinct overlapping human whispers, unintelligible, cold reverb') as a dedicated layer — whispers-into-silence is a top-tier scare.
- STINGER craft via Sound Effects API, key-matched to each zone's music key (e.g. D minor): scare (sharp dissonant brass+metal screech, hard transient), reveal (low rising dread swell into a single ominous hit), relief (warm resolving pad — the ONLY tonal resolution allowed). Bake 3-4 variants of each so repeated scares don't pattern-match.
- MUSIC v2 adaptive stems via ONE composition-plan-per-zone -> compose -> stem-separate (already specced and correct). Author with explicit negative_styles ['upbeat','major key','drums-forward','pop','melodic resolution'] and force_instrumental. Because all stems derive from one composed piece they're inherently tempo/key/phase-locked — engine only starts them in phase.
- POST-PROCESS every AI voice so it doesn't sound 'AI-flat': run a real FX chain at build time, not just bitcrush. Recommended chain options — (a) comms: bandpass 300-3400Hz + soft saturation + light bitcrush + radio open/close clicks; (b) distorted_log: add ring-mod + dropouts/stutters + tape-wow pitch wobble + convolver into a small metal room; (c) corrupted-AI: granular smear + random pitch micro-shifts + intermittent reverse-reverb. Crucially: feed the model a DRY, clean render (no built-in reverb) so FX sit cleanly on top — reverb baked into the source muddies post-processing.
- AVOID THE LOOP TELL: bake 4-8 variants of every repeated SFX (footsteps, creaks, vent rattles), and never play ambience as a single static loop — drive a Poisson randomiser layer of sparse one-shots over the tonal bed. Seeded variant selection (mulberry32(roomSeed^tick)) already guarantees all clients hear the same pick — keep that.
- INFRASOUND / SUB-BASS as a first-class engine bus: add a `dreadBus` carrying a 25-45Hz rumble plus a ~19-20Hz felt component, gain-modulated by tension + (inverse) resolve. High-pass it out on Low quality tier / laptop speakers so it degrades gracefully. This is the physiological unease layer and is currently absent from the bus graph.
- SILENCE BUDGET in the Director: after sustained loud sections, the Director can spend 'silence' — pull music + most SFX, hold only sub + one fragile diegetic sound — then land a stinger/whisper into that void. Model it as a refilling resource so it's used sparingly. (Alien: Isolation's core trick: remove the music the moment the player leans on it.)
- FEAR-EMITTER ducking (Dead Space technique): as nearest-enemy distance drops, ramp the AMBIENCE bed down and the threat/dissonance stem up — the world goes quiet around the predator. Wire this into the existing tension model's mProx input.
- HEARTBEAT + LOW-RESOLVE DISTORTION as per-player LOCAL audio (never synced): a heartbeat layer that quickens with local HP/tension, and a master-bus distortion/detune that worsens as the shared Resolve/sanity meter drops — so a panicking player literally hears the world warp. Keep these client-local per the existing protocol.
- MASTERING DISCIPLINE (new): add a master loudness/true-peak meter to the engine and a CI check on baked content. Target integrated ~ -23 to -24 LUFS, true-peak <= -1 dBTP, wide dynamic range preserved. Provide a 'Night Mode' dynamic-range-compression option for headphone players. Per-bus headroom budget documented (e.g. stingers allowed to hit -1, ambience parked low).
- DETERMINISM + COST CONTROL (already specced, keep): fixed seeds + prompt-hash cache so unchanged clips never re-bill and regeneration is bit-identical; Scale-tier API key unifies voice+music+SFX. Add v3 to the provider client alongside Flash v2.5.
- BINAURAL ACCURACY AS GAMEPLAY: because sound-based detection is a core mechanic, treat HRTF panning + occlusion lowpass (clear 20kHz -> occluded ~700Hz) + reverb-zone crossfade as a gameplay-correctness requirement, not polish. Add a test: a listener can localise a threat within ~30deg and distinguish in-room vs behind-wall from filtering alone.

## Gaps closed vs current plan

- MODEL GAP (biggest): the spec bakes ALL voice with Flash v2.5 and never uses Eleven v3 or Audio Tags (GA Feb 2026). Flash is a low-latency model meant for the runtime path; pre-baked content should use v3 for real emotional delivery. ADD v3 to the provider client and switch ship-AI / distress-log / creature-mimic baking to v3 with in-script tags. Keep Flash v2.5 only for the optional runtime bark.
- INFRASOUND / SUB-BASS BUS MISSING: the bus graph (music/sfx/voice/master) has no dedicated dread/sub channel. ADD a `dreadBus` carrying 25-45Hz rumble + ~19-20Hz felt component, tension/resolve-modulated, high-passed out on Low tier. This is a named quality-bar requirement with no home in the current architecture.
- SILENCE IS NOT A MANAGED RESOURCE: tension only scales layer gains UP; there's no Director mechanism to deliberately PULL the bed to near-silence and refill it. ADD a silence-budget controller (Alien: Isolation's signature trick). Today the mix can get quiet but never strategically silent.
- NO MASTERING / LOUDNESS TARGET: nothing in the spec defines integrated LUFS, true-peak ceiling, per-bus headroom, or a Night-Mode dynamic-range option. ADD a master loudness/true-peak meter + CI loudness check on baked content (target ~ -23/-24 LUFS, -1 dBTP) and a Night Mode setting.
- POST-FX CHAIN IS THIN: only bitcrush+bandpass+ringmod are mentioned, applied to two bake presets (comms / distorted_log). The 'don't sound AI-flat' bar needs richer chains (saturation, granular smear, ring-mod, tape-wow, dropouts, reverse-reverb, convolver-into-metal-room) and a third 'corrupted-AI' preset for the degrading narrator. Also: ensure model renders are DRY (no built-in reverb) so FX sit cleanly.
- NO WHISPER LAYER: whispers-into-silence is a top-tier horror device and a stated quality-bar item, but there's no whisper bed or whisper one-shots in the asset list. ADD `ambient.whispers` + whisper stingers.
- FEAR-EMITTER DUCKING NOT WIRED: the tension model has mProx as an INPUT but doesn't use proximity to DUCK ambience while raising the threat stem (the Dead Space 'world goes quiet around the predator' effect). The hook exists; the behaviour doesn't.
- NO EARLY AUDIO PROOF MILESTONE: the roadmap front-loads M-LOOK (visual proof) but audio first appears at M3, deep into the build. This contradicts the user's priority that audio be 'perfect' and heard early. ADD M-SOUND alongside M-ART (defined above).
- CREATURE VOCAB INCOMPLETE FOR CAMPAIGN: only Stalker + Swarmer vocals are specced; Brute, Wall-Crawler, Spitter, and the Maw boss have no audio grammar. Reserve and design their vocal sets so COMMS-RESTORE escalation has material.
- COMMS-RESTORE CLIMAX HAS NO AUTHORED AUDIO PASS: it's the payoff of every ship and the user's validated standout beat, but the spec treats audio as Director auto-mix only. ADD a hand-authored climax audio sequence (build dissonance -> held silence -> resolving crescendo -> narrator mask-slip) per ship, escalating across the campaign.
- REFERENCE-SOUNDSCAPE TARGET DOC MISSING: no A/B 'north star' mapping exists, so 'perfect' is undefined. ADD a beat-by-beat reference doc (explore/unease/spike/combat/release/comms-restore -> specific Alien:Isolation / Dead Space / Silent Hill moments).

## Open questions

- Eleven v3 latency/cost vs Flash v2.5: since all voice is pre-baked, v3's higher latency is irrelevant — but does v3 generation cost materially more credits, and does the Scale tier cover it under one key? Confirm before switching the baking model.
- Infrasound delivery target: how far do we push felt sub-bass given most players are on laptop speakers or earbuds? Do we author a true ~19-20Hz component (only audible on Ultra/desktop + good headphones/subwoofer) plus a 25-45Hz fallback, and accept it's a desktop-tier-only payoff?
- Mastering target: lock -23/-24 LUFS broadcast-style, or go quieter/wider for a more cinematic horror dynamic range? And is Night Mode a launch feature or post-launch?
- Should M-SOUND be a standalone throwaway reference render the user plays on headphones, or built inside the engine with HRTF from day one? The former is faster to produce; the latter proves spatialization but costs more.
- How human should the Stalker mimic be — does it speak real player-derived names (requires runtime TTS, the risky path) or only pre-baked generic 'help me' lines in v1? The 'calls you by name' fiction is strongest with real names but conflicts with the pre-baked-only guarantee.
- Does the user want a licensed-composer 'signature theme' anywhere, or is fully ElevenLabs-generated music acceptable for the whole campaign including the COMMS-RESTORE crescendo (the one place a memorable authored motif would pay off most)?
- Proximity voice chat coexisting with the fear-mix: when players are talking on mic, how aggressively does the Director duck/limit so it doesn't kill tension — and does player chatter undermine designed silence? Needs a policy.