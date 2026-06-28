import type { InputCmd } from '../wire/input';

/** Button bitfield carried in an InputCmd (spec 02 §5.5). */
export const Buttons = {
  Fwd: 1 << 0,
  Back: 1 << 1,
  Left: 1 << 2,
  Right: 1 << 3,
  Sprint: 1 << 4,
  Crouch: 1 << 5,
  Jump: 1 << 6,
  Fire: 1 << 7,
  AltFire: 1 << 8,
  Reload: 1 << 9,
  Interact: 1 << 10,
  Flashlight: 1 << 11,
  Melee: 1 << 12,
} as const;

export const MOVE_SPEED = 4; // m/s walk
export const SPRINT_MULT = 1.8;

export interface CapsuleState {
  x: number;
  z: number;
  yaw: number;
}

/**
 * Deterministic planar kinematic step — the M0 "capsule on a plane". Movement is relative to
 * the aim yaw; identical inputs always produce identical output (host-authoritative + the basis
 * for client prediction at T13). Rapier's KCC replaces this integrator at T23 (M1).
 */
export function applyInput(state: CapsuleState, cmd: InputCmd): CapsuleState {
  const dt = (cmd.dtMs < 1 ? 1 : cmd.dtMs > 50 ? 50 : cmd.dtMs) / 1000;
  let mx = 0;
  let mz = 0;
  if (cmd.buttons & Buttons.Fwd) mz -= 1;
  if (cmd.buttons & Buttons.Back) mz += 1;
  if (cmd.buttons & Buttons.Left) mx -= 1;
  if (cmd.buttons & Buttons.Right) mx += 1;
  if (mx === 0 && mz === 0) return { ...state, yaw: cmd.moveYaw };

  const len = Math.hypot(mx, mz);
  const speed = MOVE_SPEED * (cmd.buttons & Buttons.Sprint ? SPRINT_MULT : 1);
  const sin = Math.sin(cmd.moveYaw);
  const cos = Math.cos(cmd.moveYaw);
  const wx = (mx * cos - mz * sin) / len;
  const wz = (mx * sin + mz * cos) / len;
  return {
    x: state.x + wx * speed * dt,
    z: state.z + wz * speed * dt,
    yaw: cmd.moveYaw,
  };
}
