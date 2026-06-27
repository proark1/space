# Campaign Structure — Ships Are The Maps

**Verdict:** Adopt "ships are the maps": each ship is one self-contained 18–25 min level; the campaign is a sequence of ships strung together by short on-rails capsule transits (no walkable hub — reuse the existing Earth-launch tech). Build SHIP 1 as the whole first product, and move the COMMS-RESTORE signature climax INTO Ship 1's command centre as a self-contained payoff (Ship 1 restores its own local transmitter; later ships escalate toward a deep-space relay). Recommend a campaign-progress model with a small persistent meta-loadout, NOT a hardcore roguelite — wipes cost the ship attempt, not your account. Inter-ship boundaries become the natural checkpoint + host-migration safe points, which the existing warm-standby snapshot design already supports. Ship-as-map cleanly converts each ship into a content-cadence drop and an NG+/seed-modifier target.

## 1. Reframe: ship = map, campaign = sequence of ships

The earlier model was ONE ship of "5 escalating sections → command centre → COMMS-RESTORE." The new model promotes each former *section* to a full **ship/level**:

```
MAIN MENU → LOBBY (room code, 1–4)
  → EARTH LAUNCH (on-rails capsule cinematic, masks first load, tutorial-by-fiction)
  → DOCK SHIP 1 ─ traverse zones ─ command centre ─ OBJECTIVE COMPLETE
  → CAPSULE TRANSIT (short on-rails interstitial; checkpoint + host-migration safe point)
  → DOCK SHIP 2 ─ … ─ command centre
  → … → FINAL SHIP (deep-space relay climax) → EXTRACTION / WIN
```

A **ship** is the unit of: one streamed level GLB set, one theme/biome, one navmesh, one composition-plan music set, one Director tension arc (BUILD→PEAK→RELAX→…→CLIMAX), and one command-centre objective. This maps 1:1 onto the existing `mapId` already in JOIN_ACCEPT and the per-zone audio/lightmap architecture — **no engine concept changes, only level packaging**.

### Inter-ship travel — mechanic + fiction
**Recommendation: the capsule, again — a short on-rails transit, NOT a walkable hub.**

- **Fiction:** the crew's escape capsules tractor-tether to the derelict; on clearing a ship's command centre they "leech" its nav data / a fragment of the lost signal, undock, and burn to the next contact. Each ship is a stepping-stone deeper into a dead fleet/graveyard drifting toward the source of the silence.
- **Mechanic:** reuse the **Earth-launch on-rails capsule tech** verbatim as the transit interstitial. It is the single best-leveraged asset: it (a) masks streaming the next ship GLB + audio pack, (b) is a guaranteed authored lull (Director hard-suppressed — protects the silence budget), (c) is the checkpoint commit point, and (d) is the host-migration window. Transits are 20–40s, escalating in dread (debris fields, a corpse capsule, a brush with something in ship N+1's hull before you dock).
- **Rejected — walkable hub ship:** a persistent social/upgrade hub (Deep Rock's Space Rig) is appealing for meta-progression but is a whole extra authored level, extra netcode states, and dilutes the "one-way descent into the dark" pillar. Defer to a possible later milestone; v1 does loadout selection on the **lobby/debrief screens** (DOM, no 3D cost). The capsule interior can later become a *minimal* between-ship loadout view if wanted, but not for the single-ship MVP.

## 2. Single-ship MVP — what Ship 1 contains

Ship 1 IS the first product. It must stand alone, be fun, and contain the signature moment. Target **18–25 min** for a 1–4 crew.

**Zones within Ship 1 (former "sections," now intra-ship):** 4–5 connected zones on one critical path, each a reverb/fog/lightmap region with its own Director sub-arc. Reuse the existing zone/section machinery — only the naming changes (zones live *inside* a ship now).

| Zone | Beat | Purpose |
|---|---|---|
| **Z1 Docking bay** | quiet, orient | airlock slam, first light, teach flashlight/Resolve by fiction |
| **Z2 Habitation/corridors** | first contact | Stalker introduced; sound-detection lesson; one safe room (checkpoint) |
| **Z3 Engineering / power** | rising | restore power objective → telegraphed PEAK (Swarmer vent wave); the M4 spike lives here |
| **Z4 Maintenance/cargo** | loud→quiet whiplash | second safe room; the forced lull; Brute/ambush variety later |
| **Z5 Command centre** | CLIMAX | the COMMS-RESTORE moment |

### Where the signature climax lives — RESOLVED
**COMMS-RESTORE lives in EVERY ship's command centre, escalating in scope. Ship 1 restores its OWN local transmitter.**

Rationale: the climax is the product thesis and the marketing hook — it cannot wait for a "final ship" that doesn't exist when MVP ships. So each ship's command-centre objective is a **comms-restore variant** with rising stakes:

- **Ship 1:** restore *this ship's* short-range transmitter → broadcast the crew's live terrified voices to Earth as proof-of-life. Self-contained, fully satisfying, viral. (This is exactly the M6 "COMMS-RESTORE climax" from DESIGN §4, now scoped to Ship 1.)
- **Ship N (mid-campaign):** restore a relay/repeater that re-lights the *next* ship's beacon (diegetic justification for the next transit).
- **FINAL ship:** the deep-space master relay — the full signal home, biggest crescendo, campaign payoff.

This protects the "ONE big crescendo, no diluted mini-finales" rule (DESIGN §17.7) **within each ship** (each ship has exactly one command-centre crescendo) while giving the *campaign* an escalating throughline. Ship 1's climax is built to the full M6 spec; later ships reskin/escalate the same restore mechanic.

**MVP boss:** Ship 1 ends on a contained command-centre setpiece (the Maw or a lighter "gatekeeper") guarding the transmitter — optional for the first fun-proof; can ship as a hold-out wave first, boss later.

## 3. Longevity — ships as the content cadence

- **Cadence unit = one ship.** Post-launch content drops are "a new ship": one biome, one kit reskin/extension, one music composition-plan set, one navmesh, 1 new enemy or apex-behavior twist, one command-centre objective variant. This is a clean, estimable, marketable unit ("Ship 4: the Reactor Hauler" as a content beat / Steam update).
- **Pipeline already supports it:** levels are hand-assembled from the modular trim kit (DESIGN §11); a new ship is mostly new layout + a reskinned trim/atlas set + new lightmap bake + new composition plan, all on the existing `LevelDoc`/`mapId` rails. No new systems per ship.
- **Replay layer (day-one, DESIGN §7) applies PER-SHIP and ACROSS:**
  - **Difficulty tiers** — selected per run; scale Director density, ammo/battery scarcity, apex aggression. Each ship has tier-tuned spawn tables.
  - **Seed modifiers / weekly seed** — `roomSeed` (already exchanged at lobby) drives Director randomization: spawn mix, apex behavior, lighting failures, objective order, audio variant. A *known* ship threatens differently each run — extends each ship's life before new ships exist.
  - **NG+** — instead of "recombining 5 sections of one ship," NG+ now **recombines the SHIP ORDER** and stacks modifiers (e.g. shuffled ship sequence, "dark+" lighting, faster apex, scarcer light). With 1 ship, NG+ = harder seed + modifier stack on the same ship; with N ships, NG+ = shuffled/curated ship playlists. Cleaner and more scalable than section-recombination.
  - **Curated "expeditions"** (later): a fixed playlist of 2–3 ships back-to-back as a longer run, gated by difficulty.

## 4. Persistence — RESOLVED: campaign-progress + light persistent meta, NOT hardcore roguelite

**Recommendation:**
- **Within a run (across ships in one sitting):** you KEEP gear, ammo, battery, Resolve state across the capsule transit — a wipe on Ship N does NOT confiscate your account; it ends *that run*. Transits restock to a tuned baseline (small heal/refill at the safe transit) so the next ship starts winnable but not trivial. This preserves co-op horror tension (scarcity within a ship) without roguelite punishment that friend-groups bounce off (DESIGN §17.1, §17.4).
- **Persistent meta (account-level, between separate sessions):** cosmetics, loadout unlocks, and lore/log fragments — granted the **instant a ship is cleared** (matches the existing "grant meta-progression the moment a section clears" rule, §14/§17.1, now "the moment a ship clears"). A host drop or wipe never zeroes earned meta.
- **Campaign checkpointing:** clearing a ship records campaign progress so a crew can resume the campaign at the next ship in a later session (host stores it; replicated on lobby). For the single-ship MVP this is trivially "Ship 1 cleared."
- **Rejected — full roguelite (lose-all-on-wipe, permadeath of gear):** wrong for a friends-only co-op horror campaign; the run-fragility research (§17.1) explicitly flags time-theft as the #1 retention killer. Offer a hardcore/permadeath modifier as an **opt-in replay tier**, not the default.

## 5. Interaction with checkpoints + host migration

Ship boundaries (the capsule transit) are the **natural safe points** — this is the biggest structural win of the restructure:

- **Checkpoint commit** happens at each command-centre clear / transit start: persist meta, snapshot campaign progress, restock baseline. Intra-ship there are 1–2 safe-room soft checkpoints (Z2, Z4) for shorter resumes within a ship.
- **Host migration** (DESIGN §9, §15.9; netcode §9): the existing **warm-standby full snapshot** (transforms, hp, objective/door/inventory state, Director phase, RNG seed+counter — already specified) is the migration payload. The capsule transit is the **ideal migration window**: state is small and quiescent (no live combat, Director suppressed), so "host transfers to the next player in line" during a transit is near-seamless behind the existing diegetic "comms reacquiring" freeze.
- **Host-leaves → next player in line:** confirmed feasible. Deterministic successor = lowest surviving peer-id (already the design's tiebreaker). Mid-ship migration resumes from the **last safe-room/ship checkpoint** (target = checkpoint-resume, not bit-perfect mid-fight handoff, per §9). Between-ship migration is the seamless case. `MsgType.MIGRATE` and the warm-standby flag are already reserved in the wire format — no protocol change, just implementation (M6).
- **Net result:** the restructure makes host migration *easier*, because ship boundaries give frequent, low-state, combat-free handoff windows instead of one long uninterrupted descent.

## 6. Ship archetypes (3–4 biomes for variety)

Each shares the 3-material trim kit but gets a reskinned atlas + lighting/audio identity + a signature threat. (Ship 1 = the Cargo Hauler — the cheapest, most readable first build.)

1. **Cargo Hauler (SHIP 1, the MVP)** — industrial corridors, container bays, exposed pipework, failing fluorescents. Tight readable spaces, vents everywhere (Swarmer-friendly). Cheapest to build from the Kenney-derived kit. Signature: the Stalker in the dark + a vent swarm at the power objective. *This proves the fun.*
2. **Research Vessel** — cleaner labs, glass, quarantine bulkheads, cryo bays; the "what went wrong here" lore ship. Brighter→corrupted lighting failures. Signature: a contained outbreak / Hive node objective; Spitter pressure in long sightline labs.
3. **Military Cruiser** — armored bulkheads, blast doors, armory (ammo risk/reward), an active-but-hostile ship AI. Harder combat, more apex aggression. Signature: the Brute / boss arena; sealed sections you must power to pass.
4. **Alien-Infested Wreck** — the most transformed: biomass over the hull, organic growths, broken gravity, near-total dark. Highest dread, fewest safe lights. Signature: ambusher/wall-crawler heavy; the deepest, scariest ship → natural FINAL-ship candidate for the deep-space-relay climax.

Build order: 1 (prove fun) → 2 → 3 → 4 as content cadence, with the final-campaign relay climax landing on the Wreck.

## Tasks

- **Rewrite DESIGN §2/§4 to 'ships are the maps' + capsule-transit model** — _done when:_ DESIGN.md §2 (The Run) and §4 (Signature Moment) updated so each ship is a self-contained 18–25 min level, the campaign is a ship sequence joined by on-rails capsule transits (no walkable hub), and COMMS-RESTORE is defined as a per-ship escalating command-centre objective with Ship 1 restoring its own transmitter. Old '5 sections of one ship' framing removed; 'section' renamed to intra-ship 'zone'.
- **Author Ship 1 (Cargo Hauler) zone map + Director arc as the MVP level** — _done when:_ A LevelDoc/spec for Ship 1 with 4–5 zones (docking bay → habitation → engineering/power → maintenance/cargo → command centre), each with reverb/fog/lightmap region + Director sub-arc, two safe-room soft checkpoints, and a command-centre COMMS-RESTORE objective. Targets 18–25 min for 1–4 players and maps onto existing LevelDoc/mapId rails with no new engine systems.
- **Specify capsule-transit interstitial as checkpoint + streaming + migration window** — _done when:_ A spec section defining the inter-ship capsule transit reusing Earth-launch on-rails tech: 20–40s, Director hard-suppressed (authored lull), masks next-ship GLB+audio streaming, commits the checkpoint (persist meta + campaign progress + baseline restock), and serves as the host-migration window using the existing warm-standby snapshot. No new netcode message types required (MIGRATE/warm-standby already reserved).
- **Define persistence + checkpoint model (campaign-progress, not roguelite)** — _done when:_ Documented decision: gear/ammo/battery/Resolve carry across transits within a run with tuned baseline restock; cosmetics/loadout/lore granted the instant a ship clears; campaign progress persisted so a crew resumes at the next ship; wipe ends the run only, never zeroes account meta; hardcore/permadeath offered as an opt-in replay tier. Updates DESIGN §15 decision #4 and §17.1.
- **Map replay layer (tiers/seed-mods/NG+) onto per-ship and across-ship** — _done when:_ Spec defines difficulty tiers and seed modifiers as per-ship Director-randomization (spawn mix/apex/lighting/objective order/audio via roomSeed) and redefines NG+ as ship-order shuffle + stacked modifiers (replacing section-recombination). Includes the single-ship NG+ degenerate case (harder seed/modifier stack on Ship 1) and a later curated multi-ship 'expedition' playlist.
- **Sketch 4 ship archetypes + content-cadence build order** — _done when:_ Documented archetypes (Cargo Hauler=Ship1 MVP, Research Vessel, Military Cruiser, Alien-Infested Wreck) each with biome, lighting/audio identity, signature threat, and shared-trim-kit reskin approach; build order 1→2→3→4 with the deep-space-relay campaign climax assigned to the Wreck as final ship; each ship framed as one estimable content-drop unit.