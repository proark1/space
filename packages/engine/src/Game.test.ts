import { describe, expect, it } from 'vitest';
import { Transform, getGameWorldMeta } from '@sl/ecs';
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
});
