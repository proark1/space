import { describe, expect, it } from 'vitest';
import { createGameWorld, Health, NetworkId, PlayerState, spawnPlayer, Transform } from '@sl/ecs';
import { applySnapshotToMappedEcs, buildSnapshotFromEcs } from './ecsSnapshot';

describe('ecs snapshot bridge', () => {
  it('builds a wire snapshot from replicated ECS rows', () => {
    const world = createGameWorld('host');
    const eid = spawnPlayer(world);
    NetworkId.id[eid] = 42;
    NetworkId.archetype[eid] = 1;
    Transform.x[eid] = 1.5;
    Transform.y[eid] = 2.5;
    Transform.z[eid] = -3.5;
    Transform.qy[eid] = Math.sin(Math.PI / 4);
    Transform.qw[eid] = Math.cos(Math.PI / 4);
    Health.hp[eid] = 87;
    PlayerState.status[eid] = 3;

    const snap = buildSnapshotFromEcs(world, 123);
    expect(snap.tick).toBe(123);
    expect(snap.entities).toEqual([
      expect.objectContaining({
        id: 42,
        type: 1,
        x: 1.5,
        y: 2.5,
        z: -3.5,
        hp: 87,
        anim: 3,
      }),
    ]);
    expect(snap.entities[0]!.yaw).toBeCloseTo(Math.PI / 2, 5);
  });

  it('applies a snapshot onto already mapped ECS entities', () => {
    const world = createGameWorld('client');
    const eid = spawnPlayer(world);
    const updated = applySnapshotToMappedEcs(
      {
        tick: 9,
        entities: [{ id: 77, type: 1, x: -2, y: 1.25, z: 4, yaw: Math.PI, hp: 55, anim: 2 }],
      },
      new Map([[77, eid]]),
    );

    expect(updated).toEqual([eid]);
    expect(NetworkId.id[eid]).toBe(77);
    expect(Transform.x[eid]).toBe(-2);
    expect(Transform.z[eid]).toBe(4);
    expect(Transform.qy[eid]).toBeCloseTo(1, 5);
    expect(Health.hp[eid]).toBe(55);
    expect(PlayerState.status[eid]).toBe(2);
  });
});
