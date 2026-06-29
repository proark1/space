import { describe, expect, it } from 'vitest';
import { Channel, MsgType } from '@sl/shared-types';
import { ByteReader } from '../byte';
import { readHeader } from './header';
import { decodeLobbySlot, encodeLobbySlot } from './lobby';

describe('lobby wire codec', () => {
  it('round-trips an assigned client slot on the reliable channel', () => {
    const bytes = encodeLobbySlot(3, { maxSlots: 4 });
    const header = readHeader(new ByteReader(bytes));

    expect(header.msgType).toBe(MsgType.Lobby);
    expect(header.channelKind).toBe(Channel.Reliable);
    expect(header.senderSlot).toBe(0);
    expect(decodeLobbySlot(bytes)).toEqual({ slot: 3, maxSlots: 4 });
  });

  it('rejects slots outside the configured range', () => {
    expect(() => encodeLobbySlot(0)).toThrow(/slot/);
    expect(() => encodeLobbySlot(5, { maxSlots: 4 })).toThrow(/slot/);
  });
});
