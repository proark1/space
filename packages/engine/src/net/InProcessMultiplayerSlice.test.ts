import { describe, expect, it } from 'vitest';
import { Transform } from '@sl/ecs';
import { Buttons } from '@sl/netcode';
import { Game } from '../Game';
import { InProcessMultiplayerSlice } from './InProcessMultiplayerSlice';

describe('InProcessMultiplayerSlice', () => {
  it('moves the host player from encoded client input and applies the ECS snapshot', async () => {
    const game = await Game.create({ role: 'host' });
    const slice = new InProcessMultiplayerSlice(game);
    const startZ = Transform.z[game.playerEid] ?? 0;

    let updated: readonly number[] = [];
    for (let i = 0; i < 12; i++) {
      const result = slice.step({ buttons: Buttons.Fwd, yaw: 0, dtMs: 16 });
      updated = result.updatedEids;
    }

    expect(slice.receiver.lastProcessedSeq).toBe(12);
    expect(updated).toContain(game.playerEid);
    expect(Transform.z[game.playerEid]).toBeLessThan(startZ);
    game.dispose();
  });
});
