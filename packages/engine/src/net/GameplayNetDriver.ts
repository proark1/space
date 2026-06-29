import { createGameWorld, type GameWorld } from '@sl/ecs';
import {
  Buttons,
  InputReceiver,
  InputSendBuffer,
  applySnapshotToEcs,
  buildSnapshotFromEcs,
  createSession,
  decodeFull,
  encodeFull,
  readHeader,
  ByteReader,
  type InputCmd,
  type Session,
  type SessionEvents,
  type WorldSnapshot,
} from '@sl/netcode';
import { MsgType } from '@sl/shared-types';
import type { Game } from '../Game';
import type { MoveInput } from '../player/PlayerController';

export interface ClientInputIntent {
  readonly buttons: number;
  readonly yaw?: number;
  readonly pitch?: number;
  readonly dtMs?: number;
}

export interface GameplayNetDriverOptions {
  readonly hostGame?: Game;
  readonly clientWorld?: GameWorld;
  readonly senderSlot?: number;
  readonly onSnapshot?: (snapshot: WorldSnapshot, result: ReturnType<typeof applySnapshotToEcs>) => void;
  readonly onHostInput?: (peerId: string, cmds: readonly InputCmd[]) => void;
}

export interface CreateGameplaySessionOptions extends GameplayNetDriverOptions {
  readonly code: string;
  readonly isHost: boolean;
  readonly iceServers: RTCIceServer[];
  readonly events: SessionEvents;
  readonly now?: () => number;
}

function inputFromButtons(cmd: InputCmd): MoveInput {
  return {
    moveX: (cmd.buttons & Buttons.Right ? 1 : 0) - (cmd.buttons & Buttons.Left ? 1 : 0),
    moveZ: (cmd.buttons & Buttons.Fwd ? 1 : 0) - (cmd.buttons & Buttons.Back ? 1 : 0),
    yaw: cmd.moveYaw,
    jump: (cmd.buttons & Buttons.Jump) !== 0,
  };
}

function packetType(data: ArrayBuffer): number | undefined {
  try {
    return readHeader(new ByteReader(new Uint8Array(data))).msgType;
  } catch {
    return undefined;
  }
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
  private readonly peerPlayers = new Map<string, number>();
  private snapshotTick = 0;
  private nextPeerNetId = 1000;

  constructor(
    readonly session: Session,
    private readonly opts: GameplayNetDriverOptions = {},
  ) {
    this.clientWorld = opts.clientWorld ?? createGameWorld('client');
  }

  handleUnreliable(peerId: string, data: ArrayBuffer): void {
    const msgType = packetType(data);
    if (this.session.isHost) {
      if (msgType !== MsgType.Input || !this.opts.hostGame) return;
      const receiver = this.receiverFor(peerId);
      const player = this.playerForPeer(peerId);
      const cmds = receiver.apply(new Uint8Array(data));
      for (const cmd of cmds) {
        this.opts.hostGame.stepControlledPlayer(player, inputFromButtons(cmd), cmd.dtMs / 1000, cmd.clientTick);
      }
      this.opts.onHostInput?.(peerId, cmds);
      this.broadcastHostSnapshot();
      return;
    }

    if (msgType !== MsgType.Snapshot) return;
    const snapshot = decodeFull(new Uint8Array(data));
    const result = applySnapshotToEcs(this.clientWorld, snapshot, this.netIdToEid, { despawnMissing: true });
    this.opts.onSnapshot?.(snapshot, result);
  }

  sendClientInput(intent: ClientInputIntent): void {
    if (this.session.isHost) return;
    this.inputSend.push({
      clientTick: this.inputSend.lastSeq,
      buttons: intent.buttons,
      moveYaw: intent.yaw ?? 0,
      movePitch: intent.pitch ?? 0,
      dtMs: intent.dtMs ?? 16,
    });
    const packet = new Uint8Array(this.inputSend.packet({ senderSlot: this.opts.senderSlot ?? 1 }));
    this.session.broadcastUnreliable(packet);
  }

  broadcastHostSnapshot(): WorldSnapshot | undefined {
    const game = this.opts.hostGame;
    if (!this.session.isHost || !game) return undefined;
    const snapshot = buildSnapshotFromEcs(game.world, this.snapshotTick++);
    this.session.broadcastUnreliable(encodeFull(snapshot, { senderSlot: this.opts.senderSlot ?? 0 }));
    return snapshot;
  }

  tick(): void {
    this.session.tick();
    if (this.session.isHost) this.broadcastHostSnapshot();
  }

  leave(): void {
    this.session.leave();
  }

  private receiverFor(peerId: string): InputReceiver {
    let receiver = this.inputReceivers.get(peerId);
    if (!receiver) {
      receiver = new InputReceiver();
      this.inputReceivers.set(peerId, receiver);
    }
    return receiver;
  }

  private playerForPeer(peerId: string): number {
    const existing = this.peerPlayers.get(peerId);
    if (existing !== undefined) return existing;
    const game = this.opts.hostGame;
    if (!game) throw new Error('hostGame is required for host-side peer players');
    const offset = this.peerPlayers.size + 1;
    const player = game.addNetworkPlayer(this.nextPeerNetId++, { x: offset * 0.8, y: 1, z: 12 });
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
    now: opts.now,
    events: {
      ...opts.events,
      onUnreliable: (peerId, data) => {
        driver?.handleUnreliable(peerId, data);
        opts.events.onUnreliable?.(peerId, data);
      },
    },
  });
  driver = new GameplayNetDriver(session, opts);
  return driver;
}
