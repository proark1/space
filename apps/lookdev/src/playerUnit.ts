import {
  AnimationMixer,
  Box3,
  Euler,
  Group,
  MathUtils,
  Object3D,
  Quaternion,
  Vector3,
  type AnimationAction,
  type AnimationClip,
} from 'three';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { createGLTFLoaderSetup } from '@sl/render';

const PLAYER_UNIT_URL = '/models/player-astronaut.glb';
const PLAYER_UNIT_HEIGHT = 1.75;
const PLAYER_CAPSULE_CENTER_TO_FEET = 1.0;
const MODEL_YAW_OFFSET = Math.PI / 2;

const _box = new Box3();
const _size = new Vector3();
const _center = new Vector3();
const RIG_BONE_NAMES = [
  'Hip',
  'Pelvis',
  'Waist',
  'Spine01',
  'Spine02',
  'Head',
  'L_Clavicle',
  'L_Upperarm',
  'L_Forearm',
  'L_Hand',
  'R_Clavicle',
  'R_Upperarm',
  'R_Forearm',
  'R_Hand',
  'L_Thigh',
  'L_Calf',
  'L_Foot',
  'R_Thigh',
  'R_Calf',
  'R_Foot',
] as const;

type RigBoneName = (typeof RIG_BONE_NAMES)[number];

interface ProceduralRig {
  readonly bones: Partial<Record<RigBoneName, Object3D>>;
  readonly base: Map<Object3D, Quaternion>;
}

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

function captureProceduralRig(root: Object3D): ProceduralRig | null {
  const bones: Partial<Record<RigBoneName, Object3D>> = {};
  const base = new Map<Object3D, Quaternion>();
  for (const name of RIG_BONE_NAMES) {
    const bone = root.getObjectByName(name);
    if (!bone) continue;
    bones[name] = bone;
    base.set(bone, bone.quaternion.clone());
  }

  return bones.L_Upperarm && bones.R_Upperarm && bones.L_Thigh && bones.R_Thigh ? { bones, base } : null;
}

function buildInstance(source: PlayerUnitSource): PlayerUnitInstance {
  const inner = cloneSkeleton(source.scene);
  markRenderable(inner);
  inner.position.copy(source.offset);
  const rig = captureProceduralRig(inner);

  const root = new Group();
  root.name = 'player-unit-astronaut';
  root.scale.setScalar(source.scale);
  root.add(inner);

  const mixer = source.clips.length > 0 ? new AnimationMixer(inner) : null;
  let currentAction: AnimationAction | null = null;
  let currentClip: AnimationClip | null = null;
  let stride = Math.random() * Math.PI * 2;
  let visualYaw = MODEL_YAW_OFFSET;
  const poseEuler = new Euler();
  const poseQuat = new Quaternion();

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
  const poseBone = (name: RigBoneName, x = 0, y = 0, z = 0): void => {
    const bone = rig?.bones[name];
    const base = bone ? rig?.base.get(bone) : null;
    if (!bone || !base) return;
    poseEuler.set(x, y, z, 'XYZ');
    poseQuat.setFromEuler(poseEuler);
    bone.quaternion.copy(base).multiply(poseQuat);
  };
  const applyProceduralPose = (moving: boolean): void => {
    if (!rig) return;
    const move = moving ? 1 : 0;
    const idle = Math.sin(stride * 0.55) * (1 - move);
    const breathe = 0.5 + 0.5 * idle;
    const gait = Math.sin(stride);
    const gaitOpp = -gait;
    const liftL = Math.max(0, -gait);
    const liftR = Math.max(0, gait);
    poseBone('Hip', idle * 0.01, 0, gait * 0.025 * move);
    poseBone('Waist', -0.035 * move + idle * 0.012, 0, -gait * 0.018 * move);
    poseBone('Spine01', -0.03 * move + idle * 0.01, 0, -gait * 0.012 * move);
    poseBone('Spine02', 0.025 * move + idle * 0.012, 0, gait * 0.018 * move);
    poseBone('Head', -idle * 0.015, gait * 0.015 * move, -gait * 0.01 * move);

    // Arms swing opposite the legs. The model is rigged but clipless, so these are intentionally
    // broad local-space poses rather than exact mocap.
    poseBone('L_Clavicle', 0.04 + 0.035 * move, 0, 0.03 * move);
    poseBone('R_Clavicle', 0.04 + 0.035 * move, 0, -0.03 * move);
    poseBone('L_Upperarm', -0.1 - gait * 0.72 * move + idle * 0.035, 0.02 * move, -1.08);
    poseBone('R_Upperarm', -0.1 - gaitOpp * 0.72 * move - idle * 0.035, -0.02 * move, 1.08);
    poseBone('L_Forearm', 0.32 + breathe * 0.04 + move * (0.14 + liftR * 0.22), 0, 0.08);
    poseBone('R_Forearm', 0.32 + breathe * 0.04 + move * (0.14 + liftL * 0.22), 0, -0.08);
    poseBone('L_Hand', idle * 0.025, 0, 0.04);
    poseBone('R_Hand', -idle * 0.025, 0, -0.04);

    poseBone('L_Thigh', gait * 0.66 * move, 0, -0.012 * move);
    poseBone('R_Thigh', gaitOpp * 0.66 * move, 0, 0.012 * move);
    poseBone('L_Calf', 0.04 + liftL * 0.82 * move, 0, 0);
    poseBone('R_Calf', 0.04 + liftR * 0.82 * move, 0, 0);
    poseBone('L_Foot', -liftL * 0.3 * move + gait * 0.08 * move, 0, 0.015 * move);
    poseBone('R_Foot', -liftR * 0.3 * move + gaitOpp * 0.08 * move, 0, -0.015 * move);

    for (const bone of rig.base.keys()) bone.matrixWorldNeedsUpdate = true;
    inner.updateMatrixWorld(true);
  };

  return {
    root,
    update(pose, dt) {
      const movingAmount = pose.moving ? 1 : 0;
      stride += dt * MathUtils.lerp(1.35, 7.6, movingAmount);
      const bob = Math.sin(stride * (pose.moving ? 2 : 1)) * MathUtils.lerp(0.006, 0.035, movingAmount);
      const sway = Math.sin(stride) * 0.025 * movingAmount;

      visualYaw += angleDelta(visualYaw, pose.yaw + MODEL_YAW_OFFSET) * Math.min(1, dt * 14);
      root.position.set(pose.x, pose.y - PLAYER_CAPSULE_CENTER_TO_FEET + bob, pose.z);
      root.rotation.set(0, visualYaw, sway);

      play(pose.moving);
      mixer?.update(dt);
      applyProceduralPose(pose.moving);
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
