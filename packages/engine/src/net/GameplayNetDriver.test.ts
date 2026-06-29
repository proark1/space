import { describe, expect, it } from 'vitest';
import { Transform } from '@sl/ecs';
import { Buttons, type Session } from '@sl/netcode';
import { Game } from '../Game';
import { GameplayNetDriver } from './GameplayNetDriver';

function cloneBuffer(data: ArrayBufferView<ArrayBuffer>): ArrayBuffer {
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength);
}

class FakeSession implements Session {
  readonly peerIds: readonly string[] = ['peer'];
  peer?: (data: ArrayBuffer) => void;

  constructor(
    readonly code: string,
    readonly isHost: boolean,
  ) {}

  tick(): void {}

  sendReliable(): void {}

  sendUnreliable(_peerId: string, data: ArrayBufferView<ArrayBuffer>): void {
    this.peer?.(cloneBuffer(data));
  }

  broadcastReliable(): void {}

  broadcastUnreliable(data: ArrayBufferView<ArrayBuffer>): void {
    this.peer?.(cloneBuffer(data));
  }

  leave(): void {}
}

describe('GameplayNetDriver', () => {
  it('moves an authoritative host player from client input and replicates it back', async () => {
    const hostGame = await Game.create({ role: 'host' });
    const hostSession = new FakeSession('ROOM01', true);
    const clientSession = new FakeSession('ROOM01', false);
    const hostDriver = new GameplayNetDriver(hostSession, { hostGame });
    const clientDriver = new GameplayNetDriver(clientSession);
    hostSession.peer = (data) => clientDriver.handleUnreliable('host', data);
    clientSession.peer = (data) => hostDriver.handleUnreliable('client-a', data);

    const startZ = Transform.z[hostGame.playerEid] ?? 0;
    for (let i = 0; i < 12; i++) clientDriver.sendClientInput({ buttons: Buttons.Fwd, yaw: 0, dtMs: 16 });

    expect(Transform.z[hostGame.playerEid]).toBeLessThan(startZ);
    expect(clientDriver.netIdToEid.size).toBe(1);
    const clientEid = [...clientDriver.netIdToEid.values()][0]!;
    expect(Transform.z[clientEid]).toBeCloseTo(Transform.z[hostGame.playerEid] ?? 0, 4);
    hostGame.dispose();
  });
});
