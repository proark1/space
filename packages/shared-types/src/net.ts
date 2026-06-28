/** Top-level message discriminator carried in every packet header. Append-only. */
export const MsgType = {
  Hello: 0,
  Welcome: 1,
  Input: 2,
  Snapshot: 3,
  Event: 4,
  Ping: 5,
  Pong: 6,
  Ack: 7,
  Migrate: 8,
} as const;
export type MsgType = (typeof MsgType)[keyof typeof MsgType];

/** Which negotiated DataChannel a packet travels on. */
export const Channel = {
  Reliable: 0,
  Unreliable: 1,
} as const;
export type Channel = (typeof Channel)[keyof typeof Channel];

export interface PacketHeader {
  readonly type: MsgType;
  /** Host sim tick this packet refers to (uint32, monotonic). */
  readonly tick: number;
}

/** Client → host. The last few frames are sent redundantly on the unreliable channel. */
export interface InputFrame {
  readonly seq: number;
  readonly dtMs: number;
  readonly moveX: number;
  readonly moveY: number;
  readonly yaw: number;
  /** Packed button bitfield (fire, interact, flashlight, …). */
  readonly buttons: number;
}

/** Host → clients. Header for a full or delta snapshot of replicated entities. */
export interface SnapshotHeader {
  readonly tick: number;
  /** 0 = full snapshot; otherwise the baseTick this delta is encoded against. */
  readonly baseTick: number;
  readonly entityCount: number;
}
