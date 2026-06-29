import type { PhysicsWorld, PhysicsCharacter } from '../physics/PhysicsWorld';

/**
 * One simulation step of intent for a player capsule. Yaw-relative — `moveX`/`moveZ` are the raw
 * stick/keyboard axes; the controller rotates them into world space by `yaw`. This is exactly the
 * shape the {@link PlayerInput} ECS component carries over the wire, so the host will feed remote
 * players' inputs through the same `applyInput` path (authoritative movement, one controller per eid).
 */
export interface MoveInput {
  /** Strafe axis: -1 (left) … +1 (right). */
  readonly moveX: number;
  /** Forward axis: -1 (back) … +1 (forward). */
  readonly moveZ: number;
  /** Heading in radians (0 ⇒ facing -Z, matching the three.js camera default). */
  readonly yaw: number;
  /** Jump requested this step (consumed only when grounded). */
  readonly jump?: boolean;
}

export interface PlayerControllerOptions {
  /** Ground move speed (m/s). */
  readonly speed?: number;
  /** Gravity magnitude (m/s²). */
  readonly gravity?: number;
  /** Initial upward speed of a jump (m/s). */
  readonly jumpSpeed?: number;
  /** Terminal fall speed clamp (m/s). */
  readonly maxFallSpeed?: number;
}

/**
 * Drives a Rapier kinematic-character capsule from per-step {@link MoveInput} (T23 → vertical slice).
 * Deterministic and free of any DOM / three.js dependency: same options + same input sequence ⇒ same
 * path (covered by the determinism test), so it runs identically on the host for replicated players
 * and on the client for local prediction. Holds only the per-player vertical-velocity / grounded
 * state; one instance per controlled entity.
 *
 * Movement model: horizontal intent is yaw-rotated and normalised (diagonals aren't faster), gravity
 * integrates into `vy` each step, and a jump replaces `vy` only while grounded. The KCC
 * (`enableSnapToGround`) resolves the move against world geometry — sliding along walls, stepping up
 * small ledges — and reports `computedGrounded()`, which zeroes downward velocity on landing.
 */
export class PlayerController {
  private readonly speed: number;
  private readonly gravity: number;
  private readonly jumpSpeed: number;
  private readonly maxFallSpeed: number;

  private vy = 0;
  private grounded = false;

  constructor(opts: PlayerControllerOptions = {}) {
    this.speed = opts.speed ?? 3.2;
    this.gravity = opts.gravity ?? 22;
    this.jumpSpeed = opts.jumpSpeed ?? 6;
    this.maxFallSpeed = opts.maxFallSpeed ?? 40;
  }

  /** True when the capsule rested on ground at the end of the last {@link applyInput}. */
  get isGrounded(): boolean {
    return this.grounded;
  }

  /** Current vertical velocity (m/s; negative = falling). */
  get verticalVelocity(): number {
    return this.vy;
  }

  /**
   * Advance the capsule one fixed step. Computes a yaw-relative horizontal move plus integrated
   * gravity, resolves it through the KCC, and updates the grounded / vertical-velocity state. Call
   * once per fixed tick BEFORE {@link PhysicsWorld.step}; read the body transform after the step.
   */
  applyInput(physics: PhysicsWorld, char: PhysicsCharacter, input: MoveInput, dt: number): void {
    // Yaw basis (right-handed, +Y up): forward at yaw 0 is -Z; right is +X.
    const sin = Math.sin(input.yaw);
    const cos = Math.cos(input.yaw);
    const forwardX = -sin;
    const forwardZ = -cos;
    const rightX = cos;
    const rightZ = -sin;

    // Horizontal intent, normalised so a diagonal isn't √2 faster than a cardinal.
    let dx = rightX * input.moveX + forwardX * input.moveZ;
    let dz = rightZ * input.moveX + forwardZ * input.moveZ;
    const len = Math.hypot(dx, dz);
    if (len > 1) {
      dx /= len;
      dz /= len;
    }

    // Vertical: integrate gravity, allow a grounded jump, clamp terminal speed. A small downward
    // bias every step (gravity never fully cancels) keeps snap-to-ground probing the floor so
    // `computedGrounded()` stays reliable on flat sections.
    this.vy -= this.gravity * dt;
    if (input.jump && this.grounded) this.vy = this.jumpSpeed;
    if (this.vy < -this.maxFallSpeed) this.vy = -this.maxFallSpeed;

    physics.moveCharacter(char, {
      x: dx * this.speed * dt,
      y: this.vy * dt,
      z: dz * this.speed * dt,
    });

    this.grounded = char.controller.computedGrounded();
    if (this.grounded && this.vy < 0) this.vy = 0;
  }

  /** Reset transient motion state (e.g. on teleport / respawn). */
  reset(): void {
    this.vy = 0;
    this.grounded = false;
  }
}
