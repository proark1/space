import { describe, expect, it } from 'vitest';
import { Object3D } from 'three';
import { createGameWorld, spawnPlayer, Transform } from '@sl/ecs';
import { RenderRegistry, syncRenderableObjects } from './syncSystem';

describe('render sync system', () => {
  it('binds an Object3D handle and syncs Transform into it', () => {
    const world = createGameWorld();
    const eid = spawnPlayer(world);
    const object = new Object3D();
    const registry = new RenderRegistry();

    Transform.x[eid] = 1.25;
    Transform.y[eid] = 2.5;
    Transform.z[eid] = -3.75;
    Transform.qw[eid] = 1;

    const handle = registry.bind(world, eid, object);
    expect(registry.get(handle)).toBe(object);

    syncRenderableObjects(world, registry);
    expect(object.position.x).toBeCloseTo(1.25);
    expect(object.position.y).toBeCloseTo(2.5);
    expect(object.position.z).toBeCloseTo(-3.75);
    expect(object.visible).toBe(true);
  });

  it('unbinds the handle so later syncs ignore the object', () => {
    const world = createGameWorld();
    const eid = spawnPlayer(world);
    const object = new Object3D();
    const registry = new RenderRegistry();

    const handle = registry.bind(world, eid, object);
    registry.unbind(world, eid);

    expect(registry.get(handle)).toBeUndefined();
    Transform.x[eid] = 10;
    syncRenderableObjects(world, registry);
    expect(object.position.x).toBe(0);
  });
});
