import { MsgType, Channel } from '@sl/shared-types';
import { ByteWriter, ByteReader } from '../byte';
import { writeHeader, readHeader } from './header';

/**
 * PING/PONG on the reliable channel (spec 02 §5.1, backlog T15). A ping carries a u32 nonce; the
 * peer echoes it as a pong. RTT = arrival time − the time we recorded when we sent that nonce.
 */

export function encodePing(nonce: number): Uint8Array<ArrayBuffer> {
  const w = new ByteWriter(16);
  writeHeader(w, { msgType: MsgType.Ping, serverTick: 0, channelKind: Channel.Reliable });
  w.u32(nonce);
  return w.bytes();
}

export function encodePong(nonce: number): Uint8Array<ArrayBuffer> {
  const w = new ByteWriter(16);
  writeHeader(w, { msgType: MsgType.Pong, serverTick: 0, channelKind: Channel.Reliable });
  w.u32(nonce);
  return w.bytes();
}

export function decodePingPong(bytes: Uint8Array): { msgType: number; nonce: number } {
  const r = new ByteReader(bytes);
  const h = readHeader(r);
  return { msgType: h.msgType, nonce: r.u32() };
}

/** Build the pong reply for a received ping. */
export function pongForPing(pingBytes: Uint8Array): Uint8Array {
  return encodePong(decodePingPong(pingBytes).nonce);
}

export class PingTracker {
  private nonce = 0;
  private readonly sent = new Map<number, number>();

  /** Build a ping to send now, recording its send time. */
  ping(now: number): Uint8Array {
    this.nonce = (this.nonce + 1) >>> 0;
    this.sent.set(this.nonce, now);
    for (const [k, t] of this.sent) if (now - t > 10_000) this.sent.delete(k); // drop lost pongs
    return encodePing(this.nonce);
  }

  /** RTT (ms) for a returned pong, or null if its nonce is unknown/stale. */
  onPong(bytes: Uint8Array, now: number): number | null {
    const { nonce } = decodePingPong(bytes);
    const sentAt = this.sent.get(nonce);
    if (sentAt === undefined) return null;
    this.sent.delete(nonce);
    return now - sentAt;
  }
}
