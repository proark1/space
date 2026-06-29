import type { Object3D } from 'three';
import { addComponent, hasComponent, removeComponent } from 'bitecs';
import { queryRenderable, RenderRef, Transform, type GameWorld } from '@sl/ecs';

/**
 * Stable integer handle -> Object3D registry. ECS stores only the handle, keeping Three objects out
 * of replicated/gameplay components while still letting render systems sync by query each frame.
 */
export class RenderRegistry {
  private readonly objects = new Map<number, Object3D>();
  private nextHandle = 1;

  bind(world: GameWorld, eid: number, object: Object3D): number {
    const handle = this.nextHandle++;
    this.objects.set(handle, object);
    if (!hasComponent(world, eid, RenderRef)) addComponent(world, eid, RenderRef);
    RenderRef.handle[eid] = handle;
    RenderRef.visible[eid] = 1;
    return handle;
  }

  unbind(world: GameWorld, eid: number): void {
    const handle = RenderRef.handle[eid];
    if (handle) this.objects.delete(handle);
    RenderRef.handle[eid] = 0;
    RenderRef.visible[eid] = 0;
    if (hasComponent(world, eid, RenderRef)) removeComponent(world, eid, RenderRef);
  }

  get(handle: number): Object3D | undefined {
    return this.objects.get(handle);
  }
}

export function syncObject3DFromTransform(object: Object3D, eid: number): void {
  object.position.set(Transform.x[eid] ?? 0, Transform.y[eid] ?? 0, Transform.z[eid] ?? 0);
  object.quaternion.set(
    Transform.qx[eid] ?? 0,
    Transform.qy[eid] ?? 0,
    Transform.qz[eid] ?? 0,
    Transform.qw[eid] ?? 1,
  );
}

/** T29 render sync: copy every RenderRef+Transform entity into its bound Object3D. */
export function syncRenderableObjects(world: GameWorld, registry: RenderRegistry): void {
  for (const eid of queryRenderable(world)) {
    const object = registry.get(RenderRef.handle[eid] ?? 0);
    if (!object) continue;
    object.visible = RenderRef.visible[eid] !== 0;
    syncObject3DFromTransform(object, eid);
  }
}
