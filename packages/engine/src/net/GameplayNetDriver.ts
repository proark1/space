import { createGameWorld, PlayerInput, Transform, type GameWorld } from '@sl/ecs';
import {
  Buttons,
  InputReceiver,
  InputSendBuffer,
  SnapshotHistory,
  applySnapshotToEcs,
  applyDelta,
  buildSnapshotFromEcs,
  createSession,
  decodeAck,
  decodeLobbySlot,
  decodeDelta,
  decodeFull,
  ACK_NEED_FULL,
  encodeAck,
  encodeFull,
  encodeLobbySlot,
  MAX_LOBBY_SLOTS,
  readHeader,
  ByteReader,
  SNAPSHOT_EVERY,
  type InputCmd,
  type Session,
  type SessionEvents,
  type WorldSnapshot,
  type EntitySnapshot,
} from '@sl/netcode';
import { MsgType } from '@sl/shared-types';
import type { Game } from '../Game';
import type { MoveInput } from '../player/PlayerController';

type MutableMoveInput = {
  moveX: number;
  moveZ: number;
  yaw: number;
  jump?: boolean;
  speedMultiplier?: number;
};

export interface ClientInputIntent {
  readonly buttons: number;
  readonly yaw?: number;
  readonly pitch?: number;
  readonly dtMs?: number;
  readonly voicePressure?: number;
}

export interface HostInputMeta {
  readonly ownerSlot: number;
  readonly playerEid: number;
  readonly voicePressure: number;
}

export interface GameplayNetDriverOptions {
  readonly hostGame?: Game;
  readonly localGame?: Game;
  readonly clientWorld?: GameWorld;
  readonly senderSlot?: number;
  readonly peerSpawn?: (slot: number) => { readonly x: number; readonly y: number; readonly z: number };
  readonly now?: () => number;
  readonly maxPeerSlots?: number;
  readonly onSnapshot?: (snapshot: WorldSnapshot, result: ReturnType<typeof applySnapshotToEcs>) => void;
  readonly onHostInput?: (peerId: string, cmds: readonly InputCmd[], meta: HostInputMeta) => void;
  readonly onLocalReconcile?: (result: LocalReconcileResult) => void;
  readonly onSlotAssigned?: (slot: number) => void;
}

export interface CreateGameplaySessionOptions extends GameplayNetDriverOptions {
  readonly code: string;
  readonly isHost: boolean;
  readonly iceServers: RTCIceServer[];
  readonly iceTransportPolicy?: RTCIceTransportPolicy;
  readonly events: SessionEvents;
  readonly signalingUrl?: string;
  readonly now?: () => number;
}

function writeInputFromButtons(cmd: InputCmd, out: MutableMoveInput): MoveInput {
  out.moveX = (cmd.buttons & Buttons.Right ? 1 : 0) - (cmd.buttons & Buttons.Left ? 1 : 0);
  out.moveZ = (cmd.buttons & Buttons.Fwd ? 1 : 0) - (cmd.buttons & Buttons.Back ? 1 : 0);
  out.yaw = cmd.moveYaw;
  out.jump = (cmd.buttons & Buttons.Jump) !== 0;
  return out;
}

function packetType(data: ArrayBuffer): number | undefined {
  return packetHeader(data)?.msgType;
}

function packetHeader(data: ArrayBuffer): ReturnType<typeof readHeader> | undefined {
  try {
    return readHeader(new ByteReader(new Uint8Array(data)));
  } catch {
    return undefined;
  }
}

interface PoseSample {
  readonly timeMs: number;
  readonly entity: EntitySnapshot;
}

export interface LocalReconcileResult {
  readonly inputAck: number;
  readonly pendingInputs: number;
  readonly correctionDistance: number;
  readonly entity: EntitySnapshot;
}

const REMOTE_INTERP_DELAY_MS = 100;
const REMOTE_FREEZE_GAP_MS = 300;
const SLOT_ANNOUNCE_INTERVAL_MS = 1000;
const DEFAULT_SLOT_SPAWNS = [
  { x: -1.2, z: 12 },
  { x: 1.2, z: 12 },
  { x: 0, z: 10.8 },
  { x: -1.2, z: 10.8 },
] as const;

function defaultPeerSpawn(slot: number): { x: number; y: number; z: number } {
  const spawn = DEFAULT_SLOT_SPAWNS[slot - 1] ?? { x: 0, z: 10.8 };
  return { x: spawn.x, y: 1, z: spawn.z };
}

function defaultNowMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpAngle(a: number, b: number, t: number): number {
  const tau = Math.PI * 2;
  let d = (((b - a) % tau) + tau) % tau;
  if (d > Math.PI) d -= tau;
  return a + d * t;
}

function writeYawQuat(eid: number, yaw: number): void {
  const half = yaw / 2;
  Transform.qx[eid] = 0;
  Transform.qy[eid] = Math.sin(half);
  Transform.qz[eid] = 0;
  Transform.qw[eid] = Math.cos(half);
}

function applyPose(eid: number, entity: EntitySnapshot): void {
  Transform.x[eid] = entity.x;
  Transform.y[eid] = entity.y;
  Transform.z[eid] = entity.z;
  writeYawQuat(eid, entity.yaw);
}

function applyInterpolatedPose(eid: number, a: EntitySnapshot, b: EntitySnapshot, t: number): void {
  Transform.x[eid] = lerp(a.x, b.x, t);
  Transform.y[eid] = lerp(a.y, b.y, t);
  Transform.z[eid] = lerp(a.z, b.z, t);
  writeYawQuat(eid, lerpAngle(a.yaw, b.yaw, t));
}

/**
 * Gameplay bridge over the real Session transport. It is intentionally thin: input packets and full
 * snapshots use the existing wire codecs, while entity lifecycle is delegated to the ECS snapshot map.
 */
export class GameplayNetDriver {
  readonly clientWorld: GameWorld;
  readonly netIdToEid = new Map<number, number>();

  private readonly inputSend = new InputSendBuffer();
  private readonly inputReceivers = new Map<string, InputReceiver>();
  private readonly hostSnapshots = new SnapshotHistory(32);
  private readonly clientSnapshots = new SnapshotHistory(64);
  private readonly peerAckTicks = new Map<string, number>();
  private readonly peerSlots = new Map<string, number>();
  private readonly peerSlotAnnounceAt = new Map<string, number>();
  private readonly interpSamples = new Map<number, PoseSample[]>();
  private readonly seenRemoteIds = new Set<number>();
  private readonly sampledRemoteEids: number[] = [];
  private readonly replayScratch: Array<{ input: MutableMoveInput; dt: number }> = [];
  private readonly hostInputScratch: MutableMoveInput = { moveX: 0, moveZ: 0, yaw: 0 };
  private pendingLocalInputs: InputCmd[] = [];
  private readonly now: () => number;
  private readonly maxPeerSlots: number;
  private readonly peerPlayers = new Map<string, number>();
  private localSenderSlot: number;
  private lastLocalInputAck = 0;
  private snapshotTick = 0;
  private netTick = 0;
  private nextPeerNetId = 1000;

  constructor(
    readonly session: Session,
    private readonly opts: GameplayNetDriverOptions = {},
  ) {
    this.clientWorld = opts.clientWorld ?? createGameWorld('client');
    this.now = opts.now ?? defaultNowMs;
    this.maxPeerSlots = opts.maxPeerSlots ?? MAX_LOBBY_SLOTS;
    this.localSenderSlot = session.isHost ? 0 : opts.senderSlot ?? 1;
  }

  handleUnreliable(peerId: string, data: ArrayBuffer): void {
    const header = packetHeader(data);
    const msgType = header?.msgType;
    if (this.session.isHost) {
      if (msgType !== MsgType.Input || !this.opts.hostGame) return;
      const receiver = this.receiverFor(peerId);
      const ownerSlot = this.slotForPeer(peerId);
      this.announcePeerSlot(peerId, ownerSlot, this.now());
      const player = this.playerForPeer(peerId, ownerSlot);
      const cmds = receiver.apply(new Uint8Array(data));
      if (cmds.length > 0) PlayerInput.seq[player] = receiver.lastProcessedSeq;
      for (const cmd of cmds) {
        this.opts.hostGame.stepControlledPlayer(player, writeInputFromButtons(cmd, this.hostInputScratch), cmd.dtMs / 1000, cmd.clientTick);
      }
      this.opts.onHostInput?.(peerId, cmds, {
        ownerSlot,
        playerEid: player,
        voicePressure: cmds.at(-1)?.voicePressure ?? 0,
      });
      return;
    }

    if (msgType !== MsgType.Snapshot) return;
    const bytes = new Uint8Array(data);
    let snapshot: WorldSnapshot | undefined;
    if (header?.isDelta) {
      const delta = decodeDelta(bytes);
      const base = this.clientSnapshots.get(delta.baseTick);
      if (!base) {
        this.session.sendReliable(peerId, encodeAck(ACK_NEED_FULL, { senderSlot: this.senderSlot() }));
        return;
      }
      snapshot = applyDelta(base, delta);
    } else {
      snapshot = decodeFull(bytes);
    }

    this.clientSnapshots.add(snapshot);
    const localEntity = this.findLocalEntity(snapshot);
    if (localEntity) this.reconcileLocalPlayer(localEntity);

    let remoteSnapshot = snapshot;
    if (localEntity) {
      const entities: EntitySnapshot[] = [];
      for (const entity of snapshot.entities) {
        if (entity.id !== localEntity.id) entities.push(entity);
      }
      remoteSnapshot = { tick: snapshot.tick, entities };
    }
    const result = applySnapshotToEcs(this.clientWorld, remoteSnapshot, this.netIdToEid, { despawnMissing: true });
    this.bufferRemoteSnapshot(remoteSnapshot, this.now());
    this.session.sendReliable(peerId, encodeAck(snapshot.tick, { senderSlot: this.senderSlot() }));
    this.opts.onSnapshot?.(snapshot, result);
  }

  handleReliable(peerId: string, data: ArrayBuffer): boolean {
    const msgType = packetType(data);
    if (!this.session.isHost && msgType === MsgType.Lobby) {
      const assignment = decodeLobbySlot(new Uint8Array(data));
      this.localSenderSlot = assignment.slot;
      this.opts.onSlotAssigned?.(assignment.slot);
      return true;
    }

    if (!this.session.isHost || msgType !== MsgType.Ack) return false;
    const ackTick = decodeAck(new Uint8Array(data));
    if (ackTick === ACK_NEED_FULL) this.peerAckTicks.delete(peerId);
    else this.peerAckTicks.set(peerId, ackTick);
    return true;
  }

  sendClientInput(intent: ClientInputIntent): void {
    if (this.session.isHost) return;
    const cmd = this.inputSend.push({
      clientTick: this.inputSend.lastSeq,
      buttons: intent.buttons,
      moveYaw: intent.yaw ?? 0,
      movePitch: intent.pitch ?? 0,
      dtMs: intent.dtMs ?? 16,
      voicePressure: intent.voicePressure ?? 0,
    });
    this.pendingLocalInputs.push(cmd);
    if (this.pendingLocalInputs.length > 256) this.pendingLocalInputs.splice(0, this.pendingLocalInputs.length - 256);
    const packet = new Uint8Array(this.inputSend.packet({ senderSlot: this.senderSlot() }));
    this.session.broadcastUnreliable(packet);
  }

  broadcastHostSnapshot(): WorldSnapshot | undefined {
    const game = this.opts.hostGame;
    if (!this.session.isHost || !game) return undefined;
    const snapshot = buildSnapshotFromEcs(game.world, this.snapshotTick++);
    this.hostSnapshots.add(snapshot);
    const peerIds = this.session.peerIds;
    if (peerIds.length === 0) {
      this.session.broadcastUnreliable(encodeFull(snapshot, { senderSlot: this.opts.senderSlot ?? 0 }));
    } else {
      for (const peerId of peerIds) {
        const baseTick = this.peerAckTicks.get(peerId) ?? null;
        this.session.sendUnreliable(peerId, this.hostSnapshots.buildFor(snapshot, baseTick));
      }
    }
    return snapshot;
  }

  tick(): void {
    this.session.tick();
    if (this.session.isHost) {
      this.announcePeerSlots(this.now());
      if (this.netTick++ % SNAPSHOT_EVERY === 0) this.broadcastHostSnapshot();
    }
  }

  /**
   * Smooth remote ECS transforms on the render path. Snapshot arrival still handles lifecycle and
   * latest authoritative fields; this samples buffered poses ~100 ms behind to avoid 20 Hz snapping.
   */
  sampleRemoteEntities(nowMs: number = this.now()): number[] {
    if (this.session.isHost) return [];
    const renderTime = nowMs - REMOTE_INTERP_DELAY_MS;
    const updated = this.sampledRemoteEids;
    updated.length = 0;

    for (const [netId, samples] of this.interpSamples) {
      const eid = this.netIdToEid.get(netId);
      if (eid === undefined || samples.length === 0) continue;

      let a: PoseSample | undefined;
      let b: PoseSample | undefined;
      for (const sample of samples) {
        if (sample.timeMs <= renderTime) a = sample;
        if (sample.timeMs >= renderTime && !b) b = sample;
      }

      if (a && b && a !== b) {
        const span = b.timeMs - a.timeMs;
        if (span > REMOTE_FREEZE_GAP_MS) applyPose(eid, a.entity);
        else applyInterpolatedPose(eid, a.entity, b.entity, (renderTime - a.timeMs) / span);
      } else {
        applyPose(eid, (a ?? b)!.entity);
      }
      updated.push(eid);
    }

    return updated;
  }

  leave(): void {
    this.session.leave();
  }

  private bufferRemoteSnapshot(snapshot: WorldSnapshot, timeMs: number): void {
    const seen = this.seenRemoteIds;
    seen.clear();
    for (const entity of snapshot.entities) {
      seen.add(entity.id);
      const samples = this.interpSamples.get(entity.id) ?? [];
      const sample = { timeMs, entity: { ...entity } };
      let insertAt = samples.length;
      while (insertAt > 0 && samples[insertAt - 1]!.timeMs > timeMs) {
        samples[insertAt] = samples[insertAt - 1]!;
        insertAt--;
      }
      samples[insertAt] = sample;
      const cutoff = timeMs - 1000;
      let trim = 0;
      while (samples.length - trim > 2 && samples[trim]!.timeMs < cutoff) trim++;
      if (trim > 0) samples.splice(0, trim);
      this.interpSamples.set(entity.id, samples);
    }
    for (const netId of this.interpSamples.keys()) {
      if (!seen.has(netId) && !this.netIdToEid.has(netId)) this.interpSamples.delete(netId);
    }
  }

  private findLocalEntity(snapshot: WorldSnapshot): EntitySnapshot | undefined {
    if (this.session.isHost) return undefined;
    const ownerSlot = this.senderSlot();
    return snapshot.entities.find((entity) => entity.ownerSlot === ownerSlot);
  }

  private reconcileLocalPlayer(entity: EntitySnapshot): void {
    const game = this.opts.localGame;
    if (!game) return;
    const inputAck = entity.inputAck ?? 0;
    if (inputAck < this.lastLocalInputAck) return;
    this.lastLocalInputAck = inputAck;
    let keep = 0;
    for (let i = 0; i < this.pendingLocalInputs.length; i++) {
      const cmd = this.pendingLocalInputs[i]!;
      if (cmd.seq <= inputAck) continue;
      this.pendingLocalInputs[keep++] = cmd;
    }
    this.pendingLocalInputs.length = keep;
    const before = game.controlledPlayerPosition(game.playerEid);
    const replay = this.replayScratch;
    let replayCount = 0;
    for (const cmd of this.pendingLocalInputs) {
      let step = replay[replayCount];
      if (!step) {
        step = { input: { moveX: 0, moveZ: 0, yaw: 0 }, dt: 0 };
        replay[replayCount] = step;
      }
      writeInputFromButtons(cmd, step.input);
      step.dt = cmd.dtMs / 1000;
      replayCount += 1;
    }
    replay.length = replayCount;
    game.reconcileControlledPlayer(
      game.playerEid,
      { x: entity.x, y: entity.y, z: entity.z, yaw: entity.yaw },
      replay,
    );
    const after = game.controlledPlayerPosition(game.playerEid);
    this.opts.onLocalReconcile?.({
      inputAck,
      pendingInputs: this.pendingLocalInputs.length,
      correctionDistance: Math.hypot(after.x - before.x, after.z - before.z),
      entity,
    });
  }

  private receiverFor(peerId: string): InputReceiver {
    let receiver = this.inputReceivers.get(peerId);
    if (!receiver) {
      receiver = new InputReceiver();
      this.inputReceivers.set(peerId, receiver);
    }
    return receiver;
  }

  private senderSlot(): number {
    return this.localSenderSlot;
  }

  private announcePeerSlots(nowMs: number): void {
    const active = new Set(this.session.peerIds);
    for (const peerId of this.peerSlots.keys()) {
      if (active.has(peerId)) continue;
      this.peerSlots.delete(peerId);
      this.peerSlotAnnounceAt.delete(peerId);
      this.peerAckTicks.delete(peerId);
      this.inputReceivers.delete(peerId);
    }

    for (const peerId of this.session.peerIds) {
      this.announcePeerSlot(peerId, this.slotForPeer(peerId), nowMs);
    }
  }

  private announcePeerSlot(peerId: string, slot: number, nowMs: number, force = false): void {
    const last = this.peerSlotAnnounceAt.get(peerId) ?? -Infinity;
    if (!force && nowMs - last < SLOT_ANNOUNCE_INTERVAL_MS) return;
    this.session.sendReliable(peerId, encodeLobbySlot(slot, { maxSlots: this.maxPeerSlots }));
    this.peerSlotAnnounceAt.set(peerId, nowMs);
  }

  private slotForPeer(peerId: string): number {
    const existing = this.peerSlots.get(peerId);
    if (existing !== undefined) return existing;

    const used = new Set(this.peerSlots.values());
    for (let slot = 1; slot <= this.maxPeerSlots; slot++) {
      if (used.has(slot)) continue;
      this.peerSlots.set(peerId, slot);
      return slot;
    }
    throw new Error(`room is full: no free peer slot for ${peerId}`);
  }

  private playerForPeer(peerId: string, ownerSlot: number): number {
    const existing = this.peerPlayers.get(peerId);
    if (existing !== undefined) return existing;
    const game = this.opts.hostGame;
    if (!game) throw new Error('hostGame is required for host-side peer players');
    const spawn = this.opts.peerSpawn?.(ownerSlot) ?? defaultPeerSpawn(ownerSlot);
    const player = game.addNetworkPlayer(this.nextPeerNetId++, spawn, ownerSlot);
    this.peerPlayers.set(peerId, player.eid);
    return player.eid;
  }
}

export function createGameplaySession(opts: CreateGameplaySessionOptions): GameplayNetDriver {
  let driver: GameplayNetDriver | undefined;
  const session = createSession({
    code: opts.code,
    isHost: opts.isHost,
    iceServers: opts.iceServers,
    iceTransportPolicy: opts.iceTransportPolicy,
    now: opts.now,
    signalingUrl: opts.signalingUrl,
    events: {
      ...opts.events,
      onReliable: (peerId, data) => {
        if (!driver?.handleReliable(peerId, data)) opts.events.onReliable?.(peerId, data);
      },
      onUnreliable: (peerId, data) => {
        driver?.handleUnreliable(peerId, data);
        opts.events.onUnreliable?.(peerId, data);
      },
    },
  });
  driver = new GameplayNetDriver(session, opts);
  return driver;
}
