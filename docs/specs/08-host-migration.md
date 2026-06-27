# Host Migration — Successor Takeover Design

**Verdict:** YES, it's feasible and you should build it — but design it as a checkpoint-anchored "comms reacquiring" freeze (2-6 s), NOT seamless mid-firefight handoff. The host streams warm-standby authoritative snapshots to all peers every few seconds; on host-drop a deterministic successor promotes, re-brokers the room code via the PartyServer signaling worker, peers re-handshake, and the run resumes from the last snapshot. Enemy AI/physics resume (not bit-for-bit continue), which is acceptable horror co-op. For v1, ship migration that is GUARANTEED only at checkpoints/between-ships and best-effort mid-level; that is enough to keep runs alive and is the right cut line. The non-negotiable thing to architect NOW is a fully serializable world state (bitECS components + a small "sim state" sidecar) so any peer can reconstruct the world — retrofitting that later is the expensive trap the research warns about.

## Verdict & framing

Host migration is the single feature that, done wrong, "kills the session end to end" (Edgegap), and the research graveyard is full of teams that tried for seamless mid-action handoff and abandoned it. Our advantage: we are **host-authoritative on a star topology with a deterministic ECS world that already needs to be serializable for late-join**, and we have a **diegetic alibi** — a horror game can legitimately freeze the world as "signal interference / comms reacquiring." So we lean into a **warm-standby snapshot + brief freeze** model rather than chasing seamlessness.

Core principle: **migration is a controlled re-host of the room from the last good snapshot, not a live continuation.** We optimize for "the run survives and feels intentional," not "nobody noticed."

---

## 1. Topology & roles (what exists today, what migration adds)

- **Star, host-authoritative.** Host runs the authoritative bitECS sim + Rapier step; peers send input intents, receive state deltas. (Locked stack — unchanged.)
- **Signaling**: PartyServer (Cloudflare Durable Object per room code) brokers WebRTC offers/answers; TURN for relay. The room code maps to a DO; **the DO is the migration anchor** — it survives any single peer dropping and knows the full roster + current host.
- New per-peer metadata held in the DO: `peerId` (stable, assigned at join, monotonic), `joinOrder`, last-measured `rttToHost`, `snapshotVersion` last ACKed, `capabilityScore` (CPU/GPU class self-reported + whether they can sustain host send rate).

### Successor election (deterministic, pre-agreed)
Successor is decided **continuously and in advance**, so there's no election round-trip at the worst moment.
- Primary key: **lowest `joinOrder`** among peers that (a) have `snapshotVersion >= host_current - 1` and (b) pass a `capabilityScore` floor. ("Next player in line" = next-oldest join, which the user asked for.)
- Tiebreak / disqualify: drop anyone whose recent snapshot ACK latency or RTT is in the bottom tier → avoids promoting "the new host is also weak."
- The DO recomputes and **stamps the current `successorId` into every snapshot header**, so all peers already agree who's next before anything fails. No consensus protocol needed — the host (authority) decides, the DO records it, peers cache it.

---

## 2. The warm-standby snapshot stream

Every peer is a **warm standby**: it continuously holds enough state to become host.

**Two cadences:**
- **Keyframe (full world snapshot)**: every **3-5 s**, host serializes the entire authoritative world and sends to all peers (or at minimum to the current `successorId` + 1 backup, broadcast to all if bandwidth allows). This is the migration baseline.
- **Delta (gameplay state)**: the normal per-tick netcode deltas (positions, health, fired shots) — these already flow for rendering remote state. Between keyframes, a promoting successor reconstructs from `lastKeyframe + applied deltas it received`.

**Snapshot contents (the migration payload):**
| Category | What | Notes |
|---|---|---|
| ECS entities | All bitECS component arrays for networked entities (Transform, Velocity, Health, EnemyType, Inventory, DoorState, PickupState…) | Serialized as typed-array blocks — bitECS makes this compact and fast |
| Enemy AI state | Per-enemy FSM/behavior-tree node, target ref, aggro/search timers, patrol index, last-known-player-pos | Resumes approximately, not bit-for-bit (see §4) |
| Director state | Tension level, spawn budget, cooldowns, scripted-beat progress, RNG seed + stream position | Single most important non-entity blob for "the level keeps making sense" |
| Objectives | Objective graph state, completed flags, current ship/section, key-item locations | Drives the run |
| Inventory/loadout | Per-player items, ammo, health, equipped tools | Player-visible; must be exact |
| Checkpoint progress | Last reached checkpoint id, unlocked doors, consumed pickups | Defines fallback rollback target |
| Header | `snapshotVersion`, `tick`, `successorId`, `roomCode`, `rngSeed`, `shipId/sectionId`, list of player entity ↔ peerId bindings | |

**Size & frequency reality check:** a single derelict-ship level with, say, 30-80 active networked entities + director + inventories serializes to **tens of KB, low hundreds of KB worst case** (typed arrays, not JSON; consider a fast binary pack like a hand-rolled DataView writer, not msgpack-of-objects). At a 3-5 s keyframe cadence that's trivial bandwidth (a few KB/s extra) and well within WebRTC DataChannel capacity. **Send keyframes on the reliable-ordered DataChannel**; deltas stay on the unreliable channel.

**ACK protocol:** each peer ACKs `snapshotVersion` on receipt. The host won't nominate a successor that hasn't ACKed a recent keyframe. This guarantees the successor can actually reconstruct.

---

## 3. The migration sequence (host drop → resumed run)

**Detection:** host departure is either (a) graceful — host sends `HOST_LEAVING` before closing — or (b) ungraceful — peers + DO detect via WebRTC connection-state `failed`/`disconnected` + missed heartbeats (host heartbeats every ~500 ms; trip after ~2-3 s of silence to avoid false positives on a lag spike).

**Sequence:**
1. **Freeze + diegetic mask.** All peers immediately enter `COMMS_LOST` state: input frozen, sim paused, screen shows interference/static + audio cue ("signal lost… reacquiring crew uplink"). This is the UX alibi for the next few seconds.
2. **Successor self-promotes.** The cached `successorId` peer checks "am I the successor?" — no election round-trip needed. It loads its last keyframe + buffered deltas, instantiates the authoritative sim (becomes the Rapier/bitECS authority).
3. **Re-broker via DO.** Successor tells the PartyServer DO "I am the new host for `roomCode`." DO updates host binding, **keeps the same room code**, and notifies remaining peers. (Room code stability matters: the dropped player can rejoin with the same code.)
4. **Peers re-handshake.** Remaining peers tear down the dead host connection and open new WebRTC connections to the new host (ICE/TURN as needed). They send their `snapshotVersion` so the host can sanity-check everyone is on the same baseline; host may re-send a fresh keyframe to fully resync.
5. **Resume.** Host rebinds player-entity ↔ peerId, advances RNG from the stored seed/position, un-freezes. Peers exit `COMMS_LOST`, get a "uplink restored" cue, control returns.

**Target freeze window: 2-6 s.** Dominated by ICE re-negotiation (the variable part — TURN relay path is slower than direct). If we keep **standby DataChannels or at least cached ICE candidates** between peers, we can shave reconnection time.

**Pre-warming optimization (later):** maintain a **dormant mesh** — peers hold pre-negotiated (but idle) DataChannels to the `successorId`, so on promotion the channel is already open and step 4 is near-instant. This is the single biggest lever to push the freeze toward ~1-2 s. Architect the DataChannel layer to allow N connections per peer even if only host links are active in v1.

---

## 4. Determinism caveats & fairness

We are **not** doing lockstep/deterministic-rollback continuation. The new host **resumes from a snapshot**, so:

- **Enemy AI** resumes from serialized FSM state, not mid-animation/mid-attack frame. An alien mid-lunge may "reset" to its decision node and re-evaluate. Acceptable, occasionally even helpful (no cheap deaths from a frozen-frame attack landing).
- **Physics**: Rapier is deterministic given identical inputs/seed/step order, but we are **not** replaying — we re-instantiate from snapshot transforms+velocities. Ragdolls, thrown objects, debris settle slightly differently. Cosmetic; nobody can tell in a dark horror ship.
- **RNG**: we store the seed **and stream position**, so loot/spawn rolls stay coherent — critical so the director doesn't re-roll already-decided outcomes.
- **Fairness rule — snap to the player's advantage at the seam.** On resume, briefly (~1-2 s) make players **invulnerable / enemies non-aggressive** ("reacquiring") so the freeze never causes a death the player couldn't react to. Migration must never kill you. Also: an in-flight projectile or a damage event that was "in the air" at freeze time is **discarded**, not replayed — better to drop a hit than to apply a hit the victim couldn't see coming.

**Net:** the run is *consistent* (same objectives, inventory, progress, director intent) even if not *bit-identical*. For co-op horror that's the correct trade.

---

## 5. Where it's safe vs hard

| Situation | Migration quality | Policy |
|---|---|---|
| Between ships / after a level | **Trivial & guaranteed** | Full resync, no time pressure, no enemies. v1 must nail this. |
| At a checkpoint (safe room, objective complete) | **Safe & guaranteed** | Resume exactly at checkpoint state. |
| Mid-exploration (no combat) | **Good** | Warm snapshot resume, short freeze, fine. |
| **Mid-firefight** | **Hard / best-effort** | Freeze + invuln seam + AI re-evaluate. Will feel like a hitch; we mask it diegetically. Accept some jank; never lose the run. |
| Mid-scripted-setpiece | **Hard** | Snapshot the setpiece's progress flag; resume re-enters the beat from its last sub-state. Author setpieces as resumable state machines, not as fire-and-forget timelines. |

**Fallback when warm resume is impossible** (no peer has a valid recent keyframe, e.g. successor just joined): **roll back to last checkpoint.** Lose a few minutes, keep the run. This is the safety net that makes the whole feature shippable.

---

## 6. Failure cases

- **Simultaneous drops (host + successor):** DO still holds the roster + the *next* successor in line, and that peer's last ACKed `snapshotVersion`. If the next-in-line has a valid keyframe → promote it. If nobody has a valid recent keyframe → **rollback-to-checkpoint** re-host. The DO is the source of truth that survives multi-peer loss.
- **New host also weak:** prevented up front by the `capabilityScore` floor + RTT disqualification in election. If a promoted host *then* degrades, it's just a normal-quality issue (everyone laggy) — not a migration event; we don't chain-migrate on lag, only on disconnect, to avoid thrash.
- **Total mesh collapse / everyone behind bad NAT:** TURN relay is mandatory fallback; if even the DO can't re-broker any pair, the session ends gracefully to checkpoint and the room code stays valid for a fresh re-join. No silent black-screen.
- **Signaling (DO) unreachable during migration:** migration **requires** the signaling worker to re-broker. If the DO is down, peers can't find the new host. Mitigation: DO is a Cloudflare Durable Object (high availability); peers cache the last roster so a graceful host-leave with pre-shared successor address can still connect peer-to-peer even with a brief signaling blip. Treat DO availability as a hard dependency and monitor it.
- **Late-join / rejoin of the dropped player:** the dropped player reconnects with the **same room code** → DO routes them to the current host → host sends a fresh keyframe → they spawn at a safe point (airlock/last safe room) with their **persisted inventory** if we kept it server-side, or as a fresh drop-in if not. **Rejoin uses the exact same "send full keyframe to a peer" path as initial late-join** — build them as one mechanism.

---

## 7. Staging — minimum NOW vs later

**Architect NOW (cheap to do early, ruinously expensive to retrofit — this is the research's core warning):**
1. **Fully serializable world.** Every authoritative bit lives in serializable bitECS components or a single explicit "sim-state sidecar" (director, RNG seed+position, objective graph, checkpoint id). **Rule: no gameplay-relevant state in closures, in renderer objects, or in non-serializable JS heap.** This is the foundational discipline; enforce it from the first ship.
2. **Snapshot serialize/deserialize codec** (binary, versioned header) — even if only used for late-join at first.
3. **Stable `peerId`/`joinOrder` + host binding in the PartyServer DO**, and `successorId` stamped in snapshot headers.
4. **`COMMS_LOST` freeze state** in the game loop + diegetic mask hooks (even if it only ever triggers on graceful leave at first).
5. **Late-join via full keyframe** — ships anyway for drop-in friends, and is literally the same code path migration needs.

**Deliver LATER:**
6. Ungraceful-drop detection tuning + automatic successor self-promotion.
7. Mid-level best-effort migration + invuln seam + AI re-evaluate polish.
8. Pre-warmed dormant DataChannel mesh to cut the freeze to ~1-2 s.
9. Chain-migration / multi-drop edge handling beyond rollback-to-checkpoint.

**Is checkpoint/between-ship migration enough for v1? — YES.** Recommended v1 scope: **guaranteed migration at checkpoints and between ships, best-effort (freeze + checkpoint-fallback) mid-level.** This keeps runs alive in the cases that matter most, ships on time, and — crucially — *as long as #1-#5 are architected now*, upgrading to slick mid-action migration later is incremental, not a rewrite. The expensive mistake is shipping a non-serializable world and trying to add migration in v2.

---

## 8. Interaction with the look-dev milestone (priority #4)

The visual-quality proof (outside ship + one interior) needs **none** of this. Keep the look-dev milestone completely free of netcode. BUT: when interior layouts and the first real ship are built, **enforce the "serializable state" discipline from day one** so we don't accumulate non-serializable gameplay state that blocks migration later. That's the only host-migration constraint that touches early work.

Sources: [Edgegap — Host Migration in P2P/Relay games](https://edgegap.com/blog/host-migration-in-peer-to-peer-or-relay-based-multiplayer-games), [Edgegap — Live Multiplayer P2P & Host Migration (Buras talk)](https://edgegap.com/blog/live-multiplayer-games-p2p-host-migration-a-technical-cost-analysis-of-backend-infrastructures-presentation-by-michal-buras-(lead-network-engineer-at-highwire-games)), [The Host Migration Graveyard: A feasibility study in co-op games (PDF)](https://www.researchgate.net/publication/390559425_The_Host_Migration_Graveyard_A_feasibility_study_in_co-op_games), [Godot proposal — automatic host migration in P2P games](https://github.com/godotengine/godot-proposals/issues/7912), [netplayjs — P2P browser games over WebRTC](https://github.com/rameshvarun/netplayjs).

## Tasks

- **Define fully-serializable authoritative world contract (bitECS + sim-state sidecar)** — _done when:_ A written contract + lint/review rule stating that ALL gameplay-relevant state (entity components, enemy AI FSM, director, RNG seed+stream position, objective graph, checkpoint id, inventories) lives in serializable bitECS components or one explicit sim-state sidecar object — never in closures, renderer objects, or non-serializable heap. First ship is built to this contract.
- **Implement binary snapshot codec (serialize/deserialize) with versioned header** — _done when:_ Given a live authoritative world, codec produces a compact binary blob (typed-array/DataView, not JSON-of-objects) with header {snapshotVersion, tick, rngSeed+pos, successorId, roomCode, shipId, player↔peerId bindings}; deserialize reconstructs an identical-by-state world. Round-trip unit-tested; full keyframe for an 80-entity level is in the tens-to-low-hundreds of KB.
- **Add stable peerId/joinOrder, host binding, and successor election to PartyServer DO** — _done when:_ Durable Object per room code tracks roster with stable peerId, joinOrder, rttToHost, capabilityScore, last ACKed snapshotVersion; computes a deterministic successorId (lowest joinOrder among peers with a recent keyframe + capability floor, weak peers disqualified); successorId is stamped into every snapshot header and cached by peers with no runtime election round-trip.
- **Stream warm-standby snapshots (keyframe + delta) with ACK protocol** — _done when:_ Host sends full keyframes every 3-5 s on the reliable-ordered DataChannel and per-tick deltas on the unreliable channel; every peer ACKs snapshotVersion; host never nominates a successor that hasn't ACKed a recent keyframe; extra bandwidth measured at a few KB/s.
- **Implement COMMS_LOST freeze state + diegetic mask in the game loop** — _done when:_ On host-leave/drop, all peers enter COMMS_LOST: input + sim paused, interference visual + ElevenLabs 'signal lost / reacquiring' audio cue; on resume a ~1-2 s invulnerable/enemies-passive seam runs and in-flight damage events are discarded so migration can never cause a death.
- **Implement late-join / rejoin via full keyframe (shared with migration path)** — _done when:_ A joining or rejoining peer (same room code) is routed by the DO to the current host, receives a fresh full keyframe, and spawns at a safe point with persisted inventory where available; this is the identical code path migration's peer-resync uses.
- **Implement successor self-promotion + re-broker + peer re-handshake** — _done when:_ On detected host drop (graceful HOST_LEAVING or ungraceful heartbeat timeout ~2-3 s), the cached successor instantiates authority from last keyframe+deltas, registers as new host for the SAME room code via the DO, remaining peers tear down dead connection and re-handshake (ICE/TURN), host rebinds players + advances RNG, run resumes. End-to-end freeze ≤6 s at a checkpoint.
- **Implement rollback-to-checkpoint fallback for unrecoverable migrations** — _done when:_ When no peer holds a valid recent keyframe (e.g. simultaneous host+successor drop, or successor just joined), the new host re-hosts from the last checkpoint state instead of failing; session never black-screens; room code stays valid for re-join.
- **Scope v1 migration to guaranteed-at-checkpoint/between-ship + best-effort mid-level** — _done when:_ v1 ships migration that is guaranteed and clean at checkpoints and between ships, and best-effort (freeze + checkpoint fallback) mid-level; later items (pre-warmed dormant mesh, mid-firefight polish, chain-migration) are documented as incremental upgrades enabled by the NOW-architected serializable world.