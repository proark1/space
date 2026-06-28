import { PROTOCOL_VERSION, Channel } from '@sl/shared-types';
import type { MsgType, WireHeader } from '@sl/shared-types';
import type { ByteWriter, ByteReader } from '../byte';

/** Write the 8-byte packet header (spec 02 §5.1). */
export function writeHeader(
  w: ByteWriter,
  h: {
    msgType: MsgType;
    serverTick: number;
    channelKind?: Channel;
    senderSlot?: number;
    isDelta?: boolean;
  },
): void {
  const channelKind = h.channelKind ?? Channel.Unreliable;
  w.u8(((PROTOCOL_VERSION & 0xf) << 4) | (channelKind & 0xf));
  w.u8(h.msgType & 0xff);
  w.u8((h.senderSlot ?? 0) & 0xff);
  w.u8(h.isDelta ? 1 : 0);
  w.u32(h.serverTick);
}

export function readHeader(r: ByteReader): WireHeader {
  const magic = r.u8();
  const msgType = r.u8() as MsgType;
  const senderSlot = r.u8();
  const flags = r.u8();
  const serverTick = r.u32();
  return {
    protocolVersion: (magic >> 4) & 0xf,
    channelKind: (magic & 0xf) as Channel,
    msgType,
    senderSlot,
    isDelta: (flags & 1) === 1,
    serverTick,
  };
}
