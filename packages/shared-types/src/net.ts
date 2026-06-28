/** Top-level message type. Wire values per spec 02 §5.1 — append-only, never renumber. */
export const MsgType = {
  Hello: 1,
  HelloAck: 2,
  Snapshot: 10,
  Input: 11,
  Ack: 12,
  Ping: 20,
  Pong: 21,
  EventHit: 30,
  EventDamage: 31,
  EventDoor: 32,
  EventObjective: 33,
  EventAudio: 34,
  EventChat: 35,
  Lobby: 40,
  Loadout: 41,
  Migrate: 50,
} as const;
export type MsgType = (typeof MsgType)[keyof typeof MsgType];

/** Which negotiated DataChannel a packet travels on (also the header's channelKind nibble). */
export const Channel = {
  Reliable: 0,
  Unreliable: 1,
} as const;
export type Channel = (typeof Channel)[keyof typeof Channel];

/**
 * 8-byte packet header (spec 02 §5.1):
 *   byte0   = (protocolVersion << 4) | channelKind
 *   byte1   = msgType
 *   byte2   = senderSlot
 *   byte3   = flags (bit0 = isDelta)
 *   byte4-7 = serverTick (uint32 LE)
 */
export interface WireHeader {
  readonly protocolVersion: number;
  readonly channelKind: Channel;
  readonly msgType: MsgType;
  readonly senderSlot: number;
  readonly isDelta: boolean;
  readonly serverTick: number;
}

/** Client → host input command (spec 02 §5.5; wire codec lands at T12). */
export interface InputFrame {
  readonly seq: number;
  readonly clientTick: number;
  readonly buttons: number;
  readonly moveYaw: number;
  readonly movePitch: number;
  readonly dtMs: number;
}
