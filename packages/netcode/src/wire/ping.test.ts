import { describe, it, expect } from 'vitest';
import { MsgType } from '@sl/shared-types';
import { PingTracker, pongForPing, decodePingPong } from './ping';

describe('ping/pong', () => {
  it('round-trips a ping into a pong with the same nonce', () => {
    const t = new PingTracker();
    const ping = t.ping(1000);
    expect(decodePingPong(ping).msgType).toBe(MsgType.Ping);
    const pong = pongForPing(ping);
    const decoded = decodePingPong(pong);
    expect(decoded.msgType).toBe(MsgType.Pong);
    expect(decoded.nonce).toBe(decodePingPong(ping).nonce);
  });

  it('measures RTT from send time to pong arrival', () => {
    const t = new PingTracker();
    const ping = t.ping(1000);
    const rtt = t.onPong(pongForPing(ping), 1042);
    expect(rtt).toBe(42);
  });

  it('returns null for an unknown/stale pong nonce', () => {
    const t = new PingTracker();
    const ping = t.ping(1000);
    t.onPong(pongForPing(ping), 1042); // consumes the nonce
    expect(t.onPong(pongForPing(ping), 1100)).toBeNull(); // already consumed
  });
});
