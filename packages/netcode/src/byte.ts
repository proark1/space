/**
 * Little-endian byte buffers for the wire protocol. ByteWriter grows automatically so a
 * caller never has to pre-size for the worst case; ByteReader walks a view in lockstep.
 * All multi-byte values are little-endian (LE) — the one canonical byte order on the wire.
 */

export class ByteWriter {
  private buf: Uint8Array;
  private view: DataView;
  private off = 0;

  constructor(initialBytes = 256) {
    this.buf = new Uint8Array(initialBytes);
    this.view = new DataView(this.buf.buffer);
  }

  private ensure(n: number): void {
    const need = this.off + n;
    if (need <= this.buf.length) return;
    let cap = this.buf.length;
    while (cap < need) cap *= 2;
    const next = new Uint8Array(cap);
    next.set(this.buf);
    this.buf = next;
    this.view = new DataView(this.buf.buffer);
  }

  u8(v: number): this {
    this.ensure(1);
    this.view.setUint8(this.off, v & 0xff);
    this.off += 1;
    return this;
  }

  u16(v: number): this {
    this.ensure(2);
    this.view.setUint16(this.off, v & 0xffff, true);
    this.off += 2;
    return this;
  }

  u32(v: number): this {
    this.ensure(4);
    this.view.setUint32(this.off, v >>> 0, true);
    this.off += 4;
    return this;
  }

  i16(v: number): this {
    this.ensure(2);
    this.view.setInt16(this.off, v | 0, true);
    this.off += 2;
    return this;
  }

  f32(v: number): this {
    this.ensure(4);
    this.view.setFloat32(this.off, v, true);
    this.off += 4;
    return this;
  }

  /** Number of bytes written so far. */
  get length(): number {
    return this.off;
  }

  /** A view over exactly the written bytes (no copy). */
  bytes(): Uint8Array {
    return this.buf.subarray(0, this.off);
  }
}

export class ByteReader {
  private view: DataView;
  private off = 0;

  constructor(src: Uint8Array) {
    this.view = new DataView(src.buffer, src.byteOffset, src.byteLength);
  }

  u8(): number {
    const v = this.view.getUint8(this.off);
    this.off += 1;
    return v;
  }

  u16(): number {
    const v = this.view.getUint16(this.off, true);
    this.off += 2;
    return v;
  }

  u32(): number {
    const v = this.view.getUint32(this.off, true);
    this.off += 4;
    return v;
  }

  i16(): number {
    const v = this.view.getInt16(this.off, true);
    this.off += 2;
    return v;
  }

  f32(): number {
    const v = this.view.getFloat32(this.off, true);
    this.off += 4;
    return v;
  }

  /** Bytes consumed so far. */
  get offset(): number {
    return this.off;
  }

  /** Bytes left to read. */
  get remaining(): number {
    return this.view.byteLength - this.off;
  }
}
