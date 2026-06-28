import { REPLICATED_REGISTRY } from '@sl/shared-types';
import type { ReplicatedComponent } from '@sl/shared-types';

/**
 * Placeholder for the bitECS world (T18 / T22). For now it just proves the package
 * wiring and consumes the shared REPLICATED_REGISTRY, so the ECS component set and the
 * netcode wire layout are guaranteed to read from one source.
 */
export const replicatedComponentNames: readonly string[] = REPLICATED_REGISTRY.map(
  (c: ReplicatedComponent) => c.name,
);
