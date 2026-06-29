import { describe, it, expect } from 'vitest';
import { PhysicsWorld } from './PhysicsWorld';
import { syncBodyToTransform } from './physicsSync';
import { Transform } from '@sl/ecs';

describe('PhysicsWorld', () => {
  it('steps a dynamic box under gravity and lands it on the ground', async () => {
    const pw = await PhysicsWorld.create();
    pw.addGround();
    const box = pw.addDynamicBox({ x: 0, y: 5, z: 0 });
    for (let i = 0; i < 180; i++) pw.step();
    const y = box.body.translation().y;
    expect(y).toBeGreaterThan(0); // rests above the ground plane (top at y=0)
    expect(y).toBeLessThan(1.2); // …and well below its 5m drop height — it fell and settled
    pw.dispose();
  });

  it('produces identical transforms for two identical-input runs (determinism)', async () => {
    const run = async (): Promise<{ box: { x: number; y: number; z: number }; char: { x: number; y: number; z: number } }> => {
      const pw = await PhysicsWorld.create();
      pw.addGround();
      const box = pw.addDynamicBox({ x: 0.25, y: 5, z: -0.1 });
      pw.addStaticBox({ x: 2, y: 1, z: 0 }, { x: 0.3, y: 2, z: 3 });
      const char = pw.addCharacter({ x: 0, y: 1, z: 0 });
      for (let i = 0; i < 120; i++) {
        pw.moveCharacter(char, { x: 0.05, y: -0.02, z: 0.01 });
        pw.step();
      }
      const result = { box: { ...box.body.translation() }, char: { ...char.body.translation() } };
      pw.dispose();
      return result;
    };
    const a = await run();
    const b = await run();
    expect(a.box).toEqual(b.box);
    expect(a.char).toEqual(b.char);
    expect(a.box.y).toBeLessThan(5); // the box actually moved (fell), so this isn't a trivial match
  });

  it('KCC capsule slides against a static wall instead of passing through it', async () => {
    const pw = await PhysicsWorld.create();
    pw.addGround();
    pw.addStaticBox({ x: 2, y: 1, z: 0 }, { x: 0.3, y: 2, z: 3 }); // wall, left face at x≈1.7
    const char = pw.addCharacter({ x: 0, y: 1, z: 0 });
    for (let i = 0; i < 120; i++) {
      pw.moveCharacter(char, { x: 0.1, y: 0, z: 0 }); // push right into the wall
      pw.step();
    }
    const x = char.body.translation().x;
    expect(x).toBeLessThan(1.6); // blocked short of the wall (unobstructed it would reach ~12)
    pw.dispose();
  });

  it('syncBodyToTransform writes the body transform into ECS Transform', async () => {
    const pw = await PhysicsWorld.create();
    const box = pw.addDynamicBox({ x: 1.5, y: 2.5, z: -3.5 });
    const eid = 7;
    syncBodyToTransform(eid, box.body);
    expect(Transform.x[eid]).toBeCloseTo(1.5, 5);
    expect(Transform.y[eid]).toBeCloseTo(2.5, 5);
    expect(Transform.z[eid]).toBeCloseTo(-3.5, 5);
    expect(Transform.qw[eid]).toBeCloseTo(1, 5); // identity rotation
    pw.dispose();
  });
});
