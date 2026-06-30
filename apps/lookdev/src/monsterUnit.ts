import { Box3, Group, MeshStandardMaterial, Object3D, Vector3 } from 'three';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import { createGLTFLoaderSetup } from '@sl/render';

const MONSTER_UNIT_URL = '/models/alien2.glb';
const MONSTER_UNIT_HEIGHT = 2.25;
const MONSTER_CAPSULE_CENTER_TO_FEET = 1.0;

const _box = new Box3();
const _size = new Vector3();
const _center = new Vector3();
const noUvMonsterMaterial = new MeshStandardMaterial({
  color: 0x2a171a,
  emissive: 0x4b0b0d,
  emissiveIntensity: 0.45,
  roughness: 0.86,
  metalness: 0.02,
  flatShading: true,
});

export interface MonsterUnitPose {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yaw: number;
  readonly moving: boolean;
  readonly attacking: boolean;
  readonly stunned: boolean;
  readonly hitFlash: number;
}

export interface MonsterUnitInstance {
  readonly root: Group;
  update(pose: MonsterUnitPose, dt: number): void;
  dispose(): void;
}

export interface MonsterUnitFactory {
  createInstance(): MonsterUnitInstance;
}

interface MonsterUnitSource {
  readonly scene: Object3D;
  readonly offset: Vector3;
  readonly scale: number;
}

let monsterUnitFactoryPromise: Promise<MonsterUnitFactory | null> | undefined;

function markRenderable(root: Object3D): void {
  root.traverse((child) => {
    const mesh = child as Object3D & {
      readonly isMesh?: boolean;
      castShadow?: boolean;
      receiveShadow?: boolean;
      frustumCulled?: boolean;
      geometry?: { getAttribute(name: string): unknown };
      material?: unknown;
    };
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.frustumCulled = false;
    if (!mesh.geometry?.getAttribute('uv')) mesh.material = noUvMonsterMaterial;
  });
}

function buildInstance(source: MonsterUnitSource): MonsterUnitInstance {
  const inner = cloneSkeleton(source.scene);
  markRenderable(inner);
  inner.position.copy(source.offset);

  const root = new Group();
  root.name = 'encounter-monster-alien2';
  root.scale.setScalar(source.scale);
  root.add(inner);

  let bob = Math.random() * Math.PI * 2;

  return {
    root,
    update(pose, dt) {
      const gait = pose.moving ? 1 : 0.35;
      bob += dt * (pose.stunned ? 24 : pose.moving ? 8.5 : 2.2);
      const breathe = Math.sin(bob) * 0.025;
      const lunge = pose.attacking ? 0.16 + Math.sin(bob * 1.7) * 0.035 : 0;
      const stunShake = pose.stunned ? Math.sin(bob * 3.1) * 0.045 : 0;
      const hitPulse = pose.hitFlash > 0 ? 1 + pose.hitFlash * 0.22 : 1;

      root.position.set(pose.x, pose.y - MONSTER_CAPSULE_CENTER_TO_FEET + breathe * gait, pose.z);
      root.rotation.set(stunShake, pose.yaw, Math.sin(bob * 0.65) * 0.025 * gait);
      root.scale.setScalar(source.scale * hitPulse * (pose.stunned ? 0.94 : pose.attacking ? 1.08 + lunge : 1));
    },
    dispose() {
      root.clear();
    },
  };
}

async function loadMonsterUnitSource(): Promise<MonsterUnitSource | null> {
  const setup = createGLTFLoaderSetup();
  try {
    const gltf = await setup.loader.loadAsync(MONSTER_UNIT_URL);
    const scene = gltf.scene;
    markRenderable(scene);

    _box.setFromObject(scene);
    _box.getSize(_size);
    _box.getCenter(_center);
    const scale = MONSTER_UNIT_HEIGHT / Math.max(_size.y, 0.0001);
    const offset = new Vector3(-_center.x, -_box.min.y, -_center.z);

    return { scene, offset, scale };
  } catch (err) {
    console.warn('[lookdev] monster unit failed to load; falling back to procedural capsule', err);
    return null;
  } finally {
    setup.dispose();
  }
}

async function createMonsterUnitFactory(): Promise<MonsterUnitFactory | null> {
  const source = await loadMonsterUnitSource();
  if (!source) return null;
  return {
    createInstance: () => buildInstance(source),
  };
}

export function loadMonsterUnitFactory(): Promise<MonsterUnitFactory | null> {
  monsterUnitFactoryPromise ??= createMonsterUnitFactory();
  return monsterUnitFactoryPromise;
}
