import { Channel, MsgType } from '@sl/shared-types';
import { ByteReader, ByteWriter } from '../byte';
import { readHeader, writeHeader } from './header';

/** ACK body sentinel: client could not apply a delta and needs the next snapshot as a full keyframe. */
export const ACK_NEED_FULL = 0xffffffff;

/** Reliable client -> host snapshot ACK. Body is the last applied host snapshot tick. */
export function encodeAck(ackTick: number, opts?: { senderSlot?: number }): Uint8Array<ArrayBuffer> {
  const w = new ByteWriter(12);
  writeHeader(w, {
    msgType: MsgType.Ack,
    serverTick: ackTick,
    channelKind: Channel.Reliable,
    senderSlot: opts?.senderSlot,
  });
  w.u32(ackTick);
  return w.bytes();
}

export function decodeAck(bytes: Uint8Array): number {
  const r = new ByteReader(bytes);
  const h = readHeader(r);
  if (h.msgType !== MsgType.Ack) throw new Error(`expected ACK packet, got msgType ${h.msgType}`);
  return r.remaining >= 4 ? r.u32() : h.serverTick;
}
