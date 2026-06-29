import { describe, expect, it } from 'vitest';
import { NetworkId, Transform, getGameWorldMeta, queryRemotePlayers } from '@sl/ecs';
import { Game } from './Game';

describe('Game', () => {
  it('starts the loop when entering inShip and stops it when leaving', async () => {
    let frameCb: ((timeMs: number) => void) | null = null;
    const game = await Game.create({
      requestFrame: (cb) => {
        frameCb = cb;
        return 1;
      },
      cancelFrame: () => {
        frameCb = null;
      },
    });

    expect(game.isRunning).toBe(false);
    game.send('HOST_ROOM');
    game.send('START_LAUNCH');
    game.send('DOCKED');
    game.send('ENTER_SHIP');
    expect(game.isRunning).toBe(true);
    expect(frameCb).not.toBeNull();

    game.send('WIN');
    expect(game.isRunning).toBe(false);
    expect(frameCb).toBeNull();
    game.dispose();
  });

  it('steps player input through physics and writes ECS Transform', async () => {
    const game = await Game.create({
      role: 'host',
      requestFrame: () => 1,
      cancelFrame: () => {},
    });
    expect(getGameWorldMeta(game.world).role).toBe('host');

    game.send('HOST_ROOM');
    game.send('START_LAUNCH');
    game.send('DOCKED');
    game.send('ENTER_SHIP');

    const startZ = Transform.z[game.playerEid];
    game.setInput({ moveX: 0, moveZ: 1, yaw: 0 });
    for (let i = 0; i < 10; i++) game.advance(1 / 60);

    expect(Transform.z[game.playerEid]).toBeLessThan(startZ);
    game.dispose();
  });

  it('supports externally owned fixed-step drivers', async () => {
    const ticks: number[] = [];
    const game = await Game.create({
      role: 'host',
      onFixedStep: (_dt, tick) => ticks.push(tick),
    });

    const startZ = Transform.z[game.playerEid];
    game.setInput({ moveX: 0, moveZ: 1, yaw: 0 });
    for (let i = 0; i < 10; i++) game.stepFixed(1 / 60);

    expect(ticks).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(Transform.z[game.playerEid]).toBeLessThan(startZ);
    expect(game.isRunning).toBe(false);
    game.dispose();
  });

  it('can step an additional network-controlled player', async () => {
    const game = await Game.create({ role: 'host' });
    const remote = game.addNetworkPlayer(9001, { x: 1, y: 1, z: 12 });
    const localStartZ = Transform.z[game.playerEid];
    const remoteStartZ = Transform.z[remote.eid];

    for (let i = 0; i < 10; i++) game.stepControlledPlayer(remote.eid, { moveX: 0, moveZ: 1, yaw: 0 }, 1 / 60);

    expect(NetworkId.id[remote.eid]).toBe(9001);
    expect([...queryRemotePlayers(game.world)]).toContain(remote.eid);
    expect(Transform.z[game.playerEid]).toBe(localStartZ);
    expect(Transform.z[remote.eid]).toBeLessThan(remoteStartZ);
    game.dispose();
  });

  it('can reconcile a controlled player pose and replay pending inputs', async () => {
    const game = await Game.create({ role: 'client', initialPlayerPosition: { x: 0, y: 1, z: 12 } });

    game.reconcileControlledPlayer(
      game.playerEid,
      { x: 2, y: 1, z: 8, yaw: 0 },
      [{ input: { moveX: 0, moveZ: 1, yaw: 0 }, dt: 1 / 60 }],
    );

    expect(Transform.x[game.playerEid]).toBeCloseTo(2, 4);
    expect(Transform.z[game.playerEid]).toBeLessThan(8);
    game.dispose();
  });
});
