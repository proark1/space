import { MsgType, Channel } from '@sl/shared-types';
import { ByteWriter, ByteReader } from '../byte';
import { writeHeader, readHeader } from './header';
import { quantizeYaw, dequantizeYaw, quantizePitch, dequantizePitch } from '../quantize';

/**
 * INPUT frame (client → host, unreliable; spec 02 §5.5). Each packet re-sends the last K
 * commands so a dropped packet is covered by the next without retransmit. The host applies
 * the newest unseen seq, ignores already-applied ones, and clamps dt to a sane integration
 * window. Pure codec + endpoint buffers → fully headless-testable.
 */

export const MAX_REDUNDANT_INPUTS = 6;

export interface InputCmd {
  seq: number;
  clientTick: number;
  buttons: number;
  moveYaw: number;
  movePitch: number;
  dtMs: number;
  voicePressure?: number;
}

export function clampDt(dtMs: number): number {
  const r = Math.round(dtMs);
  return r < 1 ? 1 : r > 50 ? 50 : r;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export function quantizeVoicePressure(pressure: number): number {
  return Math.round(clamp01(pressure) * 255);
}

export function dequantizeVoicePressure(q: number): number {
  return (q & 0xff) / 255;
}

export function encodeInputPacket(
  cmds: InputCmd[],
  opts?: { senderSlot?: number },
): Uint8Array<ArrayBuffer> {
  const slice = cmds.slice(-MAX_REDUNDANT_INPUTS);
  const newestTick = slice.length ? slice[slice.length - 1]!.clientTick : 0;
  const w = new ByteWriter(16);
  writeHeader(w, {
    msgType: MsgType.Input,
    serverTick: newestTick,
    channelKind: Channel.Unreliable,
    senderSlot: opts?.senderSlot,
  });
  w.u8(slice.length);
  for (const c of slice) {
    w.u32(c.seq);
    w.u32(c.clientTick);
    w.u16(c.buttons);
    w.u16(quantizeYaw(c.moveYaw));
    w.i16(quantizePitch(c.movePitch));
    w.u8(clampDt(c.dtMs));
    w.u8(quantizeVoicePressure(c.voicePressure ?? 0));
  }
  return w.bytes();
}

export function decodeInputPacket(bytes: Uint8Array): { clientTick: number; cmds: InputCmd[] } {
  const r = new ByteReader(bytes);
  const h = readHeader(r);
  const count = r.u8();
  const cmds: InputCmd[] = [];
  for (let i = 0; i < count; i++) {
    cmds.push({
      seq: r.u32(),
      clientTick: r.u32(),
      buttons: r.u16(),
      moveYaw: dequantizeYaw(r.u16()),
      movePitch: dequantizePitch(r.i16()),
      dtMs: r.u8(),
      voicePressure: dequantizeVoicePressure(r.u8()),
    });
  }
  return { clientTick: h.serverTick, cmds };
}

/** Client-side ring of recent inputs; `packet()` re-sends the last K for loss tolerance. */
export class InputSendBuffer {
  private cmds: InputCmd[] = [];
  private seq = 0;

  push(cmd: Omit<InputCmd, 'seq'>): InputCmd {
    const full: InputCmd = { ...cmd, seq: ++this.seq };
    this.cmds.push(full);
    if (this.cmds.length > 64) this.cmds.shift();
    return full;
  }

  packet(opts?: { senderSlot?: number }): Uint8Array {
    return encodeInputPacket(this.cmds, opts);
  }

  get lastSeq(): number {
    return this.seq;
  }
}

/** Host-side: decode a packet, apply only the unseen seqs (in order), echo lastProcessedSeq. */
export class InputReceiver {
  private _lastProcessedSeq = 0;

  get lastProcessedSeq(): number {
    return this._lastProcessedSeq;
  }

  apply(bytes: Uint8Array): InputCmd[] {
    const { cmds } = decodeInputPacket(bytes);
    const fresh = cmds
      .filter((c) => c.seq > this._lastProcessedSeq)
      .sort((a, b) => a.seq - b.seq);
    for (const c of fresh) {
      c.dtMs = clampDt(c.dtMs);
      this._lastProcessedSeq = c.seq;
    }
    return fresh;
  }
}
