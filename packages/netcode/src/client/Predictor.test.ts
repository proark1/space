import { describe, it, expect } from 'vitest';
import { Predictor } from './Predictor';
import { applyInput, Buttons, type CapsuleState } from '../sim/capsule';
import type { InputCmd } from '../wire/input';

function cmd(seq: number, buttons: number, moveYaw = 0): InputCmd {
  return { seq, clientTick: seq, buttons, moveYaw, movePitch: 0, dtMs: 16 };
}

describe('Predictor', () => {
  it('reconciles to exactly the prediction when the host applied the same inputs (no rubber-band)', () => {
    const initial: CapsuleState = { x: 0, z: 0, yaw: 0 };
    const p = new Predictor(initial, {
      forceSnapDistance: 1,
      onForceSnap: () => {
        throw new Error('must not force-snap on a clean reconcile');
      },
    });
    const inputs = Array.from({ length: 12 }, (_, i) => cmd(i + 1, Buttons.Right, 0.3));
    for (const c of inputs) p.predict(c);
    const before = { ...p.predicted };

    // the host is ~6 inputs behind (≈100ms @60Hz): it has applied all but the last 6
    let auth: CapsuleState = { ...initial };
    let acked = 0;
    for (const c of inputs.slice(0, inputs.length - 6)) {
      auth = applyInput(auth, c);
      acked = c.seq;
    }

    const reconciled = p.reconcile(auth, acked);
    expect(reconciled.x).toBeCloseTo(before.x, 9);
    expect(reconciled.z).toBeCloseTo(before.z, 9);
    expect(reconciled.yaw).toBeCloseTo(before.yaw, 9);
    expect(p.pendingCount).toBe(6); // the unacked tail stays buffered for the next reconcile
  });

  it('force-snaps once (logs once) on chronic desync', () => {
    let snaps = 0;
    const p = new Predictor(
      { x: 0, z: 0, yaw: 0 },
      { forceSnapDistance: 1, onForceSnap: () => snaps++ },
    );
    for (let i = 1; i <= 5; i++) p.predict(cmd(i, Buttons.Fwd));
    p.reconcile({ x: 100, z: 0, yaw: 0 }, 5); // wildly different authoritative state
    p.reconcile({ x: 200, z: 0, yaw: 0 }, 5); // still diverging
    expect(snaps).toBe(1);
    expect(p.predicted.x).toBe(200); // state always follows the authoritative truth
  });
});
