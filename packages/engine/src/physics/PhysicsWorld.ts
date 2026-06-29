import * as RAPIER from '@dimforge/rapier3d-compat';

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface PhysicsCharacter {
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
  readonly controller: RAPIER.KinematicCharacterController;
}

export interface PhysicsBox {
  readonly body: RAPIER.RigidBody;
  readonly collider: RAPIER.Collider;
}

/** The fixed simulation step (60 Hz), matching the GameLoop / host clock. */
export const PHYSICS_FIXED_DT = 1 / 60;

/**
 * Host-authoritative physics (T23). A thin, deterministic wrapper over a Rapier world stepped at a
 * FIXED timestep: same machine + same construction + same input sequence ⇒ identical transforms
 * (proven by the determinism test). The KCC moves the player capsule against static colliders, and
 * dynamic boxes feed the M-LOOK chaos-stress harness (Phase B). `RAPIER.init()` (WASM) must resolve
 * before construction — use {@link PhysicsWorld.create}.
 */
export class PhysicsWorld {
  readonly world: RAPIER.World;

  private constructor(gravity: Vec3) {
    this.world = new RAPIER.World(gravity);
    this.world.timestep = PHYSICS_FIXED_DT;
  }

  /** Initialise the Rapier WASM runtime (idempotent) and create a world. */
  static async create(gravity: Vec3 = { x: 0, y: -9.81, z: 0 }): Promise<PhysicsWorld> {
    await RAPIER.init();
    return new PhysicsWorld(gravity);
  }

  /** Static cuboid collider (floor / wall); `half*` are half-extents. */
  addStaticBox(pos: Vec3, half: Vec3): RAPIER.Collider {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.fixed().setTranslation(pos.x, pos.y, pos.z),
    );
    return this.world.createCollider(RAPIER.ColliderDesc.cuboid(half.x, half.y, half.z), body);
  }

  /** Flat ground at y=0 (a large thin fixed cuboid whose top face sits at y=0). */
  addGround(halfExtent = 100): RAPIER.Collider {
    return this.addStaticBox({ x: 0, y: -0.5, z: 0 }, { x: halfExtent, y: 0.5, z: halfExtent });
  }

  /** Dynamic box that falls + collides — the chaos-stress harness spawns these in bulk. */
  addDynamicBox(pos: Vec3, half: Vec3 = { x: 0.5, y: 0.5, z: 0.5 }): PhysicsBox {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic().setTranslation(pos.x, pos.y, pos.z),
    );
    const collider = this.world.createCollider(RAPIER.ColliderDesc.cuboid(half.x, half.y, half.z), body);
    return { body, collider };
  }

  /** Kinematic capsule driven by a Rapier KinematicCharacterController (the player). */
  addCharacter(pos: Vec3, halfHeight = 0.6, radius = 0.4): PhysicsCharacter {
    const body = this.world.createRigidBody(
      RAPIER.RigidBodyDesc.kinematicPositionBased().setTranslation(pos.x, pos.y, pos.z),
    );
    const collider = this.world.createCollider(RAPIER.ColliderDesc.capsule(halfHeight, radius), body);
    const controller = this.world.createCharacterController(0.01); // skin offset
    controller.enableAutostep(0.4, 0.2, true);
    controller.enableSnapToGround(0.4);
    return { body, collider, controller };
  }

  /**
   * Move a character by a desired delta, resolved against world geometry by its KCC (slides along
   * walls, climbs small steps, snaps to ground), then applied as the next kinematic translation.
   */
  moveCharacter(char: PhysicsCharacter, desired: Vec3): void {
    char.controller.computeColliderMovement(char.collider, desired);
    const m = char.controller.computedMovement();
    const t = char.body.translation();
    char.body.setNextKinematicTranslation({ x: t.x + m.x, y: t.y + m.y, z: t.z + m.z });
  }

  /** Advance the simulation one fixed step. */
  step(): void {
    this.world.step();
  }

  /** Free the Rapier world (releases WASM memory). */
  dispose(): void {
    this.world.free();
  }
}
