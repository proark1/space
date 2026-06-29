import { Channel, MsgType } from '@sl/shared-types';
import { ByteReader, ByteWriter } from '../byte';
import { readHeader, writeHeader } from './header';

export const MAX_LOBBY_SLOTS = 4;

export const LobbyKind = {
  AssignSlot: 1,
} as const;
export type LobbyKind = (typeof LobbyKind)[keyof typeof LobbyKind];

export interface LobbySlotAssignment {
  readonly slot: number;
  readonly maxSlots: number;
}

/** Reliable host -> client lobby control packet assigning the client's stable owner/sender slot. */
export function encodeLobbySlot(
  slot: number,
  opts: { maxSlots?: number } = {},
): Uint8Array<ArrayBuffer> {
  const maxSlots = opts.maxSlots ?? MAX_LOBBY_SLOTS;
  if (!Number.isInteger(slot) || slot < 1 || slot > maxSlots) {
    throw new Error(`slot must be an integer in 1..${maxSlots}`);
  }
  const w = new ByteWriter(12);
  writeHeader(w, {
    msgType: MsgType.Lobby,
    serverTick: 0,
    channelKind: Channel.Reliable,
    senderSlot: 0,
  });
  w.u8(LobbyKind.AssignSlot);
  w.u8(slot);
  w.u8(maxSlots);
  return w.bytes();
}

export function decodeLobbySlot(bytes: Uint8Array): LobbySlotAssignment {
  const r = new ByteReader(bytes);
  const header = readHeader(r);
  if (header.msgType !== MsgType.Lobby) throw new Error(`expected LOBBY packet, got msgType ${header.msgType}`);
  const kind = r.u8();
  if (kind !== LobbyKind.AssignSlot) throw new Error(`unsupported lobby packet kind ${kind}`);
  const slot = r.u8();
  const maxSlots = r.remaining >= 1 ? r.u8() : MAX_LOBBY_SLOTS;
  if (slot < 1 || slot > maxSlots) throw new Error(`invalid assigned slot ${slot}`);
  return { slot, maxSlots };
}
