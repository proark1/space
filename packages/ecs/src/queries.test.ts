import { describe, it, expect } from 'vitest';
import { addEntity, addComponent } from 'bitecs';
import { createGameWorld } from './world';
import { buildPlayer, buildStalker } from './prefabs';
import {
  queryTransforms,
  queryReplicated,
  queryLocalPlayers,
  queryRemotePlayers,
  queryEnemies,
} from './queries';
import { RemotePlayer, Transform } from './components';

describe('core queries', () => {
  it('returns the spawned entities matching each term set', () => {
    const w = createGameWorld();
    const player = addEntity(w);
    buildPlayer(w, player);
    const stalker = addEntity(w);
    buildStalker(w, stalker);

    expect([...queryLocalPlayers(w)]).toContain(player);
    expect([...queryLocalPlayers(w)]).not.toContain(stalker);

    expect([...queryEnemies(w)]).toContain(stalker);
    expect([...queryEnemies(w)]).not.toContain(player);

    const transforms = [...queryTransforms(w)];
    expect(transforms).toContain(player);
    expect(transforms).toContain(stalker);

    const replicated = [...queryReplicated(w)];
    expect(replicated).toContain(player);
    expect(replicated).toContain(stalker);
  });

  it('returns a stable result across repeated (cached) calls', () => {
    const w = createGameWorld();
    const e = addEntity(w);
    buildPlayer(w, e);
    expect([...queryLocalPlayers(w)]).toEqual([...queryLocalPlayers(w)]);
  });

  it('reflects entities as their components are added', () => {
    const w = createGameWorld();
    expect([...queryRemotePlayers(w)]).toHaveLength(0);
    const e = addEntity(w);
    addComponent(w, e, RemotePlayer);
    addComponent(w, e, Transform);
    expect([...queryRemotePlayers(w)]).toContain(e);
  });
});
