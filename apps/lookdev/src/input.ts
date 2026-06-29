/**
 * First-person input for the walkable slice. Pointer-lock mouse-look drives yaw/pitch; WASD drives a
 * raw move vector; Space is an edge-triggered jump. Yaw/pitch are reported in radians matching the
 * three.js camera convention (yaw 0 ⇒ facing -Z) so they drop straight into PlayerController.MoveInput
 * and the camera's YXZ euler.
 *
 * Keys are read off a global key-set that works whether or not the pointer is locked, so a headless
 * harness can prove movement by dispatching synthetic `keydown`/`keyup` (pointer-lock can't engage
 * without a real user gesture). Mouse-look only applies while locked. `setLook` is the scripted /
 * test hook for driving the heading directly.
 */
export interface FirstPersonControls {
  /** Heading in radians (yaw 0 ⇒ facing -Z). */
  readonly yaw: number;
  /** Pitch in radians, clamped just shy of straight up/down. */
  readonly pitch: number;
  /** Whether the pointer is currently locked to the canvas. */
  readonly locked: boolean;
  /** WASD axes — `x` strafe (+right), `z` forward (+forward), each in {-1, 0, 1}. */
  moveVector(): { x: number; z: number };
  /** True at most once per press: was jump (Space) pressed since the last call? */
  consumeJump(): boolean;
  /** Set the heading directly (scripted cameras / headless tests). */
  setLook(yaw: number, pitch: number): void;
  dispose(): void;
}

export interface FirstPersonOptions {
  /** Radians of look per pixel of mouse motion. */
  readonly sensitivity?: number;
}

const MAX_PITCH = Math.PI / 2 - 0.05;

export function createFirstPersonControls(
  canvas: HTMLCanvasElement,
  opts: FirstPersonOptions = {},
): FirstPersonControls {
  const sensitivity = opts.sensitivity ?? 0.0022;
  const pressed = new Set<string>();
  let yaw = 0;
  let pitch = 0;
  let locked = false;
  let jumpLatched = false;

  const onKeyDown = (e: KeyboardEvent): void => {
    pressed.add(e.code);
    if (e.code === 'Space') jumpLatched = true;
  };
  const onKeyUp = (e: KeyboardEvent): void => {
    pressed.delete(e.code);
  };
  const onClick = (): void => {
    if (!locked) void canvas.requestPointerLock?.();
  };
  const onLockChange = (): void => {
    locked = document.pointerLockElement === canvas;
  };
  const onMouseMove = (e: MouseEvent): void => {
    if (!locked) return;
    yaw -= e.movementX * sensitivity;
    pitch -= e.movementY * sensitivity;
    if (pitch > MAX_PITCH) pitch = MAX_PITCH;
    else if (pitch < -MAX_PITCH) pitch = -MAX_PITCH;
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  canvas.addEventListener('click', onClick);
  document.addEventListener('pointerlockchange', onLockChange);
  document.addEventListener('mousemove', onMouseMove);

  return {
    get yaw() {
      return yaw;
    },
    get pitch() {
      return pitch;
    },
    get locked() {
      return locked;
    },
    moveVector() {
      const z = (pressed.has('KeyW') ? 1 : 0) - (pressed.has('KeyS') ? 1 : 0);
      const x = (pressed.has('KeyD') ? 1 : 0) - (pressed.has('KeyA') ? 1 : 0);
      return { x, z };
    },
    consumeJump() {
      if (!jumpLatched) return false;
      jumpLatched = false;
      return true;
    },
    setLook(nextYaw: number, nextPitch: number) {
      yaw = nextYaw;
      pitch = Math.max(-MAX_PITCH, Math.min(MAX_PITCH, nextPitch));
    },
    dispose() {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      canvas.removeEventListener('click', onClick);
      document.removeEventListener('pointerlockchange', onLockChange);
      document.removeEventListener('mousemove', onMouseMove);
      if (locked && document.pointerLockElement === canvas) document.exitPointerLock?.();
    },
  };
}
