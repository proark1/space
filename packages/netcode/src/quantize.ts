import { POS_BOUND, POS_RANGE, POS_STEPS, TAU, YAW_STEPS } from '@sl/shared-types';
import type { ByteWriter, ByteReader } from './byte';

/** Quantize one position axis (metres) into a uint16 over the world sector. */
export function quantizePosAxis(v: number): number {
  const clamped = v < -POS_BOUND ? -POS_BOUND : v > POS_BOUND ? POS_BOUND : v;
  return Math.round(((clamped + POS_BOUND) / POS_RANGE) * POS_STEPS);
}

/** Inverse of {@link quantizePosAxis}. */
export function dequantizePosAxis(q: number): number {
  return (q / POS_STEPS) * POS_RANGE - POS_BOUND;
}

/** Quantize a yaw (radians, any range) into a uint16 over [0, TAU). */
export function quantizeYaw(rad: number): number {
  let a = rad % TAU;
  if (a < 0) a += TAU;
  return Math.round((a / TAU) * YAW_STEPS) & 0xffff;
}

/** Inverse of {@link quantizeYaw}; returns radians in [0, TAU). */
export function dequantizeYaw(q: number): number {
  return (q / YAW_STEPS) * TAU;
}

export function writePos(w: ByteWriter, x: number, y: number, z: number): void {
  w.u16(quantizePosAxis(x));
  w.u16(quantizePosAxis(y));
  w.u16(quantizePosAxis(z));
}

export function readPos(r: ByteReader): { x: number; y: number; z: number } {
  return {
    x: dequantizePosAxis(r.u16()),
    y: dequantizePosAxis(r.u16()),
    z: dequantizePosAxis(r.u16()),
  };
}

export function writeYaw(w: ByteWriter, yaw: number): void {
  w.u16(quantizeYaw(yaw));
}

export function readYaw(r: ByteReader): number {
  return dequantizeYaw(r.u16());
}
