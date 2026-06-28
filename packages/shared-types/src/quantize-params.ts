/**
 * Wire quantization parameters — the SINGLE source of truth shared by the netcode codec
 * (encode) and every consumer that decodes a snapshot. Changing any value is a wire-format
 * break: bump PROTOCOL_VERSION and roll all peers together. Values per spec 02 §5.2.
 */

/** Bump whenever the wire layout or quantization changes. Peers must match exactly. */
export const PROTOCOL_VERSION = 1;

/**
 * Position: fixed-point int16 centimetres (1 unit = 1 cm) per axis. Range ±327.67 m
 * (covers a ship interior with margin), worst-case round-trip error 0.5 cm < the 1 cm bar.
 */
export const POS_SCALE = 100;
export const POS_MAX = 32767 / POS_SCALE; // 327.67 m per axis
export const POS_MAX_ERROR = 0.5 / POS_SCALE; // 0.005 m

/** A full turn, in radians. */
export const TAU = Math.PI * 2;

/**
 * Yaw: normalized to [0, TAU) and quantized to a uint16 (0..65535 = 0..2π). Players and
 * enemies stay upright, so yaw-only is enough; worst-case error is one quantum.
 */
export const YAW_STEPS = 0xffff;
export const YAW_QUANTUM = TAU / YAW_STEPS;

/** DataChannel-safe payload target — a full snapshot must stay under this. */
export const MTU = 1400;
