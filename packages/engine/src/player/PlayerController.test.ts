import { describe, it, expect } from 'vitest';
import { PhysicsWorld } from '../physics/PhysicsWorld';
import { PlayerController, type MoveInput } from './PlayerController';

const DT = 1 / 60;

/** A corridor-ish world: ground + the player capsule at the origin (eye-less, just the body). */
async function makeWorld() {
  const pw = await PhysicsWorld.create();
  pw.addGround();
  const char = pw.addCharacter({ x: 0, y: 1, z: 0 });
  return { pw, char };
}

/** Drive `steps` fixed ticks of a constant input, returning the final body translation. */
function drive(
  pw: PhysicsWorld,
  char: Awaited<ReturnType<typeof makeWorld>>['char'],
  ctrl: PlayerController,
  input: MoveInput,
  steps: number,
): { x: number; y: number; z: number } {
  for (let i = 0; i < steps; i++) {
    ctrl.applyInput(pw, char, input, DT);
    pw.step();
  }
  return { ...char.body.translation() };
}

describe('PlayerController', () => {
  it('walks forward along -Z when yaw is 0 and moveZ is +1', async () => {
    const { pw, char } = await makeWorld();
    const ctrl = new PlayerController();
    const end = drive(pw, char, ctrl, { moveX: 0, moveZ: 1, yaw: 0 }, 60);
    expect(end.z).toBeLessThan(-2); // ~3.2 m/s for 1s, minus a little ramp
    expect(Math.abs(end.x)).toBeLessThan(0.05); // no lateral drift
    expect(ctrl.isGrounded).toBe(true);
    pw.dispose();
  });

  it('rotates movement by yaw (yaw=π/2, moveZ=+1 ⇒ travels -X)', async () => {
    const { pw, char } = await makeWorld();
    const ctrl = new PlayerController();
    const end = drive(pw, char, ctrl, { moveX: 0, moveZ: 1, yaw: Math.PI / 2 }, 60);
    expect(end.x).toBeLessThan(-2);
    expect(Math.abs(end.z)).toBeLessThan(0.05);
    pw.dispose();
  });

  it('normalises diagonals so they are not faster than a cardinal move', async () => {
    const cardinal = await makeWorld();
    const cEnd = drive(cardinal.pw, cardinal.char, new PlayerController(), { moveX: 0, moveZ: 1, yaw: 0 }, 60);
    const cardinalDist = Math.hypot(cEnd.x, cEnd.z);
    cardinal.pw.dispose();

    const diag = await makeWorld();
    const dEnd = drive(diag.pw, diag.char, new PlayerController(), { moveX: 1, moveZ: 1, yaw: 0 }, 60);
    const diagDist = Math.hypot(dEnd.x, dEnd.z);
    diag.pw.dispose();

    // Without normalisation the diagonal would cover √2× (~4.5m). Clamped, it must not exceed the
    // cardinal distance (the KCC's collide-and-slide trims a little off a diagonal+ground-probe move),
    // and must still be clearly more than half — i.e. it genuinely travelled diagonally.
    expect(diagDist).toBeLessThanOrEqual(cardinalDist + 0.05);
    expect(diagDist).toBeGreaterThan(cardinalDist * 0.8);
  });

  it('slides against a wall instead of passing through it', async () => {
    const pw = await PhysicsWorld.create();
    pw.addGround();
    pw.addStaticBox({ x: 0, y: 1, z: -3 }, { x: 3, y: 2, z: 0.3 }); // wall across the hall, face at z≈-2.7
    const char = pw.addCharacter({ x: 0, y: 1, z: 0 });
    const ctrl = new PlayerController();
    const end = drive(pw, char, ctrl, { moveX: 0, moveZ: 1, yaw: 0 }, 180); // push into it for 3s
    expect(end.z).toBeGreaterThan(-2.6); // blocked short of the wall (unobstructed it would pass ~-9)
    pw.dispose();
  });

  it('falls under gravity and settles grounded on the floor', async () => {
    const pw = await PhysicsWorld.create();
    pw.addGround();
    const char = pw.addCharacter({ x: 0, y: 3, z: 0 }); // dropped 2m above its rest height
    const ctrl = new PlayerController();
    const end = drive(pw, char, ctrl, { moveX: 0, moveZ: 0, yaw: 0 }, 120);
    expect(end.y).toBeGreaterThan(0.9); // capsule rest centre is radius+halfHeight = 1.0 above y=0
    expect(end.y).toBeLessThan(1.1);
    expect(ctrl.isGrounded).toBe(true);
    pw.dispose();
  });

  it('is deterministic — identical input sequences produce identical transforms', async () => {
    const run = async (): Promise<{ x: number; y: number; z: number }> => {
      const pw = await PhysicsWorld.create();
      pw.addGround();
      pw.addStaticBox({ x: 1.6, y: 1, z: 0 }, { x: 0.2, y: 2, z: 5 }); // a wall to slide along
      const char = pw.addCharacter({ x: 0, y: 1, z: 0 });
      const ctrl = new PlayerController();
      for (let i = 0; i < 200; i++) {
        const input: MoveInput = {
          moveX: Math.sin(i * 0.05),
          moveZ: 1,
          yaw: i * 0.01,
          jump: i % 73 === 0,
        };
        ctrl.applyInput(pw, char, input, DT);
        pw.step();
      }
      const t = { ...char.body.translation() };
      pw.dispose();
      return t;
    };
    const a = await run();
    const b = await run();
    expect(a).toEqual(b);
    expect(a.z).toBeLessThan(-1); // actually traversed, so the match isn't trivial
  });
});
