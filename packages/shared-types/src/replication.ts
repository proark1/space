/**
 * REPLICATED_REGISTRY — the canonical, WIRE-ORDERED list of components that cross the
 * network and the quantization of each field. The netcode codec walks this array in
 * order to (de)serialize snapshots; the ECS imports the same array so the component set
 * and the wire layout can never drift apart.
 *
 * INVARIANT: order and `id`s ARE the wire format. APPEND ONLY — never reorder, remove,
 * or renumber. Any change here desyncs every replicated entity and is a PROTOCOL_VERSION
 * bump (see quantize-params.ts).
 */

/** How a single field is packed on the wire. */
export type FieldCodec = 'u8' | 'u16' | 'u32' | 'i16' | 'f32' | 'pos' | 'yaw';

export interface ReplicatedField {
  readonly name: string;
  readonly codec: FieldCodec;
}

export interface ReplicatedComponent {
  /** Stable wire id. Append-only. */
  readonly id: number;
  readonly name: string;
  readonly fields: readonly ReplicatedField[];
}

export const REPLICATED_REGISTRY: readonly ReplicatedComponent[] = [
  {
    id: 0,
    name: 'Transform',
    fields: [
      { name: 'x', codec: 'pos' },
      { name: 'y', codec: 'pos' },
      { name: 'z', codec: 'pos' },
      { name: 'yaw', codec: 'yaw' },
    ],
  },
  {
    id: 1,
    name: 'Health',
    fields: [
      { name: 'hp', codec: 'u16' },
      { name: 'max', codec: 'u16' },
    ],
  },
  {
    id: 2,
    name: 'PlayerState',
    fields: [{ name: 'flags', codec: 'u8' }],
  },
] as const;

/** A decoded set of field values for one component, keyed by field name. */
export type ComponentValues = Record<string, number>;

export function componentById(id: number): ReplicatedComponent | undefined {
  return REPLICATED_REGISTRY.find((c) => c.id === id);
}
