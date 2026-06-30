import { Scene, PerspectiveCamera, Euler, Mesh, MeshStandardMaterial, CapsuleGeometry, type Object3D } from 'three';
import { Game } from '@sl/engine';
import { Health, PlayerState, Transform, queryRemotePlayers, type GameWorld } from '@sl/ecs';
import { createFlashlight } from '@sl/render';
import type { RenderProfile } from '@sl/render';
import { hudSync } from '@sl/ui';
import type { HarnessScene } from './scene';
import { buildCorridor } from './corridor';
import { createFirstPersonControls, type FirstPersonControls } from './input';
import { loadPlayerUnitFactory, type PlayerUnitFactory, type PlayerUnitInstance } from './playerUnit';

/** Eye height above the capsule centre. Capsule rest centre ≈1.0 (radius .4 + halfHeight .6) ⇒ eye ≈1.62. */
const EYE_OFFSET = 0.62;

interface RemotePlayerVisual {
  readonly root: Object3D;
  readonly unit: PlayerUnitInstance | null;
  readonly capsule: Mesh | null;
  lastX: number;
  lastZ: number;
}

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
  const corridor = buildCorridor(scene);
  const { colliders, level } = corridor;
  const playerUnitFactory = await loadPlayerUnitFactory();

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
  const remoteVisuals = new Map<number, RemotePlayerVisual>();
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
  const yawFromTransform = (eid: number): number => {
    const x = Transform.qx[eid] ?? 0;
    const y = Transform.qy[eid] ?? 0;
    const z = Transform.qz[eid] ?? 0;
    const w = Transform.qw[eid] ?? 1;
    return Math.atan2(2 * (w * y + x * z), 1 - 2 * (y * y + z * z));
  };
  const createRemoteVisual = (factory: PlayerUnitFactory | null, x: number, y: number, z: number): RemotePlayerVisual => {
    const unit = factory?.createInstance() ?? null;
    if (unit) {
      unit.update({ x, y, z, yaw: 0, moving: false }, 0);
      scene.add(unit.root);
      return { root: unit.root, unit, capsule: null, lastX: x, lastZ: z };
    }

    const capsule = new Mesh(remoteGeo, remoteMat);
    capsule.castShadow = true;
    capsule.receiveShadow = true;
    capsule.position.set(x, y + 0.15, z);
    scene.add(capsule);
    return { root: capsule, unit: null, capsule, lastX: x, lastZ: z };
  };
  const removeRemoteVisual = (visual: RemotePlayerVisual): void => {
    visual.unit?.dispose();
    scene.remove(visual.root);
  };
  const syncRemoteMarkers = (dt = 0): void => {
    if (!remoteWorld) {
      for (const visual of remoteVisuals.values()) removeRemoteVisual(visual);
      remoteVisuals.clear();
      return;
    }

    const seen = new Set<number>();
    for (const eid of queryRemotePlayers(remoteWorld)) {
      seen.add(eid);
      const x = Transform.x[eid] ?? 0;
      const y = Transform.y[eid] ?? 1;
      const z = Transform.z[eid] ?? 0;
      let visual = remoteVisuals.get(eid);
      if (!visual) {
        visual = createRemoteVisual(playerUnitFactory, x, y, z);
        remoteVisuals.set(eid, visual);
      }

      const moving = Math.hypot(x - visual.lastX, z - visual.lastZ) > 0.001;
      visual.lastX = x;
      visual.lastZ = z;
      if (visual.unit) {
        visual.unit.update({ x, y, z, yaw: yawFromTransform(eid), moving }, dt);
      } else if (visual.capsule) {
        visual.capsule.position.set(x, y + 0.15, z);
      }
    }
    for (const [eid, visual] of remoteVisuals) {
      if (seen.has(eid)) continue;
      removeRemoteVisual(visual);
      remoteVisuals.delete(eid);
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
    frameUpdate(dt) {
      corridor.update(dt);
      placeCamera();
      syncRemoteMarkers(dt);
    },
    resize(width, height) {
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    },
    dispose() {
      for (const visual of remoteVisuals.values()) removeRemoteVisual(visual);
      remoteGeo.dispose();
      remoteMat.dispose();
      game.dispose();
    },
  };
}
