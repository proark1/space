# SIGNAL LOST — M-ART Concept-Board Playbook (Google Gemini / Nano Banana)

_Ready-to-run, Gemini-native. Produce the low-poly concept board and pick the visual DIRECTION. The register (low-poly/PS1, clean-base + Director-ramped grit) is locked; M-ART chooses THEME only. Re-tooled for Gemini 2026-06-27 (no Midjourney flags — consistency is by reference image + natural language)._


## Overview

M-ART (Gemini edition) produces a **low-poly / PS1-retro concept board** rendering the 4 candidate
DIRECTIONS (Iron Lung / Analog Ghost / Sterile Wound / Leviathan Bloom) across a matched 5-shot list each,
PLUS the CHORUS monster look-dev — so you pick a DIRECTION (or a per-ship blend) from real frames. The
**register is already locked** (low-poly/PS1, clean-base + Director-ramped grit); M-ART chooses THEME only.
Every direction renders in the IDENTICAL register so it's apples-to-apples — only palette/material/mood vary.

**Decision it gates:** which of the 4 directions (or a blend of two) becomes the canonical visual theme.
**Deliverable:** ~20 world frames (4 × S1–S5) + the CHORUS master turnaround + ~4 monster in-world frames.
**Tool:** Google Gemini ("Nano Banana") — masters on Nano Banana Pro (4K, best consistency), batch on
Nano Banana 2. **Cost:** roughly $0.07–0.24 per frame; a full ~25-frame board with iteration is a few
dollars of API, or free-ish hand-iteration in Google AI Studio. **Time:** ~1–2 focused days incl. paintover.


## Tool setup & consistency mechanics

# Gemini Image Toolchain & Consistency Mechanics (verified June 2026)

> Re-tooled for Google Gemini ("Nano Banana"). There are **no `--sref`/`--oref`/`--ar`/`--no` flags** here. Consistency is done by **attaching reference images + natural-language instructions**, and iterating **conversationally (multi-turn)**. Everything below is verified against Google's current docs/blogs, not guessed.

## 1. The current models (pick by speed vs. asset quality)

| Nickname | Model id | Role for this board |
|---|---|---|
| **Nano Banana Pro** | `gemini-3-pro-image` (API preview alias: `gemini-3-pro-image-preview`) | **Hero/final concept frames.** Best text-in-image, best reasoning, up to **4K**, strongest multi-reference consistency (5 characters + up to 14 objects + 3 style refs). Slower (~45s at 4K), pricier. |
| **Nano Banana 2** | `gemini-3.1-flash-image` (preview alias: `gemini-3.1-flash-image-preview`) | **Iteration / batch drafts / variations.** Released 26 Feb 2026. Brings most of Pro's quality to Flash tier, ~50% cheaper, ~20s at 4K, still does 4K. Default model in the Gemini consumer app. |
| **Nano Banana (1)** | `gemini-2.5-flash-image` | Legacy/cheapest. 1K-only native (~1024px). Use only if you want the very cheapest throwaway thumbnails. |

**Recommendation for SIGNAL LOST:** lock the look and the monster master on **Nano Banana Pro** (consistency + 4K hero exteriors S1 + creature turnaround M1), then **fan out the ~20 shot-list frames on Nano Banana 2** for cost/speed, promoting the keepers to Pro for final 2K/4K renders.

## 2. Access paths (best → situational for a concept board)

| Path | Best for | Notes |
|---|---|---|
| **Google AI Studio** (`aistudio.google.com`) | **Best for this concept board.** Free-ish prototyping, drag-drop multiple reference images, pick model + aspect ratio + resolution in UI, "Get code" to graduate to the API. | The sweet spot for iterating a shot list by hand before scripting batches. |
| **Gemini API / Google GenAI SDK** (`ai.google.dev`) | **Batch the ~20 frames programmatically** once the style anchor + creature master exist. Supports `previous_interaction_id` for multi-turn edits and a **Batch API at 50% off**. | The right tool for "render all 4 directions × 5 shots" deterministically. |
| **Gemini app** (consumer, `gemini.google.com`) | Quick one-off look-dev on phone/desktop; Nano Banana 2 is the free default. | Less control over exact resolution/seed; fine for sketching ideas. |
| **Vertex AI** | Enterprise/team scale, quotas, governance, $300 free GCP credits (~2,240 std images). | Use if the studio needs shared billing/IAM; same models. |
| **Whisk** | **Gone — do not use.** Shut down 30 Apr 2026, folded into **Google Flow**. | Flow's "Ingredients" = saved reusable character/style references (better consistency than old Whisk). Optional for animatics later. |
| **fal / Krea (3rd-party)** | Convenience wrappers, alt billing, sometimes batch UX. | Pros: nicer batch/queue UI. Cons: markup, lag behind Google on newest model ids, an extra ToS hop. Prefer first-party AI Studio/API for a real pipeline. |

## 3. Style consistency (holding ONE low-poly PS1 look across ~20 frames)

There is no style-reference flag. You hold the register three ways, stacked:

1. **Mint a "style anchor" frame first** (one clean S3 corridor you love), then attach it to every subsequent prompt with literal language: *"Match this exact art style and render: low-poly PS1-era game, flat untextured polygons, hard vertex-snapped edges, limited palette, dithered shading. Same render, new scene."* Pro accepts **up to 3 dedicated style references**.
2. **Trait-lock the vocabulary** — reuse the *same words verbatim* every prompt ("low-poly", "PS1 vertex-snap", "near-black fog", the exact hex palette per direction). Swapping synonyms causes drift.
3. **Lock camera/lighting language** — same lens/height phrasing ("eye-level, flashlight cone, near-black draw-distance fog, cold grade") so frames read as one game.

**Reliability:** good but not perfect across many frames; consistency quality **plateaus around 6 well-chosen references and can degrade past ~10**, and long sessions drift. Mitigation: keep the style anchor attached every time, render in short sessions per direction, and promote a "winner" frame to become the new anchor.

## 4. Subject/character consistency (the CHORUS across M1–M5)

- **Master first:** render **M1 full-body turnaround on Nano Banana Pro** (neutral bg, multiple views in one sheet — frontal + 45° + 90°). This is your consistency master.
- **Reference it everywhere:** attach M1 + say *"the same creature, identical anatomy"* for M2–M5. Pro holds **up to 5 characters**; you only need one.
- **High-salience anchors:** name one or two signature, hard-to-drift cues every prompt (e.g. "translucent frilled ear-membranes", "distended resonating throat-speaker, no mouth", "eyeless"). The model uses these like a fingerprint.
- **Multi-turn editing:** in the API use `previous_interaction_id` (in AI Studio, just keep chatting in the same thread) to do conversational fixes — *"keep the same creature, now mid-lunge mimicking a human shape"* — instead of re-prompting from scratch.
- **Mix-references rule:** total budget is **up to 14 reference images** per request (Pro: ~6 objects + 5 characters + 3 styles; NB2: ~10 objects + 4 characters + 3 styles). For the hybrid tile M2 you can attach **creature master + corridor style anchor together** so the grounded monster sits in the chunky world under one flashlight/fog/grade.
- **Reliability:** strongest on the market right now, but viewpoint stability helps — fix a default vantage ("3/4 view, mid-shot, eye-level") and only change it when the shot demands.

## 5. Aspect ratio, resolution, multi-image blend, text, limits, cost

**Aspect ratio & resolution — set in API config, not flags.** In the request's image/response-format config:
```
image_config / response_format: { aspect_ratio: "16:9", image_size: "4K" }
```
- `aspect_ratio`: 1:1, 16:9, 9:16, 4:3, 3:4, 5:4, 4:5, 3:2, 2:3, 21:9 — plus extreme 1:4, 4:1, 1:8, 8:1 on the Gemini 3 models. (In AI Studio / the app you pick the ratio from a dropdown; in plain chat you can also just ask "make it 16:9".)
- `image_size`: `512px` (NB2 only), `1K`, `2K`, `4K`. **Yes — Pro and NB2 both render up to native 4K.** Use **16:9 4K for S1 exterior heroes and the M1 sheet**, 16:9 2K for corridors/interiors.

**Multi-image blending (for per-ship direction blends):** attach multiple references and instruct the fusion, e.g. *"Blend the architecture of image 1 (Iron Lung) with the palette/materials of image 2 (Leviathan Bloom), keep the low-poly render."* Same 14-image budget applies.

**Text-in-image:** **Nano Banana Pro is the current best** at legible, multi-line, stylized text (single-line error rates mostly <10%) — good for in-world signage/HUD labels on command-centre S4 frames.

**Reference-image limits:** **14 max** per request; effective consistency plateaus ~6, degrades past ~10.

**Quota/cost (per output image):**
- **Nano Banana Pro:** ~$0.134 at 1K/2K, ~$0.24 at 4K (input refs ~$0.0011 each). **Batch API = 50% off** (~$0.067 / ~$0.12).
- **Nano Banana 2:** ~$0.067 at 2K, ~$0.134 at 4K (≈50% cheaper than Pro).
- $300 GCP free credits ≈ 2,240 standard images for testing.

## 6. Recommended pipeline on Gemini

1. **Mint the style anchor** (one S3 corridor) per direction on Pro → save the keeper.
2. **Mint the creature master** (M1 turnaround) on Pro → save it.
3. **Batch the shot list** on Nano Banana 2 in AI Studio/API: for each frame attach **style anchor (+ creature master for M-shots)** and the trait-locked prompt. 16:9, 2K drafts.
4. **Conversational fixes** via `previous_interaction_id` / same thread — nudge fog, palette, silhouette without losing identity.
5. **Promote winners to Pro** and re-render at **2K/4K**. Gemini Pro outputs **hi-res 4K natively — no separate upscaler needed** for most uses; reach for Magnific/Topaz only if you want extra crunch/print sizes beyond 4K.
6. **For the S5 "Director-degraded" frame**, bake the degradation in the prompt ("heavy ordered dithering, low-res crunch, vertex jitter, posterized") — or render clean then post-process the PS1 grit in comp for repeatable control.
7. **Export** PNG at chosen resolution; keep anchors + master in a referenced asset folder (or Flow "Ingredients") for reuse.

## 7. Negative guidance without `--no`

No negative-prompt parameter exists. Phrase avoidance as **positive constraints inside the prompt**, stated as what it *is*:
- Instead of "no photoreal" → *"flat low-poly PS1 render, untextured hard-edged polygons, visible vertex snapping, dithered low-res shading — NOT photorealistic, no smooth gradients, no realistic skin, no high-detail textures."*
- Lead with the affirmative style sentence, then a short "avoid:" clause in plain English. Reuse the exact same avoid-clause verbatim across all frames so it sticks. The **CHORUS** is the one deliberate exception — there you positively ask for "one notch denser mesh, smoother normals, wet translucent subsurface scatter" against the otherwise flat world.

---
**Sources:** [Gemini image-gen docs](https://ai.google.dev/gemini-api/docs/image-generation) · [Nano Banana Pro / Gemini 3 Pro Image (DeepMind)](https://deepmind.google/models/gemini-image/pro/) · [Nano Banana Pro blog](https://blog.google/technology/ai/nano-banana-pro/) · [Nano Banana 2 blog](https://blog.google/innovation-and-ai/technology/ai/nano-banana-2/) · [Nano Banana 2 launch (TechCrunch)](https://techcrunch.com/2026/02/26/google-launches-nano-banana-2-model-with-faster-image-generation/) · [Gemini 2.5 Flash Image docs](https://ai.google.dev/gemini-api/docs/models/gemini-2.5-flash-image) · [Vertex 3 Pro Image pricing](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/models/gemini/3-pro-image) · [Whisk shutdown → Flow](https://pasqualepillitteri.it/en/news/1411/google-whisk-shuts-down-april-30-flow-migration) · [Character-consistency best practices](https://prompting.systems/blog/nano-banana-pro-character-consistency-guide) · [Simon Willison on Nano Banana Pro](https://simonwillison.net/2025/Nov/20/nano-banana-pro/)

### Setup checklist

- Create/sign in to Google AI Studio (aistudio.google.com); for batch/team scale enable a Vertex AI project (claim the $300 GCP free credit).
- Confirm model access: Nano Banana Pro = gemini-3-pro-image (preview: gemini-3-pro-image-preview); Nano Banana 2 = gemini-3.1-flash-image. Default to Pro for masters, NB2 for batch.
- Do NOT use Whisk (shut down 30 Apr 2026). If you want reusable saved references for animatics later, use Google Flow 'Ingredients' instead.
- Write a reusable STYLE BLOCK (verbatim every prompt): 'flat low-poly PS1 render, untextured hard-edged polygons, visible vertex snapping, dithered low-res shading, limited palette' + the exact hex list per direction.
- Write a reusable AVOID CLAUSE (verbatim): 'NOT photorealistic, no smooth gradients, no realistic skin, no high-detail textures' — positive-framed, no negative param exists.
- Mint 4 STYLE ANCHORS (one S3 corridor per direction) on Nano Banana Pro; save the keepers as the attach-everywhere style references.
- Mint the CHORUS MASTER (M1 turnaround, neutral bg, frontal+45deg+90deg in one sheet) on Pro; trait-lock signature cues ('eyeless', 'frilled ear-membranes', 'distended throat-speaker, no mouth').
- Batch the 4x5 shot list on Nano Banana 2: attach style anchor (+ creature master on M-shots), set image_config aspect_ratio:'16:9', image_size:'2K' for drafts.
- Use conversational/multi-turn edits (previous_interaction_id in API, or same AI Studio thread) for fixes — keep references attached so identity/style don't drift.
- Keep total references <=6 effective per request (hard cap 14); render in short per-direction sessions to limit drift; promote a winner frame to be the new anchor.
- Promote winners to Nano Banana Pro and re-render hero/exterior S1 and M1 at 4K, others at 2K — 4K is native, no external upscaler needed unless you want extra crunch (Magnific/Topaz).
- For S5 'Director-degraded', either bake degradation into the prompt (ordered dither, low-res crunch, vertex jitter, posterize) or render clean and add PS1 grit in comp for repeatable control.
- Budget cost: NB2 ~$0.067/2K, ~$0.134/4K; Pro ~$0.134/2K, ~$0.24/4K; use the Batch API (50% off) for the bulk fan-out of variations.

## Tile plan

**Order of operations (Gemini, reference-driven):**
1. **Mint 4 STYLE ANCHORS first** — generate one S3 corridor per direction on **Nano Banana Pro**, pick the
   best per direction. These become the *attach-everywhere* style reference for that direction.
2. **Mint the CHORUS MASTER (M1)** — one turnaround sheet on neutral grey, on Pro. This is the creature
   reference attached to every monster shot.
3. **Batch the shot list on Nano Banana 2** — for each direction's S1/S2/S4/S5, attach that direction's
   anchor + "match this exact low-poly render and palette." For monster shots M2–M5, attach M1 + the host
   direction's corridor + the hybrid-contract sentence.

**World tiles (20):** 4 directions × {S1 exterior hero · S2 docking bay · S3 corridor · S4 command centre ·
S5 Director-degraded corridor}.
**Monster tiles (5):** M1 turnaround (master) · M2 hybrid tile (creature in low-poly corridor, flashlight,
fog) · M3 throat/face detail · M4 lunge/mimic · M5 dismemberment gib beat. Re-skin M2 into the 2 front-runner
directions.

**Minimum-viable board (~12–15 frames, under a day):** each direction's S1 + S3 + S5, plus M1 + M2 re-skinned
to the 2 leading directions. Enough to pick a direction; add S2/S4 and M3–M5 only for the winner.


## Prompt library — world

**Style statement (prepend / reference on every world frame):**

> LOW-POLY / PS1-RETRO STYLE STATEMENT (reusable — prepend or reference on every world frame):  "Render this as an authentic late-1990s PlayStation 1 / PSX-era first-person survival-horror game screenshot. The whole world is built from chunky low-polygon geometry: flat-shaded faceted meshes with hard, visible polygon edges and obvious triangulation, no smooth rounded surfaces. Surfaces wear low-resolution textures that are affine-warped and wobble across the faces (the classic PS1 texture swim), with a tight limited color palette and heavy ordered/Bayer dithering producing visible crosshatch gradients instead of smooth blends. Lighting is posterized into hard banded steps (vertex/Gouraud lighting), not soft and continuous. Geometry shows subtle vertex-snap jitter, as if vertices are quantized to a coarse screen grid. The scene reads at a low internal resolution, slightly crunchy and pixelated, like a 320x240 framebuffer upscaled. Atmosphere is built from thick volumetric fog used as draw-distance: distant geometry dissolves into near-black before it reaches the camera, and a single harsh hard-edged flashlight cone is the dominant light source, carving a bright wedge out of the dark. The overall grade is cold, desaturated, and grim. Keep the read clean and legible by default — chunky but readable. Do NOT make it photorealistic, high-poly, smooth-subdivided, ray-traced, or modern AAA; do NOT add soft global illumination, realistic skin, fine surface detail, motion blur, or cinematic film grain. Keep flat untextured-looking facets, visible polygon edges, dithered banding, and the deliberately retro 1998 console look throughout. This register is locked."

Below: the full Gemini-native prompt set. Every world frame is `[STYLE STATEMENT] + [direction palette/materials/lighting] + [shot composition] + [aspect ratio in words]`. Negative guidance is woven in as plain English (no `--no`/`--ar`/`--sref` flags — those are Midjourney and do nothing in Gemini).

**HOW TO USE ON GEMINI (read first):**
- Paste the **Style Statement** at the top of every world prompt (or, once you have an anchor frame, attach that frame and write "match this exact low-poly render style, palette, fog and flashlight look").
- **Generate S3 (corridor) FIRST for each direction** — it carries the core-loop look (flashlight + near-black fog + the palette). It is your **style anchor**.
- Then for S1, S2, S4, S5: **attach the S3 image as a reference** and open the prompt with: *"Using the attached image as the exact style and palette reference, match this low-poly PS1 render, its color palette, its fog-into-near-black draw distance, and its flashlight look. Now show me a NEW shot: ..."*
- Gemini is conversational — refine in follow-ups ("more dither", "push the fog closer", "colder grade", "snap the verts harder") rather than re-writing the whole prompt.
- For S5 (Director-degraded), start from the S3 anchor and ask Gemini to "degrade this same scene heavily."

---

## DIRECTION 1 — IRON LUNG (industrial-grime)

**Palette to name in every prompt:** gunmetal #2B2F36, cold-steel #3A4048, rust-oxide #6E4A33, hazard-amber #E8A33D, sodium-orange #C97B3B, sick-cyan #9FD0FF, near-black #05070A, dried-blood #4A0C0C.

### IL-S1 — Exterior hero (ship + capsule for scale), wide 16:9
[PREPEND STYLE STATEMENT] A derelict industrial deep-space hauler floating in the black void, built from chunky flat-shaded low-poly geometry with hard polygon edges. The hull is gunmetal grey (#2B2F36) and cold-steel (#3A4048), streaked with rust-oxide (#6E4A33) and patched with low-res affine-warped panel textures. A few hazard-amber (#E8A33D) running lights and sodium-orange (#C97B3B) window glows are the only warm points; a faint sick-cyan (#9FD0FF) thruster haze drifts off the engines. The surrounding space is near-black (#05070A) with a sparse dithered starfield. A tiny rescue capsule drifts in the foreground far below the ship to sell the enormous scale. Cold desaturated grade, posterized banded lighting on the hull facets. Keep it low-poly and retro PS1, not a smooth modern spaceship render. Compose as a wide 16:9 cinematic establishing frame.

### IL-S2 — Docking bay interior, wide 16:9
[PREPEND STYLE STATEMENT] Interior of an industrial docking bay, chunky low-poly with visible triangulated walls and hard edges. Gunmetal (#2B2F36) and cold-steel (#3A4048) bulkheads, rust-oxide (#6E4A33) staining around weld seams, hazard-amber (#E8A33D) striped warning paint on the floor and a docking gantry. Sodium-orange (#C97B3B) work lamps cast posterized banded pools of light; sick-cyan (#9FD0FF) glow leaks from a control panel. Low-res affine-warped grime textures on every surface. Deep near-black (#05070A) shadows in the corners with fog eating the far end of the bay. A small docked capsule sits mid-frame for scale. Cold grim grade, ordered dithering in the gradients. Stay low-poly PS1, not high-detail. Wide 16:9 framing.

### IL-S3 — Corridor (CORE LOOP, flashlight + near-black + fog) — STYLE ANCHOR, wide 16:9
[PREPEND STYLE STATEMENT] First-person view down a narrow industrial corridor, chunky low-poly flat-shaded walls of gunmetal (#2B2F36) and cold-steel (#3A4048) ribbed with structural beams, rust-oxide (#6E4A33) bleeding from rivets, low-res affine-warped metal textures swimming on the panels. A single harsh hard-edged flashlight cone from the camera carves a bright wedge down the hall; everything outside the cone falls into thick fog and near-black (#05070A). A faint hazard-amber (#E8A33D) emergency strip and a dim sick-cyan (#9FD0FF) panel glow survive in the gloom; a smear of dried-blood (#4A0C0C) on one wall. Posterized banded lighting, heavy ordered dithering, vertex-snap jitter, slightly low-res crunchy framebuffer. Cold desaturated dread. This is the locked PS1 survival-horror look. Wide 16:9 framing. (Generate this first as the master style anchor.)

### IL-S4 — Command centre, wide 16:9
[PREPEND STYLE STATEMENT] An industrial command centre / bridge in chunky low-poly, hard-edged faceted geometry. Banks of gunmetal (#2B2F36) and cold-steel (#3A4048) consoles with low-res affine-warped readout textures glowing hazard-amber (#E8A33D) and sick-cyan (#9FD0FF); sodium-orange (#C97B3B) overhead lamps throw posterized banded light. Rust-oxide (#6E4A33) corrosion on the support struts, a near-black (#05070A) viewport showing a sparse dithered starfield. One chair knocked over, dried-blood (#4A0C0C) splatter on a console to hint at horror. Cold grim grade, fog softening the back of the room. Keep it low-poly retro PS1, not a clean modern bridge. Wide 16:9 framing.

### IL-S5 — Director-degraded corridor (PEAK DREAD), wide 16:9
[Attach IL-S3 anchor] Using the attached corridor as the exact scene and palette, now show the SAME industrial corridor under heavy Fear-Director degradation: crank the PS1 artifacts to the extreme. Much heavier ordered dithering crawling over everything, aggressive vertex-snap jitter so the geometry visibly shudders and warps, the framebuffer dropped to a crunchier low resolution, harsher posterization with fewer color bands, the affine texture swim made nauseatingly obvious. The flashlight cone flickers and the fog presses much closer, swallowing the walls into near-black (#05070A) just past the camera. Keep the gunmetal/rust-oxide/hazard-amber palette but sicker and more crushed. Maximum retro-horror degradation, still unmistakably the same low-poly corridor. Wide 16:9 framing.

**Consistency note (Iron Lung):** Build IL-S3 first as the anchor. For IL-S1/S2/S4 attach IL-S3 and say "match this exact low-poly render and palette." For IL-S5 attach IL-S3 and ask to degrade the same scene. Re-state the hexes in each prompt so the palette never drifts.

---

## DIRECTION 2 — ANALOG GHOST (70s retro-futurist, CRTs/beige/tape)

**Palette:** beige #C9BBA0, off-white #DAD2BE, amber-CRT #FFB000, oxblood #5C2A2A, avocado #6F7A4B, teak #4A3826, analog-black #0B0C0E, indicator-red #D7352B.

### AG-S1 — Exterior hero, wide 16:9
[PREPEND STYLE STATEMENT] A 1970s retro-futurist space station drifting in the void, chunky low-poly with hard faceted edges. The hull is warm beige (#C9BBA0) and off-white (#DAD2BE) with teak-brown (#4A3826) trim panels, low-res affine-warped textures. Small amber-CRT (#FFB000) window glows and a blinking indicator-red (#D7352B) beacon punctuate the warm pale hull; avocado-green (#6F7A4B) accent stripes on the modules. Surrounding space is analog-black (#0B0C0E) with a sparse dithered starfield. A tiny capsule floats in the foreground for scale. Cold-ish but warm-tinted desaturated grade, posterized banded lighting. Keep the retro PS1 low-poly look, not a sleek modern ship. Wide 16:9 establishing frame.

### AG-S2 — Docking bay interior, wide 16:9
[PREPEND STYLE STATEMENT] A 70s analog docking bay interior in chunky low-poly, visible triangulated panels. Beige (#C9BBA0) and off-white (#DAD2BE) padded walls, teak (#4A3826) wood-grain trim, avocado (#6F7A4B) floor panels, low-res affine-warped textures. Bulky CRT monitors glow amber (#FFB000); reel-to-reel tape units and chunky buttons line a console with a blinking indicator-red (#D7352B) light. Posterized banded lamp pools, analog-black (#0B0C0E) shadows, fog eating the far end. A docked capsule mid-frame for scale. Warm-but-grim desaturated grade, ordered dithering. Stay low-poly retro PS1. Wide 16:9 framing.

### AG-S3 — Corridor (CORE LOOP) — STYLE ANCHOR, wide 16:9
[PREPEND STYLE STATEMENT] First-person view down a narrow 70s retro-futurist corridor, chunky low-poly flat-shaded walls in beige (#C9BBA0) and off-white (#DAD2BE) with teak (#4A3826) trim and avocado (#6F7A4B) carpet-look floor, low-res affine-warped textures swimming on the panels. A single harsh hard-edged flashlight cone from the camera cuts down the hall; beyond it, thick fog and analog-black (#0B0C0E). A recessed amber-CRT (#FFB000) wall monitor flickers and a lone indicator-red (#D7352B) light blinks in the dark. Posterized banded lighting, heavy ordered dithering, vertex-snap jitter, crunchy low-res framebuffer. Cold dread under warm pale surfaces. Locked PS1 survival-horror look. Wide 16:9 framing. (Generate first as master anchor.)

### AG-S4 — Command centre, wide 16:9
[PREPEND STYLE STATEMENT] A 1970s mission-control command centre in chunky low-poly, hard faceted geometry. Walls of beige (#C9BBA0) and off-white (#DAD2BE), teak (#4A3826) console housings, banks of bulky CRT screens glowing amber (#FFB000) with low-res affine-warped readout textures; avocado (#6F7A4B) panel accents and an indicator-red (#D7352B) alarm light. Posterized banded overhead light, analog-black (#0B0C0E) viewport with a sparse dithered starfield. An overturned swivel chair and an oxblood (#5C2A2A) stain hint at horror. Warm-grim desaturated grade, fog at the back. Low-poly retro PS1, not a modern set. Wide 16:9 framing.

### AG-S5 — Director-degraded corridor (PEAK DREAD), wide 16:9
[Attach AG-S3 anchor] Using the attached corridor as the exact scene and palette, now show the SAME 70s corridor under heavy Fear-Director degradation. Push the PS1 artifacts hard: much heavier ordered dithering, violent vertex-snap jitter shuddering the geometry, a crunchier dropped framebuffer resolution, harsher posterization with fewer bands, exaggerated affine texture swim on the beige and teak panels. The amber-CRT screen rolls and tears like a failing analog signal, the flashlight flickers, and fog presses close, drowning the hall in analog-black (#0B0C0E). Keep the beige/teak/avocado/amber palette but sickly and crushed. Maximum retro degradation, still clearly the same corridor. Wide 16:9 framing.

**Consistency note (Analog Ghost):** AG-S3 first as anchor. Attach it for S1/S2/S4 ("match this exact low-poly render and palette") and for S5 (degrade the same scene). Repeat the hexes every time. Lean on the CRT-amber + indicator-red as the recognizable signature colors.

---

## DIRECTION 3 — STERILE WOUND (clean-white body-horror)

**Palette:** clinical-white #EEF1F4, cool-grey #C2C9D0, glacier-cyan #7FE0E6, chrome #D9DEE3, bio-black #0E0B12, blood #8A1220, iridescent #A06CE0 / #46D9B0, amber #F2B33A.

### SW-S1 — Exterior hero, wide 16:9
[PREPEND STYLE STATEMENT] A pristine clinical-white research vessel in the void, chunky low-poly with hard faceted edges. Hull in clinical-white (#EEF1F4), cool-grey (#C2C9D0) and chrome (#D9DEE3), low-res affine-warped panel textures kept clean and sterile. Glacier-cyan (#7FE0E6) running lights and faint amber (#F2B33A) port glows; a thin iridescent purple-to-teal (#A06CE0 / #46D9B0) sheen catches one edge. Surrounding space is bio-black (#0E0B12) with a sparse dithered starfield. A tiny capsule in the foreground for scale. Cold, clean, almost too-bright desaturated grade, posterized banded lighting. Low-poly retro PS1, not a smooth modern hull. Wide 16:9 establishing frame.

### SW-S2 — Docking bay interior, wide 16:9
[PREPEND STYLE STATEMENT] A spotless clinical docking bay in chunky low-poly, visible triangulated white panels. Clinical-white (#EEF1F4) and cool-grey (#C2C9D0) walls, chrome (#D9DEE3) gantry, glacier-cyan (#7FE0E6) light strips, low-res affine-warped textures. Everything sterile and over-lit with posterized banded pools, a faint iridescent (#A06CE0 / #46D9B0) sheen on a sealed door, an amber (#F2B33A) status light. One wrong note: a thin trail of blood (#8A1220) across the white floor. Bio-black (#0E0B12) shadows where the fog eats the far end. Cold clean grim grade, ordered dithering. Stay low-poly retro PS1. Wide 16:9 framing.

### SW-S3 — Corridor (CORE LOOP) — STYLE ANCHOR, wide 16:9
[PREPEND STYLE STATEMENT] First-person view down a narrow clinical-white corridor, chunky low-poly flat-shaded walls in clinical-white (#EEF1F4) and cool-grey (#C2C9D0) with chrome (#D9DEE3) seams, low-res affine-warped textures swimming faintly. A single harsh hard-edged flashlight cone from the camera cuts the hall; beyond it, thick fog and bio-black (#0E0B12) swallow everything. Glacier-cyan (#7FE0E6) light strips flicker, an iridescent (#A06CE0 / #46D9B0) sheen films one wall, and a spreading smear of blood (#8A1220) breaks the sterility. Posterized banded lighting, heavy ordered dithering, vertex-snap jitter, crunchy low-res framebuffer. Cold clinical dread. Locked PS1 survival-horror look. Wide 16:9 framing. (Generate first as master anchor.)

### SW-S4 — Command centre, wide 16:9
[PREPEND STYLE STATEMENT] A clinical-white command centre in chunky low-poly, hard faceted geometry. Clinical-white (#EEF1F4) and cool-grey (#C2C9D0) consoles, chrome (#D9DEE3) fittings, holographic-look readouts glowing glacier-cyan (#7FE0E6) and amber (#F2B33A) with low-res affine-warped textures. An iridescent (#A06CE0 / #46D9B0) sheen on the curved viewport, bio-black (#0E0B12) space beyond with a dithered starfield. A toppled chair and arterial blood (#8A1220) sprayed across a white console signal body-horror. Cold over-lit desaturated grade, fog at the back. Low-poly retro PS1, not a modern clean set. Wide 16:9 framing.

### SW-S5 — Director-degraded corridor (PEAK DREAD), wide 16:9
[Attach SW-S3 anchor] Using the attached corridor as the exact scene and palette, now show the SAME clinical-white corridor under heavy Fear-Director degradation. Push PS1 artifacts to the extreme: much heavier ordered dithering crawling over the white panels, aggressive vertex-snap jitter warping the geometry, crunchier dropped framebuffer resolution, harsher posterization, exaggerated affine texture swim. The clean white now reads sick and grey-green, the glacier-cyan strips strobe, the blood (#8A1220) spreads wider and the iridescent (#A06CE0 / #46D9B0) sheen smears like infection. Flashlight flickers, fog presses close into bio-black (#0E0B12). Maximum retro body-horror degradation, still clearly the same corridor. Wide 16:9 framing.

**Consistency note (Sterile Wound):** SW-S3 first as anchor. Attach for S1/S2/S4 ("match this exact low-poly render and palette") and for S5 (degrade the same scene). Repeat hexes each time. The signature is over-bright white + glacier-cyan with single shocking blood-red accents — keep blood rare so it lands.

---

## DIRECTION 4 — LEVIATHAN BLOOM (bio-organic infested)

**Palette:** resin-black #14100E, fleshy-mauve #5A2E3A, bile-green #6FE07A, membrane-red #7A1B22, chitin #3B3340, spore-cyan #4FD4E0, ichor #C7B25A, wet-sheen #E8D7C0.

### LB-S1 — Exterior hero, wide 16:9
[PREPEND STYLE STATEMENT] A space hulk overtaken by bio-organic growth, drifting in the void, chunky low-poly with hard faceted edges. The original hull is resin-black (#14100E) and chitin-grey (#3B3340), now encrusted with fleshy-mauve (#5A2E3A) growths and membrane-red (#7A1B22) tendrils, low-res affine-warped organic textures. Bile-green (#6FE07A) and spore-cyan (#4FD4E0) bioluminescent patches glow across the infestation; a faint ichor (#C7B25A) and wet-sheen (#E8D7C0) gloss on the swollen masses. Surrounding space is near-black with a sparse dithered starfield. A tiny capsule in the foreground for scale. Cold desaturated grade, posterized banded glow. Low-poly retro PS1, not a smooth modern organic render. Wide 16:9 establishing frame.

### LB-S2 — Docking bay interior, wide 16:9
[PREPEND STYLE STATEMENT] An infested docking bay interior in chunky low-poly, triangulated walls overgrown with biomass. Resin-black (#14100E) and chitin (#3B3340) structure smothered in fleshy-mauve (#5A2E3A) tissue and membrane-red (#7A1B22) veins, low-res affine-warped organic textures. Bile-green (#6FE07A) and spore-cyan (#4FD4E0) bioluminescence throws posterized banded glow; ichor (#C7B25A) drips with a wet-sheen (#E8D7C0) gloss. A half-engulfed docked capsule mid-frame for scale, fog and darkness at the far end. Cold grim grade, ordered dithering. Stay low-poly retro PS1. Wide 16:9 framing.

### LB-S3 — Corridor (CORE LOOP) — STYLE ANCHOR, wide 16:9
[PREPEND STYLE STATEMENT] First-person view down a narrow infested corridor, chunky low-poly flat-shaded walls of resin-black (#14100E) and chitin (#3B3340) overgrown with fleshy-mauve (#5A2E3A) tissue and pulsing membrane-red (#7A1B22) veins, low-res affine-warped organic textures swimming on the surfaces. A single harsh hard-edged flashlight cone from the camera cuts the hall; beyond it, thick fog and near-black swallow everything. Bile-green (#6FE07A) and spore-cyan (#4FD4E0) bioluminescent nodes glow in the dark, ichor (#C7B25A) glistens with wet-sheen (#E8D7C0). Posterized banded lighting, heavy ordered dithering, vertex-snap jitter, crunchy low-res framebuffer. Cold organic dread. Locked PS1 survival-horror look. Wide 16:9 framing. (Generate first as master anchor.)

### LB-S4 — Command centre, wide 16:9
[PREPEND STYLE STATEMENT] An infested command centre in chunky low-poly, hard faceted geometry half-consumed by biomass. Resin-black (#14100E) and chitin (#3B3340) consoles draped in fleshy-mauve (#5A2E3A) growth and membrane-red (#7A1B22) tendrils, surviving screens glowing bile-green (#6FE07A) and spore-cyan (#4FD4E0) through low-res affine-warped textures. Ichor (#C7B25A) pools with wet-sheen (#E8D7C0) gloss; a bio-black viewport beyond shows a dithered starfield. An overgrown chair and ruptured tissue signal the bloom taking the ship. Cold grim desaturated grade, fog at the back. Low-poly retro PS1, not a modern organic set. Wide 16:9 framing.

### LB-S5 — Director-degraded corridor (PEAK DREAD), wide 16:9
[Attach LB-S3 anchor] Using the attached corridor as the exact scene and palette, now show the SAME infested corridor under heavy Fear-Director degradation. Push PS1 artifacts to the extreme: much heavier ordered dithering, aggressive vertex-snap jitter so the fleshy geometry visibly shudders and pulses, crunchier dropped framebuffer resolution, harsher posterization, exaggerated affine texture swim on the biomass. The membrane-red (#7A1B22) veins throb brighter, the bile-green (#6FE07A) and spore-cyan (#4FD4E0) glow strobes sickly, ichor (#C7B25A) runs wet. Flashlight flickers, fog presses close into near-black. Maximum retro bio-horror degradation, still clearly the same corridor. Wide 16:9 framing.

**Consistency note (Leviathan Bloom):** LB-S3 first as anchor. Attach for S1/S2/S4 ("match this exact low-poly render and palette") and for S5 (degrade the same scene). Repeat hexes each time. Signature is membrane-red veins + bile-green/spore-cyan bioluminescence reading through the dark — keep the glow as the eye-catch.

---

## THE CHORUS MONSTER (IP-SAFE, original)

**Critical register rule — woven into every Chorus prompt:** The Chorus is rendered ONE notch MORE grounded and detailed than the low-poly world — a denser mesh with smoother normals, sharper silhouette, and wet translucent fake subsurface-scattering flesh — BUT it is lit by the SAME harsh flashlight cone, the SAME near-black fog, and the SAME cold desaturated grade as the world, so it visibly breaks the register and reads as wrong/scary. It is NOT photoreal and NOT a different art style — just a denser, wetter, smoother creature dropped into the chunky PS1 world.

**Design brief to restate in each Chorus prompt:** A gaunt, tall, wrong-proportioned humanoid, completely EYELESS. Its head is not a face but a sound/echolocation apparatus — translucent ear-membranes and frilled listening flaps fanning out where a face should be. Its throat is a distended RESONATING organ, a swollen speaker-like sac, NOT a mouth. The flesh is wet and translucent with visible subsurface scatter. It holds a tense listening posture, head cocked. Half-formed human cues (a hint of shoulder, a half-hand, a fragment of ribcage) are fused into wrong, broken anatomy. Menacing, instantly readable silhouette. IP-safe original creature — explicitly NOT a Xenomorph and NOT a Necromorph: no biomechanical exoskeleton, no second jaw, no bladed tail, no insectoid limbs, no skull-face.

### M1 — Full-body turnaround sheet (CONSISTENCY MASTER REFERENCE), neutral background
A character-design turnaround reference sheet of an original horror creature called "The Chorus," shown full-body in three views side by side — front, side (profile), and three-quarter back — on a plain neutral mid-grey studio background with flat even lighting so every detail is clearly visible. The creature is a gaunt, very tall, wrong-proportioned humanoid, completely EYELESS. Where a face should be, its head is a sound/echolocation apparatus: translucent ear-membranes and frilled listening flaps fanning outward. Its throat is a distended RESONATING organ — a swollen, speaker-like sac — not a mouth. The flesh is wet and translucent with soft subsurface scattering, pale and sickly. It stands in a tense, head-cocked listening posture. Half-formed human cues — a hint of shoulder, a half-hand, a fragment of exposed ribcage — are fused into broken, wrong anatomy. Sharp, menacing, instantly readable silhouette. Render it as a fairly detailed creature with a smooth, dense mesh and clean clear detail (this is the master reference, so keep it crisp and well-lit, not foggy). IMPORTANT: this is an original IP-safe creature — it must NOT resemble a Xenomorph or a Necromorph; no biomechanical exoskeleton, no second inner jaw, no bladed tail, no insectoid limbs, no skull-face. Wide landscape framing to fit all three views. (This image is your consistency master — attach it to every other Chorus shot and say "same creature as the attached reference.")

### M2 — Hybrid tile (monster in low-poly corridor, flashlight only, half in fog), wide 16:9
[Attach M1 reference] This is the SAME creature as the attached reference — The Chorus. Now place it inside a game scene: a narrow chunky low-poly PS1-era survival-horror corridor (flat-shaded faceted walls, hard polygon edges, low-res affine-warped textures, dithered banded lighting, cold desaturated grade), lit only by a single harsh hard-edged flashlight cone from the first-person camera, with thick fog and near-black swallowing the far end. The creature stands partway down the hall, HALF its body lit by the flashlight and HALF lost in fog. Render the creature ONE notch more grounded and detailed than the chunky world — denser mesh, smoother normals, wet translucent subsurface-scatter flesh, a sharper silhouette — but light it with the SAME flashlight, the SAME fog, and the SAME cold grade as the corridor, so it clearly breaks the register and looks wrong and frightening against the blocky world. Keep it eyeless with the echolocation-membrane head and distended resonating throat. Still IP-safe and original, not a Xenomorph or Necromorph. Wide 16:9 framing.

### M3 — Close detail (resonating throat / face apparatus), portrait-ish 4:5 or square
[Attach M1 reference] A tight close-up of the SAME creature as the attached reference — The Chorus — focused on its head and the distended resonating throat. Show the eyeless head in detail: translucent ear-membranes and frilled listening flaps catching the light, with visible subsurface scatter glowing faintly through the thin wet tissue. Below, the swollen speaker-like resonating throat-sac, taut and veined, clearly an organ for emitting sound, not a mouth. Wet, translucent, sickly flesh. Render the creature with a dense smooth mesh and high detail, but light it with a single harsh flashlight from the side, thick near-black fog behind, and the same cold desaturated PS1-world grade, so it still belongs in the game. Unsettling and grotesque but readable. IP-safe original creature, NOT a Xenomorph or Necromorph, no second jaw, no skull-face. Tall portrait framing (4:5), or square if you prefer.

### M4 — Mid-lunge / mimicking a human shape, wide 16:9
[Attach M1 reference] The SAME creature as the attached reference — The Chorus — caught mid-motion in a chunky low-poly PS1 survival-horror corridor (flat-shaded faceted walls, dithered banding, cold grade), lit by a single harsh flashlight cone with fog and near-black around it. The creature is lunging forward, but its broken body is twisted to MIMIC a human silhouette — for a split second it almost reads as a person standing with arms slightly raised, before the wrong proportions, eyeless membrane-head, and distended resonating throat give it away. Dynamic, threatening pose, head cocked as if it just heard the player. Render it one notch more grounded than the world — denser mesh, smoother normals, wet translucent subsurface-scatter flesh, sharp silhouette — but lit by the same flashlight, fog, and grade so it breaks the register. IP-safe original, NOT a Xenomorph or Necromorph. Wide 16:9 framing.

### M5 — Dismemberment gib beat, wide 16:9
[Attach M1 reference] The SAME creature as the attached reference — The Chorus — in a dismemberment / gib moment inside a chunky low-poly PS1 survival-horror corridor, lit by a single harsh flashlight cone with thick fog and near-black around it, cold desaturated grade. The creature is mid-destruction: a limb and part of the resonating throat-sac blown apart, wet translucent flesh torn open to show stringy subsurface-scatter tissue and dark ichor, chunks (gibs) flying, the frilled membrane-head whipping back. Keep it grotesque but stylized and game-like, not photoreal gore. Render the creature one notch denser and smoother than the chunky world but lit by the same flashlight, fog, and grade so it stays consistent with the other shots. Still the same eyeless, throat-not-mouth, IP-safe original creature — NOT a Xenomorph or Necromorph. Wide 16:9 framing.

**Consistency note (Chorus):** Generate **M1 first** (crisp, well-lit, neutral background) as the master creature reference. Attach M1 to M2/M3/M4/M5 and open each with "same creature as the attached reference." M1 is the only Chorus frame kept clean/sharp — all in-world shots (M2/M4/M5) must restate "light it with the same flashlight, fog and cold grade as the corridor so it breaks the register." If Gemini drifts toward a Xenomorph/Necromorph, add a follow-up: "remove any exoskeleton / second jaw / skull-face — keep the eyeless echolocation-membrane head and speaker-throat." To pin a per-ship blend later, attach BOTH M1 and the chosen direction's S3 anchor and ask Gemini to "place this creature in this world."


## Prompt library — the CHORUS monster

# THE CHORUS — Creature Design Brief (Gemini-native)

## One-line
A gaunt, eyeless, wrong-proportioned humanoid that *listens* instead of seeing — its head is an echolocation organ and its swollen throat is a speaker, not a mouth. It is the one thing in the game rendered **more real than the world around it**.

## Register contract (why it scares)
The whole game is LOW-POLY / PS1-RETRO. The CHORUS deliberately **breaks that register**: it is one notch MORE grounded and detailed than the faceted world — denser mesh, smoother normals, wet translucent fake-subsurface-scatter skin, a sharp clean silhouette — yet it is lit by the **exact same** flashlight cone, near-black fog, and cold grade as the environment. The uncanny gap between a "real" creature and a chunky PS1 world is the horror beat. Never let the creature drift into high-fidelity film-CG; it is still stylized, just *less* stylized than everything else.

## Anatomy (the readable, repeatable cues)
- **Eyeless head** — no eye sockets at all; smooth where a face's upper third should be. Reads as "blind and aimed at sound."
- **Echolocation head apparatus** — translucent ear-membranes and frilled, fan-like listening flaps spread from the skull like a deep-sea creature's sensory frills; backlit they glow faintly.
- **Resonating throat** — a distended, sac-like swollen throat/neck that functions as a SPEAKER, not a mouth. Taut translucent membrane over a darker resonant cavity; this is the focal "money" feature.
- **Wet translucent flesh** — thin skin with visible subsurface scatter; light bleeds pink/amber through membranes, ear-frills, and the throat sac.
- **Wrong proportions** — too tall, elongated limbs, narrow chest, fingers a little too many or too long; joints that bend slightly wrong.
- **Half-formed human cues** — a partial human jawline, a recognizable collarbone, a too-human hand fused into otherwise inhuman anatomy. Just enough humanity to be wrong.
- **Listening posture** — head cocked/tilted, body angled toward sound, weight forward, predatory stillness. Silhouette must read instantly even half-lost in fog.

## Palette / lighting
Lit ONLY by the player flashlight cone against near-black draw-distance fog and a cold grade. Skin desaturated grey-pink with warm subsurface bleed in the thin membranes. No ambient fill — let it fall into black fog at the edges.

## IP-SAFE — what to AVOID (state in plain language in prompts)
This creature must be ORIGINAL. Steer away from:
- **NO Alien / xenomorph** — no smooth black elongated banana-skull, no chrome biomechanical exoskeleton, no second inner pharyngeal jaw, no segmented dorsal back-tubes, no ribbed tail.
- **NO Dead Space / necromorph** — no reanimated-corpse-with-bladed-limbs, no scythe arms, no exposed-rib torso splitting open.
- **NO The Thing / generic gore-tendril blob**, no Slender Man faceless-suit, no Pyramid Head.
- Plain-language steer to paste into prompts: *"original creature, NOT a xenomorph, NOT a necromorph, no biomechanical exoskeleton, no second inner jaw, no bladed scythe limbs, no chrome — it is a wet, blind, listening organism whose head is an ear and whose throat is a speaker."*
- Keep distinctiveness anchored on the THREE signature cues that are not in any famous monster: **eyeless ear-frill head + translucent resonating speaker-throat + listening posture.**

All prompts are **Gemini-native**: natural language, no Midjourney flags (`--sref / --oref / --ar / --no` do NOT exist here). Aspect ratio, references, and edits are done conversationally or via the attach-image controls. Generate **M1 FIRST** — it becomes the reference master you attach to M2–M5.

---

## HYBRID-CONTRACT (paste VERBATIM into M2–M5)
> Render the CREATURE more detailed and grounded — denser mesh, smoother normals, wet translucent skin with subsurface scattering, sharp silhouette — while keeping the ENVIRONMENT low-poly, flat-shaded, faceted PS1; light BOTH with the same flashlight, same near-black fog, same cold grade, so the creature looks like it belongs but is unsettlingly more real than the world.

---

## M1 — Full-body turnaround sheet (THE REFERENCE MASTER) — generate FIRST
> Create a character turnaround reference sheet of an original horror creature on a flat neutral mid-grey studio background, even soft lighting, no fog, no scene — this is a clean consistency reference, not an in-game shot. Show the same creature from FOUR angles in a row: front, three-quarter, side profile, and back.
>
> The creature: a gaunt, too-tall, wrong-proportioned humanoid with elongated limbs and a narrow chest. It is EYELESS — no eyes, no eye sockets, smooth where the upper face should be. Its head is a sound/echolocation apparatus: translucent ear-membranes and frilled, fan-like listening flaps spreading from the skull, faintly backlit and glowing. It has a distended, sac-like RESONATING THROAT — a swollen translucent speaker organ over the neck, NOT a mouth. The flesh is thin, wet, and translucent with subsurface scattering, light bleeding pink and amber through the ear-frills and throat. Half-formed human cues are fused into wrong anatomy: a partial human jawline, a recognizable collarbone, a too-human hand, joints that bend slightly wrong. Posture is a tense, head-cocked LISTENING stance.
>
> Style: stylized but more grounded than a low-poly game — denser mesh, smoother normals, a sharp clear silhouette. Desaturated grey-pink skin, cold grade.
>
> IP-SAFE: original creature, NOT a xenomorph, NOT a necromorph, no biomechanical exoskeleton, no chrome, no second inner jaw, no bladed scythe limbs, no dorsal back-tubes, no ribbed tail. It is a wet, blind, listening organism whose head is an ear and whose throat is a speaker.
>
> Wide 16:9 sheet, full body visible head to feet in every pose.

---

## M2 — Hybrid tile (creature in a low-poly corridor, flashlight only, half in fog)
*(Attach M1 as reference 1; attach the chosen direction's S3 corridor frame as reference 2.)*
> Using the attached references: place THE SAME CREATURE from the first reference image into THE SAME corridor, world, and lighting as the second reference image. Keep the creature identical to its reference — eyeless ear-frilled head, swollen translucent resonating throat, wet subsurface-scatter skin, wrong proportions, listening posture.
>
> Compose it as an in-game horror frame: the creature stands mid-corridor, lit ONLY by the player's flashlight cone, the rest of the corridor falling into near-black draw-distance fog. The creature is HALF IN FOG — head and throat catching the flashlight, lower body dissolving into black. Cold grade. Tense, quiet, predatory.
>
> Render the CREATURE more detailed and grounded — denser mesh, smoother normals, wet translucent skin with subsurface scattering, sharp silhouette — while keeping the ENVIRONMENT low-poly, flat-shaded, faceted PS1; light BOTH with the same flashlight, same near-black fog, same cold grade, so the creature looks like it belongs but is unsettlingly more real than the world.
>
> IP-SAFE: original creature, NOT a xenomorph or necromorph, no biomechanical exoskeleton, no chrome, no second jaw, no bladed limbs. Wide 16:9.

---

## M3 — Close detail: resonating throat / face
*(Attach M1 as reference.)*
> Using the attached reference, render an extreme close-up of THE SAME CREATURE's head and throat. Fill the frame with the distended translucent RESONATING THROAT — a taut membrane stretched over a darker resonant cavity, a speaker organ, NOT a mouth — and the lower edge of the eyeless head with its frilled translucent listening flaps above. Show the wet subsurface scatter: light bleeding pink and amber through the thin membranes, faint veining, a wet sheen, the throat sac mid-resonance as if vibrating.
>
> Lit only by a hard flashlight from one side against near-black fog, cold grade, shallow focus. Visceral and intimate but not gory.
>
> The creature stays more grounded and detailed than a low-poly world — denser mesh, smooth wet normals, sharp silhouette.
>
> IP-SAFE: original, NOT a xenomorph, NO second inner pharyngeal jaw, no chrome biomechanics — it is a blind ear-headed organism whose throat is a speaker. Vertical or square framing.

---

## M4 — Mid-lunge / mimicking a human shape
*(Attach M1 as reference; optionally attach the chosen direction's corridor frame as reference 2.)*
> Using the attached reference(s), show THE SAME CREATURE caught mid-motion — a sudden lunge forward — its body briefly contorted to MIMIC a human silhouette: for an instant it almost reads as a person reaching out, the half-formed human jaw and too-human hand thrown into the flashlight, before the wrong proportions, eyeless ear-frilled head, and swollen resonating throat betray it. Motion blur on the limbs, weight pitched toward the camera, the listening head snapped toward the viewer.
>
> Lit only by the flashlight cone against near-black fog, cold grade. Terrifying, kinetic, a jump-scare frame.
>
> Render the CREATURE more detailed and grounded — denser mesh, smoother normals, wet translucent skin with subsurface scattering, sharp silhouette — while keeping the ENVIRONMENT low-poly, flat-shaded, faceted PS1; light BOTH with the same flashlight, same near-black fog, same cold grade, so the creature looks like it belongs but is unsettlingly more real than the world.
>
> IP-SAFE: original creature, NOT a xenomorph or necromorph, no scythe arms, no exoskeleton, no chrome. Wide 16:9.

---

## M5 — Low-poly dismemberment gib beat
*(Attach M1 as reference.)*
> Using the attached reference, show THE SAME CREATURE being dismembered — a combat gib beat. A limb or the head-throat has been blown off; separating chunks read partly as the creature's grounded wet flesh and partly as faceted low-poly gib shards mid-flight, a deliberate clash of fidelities. Translucent throat membrane ruptured, subsurface-scatter flesh exposed, ichor as chunky low-poly droplets. Stylized and punchy rather than realistic gore.
>
> Lit only by the flashlight cone against near-black fog, cold grade, the gibs catching the light as they scatter into the dark.
>
> Render the CREATURE's intact flesh more detailed and grounded — denser mesh, smoother normals, wet translucent skin with subsurface scattering — while the GIBS and ENVIRONMENT break into low-poly, flat-shaded, faceted PS1 shards; light BOTH with the same flashlight, same near-black fog, same cold grade, so the creature looks like it belongs but is unsettlingly more real than the world.
>
> IP-SAFE: original creature, NOT a xenomorph or necromorph, no exoskeleton, no chrome. Wide 16:9.

---

## CONSISTENCY WORKFLOW ON GEMINI (step by step)

1. **Generate M1 first.** Run the M1 prompt cold (no references). Iterate conversationally until the turnaround locks the three signature cues — *eyeless ear-frill head, translucent resonating throat, listening posture.* Multi-turn edit examples: *"keep everything the same but make the throat sac larger and more translucent,"* *"same creature, remove the eye sockets entirely, smoother where the upper face is."* Save the winning M1 image. **This is your reference master.**

2. **For M2–M5, attach M1 as the FIRST reference image** and open the prompt with: *"Using the attached reference image, this is the SAME CREATURE — keep its anatomy identical to the reference: eyeless ear-frilled head, swollen translucent resonating throat, wet subsurface-scatter skin, wrong proportions, listening posture."*

3. **For M2 and M4 (in-world shots), ALSO attach the chosen direction's S3 corridor frame as a SECOND reference image** and add: *"Place this same creature into this same world and lighting from the second reference image — match its corridor geometry, flashlight, near-black fog, and cold colour grade."* This is the multi-image blend: reference 1 = WHO, reference 2 = WHERE.

4. **Always paste the HYBRID-CONTRACT block verbatim** into M2–M5 so the fidelity split (grounded creature vs PS1 world, one shared light) is explicit every time.

5. **Per-ship blend:** to test a direction, swap only the second (corridor) reference image to that direction's S3 frame while keeping M1 as reference 1 — the creature stays identical, the world changes, giving a clean comparable set across IRON LUNG / ANALOG GHOST / STERILE WOUND / LEVIATHAN BLOOM.

6. **If consistency drifts** between shots, re-attach BOTH the latest good frame and M1 and say: *"match the creature to these reference images exactly — same proportions, same head, same throat."* Re-grounding on M1 every few turns prevents the creature from slowly mutating.

7. **Aspect ratio / framing on Gemini** is requested in plain words inside the prompt (e.g. *"wide 16:9 cinematic frame,"* *"vertical close-up"*) or set via the app's aspect-ratio control — there are no `--ar` flags.


## Pipeline

1. **Anchor pass (Pro):** mint the 4 style anchors (S3 per direction) + the CHORUS master (M1). Save them.
2. **Reference + batch (NB2):** for every other frame, attach the relevant anchor/master and instruct
   "match this exact style/palette / same creature." Keep references attached so style + identity don't drift.
3. **Conversational fixes:** in the same AI Studio thread (or `previous_interaction_id` via the API), refine
   by plain language ("darker, more fog, push the dither, move the monster left").
4. **Per-ship blends (Gemini's strength):** attach TWO direction anchors + "blend: hull like ref A, infestation
   like ref B" — one prompt, no flags.
5. **Promote + export:** re-render keepers on Pro at 2K/4K (native — no external upscaler needed; Magnific/Topaz
   only if you want extra crunch).
6. **Paintover (optional):** Photoshop for flashlight cone, fog falloff, cold-grade LUT, annotations.
7. **Hand-off to M-LOOK:** the chosen frames + the verbatim STYLE BLOCK + palette hexes + the CHORUS master
   become the canonical "look bible" M-LOOK rebuilds toward in-engine.


## Recording the decision (→ ART-DIRECTION.md)

Once a direction (or per-ship blend) is chosen, write into `docs/ART-DIRECTION.md`:
1. **Chosen direction** — name, or blend spec (e.g. "Iron Lung hull + Leviathan Bloom infestation ~70/30,
   which ships use which").
2. **Why** — 1–2 lines on the read that won (mood, gore-contrast, monster legibility, distinctiveness).
3. **Locked palette** — the chosen direction's hex set, verbatim, flagged canonical.
4. **Canonical reference frames** — file paths/URLs of the approved hero frames (S1/S3/S5 + CHORUS M1/M2).
   *On Gemini these ARE the style lock* (there's no `--sref` code) — they get re-attached for all future art.
5. **The verbatim STYLE BLOCK + AVOID CLAUSE** used to make them (so any new frame reproduces the look).
6. **Register note (restate):** low-poly/PS1 clean-base + Director-ramped grit; CHORUS = one notch more
   grounded (mesh density + wet SSS + silhouette only), SAME light/fog/grade.


## What you need to supply

- Aspect ratios are stated in words (Gemini honors plain-language framing but does not guarantee exact pixel ratios the way Midjourney's --ar does); if exact 16:9 output is required, plan to crop/outpaint in post or specify output dimensions in the Gemini UI where available.
- Gemini reference-image consistency is strong but not perfect across many turns — expect to re-anchor (re-attach S3 / M1) every few generations and to nudge the palette back with the hex list if it drifts.
- Per-ship monster blends (Chorus tinted toward each direction's palette) are noted as a follow-up workflow but not written as standalone prompts — confirm whether you want all 4 blended Chorus variants authored in full.
- Which of the 4 directions (or which per-ship blend) should M2/M4 be rendered against first — or should all 4 corridor frames be run as a comparable set?
- Should the resonating throat be capable of MIMICKING crewmates' voices (a sound-bait mechanic)? If so, M4's 'mimicking a human shape' could pair with an audio design note.
- Do you want an M1 variant on a pure-black fog background as a second reference master for the in-fog shots, in case neutral-grey M1 bleeds the wrong ambient into M2/M5?
- How much human-cue legibility is wanted — a clearly recognizable human jaw/hand (more uncanny, slightly more 'reanimated corpse' risk) vs. only faint hints (safer, more alien)?