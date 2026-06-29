import { Scene, PerspectiveCamera, Euler, Mesh, MeshStandardMaterial, CapsuleGeometry } from 'three';
import { Game } from '@sl/engine';
import { Health, PlayerState, Transform, queryRemotePlayers, type GameWorld } from '@sl/ecs';
import { createFlashlight } from '@sl/render';
import type { RenderProfile } from '@sl/render';
import { hudSync } from '@sl/ui';
import type { HarnessScene } from './scene';
import { buildCorridor } from './corridor';
import { createFirstPersonControls, type FirstPersonControls } from './input';

/** Eye height above the capsule centre. Capsule rest centre ≈1.0 (radius .4 + halfHeight .6) ⇒ eye ≈1.62. */
const EYE_OFFSET = 0.62;

/** Internal hook surface for headless verification (player position + the controls + grounded state). */
export interface WalkSceneHandle extends HarnessScene {
  readonly game: Game;
  readonly controls: FirstPersonControls;
  /** The local player's current world position, read from the ECS Transform. */
  playerPosition(): { x: number; y: number; z: number };
  setRemoteWorld(world: GameWorld | undefined): void;
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
  const { colliders, level } = buildCorridor(scene);

  // Shared game root. Spawn near the near end-cap, facing -Z down the hall.
  const spawn = level.playerSpawn;
  const game = await Game.create({
    role: 'host',
    initialPlayerPosition: spawn,
    configurePhysics: (physics) => {
      for (const b of colliders) {
        physics.addStaticBox(
          { x: b.pos[0], y: b.pos[1], z: b.pos[2] },
          { x: b.half[0], y: b.half[1], z: b.half[2] },
        );
      }
    },
  });
  const playerEid = game.playerEid;
  const controls = createFirstPersonControls(canvas);

  const camera = new PerspectiveCamera(70, 1, 0.1, 60);
  const flashlight = createFlashlight(profile);
  flashlight.addToScene(scene);
  const remoteMat = new MeshStandardMaterial({ color: 0x4db7ff, emissive: 0x0b2435, roughness: 0.75 });
  const remoteGeo = new CapsuleGeometry(0.33, 0.9, 5, 8);
  const remoteMeshes = new Map<number, Mesh>();
  let remoteWorld: GameWorld | undefined;
  let objective = 'reach the aft bulkhead';

  const euler = new Euler(0, 0, 0, 'YXZ');
  // `!` — typed-array reads are `number | undefined` under noUncheckedIndexedAccess; the eid is valid.
  const placeCamera = (): void => {
    camera.position.set(Transform.x[playerEid]!, Transform.y[playerEid]! + EYE_OFFSET, Transform.z[playerEid]!);
    euler.set(controls.pitch, controls.yaw, 0);
    camera.quaternion.setFromEuler(euler);
    flashlight.update(camera);
  };
  const syncRemoteMarkers = (): void => {
    if (!remoteWorld) {
      for (const mesh of remoteMeshes.values()) scene.remove(mesh);
      remoteMeshes.clear();
      return;
    }

    const seen = new Set<number>();
    for (const eid of queryRemotePlayers(remoteWorld)) {
      seen.add(eid);
      let mesh = remoteMeshes.get(eid);
      if (!mesh) {
        mesh = new Mesh(remoteGeo, remoteMat);
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        remoteMeshes.set(eid, mesh);
        scene.add(mesh);
      }
      mesh.position.set(Transform.x[eid] ?? 0, (Transform.y[eid] ?? 1) + 0.15, Transform.z[eid] ?? 0);
    }
    for (const [eid, mesh] of remoteMeshes) {
      if (seen.has(eid)) continue;
      scene.remove(mesh);
      remoteMeshes.delete(eid);
    }
  };
  placeCamera();

  return {
    scene,
    camera,
    label: 'walk',
    game,
    controls,
    get grounded() {
      return game.playerController.isGrounded;
    },
    playerPosition() {
      return { x: Transform.x[playerEid]!, y: Transform.y[playerEid]!, z: Transform.z[playerEid]! };
    },
    setRemoteWorld(world) {
      remoteWorld = world;
      syncRemoteMarkers();
    },
    fixedStep(dt) {
      const mv = controls.moveVector();
      game.setInput({ moveX: mv.x, moveZ: mv.z, yaw: controls.yaw, jump: controls.consumeJump() });
      game.stepFixed(dt);
      const z = Transform.z[playerEid] ?? spawn.z;
      objective = z < -13 ? 'restore aft uplink' : 'reach the aft bulkhead';
      hudSync({
        health: Math.round(Health.hp[playerEid] ?? PlayerState.health[playerEid] ?? 100),
        battery: Math.round(PlayerState.battery[playerEid] ?? 100),
        resolve: Math.round(PlayerState.resolve[playerEid] ?? 100),
        ammoMag: PlayerState.ammoMag[playerEid] ?? 0,
        ammoReserve: PlayerState.ammoReserve[playerEid] ?? 0,
        objective,
        status: game.playerController.isGrounded ? 'grounded' : 'airborne',
      });
    },
    frameUpdate() {
      placeCamera();
      syncRemoteMarkers();
    },
    resize(width, height) {
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    },
    dispose() {
      for (const mesh of remoteMeshes.values()) scene.remove(mesh);
      remoteGeo.dispose();
      remoteMat.dispose();
      game.dispose();
    },
  };
}
