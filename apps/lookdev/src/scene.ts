import type { PerspectiveCamera, Scene } from 'three';

/** Common shape every look-dev harness scene exposes, so the entry point stays scene-agnostic. */
export interface HarnessScene {
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly label: string;
  /** Fixed-timestep update (physics) — driven by GameLoop.fixedUpdate. */
  fixedStep(dt: number): void;
  /** Per-frame update (camera / flashlight) — driven once per render with the real frame delta. */
  frameUpdate(dt: number): void;
  resize(width: number, height: number): void;
  dispose?(): void;
}
