import { describe, expect, it } from 'vitest';
import { createGameWorld, getGameWorldMeta } from './world';

describe('createGameWorld', () => {
  it('stores world role metadata without mutating the bitECS world shape', () => {
    const host = createGameWorld('host');
    const client = createGameWorld('client');

    expect(getGameWorldMeta(host).role).toBe('host');
    expect(getGameWorldMeta(client).role).toBe('client');
  });

  it('defaults to a local lookdev/single-player world', () => {
    const world = createGameWorld();
    expect(getGameWorldMeta(world).role).toBe('local');
  });
});
