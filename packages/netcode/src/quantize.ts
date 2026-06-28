import { POS_SCALE, POS_MAX, TAU, YAW_STEPS } from '@sl/shared-types';
import type { ByteWriter, ByteReader } from './byte';

/** Quantize one position axis (metres) to fixed-point int16 centimetres. */
export function quantizePosAxis(v: number): number {
  const clamped = v < -POS_MAX ? -POS_MAX : v > POS_MAX ? POS_MAX : v;
  return Math.round(clamped * POS_SCALE);
}

/** Inverse of {@link quantizePosAxis}. */
export function dequantizePosAxis(q: number): number {
  return q / POS_SCALE;
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

/** Quantize aim pitch (radians, clamped to ±π) to a signed int16. */
export function quantizePitch(rad: number): number {
  const clamped = rad < -Math.PI ? -Math.PI : rad > Math.PI ? Math.PI : rad;
  return Math.round((clamped / Math.PI) * 32767);
}

/** Inverse of {@link quantizePitch}. */
export function dequantizePitch(q: number): number {
  return (q / 32767) * Math.PI;
}

export function writePos(w: ByteWriter, x: number, y: number, z: number): void {
  w.i16(quantizePosAxis(x));
  w.i16(quantizePosAxis(y));
  w.i16(quantizePosAxis(z));
}

export function readPos(r: ByteReader): { x: number; y: number; z: number } {
  return {
    x: dequantizePosAxis(r.i16()),
    y: dequantizePosAxis(r.i16()),
    z: dequantizePosAxis(r.i16()),
  };
}

export function writeYaw(w: ByteWriter, yaw: number): void {
  w.u16(quantizeYaw(yaw));
}

export function readYaw(r: ByteReader): number {
  return dequantizeYaw(r.u16());
}
