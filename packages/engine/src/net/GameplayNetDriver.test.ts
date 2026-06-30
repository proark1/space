import { describe, expect, it } from 'vitest';
import { NetworkId, queryRemotePlayers, Transform } from '@sl/ecs';
import {
  ACK_NEED_FULL,
  ByteReader,
  Buttons,
  decodeAck,
  decodeLobbySlot,
  encodeDelta,
  encodeFull,
  readHeader,
  type Session,
} from '@sl/netcode';
import { EntityType } from '@sl/shared-types';
import { Game } from '../Game';
import { GameplayNetDriver } from './GameplayNetDriver';

function cloneBuffer(data: ArrayBufferView<ArrayBuffer>): ArrayBuffer {
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
}

class FakeSession implements Session {
  unreliablePeer?: (data: ArrayBuffer) => void;
  reliablePeer?: (data: ArrayBuffer) => void;
  unreliablePeers = new Map<string, (data: ArrayBuffer) => void>();
  reliablePeers = new Map<string, (data: ArrayBuffer) => void>();
  unreliablePackets: ArrayBuffer[] = [];
  reliablePackets: ArrayBuffer[] = [];

  constructor(
    readonly code: string,
    readonly isHost: boolean,
    readonly peerIds: readonly string[] = ['peer'],
  ) {}

  tick(): void {}

  sendReliable(_peerId: string, data: ArrayBufferView<ArrayBuffer>): void {
    const packet = cloneBuffer(data);
    this.reliablePackets.push(packet);
    (this.reliablePeers.get(_peerId) ?? this.reliablePeer)?.(packet);
  }

  sendUnreliable(_peerId: string, data: ArrayBufferView<ArrayBuffer>): void {
    const packet = cloneBuffer(data);
    this.unreliablePackets.push(packet);
    (this.unreliablePeers.get(_peerId) ?? this.unreliablePeer)?.(packet);
  }

  broadcastReliable(): void {}

  broadcastUnreliable(data: ArrayBufferView<ArrayBuffer>): void {
    const packet = cloneBuffer(data);
    this.unreliablePackets.push(packet);
    this.unreliablePeer?.(packet);
  }

  leave(): void {}
}

interface DelayedDelivery {
  readonly atMs: number;
  readonly seq: number;
  readonly data: ArrayBuffer;
  readonly deliver: (data: ArrayBuffer) => void;
}

class DelayedNetwork {
  private nowMs = 0;
  private seq = 0;
  private unreliableCount = 0;
  private readonly queue: DelayedDelivery[] = [];

  constructor(
    private readonly latencyMs: number,
    private readonly dropEveryUnreliable = 0,
  ) {}

  get droppedUnreliable(): number {
    return this.unreliableCount > 0 && this.dropEveryUnreliable > 0
      ? Math.floor(this.unreliableCount / this.dropEveryUnreliable)
      : 0;
  }

  enqueue(
    data: ArrayBuffer,
    deliver: (data: ArrayBuffer) => void,
    opts: { unreliable?: boolean } = {},
  ): void {
    if (opts.unreliable) {
      this.unreliableCount++;
      if (this.dropEveryUnreliable > 0 && this.unreliableCount % this.dropEveryUnreliable === 0) return;
    }
    this.queue.push({ atMs: this.nowMs + this.latencyMs, seq: this.seq++, data, deliver });
  }

  advanceTo(nowMs: number): void {
    this.nowMs = nowMs;
    for (;;) {
      this.queue.sort((a, b) => a.atMs - b.atMs || a.seq - b.seq);
      const next = this.queue[0];
      if (!next || next.atMs > nowMs) break;
      this.queue.shift();
      this.nowMs = next.atMs;
      next.deliver(next.data);
    }
    this.nowMs = nowMs;
  }

  drain(maxMs = 5000): void {
    this.advanceTo(this.nowMs + maxMs);
  }
}

const SLOT1_SPAWN = { x: -1.2, y: 1, z: 12 } as const;
const SLOT2_SPAWN = { x: 1.2, y: 1, z: 12 } as const;

describe('GameplayNetDriver', () => {
  it('moves an authoritative host player from client input and replicates it back', async () => {
    const hostGame = await Game.create({ role: 'host' });
    const hostSession = new FakeSession('ROOM01', true, ['client-a']);
    const clientSession = new FakeSession('ROOM01', false, ['host']);
    const hostDriver = new GameplayNetDriver(hostSession, { hostGame });
    const clientDriver = new GameplayNetDriver(clientSession);
    hostSession.unreliablePeer = (data) => clientDriver.handleUnreliable('host', data);
    clientSession.unreliablePeer = (data) => hostDriver.handleUnreliable('client-a', data);
    clientSession.reliablePeer = (data) => hostDriver.handleReliable('client-a', data);

    const startZ = Transform.z[hostGame.playerEid] ?? 0;
    for (let i = 0; i < 12; i++) {
      clientDriver.sendClientInput({ buttons: Buttons.Fwd, yaw: 0, dtMs: 16 });
      hostDriver.tick();
    }

    expect(Transform.z[hostGame.playerEid]).toBe(startZ);
    const hostPeerEid = [...queryRemotePlayers(hostGame.world)][0]!;
    expect(Transform.z[hostPeerEid]).toBeLessThan(12);
    expect(clientDriver.netIdToEid.size).toBe(1); // the local client avatar is reconciled, not rendered as remote
    expect([...clientDriver.netIdToEid.keys()].some((id) => id >= 1000)).toBe(false);
    expect(clientSession.reliablePackets.length).toBeGreaterThan(0);
    expect(hostSession.unreliablePackets.some((packet) => readHeader(new ByteReader(new Uint8Array(packet))).isDelta)).toBe(true);
    hostGame.dispose();
  });

  it('reconciles the local client player from owner-slot snapshots', async () => {
    const hostGame = await Game.create({ role: 'host' });
    const clientGame = await Game.create({ role: 'client', initialPlayerPosition: SLOT1_SPAWN });
    const hostSession = new FakeSession('ROOM01', true, ['client-a']);
    const clientSession = new FakeSession('ROOM01', false, ['host']);
    const reconciles: Array<{ inputAck: number; pendingInputs: number }> = [];
    const hostDriver = new GameplayNetDriver(hostSession, { hostGame });
    const clientDriver = new GameplayNetDriver(clientSession, {
      localGame: clientGame,
      onLocalReconcile: ({ inputAck, pendingInputs }) => reconciles.push({ inputAck, pendingInputs }),
    });
    hostSession.unreliablePeer = (data) => clientDriver.handleUnreliable('host', data);
    clientSession.unreliablePeer = (data) => hostDriver.handleUnreliable('client-a', data);
    clientSession.reliablePeer = (data) => hostDriver.handleReliable('client-a', data);

    for (let i = 0; i < 7; i++) {
      clientDriver.sendClientInput({ buttons: Buttons.Fwd, yaw: 0, dtMs: 16 });
      clientGame.setInput({ moveX: 0, moveZ: 1, yaw: 0 });
      clientGame.stepFixed(0.016, i);
      hostDriver.tick();
    }

    const hostPeerEid = [...queryRemotePlayers(hostGame.world)][0]!;
    expect(reconciles.at(-1)).toEqual({ inputAck: 7, pendingInputs: 0 });
    expect(Transform.x[clientGame.playerEid]).toBeCloseTo(Transform.x[hostPeerEid] ?? 0, 4);
    expect(Math.abs((Transform.z[clientGame.playerEid] ?? 0) - (Transform.z[hostPeerEid] ?? 0))).toBeLessThan(0.02);
    expect([...clientDriver.netIdToEid.keys()].some((id) => id >= 1000)).toBe(false);
    hostGame.dispose();
    clientGame.dispose();
  });

  it('assigns distinct owner slots so multiple clients reconcile only their own avatars', async () => {
    const hostGame = await Game.create({ role: 'host' });
    const clientAGame = await Game.create({ role: 'client', initialPlayerPosition: SLOT1_SPAWN });
    const clientBGame = await Game.create({ role: 'client', initialPlayerPosition: SLOT2_SPAWN });
    const hostSession = new FakeSession('ROOM01', true, ['client-a', 'client-b']);
    const clientASession = new FakeSession('ROOM01', false, ['host']);
    const clientBSession = new FakeSession('ROOM01', false, ['host']);
    const assignedA: number[] = [];
    const assignedB: number[] = [];
    const hostDriver = new GameplayNetDriver(hostSession, { hostGame });
    const clientADriver = new GameplayNetDriver(clientASession, {
      localGame: clientAGame,
      onSlotAssigned: (slot) => assignedA.push(slot),
    });
    const clientBDriver = new GameplayNetDriver(clientBSession, {
      localGame: clientBGame,
      onSlotAssigned: (slot) => assignedB.push(slot),
    });
    hostSession.reliablePeers.set('client-a', (data) => clientADriver.handleReliable('host', data));
    hostSession.reliablePeers.set('client-b', (data) => clientBDriver.handleReliable('host', data));
    hostSession.unreliablePeers.set('client-a', (data) => clientADriver.handleUnreliable('host', data));
    hostSession.unreliablePeers.set('client-b', (data) => clientBDriver.handleUnreliable('host', data));
    clientASession.unreliablePeer = (data) => hostDriver.handleUnreliable('client-a', data);
    clientBSession.unreliablePeer = (data) => hostDriver.handleUnreliable('client-b', data);

    hostDriver.tick(); // reliable slot assignments
    expect(assignedA.at(-1)).toBe(1);
    expect(assignedB.at(-1)).toBe(2);
    expect(decodeLobbySlot(new Uint8Array(hostSession.reliablePackets[0]!))).toEqual({ slot: 1, maxSlots: 4 });
    expect(decodeLobbySlot(new Uint8Array(hostSession.reliablePackets[1]!))).toEqual({ slot: 2, maxSlots: 4 });

    clientADriver.sendClientInput({ buttons: Buttons.Fwd, yaw: 0, dtMs: 16 });
    clientBDriver.sendClientInput({ buttons: Buttons.Right, yaw: 0, dtMs: 16 });
    hostDriver.broadcastHostSnapshot();

    const hostPeerEids = [...queryRemotePlayers(hostGame.world)];
    expect(hostPeerEids.map((eid) => NetworkId.ownerPeer[eid]).sort()).toEqual([1, 2]);
    const netIdBySlot = new Map(hostPeerEids.map((eid): [number, number] => [NetworkId.ownerPeer[eid]!, NetworkId.id[eid]!]));
    expect(clientADriver.netIdToEid.has(netIdBySlot.get(1)!)).toBe(false);
    expect(clientBDriver.netIdToEid.has(netIdBySlot.get(2)!)).toBe(false);
    expect(clientADriver.netIdToEid.has(netIdBySlot.get(2)!)).toBe(true);
    expect(clientBDriver.netIdToEid.has(netIdBySlot.get(1)!)).toBe(true);

    hostGame.dispose();
    clientAGame.dispose();
    clientBGame.dispose();
  });

  it('keeps local reconciliation bounded under 100ms latency and unreliable loss', async () => {
    const hostGame = await Game.create({ role: 'host' });
    const clientGame = await Game.create({ role: 'client', initialPlayerPosition: SLOT1_SPAWN });
    const network = new DelayedNetwork(100, 10);
    const hostSession = new FakeSession('ROOM01', true, ['client-a']);
    const clientSession = new FakeSession('ROOM01', false, ['host']);
    const reconciles: Array<{ inputAck: number; pendingInputs: number; correctionDistance: number }> = [];
    const hostDriver = new GameplayNetDriver(hostSession, { hostGame });
    const clientDriver = new GameplayNetDriver(clientSession, {
      localGame: clientGame,
      onLocalReconcile: ({ inputAck, pendingInputs, correctionDistance }) => {
        reconciles.push({ inputAck, pendingInputs, correctionDistance });
      },
    });
    hostSession.reliablePeers.set('client-a', (data) => {
      network.enqueue(data, (packet) => clientDriver.handleReliable('host', packet));
    });
    hostSession.unreliablePeers.set('client-a', (data) => {
      network.enqueue(data, (packet) => clientDriver.handleUnreliable('host', packet), { unreliable: true });
    });
    clientSession.reliablePeer = (data) => {
      network.enqueue(data, (packet) => hostDriver.handleReliable('client-a', packet));
    };
    clientSession.unreliablePeer = (data) => {
      network.enqueue(data, (packet) => hostDriver.handleUnreliable('client-a', packet), { unreliable: true });
    };

    const dt = 1 / 60;
    for (let frame = 0; frame < 180; frame++) {
      network.advanceTo(frame * 1000 * dt);
      clientDriver.sendClientInput({ buttons: Buttons.Fwd, yaw: 0, dtMs: Math.round(dt * 1000) });
      clientGame.setInput({ moveX: 0, moveZ: 1, yaw: 0 });
      clientGame.stepFixed(dt, frame);
      hostDriver.tick();
      clientDriver.tick();
    }
    network.drain();

    expect(reconciles.length).toBeGreaterThan(20);
    expect(network.droppedUnreliable).toBeGreaterThan(0);
    expect(Math.max(...reconciles.map((r) => r.correctionDistance))).toBeLessThan(0.08);
    expect(reconciles.at(-1)!.inputAck).toBeGreaterThan(150);
    expect(reconciles.at(-1)!.pendingInputs).toBeLessThanOrEqual(12);
    expect(Transform.z[clientGame.playerEid]).toBeLessThan(12);
    expect([...clientDriver.netIdToEid.keys()].some((id) => id >= 1000)).toBe(false);

    hostGame.dispose();
    clientGame.dispose();
  });

  it('interpolates remote entity transforms between received snapshots', () => {
    let now = 0;
    const clientSession = new FakeSession('ROOM01', false, ['host']);
    const clientDriver = new GameplayNetDriver(clientSession, { now: () => now });

    now = 0;
    clientDriver.handleUnreliable(
      'host',
      cloneBuffer(encodeFull({
        tick: 0,
        entities: [{ id: 42, type: EntityType.Player, x: 0, y: 1, z: 0, yaw: 0, anim: 0, hp: 100 }],
      })),
    );
    now = 50;
    clientDriver.handleUnreliable(
      'host',
      cloneBuffer(encodeFull({
        tick: 1,
        entities: [{ id: 42, type: EntityType.Player, x: 10, y: 1, z: 0, yaw: 0, anim: 0, hp: 100 }],
      })),
    );

    const eid = clientDriver.netIdToEid.get(42)!;
    expect(Transform.x[eid]).toBeCloseTo(10, 4); // latest authoritative apply

    const updated = clientDriver.sampleRemoteEntities(125); // renderTime = 25ms
    expect(updated).toContain(eid);
    expect(Transform.x[eid]).toBeCloseTo(5, 4);
  });

  it('requests a full snapshot when a delta base is missing', () => {
    const clientSession = new FakeSession('ROOM01', false, ['host']);
    const clientDriver = new GameplayNetDriver(clientSession);
    const base = {
      tick: 1,
      entities: [{ id: 42, type: EntityType.Player, x: 0, y: 1, z: 0, yaw: 0, anim: 0, hp: 100 }],
    };
    const current = {
      tick: 2,
      entities: [{ id: 42, type: EntityType.Player, x: 10, y: 1, z: 0, yaw: 0, anim: 0, hp: 100 }],
    };

    clientDriver.handleUnreliable('host', cloneBuffer(encodeDelta(current, base)));

    expect(clientSession.reliablePackets.length).toBe(1);
    expect(decodeAck(new Uint8Array(clientSession.reliablePackets[0]!))).toBe(ACK_NEED_FULL);
    expect(clientDriver.netIdToEid.size).toBe(0);
  });
});
