/**
 * Wire quantization parameters — the SINGLE source of truth shared by the netcode
 * codec (which encodes) and every consumer that decodes a snapshot. Changing any
 * value here is a wire-format break: bump PROTOCOL_VERSION and roll all peers together.
 */

/** Bump whenever the wire layout or quantization changes. Peers must match exactly. */
export const PROTOCOL_VERSION = 1;

/**
 * Position: each axis is quantized to a uint16 across a symmetric world sector
 * [-POS_BOUND, +POS_BOUND] metres. Worst-case round-trip error is half a quantum:
 *   (POS_RANGE / POS_STEPS) / 2 = 1024 / 65535 / 2 ≈ 0.0078 m  (target: < 0.01 m).
 */
export const POS_BOUND = 512;
export const POS_RANGE = POS_BOUND * 2;
export const POS_STEPS = 0xffff;
export const POS_MAX_ERROR = POS_RANGE / POS_STEPS / 2;

/** A full turn, in radians. */
export const TAU = Math.PI * 2;

/**
 * Yaw: normalized to [0, TAU) and quantized to a uint16. Quantum = TAU / YAW_STEPS;
 * worst-case round-trip error is half a quantum (target: ≤ TAU / 65535 rad).
 */
export const YAW_STEPS = 0xffff;
export const YAW_QUANTUM = TAU / YAW_STEPS;

/** DataChannel-safe payload target — a full snapshot must stay under this. */
export const MTU = 1400;
