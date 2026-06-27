# SIGNAL LOST — Netcode Wire Protocol & M0 Spike Spec

SIGNAL LOST — host-authoritative WebRTC netcode. Star topology, host runs the sim (bitECS + Rapier + AI Director), clients are thin: send inputs, render interpolated snapshots, predict only the local player. This spec is code-level and targets the M0 spike (two browsers on different networks walking in sync with a debug HUD) and the M4 vertical slice.

---

## 1. Monorepo placement

```
space/
├─ apps/
│  └─ game/                         # Vite app (client + embedded host)
├─ packages/
│  ├─ netcode/                      # ← THIS SPEC
│  │  ├─ src/
│  │  │  ├─ index.ts
│  │  │  ├─ signaling/
│  │  │  │  ├─ TrysteroSignaler.ts  # room-code join, SDP/ICE relay
│  │  │  │  ├─ iceConfig.ts         # STUN list + TURN env creds
│  │  │  │  └─ roomCode.ts          # code gen/parse/validate
│  │  │  ├─ transport/
│  │  │  │  ├─ PeerLink.ts          # 2 DataChannels per peer (simple-peer)
│  │  │  │  ├─ channels.ts          # channel routing table
│  │  │  │  └─ ConnectionMachine.ts # state machine -> UI
│  │  │  ├─ wire/
│  │  │  │  ├─ ids.ts               # MsgType, EntityType enums
│  │  │  │  ├─ quantize.ts          # pos/rot/float quantizers
│  │  │  │  ├─ writer.ts            # ByteWriter (DataView wrapper)
│  │  │  │  ├─ reader.ts            # ByteReader
│  │  │  │  ├─ snapshot.ts          # encode/decode + delta
│  │  │  │  └─ events.ts            # reliable event encode/decode
│  │  │  ├─ host/
│  │  │  │  ├─ HostNet.ts           # sim->snapshot broadcast @20Hz
│  │  │  │  ├─ authority.ts         # input validation, hit validation
│  │  │  │  └─ SnapshotHistory.ts   # per-client ack ring buffer
│  │  │  ├─ client/
│  │  │  │  ├─ ClientNet.ts         # recv snapshots, send inputs
│  │  │  │  ├─ InterpBuffer.ts      # 100ms remote interpolation
│  │  │  │  ├─ Prediction.ts        # local predict + reconcile
│  │  │  │  └─ InputRing.ts         # unacked input history
│  │  │  ├─ tick/Clock.ts           # fixed-step accumulator
│  │  │  └─ debug/NetStats.ts       # RTT/loss/bytes/drift
│  │  └─ package.json
│  ├─ ecs/                          # bitECS components (shared)
│  └─ protocol-codegen/             # optional: schema -> TS (see §5.7)
└─ workers/
   └─ signaling/                    # PartyKit / CF Worker + Durable Object
      ├─ src/server.ts
      └─ partykit.json
```

`@signal-lost/netcode` depends on `simple-peer`, `trystero`, and `@signal-lost/ecs`. It is transport-agnostic above `PeerLink` so the sim never imports `simple-peer` directly.

---

## 2. Connection & signaling flow

### 2.1 Roles
- **Host** = room creator. Runs authoritative sim. Is a full peer (also renders/plays locally).
- **Client** = joiner. Connects only to host (star topology — clients never peer with each other).
- Signaling carries only SDP offers/answers + ICE candidates. Once DataChannels open, signaling is idle (kept open for late joiners / renegotiation only).

### 2.2 Room codes (`signaling/roomCode.ts`)

```ts
// 6 chars, Crockford base32 minus ambiguous (no I,L,O,U). ~1.07e9 space.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export function generateRoomCode(): string {
  const buf = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(buf, b => ALPHABET[b % 32]).join('');
}
export function isValidRoomCode(s: string): boolean {
  return /^[0-9A-HJ-NP-TV-Z]{6}$/.test(s.toUpperCase());
}
// Trystero room id is namespaced so codes can't collide cross-build:
export const roomId = (code: string) => `signal-lost/v1/${code.toUpperCase()}`;
```

`APP_ID` for Trystero = `'signal-lost'`. The room password (Trystero E2E) is derived from the code itself: `password: sha256(code)` — keeps signaling traffic for a room encrypted to anyone without the code.

### 2.3 Sequence (text diagram)

```
HOST                         SIGNALING (PartyKit/Trystero)            CLIENT
  |                                   |                                  |
  | generateRoomCode() = "K7M2QX"     |                                  |
  | joinRoom(APP_ID, roomId(code))    |                                  |
  |---- announce presence ----------->|  (Durable Object holds room)     |
  | host marks self isHost=true       |                                  |
  |                                   |     player types "K7M2QX" ------>|
  |                                   |<------- joinRoom(roomId) ---------|
  |<--- "onPeerJoin(clientId)" -------|------ "onPeerJoin(hostId)" ------>|
  |                                   |                                  |
  | (lowest-id rule: HOST = creator,  |                                  |
  |  deterministic — see §9)          |                                  |
  | new SimplePeer({initiator:true})  |                                  |
  | peer.on('signal', sdpOffer) ----->| relay (reliable signaling chan)->| peer.signal(offer)
  |                                   |                                  | new SimplePeer({initiator:false})
  | peer.signal(answer) <-------------|<- relay -- peer.on('signal',ans)-| 
  | <==== ICE candidates trickle both ways via signaling relay =========>|
  |                                   |                                  |
  | DataChannel 'reliable' open ------|----------- 'reliable' open ----->| 
  | DataChannel 'unreliable' open ----|----------- 'unreliable' open --->|
  |                                   |                                  |
  | send HELLO{protocolVer, tickRate, |                                  |
  |   yourPlayerSlot, seed, mapId} -- reliable ------------------------->|
  |                                   |                                  | send HELLO_ACK{name,build}
  |<------------------------------- reliable ------------------------------|
  | state=CONNECTED, start streaming snapshots @20Hz (unreliable)        |
  |------------------------------- unreliable ---------------------------->| InterpBuffer fills, render
```

Late joiner (player 3/4 mid-lobby) repeats from `onPeerJoin`. In-mission join is **disabled** for v1 (DESIGN: one-way descent). Joins allowed only in LOBBY state; host rejects HELLO with `LOBBY_CLOSED` otherwise.

### 2.4 PartyKit Durable Object (workers/signaling/src/server.ts)

Minimal relay if not using Trystero's built-in CF strategy. One DO instance per `roomId`. Holds at most 4 connections, relays signaling JSON, garbage-collects on empty.

```ts
// PartyKit-style. Messages are signaling-only; never game data.
type SignalMsg =
  | { t: 'join'; peerId: string }
  | { t: 'peers'; peers: string[] }                 // sent to joiner
  | { t: 'signal'; from: string; to: string; data: unknown } // SDP/ICE
  | { t: 'leave'; peerId: string };

export default class Room implements Party.Server {
  onConnect(conn: Party.Connection) {
    if (this.party.getConnections().length > 4) { conn.close(4001, 'ROOM_FULL'); return; }
    const peers = [...this.party.getConnections()].map(c => c.id).filter(id => id !== conn.id);
    conn.send(JSON.stringify({ t: 'peers', peers }));
    this.broadcast({ t: 'join', peerId: conn.id }, [conn.id]);
  }
  onMessage(raw: string, sender: Party.Connection) {
    const m = JSON.parse(raw) as SignalMsg;
    if (m.t === 'signal') this.party.getConnection(m.to)?.send(JSON.stringify({ ...m, from: sender.id }));
  }
  onClose(conn: Party.Connection) { this.broadcast({ t: 'leave', peerId: conn.id }); }
}
```

### 2.5 ICE config (`signaling/iceConfig.ts`)

```ts
export function buildIceServers(): RTCIceServer[] {
  return [
    { urls: ['stun:stun.cloudflare.com:3478', 'stun:stun.l.google.com:19302'] },
    {
      urls: [
        `turn:${import.meta.env.VITE_TURN_HOST}:3478?transport=udp`,
        `turn:${import.meta.env.VITE_TURN_HOST}:3478?transport=tcp`,
        `turns:${import.meta.env.VITE_TURN_HOST}:5349?transport=tcp`, // TLS, punches restrictive firewalls
      ],
      username: import.meta.env.VITE_TURN_USERNAME, // ephemeral or static
      credential: import.meta.env.VITE_TURN_CREDENTIAL,
    },
  ];
}
// simple-peer config:
export const peerConfig = (initiator: boolean): SimplePeer.Options => ({
  initiator,
  trickle: true,
  config: { iceServers: buildIceServers(), iceTransportPolicy: 'all', bundlePolicy: 'max-bundle' },
  // We create our own channels, so don't let simple-peer's default channel dominate:
  channelConfig: undefined,
});
```

TURN is **mandatory** (Cloudflare Calls TURN or coturn on Fly/Hetzner). Use **ephemeral TURN credentials** (TURN REST API): the PartyKit DO mints a short-lived `username = ${expiry}:${roomId}` and `credential = base64(hmacSHA1(secret, username))` on join, so the long-lived secret never ships to the browser. Env vars: `TURN_SECRET` (Worker only), `VITE_TURN_HOST` (public). For M0 a static long-lived cred is acceptable; switch to ephemeral before any external playtest.

### 2.6 Connection state machine (`transport/ConnectionMachine.ts`)

Surfaced to React HUD via Zustand. Per-peer-link state; the lobby aggregates.

```ts
export type ConnState =
  | 'idle'          // no room
  | 'signaling'     // in room, exchanging SDP/ICE
  | 'connecting'    // ICE checking, DataChannels not open
  | 'connected'     // direct p2p (host/srflx), channels open
  | 'relayed'       // connected but selected candidate pair is TURN relay
  | 'failed'        // ICE failed / channels closed unrecoverably
  | 'reconnecting'; // ICE restart in progress

export interface PeerLinkState {
  peerId: string;
  slot: number;             // player slot 0..3 (0 = host)
  state: ConnState;
  rttMs: number;
  selectedPair?: 'host' | 'srflx' | 'prflx' | 'relay';
}

// transitions
//  idle --joinRoom--> signaling
//  signaling --got remote SDP, ICE gathering--> connecting
//  connecting --both DataChannels 'open' + selectedPair != relay--> connected
//  connecting --both open + selectedPair == relay--> relayed
//  connecting --pc.iceConnectionState=='failed'--> failed
//  connected/relayed --iceConnectionState=='disconnected'--> reconnecting (start ICE restart, 8s timer)
//  reconnecting --recovered--> connected/relayed
//  reconnecting --8s timeout--> failed
//  failed (client) --> show "lost host"; failed (host) --> drop that slot, run continues
```

`relayed` vs `connected` is derived from `pc.getStats()` — find the `nominated` `candidate-pair`, read its local/remote candidate `candidateType`. Show a relay icon in HUD; relay adds latency, useful for debugging.

---

## 3. Transport — two DataChannels per peer (`transport/PeerLink.ts`)

simple-peer's default channel is ignored; we open two **named, negotiated** channels with fixed IDs so both sides agree without renegotiation.

```ts
export const CHANNELS = {
  reliable:   { label: 'reliable',   id: 0, ordered: true,  /* no maxRetransmits */ },
  unreliable: { label: 'unreliable', id: 1, ordered: false, maxRetransmits: 0 },
} as const;

// PeerLink creates channels off the underlying RTCPeerConnection (simple-peer exposes _pc).
function openChannels(pc: RTCPeerConnection) {
  const reliable = pc.createDataChannel(CHANNELS.reliable.label,
    { negotiated: true, id: CHANNELS.reliable.id, ordered: true });
  const unreliable = pc.createDataChannel(CHANNELS.unreliable.label,
    { negotiated: true, id: CHANNELS.unreliable.id, ordered: false, maxRetransmits: 0 });
  reliable.binaryType = 'arraybuffer';
  unreliable.binaryType = 'arraybuffer';
  return { reliable, unreliable };
}
```

### 3.1 Channel routing

| Channel | Ordered | Retransmit | Carries |
|---|---|---|---|
| **reliable** | yes | yes (SCTP) | HELLO/HELLO_ACK, combat-hit confirm, door state, objective state, audio-event-id (scare triggers), chat, lobby/loadout, PING/PONG, ack of last snapshot, host-migration control |
| **unreliable** | no | 0 | Snapshots (host→client, 20Hz), Input frames (client→host, send-rate = sim rate but coalesced to 30–60Hz), heartbeat |

Rule of thumb: **state that is re-sent every snapshot → unreliable** (a dropped one is superseded). **One-shot events that must never be lost → reliable**. Audio-event-ids are reliable because a missed scare cue is unacceptable (DESIGN: "never call ElevenLabs on a scare's critical path" — the cue id must land).

PING/PONG (reliable, every 1s) drives RTT in `NetStats`. Snapshot/input also carry timestamps for a finer RTT estimate.

---

## 4. Tick model (`tick/Clock.ts`)

```
HOST sim:        fixed 60 Hz  (dt = 1/60, accumulator pattern)
HOST snapshot:   20 Hz broadcast (every 3rd sim tick)
CLIENT render:   rAF (display Hz), reads interpolated state
CLIENT interp:   render 100 ms behind newest snapshot (2 snapshots @20Hz buffer + margin)
CLIENT input:    sampled per rAF, sent coalesced ~30–60 Hz, stamped with input seq
```

```ts
export class FixedClock {
  private acc = 0;
  readonly dt = 1 / 60;
  private last = performance.now() / 1000;
  step(now = performance.now() / 1000, onTick: (tick: number) => void, tickRef: { n: number }) {
    let frame = now - this.last; this.last = now;
    if (frame > 0.25) frame = 0.25;          // clamp spiral-of-death
    this.acc += frame;
    while (this.acc >= this.dt) { onTick(tickRef.n++); this.acc -= this.dt; }
  }
}
// Host: every tick % 3 === 0 -> broadcast snapshot.
```

Tick numbers are `uint32`, wrap handled by unsigned subtraction. Host tick is the canonical clock; clients learn `serverTick` from each snapshot and estimate `tickDrift = localPredictedTick - serverTick`.

---

## 5. Wire protocol (binary, DataView)

Endianness: **little-endian** everywhere (browsers are LE; explicit in DataView calls). Serialization is hand-rolled `ByteWriter`/`ByteReader` over `DataView` for snapshots (hot path, zero deps, full control over quantization). Reliable events use the same writer. Recommendation if you want a schema lib instead: **`@petamoriken/float16` only for the rotation/float helpers**, and consider **`bitecs` serialization is NOT used** (too coupled). If a schema lib is wanted, use **`pack0` / `geckos` style** — but the spec below is the recommended hand-rolled path; it's ~200 LOC and removes a dep from the hot path.

### 5.1 Packet header (every packet on either channel)

```
offset size  field
0      1     channel-magic + version : high nibble = protocolVersion (0x1), low nibble = channelKind (0=reliable,1=unreliable)
1      1     MsgType (uint8)
2      2     senderSlot (uint8) + flags (uint8)   // flags bit0 = isDelta (snapshots)
4      4     serverTick (uint32)                  // host tick this packet describes/was sent at
```
Header = **8 bytes**. Payload follows.

```ts
export enum MsgType {
  HELLO = 1, HELLO_ACK = 2,
  SNAPSHOT = 10,            // unreliable
  INPUT = 11,              // unreliable (client->host)
  ACK = 12,                // reliable: client acks last full snapshot tick it applied
  PING = 20, PONG = 21,    // reliable
  EVENT_HIT = 30,          // reliable
  EVENT_DAMAGE = 31,       // reliable (host->clients, confirmed damage)
  EVENT_DOOR = 32,         // reliable
  EVENT_OBJECTIVE = 33,    // reliable
  EVENT_AUDIO = 34,        // reliable (audio-event-id / scare cue)
  EVENT_CHAT = 35,         // reliable
  LOBBY = 40, LOADOUT = 41,
  MIGRATE = 50,            // reliable (host migration control, out of M0)
}

export enum EntityType { Player = 1, Stalker = 2, Swarmer = 3, Projectile = 4, Door = 5, Pickup = 6 }
```

### 5.2 Quantization (`wire/quantize.ts`)

```ts
// Ship interior bounds ~ ±256 m per axis, 1mm precision needed for melee feel.
// Position: fixed-point int16 per axis over a 0.01 m grid -> range ±327.67 m. 2 bytes/axis.
export const POS_SCALE = 100;                 // 1 unit = 1cm
export const writePos = (w: ByteWriter, x: number, y: number, z: number) => {
  w.i16(Math.round(x * POS_SCALE)); w.i16(Math.round(y * POS_SCALE)); w.i16(Math.round(z * POS_SCALE));
}; // 6 bytes
// Rotation: players/enemies are upright -> send YAW only as uint16 (0..65535 = 0..2π). 2 bytes.
export const writeYaw = (w: ByteWriter, yaw: number) =>
  w.u16(Math.round(((yaw % TAU + TAU) % TAU) / TAU * 65535));
// Full quaternion (projectiles/ragdoll) uses smallest-three: 1 byte index + 3×int16 = 7 bytes (only when needed).
// HP: uint8 0..255 (players 0..100, enemies scaled). Anim state: uint8 enum.
```

### 5.3 Snapshot format (`wire/snapshot.ts`)

A snapshot is the header + entity count + per-entity records. Two modes: **full** (flags.isDelta=0, sent on first snapshot to a client and on request after a gap) and **delta** (default).

Per-entity record (full):
```
field          size  notes
entityId       2     uint16
entityType     1     EntityType
fieldMask      1     bitfield: which fields present (pos, yaw, anim, hp, extra)
[pos]          6     if bit0
[yaw]          2     if bit1
[anim]         1     if bit2 (uint8 anim-state enum)
[hp]           1     if bit3
[extra]        var   if bit4 (type-specific: flashlight on/off bit, battery%, projectile vel)
```
Player full record ≈ 2+1+1 + 6+2+1+1 = **14 bytes**. Enemy similar.

### 5.4 Delta compression (vs last-acked snapshot)

Host keeps `SnapshotHistory`: a ring of the last N (=32) full snapshots it built, keyed by tick. Each client reports its last applied tick via `ACK` (reliable). The host computes the delta of the **current** snapshot against the **client's last-acked** snapshot:

```ts
// host/SnapshotHistory.ts (algorithm)
function buildDelta(current: WorldState, baseTick: number, hist: SnapshotHistory): Uint8Array {
  const base = hist.get(baseTick);          // may be undefined if too old -> send FULL
  if (!base) return buildFull(current);
  const w = new ByteWriter();
  writeHeader(w, MsgType.SNAPSHOT, /*isDelta*/ true, current.tick);
  w.u32(baseTick);                          // delta is relative to this tick
  // 1. removed entities
  const removed = base.ids.filter(id => !current.has(id));
  w.u16(removed.length); for (const id of removed) w.u16(id);
  // 2. changed/new entities
  const changedStart = w.reserveU16();      // backpatch count
  let count = 0;
  for (const e of current.entities) {
    const prev = base.byId.get(e.id);
    const mask = diffFields(prev, e);       // bits set only for fields that changed (or all if new)
    if (mask === 0) continue;               // unchanged -> omitted entirely
    w.u16(e.id); w.u8(e.type); w.u8(mask);
    if (mask & POS) writePos(w, e.x, e.y, e.z);
    if (mask & YAW) writeYaw(w, e.yaw);
    if (mask & ANIM) w.u8(e.anim);
    if (mask & HP)  w.u8(e.hp);
    if (mask & EXTRA) writeExtra(w, e);
    count++;
  }
  w.patchU16(changedStart, count);
  return w.bytes();
}
```

Client applies delta: copy its base snapshot, apply removals, overlay changed fields, store result keyed by `current.tick`, then `ACK(current.tick)`. If client lacks `baseTick` (e.g. it never got that ack through, or a long gap), it sets a `needFull` flag in its next ACK; host responds with a full snapshot. New player records always carry full field mask.

Position uses **absolute** quantized values (not delta-of-position) to avoid drift accumulation — delta is at the *entity/field presence* level, which is where the bytes are.

### 5.5 Input frame (client→host, `INPUT`, unreliable)

Sent every client frame, but each packet includes the last K (=6) unacked input commands (redundancy against loss without retransmit). Host applies the newest unseen seq, ignores already-applied seqs.

```
field        size  notes
header       8
count        1     number of input cmds in this packet (1..6)
per cmd:
  inputSeq   4     uint32 monotonic
  clientTick 4     uint32 client-predicted tick this input was for
  buttons    2     bitfield: fwd,back,left,right,sprint,crouch,jump,fire,altFire,reload,interact,flashlight,melee
  moveYaw    2     uint16 quantized aim yaw
  movePitch  2     int16  quantized aim pitch (cam only; movement is planar)
  dtMs       1     uint8 frame dt in ms (for variable-rate movement integration, clamped 1..50)
```
Per cmd = 15 bytes; 6 cmds ≈ 90 + 9 header/count ≈ **99 bytes/input packet**.

### 5.6 Reliable events (`wire/events.ts`)

```ts
// EVENT_HIT (client -> host): "I think I hit X"
{ header, attackerSlot, weaponId:u8, targetEntityId:u16, hitPart:u8 /*head,torso,armL..legR*/,
  originX/Y/Z:f32, dirX/Y/Z (int16 oct), clientTick:u32, inputSeq:u32 }
// EVENT_DAMAGE (host -> all): authoritative result
{ header, targetEntityId:u16, attackerSlot:u8, amount:u8, hitPart:u8, killed:u8, dismembered:u8 /*bitmask limbs*/ }
// EVENT_DOOR  { doorId:u16, state:u8 /*closed,opening,open,locked*/, byEntity:u16 }
// EVENT_OBJECTIVE { objectiveId:u16, state:u8 /*idle,active,inProgress,done,failed*/, progress:u8(0..255) }
// EVENT_AUDIO { audioEventId:u16, x/y/z:i16 pos (0=non-positional), volume:u8, flags:u8 /*loop,oneshot,duck*/ }
// EVENT_CHAT  { fromSlot:u8, len:u8, utf8 bytes } (max 240 bytes)
```

`EVENT_AUDIO` ids index into the **build-time hashed audio pack manifest** (DESIGN: all ElevenLabs baked). Host (AI Director) decides the cue; clients map id→buffer locally. Critical path is one reliable 2-byte id, never a network fetch.

### 5.7 ByteWriter/Reader contract

```ts
export class ByteWriter {
  private dv: DataView; private off = 0; private buf: ArrayBuffer;
  constructor(cap = 1400) { this.buf = new ArrayBuffer(cap); this.dv = new DataView(this.buf); }
  u8(v:number){this.ensure(1);this.dv.setUint8(this.off++,v);}
  i16(v:number){this.ensure(2);this.dv.setInt16(this.off,v,true);this.off+=2;}
  u16(v:number){this.ensure(2);this.dv.setUint16(this.off,v,true);this.off+=2;}
  u32(v:number){this.ensure(4);this.dv.setUint32(this.off,v,true);this.off+=4;}
  f32(v:number){this.ensure(4);this.dv.setFloat32(this.off,v,true);this.off+=4;}
  reserveU16(){const at=this.off;this.u16(0);return at;}
  patchU16(at:number,v:number){this.dv.setUint16(at,v,true);}
  bytes(){return new Uint8Array(this.buf,0,this.off);}
  private ensure(n:number){/* grow if off+n>cap, copy into 2x buffer */}
}
```
Optional codegen (`packages/protocol-codegen`): a tiny `.proto`-like DSL → generated `encodeX/decodeX`. Defer past M0; hand-rolled is the M0 path. **MTU target: keep every packet ≤ 1200 bytes** to avoid SCTP fragmentation on the relayed path; if a full snapshot exceeds it, split across multiple packets keyed by same tick + `partIdx/partCount` in flags.

---

## 6. Client prediction & reconciliation (`client/Prediction.ts`)

Only the **local player** is predicted. Remote players + all enemies are interpolation-only.

```
Each client frame:
  1. Sample input -> InputCmd{seq, clientTick, buttons, aim, dtMs}
  2. Push to InputRing (unacked history)
  3. Apply input locally to predicted local-player state (same movement integrator as host)
  4. Send INPUT packet (last 6 cmds) on unreliable channel

On SNAPSHOT recv:
  5. Read authoritative local-player state @ serverTick, and lastProcessedInputSeq (host echoes
     it back in the player's EXTRA field for the receiving client's own entity)
  6. Reconcile (below)
  7. Remote entities -> push into InterpBuffer (no prediction)
```

### 6.1 Reconciliation

Host echoes, per client, the `lastProcessedInputSeq` it consumed for that client's player (1 uint32 in the player record's EXTRA block, only on the owning client's own entity — host sends a client-specific tail, or simply includes it for all and clients read their own).

```ts
function reconcile(authoritative: PlayerState, lastProcessedSeq: number, ring: InputRing) {
  // 1. Drop acked inputs
  ring.discardUpTo(lastProcessedSeq);
  // 2. Snap predicted state to authoritative
  let s = clone(authoritative);
  // 3. Replay all still-unacked inputs on top of the authoritative base
  for (const cmd of ring.iterAfter(lastProcessedSeq)) {
    s = integrateMovement(s, cmd, cmd.dtMs / 1000); // SAME function host uses
  }
  // 4. Error = distance(predictedNow, s)
  const err = dist(predictedLocal.pos, s.pos);
  if (err > HARD_SNAP) { predictedLocal = s; }                 // teleport (e.g. >2m: collision divergence)
  else if (err > SOFT)  { predictedLocal = lerpToward(predictedLocal, s, SMOOTH_RATE); } // visually smooth
  else { /* within tolerance, keep predicted (no visible correction) */ }
}
const HARD_SNAP = 2.0, SOFT = 0.05, SMOOTH_RATE = 0.2;
```

`integrateMovement` lives in `@signal-lost/ecs` (shared host+client), and must be **deterministic** given (state, cmd, dt): no `Math.random`, fixed dt sub-stepping, identical capsule-vs-static collision query. Rapier runs host-only; the client uses a **lightweight kinematic capsule sweep against the static collision mesh** (baked at build) for prediction — it doesn't need full Rapier, just enough to match host movement against walls. Dynamic-object collisions are not predicted (rare; host corrects).

**Anti-rubber-band:** (a) soft-smoothing band above so small corrections never teleport; (b) host rejects implausible inputs (see §7) rather than letting them predict then yanking back; (c) client clamps prediction to never exceed `maxSpeed * elapsed + margin` from last authoritative pos, so a malicious/buggy local predictor can't run away; (d) if reconciliation error stays >SOFT for >500ms (chronic desync, e.g. mismatched collision), force one HARD_SNAP and log to NetStats `desyncEvents`.

---

## 7. Host authority (`host/authority.ts`)

Host is the only writer of canonical state. Clients send **intent**, never positions.

```ts
// Movement validation per input cmd:
function validateAndApply(player, cmd, dt) {
  cmd.dtMs = clamp(cmd.dtMs, 1, 50);                       // ignore lag-spike huge dt
  const wish = wishDirFromButtons(cmd.buttons, cmd.moveYaw);
  const speed = (cmd.buttons & SPRINT ? RUN : WALK) * (cmd.buttons & CROUCH ? 0.5 : 1);
  const next = integrateMovement(player, { ...cmd, wish, speed }, dt); // same fn as client
  // Rapier kinematic controller resolves against world (host-only authoritative collision)
  player.pos = rapierController.move(player.collider, next.delta);
  player.lastProcessedSeq = cmd.seq;
}
```

Hit validation (`EVENT_HIT` → `EVENT_DAMAGE`):
```ts
function validateHit(hit, attacker) {
  const target = world.get(hit.targetEntityId);
  if (!target || target.dead) return;
  // lag compensation: rewind target to attacker's clientTick (bounded to ~250ms of history)
  const rewound = entityHistory.sampleAt(hit.targetEntityId, hit.clientTick);
  const ray = { origin: hit.originXYZ, dir: hit.dir };
  const r = raycastSegment(ray, rewound.colliderAt(hit.hitPart), maxRange(hit.weaponId));
  if (!r.hit) return;                                      // reject: no LoS / out of range
  if (dist(attacker.pos, hit.originXYZ) > MUZZLE_TOLERANCE) return; // reject spoofed origin
  const dmg = weaponDamage(hit.weaponId, r.part);
  applyDamage(target, dmg, attacker.slot, r.part);         // host decides dismemberment
  broadcast(EVENT_DAMAGE, { ... });                        // reliable to all
}
```
v1 has **no anti-cheat** (LOCKED). Validation here is for *consistency*, not security — friends-only. We reject only physically-impossible inputs to keep the sim sane. Lag-comp window bounded to 250ms so you can't rewind arbitrarily.

Clients **never** apply damage locally; they wait for `EVENT_DAMAGE`. Hit *feedback* (muzzle flash, impact spark) plays immediately client-side on fire for feel; the actual HP/kill/dismember is host-confirmed.

---

## 8. Bandwidth budget (4 players, 20 Hz)

Worst-case M4-scale scene the host streams to **each** client: 4 players + ~12 active enemies (Swarmer wave) + ~4 projectiles + a few doors/pickups ≈ **24 entities**.

Per delta snapshot (typical frame, ~60% entities moving):
```
header                                  8 B
baseTick                                4 B
removed count + ids (usually 0)         2 B
changed count                           2 B
~16 changed entities × ~12 B avg      192 B   (id2+type1+mask1 + pos6 + yaw2 ≈ 12; hp/anim only on change)
SCTP/DTLS/UDP overhead est.           ~60 B
                                     ------
                                     ~268 B per snapshot per recipient
```
- **Host → each client:** 268 B × 20 Hz ≈ **5.36 KB/s ≈ 43 kbps**.
- **Host uplink (star, host sends to 3 clients):** 3 × 43 ≈ **129 kbps up**.
- **Client → host input:** 99 B × ~30 Hz ≈ 3 KB/s ≈ **24 kbps up** per client.
- **Host total up:** 129 (snapshots) + ~3×event traffic burst ≈ **<200 kbps sustained up**, spiking to maybe 350 kbps during a loud combat beat (many EVENT_DAMAGE/EVENT_AUDIO).
- **Host total down:** 3 × 24 ≈ **72 kbps**.

Home broadband (typical ≥10 Mbps up) clears this by ~25×. The constraint is **host uplink scaling linearly with player count** (star topology) — fine at 4, the locked ceiling. Mitigations baked in: delta compression, quantized fields, omitting unchanged entities, 20Hz not 60Hz, relevancy (don't send enemies beyond ~40m / through-hull to a client — area-of-interest cull in `HostNet`, easy win once corridors connect).

Guardrail: `NetStats` asserts per-recipient snapshot stays **<400 B avg**; CI perf test fails the build if a synthetic 4p/24-entity scene exceeds it.

---

## 9. Host migration (staged — OUT of M0/M4)

**M0/M4 behavior:** host loss = run ends. On `iceConnectionState='failed'`/host channel close, clients transition `reconnecting`→`failed`, show "Connection to host lost — run over," return to menu. Implement this fully (it's small) — migration is the deferred part.

**Later design (documented, not built):**
- Host broadcasts a periodic **warm-standby full snapshot** (every 2s, reliable) containing enough authoritative state (entity transforms, hp, objective/door/inventory state, AI Director phase, RNG seed+counter) for any peer to resume the sim.
- Successor election: **lowest peerId among survivors** (peerIds are the signaling connection ids, sortable, known to all). Deterministic, no voting round-trip.
- On host loss: each survivor checks `am I the min surviving peerId?`. The winner instantiates a Rapier world from the last warm-standby snapshot + replays buffered inputs since that snapshot, promotes to host, re-meshes the star (re-peers with remaining clients via still-open signaling room), sends `MIGRATE{newHostSlot}` reliable. Others reconnect to new host.
- Risk: Rapier determinism across the gap and re-establishing peers within a few seconds. Marked **M5+**, gated behind the M4 green-light.

`MsgType.MIGRATE` and a `warmStandby` flag are reserved in the protocol now so the wire format doesn't break later.

---

## 10. Debug HUD (`debug/NetStats.ts`)

```ts
export interface NetStats {
  perPeer: Record<string, {
    rttMs: number;             // EWMA from PING/PONG
    lossPct: number;           // from input/snapshot seq gaps over 2s window
    selectedPair: 'host'|'srflx'|'prflx'|'relay';
  }>;
  snapshotBytesAvg: number;    // rolling avg per-recipient snapshot size
  snapshotHz: number;          // measured broadcast rate
  inputHz: number;
  tickDriftMs: number;         // client predicted tick vs server tick
  interpDelayMs: number;       // current render-behind
  desyncEvents: number;        // hard snaps from chronic divergence
  bufferedSnapshots: number;   // InterpBuffer depth
}
```
Rendered as a React overlay component `<NetDebugHUD/>` (toggle `~`), reads from a Zustand store updated at 4 Hz (never per frame). Loss% computed from monotonic seq gaps: `(expected - received)/expected` over a sliding 2s window on both snapshot (client side) and input (host side) streams.

---

## 11. Interpolation buffer (`client/InterpBuffer.ts`)

```ts
// Per remote entity: ring of (renderTime, state) samples from snapshots.
// renderTime for a snapshot = its serverTick mapped to a smoothed local clock.
const INTERP_DELAY = 0.1; // 100ms
function sampleAt(entity, now) {
  const target = now - INTERP_DELAY;
  const [a, b] = entity.bracket(target);      // two snapshots straddling target
  if (!b) return extrapolate(a, target, MAX_EXTRAP=0.1); // brief hold/extrapolate on gap
  const t = (target - a.time) / (b.time - a.time);
  return { pos: lerp(a.pos, b.pos, t), yaw: slerpYaw(a.yaw, b.yaw, t), anim: b.anim };
}
```
Server-tick→local-clock mapping uses an EWMA offset (`localNow - serverTickTime`) so clock skew doesn't jitter playback. On a >300ms snapshot gap, freeze last pose (don't extrapolate enemies into walls), flag in NetStats.

---

## 12. M0 SPIKE — task breakdown & acceptance

Goal restated: **two browsers on different networks join by a room code, both walk around a flat test box in sync, debug HUD shows RTT/loss/snapshot bytes/tick drift, and the TURN relay path is verified on symmetric NAT.** No enemies, no Rapier-full, no audio — just the netcode spine and a capsule on a plane.

The detailed, sequenced tasks with acceptance criteria are in the `tasks` array. Milestones: M0 = netcode spine spike (this doc's primary deliverable); M1–M3 layer sim/enemies/audio; M4 = vertical slice gate.

## Tasks (toward M4 vertical slice)

- **[M0] Scaffold @signal-lost/netcode package + Turborepo wiring** — _done when:_ pnpm -F @signal-lost/netcode build passes; package exports index.ts with empty PeerLink/HostNet/ClientNet stubs; turbo build graph includes it; depends on simple-peer, trystero typed. _(deps: Turborepo monorepo skeleton (apps/game, packages/ecs) exists)_
- **[M0] Implement ByteWriter/ByteReader + quantize.ts with round-trip tests** — _done when:_ Vitest: writePos/writeYaw/readback for 10k random values stays within 0.01m / (2π/65535) rad; buffer auto-grows past 1400B; LE confirmed; all MsgType/EntityType enums defined. _(deps: netcode package scaffold)_
- **[M0] Room code gen/validate + Trystero room join** — _done when:_ generateRoomCode() yields valid 6-char Crockford codes; two tabs join roomId(code) and fire onPeerJoin with each other's id; invalid codes rejected; host flagged by creation, not heuristics. _(deps: netcode package scaffold)_
- **[M0] iceConfig.ts with STUN list + env-var TURN; ephemeral cred plan stubbed** — _done when:_ buildIceServers() returns STUN array + TURN entry from VITE_TURN_* env; turns:5349 TLS entry present; missing env throws clear error at startup; static cred works, ephemeral TODO marked.
- **[M0] PeerLink: two negotiated DataChannels (reliable id0, unreliable id1 maxRetransmits0)** — _done when:_ On both peers both channels reach readyState 'open'; binaryType arraybuffer; sending on unreliable with simulated 10% loss does not stall reliable; channel routing table enforced (snapshot->unreliable, event->reliable). _(deps: Trystero join, iceConfig)_
- **[M0] ConnectionMachine state machine surfaced to Zustand/HUD** — _done when:_ States idle->signaling->connecting->connected/relayed->reconnecting->failed transition correctly against pc.iceConnectionState and getStats nominated pair; relay vs direct distinguished from candidateType; ICE-restart on disconnected with 8s timeout to failed. _(deps: PeerLink)_
- **[M0] Packet header + SNAPSHOT full/delta encode/decode** — _done when:_ Full snapshot of 24 synthetic entities encodes <1200B; delta against a base correctly omits unchanged, lists removed, applies on client to reproduce host state exactly; baseTick-missing path falls back to full; round-trip fuzz test passes 1000 iters. _(deps: ByteWriter/Reader, quantize)_
- **[M0] SnapshotHistory ring + per-client ACK-based delta selection** — _done when:_ Host keeps 32-deep history; client ACK(lastTick) on reliable channel selects correct base; dropped ACK -> needFull -> host sends full; no unbounded memory growth over 5 min soak. _(deps: SNAPSHOT encode/decode, PeerLink)_
- **[M0] FixedClock 60Hz sim + 20Hz snapshot broadcast (host)** — _done when:_ HostNet steps deterministic accumulator at 60Hz, broadcasts every 3rd tick; measured snapshotHz 20+/-1 under load; spiral-of-death clamp at 0.25s verified; serverTick uint32 monotonic. _(deps: SnapshotHistory)_
- **[M0] INPUT frame send (client) + apply/validate (host) for a capsule on a plane** — _done when:_ Client samples WASD+mouse into InputCmd(seq), sends last-6 redundant on unreliable; host applies newest unseen seq via shared integrateMovement, clamps dt 1..50ms, echoes lastProcessedSeq; capsule moves on host authoritatively. _(deps: FixedClock, PeerLink)_
- **[M0] Client prediction + reconciliation for LOCAL player (kinematic sweep)** — _done when:_ Local player predicts immediately; on snapshot, discardUpTo(ack), snap-to-authoritative, replay unacked; SOFT smoothing under 5cm, HARD snap over 2m; no visible rubber-band walking against the box wall on both peers; chronic-desync force-snap path logs once. _(deps: INPUT send/apply, SNAPSHOT decode)_
- **[M0] InterpBuffer 100ms for REMOTE player (interpolation only)** — _done when:_ Remote capsule renders 100ms behind newest snapshot, lerp pos + slerp yaw, no prediction; gap >300ms freezes pose not extrapolates into wall; server-tick->local-clock EWMA offset stable, no playback jitter. _(deps: SNAPSHOT decode, FixedClock)_
- **[M0] PING/PONG + NetStats (RTT, loss%, snapshotBytes, tickDrift) + React NetDebugHUD** — _done when:_ Toggle ~ shows per-peer RTT (EWMA), loss% from seq gaps over 2s, snapshotBytesAvg, snapshotHz/inputHz, tickDriftMs, selectedPair (relay/direct), bufferedSnapshots; store updates at 4Hz not per-frame. _(deps: PeerLink, ConnectionMachine, INPUT/SNAPSHOT loops)_
- **[M0] PartyKit/Trystero signaling worker deploy + STUN/TURN cred wiring** — _done when:_ workers/signaling deployed to Cloudflare; relays SDP/ICE for a roomId, caps at 4, GCs empty rooms; TURN host reachable; turns:5349 path negotiates on a network that blocks UDP. _(deps: iceConfig, Trystero join)_
- **[M0] M0 cross-network + symmetric-NAT TURN verification run** — _done when:_ Two browsers on genuinely different networks (one behind symmetric NAT, e.g. tethered mobile hotspot + forced iceTransportPolicy:relay test) join by code; both walk in sync; HUD shows selectedPair='relay' on the symmetric path and 'srflx' on the easy path; RTT/loss/bytes/tickDrift all populated and sane (<400B/snapshot); session stable 10 min. _(deps: all M0 tasks)_
- **[M0] Host-loss = run-ends handling (migration deferred)** — _done when:_ On host channel close/ICE failed, clients go reconnecting->failed after 8s, show 'host lost' and return to menu; host dropping a single client keeps the session alive; MsgType.MIGRATE + warmStandby flag reserved in wire format but unimplemented. _(deps: ConnectionMachine)_
- **[M1] Reliable EVENT plumbing skeleton (hit/door/objective/audio/chat encode+route)** — _done when:_ events.ts encodes/decodes all EVENT_* structs; EVENT_AUDIO carries 2-byte audioEventId indexing build-time manifest; events go on reliable channel and dispatch to typed handlers; chat round-trips UTF8<=240B; sets up M1 sim integration. _(deps: M0 wire + transport)_
- **[M2] Host hit-validation + lag compensation (entity history rewind)** — _done when:_ EVENT_HIT validated by rewinding target to attacker clientTick (bounded 250ms), raycast vs collider part, muzzle-origin tolerance check; rejects out-of-range/no-LoS; emits authoritative EVENT_DAMAGE with dismember bitmask; clients apply damage only on confirm. _(deps: EVENT plumbing, Rapier host sim, enemy entities)_
- **[M3] Area-of-interest culling in HostNet (relevancy)** — _done when:_ Enemies beyond ~40m or through-hull from a given client are omitted from that client's snapshot; per-recipient snapshot stays <400B with 12-Swarmer wave; CI synthetic 4p/24-entity perf test enforces the budget. _(deps: M0 snapshot/delta, corridor geometry, enemy AI on host)_

## Open questions

- TURN provider: Cloudflare Calls TURN vs self-hosted coturn (Fly/Hetzner)? Affects whether ephemeral creds use CF's API or the TURN REST HMAC scheme in this spec.
- Trystero strategy: use Trystero's own signaling (torrent/nostr/firebase/MQTT) or the custom PartyKit Durable Object relay specified here? Spec assumes PartyKit for control over room caps and ephemeral TURN minting; confirm before M0 worker task.
- Positional voice chat (DESIGN signature COMMS-RESTORE moment) needs a 3rd media path — is it a separate WebRTC audio track over the same RTCPeerConnection, and does it belong in M0 transport or a later milestone?
- Does the host echo lastProcessedInputSeq per-client (tailored tail per recipient) or include every client's seq in every snapshot? Spec assumes per-recipient tailoring; confirm acceptable host CPU cost at 20Hz.
- Client-side prediction collision: confirm a baked static collision mesh + lightweight capsule sweep is acceptable to match Rapier's kinematic controller closely enough, or whether we run a trimmed Rapier instance client-side for the local player only.
