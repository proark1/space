import {
  AnimationMixer,
  Box3,
  Group,
  MathUtils,
  Object3D,
  Vector3,
  type AnimationAction,
  type AnimationClip,
} from 'three';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { createGLTFLoaderSetup } from '@sl/render';

const PLAYER_UNIT_URL = '/models/player-astronaut.glb';
const PLAYER_UNIT_HEIGHT = 1.75;
const PLAYER_CAPSULE_CENTER_TO_FEET = 1.0;
const MODEL_YAW_OFFSET = Math.PI;

const _box = new Box3();
const _size = new Vector3();
const _center = new Vector3();

export interface PlayerUnitPose {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly moving: boolean;
}

export interface PlayerUnitInstance {
  readonly root: Group;
  update(pose: PlayerUnitPose, dt: number): void;
  dispose(): void;
}

export interface PlayerUnitFactory {
  createInstance(): PlayerUnitInstance;
}

interface PlayerUnitSource {
  readonly scene: Object3D;
  readonly clips: readonly AnimationClip[];
  readonly offset: Vector3;
  readonly scale: number;
}

let playerUnitFactoryPromise: Promise<PlayerUnitFactory | null> | undefined;

function angleDelta(from: number, to: number): number {
  return Math.atan2(Math.sin(to - from), Math.cos(to - from));
}

function findClip(clips: readonly AnimationClip[], names: readonly string[]): AnimationClip | null {
  for (const name of names) {
    const clip = clips.find((candidate) => candidate.name.toLowerCase().includes(name));
    if (clip) return clip;
  }
  return null;
}

function markRenderable(root: Object3D): void {
  root.traverse((child) => {
    const mesh = child as Object3D & {
      readonly isMesh?: boolean;
      castShadow?: boolean;
      receiveShadow?: boolean;
      frustumCulled?: boolean;
    };
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
  });
}

function buildInstance(source: PlayerUnitSource): PlayerUnitInstance {
  const inner = cloneSkeleton(source.scene);
  markRenderable(inner);
  inner.position.copy(source.offset);

  const root = new Group();
  root.name = 'player-unit-astronaut';
  root.scale.setScalar(source.scale);
  root.add(inner);

  const mixer = source.clips.length > 0 ? new AnimationMixer(inner) : null;
  let currentAction: AnimationAction | null = null;
  let currentClip: AnimationClip | null = null;
  let stride = Math.random() * Math.PI * 2;
  let visualYaw = MODEL_YAW_OFFSET;

  const play = (moving: boolean): void => {
    if (!mixer) return;
    const clip =
      (moving && findClip(source.clips, ['run', 'walk', 'move'])) ||
      findClip(source.clips, ['idle', 'breath', 'stand']) ||
      source.clips[0] ||
      null;
    if (!clip || clip === currentClip) return;

    const next = mixer.clipAction(clip);
    next.reset().setEffectiveWeight(1).fadeIn(0.18).play();
    currentAction?.fadeOut(0.18);
    currentAction = next;
    currentClip = clip;
  };

  return {
    root,
    update(pose, dt) {
      const movingAmount = pose.moving ? 1 : 0;
      stride += dt * MathUtils.lerp(1.35, 8.25, movingAmount);
      const bob = Math.sin(stride * (pose.moving ? 2 : 1)) * MathUtils.lerp(0.006, 0.035, movingAmount);
      const sway = Math.sin(stride) * 0.025 * movingAmount;

      visualYaw += angleDelta(visualYaw, pose.yaw + MODEL_YAW_OFFSET) * Math.min(1, dt * 14);
      root.position.set(pose.x, pose.y - PLAYER_CAPSULE_CENTER_TO_FEET + bob, pose.z);
      root.rotation.set(0, visualYaw, sway);

      play(pose.moving);
      mixer?.update(dt);
    },
    dispose() {
      mixer?.stopAllAction();
    },
  };
}

async function loadPlayerUnitSource(): Promise<PlayerUnitSource | null> {
  const setup = createGLTFLoaderSetup();
  try {
    const gltf = await setup.loader.loadAsync(PLAYER_UNIT_URL);
    const scene = gltf.scene;
    markRenderable(scene);

    _box.setFromObject(scene);
    _box.getSize(_size);
    _box.getCenter(_center);
    const scale = PLAYER_UNIT_HEIGHT / Math.max(_size.y, 0.0001);
    const offset = new Vector3(-_center.x, -_box.min.y, -_center.z);

    return { scene, clips: gltf.animations ?? [], offset, scale };
  } catch (err) {
    console.warn('[lookdev] player unit failed to load; falling back to capsule markers', err);
    return null;
  } finally {
    setup.dispose();
  }
}

async function createPlayerUnitFactory(): Promise<PlayerUnitFactory | null> {
  const source = await loadPlayerUnitSource();
  if (!source) return null;
  return {
    createInstance: () => buildInstance(source),
  };
}

export function loadPlayerUnitFactory(): Promise<PlayerUnitFactory | null> {
  playerUnitFactoryPromise ??= createPlayerUnitFactory();
  return playerUnitFactoryPromise;
}
