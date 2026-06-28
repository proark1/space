import { describe, it, expect } from 'vitest';
import {
  InputSendBuffer,
  InputReceiver,
  encodeInputPacket,
  decodeInputPacket,
  MAX_REDUNDANT_INPUTS,
  type InputCmd,
} from './input';
import { applyInput, Buttons, MOVE_SPEED, type CapsuleState } from '../sim/capsule';

function mk(seq: number, over: Partial<InputCmd> = {}): InputCmd {
  return { seq, clientTick: seq, buttons: 0, moveYaw: 0, movePitch: 0, dtMs: 16, ...over };
}

describe('input codec', () => {
  it('round-trips a command within quantization tolerance', () => {
    const back = decodeInputPacket(
      encodeInputPacket([mk(1, { buttons: 0b101, moveYaw: 1.2, movePitch: -0.3 })]),
    ).cmds[0]!;
    expect(back.seq).toBe(1);
    expect(back.buttons).toBe(0b101);
    expect(back.dtMs).toBe(16);
    expect(Math.abs(back.moveYaw - 1.2)).toBeLessThan(0.001);
    expect(Math.abs(back.movePitch - -0.3)).toBeLessThan(0.001);
  });

  it('re-sends only the last 6 commands', () => {
    const buf = new InputSendBuffer();
    for (let i = 0; i < 10; i++) buf.push({ clientTick: i, buttons: 0, moveYaw: 0, movePitch: 0, dtMs: 16 });
    const { cmds } = decodeInputPacket(buf.packet());
    expect(cmds.length).toBe(MAX_REDUNDANT_INPUTS);
    expect(cmds[cmds.length - 1]!.seq).toBe(10);
  });

  it('clamps dt into [1, 50] ms', () => {
    const hi = decodeInputPacket(encodeInputPacket([mk(1, { dtMs: 999 })])).cmds[0]!;
    const lo = decodeInputPacket(encodeInputPacket([mk(2, { dtMs: 0 })])).cmds[0]!;
    expect(hi.dtMs).toBe(50);
    expect(lo.dtMs).toBe(1);
  });
});

describe('host input apply', () => {
  it('applies newest-unseen seqs and ignores already-applied ones', () => {
    const recv = new InputReceiver();
    expect(recv.apply(encodeInputPacket([mk(1), mk(2), mk(3)])).map((c) => c.seq)).toEqual([1, 2, 3]);
    // next packet redundantly re-includes 1..3 plus new 4,5
    expect(recv.apply(encodeInputPacket([mk(1), mk(2), mk(3), mk(4), mk(5)])).map((c) => c.seq)).toEqual([4, 5]);
    expect(recv.lastProcessedSeq).toBe(5);
  });

  it('moves the capsule authoritatively from applied inputs', () => {
    const recv = new InputReceiver();
    const cmds = Array.from({ length: 6 }, (_, i) => mk(i + 1, { buttons: Buttons.Fwd }));
    let state: CapsuleState = { x: 0, z: 0, yaw: 0 };
    for (const c of recv.apply(encodeInputPacket(cmds))) state = applyInput(state, c);
    // 6 forward steps at 16ms, yaw 0 → moves along -z
    expect(state.z).toBeCloseTo(-MOVE_SPEED * 0.016 * 6, 4);
    expect(state.x).toBeCloseTo(0, 6);
  });
});
