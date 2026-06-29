import { Scene, PerspectiveCamera, Euler } from 'three';
import { PhysicsWorld, PlayerController, syncBodyToTransform } from '@sl/engine';
import { createGameWorld, spawnPlayer, Transform } from '@sl/ecs';
import { createFlashlight } from '@sl/render';
import type { RenderProfile } from '@sl/render';
import type { HarnessScene } from './scene';
import { buildCorridor } from './corridor';
import { createFirstPersonControls, type FirstPersonControls } from './input';

/** Eye height above the capsule centre. Capsule rest centre ≈1.0 (radius .4 + halfHeight .6) ⇒ eye ≈1.62. */
const EYE_OFFSET = 0.62;

/** Internal hook surface for headless verification (player position + the controls + grounded state). */
export interface WalkSceneHandle extends HarnessScene {
  readonly controls: FirstPersonControls;
  /** The local player's current world position, read from the ECS Transform. */
  playerPosition(): { x: number; y: number; z: number };
  readonly grounded: boolean;
}

/**
 * The playable vertical slice (the first time every layer runs together): the canonical greybox
 * corridor with matching Rapier static colliders, an ECS LocalPlayer whose capsule is driven by the
 * KCC PlayerController from first-person input, host physics stepped on the fixed tick, and the camera
 * + flashlight riding the player's replicated Transform. Walk with WASD; click to capture the mouse
 * and look (Space jumps). This is the rig netcode plugs into next — the same PlayerController.applyInput
 * path will run from networked input on the host.
 */
export async function createWalkScene(
  profile: RenderProfile,
  canvas: HTMLCanvasElement,
): Promise<WalkSceneHandle> {
  const scene = new Scene();
  const { colliders } = buildCorridor(scene);

  // Host physics: a static collider per corridor surface, then the player's kinematic capsule.
  const physics = await PhysicsWorld.create();
  for (const b of colliders) {
    physics.addStaticBox(
      { x: b.pos[0], y: b.pos[1], z: b.pos[2] },
      { x: b.half[0], y: b.half[1], z: b.half[2] },
    );
  }

  // ECS local player. Spawn near the near end-cap, facing -Z down the hall.
  const world = createGameWorld();
  const playerEid = spawnPlayer(world);
  const spawn = { x: 0, y: 1.0, z: 12 };
  const character = physics.addCharacter(spawn);
  Transform.x[playerEid] = spawn.x;
  Transform.y[playerEid] = spawn.y;
  Transform.z[playerEid] = spawn.z;

  const controller = new PlayerController();
  const controls = createFirstPersonControls(canvas);

  const camera = new PerspectiveCamera(70, 1, 0.1, 60);
  const flashlight = createFlashlight(profile);
  flashlight.addToScene(scene);

  const euler = new Euler(0, 0, 0, 'YXZ');
  // `!` — typed-array reads are `number | undefined` under noUncheckedIndexedAccess; the eid is valid.
  const placeCamera = (): void => {
    camera.position.set(Transform.x[playerEid]!, Transform.y[playerEid]! + EYE_OFFSET, Transform.z[playerEid]!);
    euler.set(controls.pitch, controls.yaw, 0);
    camera.quaternion.setFromEuler(euler);
    flashlight.update(camera);
  };
  placeCamera();

  return {
    scene,
    camera,
    label: 'walk',
    controls,
    get grounded() {
      return controller.isGrounded;
    },
    playerPosition() {
      return { x: Transform.x[playerEid]!, y: Transform.y[playerEid]!, z: Transform.z[playerEid]! };
    },
    fixedStep(dt) {
      const mv = controls.moveVector();
      controller.applyInput(
        physics,
        character,
        { moveX: mv.x, moveZ: mv.z, yaw: controls.yaw, jump: controls.consumeJump() },
        dt,
      );
      physics.step();
      syncBodyToTransform(playerEid, character.body);
    },
    frameUpdate() {
      placeCamera();
    },
    resize(width, height) {
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    },
  };
}
