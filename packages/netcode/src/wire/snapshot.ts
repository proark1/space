import { MsgType, Channel } from '@sl/shared-types';
import { ByteWriter, ByteReader } from '../byte';
import { writeHeader, readHeader } from './header';
import { quantizePosAxis, dequantizePosAxis, quantizeYaw, dequantizeYaw } from '../quantize';

/**
 * Snapshot wire format (spec 02 §5.3–5.4). A snapshot is the 8-byte header + entity records.
 *   - FULL  (isDelta=0): entityCount + every entity with all fields. First send / after a gap.
 *   - DELTA (isDelta=1): baseTick + removed ids + only the entities/fields that changed vs base.
 *
 * Position is absolute (quantized), never delta-of-position — the delta is at the field-presence
 * level (where the bytes are), which avoids drift accumulation. Pure → fully headless-testable.
 */

/** Per-entity field-presence bits in a record's mask. */
export const Field = {
  Pos: 1,
  Yaw: 2,
  Anim: 4,
  Hp: 8,
  Extra: 16,
} as const;

const FULL_MASK = Field.Pos | Field.Yaw | Field.Anim | Field.Hp; // 15

export interface EntitySnapshot {
  id: number;
  type: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  anim: number;
  hp: number;
  /** Owner slot from the packet header/lobby assignment. Host-local is 0; clients start at 1. */
  ownerSlot?: number;
  /** Last input sequence the host applied for this player, used by local reconciliation. */
  inputAck?: number;
}

export interface WorldSnapshot {
  tick: number;
  entities: EntitySnapshot[];
}

export interface SnapshotDelta {
  tick: number;
  baseTick: number;
  removed: number[];
  changed: Array<{ id: number; type: number; mask: number; fields: Partial<EntitySnapshot> }>;
}

function hasExtra(e: EntitySnapshot): boolean {
  return (e.ownerSlot ?? 0) !== 0 || (e.inputAck ?? 0) !== 0;
}

function fullMaskFor(e: EntitySnapshot): number {
  return FULL_MASK | (hasExtra(e) ? Field.Extra : 0);
}

function writeFields(w: ByteWriter, e: EntitySnapshot, mask: number): void {
  if (mask & Field.Pos) {
    w.i16(quantizePosAxis(e.x));
    w.i16(quantizePosAxis(e.y));
    w.i16(quantizePosAxis(e.z));
  }
  if (mask & Field.Yaw) w.u16(quantizeYaw(e.yaw));
  if (mask & Field.Anim) w.u8(e.anim);
  if (mask & Field.Hp) w.u8(e.hp);
  if (mask & Field.Extra) {
    w.u8(e.ownerSlot ?? 0);
    w.u32(e.inputAck ?? 0);
  }
}

function readFields(r: ByteReader, mask: number, into: Partial<EntitySnapshot>): void {
  if (mask & Field.Pos) {
    into.x = dequantizePosAxis(r.i16());
    into.y = dequantizePosAxis(r.i16());
    into.z = dequantizePosAxis(r.i16());
  }
  if (mask & Field.Yaw) into.yaw = dequantizeYaw(r.u16());
  if (mask & Field.Anim) into.anim = r.u8();
  if (mask & Field.Hp) into.hp = r.u8();
  if (mask & Field.Extra) {
    into.ownerSlot = r.u8();
    into.inputAck = r.u32();
  }
}

export function encodeFull(world: WorldSnapshot, opts?: { senderSlot?: number }): Uint8Array<ArrayBuffer> {
  const w = new ByteWriter(64);
  writeHeader(w, {
    msgType: MsgType.Snapshot,
    serverTick: world.tick,
    channelKind: Channel.Unreliable,
    senderSlot: opts?.senderSlot,
    isDelta: false,
  });
  w.u16(world.entities.length);
  for (const e of world.entities) {
    const mask = fullMaskFor(e);
    w.u16(e.id);
    w.u8(e.type);
    w.u8(mask);
    writeFields(w, e, mask);
  }
  return w.bytes();
}

export function decodeFull(bytes: Uint8Array): WorldSnapshot {
  const r = new ByteReader(bytes);
  const h = readHeader(r);
  const count = r.u16();
  const entities: EntitySnapshot[] = [];
  for (let i = 0; i < count; i++) {
    const id = r.u16();
    const type = r.u8();
    const mask = r.u8();
    const e: EntitySnapshot = { id, type, x: 0, y: 0, z: 0, yaw: 0, anim: 0, hp: 0 };
    readFields(r, mask, e);
    entities.push(e);
  }
  return { tick: h.serverTick, entities };
}

function fieldDiff(prev: EntitySnapshot, cur: EntitySnapshot): number {
  let mask = 0;
  if (
    quantizePosAxis(prev.x) !== quantizePosAxis(cur.x) ||
    quantizePosAxis(prev.y) !== quantizePosAxis(cur.y) ||
    quantizePosAxis(prev.z) !== quantizePosAxis(cur.z)
  ) {
    mask |= Field.Pos;
  }
  if (quantizeYaw(prev.yaw) !== quantizeYaw(cur.yaw)) mask |= Field.Yaw;
  if (prev.anim !== cur.anim) mask |= Field.Anim;
  if (prev.hp !== cur.hp) mask |= Field.Hp;
  if ((prev.ownerSlot ?? 0) !== (cur.ownerSlot ?? 0) || (prev.inputAck ?? 0) !== (cur.inputAck ?? 0)) {
    mask |= Field.Extra;
  }
  return mask;
}

export function encodeDelta(
  current: WorldSnapshot,
  base: WorldSnapshot,
  opts?: { senderSlot?: number },
): Uint8Array<ArrayBuffer> {
  const w = new ByteWriter(64);
  writeHeader(w, {
    msgType: MsgType.Snapshot,
    serverTick: current.tick,
    channelKind: Channel.Unreliable,
    senderSlot: opts?.senderSlot,
    isDelta: true,
  });
  w.u32(base.tick);

  const baseById = new Map<number, EntitySnapshot>(
    base.entities.map((e): [number, EntitySnapshot] => [e.id, e]),
  );
  const currentIds = new Set(current.entities.map((e) => e.id));

  const removed = base.entities.filter((e) => !currentIds.has(e.id)).map((e) => e.id);
  w.u16(removed.length);
  for (const id of removed) w.u16(id);

  const changed: Array<{ e: EntitySnapshot; mask: number }> = [];
  for (const e of current.entities) {
    const prev = baseById.get(e.id);
    const mask = prev ? fieldDiff(prev, e) : fullMaskFor(e); // new entity → full record
    if (mask === 0) continue; // unchanged → omitted entirely
    changed.push({ e, mask });
  }
  w.u16(changed.length);
  for (const { e, mask } of changed) {
    w.u16(e.id);
    w.u8(e.type);
    w.u8(mask);
    writeFields(w, e, mask);
  }
  return w.bytes();
}

export function decodeDelta(bytes: Uint8Array): SnapshotDelta {
  const r = new ByteReader(bytes);
  const h = readHeader(r);
  const baseTick = r.u32();

  const removedCount = r.u16();
  const removed: number[] = [];
  for (let i = 0; i < removedCount; i++) removed.push(r.u16());

  const changedCount = r.u16();
  const changed: SnapshotDelta['changed'] = [];
  for (let i = 0; i < changedCount; i++) {
    const id = r.u16();
    const type = r.u8();
    const mask = r.u8();
    const fields: Partial<EntitySnapshot> = {};
    readFields(r, mask, fields);
    changed.push({ id, type, mask, fields });
  }
  return { tick: h.serverTick, baseTick, removed, changed };
}

/** Apply a decoded delta onto a base world, producing the reconstructed current world. */
export function applyDelta(base: WorldSnapshot, delta: SnapshotDelta): WorldSnapshot {
  const map = new Map<number, EntitySnapshot>(
    base.entities.map((e): [number, EntitySnapshot] => [e.id, { ...e }]),
  );
  for (const id of delta.removed) map.delete(id);
  for (const c of delta.changed) {
    const existing = map.get(c.id);
    if (existing) {
      Object.assign(existing, c.fields);
      existing.type = c.type;
    } else {
      map.set(c.id, {
        id: c.id,
        type: c.type,
        x: c.fields.x ?? 0,
        y: c.fields.y ?? 0,
        z: c.fields.z ?? 0,
        yaw: c.fields.yaw ?? 0,
        anim: c.fields.anim ?? 0,
        hp: c.fields.hp ?? 0,
        ownerSlot: c.fields.ownerSlot,
        inputAck: c.fields.inputAck,
      });
    }
  }
  return { tick: delta.tick, entities: [...map.values()] };
}
