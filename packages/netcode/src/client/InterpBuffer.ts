import { TAU } from '@sl/shared-types';
import type { CapsuleState } from '../sim/capsule';

/**
 * Interpolation buffer for REMOTE entities (backlog T14). Snapshots arrive at ~20 Hz with
 * jitter; we render each remote entity ~100 ms in the past, lerping position and slerping yaw
 * between the two buffered samples that bracket that moment, so others glide instead of
 * teleporting. We never extrapolate: past the last sample, or across a gap wider than the freeze
 * threshold, the pose is held.
 */

export const INTERP_DELAY_MS = 100;
export const FREEZE_GAP_MS = 300;

interface Sample {
  time: number;
  state: CapsuleState;
}

/** Shortest-arc angle interpolation. */
function lerpAngle(a: number, b: number, t: number): number {
  let d = (((b - a) % TAU) + TAU) % TAU;
  if (d > Math.PI) d -= TAU;
  return a + d * t;
}

function lerpState(a: CapsuleState, b: CapsuleState, t: number): CapsuleState {
  return {
    x: a.x + (b.x - a.x) * t,
    z: a.z + (b.z - a.z) * t,
    yaw: lerpAngle(a.yaw, b.yaw, t),
  };
}

export class InterpBuffer {
  private samples: Sample[] = [];

  constructor(private readonly delayMs = INTERP_DELAY_MS) {}

  /** Buffer a remote snapshot, timestamped on the local interpolation timeline. */
  push(time: number, state: CapsuleState): void {
    this.samples.push({ time, state: { ...state } });
    this.samples.sort((a, b) => a.time - b.time);
    const cutoff = time - 1000;
    while (this.samples.length > 2 && this.samples[0]!.time < cutoff) this.samples.shift();
  }

  /** Interpolated state at renderTime = now - delay, or null if the buffer is empty. */
  sample(now: number): CapsuleState | null {
    if (this.samples.length === 0) return null;
    const renderTime = now - this.delayMs;

    let a: Sample | null = null;
    let b: Sample | null = null;
    for (const s of this.samples) {
      if (s.time <= renderTime) a = s;
      if (s.time >= renderTime && b === null) b = s;
    }

    if (a && b && a !== b) {
      const span = b.time - a.time;
      if (span > FREEZE_GAP_MS) return { ...a.state }; // gap too wide → freeze, don't slide across it
      const t = (renderTime - a.time) / span;
      return lerpState(a.state, b.state, t);
    }
    if (a) return { ...a.state }; // past the newest sample → freeze, never extrapolate
    return b ? { ...b.state } : null; // before the oldest → snap to it
  }

  get size(): number {
    return this.samples.length;
  }
}
