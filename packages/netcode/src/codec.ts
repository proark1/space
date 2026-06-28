import { REPLICATED_REGISTRY } from '@sl/shared-types';
import type { ComponentValues, ReplicatedComponent } from '@sl/shared-types';
import type { ByteWriter, ByteReader } from './byte';
import {
  quantizePosAxis,
  dequantizePosAxis,
  quantizeYaw,
  dequantizeYaw,
} from './quantize';

/**
 * Encode one component's field values onto the wire by walking REPLICATED_REGISTRY field
 * order. The registry is the single source of truth, so encode and decode can never
 * disagree on layout — the failure mode the whole replication path hinges on avoiding.
 */
export function encodeComponent(
  w: ByteWriter,
  comp: ReplicatedComponent,
  values: ComponentValues,
): void {
  for (const f of comp.fields) {
    const v = values[f.name] ?? 0;
    switch (f.codec) {
      case 'u8':
        w.u8(v);
        break;
      case 'u16':
        w.u16(v);
        break;
      case 'u32':
        w.u32(v);
        break;
      case 'i16':
        w.i16(v);
        break;
      case 'f32':
        w.f32(v);
        break;
      case 'pos':
        w.i16(quantizePosAxis(v));
        break;
      case 'yaw':
        w.u16(quantizeYaw(v));
        break;
    }
  }
}

/** Decode one component back into field values (same registry entry → identical order). */
export function decodeComponent(r: ByteReader, comp: ReplicatedComponent): ComponentValues {
  const out: ComponentValues = {};
  for (const f of comp.fields) {
    switch (f.codec) {
      case 'u8':
        out[f.name] = r.u8();
        break;
      case 'u16':
        out[f.name] = r.u16();
        break;
      case 'u32':
        out[f.name] = r.u32();
        break;
      case 'i16':
        out[f.name] = r.i16();
        break;
      case 'f32':
        out[f.name] = r.f32();
        break;
      case 'pos':
        out[f.name] = dequantizePosAxis(r.i16());
        break;
      case 'yaw':
        out[f.name] = dequantizeYaw(r.u16());
        break;
    }
  }
  return out;
}

/** Encode a component by its registry id, prefixing the 1-byte id tag. */
export function encodeById(w: ByteWriter, id: number, values: ComponentValues): void {
  const comp = REPLICATED_REGISTRY.find((c) => c.id === id);
  if (!comp) throw new Error(`unknown replicated component id ${id}`);
  w.u8(comp.id);
  encodeComponent(w, comp, values);
}
