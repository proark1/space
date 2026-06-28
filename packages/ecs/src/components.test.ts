import { describe, it, expect } from 'vitest';
import { addEntity, addComponent } from 'bitecs';
import { createGameWorld } from './world';
import { Transform, Health, Limb } from './components';
import { LimbSlot } from './enums';

describe('components', () => {
  it('reads and writes scalar fields independently per entity', () => {
    const w = createGameWorld();
    const a = addEntity(w);
    const b = addEntity(w);
    addComponent(w, Transform, a);
    addComponent(w, Transform, b);
    Transform.x[a] = 1.5;
    Transform.x[b] = -2.5;
    expect(Transform.x[a]).toBeCloseTo(1.5);
    expect(Transform.x[b]).toBeCloseTo(-2.5);
    addComponent(w, Health, a);
    Health.hp[a] = 73;
    Health.max[a] = 100;
    expect(Health.hp[a]).toBe(73);
    expect(Health.max[a]).toBe(100);
  });

  it('reads and writes the strided Limb.hp array per slot', () => {
    const w = createGameWorld();
    const e = addEntity(w);
    addComponent(w, Limb, e);
    Limb.hp[e][LimbSlot.LLeg] = 30;
    Limb.hp[e][LimbSlot.RLeg] = 25;
    expect(Limb.hp[e][LimbSlot.LLeg]).toBe(30);
    expect(Limb.hp[e][LimbSlot.RLeg]).toBe(25);
    expect(Limb.hp[e][LimbSlot.Head]).toBe(0); // untouched slot stays zero
  });
});
