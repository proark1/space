import { describe, expect, it } from 'vitest';
import { MsgType, Channel } from '@sl/shared-types';
import { ByteReader } from '../byte';
import { ACK_NEED_FULL, decodeAck, encodeAck } from './ack';
import { readHeader } from './header';

describe('ACK wire codec', () => {
  it('round-trips the applied snapshot tick on the reliable channel', () => {
    const bytes = encodeAck(1234, { senderSlot: 2 });
    const header = readHeader(new ByteReader(bytes));

    expect(header.msgType).toBe(MsgType.Ack);
    expect(header.channelKind).toBe(Channel.Reliable);
    expect(header.senderSlot).toBe(2);
    expect(header.serverTick).toBe(1234);
    expect(decodeAck(bytes)).toBe(1234);
  });

  it('round-trips the need-full sentinel', () => {
    expect(decodeAck(encodeAck(ACK_NEED_FULL))).toBe(ACK_NEED_FULL);
  });
});
